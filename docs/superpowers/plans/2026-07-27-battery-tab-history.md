# Battery Tab + History Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Battery` tab to the MudiModem page containing a four-lane battery history chart (charge, current, voltage, temperature) plus the charge-limit settings moved out of the Config tab.

**Architecture:** The existing `mudimodem-collectd` daemon gains a second sampler that reads `/sys/class/power_supply` every 20 s into `/tmp/mudimodem/battery.jsonl`. A new `get_battery_history` RPC method serves windows of that file using the same backward-chunk reader `get_history` already uses (extracted to a shared helper). A new lazy-loaded chunk `mudimodem-battery.js` draws the chart and owns the charge-limit form.

**Tech Stack:** Python 3.11 stdlib (collector), Lua 5.1 + cjson (RPC backend), plain ES5 JavaScript + Vue 2.6 runtime-only render functions (chunk), Node 20 `node:test` (chunk tests), stdlib `unittest` (Python tests), plain `lua` scripts (backend tests).

**Spec:** `docs/superpowers/specs/2026-07-27-battery-tab-history-design.md`

## Global Constraints

These apply to **every** task. They are not style preferences — each one is a bug this repo has already paid for.

- **Vue is runtime-only.** `render(h)` only. **Never** `template:`. A `template:` key silently renders nothing.
- **A chunk file must be ONE EXPRESSION** — `module.exports = (function () { ... })();` — because the SPA `eval`s the file and uses the expression's value.
- **Never wrap `oui.ubus.call` in `pcall`.** It uses an nginx cosocket that yields; `pcall` is a C-call boundary and this box's Lua cannot yield across one. It already returns `(nil, err)`. (No task here calls ubus, but the rule governs any edit to `src/rpc/mudimodem`.)
- **Background/retrying browser calls use `rpcSilent` (direct `window.$axios`), never `$rpcRequest`.** `$rpcRequest`'s axios interceptor raises GL's global error banner *before* your `.catch` runs. Only user-initiated one-shots (a button, a form save) use `$rpcRequest`.
- **Time windows are sent to the box as a DURATION (`window_ms`), never as a browser-computed absolute cutoff.** The x-axis uses the box clock (`res.now` + elapsed). Browser/box clock skew on a travel router is real and silently mis-sizes windows.
- **All colours are GL theme tokens** (`var(--primary)`, `var(--success)`, `var(--warning)`, `var(--info-hover)`, `var(--divider)`, `var(--text-badge)`, `var(--text-hint)`, `var(--error)`). Never hand-pick a hex value.
- **Units are per-node, no blanket rule:** `current_now` is **mA** already (signed, `0` = blocked); `voltage_now` is **µV**; `temp` is **deci-°C**; the *charger* node's limits are µA. Verified on box 2026-07-27.
- **Python must be stdlib-only** (no pip on the box). **Lua is 5.1**, and `string.format("%d", <epoch ms>)` **fails** on this box's int32 double build — use `%.0f`.
- Commit after every task. Never `git push` (not asked for).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/sbin/mudimodem-collectd` | modify | add `read_battery()` + a 20 s elapsed-gated battery sampler + battery trim |
| `src/rpc/mudimodem` | modify | extract `read_window()`; add `get_battery_history`; add `gui_m`/`gui_b` to `get_battlimit` |
| `src/views/mudimodem-battery.js` | **create** | the whole Battery tab: data layer, chart, charge-limit form |
| `src/views/mudimodem.js` | modify | add the Battery tab + lazy loader; **delete** the battery card, state and methods from Config |
| `test/collectd.test.py` | modify | `read_battery()` + battery trim |
| `test/backend-battery-history.test.lua` | **create** | `get_battery_history` windowing |
| `test/battery-chunk.test.js` | **create** | chunk evals; pure helpers |
| `tools/build.sh` | modify | gzip the new chunk |
| `tools/deploy.sh` | modify | push the chunk; register it in `/etc/sysupgrade.conf` |
| `tools/verify.sh` | modify | on-device: chunk serves + evals, `battery.jsonl` is fresh, `/rpc` round-trip |
| `CLAUDE.md` | modify | architecture table, repo layout, status, and the **stale sysupgrade note** |

Task order is dependency order: collector → backend → chunk data → chunk render → page wiring → ship.

---

### Task 1: Collector — battery sampling

**Files:**
- Modify: `src/sbin/mudimodem-collectd`
- Test: `test/collectd.test.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `read_battery(root=None, t=None) -> dict | None` — one battery sample, or `None` if the gauge is unreadable.
  - Module constants `BATT_INTERVAL` (float seconds, default `20`), `BATT_MAX_AGE` (int ms), `BATT_MAX_LINE` (int), `BATT_SYSFS` (str path).
  - New file written at runtime: `<MUDIMODEM_HIST>/battery.jsonl`, one JSON object per line, keys `t, cap, volt, cur, temp, online, status, ctype, cycles, health`.

- [ ] **Step 1: Write the failing tests**

Append to `test/collectd.test.py`, immediately before the `if __name__ == "__main__":` block:

```python
def _mkbat(d, **over):
    """Build a fake /sys/class/power_supply tree. Values are the real ones
    captured off the box 2026-07-27 (unplugged/discharging)."""
    bat = os.path.join(d, "cw221X-bat")
    chg = os.path.join(d, "charger")
    os.makedirs(bat, exist_ok=True)
    os.makedirs(chg, exist_ok=True)
    fields = {
        "cw221X-bat/capacity": "70", "cw221X-bat/voltage_now": "4010000",
        "cw221X-bat/current_now": "-363", "cw221X-bat/temp": "316",
        "cw221X-bat/cycle_count": "4", "cw221X-bat/health": "Good",
        "charger/online": "0", "charger/status": "Discharging",
        "charger/charge_type": "N/A",
    }
    fields.update(over)
    for rel, val in fields.items():
        if val is None:                       # None => the node does not exist
            p = os.path.join(d, rel)
            if os.path.exists(p):
                os.unlink(p)
            continue
        with open(os.path.join(d, rel), "w") as f:
            f.write(val + "\n")
    return d


class ReadBattery(unittest.TestCase):
    def test_units_converted_per_node(self):
        with tempfile.TemporaryDirectory() as d:
            s = collectd.read_battery(_mkbat(d), t=1000)
            self.assertEqual(s["t"], 1000)
            self.assertEqual(s["cap"], 70)        # raw gauge %, NOT converted to GUI
            self.assertEqual(s["volt"], 4010)     # uV -> mV
            self.assertEqual(s["temp"], 31.6)     # deci-C -> C
            self.assertEqual(s["cycles"], 4)

    def test_current_is_milliamps_already_and_keeps_its_sign(self):
        # glbattlimit line 166: "mA (+charging -discharging 0=blocked)".
        # Dividing by 1000 here would be the obvious wrong guess (the Linux
        # power_supply class normally uses uA) and would silently flatten the lane.
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(collectd.read_battery(_mkbat(d), t=1)["cur"], -363)
        with tempfile.TemporaryDirectory() as d:
            s = collectd.read_battery(_mkbat(d, **{"cw221X-bat/current_now": "1183"}), t=1)
            self.assertEqual(s["cur"], 1183)

    def test_blocked_is_zero_current_while_online(self):
        with tempfile.TemporaryDirectory() as d:
            s = collectd.read_battery(_mkbat(d, **{
                "cw221X-bat/current_now": "0", "charger/online": "1",
                "charger/status": "Full", "charger/charge_type": "Trickle"}), t=1)
            self.assertEqual(s["cur"], 0)
            self.assertEqual(s["online"], 1)
            self.assertEqual(s["status"], "Full")
            self.assertEqual(s["ctype"], "Trickle")

    def test_missing_gauge_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            _mkbat(d, **{"cw221X-bat/capacity": None})
            self.assertIsNone(collectd.read_battery(d, t=1))

    def test_absent_tree_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(collectd.read_battery(os.path.join(d, "nope"), t=1))

    def test_garbage_numeric_node_becomes_none_without_killing_the_sample(self):
        with tempfile.TemporaryDirectory() as d:
            s = collectd.read_battery(_mkbat(d, **{"cw221X-bat/temp": "n/a"}), t=1)
            self.assertIsNotNone(s)
            self.assertIsNone(s["temp"])
            self.assertEqual(s["cap"], 70)

    def test_charger_nodes_absent_degrade_to_offline(self):
        with tempfile.TemporaryDirectory() as d:
            _mkbat(d, **{"charger/online": None, "charger/status": None,
                         "charger/charge_type": None})
            s = collectd.read_battery(d, t=1)
            self.assertIsNotNone(s, "battery data survives a missing charger node")
            self.assertEqual(s["online"], 0)
            self.assertEqual(s["status"], "")


class BatteryConstants(unittest.TestCase):
    def test_retention_matches_20s_cadence_over_24h(self):
        self.assertEqual(collectd.BATT_INTERVAL, 20)
        self.assertEqual(collectd.BATT_MAX_AGE, 24 * 3600 * 1000)
        # 24h at 20s = 4320 samples; the cap is a backstop above that.
        self.assertGreater(collectd.BATT_MAX_LINE, 4320)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 test/collectd.test.py -v`
Expected: FAIL — `AttributeError: module 'collectd' has no attribute 'read_battery'` (and `BATT_INTERVAL`).

- [ ] **Step 3: Add the constants**

In `src/sbin/mudimodem-collectd`, immediately after the existing `CLIENT_SEND_TIMEOUT` line:

```python
# ---- battery (issue #1) ---------------------------------------------------
# Sampled from sysfs only: no ubus, no AT, nothing that can contend with the
# modem channel. Slower cadence than the modem because the values move slowly —
# SoC is an integer % that changes every ~60-90 s while charging.
BATT_INTERVAL   = float(os.environ.get("MUDIMODEM_BATT_INTERVAL", "20"))
BATT_MAX_AGE    = 24 * 3600 * 1000      # 24 h, in ms
BATT_MAX_LINE   = 5200                  # 24h at 20s = 4320; backstop above that
BATT_SYSFS      = os.environ.get("MUDIMODEM_BATT_SYSFS", "/sys/class/power_supply")
```

- [ ] **Step 4: Add `read_battery()`**

In `src/sbin/mudimodem-collectd`, immediately after the existing `build_sample()` function:

