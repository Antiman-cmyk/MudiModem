#!/usr/bin/env python3
"""The collector end to end against an emulated GL 4.10 bus: the image's own ubusd + ubus CLI and a
fake cellular stack (test/emu/fake-gl.lua under the image's eco), all via qemu. Nothing is mocked
inside the collector: it forks the real `ubus` exactly as on the box.

Asserts the contract the page and the eco daemon that replaces this collector both rely on:
  * one `cellular.network cell_info {bus:"cpu", slot:<active>}` per tick, never anything else;
  * a FAILED read skips the tick (no line, no push), "no service" is an honest sample;
  * samples.jsonl / latest.json / the `mudimodem.collect` push carry cellular_compat's sample
    (the push as GL's gl-session delivers it: null keys dropped, [] -> {});
  * carrier identity (`cellular.network info`) is read once, not per tick;
  * no browser attached (has_ws false) -> no push at all.
Skips when the firmware rootfs or qemu is absent (tools/emu.sh check)."""
import importlib.util, json, os, shutil, signal, subprocess, sys, tempfile, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(ROOT, "src", "lib"))
import cellular_compat as cc  # noqa: E402
spec = importlib.util.spec_from_file_location("ct", os.path.join(HERE, "collectd.test.py"))
ct = importlib.util.module_from_spec(spec); spec.loader.exec_module(ct)

BUS_SH = os.path.join(HERE, "emu", "gl-bus.sh")
COLLECTD = os.path.join(ROOT, "src", "sbin", "mudimodem-collectd")
CELLS = [ct.CELL_INFO_410_SA, ct.CELL_INFO_410_NSA_CA, {"fail": True}, ct.CELL_INFO_410_NO_SERVICE]


def emu_ok():
    return subprocess.run([os.path.join(ROOT, "tools", "emu.sh"), "check"],
                          capture_output=True).returncode == 0


def jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(x) for x in f if x.strip()]


def strip_t(s):
    return {k: v for k, v in s.items() if k != "t"}


def wire(v):
    """What a browser receives for `ubus call gl-session notify {name, data:v}`: GL's handler
    (usr/sbin/gl-ngx-session, notify) cjson-encodes the eco.ubus-decoded message, so every JSON
    null key is gone and an empty array arrives as {} (docs/cellular-api-4.10.md, gl-session)."""
    if isinstance(v, dict):
        return {k: wire(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [wire(x) for x in v] if v else {}
    return v


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu (tools/emu.sh check)")
class CollectorOnEmulatedBus(unittest.TestCase):
    def run_collector(self, scen, ticks):
        d = tempfile.mkdtemp(prefix="mm-emu-")
        self.addCleanup(shutil.rmtree, d, True)
        bus = os.path.join(d, "bus"); hist = os.path.join(d, "hist")
        os.makedirs(bus); os.makedirs(hist)
        with open(os.path.join(bus, "scen.json"), "w") as f:
            json.dump(scen, f)
        subprocess.run(["sh", BUS_SH, "start", bus, os.path.join(bus, "scen.json")], check=True)
        self.addCleanup(subprocess.run, ["sh", BUS_SH, "stop", bus])
        env = dict(os.environ, PATH=os.path.join(bus, "bin") + os.pathsep + os.environ["PATH"],
                   MUDIMODEM_POLL="0.2", MUDIMODEM_HIST=hist,
                   MUDIMODEM_HISTORY_PERSIST=os.path.join(d, "persist"),
                   MUDIMODEM_HISTORY_CFG=os.path.join(d, "no-history.json"),
                   MUDIMODEM_BATT_SYSFS=os.path.join(d, "no-sysfs"),
                   MUDIMODEM_BATTLIMIT_PIDF=os.path.join(d, "no.pid"),
                   MUDIMODEM_BATTLIMIT_LIMF=os.path.join(d, "no.limit"))
        env.pop("MUDIMODEM_NO_WS_PUSH", None)
        p = subprocess.Popen([sys.executable, COLLECTD], env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        calls = os.path.join(bus, "calls.jsonl")
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            n = sum(1 for c in jsonl(calls) if c["method"] == "cell_info")
            if n >= ticks:
                break
            time.sleep(0.2)
        time.sleep(0.5)                       # let the last tick finish writing / pushing
        p.send_signal(signal.SIGTERM)
        _, err = p.communicate(timeout=20)
        return {"calls": jsonl(calls), "notify": jsonl(os.path.join(bus, "notify.jsonl")),
                "samples": jsonl(os.path.join(hist, "samples.jsonl")),
                "latest": jsonl(os.path.join(hist, "latest.json")), "stderr": err, "rc": p.returncode}

    def test_ticks_samples_and_pushes(self):
        scen = {"modem_status": ct.MODEM_STATUS_410_TWO, "network_info": ct.NETWORK_INFO_410,
                "cell_info": CELLS, "has_ws": True}
        r = self.run_collector(scen, ticks=len(CELLS))
        self.assertEqual(r["rc"], 0, r["stderr"])
        cells = [c for c in r["calls"] if c["method"] == "cell_info"]
        self.assertGreaterEqual(len(cells), len(CELLS))
        # the active slot of the built-in modem (not the USB one listed first), never sub_id
        for c in cells:
            self.assertEqual(c["args"], {"bus": "cpu", "slot": 1})
        statuses = [c for c in r["calls"] if c["object"] == "cellular.modem" and c["method"] == "status"]
        self.assertEqual(len(statuses), len(cells), "exactly one cell_info per tick")
        # nothing but the read path: no AT, no writes, no get_signals yet
        seen = {(c["object"], c["method"]) for c in r["calls"]}
        self.assertLessEqual(seen, {("cellular.modem", "status"), ("cellular.network", "cell_info"),
                                    ("cellular.network", "info")})
        self.assertEqual(sum(1 for c in r["calls"] if c["method"] == "info"), 1,
                         "carrier identity is cached, not read per tick")
        # samples follow the cell_info cycle; the failed read leaves no line
        want = []
        for i in range(len(cells)):
            cell = CELLS[i % len(CELLS)]
            if not cc.cell_info_failed(cell if not cell.get("fail") else None):
                want.append(strip_t(cc.build_sample(ct.MODEM_STATUS_410_TWO, cell, ct.NETWORK_INFO_410, t=0)))
        got = [strip_t(s) for s in r["samples"]]
        self.assertEqual(got, want[:len(got)])
        self.assertGreaterEqual(len(got), 3)
        self.assertTrue(any(not s["registered"] for s in got), "no service is a sample, not a skip")
        self.assertEqual(r["latest"][-1], r["samples"][-1])
        self.assertIn("cell_info read failed", r["stderr"])
        # every sample is pushed once on GL's bus under the page's global_sockets name — as the
        # wire delivers it (no null keys, an empty signals list as {}: the page guards both)
        frames = [n for n in r["notify"] if n.get("name") == "mudimodem.collect"]
        self.assertEqual([f["data"] for f in frames], [wire(s) for s in r["samples"]])
        self.assertIn({}, [f["data"]["signals"] for f in frames], "no-service frame reached the wire")
        self.assertEqual(len(r["notify"]), len(frames), "no battery frames without a fuel gauge")

    def test_no_browser_no_push(self):
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": False}
        r = self.run_collector(scen, ticks=3)
        self.assertEqual(r["rc"], 0, r["stderr"])
        self.assertGreaterEqual(len(r["samples"]), 3)
        self.assertEqual(r["notify"], [])


if __name__ == "__main__":
    unittest.main()
