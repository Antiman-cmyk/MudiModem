# Merge MudiUI into MudiModem — "LCD Display" tab + consolidated modem reads

**Date:** 2026-07-24
**Status:** approved (design)

## Goal

Fold the sibling **MudiUI** front-LCD renderer into the MudiModem repo as an installable
add-on, expose an **"LCD Display"** tab in the MudiModem admin page to enable/configure it,
and **consolidate the two projects' modem reads into one** — MudiModem's existing
`mudimodem-collectd` daemon.

Two add-ons, one repo, one installer. The LCD renderer remains independent of the admin
plugin (it can still be turned off entirely), but they now share a single modem-read path
and ship together.

## Background (verified this session)

- **MudiModem already runs a device-side modem reader:** `mudimodem-collectd`
  (`src/sbin/mudimodem-collectd`, procd service `/etc/init.d/mudimodem-collectd`). It polls
  GL's `cellular_manager` **cache** over ubus — `cellular.modem status`,
  `cellular.network info`, `cellular.sim status` — every `POLL_INTERVAL` (default 10s) and
  appends one JSON sample per tick to `/tmp/mudimodem/samples.jsonl` (tmpfs). It **never
  touches raw AT**, so it adds no AT-channel contention. This feeds the Tracking history
  graph.
- **MudiUI reads the modem independently, on-device, in Python.** Its `CellularSource`
  (`MudiUI/src/mudi.py`) polls `cellular.network info` every 4s for
  `rsrp/rsrq/sinr/rsrp_level/id/band/tx_channel/dl_bandwidth/mode`, and every ~32s polls
  `cellular.modem status` (active slot) + **`AT+QSPN`** (raw AT) for the serving carrier.
  MudiUI's other sources (WiFi via `iwinfo`/`gl-clients`, battery via `mcu status`,
  ethernet via sysfs + `network.interface.lan`) are **not modem reads**.
- **collectd's sample is a superset of MudiUI's cellular needs.** It already carries
  `carrier` (from `cellular.sim status`) — replacing MudiUI's *only* raw-`AT+QSPN` read —
  plus `rssi` and all three quality levels. So `CellularSource` is fully redundant with
  collectd.
- **MudiUI is event-driven.** Its `DataSource`s emit **on change**; widgets subscribe. A
  consumer that reads collectd's output therefore needs a **push notification** when a fresh
  sample lands — collectd today writes its file silently, so this capability is new.
- **MudiUI seizes the framebuffer.** `/dev/fb0` is single-owner; MudiUI stops/`SIGSTOP`s
  `gl_screen` to take the panel. This makes the LCD renderer inherently invasive → it must
  be **opt-in, disabled by default**.

## Design

### 1. Repo layout

MudiUI's five shipped files move under `src/lcd/`; the MudiUI repo is retired going forward.
Dev-only MudiUI files (`mudi_signal_live.py`, `bench.py`, `sample_modem.py`, its own
`install.sh`/`uninstall.sh`) are **not** carried over.

```
src/lcd/
├── mudi.py           → /usr/bin/mudi.py           (LCD renderer app)
├── mudi-watch.py     → /usr/bin/mudi-watch.py     (long-press panel-toggle watcher)
├── mudi.init         → /etc/init.d/mudi           (procd, START=99, STOP=10)
├── mudi-watch.init   → /etc/init.d/mudi-watch     (procd, START=98, STOP=11)
└── mudi.config       → /etc/config/mudi           (uci defaults; installed only if absent)
```

### 2. Read consolidation — collectd is the single modem reader

collectd stays the one poller. Two changes:

**(a) Cadence 10s → 4s, retention cap raised to preserve 24h.**
- `POLL_INTERVAL` default `10` → `4` (env `MUDIMODEM_POLL` still overrides).
- At 4s, 24h ≈ 21,600 samples. `SAMPLE_MAX_LINE` `10000` → **`22000`** so `SAMPLE_MAX_AGE`
  (24h) remains the binding limit, not the line cap. Cost: full 24h buffer ≈ **~6 MB tmpfs
  (RAM)** at ~250–300 B/line — acceptable on this box.
- `TRIM_EVERY` (30) still trims ~every 2 min at 4s — fine. `EVENT_TRIM_EVERY` unchanged.
- Reads GL's cache (3 cheap ubus calls/tick, ~0.75/s) — no AT, no new contention.