```python
def _sysfs(root, rel):
    """Read one sysfs node, stripped. None if it is absent or unreadable."""
    try:
        with open(os.path.join(root, rel)) as f:
            return f.read().strip()
    except (OSError, ValueError):
        return None


def read_battery(root=None, t=None):
    """One battery sample from /sys/class/power_supply, or None if the fuel
    gauge is unreadable (i.e. not this hardware) — in which case we write no
    battery file at all rather than a file full of nulls.

    ⚠️ UNITS ARE PER-NODE. There is no blanket rule here:
      voltage_now  uV        -> mV
      temp         deci-C    -> C
      current_now  mA ALREADY, signed. DO NOT divide by 1000.
                   +charging / -discharging / 0 = charging blocked.
                   The Linux power_supply class normally uses uA, so mA looks
                   wrong; glbattlimit line 166 documents it and the physics
                   agree (-363 at 4.0 V = 1.45 W; as uA it would be 1.5 mW).
    `cap` is stored as the RAW GAUGE %, never converted to GL's "GUI" scale:
    that conversion is a provisional linear fit, and storing the raw reading
    keeps retained history valid if the fit is ever corrected.
    """
    root = BATT_SYSFS if root is None else root
    bat, chg = "cw221X-bat", "charger"
    cap = _num(_sysfs(root, bat + "/capacity"))
    if cap is None:
        return None                              # no gauge => not this hardware
    volt = _num(_sysfs(root, bat + "/voltage_now"))
    temp = _num(_sysfs(root, bat + "/temp"))
    return {
        "t": now_ms() if t is None else t,
        "cap": cap,
        "volt": None if volt is None else int(volt // 1000),
        "cur": _num(_sysfs(root, bat + "/current_now")),
        "temp": None if temp is None else round(temp / 10.0, 1),
        "online": int(_num(_sysfs(root, chg + "/online")) or 0),
        "status": _sysfs(root, chg + "/status") or "",
        "ctype": _sysfs(root, chg + "/charge_type") or "",
        "cycles": _num(_sysfs(root, bat + "/cycle_count")),
        "health": _sysfs(root, bat + "/health") or "",
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python3 test/collectd.test.py -v`
Expected: PASS — all `ReadBattery` and `BatteryConstants` tests, and the pre-existing `BuildSample`/`Trim` tests still green.

- [ ] **Step 6: Wire the sampler into the poll loop**

In `main()`, add the path next to the existing ones (after `latest_path`):

```python
    battery_path = os.path.join(hist, "battery.jsonl")
```

Replace the loop body's opening (the `i = 0` / `while state["go"]:` / `try:` block) so the battery read runs **first**, before the ubus calls:

```python
    i = 0
    last_batt = 0.0
    while state["go"]:
        try:
            # Battery FIRST, and gated on ELAPSED TIME rather than a tick count.
            # A tick is not 4 s: ubus_call has an 8 s timeout and collect_sample
            # makes three of them, so a bad tick can run ~24 s and `i % 5` would
            # silently stretch the battery interval to minutes.
            if time.time() - last_batt >= BATT_INTERVAL:
                last_batt = time.time()
                b = read_battery()
                if b is not None:
                    with open(battery_path, "a") as f:
                        f.write(json.dumps(b) + "\n")
            s = collect_sample()
```

Leave the rest of the `try:` body unchanged, and extend the trim block:

```python
            if i % TRIM_EVERY == 0:
                trim(samples_path, SAMPLE_MAX_AGE, SAMPLE_MAX_LINE)
                trim(battery_path, BATT_MAX_AGE, BATT_MAX_LINE)
```

Note: the battery sample is **not** published to the broadcast socket and **not** written to `latest.json`. Those are modem-only, consumed solely by the LCD renderer's `CellularSource`, which does not want battery data.

- [ ] **Step 7: Verify the loop still parses and the full suite passes**

Run: `python3 -c "import ast,sys; ast.parse(open('src/sbin/mudimodem-collectd').read())" && python3 test/collectd.test.py && python3 test/test_collectd.py`
Expected: no output from the parse check; both test files report OK.

- [ ] **Step 8: Commit**

```bash
git add src/sbin/mudimodem-collectd test/collectd.test.py
git commit -m "feat(collectd): sample battery from sysfs every 20s into battery.jsonl"
```

---

### Task 2: Backend — `get_battery_history`

**Files:**
- Modify: `src/rpc/mudimodem` (extract `read_window`; add `get_battery_history`; extend `snapshot_battlimit`)
- Test: `test/backend-battery-history.test.lua` (create)

**Interfaces:**
- Consumes: `battery.jsonl` written by Task 1.
- Produces:
  - `M.get_battery_history(args) -> { samples = <array>, now = <box epoch ms> }`, where `args` is `{window_ms=<ms>}` or `{since=<epoch ms>}` (both accepted; the narrower wins; neither = everything retained).
  - `read_window(path, since) -> table` — module-local shared tail reader, used by both `get_history` and `get_battery_history`.
  - `get_battlimit` response gains `gui_m = 13867`, `gui_b = 189300`.

- [ ] **Step 1: Write the failing test**

Create `test/backend-battery-history.test.lua`:

