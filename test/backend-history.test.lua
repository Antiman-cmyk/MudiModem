-- On-box test for mudimodem.get_history. The backend pulls oui.ubus -> resty.http
-- which indexes ngx at load, so we stub ngx (CLAUDE.md §8). get_history itself
-- touches no ubus — it only reads the jsonl telemetry files under MUDIMODEM_HIST.
-- Run: MUDIMODEM_HIST=/tmp/mmhist-test lua test/backend-history.test.lua

local HIST = os.getenv("MUDIMODEM_HIST") or error("set MUDIMODEM_HIST")
os.execute("mkdir -p " .. HIST)

local function w(path, lines)
  local f = assert(io.open(path, "w"))
  f:write(table.concat(lines, "\n") .. "\n")
  f:close()
end
-- includes a malformed line (must be skipped) and out-of-order timestamps.
w(HIST .. "/samples.jsonl", {
  '{"t":1000,"slot":"1","id":"A1","rsrp":-101}',
  'garbage not json',
  '{"t":2000,"slot":"1","id":"B2","rsrp":-99}',
})
w(HIST .. "/events.jsonl", {
  '{"t":1500,"kind":"user","label":"Bands applied","detail":"SA n71"}',
})

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
assert(type(M.get_history) == "function", "get_history missing")

-- Empty results come back as cjson.empty_array (userdata, so it encodes as []
-- for the frontend); len() measures either a real array or that sentinel as 0.
local function len(x) return (type(x) == "table") and #x or 0 end

local all = M.get_history({})
assert(len(all.samples) == 2, "expected 2 valid samples (1 malformed skipped), got " .. len(all.samples))
assert(len(all.events) == 1, "expected 1 event, got " .. len(all.events))
assert(all.samples[1].id == "A1", "first sample id preserved")
assert(all.now and all.now > 0, "now stamped in ms")

local since = M.get_history({ since = 1500 })
assert(len(since.samples) == 1, "since=1500 -> only t=2000 sample")
assert(since.samples[1].t == 2000, "correct sample after since")
assert(len(since.events) == 0, "since=1500 -> event at t=1500 is NOT > since")

-- Windowing returns the correct TAIL, oldest-first. The backward-read early-exit
-- (perf: it stops decoding once it passes `since` instead of decoding the whole
-- file) must not drop, duplicate, or reorder the returned window.
w(HIST .. "/samples.jsonl", {
  '{"t":100,"rsrp":-100}', '{"t":200,"rsrp":-101}', '{"t":300,"rsrp":-102}',
  '{"t":400,"rsrp":-103}', '{"t":500,"rsrp":-104}',
})
local tail = M.get_history({ since = 250 })
assert(len(tail.samples) == 3, "since=250 -> t=300,400,500 (3), got " .. len(tail.samples))
assert(tail.samples[1].t == 300, "window is oldest-first (first = 300)")
assert(tail.samples[3].t == 500, "window ends at the newest (last = 500)")
local none = M.get_history({ since = 500 })
assert(len(none.samples) == 0, "since=newest -> empty window")
local everything = M.get_history({})
assert(len(everything.samples) == 5, "no since -> the whole file (5)")
assert(everything.samples[1].t == 100 and everything.samples[5].t == 500, "full read stays oldest-first")

-- ---------------------------------------------------------------------------
-- `window_ms` is a RELATIVE window resolved against the BOX clock. The page
-- sends it instead of an absolute `since` for the initial load and for range
-- backfills, so the size of the window never depends on the browser's clock
-- being right — a laptop 10 minutes slow used to silently ask for 25 minutes,
-- one 10 minutes fast got a near-empty graph. (Timezone was never the issue:
-- Date.now() and os.time() are both UTC epoch. Absolute skew was.)
do
  local now = os.time() * 1000
  -- %.0f, not %d: this box's Lua is a "double int32" build, so string.format
  -- rejects an epoch-ms value (> 2^31) as a %d argument.
  local function s(t) return string.format('{"t":%.0f,"rsrp":-100}', t) end
  w(HIST .. "/samples.jsonl", {
    s(now - 3600000), s(now - 1800000),          -- 60 m and 30 m ago: outside a 15 m window
    s(now - 600000), s(now - 60000),             -- 10 m and 1 m ago: inside it
  })
  local win = M.get_history({ window_ms = 15 * 60000 })
  assert(len(win.samples) == 2,
    "window_ms=15m -> only the 10m and 1m samples, got " .. len(win.samples))
  assert(win.samples[1].t == now - 600000, "window_ms window is oldest-first")
  assert(win.samples[2].t == now - 60000, "window_ms window ends at the newest")
  assert(math.abs(win.now - now) < 5000, "response stamps the box clock in ms")

  local wide = M.get_history({ window_ms = 24 * 3600 * 1000 })
  assert(len(wide.samples) == 4, "a 24h window_ms reaches all four samples")

  -- `since` still works — the 10s poll sends the newest sample's own (box-
  -- stamped) timestamp, which needs no clock agreement at either end.
  local poll = M.get_history({ since = now - 600000 })
  assert(len(poll.samples) == 1 and poll.samples[1].t == now - 60000,
    "since= still returns strictly-newer records for the poll path")