**(b) collectd gains a broadcast Unix domain socket.** Purely additive to the file/history
path.
- Opens `/tmp/mudimodem/collectd.sock` (AF_UNIX, SOCK_STREAM). A small accept thread tracks
  connected client sockets.
- After each successful `collect_sample()`, before/alongside the file append, it writes the
  sample as **one JSON line** to every connected client, dropping any that error (broken
  pipe). Writes are best-effort and must never stall or crash the poll loop.
- Also atomically writes **`/tmp/mudimodem/latest.json`** (tmp + rename) so a just-connected
  client gets current state immediately without waiting a tick.
- Socket lifecycle: unlink stale socket on startup; clean shutdown on SIGTERM.

**(c) MudiUI `CellularSource` rewritten from poller → socket subscriber.**
- Connects to `/tmp/mudimodem/collectd.sock`; on first connect seeds from `latest.json`;
  then blocks reading newline-delimited JSON. Each line → map fields to existing bus keys
  (`signal.rsrp`, `signal.rsrq`, `signal.sinr`, `signal.rsrp_level`, `cell.id`,
  `signal.band`, `net.carrier`, ARFCN→MHz from `tx_channel`, `dl_bandwidth`, `mode`) →
  existing emit-on-change dedup.
- Reconnect loop with backoff if collectd is down/restarts; the source stays self-gating on
  subscriber count (it just stops reading the socket when no page is subscribed — collectd
  keeps running regardless, which is already true today).
- **Deletes** MudiUI's `cellular.network info`, `cellular.modem status`, and `AT+QSPN`
  reads. Presentation-only conversions (ARFCN→MHz) stay in MudiUI.
- **Untouched:** MudiUI's WiFi, battery, and ethernet sources (not modem reads).

Net effect: with both add-ons installed, the modem is polled **once** (collectd 4s), not
twice (collectd 10s + MudiUI 4s). MudiUI's last raw-AT display read is gone.

### 3. "LCD Display" tab (frontend + backend)

**Frontend** — an in-page tab in `src/views/mudimodem.js`, same pattern as the Config /
battery-limit tab (no separate lazy chunk):
- Add `["lcd", "LCD Display"]` to the `TABS` array.
- Add `else if (this.tab === "lcd") panel = this.renderLcd(h);` to the panel dispatch.
- Add a `tab(t)` watcher clause: `if (t === "lcd") this.fetchLcd();`.
- `renderLcd(h)` renders one card mirroring the battery-limit card:
  - **Enable checkbox** ("Show status on the front LCD"). `change` → `applyLcd({enabled})`.
  - **Brightness** (number/slider, e.g. 20–120), **Screen timeout** (select: 30s/1m/5m/10m/
    20m/60m/Never), **Default page** (select: Signal/WiFi/System/Ethernet). Each disabled
    until `enabled`; `change` → `applyLcd({...})`.
  - Read-only **Status** line: "Running" / "Stopped" / "Not available on this device".
  - `available:false` (no compatible panel) → card shows the not-available note, no controls
    (exactly like battery-limit on unsupported hardware).
- State in `data()`: `lcd` (snapshot), `lcdBusy`, `lcdErr`, plus per-field drafts. `fetchLcd`
  / `applyLcd` mirror `fetchBattLimit` / `applyBattLimit`.

**Backend** — new RPC methods in `src/rpc/mudimodem`:
- `get_lcd(args)` → snapshot: `{available, enabled, running, brightness, screen_timeout,
  default_page, error}`. `available` from `/dev/fb0` presence (240×320) + model guard;
  `enabled` from init-service enabled state; `running` from `pidof`/service status; config
  values read from uci `mudi`.
- `set_lcd(args)` → validate inputs, then:
  - **enabled toggle:** guard on fb0 availability; `enabled` → `/etc/init.d/mudi enable`,
    `/etc/init.d/mudi-watch enable`, then `start` both; `!enabled` → `stop` both, `disable`
    both. Persist `start_on_boot` in uci `mudi` too.
  - **config knobs:** write `brightness` / `screen_timeout` / `default_page` to uci `mudi`,
    then **signal the running `mudi.py` to reload** (see below). Return a fresh snapshot.
- Validator: add a `mudimodem.lua` entry for any free-form `set_lcd` params (all are
  constrained numerics/enums — tight allowlists, no `.-`).

