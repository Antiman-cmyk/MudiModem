# Battery runtime / charge-time estimate

**Date:** 2026-07-28
**Status:** approved (brainstorm)
**Scope:** `src/views/mudimodem-battery.js` + `test/battery-chunk.test.js`. No backend,
no collector, no new RPC — it reads the history the Battery tab already fetches.

## Goal

A headline figure at the top of the Battery tab: **how long the battery will last**, or
**how long until it reaches its target**, derived from the SoC trend in the collected
history.

## Background — what the hardware does and does not offer

Verified on the box 2026-07-28:

```
/sys/class/power_supply/cw221X-bat/ :
  capacity  current_now  cycle_count  health  present  technology  temp  voltage_now
```

**There is no `charge_full`, `charge_now`, `energy_*`, or `time_to_*` node.** The pack's
capacity in mAh is not exposed anywhere on the device. So the obvious approach —
remaining mAh ÷ current mA — is **impossible without inventing a capacity figure**, and a
datasheet number typed from memory is exactly the kind of fabrication this project exists
to avoid.

What we do have is a time series of `cap`, sampled every 20 s and retained for 24 h. The
estimate therefore comes from the **SoC slope**, which has the additional virtue of
self-calibrating to actual usage rather than to a nameplate rating.

### Why a spot current reading will not do

Observed over 97 minutes of real history: instantaneous `cur` ranged **−449 to −985 mA**
with a mean of **−177 mA**. A reading-to-reading estimate would swing by a factor of two
between refreshes. The slope over a window is the stable signal.

### The state distribution this must handle

From the same 97 minutes:

| state | observed |
|---|---|
| plugged, not charging | 47 min |
| unplugged, draining | 33 min |
| plugged but draining (limiter holding) | 10 min |
| blocked by the limiter | 6 min |
| **actively charging** | **0 min** |

⚠️ **"Plugged in" does not mean "charging" on this box.** `glbattlimit` blocks charge at
the target, so the router runs off the battery while on mains and the SoC *falls* — 71 %
to 65 % across that window. An estimator keyed on `charger/online` would be wrong most of
the time.

## Non-goals

- No mAh/Wh figures, no power draw in watts — the capacity needed for both is unavailable.
- No estimate of *when charging will resume* after a limiter hold (the resume threshold is
  glbattlimit's internal behaviour and is not exposed).
- No change to the collector, the RPC layer, or the sample schema.
- No persistence of estimates; it is recomputed from history on each render.

## Decisions

| # | Decision |
|---|---|
| 1 | **SoC-slope based**, not current-based — the pack capacity does not exist on the box. |
| 2 | Computed in the **GL UI scale**, not the IC scale (see §2 — this is a correctness point, not a presentation one). |
| 3 | **Three honest cases**: runtime when draining, time-to-target when charging, "holding" when the limiter is active. No countdown during a hold. |
| 4 | **Never fabricate**: below the evidence threshold it says `Estimating…`. |
| 5 | The figure **states its own provenance** (`from the last 38 min`). |

## 1. Segmenting

Only samples since the **last direction change** are eligible. Direction is derived from
the existing `chargeState()`:

| `chargeState()` | direction |
|---|---|
| `discharging`, `draining` | **down** |
| `charging` | **up** |
| `blocked` | **hold** |
| `full` | **full** |
| `idle`, `unknown` | **none** |

Walk the window's samples backward from the newest, stopping at the first sample whose
direction differs. That trailing run is the segment. A plug or unplug mid-window therefore
resets the basis rather than averaging two different physical regimes together.

## 2. ⚠️ The slope is computed on `capGui`, not `cap`

**GUI 0 is IC ~13.65, not IC 0.** Extrapolating the raw IC value to zero would promise
several hours of runtime that do not exist, because the user's "empty" arrives when the
displayed figure hits 0 — well before the gauge does.

Computing in the GUI scale also means the target for charging (`bl.limit_gui`) needs no
conversion, and the displayed number and the number being extrapolated are the same scale.

Least-squares fit of `capGui` against `t` over the trailing **60 minutes** of the segment
(or the whole segment if shorter). Regression rather than last-minus-first because `cap` is
an integer percentage that moves in 1 % steps, so the endpoints sit at arbitrary positions
within a step; regression uses every point.

## 3. Evidence threshold

A number is displayed only when **all** hold:

- segment span **≥ 8 minutes**, and
- observed change **≥ 2 %** (GUI), and
- the fitted slope's **sign matches the direction**.

Otherwise: `Estimating…`.

At the discharge rate seen while unplugged this is satisfied in roughly 10 minutes; on a
light idle it takes longer, and waiting is the correct behaviour. A 1 % threshold was
rejected: with 1 % quantisation, a single step gives an error band of ±100 %.

## 4. Targets and display

| state | target | display |
|---|---|---|
| down | **0 % GUI** | `~4 h 20 m remaining` |
| up | `bl.limit_gui` when the limit is enabled, else **100 % GUI** | `~1 h 10 m to 80 %` |
| hold | — | `Holding at 80 %` |
| full | — | `Full` |
| none / below threshold | — | `Estimating…` |

**Why no countdown during a hold:** the battery genuinely is draining, but `glbattlimit`
resumes charging at a lower threshold — so a "4 h remaining" there is a prediction the
device is designed to falsify.

**Formatting.** `~` prefix always. `4 h 20 m` above an hour, `35 m` below. Anything beyond
48 h renders `> 2 d` rather than a large precise-looking number. Minutes round to 5 below
2 h and to 15 above, since false precision on an extrapolation is its own kind of lie.

**Provenance line**, quiet, beneath the figure: `from the last 38 min`. It lets a wild
number be judged instead of merely believed.

## 5. Structure

One pure function plus one renderer:

```js
runEstimate(samples, bl) -> {
  kind: "down" | "up" | "hold" | "full" | "none",
  minutes: <number|null>,     // null unless kind is down/up AND the threshold is met
  targetPct: <number|null>,   // the GUI % being extrapolated to
  spanMin: <number>,          // segment span actually used
  deltaPct: <number>          // observed change over it
}
```

`renderEstimate(h)` formats only — no arithmetic. This keeps every case testable without
rendering.

**Placement:** a headline row at the top of the status card, above the existing tiles —
large value, small provenance line beneath. The tiles are unchanged.

**Render cost:** `runEstimate` is called **once per render** and takes the already-computed
sample window as an argument. It must not recompute `winSamples()` internally — that is the
mistake that made the chart quadratic (final review of 2026-07-27, finding C1).

## 6. Testing

| test | asserts |
|---|---|
| discharge slope | a clean falling series yields a plausible runtime to 0 % GUI |
| extrapolates to GUI 0, not IC 0 | a series ending near IC 20 gives a much shorter runtime than an IC-0 extrapolation would |
| charge to the limit | with the limit enabled, the target is `limit_gui`, not 100 |
| charge with no limit | target is 100 |
| holding | `kind: "hold"`, `minutes: null` — no countdown |
| full | `kind: "full"` |
| below threshold | a 4-minute segment, or a 1 % change, yields `kind` with `minutes: null` |
| segment reset | an unplug mid-window discards the pre-change samples from the basis |
| quantisation | a stepped integer series still yields a sane slope |
| formatting | `> 2 d` beyond 48 h; `35 m` under an hour; rounding granularity |
| render cost | `runEstimate` receives the window and calls no window-recomputing helper |

## Constraints

Unchanged: Vue 2.6 runtime-only (`render(h)`, never `template:`); the file stays ONE
expression; ES5-only plain JavaScript; theme tokens for colour.
