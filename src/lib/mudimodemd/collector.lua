-- mudimodemd/collector.lua — RF + battery sampling, history files, live push. Runs inside eco.
--
-- Replaced the python collector (src/sbin/mudimodem-collectd, retired in R3 ⑤) with the same
-- contract, so nothing downstream changed: /tmp/mudimodem/{samples,battery}.jsonl + latest.json /
-- battery-latest.json (schema: cellular_compat.build_sample / battery.read_battery), the eMMC
-- backup segments, and `gl-session notify {name:"mudimodem.collect"|"mudimodem.battery", data}`.
-- test/collectd-emu.test.py runs it on an emulated GL bus and holds its samples to the python
-- collector's (test/golden/compat.json).
--
-- What differs is only HOW: the RF tick, the battery cadence and the eMMC flush are three
-- coroutines sleeping on eco's timers (libev: monotonic, so a wall-clock step cannot stall or
-- burst them), and ubus is one persistent connection instead of a fork+exec per call.
-- RF comes from GL's own sampler: `cellular.collect get_signals` (libcmcollect.so) already runs
-- AT+QENG/AT+QCAINFO for BOTH SIMs every 10 s and keeps the rows in RAM, so reading them costs no
-- AT. Its rows are cell_info's rows without the levels (added with GL's own thresholds,
-- cellular_compat.with_levels) and without the cell id / TAC, so `cellular.network cell_info`
-- (one QENG + QCAINFO) runs only when the serving carrier changes, once a minute, or when GL has no
-- fresh row (its sampler starting up). All of it measured by running GL's cellular_manager under
-- emulation (mudi-emu up; docs/cellular-api-4.10.md).
local cjson = require "cjson"
local time = require "eco.time"
local cc = require "cellular_compat"
local jsonl = require "mudimodemd.jsonl"
local battery = require "mudimodemd.battery"
local net = require "mudimodemd.net"
local link = require "mudimodemd.link"
local summary = require "mudimodemd.summary"

local M = {}

local DAY_MS = 24 * 3600 * 1000

local function envnum(k, d) return tonumber(os.getenv(k) or "") or d end
local function tasks() return require "mudimodemd.tasks" end   -- run(); loaded on first probe

