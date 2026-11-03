-- The AT console's engine (src/lib/mudimodemd/at.lua), against FAKES only — no modem traffic:
-- a Lua stand-in for GL's AT service and one for the direct port. These are the cases the nginx
-- plugin's at_console was tested with before the engine moved into mudimodemd; the direct
-- port's own channel rules (drain, terminators, late replies) are drilled over a pty in
-- test/collectd-emu.test.py. Runs under the host's lua5.1, the router's lua and eco.
local dir = (arg and arg[0] and arg[0]:match("^(.*)/[^/]*$") or ".") .. "/../src/lib/"
package.path = dir .. "?.lua;" .. package.path
local at = require "mudimodemd.at"
local cjson = require "cjson"


-- ---- fakes ----------------------------------------------------------------------------------
local calls, absent = {}, false
local function gl(cmd, timeout, sub_id)
  calls[#calls + 1] = { cmd = cmd, timeout = timeout, sub_id = sub_id }
  if absent or cmd:find("__GONE__", 1, true) then return nil, "not_found" end
  if cmd:find("__HANG__", 1, true) then return nil, "timeout" end
  if cmd:find("__ERR__", 1, true) then return "\r\nERROR\r\n" end
  if cmd:find("__CME__", 1, true) then return "\r\n+CME ERROR: 10\r\n" end
  if cmd:find("__NOTERM__", 1, true) then return "\r\n+PARTIAL: 1\r\n" end
  return "\r\nREQ:" .. cmd .. "\r\n\r\nOK\r\n"
end
-- the direct port: echoes what it was given; DIRECT_REPLY overrides (a channel error, nil)
local direct_calls, DIRECT_REPLY = {}, false
local function direct(steps, timeout)
  direct_calls[#direct_calls + 1] = { steps = steps, timeout = timeout }
  if DIRECT_REPLY ~= false then return DIRECT_REPLY end
  local r = { ok = true, requested = #steps, ran = #steps, aborted = false, steps = {} }
  for i, c in ipairs(steps) do r.steps[i] = { cmd = c, status = "ok", response = "\r\nOK\r\n", elapsed_ms = 1 } end
  return r
end
local clock = 0
local T = { gl = gl, direct = direct, now_ms = function() clock = clock + 7; return clock end }
local function run(cmd, timeout, slot)
  local steps, t = at.parse(cmd, timeout)
  if not steps then return { error = t } end
  return at.run(steps, t, slot, T)
end
local function reset() calls = {} end

-- ---- validation: nothing is sent for any of these -------------------------------------------
for _, bad in ipairs({ { nil }, { "" }, { "   " }, { "\n\n" }, { string.rep("A", 300) },
                       { "AT\n" .. string.rep("A", 300) } }) do
  assert(run(bad[1]).error, "must reject: " .. tostring(bad[1]))
end
assert(run(5).error, "a non-string cmd is rejected")
local many = {}
for i = 1, 9 do many[i] = "AT+C" .. i end
assert(run(table.concat(many, "\n")).error:find("max 8", 1, true), "over-8 steps rejected")
assert(#calls == 0, "a rejected request sends nothing")

-- timeout: clamps to 1..60, defaults to 8, a junk value is the default
assert(select(2, at.parse("AT", 999)) == 60 and select(2, at.parse("AT", 0)) == 1, "timeout clamps")
assert(select(2, at.parse("AT")) == 8 and select(2, at.parse("AT", "x")) == 8, "timeout defaults to 8")
assert(select(2, at.parse("AT", 7.9)) == 7, "fractional timeout floors")
local st = at.parse("  AT+A \r\n\r\n AT+B")
assert(#st == 2 and st[1] == "AT+A" and st[2] == "AT+B", "steps trimmed, CR and blanks dropped")

-- ---- GL's AT service ------------------------------------------------------------------------
reset()
local g = run('AT+QNWPREFCFG="nr5g_band"', 999, 2)
assert(g.ok and g.transport == "gl" and g.slot == 2 and g.sub_id == 2, "GL path, sub_id = slot")
assert(g.requested == 1 and g.ran == 1 and g.aborted == false and #g.steps == 1, "single-step counts")
assert(g.steps[1].status == "ok" and g.steps[1].cmd == 'AT+QNWPREFCFG="nr5g_band"', "ok + cmd echoed")
assert(g.steps[1].elapsed_ms == 7, "elapsed from the injected clock")
assert(calls[1].cmd == 'AT+QNWPREFCFG="nr5g_band"' and calls[1].timeout == 60 and calls[1].sub_id == 2,
       "inner quotes intact, timeout clamped, sub_id passed")
reset()
local gn = run("AT", nil, nil)
assert(gn.ok and gn.slot == nil and gn.sub_id == nil and calls[1].sub_id == nil, "no slot -> no sub_id")
reset()
local gm = run("AT+ONE\nAT+TWO", nil, 1)
assert(gm.ran == 2 and not gm.aborted and calls[1].cmd == "AT+ONE" and calls[2].cmd == "AT+TWO", "in order")
local ge = run("AT+BAD__ERR__\nAT+NEVER", nil, 1)
assert(ge.ok and ge.ran == 1 and ge.aborted and ge.steps[1].status == "error", "ERROR stops the sequence")
assert(run("AT+X__CME__", nil, 1).steps[1].status == "error", "+CME ERROR is an error")
assert(run("AT+X__NOTERM__", nil, 1).steps[1].status == "timeout", "no final code is a timeout")
local gh = run("AT+X__HANG__\nAT+NEVER", 8, 1)
assert(gh.ran == 1 and gh.aborted and gh.steps[1].status == "timeout" and gh.steps[1].elapsed_ms == 13000,
       "ubus timeout -> step timeout (timeout + 5 s), stop")
reset()
local gg = run("AT+ONE\nAT+X__GONE__\nAT+NEVER", nil, 1)
assert(gg.ok and gg.transport == "gl" and gg.ran == 2 and gg.aborted, "no fallback after the first step")
assert(gg.steps[2].status == "error" and gg.steps[2].response:find("no answer", 1, true), "the failed step says so")
assert(#calls == 2, "nothing sent after the failure")
-- the last final code wins (an echo of OK before an ERROR is not success)
assert(at.final("\r\nOK\r\n+CME ERROR: 3\r\n") == "error" and at.final("x\r\nOK") == "ok" and at.final("") == nil)

-- progress callback: one call per step, with the running result
local seen = {}
at.run({ "AT+A", "AT+B" }, 8, 1, { gl = gl, direct = direct, now_ms = T.now_ms,
  on_step = function(i, s, r) seen[#seen + 1] = i .. ":" .. s.status .. ":" .. r.ran end })
assert(table.concat(seen, ",") == "1:ok:1,2:ok:2", "on_step per step: " .. table.concat(seen, ","))

-- ---- fallback: GL's AT service not registered -> the direct port -------------------------------
absent = true; reset(); direct_calls = {}
local r = run('AT+QNWPREFCFG="nr5g_band"\nAT+TWO', 999, 2)
assert(r.ok and r.transport == "direct" and r.slot == 2, "fell back to the direct port: " .. tostring(r.error))
assert(#calls == 1, "exactly one probe of GL's service, nothing else sent there")
assert(#direct_calls == 1 and #direct_calls[1].steps == 2 and direct_calls[1].timeout == 60,
       "the WHOLE sequence goes to the port, timeout clamped")
assert(direct_calls[1].steps[1] == 'AT+QNWPREFCFG="nr5g_band"', "inner quotes intact")
DIRECT_REPLY = { error = "channel busy - still waiting for the reply to AT+QSCAN=3,1" }
assert(run("AT", nil, 1).error:find("channel busy", 1, true), "the port's channel error is the reply")
DIRECT_REPLY = nil
assert(run("AT", nil, 1).error:find("no answer", 1, true), "a port that returns nothing -> plain error")
DIRECT_REPLY = false
absent = false

print("daemon at engine OK (" .. cjson.encode({ cases = "all" }) .. ")")