```lua
-- On-box test for mudimodem.get_battery_history. The backend pulls oui.ubus ->
-- resty.http which indexes ngx at load, so we stub ngx (CLAUDE.md §8).
-- get_battery_history touches no ubus — it only reads battery.jsonl under
-- MUDIMODEM_HIST.
-- Run: MUDIMODEM_HIST=/tmp/mmbat-test lua test/backend-battery-history.test.lua

local HIST = os.getenv("MUDIMODEM_HIST") or error("set MUDIMODEM_HIST")
os.execute("mkdir -p " .. HIST)

local function w(path, lines)
  local f = assert(io.open(path, "w"))
  f:write(table.concat(lines, "\n") .. "\n")
  f:close()
end

ngx = { socket = { tcp = function() return { settimeout = function() end, connect = function() end } end },
  re = { match = function() end, gmatch = function() end, find = function() end },
  log = function() end, ERR = 0, WARN = 1, NOTICE = 2, INFO = 3, var = {}, req = {}, ctx = {},
  say = function() end, print = function() end, exit = function() end, HTTP_OK = 200,
  timer = { at = function() end },
  config = { ngx_lua_version = 10025, subsystem = "http", debug = false },
  worker = { id = function() return 0 end, count = function() return 4 end },
  now = function() return os.time() end, time = function() return os.time() end }

local ok, M = pcall(dofile, "/usr/lib/oui-httpd/rpc/mudimodem")
assert(ok, "backend failed to load: " .. tostring(M))
assert(type(M.get_battery_history) == "function", "get_battery_history missing")

local function len(x) return (type(x) == "table") and #x or 0 end

-- A malformed line must be skipped, not fatal.
w(HIST .. "/battery.jsonl", {
  '{"t":1000,"cap":70,"volt":4010,"cur":-363,"temp":31.6,"online":0,"status":"Discharging"}',
  'garbage not json',
  '{"t":2000,"cap":71,"volt":4045,"cur":0,"temp":32.0,"online":1,"status":"Full"}',
})

local all = M.get_battery_history({})
assert(len(all.samples) == 2, "expected 2 valid samples (1 malformed skipped), got " .. len(all.samples))
assert(all.samples[1].cap == 70, "oldest-first: first sample is t=1000")
assert(all.samples[2].cur == 0, "the blocked sample decodes with cur == 0")
assert(all.now and all.now > 0, "now stamped in ms")

-- The signed current and the 0-means-blocked value must survive the round trip
-- intact: they are the whole point of the chart.
assert(all.samples[1].cur == -363, "negative current preserved (discharging)")
assert(all.samples[2].online == 1 and all.samples[2].cur == 0,
  "cur==0 while online==1 is the 'limit engaged' signature")

local since = M.get_battery_history({ since = 1000 })
assert(len(since.samples) == 1 and since.samples[1].t == 2000,
  "since= returns strictly-newer records only")

local none = M.get_battery_history({ since = 2000 })
assert(len(none.samples) == 0, "since=newest -> empty window")

-- window_ms is a RELATIVE window resolved against the BOX clock (never a
-- browser-computed absolute cutoff — clock skew on a travel router is real).
do
  local now = os.time() * 1000
  -- %.0f, not %d: this box's Lua is a double/int32 build and rejects epoch-ms as %d.
  local function s(t) return string.format('{"t":%.0f,"cap":70,"cur":-300,"volt":4000,"temp":31.5}', t) end
  w(HIST .. "/battery.jsonl", {
    s(now - 3600000), s(now - 1800000),      -- 60 m and 30 m ago: outside 15 m
    s(now - 600000),  s(now - 60000),        -- 10 m and 1 m ago: inside it
  })
  local win = M.get_battery_history({ window_ms = 15 * 60000 })
  assert(len(win.samples) == 2, "window_ms=15m -> 2 samples, got " .. len(win.samples))
  assert(win.samples[1].t == now - 600000, "window is oldest-first")
  assert(math.abs(win.now - now) < 5000, "response stamps the box clock in ms")

  local wide = M.get_battery_history({ window_ms = 24 * 3600 * 1000 })
  assert(len(wide.samples) == 4, "a 24h window reaches all four samples")
end

-- Windowed reads must stay O(window). Same regression the modem history had:
-- slurping every line cost ~7.4 s CPU flat, regardless of window size.
local BIG_N, BIG_TAIL = 15000, 300
do
  local f = assert(io.open(HIST .. "/battery.jsonl", "w"))
  for i = 1, BIG_N do
    f:write(string.format(
      '{"t":%d,"cap":%d,"volt":%d,"cur":%d,"temp":31.6,"online":1,"status":"Charging",' ..
      '"ctype":"Fast","cycles":4,"health":"Good"}\n',
      i * 1000, 50 + (i % 50), 3900 + (i % 150), 1000 - (i % 1000)))
  end
  f:close()
end
local edge = (BIG_N - BIG_TAIL) * 1000
local c0 = os.clock()
local big = M.get_battery_history({ since = edge })
local cost = os.clock() - c0
assert(len(big.samples) == BIG_TAIL,
  "windowed read must return exactly the tail: expected " .. BIG_TAIL .. ", got " .. len(big.samples))
for i = 1, BIG_TAIL do
  assert(big.samples[i].t == (BIG_N - BIG_TAIL + i) * 1000, "no gap/dupe at chunk boundary, row " .. i)
end
assert(cost < 1.0, string.format(
  "windowed get_battery_history over %d lines took %.2fs CPU — must be O(window)", BIG_N, cost))

-- absent file -> empty array, never an error, and it must encode as [] not {}
os.execute("rm -f " .. HIST .. "/battery.jsonl")
local empty = M.get_battery_history({})
assert(len(empty.samples) == 0, "absent file -> empty array")
local enc = require("cjson").encode(empty)
assert(enc:find('"samples":%[%]'), "empty samples must encode as []")

-- get_battlimit must expose the GUI fit constants so the chunk needs no third
-- copy of the formula.
local bl = M.get_battlimit({})
assert(bl.gui_m == 13867 and bl.gui_b == 189300,
  "get_battlimit must expose gui_m/gui_b for the chunk's gauge->GUI conversion")

os.execute("rm -rf " .. HIST)
print("get_battery_history OK: all=2, since=1, window=2, empty=0")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `MUDIMODEM_HIST=/tmp/mmbat-test lua test/backend-battery-history.test.lua`
Expected: FAIL — `get_battery_history missing`.

> If `lua` is unavailable locally, this test runs on the device the same way `verify.sh` step 7 does:
> `ssh root@mudi 'cat > /tmp/mm-bat.test.lua' < test/backend-battery-history.test.lua && ssh root@mudi 'MUDIMODEM_HIST=/tmp/mmbat-test lua /tmp/mm-bat.test.lua'`
> (requires `./tools/deploy.sh` first so `/usr/lib/oui-httpd/rpc/mudimodem` is current).

- [ ] **Step 3: Add the BATTERY path constant**

In `src/rpc/mudimodem`, next to the existing `SAMPLES` / `EVENTS` definitions:

```lua
local BATTERY    = HIST_DIR .. "/battery.jsonl"
```

- [ ] **Step 4: Extract `read_window` as a shared module-local function**

This is a **pure extraction — no behaviour change.** `test/backend-history.test.lua` stays untouched and is the regression guard.

Add this immediately **above** `function M.get_history(args)`, moving the existing `local CHUNK = 65536` and the whole `read_lines` closure out of the method body:

```lua
-- Read the TAIL of an append-ordered jsonl file BACKWARD in chunks, stopping at
-- the window edge. Returns decoded records oldest-first. Shared by get_history
-- and get_battery_history.
--
-- ⚠️ Do not "simplify" this into a read-all-then-filter loop. That was the
-- original, and on the box over 14.6k lines / 3.8 MB it cost ~7.4 s of CPU —
-- FLAT: a 15-minute window (224 samples) cost exactly what the full 24 h
-- (14,647) did, on page load AND on every 10 s poll. The bytes are cheap
-- (read("*a") of 3.8 MB = 0.09 s) and 226 cjson.decodes are 0.005 s; the cost is
-- materialising 14.6k interned strings in one growing table. Cost is now
-- O(window): a 15 m load and each poll are ~10 ms.
local READ_CHUNK = 65536
local function read_window(path, since)
  local fh = io.open(path, "r")
  if not fh then return {} end
  local pos   = fh:seek("end")
  local carry = ""                                   -- head fragment: a line cut by the chunk edge
  local rev   = {}                                   -- collected newest-first
  local done  = false
  while pos > 0 and not done do
    local from = pos - READ_CHUNK
    if from < 0 then from = 0 end
    fh:seek("set", from)
    local buf = (fh:read(pos - from) or "") .. carry
    pos = from
    if pos > 0 then                                  -- buf's first line is (probably) incomplete:
      local nl = buf:find("\n", 1, true)             -- hold it back for the next, earlier read
      if nl then carry, buf = buf:sub(1, nl - 1), buf:sub(nl + 1)
      else carry, buf = buf, "" end                  -- no newline in the chunk: it's all one fragment
    else carry = "" end                              -- reached the file start: nothing left to splice
    local lines = {}
    for line in buf:gmatch("[^\n]+") do lines[#lines + 1] = line end
    for i = #lines, 1, -1 do
      local ok, obj = pcall(cjson.decode, lines[i])  -- cjson.decode can't yield; pcall is safe here
      if ok and type(obj) == "table" and obj.t then
        if since and obj.t <= since then done = true; break end  -- window edge: stop reading
        rev[#rev + 1] = obj
      end                                            -- malformed line: skip, keep scanning
    end
  end
  fh:close()
  local out = {}                                     -- flip back to oldest-first (the contract)
  for i = #rev, 1, -1 do out[#out + 1] = rev[i] end
  return out
end

-- Resolve the {window_ms} / {since} argument pair against the BOX clock.
-- Callers send one or the other; if both arrive, honour the narrower.
local function window_since(args, now)
  local since = args and tonumber(args.since) or nil
  local win   = args and tonumber(args.window_ms) or nil
  if win and win > 0 then
    local rel = now - win
    since = (since == nil) and rel or math.max(since, rel)
  end
  return since
end
```

- [ ] **Step 5: Rewrite `get_history` to use them, and add `get_battery_history`**

Replace the whole body of `M.get_history` (keep its existing doc comment above it) with:

```lua
function M.get_history(args)
  local now   = os.time() * 1000
  local since = window_since(args, now)
  return { samples = arr(read_window(SAMPLES, since)),
           events  = arr(read_window(EVENTS, since)),
           now     = now }
end

-- Battery history (issue #1). Same {window_ms}/{since} contract as get_history,
-- read from the collector's battery.jsonl. No `events` key: the chart's
-- annotations (plug/unplug, charging band, the limit-engaged marker) are all
-- DERIVED client-side from the sample stream.
function M.get_battery_history(args)
  local now = os.time() * 1000
  return { samples = arr(read_window(BATTERY, window_since(args, now))), now = now }
end
```

> **No validator entry is needed.** Both args are numbers, which oui's default string allowlist (`^[%w%.%s%-_:#/]-$`) accepts. This is stated because free-form params are rejected at `/rpc` with `-32602` *before* the backend runs, and the on-device `dofile` tests bypass that layer entirely — which is why Task 6 adds a real `/rpc` round-trip.

- [ ] **Step 6: Expose the GUI fit constants**

In `snapshot_battlimit()`, add two fields to the `out` table literal (after `limit_gauge`):

```lua
    gui_m = 13867,          -- the chunk converts gauge -> GUI for display; serving
    gui_b = 189300,         -- the constants here keeps that formula in ONE place
```

- [ ] **Step 7: Run both backend tests to verify they pass**

Run:
```bash
MUDIMODEM_HIST=/tmp/mmbat-test lua test/backend-battery-history.test.lua
MUDIMODEM_HIST=/tmp/mmhist-test lua test/backend-history.test.lua
```
Expected: both print their OK lines. **`backend-history.test.lua` passing unchanged is the point of this task** — it proves the extraction did not alter the modem history path, including its O(window) perf assertion.

- [ ] **Step 8: Commit**

```bash
git add src/rpc/mudimodem test/backend-battery-history.test.lua
git commit -m "feat(rpc): add get_battery_history; share the tail reader with get_history"
```

---

### Task 3: Battery chunk — data layer and pure helpers

**Files:**
- Create: `src/views/mudimodem-battery.js`
- Test: `test/battery-chunk.test.js` (create)

**Interfaces:**
- Consumes: `mudimodem.get_battery_history` and `mudimodem.get_battlimit` from Task 2.
- Produces a Vue options object with `name: "mudimodem-battery"`, `props: { embedded: Boolean }`, and these methods (Task 4 renders using them):
  - `rpcSilent(method, params) -> Promise<object|null>`
  - `fetchHistory(opts?) -> void` — `opts = { window: <minutes>, since: <ms>, merge: <bool> }`
  - `fetchBattLimit() -> Promise`
  - `applyBattLimit(patch) -> Promise|undefined` — `patch = { enabled?: bool, limit_gui?: number }`
  - `nowMs() -> number`, `mOf(t) -> number` (minutes before now, negative), `xOf(m) -> number`
  - `guiOf(gauge) -> number|null`
  - `winSamples() -> array` of samples decorated with `m`, `capGui`, `voltV`
  - `segments(key) -> array<array<{m,v,t}>>` — contiguous runs, split on nulls and >60 s gaps
  - `reduce(pts, cols) -> array` — min/max-preserving downsample
  - `domainFor(lane) -> [lo, hi]`
  - `chargeState(s) -> "charging"|"blocked"|"draining"|"discharging"`
  - `stateRuns() -> array<{v, m0, m1}>`
  - `nearestSample(m) -> object|null`
- Module constants: `LANES`, `RANGES`, `GAP_MS`, `PADL`, `PADR`.

- [ ] **Step 1: Write the failing test**

Create `test/battery-chunk.test.js`:

```js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = path.join(__dirname, '..', 'src', 'views', 'mudimodem-battery.js');

function loadChunk() {
  const module = { exports: {} };   // eslint-disable-line no-unused-vars
  return eval(fs.readFileSync(SRC, 'utf8'));
}
function makeVm(c, over) {
  const vm = Object.assign({}, c.data());
  for (const [k, f] of Object.entries(c.methods || {})) vm[k] = f.bind(vm);
  for (const [k, f] of Object.entries(c.computed || {}))
    Object.defineProperty(vm, k, { get: f.bind(vm), configurable: true });
  Object.assign(vm, over || {});
  return vm;
}
// n samples ending `now`, `step` ms apart, newest last.
function seed(now, n, step, fn) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * step;
    out.push(Object.assign({ t, cap: 70, volt: 4010, cur: -363, temp: 31.6,
      online: 0, status: 'Discharging', ctype: 'N/A', cycles: 4, health: 'Good' },
      fn ? fn(n - 1 - i, t) : {}));
  }
  return out;
}

test('chunk is one expression exporting a runtime-only component', () => {
  const c = loadChunk();
  assert.equal(c.name, 'mudimodem-battery');
  assert.equal(typeof c.render, 'function');
  assert.equal(c.template, undefined, 'Vue here is runtime-only: template: would render nothing');
});

test('guiOf converts gauge to GUI % using the served constants', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: { gui_m: 13867, gui_b: 189300 } });
  assert.equal(vm.guiOf(70), 78.1);     // (70*13867 - 189300)/10000
  assert.equal(vm.guiOf(null), null);
});

test('guiOf falls back to the documented constants when get_battlimit has not landed', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: null });
  assert.equal(vm.guiOf(70), 78.1);
});

test('winSamples decorates gauge->GUI and uV->V and sorts ascending', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: [{ t: now - 1000, cap: 70, volt: 4010, cur: -1, temp: 30 },
              { t: now - 5000, cap: 69, volt: 4000, cur: -2, temp: 30 }],
    serverNow: now, serverNowAt: now, winW: 15
  });
  const ss = vm.winSamples();
  assert.equal(ss.length, 2);
  assert.equal(ss[0].t, now - 5000, 'ascending by t regardless of insertion order');
  assert.equal(ss[1].capGui, 78.1);
  assert.equal(ss[1].voltV, 4.01);
});

test('segments break across a gap longer than 60s', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = [
    { t: now - 300000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    { t: now - 280000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    // 200 s hole: the collector was down. Must NOT be bridged by a straight line.
    { t: now - 80000,  cap: 68, volt: 3990, cur: -300, temp: 31 },
    { t: now - 60000,  cap: 68, volt: 3990, cur: -300, temp: 31 }
  ];
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const segs = vm.segments('cur');
  assert.equal(segs.length, 2, 'an outage is a break, not a bridge');
  assert.equal(segs[0].length, 2);
  assert.equal(segs[1].length, 2);
});

test('segments drop null metrics without bridging them', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = [
    { t: now - 60000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    { t: now - 40000, cap: 70, volt: 4010, cur: null, temp: 31 },
    { t: now - 20000, cap: 70, volt: 4010, cur: -300, temp: 31 }
  ];
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  assert.equal(vm.segments('cur').length, 2);
  assert.equal(vm.segments('temp').length, 1, 'a null in one lane does not break another');
});

test('reduce is min/max-preserving and never averages away a zero', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // 400 points; exactly one is 0 (the moment the charge limit engaged).
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push({ m: -400 + i, v: i === 200 ? 0 : 1200, t: i });
  const out = vm.reduce(pts, 50);
  assert.ok(out.length < pts.length, 'actually reduced');
  assert.ok(out.some((p) => p.v === 0),
    'the exact 0 survives: averaging would smear it into a small non-zero value');
  for (let i = 1; i < out.length; i++)
    assert.ok(out[i].m >= out[i - 1].m, 'output stays in time order');
});

test('reduce leaves small series untouched', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const pts = [{ m: -3, v: 1 }, { m: -2, v: 2 }, { m: -1, v: 3 }];
  assert.deepEqual(vm.reduce(pts, 50), pts);
});

test('charge lane is fixed 0-100 so drift is not dramatised', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, () => ({ cap: 70 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const lane = c.LANES.find((l) => l.key === 'capGui');
  assert.deepEqual(vm.domainFor(lane), [0, 100]);
});

test('current lane always includes zero even when nothing hits it', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, () => ({ cur: -400 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const [lo, hi] = vm.domainFor(c.LANES.find((l) => l.key === 'cur'));
  assert.ok(lo <= -400 && hi >= 0, 'zero on scale: it is the evidence the limit engaged');
});

test('temperature lane enforces a minimum span', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, (i) => ({ temp: 31.5 + i * 0.05 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const [lo, hi] = vm.domainFor(c.LANES.find((l) => l.key === 'temp'));
  assert.ok(hi - lo >= 5, 'a 0.2 C wobble must not fill the lane');
});

test('voltage lane is fixed to the Li-ion range but expands rather than clipping', () => {
  const c = loadChunk();
  const now = Date.now();
  const lane = c.LANES.find((l) => l.key === 'voltV');
  let vm = makeVm(c, { samples: seed(now, 3, 20000, () => ({ volt: 4010 })),
    serverNow: now, serverNowAt: now, winW: 15 });
  assert.deepEqual(vm.domainFor(lane), [3.3, 4.3]);
  vm = makeVm(c, { samples: seed(now, 3, 20000, () => ({ volt: 3100 })),
    serverNow: now, serverNowAt: now, winW: 15 });
  assert.ok(vm.domainFor(lane)[0] <= 3.1, 'an out-of-range reading expands, never clips silently');
});

test('chargeState distinguishes blocked from merely idle', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.chargeState({ online: 1, cur: 1183 }), 'charging');
  assert.equal(vm.chargeState({ online: 1, cur: 0 }), 'blocked');
  assert.equal(vm.chargeState({ online: 1, cur: -50 }), 'draining');
  assert.equal(vm.chargeState({ online: 0, cur: -363 }), 'discharging');
});

test('stateRuns collapses consecutive samples into labelled runs', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 6, 20000, (i) => (
    i < 3 ? { online: 1, cur: 1183, status: 'Charging' }
          : { online: 1, cur: 0, status: 'Full' }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const runs = vm.stateRuns();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].v, 'charging');
  assert.equal(runs[1].v, 'blocked');
});

test('nowMs is skew-corrected to the box clock', () => {
  const c = loadChunk();
  const vm = makeVm(c, { serverNow: 5000000, serverNowAt: Date.now() });
  assert.ok(Math.abs(vm.nowMs() - 5000000) < 1000,
    'the axis follows the box clock, not the browser clock');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/battery-chunk.test.js`
Expected: FAIL — `ENOENT: no such file or directory ... mudimodem-battery.js`.

- [ ] **Step 3: Create the chunk with its data layer**

Create `src/views/mudimodem-battery.js`. `render` is a placeholder in this task; Task 4 replaces it.

```js
// MudiModem — Battery tab. Four-lane battery history + the charge-limit form.
//
// Loaded by the main chunk via eval(): the file is ONE expression whose value is
// the component. Vue is runtime-only -> render(h) only, never template:.
//
// History comes from mudimodem-collectd (20 s sysfs samples), read via a SILENT
// POST to /rpc (window.$axios directly, NOT $rpcRequest) so a failed background
// poll can't trigger GL's global "Unknown error" banner. The charge-limit form
// is user-initiated, so it DOES use $rpcRequest — a banner there is real.
//
// ⚠️ Units arrive already converted by the collector: `cur` is mA (signed;
// 0 = charging blocked), `volt` is mV, `temp` is °C, `cap` is the RAW GAUGE %.
// GL's "GUI %" is a linear re-fit of the gauge; we convert at render using the
// constants get_battlimit serves, so the formula lives in exactly one place.
//
// Times are the box clock (os.time()*1000). We render relative to a skew-
// corrected box-now so the axis doesn't jump if the browser clock differs.
module.exports = (function () {
  "use strict";

  // Four lanes stacked on ONE shared x-axis — deliberately NOT the Tracking
  // chunk's normalized overlay. Normalizing would destroy the single value the
  // whole feature exists to show: `cur == 0` must read as ZERO, not as "low".
  // Each lane keeps real units and its own y-domain; `h` is its pixel height.
  var LANES = [
    { key: "capGui", label: "Charge · %",        unit: "%",  h: 96, dec: 0,
      color: "var(--primary)",    fixed: [0, 100] },
    { key: "cur",    label: "Current · mA",      unit: "mA", h: 64, dec: 0,
      color: "var(--success)",    zero: true },
    { key: "voltV",  label: "Voltage · V",       unit: "V",  h: 64, dec: 2,
      color: "var(--info-hover)", fixed: [3.3, 4.3] },
    { key: "temp",   label: "Temperature · °C",  unit: "°C", h: 64, dec: 1,
      color: "var(--warning)",    minSpan: 5 }
  ];
  var RANGES   = [[15, "15 m"], [60, "1 h"], [360, "6 h"], [1440, "24 h"]];
  var TICKSTEP = { 15: 2, 60: 10, 360: 60, 1440: 240 };
  // The collector samples every 20 s; 3 missed samples is an outage, not jitter.
  var GAP_MS = 60000;
  var PADL = 42, PADR = 12, LANE_GAP = 16, BAND_H = 9, TOP = 18;
  // Fallback GUI fit, mirroring glbattlimit + the Lua backend. Only used before
  // get_battlimit lands; the served gui_m/gui_b win.
  var GUI_M = 13867, GUI_B = 189300;
  var STATE_COLOR = {
    charging:    "var(--success)",
    blocked:     "var(--warning)",
    draining:    "var(--error)",
    discharging: "var(--text-hint)"
  };
  var STATE_LABEL = {
    charging: "Charging", blocked: "Charge blocked",
    draining: "Draining on power", discharging: "On battery"
  };

  var component = {
    name: "mudimodem-battery",

    // `embedded` is set when the main Modem page renders us inside its Battery
    // tab (the only caller today); it drops our own heading.
    props: { embedded: { type: Boolean, default: false } },

    data: function () {
      return {
        winW: 15, samples: [], lastT: 0, serverNow: 0, serverNowAt: 0,
        loading: true, err: "", fetching: false, loadedFrom: null,
        pendingWindow: null, poll: null, tick: 0, live: true,
        width: 900, styleId: "mmb-css", cursor: null, pinnedM: null,
        // charge-limit form state (moved here from the Config tab)
        bl: null, blBusy: false, blErr: "", blDraft: 80
      };
    },

    created: function () { this.injectStyle(); },
    mounted: function () {
      var self = this;
      if (typeof window === "undefined") return;
      this.measure();
      this._onResize = function () { self.measure(); };
      window.addEventListener("resize", this._onResize);
      this.fetchBattLimit();
      this.fetchHistory();
      this.poll = setInterval(function () {
        if (self.live) self.fetchHistory({ since: self.lastT, merge: true });
      }, 10000);
    },
    updated: function () { this.measure(); },
    beforeDestroy: function () {
      if (this.poll) clearInterval(this.poll);
      if (typeof window !== "undefined" && this._onResize)
        window.removeEventListener("resize", this._onResize);
    },

    methods: {
      // ---- data ----
      // POST to /rpc via $axios DIRECTLY, not $rpcRequest: $rpcRequest's axios
      // interceptor pops GL's global error banner on any failure BEFORE our
      // .catch runs — unacceptable for a silent 10 s background poll on a flaky
      // cellular link. Fails silently; a bad poll just retries next tick.
      rpcSilent: function (method, params) {
        if (typeof window === "undefined" || !window.$axios) return Promise.resolve(null);
        var sid = (window.$getCookie && window.$getCookie("Admin-Token")) || "";
        return window.$axios.post("/rpc", {
          jsonrpc: "2.0", id: 1, method: "call",
          params: [sid, "mudimodem", method, params || {}]
        }, { timeout: 20000 })
          .then(function (r) { return (r && r.data && r.data.result) || null; })
          .catch(function () { return null; });
      },

      // opts = { window: <minutes>, since: <ms>, merge: <bool> }.
      // ⚠️ A window goes to the box as a DURATION (window_ms), never as a
      // browser-computed absolute cutoff: the two clocks disagree on a travel
      // router, and an absolute cutoff mis-sizes the window by exactly the skew.
      // The poll's `since` is exempt — it is a timestamp the BOX stamped.
      fetchHistory: function (opts) {
        opts = opts || {};
        var self = this;
        if (typeof window === "undefined" || !window.$axios) { self.loading = false; return; }
        // One fetch at a time; a range request landing mid-flight is remembered.
        if (self.fetching) {
          if (opts.window != null && !opts.merge)
            self.pendingWindow = (self.pendingWindow == null)
              ? opts.window : Math.max(self.pendingWindow, opts.window);
          return;
        }
        self.fetching = true;
        var merge = !!opts.merge;
        // lastT is 0 until the first sample lands; since=0 would make the box
        // decode the whole retained 24 h on every 10 s tick.
        var incremental = (opts.since != null && opts.since > 0);
        var winMs = (opts.window || self.winW) * 60000;
        var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
        this.rpcSilent("get_battery_history", params)
          .then(function (res) {
            self.fetching = false;
            if (res) {
              var ns = res.samples || [];
              if (merge) { if (ns.length) self.samples = self.samples.concat(ns); }
              else self.samples = ns;
              self.serverNow = res.now || Date.now();
              self.serverNowAt = Date.now();
              var cut = self.serverNow - 24 * 3600 * 1000;
              self.samples = self.samples.filter(function (s) { return s.t >= cut; });
              if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
              var reached = incremental ? opts.since : (self.serverNow - winMs);
              self.loadedFrom = (self.loadedFrom == null)
                ? reached : Math.min(self.loadedFrom, reached);
              self.err = ""; self.tick++;
            }
            self.loading = false;
            self.drainPending();
          })
          .catch(function (e) {
            self.fetching = false;
            self.err = (e && (e.type || e.message)) || "couldn't load battery history";
            self.loading = false;
            self.drainPending();
          });
      },
      drainPending: function () {
        if (this.pendingWindow == null) return;
        var w = this.pendingWindow; this.pendingWindow = null;
        this.fetchHistory({ window: w });
      },
      setRange: function (w) {
        this.winW = w; this.pinnedM = null; this.cursor = null;
        // Backfill only when the new window reaches earlier than we hold.
        var cutoff = this.nowMs() - w * 60000;
        if (this.loadedFrom == null || cutoff < this.loadedFrom - 1000)
          this.fetchHistory({ window: w });
      },

      // ---- charge limit (user-initiated => $rpcRequest is correct here) ----
      fetchBattLimit: function () {
        var self = this;
        if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
        return window.$rpcRequest("call", ["sid", "mudimodem", "get_battlimit", {}], { timeout: 8000 })
          .then(function (r) {
            self.bl = r || null;
            if (r && typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            self.blErr = (r && r.error) || "";
          })
          .catch(function (e) {
            self.blErr = (e && (e.message || e.type)) || "request failed";
          });
      },
      applyBattLimit: function (patch) {
        var self = this;
        if (this.blBusy || typeof window === "undefined" || !window.$rpcRequest) return;
        var cur = this.bl || { enabled: false, limit_gui: 80 };
        var enabled = (patch && typeof patch.enabled === "boolean") ? patch.enabled : !!cur.enabled;
        var limit_gui = (patch && patch.limit_gui != null)
          ? Number(patch.limit_gui) : Number(this.blDraft || cur.limit_gui);
        if (!(limit_gui >= 20 && limit_gui <= 100)) {
          this.blErr = "Target must be 20–100 % GUI";
          return;
        }
        // Same gui2gauge floor as glbattlimit / the backend (gauge must be ≥ 50).
        var gauge = Math.floor((limit_gui * 10000 + GUI_B + GUI_M / 2) / GUI_M);
        if (gauge < 50 || gauge > 100) {
          this.blErr = "limit too low (min ~50% gauge / use higher GUI %)";
          return;
        }
        this.blBusy = true; this.blErr = "";
        return window.$rpcRequest("call", ["sid", "mudimodem", "set_battlimit",
          { enabled: enabled, limit_gui: limit_gui }], { timeout: 15000 })
          .then(function (r) {
            self.blBusy = false;
            // An error payload without available/limit_gui must not wipe UI state.
            if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number")) {
              self.bl = r;
              if (typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            }
            if (r && r.error) self.blErr = r.error;
            else if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number"))
              self.blErr = "";
          })
          .catch(function (e) {
            self.blBusy = false;
            self.blErr = (e && (e.message || e.type)) || "request failed";
          });
      },

      // ---- scales + derived series ----
      measure: function () {
        if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
          this.width = this.$refs.lanes.clientWidth;
      },
      // skew-corrected box-now: server clock advanced by browser elapsed time.
      nowMs: function () {
        if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
        return Date.now();
      },
      mOf: function (t) { return -((this.nowMs() - t) / 60000); },
      xOf: function (m) {
        var plotW = this.width - PADL - PADR;
        return PADL + (m + this.winW) / this.winW * plotW;
      },
      // gauge % -> GL's "GUI" %, using the constants get_battlimit serves so the
      // fit lives in exactly one place (the Lua backend).
      guiOf: function (gauge) {
        if (gauge == null) return null;
        var bl = this.bl || {};
        var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
        var v = Math.round((gauge * m - b) / 1000) / 10;
        return Math.max(0, Math.min(100, v));
      },
      // Samples inside the window, ascending, de-duplicated, decorated with the
      // derived fields the lanes plot. Incremental polling concats, which can
      // leave this.samples out of order or with duplicate t — a backward point
      // would draw one long line across the whole plot. Sort/dedupe HERE, the
      // single choke point every consumer goes through.
      winSamples: function () {
        var cutoff = this.nowMs() - this.winW * 60000, self = this;
        var win = this.samples.filter(function (s) { return s.t >= cutoff; })
          .map(function (s) {
            return Object.assign({}, s, {
              m: self.mOf(s.t),
              capGui: self.guiOf(s.cap),
              voltV: (s.volt == null) ? null : Math.round(s.volt) / 1000
            });
          });
        win.sort(function (a, b) { return a.t - b.t; });
        var out = [], prev = null;
        for (var i = 0; i < win.length; i++) {
          if (prev !== null && win[i].t === prev) continue;
          out.push(win[i]); prev = win[i].t;
        }
        return out;
      },
      // Contiguous runs of a metric: split on a null value AND on a time hole
      // bigger than GAP_MS, so an outage renders as a break rather than a
      // straight line pretending the battery held steady through it.
      segments: function (key) {
        var ss = this.winSamples(), segs = [], cur = [];
        for (var i = 0; i < ss.length; i++) {
          var s = ss[i];
          if (i > 0 && (s.t - ss[i - 1].t) > GAP_MS) {
            if (cur.length) segs.push(cur);
            cur = [];
          }
          var v = s[key];
          if (v == null) { if (cur.length) segs.push(cur); cur = []; continue; }
          cur.push({ m: s.m, v: v, t: s.t });
        }
        if (cur.length) segs.push(cur);
        return segs;
      },
      // Min/max-preserving reduction to roughly `cols` columns.
      // ⚠️ NEVER average. Averaging smears the Current lane's exact 0 (the
      // charge limit engaging) into a small non-zero number and erases the one
      // reading this whole feature exists to show.
      reduce: function (pts, cols) {
        if (!pts.length || pts.length <= cols) return pts;
        var span = (pts[pts.length - 1].m - pts[0].m) / cols;
        if (!(span > 0)) return pts;
        var out = [], i = 0;
        while (i < pts.length) {
          var edge = pts[i].m + span, lo = pts[i], hi = pts[i], j = i;
          while (j < pts.length && pts[j].m < edge) {
            if (pts[j].v < lo.v) lo = pts[j];
            if (pts[j].v > hi.v) hi = pts[j];
            j++;
          }
          if (j === i) j = i + 1;                        // always advance
          if (lo === hi) out.push(lo);
          else if (lo.m <= hi.m) { out.push(lo); out.push(hi); }
          else { out.push(hi); out.push(lo); }
          i = j;
        }
        return out;
      },
      domainFor: function (lane) {
        var lo = null, hi = null;
        this.segments(lane.key).forEach(function (seg) {
          seg.forEach(function (p) {
            if (lo === null || p.v < lo) lo = p.v;
            if (hi === null || p.v > hi) hi = p.v;
          });
        });
        if (lane.fixed) {
          // Fixed domains are absolute and meaningful (0-100 %, the Li-ion
          // range). They still EXPAND for an out-of-range reading rather than
          // clipping it silently — a clipped line looks like a flat line.
          var d0 = lane.fixed[0], d1 = lane.fixed[1];
          if (lo !== null && lo < d0) d0 = lo;
          if (hi !== null && hi > d1) d1 = hi;
          return [d0, d1];
        }
        if (lo === null) return [0, 1];
        if (lane.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        var span = hi - lo, min = lane.minSpan || 0;
        if (span < min) {
          var mid = (lo + hi) / 2;
          lo = mid - min / 2; hi = mid + min / 2;
        } else if (span === 0) { lo -= 1; hi += 1; }
        else { var pad = span * 0.08; lo -= pad; hi += pad; }
        if (lane.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        return [lo, hi];
      },
      yIn: function (lane, top, v) {
        var d = this.domainFor(lane), d0 = d[0], d1 = d[1];
        if (d1 === d0) return top + lane.h / 2;
        return top + lane.h - (Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0) * lane.h;
      },
      // What the charger is doing, per sample.
      // `blocked` (online with exactly 0 mA) is glbattlimit's own signature for
      // "charging is being held off" — far crisper than reading `status`.
      chargeState: function (s) {
        if (!s.online) return "discharging";
        if (s.cur === 0) return "blocked";
        if (s.cur > 0) return "charging";
        return "draining";
      },
      stateRuns: function () {
        var ss = this.winSamples(), runs = [], self = this;
        for (var i = 0; i < ss.length; i++) {
          var v = self.chargeState(ss[i]), last = runs[runs.length - 1];
          if (last && last.v === v) last.m1 = ss[i].m;
          else { if (last) last.m1 = ss[i].m; runs.push({ v: v, m0: ss[i].m, m1: ss[i].m }); }
        }
        if (runs.length) runs[runs.length - 1].m1 = 0;
        return runs;
      },
      nearestSample: function (m) {
        var ss = this.winSamples(); if (!ss.length) return null;
        var best = ss[0];
        for (var i = 1; i < ss.length; i++)
          if (Math.abs(ss[i].m - m) < Math.abs(best.m - m)) best = ss[i];
        return best;
      },
      clock: function (t) {
        var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getHours()) + ":" + p(d.getMinutes());
      },
      injectStyle: function () { /* Task 4 */ }
    },

    // Replaced in Task 4.
    render: function (h) { return h("div", { staticClass: "mmb" }, ""); }
  };

  component.LANES = LANES;
  component.RANGES = RANGES;
  component.TICKSTEP = TICKSTEP;
  component.GAP_MS = GAP_MS;
  return component;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/battery-chunk.test.js`
Expected: PASS — all 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/mudimodem-battery.js test/battery-chunk.test.js
git commit -m "feat(battery): chunk data layer — history poll, lane domains, min/max reduce"
```

---

### Task 4: Battery chunk — render

**Files:**
- Modify: `src/views/mudimodem-battery.js` (replace `injectStyle` and `render`)
- Test: `test/battery-chunk.test.js` (extend)

**Interfaces:**
- Consumes: every method from Task 3.
- Produces: a working `render(h)` and these additional methods — `mFromEvent(e)`, `clampM(m)`, `onMove(e)`, `onLeave()`, `onClick(e)`, `renderLanes(h)`, `renderLimitCard(h)`, `renderStatusRow(h)`.

- [ ] **Step 1: Write the failing tests**

Append to `test/battery-chunk.test.js`:

```js
function h(tag, data, children) {
  if (Array.isArray(data) || typeof data === 'string') { children = data; data = {}; }
  return { tag, data: data || {}, children };
}
function textOf(n) {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(textOf).join('');
  return textOf(n.children);
}
function walk(n, out) {
  out = out || [];
  if (n == null || typeof n === 'string') return out;
  if (Array.isArray(n)) { n.forEach((x) => walk(x, out)); return out; }
  out.push(n); walk(n.children, out); return out;
}
function render(vm, c) { return c.render.call(vm, h); }

test('renders an empty state, not a broken chart, before the first sample', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], loading: false, bl: { available: true, enabled: false } });
  const out = textOf(render(vm, c));
  assert.match(out, /No battery history yet/i);
});

