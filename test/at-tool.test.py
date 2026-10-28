#!/usr/bin/env python3
"""Local tests for tools/mudimodem-at.py. No modem needed: a pty plays the
modem (raw mode, so no line-discipline mangling; the tool never does termios,
matching the real /dev/at_mdm0 which is not a tty)."""
import contextlib, importlib.util, io, json, os, subprocess, sys, tempfile, threading, time, tty, unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")
TOOL = os.path.join(ROOT, "tools", "mudimodem-at.py")

spec = importlib.util.spec_from_file_location("mudimodem_at", TOOL)
mm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mm)


class FakeModem:
    """Answers the first AT command written to the pty with a canned reply."""
    def __init__(self, reply=b"\r\nOK\r\n", delay=0.0):
        self.master, self.slave = os.openpty()
        tty.setraw(self.slave)
        self.path = os.ttyname(self.slave)
        self.reply, self.delay, self.loop = reply, delay, False
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
                buf = buf.split(b"\r", 1)[1]
                if self.delay:
                    time.sleep(self.delay)
                if self.reply:
                    os.write(self.master, self.reply)
                if not self.loop:
                    return


class ScriptedModem(FakeModem):
    """Answers each command from a script {cmd: (reply, delay_s)}, in order,
    like a modem that queues: a slow reply holds up everything behind it.
    Unscripted commands get a plain OK. Records every command it received."""
    def __init__(self, script):
        self.script, self.got = script, []
        FakeModem.__init__(self, reply=None)

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


SCAN = "AT+QSCAN=3,1"
SCAN_REPLY = b'\r\n+QSCAN: "NR5G",310,260,520110,41,-95\r\n\r\nOK\r\n'
CSQ_REPLY = b"\r\n+CSQ: 20,99\r\n\r\nOK\r\n"


