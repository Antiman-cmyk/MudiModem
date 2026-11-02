-- mudimodemd/tasks.lua — what the daemon's jobs do (eco): the slow I/O the nginx plugin used to
-- do inline, holding GL's ONE nginx worker (curl up to 8 s, python3 + a GitHub fetch). The
-- plugin keeps the policy (which URL, how to present the answer); these only do the waiting.
--
--   version_fetch {url}  curl the remote version.json        -> { version } | { error }
--   library {mode}       the AT-library tool, check|refresh   -> its JSON verbatim | { error }
--   scan {slot}          GL's cell scan (AT+QSCAN via modem.scan_cell_tower), minutes long
--                        -> { towers, ts, slot } | { error }
-- The scan goes through GL's own /rpc on 127.0.0.1 with the `glinet` header — the loop-back
-- gl-session's `call` uses (oui rpc.access: is_local + glinet), but with our own 330 s timeout
-- (gl-session's HTTP client gives up at 30 s; glc itself is cut at fastcgi_read_timeout 300).
-- nginx runs glc as async fastcgi, so its worker is not held while the modem scans.
local sys = require "eco.sys"
local cjson = require "cjson"
local http = require "eco.http.client"

local M = {}

local function exists(path)
  local f = io.open(path, "r")
  if f then f:close(); return true end
  return false
end

-- argv -> stdout | nil, err. A child that overruns timeout_s is killed. eco's children share our
-- process group (and busybox has no setsid), so only the child itself is killed: what we run
-- is curl (its own --max-time) or the library tool, whose curls carry --max-time 8 / 20.
local function run(argv, timeout_s)
  local p, err = sys.exec(table.unpack(argv))
  if not p then return nil, "cannot start " .. argv[1] .. ": " .. tostring(err) end
  local out = p:read_stdout("*a", timeout_s)
  if out == nil then
    sys.kill(p:pid(), sys.SIGKILL)
    p:close()
    return nil, argv[1] .. " did not finish within " .. timeout_s .. " s"
  end
  p:close()
  return out
end
M.run = run

-- The base URL charset the plugin and mudimodem-selfupdate accept (keep the three in sync).
M.URL_OK = "^https?://[%w%.%-_:/]+$"

function M.version_fetch(args, cfg)
  local url = args.url
  if type(url) ~= "string" or not url:match(M.URL_OK) then return { error = "bad version URL" } end
  local out = run({ cfg.curl, "-fsS", "--max-time", "8", url }, 12)
  local ok, obj = pcall(cjson.decode, out or "")
  if not ok or type(obj) ~= "table" or obj.version == nil or obj.version == cjson.null then
    return { error = "remote version.json unreachable or malformed" }
  end
  return { version = tostring(obj.version) }
end

function M.library(mode, cfg)
  if mode ~= "check" and mode ~= "refresh" then return { error = "bad library mode" } end
  if not exists(cfg.python) then
    return { error = "the library tool needs python3, which is not installed yet" }
  end
  local out, err = run({ cfg.python, cfg.lib_tool, mode }, 90)
  if not out then return { error = err } end
  local ok, obj = pcall(cjson.decode, out)
  if not ok or type(obj) ~= "table" then return { error = "library tool returned no JSON" } end
  return obj
end

-- http://127.0.0.1[:port]/rpc, the port from GL's own nginx config (as gl-session reads it).
function M.rpc_url()
  local env = os.getenv("MUDIMODEM_RPC_URL")
  if env and env ~= "" then return env end
  local f = io.open("/etc/nginx/conf.d/gl.conf", "r")
  local conf = f and f:read("*a") or ""
  if f then f:close() end
  local port = tonumber(conf:match("listen (%d+);"))
  if port and port ~= 80 then return string.format("http://127.0.0.1:%d/rpc", port) end
  return "http://127.0.0.1/rpc"
end

function M.scan(args, cfg, event)
  local slot = tonumber(args.slot)
  if not slot or slot < 1 or slot ~= math.floor(slot) then return { error = "no active SIM slot (modem not ready)" } end
  slot = math.floor(slot)
  local body = cjson.encode({ jsonrpc = "2.0", id = 1, method = "call",
                              params = { "", "modem", "scan_cell_tower", { bus = cfg.bus, slot = slot } } })
  local resp, err = http.post(M.rpc_url(), body,
    { headers = { glinet = 1, ["Content-Type"] = "application/json" }, timeout = 330 })
  if not resp then return { error = "scan failed: " .. tostring(err) } end
  if resp.code ~= 200 then return { error = "scan failed: http " .. tostring(resp.code) } end
  local ok, obj = pcall(cjson.decode, resp.body or "")
  if not ok or type(obj) ~= "table" then return { error = "scan failed: bad reply" } end
  if type(obj.error) == "table" then
    -- glc's error code (e.g. 20002044), as the plugin always reported it
    return { error = "scan failed: " .. tostring(obj.error.code or obj.error.message) }
  end
  local res = obj.result
  if type(res) ~= "table" then return { error = "scan failed: no result" } end
  if event then event("user", "Cell scan", "") end
  return { towers = type(res.towers) == "table" and res.towers or {}, ts = os.time() * 1000, slot = slot }
end

-- The plugin's append_event, for events the daemon now owns: one line in events.jsonl (others
-- append to it too, one O_APPEND write each) and a push for the Tracking timeline.
function M.event_writer(conn, path)
  return function(kind, label, detail)
    local ev = { t = os.time() * 1000, kind = kind, label = label, detail = detail or "" }
    local f = io.open(path, "a")
    if not f then                        -- nothing has created the history dir yet (collector off)
      os.execute("mkdir -p '" .. (path:match("^(.*)/[^/]*$") or "."):gsub("'", "'\\''") .. "'")
      f = io.open(path, "a")
    end
    if f then f:write(cjson.encode(ev), "\n"); f:close() end
    conn:call("gl-session", "notify", { name = "mudimodem.event", data = ev })
  end
end

return M
