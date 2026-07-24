# Merge MudiUI into MudiModem — LCD Display tab + consolidated modem reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the MudiUI front-LCD renderer into this repo as an opt-in add-on, add an "LCD Display" tab to the MudiModem admin page that enables/configures it, and make `mudimodem-collectd` the single on-device modem reader that MudiUI consumes (event-pushed over a Unix socket) instead of polling ubus itself.

**Architecture:** MudiUI's five shipped files move under `src/lcd/`; one installer ships both add-ons. `mudimodem-collectd` gains a broadcast Unix-domain socket + `latest.json` and a faster 4s cadence with a larger retention cap. MudiUI's `CellularSource` becomes a socket subscriber (its `cellular.network`/`cellular.modem`/`AT+QSPN` reads deleted). The LCD tab is an in-page tab (like the Config/battery card) backed by two new `mudimodem` RPC methods (`get_lcd`/`set_lcd`) that toggle the procd services and write uci `mudi`; a new `SIGHUP` handler in `mudi.py` applies config changes live without a panel restart.

**Tech Stack:** Python 3.11 stdlib (musl, no pip) on the device; hand-written Vue 2.6.12 runtime-only chunk (`render(h)`, no templates); Lua RPC plugin (`dofile`-loaded); OpenWrt procd + uci; BusyBox ash installers. Local tests: Node `node:test` for the chunk, Python `unittest` for the daemon/renderer.

## Global Constraints

- **Frontend is runtime-only Vue 2.6.12** — `template:` is forbidden; use `render(h)`. The chunk file is an expression: `module.exports = { ... };`. (spec §5, CLAUDE.md §5)
- **RPC object names cannot contain dots** — the page calls `mudimodem.get_lcd`/`set_lcd`; the backend does any dotted `cellular.*` calls server-side. (CLAUDE.md §3)
- **NEVER wrap `oui.ubus.call` in `pcall`** — it yields across a C-call boundary and throws. GL's plugins (and ours) call it bare. (CLAUDE.md §8)
- **Device-side code is Python 3 stdlib only** — no pip, no pyserial, musl libc. (CLAUDE.md §7a)
- **collectd reads GL's ubus cache, never raw AT** — no AT-channel contention. (`src/sbin/mudimodem-collectd` header)
- **`sub_id=0` is forbidden** — resolves to different subscriptions at different times. (CLAUDE.md §6) N/A to new code but do not introduce it.
- **LCD renderer default is OFF** — it seizes `/dev/fb0` from `gl_screen`; enabled only from the tab. (spec §4)
- **uci config: package `mudi`, section `main`.** (MudiUI `Settings` class)
- **Deploy transfer uses `ssh host 'cat > /path'`, not scp** (no sftp-server). Use `./tools/deploy.sh` / `./tools/verify.sh`. (CLAUDE.md)
- **Front-panel geometry gate: `/sys/class/graphics/fb0/virtual_size` == `240,320`.** (MudiUI `install.sh`)

---

### Task 1: Relocate MudiUI source + tests into this repo (baseline green)

Bring MudiUI's five shipped files and its test suite in, unchanged except for two path fixups in the test, so we have a green baseline before modifying anything.

**Files:**
- Create: `src/lcd/mudi.py`, `src/lcd/mudi-watch.py`, `src/lcd/mudi.init`, `src/lcd/mudi-watch.init`, `src/lcd/mudi.config` (copies of `/home/kevin/MudiUI/src/*`)
- Create: `test/test_lcd.py` (copy of `/home/kevin/MudiUI/tests/test_mudi.py`, two lines patched)

**Interfaces:**
- Produces: the `mudi` module importable from `src/lcd/mudi.py`; classes `DataSource`, `CellularSource`, `Settings`, `App`, `MockApp` unchanged from MudiUI.

- [ ] **Step 1: Copy the five shipped source files**

```bash
cd /home/kevin/MudiModem
mkdir -p src/lcd
cp /home/kevin/MudiUI/src/mudi.py         src/lcd/mudi.py
cp /home/kevin/MudiUI/src/mudi-watch.py   src/lcd/mudi-watch.py
cp /home/kevin/MudiUI/src/mudi.init       src/lcd/mudi.init
cp /home/kevin/MudiUI/src/mudi-watch.init src/lcd/mudi-watch.init
cp /home/kevin/MudiUI/src/mudi.config     src/lcd/mudi.config
```

- [ ] **Step 2: Copy the test suite**

```bash
cp /home/kevin/MudiUI/tests/test_mudi.py /home/kevin/MudiModem/test/test_lcd.py
```

- [ ] **Step 3: Patch the two path lines in `test/test_lcd.py`**

The original inserts `../src` on `sys.path` and reads `../src/mudi.config`. Both must point at `src/lcd`. Edit line ~15 (the `sys.path.insert`):

```python
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lcd"))
```

And in `TestScreenTimeoutOptions.test_shipped_uci_default_matches_code_default`, change the `cfg` path (originally `..`, `src`, `mudi.config`) to:

```python
        cfg = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "src", "lcd", "mudi.config")
```

- [ ] **Step 4: Run the relocated suite — expect PASS**

Run: `cd /home/kevin/MudiModem && python3 test/test_lcd.py -v`
Expected: all tests PASS (same suite that was green in MudiUI).

- [ ] **Step 5: Commit**

```bash
cd /home/kevin/MudiModem
git add src/lcd test/test_lcd.py
git commit -m "chore(lcd): vendor MudiUI renderer under src/lcd + its test suite

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: collectd — 4s cadence + larger retention cap

Make collectd poll every 4s (matching MudiUI's old panel cadence) and raise the sample cap so 24h of history survives at that rate (24h ÷ 4s ≈ 21,600 samples).

**Files:**
- Modify: `src/sbin/mudimodem-collectd` (lines 23, 25)
- Create: `test/test_collectd.py`

**Interfaces:**
- Produces: module-level constants `POLL_INTERVAL` (float, default 4.0) and `SAMPLE_MAX_LINE` (int, ≥ 21600).

- [ ] **Step 1: Write the failing test**

Create `test/test_collectd.py`:

```python
"""Tests for mudimodem-collectd — stdlib unittest (no pytest on the box)."""
import importlib.machinery
import importlib.util
import json
import os
import socket
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "sbin", "mudimodem-collectd")
loader = importlib.machinery.SourceFileLoader("collectd", SRC)
spec = importlib.util.spec_from_loader("collectd", loader)
collectd = importlib.util.module_from_spec(spec)
loader.exec_module(collectd)


class TestConstants(unittest.TestCase):
    def test_fast_cadence_default(self):
        self.assertEqual(collectd.POLL_INTERVAL, 4.0)

    def test_retention_cap_preserves_24h_at_4s(self):
        # 24h / 4s = 21600 samples must fit under the line cap.
        self.assertGreaterEqual(collectd.SAMPLE_MAX_LINE, 21600)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 test/test_collectd.py -v`
Expected: FAIL — `POLL_INTERVAL` is 10.0 and `SAMPLE_MAX_LINE` is 10000.

- [ ] **Step 3: Change the two constants**

In `src/sbin/mudimodem-collectd`, line 23:

```python
POLL_INTERVAL   = float(os.environ.get("MUDIMODEM_POLL", "4"))
```

Line 25:

```python
SAMPLE_MAX_LINE = 22000                 # 24h at 4s ≈ 21.6k; hard backstop above that
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 test/test_collectd.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sbin/mudimodem-collectd test/test_collectd.py
git commit -m "feat(collectd): 4s cadence + 22k retention cap for the shared reader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: collectd — broadcast Unix socket + latest.json

