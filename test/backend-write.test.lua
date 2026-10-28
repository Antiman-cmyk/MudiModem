-- Isolation test for set_bands/confirm/revert_now (GL 4.10 band API). Shims
-- oui.ubus (canned reads), ngx.location.capture (GL's glc: get/set_band_config,
-- get_cell_tower) AND os.execute so NO real write and NO real process launch
-- ever happen; pending/armed go to temp paths (env). Proves the safety
-- interlock: set_bands must refuse to write unless the watchdog armed first,
-- and the ONE write is GL's set_band_config with the exact payload GL's own
-- UI sends.
--
-- Env (set by the runner): MUDIMODEM_PENDING, MUDIMODEM_ARMED, MUDIMODEM_BIN, MM_PLUGIN

local PENDING = assert(os.getenv("MUDIMODEM_PENDING"), "set MUDIMODEM_PENDING")
local ARMED   = assert(os.getenv("MUDIMODEM_ARMED"),   "set MUDIMODEM_ARMED")
local cjson = require "cjson"

-- ---- shim oui.ubus: canned 4.10 reads (bus-scoped status is FLAT) ----
local at_cmds = {}
package.loaded["oui.ubus"] = {
  call = function(object, method, params)
    if object == "modem.CPU.AT" and method == "get_result_AT" then
      at_cmds[#at_cmds + 1] = params.cmd
      if params.cmd == "AT+QSPN" then
        return { data = '\r\n+QSPN: "CHN-UNICOM","UNICOM","",0,"46001"\r\n\r\nOK\r\n' }
      end
      return { data = "\r\nOK\r\n" }
    elseif object == "cellular.modem" and method == "status" then
      return { modems = { { bus = "cpu", current_sim_slot = 1, slot_switch_enable = true } } }
    elseif object == "cellular.modem" and method == "info" then
      return { modems = { { bus = "cpu", type = 0, name = "RG650V-EU",
        band = { LTE = { 1, 3, 7, 8, 20, 28 }, ["NR-NSA"] = { 1, 3, 78 }, ["NR-SA"] = { 1, 3, 28, 78 } } } } }
    elseif object == "cellular.sim" and method == "info" then
      return { sims = { { slot = 1, mcc = "460", mnc = "01" } } }
    end
    return {}
  end
}

local base_ubus_call = package.loaded["oui.ubus"].call

-- ---- shim glc (nginx subrequest to modem.so): record set_band_config ----
local glc_calls, set_calls = {}, {}
local band_cfg = { band_enable = true, network_mode = "NR5G", band_filter_mode = 0, supports_band = true,
                   band_list = { LTE = { 3, 7 }, ["NR-NSA"] = { 78 }, ["NR-SA"] = { 78 } } }
local set_fail = false
ngx = {
  HTTP_POST = "POST",
  location = { capture = function(uri, opts)
    local body = opts and opts.body or ""
    glc_calls[#glc_calls + 1] = body
    local req = cjson.decode(body)
    if req.method == "get_band_config" then
      assert(req.args.bus == "cpu" and req.args.slot == 1, "get_band_config needs bus+slot")
      return { status = 200, body = "0 " .. cjson.encode(band_cfg) }
    elseif req.method == "set_band_config" then
      set_calls[#set_calls + 1] = req.args
      if set_fail then return { status = 200, body = "20002050 refused" } end
      return { status = 200, body = "0 {}" }
    elseif req.method == "get_cell_tower" then
      return { status = 200, body = '0 {"slot1":{},"slot2":{}}' }
    end
    return { status = 200, body = "0 {}" }
  end },
}

-- ---- shim os.execute: record, and (optionally) simulate the watchdog arming ----
local exec_cmds = {}
local ARM_ON_WATCH = true
os.execute = function(cmd)
  exec_cmds[#exec_cmds + 1] = cmd
  if ARM_ON_WATCH and cmd:find("watch") then
    local f = io.open(ARMED, "w"); if f then f:close() end
  end
  return true
end

local M = dofile(os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(type(M.set_bands) == "function" and type(M.confirm) == "function" and type(M.revert_now) == "function")

local function reset()
  at_cmds = {}; exec_cmds = {}; glc_calls = {}; set_calls = {}; set_fail = false
  band_cfg = { band_enable = true, network_mode = "NR5G", band_filter_mode = 0, supports_band = true,
               band_list = { LTE = { 3, 7 }, ["NR-NSA"] = { 78 }, ["NR-SA"] = { 78 } } }
  os.remove(PENDING); os.remove(ARMED)
end
local function pget(key)
  for line in io.lines(PENDING) do
    local k, v = line:match("^([%w_]+)=(.*)$"); if k == key then return (v:match("^'(.*)'$") or v) end
  end
end
local function list(t) local o = {} for _, v in ipairs(t or {}) do o[#o + 1] = tostring(v) end return table.concat(o, ",") end

-- 1. Happy path (SA only): snapshot -> arm -> ONE set_band_config; unchanged
--    RATs keep their current allowlist; mode kept; pending holds the snapshot.
reset()
local r = M.set_bands({ sa = { 78, 28 } })
assert(r.ok == true, "set_bands should succeed; got: " .. tostring(r.error))
assert(r.applied.sa == "28:78" and r.applied.mode == "NR5G", "applied wrong: " .. cjson.encode(r.applied))
assert(r.slot == 1, "slot wrong")
assert(#set_calls == 1, "exactly one set_band_config")
local p = set_calls[1]
assert(p.bus == "cpu" and p.slot == 1 and p.band_enable == true and p.network_mode == "NR5G", "payload head wrong")
assert(list(p.band_list["NR-SA"]) == "28,78", "NR-SA wrong: " .. list(p.band_list["NR-SA"]))
assert(list(p.band_list["LTE"]) == "3,7", "LTE must keep the current allowlist")
assert(list(p.band_list["NR-NSA"]) == "78", "NSA must keep the current allowlist")
assert(p.band_filter_mode == nil, "never send band_filter_mode")
local i_watch, i_set
for i, c in ipairs(exec_cmds) do if c:find("watch") then i_watch = i end end
assert(i_watch, "must launch the watchdog (through the detach wrapper)")
assert(exec_cmds[i_watch]:find("mudimodem%-detach") or os.getenv("MUDIMODEM_DETACH"), "watchdog must be spawned detached")
local snap = cjson.decode(pget("PREV_BAND_CONFIG"))
assert(snap.band_enable == true and snap.network_mode == "NR5G" and list(snap.band_list["NR-SA"]) == "78",
       "pending must capture the previous config verbatim")
assert(pget("KIND") == "bands" and pget("SLOT") == "1", "pending KIND/SLOT wrong")
assert(pget("SUB_ID") == nil, "bands are slot-addressed: no sub_id in the pending file")
assert(#at_cmds == 0, "set_bands is slot-addressed end to end: no AT at all (not even a QSPN); spent: " .. table.concat(at_cmds, ","))
print("  ok  - happy path: snapshot, armed, one set_band_config, unchanged RATs kept, zero AT")

-- 1a. A page showing SIM2's picture while SIM1 is active is refused before
--     anything is armed or written (the active SIM changed under it).
reset()
r = M.set_bands({ sa = { 78 }, slot = 2 })
assert(r.error and r.slot_changed == true and r.slot == 1, "stale-slot write must be refused; got " .. cjson.encode(r))
assert(#set_calls == 0 and #exec_cmds == 0, "a stale-slot refusal must not arm or write")
r = M.set_bands({ sa = { 78 }, slot = 1 })
assert(r.ok, "a matching slot must pass: " .. tostring(r.error))
print("  ok  - write refused when the active SIM changed under the page")

-- 1b. Multi-RAT + mode: every list sorted, mode applied.
reset()
r = M.set_bands({ sa = { 78, 1 }, lte = { 20, 3, 7 }, mode = "AUTO" })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(p.network_mode == "AUTO" and list(p.band_list["NR-SA"]) == "1,78" and list(p.band_list["LTE"]) == "3,7,20")
assert(r.applied.lte == "3:7:20" and r.applied.mode == "AUTO")
print("  ok  - multi-RAT + mode")

-- 1c. GL's rule: mode LTE empties both NR lists in the payload.
reset()
r = M.set_bands({ mode = "LTE" })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(p.network_mode == "LTE" and #p.band_list["NR-SA"] == 0 and #p.band_list["NR-NSA"] == 0, "LTE mode must empty NR lists")
assert(list(p.band_list["LTE"]) == "3,7")
print("  ok  - LTE mode empties the NR lists (GL's rule)")

-- 1d. Filtering currently OFF: omitted RATs fill from the module-supported set.
reset()
band_cfg = { band_enable = false, network_mode = "AUTO", supports_band = true }
r = M.set_bands({ sa = { 78 } })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(list(p.band_list["LTE"]) == "1,3,7,8,20,28" and list(p.band_list["NR-NSA"]) == "1,3,78", "must fill from supported when filtering was off")
assert(list(p.band_list["NR-SA"]) == "78")
snap = cjson.decode(pget("PREV_BAND_CONFIG"))
assert(snap.band_enable == false and snap.band_list == nil, "snapshot of an open config carries no band_list")
print("  ok  - filtering-off baseline fills from supported; snapshot is the open config")

-- 1d2. Filtering OFF and ONLY the mode changes: filtering must STAY off (a
--      materialised allowlist would silently pin every module band).
reset()
band_cfg = { band_enable = false, network_mode = "AUTO", supports_band = true }
r = M.set_bands({ mode = "NR5G" })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(p.band_enable == false and p.band_list == nil and p.network_mode == "NR5G",
       "mode-only apply on an open config must keep filtering off: " .. cjson.encode(p))
assert(r.applied.mode == "NR5G" and r.applied.sa == nil, "applied must report only the mode")
print("  ok  - mode-only apply keeps filtering off")

-- 1d3. LTE -> AUTO with GL's EMPTY NR lists (GL empties them under LTE): an
--      empty list is not an allowlist — NR falls back to every supported band.
reset()
band_cfg = { band_enable = true, network_mode = "LTE", supports_band = true,
             band_list = { LTE = { 3, 7 }, ["NR-NSA"] = {}, ["NR-SA"] = {} } }
r = M.set_bands({ mode = "AUTO" })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(p.network_mode == "AUTO" and list(p.band_list["LTE"]) == "3,7", "LTE list kept")
assert(list(p.band_list["NR-SA"]) == "1,3,28,78" and list(p.band_list["NR-NSA"]) == "1,3,78",
       "empty NR lists must widen to the supported set under AUTO, not be written back empty: " .. cjson.encode(p.band_list))
print("  ok  - LTE->AUTO fills empty NR lists from supported (never NR-SA:[])")

-- 1d4. An NR list under 4G-only is refused, never silently dropped-but-reported.
reset()
band_cfg = { band_enable = true, network_mode = "LTE", supports_band = true,
             band_list = { LTE = { 3, 7 }, ["NR-NSA"] = {}, ["NR-SA"] = {} } }
r = M.set_bands({ sa = { 71 } })                       -- mode inherited = LTE
assert(r.error and r.error:find("4G%-only"), "NR list under LTE must be refused; got " .. tostring(r.error))
assert(#set_calls == 0 and #exec_cmds == 0, "refusal must not write or arm")
r = M.set_bands({ mode = "LTE", sa = { 71 } })
assert(r.error and r.error:find("4G%-only"), "explicit LTE + NR list must be refused")
print("  ok  - NR lists under 4G-only refused (applied can't lie)")

-- 1d5. `applied` reports what GL is asked to store, from the payload.
reset()
r = M.set_bands({ sa = { 78, 28 }, mode = "AUTO" })
assert(r.ok and r.applied.sa == "28:78" and r.applied.mode == "AUTO" and r.applied.lte == nil, cjson.encode(r.applied))
print("  ok  - applied mirrors the payload")

-- 1f. GL stores a mode outside AUTO/NR5G/LTE (the LTE:NR5G a GL 4G tower lock
--     leaves behind): a band-only apply passes it through verbatim, and so
--     does the revert snapshot — never rewritten to AUTO.
reset()
band_cfg = { band_enable = true, network_mode = "LTE:NR5G", supports_band = true,
             band_list = { LTE = { 3, 7 }, ["NR-NSA"] = { 78 }, ["NR-SA"] = { 78 } } }
r = M.set_bands({ lte = { 3, 7, 20 } })
assert(r.ok, tostring(r.error))
p = set_calls[1]
assert(p.network_mode == "LTE:NR5G", "unknown stored mode must pass through, got " .. tostring(p.network_mode))
snap = cjson.decode(pget("PREV_BAND_CONFIG"))
assert(snap.network_mode == "LTE:NR5G", "snapshot must keep GL's mode verbatim")
print("  ok  - unrecognised stored mode passes through untouched")

-- 1g. sub_id resolution (get_bands' AT reads) — the SIM1/SIM2 cases.
--     A shim per case: QSPN / CIMI answers per sub_id, the active slot, and
--     cellular.sim info for that slot. Every case is a fresh SIM (distinct
--     iccid), so the per-worker cache cannot answer for it.
local function resolve_case(c)
  at_cmds = {}
  local subs = {}
  package.loaded["oui.ubus"].call = function(o, m, prm)
    if o == "modem.CPU.AT" and prm then
      at_cmds[#at_cmds + 1] = prm.cmd .. "@" .. tostring(prm.sub_id)
      subs[#subs + 1] = prm.sub_id
      if prm.cmd == "AT+QSPN" and c.qspn[prm.sub_id] then
        return { data = '\r\n+QSPN: "X","X","",0,"' .. c.qspn[prm.sub_id] .. '"\r\n\r\nOK\r\n' }
      elseif prm.cmd == "AT+CIMI" and c.cimi and c.cimi[prm.sub_id] then
        return { data = "\r\n" .. c.cimi[prm.sub_id] .. "\r\n\r\nOK\r\n" }
      elseif prm.cmd == "AT+CIMI" then
        return { data = "\r\nERROR\r\n" }
      end
      return { data = "\r\nOK\r\n" }
    elseif o == "cellular.modem" and m == "status" then
      return { modems = { { bus = "cpu", current_sim_slot = c.slot } } }
    elseif o == "cellular.sim" and m == "info" then
      return { sims = { c.sim } }
    end
    return base_ubus_call(o, m, prm)
  end
  local res = M.get_bands({})
  package.loaded["oui.ubus"].call = base_ubus_call
  for _, sid in ipairs(subs) do assert(sid ~= 0, "sub_id 0 must never be sent; sent: " .. table.concat(at_cmds, ",")) end
  return res.meta
end
local cap = ngx.location.capture
ngx.location.capture = function(uri, opts)   -- get_band_config for whichever slot is active
  local req = cjson.decode(opts.body)
  if req.method == "get_band_config" then return { status = 200, body = "0 " .. cjson.encode(band_cfg) } end
  return cap(uri, opts)
end

-- (a) The reported bug: TWO SIMs OF THE SAME CARRIER, SIM2 active. The PLMN
--     matches at sub_id 1 too; leading with 1 picked SIM1 for SIM2.
local meta = resolve_case({ slot = 2, qspn = { [1] = "310260", [2] = "310260" },
  sim = { bus = "cpu", slot = 2, iccid = "8901-a", mcc = "310", mnc = "260" } })
assert(meta.sub_id == 2 and meta.plmn_matched == true, "SIM2 must resolve to sub_id 2, got " .. tostring(meta.sub_id))
print("  ok  - same-carrier SIM2 resolves to its own sub_id, not SIM1's")

-- (b) IMSI (AT+CIMI) tells same-carrier SIMs apart even if the sub order lied.
meta = resolve_case({ slot = 2, qspn = { [1] = "310260", [2] = "310260" },
  cimi = { [1] = "310260000000001", [2] = "310260000000002" },
  sim = { bus = "cpu", slot = 2, iccid = "8901-b", mcc = "310", mnc = "260", imsi = "310260000000002" } })
assert(meta.sub_id == 2 and meta.plmn_matched == true, "IMSI must pick sub_id 2")
meta = resolve_case({ slot = 1, qspn = { [1] = "310260", [2] = "310260" },
  cimi = { [1] = "310260000000002", [2] = "310260000000001" },     -- mapping swapped on this unit
  sim = { bus = "cpu", slot = 1, iccid = "8901-c", mcc = "310", mnc = "260", imsi = "310260000000001" } })
assert(meta.sub_id == 2 and meta.plmn_matched == true, "IMSI must win over the slot-first guess")
print("  ok  - IMSI separates same-carrier SIMs")

-- (c) Roaming: QSPN reports the VISITED network, the SIM's mcc/mnc is home —
--     a PLMN match can never confirm; the IMSI does.
meta = resolve_case({ slot = 1, qspn = { [1] = "310260", [2] = "310410" },
  cimi = { [1] = "234150000000009", [2] = "310410000000003" },
  sim = { bus = "cpu", slot = 1, iccid = "8944-d", mcc = "234", mnc = "15", imsi = "234150000000009" } })
assert(meta.sub_id == 1 and meta.plmn_matched == true, "a roaming SIM must be confirmed by IMSI")
print("  ok  - roaming SIM confirmed by IMSI")

-- (d) CIMI answers but no candidate carries the SIM's IMSI: unconfirmed — a
--     PLMN fallback could only land on the wrong SIM. Fallback = the slot's own.
meta = resolve_case({ slot = 2, qspn = { [1] = "310260", [2] = "310260" },
  cimi = { [1] = "310260000000007", [2] = "310260000000008" },
  sim = { bus = "cpu", slot = 2, iccid = "8901-e", mcc = "310", mnc = "260", imsi = "310260000000002" } })
assert(meta.sub_id == 2 and meta.plmn_matched == false, "IMSI mismatch must stay unconfirmed")
for _, c in ipairs(at_cmds) do assert(not c:find("QSPN", 1, true), "no PLMN fallback once CIMI answered: " .. c) end
print("  ok  - IMSI mismatch is unconfirmed, no PLMN guess")

-- (e) Only sub_id 0 would match: 0 is never sent, the answer is unconfirmed and
--     falls back to the slot's own sub_id (never sub_id 1 for slot 2).
meta = resolve_case({ slot = 2, qspn = { [0] = "46002", [1] = "46000", [2] = "46000" },
  sim = { bus = "cpu", slot = 2, iccid = "8986-f", mcc = "460", mnc = "02" } })
assert(meta.sub_id == 2 and meta.plmn_matched == false, "unconfirmed SIM2 must fall back to sub_id 2, got " .. tostring(meta.sub_id))
print("  ok  - sub_id 0 never sent; unconfirmed falls back to the slot's own sub_id")

-- (f) A confirmed answer is cached per SIM: a second read spends no QSPN.
local same = { slot = 2, qspn = { [1] = "310410", [2] = "310260" },
  sim = { bus = "cpu", slot = 2, iccid = "8901-g", mcc = "310", mnc = "260" } }
resolve_case(same)
resolve_case(same)
assert(#at_cmds == 2, "cached sub_id: only the two band reads remain; spent: " .. table.concat(at_cmds, ","))
print("  ok  - confirmed sub_id cached per SIM")
ngx.location.capture = cap
package.loaded["oui.ubus"].call = base_ubus_call

-- 1h. get_bands {light=1}: config + mode + lock from GL's store, ZERO AT (no
--     QSPN either — the slot comes straight from cellular.modem status).
reset()
at_cmds = {}
r = M.get_bands({ light = 1 })
assert(r.config and r.meta and r.meta.light == true, "light must return config+meta")
assert(r.policy == nil and r.capability == nil and r.supported == nil, "light must not carry the AT-derived layers")
assert(r.meta.mode == "NR5G" and r.meta.lock and r.meta.lock.active == false, cjson.encode(r.meta))
assert(#at_cmds == 0, "light get_bands must spend no AT at all; spent: " .. table.concat(at_cmds, ","))
print("  ok  - light get_bands: zero AT")

-- 1e. reset=true: GL's true default — filtering off + AUTO, no band_list at all.
reset()
r = M.set_bands({ reset = true })
assert(r.ok and r.applied.reset == true and r.applied.mode == "AUTO", tostring(r.error))
p = set_calls[1]
assert(p.band_enable == false and p.network_mode == "AUTO" and p.band_list == nil, "reset payload wrong")
print("  ok  - reset writes band_enable=false + AUTO")

-- 2. Empty list is refused — no launch, no write.
reset()
r = M.set_bands({ sa = {} })
assert(r.error and r.error:find("empty"), "empty list must be refused")
assert(#set_calls == 0 and #exec_cmds == 0, "empty must not touch anything")
print("  ok  - empty band list refused")

-- 3. Invalid band / mode refused.
reset()
assert(M.set_bands({ sa = { "7x" } }).error:find("invalid"), "invalid band must be refused")
assert(M.set_bands({ mode = "6G" }).error:find("invalid mode"), "invalid mode must be refused")
print("  ok  - invalid inputs refused")

-- 4. Watchdog fails to arm -> NO write, pending cleaned up.
reset()
ARM_ON_WATCH = false
r = M.set_bands({ sa = { 78 } })
ARM_ON_WATCH = true
assert(r.error and r.error:find("arm"), "must fail when watchdog does not arm")
assert(#set_calls == 0, "must NOT write without a live net")
assert(not io.open(PENDING, "r"), "pending must be cleaned up on arm failure")
print("  ok  - no arm => no write (THE safety interlock)")

-- 5. GL refuses the write -> fail CLOSED: pending removed, error surfaced, nothing changed.
reset()
set_fail = true
r = M.set_bands({ sa = { 78 } })
assert(r.error and tostring(r.error):find("20002050"), "GL error code must surface")
assert(not io.open(PENDING, "r"), "pending must be removed when the write fails")
print("  ok  - GL refusal => fail closed")

-- 6. confirm: removes pending, durable, writes NOTHING (the apply already persisted).
reset()
assert(M.set_bands({ sa = { 78, 28 } }).ok)
set_calls = {}
r = M.confirm({})
assert(r.ok and r.confirmed and r.durable == true, "confirm wrong")
assert(not io.open(PENDING, "r"), "confirm must remove pending")
assert(#set_calls == 0, "confirm must not write anything")
print("  ok  - confirm = delete pending, durable by construction")

-- 7. revert_now: writes the snapshot back through set_band_config, clears pending.
reset()
assert(M.set_bands({ sa = { 78, 28 }, mode = "AUTO" }).ok)
set_calls = {}
r = M.revert_now({})
assert(r.ok and r.reverted, "revert_now failed: " .. tostring(r.error))
assert(#set_calls == 1, "revert must write exactly once")
p = set_calls[1]
assert(p.network_mode == "NR5G" and list(p.band_list["NR-SA"]) == "78" and list(p.band_list["LTE"]) == "3,7", "revert must restore the snapshot")
assert(not io.open(PENDING, "r"), "pending must be gone after revert")
print("  ok  - revert_now restores the snapshot via set_band_config")

-- 7b. revert_now when GL refuses: pending + watchdog stay (it retries at window end).
reset()
assert(M.set_bands({ sa = { 78 } }).ok)
set_fail = true
r = M.revert_now({})
assert(r.error and r.error:find("watchdog still armed"), "must keep the net armed on a failed restore")
assert(io.open(PENDING, "r"), "pending must remain for the watchdog")
print("  ok  - failed revert keeps the watchdog armed")

-- 8. Refuse while another change is pending.
reset()
local f = io.open(PENDING, "w"); f:write("KIND=bands\nSUB_ID=1\n"); f:close()
r = M.set_bands({ sa = { 78 } })
assert(r.error and r.error:find("pending"), "must refuse while pending exists")
print("  ok  - refuses while pending")

print("ALL SET_BANDS TESTS PASSED")
