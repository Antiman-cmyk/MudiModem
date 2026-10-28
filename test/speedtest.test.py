#!/usr/bin/env python3
"""Unit tests for tools/mudimodem-speedtest.py's pure parts.
Run: python3 test/speedtest.test.py"""
import importlib.machinery
import importlib.util
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ST_SRC = os.path.join(HERE, "..", "tools", "mudimodem-speedtest.py")


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None:
        # Handle files without .py extension (Python 3.13+)
        loader = importlib.machinery.SourceFileLoader(name, path)
        spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


st = load(ST_SRC, "mudimodem_speedtest")

STD_SRC = os.path.join(HERE, "..", "src", "sbin", "mudimodem-speedtestd")
std = load(STD_SRC, "mudimodem_speedtestd")


class Mbps(unittest.TestCase):
    def test_bytes_per_sec_to_mbps(self):
        self.assertEqual(st.mbps(1_250_000), 10.0)   # 1.25 MB/s = 10 Mbps

    def test_none_stays_none(self):
        self.assertIsNone(st.mbps(None))


class ParseArgs(unittest.TestCase):
    def test_trailing_trigger_flag_raises_systemexit_not_indexerror(self):
        with self.assertRaises(SystemExit):
            st.parse_args(["--trigger"])

    def test_trailing_iface_flag_raises_systemexit_not_indexerror(self):
        with self.assertRaises(SystemExit):
            st.parse_args(["--iface"])


class ResolveIfaceFromDump(unittest.TestCase):
    # Real captured shapes (box, 2026-07-20) -- the cellular device index has
    # been observed to change (rmnet_data0 <-> rmnet_data1) after a modem
    # reconnect, and 'wan' can be down/bridged differently box to box.
    DUMP = {"interface": [
        {"interface": "eth", "proto": "static", "up": True, "device": "eth0", "l3_device": "eth0"},
        {"interface": "lan", "proto": "static", "up": True, "device": "br-lan", "l3_device": "br-lan"},
        {"interface": "modem_cpu", "proto": "rmnet", "up": True, "l3_device": "rmnet_data0"},
        {"interface": "modem_cpu_6", "proto": "rmnet", "up": True, "l3_device": "rmnet_data0"},
        {"interface": "wan", "proto": "dhcp", "up": False, "device": "eth0"},
    ]}

    def test_cellular_prefers_the_non_v6_rmnet_entry(self):
        dev, up = st.resolve_iface_from_dump(self.DUMP, "cellular")
        self.assertEqual(dev, "rmnet_data0")
        self.assertTrue(up)

    def test_wired_down_has_no_usable_device(self):
        dev, up = st.resolve_iface_from_dump(self.DUMP, "wired")
        self.assertFalse(up)

    def test_wired_up_uses_l3_device(self):
        dump = {"interface": [{"interface": "wan", "proto": "dhcp", "up": True,
                                "device": "eth0", "l3_device": "eth0"}]}
        dev, up = st.resolve_iface_from_dump(dump, "wired")
        self.assertEqual(dev, "eth0")
        self.assertTrue(up)

    def test_missing_interface_returns_down(self):
        dev, up = st.resolve_iface_from_dump({"interface": []}, "cellular")
        self.assertIsNone(dev)
        self.assertFalse(up)

    def test_none_dump_is_safe(self):
        dev, up = st.resolve_iface_from_dump(None, "cellular")
        self.assertIsNone(dev)
        self.assertFalse(up)


class LatencyStats(unittest.TestCase):
    def test_median_and_jitter(self):
        # seconds -> ms; median of [.05,.06,.07,.08,.09] = .07 -> 70ms; jitter 40ms
        latency_ms, jitter_ms = st.latency_stats([0.09, 0.05, 0.07, 0.06, 0.08])
        self.assertEqual(latency_ms, 70)
        self.assertEqual(jitter_ms, 40)

    def test_empty_is_none(self):
        self.assertEqual(st.latency_stats([]), (None, None))

    def test_ignores_none_samples(self):
        latency_ms, _ = st.latency_stats([0.1, None, 0.1])
        self.assertEqual(latency_ms, 100)


