-- The hourly long-term record (src/lib/mudimodemd/summary.lua): per-cell aggregates, the hour
-- roll-over, no-service time, JSON nulls. The collector's use of it (flush to flash, trim to 30
-- days) is drilled on the emulated bus in test/collectd-emu.test.py.
-- Runs under the host's lua5.1, the router's lua and eco.
local dir = (arg and arg[0] and arg[0]:match("^(.*)/[^/]*$") or ".") .. "/../src/lib/"
package.path = dir .. "?.lua;" .. package.path
local summary = require "mudimodemd.summary"

local n = 0
local function eq(a, b, what)
  n = n + 1
  if a ~= b then error(string.format("%s: got %s, want %s", what, tostring(a), tostring(b)), 2) end
end

local NULL = io.stdout                -- any userdata stands in for cjson.null
local H = 3600 * 1000
local base = 1793620800000            -- an hour boundary (2026-11-02 08:00 UTC)
local function smp(t, over)
  local s = { t = t, slot = 1, registered = true, carrier = "T-Mobile", pcc_rat = "NR5G-SA", mode = "NR5G-SA",
              band = 71, cell_id = "C1", pci = 516, tx_channel = 127490, rsrp = -100, sinr = 5, rsrq = -12 }
  for k, v in pairs(over or {}) do s[k] = v end
  return s
end

local acc = summary.new(3600, 10)
eq(acc.add(smp(base + 0, { rsrp = -100, sinr = 4, rx_kbps = 1000, ping_ms = 30 })), nil, "first sample")
eq(acc.add(smp(base + 10000, { rsrp = -90, sinr = 8, rx_kbps = 3000, tx_kbps = 200, ping_lost = true })), nil, "same hour")
eq(acc.add(smp(base + 20000, { rsrp = -95, sinr = NULL, rsrq = NULL })), nil, "nulls are no value")
eq(acc.add(smp(base + 30000, { cell_id = "C2", pci = 7, rsrp = -110 })), nil, "a second cell, same hour")
eq(acc.add(smp(base + 40000, { registered = false, cell_id = NULL, id = NULL, rsrp = NULL })), nil, "no service")
eq(acc.add(smp(base + 50000, { registered = false, cell_id = NULL, rsrp = NULL })), nil, "no service again")
local done = acc.add(smp(base + H + 5000, { rsrp = -80 }))
eq(type(done), "table", "the next hour's first sample closes the hour")
eq(#done, 3, "C1, C2, no service")
local c1, c2, ns = done[1], done[2], done[3]
eq(c1.t, base, "hour start"); eq(c1.secs, 30, "3 samples x 10 s"); eq(c1.cell, "C1", "cell")
eq(c1.carrier, "T-Mobile", "carrier"); eq(c1.rat, "NR5G-SA", "rat"); eq(c1.band, 71, "band"); eq(c1.ch, 127490, "ch")
eq(c1.rsrp[1], -100, "rsrp min"); eq(c1.rsrp[2], -95, "rsrp avg"); eq(c1.rsrp[3], -90, "rsrp max")
eq(c1.sinr[1], 4, "sinr min"); eq(c1.sinr[2], 6, "sinr avg of the two readings"); eq(c1.sinr[3], 8, "sinr max")
eq(c1.rsrq[2], -12, "rsrq avg of the two readings")
eq(c1.ping_n, 2, "two probes"); eq(c1.ping_lost, 1, "one lost"); eq(c1.ping_ms, 30, "avg of the replies")
eq(c1.rx_kbps, 2000, "rx avg of the ticks that had one"); eq(c1.rx_max, 3000, "rx max"); eq(c1.tx_kbps, 200, "tx avg")
eq(c2.cell, "C2", "second cell"); eq(c2.secs, 10, "one sample"); eq(c2.ping_n, nil, "no probe, no ping fields")
eq(c2.rx_kbps, nil, "no counter, no rx field")
eq(ns.no_service, true, "no-service line"); eq(ns.secs, 20, "20 s without service"); eq(ns.rsrp, nil, "no radio")
eq(ns.slot, 1, "on SIM 1")
local rest = acc.drain()
eq(#rest, 1, "the open hour drains"); eq(rest[1].t, base + H, "next hour"); eq(rest[1].rsrp[2], -80, "its sample")
eq(#acc.drain(), 0, "drained twice: nothing")
eq(acc.add({ t = "x" }), nil, "a bad sample is ignored")

-- a short period (the tests' 1 s hours) rolls the same way
local a2 = summary.new(1, 0.2)
a2.add(smp(1000)); a2.add(smp(1500))
local d2 = a2.add(smp(2100))
eq(#d2, 1, "1 s bucket"); eq(d2[1].secs, 0.4, "2 x 0.2 s")

print(string.format("daemon-summary: %d checks OK", n))
