# Changelog

## 3.0.0 — 2026-11-03
The 3.0 refactor (`docs/architecture.md`: R0–R4), the features built on it, and the fixes they
surfaced. **Updating from 2.x:** press Update now on the Config tab, or run the install command
again. The installer stops and removes the 2.x Python pieces and the `mudimodem-speedtestd`
service, and keeps your settings, history, speed-test results and AT-library cache.
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
- **No Python on the router any more.** Everything runs in `mudimodemd` on the firmware's own
  lua-eco: the collector (same history files and pushes as before), the speed test and its
  schedule, the AT console's direct-port fallback and the AT-library sync. Live data works right
  after a firmware upgrade (there is nothing to reinstall), and nothing is forked per sample.
  `ubus call mudimodem health` shows the daemon's counters and last error. Updating removes the
  old Python files and the `mudimodem-speedtestd` service; the `python3-light` package an older
  version installed is left alone (`opkg remove python3-light` if nothing else of yours uses it).
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
- **Speed test shows the carrier's cap.** Each cellular result records the per-SIM bearer limit
  the network signals (AMBR, from GL's `cellular.sim status`), and the result card says when a test
  ran at that cap: a slow result can then be told apart from a throttled plan.
- **Tracking has a throughput lane:** download and upload rate of the cellular link under the
  signal chart, from the interface's byte counters every RF tick (no extra modem commands), with a
  gap after a reconnect or SIM switch. The readout shows the current Down / Up rate.
- **Tracking shows when the internet stopped, not just the signal.** Every 30 s the router pings
  out of the cellular interface, at the tracking IPs set on GL's own Multi-WAN page (the same
  check GL itself uses). A ping lane shows the round trip and every miss; losing the link records
  "Offline" and getting it back "Back online, after 3 min 20 s offline" in the event log.
- **Neighbour cells without a scan:** Cell lock has a "Read neighbours" button: one read-only
  question to the modem, the connection stays up (a scan takes it offline for up to ~10 minutes).
  On LTE and 5G NSA it lists the LTE cells the modem measures, strongest first, each lockable with
  the usual confirm-or-revert; on 5G SA the modem has no such list and the page says so.
- **More accurate speed tests:** each direction runs several connections at once for a few
  seconds, and the rate is read from the interface over the steady part after TCP's slow start —
  a single 20 MiB download used to finish inside slow start on fast 5G and read low. Latency is
  now one round trip (no connection setup in it). Choose **Quick** (at most ~29 MB) or
  **Thorough** (at most ~290 MB), and Cloudflare or your own **LibreSpeed** server. Each result
  says what it cost; the history chart has a scale and dates.
- **A long-term record:** the router keeps 30 days of hourly summaries per serving cell (signal
  min / average / max, ping loss, throughput, time without service; one small write an hour to
  flash). Tracking's new **Long term** card shows 7 or 30 days of hourly RSRP and the cells you
  spent your time on, with how they performed — "was it like this last week, and where?".
- **Modem crashes are logged.** When GL saves a modem crash dump (the modem restarted on its own),
  Tracking records a "Modem crash" event at that time.
- **5G SA / NSA choice:** the Bands tab can turn standalone or non-standalone 5G off (SA + NSA,
  NSA only, SA only) — GL's engine supports it, its page does not. Same confirm-or-revert as any
  band change; NSA-only is refused under 5G-only, where it would leave nothing to connect to.
- **Bands for the standby SIM:** with two SIMs, the Bands tab can edit the SIM that is not in use.
  GL stores the change and applies it the next time that SIM connects (switch or failover).
- **No extra modem polling for live RF:** GL already samples both SIMs' signal every 10 s; the
  collector now reads GL's samples instead of asking the modem again (one QENG + QCAINFO less every
  10 s on the shared AT channel), and asks only for the cell id when the serving cell changes (or
  once a minute). Same samples, same signal levels — verified by running GL's own cellular stack
  under emulation.
- **Cell lock follows the cell you are on:** "Lock to this cell" used to target the cell the tab
  saw when it opened. After a handover it now refuses that cell, says where the modem went and
  re-reads it.
- **The confirm banner shows the effect:** "Before n71 · RSRP −99 · SINR 4 → now B66 · RSRP −105 ·
  SINR 2", recorded by the router when the change went out, so it survives a reload. The strip
  marks the moment of the change. Apply and the lock confirm say up front that the link drops for
  a few seconds, and "Reset to default" is now "Apply defaults" (it writes at once).
- **A cell scan is kept:** the router keeps the last scan of each SIM, so a reload or another
  browser does not cost another 5–10 minutes offline. The card says how old it is and for which SIM.
- **Bands in one vocabulary:** module supports / carrier allows / selected / modem advertises /
  in use, with a "?" that explains each. The footer names the change ("SA +n41 −n71") instead of
  "2 SA". Scan, neighbour and strip colours all follow GL's own signal levels.
- **Phones and small things:** Tracking's legend wraps and its readout sits under the chart on a
  phone. The event log can hide a source, and clicking an event shows that moment on the chart.
  RF samples, events, speed tests and battery history export as CSV. PCI, ARFCN and Cell ID have
  copy buttons. Tapping a band chip explains it. The page reopens on the tab you last used, and a
  scan row's Lock confirm stays with its cell when the list re-sorts.
- **Tracking stays fast on 24 hours:** the chart is computed once per data change and thinned to
  the pixel grid. Moving the mouse over a 24 h window went from ~51 ms to 0.2 ms per frame.
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
- **The nginx plugin is split by concern:** `src/rpc/mudimodem` is a small loader; the code is in
  `src/lib/rpc/` (installed to `/usr/lib/mudimodem/rpc/`), moved verbatim.
- **Page code is now built:** ES modules under `src/web` are compiled with esbuild into
  `dist/views` (committed). The main chunk is split into modules, and all `/rpc` calls go through
  one place.
- **Development without a router:**
  - The firmware and emulation tooling is its own repository,
    [mudi-emu](https://github.com/Antiman-cmyk/mudi-emu), pinned as the `tools/mudi-emu`
    submodule. It fetches and unpacks the pinned 4.10.0 image, and runs the router's own Lua,
    eco, busybox and binaries under qemu. It also runs a fake GL bus, and GL's own cellular stack
    against an RG650V model that tags each reply with its evidence. The GL file copies the docs
    cite live there too, checked against the image.
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
