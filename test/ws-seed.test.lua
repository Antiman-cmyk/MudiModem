-- Self-test for /usr/share/gl-ngx/websocket/mudimodem.lua (the /ws seed module).
-- Runs on-device (verify.sh 0b/15, shipped as a file — never inlined into ssh)
-- and locally. Env: MM_WS_MODULE=<path> (default: the installed module),
-- MUDIMODEM_LATEST=<temp file> so the test never touches the collector's real
-- /tmp/mudimodem/latest.json.
local path = os.getenv("MM_WS_MODULE") or "/usr/share/gl-ngx/websocket/mudimodem.lua"
local latest = assert(os.getenv("MUDIMODEM_LATEST"), "set MUDIMODEM_LATEST to a temp path")
-- oui.fs exists only inside nginx; a plain-file access shim is enough here.
if not pcall(require, "oui.fs") then
  package.loaded["oui.fs"] = { access = function(p) local f = io.open(p, "r"); if f then f:close(); return true end; return false end }
end
local M = dofile(path)
assert(type(M.collect) == "function" and type(M.battery) == "function" and type(M.event) == "function",
       "module must export collect(), battery(), event()")
os.remove(latest)
local s = M.collect()
assert(type(s) == "table" and s.t == nil and s.stale == nil, "no file => empty seed, not stale")
local now = os.time()
local function write(t)
  local f = assert(io.open(latest, "w"))
  f:write(string.format('{"t":%.0f,"slot":1,"rsrp":-97,"pci":null}', t * 1000)); f:close()
end
write(now - 5)
s = M.collect()
assert(s.t == (now - 5) * 1000 and s.stale == nil and s.age_s == nil, "a 5 s old sample is fresh")
write(now - 600)
s = M.collect()
assert(s.stale == true and type(s.age_s) == "number" and s.age_s >= 599, "a 10 min old sample must be flagged stale with its age")
assert(s.rsrp == -97, "the stale seed still carries the last known values")
local e = M.event()
assert(type(e) == "table" and e.t == nil, "event seed is empty")
os.remove(latest)
print("ws-seed.test.lua: all ok")
