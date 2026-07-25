# Fix cell-unlock stranding on 5G-only + "Reset to default" bands button

**Date:** 2026-07-24
**Status:** approved (design)

## Problem

Unlocking a 5G tower leaves the modem stuck on **"5G only."**

**Root cause (verified in the code + `reference/quectel-at-reference.md` §6a):** GL's cell lock
is *two* changes — the `QNWLOCK` tower lock **plus** a side-effect `mode_pref=NR5G` (a 5G lock
forces 5G-only; a 4G lock forces `LTE:NR5G` + `nr5g_disable_mode=1`). The unlock paths are not
symmetric:

| Unlock path | Clears the lock | Restores mode |
|---|---|---|
| Auto-revert watchdog + "Revert now" (within the 60s window) | ✅ | ✅ restores recorded `PREV_mode_pref` |
| **The "Unlock" button → `clear_cell_lock`** | ✅ (via GL `set_cell_tower {lock=false}`) | ❌ **leaves `mode_pref=NR5G`** |

`clear_cell_lock` (`src/rpc/mudimodem:479-490`) delegates entirely to GL's
`set_cell_tower {lock=false}` and issues **no** `mode_pref`/`nr5g_disable_mode` restore. GL clears
`QNWLOCK` but does not put `mode_pref` back → the modem stays 5G-only. The canonical full-restore
recipe already exists in the watchdog's `panic` path (`src/sbin/mudimodem-revert:131-146`).

Two independent fixes.

## Part 1 — Fix `clear_cell_lock` so unlock never strands

After GL clears the tower lock, the backend also undoes the lock's mode side-effects, restoring the
sensible default:

- `AT+QNWPREFCFG="mode_pref",AUTO`
- `AT+QNWPREFCFG="nr5g_disable_mode",0`
- `AT+QNWLOCK="save_ctrl",0,0` (reset lock persistence)

**Restore target is AUTO, not the exact pre-lock mode.** The manual-unlock path has no record of the
prior mode — `set_cell_lock` snapshots `PREV_mode_pref` into `PENDING`, but `PENDING` is deleted when
the lock is Kept (`confirm`, `src/rpc/mudimodem:619-627`), and the Unlock button is disabled while a
revert is pending, so by the time Unlock is reachable the snapshot is gone. AUTO is the correct
default because a lock always forced NR5G (or LTE), and AUTO is what the box ships with. This matches
`panic`'s behavior.

**Sequencing / mechanics:**
- Resolve the active slot's `sub_id` via the existing `resolve_active()` (never `sub_id=0`).
- Keep the existing GL `set_cell_tower {lock=false}` call (it clears `QNWLOCK` + updates GL's store);
  then issue the three AT writes above via the existing bare `at(...)` helper. **Never wrap `at`/ubus
  in `pcall`** (cosocket yield boundary — CLAUDE.md §8).
- **No revert countdown.** Unlocking + widening to AUTO only loosens config; it cannot drop the link,
  so it stays a risk-reducing, immediate operation (same as today's Unlock).
- Applies to both the primary Unlock button and the stale-store "Clear it" reconciler (both call
  `unlockCell` → `clear_cell_lock`).

**Frontend:** no change required — `unlockCell` (`src/views/mudimodem.js:546-558`) already re-fetches
`get_lock` + `get_bands` on success, so `meta.mode` refreshes and the "5G only" status badge clears
on its own.

**Durability caveat (note, not a blocker):** the AT `mode_pref` write is raw-AT. GL's
`set_cell_tower {lock=false}` should clear the lock's mode side-effect from GL's store, so a later
`cellular_manager` restart re-applies AUTO — but if it does not, a restart could re-strand. The
verify check (below) confirms the immediate post-unlock state; a restart-durability check is a
possible follow-up, out of scope for the reported bug.

## Part 2 — "Reset to default" button on the Bands tab

A button in the Bands tab that **stages** the default selection for review, then the user Applies it
through the normal flow. It writes nothing on its own.

**Behavior on click:**
- `selMode = "AUTO"` (via the existing `setMode("AUTO")`; AUTO never strands, so the mode-strand
  guard is a no-op here).
- Select **all permitted bands** in each group — `selectAll("sa")`, `selectAll("nsa")`,
  `selectAll("lte")`. "Permitted" = the policy-permitted (selectable) bands the grid already exposes;
  policy-blocked bands remain unselectable (selecting them is inert — the modem ignores them).
- This makes `changedAny()` true, lighting up the existing **Apply** button. The user reviews the
  staged defaults (grid + mode reflect them) and clicks **Apply**, which runs the standard
  `set_bands` confirm-or-revert path (`applyBands` → 60s countdown → Keep/Revert).

**"Default" = AUTO mode + every module/policy-permitted band.** No new backend method — reuses
`set_bands`. No change to the revert model.

**Placement:** a control in the Bands tab alongside the existing per-group All/None/Invert / mode
selector area, clearly labeled "Reset to default." Disabled while a revert is pending (mirrors the
other Bands controls).

## Testing

- **Part 2 (fully local):** `test/chunk.test.js` — clicking "Reset to default" sets `selMode` to
  `"AUTO"`, selects all permitted bands in each group (SA/NSA/LTE), and enables Apply; it is disabled
  while `pending` is set.
- **Part 1 (on-device, modem write):** `tools/verify.sh` — a focused check that after an unlock,
  `AT+QNWPREFCFG="mode_pref"` reads `AUTO`. Realistic manual verification: deploy → lock a 5G cell →
  Keep → Unlock → confirm the strip/bands mode shows AUTO (not 5G-only). Because this exercises a
  real lock/unlock on the box's only cellular link, it is gated/manual like the existing cell-lock
  checks, not run unattended.

## Out of scope

- Tracking/restoring the *exact* pre-lock mode (we deliberately restore AUTO).
- Durable GL-config write of the restored mode (raw-AT only; restart-durability is a follow-up).
- Any change to the Cell lock tab UI beyond the backend behavior of `clear_cell_lock`.
- A combined "unlock tower + reset bands" single button (superseded by the two-part approach above).