class BuildSnapshot(unittest.TestCase):
    MODEM = {"modems": [{"bus": "cpu", "current_sim_slot": 1}]}
    CELL = {"bus": "cpu", "slot": 1, "network_type": 5, "tac": "DE0000", "cell_id": "DE017C015",
            "signal": [{"band": 78, "earfcn": 627264, "pci": 142, "bandwidth": 100,
                        "rsrp": -94, "rsrq": -10, "sinr": 12, "rsrp_level": 4}]}
    NETS = {"networks": [{"bus": "cpu", "slot": 1, "carrier": "CHN-UNICOM"},
                         {"bus": "cpu", "slot": 2, "carrier": "AT&T"}]}

    def test_active_slot_only(self):
        snap = st.build_snapshot(self.MODEM, self.CELL, self.NETS)
        self.assertEqual(snap["slot"], 1)
        self.assertEqual(snap["carrier"], "CHN-UNICOM")
        self.assertEqual(snap["cell_id"], "DE017C015")
        self.assertEqual(snap["rsrp"], -94)
        self.assertEqual(snap["band"], 78)
        self.assertEqual(snap["mode"], "NR5G-SA")
        self.assertEqual(snap["signals"][0]["role"], "PCC")

    def test_no_active_slot_is_empty_dict(self):
        self.assertEqual(st.build_snapshot({"modems": [{"bus": "cpu"}]}, self.CELL, self.NETS), {})

    def test_flat_status_is_not_a_modem_list(self):
        self.assertEqual(st.build_snapshot({"bus": "cpu", "current_sim_slot": 1}, self.CELL, self.NETS), {})

    def test_snapshot_keeps_the_pcc_rat(self):
        # An NSA cell's PCC is the LTE anchor: `mode` says NR5G-NSA, so the
        # page needs `pcc_rat` to print B66, not "n66".
        snap = st.snapshot_from_sample({"t": 1, "slot": 1, "band": 66, "mode": "NR5G-NSA",
                                        "pcc_rat": "LTE", "tx_channel": 66786})
        self.assertEqual(snap["pcc_rat"], "LTE")
        nsa = {"bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
               "signal": [{"ca": 0, "network_type": 4, "band": 66, "earfcn": 66786, "pci": 61,
                           "rsrp": -97, "rsrq": -9, "sinr": 17}]}
        snap = st.build_snapshot(self.MODEM, nsa, self.NETS)
        self.assertEqual((snap["mode"], snap["pcc_rat"], snap["band"]), ("NR5G-NSA", "LTE", 66))

    def test_snapshot_from_sample_keeps_cell_id_alias(self):
        snap = st.snapshot_from_sample({"t": 1, "slot": 1, "id": "X", "cell_id": "X", "band": 3,
                                        "mode": "LTE", "rsrp": -80, "carrier": "c"})
        self.assertEqual(snap["cell_id"], "X")
        self.assertEqual(snap["mode"], "LTE")
        self.assertEqual(st.snapshot_from_sample({}), {})


