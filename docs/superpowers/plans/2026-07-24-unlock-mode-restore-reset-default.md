# Fix cell-unlock 5G-only stranding + "Reset to default" bands button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unlocking a cell tower restore the modem to AUTO (so a 5G unlock no longer strands on "5G only"), and add a "Reset to default" button on the Bands tab that stages AUTO + all permitted bands for the user to Apply.

**Architecture:** Two independent changes. (1) Backend: `clear_cell_lock` issues the mode-restore AT writes after GL clears the tower lock. (2) Frontend: a `resetDefault()` method + a button in the Bands footer that reuses the existing `setMode`/`selectAll`/`applyBands` machinery.

**Tech Stack:** Lua RPC plugin (`dofile`-loaded, bare `at()`/ubus — no pcall); hand-written Vue 2.6.12 runtime-only chunk (`render(h)`); Node `node:test` for the chunk; `luac -p` for Lua syntax.

## Global Constraints

- **NEVER wrap `at()`/`oui.ubus.call` in pcall** — cosocket yields across a C boundary and throws. Call bare. (CLAUDE.md §8)
- **`sub_id=0` is forbidden** — resolve the active slot via `resolve_active()` and use its `sub_id`. (CLAUDE.md §6)
- **Frontend is runtime-only Vue 2.6.12** — `render(h)` only, no `template:`; the chunk stays a `module.exports = {...}` expression.
- **RPC uses `window.$rpcRequest("call", ["sid", "mudimodem", <method>, <args>], …)`** with the literal `"sid"` placeholder.
- **Band group keys are `"sa"`, `"nsa"`, `"LTE"`** (LTE capitalized) in `sel`/`selectAll`/`changed`. Mode values are `"AUTO"`, `"NR5G"`, `"LTE"`.
- **Unlock/reset only widen config** → no confirm-or-revert on the unlock path; "Reset to default" still routes its write through the normal `set_bands` Apply flow.

---

### Task 1: Backend — `clear_cell_lock` restores mode to AUTO

**Files:**
- Modify: `src/rpc/mudimodem` (function `M.clear_cell_lock`, lines 479-490)
- Modify: `tools/verify.sh` (add a static check that the mode-restore is present)

**Interfaces:**
- Consumes: `resolve_active()` → `(sub_id, plmn, matched, slot)`; the bare `at(cmd, sub_id)` helper (line 60); `glc(...)` for the GL unlock (unchanged).
- Produces: `clear_cell_lock` returns `{ ok = true, mode = "AUTO" }` (or `{ error = ... }`), and now leaves `mode_pref=AUTO`, `nr5g_disable_mode=0`, `save_ctrl=0,0`.

- [ ] **Step 1: Apply the backend fix**

Replace `M.clear_cell_lock` (lines 479-490) with:

```lua
function M.clear_cell_lock(args)
  local sub_id, _, _, slot = resolve_active()
  local gl = glc("modem", "get_cell_tower", { bus = "cpu" })
  local tower = (gl and gl["slot" .. tostring(slot)]) or {}
  local payload = { bus = "cpu", slot = tonumber(slot) or 1, lock = false }
  for k, v in pairs(tower) do if payload[k] == nil then payload[k] = v end end
  local res, err = glc("modem", "set_cell_tower", payload)
  if not res then return { error = "GL unlock failed: " .. tostring(err) } end
  -- GL clears QNWLOCK but leaves the lock's mode side-effect in place, so a 5G
  -- unlock would strand the modem on 5G-only (a 4G lock forces LTE:NR5G +
  -- nr5g_disable_mode=1). Restore the sane default. AUTO — not the exact pre-lock
  -- mode — because the manual-unlock path has no PREV snapshot: PENDING is
  -- deleted on Keep, and Unlock is disabled while a revert pends. Mirrors panic.
  -- Bare at() only — never pcall a cosocket (CLAUDE.md §8).
  at('AT+QNWPREFCFG="mode_pref",AUTO', sub_id)
  at('AT+QNWPREFCFG="nr5g_disable_mode",0', sub_id)
  at('AT+QNWLOCK="save_ctrl",0,0', sub_id)
  os.remove(STALE)
  append_event("user", "Cell lock cleared", "unlocked + mode restored to AUTO")
  return { ok = true, mode = "AUTO" }
end
```

- [ ] **Step 2: Verify Lua syntax (local)**

Run: `luac -p src/rpc/mudimodem`
Expected: no output, exit 0.

- [ ] **Step 3: Add a static verify.sh check that the fix is present**

The backend surface test must NOT *call* `clear_cell_lock` (it would unlock the live modem). Instead add a static assertion. In `tools/verify.sh`, after the existing cell-lock check (step "6b"), append:

```sh
echo "6c. clear_cell_lock restores mode to AUTO (static — never call it on the live link)"
ssh -o BatchMode=yes "root@$HOST" '
  f=/usr/lib/oui-httpd/rpc/mudimodem
  grep -q "function M.clear_cell_lock" "$f" || exit 1
  grep -q "mode_pref\",AUTO" "$f" || exit 1
  grep -q "nr5g_disable_mode\",0" "$f" || exit 1' \
  || fail "clear_cell_lock does not restore mode_pref=AUTO / nr5g_disable_mode=0"
```

- [ ] **Step 4: Syntax-check verify.sh (local)**

