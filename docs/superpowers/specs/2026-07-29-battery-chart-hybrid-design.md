# Battery chart hybrid — jayck hover craft + our controls

**Date:** 2026-07-29  
**Status:** approved (session analysis + user "agree, plan then build")  
**Origin:** jayck88 reference branch `jayck88-patch-1` vs `main` Battery tab  
**Scope:** `src/views/mudimodem-battery.js` + `test/battery-chunk.test.js` only.  
No collector, RPC, sample schema, or Config-tab move.

## Goal

Keep our data plane and controls; transplant the chart interaction and
presentation craft from jayck88's Config-embedded history card into the
lazy Battery tab.

## Non-goals

- Do not merge battery into 4 s RF `get_history` / `samples.jsonl`
- Do not move the chart or charge-limit form back to Config
- Do not drop `lim` / `lim_gauge` or the charge-state model
- Do not take i18n / LCD Speedtest / AT `at_ok` from his patch
- Do not switch the limit control back to a free number input

## Keep (product spine)

| Piece | Why |
|---|---|
| Lazy Battery tab + `get_battery_history` + `battery.jsonl` @ 20 s | Isolation, modem-outage survival, RAM |
| Raw gauge `cap` + render-time GUI conversion | Fit can change without invalidating history |
| Per-sample `lim` / `lim_gauge` + `chargeState` | Only honest Full vs blocked discriminator |
| Shared multi-lane SVG, state band, plug ticks, target line | Cross-metric alignment the four mini-charts lack |
| Status tiles, 60 s avg current, runtime estimate | Controls/readouts he never built |
| Slider 50–100 GUI %, draft-on-`input` / save-on-`change` | Matches glbattlimit floor; doesn't fork processes per pixel |

## Take (chart craft)

| Piece | Behaviour |
|---|---|
| Per-lane live value + observed range | Lane title shows focus value and window min–max (e.g. `78% · 72–84%`) |
| Partial-window stretch | When retained history is shorter than the selected range, samples span the full plot; axis says `~Nh ago` not empty left padding |
| Hover: relative + absolute time | Readout: `4 min ago · 14:22:05 · 78% · −360 mA · …` |
| Hover: sample dots | Circle on each lane at the nearest sample's y |
| Nearest-sample binary search | O(log n) by `t` |
| Stale-request ignore | `histRequestSeq` drops late replies after a range change |
| Freeze retained samples | `Object.freeze` on the samples array after each successful fetch (Vue 2 skip deep observe) |
| Limit status copy | GUI % primary; optional "Charging stopped" when latest sample is ≤30 s old, online, and `|cur| ≤ 10` while limit is active |

## Deliberate hybrid choices

1. **Keep one shared SVG**, not four independent mini-plots. His row layout is denser; our state band and plug ticks need a shared x-axis. Per-lane value/range text delivers most of his scannability without losing alignment.

2. **Keep minutes/`winW` selection**, change only the **plot domain** via `chartBounds(ss)`:
   - `end = nowMs()`
   - `start = end - winW·60s`, raised to the first sample's `t` when history is short
   - All x mapping uses `(t - start) / (end - start)`

3. **Hover stays Vue-driven** for the first pass (cursor + pinned still work). Direct-DOM chrome + rAF is a follow-up if 24 h hover still feels heavy after freeze + binary search + path reuse of existing `reduce`.

4. **No schema change.** Field names stay `cap`/`cur`/`volt`/`temp`/`lim`/`lim_gauge`.

## Architecture (unchanged outside the chunk)

```
battery.jsonl ── get_battery_history ── mudimodem-battery.js
                                         ├─ status + estimate (unchanged)
                                         ├─ shared 4-lane SVG (upgraded)
                                         └─ charge-limit card (copy polish)
```

## Testing

Extend `test/battery-chunk.test.js` (eval the chunk as the SPA does):

- `chartBounds` stretches when history is short; full when long
- `nearestSampleIn` returns correct sample (binary search parity with linear)
- Lane labels include observed range when samples exist
- Hover readout includes relative-time fragment
- Sample dots appear when `cursor` is set
- `fetchHistory` ignores stale replies (request seq)
- Limit card shows "Charging stopped" only under the freshness rule
- Existing 81 tests remain green (no regressions to chargeState, reduce zero, estimate, etc.)

## Success criteria

1. Chart feels closer to jayck's: values + ranges visible, better hover, no empty left on short history  
2. Every control and domain guarantee we already ship still holds under the existing test suite  
3. No backend / collector / deploy surface changes  
