-- mudimodemd/link.lua — does the cellular link pass traffic? And did the modem crash? (eco)
--
-- Signal can be fine while nothing gets through (PDN, DNS, the carrier's side), and the RF lanes
-- cannot show that. The probe pings out of the cellular device the way GL's own check does
-- (lib/functions/modem.sh __check_modem_kmwan_network: `/bin/ping -I <ifname> -c 1 -W 1 <ip>`,
-- trying each tracking IP until one answers), at GL's own tracking IPs (glconfig.general.track_ip:
-- the "tracking IP" list of GL's Multi-WAN page, per-region defaults in
-- etc/uci-defaults/15_fix_glconfig_track_ip). One reply from any target = online.
--
--   parse_ping(out)          busybox ping output -> rtt ms, or nil (no reply)
--   parse_targets(s)         `uci get` list -> { "1.1.1.1", ... } (IPv4 literals only: they go on argv)
--   tracker(fail_after)      outage state machine: feed(rtt|false|nil, t_ms, why) -> event or nil
--   crash_signature(dir)     what is in GL's modem crash-dump directory, as one comparable string
local M = {}

function M.parse_ping(out)
  local t = type(out) == "string" and out:match("time=([%d%.]+) ?ms")
  return t and tonumber(t) or nil
end

function M.parse_targets(s)
  local out = {}
  for w in tostring(s or ""):gmatch("%S+") do
    local a, b, c, d = w:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if a and tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255 and tonumber(d) <= 255 then
      out[#out + 1] = w
    end
  end
  return out
end

-- Outage = `fail_after` probes in a row without a reply (or with the cellular interface down)
-- AFTER the link was seen working since the daemon started: a box that never had cellular data
-- (wired only, no SIM) is not "offline". The outage starts at the first failed probe.
--   feed(rtt_ms, t)        a reply                 -> { label = "Back online", secs, why } after an outage
--   feed(false, t, why)    no reply / no interface -> { label = "Offline", why, since } on the fail_after-th
function M.tracker(fail_after)
  local o = { state = "unknown", fails = 0, first_fail = nil, since = nil, why = nil }
  function o.feed(r, t, why)
    if type(r) == "number" then
      local ev
      if o.state == "down" then
        ev = { label = "Back online", secs = math.max(0, math.floor((t - o.since) / 1000 + 0.5)), why = o.why }
      end
      o.state, o.fails, o.first_fail, o.since, o.why = "up", 0, nil, nil, nil
      return ev
    end
    if o.state ~= "up" then return nil end         -- unknown (never worked) or already down
    o.fails = o.fails + 1
    if o.fails == 1 then o.first_fail = t end
    if o.fails >= fail_after then
      o.state, o.since, o.why = "down", o.first_fail, why
      return { label = "Offline", why = why, since = o.first_fail }
    end
    return nil
  end
  return o
end

-- GL's /usr/bin/check_modem_crash.sh (run by /etc/init.d/gl_check_crash only when the modem is
-- set to recover on its own: AT+QCFG="modemrstlevel" and "aprstlevel" both 1) moves a new dump from
-- /data/vendor/ramdump/ into a freshly re-created /data/vendor/modem_crash_log/ once a minute. So a
-- new crash = that directory's listing changed. `dir` is eco.file (dir() iterates name, info).
-- Returns the signature ("" for an empty directory) and the newest entry's mtime, or nil when the
-- directory does not exist.
function M.crash_signature(file, path)
  if not file.access(path) then return nil end
  local ok, names = pcall(function()
    local acc = {}
    for name, info in file.dir(path) do
      if name ~= "." and name ~= ".." then acc[#acc + 1] = { name, info and info.mtime or 0, info and info.size or 0 } end
    end
    return acc
  end)
  if not ok then return nil end
  table.sort(names, function(a, b) return a[1] < b[1] end)
  local parts, newest = {}, 0
  for _, e in ipairs(names) do
    parts[#parts + 1] = e[1] .. "@" .. tostring(e[2]) .. ":" .. tostring(e[3])
    if (tonumber(e[2]) or 0) > newest then newest = tonumber(e[2]) end
  end
  return table.concat(parts, "|"), newest
end

return M
