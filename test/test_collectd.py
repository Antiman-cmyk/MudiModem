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

    def test_publish_drops_a_stalled_client_without_blocking(self):
        # Regression: a connected client that never recv()s must not be able
        # to freeze publish() (and therefore the whole poll loop) forever.
        saved_timeout = collectd.CLIENT_SEND_TIMEOUT
        collectd.CLIENT_SEND_TIMEOUT = 0.2             # force a fast, deterministic timeout
        bc = collectd.Broadcaster(self._sock())
        bc.start()
        c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            c.connect(bc.path)
            time.sleep(0.05)                            # let accept register the client
            # c never calls recv() — its kernel receive buffer fills and stays
            # full, so a large-enough sendall() from the server blocks.
            payload = json.dumps({"pad": "x" * (8 * 1024 * 1024)})  # 8MB >> default AF_UNIX buffers

            start = time.time()
            bc.publish(payload)
            elapsed = time.time() - start

            self.assertLess(elapsed, 2.0)                # must not hang the poll loop
            self.assertNotIn(c, bc._clients)              # stalled client dropped
        finally:
            collectd.CLIENT_SEND_TIMEOUT = saved_timeout
            c.close()
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


if __name__ == "__main__":
    unittest.main()
