-- MudiModem RPC backend: get_lock, the cell scan job, set_cell_lock / clear_cell_lock.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, PENDING, BUS, LAST_SCAN, nn, job_wait = C.cjson, C.PENDING, C.BUS, C.LAST_SCAN, C.nn, C.job_wait
local job, at, file_exists, pending_get, arm_watchdog, WINDOW = C.job, C.at, C.file_exists, C.pending_get, C.arm_watchdog, C.WINDOW
local pending_meta, pending_info, read_latest, before_snapshot, append_event, resolve_active = C.pending_meta, C.pending_info, C.read_latest, C.before_snapshot, C.append_event, C.resolve_active
local slot_changed, glc, band_cfg_get, band_cfg_payload, band_cfg_set, gl_unlock = C.slot_changed, C.glc, C.band_cfg_get, C.band_cfg_payload, C.band_cfg_set, C.gl_unlock
local at_expect, parse_qnwlock4, parse_qnwlock5, parse_savectrl, parse_serving = C.at_expect, C.parse_qnwlock4, C.parse_qnwlock5, C.parse_savectrl, C.parse_serving

-- The serving cell out of a fresh collector sample, or nil when the sample
-- cannot answer and the QENG read must. Every field is laundered through nn():
-- a no-service sample is written with "pci": null, and cjson.null is truthy.
-- Under NSA the flattened aliases describe the LTE ANCHOR while rat says
-- NR5G-NSA — a 5G lock built from them would target a non-existent NR cell —
-- so the NR leg is taken from signals[] (the row cellular_compat tags NR5G),
-- exactly what parse_serving returns from a multi-line QENG (`sa or nsa or
-- lte`); with no NR row in the sample we decline and let the AT read answer.
local function serving_from_sample(latest)
  local rat = nn(latest.rat) or nn(latest.mode)
  local cell_id = nn(latest.cell_id) or nn(latest.id)
  if type(rat) == "string" and rat:find("NSA", 1, true) then
    local sigs = type(latest.signals) == "table" and latest.signals or {}
    for _, sg in ipairs(sigs) do
      local r = type(sg) == "table" and nn(sg.rat) or nil
      local pci, arfcn = tonumber(nn(sg and sg.pci)), tonumber(nn(sg and sg.earfcn))
      if type(r) == "string" and r:find("NR5G", 1, true) and pci and arfcn then
        return { rat = rat, cell_id = cell_id, pci = pci, arfcn = arfcn,
                 band = tonumber(nn(sg.band)), source = "collector" }
      end
    end
    return nil
  end
  local pci, arfcn = tonumber(nn(latest.pci)), tonumber(nn(latest.tx_channel))
  if not pci or not arfcn then return nil end
  return { rat = rat, cell_id = cell_id, pci = pci, arfcn = arfcn,
           band = tonumber(nn(latest.band)), source = "collector" }
end

-- The last scan mudimodemd finished, if it was for `slot`: {towers, ts, slot}, else nil. A scan
-- of the other SIM describes cells this one may not even see.
local function last_scan(slot)
  local f = io.open(LAST_SCAN, "r")
  if not f then return nil end
  local body = f:read("*a") or ""
  f:close()
  local ok, obj = pcall(cjson.decode, body)          -- pure C decode; cannot yield
  if not ok or type(obj) ~= "table" or type(obj.towers) ~= "table" then return nil end
  if tonumber(obj.slot) ~= slot then return nil end
  return obj
end

