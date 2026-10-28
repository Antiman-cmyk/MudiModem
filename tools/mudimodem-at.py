#!/usr/bin/env python3
"""MudiModem's own AT channel — an independent, compile-free AT client.

Talks to the modem over /dev/at_mdm0, a free, world-accessible AT port that is
SEPARATE from the port GL's `modem_AT` holds for `cellular_manager`'s polling
(GL 4.10: `cellular_manager` spawns `/usr/bin/modem_AT -B cpu -P <port>` and
drives every AT request of its own through it). Because this is our own
channel, our responses never cross with GL's traffic.

CPython stdlib only (os, select, fcntl). No pyserial, no compiler.

Backend usage (one invocation, one or more commands):
    python3 mudimodem-at.py --envelope --timeout 8 -- 'AT+QSPN'
  stdout, per step:  MM-AT:<status>:<elapsed_ms>:<idx>/<count>   status: ok|error|timeout
                     then the raw response, verbatim (URCs included; may be empty).
                     Step 1's response may START with one `[mudimodem-at] …` note
                     line: a late reply to an earlier timed-out command was
                     discarded, or given up on (see "Late replies" below).
  channel failure:   MM-AT:busy:<ms> | MM-AT:openfail:<ms> as the FIRST line;
                     busy may be followed by ONE human-readable reason line
                     (nothing else follows either)
  exit code:         0 ok/timeout, 2 busy, 3 openfail

Serialization + GL coexistence:
  - fcntl.flock on /tmp/mudimodem/at.lock serializes concurrent invocations
    (nginx runs several workers). Lock not acquired within --lock-wait (5 s)
    => busy.
  - /dev/at_mdm0 is bridged by GL's `port-bridge at_mdm0 at_usb0 0` (the
    USB-AT passthrough). Coexistence is clean; drain-before-send + strict
    terminator matching are the defense against stray bytes.
  - Nothing of GL's is ever stopped or signalled. (1.x SIGSTOPped the 4.8
    `gl_modem` poller; on 4.10 that process does not exist.)

Late replies (a step that timed out):
  A reply is only matched by ORDER — the port echoes nothing we could pair it
  by (`AT&V`: E: 0) — so a reply that arrives after its command timed out
  (AT+QSCAN runs for minutes; the console's deadline is 1..60 s) used to be
  read as the NEXT command's answer, or thrown away by a drain that happened
  to run first. Now every command is recorded next to the flock (at.lock ->
  at.inflight: cmd + send time) before it is written, and cleared once its
  final result code is read, so a command whose reply is still owed outlives
  the invocation (timeout, kill). The next invocation, before sending, reads the channel
  for up to min(2 s, --timeout):
    - the owed reply's final code arrives -> it is discarded, the marker
      cleared, the command sent; step 1's response says so in a note line;
    - nothing final, and the owed command may still be running (younger than
      its owed_s: 600 s for AT+QSCAN, 180 s otherwise) -> NOT sent:
      MM-AT:busy + the reason, so the late reply can never be misread;
    - nothing final, owed_s exceeded -> the reply is taken as lost, the
      command sent, step 1's response says so.

⚠️ Caveats:
  - Open BLOCKING: the SMD channel returns EBUSY on a non-blocking write.
  - /dev/at_mdm0 is NOT a tty, so no termios setup (it's a raw byte stream).
  - No sub_id: the direct port operates in the ACTIVE subscription's context
    only. For per-SIM data (the other SIM's policy_band) the backend uses
    GL's modem.CPU.AT with an explicit sub_id.
  - Writes hit modem NV like any AT path; band/mode changes made here bypass
    GL's config store — use the Bands tab for durable changes.
"""
import fcntl, json, os, select, sys, time

DEFAULT_PORT = "/dev/at_mdm0"
DEFAULT_LOCK = "/tmp/mudimodem/at.lock"
# Unsolicited result codes that arrive unprompted, unrelated to our command.
URC_PREFIXES = ("RDY", "+CPIN:", "+QUSIM:", "+QUSIM", "+CPINDS:", "+QIND:",
                "+CFUN:", "+CGEV:", "+QNETDEVSTATUS:", "POWERED DOWN")
# Late replies (header): how long to read for an owed reply before sending,
# how long the line must then stay quiet, and how long a reply can be owed.
SETTLE_MAX_S = 2.0
SETTLE_QUIET_S = 0.3
OWED_DEFAULT_S = 180            # 3GPP's slowest network commands (COPS, CGATT)
OWED_LONG = (("AT+QSCAN", 600),)   # GL's own scan timeout
NOTE = "[mudimodem-at] "


def owed_s(cmd):
    """How long a timed-out `cmd` may still answer."""
    up = cmd.strip().upper()
    for prefix, secs in OWED_LONG:
        if up.startswith(prefix):
            return secs
    return OWED_DEFAULT_S


