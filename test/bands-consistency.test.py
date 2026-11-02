#!/usr/bin/env python3
"""The band metadata lives in two languages on purpose: the page sources under src/web
(freq / SCS / LTE_EARFCN tables, NR raster) and src/lib/cellular_compat.lua (LTE_EARFCN, the NR
raster — the daemon's copy). This test keeps them from drifting."""
import json, os, re, subprocess, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "..", "src", "lib")


def lua_compat():
    """cellular_compat.lua's LTE_EARFCN + two raster points, read by running it (host lua5.1)."""
    script = ('package.path = %r .. "/?.lua;" .. package.path; local cc = require "cellular_compat"; '
              'local t = {}; for b, e in pairs(cc.LTE_EARFCN) do t[#t + 1] = string.format("%%d:%%s:%%s", b, e[1], e[2]) end; '
              'print(table.concat(t, " ")); print(cc.nr_arfcn_to_mhz(600000), cc.nr_arfcn_to_mhz(2016667))') % LIB
    out = subprocess.run(["lua5.1", "-e", script], capture_output=True, text=True, check=True).stdout.split("\n")
    earfcn = {int(b): [int(f) if float(f) == int(float(f)) else float(f), int(o)]
              for b, f, o in (x.split(":") for x in out[0].split())}
    return earfcn, [float(v) for v in out[1].split()]


def web_src():
    root = os.path.join(HERE, "..", "src", "web")
    parts = []
    for d, _, files in sorted(os.walk(root)):
        for f in sorted(files):
            if f.endswith(".js"):
                parts.append(open(os.path.join(d, f), encoding="utf-8").read())
    return "\n".join(parts)


def js_table(name):
    src = web_src()
    m = re.search(r"\b" + name + r"\s*[:=]\s*\{(.*?)\},?;?\n", src, re.S)
    body = m.group(1)
    out = {}
    for k, v in re.findall(r"(\d+):\s*(\[[^\]]*\]|\d+)", body):
        out[int(k)] = json.loads(v)
    return out


class Consistency(unittest.TestCase):
    def test_lte_earfcn_tables_match(self):
        js = js_table("LTE_EARFCN")
        self.assertEqual(lua_compat()[0], js)

    def test_every_lte_band_with_a_label_has_an_earfcn_entry(self):
        b = js_table("B")
        earfcn = lua_compat()[0]
        missing = [k for k in b if k not in earfcn]
        self.assertEqual(missing, [], "LTE bands labelled in the UI but without an EARFCN row")

    def test_nr_raster_matches_between_js_and_lua(self):
        src = web_src()
        self.assertIn("n < 600000) return n * 0.005", src)
        self.assertIn("3000 + (n - 600000) * 0.015", src)
        self.assertIn("24250.08 + (n - 2016667) * 0.06", src)
        self.assertEqual(lua_compat()[1], [3000, 24250.08])


if __name__ == "__main__":
    unittest.main()
