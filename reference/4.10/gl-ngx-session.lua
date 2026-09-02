#!/usr/bin/eco

-- Author: Jianhui Zhao <jianhui.zhao@gl-inet.com>

--[[
username=root
password=1

resp=$(ubus call gl-session challenge "{\"username\":\"$username\"}")

echo "challenge:"
echo "$resp"

code=$(jsonfilter -s "$resp" -e '@.code')
[ "$code" = "0" ] || exit

alg=$(jsonfilter -s "$resp" -e '@.data.alg')
salt=$(jsonfilter -s "$resp" -e '@.data.salt')
nonce=$(jsonfilter -s "$resp" -e '@.data.nonce')

pw=$(openssl passwd -$alg -salt "$salt" "$password")

hash=$(echo -n "$username:$pw:$nonce" | sha256sum | cut -d' ' -f1)

echo "password: $password"
echo "alg: $alg"
echo "salt: $salt"
echo "nonce: $nonce"
echo "pw: $pw"
echo "hash: $hash"

echo "login:"
ubus call gl-session login "{\"username\":\"$username\",\"hash\":\"$hash\"}"
--]]

local httpc = require 'eco.http.client'
local hex = require 'eco.encoding.hex'
local termios = require 'eco.termios'
local socket = require 'eco.socket'
local sha256 = require 'eco.hash.sha256'
local md5 = require 'eco.hash.md5'
local time = require "eco.time"
local sync = require 'eco.sync'
local ubus = require "eco.ubus"
local file = require "eco.file"
local sys = require "eco.sys"
local log = require "eco.log"
local dns = require 'eco.dns'
local eco = require 'eco'

local sqlite3 = require "lsqlite3"
local cjson = require "cjson"
local uci = require "uci"

local MAX_SESSION = 5

local login_wait = 0
local login_fail = 0
local login_fail_max_cnt
local login_fail_wait_time
local session_timeout

local nonce_cnt = 0
local nonces = {}

local session_cnt = 0
local sessions = {}

local ws_clients = {}

log.set_flags(log.FLAG_LF | log.FLAG_FILE)

local function trace_hook(ev, line)
    local info = debug.getinfo(2)
    log.info(info.short_src .. ':', line, info.name or info.what)
end

local function clean_gl_token()
    for name in file.dir("/tmp") do
        local sid = name:match("gl_token_(.+)")
        if sid and not sessions[sid] then
            os.remove("/tmp/" .. name)
        end
    end
end

local function set_console(fd, on)
    local attr = termios.tcgetattr(fd)
    attr:set_cc(termios.VMIN, on and 1 or 255)
    termios.tcsetattr(fd, termios.TCSANOW, attr)
end

local function console_ctl(on)
    if on then
        os.execute('ln -s /bin/busybox /bin/login')
    else
        os.remove('/bin/login')
        os.execute('killall login')
    end

    if eco.VERSION_MAJOR > 3 then
        local f<close> = file.open('/dev/console')
        set_console(f.fd, on)
    else
        local fd = file.open('/dev/console')
        set_console(fd, on)
        file.close(fd)
    end
end

local function init()
    if arg[1] == '-trace' then
        debug.sethook(trace_hook, 'l')
    end

    if eco.VERSION_MAJOR > 3 then
        eco.set_panic_hook(function(traceback1, traceback2)
            log.err(traceback1)
            log.err(traceback2)
        end)
    else
        eco.panic_hook = function(err)
            log.err(err)
        end
    end

    local c = uci.cursor()
    login_fail_max_cnt = tonumber(c:get("oui-httpd", "main", "max_login_fail") or 10)
    login_fail_wait_time = tonumber(c:get("oui-httpd", "main", "login_fail_wait") or 600)
    session_timeout = tonumber(c:get("oui-httpd", "main", "session_timeout") or 300)

    clean_gl_token()

    local console_disabled = c:get("oui-httpd", "main", "console_disabled") == "1"

    console_ctl(not console_disabled)

    c:close()
end

