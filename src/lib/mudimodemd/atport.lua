-- mudimodemd/atport.lua — the AT console's direct-port fallback: /dev/at_mdm0, used only when
-- GL's AT service (modem.CPU.AT) is not registered (eco). A port of tools/mudimodem-at.py
-- (python3, retired with R3 ⑤); its rules, kept case for case (test/atport-emu.test.py drives
-- this over a pty playing the modem):
--   * open the port BLOCKING (the SMD channel answers EBUSY to a non-blocking write) and wait for
--     readability with a timeout; it is not a tty, so no termios. GL's `port-bridge at_mdm0
--     at_usb0 0` reads the same port continuously, which is why this is only a fallback.
--   * a reply is matched by ORDER only (the port echoes nothing to pair it by): drain before each
--     send, and the result is the first final code (OK / ERROR / +CME / +CMS ERROR).
--   * late replies: every command is recorded in the in-flight marker before it is written and
--     cleared once its final code is read, so a reply still owed outlives a timeout (and a daemon
--     restart). Before the next send the channel is read for up to min(2 s, timeout): the owed
--     final code arrives -> discarded, noted; nothing, but the command may still answer (younger
--     than its owed time: 600 s AT+QSCAN, 180 s COPS=?/CGATT, 15 s otherwise) -> refused as busy
--     with the reason; older -> taken as lost, noted.
-- One user only: the daemon's AT queue runs one sequence at a time, so no flock is needed.
local file = require "eco.file"
local time = require "eco.time"
local cjson = require "cjson"

local M = {}

M.URC = { "RDY", "+CPIN:", "+QUSIM:", "+QUSIM", "+CPINDS:", "+QIND:", "+CFUN:", "+CGEV:",
          "+QNETDEVSTATUS:", "POWERED DOWN" }
M.SETTLE_MAX_S, M.SETTLE_QUIET_S = 2.0, 0.3
M.OWED_DEFAULT_S = 15
M.OWED_LONG = { { "AT+QSCAN", 600 }, { "AT+COPS=?", 180 }, { "AT+CGATT", 180 } }
M.NOTE = "[mudimodem-at] "

local function mono()
  local f = io.open("/proc/uptime", "r")
  local s = f and f:read("*l"); if f then f:close() end
  return tonumber(s and s:match("^(%S+)")) or os.time()
end

function M.owed_s(cmd)
  local up = cmd:match("^%s*(.-)%s*$"):upper()
  for _, e in ipairs(M.OWED_LONG) do
    if up:sub(1, #e[1]) == e[1] then return e[2] end
  end
  return M.OWED_DEFAULT_S
end

function M.final_kind(text)
  if text:find("\nERROR\r", 1, true) or text:find("+CME ERROR", 1, true) or text:find("+CMS ERROR", 1, true) then
    return "error"
  end
  if text:find("\nOK\r", 1, true) then return "ok" end
  return nil
end

local function is_urc(line)
  for _, p in ipairs(M.URC) do if line:sub(1, #p) == p then return true end end
  return false
end

local function clean_lines(text)
  local out = {}
  for l in (text:gsub("\r", "\n") .. "\n"):gmatch("(.-)\n") do
    l = l:match("^%s*(.-)%s*$")
    if l ~= "" and not is_urc(l) then out[#out + 1] = l end
  end
  return out
end

-- opts: { port = "/dev/at_mdm0", state = "/tmp/mudimodem/at.inflight" }
function M.new(opts)
  opts = opts or {}
  local port = opts.port or "/dev/at_mdm0"
  local state = opts.state or "/tmp/mudimodem/at.inflight"
  local self = {}

  local function mark(cmd)
    local tmp = state .. ".tmp"
    local f = io.open(tmp, "w")
    if not f then return end                -- best effort: costs the late-reply guard, not the command
    f:write(cjson.encode({ cmd = cmd, sent = mono(), owed_s = M.owed_s(cmd) })); f:close()
    os.rename(tmp, state)
  end
  local function unmark() os.remove(state) end
  local function owed()
    local f = io.open(state, "r")
    if not f then return nil end
    local s = f:read("*a"); f:close()
    local ok, m = pcall(cjson.decode, s or "")
    return (ok and type(m) == "table") and m or { cmd = "?" }
  end

  -- One sequence on the port: { ok, requested, ran, aborted, steps } | { error }.
  function self.run(steps, timeout)
    local fd = file.open(port, file.O_RDWR | file.O_NOCTTY)
    if not fd then return { error = "cannot open the AT port (" .. port .. ")" } end
    local w = eco.watcher(eco.IO, fd, eco.READ)
    local function readable(t) return w:wait(t > 0 and t or 0.001) and true or false end
    local function read_chunk() return file.read(fd, 4096) end

    local function drain()
      while readable(0.001) do
        local c = read_chunk()
        if not c or c == "" then break end
      end
    end

    -- Before the first send: an owed reply? -> note | nil, or nil + busy reason.
    local function settle(budget)
      local m = owed()
      if not m then return nil end
      local cmd = tostring(m.cmd or "?")
      local age = type(m.sent) == "number" and (mono() - m.sent) or nil
      local buf, final, stop = "", nil, mono() + budget
      while true do
        local left = stop - mono()
        if left <= 0 then break end
        if not readable(final and math.min(left, M.SETTLE_QUIET_S) or left) then
          if final then break end           -- final code seen, then quiet: done
        else
          local c = read_chunk()
          if not c or c == "" then break end
          buf = buf .. c
          final = final or M.final_kind(buf)
        end
      end
      local ago = (age and age >= 0) and string.format("%ds ago", math.floor(age)) or "earlier"
      if final then
        unmark()
        return string.format("%sdiscarded a late reply (%d line(s)) to %s, sent %s and timed out - not this command's",
                             M.NOTE, #clean_lines(buf), cmd, ago)
      end
      local limit = tonumber(m.owed_s) or M.OWED_DEFAULT_S
      if not age or age < 0 or age >= limit then
        unmark()
        return string.format("%sthe reply to %s (sent %s) never arrived; taken as lost", M.NOTE, cmd, ago)
      end
      return nil, string.format("still waiting for the reply to %s (sent %s, timed out); not sent, so that late"
                                .. " reply cannot be read as this command's - retry shortly", cmd, ago)
    end

    local res = { ok = true, requested = #steps, ran = 0, aborted = false, steps = {} }
    local note, busy = settle(math.min(M.SETTLE_MAX_S, timeout))
    if busy then
      w:cancel(); file.close(fd)
      return { error = "channel busy - " .. busy }
    end
    for i, cmd in ipairs(steps) do
      drain()
      mark(cmd)
      local t0 = mono()
      if not file.write(fd, cmd .. "\r") then
        unmark(); w:cancel(); file.close(fd)
        return { error = "cannot open the AT port (" .. port .. ")" }     -- the port went away mid-send
      end
      local buf, kind, stop = "", "timeout", t0 + timeout
      while true do
        local left = stop - mono()
        if left <= 0 or not readable(left) then break end
        local c = read_chunk()
        if c == nil then break end            -- read error: the port is gone
        if c ~= "" then
          buf = buf .. c
          kind = M.final_kind(buf) or "timeout"
          if kind ~= "timeout" then break end
        end
      end
      if kind ~= "timeout" then unmark() end   -- a timed-out reply stays owed for the next send
      local text = (i == 1 and note) and (note .. "\r\n" .. buf) or buf
      res.steps[i] = { cmd = cmd, status = kind, response = text, elapsed_ms = math.floor((mono() - t0) * 1000) }
      res.ran = i
      if kind ~= "ok" then break end
    end
    res.aborted = res.ran < #steps
    w:cancel(); file.close(fd)
    return res
  end

  return self
end

return M
