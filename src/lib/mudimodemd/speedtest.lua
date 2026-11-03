-- mudimodemd/speedtest.lua — the speed test and its schedule (eco). A port of
-- tools/mudimodem-speedtest.py + src/sbin/mudimodem-speedtestd (python3, retired with R3 ⑤);
-- test/speedtest-emu.test.py runs it against a fake speed server on the emulated GL bus.
--
-- One test: download / upload / latency over the chosen interface (resolved live from
-- `network.interface dump`, never hard-coded — the cellular device has moved between
-- rmnet_data0 and rmnet_data1 after a reconnect), with the signal snapshot taken from the
-- collector's fresh latest.json (a test adds no AT traffic of its own), else one cell_info read.
--
-- Accuracy (audit 4.7): a single fixed-size transfer finishes inside TCP slow start on a fast 5G
-- link and reads low. So each direction runs several curl streams at once, each bounded by time
-- (-m) and by a byte cap (the data a test may cost), and the rate is the interface's own byte
-- counter (/sys/class/net/<dev>/statistics) over the window from the end of a warm-up to the
-- moment the first stream finishes — all streams running, slow start excluded. It counts every
-- byte on that interface during the window (other clients' traffic too); when the window is too
-- short (a cap reached during warm-up) or the counters are unreadable, the curl totals are used
-- (`measure_down` / `measure_up` say which). Latency is the time from request sent to first byte
-- (starttransfer - pretransfer): one round trip plus the server, without DNS/TCP/TLS setup.
-- Uploads stream from /dev/urandom on curl's stdin (nothing in RAM).
--
-- Profiles (settings file, the Speedtest tab): quick (the default; ~30 MB at most) and full
-- (~290 MB at most). Servers: Cloudflare (default) or a LibreSpeed backend URL
-- (`<url>garbage.php?ckSize=<MiB>`, `<url>empty.php`), for regions where Cloudflare is poor.
--
-- The status file the plugin and page read (MUDIMODEM_ST_STATUS) keeps its contract: every write
-- names the run (`pid` — now the daemon's — and `started`), and a run always ends on a terminal
-- write (running:false, phase done|error). One test at a time: manual and scheduled runs share
-- the daemon's single-flight job "speedtest" (it replaced the python tool's flock).
local time = require "eco.time"
local sys = require "eco.sys"
local cjson = require "cjson"
local cc = require "cellular_compat"
local jsonl = require "mudimodemd.jsonl"
local net = require "mudimodemd.net"
local sync = require "eco.sync"

local M = {}

local function envnum(k, d) return tonumber(os.getenv(k) or "") or d end

-- streams per direction, seconds per direction, warm-up seconds, byte cap per stream. Up is far
-- smaller than down: cellular uplinks are asymmetric (and data costs). Keep the page's
-- PROFILE_MB (tabs/speedtest.js) in step with the caps.
M.PROFILES = {
  quick = { streams = 2, down_s = 5, up_s = 4, warm_s = 1.5, down_cap = 12000000, up_cap = 2500000 },
  full = { streams = 4, down_s = 10, up_s = 8, warm_s = 2.5, down_cap = 60000000, up_cap = 12000000 },
}
M.URL_OK = "^https?://[%w%.%-_:/]+/$"     -- a LibreSpeed backend folder (the plugin checks it too)

function M.config()
  return {
    bus = os.getenv("MUDIMODEM_BUS") or "cpu",
    curl = os.getenv("MUDIMODEM_CURL") or "curl",
    down_url = os.getenv("MUDIMODEM_ST_DOWN_URL") or "https://speed.cloudflare.com/__down",
    up_url = os.getenv("MUDIMODEM_ST_UP_URL") or "https://speed.cloudflare.com/__up",
    -- per-stream byte caps / durations override the profile's (the tests shrink them)
    down_bytes = envnum("MUDIMODEM_ST_DOWN_BYTES", nil),
    up_bytes = envnum("MUDIMODEM_ST_UP_BYTES", nil),
    time_scale = envnum("MUDIMODEM_ST_TIME_SCALE", 1),     -- multiplies the profile's seconds
    latency_n = envnum("MUDIMODEM_ST_LATENCY_N", 5),
    timeout = envnum("MUDIMODEM_ST_TIMEOUT", 20),          -- a latency probe's -m
    net_sysfs = os.getenv("MUDIMODEM_NET_SYSFS") or "/sys/class/net",
    settings = os.getenv("MUDIMODEM_ST_SETTINGS") or "/etc/mudimodem/speedtest.json",
    hist = os.getenv("MUDIMODEM_ST_HIST") or "/etc/mudimodem/speedtests.jsonl",
    status = os.getenv("MUDIMODEM_ST_STATUS") or "/tmp/mudimodem/speedtest-status.json",
    schedule = os.getenv("MUDIMODEM_ST_SCHEDULE") or "/etc/mudimodem/speedtest-schedule.json",
    latest = os.getenv("MUDIMODEM_LATEST") or "/tmp/mudimodem/latest.json",
    latest_max_age = envnum("MUDIMODEM_LATEST_MAX_AGE", 30),
    wake = envnum("MUDIMODEM_SPEEDTESTD_WAKE", 60),
    hist_max_lines = 500,
  }
end

local function shq(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end

local function readjson(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a"); f:close()
  local ok, v = pcall(cjson.decode, s or "")
  return ok and v or nil
end

local function mkdir_for(path)
  local d = path:match("^(.*)/[^/]*$")
  if d and d ~= "" then os.execute("mkdir -p " .. shq(d)) end
end

local function write_json(path, obj)
  mkdir_for(path)
  return jsonl.write_atomic(path, cjson.encode(obj))
end

-- bytes/s -> Mbps, one decimal
function M.mbps(bps)
  if type(bps) ~= "number" then return nil end
  return math.floor(bps * 8 / 1e6 * 10 + 0.5) / 10
end

M.resolve_iface = net.resolve_iface          -- (device, up) from network.interface dump

-- median + (max - min) of the probes that answered, in ms; nil, nil when none did
function M.latency_stats(samples)
  local v = {}
  for _, s in ipairs(samples) do if type(s) == "number" then v[#v + 1] = s end end
  if #v == 0 then return nil, nil end
  table.sort(v)
  local mid = math.floor(#v / 2) + 1
  local median = (#v % 2 == 1) and v[mid] or (v[mid - 1] + v[mid]) / 2
  return math.floor(median * 1000 + 0.5), math.floor((v[#v] - v[1]) * 1000 + 0.5)
end

local SNAP_KEYS = { "slot", "carrier", "band", "mode", "pcc_rat", "cell_id", "rsrp", "sinr", "rsrq", "pci",
                    "tx_channel", "signals" }

-- One collector sample -> the snapshot a result carries.
function M.snapshot_from_sample(s)
  if type(s) ~= "table" or s.slot == nil or s.slot == cjson.null then return {} end
  local out = {}
  for _, k in ipairs(SNAP_KEYS) do if s[k] ~= nil then out[k] = s[k] end end
  local cid = s.cell_id
  if cid == nil then cid = s.id end
  out.cell_id = cid
  -- an empty list decodes to {}; the history line must still say [] (as the python tool wrote)
  if type(out.signals) == "table" and next(out.signals) == nil then out.signals = cjson.empty_array end
  return out
end

function M.new(conn, cfg, log)
  cfg = cfg or M.config()
  log = log or function() end
  local self = { stats = { speedtests = 0 } }

  local function call(obj, method, args)
    local r = conn:call(obj, method, args or {})
    return type(r) == "table" and r or nil
  end

  -- The collector's fresh latest.json (zero modem traffic), else one cell_info read; {} when
  -- neither gives a sample (a failed read is no snapshot, never a fake "no service" one).
  local function load_snapshot()
    local latest = readjson(cfg.latest)
    if type(latest) == "table" and type(latest.t) == "number" and os.time() - latest.t / 1000 <= cfg.latest_max_age then
      return M.snapshot_from_sample(latest)
    end
    local modem = call("cellular.modem", "status")
    local slot = cc.active_slot(modem, cfg.bus)
    if not slot or slot < 1 then return {} end
    local cell = call("cellular.network", "cell_info", { bus = cfg.bus, slot = slot })
    if cc.cell_info_failed(cell) then return {} end
    return M.snapshot_from_sample(cc.build_sample(modem, cell, call("cellular.network", "info"), nil, cfg.bus))
  end

  -- curl ... -w %{json}, body discarded -> the parsed trailer, or nil. `pipe` feeds stdin. A
  -- transfer cut by -m still prints its trailer (curl exit 28): that is a timed stream ending,
  -- not a failure; a stream that never got a 2xx is.
  local function curl_cmd(args, max_s, pipe)
    local cmd = shq(cfg.curl) .. " -s -m " .. tostring(max_s) .. " -o /dev/null -w '%{json}'"
    for _, a in ipairs(args) do cmd = cmd .. " " .. shq(a) end
    if pipe then cmd = pipe .. " | " .. cmd end
    return cmd
  end
  local function trailer(out)
    local ok, r = pcall(cjson.decode, out or "")
    if not ok or type(r) ~= "table" then return nil end
    local code = tonumber(r.http_code) or 0
    if code < 200 or code >= 300 then return nil end
    return r
  end
  local function probe(args, pipe)
    local p = sys.exec("/bin/sh", "-c", curl_cmd(args, cfg.timeout, pipe))
    if not p then return nil end
    local out = p:read_stdout("*a", cfg.timeout + 5)
    if out == nil then sys.kill(p:pid(), sys.SIGKILL) end
    p:close()
    return trailer(out)
  end

  -- `n` streams of one direction at once. -> { mbps, bytes, measure } | nil (no stream got through)
  --   cmds[i]   the shell command of stream i (curl_cmd)
  --   counter() the interface's byte counter for this direction, or nil
  --   key       "download" | "upload" (curl's size_/speed_ suffix)
  local function streams(cmds, dur, warm, counter, key)
    local wg = sync.waitgroup()
    local res, first = {}, nil
    for i, cmd in ipairs(cmds) do
      local p = sys.exec("/bin/sh", "-c", cmd)
      if p then
        wg:add(1)
        eco.run(function()
          local out = p:read_stdout("*a", dur + 10)
          if out == nil then sys.kill(p:pid(), sys.SIGKILL) end
          p:close()
          res[i] = trailer(out)
          -- the window ends when the first GOOD stream ends (one that failed at once never ran)
          if res[i] and not first then first = { t = time.now(), b = counter() } end
          wg:done()
        end)
      end
    end
    local mark
    if wg:wait(warm) ~= true and not first then mark = { t = time.now(), b = counter() } end
    wg:wait(dur + 15)
    local got, total, longest = 0, 0, 0
    for i = 1, #cmds do
      local r = res[i]
      if r then
        got = got + 1
        total = total + (tonumber(r["size_" .. key]) or 0)
        longest = math.max(longest, tonumber(r.time_total) or 0)
      end
    end
    if got == 0 then return nil end
    local used = total                                     -- our streams' payload, not the link's
    if mark and mark.b and first and first.b and first.t - mark.t >= 1 and first.b >= mark.b then
      return { mbps = M.mbps((first.b - mark.b) / (first.t - mark.t)), bytes = used, measure = "interface" }
    end
    if longest <= 0 then return nil end
    return { mbps = M.mbps(total / longest), bytes = used, measure = "curl" }
  end

  -- {profile, server, librespeed_url} from the settings file (the Speedtest tab writes it)
  function self.read_settings()
    local c = readjson(cfg.settings)
    local out = { profile = "quick", server = "cloudflare" }
    if type(c) == "table" then
      if M.PROFILES[c.profile] then out.profile = c.profile end
      if c.server == "librespeed" and type(c.librespeed_url) == "string" and c.librespeed_url:match(M.URL_OK) then
        out.server, out.librespeed_url = "librespeed", c.librespeed_url
      end
    end
    return out
  end

  -- The endpoints for one test: down(bytes) -> URL, up URL, ping URL.
  local function endpoints(st)
    if st.server == "librespeed" then
      local b = st.librespeed_url
      return { down = function(n) return b .. "garbage.php?ckSize=" .. math.max(1, math.ceil(n / 1048576)) end,
               up = b .. "empty.php", ping = b .. "empty.php" }
    end
    return { down = function(n) return cfg.down_url .. "?bytes=" .. math.floor(n) end,
             up = cfg.up_url, ping = cfg.down_url .. "?bytes=0" }
  end

  local function trim_history()
    local f = io.open(cfg.hist, "r")
    if not f then return end
    local lines = {}
    for l in f:lines() do if l:find("%S") then lines[#lines + 1] = l end end
    f:close()
    if #lines <= cfg.hist_max_lines then return end
    local kept = {}
    for i = #lines - cfg.hist_max_lines + 1, #lines do kept[#kept + 1] = lines[i] end
    jsonl.write_atomic(cfg.hist, table.concat(kept, "\n") .. "\n")
  end

  -- One test, start to terminal status. args = { iface = "cellular"|"wired", trigger }
  function self.run(args)
    local iface = args.iface == "wired" and "wired" or "cellular"
    local trigger = (args.trigger == "schedule") and "schedule" or "manual"
    local run = { pid = sys.getpid(), started = os.time(), iface = iface }
    local function status(fields)
      local o = {}
      for k, v in pairs(run) do o[k] = v end
      for k, v in pairs(fields) do o[k] = v end
      write_json(cfg.status, o)
    end
    local function fail(msg)
      status({ running = false, phase = "error", message = msg, error = msg })
      return { error = msg }
    end
    self.stats.speedtests = self.stats.speedtests + 1

    local ok, res = pcall(function()
      status({ running = true, phase = "starting" })
      local device, up = M.resolve_iface(call("network.interface", "dump"), iface)
      if not up or not device then return fail(iface .. " is not connected") end
      -- the radio snapshot describes the CELLULAR link; a wired result carries none
      local snapshot = iface == "cellular" and load_snapshot() or {}
      if iface == "cellular" then
        -- the carrier's max bit rate (AMBR, Mbps) for this SIM: a result at the cap is the plan,
        -- not the radio. GL's sim STATUS carries it, not sim info (🟢 run: GL's cellular_manager
        -- under mudi-emu answers ambr_* in `cellular.sim status` only; libcm_sim.so fill_ubus_sim_status)
        local slot = tonumber(snapshot.slot) or cc.active_slot(call("cellular.modem", "status"), cfg.bus)
        local sims = call("cellular.sim", "status")
        for _, s in ipairs(sims and type(sims.sims) == "table" and sims.sims or {}) do
          if type(s) == "table" and slot and tonumber(s.slot) == slot and (s.bus == nil or s.bus == cjson.null or s.bus == cfg.bus) then
            local dl, ul = tonumber(s.ambr_dl), tonumber(s.ambr_ul)
            if dl and dl > 0 then snapshot.ambr_dl = dl end
            if ul and ul > 0 then snapshot.ambr_ul = ul end
          end
        end
      end

      local set = self.read_settings()
      local pf = M.PROFILES[set.profile]
      local ep = endpoints(set)
      local sc = cfg.time_scale
      local down_cap, up_cap = cfg.down_bytes or pf.down_cap, cfg.up_bytes or pf.up_cap
      local function counter(which)
        return function()
          local rx, tx = net.counters(cfg.net_sysfs, device)
          if which == "rx" then return rx end
          return tx
        end
      end

      status({ running = true, phase = "latency", profile = set.profile, server = set.server })
      local samples = {}
      for _ = 1, cfg.latency_n do
        local r = probe({ "--interface", device, ep.ping })
        local st, pre = r and tonumber(r.time_starttransfer), r and tonumber(r.time_pretransfer)
        if st then samples[#samples + 1] = math.max(0, st - (pre or 0)) end
      end
      local lat, jit = M.latency_stats(samples)
      if not lat then return fail("latency probe failed") end

      status({ running = true, phase = "download", profile = set.profile, server = set.server })
      local cmds = {}
      for i = 1, pf.streams do
        cmds[i] = curl_cmd({ "--interface", device, ep.down(down_cap) }, pf.down_s * sc)
      end
      local d = streams(cmds, pf.down_s * sc, pf.warm_s * sc, counter("rx"), "download")
      if not d then return fail("download failed") end

      status({ running = true, phase = "upload", profile = set.profile, server = set.server })
      cmds = {}
      for i = 1, pf.streams do
        cmds[i] = curl_cmd({ "--interface", device, "--data-binary", "@-", ep.up }, pf.up_s * sc,
                           "head -c " .. math.floor(up_cap) .. " /dev/urandom")
      end
      local u = streams(cmds, pf.up_s * sc, pf.warm_s * sc, counter("tx"), "upload")
      if not u then return fail("upload failed") end

      local result = { t = math.floor(time.now() * 1000), trigger = trigger, iface = iface,
                       down_mbps = d.mbps, up_mbps = u.mbps, latency_ms = lat, jitter_ms = jit,
                       profile = set.profile, streams = pf.streams, server = set.server,
                       measure_down = d.measure, measure_up = u.measure,
                       data_mb = math.floor((d.bytes + u.bytes) / 100000 + 0.5) / 10 }
      for k, v in pairs(snapshot) do result[k] = v end
      mkdir_for(cfg.hist)
      jsonl.append_line(cfg.hist, cjson.encode(result))
      trim_history()
      status({ running = false, phase = "done", result = result })
      return result
    end)
    if not ok then
      log("speedtest: " .. tostring(res))
      return fail("speed test failed: " .. tostring(res))
    end
    return res
  end

  -- ---- the schedule: {enabled, interval_seconds, last_run (epoch ms)}, re-read every wake --------
  local DEFAULT = { enabled = false, interval_seconds = 6 * 3600, last_run = 0 }
  function self.read_schedule()
    local c = readjson(cfg.schedule)
    local out = { enabled = DEFAULT.enabled, interval_seconds = DEFAULT.interval_seconds, last_run = DEFAULT.last_run }
    if type(c) == "table" then
      for k in pairs(DEFAULT) do if c[k] ~= nil and c[k] ~= cjson.null then out[k] = c[k] end end
    end
    return out
  end

  function self.is_due(c, now_ms)
    if c.enabled ~= true then return false end
    local iv = (tonumber(c.interval_seconds) or 0) * 1000
    if iv <= 0 then return false end
    return now_ms - (tonumber(c.last_run) or 0) >= iv
  end

  -- Only last_run changes: an edit made in the UI while a test ran must survive this write.
  local function write_last_run(now_ms)
    local c = self.read_schedule()
    c.last_run = now_ms
    write_json(cfg.schedule, c)
  end

  -- `start(args)` / `wait(id)` are the daemon's job API (single-flight "speedtest"). Every
  -- attempt is recorded as attempted, whatever its outcome — a failing run must not retry on
  -- the very next wake and burn cellular data in a loop.
  function self.scheduler(start, wait)
    eco.run(function()
      while true do
        local ok, err = pcall(function()
          if self.is_due(self.read_schedule(), math.floor(time.now() * 1000)) then
            local j = start({ iface = "cellular", trigger = "schedule" })
            if j and j.id and not j.joined then
              repeat local r = wait(j.id, 25) until not (r and r.pending)
            end
            write_last_run(math.floor(time.now() * 1000))
          end
        end)
        if not ok then log("speedtest schedule: " .. tostring(err)) end
        time.sleep(cfg.wake)
      end
    end)
  end

  return self
end

return M
