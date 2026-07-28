#!/usr/bin/env python3
"""Unit tests for mudimodem-collectd's pure parts (build_sample, trim).
Run: python3 -m unittest test.collectd.test  (or python3 test/collectd.test.py)"""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "sbin", "mudimodem-collectd")
spec = importlib.util.spec_from_loader("collectd", loader=None)
collectd = importlib.util.module_from_spec(spec)
with open(SRC) as f:
    exec(compile(f.read(), SRC, "exec"), collectd.__dict__)

# Real captured shapes (box, 2026-07-17).
MODEM = {"modems": [{"bus": "cpu", "status": 0, "current_sim_slot": "1"}]}
NET = {"networks": [
    {"bus": "cpu", "slot": "1", "cell_info": {
        "id": "D43B70D", "band": 2, "mode": "LTE FDD",
        "rsrp": "-118", "rsrp_level": 1, "rsrq": "-16", "rsrq_level": 1,
        "rssi": "-88", "sinr": "10", "sinr_level": 3,
        "dl_bandwidth": "5MHz", "tx_channel": "8701"}},
    {"bus": "cpu", "slot": "2", "cell_info": {
        "id": "AD4B60A", "band": 2, "mode": "LTE FDD", "rsrp": "-113"}}]}
SIMS = {"sims": [
    {"slot": "1", "bus": "cpu", "carrier": "T-Mobile"},
    {"slot": "2", "bus": "cpu", "carrier": "AT&T"}]}


class BuildSample(unittest.TestCase):
    def test_active_slot_cell_and_carrier(self):
        s = collectd.build_sample(MODEM, NET, SIMS, t=1000)
        self.assertEqual(s["slot"], "1")
        self.assertEqual(s["id"], "D43B70D")        # active slot's cell, not slot 2
        self.assertEqual(s["carrier"], "T-Mobile")
        self.assertEqual(s["tx_channel"], "8701")

    def test_metric_strings_parsed_to_numbers(self):
        s = collectd.build_sample(MODEM, NET, SIMS, t=1000)
        self.assertEqual(s["rsrp"], -118)           # "-118" -> int
        self.assertEqual(s["sinr"], 10)
        self.assertEqual(s["rsrp_level"], 1)         # level buckets preserved

    def test_active_slot_2_picks_the_other_cell(self):
        modem2 = {"modems": [{"bus": "cpu", "current_sim_slot": "2"}]}
        s = collectd.build_sample(modem2, NET, SIMS, t=1000)
        self.assertEqual(s["id"], "AD4B60A")
        self.assertEqual(s["carrier"], "AT&T")

    def test_unregistered_active_slot_yields_null_metrics_not_none(self):
        net = {"networks": [{"bus": "cpu", "slot": "1"}]}   # no cell_info
        s = collectd.build_sample(MODEM, net, SIMS, t=1000)
        self.assertIsNotNone(s, "still a sample (gap), not dropped")
        self.assertIsNone(s["rsrp"])
        self.assertEqual(s["slot"], "1")

    def test_no_active_slot_returns_none(self):
        self.assertIsNone(collectd.build_sample({"modems": [{}]}, NET, SIMS))
        self.assertIsNone(collectd.build_sample({}, NET, SIMS))


