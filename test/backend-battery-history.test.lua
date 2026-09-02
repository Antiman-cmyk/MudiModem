-- On-box test for mudimodem.get_battery_history. The backend pulls oui.ubus ->
-- resty.http which indexes ngx at load, so we stub ngx (CLAUDE.md §8).
-- get_battery_history touches no ubus — it only reads battery.jsonl under
-- MUDIMODEM_HIST.
-- Run: MUDIMODEM_HIST=/tmp/mmbat-test lua test/backend-battery-history.test.lua

local HIST = os.getenv("MUDIMODEM_HIST") or error("set MUDIMODEM_HIST")
os.execute("mkdir -p " .. HIST)

local function w(path, lines)
  local f = assert(io.open(path, "w"))
  f:write(table.concat(lines, "\n") .. "\n")
  f:close()
end

ngx = { socket = { tcp = function() return { settimeout = function() end, connect = function() end } end },
  re = { match = function() end, gmatch = function() end, find = function() end },
  log = function() end, ERR = 0, WARN = 1, NOTICE = 2, INFO = 3, var = {}, req = {}, ctx = {},
  say = function() end, print = function() end, exit = function() end, HTTP_OK = 200,
  timer = { at = function() end },
  config = { ngx_lua_version = 10025, subsystem = "http", debug = false },
  worker = { id = function() return 0 end, count = function() return 4 end },
  now = function() return os.time() end, time = function() return os.time() end }

local ok, M = pcall(dofile, os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(ok, "backend failed to load: " .. tostring(M))
assert(type(M.get_battery_history) == "function", "get_battery_history missing")

local function len(x) return (type(x) == "table") and #x or 0 end

-- A malformed line must be skipped, not fatal.
w(HIST .. "/battery.jsonl", {
  '{"t":1000,"cap":70,"volt":4010,"cur":-363,"temp":31.6,"online":0,"status":"Discharging"}',
  'garbage not json',
  '{"t":2000,"cap":71,"volt":4045,"cur":0,"temp":32.0,"online":1,"status":"Full"}',
})

local all = M.get_battery_history({})
assert(len(all.samples) == 2, "expected 2 valid samples (1 malformed skipped), got " .. len(all.samples))
assert(all.samples[1].cap == 70, "oldest-first: first sample is t=1000")
assert(all.samples[2].cur == 0, "the blocked sample decodes with cur == 0")
assert(all.now and all.now > 0, "now stamped in ms")

-- The signed current and the 0-means-blocked value must survive the round trip
-- intact: they are the whole point of the chart.
assert(all.samples[1].cur == -363, "negative current preserved (discharging)")
assert(all.samples[2].online == 1 and all.samples[2].cur == 0,
  "cur==0 while online==1 is the 'limit engaged' signature")

local since = M.get_battery_history({ since = 1000 })
assert(len(since.samples) == 1 and since.samples[1].t == 2000,
  "since= returns strictly-newer records only")

local none = M.get_battery_history({ since = 2000 })
assert(len(none.samples) == 0, "since=newest -> empty window")

-- window_ms is a RELATIVE window resolved against the BOX clock (never a
-- browser-computed absolute cutoff — clock skew on a travel router is real).
do
  local now = os.time() * 1000
  -- %.0f, not %d: this box's Lua is a double/int32 build and rejects epoch-ms as %d.
  local function s(t) return string.format('{"t":%.0f,"cap":70,"cur":-300,"volt":4000,"temp":31.5}', t) end
  w(HIST .. "/battery.jsonl", {
    s(now - 3600000), s(now - 1800000),      -- 60 m and 30 m ago: outside 15 m
    s(now - 600000),  s(now - 60000),        -- 10 m and 1 m ago: inside it
  })
  local win = M.get_battery_history({ window_ms = 15 * 60000 })
  assert(len(win.samples) == 2, "window_ms=15m -> 2 samples, got " .. len(win.samples))
  assert(win.samples[1].t == now - 600000, "window is oldest-first")
  assert(math.abs(win.now - now) < 5000, "response stamps the box clock in ms")

  local wide = M.get_battery_history({ window_ms = 24 * 3600 * 1000 })
  assert(len(wide.samples) == 4, "a 24h window reaches all four samples")
end

-- Windowed reads must stay O(window). Same regression the modem history had:
-- slurping every line cost ~7.4 s CPU flat, regardless of window size.
local BIG_N, BIG_TAIL = 15000, 300
do
  local f = assert(io.open(HIST .. "/battery.jsonl", "w"))
  for i = 1, BIG_N do
    f:write(string.format(
      '{"t":%d,"cap":%d,"volt":%d,"cur":%d,"temp":31.6,"online":1,"status":"Charging",' ..
      '"ctype":"Fast","cycles":4,"health":"Good"}\n',
      i * 1000, 50 + (i % 50), 3900 + (i % 150), 1000 - (i % 1000)))
  end
  f:close()
end
local edge = (BIG_N - BIG_TAIL) * 1000
local c0 = os.clock()
local big = M.get_battery_history({ since = edge })
local cost = os.clock() - c0
assert(len(big.samples) == BIG_TAIL,
  "windowed read must return exactly the tail: expected " .. BIG_TAIL .. ", got " .. len(big.samples))
for i = 1, BIG_TAIL do
  assert(big.samples[i].t == (BIG_N - BIG_TAIL + i) * 1000, "no gap/dupe at chunk boundary, row " .. i)
end
assert(cost < 1.0, string.format(
  "windowed get_battery_history over %d lines took %.2fs CPU — must be O(window)", BIG_N, cost))

-- absent file -> empty array, never an error, and it must encode as [] not {}
os.execute("rm -f " .. HIST .. "/battery.jsonl")
local empty = M.get_battery_history({})
assert(len(empty.samples) == 0, "absent file -> empty array")
local enc = require("cjson").encode(empty)
assert(enc:find('"samples":%[%]'), "empty samples must encode as []")

-- get_battlimit must expose the GUI fit constants so the chunk needs no third
-- copy of the formula.
local bl = M.get_battlimit({})
assert(bl.gui_m == 13867 and bl.gui_b == 189300,
  "get_battlimit must expose gui_m/gui_b for the chunk's gauge->GUI conversion")

os.execute("rm -rf " .. HIST)
print("get_battery_history OK: all=2, since=1, window=2, empty=0")