-- READ: cell-lock picture — modem truth (QNWLOCK), GL's store (get_cell_tower),
-- the serving cell (lock target for pin-current), the last scan of this SIM, and stale/pending flags.
function M.get_lock(args)
  local sub_id, plmn, matched, slot = resolve_active()
  -- Same rule as every other resolve_active() caller: with no active slot
  -- there is nothing to read FOR — the AT reads would go to the fallback
  -- sub_id and be presented as the active SIM's lock state.
  if not slot then return { error = "no active SIM slot (modem not ready)" } end
  local l4 = parse_qnwlock4(at_expect('AT+QNWLOCK="common/4g"', '"common/4g"', sub_id))
  local l5 = parse_qnwlock5(at_expect('AT+QNWLOCK="common/5g"', '"common/5g"', sub_id))
  local sc = parse_savectrl(at_expect('AT+QNWLOCK="save_ctrl"', '"save_ctrl"', sub_id))
  -- Serving cell: the collector's fresh sample already carries rat/pci/arfcn/
  -- band/cell_id for the active slot (it paid the QENG round-trip); only when
  -- that is stale, null, or lacks the NR leg do we spend our own AT read.
  local serving
  local latest = read_latest(30)
  if latest and tonumber(nn(latest.slot)) == slot then serving = serving_from_sample(latest) end
  if not serving then
    serving = parse_serving(at_expect('AT+QENG="servingcell"', '"servingcell"', sub_id))
  end

  local gl = glc("modem", "get_cell_tower", { bus = BUS })
  local tower = gl and gl["slot" .. tostring(slot)] or nil
  local gl_locked = (tower and tower.cellid and tower.cellid ~= "") and true or false
  local modem_locked = (l4 and l4.locked) or (l5 and l5.locked) or false

  local opcfg = glc("modem", "get_operator_config", { bus = BUS, slot = slot })

  return {
    lock = { l4g = l4, l5g = l5, save_ctrl = sc },
    gl = { locked = gl_locked, tower = tower },
    serving = serving,
    -- GL's store remembers a lock the modem no longer has (a watchdog or
    -- revert_now raw-AT unlock whose GL reconcile failed): derived live, no
    -- marker file — the two stores are the only truth.
    stale = (gl_locked and not modem_locked),
    pending_kind = pending_get("KIND") or (file_exists(PENDING) and "bands" or nil),
    operator_config = opcfg,
    last_scan = last_scan(slot),
    meta = { sub_id = sub_id, slot = slot, plmn = plmn, plmn_matched = matched },
  }
end

-- SCAN: GL's full network scan (AT+QSCAN under the hood). DISRUPTIVE — the
-- modem leaves the serving cell for up to ~10 minutes. The UI gates this
-- behind an explicit warning; never call it as part of a read.
--
-- A scan takes minutes, so it is a mudimodemd job (it calls GL's same modem.scan_cell_tower
-- through the local /rpc, and logs the "Cell scan" event when it succeeds): the reply is the
-- result, or {pending, id} to continue with job_result. A second scan while one runs joins it.
function M.scan_cells(args)
  local _, _, _, slot = resolve_active()
  if not slot then return { error = "no active SIM slot (modem not ready)" } end
  return job("scan", { slot = slot })
end

-- args = { id } from a {pending} job reply (scan_cells, refresh_library, …): the same reply
-- shape, waiting one more slice.
function M.job_result(args)
  local id = tonumber(args and args.id)
  if not id then return { error = "id required" } end
  return job_wait(math.floor(id))
end

