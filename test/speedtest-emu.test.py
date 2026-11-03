#!/usr/bin/env python3
"""The speed test and its schedule in mudimodemd (src/lib/mudimodemd/speedtest.lua) under the
image's eco on the emulated GL bus, against a fake speed server on 127.0.0.1 (the "cellular"
interface is `lo` here). These are the end-to-end cases tools/mudimodem-speedtest.py and
mudimodem-speedtestd (python3) were tested with before R3 ⑤ retired them, plus the plugin's
start-then-poll path. Skips when the firmware rootfs or qemu is absent (mudi-emu check)."""
import http.server, json, os, shutil, signal, subprocess, sys, tempfile, threading, time, unittest
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import mudiemu  # noqa: E402  (tools/mudi-emu: the router's userland + a fake GL bus)
EMU = mudiemu.cmd("run")
DRIVER = os.path.join(HERE, "emu", "plugin-driver.lua")
DUMP_UP = {"interface": [{"interface": "modem_1_1_2_6", "proto": "rmnet", "up": True, "l3_device": "lo"},
                         {"interface": "modem_1_1_2", "proto": "rmnet", "up": True, "l3_device": "lo"},
                         {"interface": "wan", "proto": "dhcp", "up": True, "l3_device": "lo"}]}
DUMP_DOWN = {"interface": [{"interface": "modem_1_1_2", "proto": "rmnet", "up": False}]}
MODEM = {"modems": [{"bus": "cpu", "current_sim_slot": 1}]}
CELL = {"network_type": 5, "cell_id": "C1", "tac": "T1",
        "signal": [{"band": 78, "earfcn": 627264, "pci": 142, "rsrp": -94, "rsrq": -10, "sinr": 12}]}


def emu_ok():
    return shutil.which("lua5.1") is not None and mudiemu.ok()


def jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(x) for x in f if x.strip()]


