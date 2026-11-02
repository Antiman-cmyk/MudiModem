#!/usr/bin/env python3
"""The AT console's direct-port fallback (src/lib/mudimodemd/atport.lua) under the image's eco,
with a pty playing the modem (raw mode; the real /dev/at_mdm0 is not a tty either). These are the
cases tools/mudimodem-at.py was tested with before R3 ⑤ retired python3: terminators, stop on
error, and late replies — a reply that lands after its command timed out must never be read as
the next command's answer (the port pairs replies by order only).
Skips when the firmware rootfs or qemu is absent (tools/emu.sh check)."""
import json, os, shutil, subprocess, tempfile, threading, time, tty, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
EMU = os.path.join(ROOT, "tools", "emu.sh")
DRIVER = os.path.join(HERE, "emu", "atport-driver.lua")
SCAN = "AT+QSCAN=3,1"
SCAN_REPLY = b'\r\n+QSCAN: "NR5G",310,260,520110,41,-95\r\n\r\nOK\r\n'
CSQ_REPLY = b"\r\n+CSQ: 20,99\r\n\r\nOK\r\n"


def emu_ok():
    return subprocess.run([EMU, "check"], capture_output=True).returncode == 0


def uptime():
    with open("/proc/uptime") as f:
        return float(f.read().split()[0])


class ScriptedModem:
    """Answers each command from a script {cmd: (reply, delay_s)}, in order, like a modem that
    queues: a slow reply holds up everything behind it. Unscripted commands get a plain OK."""
    def __init__(self, script):
        self.script, self.got = script, []
        self.master, self.slave = os.openpty()
        tty.setraw(self.slave)
        self.path = os.ttyname(self.slave)
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        buf = b""
        while True:
            try:
                b = os.read(self.master, 64)
            except OSError:
                return
            if not b:
                return
            buf += b
            while b"\r" in buf:
                line, buf = buf.split(b"\r", 1)
                cmd = line.decode(errors="replace").strip()
                self.got.append(cmd)
                reply, delay = self.script.get(cmd, (b"\r\nOK\r\n", 0))
                if delay:
                    time.sleep(delay)
                os.write(self.master, reply)


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu (tools/emu.sh check)")
class DirectPort(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mm-atport-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.marker = os.path.join(self.tmp, "at.inflight")

    def run_port(self, port, timeout, *cmds):
        out = subprocess.run([EMU, "eco", DRIVER, os.path.join(ROOT, "src", "lib"), port, self.marker,
                              str(timeout)] + list(cmds), capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def test_terminators(self):
        fm = ScriptedModem({"ATI": (b"\r\nQuectel\r\nRG650V\r\n\r\nOK\r\n", 0), "AT+BAD": (b"\r\nERROR\r\n", 0),
                            "AT+CME": (b"\r\n+CME ERROR: 10\r\n", 0), "AT+URC": (b"\r\n+QIND: SMS DONE\r\n\r\nOK\r\n", 0)})
        r = self.run_port(fm.path, 3, "ATI")
        self.assertEqual((r["ok"], r["steps"][0]["status"]), (True, "ok"))
        self.assertIn("RG650V", r["steps"][0]["response"])
        self.assertEqual(self.run_port(fm.path, 3, "AT+BAD")["steps"][0]["status"], "error")
        self.assertEqual(self.run_port(fm.path, 3, "AT+CME")["steps"][0]["status"], "error")
        self.assertEqual(self.run_port(fm.path, 3, "AT+URC")["steps"][0]["status"], "ok")
        self.assertFalse(os.path.exists(self.marker), "answered commands owe nothing")

    def test_no_terminator_is_a_timeout_and_leaves_the_reply_owed(self):
        fm = ScriptedModem({"AT+X": (b"\r\n+PARTIAL: 1\r\n", 0)})
        t0 = time.monotonic()
        r = self.run_port(fm.path, 1, "AT+X")
        self.assertEqual(r["steps"][0]["status"], "timeout")
        self.assertLess(time.monotonic() - t0, 6)
        with open(self.marker) as f:
            m = json.load(f)
        self.assertEqual((m["cmd"], m["owed_s"]), ("AT+X", 15))

    def test_multistep_in_order_and_stop_on_error(self):
        fm = ScriptedModem({"AT+BAD": (b"\r\nERROR\r\n", 0)})
        r = self.run_port(fm.path, 3, "AT+ONE", "AT+TWO")
        self.assertEqual([s["cmd"] for s in r["steps"]], ["AT+ONE", "AT+TWO"])
        self.assertFalse(r["aborted"])
        r = self.run_port(fm.path, 3, "AT+BAD", "AT+NEVER")
        self.assertEqual((r["ran"], r["aborted"]), (1, True))
        self.assertNotIn("AT+NEVER", fm.got, "nothing is sent after the failing step")

    def test_late_reply_is_discarded_not_returned_for_the_next_command(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 1.0), "AT+CSQ": (CSQ_REPLY, 0)})
        self.assertEqual(self.run_port(fm.path, 0.4, SCAN)["steps"][0]["status"], "timeout")
        self.assertTrue(os.path.exists(self.marker))
        r = self.run_port(fm.path, 3, "AT+CSQ")
        text = r["steps"][0]["response"]
        self.assertEqual(r["steps"][0]["status"], "ok")
        self.assertIn("+CSQ: 20,99", text)
        self.assertNotIn("+QSCAN:", text, "the scan's late reply was attributed to AT+CSQ")
        self.assertIn("discarded a late reply", text.splitlines()[0])
        self.assertIn(SCAN, text.splitlines()[0])
        self.assertFalse(os.path.exists(self.marker))

    def test_owed_reply_still_running_means_busy_and_nothing_is_sent(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 6.0)})
        self.run_port(fm.path, 0.4, SCAN)
        r = self.run_port(fm.path, 1, "AT+CSQ")
        self.assertIn("channel busy - still waiting for the reply to " + SCAN, r.get("error", ""))
        self.assertNotIn("AT+CSQ", fm.got, "a command sent now would get the scan's reply")
        self.assertTrue(os.path.exists(self.marker), "still owed")
        with open(self.marker) as f:
            self.assertEqual(json.load(f)["owed_s"], 600, "a scan is owed for GL's own scan timeout")

    def test_reply_owed_past_its_limit_is_taken_as_lost(self):
        fm = ScriptedModem({})
        with open(self.marker, "w") as f:
            json.dump({"cmd": "AT+FOO", "sent": uptime() - 20, "owed_s": 15}, f)
        r = self.run_port(fm.path, 3, "ATI")
        self.assertEqual(r["steps"][0]["status"], "ok")
        self.assertIn("never arrived; taken as lost", r["steps"][0]["response"].splitlines()[0])
        self.assertFalse(os.path.exists(self.marker))

    def test_a_port_that_cannot_be_opened(self):
        r = self.run_port(os.path.join(self.tmp, "no-such-port"), 1, "ATI")
        self.assertIn("cannot open the AT port", r.get("error", ""))
        self.assertFalse(os.path.exists(self.marker), "nothing was sent, nothing is owed")


if __name__ == "__main__":
    unittest.main()
