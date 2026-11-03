-- MudiModem RPC backend: get_history / get_battery_history / get_summary: windows of the collector's files.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, SAMPLES, EVENTS, BATTERY, arr = C.cjson, C.SAMPLES, C.EVENTS, C.BATTERY, C.arr

-- READ: the recorded history (samples + user/dog events) for the Tracking page.
-- Two ways to ask, and the difference matters:
--   { window_ms = <ms> }  — a RELATIVE window, resolved against the BOX clock.
--                           What the page sends for its initial load and for a
--                           range backfill.
--   { since = <epoch ms> }— records strictly newer than this instant. What the
--                           10s poll sends, carrying the newest sample's OWN
--                           timestamp — a value the box itself stamped.
-- Neither form lets the browser's clock decide how much history comes back.
-- ⚠️ An absolute `since` computed browser-side (now - 15min) was the earlier
-- design and it silently mis-sized the window by however far the two clocks had
-- drifted: a laptop 10 minutes slow asked for 25 minutes of data, one 10 minutes
-- fast got a nearly empty graph. Timezone was never involved — Date.now() and
-- os.time() are both UTC epoch — but absolute skew on a travel router is real.
-- Neither given => everything retained (24h). Files absent (collector not
-- started) => empty arrays.
--
-- Read the TAIL of an append-ordered jsonl file BACKWARD in chunks, stopping at
-- the window edge. Returns decoded records oldest-first. Shared by get_history
-- and get_battery_history.
--
-- ⚠️ Do not "simplify" this into a read-all-then-filter loop. That was the
-- original, and on the box over 14.6k lines / 3.8 MB it cost ~7.4 s of CPU —
-- FLAT: a 15-minute window (224 samples) cost exactly what the full 24 h
-- (14,647) did, on page load AND on every 10 s poll. The bytes are cheap
-- (read("*a") of 3.8 MB = 0.09 s) and 226 cjson.decodes are 0.005 s; the cost is
-- materialising 14.6k interned strings in one growing table. Cost is now
-- O(window): a 15 m load and each poll are ~10 ms.
local READ_CHUNK = 65536
local function read_window(path, since)
  local fh = io.open(path, "r")
  if not fh then return {} end
  local pos   = fh:seek("end")
  local carry = ""                                   -- head fragment: a line cut by the chunk edge
  local rev   = {}                                   -- collected newest-first
  local done  = false
  while pos > 0 and not done do
    local from = pos - READ_CHUNK
    if from < 0 then from = 0 end
    fh:seek("set", from)
    local buf = (fh:read(pos - from) or "") .. carry
    pos = from
    if pos > 0 then                                  -- buf's first line is (probably) incomplete:
      local nl = buf:find("\n", 1, true)             -- hold it back for the next, earlier read
      if nl then carry, buf = buf:sub(1, nl - 1), buf:sub(nl + 1)
      else carry, buf = buf, "" end                  -- no newline in the chunk: it's all one fragment
    else carry = "" end                              -- reached the file start: nothing left to splice
    local lines = {}
    for line in buf:gmatch("[^\n]+") do lines[#lines + 1] = line end
    for i = #lines, 1, -1 do
      local ok, obj = pcall(cjson.decode, lines[i])  -- cjson.decode can't yield; pcall is safe here
      if ok and type(obj) == "table" and obj.t then
        if since and obj.t <= since then done = true; break end  -- window edge: stop reading
        rev[#rev + 1] = obj
      end                                            -- malformed line: skip, keep scanning
    end
  end
  fh:close()
  local out = {}                                     -- flip back to oldest-first (the contract)
  for i = #rev, 1, -1 do out[#out + 1] = rev[i] end
  return out
end

-- Resolve the {window_ms} / {since} argument pair against the BOX clock.
-- Callers send one or the other; if both arrive, honour the narrower.
local function window_since(args, now)
  local since = args and tonumber(args.since) or nil
  local win   = args and tonumber(args.window_ms) or nil
  if win and win > 0 then
    local rel = now - win
    since = (since == nil) and rel or math.max(since, rel)
  end
  return since
end

function M.get_history(args)
  local now   = os.time() * 1000
  local since = window_since(args, now)
  return { samples = arr(read_window(SAMPLES, since)),
           events  = arr(read_window(EVENTS, since)),
           now     = now }
end

-- Battery history (issue #1). Same {window_ms}/{since} contract as get_history,
-- read from the collector's battery.jsonl. No `events` key: the chart's
-- annotations (plug/unplug, charging band, the limit-engaged marker) are all
-- DERIVED client-side from the sample stream.
function M.get_battery_history(args)
  local now = os.time() * 1000
  return { samples = arr(read_window(BATTERY, window_since(args, now))), now = now }
end

-- ======================= The long-term record (hourly) =======================
-- mudimodemd's collector appends one line per hour per serving cell (src/lib/mudimodemd/summary.lua)
-- to SUMMARY on flash and keeps 30 days (a few hundred KB). args = { days = 1..30 } (default 7).
-- -> { lines = [...oldest first], now }. Lines of one hour/cell may repeat across a daemon
-- restart; the page merges them.
local SUMMARY = os.getenv("MUDIMODEM_SUMMARY") or "/etc/mudimodem/summary.jsonl"

function M.get_summary(args)
  local days = math.floor(tonumber(args and args.days) or 7)
  if days < 1 then days = 1 elseif days > 30 then days = 30 end
  local since = (os.time() - days * 86400) * 1000
  local out = {}
  local fh = io.open(SUMMARY, "r")
  if fh then
    for line in fh:lines() do
      if #line > 1 then
        local ok, obj = pcall(cjson.decode, line)   -- cjson.decode can't yield; pcall is safe here
        if ok and type(obj) == "table" and tonumber(obj.t) and obj.t >= since then out[#out + 1] = obj end
      end
    end
    fh:close()
  end
  return { lines = arr(out), now = os.time() * 1000, days = days }
end

end
