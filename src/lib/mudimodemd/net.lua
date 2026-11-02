-- mudimodemd/net.lua — the cellular data device and its byte counters (eco or plain Lua).
--
--   resolve_iface(dump, which)   `network.interface dump` -> (device, up) for "cellular" (the
--                                non-_6 rmnet interface) or "wired" (wan). Resolved live, never
--                                hard-coded: the cellular device has moved between rmnet_data0 and
--                                rmnet_data1 after a modem reconnect.
--   counters(root, dev)          rx_bytes, tx_bytes from <root>/<dev>/statistics, or nil
--   rate(prev, cur)              kbit/s down / up between two counter readings; nil, nil when the
--                                device changed or a counter went backwards (reconnect, reset)
local cjson = require "cjson"

local M = {}

function M.resolve_iface(dump, which)
  local ifaces = type(dump) == "table" and type(dump.interface) == "table" and dump.interface or {}
  for _, i in ipairs(ifaces) do
    local name = tostring(i.interface or "")
    local hit = (which == "cellular" and i.proto == "rmnet" and not name:match("_6$"))
             or (which == "wired" and name == "wan")
    if hit then
      local dev = (i.l3_device ~= cjson.null and i.l3_device) or (i.device ~= cjson.null and i.device) or nil
      return dev, (i.up == true) and dev ~= nil
    end
  end
  return nil, false
end

local function readnum(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*l"); f:close()
  return tonumber(s)
end

function M.counters(root, dev)
  if type(dev) ~= "string" or not dev:match("^[%w%._-]+$") then return nil end
  local base = root .. "/" .. dev .. "/statistics/"
  local rx, tx = readnum(base .. "rx_bytes"), readnum(base .. "tx_bytes")
  if not rx or not tx then return nil end
  return rx, tx
end

-- prev / cur = { dev, rx, tx, t (seconds, monotonic) }
function M.rate(prev, cur)
  if not prev or not cur or prev.dev ~= cur.dev then return nil, nil end
  local dt = cur.t - prev.t
  if dt <= 0 or cur.rx < prev.rx or cur.tx < prev.tx then return nil, nil end
  return math.floor((cur.rx - prev.rx) * 8 / 1000 / dt + 0.5), math.floor((cur.tx - prev.tx) * 8 / 1000 / dt + 0.5)
end

return M
