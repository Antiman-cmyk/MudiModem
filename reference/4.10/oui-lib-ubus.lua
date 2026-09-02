local cjson = require "cjson"
local ubus = require "ubus"

local M = {}

function M.call(object, method, params, timeout)
    local sock = ngx.socket.tcp()
    local ok, err = sock:connect("unix:/var/run/ngx-ubus-proxy.sock")
    if not ok then
        return nil, err
    end

    local data = cjson.encode({ object = object, method = method, params = params or {} })
    local size = #data

    sock:send(size .. "\n")
    sock:send(data)

    sock:settimeout(timeout or 30000)  -- 30 second timeout

    data, err = sock:receive("*a")
    if not data then
        sock:close()
        return nil, "read fail: " .. err
    end

    sock:close()

    data = cjson.decode(data)

    if data.res then
        return data.res
    end

    return nil, data.err
end

function M.send(...)
    local conn = ubus.connect()
    conn:send(...)
    conn:close()
end

function M.objects()
    local conn = ubus.connect()
    local objects = conn:objects()
    conn:close()
    return objects
end

return M
