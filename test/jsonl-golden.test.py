#!/usr/bin/env python3
"""mudimodemd's file + battery helpers (src/lib/mudimodemd/{jsonl,battery}.lua) must return the
values AND leave the bytes on disk recorded in test/golden/jsonl.json — frozen from the python
collector (src/sbin/mudimodem-collectd) before R3 ⑤ retired it — for the same fixture files, under
the host's lua5.1 and, when the firmware rootfs is extracted, the router's lua (5.1) and eco (5.4).
`{PID}` / `{DEAD}` in the fixtures are a live and a dead pid (glbattlimit's running check).
Run: python3 test/jsonl-golden.test.py"""
import json, os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import mudiemu  # noqa: E402
GOLDEN = os.path.join(HERE, "golden", "jsonl.json")
dead = subprocess.Popen(["true"]); dead.wait()
SUBS = {"{PID}": str(os.getpid()), "{DEAD}": str(dead.pid)}


def sub(s):
    for k, v in SUBS.items():
        s = s.replace(k, v)
    return s


def materialize(base, cases):
    for i, c in enumerate(cases, 1):
        d = os.path.join(base, str(i))
        os.makedirs(d)
        for rel, body in c["files"].items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w") as f:
                f.write(sub(body))


def tree(d):
    out = {}
    for dp, _, fns in os.walk(d):
        for fn in fns:
            p = os.path.join(dp, fn)
            with open(p, "rb") as f:
                out[os.path.relpath(p, d)] = f.read().decode()
    return out


def runtimes():
    rt = []
    if shutil.which("lua5.1"):
        rt.append(("host lua5.1", ["lua5.1"]))
    if mudiemu.ok():                                   # tools/mudi-emu: the router's own interpreters
        rt.append(("router lua", mudiemu.cmd("run", "lua")))
        rt.append(("router eco", mudiemu.cmd("run", "eco")))
    return rt


class Golden(unittest.TestCase):
    def test_lua_gives_the_golden_answers_and_files(self):
        with open(GOLDEN) as f:
            cases = json.load(f)["cases"]
        rts = runtimes()
        if not rts:
            self.skipTest("no Lua runtime (lua5.1 or the firmware rootfs + qemu)")
        work = tempfile.mkdtemp(prefix="mm-jsonl-")
        self.addCleanup(shutil.rmtree, work, True)
        spec = os.path.join(work, "cases.json")
        with open(spec, "w") as f:
            json.dump([dict(c, files=None) for c in cases], f)
        for name, cmd in rts:
            with self.subTest(runtime=name):
                lu = os.path.join(work, name.replace(" ", "-")); materialize(lu, cases)
                out = subprocess.run(cmd + [os.path.join(HERE, "jsonl-golden.lua"), spec, lu],
                                     capture_output=True, text=True, timeout=300)
                self.assertEqual(out.returncode, 0, out.stderr)
                got = json.loads(out.stdout)
                self.assertEqual(len(got), len(cases))
                for i, c in enumerate(cases, 1):
                    what = "%s: case %d %s(%s)" % (name, i, c["fn"], json.dumps(c["args"])[:120])
                    self.assertEqual(got[i - 1], c["want"], what + " returned differently")
                    self.assertEqual(tree(os.path.join(lu, str(i))), {k: sub(v) for k, v in c["want_tree"].items()},
                                     what + " left different files")


if __name__ == "__main__":
    unittest.main()
