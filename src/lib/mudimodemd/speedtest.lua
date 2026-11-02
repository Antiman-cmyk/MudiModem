-- mudimodemd/speedtest.lua — the speed test and its schedule (eco). A port of
-- tools/mudimodem-speedtest.py + src/sbin/mudimodem-speedtestd (python3, retired with R3 ⑤);
-- test/speedtest-emu.test.py runs it against a fake speed server on the emulated GL bus.
--
-- One test: curl download / upload / latency over the chosen interface (resolved live from
-- `network.interface dump`, never hard-coded — the cellular device has moved between
-- rmnet_data0 and rmnet_data1 after a reconnect), with the signal snapshot taken from the
-- collector's fresh latest.json (a test adds no AT traffic of its own), else one cell_info read.
-- Every transfer is bounded by curl's -m; the upload streams from /dev/urandom on curl's stdin
-- (a killed run used to leak its temp file in RAM).
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

local M = {}

local function envnum(k, d) return tonumber(os.getenv(k) or "") or d end

function M.config()
  return {
    bus = os.getenv("MUDIMODEM_BUS") or "cpu",
    curl = os.getenv("MUDIMODEM_CURL") or "curl",
    down_url = os.getenv("MUDIMODEM_ST_DOWN_URL") or "https://speed.cloudflare.com/__down",
    up_url = os.getenv("MUDIMODEM_ST_UP_URL") or "https://speed.cloudflare.com/__up",
    down_bytes = envnum("MUDIMODEM_ST_DOWN_BYTES", 20 * 1024 * 1024),
    -- much smaller than down: cellular uplinks are asymmetric, and 8 MiB once exceeded the
    -- 20 s transfer bound on a real, working, slow link (observed live 2026-07-21)
    up_bytes = envnum("MUDIMODEM_ST_UP_BYTES", 2 * 1024 * 1024),
    latency_n = envnum("MUDIMODEM_ST_LATENCY_N", 5),
    timeout = envnum("MUDIMODEM_ST_TIMEOUT", 20),          -- per curl transfer (-m)
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

-- The live device of 'cellular' (the non-_6 rmnet interface) or 'wired' (wan): (device, up).
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

  -- curl ... -w %{json}, body discarded -> the parsed trailer, or nil. `pipe` feeds stdin.
  local function probe(args, pipe)
    local cmd = shq(cfg.curl) .. " -s -m " .. tostring(cfg.timeout) .. " -o /dev/null -w '%{json}'"
    for _, a in ipairs(args) do cmd = cmd .. " " .. shq(a) end
    if pipe then cmd = pipe .. " | " .. cmd end
    local p = sys.exec("/bin/sh", "-c", cmd)
    if not p then return nil end
    local out = p:read_stdout("*a", cfg.timeout + 5)
    if out == nil then sys.kill(p:pid(), sys.SIGKILL) end
    p:close()
    local ok, r = pcall(cjson.decode, out or "")
    if not ok or type(r) ~= "table" then return nil end
    local code = tonumber(r.http_code) or 0
    if code < 200 or code >= 300 then return nil end
    return r
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

      status({ running = true, phase = "download" })
      local d = probe({ "--interface", device, "-G", "--data-urlencode", "bytes=" .. math.floor(cfg.down_bytes), cfg.down_url })
      local down = d and M.mbps(tonumber(d.speed_download))
      if not down then return fail("download failed") end

      status({ running = true, phase = "upload" })
      local u = probe({ "--interface", device, "--data-binary", "@-", cfg.up_url },
                      "head -c " .. math.floor(cfg.up_bytes) .. " /dev/urandom")
      local upm = u and M.mbps(tonumber(u.speed_upload))
      if not upm then return fail("upload failed") end

      status({ running = true, phase = "latency" })
      local samples = {}
      for _ = 1, cfg.latency_n do
        local r = probe({ "--interface", device, "-G", "--data-urlencode", "bytes=0", cfg.down_url })
        if r then samples[#samples + 1] = tonumber(r.time_starttransfer) end
      end
      local lat, jit = M.latency_stats(samples)
      if not lat then return fail("latency probe failed") end

      local result = { t = math.floor(time.now() * 1000), trigger = trigger, iface = iface,
                       down_mbps = down, up_mbps = upm, latency_ms = lat, jitter_ms = jit }
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
