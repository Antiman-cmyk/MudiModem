# Changelog

## Unreleased (toward 3.0)
Groundwork from the 3.0 refactor plan (`docs/architecture.md`: R0, R1, the change-transaction
part of R2 and the first step of R3), plus the fixes it surfaced.
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
- **The collector runs on GL's own Lua (eco), not Python.** `mudimodemd` writes the same history
  files and pushes as before, so live data works right after a firmware upgrade, without waiting
  for python3 to be reinstalled, and nothing is forked per sample. The Python collector is still
  installed as the fallback; writing `python` to `/etc/mudimodem/collector` selects it.
  `ubus call mudimodem health` shows the collector's counters and last error.
- **The AT console no longer freezes GL's admin.** Commands used to run inside GL's web server,
  which on 4.10 has one worker: every other page waited until the modem answered. They now run in
  `mudimodemd`'s AT queue, one sequence at a time; a long sequence shows its finished steps
  while the rest is still running.
- **The update check, the AT-library check/refresh and the cell scan no longer freeze GL's admin**
  either: they run as background jobs in `mudimodemd` (the update check used to hold every page
  for up to 8 s). A cell scan keeps running if the page is reloaded; starting it again rejoins it.
- **Apply no longer freezes GL's admin for a second,** and a cell lock's "Revert now" no longer runs
  modem commands inside GL's web server: `mudimodemd` arms the revert watchdog and runs the revert.
  The safety net itself is unchanged: the same watchdog reverts at the deadline, survives a
  daemon restart, and `panic` still works from ssh with nothing else running.
- **Chinese:** the whole Modem page is available in Simplified Chinese and follows GL's language
  setting (switching GL's language switches the page). Technical terms (RSRP, n71, AT commands)
  stay as they are; the community AT library stays English.
- **Smaller fixes:**
  - Speed test: "Clear history" needs a second click, and the schedule shows how much data it
    costs. The latest result is shown as soon as the tab opens.
  - AT console: follows new output, Copy works on the plain-http admin, there is a Clear button,
    and the higher-risk switch now lasts one browser session only.
  - Cell lock: an LTE lock shows its band as B<n>, and scan rows wrap on phones.
  - Status strip: a "?" explains each reading and its rough ranges.
- **Page code is now built:** ES modules under `src/web` are compiled with esbuild into
  `dist/views` (committed). The main chunk is split into modules, and all `/rpc` calls go through
  one place.
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
