-- mudimodem.at_console / at_result: the nginx plugin only FORWARDS to mudimodemd over oui.ubus
-- (a cosocket, so GL's one nginx worker keeps serving while the modem answers). The AT engine
-- itself is tested in test/daemon-at.test.lua and end to end in test/collectd-emu.test.py.
-- Runs against a fake oui.ubus only — nothing can reach a modem.
-- Env: MM_PLUGIN=<plugin path>
local cjson = require "cjson"

local calls, daemon = {}, "up"
local JOB = { id = 4200, steps = { { cmd = "AT", status = "ok", response = "\r\nOK\r\n", elapsed_ms = 3 } } }
package.loaded["oui.ubus"] = {
  call = function(object, method, params, timeout)
    calls[#calls + 1] = { object = object, method = method, params = params, timeout = timeout }
    if object ~= "mudimodem" then error("at_console must only talk to mudimodemd, not " .. tostring(object)) end
    if daemon == "down" then return nil, "not found" end
    if daemon == "slow" then return nil, "read fail: timeout" end
    if method == "at_start" then
      if params.cmd == "BAD" then return { error = "cmd required" } end
      return { id = JOB.id, queued = 0 }
    elseif method == "at_wait" then
      if daemon == "queued" then
        return { done = false, pending = true, id = params.id, state = "queued", ran = 0, requested = 1, steps = {} }
      end
      if daemon == "pending" then
        return { done = false, pending = true, id = params.id, state = "running", ran = 1, requested = 3, steps = JOB.steps }
      end
      return { done = true, ok = true, id = params.id, transport = "gl", slot = 1, sub_id = 1,
               requested = 1, ran = 1, aborted = false, steps = JOB.steps }
    end
    error("unexpected method " .. tostring(method))
  end
}

local M = dofile(os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(type(M.at_console) == "function" and type(M.at_result) == "function", "at_console / at_result exported")

-- input the plugin rejects itself (no call at all)
assert(M.at_console(nil).error and M.at_console({}).error and M.at_console({ cmd = 5 }).error, "cmd required")
assert(#calls == 0, "nothing forwarded for a missing cmd")

-- the happy path: one start, one wait, the daemon's reply verbatim
local r = M.at_console({ cmd = 'AT+QENG="servingcell"', timeout = 12 })
assert(r.ok and r.done and r.transport == "gl" and r.steps[1].status == "ok", "result passed through")
assert(#calls == 2, "exactly start + wait")
assert(calls[1].method == "at_start" and calls[1].params.cmd == 'AT+QENG="servingcell"', "cmd forwarded verbatim")
assert(calls[1].params.timeout == 12, "timeout forwarded")
assert(calls[2].method == "at_wait" and calls[2].params.id == 4200 and calls[2].params.wait == 20,
       "waits on the job id, 20 s per slice (under the 30 s proxy limit)")
calls = {}
M.at_console({ cmd = "AT", timeout = "x" })
assert(calls[1].params.timeout == 8, "a junk timeout becomes the default (the daemon clamps the rest)")

-- the daemon's own validation error comes back as {error}, with no wait
calls = {}
local e = M.at_console({ cmd = "BAD" })
assert(e.error == "cmd required" and #calls == 1, "daemon rejection returned, no wait")

-- still running after one slice: {pending, id}; the page continues with at_result
daemon = "pending"; calls = {}
local p = M.at_console({ cmd = "AT\nAT\nAT" })
assert(p.pending and p.id == 4200 and p.ran == 1 and #p.steps == 1, "pending + partial steps")
local p2 = M.at_result({ id = "4200" })
assert(p2.pending and calls[#calls].params.id == 4200, "at_result accepts the id as sent by the page")
M.at_result({ id = 4200.9 })
assert(calls[#calls].params.id == 4200, "id floors")
assert(M.at_result({}).error and M.at_result({ id = "x" }).error, "at_result needs a numeric id")
-- a job still queued has no steps; over ubus that list arrived as {} — the page gets []
daemon = "queued"
local q = M.at_console({ cmd = "AT" })
-- (the router's cjson has empty_array; the dev box's does not, and gets a plain empty table)
assert(q.pending and type(q.steps) ~= "nil", "steps present")
if cjson.empty_array then
  assert(cjson.encode(q.steps) == "[]", "empty steps go out as a JSON array, got " .. cjson.encode(q.steps))
else
  assert(type(q.steps) == "table" and next(q.steps) == nil, "empty steps")
end
daemon = "up"
assert(M.at_result({ id = 4200 }).done, "at_result returns the finished job")

-- the daemon missing or not answering: a plain error that says which
daemon = "down"
local d = M.at_console({ cmd = "AT" })
assert(d.error and d.error:find("not running", 1, true), "daemon down: " .. tostring(d.error))
daemon = "slow"
local s = M.at_result({ id = 1 })
assert(s.error and s.error:find("did not answer", 1, true), "daemon slow: " .. tostring(s.error))

print("at_console forwarder OK " .. cjson.encode({ calls = #calls }))
