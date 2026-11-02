# Changelog

## Unreleased (toward 3.0)
Groundwork from the 3.0 refactor plan (`docs/architecture.md`: R0, and the change-transaction
part of R2), plus the fixes it surfaced.
- **One manifest, one installer.** `manifest.txt` lists what ships where. `install.sh`,
  `uninstall.sh`, `tools/deploy.sh` and the self-updater all run `src/installer/mudimodem-install`.
  install.sh downloads everything before touching the router. The firmware-upgrade keep list
  (`/lib/upgrade/keep.d/mudimodem`) is generated at install time instead of being kept by hand.
  The installer and manifest are installed under `/usr/lib/mudimodem/`, so uninstall knows
  exactly what to remove.
- **Confirm-or-revert follows the router:** the countdown runs to the watchdog's real deadline
  (box clock), comes back after a reload, and is shown on every tab. Keep and Revert wait for the
  router's answer: a Keep that could not reach it keeps the banner, a refused Revert says why, and
  a Keep that arrived after the auto-revert says so instead of being logged as kept
  (new `change_status`; `confirm` reports `was_pending`).
- **Phones:** the tab bar scrolls sideways instead of the whole page, and the AT console no longer
  overflows. The console also mounts when browser storage is blocked.
- **UI:** the console's read/set/nv risk badges and the battery cards used CSS variables that GL's
  theme does not define, so they rendered without colour or background. They now use GL's own
  tokens, and a test enforces this. "Good" signal is now `--secondary`, as on GL's own pages;
  before, it was the same grey as "no data" in the dark theme.
- **Development without a router:**
  - `tools/firmware.sh` fetches and unpacks the pinned 4.10.0 image.
  - `tools/emu.sh` runs the router's own Lua, eco, busybox and binaries under qemu.
  - Every shell suite now also runs under the router's busybox.
  - `tools/preview.js` renders every tab in headless Chromium with GL's theme, at phone and
    desktop width, light and dark.
  - A fake-root installer test covers install, update and uninstall.
- **Docs:**
  - Short CLAUDE.md.
  - `docs/knowledge.md` holds the platform and domain facts.
  - The firmware contract is corrected (one nginx worker, the 300 s glc timeout, i18n, GL's own
    10 s signal sampler, AMBR).
  - The old process scaffolding is removed: the design notes are in `docs/design/` and the old
    CLAUDE.md is in `docs/history/`.

## 2.2.0 — 2026-10-28
- **SIM1 vs SIM2:** `sub_id` is resolved from the slot first and confirmed by IMSI. Writes carry
  the slot the page read, and the page re-reads when the active SIM changes. panic now clears locks
  on both subscriptions.
- **AT console:** commands go through GL's own AT service (`modem.CPU.AT`, per SIM). The direct
  port is used only as a fallback.
- Bug sweep across the whole repo, verified against the 4.10 image:
  - **Collector:** a failed read now skips the sample instead of recording an outage, and the
    flash backup is append-only.
  - **Speed test:** a test that died is now reported honestly.
  - **AT tool:** a timed-out reply is no longer paired with the next command.
  - **glbattlimit:** it hands GL's derated charge voltage back instead of a fixed 4.4 V, and its
    watcher no longer outlives it.
  - **Pages:** NSA anchor display, PAUSED state, pins, retries, per-SIM series, polling lifecycle.

## 2.1.1
- Updating or uninstalling cleans up a 2.0.0 install: its `/www` payload and its
  `/etc/sysupgrade.conf` entries.

## 2.1.0 — 2026-10-28
- **Survives GL firmware upgrades** ("Keep Settings"):
  - Files are listed in `/lib/upgrade/keep.d`.
  - The web payload moved from `/www` to `/usr/share/mudimodem/www`, served by an nginx alias.
  - python3 is reinstalled at first boot after an upgrade (`mudimodem-deps heal`).

## 2.0.0 — 2026-09-02
- Rewritten for **GL firmware 4.10 only**; 4.8 users stay on the `legacy-4.8` line.
- Band config now goes through GL's per-slot `get/set_band_config`.
- Live data is pushed over GL's `/ws` bus (`mudimodem.collect` / `.battery` / `.event`).
- The 1.x front-LCD renderer is removed.
- The SIM/APN tab is dropped: GL's Internet page covers it.