Add a broadcast socket so MudiUI receives each fresh sample as a push (event + payload in one), plus an atomic `latest.json` for external/debug consumers. New clients get the most recent line immediately (accept-replay).

**Files:**
- Modify: `src/sbin/mudimodem-collectd` (imports at lines 16–21; `main()` at lines 133–164)
- Modify: `test/test_collectd.py`

**Interfaces:**
- Produces: class `Broadcaster(path)` with `.start()`, `.publish(line: str)`, `.close()`; function `write_latest(path, sample)`. The socket lives at `<hist>/collectd.sock`, latest at `<hist>/latest.json`.
- Consumed by: Task 4 (MudiUI connects to `<hist>/collectd.sock`).

- [ ] **Step 1: Write the failing tests**

Append to `test/test_collectd.py` (before the `if __name__` block):

```python
class TestBroadcaster(unittest.TestCase):
    def _sock(self):
        d = tempfile.mkdtemp()
        return os.path.join(d, "collectd.sock")

    def test_publish_reaches_a_connected_client(self):
        bc = collectd.Broadcaster(self._sock())
        bc.start()
        try:
            c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            c.settimeout(2.0)
            c.connect(bc.path)
            time.sleep(0.05)                       # let accept register the client
            bc.publish(json.dumps({"rsrp": -101}))
            line = c.recv(4096).decode().strip()
            self.assertEqual(json.loads(line)["rsrp"], -101)
        finally:
            bc.close()

    def test_new_client_gets_the_last_line_on_connect(self):
        bc = collectd.Broadcaster(self._sock())
        bc.start()
        try:
            bc.publish(json.dumps({"band": 71}))   # published BEFORE anyone connects
            c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            c.settimeout(2.0)
            c.connect(bc.path)
            line = c.recv(4096).decode().strip()
            self.assertEqual(json.loads(line)["band"], 71)
        finally:
            bc.close()

    def test_publish_survives_a_dead_client(self):
        bc = collectd.Broadcaster(self._sock())
        bc.start()
        try:
            c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            c.connect(bc.path)
            time.sleep(0.05)
            c.close()                              # client goes away
            bc.publish(json.dumps({"rsrp": -90}))  # must not raise
            self.assertTrue(True)
        finally:
            bc.close()


class TestWriteLatest(unittest.TestCase):
    def test_writes_valid_json_atomically(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "latest.json")
        collectd.write_latest(p, {"rsrp": -101, "band": 71})
        with open(p) as f:
            obj = json.load(f)
        self.assertEqual(obj["band"], 71)
        self.assertFalse(os.path.exists(p + ".tmp"))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 test/test_collectd.py -v`
Expected: FAIL — `Broadcaster` / `write_latest` are not defined.

- [ ] **Step 3: Add `socket` + `threading` imports**

In `src/sbin/mudimodem-collectd`, the import block (lines 16–21) becomes:

```python
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
```

- [ ] **Step 4: Add the `Broadcaster` class and `write_latest` helper**

Insert immediately after the `now_ms()` function (after line 31):

```python
def write_latest(path, sample):
    """Atomically write the newest sample so a just-connected consumer (or a
    debugger) can read current state without waiting for the next tick."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(json.dumps(sample))
    os.replace(tmp, path)


class Broadcaster:
    """Push each sample line to connected AF_UNIX clients (event + payload in
    one). A new client is replayed the most recent line on connect. Best-effort:
    a slow/dead client is dropped, never allowed to stall or crash the poll loop.
    """

    def __init__(self, path):
        self.path = path
        self._clients = []
        self._last = None                       # bytes of the last published line
        self._lock = threading.Lock()
        self._srv = None

    def start(self):
        try:
            os.unlink(self.path)                # clear a stale socket from a crash
        except OSError:
            pass
        self._srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._srv.bind(self.path)
        self._srv.listen(8)
        threading.Thread(target=self._accept, name="collectd-accept",
                         daemon=True).start()

    def _accept(self):
        while True:
            try:
                c, _ = self._srv.accept()
            except OSError:
                return                          # listener closed on shutdown
            with self._lock:
                self._clients.append(c)
                last = self._last
            if last is not None:
                self._send(c, last)

    def _send(self, c, data):
        try:
            c.sendall(data)
        except OSError:
            with self._lock:
                if c in self._clients:
                    self._clients.remove(c)
            try:
                c.close()
            except OSError:
                pass

    def publish(self, line):
        data = (line + "\n").encode("utf-8")
        with self._lock:
            self._last = data
            clients = list(self._clients)
        for c in clients:
            self._send(c, data)

    def close(self):
        if self._srv:
            try:
                self._srv.close()
            except OSError:
                pass
        with self._lock:
            clients = list(self._clients)
            self._clients = []
        for c in clients:
            try:
                c.close()
            except OSError:
                pass
        try:
            os.unlink(self.path)
        except OSError:
            pass
```

- [ ] **Step 5: Wire the broadcaster + latest.json into `main()`**

In `main()`, after `samples_path`/`events_path` are set (after line 137), add the socket + latest paths and start the broadcaster:

```python
    latest_path = os.path.join(hist, "latest.json")
    sock_path = os.path.join(hist, "collectd.sock")
    bc = Broadcaster(sock_path)
    bc.start()
```

Replace the sample-append block (lines 148–151) with:

```python
            s = collect_sample()
            if s is not None:
                line = json.dumps(s)
                with open(samples_path, "a") as f:
                    f.write(line + "\n")
                bc.publish(line)
                write_latest(latest_path, s)
```

And close the broadcaster when the loop exits — after the `while state["go"]` loop ends (after line 163), before `main` returns:

```python
    bc.close()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python3 test/test_collectd.py -v`
Expected: PASS (all four broadcaster/latest tests + the two constant tests).

- [ ] **Step 7: Commit**

