-- /usr/share/gl-ngx/websocket/mudimodem.lua — MudiModem's websocket module.
--
-- GL 4.10's /ws (usr/share/gl-ngx/oui-ws.lua) dofile()s
-- /usr/share/gl-ngx/websocket/<mod>.lua on EVERY subscribe to "<mod>.<ev>" and
-- sends M[<ev>]() once as the seed; every later frame for that name comes from
-- `ubus call gl-session notify {name, data}` (mudimodem-collectd publishes each
-- sample that way). So this file only answers "what is the latest value right
-- now" — re-read per subscribe, never cached, never needs nginx restarted.
-- Plain file reads only: no ubus, no cosocket, nothing that yields.
local fs = require 'oui.fs'
local cjson = require 'cjson'

local M = {}

local function read_json(path)
  if not fs.access(path) then return {} end
  local f = io.open(path, 'r')
  if not f then return {} end
  local body = f:read('*a')
  f:close()
  if not body or body == '' then return {} end
  local ok, obj = pcall(cjson.decode, body)   -- pure C decode; cannot yield
  if not ok or type(obj) ~= 'table' then return {} end
  return obj
end

-- A seed older than this is still sent — it is the best picture there is —
-- but flagged `stale` with its `age_s` on the BOX clock, so the page can say
-- "last sample N min ago" instead of presenting hours-old RF as live (the
-- collector stops writing when the modem is resetting or the daemon is down,
-- and /tmp/mudimodem/latest.json is never removed). Pushed frames never carry
-- these keys: they are fresh by construction. 60 s = six 10 s ticks missed.
local SEED_STALE_S = 60
local function with_age(obj)
  if type(obj) == 'table' and type(obj.t) == 'number' then
    local age = os.time() - math.floor(obj.t / 1000)
    if age > SEED_STALE_S then obj.stale = true; obj.age_s = age end
  end
  return obj
end

-- mudimodem.collect: the collector's newest normalized RF sample
-- (docs/cellular-api-4.10.md §3). {} = nothing yet (no `t`).
-- (path env-overridable so test/ws-seed.test.lua never touches the real file;
-- nginx workers carry no such variable, so production reads the default.)
local LATEST = os.getenv('MUDIMODEM_LATEST') or '/tmp/mudimodem/latest.json'
function M.collect() return with_age(read_json(LATEST)) end

-- mudimodem.battery: the newest battery sample (same schema as battery.jsonl).
function M.battery() return read_json('/tmp/mudimodem/battery-latest.json') end

-- mudimodem.event: events have no "latest" — the page loads history over RPC
-- and receives new ones as pushes. An empty seed is correct.
function M.event() return {} end

return M
