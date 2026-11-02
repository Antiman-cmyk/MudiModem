#!/usr/bin/eco
-- A fake GL 4.10 cellular stack on a real ubusd: the objects MudiModem's daemons call, answering
-- with the shapes in docs/cellular-api-4.10.md. Runs under the image's own eco (tools/emu.sh eco).
--
--   eco fake-gl.lua <ubus socket> <scenario.json> <log dir>
--
-- scenario.json (every key optional):
--   modem_status / modem_info / network_info / sim_info   replies of the no-arg calls
--   cell_info: [payload, ...]        cycled one per call (a handover is the next payload);
--                                    {"fail": true} answers with UBUS_STATUS_UNKNOWN_ERROR,
--                                    {"hang": s} answers only after s seconds (a wedged modem)
--   collect_signals: {...}           cellular.collect get_signals reply
--   has_ws: true|false               gl-session has_websocket
--   at: {"AT+CSQ": "\r\n+CSQ: 20,99\r\n\r\nOK\r\n", ...}   modem.CPU.AT get_result_AT by cmd;
--                                    {"hang": s, "reply": "..."} answers after s seconds;
--                                    anything else answers "\r\nERROR\r\n"
--   no_at: true                      modem.CPU.AT not registered (GL's cellular stack down)
-- Every call is appended to <log dir>/calls.jsonl ({object, method, args}); every gl-session
-- notify to <log dir>/notify.jsonl ({name, data}).
local ubus = require "eco.ubus"
local cjson = require "cjson"
local time = require "eco.time"

local sock, scen_path, logdir = arg[1], arg[2], arg[3]
local f = assert(io.open(scen_path)); local S = cjson.decode(f:read("*a")); f:close()

local function append(name, obj)
  local fh = io.open(logdir .. "/" .. name, "a")
  if fh then fh:write(cjson.encode(obj), "\n"); fh:close() end
end

local conn = assert(ubus.connect(sock))
local cell_i = 0

local function fixed(obj, method, key)
  return { function(req, msg)
    append("calls.jsonl", { object = obj, method = method, args = msg or {} })
    local v = S[key]
    if v == nil then return ubus.STATUS_NOT_FOUND end
    conn:reply(req, v)
  end, {} }
end

conn:add("cellular.modem", { status = fixed("cellular.modem", "status", "modem_status"),
                             info = fixed("cellular.modem", "info", "modem_info") })
conn:add("cellular.sim", { info = fixed("cellular.sim", "info", "sim_info") })
conn:add("cellular.network", {
  info = fixed("cellular.network", "info", "network_info"),
  cell_info = { function(req, msg)
    append("calls.jsonl", { object = "cellular.network", method = "cell_info", args = msg or {} })
    local list = S.cell_info or {}
    if #list == 0 then return ubus.STATUS_NOT_FOUND end
    cell_i = cell_i % #list + 1
    local p = list[cell_i]
    if p.fail then return ubus.STATUS_UNKNOWN_ERROR end
    if p.hang then time.sleep(p.hang); return ubus.STATUS_UNKNOWN_ERROR end
    conn:reply(req, p)
  end, { bus = ubus.STRING, slot = ubus.INT32 } },
})
conn:add("cellular.collect", { get_signals = { function(req, msg)
  append("calls.jsonl", { object = "cellular.collect", method = "get_signals", args = msg or {} })
  if S.collect_signals == nil then return ubus.STATUS_NOT_FOUND end
  conn:reply(req, S.collect_signals)
end, { time = ubus.INT32, slot = ubus.INT32 } } })
if not S.no_at then
  conn:add("modem.CPU.AT", { get_result_AT = { function(req, msg)
    append("calls.jsonl", { object = "modem.CPU.AT", method = "get_result_AT", args = msg or {} })
    local v = (S.at or {})[msg and msg.cmd or ""]
    if type(v) == "table" then
      if v.hang then time.sleep(v.hang) end
      v = v.reply
    end
    conn:reply(req, { data = v or "\r\nERROR\r\n" })
  end, { cmd = ubus.STRING, timeout = ubus.INT32, sub_id = ubus.INT32, source_flag = ubus.INT32 } } })
end
conn:add("gl-session", {
  notify = { function(req, msg)
    append("notify.jsonl", msg or {})
  end, { name = ubus.STRING, data = ubus.TABLE } },
  has_websocket = { function(req)
    conn:reply(req, { has_ws = S.has_ws ~= false })
  end, {} },
})

local ready = io.open(logdir .. "/ready", "w"); if ready then ready:write("1"); ready:close() end
while true do time.sleep(3600) end