end

-- ---------------------------------------------------------------------------
-- A windowed read must cost O(window), not O(file).
--
-- Regression: read_lines() used to slurp EVERY line of samples.jsonl into a Lua
-- table before scanning backward. Measured on the box (14.6k lines / 3.8 MB),
-- that loop cost ~7.4 s of CPU — and it was FLAT: a 15-minute window (224
-- samples) cost exactly as much as the full 24 h (14,647). Reading the bytes is
-- cheap (`read("*a")` of 3.8 MB = 0.09 s) and decoding 226 lines is 0.005 s;
-- the cost was materialising 14.6k interned strings in one growing table.
-- So the fix reads the file's TAIL in chunks and stops at the window edge.
--
-- The fixture is deliberately several chunks long, and the window edge sits
-- mid-file, so this also covers the chunk-boundary line splicing.
local BIG_N, BIG_TAIL = 15000, 300
do
  local f = assert(io.open(HIST .. "/samples.jsonl", "w"))
  for i = 1, BIG_N do                                   -- ~260 B/line, like the real collector
    f:write(string.format(
      '{"t":%d,"slot":"1","id":"CELL%06d","band":71,"arfcn":123456,"rsrp":%d,' ..
      '"rsrq":-11,"sinr":8,"rsrp_level":3,"rsrq_level":3,"sinr_level":3,' ..
      '"pad":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}\n',
      i * 1000, i, -100 - (i % 20)))
  end
  f:close()
end
w(HIST .. "/events.jsonl", { '{"t":1500,"kind":"user","label":"x","detail":"y"}' })

local edge = (BIG_N - BIG_TAIL) * 1000                  -- window = the last BIG_TAIL samples
local c0 = os.clock()
local big = M.get_history({ since = edge })
local cost = os.clock() - c0

assert(len(big.samples) == BIG_TAIL,
  "windowed read must return exactly the tail: expected " .. BIG_TAIL .. ", got " .. len(big.samples))
assert(big.samples[1].t == edge + 1000, "window starts at the first sample AFTER since")
assert(big.samples[BIG_TAIL].t == BIG_N * 1000, "window ends at the newest sample")
assert(big.samples[1].id == string.format("CELL%06d", BIG_N - BIG_TAIL + 1), "tail rows decode intact")
-- Lines land at arbitrary offsets, so the tail reader must splice partial lines
-- across chunk reads; a broken splice shows up as a missing or mangled row.
for i = 1, BIG_TAIL do
  assert(big.samples[i].t == (BIG_N - BIG_TAIL + i) * 1000, "no gap/dupe at chunk boundary, row " .. i)
end
assert(cost < 1.0, string.format(
  "windowed get_history over %d lines took %.2fs CPU — must be O(window), not O(file)", BIG_N, cost))
print(string.format("  perf: %d-line file, %d-sample window, %.3fs CPU", BIG_N, BIG_TAIL, cost))

-- empty dir -> empty arrays, never an error
os.execute("rm -f " .. HIST .. "/samples.jsonl " .. HIST .. "/events.jsonl")
local empty = M.get_history({})
assert(len(empty.samples) == 0 and len(empty.events) == 0, "absent files -> empty arrays")
-- and they must encode as [] (not {}) so the frontend gets real arrays
local enc = require("cjson").encode(empty)
assert(enc:find('"samples":%[%]'), "empty samples must encode as []")
assert(enc:find('"events":%[%]'), "empty events must encode as []")

os.execute("rm -rf " .. HIST)
print("get_history OK: all=2/1, since=1/0, empty=0/0")
