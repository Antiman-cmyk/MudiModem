#!/usr/bin/env python3
"""Unit tests for mudimodem-collectd's pure parts (build_sample, trim, battery,
persist). GL 4.10 shapes ONLY. Run: python3 test/collectd.test.py"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "sbin", "mudimodem-collectd")
sys.path.insert(0, os.path.join(HERE, "..", "src", "lib"))
import cellular_compat as cc  # noqa: E402
spec = importlib.util.spec_from_loader("collectd", loader=None)
collectd = importlib.util.module_from_spec(spec)
collectd.__dict__["__file__"] = SRC
with open(SRC) as f:
    exec(compile(f.read(), SRC, "exec"), collectd.__dict__)

# ---- GL 4.10 captured shapes -------------------------------------------------
# cellular.modem status (no args) — GL's canonical form: modems[] (what
# lib/functions/modem.sh, websocket/cellular.lua and internet.js all parse).
MODEM_STATUS_410 = {"modems": [{"bus": "cpu", "current_sim_slot": 1, "slot_switch_enable": True,
                                "status": 0}]}
# A second (USB) modem in the list must not be picked over the built-in one.
MODEM_STATUS_410_TWO = {"modems": [{"bus": "1-1.2", "type": 1, "current_sim_slot": 2},
                                   {"bus": "cpu", "type": 0, "current_sim_slot": 1}]}
# cellular.network cell_info {bus,slot} — NR-SA n78 (EU unit), single carrier.
CELL_INFO_410_SA = {
    "bus": "cpu", "slot": 1, "network_type": 5, "tac": "DE0000", "cell_id": "DE017C015",
    "signal": [{"band": 78, "earfcn": 627264, "pci": 142, "bandwidth": 100,
                "rsrp": -94, "rsrq": -10, "sinr": 12, "rssi": -32768,
                "rsrp_level": 4, "rsrq_level": 3, "sinr_level": 3}],
    "ret": 0, "resp": "Success",
}
# NSA: issue #5 capture (LTE anchor B3) — network_type 51.
CELL_INFO_410_NSA = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [{"band": 3, "earfcn": 1700, "rsrp": -97, "rsrq": -9, "rssi": -67,
                "sinr": 17, "rsrp_level": 4, "strength": 4}],
    "ret": 0, "resp": "Success",
}
# EN-DC with a NR secondary carrier (contract-derived until a real trace lands).
CELL_INFO_410_NSA_CA = dict(CELL_INFO_410_NSA, signal=[
    dict(CELL_INFO_410_NSA["signal"][0], ca=0),
    {"ca": 1, "network_type": 5, "band": 78, "earfcn": 627264, "pci": 142,
     "bandwidth": 100, "rsrp": -99, "rsrq": -11, "sinr": 8},
])
# EN-DC as GL's 4.10 binary actually emits it (libcm_network.so cell_info
# handler @0x8284 + quectel_get_qcainfo_signal): EVERY row carries ca,
# network_type, pci and the full metric set; QCAINFO "PCC" = LTE anchor ->
# row network_type 4, "SCC" NR legs -> 51, cell -> 51.
CELL_INFO_410_NSA_FULL = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [
        {"ca": 0, "network_type": 4, "band": 3, "earfcn": 1700, "pci": 61, "bandwidth": 20,
         "rsrp": -97, "rsrq": -9, "rssi": -67, "sinr": 17, "rscp": -32768, "ecio": -32768, "snr": -32768,
         "rsrp_level": 4, "rsrq_level": 4, "rssi_level": 4, "sinr_level": 4,
         "rscp_level": 0, "ecio_level": 0, "snr_level": 0, "strength": 4},
        {"ca": 1, "network_type": 51, "band": 78, "earfcn": 627264, "pci": 142, "bandwidth": 100,
         "rsrp": -99, "rsrq": -11, "rssi": -32768, "sinr": 8, "rscp": -32768, "ecio": -32768, "snr": -32768,
         "rsrp_level": 3, "rsrq_level": 3, "rssi_level": 0, "sinr_level": 3,
         "rscp_level": 0, "ecio_level": 0, "snr_level": 0, "strength": 3},
    ],
    "ret": 0, "resp": "Success",
}
# The binary's ca_num == 0 fallback: ONE row from the QENG servingcell struct
# (LTE-anchor band/pci/earfcn) stamped with the CELL's code — 51 under NSA.
CELL_INFO_410_NSA_FALLBACK_ROW = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [{"ca": 0, "network_type": 51, "band": 3, "earfcn": 1700, "pci": 61, "bandwidth": 20,
                "rsrp": -97, "rsrq": -9, "rssi": -67, "sinr": 17, "rsrp_level": 4, "strength": 4}],
    "ret": 0, "resp": "Success",
}
# No service (slot 2, no SIM registered): the sentinel payload.
CELL_INFO_410_NO_SERVICE = {
    "bus": "cpu", "slot": 2, "network_type": 0, "tac": "", "cell_id": "",
    "signal": [{"band": 0, "earfcn": 0, "pci": 0, "bandwidth": 0,
                "rsrp": -32768, "rsrq": -32768, "rssi": -32768, "sinr": -32768}],
    "ret": 0, "resp": "Success",
}
# cellular.network info — carrier + identity per {bus,slot} (the ws merge source).
NETWORK_INFO_410 = {"networks": [
    {"bus": "cpu", "slot": 1, "carrier": "CHN-UNICOM", "iccid": "8986011", "imsi": "460011",
     "mcc": "460", "mnc": "01", "apn": "3gnet"},
    {"bus": "cpu", "slot": 2, "carrier": "", "iccid": ""},
]}


class BuildSample(unittest.TestCase):
    def test_sa_sample_has_pcc_aliases_and_signals(self):
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_SA, NETWORK_INFO_410, t=1000)
        self.assertEqual(s["slot"], 1)
        self.assertEqual(s["id"], "DE017C015")
        self.assertEqual(s["cell_id"], "DE017C015")
        self.assertEqual(s["tac"], "DE0000")
        self.assertEqual(s["carrier"], "CHN-UNICOM")
        self.assertEqual(s["band"], 78)
        self.assertEqual(s["mode"], "NR5G-SA")
        self.assertEqual(s["rat"], "NR5G-SA")
        self.assertEqual(s["network_type"], 5)
        self.assertEqual(s["tx_channel"], 627264)
        self.assertEqual(s["pci"], 142)
        self.assertEqual(s["dl_bandwidth"], "100MHz")
        self.assertEqual(s["rsrp"], -94)
        self.assertEqual(s["rsrq"], -10)
        self.assertEqual(s["sinr"], 12)
        self.assertIsNone(s["rssi"], "-32768 sentinel -> null, never a number")
        self.assertEqual(s["rsrp_level"], 4)
        self.assertEqual(len(s["signals"]), 1)
        self.assertEqual(s["signals"][0]["role"], "PCC")
        self.assertEqual(s["signals"][0]["bandwidth_mhz"], 100)
        self.assertTrue(s["registered"])

    def test_picks_the_built_in_modem_by_bus(self):
        s = collectd.build_sample(MODEM_STATUS_410_TWO, CELL_INFO_410_SA, NETWORK_INFO_410, t=1)
        self.assertEqual(s["slot"], 1)

    def test_flat_object_is_not_a_modem_list(self):
        # No second shape: a payload without modems[] resolves no slot.
        self.assertIsNone(collectd.build_sample({"bus": "cpu", "current_sim_slot": 1}, CELL_INFO_410_SA, NETWORK_INFO_410))

    def test_nsa_decodes_51_and_keeps_rssi(self):
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_NSA, NETWORK_INFO_410, t=1)
        self.assertEqual(s["mode"], "NR5G-NSA")          # the CELL's RAT
        self.assertEqual(s["band"], 3)
        self.assertEqual(s["rssi"], -67)
        self.assertEqual(s["id"], "DF30C")

    def test_nsa_anchor_row_is_lte_not_nr(self):
        # Issue #5 capture: cell network_type 51, signal[0] = the LTE B3 anchor
        # (EARFCN 1700) with no per-row network_type. It must be tagged LTE —
        # GL keys the n/B prefix off the ROW — never inherit the cell's 51
        # (which printed "n3" and decoded 1700 on the NR raster as 8.5 MHz).
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_NSA, NETWORK_INFO_410, t=1)
        self.assertEqual(s["signals"][0]["rat"], "LTE")
        self.assertEqual(s["signals"][0]["network_type"], 4)
        self.assertEqual(s["pcc_rat"], "LTE", "flattened aliases describe the LTE anchor")
        self.assertEqual(s["pcc_network_type"], 4)
        self.assertEqual(s["mode"], "NR5G-NSA", "the cell is still EN-DC")
        self.assertEqual(cc.format_band(s["pcc_rat"], s["band"]), "B3")
        self.assertAlmostEqual(cc.channel_mhz(s["pcc_rat"], s["band"], s["tx_channel"]), 1855.0)

    def test_nsa_full_410_shape_anchor_lte_leg_nsa(self):
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_NSA_FULL, NETWORK_INFO_410, t=1)
        self.assertEqual(s["mode"], "NR5G-NSA")
        self.assertEqual([x["rat"] for x in s["signals"]], ["LTE", "NR5G-NSA"])
        self.assertEqual([x["role"] for x in s["signals"]], ["PCC", "SCC1"])
        self.assertEqual((s["band"], s["pci"], s["tx_channel"], s["pcc_rat"]), (3, 61, 1700, "LTE"))
        self.assertEqual((s["signals"][1]["band"], s["signals"][1]["pci"]), (78, 142))
        self.assertIsNone(s["signals"][1]["rssi"], "-32768 sentinel -> null")

    def test_nsa_fallback_row_tagged_51_but_on_an_eutra_channel_is_lte(self):
        # GL stamps the cell's 51 onto a row that is really the LTE anchor when
        # QCAINFO gave no carriers; EARFCN 1700 cannot be an NR-ARFCN.
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_NSA_FALLBACK_ROW, NETWORK_INFO_410, t=1)
        self.assertEqual(s["mode"], "NR5G-NSA")
        self.assertEqual(s["signals"][0]["rat"], "LTE")
        self.assertEqual(s["signals"][0]["network_type"], 4)
        self.assertEqual(s["pcc_rat"], "LTE")
        self.assertEqual(cc.format_band(s["pcc_rat"], s["band"]), "B3")

    def test_nsa_implicit_nr_row_keeps_the_nsa_tag(self):
        # An EN-DC secondary carrier without its own network_type: its channel
        # is an NR-ARFCN (>> 65535), so it is the NR leg, tagged with the cell's 51.
        net = dict(CELL_INFO_410_NSA, signal=[
            dict(CELL_INFO_410_NSA["signal"][0], ca=0),
            {"ca": 1, "band": 78, "earfcn": 627264, "pci": 142, "rsrp": -99, "rsrq": -11, "sinr": 8},
        ])
        s = collectd.build_sample(MODEM_STATUS_410, net, NETWORK_INFO_410, t=1)
        self.assertEqual([x["rat"] for x in s["signals"]], ["LTE", "NR5G-NSA"])
        self.assertEqual(s["signals"][1]["network_type"], 51)

    def test_pci_zero_and_earfcn_zero_are_kept(self):
        # PCI 0 (LTE 0-503) and EARFCN 0 (LTE B1, 2110.0 MHz) are valid; band 0 is not.
        net = dict(CELL_INFO_410_SA, network_type=4, signal=[
            {"band": 1, "earfcn": 0, "pci": 0, "bandwidth": 20, "rsrp": -90, "rsrq": -9, "sinr": 10}])
        s = collectd.build_sample(MODEM_STATUS_410, net, NETWORK_INFO_410, t=1)
        self.assertEqual(s["pci"], 0)
        self.assertEqual(s["tx_channel"], 0)
        self.assertEqual(s["band"], 1)
        self.assertTrue(s["registered"])
        self.assertEqual(len(s["signals"]), 1)

    def test_id_comes_from_cell_info_not_signal(self):
        net = dict(CELL_INFO_410_NSA)
        net["signal"] = [dict(CELL_INFO_410_NSA["signal"][0], id="WRONG")]
        s = collectd.build_sample(MODEM_STATUS_410, net, NETWORK_INFO_410, t=1)
        self.assertEqual(s["id"], "DF30C")

    def test_ca_preserves_every_carrier_with_roles(self):
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_NSA_CA, NETWORK_INFO_410, t=1)
        self.assertEqual([x["role"] for x in s["signals"]], ["PCC", "SCC1"])
        self.assertEqual(s["signals"][1]["rat"], "NR5G-SA")   # per-row network_type honoured
        self.assertEqual(s["signals"][1]["band"], 78)
        self.assertEqual(s["band"], 3, "flattened aliases are the PCC")

    def test_no_service_normalizes_to_nulls_and_empty_signals(self):
        modem2 = {"modems": [dict(MODEM_STATUS_410["modems"][0], current_sim_slot=2)]}
        s = collectd.build_sample(modem2, CELL_INFO_410_NO_SERVICE, NETWORK_INFO_410, t=1)
        self.assertIsNotNone(s, "still a sample (gap), not dropped")
        self.assertEqual(s["slot"], 2)
        self.assertFalse(s["registered"])
        self.assertIsNone(s["mode"])
        self.assertIsNone(s["network_type"])
        self.assertIsNone(s["id"])
        self.assertIsNone(s["band"])
        self.assertIsNone(s["tx_channel"])
        self.assertIsNone(s["rsrp"])
        self.assertEqual(s["signals"], [])

    def test_empty_signal_is_a_gap_sample(self):
        net = dict(CELL_INFO_410_SA, signal=[], cell_id=None)
        s = collectd.build_sample(MODEM_STATUS_410, net, NETWORK_INFO_410, t=1)
        self.assertIsNotNone(s)
        self.assertIsNone(s["rsrp"])
        self.assertEqual(s["slot"], 1)

    def test_no_active_slot_returns_none(self):
        self.assertIsNone(collectd.build_sample({"modems": [{"bus": "cpu"}]}, CELL_INFO_410_SA, NETWORK_INFO_410))
        self.assertIsNone(collectd.build_sample({}, CELL_INFO_410_SA, NETWORK_INFO_410))
        self.assertIsNone(collectd.build_sample(None, CELL_INFO_410_SA, NETWORK_INFO_410))

    def test_network_type_enum_matches_gl_and_the_captures(self):
        cc = collectd.cc
        self.assertEqual([cc.NETWORK_TYPE[k] for k in (1, 2, 3, 4, 41, 5, 51, 6)],
                         ["GSM", "2G", "3G", "LTE", "LTE+", "NR5G-SA", "NR5G-NSA", "EVDO"])
        self.assertIsNone(cc.NETWORK_TYPE[0])

    def test_unknown_network_type_is_labelled_not_invented(self):
        net = dict(CELL_INFO_410_SA, network_type=7)
        s = collectd.build_sample(MODEM_STATUS_410, net, NETWORK_INFO_410, t=1)
        self.assertEqual(s["mode"], "type 7")
        self.assertEqual(s["network_type"], 7)

    def test_sample_is_stamped_with_box_clock_when_t_omitted(self):
        s = collectd.build_sample(MODEM_STATUS_410, CELL_INFO_410_SA, NETWORK_INFO_410)
        self.assertIsInstance(s["t"], int)
        self.assertGreater(s["t"], 1_600_000_000_000)


class UbusCall(unittest.TestCase):
    def test_passes_json_arg(self):
        seen = {}

        def fake_run(cmd, **_kw):
            seen["cmd"] = cmd

            class R:
                returncode = 0
                stdout = '{"ok":1}'
            return R()

        old = collectd.subprocess.run
        collectd.subprocess.run = fake_run
        try:
            r = collectd.ubus_call("cellular.network", "cell_info", {"bus": "cpu", "slot": 1})
        finally:
            collectd.subprocess.run = old
        self.assertEqual(r, {"ok": 1})
        self.assertEqual(seen["cmd"][:4], ["ubus", "call", "cellular.network", "cell_info"])
        self.assertEqual(json.loads(seen["cmd"][4]), {"bus": "cpu", "slot": 1})


class CollectSample(unittest.TestCase):
    def _run(self, table, calls):
        def fake(obj, method, args=None):
            calls.append((obj, method, args))
            return table.get((obj, method))
        old = collectd.ubus_call
        collectd.ubus_call = fake
        collectd._carrier = collectd.CarrierCache()
        try:
            return collectd.collect_sample()
        finally:
            collectd.ubus_call = old

    def test_one_cell_info_per_tick_no_arg_status(self):
        calls = []
        s = self._run({("cellular.modem", "status"): MODEM_STATUS_410,
                       ("cellular.network", "cell_info"): CELL_INFO_410_SA,
                       ("cellular.network", "info"): NETWORK_INFO_410}, calls)
        self.assertEqual(s["id"], "DE017C015")
        self.assertEqual(s["carrier"], "CHN-UNICOM")
        st = [c for c in calls if c[1] == "status"]
        self.assertIn(st[0][2], (None, {}), "status is GL's no-arg form")
        cell = [c for c in calls if c[1] == "cell_info"]
        self.assertEqual(len(cell), 1, "exactly one AT-backed cell_info per tick")
        self.assertEqual(cell[0][2], {"bus": "cpu", "slot": 1})
        self.assertFalse(any(c[0] == "cellular.sim" for c in calls), "no sim status read")

    def test_carrier_is_cached_across_ticks(self):
        calls = []
        table = {("cellular.modem", "status"): MODEM_STATUS_410,
                 ("cellular.network", "cell_info"): CELL_INFO_410_SA,
                 ("cellular.network", "info"): NETWORK_INFO_410}
        self._run(table, calls)
        # second tick, same cache object
        def fake(obj, method, args=None):
            calls.append((obj, method, args))
            return table.get((obj, method))
        old = collectd.ubus_call
        collectd.ubus_call = fake
        try:
            collectd.collect_sample()
        finally:
            collectd.ubus_call = old
        self.assertEqual(len([c for c in calls if c[1] == "info"]), 1, "info read once, then cached")
        self.assertEqual(len([c for c in calls if c[1] == "cell_info"]), 2)

    def test_no_active_slot_skips_cell_info(self):
        calls = []
        s = self._run({("cellular.modem", "status"): {"modems": [{"bus": "cpu"}]}}, calls)
        self.assertIsNone(s)
        self.assertFalse(any(c[1] == "cell_info" for c in calls))


class WsGate(unittest.TestCase):
    """ws_attached(): probe gl-session has_websocket on a cadence; skip pushes
    while nobody is attached; a failed probe counts as attached."""
    def _probe(self, reply, rc=0):
        old_run = collectd.subprocess.run
        calls = []

        def fake_run(cmd, **_kw):
            calls.append(cmd)

            class R:
                returncode = rc
                stdout = reply
                stderr = ""
            return R()
        collectd.subprocess.run = fake_run
        return calls, old_run

    def setUp(self):
        collectd._ws_gate.update({"attached": True, "at": 0.0})

    def test_no_browser_means_no_push_until_the_next_probe(self):
        calls, old = self._probe('{"has_ws": false}')
        try:
            self.assertFalse(collectd.ws_attached(now=1000.0))
            self.assertEqual(calls[-1][:4], ["ubus", "call", "gl-session", "has_websocket"])
            n = len(calls)
            self.assertFalse(collectd.ws_attached(now=1000.0 + collectd.WS_PROBE_IDLE_S - 1), "cached")
            self.assertEqual(len(calls), n, "no second probe inside the idle cadence")
            self.assertFalse(collectd.ws_attached(now=1000.0 + collectd.WS_PROBE_IDLE_S + 1))
            self.assertEqual(len(calls), n + 1, "re-probed after the idle cadence")
        finally:
            collectd.subprocess.run = old

    def test_browser_present_pushes_and_probes_less_often(self):
        calls, old = self._probe('{"has_ws": true}')
        try:
            self.assertTrue(collectd.ws_attached(now=2000.0))
            n = len(calls)
            self.assertTrue(collectd.ws_attached(now=2000.0 + collectd.WS_PROBE_IDLE_S + 5), "still cached: attached cadence is longer")
            self.assertEqual(len(calls), n)
            self.assertTrue(collectd.ws_attached(now=2000.0 + collectd.WS_PROBE_ATTACHED_S + 1))
            self.assertEqual(len(calls), n + 1)
        finally:
            collectd.subprocess.run = old

    def test_probe_failure_counts_as_attached(self):
        # gl-session down must surface as logged push failures, never as silence.
        calls, old = self._probe("Command failed: Not found", rc=4)
        try:
            self.assertTrue(collectd.ws_attached(now=3000.0))
        finally:
            collectd.subprocess.run = old


class WsPublish(unittest.TestCase):
    def _capture(self, name, payload):
        seen = {}
        old_run = collectd.subprocess.run

        def fake_run(cmd, **_kw):
            seen["cmd"] = cmd

            class R:
                returncode = 0
                stdout = ""
            return R()
        collectd.subprocess.run = fake_run
        try:
            ok = collectd.ws_publish(name, payload)
        finally:
            collectd.subprocess.run = old_run
        return ok, seen["cmd"]

    def test_notifies_gl_session_unconditionally(self):
        ok, cmd = self._capture(collectd.WS_NAME, {"t": 1, "rsrp": -94})
        self.assertTrue(ok)
        self.assertEqual(cmd[:4], ["ubus", "call", "gl-session", "notify"])
        msg = json.loads(cmd[4])
        self.assertEqual(msg["name"], "mudimodem.collect")
        self.assertEqual(msg["data"]["rsrp"], -94)

    def test_nonzero_exit_is_a_logged_failure(self):
        # gl-session's notify returns 0 even with no browser attached, so a
        # non-zero rc is always a fault: report False AND say so on stderr
        # (procd forwards it to logd) — never a silent True.
        import io
        old_run, old_err = collectd.subprocess.run, sys.stderr
        collectd._ws_fail["n"] = 0

        def failing_run(cmd, **_kw):
            class R:
                returncode = 4
                stdout = ""
                stderr = "Command failed: Not found"
            return R()
        collectd.subprocess.run = failing_run
        sys.stderr = io.StringIO()
        try:
            ok = collectd.ws_publish(collectd.WS_NAME, {"t": 1})
            logged = sys.stderr.getvalue()
        finally:
            collectd.subprocess.run, sys.stderr = old_run, old_err
        self.assertFalse(ok)
        self.assertIn("gl-session notify failed", logged)
        self.assertIn("Not found", logged)
        self.assertEqual(collectd._ws_fail["n"], 1)
        collectd._ws_fail["n"] = 0

    def test_battery_frames_use_their_own_name(self):
        _, cmd = self._capture(collectd.WS_BATT_NAME, {"t": 1, "cap": 80})
        self.assertEqual(json.loads(cmd[4])["name"], "mudimodem.battery")

    def test_push_names_are_subscribed_by_the_menu(self):
        with open(os.path.join(HERE, "..", "src", "menu", "mudimodem.json")) as f:
            socks = json.load(f)["global_sockets"]
        for n in (collectd.WS_NAME, collectd.WS_BATT_NAME, "mudimodem.event"):
            self.assertIn(n, socks)


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

    def test_scrubs_a_torn_tail_line_and_tolerates_missing_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            with open(p, "w") as f:
                f.write('{"t":9000}\n')
                f.write('{"t":9500}\n')
                f.write('{"t":96')                     # torn by a crash mid-append
            collectd.trim(p, max_age_ms=5000, max_lines=100, ref_ms=10000)
            kept = [json.loads(l)["t"] for l in open(p)]
            self.assertEqual(kept, [9000, 9500])
            collectd.trim(os.path.join(d, "absent.jsonl"), 5000, 100)  # no raise

    def test_malformed_head_lines_are_dropped_with_the_old_ones(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            with open(p, "w") as f:
                f.write("not json\n")
                f.write('{"t":1000}\n')
                f.write('{"t":9000}\n')
            collectd.trim(p, max_age_ms=5000, max_lines=100, ref_ms=10000)
            kept = [json.loads(l)["t"] for l in open(p)]
            self.assertEqual(kept, [9000])

    def test_nothing_to_drop_means_no_rewrite(self):
        # The steady-state cost: parse the head until the first young line, then
        # leave the file untouched (same inode, same mtime).
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            self._write(p, [9000, 9500, 9900])
            os.utime(p, (1, 1))
            st0 = os.stat(p)
            collectd.trim(p, max_age_ms=5000, max_lines=100, ref_ms=10000)
            st1 = os.stat(p)
            self.assertEqual((st0.st_ino, st0.st_mtime), (st1.st_ino, st1.st_mtime), "untouched")


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


class HistoryPersist(unittest.TestCase):
    """eMMC backup helpers — approach #2 (RAM live + batched append flush)."""

    def test_read_history_config_defaults_disabled(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "missing.json")
            self.assertEqual(collectd.read_history_config(p), {"enabled": False})
            with open(p, "w") as f:
                f.write('{"enabled":false}\n')
            self.assertEqual(collectd.read_history_config(p), {"enabled": False})
            with open(p, "w") as f:
                f.write('{"enabled":true}\n')
            self.assertEqual(collectd.read_history_config(p), {"enabled": True})
            with open(p, "w") as f:
                f.write("not json")
            self.assertEqual(collectd.read_history_config(p), {"enabled": False})

    def test_flush_new_lines_appends_only_newer(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = os.path.join(d, "tmp.jsonl")
            pst = os.path.join(d, "persist.jsonl")
            with open(tmp, "w") as f:
                for t in (1000, 2000, 3000):
                    f.write(json.dumps({"t": t, "rsrp": -100}) + "\n")
            # First flush: everything
            since = collectd.flush_new_lines(tmp, pst, 0)
            self.assertEqual(since, 3000)
            kept = [json.loads(l)["t"] for l in open(pst)]
            self.assertEqual(kept, [1000, 2000, 3000])
            # Second flush with no new tmp lines: no growth
            since2 = collectd.flush_new_lines(tmp, pst, since)
            self.assertEqual(since2, 3000)
            self.assertEqual(sum(1 for _ in open(pst)), 3)
            # New samples in tmp
            with open(tmp, "a") as f:
                f.write(json.dumps({"t": 4000, "rsrp": -90}) + "\n")
            since3 = collectd.flush_new_lines(tmp, pst, since2)
            self.assertEqual(since3, 4000)
            kept = [json.loads(l)["t"] for l in open(pst)]
            self.assertEqual(kept, [1000, 2000, 3000, 4000])

    def test_seed_tmp_from_persist_only_when_tmp_empty(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = os.path.join(d, "tmp.jsonl")
            pst = os.path.join(d, "persist.jsonl")
            with open(pst, "w") as f:
                f.write(json.dumps({"t": 50, "cap": 70}) + "\n")
            self.assertTrue(collectd.seed_tmp_from_persist(tmp, pst))
            self.assertEqual(json.loads(open(tmp).read())["t"], 50)
            # Non-empty tmp must not be overwritten
            with open(tmp, "w") as f:
                f.write(json.dumps({"t": 99, "cap": 80}) + "\n")
            self.assertFalse(collectd.seed_tmp_from_persist(tmp, pst))
            self.assertEqual(json.loads(open(tmp).read())["t"], 99)

    def test_max_t_in_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.jsonl")
            self.assertEqual(collectd.max_t_in_file(p), 0)
            with open(p, "w") as f:
                for t in (5, 50, 20):
                    f.write(json.dumps({"t": t}) + "\n")
            self.assertEqual(collectd.max_t_in_file(p), 50)

    def test_maybe_flush_respects_disabled_config(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = os.path.join(d, "history.json")
            with open(cfg, "w") as f:
                f.write('{"enabled":false}\n')
            old = collectd.HISTORY_CFG
            collectd.HISTORY_CFG = cfg
            try:
                tmp = os.path.join(d, "tmp.jsonl")
                with open(tmp, "w") as f:
                    f.write(json.dumps({"t": 1}) + "\n")
                cursors = {"samples": 0, "battery": 0}
                en = collectd.maybe_flush_persist(
                    tmp, tmp, os.path.join(d, "persist"), cursors)
                self.assertFalse(en)
                self.assertFalse(os.path.exists(
                    os.path.join(d, "persist", "samples.jsonl")))
            finally:
                collectd.HISTORY_CFG = old


if __name__ == "__main__":
    unittest.main()
