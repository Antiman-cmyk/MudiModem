-- MudiModem RPC backend: the speed test: run, status, history, schedule, settings.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, arr, nullish, nn, ucall, daemon_error = C.cjson, C.arr, C.nullish, C.nn, C.ucall, C.daemon_error

-- ============================ Speedtest ============================
-- On-demand (+ optional scheduled) download/upload/latency test. The test and its schedule run in
-- mudimodemd (src/lib/mudimodemd/speedtest.lua): a test takes 10-30 s, too long for a
-- single $rpcRequest, so run_speedtest starts it and the page polls the status file. Results
-- persist in /etc/mudimodem (NOT /tmp, unlike the RF-history telemetry) so they survive a reboot.
local SPEEDTEST_HIST     = os.getenv("MUDIMODEM_SPEEDTEST_HIST")     or "/etc/mudimodem/speedtests.jsonl"
local SPEEDTEST_STATUS   = os.getenv("MUDIMODEM_SPEEDTEST_STATUS")   or "/tmp/mudimodem/speedtest-status.json"
local SPEEDTEST_SCHEDULE = os.getenv("MUDIMODEM_ST_SCHEDULE")        or "/etc/mudimodem/speedtest-schedule.json"

-- Allowed schedule cadences (seconds) -- the UI's fixed dropdown (30m/1h/2h/
-- 6h/12h/24h); set_speedtest_schedule refuses anything else.
local SCHEDULE_SECONDS = { [1800] = true, [3600] = true, [7200] = true,
                           [21600] = true, [43200] = true, [86400] = true }

-- Resolve an outbound interface ("cellular"|"wired") to its LIVE Linux device
-- via ubus network.interface dump -- NEVER hardcoded. This box's own eth0 is
-- bridged into LAN rather than acting as WAN, and the cellular device index
-- has been observed to change (rmnet_data0 <-> rmnet_data1) after a modem
-- reconnect, so resolving fresh every call is the only correct approach.
-- Returns { device = <string|nil>, up = <bool> }.
local function resolve_iface(which)
  local dump = ucall("network.interface", "dump", {})
  local ifaces = (dump and dump.interface) or {}
  local function pick(dev)
    if nullish(dev) then return nil end
    return dev
  end
  if which == "cellular" then
    for _, i in ipairs(ifaces) do
      local name = tostring(i.interface or "")
      if i.proto == "rmnet" and not name:match("_6$") then
        local dev = pick(i.l3_device) or pick(i.device)
        return { device = dev, up = (i.up == true) and dev ~= nil }
      end
    end
  elseif which == "wired" then
    for _, i in ipairs(ifaces) do
      if i.interface == "wan" then
        local dev = pick(i.l3_device) or pick(i.device)
        return { device = dev, up = (i.up == true) and dev ~= nil }
      end
    end
  end
  return { device = nil, up = false }
end

function M.get_speedtest_interfaces(args)
  return { cellular = resolve_iface("cellular"), wired = resolve_iface("wired") }
end

local function read_json_file(path, default)
  local f = io.open(path, "r")
  if not f then return default end
  local raw = f:read("*a")
  f:close()
  local ok, obj = pcall(cjson.decode, raw)   -- cjson.decode can't yield; pcall is safe here
  if not ok or type(obj) ~= "table" then return default end
  return obj
end

local function write_json_file(path, obj)
  local dir = path:match("(.*/)")
  if dir then os.execute("mkdir -p " .. dir .. " 2>/dev/null") end
  local f = io.open(path, "w")
  if not f then return false end
  f:write(cjson.encode(obj))
  f:close()
  return true
end

