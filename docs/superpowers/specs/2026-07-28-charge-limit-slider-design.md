# Charge-limit target: number input → slider

**Date:** 2026-07-28
**Status:** approved (brainstorm)
**Scope:** `src/views/mudimodem-battery.js` (Battery tab) + `test/battery-chunk.test.js`.
Follows the Battery tab work of 2026-07-27.

## Goal

Replace the charge-limit **target** number input with a slider, bounded to the range the
hardware will actually accept.

## Why — 30 % of the current input's range is dead

The input accepts **GUI 20–100**, but `glbattlimit` enforces a **gauge ≥ 50** floor, and the
backend rejects anything below it with `"limit too low (min ~50% gauge / use higher GUI %)"`.
Computed from the shipped fit constants (`GUI_M = 13867`, `GUI_B = 189300`):

| GUI | gauge | outcome |
|---|---|---|
| 20 | 28 | rejected |
| 45 | 46 | rejected |
| 49 | 49 | rejected |
| **50** | **50** | accepted — the true floor |
| 80 | 71 | accepted (the current setting on the box) |
| 100 | 86 | accepted |

So the control currently offers values it will then refuse. A slider bounded at 50 makes the
invalid range **unreachable** rather than merely validated-against — the difference between a
control that cannot express a mistake and one that reports it afterwards.

Note in passing: GUI 100 maps to gauge 86, so "100 % GUI" is not a full cell. That is the
existing scale convention (the 2026-07-22 battery spec, decision 3) and is unchanged here.

## Non-goals

- No change to `get_battlimit` / `set_battlimit`, the backend, the collector, or the chart.
- No change to the GUI↔gauge fit itself.
- No preset/snap behaviour — the slider is continuous at `step: 1`.
- No second control (no number box beside the slider).

## Design

### 1. The control

In `renderLimitCard`, the target input changes from:

```js
attrs: { type: "number", min: 20, max: 100, step: 1, disabled: ... }
```

to:

```js
attrs: { type: "range", min: 50, max: 100, step: 1, disabled: ... }
```

`disabled` logic is unchanged (`!bl.enabled || blBusy`).

### 2. Events — unchanged, and that is the point

The existing handlers already split correctly, and on a range input they map exactly onto
drag and release:

| event | current behaviour | on a slider |
|---|---|---|
| `input` | `blDraft = Number(e.target.value)` | fires continuously while dragging — updates the label only |
| `change` | `applyBattLimit({ limit_gui: blDraft })` | fires once on release — one RPC |

**Committing on `input` would be wrong:** every save spawns a process on the router
(`set_battlimit` → `glbattlimit`), so firing per drag-pixel would hammer it.

### 3. Live readout

Beside the thumb: `<draft> % GUI  (≈ <gauge> % gauge)`.

Both figures track **the draft**, not the server snapshot. `bl.limit_gauge` is the *saved*
value and would lag the thumb during a drag.

`applyBattLimit` already computes the GUI→gauge conversion inline:

```js
var gauge = Math.floor((limit_gui * 10000 + GUI_B + GUI_M / 2) / GUI_M);
```

**Extract it to a `gaugeOf(gui)` method** and call it from both the readout and
`applyBattLimit`. Duplicating the formula a third time (it already exists in the Lua backend
and in `glbattlimit`) is what this avoids. `gaugeOf` uses the served `bl.gui_m` / `bl.gui_b`
when present, falling back to the module constants — mirroring how `guiOf` already works.

### 4. ⚠️ The "limit too low" guard STAYS

An earlier framing said this branch becomes dead code. **It does not, and removing it would
delete a real safety net** that has been mutation-tested.

`applyBattLimit` has two callers:

1. the slider's `change` — always passes a draft in 50–100 by construction;
2. **the enable/disable checkbox** — passes `cur.limit_gui`, the *server's stored value*.

A stored value below 50 can exist (a hand-edited `/etc/mudimodem/battlimit.json`, or a legacy
setting), and toggling the checkbox would carry it straight into the guard. Both the 20–100
range check and the gauge ≥ 50 floor therefore remain exactly as they are.

The slider closes the invalid range **through the slider**. The guard covers the other path.

### 5. Out-of-range stored value

If `get_battlimit` returns a `limit_gui` below the slider minimum, clamp **the draft** to 50
for display, so the thumb cannot misrepresent what is stored.

**Do not auto-save the clamped value.** Silently rewriting a user's setting because the UI
changed shape is worse than showing a clamped thumb; the next deliberate interaction saves a
valid value.

### 6. Styling

One rule added to `injectStyle`:

```css
.mmb-v input[type=range]{width:180px;vertical-align:middle;accent-color:var(--primary)}
```

`accent-color` keeps it on theme tokens. Engines without support fall back to the default
control colour — acceptable, and no hex value is introduced.

## Testing

Update the existing assertions that expect `type: "number"`, and add:

| test | asserts |
|---|---|
| slider bounds | `type === "range"`, `min === 50`, `max === 100` — the rejected range is unreachable |
| drag is silent | an `input` event updates the draft and issues **no** RPC |
| release commits | a `change` event issues **exactly one** `set_battlimit` |
| readout tracks the draft | the label and the gauge estimate follow the draft, not `bl.limit_gauge` |
| disabled when off | the control is disabled when the limit is off or a save is in flight |
| out-of-range clamp | a stored `limit_gui` of 30 clamps the thumb to 50 **and issues no RPC** |
| `gaugeOf` | matches the backend's integer formula at the boundaries (50→50, 80→71, 100→86) |

The existing RPC-stubbing harness in `test/battery-chunk.test.js` covers the call-counting
assertions; no new harness is needed.

## Constraints

Unchanged from the Battery tab work: Vue 2.6 runtime-only (`render(h)`, never `template:`);
the file stays ONE expression; ES5-only plain JavaScript; colours from theme tokens; the
charge-limit form is user-initiated so it stays on `$rpcRequest`, not `rpcSilent`.