test('renders all four lane labels once samples exist', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now,
    loading: false, bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  const out = textOf(render(vm, c));
  for (const label of ['Charge', 'Current', 'Voltage', 'Temperature'])
    assert.ok(out.includes(label), 'missing lane: ' + label);
});

test('draws the target line only when the limit is enabled', () => {
  const c = loadChunk();
  const now = Date.now();
  const base = { samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false };
  const on = makeVm(c, Object.assign({}, base,
    { bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 } }));
  assert.ok(walk(render(on, c)).some((n) => n.data && n.data.attrs
    && n.data.attrs.class === 'mmb-target'), 'target line missing when enabled');
  const off = makeVm(c, Object.assign({}, base,
    { bl: { available: true, enabled: false, limit_gui: 80 } }));
  assert.ok(!walk(render(off, c)).some((n) => n.data && n.data.attrs
    && n.data.attrs.class === 'mmb-target'), 'target line drawn while the limit is off');
});

test('the chart still renders when glbattlimit is unavailable', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false,
    bl: { available: false, error: 'glbattlimit not installed' }
  });
  const out = textOf(render(vm, c));
  assert.ok(out.includes('Charge'), 'chart must not depend on the charge-limit tool');
  assert.match(out, /not available/i);
});

test('the range selector offers the four spec windows', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, { samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false });
  const out = textOf(render(vm, c));
  for (const r of ['15 m', '1 h', '6 h', '24 h']) assert.ok(out.includes(r), 'missing range ' + r);
});