class Speed(http.server.BaseHTTPRequestHandler):
    """Cloudflare's API (/__down?bytes=N, /__up) and LibreSpeed's (<dir>/garbage.php?ckSize=<MiB>,
    <dir>/empty.php). `down`: ok | fail (data requests only: a latency probe asks for 0 bytes) |
    slow (64 KiB every 0.1 s: a stream the time limit has to cut); `stall` s before any data."""
    mode = {"down": "ok", "stall": 0}
    seen = []

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path.endswith("/garbage.php"):
            n = int(q.get("ckSize", ["0"])[0]) * 1048576
        elif u.path.endswith("/empty.php"):
            n = 0
        else:
            n = int(q.get("bytes", ["0"])[0])
        self.seen.append(("GET", n, u.path))
        if n and self.mode["stall"]:
            time.sleep(self.mode["stall"])
        if n and self.mode["down"] == "fail":
            self.send_response(500); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Length", str(n)); self.end_headers()
        if n and self.mode["down"] == "slow":
            try:
                for _ in range(0, n, 65536):
                    self.wfile.write(b"\0" * 65536); self.wfile.flush(); time.sleep(0.1)
            except OSError:
                pass                              # curl's -m hung up: the point of the test
            return
        self.wfile.write(b"\0" * n)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(n)
        self.seen.append(("POST", n, urlparse(self.path).path))
        self.send_response(200); self.send_header("Content-Length", "0"); self.end_headers()

    def log_message(self, *a):
        pass


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu / lua5.1 (mudi-emu check)")
class SpeedTest(unittest.TestCase):
    def setUp(self):
        d = self.d = tempfile.mkdtemp(prefix="mm-st-")
        self.addCleanup(shutil.rmtree, d, True)
        Speed.mode = {"down": "ok", "stall": 0}
        Speed.seen = []
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Speed)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        base = self.base = "http://127.0.0.1:%d" % srv.server_address[1]
        self.bus = os.path.join(d, "bus")
        os.makedirs(self.bus); os.makedirs(os.path.join(d, "glc"))
        self.st = {k: os.path.join(d, k) for k in ("status.json", "hist.jsonl", "schedule.json", "latest.json")}
        self.env = dict(os.environ, MUDIMODEM_UBUS_SOCK=os.path.join(self.bus, "ubus.sock"),
                        MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"), MUDIMODEMD_COLLECTOR="0",
                        MUDIMODEM_ST_DOWN_URL=base + "/__down", MUDIMODEM_ST_UP_URL=base + "/__up",
                        MUDIMODEM_ST_DOWN_BYTES="200000", MUDIMODEM_ST_UP_BYTES="50000", MUDIMODEM_ST_LATENCY_N="3",
                        MUDIMODEM_ST_TIMEOUT="4", MUDIMODEM_ST_TIME_SCALE="0.4",
                        MUDIMODEM_ST_SETTINGS=os.path.join(d, "speedtest.json"), MUDIMODEM_ST_STATUS=self.st["status.json"],
                        MUDIMODEM_ST_HIST=self.st["hist.jsonl"], MUDIMODEM_ST_SCHEDULE=self.st["schedule.json"],
                        MUDIMODEM_LATEST=self.st["latest.json"], MUDIMODEM_HIST=os.path.join(d, "hist"),
                        # the plugin reads the same files under its own names
                        MUDIMODEM_SPEEDTEST_STATUS=self.st["status.json"], MUDIMODEM_SPEEDTEST_HIST=self.st["hist.jsonl"],
                        MM_PLUGIN=os.path.join(ROOT, "src", "rpc", "mudimodem"))

    def start(self, dump=DUMP_UP, cell=CELL, **extra):
        scen = {"modem_status": MODEM, "network_dump": dump, "cell_info": [cell], "network_info": {"networks": []},
                # GL's shapes, measured by running GL: sim info has no ambr_*, sim status has them
                "sim_info": {"sims": [{"slot": 1, "bus": "cpu", "iccid": "8901260000000000001", "mcc": "310", "mnc": "260"}]},
                "sim_status": {"sims": [{"slot": 2, "bus": "cpu", "ambr_dl": 999, "ambr_ul": 99},
                                        {"slot": 1, "bus": "cpu", "ambr_dl": "150", "ambr_ul": 50}]}}
        with open(os.path.join(self.bus, "scen.json"), "w") as f:
            json.dump(scen, f)
        mudiemu.bus("start", self.bus, os.path.join(self.bus, "scen.json"))
        self.addCleanup(mudiemu.bus, "stop", self.bus)
        p = subprocess.Popen([*EMU, "eco", os.path.join(ROOT, "src", "sbin", "mudimodemd")],
                             env=dict(self.env, **extra), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.send_signal(signal.SIGTERM), p.wait(timeout=20),
                                 p.stdout.close(), p.stderr.close()))
        for _ in range(100):
            if subprocess.run([self.ubus_bin(), "call", "mudimodem", "health"], capture_output=True).returncode == 0:
                self.daemon = p
                return p
            time.sleep(0.2)
        self.fail("mudimodemd never registered")

    def ubus_bin(self):
        return os.path.join(self.bus, "bin", "ubus")

    def call(self, m, a):
        out = subprocess.run([self.ubus_bin(), "call", "mudimodem", m, json.dumps(a)], capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def one_run(self, iface="cellular"):
        j = self.call("job_start", {"kind": "speedtest", "args": {"iface": iface, "trigger": "manual"}})
        while True:
            r = self.call("job_wait", {"id": j["id"], "wait": 20})
            if not r.get("pending"):
                return r

    def status(self):
        with open(self.st["status.json"]) as f:
            return json.load(f)

    def gl_calls(self, method):
        return [c for c in jsonl(os.path.join(self.bus, "calls.jsonl")) if c["method"] == method]

    def fresh_latest(self, t=None):
        with open(self.st["latest.json"], "w") as f:
            json.dump({"t": int((t or time.time()) * 1000), "slot": 1, "carrier": "X", "band": 3, "mode": "LTE",
                       "pcc_rat": "LTE", "cell_id": "AB", "rsrp": -80, "sinr": 9, "rsrq": -8, "pci": 7,
                       "tx_channel": 1700, "signals": []}, f)

    # ---- one test -----------------------------------------------------------------------------
    def test_happy_path_with_a_fresh_collector_sample(self):
        self.start()
        self.fresh_latest()
        r = self.one_run()
        self.assertEqual((r["trigger"], r["iface"]), ("manual", "cellular"), r)
        for k in ("down_mbps", "up_mbps", "latency_ms", "jitter_ms"):
            self.assertIsInstance(r[k], (int, float), k)
        self.assertEqual((r["band"], r["pcc_rat"], r["cell_id"]), (3, "LTE", "AB"), "snapshot from latest.json")
        self.assertNotIn("signals", r, "an empty list does not cross ubus (dropped like a null)")
        self.assertEqual((r["ambr_dl"], r["ambr_ul"]), (150, 50), "the ACTIVE SIM's carrier cap, as numbers")
        hist = jsonl(self.st["hist.jsonl"])
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0]["signals"], [], "the history line keeps an empty list a list")
        st = self.status()
        self.assertEqual((st["running"], st["phase"]), (False, "done"))
        self.assertEqual(st["pid"], self.call("health", {})["pid"], "the run is named by the daemon's pid")
        self.assertEqual(self.gl_calls("cell_info"), [], "a fresh sample means no AT-backed read")
        self.assertEqual([x[1] for x in Speed.seen if x[0] == "POST"], [50000, 50000],
                         "quick: two upload streams, their bytes streamed over stdin")
        self.assertEqual([x[1] for x in Speed.seen if x[0] == "GET"], [0, 0, 0, 200000, 200000],
                         "latency on the idle link first, then two download streams")
        self.assertEqual((r["profile"], r["streams"], r["server"]), ("quick", 2, "cloudflare"))
        self.assertEqual(r["measure_up"], "curl", "50 kB per stream: done inside the warm-up -> curl's totals")
        self.assertEqual(r["data_mb"], 0.5, "what the test cost: 2 x 200000 down + 2 x 50000 up")

    def test_a_stale_sample_costs_one_cell_info_and_wired_carries_no_radio(self):
        self.start()
        self.fresh_latest(t=time.time() - 120)
        r = self.one_run()
        self.assertEqual((r["band"], r["cell_id"], r["slot"]), (78, "C1", 1))
        self.assertEqual(len(self.gl_calls("cell_info")), 1)
        w = self.one_run("wired")
        self.assertNotIn("ambr_dl", w, "a wired result has no carrier cap")
        self.assertNotIn("band", w)
        self.assertNotIn("slot", w)
        self.assertEqual(len(self.gl_calls("cell_info")), 1, "a wired run reads nothing cellular")

    def test_failures_end_on_a_terminal_status(self):
        self.start(dump=DUMP_DOWN)
        self.assertEqual(self.one_run().get("error"), "cellular is not connected")
        self.assertEqual((self.status()["running"], self.status()["phase"]), (False, "error"))

    def test_download_failure_and_a_stalled_server_are_bounded(self):
        self.start()
        Speed.mode["down"] = "fail"
        self.assertEqual(self.one_run().get("error"), "download failed")
        self.assertEqual(jsonl(self.st["hist.jsonl"]), [])
        Speed.mode = {"down": "ok", "stall": 10}
        t0 = time.monotonic()
        self.assertEqual(self.one_run().get("error"), "download failed")
        self.assertLess(time.monotonic() - t0, 9.5, "the streams' time limit (-m) bounds a stalled server")
        self.assertEqual(self.status()["message"], "download failed")

    def test_the_time_limit_cuts_a_slow_stream_and_the_window_measures_it(self):
        """A stream still running at its time limit is a measured stream, not a failure; the rate
        comes from the interface counter between the warm-up and the first stream's end."""
        self.start(MUDIMODEM_ST_DOWN_BYTES="50000000", MUDIMODEM_ST_TIME_SCALE="0.6")
        Speed.mode["down"] = "slow"                   # ~640 KiB/s per stream, 2 streams
        t0 = time.monotonic()
        r = self.one_run()
        self.assertNotIn("error", r, r)
        self.assertLess(time.monotonic() - t0, 15, "3 s of download, not 50 MB at 5 Mbit/s")
        self.assertEqual(r["measure_down"], "interface", r)
        self.assertTrue(4 < r["down_mbps"] < 60, "about 10.5 Mbit/s, got %s" % r["down_mbps"])
        self.assertTrue(1 < r["data_mb"] < 10, r["data_mb"])

    def test_full_profile_on_a_librespeed_server(self):
        with open(os.path.join(self.d, "speedtest.json"), "w") as f:
            json.dump({"profile": "full", "server": "librespeed", "librespeed_url": self.base + "/backend/"}, f)
        self.start()
        r = self.one_run()
        self.assertEqual((r["profile"], r["streams"], r["server"]), ("full", 4, "librespeed"), r)
        gets = [(x[1], x[2]) for x in Speed.seen if x[0] == "GET"]
        self.assertEqual(gets[:3], [(0, "/backend/empty.php")] * 3, "latency against empty.php")
        self.assertEqual(gets[3:], [(1048576, "/backend/garbage.php")] * 4, "4 streams, ckSize in MiB")
        self.assertEqual([(x[1], x[2]) for x in Speed.seen if x[0] == "POST"], [(50000, "/backend/empty.php")] * 4)
        # a malformed URL falls back to Cloudflare rather than fetching something odd
        with open(os.path.join(self.d, "speedtest.json"), "w") as f:
            json.dump({"profile": "turbo", "server": "librespeed", "librespeed_url": "file:///etc/shadow"}, f)
        Speed.seen = []
        r = self.one_run()
        self.assertEqual((r["profile"], r["server"]), ("quick", "cloudflare"))
        self.assertTrue(all(x[2] in ("/__down", "/__up") for x in Speed.seen), Speed.seen)

    def test_one_test_at_a_time_and_the_history_is_trimmed(self):
        self.start()
        with open(self.st["hist.jsonl"], "w") as f:
            f.write("".join(json.dumps({"t": i, "iface": "cellular"}) + "\n" for i in range(500)))
        a = self.call("job_start", {"kind": "speedtest", "args": {"iface": "cellular"}})
        b = self.call("job_start", {"kind": "speedtest", "args": {"iface": "cellular"}})
        self.assertEqual((b["id"], b.get("joined")), (a["id"], True), "a second start joins the running test")
        while self.call("job_wait", {"id": a["id"], "wait": 20}).get("pending"):
            pass
        hist = jsonl(self.st["hist.jsonl"])
        self.assertEqual(len(hist), 500)
        self.assertEqual(hist[0]["t"], 1, "the oldest line went")
        self.assertIn("down_mbps", hist[-1])

    # ---- the schedule -------------------------------------------------------------------------
    def test_the_schedule_runs_when_due_and_only_touches_last_run(self):
        with open(self.st["schedule.json"], "w") as f:
            json.dump({"enabled": True, "interval_seconds": 1800, "last_run": 0}, f)
        self.start(MUDIMODEM_SPEEDTESTD_WAKE="1")
        for _ in range(60):
            if jsonl(self.st["hist.jsonl"]):
                break
            time.sleep(0.5)
        time.sleep(1.5)
        hist = jsonl(self.st["hist.jsonl"])
        self.assertEqual([h["trigger"] for h in hist], ["schedule"], "one scheduled run, not one per wake")
        with open(self.st["schedule.json"]) as f:
            sched = json.load(f)
        self.assertEqual((sched["enabled"], sched["interval_seconds"]), (True, 1800))
        self.assertGreater(sched["last_run"], 0)

    def test_a_disabled_schedule_never_runs(self):
        with open(self.st["schedule.json"], "w") as f:
            json.dump({"enabled": False, "interval_seconds": 1800, "last_run": 0}, f)
        self.start(MUDIMODEM_SPEEDTESTD_WAKE="1")
        time.sleep(3)
        self.assertEqual(jsonl(self.st["hist.jsonl"]), [])

    # ---- the plugin: start, then the page polls the status ------------------------------------
    def test_the_plugin_starts_it_and_the_status_follows(self):
        self.start()
        self.fresh_latest()

        def plugin(method, args=None):
            out = subprocess.run(["lua5.1", DRIVER, self.ubus_bin(), os.path.join(self.d, "glc"), method]
                                 + ([json.dumps(args)] if args is not None else []),
                                 env=self.env, capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 0, out.stderr)
            return json.loads(out.stdout)
        self.assertEqual(plugin("run_speedtest", {"iface": "cellular"}), {"started": True})
        st = plugin("get_speedtest_status")
        self.assertTrue(st["running"], "running, and alive by the daemon's pid: %s" % st)
        for _ in range(60):
            st = plugin("get_speedtest_status")
            if not st.get("running"):
                break
            time.sleep(0.5)
        self.assertEqual(st["phase"], "done", st)
        self.assertEqual(len(plugin("get_speedtest_history")["results"]), 1)

    def test_the_plugin_keeps_the_settings_the_daemon_reads(self):
        self.start()

        def plugin(method, args=None):
            out = subprocess.run(["lua5.1", DRIVER, self.ubus_bin(), os.path.join(self.d, "glc"), method]
                                 + ([json.dumps(args)] if args is not None else []),
                                 env=dict(self.env, MUDIMODEM_ST_SETTINGS=os.path.join(self.d, "speedtest.json")),
                                 capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 0, out.stderr)
            return json.loads(out.stdout)
        self.assertEqual(plugin("get_speedtest_settings"),
                         {"profile": "quick", "server": "cloudflare", "librespeed_url": ""})
        for bad, why in (({"profile": "turbo"}, "profile"), ({"server": "ookla"}, "server"),
                         ({"server": "librespeed"}, "needs its URL"),
                         ({"server": "librespeed", "librespeed_url": "ftp://x/"}, "https://host/backend/"),
                         ({"server": "librespeed", "librespeed_url": "https://x/a?b=c"}, "https://host/backend/")):
            self.assertIn(why, plugin("set_speedtest_settings", bad).get("error", ""), bad)
        self.assertFalse(os.path.exists(os.path.join(self.d, "speedtest.json")), "a refused write writes nothing")
        r = plugin("set_speedtest_settings", {"profile": "full", "server": "librespeed",
                                              "librespeed_url": self.base + "/backend"})
        self.assertEqual(r, {"ok": True, "profile": "full", "server": "librespeed",
                             "librespeed_url": self.base + "/backend/"}, "the folder's trailing / is added")
        self.assertEqual(plugin("get_speedtest_settings")["librespeed_url"], self.base + "/backend/")
        res = self.one_run()
        self.assertEqual((res["profile"], res["server"], res["streams"]), ("full", "librespeed", 4))


if __name__ == "__main__":
    unittest.main()