**Live config reload (no panel flash):** add a **`SIGHUP` handler in `mudi.py`** that
re-reads its `Settings` (uci `mudi`) and applies brightness/timeout/default-page live,
reusing the same code path its on-screen Settings page already uses. After writing uci,
`set_lcd` sends `SIGHUP` to the running renderer — resolved by matching cmdline (`pgrep -f
/usr/bin/mudi.py`), since it runs as `python3` and plain `pidof` won't find it. (`SIGUSR1`
remains the panel pause-toggle; `SIGHUP` is new and distinct.) If the service isn't running,
uci is written and the change takes effect next start.

### 4. Install / uninstall / guards / defaults

- `install.sh` gains an **LCD block** modeled on the `glbattlimit` block:
  - Device guard: root **and** `/dev/fb0` geometry == `240,320` **and** model `*E5800*` /
    `*Mudi*` (mirrors MudiUI's `src/install.sh` guard; skip LCD install cleanly on
    non-matching hardware, don't fail the whole installer).
  - Install missing opkg deps: `python3-light python3-numpy python3-urllib python3-logging
    python3-ctypes python3-cffi python3-evdev`, plus `python3-pillow` via
    `opkg install --nodeps` (libfreetype clash with `gl-sdk4-screen-large`), matching
    MudiUI's installer.
  - `cp_install` the 4 program/service files; install `mudi.config` **only if
    `/etc/config/mudi` is absent** (never clobber user settings).
  - **Do NOT enable or start the LCD services** — default **disabled/off**. The tab's enable
    checkbox is the only thing that turns the panel on. (Contrast battery-limit, which
    enables its init service by default but ships policy `enabled:false`.)
  - Append all installed LCD paths to `/etc/sysupgrade.conf` (survive firmware upgrade).
- `uninstall.sh` mirrors removal: stop + disable `mudi`/`mudi-watch`, hand the panel back
  (`/etc/init.d/gl_screen start`), remove the 4 files, drop the sysupgrade.conf entries.
  Leave `/etc/config/mudi` (user data) unless a full purge is requested.

### 5. Testing & verification

- `tools/verify.sh` additions (on-device):
  - LCD files present at their destinations and registered in `/etc/sysupgrade.conf`.
  - `get_lcd` / `set_lcd` round-trip through `/rpc` (a real HTTP round-trip, to exercise the
    validator layer — per CLAUDE.md §5, on-device `dofile` tests bypass `/rpc` validation).
  - collectd socket `/tmp/mudimodem/collectd.sock` exists and a connected AF_UNIX client
    receives a JSON line within one poll interval (~4s).
  - No orphaned/stopped daemons left behind (extend the existing daemon-health check).
- Offline unit tests (stdlib, Node/Python on the dev box):
  - collectd: broadcasts a sample line to a connected AF_UNIX client (in-process, mock
    ubus); still appends to the file; retention trim keeps ≤ `SAMPLE_MAX_LINE`.
  - MudiUI `CellularSource`: given a sample JSON line, maps to the correct bus keys and
    emits on change / dedups on repeat.
  - Frontend chunk still `eval`s and mounts (existing `test/chunk.test.js`), now with the
    `lcd` tab present.

### 6. Out of scope (this pass)

- Band-lock / net-mode on the **web** tab — they stay on MudiUI's on-screen Settings only
  (overlap MudiModem's Bands tab; risky).
- Folding MudiUI's **WiFi/battery/ethernet** reads into collectd (only *modem* reads
  consolidate now).
- Importing MudiUI's git history.
- ipk packaging; boot-hook registration of watchdogs (tracked separately).

## Risks / notes

- **tmpfs growth:** 22k-line buffer ≈ 6 MB RAM held continuously. Acceptable, but note it;
  if RAM pressure ever shows, lower `SAMPLE_MAX_LINE` (trading history depth).
- **Panel takeover is destructive to `gl_screen`.** Default-off is the safety. Enabling from
  the web tab hands the panel over immediately; the tab copy should say so.
- **Socket vs. self-gating:** collectd runs 24/7 regardless of subscribers (already true);
  MudiUI reading the socket adds no modem load, only a file-descriptor.
- **`SIGHUP` reload path** must reuse mudi.py's existing settings-apply code, not a second
  copy, to avoid drift.