```bash
git add src/sbin/mudimodem-collectd test/test_collectd.py
git commit -m "feat(collectd): broadcast socket + latest.json for the single-reader push

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: MudiUI CellularSource → socket subscriber

Replace `CellularSource`'s ubus/AT polling with a subscriber to collectd's socket. Field-mapping is a pure method (`_emit_sample`) so it is testable without a socket.

**Files:**
- Modify: `src/lcd/mudi.py` (imports ~line 21; `CellularSource` class lines 158–194)
- Modify: `test/test_lcd.py`

**Interfaces:**
- Consumes: collectd socket `/tmp/mudimodem/collectd.sock` (override via env `MUDIMODEM_SOCK`); sample dict keys `rsrp, rsrq, sinr, rsrp_level, id, band, tx_channel, dl_bandwidth, mode, carrier, slot` (from Task 3's `build_sample`).
- Produces: `CellularSource` unchanged `provides` tuple and emitted bus keys (`signal.rsrp`, `signal.rsrq`, `signal.sinr`, `signal.level`, `cell.id`, `cell.band`, `cell.freq`, `cell.bw`, `net.mode`, `sim.carrier`, `sim.slot`); new pure method `_emit_sample(dict)`.

- [ ] **Step 1: Write the failing test**

Append to `test/test_lcd.py` (before the `if __name__` block):

```python
class TestCellularSampleMapping(unittest.TestCase):
    """CellularSource maps a collectd sample dict onto its bus keys — the exact
    values the widgets used to get from cellular.network info + AT+QSPN."""

    def collect(self, sample):
        src = mudi.CellularSource()
        seen = {}
        # Register callbacks directly (do NOT subscribe(), which would start the
        # socket thread); we drive _emit_sample() by hand.
        for k in src.provides:
            src._subs[k] = [(lambda kk: (lambda v: seen.__setitem__(kk, v)))(k)]
        src._emit_sample(sample)
        return seen

    SAMPLE = {
        "id": "187461035", "band": 71, "mode": "NR5G-SA FDD",
        "rsrp": -101, "rsrq": -14, "sinr": 4, "rsrp_level": 3,
        "dl_bandwidth": "15MHz", "tx_channel": 127490,
        "carrier": "T-Mobile", "slot": 1,
    }

    def test_maps_signal_and_cell_fields(self):
        s = self.collect(self.SAMPLE)
        self.assertEqual(s["signal.rsrp"], -101)
        self.assertEqual(s["signal.rsrq"], "-14 dB")
        self.assertEqual(s["signal.sinr"], "4 dB")
        self.assertEqual(s["signal.level"], 3)
        self.assertEqual(s["cell.id"], "187461035")
        self.assertEqual(s["cell.band"], "n71")
        self.assertEqual(s["cell.freq"], "%d MHz" % round(127490 * 5 / 1000.0))
        self.assertEqual(s["cell.bw"], "15 MHz")
        self.assertEqual(s["net.mode"], "NR5G-SA")
        self.assertEqual(s["sim.carrier"], "T-Mobile")
        self.assertEqual(s["sim.slot"], "1")

    def test_null_metrics_do_not_crash_and_show_dashes(self):
        s = self.collect({"slot": 1, "id": None, "band": None, "mode": None,
                          "rsrp": None, "rsrq": None, "sinr": None,
                          "rsrp_level": None, "dl_bandwidth": None,
                          "tx_channel": None, "carrier": ""})
        self.assertEqual(s["cell.band"], "—")
        self.assertEqual(s["cell.freq"], "—")
        self.assertEqual(s["cell.bw"], "—")
        self.assertEqual(s["net.mode"], "—")
        self.assertEqual(s["signal.level"], 0)
        self.assertNotIn("sim.carrier", s)          # empty carrier is not emitted
        self.assertNotIn("signal.rsrp", s)          # null rsrp is not emitted
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 test/test_lcd.py -v`
Expected: FAIL — `CellularSource` has no `_emit_sample`.

- [ ] **Step 3: Add the `socket` import**

In `src/lcd/mudi.py`, add `socket` to the top import line (currently `import sys, os, time, json, subprocess, threading, signal, re, textwrap`):

```python
import sys, os, time, json, subprocess, threading, signal, re, socket, textwrap
```

- [ ] **Step 4: Replace the `CellularSource` class**

Replace the whole class (lines 158–194) with:

```python
class CellularSource(DataSource):
    provides = ("signal.rsrp","signal.rsrq","signal.sinr","signal.level",
                "cell.id","cell.band","cell.freq","cell.bw","net.mode",
                "sim.carrier","sim.slot")
    cadence = 4.0; name = "cellular"
    SOCK = os.environ.get("MUDIMODEM_SOCK", "/tmp/mudimodem/collectd.sock")

    def __init__(self, sock=None):
        super().__init__()
        if sock: self.SOCK = sock

    def _run(self):
        # Subscriber-gated socket reader (replaces the timer-poll). collectd is
        # the single modem reader now; we consume its push over a Unix socket and
        # do zero ubus/AT work. Reconnects if collectd restarts. _stop is set the
        # moment the last subscriber leaves (DataSource.unsubscribe), so a 1s recv
        # timeout keeps teardown snappy.
        while not self._stop.is_set():
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.settimeout(1.0)
                s.connect(self.SOCK)
            except OSError:
                if self._stop.wait(2.0): return          # collectd not up; retry
                continue
            buf = b""
            try:
                while not self._stop.is_set():
                    try:
                        chunk = s.recv(4096)
                    except socket.timeout:
                        continue                          # re-check _stop
                    if not chunk:
                        break                             # collectd closed us
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        self._on_line(line)
            except OSError:
                pass
            finally:
                try: s.close()
                except OSError: pass
            if self._stop.wait(1.0): return               # backoff before retry

    def _on_line(self, raw):
        try:
            d = json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            return
        if isinstance(d, dict):
            self._emit_sample(d)

    def _emit_sample(self, ci):
        arfcn = int(ci.get("tx_channel") or 0)
        if ci.get("rsrp") is not None: self._emit("signal.rsrp", int(ci["rsrp"]))
        if ci.get("rsrq") is not None: self._emit("signal.rsrq", "%s dB" % ci["rsrq"])
        if ci.get("sinr") is not None: self._emit("signal.sinr", "%s dB" % ci["sinr"])
        self._emit("signal.level", int(ci.get("rsrp_level") or 0))
        self._emit("cell.id", ci.get("id") or "—")
        self._emit("cell.band", "n%s" % ci["band"] if ci.get("band") else "—")
        self._emit("cell.freq", "%d MHz" % round(arfcn * 5 / 1000.0) if arfcn else "—")
        bw = ci.get("dl_bandwidth")
        self._emit("cell.bw", bw.replace("MHz", " MHz") if bw else "—")
        mode = ci.get("mode")
        self._emit("net.mode", mode.split()[0] if mode else "—")
        if ci.get("carrier"): self._emit("sim.carrier", ci["carrier"])
        if ci.get("slot") is not None: self._emit("sim.slot", str(ci["slot"]))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 test/test_lcd.py -v`
Expected: PASS (the two new mapping tests + the whole existing suite still green).

- [ ] **Step 6: Commit**

```bash
git add src/lcd/mudi.py test/test_lcd.py
git commit -m "feat(lcd): CellularSource reads collectd's socket, drops ubus/AT polling

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: MudiUI SIGHUP live-reload

Add a `SIGHUP` handler so a web-side config change re-reads uci and applies brightness live (no panel restart/flash). Extract the reload into a testable method.

**Files:**
- Modify: `src/lcd/mudi.py` (`App.run()` signal block lines 1069–1071; loop top lines 1078–1079)
- Modify: `test/test_lcd.py`

**Interfaces:**
- Produces: `App._reload_settings()` — re-reads `Settings` and re-applies brightness when not blanked. `App.run()` registers `SIGHUP` → sets `self._reload_req`; the loop consumes it and calls `_reload_settings()`.
- Consumed by: Task 6 (`set_lcd` sends `SIGHUP` to the running `mudi.py`).

- [ ] **Step 1: Write the failing test**

Append to `test/test_lcd.py` (before the `if __name__` block):

