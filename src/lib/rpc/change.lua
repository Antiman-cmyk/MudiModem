-- MudiModem RPC backend: confirm / change_status / revert_now: the pending change as the page sees it.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, PENDING, ARMED, job, file_exists, pending_get = C.cjson, C.PENDING, C.ARMED, C.job, C.file_exists, C.pending_get
local pending_info, append_event, band_cfg_set, gl_unlock, restore_now = C.pending_info, C.append_event, C.band_cfg_set, C.gl_unlock, C.restore_now

-- Keep a pending change: stand the watchdog down. The change itself was
-- written through GL's store (set_band_config / set_cell_tower) when it was
-- applied, so it is ALREADY durable — cellular_manager re-applies GL's store on
-- restart. Nothing here can fail, which is exactly what makes Keep honest.
-- KEEP: stand the watchdog down by removing the pending file. When there is nothing pending
-- the change is already gone — the watchdog reverted it (window elapsed, or a reboot's
-- boot-check) — and the page must say so instead of claiming it was kept.
function M.confirm(args)
  if not file_exists(PENDING) then
    return { ok = false, was_pending = false,
             error = "nothing to keep: the change was already reverted (or kept elsewhere)" }
  end
  local kind = pending_get("KIND") or "bands"
  os.remove(PENDING)
  append_event("user", "Kept", kind == "cell" and "Cell lock confirmed" or "Band change confirmed")
  return { ok = true, confirmed = true, durable = true, was_pending = true, kind = kind }
end

-- READ: is a confirm-or-revert change pending? { now, pending = { kind, slot, deadline, applied,
-- window } | nil } — box clock, so a page can count down to the watchdog's real deadline after
-- a reload, on any tab, however long the browser slept.
function M.change_status(args)
  return { now = os.time(), pending = pending_info() }
end

-- Revert a pending change NOW (don't wait out the window). Writes the previous
-- config back and clears pending, so the still-sleeping watchdog then finds
-- nothing to do. Same restore the watchdog would perform on timeout.
function M.revert_now(args)
  if not file_exists(PENDING) then return { ok = true, note = "nothing pending" } end

  if pending_get("KIND") == "cell" then
    -- Through mudimodemd: the same restore-now, plus GL's store reconciled (--reconcile), with
    -- no AT or store write holding this worker. A {pending, id} reply is followed by the page
    -- (job_result). Only with the daemon not running does the in-process path below run.
    local jr, absent = job("restore", {})
    if not absent then return jr end

    local slot = tonumber(pending_get("SLOT"))

    -- The modem-side undo — GL-INDEPENDENT raw-AT unlock FIRST (it is what
    -- actually frees the link), then the three pref restores — is the
    -- watchdog's restore_from_pending, run synchronously. One implementation
    -- for the manual and the window-end revert, so they cannot drift. It
    -- clears PENDING and stands the sleeping watchdog down on success; on
    -- failure it keeps both, and so do we.
    local r = restore_now()
    if not r or not r.ok then
      return { error = "restore failed: " .. tostring((r and r.error) or "restore-now gave no answer")
                       .. " (pending kept, watchdog still armed)" }
    end

    -- THEN reconcile GL's store, best-effort — the link is already safe by
    -- this point regardless of whether this succeeds. If it fails, get_lock's
    -- derived `stale` (GL locked, modem unlocked) has the page offer "Clear
    -- it" instead of silently disagreeing with the modem.
    local res, gerr
    if slot then res, gerr = gl_unlock(slot, pending_get("RAT") or "5g") else gerr = "no SLOT in pending" end
    return { ok = true, reverted = true, gl_reconciled = res and true or false,
             gl_error = (not res) and tostring(gerr) or nil }
  end

  -- Bands: write GL's own previous config back (the snapshot set_bands took).
  -- Deliberately in-process (ngx.location.capture) rather than via restore-now:
  -- from inside an nginx worker the shell's route (gl-session -> HTTP POST to
  -- /rpc) would need ANOTHER free worker to serve it, and the manual revert
  -- must not fall to the watchdog's open-state fallback — the user is here to
  -- decide, and a failure keeps the watchdog armed to retry at window end.
  local prev_json = pending_get("PREV_BAND_CONFIG")
  local ok, prev = pcall(cjson.decode, prev_json or "")   -- pure C decode; cannot yield
  if not ok or type(prev) ~= "table" then
    return { error = "pending file has no usable band snapshot; use the ssh panic restore" }
  end
  local res, err = band_cfg_set(prev)
  if not res then
    -- Leave PENDING + the watchdog in place: it will retry the same restore
    -- at the window's end, and the page keeps offering Revert.
    return { error = "restore failed: " .. tostring(err) .. " (watchdog still armed)" }
  end
  os.remove(PENDING)
  os.remove(ARMED)
  append_event("user", "Reverted", "Restored previous bands")
  return { ok = true, reverted = true, restored = prev }
end

end
