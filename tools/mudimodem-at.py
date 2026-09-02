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
                     then the raw response, verbatim (URCs included; may be empty)
  channel failure:   MM-AT:busy:<ms> | MM-AT:openfail:<ms> as the ONLY line
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

⚠️ Caveats:
  - Open BLOCKING: the SMD channel returns EBUSY on a non-blocking write.
  - /dev/at_mdm0 is NOT a tty, so no termios setup (it's a raw byte stream).
  - No sub_id: the direct port operates in the ACTIVE subscription's context
    only. For per-SIM data (the other SIM's policy_band) the backend uses
    GL's modem.CPU.AT with an explicit sub_id.
  - Writes hit modem NV like any AT path; band/mode changes made here bypass
    GL's config store — use the Bands tab for durable changes.
"""
import fcntl, os, select, sys, time

DEFAULT_PORT = "/dev/at_mdm0"
DEFAULT_LOCK = "/tmp/mudimodem/at.lock"
# Unsolicited result codes that arrive unprompted, unrelated to our command.
URC_PREFIXES = ("RDY", "+CPIN:", "+QUSIM:", "+QUSIM", "+CPINDS:", "+QIND:",
                "+CFUN:", "+CGEV:", "+QNETDEVSTATUS:", "POWERED DOWN")


class ChannelBusy(Exception):
    """Another invocation holds the AT channel lock."""


class ATChannel:
    def __init__(self, port=DEFAULT_PORT, lock=DEFAULT_LOCK, lock_wait=5.0):
        self.lockf = None
        if lock:
            d = os.path.dirname(lock)
            if d:
                os.makedirs(d, exist_ok=True)
            self.lockf = open(lock, "w")
            deadline = time.time() + lock_wait
            while True:
                try:
                    fcntl.flock(self.lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.time() >= deadline:
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

    def send(self, cmd, timeout=8):
        """Send one AT command. Returns (raw_text, kind) where kind is
        'ok' (OK terminator), 'error' (ERROR/+CME/+CMS), or 'timeout'."""
        self._drain()
        os.write(self.fd, (cmd + "\r").encode())
        buf, kind, deadline = b"", "timeout", time.time() + timeout
        while time.time() < deadline:
            r, _, _ = select.select([self.fd], [], [], max(0, deadline - time.time()))
            if not r:
                break
            try:
                chunk = os.read(self.fd, 4096)
            except OSError:
                break
            if not chunk:
                continue
            buf += chunk
            t = buf.decode(errors="replace")
            if "\nERROR\r" in t or "+CME ERROR" in t or "+CMS ERROR" in t:
                kind = "error"; break
            if "\nOK\r" in t:
                kind = "ok"; break
        return buf.decode(errors="replace"), kind

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

    t0 = time.time()

    def ms():
        return int((time.time() - t0) * 1000)

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
                    s0 = time.time()
                    resp, kind = ch.send(cmd, timeout)
                    step_ms = int((time.time() - s0) * 1000)
                    print("MM-AT:%s:%d:%d/%d" % (kind, step_ms, idx, count))
                    sys.stdout.write(resp)
                    if not resp.endswith("\n"):
                        sys.stdout.write("\n")
                    if kind != "ok":
                        break          # stop-on-error: emit no further frames
                return 0
            for cmd in cmds:
                t1 = time.time()
                resp, kind = ch.send(cmd, timeout)
                for l in [x.strip() for x in resp.replace("\r", "\n").split("\n")
                          if x.strip() and not x.strip().startswith(URC_PREFIXES)]:
                    print("    " + l)
                print(">>> %s   (%.2fs) [%s]" % (cmd, time.time() - t1, kind))
                if kind != "ok":
                    break              # stop-on-error in the shell path too
            return 0
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