def final_kind(text):
    """'error' / 'ok' once a final result code is in `text`, else None."""
    if "\nERROR\r" in text or "+CME ERROR" in text or "+CMS ERROR" in text:
        return "error"
    if "\nOK\r" in text:
        return "ok"
    return None


class ChannelBusy(Exception):
    """The AT channel can't take a command now: another invocation holds the
    lock, or (with a reason) an earlier command's reply is still owed."""


class ATChannel:
    def __init__(self, port=DEFAULT_PORT, lock=DEFAULT_LOCK, lock_wait=5.0):
        self.lockf = None
        # the in-flight marker lives next to the flock and is only touched
        # while holding it; no lock => no shared state to keep
        self.state = os.path.splitext(lock)[0] + ".inflight" if lock else None
        self.check_owed = True            # look for an owed reply before the next send
        self.sent_at = None
        if lock:
            d = os.path.dirname(lock)
            if d:
                os.makedirs(d, exist_ok=True)
            self.lockf = open(lock, "w")
            deadline = time.monotonic() + lock_wait
            while True:
                try:
                    fcntl.flock(self.lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        self.lockf.close()
                        self.lockf = None
                        raise ChannelBusy()
                    time.sleep(0.2)
        # BLOCKING open (non-blocking writes return EBUSY on this SMD channel);
        # reads are gated by select() for the timeout.
        try:
            self.fd = os.open(port, os.O_RDWR | os.O_NOCTTY)
        except OSError:
            if self.lockf:
                self.lockf.close()
                self.lockf = None
            raise

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass
        if self.lockf:
            try:
                self.lockf.close()
            except OSError:
                pass
            self.lockf = None

    def _drain(self):
        while select.select([self.fd], [], [], 0)[0]:
            try:
                if not os.read(self.fd, 4096):
                    break
            except OSError:
                break

    # ---- the in-flight marker (late replies, see the header) ----------------
    def _mark(self, cmd):
        """Record `cmd` as sent-but-unanswered. Best effort: a /tmp that can't
        take 100 bytes costs the late-reply guard, never the command."""
        if not self.state:
            return
        try:
            tmp = self.state + ".tmp"
            with open(tmp, "w") as f:
                json.dump({"cmd": cmd, "sent": time.monotonic(), "owed_s": owed_s(cmd)}, f)
            os.replace(tmp, self.state)
        except OSError:
            pass

    def _unmark(self):
        if not self.state:
            return
        try:
            os.remove(self.state)
        except OSError:
            pass

    def _owed(self):
        """The marker of a command whose reply is still owed, or None.
        (time.monotonic is CLOCK_MONOTONIC: system-wide, and the tmpfs marker
        never outlives the boot it was written in.)"""
        if not self.state:
            return None
        try:
            with open(self.state) as f:
                m = json.load(f)
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            m = None
        return m if isinstance(m, dict) else {"cmd": "?"}

    def _settle(self, budget):
        """Before a send: if an earlier command's reply is owed, read the
        channel for up to `budget` s. Returns a note line for the response
        (or None when nothing was owed); raises ChannelBusy(reason) when the
        owed command may still answer — sending now would pair its late
        reply with our command."""
        m = self._owed()
        if m is None:
            return None
        cmd = str(m.get("cmd") or "?")
        sent = m.get("sent")
        age = time.monotonic() - sent if isinstance(sent, (int, float)) else None
        buf, final, end = b"", None, time.monotonic() + budget
        while True:
            left = end - time.monotonic()
            if left <= 0:
                break
            r, _, _ = select.select([self.fd], [], [], min(left, SETTLE_QUIET_S) if final else left)
            if not r:
                if final:
                    break                  # final code seen, then quiet: done
                continue
            try:
                chunk = os.read(self.fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            final = final or final_kind(buf.decode(errors="replace"))
        lines = [l.strip() for l in buf.decode(errors="replace").replace("\r", "\n").split("\n")
                 if l.strip() and not l.strip().startswith(URC_PREFIXES)]
        ago = "%ds ago" % age if age is not None and age >= 0 else "earlier"
        if final:
            self._unmark()
            return (NOTE + "discarded a late reply (%d line(s)) to %s, sent %s and timed out"
                    " - not this command's" % (len(lines), cmd, ago))
        try:
            limit = float(m.get("owed_s") or OWED_DEFAULT_S)
        except (TypeError, ValueError):
            limit = OWED_DEFAULT_S
        if age is None or age < 0 or age >= limit:
            self._unmark()
            return NOTE + "the reply to %s (sent %s) never arrived; taken as lost" % (cmd, ago)
        raise ChannelBusy("still waiting for the reply to %s (sent %s, timed out); not sent, so"
                          " that late reply cannot be read as this command's - retry shortly"
                          % (cmd, ago))

    def send(self, cmd, timeout=8):
        """Send one AT command. Returns (raw_text, kind) where kind is
        'ok' (OK terminator), 'error' (ERROR/+CME/+CMS), or 'timeout'.
        Raises ChannelBusy if an earlier command's reply is still owed."""
        note = None
        if self.check_owed:
            note = self._settle(min(SETTLE_MAX_S, timeout))
            self.check_owed = False
        self._drain()
        self._mark(cmd)
        self.sent_at = time.monotonic()
        try:
            os.write(self.fd, (cmd + "\r").encode())
        except OSError:
            self._unmark()                 # never sent: nothing is owed
            raise
        buf, kind, deadline = b"", "timeout", time.monotonic() + timeout
        while time.monotonic() < deadline:
            r, _, _ = select.select([self.fd], [], [], max(0, deadline - time.monotonic()))
            if not r:
                break
            try:
                chunk = os.read(self.fd, 4096)
            except OSError:
                break
            if not chunk:
                continue
            buf += chunk
            kind = final_kind(buf.decode(errors="replace")) or "timeout"
            if kind != "timeout":
                break
        if kind == "timeout":
            self.check_owed = True         # its reply may land on our next send
        else:
            self._unmark()
        text = buf.decode(errors="replace")
        return (note + "\r\n" + text if note else text), kind

    def lines(self, cmd, timeout=8):
        """send(), returned as clean lines with URCs filtered out."""
        resp, _kind = self.send(cmd, timeout)
        out = [l.strip() for l in resp.replace("\r", "\n").split("\n") if l.strip()]
        return [l for l in out if not l.startswith(URC_PREFIXES)]


def main(argv):
    envelope, timeout, port = False, 8, DEFAULT_PORT
    lock, lock_wait = DEFAULT_LOCK, 5.0
    cmds, i = [], 0
    while i < len(argv):
        a = argv[i]
        if a == "--envelope":
            envelope = True
        elif a == "--timeout":
            i += 1
            timeout = max(1, min(60, int(float(argv[i]))))
        elif a == "--port":
            i += 1
            port = argv[i]
        elif a == "--lock":
            i += 1
            lock = argv[i] or None
        elif a == "--lock-wait":
            i += 1
            lock_wait = float(argv[i])
        elif a == "--":
            cmds.extend(argv[i + 1:])
            break
        else:
            cmds.append(a)
        i += 1
    if not cmds:
        print("usage: mudimodem-at.py [--envelope] [--timeout N] [--port P]"
              " [--lock PATH] [--lock-wait S] CMD...", file=sys.stderr)
        return 1

    t0 = time.monotonic()

    def ms():
        return int((time.monotonic() - t0) * 1000)

    try:
        ch = ATChannel(port, lock, lock_wait)
    except ChannelBusy:
        if envelope:
            print("MM-AT:busy:%d" % ms())
        else:
            print("busy: another command holds the AT channel", file=sys.stderr)
        return 2
    except OSError as e:
        if envelope:
            print("MM-AT:openfail:%d" % ms())
        else:
            print("cannot open %s: %s" % (port, e), file=sys.stderr)
        return 3

    try:
        try:
            count = len(cmds)
            if envelope:
                for idx, cmd in enumerate(cmds, 1):
                    resp, kind = ch.send(cmd, timeout)
                    step_ms = int((time.monotonic() - ch.sent_at) * 1000)
                    print("MM-AT:%s:%d:%d/%d" % (kind, step_ms, idx, count))
                    sys.stdout.write(resp)
                    if not resp.endswith("\n"):
                        sys.stdout.write("\n")
                    if kind != "ok":
                        break          # stop-on-error: emit no further frames
                return 0
            for cmd in cmds:
                resp, kind = ch.send(cmd, timeout)
                for l in [x.strip() for x in resp.replace("\r", "\n").split("\n")
                          if x.strip() and not x.strip().startswith(URC_PREFIXES)]:
                    print("    " + l)
                print(">>> %s   (%.2fs) [%s]" % (cmd, time.monotonic() - ch.sent_at, kind))
                if kind != "ok":
                    break              # stop-on-error in the shell path too
            return 0
        except ChannelBusy as e:
            # Only ever from the FIRST send (an owed reply is checked before
            # anything is written), so this is still the first stdout line.
            if envelope:
                print("MM-AT:busy:%d" % ms())
                print(str(e))
            else:
                print("busy: %s" % e, file=sys.stderr)
            return 2
        except OSError as e:
            # e.g. os.write() failing mid-send (port yanked, EIO, ...). Must
            # still yield a defined envelope line + an exit code in {0,2,3} —
            # never let a bare traceback replace stdout line 1 the Lua parses.
            if envelope:
                print("MM-AT:openfail:%d" % ms())
            else:
                print("send failed: %s" % e, file=sys.stderr)
            return 3
    finally:
        ch.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
