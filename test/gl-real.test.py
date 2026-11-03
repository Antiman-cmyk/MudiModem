#!/usr/bin/env python3
"""mudimodemd against GL's OWN cellular stack: cellular_manager (and the modem_AT it spawns) from
the 4.10 image, chrooted under qemu with mudi-emu's RG650V model behind /dev/smd9 (`mudi-emu up`,
scenario test/emu/gl-real.json). Nothing of GL is faked here but the modem's AT replies, so what
GL returns is what GL's code does.

  * the collector's RF comes from GL's sampler (cellular.collect get_signals), and its sample is
    the one GL's own cell_info gives — levels included (GL's thresholds, cellular_compat);
  * cell_info runs only for the identity: once, then again after the serving cell changes;
  * the carrier's AMBR is in `cellular.sim status` (the speed test's source), not `sim info`.
Needs the extracted image, qemu-user + binfmt, and root for the namespaces/overlay (`mudi-emu check`);
skips otherwise."""
import json, os, shutil, subprocess, sys, tempfile, textwrap, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import mudiemu  # noqa: E402
SCENARIO = os.path.join(HERE, "emu", "gl-real.json")


INNER = textwrap.dedent(r'''
    import json, os, subprocess, sys, time
    W, CLI, ROOT = os.environ["MUDI_EMU_WORK"], sys.argv[1], sys.argv[2]
    def ubus(obj, m, a):
        out = subprocess.run([CLI, "ubus", "-t", "20", "call", obj, m, json.dumps(a)], capture_output=True, text=True).stdout
        return json.loads(out) if out.strip() else None
    def samples():
        try:
            return [json.loads(l) for l in open(os.path.join(W, "hist", "samples.jsonl")) if l.strip()]
        except OSError:
            return []
    for _ in range(60):                                    # GL up and its sampler has a row
        r = ubus("cellular.collect", "get_signals", {"time": 30, "slot": 1})
        if r and r.get("signals"):
            break
        time.sleep(1)
    env = dict(os.environ, MUDIMODEM_UBUS_SOCK=os.environ["MUDI_EMU_UBUS_SOCK"],
               MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"), MUDIMODEM_POLL="2",
               MUDIMODEM_HIST=os.path.join(W, "hist"), MUDIMODEM_HISTORY_CFG=os.path.join(W, "none"),
               MUDIMODEM_BATT_SYSFS=os.path.join(W, "none"), MUDIMODEM_SUMMARY=os.path.join(W, "summary.jsonl"),
               MUDIMODEM_LINK_INTERVAL="0", MUDIMODEM_CRASH_INTERVAL="0", MUDIMODEM_NO_WS_PUSH="1")
    d = subprocess.Popen([CLI, "run", "eco", os.path.join(ROOT, "src", "sbin", "mudimodemd")], env=env,
                         stdout=subprocess.DEVNULL, stderr=open(os.path.join(W, "daemon.err"), "w"))
    time.sleep(16)
    before = samples()
    h1 = ubus("mudimodem", "health", {})
    gl_cell = ubus("cellular.network", "cell_info", {"bus": "cpu", "slot": 1})
    sim_info, sim_status = ubus("cellular.sim", "info", {}), ubus("cellular.sim", "status", {})
    # a handover: the modem now serves another cell (new PCI, new id), pushed into the running model
    subprocess.run([CLI, "modem", json.dumps({"subs": {"1": {"serving": {
        "cell_id": "187461999", "pci": 333, "rsrp": -106, "rsrq": -17, "sinr": 7}}}})], check=True)
    time.sleep(26)
    after = samples()[len(before):]
    h2 = ubus("mudimodem", "health", {})
    gl_cell2 = ubus("cellular.network", "cell_info", {"bus": "cpu", "slot": 1})
    d.terminate(); d.wait(10)
    json.dump({"before": before, "after": after, "h1": h1, "h2": h2, "gl_cell": gl_cell, "gl_cell2": gl_cell2,
               "sim_info": sim_info, "sim_status": sim_status},
              open(os.path.join(W, "result.json"), "w"))
''')


@unittest.skipUnless(mudiemu.stack_ok(), "needs root, the extracted image and qemu binfmt (mudi-emu check)")
class AgainstGLsOwnStack(unittest.TestCase):
    def test_collector_reads_gl_sampler(self):
        w = tempfile.mkdtemp(prefix="mm-glreal-", dir=os.path.join(ROOT, "build"))
        self.addCleanup(shutil.rmtree, w, True)
        inner = os.path.join(w, "inner.py")
        with open(inner, "w") as f:
            f.write(INNER)
        p = subprocess.run(mudiemu.cmd("up", w, "--scenario", SCENARIO, "--", sys.executable, "-I", inner,
                                       mudiemu.CLI, ROOT), capture_output=True, text=True, timeout=300)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        with open(os.path.join(w, "result.json")) as f:
            r = json.load(f)
        before, after, h1, h2 = r["before"], r["after"], r["h1"], r["h2"]
        self.assertGreaterEqual(len(before), 5, "samples while the cell is steady")
        s = before[-1]
        g = r["gl_cell"]["signal"][0]
        self.assertEqual((s["id"], s["tac"], s["pci"], s["band"], s["tx_channel"]),
                         (r["gl_cell"]["cell_id"], r["gl_cell"]["tac"], g["pci"], g["band"], g["earfcn"]))
        self.assertEqual((s["rsrp"], s["rsrq"], s["sinr"]), (g["rsrp"], g["rsrq"], g["sinr"]))
        self.assertEqual((s["rsrp_level"], s["rsrq_level"], s["sinr_level"]),
                         (g["rsrp_level"], g["rsrq_level"], g["sinr_level"]), "GL's levels, from GL's rows")
        self.assertEqual(h1["cell_info_reads"], 1, "steady: one cell_info, the identity")
        self.assertGreaterEqual(h1["rf_from_gl"], 5)
        # after the handover, from GL's next sample on: the new cell, its id read once more
        new = [x for x in after if x["pci"] == 333]
        self.assertTrue(new, after[-3:])
        g2 = r["gl_cell2"]
        self.assertEqual((new[-1]["id"], new[-1]["rsrp"], new[-1]["rsrp_level"], new[-1]["rsrq_level"]),
                         (g2["cell_id"], -106, g2["signal"][0]["rsrp_level"], g2["signal"][0]["rsrq_level"]))
        self.assertEqual(h2["cell_info_reads"], 2, "one more cell_info, for the new cell")
        self.assertTrue(all(x["pci"] in (721, 333) for x in before + after))
        # the carrier's max bit rate: in sim STATUS (what the speed test reads), never in sim info;
        # GL takes the AMBR line for the SIM's data APN (AT+CGDCONT?), so the APN is there too
        st = {x["slot"]: x for x in r["sim_status"]["sims"]}
        self.assertEqual((st[1]["ambr_dl"], st[1]["ambr_ul"]), (600, 100), "SA: nr5g_ambr, 586 x 4^5 kbps -> Mbps")
        self.assertEqual((st[2]["ambr_dl"], st[2]["ambr_ul"]), (150, 50), "LTE: lte_ambr kbps -> Mbps")
        self.assertEqual((st[1]["apn"], st[2]["apn"]), ("fast.t-mobile.com", "broadband"))
        self.assertFalse(any("ambr_dl" in x for x in r["sim_info"]["sims"]), r["sim_info"])


if __name__ == "__main__":
    unittest.main()