function M.config()
  local hist = os.getenv("MUDIMODEM_HIST") or "/tmp/mudimodem"
  return {
    bus = os.getenv("MUDIMODEM_BUS") or "cpu",
    poll = envnum("MUDIMODEM_POLL", 10),
    carrier_interval = envnum("MUDIMODEM_CARRIER_INTERVAL", 60),
    batt_interval = envnum("MUDIMODEM_BATT_INTERVAL", 20),
    flush_interval = envnum("MUDIMODEM_FLUSH_INTERVAL", 600),
    probe_idle = envnum("MUDIMODEM_WS_PROBE_IDLE", 30),
    probe_attached = envnum("MUDIMODEM_WS_PROBE_ATTACHED", 60),
    ws_push = os.getenv("MUDIMODEM_NO_WS_PUSH") ~= "1",
    hist = hist,
    samples = hist .. "/samples.jsonl",
    events = hist .. "/events.jsonl",
    crash_seen = hist .. "/crash-seen",                    -- /tmp: a reboot re-baselines
    latest = hist .. "/latest.json",
    battery = hist .. "/battery.jsonl",
    battery_latest = hist .. "/battery-latest.json",
    batt_sysfs = os.getenv("MUDIMODEM_BATT_SYSFS") or "/sys/class/power_supply",
    net_sysfs = os.getenv("MUDIMODEM_NET_SYSFS") or "/sys/class/net",
    netdev_interval = envnum("MUDIMODEM_NETDEV_INTERVAL", 60),
    -- connectivity probe (link.lua): every LINK_INTERVAL s, every LINK_RETRY s while failing;
    -- LINK_FAIL_AFTER misses in a row = an outage. 0 turns the probe off.
    ping = os.getenv("MUDIMODEM_PING") or "ping",
    uci = os.getenv("MUDIMODEM_UCI") or "uci",
    link_targets = os.getenv("MUDIMODEM_LINK_TARGETS"),  -- else GL's glconfig.general.track_ip
    link_interval = envnum("MUDIMODEM_LINK_INTERVAL", 30),
    link_retry = envnum("MUDIMODEM_LINK_RETRY", 10),
    link_fail_after = envnum("MUDIMODEM_LINK_FAIL_AFTER", 2),
    link_wait = envnum("MUDIMODEM_LINK_WAIT", 2),           -- ping -W, per target
    -- the long-term record (summary.lua): one line per hour per cell, on flash, 30 days
    summary = os.getenv("MUDIMODEM_SUMMARY") or "/etc/mudimodem/summary.jsonl",
    summary_period = envnum("MUDIMODEM_SUMMARY_PERIOD", 3600),
    summary_days = envnum("MUDIMODEM_SUMMARY_DAYS", 30),
    crash_dir = os.getenv("MUDIMODEM_CRASH_DIR") or "/data/vendor/modem_crash_log",
    crash_interval = envnum("MUDIMODEM_CRASH_INTERVAL", 60),
    battlimit_pidf = os.getenv("MUDIMODEM_BATTLIMIT_PIDF") or "/tmp/glbattlimit.pid",
    battlimit_limf = os.getenv("MUDIMODEM_BATTLIMIT_LIMF") or "/tmp/glbattlimit.limit",
    history_cfg = os.getenv("MUDIMODEM_HISTORY_CFG") or "/etc/mudimodem/history.json",
    history_persist = os.getenv("MUDIMODEM_HISTORY_PERSIST") or "/etc/mudimodem/history",
    sample_max_age = DAY_MS, sample_max_line = 9000,      -- 24 h at 10 s = 8640
    batt_max_age = DAY_MS, batt_max_line = 5200,          -- 24 h at 20 s = 4320
    trim_every = 60,                                       -- RF ticks (~10 min)
    event_trim_every = 360,                                -- RF ticks (~1 h)
    ws_name = "mudimodem.collect", ws_batt_name = "mudimodem.battery",
    cell_fail_log_every = 300, ws_fail_log_every = 60,
    identity_every = envnum("MUDIMODEM_IDENTITY_EVERY", 60),   -- s between cell_info refreshes
    signals_max_age = envnum("MUDIMODEM_SIGNALS_MAX_AGE", 25), -- s; GL samples every 10
  }
end

-- Seconds of monotonic time (sub-second; /proc/uptime), for the cache/probe/log gates.
local function mono()
  local f = io.open("/proc/uptime", "r")
  if f then
    local s = f:read("*l"); f:close()
    local n = s and tonumber(s:match("^(%S+)"))
    if n then return n end
  end
  return os.time()
end
M.mono = mono

local function now_ms() return math.floor(time.now() * 1000) end