-- WRITE: lock to one cell via GL's stack, protected by confirm-or-revert.
-- args = { rat="4g"|"5g", pci, freq, scs?, band?, extra?, slot? } — extra is an
-- optional table of passthrough tower fields (cellid, carrier, mcc, mnc, …)
-- from a scan row, forwarded verbatim so GL stores what it scanned; slot is the
-- SIM the page read its serving cell for (refused if the active SIM changed).
function M.set_cell_lock(args)
  local rat = args and args.rat
  if rat ~= "4g" and rat ~= "5g" then return { error = "rat must be '4g' or '5g'" } end
  local function int(v)
    local n = tonumber(v)
    if n and n >= 0 and n == math.floor(n) then return n end
  end
  local pci, freq = int(args.pci), int(args.freq)
  if not pci or not freq then return { error = "pci and freq are required integers" } end
  local scs, band = int(args.scs), int(args.band)
  if rat == "5g" and (not scs or not band) then
    return { error = "a 5g lock needs scs and band" }
  end
  if file_exists(PENDING) then
    return { error = "another change is pending; keep or revert it first" }
  end

  local sub_id, _, matched, slot = resolve_active()
  if not slot then return { error = "no active SIM slot (modem not ready)" } end
  local changed = slot_changed(args, slot)
  if changed then return changed end
  -- The PREV snapshot and the watchdog's revert both address `sub_id`: an
  -- unconfirmed one (PLMN unknown — SIM still searching, the status-0 (cellular-api-4.10.md §1)
  -- wedge) would snapshot and later "revert" the OTHER subscription while the
  -- real lock stayed in place. Refuse rather than guess.
  if not matched then
    return { error = "could not confirm which subscription answers for the active SIM (sub_id); not locking — retry once the SIM is registered" }
  end

  -- One lock at a time (keeps the revert target = "unlocked", always). Fail
  -- CLOSED: at_expect returns nil when it exhausts its retries (crossed AT
  -- replies under heavy polling, reference §10), and parse_qnwlock4/5 pass
  -- that nil straight through. Treating "couldn't read" the same as
  -- "verified unlocked" would let a write proceed over an undetected real
  -- lock and capture a bogus PREV revert target — so an unreadable state is
  -- refused, distinct from a readable-and-unlocked one.
  local l4 = parse_qnwlock4(at_expect('AT+QNWLOCK="common/4g"', '"common/4g"', sub_id))
  local l5 = parse_qnwlock5(at_expect('AT+QNWLOCK="common/5g"', '"common/5g"', sub_id))
  if not l4 or not l5 then
    return { error = "could not read current lock state; try again" }
  end
  if l4.locked or l5.locked then
    return { error = "a cell lock is already set; unlock first" }
  end

  -- Snapshot the revert target: current save_ctrl + mode prefs (GL's lock
  -- changes mode_pref / nr5g_disable_mode as a side effect — spec §0).
  local sc = parse_savectrl(at_expect('AT+QNWLOCK="save_ctrl"', '"save_ctrl"', sub_id))
  local mblob = at('AT+QNWPREFCFG="mode_pref"', sub_id)
  local pmode = (mblob and mblob:match('"mode_pref",([%w:]+)')) or ""
  local dblob = at('AT+QNWPREFCFG="nr5g_disable_mode"', sub_id)
  local pdis = (dblob and dblob:match('"nr5g_disable_mode",(%d+)')) or ""

  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local f = io.open(PENDING, "w")
  if not f then return { error = "cannot write pending state" } end
  f:write(table.concat({
    "KIND=cell", "SUB_ID=" .. sub_id, "SLOT=" .. tostring(slot), "RAT=" .. rat,
    "PREV_SAVE_CTRL=" .. ((sc and sc.raw) or ""),
    "PREV_mode_pref=" .. pmode,
    "PREV_nr5g_disable_mode=" .. pdis,
    table.concat(pending_meta({ rat = rat, pci = pci, freq = freq, scs = scs, band = band }, before_snapshot(slot)), "\n"),
  }, "\n") .. "\n")
  f:close()

  -- Arm the watchdog; no arm, no write (same interlock as set_bands).
  if not arm_watchdog() then
    os.remove(PENDING)
    return { error = "revert watchdog failed to arm; no change written" }
  end

  -- Write through GL so its store and the modem agree (spec §3).
  local payload = { bus = BUS, slot = slot, lock = true,
                    network_type = (rat == "5g") and "NR5G" or "LTE",
                    pci = pci, freq = freq }
  if rat == "5g" then payload.scs = scs; payload.band = band
  elseif band then payload.band = band end
  if type(args.extra) == "table" then
    for k, v in pairs(args.extra) do
      if payload[k] == nil then payload[k] = v end
    end
  end
  local res, err = glc("modem", "set_cell_tower", payload)
  if not res then
    os.remove(PENDING)          -- nothing was written; stand the watchdog down
    return { error = "GL lock call failed: " .. tostring(err) }
  end

  append_event("user", "Cell lock applied",
    rat .. " pci " .. pci .. " freq " .. freq .. (band and (" band " .. band) or ""))
  local pend = pending_info()
  return { ok = true, window = WINDOW, sub_id = sub_id, now = os.time(), deadline = pend and pend.deadline,
           before = pend and pend.before,
           applied = { rat = rat, pci = pci, freq = freq, scs = scs, band = band } }