class LoadSnapshot(unittest.TestCase):
    def _latest(self, obj):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "latest.json")
        with open(p, "w") as f:
            json.dump(obj, f)
        return p

    def test_fresh_latest_json_means_zero_ubus_reads(self):
        old_path, old_call = st.LATEST_PATH, st.ubus_call
        calls = []
        st.LATEST_PATH = self._latest({"t": int(time.time() * 1000), "slot": 1, "cell_id": "DE017C015",
                                       "band": 78, "mode": "NR5G-SA", "rsrp": -94, "carrier": "CHN-UNICOM"})
        st.ubus_call = lambda o, m, a=None: calls.append((o, m)) or None
        try:
            snap = st.load_snapshot()
        finally:
            st.LATEST_PATH, st.ubus_call = old_path, old_call
        self.assertEqual(snap["cell_id"], "DE017C015")
        self.assertEqual(snap["rsrp"], -94)
        self.assertEqual(calls, [], "a fresh collector sample must cost no modem traffic")

    def test_stale_latest_falls_back_to_one_cell_info(self):
        old_path, old_call = st.LATEST_PATH, st.ubus_call
        calls = []
        st.LATEST_PATH = self._latest({"t": int((time.time() - 300) * 1000), "slot": 1, "rsrp": -50})

        def fake(obj, method, args=None):
            calls.append((obj, method, args))
            return {("cellular.modem", "status"): BuildSnapshot.MODEM,
                    ("cellular.network", "cell_info"): BuildSnapshot.CELL,
                    ("cellular.network", "info"): BuildSnapshot.NETS}.get((obj, method))
        st.ubus_call = fake
        try:
            snap = st.load_snapshot()
        finally:
            st.LATEST_PATH, st.ubus_call = old_path, old_call
        self.assertEqual(snap["cell_id"], "DE017C015")
        self.assertEqual(snap["rsrp"], -94)
        cell = [c for c in calls if c[1] == "cell_info"]
        self.assertEqual(len(cell), 1)
        self.assertEqual(cell[0][2], {"bus": "cpu", "slot": 1})
        self.assertIn([c for c in calls if c[1] == "status"][0][2], (None, {}))

    def test_failed_cell_info_read_is_no_snapshot_not_a_fake_outage(self):
        old_path, old_call = st.LATEST_PATH, st.ubus_call
        st.LATEST_PATH = os.path.join(tempfile.mkdtemp(), "nope.json")
        st.ubus_call = lambda o, m, a=None: (BuildSnapshot.MODEM if m == "status" else
                                             BuildSnapshot.NETS if m == "info" else None)
        try:
            self.assertEqual(st.load_snapshot(), {})
        finally:
            st.LATEST_PATH, st.ubus_call = old_path, old_call

    def test_missing_latest_and_no_slot_is_empty(self):
        old_path, old_call = st.LATEST_PATH, st.ubus_call
        st.LATEST_PATH = os.path.join(tempfile.mkdtemp(), "nope.json")
        st.ubus_call = lambda o, m, a=None: {"modems": [{"bus": "cpu"}]} if m == "status" else None
        try:
            self.assertEqual(st.load_snapshot(), {})
        finally:
            st.LATEST_PATH, st.ubus_call = old_path, old_call


import http.server
import threading
from urllib.parse import urlparse, parse_qs


class FakeSpeedHandler(http.server.BaseHTTPRequestHandler):
    """Stands in for speed.cloudflare.com: GET ?bytes=N returns N bytes,
    POST reads+discards the body. Both return 200 so curl's -w json trailer
    reports a real (if instant, since it's loopback) transfer."""
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        n = int((q.get("bytes") or ["0"])[0])
        self.send_response(200)
        self.send_header("Content-Length", str(n))
        self.end_headers()
        if n:
            self.wfile.write(b"x" * n)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *a):
        pass


class StallingHandler(FakeSpeedHandler):
    """A server that accepts the request and then never answers (per method),
    to catch a run mid-transfer."""
    STALL = {"GET": False, "POST": False}

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if self.STALL["GET"] and int((q.get("bytes") or ["0"])[0]) > 0:
            time.sleep(60)
        return FakeSpeedHandler.do_GET(self)

    def do_POST(self):
        if self.STALL["POST"]:
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            time.sleep(60)
        return FakeSpeedHandler.do_POST(self)


class _Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


def _procs_with(needle):
    """pids whose command line contains `needle` (scans /proc)."""
    out = []
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            with open("/proc/%s/cmdline" % d, "rb") as f:
                if needle.encode() in f.read():
                    out.append(int(d))
        except OSError:
            pass
    return out


class _ServerCase(unittest.TestCase):
    """A fake speed server + scratch paths; no tests of its own."""
    HANDLER = FakeSpeedHandler

    def setUp(self):
        self.server = _Server(("127.0.0.1", 0), self.HANDLER)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def _base(self):
        return "http://127.0.0.1:%d" % self.port

    def _args(self, **over):
        a = {"--device": "lo", "--down-url": self._base(), "--up-url": self._base(),
             "--down-bytes": "10000", "--up-bytes": "10000",
             "--hist": os.path.join(self.tmp, "h.jsonl"),
             "--status": os.path.join(self.tmp, "s.json"),
             "--lock": os.path.join(self.tmp, "st.lock"), "--iface": "cellular"}
        a.update(over)
        return [x for kv in a.items() for x in kv]

    def _status(self):
        with open(os.path.join(self.tmp, "s.json")) as f:
            return json.load(f)