class LateReplies(unittest.TestCase):
    """A reply that arrives after its command timed out must never be read as
    the next command's answer (the port pairs replies by order only)."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.lock = os.path.join(self.tmp, "at.lock")
        self.marker = os.path.join(self.tmp, "at.inflight")

    def _timed_out_scan(self, fm, timeout=0.4):
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send(SCAN, timeout=timeout)
        finally:
            ch.close()
        self.assertEqual(kind, "timeout")
        self.assertTrue(os.path.exists(self.marker), "a timed-out command leaves its reply owed")

    def test_late_reply_is_discarded_not_returned_for_the_next_command(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 1.0), "AT+CSQ": (CSQ_REPLY, 0)})
        self._timed_out_scan(fm)
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send("AT+CSQ", timeout=3)
        finally:
            ch.close()
        self.assertEqual(kind, "ok")
        self.assertIn("+CSQ: 20,99", text)
        self.assertNotIn("+QSCAN:", text, "the scan's late reply was attributed to AT+CSQ")
        self.assertIn("discarded a late reply", text.splitlines()[0])
        self.assertIn(SCAN, text.splitlines()[0])
        self.assertFalse(os.path.exists(self.marker))

    def test_owed_reply_still_running_means_busy_and_nothing_is_sent(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 5.0)})
        self._timed_out_scan(fm, timeout=0.3)
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            with self.assertRaises(mm.ChannelBusy) as cm:
                ch.send("AT+CSQ", timeout=1)
        finally:
            ch.close()
        self.assertIn(SCAN, str(cm.exception))
        self.assertEqual(fm.got, [SCAN], "AT+CSQ must not be written while the scan's reply is owed")
        self.assertTrue(os.path.exists(self.marker), "still owed")

    def test_cli_envelope_reports_busy_with_a_reason(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 5.0)})
        self._timed_out_scan(fm, timeout=0.3)
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "1",
             "--port", fm.path, "--lock", self.lock, "--", "AT+CSQ"],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 2, r.stderr)
        lines = r.stdout.splitlines()
        self.assertRegex(lines[0], r"^MM-AT:busy:\d+$")
        self.assertIn(SCAN, lines[1])
        self.assertEqual(len(lines), 2)

    def test_cli_envelope_keeps_its_format_with_the_note(self):
        fm = ScriptedModem({SCAN: (SCAN_REPLY, 1.0), "AT+CSQ": (CSQ_REPLY, 0)})
        self._timed_out_scan(fm)
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "3",
             "--port", fm.path, "--lock", self.lock, "--", "AT+CSQ"],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 0, r.stderr)
        first, _, rest = r.stdout.partition("\n")
        self.assertRegex(first, r"^MM-AT:ok:\d+:1/1$")
        self.assertTrue(rest.startswith("[mudimodem-at] discarded a late reply"))
        self.assertIn("+CSQ: 20,99", rest)
        self.assertNotIn("+QSCAN:", rest)

    def test_reply_owed_past_its_limit_is_taken_as_lost(self):
        fm = ScriptedModem({"AT+CSQ": (CSQ_REPLY, 0)})
        with open(self.marker, "w") as f:
            json.dump({"cmd": "AT+COPS=?", "sent": time.monotonic() - 1000, "owed_s": 180}, f)
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send("AT+CSQ", timeout=0.5)
        finally:
            ch.close()
        self.assertEqual(kind, "ok")
        self.assertIn("never arrived", text.splitlines()[0])
        self.assertIn("+CSQ: 20,99", text)
        self.assertFalse(os.path.exists(self.marker))

    def test_answered_commands_owe_nothing(self):
        fm = ScriptedModem({"AT+BAD": (b"\r\nERROR\r\n", 0)})
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            self.assertEqual(ch.send("AT", timeout=2)[1], "ok")
            self.assertFalse(os.path.exists(self.marker))
            self.assertEqual(ch.send("AT+BAD", timeout=2)[1], "error")
            self.assertFalse(os.path.exists(self.marker))
        finally:
            ch.close()

    def test_unsendable_command_owes_nothing(self):
        fm = FakeModem()
        orig = mm.os.write

        def boom(fd, data):
            raise OSError("simulated write failure")
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        mm.os.write = boom
        try:
            with self.assertRaises(OSError):
                ch.send("AT", timeout=1)
        finally:
            mm.os.write = orig
            ch.close()
        self.assertFalse(os.path.exists(self.marker))

    def test_long_commands_are_owed_longer(self):
        self.assertEqual(mm.owed_s("at+qscan=3,1"), 600)
        self.assertEqual(mm.owed_s("AT+CSQ"), mm.OWED_DEFAULT_S)
        # port-bridge drains at_mdm0 between our invocations, so an ordinary
        # timeout must not lock the console for minutes; only the known
        # minutes-long network commands keep a long window.
        self.assertLessEqual(mm.OWED_DEFAULT_S, 30)
        self.assertEqual(mm.owed_s("AT+COPS=?"), 180)
        self.assertEqual(mm.owed_s("at+cgatt=1"), 180)


class ATToolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.lock = os.path.join(self.tmp, "at.lock")

    def test_send_ok_sees_terminator(self):
        fm = FakeModem(b"\r\n+QSPN: \"T-Mobile\"\r\n\r\nOK\r\n")
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send("AT+QSPN", timeout=3)
        finally:
            ch.close()
        self.assertEqual(kind, "ok", "OK terminator must classify as ok")
        self.assertIn("T-Mobile", text)

    def test_send_error_terminator_is_kind_error(self):
        fm = FakeModem(b"\r\nERROR\r\n")
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send("AT+BAD", timeout=3)
        finally:
            ch.close()
        self.assertEqual(kind, "error", "ERROR terminator must classify as error")

    def test_send_timeout_reports_no_terminator(self):
        fm = FakeModem(reply=b"")           # never answers
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            text, kind = ch.send("AT", timeout=0.4)
        finally:
            ch.close()
        self.assertEqual(kind, "timeout")
        self.assertEqual(text, "")

    def test_lines_filters_urcs(self):
        fm = FakeModem(b"\r\n+QIND: SMS DONE\r\n+QSPN: \"T\"\r\nOK\r\n")
        ch = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            out = ch.lines("AT+QSPN", timeout=3)
        finally:
            ch.close()
        self.assertNotIn("+QIND: SMS DONE", out)
        self.assertTrue(any("QSPN" in l for l in out))
        self.assertIn("OK", out)

    def test_flock_busy(self):
        fm = FakeModem()
        holder = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            with self.assertRaises(mm.ChannelBusy):
                mm.ATChannel(port=fm.path, lock=self.lock, lock_wait=0.3)
        finally:
            holder.close()

    def test_cli_envelope_ok(self):
        fm = FakeModem(b"\r\nRG650VNA\r\n\r\nOK\r\n")
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "3",
             "--port", fm.path, "--lock", self.lock, "ATI"],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 0, r.stderr)
        first, _, rest = r.stdout.partition("\n")
        self.assertRegex(first, r"^MM-AT:ok:\d+:1/1$")
        self.assertIn("RG650VNA", rest)
        self.assertIn("OK", rest)

    def test_cli_envelope_multistep_ok(self):
        # A modem that answers EVERY command with OK (serves in a loop).
        fm = FakeModem(b"\r\nOK\r\n"); fm.loop = True
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "3",
             "--port", fm.path, "--lock", self.lock,
             "AT+ONE", "AT+TWO"],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 0, r.stderr)
        heads = [l for l in r.stdout.splitlines() if l.startswith("MM-AT:")]
        self.assertRegex(heads[0], r"^MM-AT:ok:\d+:1/2$")
        self.assertRegex(heads[1], r"^MM-AT:ok:\d+:2/2$")

    def test_cli_envelope_stop_on_error(self):
        # First command ERRORs -> second must never run (no 2/2 frame).
        fm = FakeModem(b"\r\nERROR\r\n"); fm.loop = True
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "3",
             "--port", fm.path, "--lock", self.lock,
             "AT+BAD", "AT+NEVER"],
            capture_output=True, text=True, timeout=15)
        heads = [l for l in r.stdout.splitlines() if l.startswith("MM-AT:")]
        self.assertRegex(heads[0], r"^MM-AT:error:\d+:1/2$")
        self.assertEqual(len(heads), 1, "no frame after an errored step")

    def test_cli_end_of_options_sentinel(self):
        # After `--`, a flag-looking token is a COMMAND, not a flag. Without the
        # sentinel the old parser reads `--timeout` as the timeout flag and
        # consumes the (missing) next arg -> crash; with it both tokens run.
        fm = FakeModem(b"\r\nOK\r\n"); fm.loop = True
        r = subprocess.run(
            [sys.executable, TOOL, "--envelope", "--timeout", "3",
             "--port", fm.path, "--lock", self.lock,
             "--", "AT+ONE", "--timeout"],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 0, r.stderr)
        heads = [l for l in r.stdout.splitlines() if l.startswith("MM-AT:")]
        self.assertEqual(len(heads), 2, "both post-sentinel tokens run as commands")
        self.assertRegex(heads[1], r"^MM-AT:ok:\d+:2/2$")

    def test_cli_envelope_busy(self):
        fm = FakeModem()
        holder = mm.ATChannel(port=fm.path, lock=self.lock)
        try:
            r = subprocess.run(
                [sys.executable, TOOL, "--envelope", "--timeout", "2",
                 "--port", fm.path, "--lock", self.lock, "--lock-wait", "0.3",
                 "AT"],
                capture_output=True, text=True, timeout=15)
        finally:
            holder.close()
        self.assertEqual(r.returncode, 2)
        self.assertRegex(r.stdout.splitlines()[0], r"^MM-AT:busy:\d+$")

    def test_write_failure_yields_defined_envelope(self):
        """Fix 2: an OSError from the initial os.write() inside send() must
        not escape main() as a bare traceback — it must still print a
        parseable MM-AT: line and return an exit code in {0,2,3}, and
        specifically openfail/3 since the command was never actually sent."""
        fm = FakeModem()
        orig_write = mm.os.write

        def boom(fd, data):
            raise OSError("simulated write failure")

        mm.os.write = boom
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                rc = mm.main(["--envelope", "--timeout", "2",
                              "--port", fm.path, "--lock", self.lock,
                              "AT"])
        finally:
            mm.os.write = orig_write
        out = buf.getvalue()
        lines = out.splitlines()
        self.assertTrue(lines, "must still print an MM-AT: envelope line")
        self.assertRegex(lines[0], r"^MM-AT:(ok|timeout|busy|openfail):\d+$")
        self.assertIn(rc, (0, 2, 3))
        self.assertEqual(rc, 3, "unsendable command must be openfail, not a silent 0")
        self.assertTrue(lines[0].startswith("MM-AT:openfail:"))


if __name__ == "__main__":
    unittest.main()
