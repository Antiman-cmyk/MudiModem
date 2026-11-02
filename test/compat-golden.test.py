#!/usr/bin/env python3
"""cellular_compat.lua (GL 4.10's cellular shapes -> the normalized sample) must give the answers in
test/golden/compat.json — frozen from the python reference (src/lib/cellular_compat.py) before
R3 ⑤ retired it, so the port stays proven equal — under the host's lua5.1 and, when the firmware
rootfs is extracted, the router's lua (5.1) and eco (5.4). A deliberate behaviour change edits the
golden in the same commit. Run: python3 test/compat-golden.test.py"""
import json, os, shutil, subprocess, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
GOLDEN = os.path.join(HERE, "golden", "compat.json")


def runtimes():
    rt = []
    if shutil.which("lua5.1"):
        rt.append(("host lua5.1", ["lua5.1"]))
    rootfs = os.environ.get("MM_ROOTFS", os.path.join(ROOT, "firmware", "rootfs"))
    if shutil.which("qemu-aarch64-static") and os.path.exists(os.path.join(rootfs, "usr", "bin", "eco")):
        emu = os.path.join(ROOT, "tools", "emu.sh")
        rt.append(("router lua", [emu, "lua"]))
        rt.append(("router eco", [emu, "eco"]))
    return rt


class Golden(unittest.TestCase):
    def test_lua_gives_the_golden_answers(self):
        with open(GOLDEN) as f:
            g = json.load(f)
        rts = runtimes()
        if not rts:
            self.skipTest("no Lua runtime (lua5.1 or the firmware rootfs + qemu)")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(g["cases"], fh)
        self.addCleanup(os.unlink, fh.name)
        for name, cmd in rts:
            with self.subTest(runtime=name):
                out = subprocess.run(cmd + [os.path.join(HERE, "compat-golden.lua"), fh.name],
                                     capture_output=True, text=True, timeout=300)
                self.assertEqual(out.returncode, 0, out.stderr)
                got = json.loads(out.stdout)
                self.assertEqual(len(got), len(g["want"]))
                for i, (c, w) in enumerate(zip(g["cases"], g["want"])):
                    self.assertEqual(got[i], w, "%s: case %d %s(%s)" % (name, i, c["fn"], json.dumps(c["args"])[:160]))


if __name__ == "__main__":
    unittest.main()
