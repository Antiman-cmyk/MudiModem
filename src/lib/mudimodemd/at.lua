-- mudimodemd/at.lua — the AT console's engine: validate a request, then run its steps through
-- GL's AT service, or — only when that service is not registered, decided before anything was
-- sent, so no command ever runs twice — through the direct port (atport.lua).
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

-- Run one sequence. t = {
--   gl(cmd, timeout, sub_id) -> data string | nil, "not_found" | "timeout" | reason
--   direct(steps, timeout)   -> { ok, requested, ran, aborted, steps } | { error } (atport.lua)
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
      local d = t.direct(steps, timeout)
      if type(d) ~= "table" then return { error = "the direct AT port gave no answer" } end
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
