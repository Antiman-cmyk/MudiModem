#!/usr/bin/env python3
"""mudimodemd's file + battery helpers (src/lib/mudimodemd/{jsonl,battery}.lua) must do exactly
what the Python collector's do (src/sbin/mudimodem-collectd): same return values and the same
bytes left on disk, for the same fixture files — under the host's lua5.1 and, when the firmware
rootfs is extracted, the router's lua (5.1) and eco (5.4). Run: python3 test/jsonl-parity.test.py"""
import importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest
sys.dont_write_bytecode = True       # the collector is loaded from src/sbin: no __pycache__ there

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src", "lib"))
_l = importlib.machinery.SourceFileLoader("collectd", os.path.join(ROOT, "src", "sbin", "mudimodem-collectd"))
_s = importlib.util.spec_from_loader("collectd", _l)
cd = importlib.util.module_from_spec(_s); _l.exec_module(cd)

J = lambda *objs: "".join(json.dumps(o) + "\n" for o in objs)
L = lambda t, **kw: dict({"t": t}, **kw)
dead = subprocess.Popen(["true"]); dead.wait(); DEAD_PID = dead.pid

# Each case: fn, args ("{D}" = the case's own directory), fixture files, number of return values.
CASES = []
def case(fn, args, files=None, nret=1):
    CASES.append({"fn": fn, "args": args, "n": len(args), "files": files or {}, "nret": nret})

E = "{D}/e.jsonl"
# trim: age cut, cap, nothing to drop (file untouched), torn tail, junk head, blank lines,
# shared partial tail, missing and empty files
case("trim", [E, 5000, 100, 10000], {"e.jsonl": J(L(1000), L(2000), L(9000), L(9500))})
case("trim", [E, 10 ** 9, 3, 10000], {"e.jsonl": J(*[L(9000 + i, n=i) for i in range(10)])})
case("trim", [E, 5000, 100, 10000], {"e.jsonl": J(L(9000), L(9100))})
case("trim", [E, 5000, 100, 10000], {"e.jsonl": J(L(1000), L(9000)) + '{"t": 95'})
case("trim", [E, 5000, 100, 10000], {"e.jsonl": "junk\n[1,2]\n" + J(L(9000), L(9600))})
case("trim", [E, 5000, 100, 10000], {"e.jsonl": J(L(1000)) + "\n  \n" + J(L(9000)) + "\n"})
case("trim", [E, 5000, 100, 10000, True], {"e.jsonl": J(L(1000), L(9000)) + '{"t":9800,"kind"'})
case("trim", [E, 5000, 100, 10000, True], {"e.jsonl": '{"t":1'})
case("trim", [E, 5000, 100, 10000], {})
case("trim", [E, 5000, 100, 10000], {"e.jsonl": ""})
case("trim", [E, 5000, 1, 10000], {"e.jsonl": J(L(9000.5, x=1.25), L(9100, s="a/b"))})
# rotate_segment: no segment, young head, rotated over an existing prev, expired
P, C = "{D}/s.prev.jsonl", "{D}/s.jsonl"
case("rotate_segment", [P, C, 5000, 10000], {})
case("rotate_segment", [P, C, 5000, 10000], {"s.jsonl": J(L(6000), L(9000))})
case("rotate_segment", [P, C, 5000, 10000], {"s.jsonl": J(L(1000), L(9000)), "s.prev.jsonl": J(L(1))})
case("rotate_segment", [P, C, 5000, 10000], {"s.jsonl": J(L(1000), L(2000)), "s.prev.jsonl": J(L(1))})
case("rotate_segment", [P, C, 5000, 10000], {"s.jsonl": "x\n" + J(L(1000), L(2000)) + "torn"})
# seed_tmp_from_persist: tmp already has data, window filter (first young line onward), all of
# it, nothing young, no segments at all, a tmp in a directory that does not exist yet
T = "{D}/tmp/samples.jsonl"
case("seed_tmp_from_persist", [T, [P, C], 5000, 10000], {"tmp/samples.jsonl": J(L(1)), "s.jsonl": J(L(9000))})
case("seed_tmp_from_persist", [T, [P, C], 5000, 10000],
     {"s.prev.jsonl": J(L(1000), L(6000)) + "junk\n" + J(L(2000)), "s.jsonl": "\n" + J(L(9000))})
case("seed_tmp_from_persist", [T, [P, C], None, 10000], {"s.prev.jsonl": J(L(1)), "s.jsonl": "  " + J(L(2))})
case("seed_tmp_from_persist", [T, [P, C], 5000, 10000], {"s.jsonl": J(L(1000))})
case("seed_tmp_from_persist", [T, [P, C], 5000, 10000], {})
case("seed_tmp_from_persist", ["{D}/new/dir/x.jsonl", C, 5000, 10000], {"s.jsonl": J(L(9000))})
# flush_new_lines: new backup, torn backup tail, nothing new, missing tmp, junk lines skipped
B = "{D}/bk/s.jsonl"
case("flush_new_lines", [E, B, 2000], {"e.jsonl": J(L(1000), L(2000), L(3000.7), L(4000))})
case("flush_new_lines", [E, B, 2000], {"e.jsonl": J(L(3000)), "bk/s.jsonl": J(L(1000)) + '{"t":15'})
case("flush_new_lines", [E, B, 5000], {"e.jsonl": J(L(3000)), "bk/s.jsonl": J(L(1000))})
case("flush_new_lines", [E, B, 0], {})
case("flush_new_lines", [E, B, 0], {"e.jsonl": "junk\n\n" + J(L(5)) + '{"t":true}\n'})
# max / first / last t
case("max_t_in_file", [E], {"e.jsonl": J(L(5), L(3000.9), L(2)) + "junk\n"})
case("max_t_in_file", [E], {})
case("first_t_in_file", [E], {"e.jsonl": "junk\n\n" + J(L(7), L(8))})
case("first_t_in_file", [E, 2], {"e.jsonl": "junk\njunk\n" + J(L(7))})
case("first_t_in_file", [E], {})
case("last_t_in_file", [E], {"e.jsonl": J(*[L(i, pad="x" * 200) for i in range(200)]) + "torn{"})
case("last_t_in_file", [E, 100], {"e.jsonl": J(L(1), L(2, pad="y" * 300))})
case("last_t_in_file", [E], {})
# history config
H = "{D}/h.json"
for body in [None, "", " ", '{"enabled": true}', '{"enabled": 1}', "[]", "{bad", '{"enabled": false}']:
    case("read_history_config", [H], {} if body is None else {"h.json": body})