test('render survives a sample stream full of nulls', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 10, 20000, () => ({ cap: null, volt: null, cur: null, temp: null }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, loading: false });
  assert.doesNotThrow(() => render(vm, c));
});

test('the status row reports the blocked state in words', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 10, 20000, () => ({ online: 1, cur: 0, status: 'Full', cap: 71 }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, loading: false,
    bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  assert.match(textOf(render(vm, c)), /Charge blocked/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/battery-chunk.test.js`
Expected: FAIL — the placeholder render returns an empty div, so the empty-state, lane-label, target-line, range and status assertions all fail.

- [ ] **Step 3: Add the interaction methods**

In `src/views/mudimodem-battery.js`, add to `methods` (after `clock`):

```js
      // ---- interaction ----
      mFromEvent: function (e) {
        var el = this.$refs && this.$refs.lanes; if (!el) return null;
        var r = el.getBoundingClientRect(); if (!r.width) return null;
        // clientX is CSS px within the container; the SVG scales its viewBox to
        // the rendered width. Convert px -> viewBox units before applying the
        // geometry, or the drawn cursor drifts right of the pointer.
        var ux = (e.clientX - r.left) * this.width / r.width;
        var plotW = this.width - PADL - PADR;
        return -this.winW + (ux - PADL) / plotW * this.winW;
      },
      clampM: function (m) { return Math.max(-this.winW, Math.min(0, m)); },
      onMove: function (e) {
        if (this.pinnedM != null) return;
        var m = this.mFromEvent(e); if (m == null) return;
        this.cursor = this.clampM(m);
      },
      onLeave: function () { if (this.pinnedM == null) this.cursor = null; },
      onClick: function (e) {
        if (this.pinnedM != null) { this.pinnedM = null; return; }
        var m = this.mFromEvent(e); if (m == null) return;
        this.pinnedM = this.cursor = this.clampM(m);
      },
```

- [ ] **Step 4: Replace `injectStyle`**

Replace the `injectStyle: function () { /* Task 4 */ }` stub with:

```js
      injectStyle: function () {
        if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
        // GL theme tokens only — never hand-picked colours (CLAUDE.md §8).
        var css = [
          ".mmb{display:flex;flex-direction:column;gap:12px}",
          ".mmb-card{background:var(--card-bg,var(--bg-content));border-radius:8px;padding:12px 14px}",
          ".mmb-h{font-weight:600;margin-bottom:8px;color:var(--text-primary)}",
          ".mmb-row{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline}",
          ".mmb-stat{display:flex;flex-direction:column;min-width:84px}",
          ".mmb-stat b{font-size:18px;font-weight:600;color:var(--text-primary);line-height:1.25}",
          ".mmb-stat span{font-size:11px;color:var(--text-badge)}",
          ".mmb-seg{display:inline-flex;gap:2px}",
          ".mmb-seg button{border:0;background:var(--bg-body);color:var(--text-badge);",
          "padding:3px 10px;font-size:12px;border-radius:4px;cursor:pointer}",
          ".mmb-seg button.on{background:var(--primary);color:#fff}",
          ".mmb-lanes{width:100%;display:block;cursor:crosshair}",
          ".mmb-note{font-size:12px;color:var(--text-badge);margin-top:6px}",
          ".mmb-kv{display:flex;align-items:center;gap:10px;margin:6px 0}",
          ".mmb-k{font-size:13px;color:var(--text-badge);min-width:92px}",
          ".mmb-v{font-size:13px;color:var(--text-primary)}",
          ".mmb-v input[type=number]{width:72px}",
          ".mmb-err{font-size:12px;color:var(--error);margin-top:6px}"
        ].join("");
        var el = document.createElement("style");
        el.id = this.styleId; el.textContent = css;
        document.head.appendChild(el);
      },
```

- [ ] **Step 5: Add the three render helpers**

Add to `methods`:

```js
      // ---- render helpers ----
      renderStatusRow: function (h) {
        var ss = this.winSamples();
        var s = ss.length ? ss[ss.length - 1] : null;
        var bl = this.bl || {};
        var fmt = function (v, dec, unit) {
          return (v == null) ? "—" : (dec ? Number(v).toFixed(dec) : String(v)) + unit;
        };
        var stats = [];
        var push = function (label, value) {
          stats.push(h("div", { staticClass: "mmb-stat" },
            [h("b", value), h("span", label)]));
        };
        // GUI % leads, gauge follows: the UI always speaks GUI % and shows gauge
        // as a secondary estimate (battery spec 2026-07-22, decision 3).
        push("Charge", s ? fmt(s.capGui, 1, " %") : "—");
        push("Gauge", s ? fmt(s.cap, 0, " %") : "—");
        push("Current", s ? fmt(s.cur, 0, " mA") : "—");
        push("Voltage", s ? fmt(s.voltV, 2, " V") : "—");
        push("Temp", s ? fmt(s.temp, 1, " °C") : "—");
        push("State", s ? STATE_LABEL[this.chargeState(s)] : "—");
        push("Limit", bl.available === false ? "n/a"
          : (bl.enabled ? bl.limit_gui + " % GUI" : "Off"));
        return h("div", { staticClass: "mmb-card" }, [
          h("div", { staticClass: "mmb-row" }, stats)
        ]);
      },

      renderLanes: function (h) {
        var self = this, W = this.width, kids = [];
        var cols = Math.max(40, Math.round((W - PADL - PADR) / 2));
        var top = TOP;

        LANES.forEach(function (L) {
          var d = self.domainFor(L), d0 = d[0], d1 = d[1];
          var laneTop = top;

          // frame + label + the two domain bounds (each lane has its own scale,
          // so a single shared y-axis could not label them)
          [laneTop, laneTop + L.h].forEach(function (yy) {
            kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yy, y2: yy,
              stroke: "var(--divider)", "stroke-width": 1 } }));
          });
          kids.push(h("text", { attrs: { x: PADL, y: laneTop - 4, "font-size": 9.5,
            fill: "var(--text-badge)" } }, L.label));
          [[d1, laneTop + 8], [d0, laneTop + L.h - 2]].forEach(function (p) {
            kids.push(h("text", { attrs: { x: PADL - 5, y: p[1], "font-size": 8.5,
              "text-anchor": "end", fill: "var(--text-hint)" } },
              Number(p[0]).toFixed(L.dec)));
          });

          // zero rule where zero is meaningful — the Current lane's 0 is the
          // "charging blocked" line, so it gets drawn, not implied.
          if (L.zero && d0 < 0 && d1 > 0) {
            var yz = self.yIn(L, laneTop, 0);
            kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yz, y2: yz,
              stroke: "var(--divider)", "stroke-width": 1, "stroke-dasharray": "2 3" } }));
          }

          // the target line lives on the Charge lane only, and only when armed
          if (L.key === "capGui" && self.bl && self.bl.enabled
              && typeof self.bl.limit_gui === "number") {
            var yt = self.yIn(L, laneTop, self.bl.limit_gui);
            kids.push(h("line", { attrs: { class: "mmb-target",
              x1: PADL, x2: W - PADR, y1: yt, y2: yt, stroke: "var(--warning)",
              "stroke-width": 1.25, "stroke-dasharray": "5 3" } }));
            kids.push(h("text", { attrs: { x: W - PADR, y: yt - 3, "font-size": 8.5,
              "text-anchor": "end", fill: "var(--warning)" } },
              "target " + self.bl.limit_gui + "%"));
          }

          // one path per contiguous segment: a break is an outage, never bridged
          self.segments(L.key).forEach(function (seg) {
            var pts = self.reduce(seg, cols), dstr = "";
            pts.forEach(function (p, i) {
              dstr += (i ? "L" : "M") + self.xOf(p.m).toFixed(1) + " "
                + self.yIn(L, laneTop, p.v).toFixed(1) + " ";
            });
            if (dstr) kids.push(h("path", { attrs: { fill: "none", stroke: L.color,
              "stroke-width": 1.75, "stroke-linejoin": "round", "stroke-linecap": "round",
              d: dstr.trim() } }));
          });

          top = laneTop + L.h + LANE_GAP;
        });

        // ---- charger-state band + plug/unplug ticks, under the lanes
        var bandY = top - LANE_GAP + 6;
        var runs = this.stateRuns();
        runs.forEach(function (r) {
          var x0 = self.xOf(r.m0), x1 = self.xOf(r.m1);
          kids.push(h("rect", { attrs: { x: x0, y: bandY, width: Math.max(1, x1 - x0),
            height: BAND_H, fill: STATE_COLOR[r.v], "fill-opacity": 0.55 } }));
        });
        for (var i = 1; i < runs.length; i++) {
          var wasOn = runs[i - 1].v !== "discharging", isOn = runs[i].v !== "discharging";
          if (wasOn === isOn) continue;                 // not a plug/unplug edge
          var xe = self.xOf(runs[i].m0);
          kids.push(h("line", { attrs: { x1: xe, x2: xe, y1: TOP - 10, y2: bandY + BAND_H,
            stroke: "var(--text-hint)", "stroke-width": 1, "stroke-dasharray": "1 3" } }));
          kids.push(h("text", { attrs: { x: xe + 3, y: TOP - 12, "font-size": 8.5,
            fill: "var(--text-hint)" } }, isOn ? "plugged" : "unplugged"));
        }

        // ---- x axis
        var axisY = bandY + BAND_H + 11;
        var step = TICKSTEP[this.winW] || 10;
        for (var m = -this.winW; m <= 0; m += step) {
          var x = this.xOf(m);
          kids.push(h("text", { attrs: { x: x, y: axisY, "font-size": 9,
            "text-anchor": "middle", fill: "var(--text-hint)" } },
            m === 0 ? "now" : (m + " m")));
        }

        // ---- hover cursor + readout
        if (this.cursor != null) {
          var cx = this.xOf(this.cursor);
          kids.push(h("line", { attrs: { x1: cx, x2: cx, y1: TOP, y2: bandY + BAND_H,
            stroke: "var(--text-hint)", "stroke-width": 1 } }));
          var near = this.nearestSample(this.cursor);
          if (near) {
            var bits = [this.clock(near.t),
              (near.capGui == null ? "—" : near.capGui.toFixed(1) + "%")
                + (near.cap == null ? "" : " (gauge " + near.cap + ")"),
              (near.cur == null ? "—" : near.cur + " mA"),
              (near.voltV == null ? "—" : near.voltV.toFixed(2) + " V"),
              (near.temp == null ? "—" : near.temp.toFixed(1) + " °C"),
              STATE_LABEL[this.chargeState(near)]];
            kids.push(h("text", { attrs: { x: PADL, y: axisY + 12, "font-size": 10,
              fill: "var(--text-primary)" } }, bits.join("  ·  ")));
          }
        }

        var H = axisY + 20;
        return h("svg", {
          ref: "lanes", staticClass: "mmb-lanes",
          attrs: { viewBox: "0 0 " + W + " " + H, height: H,
            preserveAspectRatio: "none" },
          on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick }
        }, kids);
      },

      renderLimitCard: function (h) {
        var self = this, bl = this.bl, kids = [h("div", { staticClass: "mmb-h" }, "Battery charge limit")];
        if (!bl) {
          // A first-load failure must not stick on "Loading…" — surface the error.
          kids.push(h("div", { staticClass: "mmb-note" }, this.blErr || "Loading…"));
        } else if (bl.available === false) {
          kids.push(h("div", { staticClass: "mmb-note" }, "Charge limit not available on this device."));
          if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
        } else {
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("label", { staticClass: "mmb-k" }, [
              h("input", {
                attrs: { type: "checkbox", disabled: !!self.blBusy },
                domProps: { checked: !!bl.enabled },
                on: { change: function (e) {
                  self.applyBattLimit({ enabled: !!(e.target && e.target.checked) });
                } }
              }),
              " Limit charging"
            ])
          ]));
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("span", { staticClass: "mmb-k" }, "Target"),
            h("span", { staticClass: "mmb-v" }, [
              h("input", {
                attrs: { type: "number", min: 20, max: 100, step: 1,
                  disabled: !bl.enabled || !!self.blBusy },
                domProps: { value: self.blDraft },
                on: {
                  input: function (e) { self.blDraft = Number(e.target && e.target.value); },
                  change: function () { self.applyBattLimit({ limit_gui: self.blDraft }); }
                }
              }),
              " % GUI",
              h("span", { staticClass: "mmb-note" },
                "  (≈ " + (bl.limit_gauge != null ? bl.limit_gauge : "—") + "% gauge)")
            ])
          ]));
          var statusLine;
          if (bl.active) statusLine = "Active · " + (bl.active_gauge != null ? bl.active_gauge + "% gauge" : "on");
          else if (bl.enabled && !bl.charger_online) statusLine = "Armed · will apply when the charger connects";
          else if (bl.enabled && bl.charger_online) statusLine = "Enabled · not active";
          else statusLine = "Off";
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("span", { staticClass: "mmb-k" }, "Status"),
            h("span", { staticClass: "mmb-v" }, statusLine)
          ]));
          if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
        }
        return h("div", { staticClass: "mmb-card" }, kids);
      },
