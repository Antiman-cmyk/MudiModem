"""Tests for mudimodem-collectd — stdlib unittest (no pytest on the box)."""
import importlib.machinery
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "sbin", "mudimodem-collectd")
sys.path.insert(0, os.path.join(HERE, "..", "src", "lib"))
loader = importlib.machinery.SourceFileLoader("collectd", SRC)
spec = importlib.util.spec_from_loader("collectd", loader)
collectd = importlib.util.module_from_spec(spec)
loader.exec_module(collectd)


class TestConstants(unittest.TestCase):
    def test_cadence_default_is_10s_not_4(self):
        # 4.10: cell_info executes QENG/QCAINFO per call — 10 s is GL's own
        # signal-log cadence and the budget verify.sh asserts (<=6 reads/min).
        self.assertEqual(collectd.POLL_INTERVAL, 10.0)

    def test_retention_cap_preserves_24h_at_10s(self):
        self.assertGreaterEqual(collectd.SAMPLE_MAX_LINE, 8640)

    def test_ws_push_name_matches_menu_socket(self):
        with open(os.path.join(HERE, "..", "src", "menu", "mudimodem.json")) as f:
            menu = json.load(f)
        self.assertIn(collectd.WS_NAME, menu["global_sockets"])


class TestWriteLatest(unittest.TestCase):
    def test_writes_valid_json_atomically(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "latest.json")
        collectd.write_latest(p, {"rsrp": -101, "band": 71})
        with open(p) as f:
            obj = json.load(f)
        self.assertEqual(obj["band"], 71)
        self.assertFalse(os.path.exists(p + ".tmp"))


if __name__ == "__main__":
    unittest.main()
