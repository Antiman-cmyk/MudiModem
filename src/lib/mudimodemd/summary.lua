-- mudimodemd/summary.lua — the long-term record: one line per hour per serving cell (eco or plain Lua).
--
-- The 24 h sample history is too fine and too short to compare days or places; this keeps 30 days
-- of hourly aggregates (a few hundred KB) on flash. Each line covers one cell for one hour:
--   { t = hour start (epoch ms; `t` so jsonl.trim ages it), secs = time covered (samples x poll), slot, carrier, rat, band,
--     cell, pci, ch,  rsrp = {min, avg, max}, sinr = {...}, rsrq = {...},
--     ping_n, ping_lost, ping_ms (avg), rx_kbps / tx_kbps (avg of the ticks that had one), rx_max }
-- and "no service" time in the hour as { t, secs, slot, no_service = true }. A daemon restart mid-
-- hour leaves two lines for the same hour and cell; readers merge them (secs-weighted).
--
--   new(period_s, poll_s)   an accumulator; add(sample) -> finished lines when the hour rolled
--                           over (else nil); drain() -> the current hour's lines (and resets)
local M = {}

local function round1(x) return math.floor(x * 10 + 0.5) / 10 end
-- a sample's JSON null (cjson.null, a userdata) is no value
local function nn(v) if type(v) == "userdata" then return nil end return v end

local function stat() return { n = 0, sum = 0, min = nil, max = nil } end
local function push(st, v)
  v = tonumber(v)
  if v == nil then return end
  st.n, st.sum = st.n + 1, st.sum + v
  if st.min == nil or v < st.min then st.min = v end
  if st.max == nil or v > st.max then st.max = v end
end
local function triple(st)
  if st.n == 0 then return nil end
  return { st.min, round1(st.sum / st.n), st.max }
end

-- what makes "the same cell" within an hour
local function cell_key(s)
  return table.concat({ tostring(nn(s.slot)), tostring(nn(s.cell_id) or nn(s.id)), tostring(nn(s.band)),
                        tostring(nn(s.pci)), tostring(nn(s.pcc_rat) or nn(s.mode)) }, "|")
end

function M.new(period_s, poll_s)
  period_s, poll_s = period_s or 3600, poll_s or 10
  local o = { bucket = nil, order = {}, recs = {} }

  local function rec(k, s, no_service)
    local r = o.recs[k]
    if r then return r end
    r = { n = 0, slot = nn(s.slot), no_service = no_service or nil }
    if not no_service then
      r.carrier, r.rat, r.band = nn(s.carrier), nn(s.pcc_rat) or nn(s.mode), nn(s.band)
      r.cell, r.pci, r.ch = nn(s.cell_id) or nn(s.id), nn(s.pci), nn(s.tx_channel)
      r.rsrp, r.sinr, r.rsrq, r.rx, r.tx = stat(), stat(), stat(), stat(), stat()
      r.ping_n, r.ping_lost, r.ping = 0, 0, stat()
    end
    o.recs[k] = r
    o.order[#o.order + 1] = k
    return r
  end

  function o.drain()
    if o.bucket == nil then return {} end
    local out = {}
    for _, k in ipairs(o.order) do
      local r = o.recs[k]
      local line = { t = o.bucket * 1000, secs = r.n * poll_s, slot = r.slot }
      if r.no_service then
        line.no_service = true
      else
        line.carrier, line.rat, line.band, line.cell, line.pci, line.ch = r.carrier, r.rat, r.band, r.cell, r.pci, r.ch
        line.rsrp, line.sinr, line.rsrq = triple(r.rsrp), triple(r.sinr), triple(r.rsrq)
        if r.ping_n > 0 then
          line.ping_n, line.ping_lost = r.ping_n, r.ping_lost
          if r.ping.n > 0 then line.ping_ms = round1(r.ping.sum / r.ping.n) end
        end
        if r.rx.n > 0 then line.rx_kbps, line.rx_max = math.floor(r.rx.sum / r.rx.n + 0.5), r.rx.max end
        if r.tx.n > 0 then line.tx_kbps = math.floor(r.tx.sum / r.tx.n + 0.5) end
      end
      out[#out + 1] = line
    end
    o.bucket, o.order, o.recs = nil, {}, {}
    return out
  end

  -- s = a collector sample (cellular_compat.build_sample + rx/tx_kbps + ping_ms/ping_lost)
  function o.add(s)
    if type(s) ~= "table" or type(s.t) ~= "number" then return nil end
    local b = math.floor(s.t / 1000 / period_s) * period_s
    local done
    if o.bucket ~= nil and b ~= o.bucket then done = o.drain() end
    o.bucket = b
    local registered = s.registered ~= false and (nn(s.cell_id) ~= nil or nn(s.id) ~= nil)
    local r
    if registered then r = rec(cell_key(s), s) else r = rec("none|" .. tostring(s.slot), s, true) end
    r.n = r.n + 1
    if registered then
      push(r.rsrp, s.rsrp); push(r.sinr, s.sinr); push(r.rsrq, s.rsrq)
      push(r.rx, s.rx_kbps); push(r.tx, s.tx_kbps)
      if nn(s.ping_ms) ~= nil then r.ping_n = r.ping_n + 1; push(r.ping, s.ping_ms) end
      if s.ping_lost == true then r.ping_n, r.ping_lost = r.ping_n + 1, r.ping_lost + 1 end
    end
    return done
  end

  return o
end

return M
