-- MudiModem RPC backend: get_bands / set_bands: the three-layer band model and the confirm-or-revert band write.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, PENDING, BUS, nn, RATS, MODES = C.cjson, C.PENDING, C.BUS, C.nn, C.RATS, C.MODES
local ucall, at, pref_line, file_exists, arm_watchdog, WINDOW = C.ucall, C.at, C.pref_line, C.file_exists, C.arm_watchdog, C.WINDOW
local pending_meta, pending_info, before_snapshot, pick_modem, append_event, active_slot = C.pending_meta, C.pending_info, C.before_snapshot, C.pick_modem, C.append_event, C.active_slot
local resolve_slot, sim_present, slot_changed, glc, band_cfg_get, band_cfg_payload = C.resolve_slot, C.sim_present, C.slot_changed, C.glc, C.band_cfg_get, C.band_cfg_payload
local band_cfg_set = C.band_cfg_set

-- READ: the three-layer band picture for the active subscription.
-- { supported={LTE,nsa,sa}, config={enable,mode,LTE,nsa,sa},
--   policy={LTE,nsa,sa}, capability={LTE,nsa,sa},
--   meta={bus,slot,plmn,sub_id,plmn_matched,mode,lock} }
-- config+mode: ONE glc read of GL's per-slot store (get_band_config). policy +
-- capability: raw AT (the only place they exist). No AT is spent on config.
-- args.light = 1: config + mode + lock ONLY (GL's store, two glc reads, ZERO
-- AT). The page uses it after a cell-lock action — a GL lock changes the
-- stored network_mode and the tower badge, but policy/capability (the two AT
-- reads) cannot have changed, so refetching the full model would spend 2-3 AT
-- round-trips on the shared channel for nothing.
function M.get_bands(args)
  local light = args and (args.light == 1 or args.light == true or args.light == "1") or false

  -- 1. the slot: the active one, or (args.slot) the standby SIM — whose bands GL stores without
  -- touching the modem and applies when it next dials that slot (docs/knowledge.md §4.2). The
  -- PLMN-matched sub_id is needed only for the AT reads, and is that SIM's own.
  local sub_id, plmn, matched, slot
  local active = active_slot()
  if not active then return { error = "no active SIM slot (modem not ready)" } end
  local want = tonumber(args and nn(args.slot))
  local standby = want ~= nil and want ~= active
  if standby then
    if (want ~= 1 and want ~= 2) or not sim_present(want) then return { error = "no SIM in slot " .. tostring(want) } end
    slot = want
  else
    slot = active
  end
  if not light then sub_id, plmn, matched = resolve_slot(slot) end

  -- 2. config + mode — GL's per-slot store.
  local config, cfg_err = band_cfg_get(slot)
  if not config then
    return { error = "get_band_config failed: " .. tostring(cfg_err) }
  end

  -- Cell/tower lock (GL's store) — the RAT the modem is locked to. The Bands
  -- tab warns/blocks when the mode excludes that RAT.
  local gl = glc("modem", "get_cell_tower", { bus = BUS })
  local tw = gl and gl["slot" .. tostring(slot)] or nil
  local lock = { active = false }
  if tw and tw.cellid and tw.cellid ~= "" then
    lock = { active = true, rat = (tostring(tw.network_type or ""):find("LTE")) and "4g" or "5g",
             pci = tw.pci, freq = tw.freq, band = tw.band }
  end

  local meta = {
    bus = BUS,
    slot = slot,
    mode = config.mode,       -- AUTO | NR5G | LTE — GL's network_mode for this slot
    mode_raw = config.mode_raw,
    -- false => GL stores a mode outside AUTO/NR5G/LTE; the page shows it and
    -- leaves it alone (a band-only apply passes it through verbatim).
    mode_known = (config.mode_raw == nil) or (MODES[config.mode_raw] == true),
    lock = lock,              -- { active, rat, pci, freq, band } — network-type lock
    standby = standby or nil, -- true: the SIM that is not in use; writes are stored for later
    active_slot = active,
  }
  if light then
    meta.light = true
    return { config = config, meta = meta }
  end

  -- 3. supported (module) — cache read, no AT.
  local supported = { LTE = {}, nsa = {}, sa = {} }
  local modem = pick_modem(ucall("cellular.modem", "info", {}))
  if modem and modem.band then
    supported.LTE = modem.band.LTE or {}
    supported.nsa = modem.band["NR-NSA"] or {}
    supported.sa  = modem.band["NR-SA"] or {}
  end

  -- 4. policy + capability — AT only, at the resolved sub_id.
  meta.plmn = plmn
  meta.sub_id = sub_id
  meta.plmn_matched = matched   -- false => sub_id resolution is a best guess
  local pol_blob = at('AT+QNWPREFCFG="policy_band"', sub_id)
  local cap_blob = at('AT+QNWPREFCFG="ue_capability_band"', sub_id)
  local policy = {
    LTE = pref_line(pol_blob, "lte_band"),
    nsa = pref_line(pol_blob, "nsa_nr5g_band"),
    sa  = pref_line(pol_blob, "nr5g_band"),
  }
  local capability = {
    LTE = pref_line(cap_blob, "lte_band"),
    nsa = pref_line(cap_blob, "nsa_nr5g_band"),
    sa  = pref_line(cap_blob, "nr5g_band"),
  }

  return {
    supported = supported,
    config = config,
    policy = policy,
    capability = capability,
    meta = meta,
  }
end

-- WRITE: band allowlists and/or the network mode, protected by
-- confirm-or-revert. args = { sa={..}, nsa={..}, lte={..}, mode="AUTO"|"NR5G"|"LTE",
-- nr5g="both"|"nsa"|"sa", reset=bool, standby=bool } — each optional. A provided list must
-- be non-empty (an empty allowlist would drop that RAT). Omitted RATs keep their current list, or
-- — when filtering was off — every band the module supports. reset=true ignores the lists and
-- writes GL's true default: filtering OFF + AUTO.
-- nr5g: the 5G method, as GL encodes it — "nsa" = SA off (an empty NR-SA list: GL sends
-- mode_pref LTE:NR5G + nr5g_disable_mode 1), "sa" = NSA off (empty NR-NSA: mode 2), "both".
-- Omitted, the current method stays (a disabled family is never refilled behind the user's back).
-- "nsa" under 5G-only is refused: GL re-sends mode_pref NR5G after the apply, which with SA off
-- leaves nothing to register on. (Measured by running GL's own glc + cellular_manager.)
-- standby=true with args.slot = the SIM NOT in use: GL stores that slot's config without any AT
-- and applies it the next time it dials that slot (SIM switch / failover / boot) — so there is
-- nothing to confirm now: stored directly, no watchdog. `panic` resets both slots.
--
-- Single write path, fail-closed by construction: the ONE write is GL's
-- modem.set_band_config, which both applies to the modem and persists in GL's
-- store; a failed call changes nothing, a successful one is already durable,
-- and the watchdog restores the previous get_band_config snapshot verbatim.
-- args.slot (optional): the slot the page's picture was read for — refused when
-- the active SIM has changed since. Returns { ok, window, applied={sa=..,nsa=..,
-- lte=..,mode=..}, slot } or { error }.
function M.set_bands(args)
  args = args or {}
  local reset = args.reset == true
  local lists = {}
  local any_list = false
  for _, rat in ipairs(RATS) do
    local sel = args[rat.key]
    if type(sel) == "table" then
      if #sel == 0 then
        return { error = "refusing to write an empty " .. rat.key .. " list (would drop that RAT)" }
      end
      local out = {}
      for _, b in ipairs(sel) do
        local n = tonumber(b)
        if not n or n < 1 or n ~= math.floor(n) then
          return { error = "invalid band value: " .. tostring(b) }
        end
        out[#out + 1] = n
      end
      table.sort(out)
      lists[rat.key] = out
      any_list = true
    end
  end
  local mode = args.mode
  if mode ~= nil and not MODES[mode] then
    return { error = "invalid mode: " .. tostring(mode) }
  end
  local nr5g = args.nr5g
  if nr5g ~= nil and nr5g ~= "both" and nr5g ~= "nsa" and nr5g ~= "sa" then
    return { error = "invalid 5G method: " .. tostring(nr5g) }
  end
  if not any_list and not mode and not nr5g and not reset then return { error = "no changes provided" } end

  -- Bands are slot-addressed end to end (GL's per-slot store, and the watchdog
  -- restores the snapshot through it), so no sub_id is resolved: that would
  -- spend 1-3 AT round-trips on the shared channel for a value nothing uses.
  local active = active_slot()
  if not active then return { error = "no active SIM slot (modem not ready)" } end
  local standby = args.standby == true
  local slot
  if standby then
    slot = tonumber(nn(args.slot))
    if not slot or slot == active or (slot ~= 1 and slot ~= 2) or not sim_present(slot) then
      return { error = "standby needs the slot of the SIM that is not in use" }
    end
  else
    if file_exists(PENDING) then
      return { error = "another change is pending; keep or revert it first" }
    end
    slot = active
    local changed = slot_changed(args, slot)
    if changed then return changed end
  end

  -- Snapshot the revert target: GL's stored config for this slot, verbatim.
  local prev, perr = band_cfg_get(slot)
  if not prev then return { error = "could not read current band config: " .. tostring(perr) } end
  -- GL's stored mode string verbatim (mode_raw) so a band-only apply and the
  -- snapshot never rewrite a mode we did not recognise.
  local prev_mode = prev.mode_raw or prev.mode

  -- Build the new config.
  local payload, applied
  if reset then
    payload = band_cfg_payload(slot, "AUTO", nil)
    applied = { mode = "AUTO", reset = true }
  else
    local new_mode = mode or prev_mode
    -- NR lists cannot take effect under 4G-only: GL empties them in its store
    -- (band_cfg_payload's nr_ok rule), so accepting them would report bands
    -- as applied that GL never received. Refuse. The page never sends them
    -- under LTE (applyBands skips the NR groups) — this is the backstop.
    if new_mode == "LTE" and (lists.sa or lists.nsa) then
      return { error = "5G band lists cannot be applied under 4G-only mode; set the mode to Auto or 5G first" }
    end
    local method = nr5g or prev.nr5g
    if new_mode == "LTE" then
      if nr5g and nr5g ~= "both" then return { error = "a 5G method needs 5G: set the mode to Auto or 5G first" } end
      method = "both"
    end
    if new_mode == "NR5G" and method == "nsa" then
      return { error = "5G-only with SA off leaves nothing to connect to (NSA needs LTE): choose Auto, or keep SA" }
    end
    if (method == "nsa" and lists.sa) or (method == "sa" and lists.nsa) then
      return { error = "bands given for a 5G family that this method turns off" }
    end
    if not prev.enable and not any_list and method == "both" then
      -- Filtering is OFF and only the mode changes: keep it off. Materialising
      -- an allowlist here would silently switch filtering ON with every
      -- module-supported band pinned (policy-blocked ones included).
      payload = band_cfg_payload(slot, new_mode, nil)
      applied = { mode = new_mode }
    else
      -- An omitted RAT keeps its current allowlist. An EMPTY current list is
      -- NOT an allowlist (GL empties the NR lists under LTE mode, and an empty
      -- table is truthy in Lua) — that RAT, like every RAT when filtering was
      -- off, falls back to every band the module supports (= no restriction).
      local supported
      local function supported_for(ck)
        if not supported then
          local modem = pick_modem(ucall("cellular.modem", "info", {}))
          local band = (modem and modem.band) or {}
          supported = { LTE = band.LTE or {}, nsa = band["NR-NSA"] or {}, sa = band["NR-SA"] or {} }
        end
        return supported[ck] or {}
      end
      local final = {}
      for _, rat in ipairs(RATS) do
        local ck = (rat.key == "lte") and "LTE" or rat.key    -- config/supported key
        local cur = prev.enable and prev[ck] or nil
        local off = (method == "nsa" and ck == "sa") or (method == "sa" and ck == "nsa")
        if off then final[ck] = {}                            -- the 5G method: GL's empty list
        elseif lists[rat.key] then final[ck] = lists[rat.key]
        elseif type(cur) == "table" and #cur > 0 then final[ck] = cur
        else final[ck] = supported_for(ck) end
      end
      payload = band_cfg_payload(slot, new_mode, final)
      applied = { mode = new_mode }
      if method ~= prev.nr5g then applied.nr5g = method end
      -- Report the lists GL is actually asked to store (what band_cfg_payload
      -- arrays), never the request — the countdown text and the Tracking
      -- event can then never claim a list GL did not receive.
      for _, rat in ipairs(RATS) do
        if lists[rat.key] then
          local ck = (rat.key == "lte") and "LTE" or rat.key
          local parts = {}
          for _, n in ipairs(final[ck]) do parts[#parts + 1] = tostring(n) end
          applied[rat.key] = table.concat(parts, ":")
        end
      end
    end
  end

  -- The standby SIM: GL stores it and applies it when it next dials that slot. Nothing reaches the
  -- modem now, so there is nothing to confirm — one store write, no pending, no watchdog.
  if standby then
    local res, err = band_cfg_set(payload)
    if not res then return { error = "set_band_config failed: " .. tostring(err) } end
    append_event("user", "Bands stored for SIM " .. slot,
      "applies when SIM " .. slot .. " next connects" .. (applied.nr5g and ("; 5G " .. applied.nr5g) or ""))
    return { ok = true, stored = true, slot = slot, applied = applied }
  end

  -- The snapshot GL will be asked to restore: its own get_band_config answer,
  -- re-keyed to the set_band_config shape (only the fields GL's UI sends),
  -- with the mode string verbatim.
  local prev_payload = band_cfg_payload(slot, prev_mode,
    prev.enable and { LTE = prev.LTE, nsa = prev.nsa, sa = prev.sa } or nil)

  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local f = io.open(PENDING, "w")
  if not f then return { error = "cannot write pending state" } end
  f:write(table.concat({
    "KIND=bands", "SLOT=" .. tostring(slot),
    "PREV_BAND_CONFIG='" .. cjson.encode(prev_payload) .. "'",
    "APPLIED_BAND_CONFIG='" .. cjson.encode(payload) .. "'",
    table.concat(pending_meta(applied, before_snapshot(slot)), "\n"),
  }, "\n") .. "\n")
  f:close()

  -- Arm the watchdog, and CONFIRM it is live before the write. No net, no write.
  if not arm_watchdog() then
    os.remove(PENDING)
    return { error = "revert watchdog failed to arm; no change written" }
  end

  -- The one write. Fail CLOSED: on error nothing changed — stand the watchdog down.
  local res, err = band_cfg_set(payload)
  if not res then
    os.remove(PENDING)
    return { error = "set_band_config failed: " .. tostring(err) }
  end

  -- Persist a "You applied bands" event for the Tracking timeline.
  local bits = {}
  if applied.reset then bits[#bits + 1] = "reset: filtering off, mode AUTO" end
  if applied.sa  then bits[#bits + 1] = "SA "  .. applied.sa:gsub(":", " n"):gsub("^", "n") end
  if applied.nsa then bits[#bits + 1] = "NSA " .. applied.nsa:gsub(":", " n"):gsub("^", "n") end
  if applied.lte then bits[#bits + 1] = "LTE " .. applied.lte:gsub(":", " B"):gsub("^", "B") end
  if applied.nr5g then bits[#bits + 1] = ({ both = "5G SA + NSA", nsa = "5G NSA only", sa = "5G SA only" })[applied.nr5g] end
  if applied.mode and not applied.reset then bits[#bits + 1] = "mode " .. applied.mode end
  append_event("user", "Bands applied", table.concat(bits, "; "))

  local pend = pending_info()
  return { ok = true, window = WINDOW, applied = applied, slot = slot, now = os.time(),
           deadline = pend and pend.deadline, before = pend and pend.before }
end

end