class Trim(unittest.TestCase):
    def _write(self, path, ts):
        with open(path, "w") as f:
            for t in ts:
                f.write(json.dumps({"t": t, "rsrp": -100}) + "\n")

    def test_drops_lines_older_than_max_age(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            self._write(p, [1000, 5000, 9000])       # ref 10000, max_age 5000 -> keep >=5000
            collectd.trim(p, max_age_ms=5000, max_lines=100, ref_ms=10000)
            kept = [json.loads(l)["t"] for l in open(p)]
            self.assertEqual(kept, [5000, 9000])

    def test_caps_line_count(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            self._write(p, list(range(1, 11)))
            collectd.trim(p, max_age_ms=10 ** 12, max_lines=3, ref_ms=100)
            kept = [json.loads(l)["t"] for l in open(p)]
            self.assertEqual(kept, [8, 9, 10])       # last 3

    def test_skips_malformed_lines_and_tolerates_missing_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            with open(p, "w") as f:
                f.write('{"t":9000}\n')
                f.write("not json\n")
                f.write('{"t":9500}\n')
            collectd.trim(p, max_age_ms=5000, max_lines=100, ref_ms=10000)
            kept = [json.loads(l)["t"] for l in open(p)]
            self.assertEqual(kept, [9000, 9500])
            collectd.trim(os.path.join(d, "absent.jsonl"), 5000, 100)  # no raise


def _mklim(d, pid=None, limit=None):
    """Build glbattlimit's runtime files under d. Returns (pidf, limf).
    `pid` may be an int (written verbatim) or a string; None means the file
    does not exist, i.e. the watcher is not running."""
    pidf = os.path.join(d, "glbattlimit.pid")
    limf = os.path.join(d, "glbattlimit.limit")
    for path, val in ((pidf, pid), (limf, limit)):
        if val is None:
            if os.path.exists(path):
                os.unlink(path)
            continue
        with open(path, "w") as f:
            f.write(str(val) + "\n")
    return pidf, limf


def _dead_pid():
    """A pid that is certainly not running: spawn and reap a trivial child."""
    p = subprocess.Popen(["/bin/true"])
    p.wait()
    return p.pid


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


def _rb(d, t=1, pid=None, limit=None, root=None, **over):
    """read_battery against fixtures only. The limiter paths are ALWAYS passed
    explicitly so a test never reads (or depends on) the live
    /tmp/glbattlimit.pid of a real watcher on the dev box."""
    r = _mkbat(d, **over) if root is None else root
    pidf, limf = _mklim(d, pid, limit)
    return collectd.read_battery(r, t=t, pidf=pidf, limf=limf)


class ReadBattery(unittest.TestCase):
    def test_units_converted_per_node(self):
        with tempfile.TemporaryDirectory() as d:
            s = _rb(d, t=1000)
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
            self.assertEqual(_rb(d)["cur"], -363)
        with tempfile.TemporaryDirectory() as d:
            s = _rb(d, **{"cw221X-bat/current_now": "1183"})
            self.assertEqual(s["cur"], 1183)

    def test_limiter_blocking_is_recorded_per_sample(self):
        # THE live box, 2026-07-28: limit enabled at GUI 80 (= gauge 71), the
        # watcher running, the gauge sitting exactly on the target. The charger
        # says Full/Trickle *because* glbattlimit dropped the buck's vreg below
        # Vbat to block charging - so `status` CANNOT tell this apart from a
        # genuinely full cell, and neither can cur == 0. The limiter's own pid /
        # limit files can, which is why they are recorded per sample.
        # test/battery-chunk.test.js consumes this exact shape and must agree
        # that it means BLOCKED, not full.
        with tempfile.TemporaryDirectory() as d:
            s = _rb(d, pid=os.getpid(), limit=71, **{
                "cw221X-bat/capacity": "71",
                "cw221X-bat/current_now": "0", "charger/online": "1",
                "charger/status": "Full", "charger/charge_type": "Trickle"})
            self.assertEqual(s["cur"], 0)
            self.assertEqual(s["online"], 1)
            self.assertEqual(s["status"], "Full")
            self.assertEqual(s["ctype"], "Trickle")
            self.assertEqual(s["cap"], 71)
            self.assertEqual(s["lim"], 1, "the watcher is alive")
            self.assertEqual(s["lim_gauge"], 71, "and this is its gauge target")

    def test_full_battery_has_the_same_charger_strings_and_no_limiter(self):
        # Byte-identical charger state to the test above; only the limiter
        # differs. This pair is what makes the two cases distinguishable at all.
        with tempfile.TemporaryDirectory() as d:
            s = _rb(d, **{
                "cw221X-bat/capacity": "86",
                "cw221X-bat/current_now": "0", "charger/online": "1",
                "charger/status": "Full", "charger/charge_type": "Trickle"})
            self.assertEqual(s["status"], "Full")
            self.assertEqual(s["lim"], 0, "no watcher running")
            self.assertIsNone(s["lim_gauge"])

    def test_missing_gauge_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            _mkbat(d, **{"cw221X-bat/capacity": None})
            self.assertIsNone(_rb(d, root=d))

    def test_absent_tree_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(_rb(d, root=os.path.join(d, "nope")))

    def test_garbage_numeric_node_becomes_none_without_killing_the_sample(self):
        with tempfile.TemporaryDirectory() as d:
            s = _rb(d, **{"cw221X-bat/temp": "n/a"})
            self.assertIsNotNone(s)
            self.assertIsNone(s["temp"])
            self.assertEqual(s["cap"], 70)

    def test_charger_nodes_absent_degrade_to_offline(self):
        with tempfile.TemporaryDirectory() as d:
            _mkbat(d, **{"charger/online": None, "charger/status": None,
                         "charger/charge_type": None})
            s = _rb(d, root=d)
            self.assertIsNotNone(s, "battery data survives a missing charger node")
            self.assertEqual(s["online"], 0)
            self.assertEqual(s["status"], "")


class ReadLimiter(unittest.TestCase):
    """glbattlimit's state, read the same way `glbattlimit status` reads it:
    the pid file plus a liveness probe. Nothing here may touch the real
    /tmp/glbattlimit.* of a watcher running on the dev box."""

    def test_running_watcher_reports_active_and_its_target(self):
        with tempfile.TemporaryDirectory() as d:
            pidf, limf = _mklim(d, pid=os.getpid(), limit=71)
            self.assertEqual(collectd.read_limiter(pidf, limf), (1, 71))

    def test_no_pidfile_means_not_running(self):
        with tempfile.TemporaryDirectory() as d:
            pidf, limf = _mklim(d)
            self.assertEqual(collectd.read_limiter(pidf, limf), (0, None))

    def test_stale_pidfile_is_not_a_running_watcher(self):
        # The watcher removes its pidfile on exit and on unplug, but a SIGKILL
        # leaves it behind. A stale file must not make the chart claim the
        # limiter blocked a charge it had nothing to do with.
        with tempfile.TemporaryDirectory() as d:
            pidf, limf = _mklim(d, pid=_dead_pid(), limit=71)
            running, target = collectd.read_limiter(pidf, limf)
            self.assertEqual(running, 0)
            self.assertEqual(target, 71, "the target still parses; only liveness failed")

    def test_garbage_pidfile_is_not_running(self):
        with tempfile.TemporaryDirectory() as d:
            pidf, limf = _mklim(d, pid="notapid", limit="alsonot")
            self.assertEqual(collectd.read_limiter(pidf, limf), (0, None))

    def test_running_watcher_with_no_limit_file_still_reports_running(self):
        with tempfile.TemporaryDirectory() as d:
            pidf, limf = _mklim(d, pid=os.getpid())
            self.assertEqual(collectd.read_limiter(pidf, limf), (1, None))


class BatteryConstants(unittest.TestCase):
    def test_retention_matches_20s_cadence_over_24h(self):
        self.assertEqual(collectd.BATT_INTERVAL, 20)
        self.assertEqual(collectd.BATT_MAX_AGE, 24 * 3600 * 1000)
        # 24h at 20s = 4320 samples; the cap is a backstop above that.
        self.assertGreater(collectd.BATT_MAX_LINE, 4320)


if __name__ == "__main__":
    unittest.main()
