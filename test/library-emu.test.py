#!/usr/bin/env python3
"""The community AT library's check / refresh as mudimodemd jobs (src/lib/mudimodemd/tasks.lua),
under the image's eco on the emulated GL bus, with a fake curl serving the remote files. These are
the cases tools/mudimodem-lib (python3) was tested with before R3 ⑤ retired it, plus one it never
had: the cached library is the fetched body verbatim (re-encoding would turn [] into {}).
Skips when the firmware rootfs or qemu is absent (mudi-emu check)."""
import gzip, json, os, shutil, signal, stat, subprocess, sys, tempfile, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import mudiemu  # noqa: E402  (tools/mudi-emu: the router's userland + a fake GL bus)
EMU = mudiemu.cmd("run")
LIB = {"version": 3, "revision": "new222",
       "entries": [{"id": "a.read", "cmd": "AT+CSQ", "risk": "read", "params": []},
                   {"id": "b.set", "cmd": "AT+X={{v}}", "risk": "set", "params": [{"name": "v"}]}]}


def emu_ok():
    return mudiemu.ok()


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu (mudi-emu check)")
class Library(unittest.TestCase):
    def setUp(self):
        d = self.d = tempfile.mkdtemp(prefix="mm-lib-")
        self.addCleanup(shutil.rmtree, d, True)
        self.bus, self.remote = os.path.join(d, "bus"), os.path.join(d, "remote")
        os.makedirs(self.bus); os.makedirs(self.remote)
        with open(os.path.join(self.bus, "scen.json"), "w") as f:
            json.dump({}, f)
        mudiemu.bus("start", self.bus, os.path.join(self.bus, "scen.json"))
        self.addCleanup(mudiemu.bus, "stop", self.bus)
        # a curl that serves <remote>/<file> for any URL ending in /<file>; exit 22 (-f) when absent;
        # CURL_FAIL in the file "fail" makes it fail like an offline box
        self.curl = os.path.join(d, "curl.sh")
        with open(self.curl, "w") as f:
            f.write('#!/bin/sh\nfor a; do url=$a; done\n'
                    'if [ -f %s/fail ]; then echo "curl: (6) Could not resolve host: x" >&2; exit 6; fi\n'
                    'f=%s/${url##*/}\n[ -f "$f" ] || { echo "curl: (22) 404" >&2; exit 22; }\ncat "$f"\n'
                    % (self.remote, self.remote))
        os.chmod(self.curl, 0o755)
        self.cache = os.path.join(d, "www", "at-library.json.gz")
        self.env = dict(os.environ, MUDIMODEM_UBUS_SOCK=os.path.join(self.bus, "ubus.sock"),
                        MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"), MUDIMODEMD_COLLECTOR="0",
                        MUDIMODEM_CURL=self.curl, MUDIMODEM_CACHE=self.cache,
                        MUDIMODEM_LIB_URL="https://lib.example/dist/", MUDIMODEM_SKIP_MODEL_GUARD="1",
                        MUDIMODEM_HIST=os.path.join(d, "hist"))

    def daemon(self, **extra):
        p = subprocess.Popen([*EMU, "eco", os.path.join(ROOT, "src", "sbin", "mudimodemd")],
                             env=dict(self.env, **extra), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.send_signal(signal.SIGTERM), p.wait(timeout=20),
                                 p.stdout.close(), p.stderr.close()))
        for _ in range(100):
            if subprocess.run([self.ubus_bin(), "call", "mudimodem", "health"], capture_output=True).returncode == 0:
                return p
            time.sleep(0.2)
        self.fail("mudimodemd never registered")

    def ubus_bin(self):
        return os.path.join(self.bus, "bin", "ubus")

    def job(self, kind):
        def call(m, a):
            out = subprocess.run([self.ubus_bin(), "call", "mudimodem", m, json.dumps(a)],
                                 capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 0, out.stderr)
            return json.loads(out.stdout)
        return call("job_wait", {"id": call("job_start", {"kind": kind})["id"], "wait": 20})

    def remote_file(self, name, body):
        with open(os.path.join(self.remote, name), "w" if isinstance(body, str) else "wb") as f:
            f.write(body)

    def local_cache(self, obj_or_bytes):
        os.makedirs(os.path.dirname(self.cache), exist_ok=True)
        data = obj_or_bytes if isinstance(obj_or_bytes, bytes) else json.dumps(obj_or_bytes).encode()
        with gzip.open(self.cache, "wb") as f:
            f.write(data)

    # ---- check ------------------------------------------------------------------------------
    def test_check(self):
        self.daemon()
        self.local_cache({"revision": "old111", "entries": []})
        self.remote_file("version.json", '{"revision": "old111"}')
        r = self.job("lib_check")
        self.assertEqual((r["checked"], r["update_available"], r["local_revision"], r["remote_revision"]),
                         (True, False, "old111", "old111"))
        self.remote_file("version.json", '{"revision": "new222"}')
        r = self.job("lib_check")
        self.assertEqual((r["checked"], r["update_available"], r["remote_revision"]), (True, True, "new222"))

    def test_check_fails_silent(self):
        self.daemon()
        r = self.job("lib_check")                       # no cache, no remote file
        self.assertEqual((r["checked"], r["update_available"], r["local_revision"]), (False, False, "unknown"))
        self.assertIn("22", r["error"])
        self.remote_file("version.json", "not json")
        self.assertIn("malformed", self.job("lib_check")["error"])
        self.local_cache(b'{"revision": "tru')          # a truncated cache reads as unknown
        self.assertEqual(self.job("lib_check")["local_revision"], "unknown")
        open(os.path.join(self.remote, "fail"), "w").close()
        r = self.job("lib_check")
        self.assertFalse(r["checked"])
        self.assertIn("Could not resolve host", r["error"])

    def test_no_curl_is_a_clean_error(self):
        self.daemon(MUDIMODEM_CURL=os.path.join(self.d, "no-curl"))
        self.assertFalse(self.job("lib_check")["checked"])
        r = self.job("lib_refresh")
        self.assertEqual(r["ok"], False)
        self.assertIn("fetch failed", r["error"])

    # ---- refresh ----------------------------------------------------------------------------
    def test_refresh_writes_the_fetched_body_verbatim(self):
        self.daemon()
        body = json.dumps(LIB, indent=1)
        self.remote_file("at-library.json", body)
        r = self.job("lib_refresh")
        self.assertEqual((r["ok"], r["revision"], r["count"]), (True, "new222", 2))
        with gzip.open(self.cache, "rb") as f:
            self.assertEqual(f.read().decode(), body, "cached verbatim: [] stays []")
        self.assertEqual(stat.S_IMODE(os.stat(self.cache).st_mode), 0o644, "nginx serves it: world-readable")
        self.assertEqual([n for n in os.listdir(os.path.dirname(self.cache)) if "tmp" in n], [], "no temp files left")
        self.assertEqual(self.job("lib_check")["local_revision"], "new222")

    def test_refresh_rejects_bad_libraries_and_keeps_the_cache(self):
        self.daemon()
        self.local_cache({"revision": "old111", "entries": [{"id": "x"}]})
        before = open(self.cache, "rb").read()
        for bad in [dict(LIB, entries=[]), {k: v for k, v in LIB.items() if k != "version"},
                    {k: v for k, v in LIB.items() if k != "revision"}, {"entries": "x"}]:
            self.remote_file("at-library.json", json.dumps(bad))
            r = self.job("lib_refresh")
            self.assertEqual(r["ok"], False, bad)
            self.assertIn("sanity check", r["error"])
        self.remote_file("at-library.json", b'{"pad": "' + b"x" * (1 << 20) + b'"}')
        self.assertIn("too large", self.job("lib_refresh")["error"])
        self.assertEqual(open(self.cache, "rb").read(), before, "a refused refresh leaves the cache alone")

    def test_refresh_model_guard(self):
        env_guard = {"MUDIMODEM_SKIP_MODEL_GUARD": "0"}
        self.daemon(**env_guard)                         # the dev box is no E5800
        self.remote_file("at-library.json", json.dumps(LIB))
        r = self.job("lib_refresh")
        self.assertEqual((r["ok"], r["error"]), (False, "refusing: not a GL-E5800"))
        self.assertFalse(os.path.exists(self.cache))


if __name__ == "__main__":
    unittest.main()
