-- mudimodem.get_summary: the long-term record (mudimodemd's hourly per-cell lines) for the page.
-- dofiles the REAL plugin; the file is $MUDIMODEM_SUMMARY (set by tools/test-local.sh).
local cjson = require "cjson"
local path = assert(os.getenv("MUDIMODEM_SUMMARY"), "set MUDIMODEM_SUMMARY")
local M = dofile(assert(os.getenv("MM_PLUGIN"), "set MM_PLUGIN"))
assert(type(M.get_summary) == "function", "get_summary missing")

-- no file yet: an empty list, not an error (a fresh install has no hour behind it)
os.remove(path)
local r = M.get_summary({})
-- (the router's cjson marks an empty list as cjson.empty_array, so it encodes as [])
assert((cjson.empty_array ~= nil and r.lines == cjson.empty_array) or (type(r.lines) == "table" and #r.lines == 0),
  "no file -> no lines")
assert(r.days == 7, "default 7 days")

local now = os.time() * 1000
local DAY = 86400 * 1000
local f = assert(io.open(path, "w"))
f:write(cjson.encode({ t = now - 20 * DAY, secs = 3600, slot = 1, cell = "OLD", rsrp = { -100, -95, -90 } }), "\n")
f:write(cjson.encode({ t = now - 3 * DAY, secs = 1800, slot = 1, cell = "A", rsrp = { -100, -95, -90 } }), "\n")
f:write("not json\n")
f:write(cjson.encode({ t = now - 3600 * 1000, secs = 600, slot = 1, no_service = true }), "\n")
f:write('{"t": "x"}\n')
f:close()

r = M.get_summary({ days = 7 })
assert(#r.lines == 2, "7 days: two lines, got " .. #r.lines)
assert(r.lines[1].cell == "A" and r.lines[2].no_service == true, "oldest first, malformed lines skipped")
r = M.get_summary({ days = 30 })
assert(#r.lines == 3 and r.lines[1].cell == "OLD", "30 days reaches the old line")
assert(M.get_summary({ days = 365 }).days == 30, "clamped to what is kept")
assert(M.get_summary({ days = 0 }).days == 1, "at least a day")
assert(type(r.now) == "number" and r.now >= now, "the box clock")
os.remove(path)
print("backend-summary: OK")