def _alive(pid):
    """True if pid exists and is not a zombie."""
    try:
        with open("/proc/%d/stat" % pid) as f:
            return f.read().rsplit(")", 1)[1].split()[0] != "Z"
    except OSError:
        return False


class MainEndToEnd(_ServerCase):
    def test_happy_path_appends_history_and_writes_done_status(self):
        hist = os.path.join(self.tmp, "speedtests.jsonl")
        status = os.path.join(self.tmp, "status.json")
        lock = os.path.join(self.tmp, "st.lock")
        rc = st.main(["--device", "lo", "--down-url", self._base(), "--up-url", self._base(),
                      "--down-bytes", "10000", "--up-bytes", "10000",
                      "--hist", hist, "--status", status, "--lock", lock,
                      "--trigger", "manual", "--iface", "cellular"])
        self.assertEqual(rc, 0)
        with open(hist) as f:
            lines = [json.loads(l) for l in f if l.strip()]
        self.assertEqual(len(lines), 1)
        r = lines[0]
        self.assertEqual(r["trigger"], "manual")
        self.assertEqual(r["iface"], "cellular")
        self.assertGreater(r["down_mbps"], 0)
        self.assertGreater(r["up_mbps"], 0)
        self.assertIsNotNone(r["latency_ms"])
        with open(status) as f:
            s = json.load(f)
        self.assertEqual(s["phase"], "done")
        self.assertFalse(s["running"])

    def test_lock_busy_refuses_a_second_concurrent_run(self):
        lock = os.path.join(self.tmp, "busy.lock")
        status = os.path.join(self.tmp, "s.json")
        # the in-flight run's status: the loser must leave it exactly as is
        inflight = {"running": True, "phase": "upload", "iface": "cellular",
                    "pid": 4242, "started": 1700000000}
        with open(status, "w") as f:
            json.dump(inflight, f)
        held = st.acquire_lock(lock)
        try:
            rc = st.main(["--device", "lo", "--down-url", self._base(), "--up-url", self._base(),
                          "--hist", os.path.join(self.tmp, "h.jsonl"),
                          "--status", status, "--lock", lock])
        finally:
            held.close()
        self.assertEqual(rc, 2)
        with open(status) as f:
            self.assertEqual(json.load(f), inflight, "the lock loser touched the status file")

    def test_every_status_write_names_this_run(self):
        seen, real = [], st.write_status
        st.write_status = lambda path, obj: (seen.append(dict(obj)), real(path, obj))
        try:
            t0 = int(time.time())
            self.assertEqual(st.main(self._args()), 0)
        finally:
            st.write_status = real
        running = [o for o in seen if o.get("running")]
        self.assertGreaterEqual(len(running), 3, "download/upload/latency at least")
        for o in seen:
            self.assertEqual(o["pid"], os.getpid())
            self.assertIsInstance(o["started"], int)
            self.assertLessEqual(abs(o["started"] - t0), 2)
        self.assertEqual(len({o["started"] for o in seen}), 1, "one run, one start time")
        self.assertEqual(seen[-1]["phase"], "done")

    def test_an_uncaught_exception_still_ends_on_a_terminal_status(self):
        real = st.append_result

        def full_disk(*_a, **_k):
            raise OSError(28, "No space left on device")
        st.append_result = full_disk
        old_err = sys.stderr
        sys.stderr = open(os.devnull, "w")             # the tool logs the traceback
        try:
            rc = st.main(self._args())
        finally:
            sys.stderr.close()
            st.append_result, sys.stderr = real, old_err
        self.assertNotEqual(rc, 0)
        s = self._status()
        self.assertFalse(s["running"])
        self.assertEqual(s["phase"], "error")
        self.assertIn("No space left", s["message"])
        self.assertEqual(s["error"], s["message"])
        self.assertEqual(s["pid"], os.getpid())

    def test_wired_run_carries_no_radio_snapshot_and_reads_no_cellular_ubus(self):
        calls = []
        old_call, old_latest = st.ubus_call, st.LATEST_PATH
        st.LATEST_PATH = os.path.join(self.tmp, "latest.json")
        with open(st.LATEST_PATH, "w") as f:   # a FRESH cellular sample is right there
            json.dump({"t": int(time.time() * 1000), "slot": 1, "carrier": "T-Mobile",
                       "band": 71, "mode": "NR5G-SA", "rsrp": -90, "cell_id": "X"}, f)
        st.ubus_call = lambda o, m, a=None: calls.append(o) or None
        try:
            self.assertEqual(st.main(self._args(**{"--iface": "wired"})), 0)
        finally:
            st.ubus_call, st.LATEST_PATH = old_call, old_latest
        with open(os.path.join(self.tmp, "h.jsonl")) as f:
            r = json.loads(f.readline())
        self.assertEqual(r["iface"], "wired")
        for k in ("carrier", "slot", "band", "mode", "rsrp", "cell_id", "signals"):
            self.assertNotIn(k, r, "a wired result must not be stamped with cellular radio data")
        self.assertFalse([c for c in calls if c.startswith("cellular")])

    def test_cellular_run_still_carries_the_snapshot(self):
        old_latest = st.LATEST_PATH
        st.LATEST_PATH = os.path.join(self.tmp, "latest.json")
        with open(st.LATEST_PATH, "w") as f:
            json.dump({"t": int(time.time() * 1000), "slot": 1, "carrier": "T-Mobile", "band": 66,
                       "mode": "NR5G-NSA", "pcc_rat": "LTE", "rsrp": -90}, f)
        try:
            self.assertEqual(st.main(self._args()), 0)
        finally:
            st.LATEST_PATH = old_latest
        with open(os.path.join(self.tmp, "h.jsonl")) as f:
            r = json.loads(f.readline())
        self.assertEqual((r["carrier"], r["band"], r["pcc_rat"]), ("T-Mobile", 66, "LTE"))

    def test_trims_history_to_max_lines(self):
        hist = os.path.join(self.tmp, "many.jsonl")
        with open(hist, "w") as f:
            for i in range(st.HIST_MAX_LINES + 10):
                f.write(json.dumps({"t": i}) + "\n")
        st.append_result(hist, {"t": 999999})
        with open(hist) as f:
            lines = [json.loads(l) for l in f if l.strip()]
        self.assertEqual(len(lines), st.HIST_MAX_LINES)
        self.assertEqual(lines[-1]["t"], 999999)