local function get_crypt_info(username)
    if not username or not username:match('^[a-z][-a-z0-9_]*$') then return nil end

    for l in io.lines("/etc/shadow") do
        local alg, salt = l:match('^' .. username .. ':%$(%d)%$(.+)%$')
        if alg then
            return tonumber(alg), salt
        end
    end

    return nil
end

local function generate_id(n)
    local t = {
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
    }

    local f = io.open('/dev/urandom')

    assert(f)

    local s = {}
    for _ = 1, n do
        local i = f:read(1)
        s[#s + 1] = t[i:byte() % #t + 1]
    end

    f:close()

    return table.concat(s)
end

local function create_nonce(username)
    if nonce_cnt > 5 then
        log.err("The number of nonce too more")
        return nil
    end

    local nonce = generate_id(32)

    if not nonces[username] then
        nonces[username] = {}
    end

    nonces[username][nonce] = sys.uptime() + 2

    nonce_cnt = nonce_cnt + 1

    return nonce
end

local function login_test(username, hash)
    if not username or not username:match('^[a-z][-a-z0-9_]*$') then return false end

    if not nonces[username] then
        return false
    end

    for l in io.lines("/etc/shadow") do
        local pw = l:match('^' .. username .. ':([^:]+)')
        if pw then
            for nonce in pairs(nonces[username]) do
                if hex.encode(sha256.sum(table.concat({username, pw, nonce}, ":"))) == hash then
                    nonces[username][nonce] = nil
                    nonce_cnt = nonce_cnt - 1
                    return true
                end
            end

            return false
        end
    end

    return false
end

local function get_acl_by_username(username)
    local DB = "/etc/oui/oui.db"

    if username == "root" then return "root" end

    local db = sqlite3.open(DB)
    local sql = string.format("SELECT acl FROM account WHERE username = '%s'", username)

    local aclgroup = ""

    for a in db:rows(sql) do
        aclgroup = a[1]
    end

    db:close()

    return aclgroup
end

local function create_session(username)
    local aclgroup = get_acl_by_username(username)

    local sid = generate_id(32)

    sessions[sid] = {
        username = username,
        aclgroup = aclgroup,
        timeout = sys.uptime() + session_timeout
    }

    session_cnt = session_cnt + 1

    return sid
end

local function update_gl_token(path)
    local t = os.time()
    local is_admin = 1

    file.writefile(path, string.pack("I4I4", t, is_admin))
end


-- local ERROR_CODE_NONE = 0
-- local ERROR_CODE_PARSE_ERROR = -32700
-- local ERROR_CODE_INVALID_REQUEST = -32600
-- local ERROR_CODE_METHOD_NOT_FOUND = -32601
local ERROR_CODE_INVALID_PARAMS = -32602
-- local ERROR_CODE_INTERNAL_ERROR = -32603

-- Custom error code
local ERROR_CODE_ACCESS = -32000
-- local ERROR_CODE_NOT_FOUND = -32001
-- local ERROR_CODE_SESSION_OVER_LIMIT = -32002
local ERROR_CODE_LOGIN_FAIL_OVER_LIMIT = -32003

sys.signal(sys.SIGINT, function()
    log.info('\nGot SIGTERM, now quit')
    eco.unloop()
end)

sys.signal(sys.SIGTERM, function()
    log.info('\nGot SIGTERM, now quit')
    eco.unloop()
end)

local function get_nginx_port()
    local conf = file.readfile('/etc/nginx/conf.d/gl.conf') or ''
    local port = conf:match('listen (%d+);')
    return tonumber(port)
end

local function call_rpc(mod, func, params)
    local port = get_nginx_port()

    local url = 'http://127.0.0.1/rpc'
    if port ~= 80 then
        url = string.format('http://127.0.0.1:%d/rpc', port)
    end

    local req = {
        method = 'call',
        params = {'', mod, func, params}
    }

    local resp, err = httpc.post(url, cjson.encode(req), { headers = { glinet = 1 } } )
    if not resp then
        log.err('call', mod .. '.' .. func, 'fail:', err)
        return nil
    end

    if resp.code ~= 200 then
        log.err('call', mod .. '.' .. func, 'fail with http code:', resp.code)
        return nil
    end

    if not resp.body then
        log.err('no body response')
        return nil
    end

    resp = cjson.decode(resp.body)
    if not resp then
        return nil
    end

    return resp
end

local function check_initialized()
    local c = uci.cursor()
    local initialized = c:get("oui-httpd", "main", "inited") == "1"
    c:close()
    return initialized
end

local function ubus_init()
    local conn

    if eco.VERSION_MAJOR > 3 then
        conn = ubus.connect(nil, true)
    else
        conn = ubus.connect()
        conn:auto_reconnect()
    end

    conn:add("gl-session", {
            call = {
                function(req, msg)
                    local mod = msg.module
                    local func = msg.func
                    local params = msg.params

                    local resp = call_rpc(mod, func, params)
                    if not resp then
                        return ubus.STATUS_UNKNOWN_ERROR
                    end

                    conn:reply(req, {error = resp.error, result = resp.result})

                end, { module = ubus.STRING, func = ubus.STRING, params = ubus.TABLE }
            },
            status = {
                function(req)
                    conn:reply(req, {
                        nonce_cnt = nonce_cnt,
                        session_cnt = session_cnt,
                        nonces = nonces,
                        sessions = sessions
                    })
                end, {}
            },
            challenge = {
                function(req, msg)
                    local username = msg.username
                    local initialized = check_initialized()

                    if type(username) ~= "string" then
                        conn:reply(req, { code = ERROR_CODE_INVALID_PARAMS })
                        return
                    end

                    if login_wait - sys.uptime() > 0 then
                        conn:reply(req, { code = ERROR_CODE_LOGIN_FAIL_OVER_LIMIT, data = { wait = login_wait - sys.uptime() } })
                        return
                    end

                    local alg, salt = get_crypt_info(username)
                    if not alg then
                        if initialized then
                            login_fail = login_fail + 1
                        end

                        if login_fail == login_fail_max_cnt then
                            login_fail = 0
                            login_wait = sys.uptime() + login_fail_wait_time
                        end

                        conn:reply(req, { code = ERROR_CODE_ACCESS })
                        return
                    end

                    local nonce = create_nonce(username)
                    if not nonce then
                        conn:reply(req, { code = ERROR_CODE_ACCESS })
                        return
                    end

                    conn:reply(req, {
                        code = 0,
                        data = {
                            nonce = nonce,
                            alg = alg,
                            salt = salt,
                            ['hash-method'] = 'sha256'
                        }
                    })
                end, { username = ubus.STRING }
            },
            login = {
                function(req, msg)
                    local username, hash = msg.username, msg.hash

                    clean_gl_token()

                    if type(username) ~= "string" or type(hash) ~= "string" then
                        conn:reply(req, { code = ERROR_CODE_INVALID_PARAMS })
                        return
                    end

                    if login_wait - sys.uptime() > 0 then
                        conn:reply(req, { code = ERROR_CODE_LOGIN_FAIL_OVER_LIMIT, data = { wait = login_wait - sys.uptime() } })
                        return
                    end

                    if not login_test(username, hash) then
                        login_fail = login_fail + 1

                        if login_fail == login_fail_max_cnt then
                            login_fail = 0
                            login_wait = sys.uptime() + login_fail_wait_time
                        end

                        conn:reply(req, { code = ERROR_CODE_ACCESS })
                        return
                    end

                    login_fail = 0

                    if session_cnt == MAX_SESSION then
                        log.err("session more than ", MAX_SESSION, ", clean the last inactive")

                        local li_sid

                        for sid, s in pairs(sessions) do
                            if not li_sid then
                                li_sid = sid
                            elseif s.timeout < sessions[li_sid].timeout then
                                li_sid = sid
                            end
                        end

                        if li_sid then
                            sessions[li_sid] = nil
                            session_cnt = session_cnt - 1
                        end

                        clean_gl_token()
                    end

                    local sid = create_session(username)

                    update_gl_token("/tmp/gl_token_" .. sid)

                    conn:reply(req, {
                        code = 0,
                        data = {
                            username = username,
                            sid = sid
                        }
                    })
                end, { username = ubus.STRING, hash = ubus.STRING }
            },
            logout = {
                function(req, msg)
                    local sid = msg.sid

                    if type(sid) ~= "string" then
                        conn:reply(req, { code = ERROR_CODE_INVALID_PARAMS })
                        return
                    end

                    sessions[sid] = nil
                    session_cnt = session_cnt - 1

                    clean_gl_token()

                    conn:reply(req, {})
                end, { sid = ubus.STRING }
            },
            touch = {
                function(req, msg)
                    local sid = msg.sid

                    if type(sid) ~= "string" then
                        conn:reply(req, { code = ERROR_CODE_INVALID_PARAMS })
                        return
                    end

                    local session = sessions[sid]

                    if not session then
                        conn:reply(req, { code = ERROR_CODE_ACCESS })
                        return
                    end

                    session.timeout = sys.uptime() + session_timeout

                    conn:reply(req, { code = 0 })
                end, { sid = ubus.STRING }
            },
            session = {
                function(req, msg)
                    local sid = msg.sid

                    if type(sid) ~= "string" then return end

                    local session = sessions[sid]

                    if not session then return ubus.STATUS_NOT_FOUND end

                    session.timeout = sys.uptime() + session_timeout
                    conn:reply(req, session)
                end, { sid = ubus.STRING }
            },
            clear_session = {
                function()
                    sessions = {}
                    nonce_cnt = 0
                    session_cnt = 0
                end, {}
            },
            notify = {
                function(req, msg)
                    for c, mutex in pairs(ws_clients) do
                        local data = cjson.encode(msg)
                        mutex:lock()
                        c:send(#data .. '\n')
                        c:send(data)
                        mutex:unlock()
                    end
                end, { name = ubus.STRING, data = ubus.TABLE }
            },
            has_websocket = {
                function(req)
                    local has_ws = next(ws_clients) ~= nil
                    conn:reply(req, { has_ws = has_ws })
                end, {}
            },
            console = {
                function(req, msg)
                    local enable = msg.enable

                    if type(enable) ~= 'boolean' then
                        return ubus.STATUS_INVALID_ARGUMENT
                    end

                    local c = uci.cursor()
                    c:set("oui-httpd", "main", "console_disabled", enable and 0 or 1)
                    c:commit("oui-httpd")
                    c:close()

                    console_ctl(enable)
                end, { enable = ubus.BOOLEAN }
            },
            resolve = {
                function(req, msg)
                    local host = msg.host

                    if type(host) ~= 'string' then
                        return ubus.STATUS_INVALID_ARGUMENT
                    end

                    local answers, err = dns.query(host)
                    if not answers then
                        log.err('DNS query for', host, 'fail:', err)
                        return
                    end

                    local address = {}

                    for _, a in ipairs(answers) do
                         if a.type == dns.TYPE_A then
                            address[#address + 1] = a.address
                        end
                    end

                    if #address == 0 then
                        log.err('DNS query for', host, 'no A record for', host)
                        return
                    end

                    conn:reply(req, { address = address })
                end, { host = ubus.STRING }
            }
        })

    while true do time.sleep(1000) end
end

local function handle_ubus_proxy(c)
    local size, err = c:recv("*l", 3.0)
    if not size then
        log.err('recv fail:', err)
        c:close()
    end

    size = tonumber(size)

    local data, err = c:recvfull(size, 3.0)
    if not data then
        log.err('recv fail:', err)
        c:close()
        return
    end

    data = cjson.decode(data)

    local res, err = ubus.call(data.object, data.method, data.params)

    data = cjson.encode({ res = res, err = err })

    c:send(data)
    c:close()
end

local function ubus_proxy_init()
    os.remove('/var/run/ngx-ubus-proxy.sock')

    local s, err = socket.listen_unix('/var/run/ngx-ubus-proxy.sock')
    if not s then
        error(err)
    end

    log.info('listen ubus proxy...')

    while true do
        local c, peer = s:accept()
        if not c then
            log.err('accept fail:', peer)
            break
        else
            eco.run(handle_ubus_proxy, c)
        end
    end
end

local function handle_ws_proxy(c)
    ws_clients[c] = sync.mutex()

    log.info('new websocket proxy connection')

    c:recv(1)
    c:close()

    log.info('websocket proxy disconnected')

    ws_clients[c] = nil
end

local function ws_proxy_init()
    os.remove('/var/run/ngx-ws-proxy.sock')

    local s, err = socket.listen_unix('/var/run/ngx-ws-proxy.sock')
    if not s then
        error(err)
    end

    log.info('listen ws proxy...')

    while true do
        local c, peer = s:accept()
        if not c then
            log.err('accept fail:', peer)
            break
        else
            eco.run(handle_ws_proxy, c)
        end
    end
end

local function handle_cmd_proxy(c)
    local size, err = c:recv('*l', 3.0)
    if not size then
        log.err('recv fail:', err)
        c:close()
        return
    end

    size = tonumber(size)

    local data, err = c:recvfull(size, 3.0)
    if not data then
        log.err('recv fail:', err)
        c:close()
        return
    end

    local info = cjson.decode(data)
    local args = info.args

    local p, err = sys.exec(table.unpack(args))
    if not p then
        log.err('exec cmd', args[1], 'fail:', err)
        c:close()
        return
    end

    local timeout = info.timeout or 10
    local merge_stderr = info.merge_stderr
    local partial

    data, _, partial = p:read_stdout('*a', timeout)
    if data then
        c:send(data)
    elseif partial then
        c:send(partial)
    end

    if merge_stderr then
        data, _, partial = p:read_stderr('*a', timeout)
        if data then
            c:send(data)
        elseif partial then
            c:send(partial)
        end
    end

    c:close()
    p:close()

    if not p:wait(timeout) then
        if eco.VERSION_MAJOR > 3 then
            p:kill()
        else
            sys.kill(p:pid(), sys.SIGKILL)
        end
    end
end

local function cmd_proxy_init()
    os.remove('/var/run/ngx-cmd-proxy.sock')

    local s, err = socket.listen_unix('/var/run/ngx-cmd-proxy.sock')
    if not s then
        error(err)
    end

    log.info('listen cmd proxy...')

    while true do
        local c, peer = s:accept()
        if not c then
            log.err('accept fail:', peer)
            break
        else
            eco.run(handle_cmd_proxy, c)
        end
    end
end

init()

eco.run(ubus_init)

eco.run(ubus_proxy_init)

eco.run(ws_proxy_init)

eco.run(cmd_proxy_init)

time.at(1, function(tmr)
    local now = sys.uptime()

    for _, info in pairs(nonces) do
        for nonce, timeout in pairs(info) do
            if now > timeout then
                info[nonce] = nil
                nonce_cnt = nonce_cnt - 1
            end
        end
    end

    for sid, session in pairs(sessions) do
        if now > session.timeout then
            sessions[sid] = nil
            session_cnt = session_cnt - 1
            os.remove("/tmp/gl_token_" .. sid)
        end
    end

    tmr:set(2)
end)

time.at(60 * 10, function(tmr)
    local size = 0
    local f

    local st = file.stat('/var/log/nginx/error.log')
    if st.size > 100 * 1024 then
        f = io.open('/var/log/nginx/error-tmp.log', 'w')
        if not f then
            tmr:set(60 * 10)
            return
        end

        for line in io.lines('/var/log/nginx/error.log') do
            size = size + #line

            if size > 20 * 1024 then
                f:write(line .. '\n')
            end
        end

        f:close()
        os.execute('cat /var/log/nginx/error-tmp.log > /var/log/nginx/error.log')
        os.remove('/var/log/nginx/error-tmp.log')
    end

    local log1 = file.readfile('/etc/nginx/error.log') or ''
    local log2 = file.readfile('/var/log/nginx/error.log') or ''

    if md5.sum(log1) ~= md5.sum(log2) then
        file.writefile('/etc/nginx/error.log', log2)
    end

    tmr:set(60 * 10)
end)
