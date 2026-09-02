#!/usr/bin/env python3
"""The band metadata lives in two languages on purpose (the chunk is shipped as a
plain file, no build step): src/views/mudimodem.js (freq / SCS / LTE_EARFCN) and
src/lib/cellular_compat.py (LTE_EARFCN). This test keeps them from drifting."""
import json, os, re, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src", "lib"))
import cellular_compat as cc  # noqa: E402


def js_table(name):
    src = open(os.path.join(HERE, "..", "src", "views", "mudimodem.js")).read()
    m = re.search(name + r":\s*\{(.*?)\},?\n", src, re.S)
    body = m.group(1)
    out = {}
    for k, v in re.findall(r"(\d+):\s*(\[[^\]]*\]|\d+)", body):
        out[int(k)] = json.loads(v)
    return out


class Consistency(unittest.TestCase):
    def test_lte_earfcn_tables_match(self):
        js = js_table("LTE_EARFCN")
        self.assertEqual({k: list(v) for k, v in cc.LTE_EARFCN.items()}, js)

    def test_every_lte_band_with_a_label_has_an_earfcn_entry(self):
        b = js_table("B")
        missing = [k for k in b if k not in cc.LTE_EARFCN]
        self.assertEqual(missing, [], "LTE bands labelled in the UI but without an EARFCN row")

    def test_nr_raster_matches_between_js_and_python(self):
        src = open(os.path.join(HERE, "..", "src", "views", "mudimodem.js")).read()
        self.assertIn("n < 600000) return n * 0.005", src)
        self.assertIn("3000 + (n - 600000) * 0.015", src)
        self.assertIn("24250.08 + (n - 2016667) * 0.06", src)
        self.assertEqual(cc.nr_arfcn_to_mhz(600000), 3000)
        self.assertEqual(cc.nr_arfcn_to_mhz(2016667), 24250.08)


if __name__ == "__main__":
    unittest.main()