```

- [ ] **Step 6: Replace `render`**

Replace the placeholder `render` with:

```js
    render: function (h) {
      var self = this;
      this.tick;                                   // re-render on each poll
      var kids = [];
      if (!this.embedded) kids.push(h("div", { staticClass: "mmb-h" }, "Battery"));
      kids.push(this.renderStatusRow(h));

      var chartKids = [
        h("div", { staticClass: "mmb-row" }, [
          h("div", { staticClass: "mmb-h" }, "History"),
          h("span", { staticClass: "mmb-seg" }, RANGES.map(function (r) {
            return h("button", {
              key: r[0], staticClass: (self.winW === r[0] ? "on" : ""),
              on: { click: function () { self.setRange(r[0]); } }
            }, r[1]);
          }))
        ])
      ];
      if (this.loading) {
        chartKids.push(h("div", { staticClass: "mmb-note" }, "Loading battery history…"));
      } else if (!this.winSamples().length) {
        chartKids.push(h("div", { staticClass: "mmb-note" },
          "No battery history yet — sampling starts within 20 s."));
        if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
      } else {
        chartKids.push(this.renderLanes(h));
        if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
      }
      kids.push(h("div", { staticClass: "mmb-card" }, chartKids));
      kids.push(this.renderLimitCard(h));
      return h("div", { staticClass: "mmb" }, kids);
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/battery-chunk.test.js`
Expected: PASS — all tests from Task 3 and Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/views/mudimodem-battery.js test/battery-chunk.test.js
git commit -m "feat(battery): four-lane chart, target line, charger band, limit form"
```

---

### Task 5: Wire the Battery tab into the main page

**Files:**
- Modify: `src/views/mudimodem.js`
- Test: `test/chunk.test.js` (extend)

**Interfaces:**
- Consumes: the component produced by Task 4, fetched from `/views/gl-sdk4-ui-mudimodem-battery.common.js`.
- Produces: nothing consumed by later tasks (Task 6 only ships files).

**Note:** the charge-limit state and methods move **out** of `mudimodem.js` entirely — the chunk owns them now. One owner, not two.

- [ ] **Step 1: Write the failing tests**

Append to `test/chunk.test.js` (it already has a `loadChunk`/`makeVm`-style harness — reuse whatever helpers that file defines; the assertions below only need the component object and its source text):

```js
test('the Battery tab exists in the tab bar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'mudimodem.js'), 'utf8');
  assert.ok(/\["battery", *"Battery"\]/.test(src), 'Battery tab not registered in TABS');
});

test('the battery chunk is lazy-loaded like the other tabs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'mudimodem.js'), 'utf8');
  assert.ok(src.includes('gl-sdk4-ui-mudimodem-battery.common.js'), 'no lazy load of the battery chunk');
  assert.ok(/loadBattery/.test(src), 'loadBattery() missing');
});

test('the charge-limit form no longer lives in the main chunk', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'mudimodem.js'), 'utf8');
  // It moved to the Battery tab's own chunk. Two owners of one setting is the bug
  // this check prevents.
  assert.ok(!src.includes('applyBattLimit'), 'applyBattLimit still in the main chunk');
  assert.ok(!src.includes('get_battlimit'), 'get_battlimit still called from the main chunk');
  assert.ok(!src.includes('Battery charge limit'), 'the battery card is still rendered in Config');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/chunk.test.js`
Expected: FAIL on all three new tests.

- [ ] **Step 3: Add the lazy-loader state and method**

In `src/views/mudimodem.js` `data()`, next to `speedtestComp` / `speedtestLoading` (around line 85), add:

```js
      // Battery tab: same lazy-chunk pattern as Tracking/AT console/Speedtest.
      batteryComp: null,
      batteryLoading: false,
      batteryErr: "",
```

In `methods`, immediately after `loadSpeedtest`:

```js
    // Open the in-page Battery tab, lazy-loading its chunk on first use.
    openBattery() { this.tab = "battery"; this.loadBattery(); },
    loadBattery() {
      var self = this;
      if (this.batteryComp || this.batteryLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.batteryLoading = true; this.batteryErr = "";
      window.$axios.get("/views/gl-sdk4-ui-mudimodem-battery.common.js?_t=" + Date.now())
        .then(function (res) {
          var module = { exports: {} };            // eslint-disable-line no-unused-vars
          var comp = eval(res.data);               // chunk is `module.exports = {...}`
          if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
          self.batteryComp = comp; self.batteryLoading = false;
        })
        .catch(function (e) {
          self.batteryLoading = false;
          self.batteryErr = (e && (e.message || e.type)) || "could not load the battery view";
        });
    },
```

- [ ] **Step 4: Register the tab and its panel**

In `render`, extend `TABS`:

```js
    var TABS = [["tracking", "Tracking"], ["sim", "SIM"], ["lock", "Cell lock"],
      ["bands", "Bands"], ["at", "AT console"], ["speedtest", "Speedtest"],
      ["battery", "Battery"], ["config", "Config"], ["lcd", "LCD Display"]];
```

In the tab-bar click handler, add the battery branch:

```js
        on: { click: function () {
          if (t[0] === "tracking") self.openTracking();
          else if (t[0] === "speedtest") self.openSpeedtest();
          else if (t[0] === "battery") self.openBattery();
          else self.tab = t[0];
        } }
```

In the panel `if/else` chain, before the `else if (this.tab === "lcd")` branch:

```js
    } else if (this.tab === "battery") {
      if (this.batteryComp) {
        panel = h(this.batteryComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.batteryErr ? "Couldn't load the battery view: " + this.batteryErr
            : "Loading the battery view…")]);
      }
```

- [ ] **Step 5: Remove the charge-limit form from the Config tab**

Delete, in `src/views/mudimodem.js`:

1. The four `battLimit*` keys from `data()` (`battLimit`, `battLimitBusy`, `battLimitErr`, `battLimitDraft`, around lines 123–127) — **including the `// Battery charge limit (get_battlimit / set_battlimit)` comment above them.**
2. The whole `fetchBattLimit()` method (around lines 732–744).
3. The whole `applyBattLimit(patch)` method (around lines 745–785).
4. The line `this.fetchBattLimit();    // refresh charge-limit snapshot every open` from the `tab(t)` watcher's `config` branch (around line 310).
5. In `renderConfig`, the entire `// --- Battery charge limit card ---` block (around lines 951–1019, from `var bl = this.battLimit;` through `var batt = h("div", { staticClass: "mm-card" }, battKids);`).
6. Change the final line of `renderConfig` from `return h("div", {}, [device, app, batt]);` to:

```js
      return h("div", {}, [device, app]);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/chunk.test.js test/battery-chunk.test.js`
Expected: PASS — the three new assertions plus every pre-existing `chunk.test.js` test (the Config tab must still render its device and app cards).

- [ ] **Step 7: Commit**

```bash
git add src/views/mudimodem.js test/chunk.test.js
git commit -m "feat(ui): add the Battery tab; move the charge-limit form out of Config"
```

---

### Task 6: Ship it — build, deploy, verify, docs

**Files:**
- Modify: `tools/build.sh`, `tools/deploy.sh`, `tools/verify.sh`, `CLAUDE.md`

**Interfaces:**
- Consumes: `src/views/mudimodem-battery.js` (Task 4), `get_battery_history` (Task 2), `battery.jsonl` (Task 1).
- Produces: `/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz` on the device.

- [ ] **Step 1: Add the chunk to the build**

In `tools/build.sh`, after the speedtest gzip line:

```sh
gzip -9 -n -c src/views/mudimodem-battery.js > build/gl-sdk4-ui-mudimodem-battery.common.js.gz
```

- [ ] **Step 2: Run the build to verify the artifact appears**

Run: `./tools/build.sh`
Expected: `ls -l build/` lists `gl-sdk4-ui-mudimodem-battery.common.js.gz` with a non-zero size.

- [ ] **Step 3: Add the chunk to deploy and to sysupgrade registration**

In `tools/deploy.sh`, after the speedtest deploy block:

```sh
# Battery tab (issue #1) — chunk only; no menu JSON (it is an in-page tab, not
# a standalone route) and no new backend file (get_battery_history ships inside
# the existing rpc/mudimodem).
ssh -o BatchMode=yes "root@$HOST" 'cat > /www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem-battery.common.js.gz
echo "battery chunk deployed"
```

In the `/etc/sysupgrade.conf` registration list, add one line next to the other chunks:

```sh
  /www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz \
```

Then restart the collector so the new sampler runs. Add this next to the existing collectd handling in `deploy.sh` (or run it by hand once if `deploy.sh` already restarts it — check before adding a duplicate):

```sh
ssh -o BatchMode=yes "root@$HOST" '/etc/init.d/mudimodem-collectd restart' || true
```

- [ ] **Step 4: Add the verify steps**

In `tools/verify.sh`, after step 7 (the history collector block), add:

```sh
# 7b. Battery history (issue #1): chunk serves + evals, collector is sampling,
#     and get_battery_history survives a real /rpc round trip.
echo "7b. battery chunk + battery.jsonl + get_battery_history"
ssh -o BatchMode=yes "root@$HOST" 'test -s /www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz' \
  || fail "battery chunk .gz missing"
BBODY=$(ssh -o BatchMode=yes "root@$HOST" \
  'curl -sk -H "Accept-Encoding: gzip" "https://127.0.0.1/views/gl-sdk4-ui-mudimodem-battery.common.js?_t=1" | gzip -dc')
printf '%s' "$BBODY" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const module={exports:{}}; const c=eval(s);
    if(!c||c.name!=="mudimodem-battery"){console.error("FAIL: battery eval");process.exit(1);}
    if(typeof c.render!=="function"||c.template!==undefined){console.error("FAIL: not render-only");process.exit(1);}
    if(!/"get_battery_history"/.test(s)){console.error("FAIL: does not read battery history over RPC");process.exit(1);}
    console.log("   battery eval + render-only OK ->", c.name);
  })' || fail "battery chunk eval failed"

if [ -f src/sbin/mudimodem-collectd ]; then
  # The newest battery sample must be FRESH (within 60 s of box now). Checking
  # freshness rather than watching the file grow avoids a 25 s sleep here.
  ssh -o BatchMode=yes "root@$HOST" 'for i in 1 2 3 4 5 6; do [ -s /tmp/mudimodem/battery.jsonl ] && exit 0; sleep 5; done; exit 1' \
    || fail "no battery.jsonl written after ~30s"
  ssh -o BatchMode=yes "root@$HOST" 'lua -e "
    local f=io.open(\"/tmp/mudimodem/battery.jsonl\"); local last
    for l in f:lines() do last=l end
    local o=require(\"cjson\").decode(last)
    local age=(os.time()*1000)-o.t
    if age>60000 then os.exit(1) end
    if o.cap==nil or o.cur==nil then os.exit(1) end"' \
    || fail "battery.jsonl newest sample is stale (>60s) or missing cap/cur"
  echo "   battery collector is sampling (fresh sample, cap+cur present)"
  ssh -o BatchMode=yes "root@$HOST" 'cat > /tmp/mm-bat.test.lua' < test/backend-battery-history.test.lua
  ssh -o BatchMode=yes "root@$HOST" 'MUDIMODEM_HIST=/tmp/mmbat-test lua /tmp/mm-bat.test.lua; rc=$?; rm -f /tmp/mm-bat.test.lua; exit $rc' \
    || fail "get_battery_history test failed on-device"
fi

# A REAL /rpc round trip. The on-device dofile test above bypasses oui's arg
# validation entirely, so only this can catch a -32602 rejection. Needs a sid,
# so it runs only when MM_PW is set (mirrors step 9b).
if [ -n "${MM_PW:-}" ]; then
  echo "7c. get_battery_history over /rpc (validation layer)"
  SID=$(ssh -o BatchMode=yes "root@$HOST" \
    'curl -sk -X POST https://127.0.0.1/rpc -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"login\",\"params\":{\"username\":\"root\",\"password\":\"'"$MM_PW"'\"}}" \
     | sed -n "s/.*\"sid\":\"\([^\"]*\)\".*/\1/p"')
  [ -n "$SID" ] || fail "login for /rpc round trip failed"
  RESP=$(ssh -o BatchMode=yes "root@$HOST" \
    'curl -sk -X POST https://127.0.0.1/rpc -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"call\",\"params\":[\"'"$SID"'\",\"mudimodem\",\"get_battery_history\",{\"window_ms\":900000}]}"')
  echo "$RESP" | grep -q '"samples"' \
    || fail "get_battery_history over /rpc did not return samples (got: $RESP)"
  echo "$RESP" | grep -q '"error"' \
    && fail "get_battery_history over /rpc returned an error (got: $RESP)"
  echo "   /rpc round trip OK"
fi
```

- [ ] **Step 5: Run the full local test suite**

Run:
```bash
python3 test/collectd.test.py && python3 test/test_collectd.py \
  && node --test test/battery-chunk.test.js test/chunk.test.js test/tracking.test.js \
  && ./tools/build.sh
```
Expected: every suite reports OK and the build lists all chunk artifacts.

- [ ] **Step 6: Deploy and verify on the device**

Run:
```bash
./tools/deploy.sh
ssh root@mudi '/etc/init.d/mudimodem-collectd restart; /etc/init.d/nginx restart'
./tools/verify.sh
```

> **`restart`, not `reload`.** nginx runs 4 workers, each `dofile`-ing its own copy of the plugin; a HUP leaves old workers serving drained connections with the OLD backend, so `get_battery_history` would intermittently 404.

Expected: `verify.sh` reaches its final line without a `FAIL:`. Steps 7b/7c must pass.

**If step 5's band-model assertion fails, that is pre-existing** — CLAUDE.md §12 records that it trips on live band drift, unrelated to this work. Confirm the failure text mentions bands, and report it rather than "fixing" it here.

- [ ] **Step 7: Update CLAUDE.md**

Four edits:

1. **§5 architecture table** — add a row:

```
| `/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz` | Battery tab chunk: 4-lane history chart + charge-limit form (§12, 2026-07-27) |
```

2. **§11 repo layout** — add under `src/views/` and `test/`:

```
│   ├── views/mudimodem-battery.js  ← Battery tab chunk (chart + charge-limit form)
├── test/battery-chunk.test.js       ← evals the battery chunk; lane domains, reduce, gaps
├── test/backend-battery-history.test.lua
```

3. **§12 status** — add:

```
- ✅ **Battery tab + history chart (2026-07-27)** — answers issue #1 from **ChiliApple**, the
  `glbattlimit` author. `mudimodem-collectd` gained a **20 s sysfs sampler** writing
  `/tmp/mudimodem/battery.jsonl` (24 h / 5,200 lines, tmpfs); `get_battery_history` serves it
  through the **same backward-chunk tail reader as `get_history`**, now extracted to a shared
  `read_window(path, since)`. New lazy chunk `mudimodem-battery.js` draws **four stacked lanes**
  (charge %, current mA, voltage V, temp °C) on one x-axis — deliberately NOT Tracking's
  normalized overlay, because normalizing destroys the one value that matters: `cur == 0` must
  read as ZERO. The charge-limit form **moved out of the Config tab** into this chunk (one owner).
  ⚠️ **Unit traps, verified on box:** `current_now` is **mA already** (the Linux power_supply class
  normally uses µA — `glbattlimit` line 166 documents mA, and the physics agree), signed
  **+charging / −discharging**, and **`0` means BLOCKED** — so "the limit is engaged" is
  `cur == 0 && online == 1`, which is what the chart marks. Meanwhile `voltage_now` on the same
  node is µV and the *charger* node's limits are µA. Convert per node.
  Spec: `docs/superpowers/specs/2026-07-27-battery-tab-history-design.md`;
  plan: `docs/superpowers/plans/2026-07-27-battery-tab-history.md`.
```

4. **Fix the stale sysupgrade note.** §12's last bullet claims "nothing is registered in `/etc/sysupgrade.conf`". That is **wrong** — `deploy.sh` has registered every shipped file idempotently since the speedtest phase. Replace that bullet with:

```
- ✅ `/etc/sysupgrade.conf` **is** registered by `./tools/deploy.sh` (idempotent
  `grep -qxF … || echo … >> "$f"`), covering every shipped file. **Any new shipped file must be
  added to that list**, or a firmware upgrade wipes it. Still not done: `install.sh`/`uninstall.sh`,
  a boot hook for the watchdog `boot-check`, and an ipk.
```

- [ ] **Step 8: Commit**

```bash
git add tools/build.sh tools/deploy.sh tools/verify.sh CLAUDE.md
git commit -m "chore(battery): build/deploy/verify wiring + docs for the Battery tab"
```

- [ ] **Step 9: Answer the issue**

Only after `verify.sh` is green on the device:

```bash
gh issue comment 1 --body "Shipped in <commit>. ..."
```

Draft the comment text and **show it to the user before posting** — it is outward-facing, and the plan does not pre-authorise posting it. Credit ChiliApple for the suggestion and for `glbattlimit`'s `0 = blocked` semantics, which the chart's limit-engaged marker relies on.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Collector — sampling, `read_battery`, retention, broadcast unchanged | Task 1 |
| §2 Backend — `get_battery_history`, `read_window`, `gui_m`/`gui_b`, no validator | Task 2 |
| §3 Frontend — registration, layout, four lanes + domains, annotations, carried-over behaviours, empty states | Tasks 3–5 |
| §4 Testing — four test files, verify.sh additions | Tasks 1–4 (unit), Task 6 (verify.sh) |
| §5 Rollout — build, deploy, sysupgrade, restarts | Task 6 |
| §6 Risks — `read_window` extraction guarded by the untouched `backend-history.test.lua` | Task 2 Step 7 |
| §7 Attribution | Task 6 Step 9 |

**Type consistency checked:** `read_battery(root, t)` returns the key set `t/cap/volt/cur/temp/online/status/ctype/cycles/health` — the same keys the Lua test fixtures use, the same keys `winSamples` reads, and `capGui`/`voltV` are added only in `winSamples` (which is why `LANES` keys are `capGui`/`voltV`, not `cap`/`volt`). `guiOf` reads `bl.gui_m`/`bl.gui_b`, exactly the field names Task 2 Step 6 adds. `chargeState` returns the four strings `STATE_COLOR` and `STATE_LABEL` are both keyed by.

**Known non-blocking gap:** Task 5's removal assertions are text-based (`!src.includes('applyBattLimit')`). If a later refactor reintroduces the name for an unrelated reason the test would misfire — acceptable for a one-shot move check.
