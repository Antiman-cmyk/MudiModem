-- The connectivity probe's pure parts (src/lib/mudimodemd/link.lua): busybox ping output, GL's
-- tracking-IP list, and the outage state machine. The probe itself (ping -I, events, the lane
-- fields, crash dumps) is drilled on the emulated bus in test/collectd-emu.test.py.
-- Runs under the host's lua5.1, the router's lua and eco.
local dir = (arg and arg[0] and arg[0]:match("^(.*)/[^/]*$") or ".") .. "/../src/lib/"
package.path = dir .. "?.lua;" .. package.path
local link = require "mudimodemd.link"

local n = 0
local function eq(a, b, what)
  n = n + 1
  if a ~= b then error(string.format("%s: got %s, want %s", what, tostring(a), tostring(b)), 2) end
end

-- ---- parse_ping: busybox ping -c 1 output ---------------------------------------------------
eq(link.parse_ping("PING 1.1.1.1 (1.1.1.1): 56 data bytes\n64 bytes from 1.1.1.1: seq=0 ttl=57 time=23.456 ms\n\n--- 1.1.1.1 ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss\nround-trip min/avg/max = 23.456/23.456/23.456 ms\n"), 23.456, "reply")
eq(link.parse_ping("PING 1.1.1.1 (1.1.1.1): 56 data bytes\n\n--- 1.1.1.1 ping statistics ---\n1 packets transmitted, 0 packets received, 100% packet loss\n"), nil, "no reply")
eq(link.parse_ping("ping: SO_BINDTODEVICE: No such device\n"), nil, "no device")
eq(link.parse_ping("64 bytes from 8.8.8.8: seq=0 ttl=117 time=1043 ms"), 1043, "integer time")
eq(link.parse_ping(nil), nil, "nil output")

-- ---- parse_targets: `uci -q get glconfig.general.track_ip`, argv-safe IPv4 only -----------
local t = link.parse_targets("223.5.5.5 223.6.6.6 119.29.29.29 182.254.118.118")
eq(#t, 4, "four CN targets"); eq(t[1], "223.5.5.5", "order kept")
t = link.parse_targets("1.1.1.1 ;rm -rf / 999.1.1.1 8.8.8.8 2001:4860::8888 -I")
eq(#t, 2, "only valid IPv4"); eq(t[2], "8.8.8.8", "second valid")
eq(#link.parse_targets(nil), 0, "nil list")
eq(#link.parse_targets(""), 0, "empty list")

-- ---- tracker: outage = 2 misses in a row after the link worked ------------------------------
local tr = link.tracker(2)
eq(tr.feed(false, 1000, "No reply to ping"), nil, "never worked: no outage")
eq(tr.feed(false, 2000, "No reply to ping"), nil, "still never worked")
eq(tr.state, "unknown", "unknown until a reply")
eq(tr.feed(30, 3000), nil, "first reply: no event"); eq(tr.state, "up", "up")
eq(tr.feed(false, 10000, "No reply to ping"), nil, "one miss is no outage")
eq(tr.feed(25, 11000), nil, "a reply resets the count")
eq(tr.feed(false, 20000, "No reply to ping"), nil, "miss 1")
local ev = tr.feed(false, 30000, "Cellular interface down")
eq(ev and ev.label, "Offline", "miss 2 = Offline"); eq(ev.since, 20000, "the outage began at miss 1")
eq(ev.why, "Cellular interface down", "the reason of the miss that decided it")
eq(tr.feed(false, 40000, "No reply to ping"), nil, "one Offline per outage")
ev = tr.feed(40, 220400)
eq(ev and ev.label, "Back online", "first reply after"); eq(ev.secs, 200, "200.4 s, rounded")
eq(tr.feed(40, 230000), nil, "no second Back online")
local tr3 = link.tracker(3)
tr3.feed(1, 0); tr3.feed(false, 1); tr3.feed(false, 2)
eq(tr3.state, "up", "fail_after = 3: two misses are not enough")
eq(tr3.feed(false, 3).label, "Offline", "the third is")

-- ---- crash_signature: a fake eco.file -------------------------------------------------------
local fake = { entries = nil }
function fake.access(p) return fake.entries ~= nil end
function fake.dir(p)
  local i = 0
  return function()
    i = i + 1
    local e = fake.entries[i]
    if e then return e[1], { mtime = e[2], size = e[3], type = "REG" } end
  end
end
eq(link.crash_signature(fake, "/x"), nil, "no directory")
fake.entries = {}
eq(link.crash_signature(fake, "/x"), "", "empty directory")
fake.entries = { { "b.elf", 20, 5 }, { "a.elf", 10, 7 } }
local sig, newest = link.crash_signature(fake, "/x")
eq(sig, "a.elf@10:7|b.elf@20:5", "sorted by name"); eq(newest, 20, "newest mtime")
function fake.dir() error("EACCES") end
eq(link.crash_signature(fake, "/x"), nil, "an unreadable directory is no signature")

print(string.format("daemon-link: %d checks OK", n))