# battery: full tree, no gauge, junk / sentinel / negative values, limiter states
FULL = {"cw221X-bat/capacity": "87\n", "cw221X-bat/voltage_now": "4012345\n", "cw221X-bat/temp": "312\n",
        "cw221X-bat/current_now": "-363\n", "cw221X-bat/cycle_count": "12\n", "cw221X-bat/health": "Good\n",
        "charger/online": "1\n", "charger/status": "Charging\n", "charger/charge_type": "Fast\n",
        "lim.pid": "%d\n" % os.getpid(), "lim.limit": "80\n"}
BAT = ["{D}", 1000, "{D}/lim.pid", "{D}/lim.limit"]
case("read_battery", BAT, FULL)
case("read_battery", BAT, {k: v for k, v in FULL.items() if k != "cw221X-bat/capacity"})
case("read_battery", BAT, dict(FULL, **{"cw221X-bat/temp": "-55", "cw221X-bat/current_now": "-32768",
                                       "cw221X-bat/voltage_now": "junk", "charger/online": "",
                                       "charger/status": "", "cw221X-bat/cycle_count": "3.5",
                                       "lim.pid": "%d" % DEAD_PID, "lim.limit": "80.7"}))
case("read_battery", BAT, {"cw221X-bat/capacity": " 5 ", "lim.pid": "junk", "lim.limit": ""})
case("read_limiter", ["{D}/lim.pid", "{D}/lim.limit"], {"lim.pid": "%d" % os.getpid(), "lim.limit": "75"}, nret=2)
case("read_limiter", ["{D}/lim.pid", "{D}/lim.limit"], {"lim.pid": "%d" % DEAD_PID}, nret=2)
case("read_limiter", ["{D}/lim.pid", "{D}/lim.limit"], {"lim.pid": "0", "lim.limit": "x"}, nret=2)
case("read_limiter", ["{D}/lim.pid", "{D}/lim.limit"], {}, nret=2)


def materialize(base):
    for i, c in enumerate(CASES, 1):
        d = os.path.join(base, str(i))
        os.makedirs(d)
        for rel, body in c["files"].items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w") as f:
                f.write(body)


def tree(d):
    out = {}
    for dp, _, fns in os.walk(d):
        for fn in fns:
            p = os.path.join(dp, fn)
            with open(p, "rb") as f:
                out[os.path.relpath(p, d)] = f.read()
    return out


def subst(v, d):
    if isinstance(v, str):
        return v.replace("{D}", d)
    if isinstance(v, list):
        return [subst(x, d) for x in v]
    return v


def python_run(base):
    res = []
    for i, c in enumerate(CASES, 1):
        d = os.path.join(base, str(i))
        a = subst(c["args"], d)
        fn = c["fn"]
        if fn == "trim":
            r = cd.trim(a[0], a[1], a[2], ref_ms=a[3], shared=len(a) > 4 and a[4])
        elif fn == "read_history_config":
            r = cd.read_history_config(a[0])
        elif fn == "read_battery":
            r = cd.read_battery(root=a[0], t=a[1], pidf=a[2], limf=a[3])
        elif fn == "read_limiter":
            r = list(cd.read_limiter(pidf=a[0], limf=a[1]))
        else:
            r = getattr(cd, fn)(*a)
        res.append(r if c["nret"] > 1 else [r])
    return json.loads(json.dumps(res))


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
        rts = runtimes()
        if not rts:
            self.skipTest("no Lua runtime (lua5.1 or the firmware rootfs + qemu)")
        work = tempfile.mkdtemp(prefix="mm-jsonl-")
        self.addCleanup(shutil.rmtree, work, True)
        py = os.path.join(work, "py"); materialize(py)
        want = python_run(py)
        cases = os.path.join(work, "cases.json")
        with open(cases, "w") as f:
            json.dump(CASES, f)
        for name, cmd in rts:
            with self.subTest(runtime=name):
                lu = os.path.join(work, name.replace(" ", "-")); materialize(lu)
                out = subprocess.run(cmd + [os.path.join(HERE, "jsonl-parity.lua"), cases, lu],
                                     capture_output=True, text=True, timeout=300)
                self.assertEqual(out.returncode, 0, out.stderr)
                got = json.loads(out.stdout)
                self.assertEqual(len(got), len(want))
                for i, c in enumerate(CASES, 1):
                    what = "%s: case %d %s(%s)" % (name, i, c["fn"], json.dumps(c["args"])[:120])
                    self.assertEqual(got[i - 1], want[i - 1], what + " returned differently")
                    self.assertEqual(tree(os.path.join(lu, str(i))), tree(os.path.join(py, str(i))),
                                     what + " left different files")


if __name__ == "__main__":
    unittest.main()
