-- On-device test for mudimodem.at_console, run against FAKES only — no modem
-- traffic ever: test/fake-ubus-at.py stands in for the `ubus` CLI (GL's AT
-- service, the primary transport) and test/fake-at-tool.py for the direct-port
-- tool (the fallback when GL's cellular stack is down).
-- Env: MM_PLUGIN=<plugin path>  MUDIMODEM_UBUS=<fake ubus>  MUDIMODEM_AT_TOOL=<fake tool>
--      MM_TMP=<scratch dir the fake ubus keeps its mode + call log in>
local cjson = require "cjson"
local UBUS = os.getenv("MUDIMODEM_UBUS") or ""
local TMP = os.getenv("MM_TMP") or ""
-- at_console really sends what it is given: without the fake it would reach
-- the live modem through GL's AT service. Refuse rather than risk that.
assert(UBUS:find("fake", 1, true), "refusing to run: MUDIMODEM_UBUS must point at test/fake-ubus-at.py")
assert(TMP ~= "", "set MM_TMP")
os.execute("mkdir -p '" .. TMP .. "'")

local SLOT = 2                                   -- GL's current_sim_slot
package.loaded["oui.ubus"] = {
  call = function(object, method)
    if object == "cellular.modem" and method == "status" then
      if not SLOT then return { modems = {} } end
      return { modems = { { bus = "cpu", current_sim_slot = SLOT } } }
    end
    error("at_console must not make other ubus calls: " .. tostring(object) .. "." .. tostring(method))
  end
}
local function setmode(m) local f = io.open(TMP .. "/fake-ubus.mode", "w"); f:write(m or ""); f:close() end
local function clearlog() os.remove(TMP .. "/fake-ubus.log") end
local function calls()
  local out, f = {}, io.open(TMP .. "/fake-ubus.log", "r")
  if not f then return out end
  for line in f:lines() do out[#out + 1] = cjson.decode(line) end
  f:close()
  return out
end

local M = dofile(os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(type(M) == "table", "plugin must return a table")
assert(type(M.at_console) == "function", "at_console missing")
setmode(""); clearlog()

-- Rejections (nothing is sent for any of these).
assert(M.at_console(nil).error, "nil args must error")
assert(M.at_console({}).error, "missing cmd must error")
assert(M.at_console({ cmd = "" }).error, "empty cmd must error")
assert(M.at_console({ cmd = "   " }).error, "whitespace cmd must error")
assert(M.at_console({ cmd = "\n\n" }).error, "blank-only lines must error")
assert(M.at_console({ cmd = string.rep("A", 300) }).error, "over-long step must error")
assert(M.at_console({ cmd = "AT\n" .. string.rep("A", 300) }).error, "any over-long step must error")
local many = {}
for i = 1, 9 do many[i] = "AT+C" .. i end
assert(M.at_console({ cmd = table.concat(many, "\n") }).error, "over-8 steps must error")
assert(#calls() == 0, "a rejected request must send nothing")

-- ===== Primary transport: GL's AT service (modem.CPU.AT get_result_AT) =====
-- The exact request GL's own web console makes: cmd, timeout, source_flag 1,
-- sub_id = the active slot; the ubus -t covers the AT timeout.
local g = M.at_console({ cmd = 'AT+QNWPREFCFG="nr5g_band"', timeout = 999 })
assert(g.ok == true and g.transport == "gl", "GL path expected, got: " .. tostring(g.error or g.transport))
assert(g.slot == 2 and g.sub_id == 2, "sub_id must be the active slot")
assert(g.requested == 1 and g.ran == 1 and g.aborted == false and #g.steps == 1, "single-step counts")
assert(g.steps[1].status == "ok" and g.steps[1].cmd == 'AT+QNWPREFCFG="nr5g_band"', "step ok + cmd echoed")
assert(type(g.steps[1].elapsed_ms) == "number", "elapsed_ms is a number")
local c = calls()[1]
assert(c.req.cmd == 'AT+QNWPREFCFG="nr5g_band"', "inner quotes reach modem_AT intact")
assert(c.req.sub_id == 2 and c.req.source_flag == 1, "sub_id = slot, source_flag = 1 (GL's console)")
assert(c.req.timeout == 60 and c.argv[1] == "-t" and c.argv[2] == "65", "timeout clamps to 60; ubus -t = 65")
clearlog()
assert(M.at_console({ cmd = "AT", timeout = 0 }).ok and calls()[1].req.timeout == 1, "timeout clamps up to 1")
clearlog()
assert(M.at_console({ cmd = "AT" }).ok and calls()[1].req.timeout == 8, "timeout defaults to 8")
clearlog()
local gq = M.at_console({ cmd = "AT+X='y'" })
assert(gq.ok and calls()[1].req.cmd == "AT+X='y'", "single quotes survive shell quoting")

-- No active slot (no SIM / modem resetting): no sub_id -> modem_AT's current
-- subscription; the reply says so (slot nil) instead of guessing one.
SLOT = nil; clearlog()
local gn = M.at_console({ cmd = "AT" })
assert(gn.ok and gn.slot == nil and calls()[1].req.sub_id == nil, "no slot -> no sub_id")
SLOT = 2

-- Multi step, in order; stop at the first step that isn't OK.
clearlog()
local gm = M.at_console({ cmd = "AT+ONE\nAT+TWO" })
assert(gm.ok and gm.ran == 2 and not gm.aborted and gm.steps[2].cmd == "AT+TWO", "two steps ran in order")
assert(calls()[1].req.cmd == "AT+ONE" and calls()[2].req.cmd == "AT+TWO", "one request per step")
local ge = M.at_console({ cmd = "AT+BAD__ERR__\nAT+NEVER" })
assert(ge.ok and ge.ran == 1 and ge.aborted and ge.steps[1].status == "error", "ERROR stops the sequence")
assert(M.at_console({ cmd = "AT+X__CME__" }).steps[1].status == "error", "+CME ERROR is an error")
assert(M.at_console({ cmd = "AT+X__NOTERM__" }).steps[1].status == "timeout", "no final code is a timeout")
local gh = M.at_console({ cmd = "AT+X__HANG__\nAT+NEVER" })
assert(gh.ok and gh.ran == 1 and gh.aborted and gh.steps[1].status == "timeout", "ubus timeout -> step timeout, stop")

-- GL's stack disappearing MID-sequence never switches transport (step 1 may
-- already have run): that step fails, the rest is skipped.
clearlog()
local gg = M.at_console({ cmd = "AT+ONE\nAT+X__GONE__\nAT+NEVER" })
assert(gg.ok and gg.transport == "gl" and gg.ran == 2 and gg.aborted, "no fallback after the first step")
assert(gg.steps[2].status == "error", "the failed step says so")

-- ===== Fallback: GL's AT service not registered -> the direct-port tool =====
setmode("absent"); clearlog()
-- Happy path, SINGLE step: shape + timeout clamp + cmd passthrough.
local r = M.at_console({ cmd = 'AT+QNWPREFCFG="nr5g_band"', timeout = 999 })
assert(r.ok == true, "expected ok, got: " .. tostring(r.error))
assert(r.transport == "direct" and r.slot == 2, "fell back to the direct port, slot still reported")
assert(#calls() == 1, "exactly one probe of GL's service, nothing else sent there")
assert(r.requested == 1 and r.ran == 1 and r.aborted == false, "single-step counts")
assert(#r.steps == 1, "one step returned")
assert(r.steps[1].status == "ok", "status from the envelope")
assert(type(r.steps[1].elapsed_ms) == "number", "elapsed_ms is a number")
assert(r.steps[1].cmd == 'AT+QNWPREFCFG="nr5g_band"', "step cmd echoed back")
assert(r.steps[1].response:find("--timeout 60", 1, true), "timeout clamps to 60")
assert(r.steps[1].response:find('AT+QNWPREFCFG="nr5g_band"', 1, true), "inner quotes intact")

-- The backend must pass an end-of-options `--` before the steps so a step that
-- spells a tool flag is never parsed as one.
assert(r.steps[1].response:find(" -- ", 1, true), "backend must emit a -- sentinel before steps")

-- Timeout clamps low and defaults to 8.
local r2 = M.at_console({ cmd = "AT", timeout = 0 })
assert(r2.ok and r2.steps[1].response:find("--timeout 1", 1, true), "timeout clamps up to 1")
local r3 = M.at_console({ cmd = "AT" })
assert(r3.ok and r3.steps[1].response:find("--timeout 8", 1, true), "timeout defaults to 8")

-- MULTI step happy path: two frames parsed, in order.
local rm = M.at_console({ cmd = "AT+ONE\nAT+TWO" })
assert(rm.ok and rm.requested == 2 and rm.ran == 2 and rm.aborted == false, "two steps ran")
assert(rm.steps[1].cmd == "AT+ONE" and rm.steps[2].cmd == "AT+TWO", "step order preserved")

-- STOP on error: second step never ran; aborted flag + counts reflect it.
local re = M.at_console({ cmd = "AT+BAD__ERR__\nAT+NEVER" })
assert(re.ok, "an errored sequence still returns ok=true (transport succeeded)")
assert(re.requested == 2 and re.ran == 1 and re.aborted == true, "aborted after step 1")
assert(re.steps[1].status == "error", "first step marked error")
assert(#re.steps == 1, "no frame for the skipped step")

-- Single quotes survive shell quoting.
local r5 = M.at_console({ cmd = "AT+X='y'" })
assert(r5.ok and r5.steps[1].response:find("AT+X='y'", 1, true), "single quotes survive")

-- Channel-level failures still return {error}, never steps.
local rb = M.at_console({ cmd = "AT__BUSY__" })
assert(rb.error and not rb.ok and rb.error:lower():find("busy", 1, true), "busy errors")
-- The tool's reason line (an earlier command's reply still owed) reaches the page.
local rob = M.at_console({ cmd = "AT__OWED__" })
assert(rob.error and rob.error:find("busy", 1, true) and rob.error:find("AT+QSCAN=*,1 still owed", 1, true),
       "busy carries the tool's reason: " .. tostring(rob.error))
local ro = M.at_console({ cmd = "AT__OPENFAIL__" })
assert(ro.error and ro.error:find("cannot open", 1, true), "openfail errors")
local rg = M.at_console({ cmd = "AT__GARBAGE__" })
assert(rg.error and rg.error:find("no envelope", 1, true), "no-envelope errors")
local rw = M.at_console({ cmd = "AT__WEIRD__" })
assert(rw.error and rw.error:find("unexpected status", 1, true), "unknown status errors")

-- Accept side of the caps: exactly 8 steps and a 256-char step are allowed.
local eight = {}
for i = 1, 8 do eight[i] = "AT+C" .. i end
local r8 = M.at_console({ cmd = table.concat(eight, "\n") })
assert(r8.ok and r8.requested == 8 and r8.ran == 8, "exactly 8 steps must be accepted")
local at256 = "AT+" .. string.rep("X", 253)   -- 256 chars total
assert(#at256 == 256, "fixture must be exactly 256 chars")
local r256 = M.at_console({ cmd = at256 })
assert(r256.ok, "a 256-char step must be accepted")

setmode("")
print("at_console backend OK")