class KilledMidTransfer(_ServerCase):
    """SIGTERM mid-upload (speedtestd's timeout, a stop): terminal status,
    no curl left running, and nothing left behind in the temp dir (the old
    2 MiB upload file lived in /tmp = RAM and leaked on every kill)."""
    HANDLER = StallingHandler

    def tearDown(self):
        StallingHandler.STALL.update(GET=False, POST=False)
        _ServerCase.tearDown(self)

    def _spawn(self, **over):
        tmpdir = os.path.join(self.tmp, "tmpdir")
        os.makedirs(tmpdir)
        env = dict(os.environ, TMPDIR=tmpdir, MUDIMODEM_LATEST=os.path.join(self.tmp, "none.json"))
        args = self._args(**dict({"--iface": "wired", "--timeout": "30"}, **over))
        proc = subprocess.Popen([sys.executable, ST_SRC] + args, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return proc, tmpdir

    def _wait_phase(self, phase, proc):
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                if self._status().get("phase") == phase:
                    return
            except (OSError, ValueError):
                pass
            if proc.poll() is not None:
                self.fail("tool exited before reaching %s" % phase)
            time.sleep(0.05)
        self.fail("never reached %s" % phase)

    def test_sigterm_mid_upload_is_terminal_and_leaves_nothing_behind(self):
        StallingHandler.STALL["POST"] = True
        proc, tmpdir = self._spawn()
        try:
            self._wait_phase("upload", proc)
            time.sleep(0.3)                                  # curl is mid-request now
            self.assertTrue(_procs_with(self._base()), "curl should be running")
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=10)
        finally:
            if proc.poll() is None:
                proc.kill()
        s = self._status()
        self.assertFalse(s["running"])
        self.assertEqual(s["phase"], "error")
        self.assertEqual(s["pid"], proc.pid)
        time.sleep(0.2)
        self.assertEqual(_procs_with(self._base()), [], "an orphaned curl kept running")
        self.assertEqual(os.listdir(tmpdir), [], "upload payload leaked into the temp dir")


