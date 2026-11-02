-- test/emu/plugin-driver.lua — run ONE call of the real nginx plugin (src/rpc/mudimodem) against
-- the emulated GL bus, for test/change-emu.test.py:
--   lua5.1 plugin-driver.lua <ubus wrapper> <glc state dir> <method> [json args]
-- oui.ubus.call goes through the image's ubus CLI (the wrapper test/emu/gl-bus.sh writes);
-- ngx.location.capture("/cgi-bin/glc") is a fake glc keeping GL's band config in
-- <dir>/band_config.json and logging every call to <dir>/glc.jsonl; os.execute runs for real
-- and is logged to <dir>/exec.log. Prints the method's reply as JSON.
local cjson = require "cjson"
local UBUS, DIR, METHOD, ARGS = arg[1], arg[2], arg[3], arg[4]

local function shq(s) return "'" .. s:gsub("'", "'\\''") .. "'" end
local function readf(p) local f = io.open(p, "r"); if not f then return nil end; local s = f:read("*a"); f:close(); return s end
local function appendf(p, s) local f = io.open(p, "a"); f:write(s, "\n"); f:close() end

package.loaded["oui.ubus"] = { call = function(object, method, params)
  local body = cjson.encode(params or {})
  if body == "[]" then body = "{}" end
  local f = io.popen(UBUS .. " -t 30 call " .. object .. " " .. method .. " " .. shq(body) .. " 2>/dev/null; echo MMRC:$?")
  local out = f:read("*a"); f:close()
  local rc = tonumber(out:match("MMRC:(%d+)%s*$"))
  out = out:gsub("MMRC:%d+%s*$", "")
  if rc == 4 then return nil, "not found" end
  if rc ~= 0 then return nil, "ubus exit " .. tostring(rc) end
  if not out:find("%S") then return {} end
  local ok, obj = pcall(cjson.decode, out)
  if not ok then return nil, "bad json" end
  return obj
end }

ngx = { HTTP_POST = "POST", location = { capture = function(_, opts)
  local req = cjson.decode(opts.body)
  appendf(DIR .. "/glc.jsonl", cjson.encode({ method = req.method, args = req.args }))
  if req.method == "get_band_config" then
    return { status = 200, body = "0 " .. (readf(DIR .. "/band_config.json") or "{}") }
  elseif req.method == "set_band_config" then
    local f = io.open(DIR .. "/band_config.json", "w"); f:write(cjson.encode(req.args)); f:close()
    return { status = 200, body = "0 {}" }
  end
  return { status = 200, body = "0 {}" }
end } }

local real_execute = os.execute
os.execute = function(cmd) appendf(DIR .. "/exec.log", cmd); return real_execute(cmd) end

local M = dofile(os.getenv("MM_PLUGIN"))
local r = M[METHOD](ARGS and cjson.decode(ARGS) or {})
io.write(cjson.encode(r or {}), "\n")
