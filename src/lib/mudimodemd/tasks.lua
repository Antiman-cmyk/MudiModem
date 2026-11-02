-- mudimodemd/tasks.lua — what the daemon's jobs do (eco): the slow I/O the nginx plugin used to
-- do inline, holding GL's ONE nginx worker (curl up to 8 s, a GitHub fetch for the library). The
-- plugin keeps the policy (which URL, how to present the answer); these only do the waiting.
--
--   version_fetch {url}  curl the remote version.json        -> { version } | { error }
--   library {mode}       the community AT library, check|refresh (below)
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

-- ---- the community AT library (a port of tools/mudimodem-lib, retired with python3) ------------
-- check   -> { local_revision, remote_revision, update_available, checked, error? }
-- refresh -> { ok, revision, count } | { ok = false, error }
-- The cache is what nginx serves gzip_static at /mudimodem/at-library.json. The fetched body is
-- cached VERBATIM once it passes the sanity check: re-encoding it through cjson would turn every
-- empty [] into {} (the console iterates them).
local LIB_DEFAULT_URL = "https://raw.githubusercontent.com/kevinherzig/mudi7-at-library/main/dist"
local LIB_MAX_BYTES = 1048576

local function shq(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end

function M.lib_base_url()
  local env = os.getenv("MUDIMODEM_LIB_URL")
  if env and env ~= "" then return (env:gsub("/+$", "")) end
  local f = io.open("/etc/mudimodem/library-url", "r")
  local u = f and f:read("*a") or ""
  if f then f:close() end
  u = u:match("^%s*(.-)%s*$")
  if u ~= "" then return (u:gsub("/+$", "")) end
  return LIB_DEFAULT_URL
end

local function lib_cache()
  return os.getenv("MUDIMODEM_CACHE") or "/usr/share/mudimodem/www/mudimodem/at-library.json.gz"
end

-- body | nil, error
local function fetch(cfg, url, max_time)
  local p, err = sys.exec(cfg.curl, "-fsS", "--max-time", tostring(max_time), url)
  if not p then return nil, "cannot run curl: " .. tostring(err) end
  local out = p:read_stdout("*a", max_time + 5)
  local errtext = p:read_stderr("*a", 1) or ""
  p:close()
  if out == nil then return nil, "curl did not finish" end
  if out == "" then
    errtext = errtext:match("^%s*(.-)%s*$")
    return nil, errtext ~= "" and errtext or "no response"
  end
  if #out > LIB_MAX_BYTES then return nil, "response too large" end
  return out
end

local function local_revision()
  local cache = lib_cache()
  if not exists(cache) then return "unknown" end
  local body = run({ "gzip", "-dc", cache }, 10)
  local ok, obj = pcall(cjson.decode, body or "")
  if ok and type(obj) == "table" and type(obj.revision) == "string" then return obj.revision end
  return "unknown"                         -- best effort: a status line, never a failed check
end

local function is_e5800()
  if os.getenv("MUDIMODEM_SKIP_MODEL_GUARD") == "1" then return true end
  local f = io.open("/proc/device-tree/model", "r")
  local m = f and f:read("*a") or ""
  if f then f:close() end
  return m:find("E5800", 1, true) ~= nil
end

local function lib_check(cfg)
  local out = { local_revision = local_revision(), remote_revision = cjson.null,
                update_available = false, checked = false }
  local body, err = fetch(cfg, M.lib_base_url() .. "/version.json", 8)
  if not body then out.error = err; return out end
  local ok, obj = pcall(cjson.decode, body)
  local remote = ok and type(obj) == "table" and obj.revision
  if type(remote) ~= "string" or remote == "" then out.error = "remote version.json malformed"; return out end
  out.remote_revision, out.checked = remote, true
  out.update_available = remote ~= out.local_revision
  return out
end

local function lib_refresh(cfg)
  if not is_e5800() then return { ok = false, error = "refusing: not a GL-E5800" } end
  local body, err = fetch(cfg, M.lib_base_url() .. "/at-library.json", 20)
  if not body then return { ok = false, error = "fetch failed: " .. tostring(err) } end
  local ok, data = pcall(cjson.decode, body)
  if not (ok and type(data) == "table" and type(data.entries) == "table" and #data.entries > 0
          and data.revision and data.revision ~= cjson.null and data.revision ~= ""
          and data.version ~= nil and data.version ~= cjson.null) then
    return { ok = false, error = "fetched library failed sanity check" }
  end
  local cache = lib_cache()
  local dir = cache:match("^(.*)/[^/]*$") or "."
  local tmp, tgz = cache .. ".json.tmp", cache .. ".gz.tmp"
  os.execute("mkdir -p " .. shq(dir))
  local f = io.open(tmp, "w")
  if not f then return { ok = false, error = "write failed: cannot write " .. tmp } end
  f:write(body); f:close()
  local gout = run({ "/bin/sh", "-c", "gzip -9 -c < " .. shq(tmp) .. " > " .. shq(tgz) .. " && chmod 0644 "
                                       .. shq(tgz) .. " && echo ok" }, 30)
  os.remove(tmp)
  if not (gout and gout:find("ok", 1, true)) then os.remove(tgz); return { ok = false, error = "write failed: gzip" } end
  if not os.rename(tgz, cache) then os.remove(tgz); return { ok = false, error = "write failed: rename" } end
  return { ok = true, revision = tostring(data.revision), count = #data.entries }
end

function M.library(mode, cfg)
  if mode == "check" then return lib_check(cfg) end
  if mode == "refresh" then return lib_refresh(cfg) end
  return { error = "bad library mode" }
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
-- `extra` adds fields (never t/kind/label/detail): t is always now, so the file stays in time order
-- (the plugin's read_window stops at the first line older than the window).
function M.event_writer(conn, path)
  return function(kind, label, detail, extra)
    local ev = { t = os.time() * 1000, kind = kind, label = label, detail = detail or "" }
    for k, v in pairs(extra or {}) do if ev[k] == nil then ev[k] = v end end
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