-- A sample as GL's push delivers it is what eco.ubus sends anyway (nulls dropped); only an
-- empty signals list needs a plain table, or the cjson.empty_array marker would vanish with it.
local function for_wire(s)
  local sig = s.signals
  if not (sig == cjson.empty_array or (type(sig) == "table" and #sig == 0)) then return s end
  local o = {}
  for k, v in pairs(s) do o[k] = v end
  o.signals = {}
  return o
end

-- event(kind, label, detail, extra): the daemon's event writer (tasks.event_writer); nil = none
function M.new(conn, cfg, log, event)
  cfg = cfg or M.config()
  log = log or function(msg) io.stderr:write("mudimodemd: ", msg, "\n"); io.stderr:flush() end
  event = event or function() end
  local self = { running = true }
  local st = {                                             -- also the `health` reply
    started = os.time(), rf_ticks = 0, rf_samples = 0, rf_failed = 0, rf_last_t = 0,
    batt_samples = 0, push_failures = 0, attached = true, flushed = false, last_error = "",
    rf_from_gl = 0, cell_info_reads = 0,
    link = "unknown", link_probes = 0, link_lost = 0, outages = 0, modem_crashes = 0, summary_lines = 0,
  }
  self.state = st

  local function call(obj, method, args)
    local r = conn:call(obj, method, args or {})
    if type(r) ~= "table" then return nil end
    return r
  end

  -- ---- carrier identity: `cellular.network info`, re-read per CARRIER_INTERVAL / slot change
  local carrier = { at = nil, slot = nil, info = nil }
  local function carrier_info(slot)
    local now = mono()
    if carrier.info == nil or slot ~= carrier.slot or now - carrier.at >= cfg.carrier_interval then
      carrier.info = call("cellular.network", "info") or {}
      carrier.at, carrier.slot = now, slot
    end
    return carrier.info
  end

  -- ---- a FAILED cell_info read is not "no service": skip the tick, say so (rate-limited)
  local cell_fail = { n = 0, last = nil }
  local function cell_failure(cell)
    cell_fail.n = cell_fail.n + 1
    st.rf_failed = st.rf_failed + 1
    local now = mono()
    if cell_fail.last == nil or now - cell_fail.last >= cfg.cell_fail_log_every then
      cell_fail.last = now
      local detail = cell == nil and "no reply (ubus failed or timed out)"
        or ("error reply " .. cjson.encode(cell):sub(1, 200))
      st.last_error = "cell_info: " .. detail
      log(string.format("cell_info read failed, tick skipped (%d so far): %s", cell_fail.n, detail))
    end
  end

  -- ---- throughput: the cellular device's byte counters, read every tick (sysfs: no AT, no ubus;
  -- the device itself is looked up in `network.interface dump` per NETDEV_INTERVAL)
  local nd = { at = nil, dev = nil, up = false, prev = nil }
  local function netdev()
    local now = mono()
    if nd.at == nil or now - nd.at >= cfg.netdev_interval then
      nd.at = now
      nd.dev, nd.up = net.resolve_iface(call("network.interface", "dump"), "cellular")
    end
    return nd.dev, nd.up
  end
  function self.throughput()
    local now = mono()
    if not netdev() then nd.prev = nil; return nil, nil end
    local rx, tx = net.counters(cfg.net_sysfs, nd.dev)
    if not rx then nd.prev = nil; return nil, nil end
    local cur = { dev = nd.dev, rx = rx, tx = tx, t = now }
    local down, up = net.rate(nd.prev, cur)
    nd.prev = cur
    return down, up
  end

  -- ---- connectivity probe: one ping out of the cellular device per LINK_INTERVAL (link.lua).
  -- The result rides on the next RF sample (ping_ms, or ping_lost), so it shares the samples'
  -- history, backup and push; an outage and its end are events.
  local lk = { pending = nil, targets = nil, targets_at = nil, trk = link.tracker(cfg.link_fail_after) }
  local function targets()
    if cfg.link_targets then return link.parse_targets(cfg.link_targets) end
    local now = mono()
    if lk.targets == nil or now - lk.targets_at >= cfg.netdev_interval then
      lk.targets_at = now
      lk.targets = link.parse_targets(tasks().run({ cfg.uci, "-q", "get", "glconfig.general.track_ip" }, 5))
      if #lk.targets == 0 then lk.targets = { "1.1.1.1", "8.8.8.8" } end
    end
    return lk.targets
  end
  -- -> rtt ms | false (sent, no reply) | nil (no cellular interface up: nothing sent)
  function self.probe()
    local dev, up = netdev()
    local why
    local rtt
    if dev and up then
      why = "No reply to ping"
      for i, ip in ipairs(targets()) do
        if i > 3 then break end
        local out = tasks().run({ cfg.ping, "-I", dev, "-c", "1", "-W", tostring(cfg.link_wait), ip },
                                cfg.link_wait + 3)
        rtt = link.parse_ping(out)
        if rtt then break end
      end
      st.link_probes = st.link_probes + 1
      lk.pending = { t = now_ms(), rtt = rtt }
      if not rtt then st.link_lost = st.link_lost + 1 end
    else
      why = "Cellular interface down"
    end
    local ev = lk.trk.feed(rtt or false, now_ms(), why)
    st.link = lk.trk.state
    if ev and ev.label == "Offline" then
      st.outages = st.outages + 1
      log("link: offline (" .. why .. ")")
      event("link", "Offline", why, { from = ev.since })
    elseif ev then
      log(string.format("link: back online after %d s", ev.secs))
      event("link", "Back online", "after " .. ev.secs .. " s", { secs = ev.secs })
    end
    if rtt then return rtt end
    if dev and up then return false end
    return nil
  end
  function self.link_delay()
    if cfg.link_interval <= 0 then return nil end
    return lk.trk.fails > 0 and math.min(cfg.link_retry, cfg.link_interval) or cfg.link_interval
  end
  -- the latest probe, if it finished since the previous sample (and not too long ago)
  local function take_probe(s)
    local p = lk.pending
    lk.pending = nil
    if not p or s.t - p.t > (cfg.poll * 2 + 5) * 1000 then return end
    if p.rtt then s.ping_ms = math.floor(p.rtt + 0.5) else s.ping_lost = true end
  end

  -- ---- modem crash: GL moves a new dump into crash_dir (link.crash_signature); a changed
  -- listing since the last look = one "Modem crash" event. The first look after boot only
  -- remembers what is there.
  function self.crash_tick()
    local sig = link.crash_signature(require("eco.file"), cfg.crash_dir)
    if sig == nil then return end                          -- no crash collection on this box
    local f = io.open(cfg.crash_seen, "r")
    local seen = f and f:read("*a"); if f then f:close() end
    if seen == sig then return end
    jsonl.write_atomic(cfg.crash_seen, sig)
    if seen ~= nil and sig ~= "" then
      st.modem_crashes = st.modem_crashes + 1
      log("modem crash dump in " .. cfg.crash_dir)
      event("modem", "Modem crash", "The modem restarted after a crash; GL saved a dump in " .. cfg.crash_dir)
    end
  end

  -- ---- the long-term record: every sample feeds the hour's per-cell aggregate; a finished hour
  -- is appended to flash (one write an hour) and the file trimmed to SUMMARY_DAYS.
  local acc = summary.new(cfg.summary_period, cfg.poll)
  local function write_summary(lines)
    if #lines == 0 then return end
    local parts = {}
    for i, l in ipairs(lines) do parts[i] = cjson.encode(l) end
    if not jsonl.append_line(cfg.summary, table.concat(parts, "\n")) then
      jsonl.mkdir_p(cfg.summary:match("^(.*)/[^/]*$") or ".")
      if not jsonl.append_line(cfg.summary, table.concat(parts, "\n")) then
        st.last_error = "summary: cannot write " .. cfg.summary
        return
      end
    end
    st.summary_lines = st.summary_lines + #lines
    jsonl.trim(cfg.summary, cfg.summary_days * DAY_MS, cfg.summary_days * 24 * 24)
  end
  local SANE_T = 1700000000000                             -- before NTP the clock can read 1970
  function self.summarize(s)
    if type(s.t) ~= "number" or s.t < SANE_T then return end
    local done = acc.add(s)
    if done then write_summary(done) end
  end

  -- GL's newest sample for `slot` (get_signals: {signals:[{slot, timestamp (s), signal:[rows]}]}),
  -- or nil when it has none within signals_max_age.
  local function gl_rows(slot)
    local r = call("cellular.collect", "get_signals", { bus = cfg.bus, time = cfg.signals_max_age, slot = slot })
    local best
    for _, e in ipairs(r and type(r.signals) == "table" and r.signals or {}) do
      if type(e) == "table" and tonumber(e.slot) == slot and type(e.signal) == "table" and #e.signal > 0
         and tonumber(e.timestamp) and (best == nil or e.timestamp > best.timestamp) then best = e end
    end
    if best == nil or os.time() - best.timestamp > cfg.signals_max_age then return nil end
    return best.signal
  end

  -- the serving carrier as GL reports it: a change means a new cell (refresh the identity)
  local function pcc_key(rows)
    local p = rows[1] or {}
    return table.concat({ tostring(p.network_type), tostring(p.band), tostring(p.pci), tostring(p.earfcn) }, "|")
  end

  local ident = {}                                         -- per slot: { key, at, network_type, cell_id, tac }
  local function read_cell_info(slot)
    st.cell_info_reads = st.cell_info_reads + 1
    local cell = call("cellular.network", "cell_info", { bus = cfg.bus, slot = slot })
    if cc.cell_info_failed(cell) then cell_failure(cell); return nil end
    if cell_fail.n > 0 then
      log(string.format("cell_info recovered after %d failed read(s)", cell_fail.n))
      cell_fail.n, cell_fail.last = 0, nil
    end
    return cell
  end

  function self.collect_sample()
    local modem = call("cellular.modem", "status")
    local slot = cc.active_slot(modem, cfg.bus)
    if slot == nil then return nil end
    local rows, cell = gl_rows(slot), nil
    if rows == nil then
      cell = read_cell_info(slot)                          -- GL's sampler has nothing fresh yet
      if cell == nil then return nil end
    else
      st.rf_from_gl = st.rf_from_gl + 1
      local key, id, now = pcc_key(rows), ident[slot], mono()
      local signal = {}
      for i, row in ipairs(rows) do signal[i] = cc.with_levels(row) end
      if tonumber(rows[1].network_type) == 0 then
        -- no service: GL's own cell_info says exactly this (network_type 0, no id, no TAC)
        cell = { network_type = 0, cell_id = "", tac = "", signal = signal }
        ident[slot] = nil
      elseif id and id.key == key and now - id.at < cfg.identity_every then
        cell = { network_type = id.network_type, cell_id = id.cell_id, tac = id.tac, signal = signal }
      else
        cell = read_cell_info(slot)
        if cell == nil then return nil end
        ident[slot] = { key = key, at = now, network_type = cell.network_type, cell_id = cell.cell_id, tac = cell.tac }
      end
    end
    return cc.build_sample(modem, cell, carrier_info(slot), now_ms(), cfg.bus, nil, cjson.empty_array)
  end

  -- ---- browser-presence gate: no push while nobody is attached (a failed probe = attached)
  local gate = { at = nil }
  function self.ws_attached()
    local now = mono()
    local every = st.attached and cfg.probe_attached or cfg.probe_idle
    if gate.at ~= nil and now - gate.at < every then return st.attached end
    gate.at = now
    local r = conn:call("gl-session", "has_websocket", {})
    st.attached = not (type(r) == "table" and r.has_ws == false)
    return st.attached
  end

  local ws_fail = { n = 0, last = nil }
  function self.publish(name, sample)
    if not cfg.ws_push then return false end
    local r, err = conn:call("gl-session", "notify", { name = name, data = for_wire(sample) })
    if r == nil then
      ws_fail.n = ws_fail.n + 1
      st.push_failures = st.push_failures + 1
      local now = mono()
      if ws_fail.n == 1 or ws_fail.last == nil or now - ws_fail.last >= cfg.ws_fail_log_every then
        ws_fail.last = now
        st.last_error = "notify: " .. tostring(err)
        log(string.format("gl-session notify failed (%d so far): %s", ws_fail.n, tostring(err)))
      end
      return false
    end
    if ws_fail.n > 0 then
      log(string.format("gl-session notify recovered after %d failure(s)", ws_fail.n))
      ws_fail.n = 0
    end
    return true
  end

  local function guarded(what, fn)
    local ok, err = pcall(fn)                              -- 5.4: yields across pcall are fine
    if not ok then st.last_error = what .. ": " .. tostring(err); log(what .. ": " .. tostring(err)) end
  end

  local sleep = time.sleep                                 -- stop() ends the loop (eco.unloop)

  function self.rf_tick()
    local s = self.collect_sample()
    st.rf_ticks = st.rf_ticks + 1
    local down, up = self.throughput()
    if s ~= nil then
      -- kbit/s on the cellular device since the previous tick (absent across a reconnect)
      s.rx_kbps, s.tx_kbps = down, up
      take_probe(s)
      self.summarize(s)
      local line = cjson.encode(s)
      jsonl.append_line(cfg.samples, line)
      jsonl.write_atomic(cfg.latest, line)
      st.rf_samples, st.rf_last_t = st.rf_samples + 1, s.t
      if self.ws_attached() then self.publish(cfg.ws_name, s) end
    end
    if st.rf_ticks % cfg.trim_every == 0 then
      jsonl.trim(cfg.samples, cfg.sample_max_age, cfg.sample_max_line)
      jsonl.trim(cfg.battery, cfg.batt_max_age, cfg.batt_max_line)
    end
    if st.rf_ticks % cfg.event_trim_every == 0 then
      jsonl.trim(cfg.events, cfg.sample_max_age, 1000, nil, true)   -- others append to it
    end
  end

  function self.battery_tick()
    local b = battery.read_battery(cfg.batt_sysfs, now_ms(), cfg.battlimit_pidf, cfg.battlimit_limf)
    if b == nil then return end
    local line = cjson.encode(b)
    jsonl.append_line(cfg.battery, line)
    jsonl.write_atomic(cfg.battery_latest, line)
    st.batt_samples = st.batt_samples + 1
    if self.ws_attached() then self.publish(cfg.ws_batt_name, b) end
  end

  local streams = {
    { "samples", cfg.sample_max_age, cfg.samples },
    { "battery", cfg.batt_max_age, cfg.battery },
  }
  local cursors = { samples = 0, battery = 0 }
  function self.flush()
    st.flushed = jsonl.maybe_flush_persist(streams, cfg.history_persist, cursors, cfg.history_cfg, now_ms())
  end

  function self.start()
    os.execute("mkdir -p '" .. cfg.hist .. "'")
    jsonl.now_ms = now_ms
    jsonl.sleep = time.sleep
    if jsonl.read_history_config(cfg.history_cfg).enabled then
      guarded("restore", function()
        local c = jsonl.restore_from_persist(streams, cfg.history_persist, now_ms())
        cursors.samples, cursors.battery = c.samples, c.battery
      end)
    end
    -- battery first (no ubus), then RF, as the python collector's loop did; each on its own cadence
    eco.run(function() while self.running do guarded("battery", self.battery_tick); sleep(cfg.batt_interval) end end)
    eco.run(function() while self.running do guarded("collect", self.rf_tick); sleep(cfg.poll) end end)
    eco.run(function() while self.running do guarded("flush", self.flush); sleep(cfg.flush_interval) end end)
    if self.link_delay() then
      eco.run(function()
        sleep(math.min(5, cfg.link_interval))             -- let the first RF tick resolve the device
        while self.running do guarded("link", self.probe); sleep(self.link_delay()) end
      end)
    end
    if cfg.crash_interval > 0 then
      eco.run(function() while self.running do guarded("crash", self.crash_tick); sleep(cfg.crash_interval) end end)
    end
  end

  -- Stop the loops; a clean stop flushes once more so up to FLUSH_INTERVAL of history is not
  -- left only in RAM.
  function self.stop()
    self.running = false
    guarded("summary", function() write_summary(acc.drain()) end)   -- the open hour, as far as it got
    if jsonl.read_history_config(cfg.history_cfg).enabled then guarded("final flush", self.flush) end
  end

  return self
end

return M
