# Battery tab + battery history chart — design

**Date:** 2026-07-27
**Status:** approved (brainstorm)
**Origin:** GitHub issue [#1](https://github.com/kevinherzig/MudiModem/issues/1), opened by
**ChiliApple** — the author of the `glbattlimit` charge-limit script this project ships.

## Goal

Give the battery the same treatment the modem already has: a **time-series chart** of state of
charge, current, voltage and temperature over the existing 15m/1h/6h/24h windows, in a **new
`Battery` tab** that also becomes the home of the charge-limit settings (moved out of Config).

The point is not decoration. The charge limit is currently invisible: you toggle it and nothing
observable happens. With a chart, the limit **proves itself** — you watch charge current fall to
0 mA and the cell temperature drop behind it.

## Background — verified on the box 2026-07-27

Everything needed is in the same `/sys` tree `glbattlimit` already reads. No AT, no ubus, no
contention with the modem's AT channel. This is the cheapest data source in the project.

| node | value (plugged, `Full`) | value (unplugged, `Discharging`) | unit |
|---|---|---|---|
| `cw221X-bat/capacity` | `71` | `70` | gauge % |
| `cw221X-bat/voltage_now` | `4045000` | `4010000` | **µV** |
| `cw221X-bat/current_now` | `0` | `-363` | **mA** (see trap below) |
| `cw221X-bat/temp` | `320` | `316` | deci-°C |
| `charger/online` | `1` | `0` | bool |
| `charger/status` | `Full` | `Discharging` | enum |
| `charger/charge_type` | `Trickle` | `N/A` | enum |

Also present and read once for the status row, not plotted: `cycle_count` (`4`), `health`
(`Good`), `present`, `technology` (`Li-ion`).

The unplug captured exactly the behaviour the issue describes: temp `32.0 → 31.6 °C` and voltage
`4045 → 4010 mV` within seconds.

### ⚠️ Unit traps — per-node, no blanket rule

1. **`current_now` is already in mA, NOT µA.** The standard Linux `power_supply` class uses µA, so
   this reads as a driver quirk and the µA assumption is the obvious wrong guess. `glbattlimit`
   line 166 documents it directly:
   ```sh
   echo "Current   : $(cat $BAT/current_now) mA  (+charging -discharging 0=blocked)"
   ```
   Physics agrees: `-363` at 4.0 V is ~1.45 W, plausible for an idle Mudi; as µA it would be
   1.5 mW, absurd. **Do not divide by 1000.**
2. **Sign convention: `+` charging, `−` discharging, and `0` means BLOCKED.** So
   "the limit is actively holding charge off" is `cur == 0 && online == 1` — a crisper signal than
   inferring it from `status`, and what the chart's cutoff marker uses.
3. **The two nodes disagree with each other.** The gauge reports `current_now` in **mA** while its
   own `voltage_now` is **µV**; the *charger* node reports its limits in **µA**
   (`input_current_limit=2000000` = 2 A, `constant_charge_current_max=5100000` = 5.1 A). Convert
   per node. Never apply one rule across the tree.

## Non-goals

- **No persistence to flash.** tmpfs only, lost on reboot — same deal as the modem history. Writing
  NAND every 20 s is exactly what this repo has avoided.
- No battery data on the main page status strip.
- No change to the LCD pages (`src/lcd/`).
- No change to `glbattlimit`'s charging behaviour, or to `get_battlimit` / `set_battlimit`
  semantics beyond two additive response fields (§4).
- No alerts, thresholds or notifications.
- No support claims for non-E5800 hardware: a missing sysfs node yields no data and an honest
  empty state, never an error.

## Decisions (locked in brainstorm)

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | **Stacked small multiples** — four lanes, real units, shared x-axis and hover | One overlaid normalized plot (Tracking's shape). Rejected: normalization destroys the one value that matters — `current == 0` stops reading as *zero* and reads merely as *low*. |
| 2 | **20 s cadence, 24 h retention** (~4,320 lines, ~350 KB tmpfs) | 4 s (5× the RAM for a value that changes every ~60–90 s — mostly duplicate rows); 7 days (a window that a reboot means is rarely full). |
| 3 | **Derived annotations only** — target line, status band, plug/unplug ticks | Logging setting changes as events. Deferred: needs no new plumbing to add later if wanted. |
| 4 | **Extend `mudimodem-collectd`**, don't add a second daemon | A dedicated battery daemon. Rejected: collectd is deliberately the project's *single reader* — that was the whole point of the 2026-07-24 LCD merge. |
| 5 | **Own file `battery.jsonl`**, not extra fields on `samples.jsonl` | Rejected: `collect_sample()` returns `None` and writes nothing when the active SIM slot can't be resolved. Battery data must not vanish because the modem is unregistered. |
| 6 | **Lazy chunk** `src/views/mudimodem-battery.js` | Inlining into `mudimodem.js`, already 2,561 lines. |
| 7 | **Store raw gauge %**, convert to GUI % at render | Storing GUI %. Rejected: the GUI fit is provisional; storing the raw reading keeps existing history valid if the fit is ever corrected. |
| 8 | **Settings move out of Config**, not duplicated | Two places to change one setting. |

## Architecture

```
/sys/class/power_supply/{cw221X-bat,charger}
    │  (sysfs reads, ~µs, no AT / no ubus)
    ▼
mudimodem-collectd                        ← existing daemon, one new sampler
    │  every 20 s (elapsed-time gated)
    ├─ /tmp/mudimodem/battery.jsonl        ← NEW; 24 h / 5,200 lines, trimmed
    └─ /tmp/mudimodem/samples.jsonl        ← unchanged (modem, 4 s)
    ▼
/usr/lib/oui-httpd/rpc/mudimodem
    │  get_battery_history {window_ms|since} → {samples, now}
    │  get_battlimit / set_battlimit         ← unchanged behaviour, +2 fields
    ▼
/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz   ← NEW lazy chunk
    │  rpcSilent (direct $axios), initial window_ms then 10 s `since` poll
    ▼
Battery tab: live status row · 4-lane chart · settings card
```

## 1. Collector — `src/sbin/mudimodem-collectd`

### Sampling

A second sampler inside the existing loop, gated on **elapsed wall time, not a tick counter**:

```python
BATT_INTERVAL   = float(os.environ.get("MUDIMODEM_BATT_INTERVAL", "20"))
BATT_MAX_AGE    = 24 * 3600 * 1000
BATT_MAX_LINE   = 5200          # 24h at 20s = 4320, plus headroom
BATT_SYSFS      = os.environ.get("MUDIMODEM_BATT_SYSFS", "/sys/class/power_supply")
```

**Why elapsed time and not `i % 5`:** a tick is not 4 s. `ubus_call` has an 8 s timeout and the
loop makes three of them, so a bad tick can run ~24 s and a modulo counter would silently stretch
the battery interval to minutes. Elapsed-time gating keeps 20 s meaning 20 s.

The battery read happens **first in the tick, before the ubus calls**, for the same reason.

### `read_battery()` — pure, testable, fails closed

Returns a dict, or `None` if the gauge is absent or unreadable. A non-E5800 box therefore writes
no battery file at all rather than a file full of nulls or a crashing loop.

```json
{"t":1753600000000,"cap":70,"volt":4010,"cur":-363,"temp":31.6,
 "online":0,"status":"Discharging","ctype":"N/A","cycles":4,"health":"Good"}
```

| field | source | conversion |
|---|---|---|
| `cap` | `cw221X-bat/capacity` | none — **raw gauge %** (decision 7) |
| `volt` | `cw221X-bat/voltage_now` | µV → mV (`// 1000`) |
| `cur` | `cw221X-bat/current_now` | **none — already mA, signed** |
| `temp` | `cw221X-bat/temp` | deci-°C → °C (`/ 10.0`, one decimal) |
| `online` | `charger/online` | int |
| `status` | `charger/status` | string |
| `ctype` | `charger/charge_type` | string |
| `cycles` | `cw221X-bat/cycle_count` | int |
| `health` | `cw221X-bat/health` | string |

Conversion happens **once, at collection**, so the chunk stays dumb and the JSON stays small.
Numeric parsing reuses the existing `_num()` helper's tolerance: a non-numeric or empty node yields
`None` for that field; a missing *gauge* yields `None` for the whole sample.

Errors are already contained — the loop's `except Exception` never lets a sampler kill the daemon.

### Retention

`trim(battery_path, BATT_MAX_AGE, BATT_MAX_LINE)` on the existing `TRIM_EVERY` counter. No new
trimming machinery.

### Broadcast socket

**Unchanged.** The Unix broadcast socket and `latest.json` stay modem-only — the LCD renderer is
their only consumer (`CellularSource`) and it does not want battery samples. The battery chart
reads over `/rpc`, like Tracking.

## 2. Backend — `src/rpc/mudimodem`

### `M.get_battery_history(args)`

Same contract as `get_history`: `{window_ms = <ms>}` for an initial load or range change,
`{since = <epoch ms>}` for the incremental poll, both resolved against the **box clock**. Returns:

```lua
{ samples = <array>, now = <box epoch ms> }
```

No `events` key — annotations are derived client-side (decision 3).

### `read_window(path, since)` — shared, extracted, not copied

`get_history`'s reader is currently a closure inside the method. It gets extracted to a
module-local `read_window(path, since)` that both methods call.

⚠️ **This reader is load-bearing and was expensive to get right.** It reads the file's tail
**backward in 64 KB chunks** and stops at the window edge, splicing the partial line at each
chunk's head onto the next earlier read. The naive version — slurp all lines, decode only the
recent ones — measured **~7.4 s of CPU flat** over 14.6k lines, on page load *and* on every 10 s
poll, because the cost is materialising 14.6k interned strings, not the bytes. Current cost is
O(window): ~10 ms.

**The extraction must be pure — no behaviour change.** `test/backend-history.test.lua` is the
regression guard and stays untouched, which is precisely its value here.

### `get_battlimit` — two additive fields

Add `gui_m` and `gui_b` (the fit constants `13867` / `189300` the function already holds) to the
response, so the chunk can convert gauge → GUI **without a third copy of the formula** landing in
JavaScript. Purely additive; no existing caller changes.

### Validator

**No entry needed.** `get_battery_history` takes only numbers, which oui's default string-arg
allowlist (`^[%w%.%s%-_:#/]-$`) already accepts.

This is stated explicitly because it is a known trap (CLAUDE.md §5): free-form params are rejected
at `/rpc` with `-32602` **before the backend runs**, and on-device backend tests `dofile` the plugin
directly, **bypassing that layer entirely**. `verify.sh` therefore still gets a real `/rpc`
round-trip for the new method — the only thing that can catch it.

## 3. Frontend — `src/views/mudimodem-battery.js`

### Registration

A lazy chunk loaded exactly like Tracking / Speedtest / AT console: `axios.get` the chunk, `eval`
it, cache the component (`batteryComp` / `batteryLoading` / `batteryErr`, `openBattery()`).

**Chunk rules that are not optional** (CLAUDE.md §2/§5):
- The file is **one expression** — `module.exports = (function(){...})();` — because the SPA
  `eval`s it and takes the expression's value.
- Vue is **runtime-only**: `render(h)` only, **never** `template:`.
- Ship the `.gz` only (`gzip_static on`).

`TABS` in `src/views/mudimodem.js` becomes:

```
Tracking · SIM · Cell lock · Bands · AT console · Speedtest · Battery · Config · LCD Display
```

**No menu JSON.** Battery is an in-page tab only — unlike Tracking and Speedtest it is not also a
standalone hidden route.

### Layout

1. **Live status row** — GUI % with `≈ gauge` secondary, voltage, current, temperature, charger
   state, limit active/inactive. Sourced from `get_battlimit` plus the newest sample.
2. **The chart** — four lanes (below).
3. **The settings card** — enable toggle + target %, **moved verbatim** from the Config tab.
   `get_battlimit` / `set_battlimit` unchanged. The Config tab's battery card is **removed**.

Chart before settings: the chart is why you open the tab; the settings are set-once.

**Scale convention:** the UI always speaks **GUI %**, with gauge shown as a secondary estimate —
carried over from the 2026-07-22 battery spec, decision 3. The SoC lane and the target line are
both GUI %; the hover readout shows `72 % (gauge 66)`.

### The four lanes

One shared x-axis, one hover cursor spanning all lanes, one range selector. Each lane keeps its
real units and its own y-domain — chosen deliberately, because a y-domain is where a chart lies
most easily:

| lane | colour token | domain | why this domain |
|---|---|---|---|
| Charge · % | `--primary` | **fixed 0–100** | a percentage is absolute; auto-scaling turns 2 % of drift into a cliff |
| Current · mA | `--success` | auto, **always includes 0** | zero is the evidence the limit engaged — it must never be off-scale or merely implied |
| Voltage · V | `--info-hover` | fixed 3.3–4.3, auto-expand if exceeded | the Li-ion range; auto-scaling makes a flat 4.04 V look like mountains |
| Temp · °C | `--warning` | auto, **min span 5 °C** | same reason — a 0.3 °C wobble must not fill the lane |

Colours are **GL theme tokens only**, never hand-picked (CLAUDE.md §8: GL is not on Element UI's
stock palette).

### Annotations — all derived from the sample stream

- **Target line** — dashed horizontal on the Charge lane at `limit_gui`, only when the limit is
  enabled, labelled `target 80%`.
- **Charging-status band** — a thin strip under the x-axis shaded from `status` / `online`.
- **Plug/unplug ticks** — where `online` flips.
- **Cutoff marker** — where `cur == 0 && online == 1` begins, i.e. the limit actively blocking.

### Behaviours carried over from Tracking — each was a bug there first

- Ranges **15m / 1h / 6h / 24h**; initial fetch by `{window_ms}`, then a **10 s `{since}` poll**
  carrying the newest sample's own box-stamped timestamp.
- **`rpcSilent` (direct `window.$axios`), never `$rpcRequest`.** A failed background poll through
  `$rpcRequest` raises GL's global "Unknown error"/timeout banner from the axios interceptor
  **before our `.catch` runs**. Rule (CLAUDE.md §12): background/retrying calls use `rpcSilent`;
  only user-initiated one-shots use `$rpcRequest`. The settings card's save is user-initiated and
  **does** use `$rpcRequest`.
- **X-axis on the box clock** — `res.now` plus elapsed, never a browser-computed cutoff. An
  absolute browser-side `since` silently mis-sized the window by the clock skew: a laptop 10
  minutes slow asked for 25 minutes of data.
- **Break the line across gaps > 60 s** (3× the sample interval) rather than bridging an outage.
- Downsample to plot width for the 6 h / 24 h windows, **min/max-preserving per pixel column, not
  averaging**. Averaging would smear the Current lane's exact `0` into a small non-zero number and
  destroy the one reading the whole feature exists to show. A column containing a zero renders a
  zero.

### Empty and degraded states

| condition | behaviour |
|---|---|
| `battery.jsonl` absent (collector just started) | "No battery history yet — sampling starts within 20 s." |
| gauge absent (non-E5800) | chart hidden, honest "no battery data on this device" |
| `glbattlimit` absent | settings card shows its existing unavailable state; **the chart still works** — it does not depend on the tool |
| limit disabled | no target line; everything else unchanged |

## 4. Testing

All stdlib / Node. Nothing new is shipped to the router.

| file | covers |
|---|---|
| `test/collectd.test.py` | `read_battery()` against a **fixture sysfs dir** via `MUDIMODEM_BATT_SYSFS` (mirrors the existing `MUDIMODEM_HIST` / `MUDIMODEM_POLL` overrides, so tests never touch real `/sys`): mA passed through **unscaled**, µV→mV, deci-°C→°C, **negative sign preserved**, `0`-while-online distinguishable, missing node → `None`, garbage → `None`; battery trim at 24 h / 5,200 |
| `test/backend-battery-history.test.lua` | `get_battery_history`: `window_ms` vs `since`, both given → narrower wins, absent file → empty array, malformed lines skipped |
| `test/backend-history.test.lua` | **unchanged — the regression guard** proving the `read_window` extraction did not alter Tracking's output |
| `test/battery-chunk.test.js` | evals the chunk as the SPA does (mirrors `tracking.test.js`); asserts an expression yielding a component with `render`; pure helpers: lane domains, the >60 s gap break, gauge→GUI |

Battery collector tests go in `collectd.test.py` (pure parts), which matches the repo's `*.test.py`
convention — not `test_collectd.py`, which covers the broadcast socket and is the odd name out from
the LCD merge. Nothing gets renamed.

### `tools/verify.sh` additions

- `/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz` exists, gunzips, and **evals** to a
  component.
- `/tmp/mudimodem/battery.jsonl` exists and its **newest line's `t` is within 60 s of box now** —
  proving the sampler is live, without the 25 s sleep a grows-between-two-reads check would cost.
- **A real `/rpc` round-trip** of `get_battery_history` with a logged-in sid — the only layer that
  can catch a validator rejection (§2).

## 5. Rollout

- `tools/build.sh` — gzip the new chunk to
  `build/gl-sdk4-ui-mudimodem-battery.common.js.gz`.
- `tools/deploy.sh` — push it to `/www/views/`, and add it to the uninstall file list. No menu
  JSON to push.
- **Restart the collector** (`/etc/init.d/mudimodem-collectd restart`) — the sampler is new code.
- **Restart nginx, do not reload** (CLAUDE.md §8): each of the 4 workers `dofile`s its own copy of
  the plugin, and a HUP leaves old workers serving drained connections with the old backend.
- `/etc/sysupgrade.conf` — **nothing new registered.** That is a pre-existing repo-wide gap
  (§12), not something this change introduces or fixes.

## 6. Risks

| risk | mitigation |
|---|---|
| **`read_window` extraction touches Tracking's read path**, which has a bad performance history | Pure extraction, no behaviour change; `backend-history.test.lua` left untouched as the guard. The single riskiest change here — it can break something that currently works. |
| +350 KB tmpfs on a router | Measured against Tracking's existing ~3.8 MB; battery is ~9 % of that. Trimmed on the same counter. |
| A stalled `ubus_call` delaying battery samples | Battery read runs **first in the tick**, and the interval is **elapsed-time gated**, not tick-counted. |
| The GUI↔gauge fit is provisional and may be corrected | History stores **raw gauge**; only the render converts. A corrected fit re-reads existing history correctly. |
| Chart implies the limit works when it doesn't | The cutoff marker keys on `cur == 0 && online == 1` — the actual blocked signature — not on the configured setting. |

## 7. Attribution

The data source, the unit semantics and the `0 = blocked` convention all come from ChiliApple's
`glbattlimit`, which this repo ships. The existing attribution link stays. Issue #1 should be
answered with what shipped when it does.
