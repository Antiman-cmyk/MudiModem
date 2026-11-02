-- cellular_compat.lua — GL 4.10's cellular ubus shapes -> MudiModem's normalized sample, in Lua.
--
-- A line-for-line port of src/lib/cellular_compat.py (which stays the reference while the Python
-- collector runs): test/compat-parity.test.py feeds both the same payloads and requires identical
-- JSON. Written in the Lua 5.1 / 5.4 common subset so the eco daemon (5.4) and the nginx plugin
-- (OpenWrt 5.1, 32-bit LNUM integers — no value here exceeds that) can share it.
--
-- `null` is the JSON null the caller's cjson uses (cjson.null): the normalized sample keeps
-- every key, with null for "unknown", exactly as the Python version emits None.
-- Contract: docs/cellular-api-4.10.md §2/§3.
local M = {}

local null = false        -- set by M.init(cjson.null); `false` only until then (tests set it)
function M.init(json_null) null = json_null; M.null = json_null end

local function isnull(v) return v == nil or v == null end
local function nn(v) if isnull(v) then return nil end return v end   -- null -> nil
local function out(v) if v == nil then return null end return v end  -- nil -> null

-- GL's numeric network_type -> mode. Settled from the 4.10 image + two live captures (the
-- display map {2:2G,3:3G,4:4G,41:4G+,5:5G SA,51:5G NSA}); GL's getNetworkType map is wrong.
M.NETWORK_TYPE = { [1] = "GSM", [2] = "2G", [3] = "3G", [4] = "LTE", [41] = "LTE+",
                   [5] = "NR5G-SA", [51] = "NR5G-NSA", [6] = "EVDO" }
M.SENTINEL_METRIC = -32768
M.EUTRA_ARFCN_MAX = 65535

-- "-97" / -97 / 17.5 -> number; nil for empty / junk / the -32768 sentinel. Integral values come
-- back as integers (math.floor) so JSON shows 5, not 5.0, matching Python's int().
local function num(v)
  v = nn(v)
  if v == nil or v == "" then return nil end
  local f = tonumber(v)
  if f == nil or f ~= f then return nil end
  if f == M.SENTINEL_METRIC then return nil end
  if f == math.floor(f) and f > -2^31 and f < 2^31 then return math.floor(f) end
  return f
end
M.num = num

-- (network_type, mode) or (nil, nil); an unknown code keeps the number and a "type N" label.
function M.normalize_network_type(nt)
  local n = num(nt)
  if n == nil then return nil, nil end
  n = math.floor(n)
  if n == 0 then return 0, nil end
  return n, M.NETWORK_TYPE[n] or ("type " .. n)
end

function M.is_nr(mode) return type(mode) == "string" and mode:find("NR5G", 1, true) ~= nil end

-- The built-in modem out of `cellular.modem status`/`info` called WITHOUT args: {modems:[...]}.
function M.pick_modem(payload, bus)
  bus = bus or "cpu"
  if type(payload) ~= "table" or type(payload.modems) ~= "table" then return {} end
  for _, m in ipairs(payload.modems) do
    if type(m) == "table" and (m.bus == bus or m.type == 0) then return m end
  end
  local first = payload.modems[1]
  return type(first) == "table" and first or {}
end

function M.active_slot(modem_status, bus)
  local s = num(M.pick_modem(modem_status, bus).current_sim_slot)
  return s and math.floor(s) or nil
end

local function zero_none(v) local n = num(v); if n == nil or n == 0 then return nil end return n end

-- Python's row.get(k1, row.get(k2, ...)): the first key that is PRESENT wins, even when its value
-- is JSON null (cjson.null is not nil in Lua, so "present" is simply ~= nil).
local function getd(row, ...)
  for i = 1, select("#", ...) do local v = row[select(i, ...)]; if v ~= nil then return v end end
  return nil
end

