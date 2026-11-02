#!/usr/bin/env python3
"""cellular_compat.lua must produce exactly what cellular_compat.py produces (same JSON, nulls
included) for the same GL 4.10 payloads — under the host's lua5.1 and, when the firmware rootfs is
extracted, the router's own lua (5.1, LNUM) and eco (5.4). Run: python3 test/compat-parity.test.py"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src", "lib"))
import cellular_compat as cc  # noqa: E402
spec = importlib.util.spec_from_file_location("ct", os.path.join(HERE, "collectd.test.py"))
ct = importlib.util.module_from_spec(spec); spec.loader.exec_module(ct)

T = 1700000000000
STATUSES = [ct.MODEM_STATUS_410, ct.MODEM_STATUS_410_TWO, {"modems": [{"bus": "cpu", "current_sim_slot": "2"}]}]
CELLS = [ct.CELL_INFO_410_SA, ct.CELL_INFO_410_NSA, ct.CELL_INFO_410_NSA_CA, ct.CELL_INFO_410_NSA_FULL,
         ct.CELL_INFO_410_NSA_FALLBACK_ROW, ct.CELL_INFO_410_NO_SERVICE,
         # edges: string numbers, null fields, unknown code, tx_channel fallback, float bandwidth
         {"network_type": "41", "cell_id": "AB", "tac": 0, "signal": [
             {"band": "66", "tx_channel": "66986", "pci": "0", "bandwidth": 1.4, "rsrp": "-101.5", "rsrq": None},
             {"ca": 2, "band": 2, "earfcn": None, "tx_channel": 900, "rsrp": -110}]},
         {"network_type": 99, "cell_id": "Z", "signal": [{"band": 1, "rsrp": -80}]},
         {"network_type": 5, "cell_id": "", "signal": []},
         {"network_type": 51, "signal": [{"band": 71, "earfcn": 126400, "rsrp": -90}, {"band": 2, "earfcn": 900, "rsrp": -95}]}]
CASES = []
for st in STATUSES:
    for ci in CELLS:
        CASES.append({"fn": "build_sample", "args": [st, ci, ct.NETWORK_INFO_410, T]})
CASES += [{"fn": "build_sample", "args": [{"modems": []}, ct.CELL_INFO_410_SA, None, T]},
          {"fn": "build_sample", "args": [ct.MODEM_STATUS_410, ct.CELL_INFO_410_SA, None, T, "cpu", "Given"]}]
for p in [None, {}, {"ret": 1, "resp": "x"}, {"network_type": ""}, {"network_type": 0}, ct.CELL_INFO_410_SA]:
    CASES.append({"fn": "cell_info_failed", "args": [p]})
for n in [None, 0, 1, 126400, 599999, 600000, 627264, 2016666, 2016667, 2100000, "627264", -5]:
    CASES.append({"fn": "nr_arfcn_to_mhz", "args": [n]})
for b, e in [(3, 1700), (71, 68761), (66, 66986), (99, 1), (None, 5), ("2", "900"), (1, 0)]:
    CASES.append({"fn": "lte_earfcn_to_mhz", "args": [b, e]})
for r, b in [("NR5G-SA", 78), ("LTE", 3), ("NR5G-NSA", None), (None, 7)]:
    CASES.append({"fn": "format_band", "args": [r, b]})
for st in STATUSES + [{}, {"modems": [{"bus": "x"}]}]:
    CASES.append({"fn": "active_slot", "args": [st]})


def python_results():
    out = []
    for c in CASES:
        f = getattr(cc, c["fn"])
        r = f(*c["args"])
        if c["fn"] == "build_sample" and r is not None and r["signals"] == []:
            r["signals"] = "[]"
        out.append(r)
    return json.loads(json.dumps(out))


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


class Parity(unittest.TestCase):
    def test_lua_matches_python(self):
        want = python_results()
        rts = runtimes()
        if not rts:
            self.skipTest("no Lua runtime (lua5.1 or the firmware rootfs + qemu)")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(CASES, fh)
        try:
            for name, cmd in rts:
                with self.subTest(runtime=name):
                    out = subprocess.run(cmd + [os.path.join(HERE, "compat-parity.lua"), fh.name],
                                         capture_output=True, text=True, timeout=300)
                    self.assertEqual(out.returncode, 0, out.stderr)
                    got = json.loads(out.stdout)
                    for i, (g, w) in enumerate(zip(got, want)):
                        self.assertEqual(g, w, "%s: case %d %s(%s)" % (name, i, CASES[i]["fn"], json.dumps(CASES[i]["args"])[:160]))
                    self.assertEqual(len(got), len(want))
        finally:
            os.unlink(fh.name)


if __name__ == "__main__":
    unittest.main()
