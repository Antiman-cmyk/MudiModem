# Battery Chart Hybrid Implementation Plan

> **For agentic workers:** Steps use checkbox syntax. Execute inline or per-task.

**Goal:** Port jayck88's chart interaction craft into `mudimodem-battery.js` while keeping our data plane, state model, and charge-limit controls.

**Architecture:** Frontend-only changes in the Battery lazy chunk. Shared multi-lane SVG gains partial-window bounds, per-lane value/range labels, richer hover (time + dots), binary-search nearest sample, stale-request ignore, and frozen sample arrays. Limit-card status copy is polished.

**Tech Stack:** Plain Vue 2 options API, `render(h)`, Node test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-29-battery-chart-hybrid-design.md`

## Global Constraints

- No collector / RPC / sample schema changes
- `render(h)` only — no `template:`
- GL theme tokens only for colours
- Existing chargeState / lim / lim_gauge semantics are load-bearing — do not "simplify"
- Tests: `node --test test/battery-chunk.test.js`

## File map

| File | Role |
|---|---|
| `src/views/mudimodem-battery.js` | All behaviour changes |
| `test/battery-chunk.test.js` | New + regression tests |
| Spec/plan under `docs/superpowers/` | Design record |

---

### Task 1: Chart bounds + x-by-time + observed range + binary nearest

**Files:**
- Modify: `src/views/mudimodem-battery.js`
- Test: `test/battery-chunk.test.js`

**Produces:**
- `chartBounds(ss) → { start, end }` ms
- `xOfT(t, bounds) → number`
- `observedRange(ss, key, dec) → string`
- `nearestSampleIn(ss, t)` binary search by sample `t` (cursor becomes time ms)
- Axis labels use actual span; partial windows prefix `~`

- [x] Tests for bounds stretch, full window, observedRange, nearest
- [x] Implement methods; switch `renderLanes` x-mapping from `xOf(m)` to `xOfT(t, bounds)`
- [x] `node --test test/battery-chunk.test.js` green

### Task 2: Hover craft — relative time, dots, lane focus labels

**Files:** same

**Produces:**
- `fmtAgo(t)` relative time string
- Hover readout: `ago · HH:MM:SS · values…`
- Circle per lane at nearest sample
- Lane title includes focus value + observed range

- [x] Tests for readout / dots / lane label content
- [x] Implement in `renderLanes`
- [x] Tests green

### Task 3: Fetch reliability — request seq + freeze

**Files:** same

**Produces:**
- `histRequestSeq` bumps on every fetch; stale replies ignored
- Successful sample arrays passed through `Object.freeze` when available
- Range change still backfills correctly

- [x] Test stale reply ignored
- [x] Implement in `fetchHistory`
- [x] Tests green

### Task 4: Limit-card status copy + "Charging stopped"

**Files:** same

**Produces:**
- Status leads with GUI target / current when available
- `Charging stopped` only when `bl.active` and latest sample is ≤30 s old, `online`, and `|cur| ≤ 10`

- [x] Tests for the freshness rule
- [x] Implement in `renderLimitCard`
- [x] Full suite green

### Task 5: Verify + optional build gzip

- [x] `node --test test/battery-chunk.test.js` (89 pass)
- [x] `./tools/build.sh`