-- The RAT of ONE carrier row (see the Python docstring: an NR-tagged row on an E-UTRA channel is
-- the QENG fallback anchor, i.e. LTE; an untagged row under NSA is LTE at index 0 / on E-UTRA).
local function row_network_type(row, cell_nt, index)
  local ch = num(getd(row, "earfcn", "tx_channel"))
  local on_eutra = ch ~= nil and ch >= 0 and ch <= M.EUTRA_ARFCN_MAX
  local explicit = nn(row.network_type)
  if explicit ~= nil and explicit ~= "" then
    local n = num(explicit)
    if n ~= nil and (math.floor(n) == 5 or math.floor(n) == 51) and on_eutra then return 4 end
    return explicit
  end
  local cn = num(cell_nt)
  if cn ~= nil and math.floor(cn) == 51 and (index == 0 or on_eutra) then return 4 end
  return cell_nt
end

function M.normalize_signal(row, network_type, index)
  row = type(row) == "table" and row or {}
  index = index or 0
  local ca = num(row.ca)
  ca = ca ~= nil and math.floor(ca) or index
  local nt, mode = M.normalize_network_type(row_network_type(row, network_type, index))
  if nt == 0 then nt, mode = 0, nil end
  local bw = num(getd(row, "bandwidth_dl", "bandwidth", "dl_bandwidth"))
  local bw_ul = num(row.bandwidth_ul)
  return {
    role = (ca == 0) and "PCC" or ("SCC" .. ca),
    ca = ca,
    network_type = out(nt),
    rat = out(mode),
    -- band 0 is never valid (sentinel); PCI 0 and EARFCN 0 ARE valid — keep them.
    band = out(zero_none(row.band)),
    earfcn = out(num(getd(row, "earfcn", "tx_channel"))),
    pci = out(num(row.pci)),
    bandwidth_mhz = out((bw ~= nil and bw ~= 0) and bw or nil),
    bandwidth_ul_mhz = out((bw_ul ~= nil and bw_ul ~= 0) and bw_ul or nil),
    rsrp = out(num(row.rsrp)), rsrq = out(num(row.rsrq)), sinr = out(num(row.sinr)), rssi = out(num(row.rssi)),
    rsrp_level = out(num(row.rsrp_level)), rsrq_level = out(num(row.rsrq_level)), sinr_level = out(num(row.sinr_level)),
  }
end

-- A FAILED read (nil / an error reply without network_type) vs a reply that says "no service".
function M.cell_info_failed(payload)
  return type(payload) ~= "table" or isnull(payload.network_type) or payload.network_type == ""
end