class WorstCase(unittest.TestCase):
    def test_worst_case_counts_every_bounded_step(self):
        # 4 ubus (iface + 3 snapshot) + download + upload + N latency probes
        self.assertEqual(st.worst_case_seconds(timeout=20, latency_n=5),
                         4 * st.UBUS_TIMEOUT + 7 * (20 + st.CURL_GRACE_S))

    def test_scheduler_deadline_exceeds_the_tools_worst_case(self):
        # The old fixed 120 s was below the tool's own ~170-200 s worst case.
        self.assertGreater(std.run_timeout_s(ST_SRC), st.worst_case_seconds())
        self.assertGreater(std.RUN_TIMEOUT_FALLBACK_S, st.worst_case_seconds())
        self.assertEqual(std.run_timeout_s(os.path.join(HERE, "nope.py")),
                         std.RUN_TIMEOUT_FALLBACK_S)


class SettleStatus(unittest.TestCase):
    def _write(self, obj):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "s.json")
        with open(p, "w") as f:
            json.dump(obj, f)
        return p

    def _read(self, p):
        with open(p) as f:
            return json.load(f)

    def test_running_status_of_that_pid_is_made_terminal(self):
        p = self._write({"running": True, "phase": "latency", "pid": 777, "started": 5, "iface": "cellular"})
        self.assertTrue(std.settle_status(p, 777, "timed out"))
        s = self._read(p)
        self.assertEqual((s["running"], s["phase"], s["message"]), (False, "error", "timed out"))
        self.assertEqual((s["pid"], s["started"]), (777, 5))

    def test_another_runs_status_or_a_terminal_one_is_left_alone(self):
        p = self._write({"running": True, "phase": "download", "pid": 888})
        self.assertFalse(std.settle_status(p, 777, "x"))
        self.assertTrue(self._read(p)["running"])
        p = self._write({"running": False, "phase": "done", "pid": 777})
        self.assertFalse(std.settle_status(p, 777, "x"))
        self.assertEqual(self._read(p)["phase"], "done")


FAKE_HUNG_TOOL = r"""
import json, os, signal, subprocess, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)      # forces the SIGKILL path
status, childf = sys.argv[1], sys.argv[2]
child = subprocess.Popen(["sleep", "60"])          # stands in for curl
with open(childf, "w") as f:
    f.write(str(child.pid))
with open(status, "w") as f:
    json.dump({"running": True, "phase": "latency", "pid": os.getpid(), "started": 1}, f)
time.sleep(60)
"""


class AttemptRunKill(unittest.TestCase):
    def test_timed_out_run_is_killed_as_a_group_and_its_status_settled(self):
        d = tempfile.mkdtemp()
        tool = os.path.join(d, "hung.py")
        with open(tool, "w") as f:
            f.write(FAKE_HUNG_TOOL)
        status, childf = os.path.join(d, "s.json"), os.path.join(d, "child.pid")
        wrapper = os.path.join(d, "py.sh")             # pass our extra args through
        with open(wrapper, "w") as f:
            f.write('#!/bin/sh\nexec "%s" "%s" "%s" "%s"\n' % (sys.executable, tool, status, childf))
        os.chmod(wrapper, 0o755)
        old = (std.SCHEDULE_PATH, std.KILL_GRACE_S)
        std.SCHEDULE_PATH, std.KILL_GRACE_S = os.path.join(d, "sched.json"), 0.5
        try:
            t0 = time.time()
            std.attempt_run("/bin/sh", wrapper, 1.5, status_path=status)
            took = time.time() - t0
        finally:
            std.SCHEDULE_PATH, std.KILL_GRACE_S = old
        self.assertLess(took, 10)
        with open(status) as f:
            s = json.load(f)
        self.assertFalse(s["running"], "a killed run must not leave running:true")
        self.assertIn("timed out", s["message"])
        with open(childf) as f:
            child = int(f.read())
        time.sleep(0.2)
        self.assertFalse(_alive(child), "the run's curl stand-in survived the group kill")
        self.assertGreater(std.read_schedule(os.path.join(d, "sched.json"))["last_run"], 0)