-- A status that still says `running` while no test is: the tool was killed
-- (scheduler timeout, OOM), crashed, or never started. Left alone it disables
-- Run until the next scheduled test or a reboot. The tool stamps every running
-- status with its pid + start time; trust it only while /proc shows that pid
-- is still our tool (a cmdline check, so a recycled pid can't pass; /proc is
-- readable whatever the worker's uid, unlike kill -0). Before the tool's own
-- first write (our "starting" stub, no pid) allow a short grace.
local PROC                  = os.getenv("MUDIMODEM_PROC") or "/proc"
local SPEEDTEST_START_GRACE = 60    -- s for the spawned tool to write its pid
local SPEEDTEST_MAX_RUN     = 900   -- s; a real run is ~3 min at worst

local function speedtest_alive(pid)
  pid = tonumber(nn(pid))
  if not pid or pid < 2 or pid ~= math.floor(pid) then return false end
  local f = io.open(PROC .. "/" .. string.format("%d", pid) .. "/cmdline", "r")
  if not f then return false end
  local cmd = f:read("*a") or ""
  f:close()
  -- the run's pid is mudimodemd's (a test before 3.0: the python tool's)
  return cmd:find("mudimodemd", 1, true) ~= nil or cmd:find("mudimodem-speedtest", 1, true) ~= nil
end

local function speedtest_status()
  local st = read_json_file(SPEEDTEST_STATUS, nil)
  if type(st) ~= "table" or st.running ~= true then return st end
  local started = tonumber(nn(st.started))
  local age = started and (os.time() - started) or nil
  local dead
  if nn(st.pid) ~= nil then dead = not speedtest_alive(st.pid)
  else dead = (age == nil) or (age > SPEEDTEST_START_GRACE) end
  if not dead and age and age > SPEEDTEST_MAX_RUN then dead = true end
  if dead then
    local why = "the previous speed test stopped without finishing"
    st = { running = false, phase = "error", iface = st.iface, error = why, message = why }
    write_json_file(SPEEDTEST_STATUS, st)
  end
  return st
end

function M.run_speedtest(args)
  local iface = (args and args.iface) or "cellular"
  if iface ~= "cellular" and iface ~= "wired" then
    return { error = "iface must be 'cellular' or 'wired'" }
  end
  local info = resolve_iface(iface)
  if not info.up or not info.device then
    return { error = "iface_down", iface = iface }
  end

  local st = speedtest_status()
  if st and st.running then return { running = true } end

  -- The test runs in mudimodemd (speedtest.lua), which writes the status the page polls (its
  -- first write lands before this call returns). Not waited on: a test takes 10-60 s.
  local r, err = ucall("mudimodem", "job_start", { kind = "speedtest", args = { iface = iface, trigger = "manual" } })
  if type(r) ~= "table" then return { error = daemon_error(err) } end
  if r.error then return { error = r.error } end
  if r.joined then return { running = true } end
  return { started = true }
end

function M.get_speedtest_status(args)
  return speedtest_status() or { running = false }
end

function M.get_speedtest_history(args)
  local since = args and tonumber(args.since) or nil
  local iface = args and args.iface or nil
  local limit = args and tonumber(args.limit) or nil
  local out = {}
  local fh = io.open(SPEEDTEST_HIST, "r")
  if fh then
    for line in fh:lines() do
      if #line > 1 then
        local ok, obj = pcall(cjson.decode, line)
        if ok and type(obj) == "table" and obj.t then
          if (not since or obj.t > since) and (not iface or obj.iface == iface) then
            out[#out + 1] = obj
          end
        end
      end
    end
    fh:close()
  end
  if limit and #out > limit then
    local trimmed = {}
    for i = #out - limit + 1, #out do trimmed[#trimmed + 1] = out[i] end
    out = trimmed
  end
  return { results = arr(out) }
end

function M.clear_speedtest_history(args)
  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local f = io.open(SPEEDTEST_HIST, "w")
  if f then f:close() end
  return { ok = true }
end

function M.get_speedtest_schedule(args)
  return read_json_file(SPEEDTEST_SCHEDULE, { enabled = false, interval_seconds = 21600, last_run = 0 })
end

function M.set_speedtest_schedule(args)
  local enabled = (args and args.enabled) and true or false
  local interval = tonumber(args and args.interval_seconds)
  if not interval or not SCHEDULE_SECONDS[interval] then
    return { error = "interval_seconds must be one of 1800/3600/7200/21600/43200/86400" }
  end
  local cur = M.get_speedtest_schedule({})
  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local f = io.open(SPEEDTEST_SCHEDULE, "w")
  if not f then return { error = "cannot write schedule config" } end
  f:write(cjson.encode({ enabled = enabled, interval_seconds = interval, last_run = cur.last_run or 0 }))
  f:close()
  return { ok = true, enabled = enabled, interval_seconds = interval }
end

-- Test size and server (speedtest.lua reads the same file at each run; scheduled runs too).
--   profile  quick (2 streams, ~30 MB at most) | full (4 streams, ~290 MB at most)
--   server   cloudflare | librespeed, with librespeed_url = the backend folder
--            (<url>garbage.php, <url>empty.php), http(s), charset-checked here and in the daemon
local SPEEDTEST_SETTINGS = os.getenv("MUDIMODEM_ST_SETTINGS") or "/etc/mudimodem/speedtest.json"
local ST_URL_OK = "^https?://[%w%.%-_:/]+/$"

function M.get_speedtest_settings(args)
  local c = read_json_file(SPEEDTEST_SETTINGS, {})
  return { profile = c.profile == "full" and "full" or "quick",
           server = c.server == "librespeed" and "librespeed" or "cloudflare",
           librespeed_url = type(c.librespeed_url) == "string" and c.librespeed_url or "" }
end

function M.set_speedtest_settings(args)
  args = args or {}
  local profile, server = args.profile or "quick", args.server or "cloudflare"
  if profile ~= "quick" and profile ~= "full" then return { error = "profile must be 'quick' or 'full'" } end
  if server ~= "cloudflare" and server ~= "librespeed" then
    return { error = "server must be 'cloudflare' or 'librespeed'" }
  end
  local url = args.librespeed_url
  if url == "" then url = nil end
  if url ~= nil then
    if type(url) ~= "string" or #url > 200 then return { error = "bad LibreSpeed URL" } end
    if url:sub(-1) ~= "/" then url = url .. "/" end
    if not url:match(ST_URL_OK) then
      return { error = "the LibreSpeed URL must look like https://host/backend/" }
    end
  end
  if server == "librespeed" and not url then return { error = "a LibreSpeed server needs its URL" } end
  local f = io.open(SPEEDTEST_SETTINGS, "w")         -- the installer owns /etc/mudimodem: no fork
  if not f then
    os.execute("mkdir -p '" .. (SPEEDTEST_SETTINGS:match("^(.*)/") or ".") .. "' 2>/dev/null")
    f = io.open(SPEEDTEST_SETTINGS, "w")
  end
  if not f then return { error = "cannot write speed test settings" } end
  f:write(cjson.encode({ profile = profile, server = server, librespeed_url = url }))
  f:close()
  return { ok = true, profile = profile, server = server, librespeed_url = url or "" }
end

end
