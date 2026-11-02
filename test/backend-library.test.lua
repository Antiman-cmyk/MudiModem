-- mudimodem.library_status / refresh_library / job_result: the plugin forwards to mudimodemd's
-- lib_check / lib_refresh jobs (the tool runs there) and returns the tool's JSON verbatim, or
-- {pending, id} for job_result. The shim plays the daemon; nothing touches the network.
-- Env: MM_PLUGIN.
local calls, mode = {}, "done"
local REPLY = {
  lib_check = { local_revision = "old111", remote_revision = "new222", update_available = true, checked = true },
  lib_refresh = { ok = true, revision = "new222", count = 7 },
}
local started = {}
package.loaded["oui.ubus"] = { call = function(obj, method, params)
  assert(obj == "mudimodem", "the library methods only talk to mudimodemd, not " .. tostring(obj))
  calls[#calls + 1] = method
  if mode == "down" then return nil, "not found" end
  if method == "job_start" then
    if params.kind == "nope" then return { error = "unknown job kind: nope" } end
    local id = #calls
    started[id] = params.kind
    return { id = id }
  elseif method == "job_wait" then
    if mode == "pending" then return { done = false, pending = true, id = params.id, kind = started[params.id] } end
    local r = { done = true, id = params.id }
    for k, v in pairs(REPLY[started[params.id]] or {}) do r[k] = v end
    return r
  end
  error("unexpected " .. tostring(method))
end }

local M = dofile(os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(type(M.library_status) == "function" and type(M.refresh_library) == "function", "library methods")
assert(type(M.job_result) == "function", "job_result")

local s = M.library_status({})
assert(s.checked == true and s.update_available == true, "status passes the check JSON through")
assert(s.local_revision == "old111" and s.remote_revision == "new222", "revisions passed through")
assert(calls[1] == "job_start" and calls[2] == "job_wait", "start + one wait")

local r = M.refresh_library({})
assert(r.ok == true and r.revision == "new222" and r.count == 7, "refresh JSON passed through")

mode = "pending"
local p = M.refresh_library({})
assert(p.pending and p.id, "a refresh still running -> {pending, id}")
local p2 = M.job_result({ id = tostring(p.id) })
assert(p2.pending and p2.id == p.id, "job_result accepts the id as the page sends it")
mode = "done"
local d = M.job_result({ id = p.id })
assert(d.done and d.ok and d.count == 7, "job_result returns the finished job")
assert(M.job_result({}).error and M.job_result({ id = "x" }).error, "job_result needs a numeric id")

mode = "down"
assert(M.library_status({}).error:find("not running", 1, true), "daemon down -> plain error")
print("library backend OK")
