-- Isolation test for get/set_history_persist (eMMC backup policy).
-- Run from repo root:
--   MUDIMODEM_HISTORY_CFG=/tmp/mmhp/history.json \
--   MUDIMODEM_HISTORY_PERSIST=/tmp/mmhp/history \
--   lua test/backend-history-persist.test.lua
--
-- Loads the SOURCE plugin (src/rpc/mudimodem) with ngx + oui.ubus stubbed so
-- it can dofile outside nginx.

local CFG = os.getenv("MUDIMODEM_HISTORY_CFG") or error("set MUDIMODEM_HISTORY_CFG")
local PERSIST = os.getenv("MUDIMODEM_HISTORY_PERSIST") or error("set MUDIMODEM_HISTORY_PERSIST")
os.execute("rm -rf " .. PERSIST .. " " .. CFG)
os.execute("mkdir -p " .. PERSIST .. " $(dirname " .. CFG .. ")")

package.loaded["oui.ubus"] = {
  call = function() return nil, "unused" end,
}

ngx = {
  socket = { tcp = function()
    return { settimeout = function() end, connect = function() end }
  end },
  re = { match = function() end, gmatch = function() end, find = function() end },
  log = function() end, ERR = 0, WARN = 1, NOTICE = 2, INFO = 3,
  var = {}, req = {}, ctx = {}, say = function() end, print = function() end,
  exit = function() end, HTTP_OK = 200,
  timer = { at = function() end },
  config = { ngx_lua_version = 10025, subsystem = "http", debug = false },
  worker = { id = function() return 0 end, count = function() return 4 end },
  now = function() return os.time() end, time = function() return os.time() end,
}

local ok, M = pcall(dofile, "src/rpc/mudimodem")
assert(ok, "backend failed to load: " .. tostring(M))
assert(type(M.get_history_persist) == "function", "get_history_persist missing")
assert(type(M.set_history_persist) == "function", "set_history_persist missing")

-- Default: missing file → disabled
local a = M.get_history_persist({})
assert(a.enabled == false, "default must be disabled, got " .. tostring(a.enabled))
assert(a.path == PERSIST, "path should be the persist dir, got " .. tostring(a.path))
assert(type(a.flush_interval_s) == "number", "flush interval reported")

-- Enable
local b = M.set_history_persist({ enabled = true })
assert(b.enabled == true, "enabled after set")
local f = io.open(CFG, "r"); assert(f, "policy file written")
local body = f:read("*a"); f:close()
assert(body:find('"enabled":true', 1, true), "policy body has enabled true")

-- Disable
local c = M.set_history_persist({ enabled = false })
assert(c.enabled == false, "disabled after set")

-- Bad args
local d = M.set_history_persist({ enabled = "yes" })
assert(d.error, "non-boolean enabled is an error")
assert(d.enabled == false, "state unchanged after bad set")

print("backend-history-persist OK")