```python
class TestSighupReload(unittest.TestCase):
    """A web-side uci change reaches the running renderer via SIGHUP: re-read
    settings, re-apply brightness live (unless the panel is blanked)."""

    def _app(self):
        a = mudi.MockApp()
        applied = []
        a.blanked = False
        a._set_brightness = lambda v: applied.append(int(v))
        a._brightness = lambda: int(a.settings.get("brightness"))
        # simulate the web having written a new value into uci
        def fake_load():
            a.settings.vals["brightness"] = "77"
        a.settings.load = fake_load
        return a, applied

    def test_reload_rereads_uci_and_applies_brightness(self):
        a, applied = self._app()
        mudi.App._reload_settings(a)
        self.assertEqual(a.settings.get("brightness"), "77")
        self.assertEqual(applied[-1], 77)

    def test_reload_does_not_touch_backlight_while_blanked(self):
        a, applied = self._app()
        a.blanked = True
        mudi.App._reload_settings(a)
        self.assertEqual(a.settings.get("brightness"), "77")   # still re-read
        self.assertEqual(applied, [])                          # but not applied
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 test/test_lcd.py -v`
Expected: FAIL — `App._reload_settings` does not exist.

- [ ] **Step 3: Add the `_reload_settings` method**

In `src/lcd/mudi.py`, add this method to `App` (place it just before `apply_setting`, i.e. right before line 926's `def apply_setting`):

```python
    def _reload_settings(self):
        # Re-read uci and apply the live-appliable settings. Called from SIGHUP
        # (web-side config change) — brightness applies now; screen_timeout and
        # default_page are read where used, so a reload just refreshes settings.
        self.settings.load()
        if not self.blanked:
            self._set_brightness(self._brightness())
```

- [ ] **Step 4: Register the SIGHUP handler in `App.run()`**

In `App.run()`, the signal block (lines 1069–1071) becomes:

```python
        for s in (signal.SIGINT, signal.SIGTERM):
            signal.signal(s, lambda *_: self.stop.set())
        signal.signal(signal.SIGUSR1, lambda *_: self._toggle_req.set())   # long-press toggle
        self._reload_req = threading.Event()
        signal.signal(signal.SIGHUP, lambda *_: self._reload_req.set())    # web settings reload
```

- [ ] **Step 5: Consume the reload flag at the top of the loop**

In `App.run()`, extend the toggle-request block (lines 1078–1079) to also handle reload:

```python
                    if self._toggle_req.is_set():
                        self._toggle_req.clear(); self._do_toggle(); first = True
                    if self._reload_req.is_set():
                        self._reload_req.clear(); self._reload_settings(); first = True
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python3 test/test_lcd.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lcd/mudi.py test/test_lcd.py
git commit -m "feat(lcd): SIGHUP re-reads uci and applies brightness live (no restart)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Backend `get_lcd` / `set_lcd` RPC methods

Add the two RPC methods that the tab calls. `get_lcd` reports availability + service state + uci config; `set_lcd` validates a patch, writes uci `mudi`, toggles the procd services, and `SIGHUP`s the running renderer. No `uci` in the backend today — write it via the `uci` CLI (same interface `mudi.py`'s `Settings` uses). This project tests Lua on the device (verify.sh / on-box `dofile`), so the test here is an on-device `dofile` smoke run.

**Files:**
- Modify: `src/rpc/mudimodem` (add the LCD section before the final `return M` at line 1275)

**Interfaces:**
- Consumes: uci `mudi.main.*`; `/sys/class/graphics/fb0/virtual_size`; `/etc/init.d/{mudi,mudi-watch}`.
- Produces: `M.get_lcd(args)` and `M.set_lcd(args)` returning a snapshot table `{available, enabled, running, brightness, screen_timeout, default_page, error}`. `set_lcd` accepts a partial patch: `{enabled?:boolean, brightness?:int 20-120, screen_timeout?:int in {0,30,60,300,600,1200,3600}, default_page?:int 0-3}`.

- [ ] **Step 1: Add the LCD backend section**

In `src/rpc/mudimodem`, immediately before the final `return M` (line 1275), insert:

```lua
-- ---- LCD front-panel (MudiUI) --------------------------------------------
-- Toggles the mudi/mudi-watch procd services and mirrors config into uci
-- 'mudi' (section 'main') — the same store mudi.py's Settings reads. No ubus.
-- Written via the uci CLI (backend has no uci binding); config knobs also
-- SIGHUP the running renderer so brightness/timeout apply without a restart.

local LCD_TIMEOUTS = { [0]=true, [30]=true, [60]=true, [300]=true,
                       [600]=true, [1200]=true, [3600]=true }

local function lcd_available()
  -- The Mudi front panel is a 240x320 framebuffer; headless GL boxes lack it.
  local f = io.open("/sys/class/graphics/fb0/virtual_size", "r")
  if not f then return false end
  local g = f:read("*l") or ""
  f:close()
  return g == "240,320"
end

local function uci_get(key)                     -- key like "mudi.main.brightness"
  local f = io.popen("uci -q get " .. key .. " 2>/dev/null")
  if not f then return nil end
  local v = f:read("*l")
  f:close()
  return v
end

local function shell_ok(cmd)
  local r = os.execute(cmd)
  return r == 0 or r == true                    -- Lua 5.1 int vs 5.2+ boolean
end

local function lcd_running()
  return shell_ok("pgrep -f /usr/bin/mudi.py >/dev/null 2>&1")
end

local function lcd_enabled()
  -- procd 'enabled' == an rc.d start symlink exists for the mudi service. The
  -- glob ends in 'mudi', so it never matches S98mudi-watch.
  return shell_ok("ls /etc/rc.d/S*mudi >/dev/null 2>&1")
end

local function snapshot_lcd()
  local out = { available = false, enabled = false, running = false,
                brightness = 90, screen_timeout = 600, default_page = 0,
                error = nil }
  if not lcd_available() then
    out.error = "no front panel on this device"
    return out
  end
  out.available = true
  out.enabled = lcd_enabled()
  out.running = lcd_running()
  out.brightness = tonumber(uci_get("mudi.main.brightness")) or 90
  out.screen_timeout = tonumber(uci_get("mudi.main.screen_timeout")) or 600
  out.default_page = tonumber(uci_get("mudi.main.default_page")) or 0
  return out
end

local function uci_set_main(key, val)
  -- ensure the section exists, set the option, commit. val is a validated
  -- integer, so string-building it is shell-safe.
  os.execute("uci -q get mudi.main >/dev/null 2>&1 || uci set mudi.main=settings")
  os.execute("uci set mudi.main." .. key .. "='" .. tostring(val) .. "'; uci commit mudi")
end

function M.get_lcd(args)
  return snapshot_lcd()
end

function M.set_lcd(args)
  args = args or {}
  if not lcd_available() then
    return snapshot_lcd()
  end

  local b = tonumber(args.brightness)
  if b and b == math.floor(b) and b >= 20 and b <= 120 then
    uci_set_main("brightness", b)
  end
  local st = tonumber(args.screen_timeout)
  if st and LCD_TIMEOUTS[st] then
    uci_set_main("screen_timeout", st)
  end
  local dp = tonumber(args.default_page)
  if dp and dp == math.floor(dp) and dp >= 0 and dp <= 3 then
    uci_set_main("default_page", dp)
  end

  -- Nudge a running renderer to re-read uci (brightness/timeout live).
  os.execute("pkill -HUP -f /usr/bin/mudi.py >/dev/null 2>&1")

  if type(args.enabled) == "boolean" then
    uci_set_main("start_on_boot", args.enabled and 1 or 0)
    if args.enabled then
      os.execute("/etc/init.d/mudi enable 2>/dev/null; /etc/init.d/mudi-watch enable 2>/dev/null")
      os.execute("/etc/init.d/mudi-watch start 2>/dev/null; /etc/init.d/mudi start 2>/dev/null")
    else
      os.execute("/etc/init.d/mudi stop 2>/dev/null; /etc/init.d/mudi-watch stop 2>/dev/null")
      os.execute("/etc/init.d/mudi disable 2>/dev/null; /etc/init.d/mudi-watch disable 2>/dev/null")
    end
  end

  return snapshot_lcd()
end
```

Note: `set_lcd`'s params are all numbers/boolean, so the oui default arg-validator (which only pattern-matches *string* params) accepts them — **no `src/validator/mudimodem.lua` entry is needed** (same as `set_battlimit`, which is absent from that table).

- [ ] **Step 2: On-device dofile smoke test (write the check script)**

Create a throwaway test script locally, then run it on the box (per CLAUDE.md: never inline Lua into `ssh '...'`). Write `/tmp/claude-1000/lcd_smoke.lua`:

```lua
-- Load the plugin under the device's nginx-lua env and exercise get_lcd/set_lcd.
local M = dofile("/usr/lib/oui-httpd/rpc/mudimodem")
local g = M.get_lcd({})
assert(type(g) == "table", "get_lcd must return a table")
assert(g.available == true, "device has a front panel; available must be true")
assert(type(g.brightness) == "number", "brightness is a number")
-- set_lcd with a benign config-only patch (no enable) must round-trip.
local s = M.set_lcd({ default_page = g.default_page })
assert(type(s) == "table" and s.available == true, "set_lcd returns a snapshot")
print("LCD backend smoke OK: enabled=" .. tostring(g.enabled) ..
      " running=" .. tostring(g.running))
```

- [ ] **Step 3: Deploy the backend and run the smoke test on the device**

Run (deploys the plugin + restarts nginx so the new methods register, then runs the smoke):

```bash
./tools/deploy.sh
ssh root@mudi 'cat > /tmp/lcd_smoke.lua' < /tmp/claude-1000/lcd_smoke.lua
ssh root@mudi 'lua /tmp/lcd_smoke.lua; rm -f /tmp/lcd_smoke.lua'
```

Expected: prints `LCD backend smoke OK: enabled=... running=...` and exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/rpc/mudimodem
git commit -m "feat(lcd): get_lcd/set_lcd backend — toggle mudi services, mirror uci

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend "LCD Display" tab

Add the in-page tab, mirroring the Config/battery-limit card pattern. Fully local-testable via `test/chunk.test.js`.

**Files:**
- Modify: `src/views/mudimodem.js` (data() ~line 104; watch `tab(t)` lines 274–284; methods — add `fetchLcd`/`applyLcd`/`renderLcd`; TABS line 2131–2132; panel dispatch lines 2168–2182)
- Modify: `test/chunk.test.js`

**Interfaces:**
- Consumes: `mudimodem.get_lcd` / `mudimodem.set_lcd` (Task 6) via `window.$rpcRequest("call", ["sid","mudimodem",...])`; snapshot shape `{available, enabled, running, brightness, screen_timeout, default_page, error}`.
- Produces: tab key `"lcd"`, methods `fetchLcd()`, `applyLcd(patch)`, `renderLcd(h)`; state `lcd`, `lcdBusy`, `lcdErr`, `lcdBrightnessDraft`.

- [ ] **Step 1: Write the failing tests**

Append to `test/chunk.test.js` (before the final line):

```js
// ---------------------------------------------------------------------------
// LCD Display tab (MudiUI front panel)
// ---------------------------------------------------------------------------

const LCD_OFF = { available: true, enabled: false, running: false,
  brightness: 90, screen_timeout: 600, default_page: 0, error: null };
const LCD_ON = { available: true, enabled: true, running: true,
  brightness: 80, screen_timeout: 300, default_page: 1, error: null };
const LCD_NA = { available: false, enabled: false, running: false,
  brightness: 90, screen_timeout: 600, default_page: 0, error: "no front panel on this device" };

test('LCD Display tab appears in the tab bar', () => {
  const c = loadChunk();
  const vm = makeVm(c, LIVE);
  const labels = walk(c.render.call(vm, h))
    .filter((n) => n.data.staticClass && /\bmm-tab\b/.test(n.data.staticClass))
    .map(textOf);
  assert.ok(labels.includes('LCD Display'), 'LCD Display tab rendered');
});

test('lcd tab: null snapshot shows Loading, no controls', () => {
  const c = loadChunk();
  const vm = makeVm(c, LIVE);
  vm.tab = 'lcd';
  vm.lcd = null;
  const txt = textOf(vm.renderLcd(h));
  assert.match(txt, /LCD Display/, 'card title present');
  assert.match(txt, /Loading/, 'loading placeholder');
});

test('lcd tab: unavailable hardware shows a static note, no checkbox', () => {
  const c = loadChunk();
  const vm = makeVm(c, LIVE);
  vm.tab = 'lcd';
  vm.lcd = Object.assign({}, LCD_NA);
  const txt = textOf(vm.renderLcd(h));
  assert.match(txt, /not available/i, 'unavailability note');
  assert.doesNotMatch(txt, /Show status on the front LCD/, 'no enable toggle');
});

test('lcd tab: enabled renders controls + Running status', () => {
  const c = loadChunk();
  const vm = makeVm(c, LIVE);
  vm.tab = 'lcd';
  vm.lcd = Object.assign({}, LCD_ON);
  vm.lcdBrightnessDraft = 80;
  const nodes = walk(vm.renderLcd(h));
  const txt = textOf(nodes);
  assert.match(txt, /Show status on the front LCD/, 'enable label');
  assert.match(txt, /Brightness/, 'brightness row');
  assert.match(txt, /Screen timeout/, 'timeout row');
  assert.match(txt, /Default page/, 'default page row');
  assert.match(txt, /Running/, 'status Running');
  // knobs enabled when lc.enabled
  const num = nodes.find((n) => n.tag === 'input' && (n.data.attrs || {}).type === 'number');
  assert.ok(num && !num.data.attrs.disabled, 'brightness input enabled when on');
});

test('lcd tab: disabled greys the knobs but keeps the checkbox', () => {
  const c = loadChunk();
  const vm = makeVm(c, LIVE);
  vm.tab = 'lcd';
  vm.lcd = Object.assign({}, LCD_OFF);
  const nodes = walk(vm.renderLcd(h));
  const cb = nodes.find((n) => n.tag === 'input' && (n.data.attrs || {}).type === 'checkbox');
  assert.ok(cb && !cb.data.attrs.disabled, 'enable checkbox stays clickable');
  const num = nodes.find((n) => n.tag === 'input' && (n.data.attrs || {}).type === 'number');
  assert.ok(num && num.data.attrs.disabled, 'brightness disabled while off');
  assert.match(textOf(nodes), /Stopped/, 'status Stopped');
});

test('fetchLcd calls get_lcd and seeds the brightness draft', async () => {
  const calls = stubRpc([Object.assign({}, LCD_ON)]);
  try {
    const vm = makeVm(loadChunk(), LIVE);
    await vm.fetchLcd();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ['sid', 'mudimodem', 'get_lcd', {}]);
    assert.equal(vm.lcd.enabled, true);
    assert.equal(vm.lcdBrightnessDraft, 80);
  } finally { unstubRpc(); }
});