end

-- Unlock (risk-reducing — no revert window). Also the stale-store reconciler.
-- args.slot (optional): as set_cell_lock — never unlock a SIM the page wasn't showing.
function M.clear_cell_lock(args)
  local sub_id, _, matched, slot = resolve_active()
  if not slot then return { error = "no active SIM slot (modem not ready)" } end
  local changed = slot_changed(args, slot)
  if changed then return changed end

  -- Which family is locked? GL clears only the one named by network_type and
  -- defaults to 4g when the store has no record — a 5G lock would survive a
  -- bare unlock. Ask the modem (two QNWLOCK reads) when the sub_id is
  -- confirmed; else trust GL's stored record; else clear both families.
  local families = {}
  if matched then
    local l4 = parse_qnwlock4(at_expect('AT+QNWLOCK="common/4g"', '"common/4g"', sub_id))
    local l5 = parse_qnwlock5(at_expect('AT+QNWLOCK="common/5g"', '"common/5g"', sub_id))
    if l5 and l5.locked then families[#families + 1] = "NR5G" end
    if l4 and l4.locked then families[#families + 1] = "LTE" end
  end
  if #families == 0 then
    local gl = glc("modem", "get_cell_tower", { bus = BUS })
    local tower = (gl and gl["slot" .. tostring(slot)]) or {}
    local nt = tostring(nn(tower.network_type) or "")
    if nt ~= "" then families = { nt:find("NR5G", 1, true) and "NR5G" or "LTE" }
    else families = { "NR5G", "LTE" } end
  end
  for _, fam in ipairs(families) do
    local res, err = gl_unlock(slot, fam)
    if not res then return { error = "GL unlock (" .. fam .. ") failed: " .. tostring(err) } end
  end

  -- Network mode after the unlock. GL's lock/unlock never send mode_pref (no
  -- such reference in quectel_set_tower — verified in the 4.10 image); the
  -- module itself moves mode_pref when a cell is locked (the 4.8 live
  -- observation: 5G lock -> NR5G-only), and GL's unlock leaves it there, which
  -- is what stranded the modem on 5G-only. Rather than hard-code AUTO or
  -- replicate GL's mode table, re-apply GL's OWN stored band config unchanged:
  -- its quectel_set_band_info then re-emits the mode_pref/nr5g_disable_mode
  -- that belong to the configured mode. No AT, no sub_id, GL's semantics.
  local prev = band_cfg_get(slot)
  local restored
  if prev then
    local ok2 = band_cfg_set(band_cfg_payload(slot, prev.mode_raw or prev.mode,
      prev.enable and { LTE = prev.LTE, nsa = prev.nsa, sa = prev.sa } or nil))
    if ok2 then restored = prev.mode_raw or prev.mode end
  end
  append_event("user", "Cell lock cleared",
    "unlocked (" .. table.concat(families, "+") .. ")" ..
    (restored and ("; network mode re-applied from GL's config: " .. restored) or "; mode re-apply failed"))
  return { ok = true, families = families, mode = restored,
           warning = (not restored) and
             "unlocked, but GL's stored band config could not be re-applied to reset the network mode; if the link stays on one RAT, apply the mode again on the Bands tab" or nil }
end

end
