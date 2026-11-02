#!/usr/bin/env python3
"""Confirm-or-revert end to end, in emulation: the REAL plugin (src/rpc/mudimodem, host lua5.1,
its oui.ubus going through the image's ubus CLI), mudimodemd under the image's eco, and the REAL
sh watchdog (src/sbin/mudimodem-revert, spawned the way production spawns it, under the router's
busybox), on the image's ubusd with a fake GL (test/emu/fake-gl.lua) that records every
`gl-session call` — the watchdog's way back into GL's store.

The drills (docs/architecture.md R3 acceptance: crash, restart, timeout, ubus loss):
  * no confirm -> the watchdog restores GL's snapshot at the deadline, and logs it;
  * Keep -> nothing is restored;
  * mudimodemd killed mid-window, ubusd restarted mid-window -> the revert still lands;
  * a watchdog that never arms -> no write at all;
  * mudimodemd not running -> the in-process arm (the pre-3.0 path) still protects the write;
  * a cell lock's Revert now -> the modem unlock on the pending sub_id, then GL's store.
Skips when the firmware rootfs or qemu is absent (tools/emu.sh check)."""
import json, os, shutil, signal, subprocess, sys, tempfile, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
EMU = os.path.join(ROOT, "tools", "emu.sh")
BUS_SH = os.path.join(HERE, "emu", "gl-bus.sh")
DRIVER = os.path.join(HERE, "emu", "plugin-driver.lua")
WINDOW = 3
OPEN = {"band_enable": False, "network_mode": "AUTO", "supports_band": True}
SNAPSHOT = {"bus": "cpu", "slot": 1, "band_enable": False, "network_mode": "AUTO"}
SCEN = {"modem_status": {"modems": [{"bus": "cpu", "current_sim_slot": 1}]},
        "sim_info": {"sims": [{"slot": 1, "bus": "cpu", "mcc": "310", "mnc": "260", "imsi": "310260123456789"}]},
        "cell_info": [{"network_type": 5, "signal": []}],
        "glc": {"get_cell_tower": {"result": {"slot1": {"pci": 516, "freq": 127490, "network_type": "NR5G",
                                                         "band": 71, "scs": 15}}}}}


def emu_ok():
    return shutil.which("lua5.1") is not None and \
        subprocess.run([EMU, "check"], capture_output=True).returncode == 0


def jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(x) for x in f if x.strip()]


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu / lua5.1 (tools/emu.sh check)")
class ChangeOnEmulatedBus(unittest.TestCase):
    def setUp(self):
        d = self.d = tempfile.mkdtemp(prefix="mm-chg-")
        self.addCleanup(shutil.rmtree, d, True)
        for sub in ("bus", "glc", "etc", "hist", "bin"):
            os.makedirs(os.path.join(d, sub))
        self.bus = os.path.join(d, "bus")
        with open(os.path.join(self.bus, "scen.json"), "w") as f:
            json.dump(SCEN, f)
        with open(os.path.join(d, "glc", "band_config.json"), "w") as f:
            json.dump(OPEN, f)
        # the watchdog as installed: an executable file (the repo keeps it 0644; manifest 0755)
        self.revert = os.path.join(d, "bin", "mudimodem-revert")
        shutil.copy(os.path.join(ROOT, "src", "sbin", "mudimodem-revert"), self.revert)
        os.chmod(self.revert, 0o755)
        self.env = dict(os.environ,
                        PATH=os.path.join(self.bus, "bin") + os.pathsep + os.environ["PATH"],
                        MUDIMODEM_PENDING=os.path.join(d, "etc", "pending"),
                        MUDIMODEM_ARMED=os.path.join(d, "etc", "armed"),
                        MUDIMODEM_BIN=self.revert,
                        MUDIMODEM_DETACH=os.path.join(ROOT, "src", "lib", "mudimodem-detach"),
                        MUDIMODEM_HIST=os.path.join(d, "hist"), MUDIMODEM_WINDOW=str(WINDOW),
                        MUDIMODEM_LOG=os.path.join(d, "revert.log"),
                        MM_PLUGIN=os.path.join(ROOT, "src", "rpc", "mudimodem"),
                        MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"),
                        MUDIMODEM_UBUS_SOCK=os.path.join(self.bus, "ubus.sock"),
                        MUDIMODEMD_COLLECTOR="0")
        self.start_bus()
        self.addCleanup(self.stop_bus)
        self.addCleanup(self.kill_watchdogs)

    # ---- plumbing ---------------------------------------------------------------------------
    def start_bus(self):
        subprocess.run(["sh", BUS_SH, "start", self.bus, os.path.join(self.bus, "scen.json")], check=True)

    def stop_bus(self):
        subprocess.run(["sh", BUS_SH, "stop", self.bus])

    def kill_watchdogs(self):
        subprocess.run(["pkill", "-f", self.revert + " watch"], capture_output=True)

    def daemon(self, **extra):
        p = subprocess.Popen([EMU, "eco", os.path.join(ROOT, "src", "sbin", "mudimodemd")],
                             env=dict(self.env, **extra), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.kill(), p.stdout.close(), p.stderr.close()))
        ubus = os.path.join(self.bus, "bin", "ubus")
        for _ in range(100):
            if subprocess.run([ubus, "call", "mudimodem", "health"], capture_output=True).returncode == 0:
                return p
            time.sleep(0.2)
        self.fail("mudimodemd never registered")

    def plugin(self, method, args=None):
        t0 = time.monotonic()
        out = subprocess.run(["lua5.1", DRIVER, os.path.join(self.bus, "bin", "ubus"), os.path.join(self.d, "glc"),
                              method] + ([json.dumps(args)] if args is not None else []),
                             env=self.env, capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout), time.monotonic() - t0

    def gl_calls(self, func=None):
        return [c["args"] for c in jsonl(os.path.join(self.bus, "calls.jsonl"))
                if c["object"] == "gl-session" and c["method"] == "call" and (func is None or c["args"]["func"] == func)]

    def plugin_writes(self):
        return [c for c in jsonl(os.path.join(self.d, "glc", "glc.jsonl")) if c["method"].startswith("set_")]

    def exec_log(self):
        p = os.path.join(self.d, "glc", "exec.log")
        return open(p).read() if os.path.exists(p) else ""

    def pending(self):
        return os.path.exists(self.env["MUDIMODEM_PENDING"])

    def events(self):
        return [e["label"] for e in jsonl(os.path.join(self.d, "hist", "events.jsonl"))]

    def apply(self):
        r, took = self.plugin("set_bands", {"sa": [78]})
        self.assertTrue(r.get("ok"), r)
        self.assertEqual([w["method"] for w in self.plugin_writes()], ["set_band_config"])
        self.assertTrue(self.pending())
        return r, took

    def wait_window(self):
        time.sleep(WINDOW + 3)

    # ---- drills -----------------------------------------------------------------------------
    def test_no_confirm_reverts_at_the_deadline(self):
        self.daemon()
        r, took = self.apply()
        self.assertLess(took, 3, "the apply no longer waits a second in the nginx worker")
        self.assertNotIn("sleep", self.exec_log())
        self.assertNotIn("watch", self.exec_log(), "the daemon spawned the watchdog, not the plugin")
        self.assertEqual(self.gl_calls("set_band_config"), [], "nothing restored inside the window")
        self.wait_window()
        self.assertEqual([c["params"] for c in self.gl_calls("set_band_config")], [SNAPSHOT],
                         "GL's own snapshot restored through gl-session at the deadline")
        self.assertFalse(self.pending())
        self.assertEqual(self.events(), ["Bands applied", "Auto-revert fired"])
        st, _ = self.plugin("change_status")
        self.assertNotIn("pending", st)

    def test_keep_means_no_revert(self):
        self.daemon()
        self.apply()
        k, _ = self.plugin("confirm")
        self.assertTrue(k["ok"] and k["was_pending"], k)
        self.wait_window()
        self.assertEqual(self.gl_calls("set_band_config"), [])
        self.assertEqual(self.events(), ["Bands applied", "Kept"])

    def test_daemon_killed_mid_window_still_reverts(self):
        p = self.daemon()
        self.apply()
        p.kill(); p.wait(timeout=10)                 # SIGKILL: no clean shutdown at all
        self.wait_window()
        self.assertEqual([c["params"] for c in self.gl_calls("set_band_config")], [SNAPSHOT])
        self.assertFalse(self.pending())

    def test_ubusd_restart_mid_window_still_reverts(self):
        self.daemon()
        self.apply()
        self.stop_bus()
        time.sleep(1)
        self.start_bus()                             # fresh ubusd + fake GL (fresh call log)
        self.wait_window()
        self.assertEqual([c["params"] for c in self.gl_calls("set_band_config")], [SNAPSHOT])
        self.assertFalse(self.pending())

    def test_a_watchdog_that_never_arms_means_no_write(self):
        dud = os.path.join(self.d, "bin", "dud")
        with open(dud, "w") as f:
            f.write("#!/bin/sh\nexit 0\n")
        os.chmod(dud, 0o755)
        self.daemon(MUDIMODEM_BIN=dud, MUDIMODEM_ARM_WAIT="1")
        r, _ = self.plugin("set_bands", {"sa": [78]})
        self.assertIn("failed to arm", r.get("error", ""))
        self.assertEqual(self.plugin_writes(), [], "no write without a live watchdog")
        self.assertFalse(self.pending())

    def test_without_the_daemon_the_old_arm_still_protects(self):
        r, took = self.apply()                       # no mudimodemd at all
        self.assertIn("watch", self.exec_log(), "the plugin spawned the watchdog itself")
        self.assertIn("sleep 1", self.exec_log())
        self.wait_window()
        self.assertEqual([c["params"] for c in self.gl_calls("set_band_config")], [SNAPSHOT])

    def test_cell_revert_now_through_the_daemon(self):
        self.daemon()
        with open(self.env["MUDIMODEM_PENDING"], "w") as f:
            f.write("KIND=cell\nSUB_ID=1\nSLOT=1\nRAT=5g\nPREV_SAVE_CTRL=0,0\nPREV_mode_pref=AUTO\n"
                    "PREV_nr5g_disable_mode=0\nDEADLINE=%d\n" % (int(time.time()) + 300))
        with open(self.env["MUDIMODEM_ARMED"], "w") as f:
            f.write("1\n")
        r, _ = self.plugin("revert_now")
        self.assertTrue(r.get("ok") and r.get("reverted") and r.get("gl_reconciled"), r)
        ats = [c["args"] for c in jsonl(os.path.join(self.bus, "calls.jsonl")) if c["method"] == "get_result_AT"]
        self.assertEqual(ats[0]["cmd"], 'AT+QNWLOCK="common/5g",0')
        self.assertEqual({a.get("sub_id") for a in ats}, {1}, "every AT on the pending sub_id, never 0")
        unlock = self.gl_calls("set_cell_tower")
        self.assertEqual(len(unlock), 1)
        self.assertEqual((unlock[0]["params"]["slot"], unlock[0]["params"]["lock"], unlock[0]["params"]["network_type"]),
                         (1, False, "NR5G"))
        self.assertEqual(unlock[0]["params"]["pci"], 516, "GL's stored tower rides along")
        self.assertFalse(self.pending())
        self.assertFalse(os.path.exists(self.env["MUDIMODEM_ARMED"]), "the sleeping watchdog stands down")
        self.assertIn("Reverted", self.events())


if __name__ == "__main__":
    unittest.main()
