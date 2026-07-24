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