function M.normalize_cell_info(payload)
  local p = type(payload) == "table" and payload or {}
  local nt, mode = M.normalize_network_type(p.network_type)
  -- Python's `p.get(k) or None`: every falsy value ("" / 0 / false / null) is None
  local function truthy(v) v = nn(v); if v == "" or v == 0 or v == false then return nil end return v end
  local cell_id, tac = truthy(p.cell_id), truthy(p.tac)
  local sigs = {}
  if nt ~= nil and nt ~= 0 and type(p.signal) == "table" then
    for i, row in ipairs(p.signal) do
      local s = M.normalize_signal(row, nt, i - 1)
      -- a sentinel row (band 0, every metric -32768) is not a carrier
      if not (isnull(s.band) and isnull(s.rsrp) and isnull(s.rsrq) and isnull(s.sinr)) then
        sigs[#sigs + 1] = s
      end
    end
  end
  if nt == 0 then nt, mode, cell_id, tac = nil, nil, nil, nil end
  return { network_type = nt, rat = mode, cell_id = cell_id, tac = tac, signals = sigs }
end

function M.carrier_for_slot(networks_info, slot, bus)
  bus = bus or "cpu"
  local nets = type(networks_info) == "table" and networks_info.networks
  if type(nets) ~= "table" then return "" end
  for _, n in ipairs(nets) do
    if type(n) == "table" and tostring(nn(n.slot)) == tostring(slot) and (isnull(n.bus) or n.bus == bus) then
      local c = nn(n.carrier)
      return (c ~= nil and c ~= false) and c or ""
    end
  end
  return ""
end

-- "%g" as Python formats a bandwidth: 15 -> "15", 1.4 -> "1.4".
local function g(v) return (string.format("%g", v)) end

-- One normalized sample; nil when the active slot is unknown. `empty_array` marks signals as a
-- JSON array even when empty (cjson encodes an empty table as {} otherwise).
function M.build_sample(modem_status, cell_info, networks_info, t, bus, carrier, empty_array)
  local slot = M.active_slot(modem_status, bus)
  if slot == nil then return nil end
  local ci = M.normalize_cell_info(cell_info)
  local pcc = ci.signals[1] or {}
  if carrier == nil then carrier = M.carrier_for_slot(networks_info, slot, bus) end
  local bw = nn(pcc.bandwidth_mhz)
  local signals = ci.signals
  if #signals == 0 and empty_array then signals = empty_array end
  return {
    t = out(t), slot = slot, registered = ci.rat ~= nil, carrier = carrier or "",
    rat = out(ci.rat), network_type = out(ci.network_type), cell_id = out(ci.cell_id), tac = out(ci.tac),
    signals = signals,
    -- flattened PCC aliases (single-carrier consumers)
    id = out(ci.cell_id), band = out(nn(pcc.band)), mode = out(ci.rat),
    pcc_rat = out(nn(pcc.rat)), pcc_network_type = out(nn(pcc.network_type)),
    pci = out(nn(pcc.pci)), tx_channel = out(nn(pcc.earfcn)),
    dl_bandwidth = out(bw ~= nil and (g(bw) .. "MHz") or nil),
    rsrp = out(nn(pcc.rsrp)), rsrq = out(nn(pcc.rsrq)), sinr = out(nn(pcc.sinr)), rssi = out(nn(pcc.rssi)),
    rsrp_level = out(nn(pcc.rsrp_level)), rsrq_level = out(nn(pcc.rsrq_level)), sinr_level = out(nn(pcc.sinr_level)),
  }
end

-- ---- RF metadata (3GPP) -------------------------------------------------------------------------
local function round(x, d) local m = 10 ^ d; local r = math.floor(x * m + 0.5) / m; return r end

function M.nr_arfcn_to_mhz(n)
  n = num(n)
  if n == nil or n <= 0 then return nil end
  n = math.floor(n)
  if n < 600000 then return round(n * 0.005, 3) end
  if n < 2016667 then return round(3000 + (n - 600000) * 0.015, 3) end
  return round(24250.08 + (n - 2016667) * 0.06, 3)
end

-- LTE band -> {F_DL_low MHz, N_Offs-DL} (3GPP TS 36.101 table 5.7.3-1)
M.LTE_EARFCN = {
  [1] = { 2110, 0 }, [2] = { 1930, 600 }, [3] = { 1805, 1200 }, [4] = { 2110, 1950 }, [5] = { 869, 2400 },
  [7] = { 2620, 2750 }, [8] = { 925, 3450 }, [12] = { 729, 5010 }, [13] = { 746, 5180 }, [14] = { 758, 5280 },
  [17] = { 734, 5730 }, [18] = { 860, 5850 }, [19] = { 875, 6000 }, [20] = { 791, 6150 }, [25] = { 1930, 8040 },
  [26] = { 859, 8690 }, [28] = { 758, 9210 }, [29] = { 717, 9660 }, [30] = { 2350, 9770 }, [32] = { 1452, 9920 },
  [34] = { 2010, 36200 }, [38] = { 2570, 37750 }, [39] = { 1880, 38250 }, [40] = { 2300, 38650 },
  [41] = { 2496, 39650 }, [42] = { 3400, 41590 }, [43] = { 3600, 43590 }, [46] = { 5150, 46790 },
  [48] = { 3550, 55240 }, [66] = { 2110, 66436 }, [71] = { 617, 68586 },
}

function M.lte_earfcn_to_mhz(band, earfcn)
  local b, n = num(band), num(earfcn)
  if b == nil or n == nil then return nil end
  local e = M.LTE_EARFCN[math.floor(b)]
  if not e then return nil end
  return round(e[1] + 0.1 * (math.floor(n) - e[2]), 1)
end

function M.channel_mhz(rat, band, arfcn)
  if M.is_nr(rat) then return M.nr_arfcn_to_mhz(arfcn) end
  return M.lte_earfcn_to_mhz(band, arfcn)
end

function M.format_band(rat, band)
  if isnull(band) then return "—" end
  return (M.is_nr(rat) and "n" or "B") .. tostring(band)
end

return M
