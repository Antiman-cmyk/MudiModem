-- mudimodemd/at.lua — the AT console's engine: validate a request, then run its steps through
-- GL's AT service, or — only when that service is not registered, decided before anything was
-- sent, so no command ever runs twice — through the direct-port tool.
--
-- Moved out of the nginx plugin (which blocked GL's ONE nginx worker for every step) into the
-- daemon; the semantics are the plugin's, case for case (test/daemon-at.test.lua):
--   * GL's AT service is `modem.CPU.AT get_result_AT {cmd, timeout, source_flag:1, sub_id}` —
--     what GL's own web console sends, with sub_id = the ACTIVE slot (GL's rule for the built-in
--     modem; no slot -> no sub_id, i.e. modem_AT's current subscription, and the reply says so).
--     modem_AT serializes the channel with port-bridge, so the console never reads
--     /dev/at_mdm0 alongside it.
--   * a sequence stops at the first step that is not OK; a step's result is the LAST final code
--     in the reply (OK / ERROR / +CME ERROR / +CMS ERROR / COMMAND NOT SUPPORT), none = timeout.
--   * GL's stack vanishing MID-sequence never switches transport (step 1 may already have run).
-- Lua 5.1/5.4 subset; the transports are injected, so this file has no I/O of its own.
local M = {}

M.MAX_STEPS, M.MAX_LEN = 8, 256
M.TIMEOUT_DEFAULT, M.TIMEOUT_MIN, M.TIMEOUT_MAX = 8, 1, 60

-- (steps, timeout) or (nil, error). One step per line; CRs dropped, blanks skipped.
function M.parse(cmd, timeout)
  if type(cmd) ~= "string" then return nil, "cmd required" end
  local steps = {}
  for rawline in (cmd .. "\n"):gmatch("(.-)\n") do
    local line = rawline:gsub("[\r]+", ""):match("^%s*(.-)%s*$")
    if line ~= "" then steps[#steps + 1] = line end
  end
  if #steps == 0 then return nil, "cmd required" end
  if #steps > M.MAX_STEPS then return nil, "too many steps (max " .. M.MAX_STEPS .. ")" end
  for _, s in ipairs(steps) do
    if #s > M.MAX_LEN then return nil, "command too long (max " .. M.MAX_LEN .. " chars)" end
  end
  local t = tonumber(timeout) or M.TIMEOUT_DEFAULT
  if t < M.TIMEOUT_MIN then t = M.TIMEOUT_MIN end
  if t > M.TIMEOUT_MAX then t = M.TIMEOUT_MAX end
  return steps, math.floor(t)
end

-- The final result code of a reply: "ok" | "error" | nil (none arrived).
function M.final(data)
  local kind
  for line in (data or ""):gmatch("[^\r\n]+") do
    local l = line:match("^%s*(.-)%s*$")
    if l == "OK" then kind = "ok"
    elseif l == "ERROR" or l == "COMMAND NOT SUPPORT" or l:find("^%+CM[ES] ERROR") then kind = "error" end
  end
  return kind
end

-- The direct-port tool's output (per-step envelope MM-AT:<status>:<elapsed_ms>:<i>/<n>, or a
-- channel-level MM-AT:<status>:<ms> first line) -> a result table, or { error = ... }.
function M.parse_envelope(out, steps)
  out = out or ""
  local cstatus = out:match("^MM%-AT:(%w+):%d+%s*\n") or out:match("^MM%-AT:(%w+):%d+%s*$")
  if cstatus == "busy" then
    -- the tool may say WHY: an earlier command's reply is still owed
    local why = out:match("^MM%-AT:busy:%d+%s*\n([^\n]+)")
    return { error = "channel busy - " .. (why and why:gsub("%s+$", "") or "another command in flight") }
  end
  if cstatus == "openfail" then return { error = "cannot open the AT port (/dev/at_mdm0)" } end
  local frames, cur = {}, nil
  for line in (out .. "\n"):gmatch("(.-)\n") do
    local st, msv, idx, cnt = line:match("^MM%-AT:(%w+):(%d+):(%d+)/(%d+)$")
    if st then
      cur = { status = st, elapsed_ms = tonumber(msv), idx = tonumber(idx), count = tonumber(cnt), response = "" }
      frames[#frames + 1] = cur
    elseif cur then
      cur.response = cur.response .. line .. "\n"
    end
  end
  if #frames == 0 then return { error = "AT tool returned no envelope (is the AT tool deployed?)" } end
  local res = { ok = true, requested = #steps, ran = #frames, aborted = (#frames < #steps), steps = {} }
  for i, s in ipairs(frames) do
    if s.status ~= "ok" and s.status ~= "error" and s.status ~= "timeout" then
      return { error = "AT tool returned unexpected status: " .. s.status }
    end
    res.steps[i] = { cmd = steps[i] or "", status = s.status, response = s.response, elapsed_ms = s.elapsed_ms }
  end
  return res
end

-- Run one sequence. t = {
--   gl(cmd, timeout, sub_id) -> data string | nil, "not_found" | "timeout" | reason
--   direct(steps, timeout)   -> tool output | nil, reason
--   now_ms()                 -> ms clock (elapsed_ms)
--   on_step(i, step, res)    -> optional progress callback (the daemon's long-poll)
-- }
function M.run(steps, timeout, slot, t)
  local res = { ok = true, requested = #steps, ran = 0, aborted = false, steps = {},
                transport = "gl", slot = slot, sub_id = slot }
  for i, s in ipairs(steps) do
    local t0 = t.now_ms()
    local data, err = t.gl(s, timeout, slot)
    local st
    if data ~= nil then
      st = { cmd = s, status = M.final(data) or "timeout", response = data, elapsed_ms = t.now_ms() - t0 }
    elseif i == 1 and err == "not_found" then
      -- GL's AT service isn't registered (cellular stack down): nothing has been sent, so the
      -- whole sequence can go to the direct port instead.
      local out, derr = t.direct(steps, timeout)
      if out == nil then return { error = derr or "the direct-port AT tool failed" } end
      local d = M.parse_envelope(out, steps)
      if d.ok then d.transport = "direct"; d.slot = slot end
      return d
    elseif err == "timeout" then
      st = { cmd = s, status = "timeout", response = "", elapsed_ms = (timeout + 5) * 1000 }
    elseif i == 1 then
      return { error = "GL's AT service gave no answer (" .. tostring(err) .. ")" }
    else
      st = { cmd = s, status = "error", elapsed_ms = 0,
             response = "GL's AT service gave no answer (" .. tostring(err) .. ")\n" }
    end
    res.steps[i] = st
    res.ran = i
    if t.on_step then t.on_step(i, st, res) end
    if st.status ~= "ok" then break end
  end
  res.aborted = res.ran < #steps
  return res
end

return M
