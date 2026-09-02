local server = require 'resty.websocket.server'
local ubus = require 'oui.ubus'
local cjson = require 'cjson'
local fs = require 'oui.fs'

cjson.encode_empty_table_as_object(false)

local subscribes = {}

local function valid_sid()
    if ngx.var.remote_addr == "127.0.0.1" or ngx.var.remote_addr == "::1" then
        return true
    end

    local args = ngx.req.get_uri_args() or {}
    local sid = args.sid

    if not sid then
        return false
    end

    local status = ubus.call('gl-session', 'status')
    if not status then
        return false
    end

    local sessions = status.sessions

    return sessions[sid]
end

if not valid_sid() then
    return ngx.exit(401)
end

local wb, err = server:new({ max_payload_len = 65535, timeout = 3600 * 1000 })
if not wb then
    ngx.log(ngx.ERR, 'failed to new websocket: ', err)
    return ngx.exit(500)
end

ngx.log(ngx.ERR, 'new websocket connection')

local sock = ngx.socket.tcp()
local ok, err = sock:connect("unix:/var/run/ngx-ws-proxy.sock")
if not ok then
    ngx.log(ngx.ERR, 'failed to connect websocket proxy: ', err)
    return ngx.exit(500)
end

sock:settimeout(3600 * 1000)

ngx.thread.spawn(function()
    while true do
        local size, err = sock:receive()
        if not size then
            ngx.log(ngx.ERR, 'read size fail:' .. err)
            return ngx.exit(500)
        end

        local data, err = sock:receive(size)
        if not data then
            ngx.log(ngx.ERR, 'read data fail:' .. err)
            return ngx.exit(500)
        end

        local msg = cjson.decode(data)

        if subscribes[msg.name] then
            wb:send_text(cjson.encode(msg))
        end
    end
end)

local function on_subscribe(name, mod, ev)
    local script = '/usr/share/gl-ngx/websocket/' .. mod .. '.lua'

    if not fs.access(script) then
        return
    end

    local tb = dofile(script)
    local fun = tb[ev]

    if not fun then
        return
    end

    local info = fun()

    local msg = { name = name, data = info }

    wb:send_text(cjson.encode(msg))
end

while true do
    local data, typ, err = wb:recv_frame()
    if not data then
        ngx.log(ngx.ERR, 'failed to receive a frame: ', err)
        return ngx.exit(500)
    end

    if typ == 'close' then
        ngx.log(ngx.ERR, 'websocket disconnected')
        return ngx.exit(200)
    end

    if typ == 'ping' then
        wb:send_pong(data)
    elseif typ == 'text' then
        local msg = cjson.decode(data)
        local cmd = msg.cmd
        local name = msg.name
        local mod, ev = name:match('([%w_]+)%.([%w_]+)')

        if not mod or not ev then
            return
        end

        if cmd == 'subscribe' then
            subscribes[name] = true
            ngx.thread.spawn(function()
                on_subscribe(name, mod, ev)
            end)
        elseif cmd == 'unsubscribe' then
            subscribes[name] = nil
        end
    end
end