test('applyLcd posts set_lcd with the patch and stores the fresh snapshot', async () => {
  const calls = stubRpc([Object.assign({}, LCD_ON)]);
  try {
    const vm = makeVm(loadChunk(), LIVE);
    vm.lcd = Object.assign({}, LCD_OFF);
    await vm.applyLcd({ enabled: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params[2], 'set_lcd');
    assert.deepEqual(calls[0].params[3], { enabled: true });
    assert.equal(vm.lcd.enabled, true);
    assert.equal(vm.lcdBusy, false);
  } finally { unstubRpc(); }
});

test('opening the lcd tab fetches get_lcd', async () => {
  const calls = stubRpc([Object.assign({}, LCD_OFF)]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, LIVE);
    c.watch.tab.call(vm, 'lcd');
    await Promise.resolve(); await Promise.resolve();
    const lcdCalls = calls.filter((x) => x.params[2] === 'get_lcd');
    assert.equal(lcdCalls.length, 1, 'get_lcd called on tab open');
  } finally { unstubRpc(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/chunk.test.js`
Expected: FAIL — no `lcd` tab, no `renderLcd`/`fetchLcd`/`applyLcd`.

- [ ] **Step 3: Add LCD state to `data()`**

In `src/views/mudimodem.js`, after the battLimit state fields (after line 104), add:

```js
      // LCD Display / MudiUI front panel (get_lcd / set_lcd)
      lcd: null,
      lcdBusy: false,
      lcdErr: "",
      lcdBrightnessDraft: 90,
```

- [ ] **Step 4: Fetch on tab open**

In the `tab(t)` watcher (lines 274–284), add before the closing `}`:

```js
      if (t === "lcd") this.fetchLcd();
```

- [ ] **Step 5: Add `fetchLcd` and `applyLcd` methods**

In `methods:`, immediately after `applyBattLimit` (after line 721), add:

```js
    fetchLcd() {
      var self = this;
      if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
      return window.$rpcRequest("call", ["sid", "mudimodem", "get_lcd", {}], { timeout: 8000 })
        .then(function (r) {
          self.lcd = r || null;
          if (r && typeof r.brightness === "number") self.lcdBrightnessDraft = r.brightness;
          self.lcdErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.lcdErr = (e && (e.message || e.type)) || "request failed";
        });
    },
    applyLcd(patch) {
      var self = this;
      if (this.lcdBusy || typeof window === "undefined" || !window.$rpcRequest) return;
      this.lcdBusy = true;
      this.lcdErr = "";
      return window.$rpcRequest("call", ["sid", "mudimodem", "set_lcd", patch || {}], { timeout: 15000 })
        .then(function (r) {
          self.lcdBusy = false;
          if (r && typeof r.available === "boolean") {
            self.lcd = r;
            if (typeof r.brightness === "number") self.lcdBrightnessDraft = r.brightness;
          }
          self.lcdErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.lcdBusy = false;
          self.lcdErr = (e && (e.message || e.type)) || "request failed";
        });
    },
```

- [ ] **Step 6: Add the `renderLcd` method**

In `methods:`, immediately after `renderConfig` (after line 900), add:

```js
    renderLcd(h) {
      var self = this;
      var row = function (label, value) {
        return h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, label),
          h("span", { staticClass: "mm-v" }, value || "—")
        ]);
      };
      var lc = this.lcd;
      var kids = [h("div", { staticClass: "mm-card-h" }, "LCD Display (front panel)")];
      if (!lc) {
        kids.push(h("div", { staticClass: "mm-note" }, this.lcdErr || "Loading…"));
      } else if (lc.available === false) {
        kids.push(h("div", { staticClass: "mm-note" }, "Front panel not available on this device."));
        if (this.lcdErr) kids.push(h("div", { staticClass: "mm-note" }, this.lcdErr));
      } else {
        kids.push(h("div", { staticClass: "mm-kv" }, [
          h("label", { staticClass: "mm-k" }, [
            h("input", {
              attrs: { type: "checkbox", disabled: !!self.lcdBusy },
              domProps: { checked: !!lc.enabled },
              on: { change: function (e) {
                self.applyLcd({ enabled: !!(e.target && e.target.checked) });
              } }
            }),
            " Show status on the front LCD"
          ])
        ]));
        kids.push(h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, "Brightness"),
          h("span", { staticClass: "mm-v" }, [
            h("input", {
              attrs: { type: "number", min: 20, max: 120, step: 1,
                       disabled: !lc.enabled || !!self.lcdBusy },
              domProps: { value: self.lcdBrightnessDraft },
              on: {
                input: function (e) { self.lcdBrightnessDraft = Number(e.target && e.target.value); },
                change: function () { self.applyLcd({ brightness: self.lcdBrightnessDraft }); }
              }
            })
          ])
        ]));
        var TO = [["30", "30s"], ["60", "1m"], ["300", "5m"], ["600", "10m"],
                  ["1200", "20m"], ["3600", "60m"], ["0", "Never"]];
        kids.push(h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, "Screen timeout"),
          h("span", { staticClass: "mm-v" }, [
            h("select", {
              attrs: { disabled: !lc.enabled || !!self.lcdBusy },
              on: { change: function (e) { self.applyLcd({ screen_timeout: Number(e.target.value) }); } }
            }, TO.map(function (o) {
              return h("option",
                { attrs: { value: o[0], selected: String(lc.screen_timeout) === o[0] } }, o[1]);
            }))
          ])
        ]));
        var PG = [["0", "Signal"], ["1", "WiFi"], ["2", "System"], ["3", "Ethernet"]];
        kids.push(h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, "Default page"),
          h("span", { staticClass: "mm-v" }, [
            h("select", {
              attrs: { disabled: !lc.enabled || !!self.lcdBusy },
              on: { change: function (e) { self.applyLcd({ default_page: Number(e.target.value) }); } }
            }, PG.map(function (o) {
              return h("option",
                { attrs: { value: o[0], selected: String(lc.default_page) === o[0] } }, o[1]);
            }))
          ])
        ]));
        kids.push(row("Status", lc.running ? "Running" : "Stopped"));
        kids.push(h("div", { staticClass: "mm-note" },
          "Enabling takes over the front panel from GL's stock screen. Long-press the panel (~1.6s) to toggle back."));
        if (this.lcdErr) kids.push(h("div", { staticClass: "mm-note" }, this.lcdErr));
      }
      return h("div", {}, [h("div", { staticClass: "mm-card" }, kids)]);
    },