Run: `sh -n tools/verify.sh`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/rpc/mudimodem tools/verify.sh
git commit -m "fix(cell-lock): unlock restores mode_pref=AUTO (no more 5G-only stranding)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**On-device functional verification (controller, deferred — a real modem write):** deploy, then on the Cell lock tab lock a 5G cell → Keep → Unlock → confirm the strip/Bands mode shows AUTO (not 5G-only). This exercises the box's only cellular link, so it is manual, not part of the unattended suite.

---

### Task 2: Frontend — "Reset to default" button on the Bands tab

**Files:**
- Modify: `src/views/mudimodem.js` (add `resetDefault()` in `methods:` near `selectAll`; add the button in `renderBands`'s footer, ~line 1922-1929)
- Modify: `test/chunk.test.js`

**Interfaces:**
- Consumes: `setMode("AUTO")` (line 1429), `selectAll("sa"|"nsa"|"LTE")` (line 1452), `changedAny()` (line 1473), `this.pending`, `this.bands`.
- Produces: `resetDefault()` method; a "Reset to default" button in the Bands footer that stages AUTO + all permitted bands and lights up Apply.

- [ ] **Step 1: Write the failing tests**

Append to `test/chunk.test.js` (before the final line). The existing `bandsVm(c)` helper seeds `policy: { sa:[41,71], nsa:[41,71], LTE:[12,66] }` and `config.sa=[71]`, `selMode` from `meta.mode`:

```js
test('bands tab: Reset to default stages AUTO + all permitted bands, enables Apply', () => {
  const c = loadChunk();
  const vm = bandsVm(c, { meta: { mode: 'NR5G', plmn_matched: true } });   // start at 5G-only
  vm.selMode = 'NR5G';
  vm.resetDefault();
  assert.strictEqual(vm.selMode, 'AUTO', 'mode reset to AUTO');
  assert.deepStrictEqual(vm.sel.sa.slice().sort(), [41, 71], 'all permitted SA selected');
  assert.deepStrictEqual(vm.sel.nsa.slice().sort(), [41, 71], 'all permitted NSA selected');
  assert.deepStrictEqual(vm.sel.LTE.slice().sort(), [12, 66], 'all permitted LTE selected');
  assert.strictEqual(vm.changedAny(), true, 'staged change enables Apply');
});

test('bands tab: Reset to default button renders and is a no-op while pending', () => {
  const c = loadChunk();
  const vm = bandsVm(c);
  // button present in the footer
  const btns = walk(c.render.call(vm, h))
    .filter((n) => n.tag === 'button').map(textOf);
  assert.ok(btns.includes('Reset to default'), 'Reset to default button renders');
  // guarded while a revert is pending
  vm.pending = { kind: 'bands', remaining: 30, window: 60, applied: {} };
  const before = JSON.stringify(vm.sel);
  vm.resetDefault();
  assert.strictEqual(JSON.stringify(vm.sel), before, 'resetDefault is a no-op while pending');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/chunk.test.js`
Expected: FAIL — `resetDefault` is not a function / no "Reset to default" button.

- [ ] **Step 3: Add the `resetDefault` method**

In `src/views/mudimodem.js`, add this method immediately after `invertSel` (after line 1464):

```js
    resetDefault() {
      // Stage the modem's sane default: AUTO mode + every permitted band in each
      // group. Writes nothing — lights up Apply so the user reviews then applies
      // through the normal confirm-or-revert path. No-op while a revert pends.
      if (this.pending || !this.bands) return;
      this.setMode("AUTO");
      this.selectAll("sa");
      this.selectAll("nsa");
      this.selectAll("LTE");
    },
```

- [ ] **Step 4: Add the button to the Bands footer**

In `renderBands`, the footer builds `mm-foot` with a status span + Apply button (lines 1922-1929). Replace that `footer.push(...)` block with one that adds "Reset to default" alongside Apply:

```js
        footer.push(h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, [status]),
          h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
            h("button", {
              staticClass: "mm-btn",
              attrs: { disabled: this.applying },
              on: { click: function () { self.resetDefault(); } }
            }, "Reset to default"),
            h("button", {
              staticClass: "mm-btn primary",
              attrs: { disabled: !changed || this.applying || empty },
              on: { click: function () { self.applyBands(); } }
            }, this.applying ? "Applying..." : "Apply")
          ])
        ]));
```

(The footer already only renders when `!this.pending`, so the button is hidden during a revert; `resetDefault`'s own guard is the belt-and-suspenders the test checks.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/chunk.test.js`
Expected: PASS — the two new tests plus the entire existing chunk suite still green.

- [ ] **Step 6: Commit**

```bash
git add src/views/mudimodem.js test/chunk.test.js
git commit -m "feat(bands): Reset to default button (stages AUTO + all permitted bands)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Part 1 (fix unlock stranding) → Task 1: `clear_cell_lock` adds `mode_pref=AUTO` + `nr5g_disable_mode=0` + `save_ctrl=0,0`, restores to AUTO with the documented rationale, no revert, frontend untouched (it already re-fetches). Static verify check added; on-device functional check documented as manual. ✔
- Part 2 (Reset to default) → Task 2: stages `AUTO` + all permitted bands via existing `setMode`/`selectAll`, routes through normal Apply, disabled while pending. ✔
- Out-of-scope items (exact pre-lock mode, durable GL-config write, combined single button) are not implemented. ✔

**Placeholder scan:** none — every step carries complete code and exact commands.

**Type/name consistency:** group keys `"sa"/"nsa"/"LTE"` and mode `"AUTO"` used consistently across `resetDefault`, the tests, and `changedAny`. `clear_cell_lock` uses `resolve_active()`'s `sub_id` (was previously discarded) and the bare `at()` helper. Verify check greps the exact strings the backend writes.