class IsDue(unittest.TestCase):
    def test_disabled_never_due(self):
        self.assertFalse(std.is_due({"enabled": False, "interval_seconds": 60, "last_run": 0}, 10 ** 9))

    def test_due_when_interval_elapsed(self):
        cfg = {"enabled": True, "interval_seconds": 3600, "last_run": 0}
        self.assertTrue(std.is_due(cfg, 3600 * 1000))
        self.assertFalse(std.is_due(cfg, 3600 * 1000 - 1))

    def test_zero_interval_never_due(self):
        self.assertFalse(std.is_due({"enabled": True, "interval_seconds": 0, "last_run": 0}, 10 ** 9))


class AttemptRun(unittest.TestCase):
    def test_write_last_run_happens_even_when_subprocess_times_out(self):
        """A hung/timed-out scheduled run must still be recorded as attempted --
        otherwise the daemon would retry it on its very next 60s wake, looping
        a stuck run forever and burning cellular data."""
        calls = []

        class FakeProc:
            pid = -1
            returncode = None

            def wait(self, timeout=None):
                raise std.subprocess.TimeoutExpired(cmd="x", timeout=timeout)

        def fake_write_last_run(path, now):
            calls.append((path, now))

        orig = (std.subprocess.Popen, std.write_last_run, std.stop_group)
        std.subprocess.Popen = lambda *a, **kw: FakeProc()
        std.write_last_run = fake_write_last_run
        std.stop_group = lambda proc: None
        try:
            std.attempt_run("python3", "/fake/bin.py", 120,
                            status_path=os.path.join(tempfile.mkdtemp(), "none.json"))
        finally:
            std.subprocess.Popen, std.write_last_run, std.stop_group = orig

        self.assertEqual(len(calls), 1, "write_last_run must be called even after a timeout")


class ReadSchedule(unittest.TestCase):
    def test_missing_file_returns_default_off(self):
        cfg = std.read_schedule("/tmp/mm-does-not-exist-speedtest-schedule.json")
        self.assertEqual(cfg, std.DEFAULT_SCHEDULE)

    def test_malformed_file_returns_default_off(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("not json")
            path = f.name
        try:
            self.assertEqual(std.read_schedule(path), std.DEFAULT_SCHEDULE)
        finally:
            os.remove(path)

    def test_partial_file_fills_in_defaults(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(json.dumps({"enabled": True}))
            path = f.name
        try:
            cfg = std.read_schedule(path)
            self.assertTrue(cfg["enabled"])
            self.assertEqual(cfg["interval_seconds"], std.DEFAULT_SCHEDULE["interval_seconds"])
        finally:
            os.remove(path)

    def test_write_last_run_preserves_concurrent_edits(self):
        """Prove read-modify-write: concurrent edits to enabled/interval_seconds
        made while a test was running must not be clobbered."""
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            # Start with enabled=true, interval_seconds=3600
            f.write(json.dumps({"enabled": True, "interval_seconds": 3600, "last_run": 0}))
            path = f.name
        try:
            # Simulate a concurrent edit: the user disables the schedule via the UI
            # while the test is running
            with open(path, "w") as f:
                json.dump({"enabled": False, "interval_seconds": 3600, "last_run": 0}, f)

            # Now write_last_run() is called after the test finishes
            # It should preserve enabled:false (the concurrent edit), not clobber it back to true
            now = 999999
            std.write_last_run(path, now)

            # Verify the result preserves the concurrent edit
            result = std.read_schedule(path)
            self.assertFalse(result["enabled"], "enabled should still be False after concurrent edit")
            self.assertEqual(result["last_run"], now, "last_run should be updated to the new timestamp")
            self.assertEqual(result["interval_seconds"], 3600, "interval_seconds should be preserved")
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