```

- [ ] **Step 7: Add the tab entry and panel dispatch**

Add `["lcd", "LCD Display"]` to the `TABS` array (line 2131–2132), after `["config", "Config"]`:

```js
    var TABS = [["tracking", "Tracking"], ["sim", "SIM"], ["lock", "Cell lock"],
      ["bands", "Bands"], ["at", "AT console"], ["speedtest", "Speedtest"],
      ["config", "Config"], ["lcd", "LCD Display"]];
```

In the panel dispatch, add a branch before the final `else` (before line 2180):

```js
    } else if (this.tab === "lcd") {
      panel = this.renderLcd(h);
    } else {
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test test/chunk.test.js`
Expected: PASS (new LCD tests + the entire existing chunk suite still green).

- [ ] **Step 9: Commit**

```bash
git add src/views/mudimodem.js test/chunk.test.js
git commit -m "feat(lcd): LCD Display tab — enable + brightness/timeout/default-page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Installer + uninstaller wiring

Install the LCD files (disabled by default), register them in `/etc/sysupgrade.conf`, install the renderer's python deps, and mirror removal in `uninstall.sh`.

**Files:**
- Modify: `install.sh` (add an LCD block after the collector block; extend the sysupgrade list)
- Modify: `uninstall.sh` (stop/disable services + hand panel back; extend FILES)
- Create: `test/test_install_wiring.sh`

**Interfaces:**
- Consumes: `src/lcd/*` (Task 1). Produces: `/usr/bin/mudi.py`, `/usr/bin/mudi-watch.py`, `/etc/init.d/mudi`, `/etc/init.d/mudi-watch`, `/etc/config/mudi` on the device; the four program/init files registered in sysupgrade.conf.

- [ ] **Step 1: Write the failing wiring test**

Create `test/test_install_wiring.sh`:

```sh
#!/bin/sh
# Static assertions on install.sh / uninstall.sh LCD wiring. No device needed.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $1" >&2; exit 1; }

grep -q 'src/lcd/mudi.py' install.sh            || fail "install.sh does not deploy mudi.py"
grep -q 'src/lcd/mudi-watch.py' install.sh      || fail "install.sh does not deploy mudi-watch.py"
grep -q 'src/lcd/mudi.init' install.sh          || fail "install.sh does not deploy mudi.init"
grep -q 'src/lcd/mudi-watch.init' install.sh    || fail "install.sh does not deploy mudi-watch.init"
grep -q 'src/lcd/mudi.config' install.sh        || fail "install.sh does not seed mudi.config"
# default OFF: installer must NOT enable/start the mudi service
grep -q '/etc/init.d/mudi enable' install.sh    && fail "install.sh must NOT enable mudi (default off)"
grep -q '/etc/init.d/mudi start'  install.sh    && fail "install.sh must NOT start mudi (default off)"
# sysupgrade registration of the four LCD files
for p in /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/init.d/mudi /etc/init.d/mudi-watch; do
  grep -q "$p" install.sh || fail "install.sh missing sysupgrade entry: $p"
done
# uninstall hands the panel back and removes the files
grep -q '/etc/init.d/gl_screen start' uninstall.sh || fail "uninstall.sh must restore gl_screen"
grep -q '/usr/bin/mudi.py' uninstall.sh            || fail "uninstall.sh must remove mudi.py"
grep -q '/etc/config/mudi' uninstall.sh            && fail "uninstall.sh must NOT delete user config /etc/config/mudi"
echo "install wiring OK"
```

Make it executable: `chmod +x test/test_install_wiring.sh`

- [ ] **Step 2: Run it to verify it fails**

Run: `sh test/test_install_wiring.sh`
Expected: FAIL — install.sh has no LCD block yet.

- [ ] **Step 3: Add the LCD block to `install.sh`**

In `install.sh`, after the battery-charge-limit block (after line 85, before the sysupgrade registration at line 87), insert:

```sh
echo "installing LCD front-panel renderer (MudiUI):"
cp_install src/lcd/mudi.py         /usr/bin/mudi.py         0755
cp_install src/lcd/mudi-watch.py   /usr/bin/mudi-watch.py   0755
cp_install src/lcd/mudi.init       /etc/init.d/mudi         0755
cp_install src/lcd/mudi-watch.init /etc/init.d/mudi-watch   0755
# default settings only if absent — never clobber user LCD config on upgrade
if [ ! -f /etc/config/mudi ]; then
  cp_install src/lcd/mudi.config   /etc/config/mudi         0644
fi
# renderer python deps: install only what's missing; pillow --nodeps avoids the
# libfreetype clash with gl-sdk4-screen-large. Offline-tolerant.
LCD_DEPS="python3-light python3-numpy python3-urllib python3-logging python3-ctypes python3-cffi python3-evdev"
lcd_missing=""
for p in $LCD_DEPS; do
  opkg list-installed 2>/dev/null | grep -q "^$p " || lcd_missing="$lcd_missing $p"
done
opkg list-installed 2>/dev/null | grep -q "^python3-pillow " || lcd_missing="$lcd_missing python3-pillow"
if [ -n "$lcd_missing" ]; then
  opkg update 2>/dev/null || true
  for p in $lcd_missing; do
    if [ "$p" = python3-pillow ]; then
      opkg install --nodeps python3-pillow || true
    else
      opkg install "$p" || true
    fi
  done
fi
# DEFAULT OFF: the renderer seizes /dev/fb0 from gl_screen. It is enabled only
# from the admin "LCD Display" tab — do NOT enable or start it here.
echo "  LCD renderer installed (disabled by default — enable from the LCD Display tab)"
```

- [ ] **Step 4: Extend the sysupgrade list in `install.sh`**

In the `for p in \` registration list (lines 90–110), add the four LCD program/init files (e.g. after `/etc/init.d/glbattlimit`). `/etc/config/mudi` is already covered by the default `/etc/config/*` backup, so it is intentionally omitted:

```sh
  /usr/bin/mudi.py \
  /usr/bin/mudi-watch.py \
  /etc/init.d/mudi \
  /etc/init.d/mudi-watch \
```

- [ ] **Step 5: Add the LCD teardown + FILES entries to `uninstall.sh`**

In `uninstall.sh`, add these paths to the `FILES` list (lines 17–35), after the battlimit entries (do **not** add `/etc/config/mudi` — it's user data):

```
/usr/bin/mudi.py
/usr/bin/mudi-watch.py
/etc/init.d/mudi
/etc/init.d/mudi-watch
```

And add a teardown block before the `echo "removing files:"` line (before line 53):

```sh
# Stop + disable the LCD renderer and hand the front panel back to gl_screen
# BEFORE removing its files. Leave /etc/config/mudi (user settings) in place.
if [ -x /etc/init.d/mudi ]; then
  /etc/init.d/mudi stop    2>/dev/null || true
  /etc/init.d/mudi disable 2>/dev/null || true
fi
if [ -x /etc/init.d/mudi-watch ]; then
  /etc/init.d/mudi-watch stop    2>/dev/null || true
  /etc/init.d/mudi-watch disable 2>/dev/null || true
fi
/etc/init.d/gl_screen start 2>/dev/null || true
echo "LCD renderer stopped; front panel returned to gl_screen"
```

- [ ] **Step 6: Run the wiring test to verify it passes**

Run: `sh test/test_install_wiring.sh`
Expected: `install wiring OK`.

- [ ] **Step 7: Commit**

```bash
git add install.sh uninstall.sh test/test_install_wiring.sh
git commit -m "feat(lcd): install/uninstall the renderer (default off) + sysupgrade

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: verify.sh — on-device assertions

Extend the device verifier: LCD files present + sysupgrade-registered; collectd socket + latest.json live; `get_lcd` survives a `/rpc` round-trip.

**Files:**
- Modify: `tools/verify.sh` (add steps after the existing battlimit/collector checks)

**Interfaces:**
- Consumes: everything installed by Task 8 + collectd from Task 3 + backend from Task 6.

- [ ] **Step 1: Add the LCD-files + socket + sysupgrade checks**

Append near the end of `tools/verify.sh` (after the last existing numbered check, before any final "all good" echo). Use the file's existing `fail()` + `ssh -o BatchMode=yes "root@$HOST"` pattern:

```sh
echo "12. LCD renderer files installed"
ssh -o BatchMode=yes "root@$HOST" \
  '[ -f /usr/bin/mudi.py ] && [ -f /usr/bin/mudi-watch.py ] && [ -f /etc/init.d/mudi ] && [ -f /etc/init.d/mudi-watch ]' \
  || fail "LCD renderer files missing"

echo "12b. LCD files registered in sysupgrade.conf"
ssh -o BatchMode=yes "root@$HOST" 'for p in \
    /usr/bin/mudi.py \
    /usr/bin/mudi-watch.py \
    /etc/init.d/mudi \
    /etc/init.d/mudi-watch; do
    grep -qxF "$p" /etc/sysupgrade.conf || { echo "missing: $p"; exit 1; }
  done' \
  || fail "LCD files not in sysupgrade.conf"

echo "13. collectd broadcast socket + latest.json are live"
ssh -o BatchMode=yes "root@$HOST" \
  '[ -S /tmp/mudimodem/collectd.sock ] && [ -f /tmp/mudimodem/latest.json ] && python3 -c "import json,sys; json.load(open(\"/tmp/mudimodem/latest.json\"))"' \
  || fail "collectd socket or latest.json missing/invalid (is the collector on the new build?)"
```

- [ ] **Step 2: Add the `get_lcd` /rpc round-trip (behind MM_PW)**

Add, mirroring step 9b's login+call pattern:

```sh
if [ -n "${MM_PW:-}" ]; then
  echo "13b. get_lcd survives the /rpc validator and returns availability"
  SID=$(ssh -o BatchMode=yes "root@$HOST" \
    'curl -sk -X POST https://127.0.0.1/rpc -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"login\",\"params\":{\"username\":\"root\",\"password\":\"'"$MM_PW"'\"}}" \
     | sed -n "s/.*\"sid\":\"\([^\"]*\)\".*/\1/p"')
  [ -n "$SID" ] || fail "login for /rpc round-trip failed (is MM_PW correct?)"
  RESP=$(ssh -o BatchMode=yes "root@$HOST" \
    'curl -sk -X POST https://127.0.0.1/rpc -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"call\",\"params\":[\"'"$SID"'\",\"mudimodem\",\"get_lcd\",{}]}"')
  printf '%s' "$RESP" | grep -q -- '-32602' \
    && fail "get_lcd was rejected by the arg validator (-32602): $RESP"
  printf '%s' "$RESP" | grep -q '"available"' \
    || fail "get_lcd did not return an availability snapshot (got: $RESP)"
  echo "   get_lcd round-trip OK"
else
  echo "13b. SKIPPED — set MM_PW=<admin-password> to run the get_lcd /rpc round-trip"
fi
```

- [ ] **Step 3: Deploy and run the full verifier on the device**

Run:

```bash
./tools/deploy.sh
MM_PW='<admin-password>' ./tools/verify.sh
```

Expected: every numbered check prints and none `FAIL`s; step 13/13b confirm the socket, latest.json, and `get_lcd`.

- [ ] **Step 4: Commit**

```bash
git add tools/verify.sh
git commit -m "test(lcd): verify.sh checks LCD files, collectd socket, get_lcd /rpc

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Docs, version bump, full test sweep

Record the merge in CLAUDE.md, cross-link the spec/plan, bump the version, and run every local suite once more.

**Files:**
- Modify: `CLAUDE.md` (§5 files table, §10 build-phases table, §11 repo layout, §12 status)
- Modify: `version.json`

- [ ] **Step 1: Update CLAUDE.md**

- In the §5 "files we ship" table, add rows for `/usr/bin/mudi.py`, `/usr/bin/mudi-watch.py`, `/etc/init.d/mudi`, `/etc/init.d/mudi-watch`, `/etc/config/mudi` (the LCD renderer; default off).
- In §11 repo layout, add `src/lcd/` (the vendored MudiUI renderer) and note `test/test_lcd.py` + `test/test_collectd.py`.
- In §10 build phases, add a row: **LCD Display tab + consolidated modem reads — done 2026-07-24 — MudiUI folded into src/lcd/; collectd is the single reader pushing over a Unix socket; new get_lcd/set_lcd backend; SIGHUP live-reload.**
- In §12 status, add a bullet describing the consolidation (collectd 4s + broadcast socket + latest.json; CellularSource is a socket subscriber; LCD default off) and cross-link `docs/superpowers/specs/2026-07-24-merge-mudiui-lcd-tab-design.md` + `docs/superpowers/plans/2026-07-24-merge-mudiui-lcd-tab.md`.

- [ ] **Step 2: Bump the version**

Edit `version.json`:

```json
{"version": "1.1.0"}
```

- [ ] **Step 3: Run every local suite**

```bash
cd /home/kevin/MudiModem
node --test test/chunk.test.js
python3 test/test_collectd.py -v
python3 test/test_lcd.py -v
sh test/test_install_wiring.sh
```

Expected: all four green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md version.json
git commit -m "docs(lcd): record MudiUI merge; bump to 1.1.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Repo layout (spec §1) → Task 1 (relocate to `src/lcd/`), Task 8 (installer).
- collectd single reader: 4s cadence + retention (spec §2a) → Task 2; broadcast socket + latest.json (spec §2b) → Task 3; CellularSource rewrite, deletes ubus/AT reads (spec §2c) → Task 4. Non-modem MudiUI sources untouched (verified: Tasks 4/5 touch only `CellularSource` + `_reload_settings`).
- LCD tab (spec §3): frontend → Task 7; backend `get_lcd`/`set_lcd` → Task 6; SIGHUP live-reload → Task 5. Validator: confirmed no entry needed (numbers/boolean only) — noted in Task 6.
- Install/uninstall/guards/default-off (spec §4) → Task 8; sysupgrade → Tasks 8/9.
- Testing (spec §5): chunk eval + lcd tab → Task 7; collectd broadcast + file → Task 3; CellularSource mapping → Task 4; `/rpc` round-trip → Task 9; on-device dofile → Task 6.
- Out of scope (spec §6): band-lock/net-mode stay off the web tab (Task 7 exposes only enable+brightness+timeout+default-page); WiFi/battery/eth reads untouched; no git-history import (Task 1 copies files only). ✔

**Placeholder scan:** No TBD/TODO; every code step carries complete code; every test step shows the assertion and the expected pass/fail. ✔

**Type/name consistency:** snapshot shape `{available, enabled, running, brightness, screen_timeout, default_page, error}` is identical across Task 6 (backend), Task 7 (frontend fixtures + fetch/apply), and Task 9 (round-trip asserts `available`). Bus keys emitted in Task 4 match `CellularSource.provides` verbatim from the vendored source. `Broadcaster`/`write_latest` defined in Task 3 are consumed by name in Task 4 (socket path) and Task 9 (socket + latest.json). RPC method names `get_lcd`/`set_lcd` consistent across Tasks 6/7/9. ✔
