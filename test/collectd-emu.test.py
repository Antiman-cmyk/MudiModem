#!/usr/bin/env python3
"""mudimodemd end to end against an emulated GL 4.10 bus: the image's own ubusd + ubus CLI and a
fake cellular stack (mudi-emu's fakebus: lib/fakebus/fake-gl.lua under the image's eco), all via qemu. Nothing is mocked
inside the daemon: it talks eco.ubus to the real ubusd.

The collector's samples must be the ones in test/golden/compat.json (frozen from the python
collector it replaced: the R3 shadow comparison, kept). The contract:
  * one `cellular.network cell_info {bus:"cpu", slot:<active>}` per tick, never anything else;
  * a FAILED read skips the tick (no line, no push), "no service" is an honest sample;
  * samples.jsonl / latest.json / the `mudimodem.collect` push carry cellular_compat's sample
    (the push as GL's gl-session delivers it: null keys dropped, [] -> {});
  * carrier identity (`cellular.network info`) is read once, not per tick;
  * no browser attached (has_ws false) -> no push at all;
  * battery from sysfs (+ glbattlimit state), eMMC backup flush and boot restore.
Skips when the firmware rootfs or qemu is absent (mudi-emu check)."""
import http.server, json, os, shutil, signal, subprocess, sys, tempfile, threading, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import fixtures410 as ct  # noqa: E402  (GL 4.10 payloads)

import mudiemu  # noqa: E402  (tools/mudi-emu: the router's userland + a fake GL bus)
EMU = mudiemu.cmd("run")
ENGINES = {"eco": [*EMU, "eco", os.path.join(ROOT, "src", "sbin", "mudimodemd")]}
with open(os.path.join(HERE, "golden", "compat.json")) as _f:
    _G = json.load(_f)


def golden_sample(status, cell, networks):
    """The sample the python collector built for these payloads (test/golden/compat.json), minus t."""
    for c, w in zip(_G["cases"], _G["want"]):
        if c["fn"] == "build_sample" and c["args"][:3] == [status, cell, networks] and len(c["args"]) == 4:
            w = dict(w)
            w.pop("t", None)
            if w.get("signals") == "[]":
                w["signals"] = []
            return w
    raise KeyError("no golden build_sample case for these payloads")
CELLS = [ct.CELL_INFO_410_SA, ct.CELL_INFO_410_NSA_CA, {"fail": True}, ct.CELL_INFO_410_NO_SERVICE]
SYSFS = {"cw221X-bat/capacity": "87", "cw221X-bat/voltage_now": "4012345", "cw221X-bat/temp": "312",
         "cw221X-bat/current_now": "-363", "cw221X-bat/cycle_count": "12", "cw221X-bat/health": "Good",
         "charger/online": "1", "charger/status": "Charging", "charger/charge_type": "Fast"}


def emu_ok():
    return mudiemu.ok()


def jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(x) for x in f if x.strip()]


def ct_sample(status, cell, networks):
    """The sample the collector builds from GL's cell_info, computed by the collector's own code
    (cellular_compat.build_sample under the image's Lua), minus t: the reference the get_signals
    path must reproduce."""
    out = subprocess.run([*EMU, "lua", "-e", REF_LUA], input=json.dumps([status, cell, networks]),
                         capture_output=True, text=True, env=dict(os.environ, LUA_PATH=os.path.join(ROOT, "src", "lib", "?.lua") + ";;"))
    if out.returncode != 0:
        raise AssertionError(out.stderr)
    s = json.loads(out.stdout)
    s.pop("t", None)
    if s.get("signals") == {}:
        s["signals"] = []
    return s


REF_LUA = """
local cjson = require "cjson"; local cc = require "cellular_compat"; cc.init(cjson.null)
local a = cjson.decode(io.read("*a"))
io.write(cjson.encode(cc.build_sample(a[1], a[2], a[3], 0, "cpu", nil, cjson.empty_array)))
"""


def strip_t(s):
    return {k: v for k, v in s.items() if k != "t"}


def wire(v):
    """What a browser receives for `ubus call gl-session notify {name, data:v}`: GL's handler
    (usr/sbin/gl-ngx-session, notify) cjson-encodes the eco.ubus-decoded message, so every JSON
    null key is gone and an empty array arrives as {} (docs/cellular-api-4.10.md, gl-session)."""
    if isinstance(v, dict):
        return {k: wire(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [wire(x) for x in v] if v else {}
    return v


def write_tree(root, files):
    for rel, body in files.items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(body + "\n")


@unittest.skipUnless(emu_ok(), "no firmware rootfs / qemu (mudi-emu check)")
class CollectorOnEmulatedBus(unittest.TestCase):
    def run_collector(self, engine, scen, ticks, sysfs=None, history=False, seed=None, extra_env=None):
        d = tempfile.mkdtemp(prefix="mm-emu-")
        self.addCleanup(shutil.rmtree, d, True)
        bus = os.path.join(d, "bus"); hist = os.path.join(d, "hist"); persist = os.path.join(d, "persist")
        os.makedirs(bus); os.makedirs(hist)
        with open(os.path.join(bus, "scen.json"), "w") as f:
            json.dump(scen, f)
        mudiemu.bus("start", bus, os.path.join(bus, "scen.json"))
        self.addCleanup(mudiemu.bus, "stop", bus)
        cfg = os.path.join(d, "history.json")
        if history:
            with open(cfg, "w") as f:
                json.dump({"enabled": True}, f)
        if seed:
            write_tree(persist, seed)
        if sysfs:
            write_tree(os.path.join(d, "sysfs"), sysfs)
        with open(os.path.join(d, "glbattlimit.pid"), "w") as f:
            f.write("%d\n" % os.getpid())                   # a live pid: the limiter is running
        with open(os.path.join(d, "glbattlimit.limit"), "w") as f:
            f.write("80\n")
        env = dict(os.environ, PATH=os.path.join(bus, "bin") + os.pathsep + os.environ["PATH"],
                   MUDIMODEM_UBUS_SOCK=os.path.join(bus, "ubus.sock"),
                   MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"),
                   MUDIMODEM_POLL="0.2", MUDIMODEM_BATT_INTERVAL="0.5", MUDIMODEM_FLUSH_INTERVAL="0.4",
                   MUDIMODEM_HIST=hist, MUDIMODEM_HISTORY_PERSIST=persist, MUDIMODEM_HISTORY_CFG=cfg,
                   MUDIMODEM_BATT_SYSFS=os.path.join(d, "sysfs"),
                   MUDIMODEM_BATTLIMIT_PIDF=os.path.join(d, "glbattlimit.pid"),
                   MUDIMODEM_BATTLIMIT_LIMF=os.path.join(d, "glbattlimit.limit"),
                   MUDIMODEM_LINK_INTERVAL="0", MUDIMODEM_CRASH_INTERVAL="0",   # their own drills
                   MUDIMODEM_SUMMARY=os.path.join(d, "summary.jsonl"))
        env.update(extra_env or {})
        env.pop("MUDIMODEM_NO_WS_PUSH", None)
        p = subprocess.Popen(ENGINES[engine], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        calls = os.path.join(bus, "calls.jsonl")
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and p.poll() is None:
            # one `cellular.modem status` per RF tick, whatever the RF source
            if sum(1 for c in jsonl(calls) if c["method"] == "status" and c["object"] == "cellular.modem") >= ticks:
                break
            time.sleep(0.2)
        time.sleep(0.6)                       # let the last tick / flush finish
        p.send_signal(signal.SIGTERM)
        _, err = p.communicate(timeout=20)
        return {"calls": jsonl(calls), "notify": jsonl(os.path.join(bus, "notify.jsonl")),
                "samples": jsonl(os.path.join(hist, "samples.jsonl")),
                "battery": jsonl(os.path.join(hist, "battery.jsonl")),
                "events": jsonl(os.path.join(hist, "events.jsonl")),
                "summary": jsonl(os.path.join(d, "summary.jsonl")),
                "latest": jsonl(os.path.join(hist, "latest.json")),
                "batt_latest": jsonl(os.path.join(hist, "battery-latest.json")),
                "persist": {n: jsonl(os.path.join(persist, n)) for n in
                            (os.listdir(persist) if os.path.isdir(persist) else [])},
                "stderr": err, "rc": p.returncode}

    def check_ticks(self, engine):
        scen = {"modem_status": ct.MODEM_STATUS_410_TWO, "network_info": ct.NETWORK_INFO_410,
                "cell_info": CELLS, "has_ws": True}
        r = self.run_collector(engine, scen, ticks=len(CELLS))
        self.assertEqual(r["rc"], 0, r["stderr"])
        cells = [c for c in r["calls"] if c["method"] == "cell_info"]
        self.assertGreaterEqual(len(cells), len(CELLS))
        # the active slot of the built-in modem (not the USB one listed first), never sub_id
        for c in cells:
            self.assertEqual(c["args"], {"bus": "cpu", "slot": 1})
        statuses = [c for c in r["calls"] if c["object"] == "cellular.modem" and c["method"] == "status"]
        self.assertEqual(len(statuses), len(cells), "exactly one cell_info per tick")
        # nothing but the read path: no AT, no writes (GL's sampler is absent here: get_signals is
        # asked and answers nothing, so every tick reads cell_info — the startup path)
        seen = {(c["object"], c["method"]) for c in r["calls"]}
        self.assertLessEqual(seen, {("cellular.modem", "status"), ("cellular.network", "cell_info"),
                                    ("cellular.network", "info"), ("network.interface", "dump"),
                                    ("cellular.collect", "get_signals")})
        self.assertEqual(sum(1 for c in r["calls"] if c["method"] == "info"), 1,
                         "carrier identity is cached, not read per tick")
        # samples follow the cell_info cycle; the failed read leaves no line
        want = []
        for i in range(len(cells)):
            cell = CELLS[i % len(CELLS)]
            if not cell.get("fail"):
                want.append(golden_sample(ct.MODEM_STATUS_410_TWO, cell, ct.NETWORK_INFO_410))
        got = [strip_t(s) for s in r["samples"]]
        self.assertEqual(got, want[:len(got)])
        self.assertGreaterEqual(len(got), 3)
        self.assertTrue(any(not s["registered"] for s in got), "no service is a sample, not a skip")
        self.assertEqual(r["latest"][-1], r["samples"][-1])
        self.assertIn("cell_info read failed", r["stderr"])
        # every sample is pushed once on GL's bus under the page's global_sockets name — as the
        # wire delivers it (no null keys, an empty signals list as {}: the page guards both)
        frames = [n for n in r["notify"] if n.get("name") == "mudimodem.collect"]
        self.assertEqual([f["data"] for f in frames], [wire(s) for s in r["samples"]])
        self.assertIn({}, [f["data"]["signals"] for f in frames], "no-service frame reached the wire")
        self.assertEqual(len(r["notify"]), len(frames), "no battery frames without a fuel gauge")
        self.assertEqual(r["battery"], [])

    def test_ticks_samples_and_pushes_eco(self):
        self.check_ticks("eco")

    def check_no_browser(self, engine):
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": False}
        r = self.run_collector(engine, scen, ticks=3, sysfs=SYSFS)
        self.assertEqual(r["rc"], 0, r["stderr"])
        self.assertGreaterEqual(len(r["samples"]), 3)
        self.assertGreaterEqual(len(r["battery"]), 1)
        self.assertEqual(r["notify"], [])

    def test_no_browser_no_push_eco(self):
        self.check_no_browser("eco")

    def test_battery_backup_restore(self):
        """Battery on, eMMC backup on with a backup from a previous boot: the daemon restores it,
        samples (the python collector's samples), pushes and flushes."""
        now = int(time.time() * 1000)
        old = {"t": now - 60000, "slot": 1, "registered": True, "rsrp": -88}
        stale = {"t": now - 25 * 3600 * 1000, "slot": 1, "registered": True}
        seed = {"samples.jsonl": "\n".join(json.dumps(x) for x in (stale, old))}
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_NSA, ct.CELL_INFO_410_SA], "has_ws": True}
        runs = {e: self.run_collector(e, scen, ticks=4, sysfs=SYSFS, history=True, seed=seed)
                for e in ENGINES}
        for e, r in runs.items():
            self.assertEqual(r["rc"], 0, "%s: %s" % (e, r["stderr"]))
            # boot restore: the in-window backup line seeds tmpfs, the >24 h one does not
            self.assertEqual(r["samples"][0], old, e)
            self.assertNotIn(stale, r["samples"], e)
            # battery sample: units per node, limiter state recorded
            b = r["battery"][0]
            self.assertEqual(strip_t(b), {"cap": 87, "volt": 4012, "cur": -363, "temp": 31.2, "online": 1,
                                          "status": "Charging", "ctype": "Fast", "cycles": 12,
                                          "health": "Good", "lim": 1, "lim_gauge": 80}, e)
            self.assertEqual(r["batt_latest"][-1], r["battery"][-1], e)
            bframes = [n["data"] for n in r["notify"] if n["name"] == "mudimodem.battery"]
            self.assertEqual(bframes, [wire(x) for x in r["battery"]], e)
            # the old segment's head is past the window -> rotated to .prev (a rename), and the
            # flush appended only what is new since the backup's newest line to a fresh segment
            self.assertEqual(r["persist"].get("samples.prev.jsonl"), [stale, old], e)
            backed = r["persist"].get("samples.jsonl", [])
            self.assertGreaterEqual(len(backed), 2, e)
            self.assertEqual(backed, r["samples"][1:1 + len(backed)], e)
            self.assertTrue(r["persist"].get("battery.jsonl"), e)
        eco = runs["eco"]
        live = [strip_t(x) for x in eco["samples"][1:]]       # [0] is the restored backup line
        self.assertGreaterEqual(len(live), 3)
        cells = [ct.CELL_INFO_410_NSA, ct.CELL_INFO_410_SA]
        self.assertEqual(live, [golden_sample(ct.MODEM_STATUS_410, cells[i % 2], ct.NETWORK_INFO_410)
                                for i in range(len(live))], "the python collector's samples")
        seq = [(c["object"], c["method"], c["args"]) for c in eco["calls"]]
        self.assertEqual(seq[:4], [("cellular.modem", "status", {}),
                                   ("cellular.collect", "get_signals", {"bus": "cpu", "time": 25, "slot": 1}),
                                   ("cellular.network", "cell_info", {"bus": "cpu", "slot": 1}),
                                   ("cellular.network", "info", {})],
                         "per tick: the slot, GL's sampler (none here), cell_info, then the carrier once")

    def test_eco_throughput_from_the_cellular_device_counters(self):
        """Each sample carries the cellular device's kbit/s since the previous tick, from sysfs
        (no AT); the device comes from network.interface dump; a counter reset (reconnect) gives
        no value for that tick, never a negative or huge one."""
        d = tempfile.mkdtemp(prefix="mm-net-")
        self.addCleanup(shutil.rmtree, d, True)
        stat = os.path.join(d, "rmnet_data1", "statistics")
        os.makedirs(stat)
        def put(rx, tx):
            for n, v in (("rx_bytes", rx), ("tx_bytes", tx)):
                with open(os.path.join(stat, n + ".tmp"), "w") as f:
                    f.write("%d\n" % v)
                os.replace(os.path.join(stat, n + ".tmp"), os.path.join(stat, n))
        put(0, 0)
        stop = threading.Event()
        def feed():                                   # 1.25 MB/s down, 125 kB/s up = 10000 / 1000 kbit/s
            t0, reset_at = time.monotonic(), None
            while not stop.is_set():
                el = time.monotonic() - t0
                if reset_at is None and el > 3.0:
                    reset_at = el                     # the modem reconnected: counters restart
                base = (el - reset_at) if reset_at else el
                put(int(base * 1250000), int(base * 125000))
                time.sleep(0.05)
        th = threading.Thread(target=feed, daemon=True); th.start()
        self.addCleanup(stop.set)
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": True,
                "network_dump": {"interface": [{"interface": "modem_1_1_2", "proto": "rmnet", "up": True,
                                                "l3_device": "rmnet_data1"}]}}
        r = self.run_collector("eco", scen, ticks=24, extra_env={"MUDIMODEM_NET_SYSFS": d})
        self.assertEqual(r["rc"], 0, r["stderr"])
        rates = [(s.get("rx_kbps"), s.get("tx_kbps")) for s in r["samples"]]
        self.assertIsNone(rates[0][0], "no rate before a second reading")
        good = [x for x in rates[1:] if x[0] is not None]
        self.assertGreaterEqual(len(good), 8)
        for down, up in good:
            self.assertTrue(0 <= down < 30000 and 0 <= up < 3000, (down, up))
        mid = sorted(g[0] for g in good)[len(good) // 2]
        self.assertTrue(6000 < mid < 14000, "about 10000 kbit/s down, got median %s" % mid)
        self.assertIn(None, [x[0] for x in rates[2:]], "the counter reset gave one tick without a rate")
        dumps = [c for c in r["calls"] if c["method"] == "dump"]
        self.assertEqual(len(dumps), 1, "the device is looked up per NETDEV_INTERVAL, not per tick")

    def test_eco_link_probe_outage_and_modem_crash(self):
        """The connectivity probe pings out of the cellular device (GL's own check: ping -I <dev>
        -c 1) at GL's tracking IPs (`uci get glconfig.general.track_ip`), trying the next target
        when one is silent. Its result rides on the next sample (ping_ms / ping_lost); two misses in
        a row after the link worked = one "Offline" event, the first reply after that one "Back
        online" with the outage's length. A new dump in GL's crash-dump directory = one "Modem
        crash" event; what was there at start is only remembered."""
        d = tempfile.mkdtemp(prefix="mm-link-")
        self.addCleanup(shutil.rmtree, d, True)
        ok, argv_log, crash = os.path.join(d, "ping-ok"), os.path.join(d, "ping.argv"), os.path.join(d, "crash")
        os.makedirs(crash)
        with open(os.path.join(crash, "old.elf"), "w") as f:
            f.write("an old dump\n")
        ping, uci = os.path.join(d, "ping.sh"), os.path.join(d, "uci.sh")
        with open(ping, "w") as f:                    # busybox ping's output, when ping-ok exists
            f.write('#!/bin/sh\necho "$*" >> %s\nfor a; do ip=$a; done\n'
                    '[ -f %s ] || { echo "PING $ip ($ip): 56 data bytes"; exit 1; }\n'
                    'echo "PING $ip ($ip): 56 data bytes"\n'
                    'echo "64 bytes from $ip: seq=0 ttl=57 time=23.456 ms"\n' % (argv_log, ok))
        with open(uci, "w") as f:
            f.write('#!/bin/sh\n[ "$*" = "-q get glconfig.general.track_ip" ] && echo "9.9.9.9 1.0.0.1 bad;ip"\n')
        os.chmod(ping, 0o755); os.chmod(uci, 0o755)
        open(ok, "w").close()
        stop = threading.Event()
        def script():                                 # up, then 2.5 s without replies, a crash, up
            t0 = time.monotonic()
            for at, act in ((2.5, lambda: os.unlink(ok)), (3.5, lambda: open(os.path.join(crash, "new.elf"), "w").close()),
                            (5.0, lambda: open(ok, "w").close())):
                while not stop.is_set() and time.monotonic() - t0 < at:
                    time.sleep(0.05)
                act()
        th = threading.Thread(target=script, daemon=True); th.start()
        self.addCleanup(stop.set)
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": True,
                "network_dump": {"interface": [{"interface": "modem_1_1_2", "proto": "rmnet", "up": True,
                                                "l3_device": "rmnet_data1"}]}}
        r = self.run_collector("eco", scen, ticks=40, extra_env={
            "MUDIMODEM_PING": ping, "MUDIMODEM_UCI": uci, "MUDIMODEM_LINK_INTERVAL": "0.6",
            "MUDIMODEM_LINK_RETRY": "0.3", "MUDIMODEM_LINK_WAIT": "1", "MUDIMODEM_CRASH_DIR": crash,
            "MUDIMODEM_CRASH_INTERVAL": "0.3"})
        self.assertEqual(r["rc"], 0, r["stderr"])
        with open(argv_log) as f:
            argv = [x.split() for x in f.read().splitlines()]
        self.assertEqual(argv[0], ["-I", "rmnet_data1", "-c", "1", "-W", "1", "9.9.9.9"])
        self.assertEqual({a[-1] for a in argv}, {"9.9.9.9", "1.0.0.1"}, "GL's targets, the malformed one dropped")
        self.assertIn(["-I", "rmnet_data1", "-c", "1", "-W", "1", "1.0.0.1"], argv, "a silent target -> the next")
        pings = [s.get("ping_ms") for s in r["samples"] if "ping_ms" in s]
        lost = [s for s in r["samples"] if s.get("ping_lost")]
        self.assertGreaterEqual(len(pings), 3)
        self.assertEqual(set(pings), {23})
        self.assertGreaterEqual(len(lost), 2)
        self.assertLess(len(pings) + len(lost), len(r["samples"]), "a probe rides on ONE sample")
        link = [(e["label"], e["detail"]) for e in r["events"] if e["kind"] == "link"]
        self.assertEqual([x[0] for x in link], ["Offline", "Back online"])
        self.assertEqual(link[0][1], "No reply to ping")
        back = [e for e in r["events"] if e["label"] == "Back online"][0]
        self.assertTrue(1 <= back["secs"] <= 5, back)
        self.assertTrue(isinstance(back["t"], int) and back["t"] >= r["events"][0]["t"])
        crashes = [e for e in r["events"] if e["kind"] == "modem"]
        self.assertEqual([e["label"] for e in crashes], ["Modem crash"], "the old dump is no event")
        pushed = [n["data"]["label"] for n in r["notify"] if n.get("name") == "mudimodem.event"]
        self.assertEqual(sorted(pushed), sorted(e["label"] for e in r["events"]))
        self.assertIn("link: offline", r["stderr"])

    def test_eco_hourly_summary_per_cell(self):
        """The long-term record: every sample lands in its hour's per-cell aggregate (1 s "hours"
        here), a finished hour is appended to the summary file, the open one on a clean stop; no
        service is time too; the time covered adds up to the samples taken."""
        scen = {"modem_status": ct.MODEM_STATUS_410_TWO, "network_info": ct.NETWORK_INFO_410,
                "cell_info": CELLS, "has_ws": True}
        r = self.run_collector("eco", scen, ticks=16, extra_env={"MUDIMODEM_SUMMARY_PERIOD": "1"})
        self.assertEqual(r["rc"], 0, r["stderr"])
        lines = r["summary"]
        self.assertGreaterEqual(len(lines), 3, lines)
        ts = [x["t"] for x in lines]
        self.assertEqual(ts, sorted(ts), "append order is time order")
        self.assertTrue(all(t % 1000 == 0 for t in ts), "bucket starts")
        self.assertAlmostEqual(sum(x["secs"] for x in lines), 0.2 * len(r["samples"]), delta=0.05,
                               msg="every sample is in exactly one line")
        cells = [x for x in lines if not x.get("no_service")]
        self.assertTrue(any(x.get("no_service") for x in lines), "no service is recorded time")
        self.assertEqual({x["cell"] for x in cells}, {s["id"] for s in r["samples"] if s.get("id")})
        for x in cells:
            lo, avg, hi = x["rsrp"]
            self.assertTrue(lo <= avg <= hi, x)
            self.assertEqual(x["slot"], 1)
        # one key per (hour, cell): no duplicate within a bucket from one run
        keys = [(x["t"], x.get("cell"), x.get("no_service")) for x in lines]
        self.assertEqual(len(keys), len(set(keys)))

    def run_gl_sampler(self, rows_cycle, cells, ticks, **env):
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410, "has_ws": True,
                "gl_signals": rows_cycle, "cell_info": cells}
        r = self.run_collector("eco", scen, ticks=ticks, extra_env=env)
        self.assertEqual(r["rc"], 0, r["stderr"])
        return r

    def test_eco_rf_from_gl_sampler(self):
        """RF comes from GL's own sampler (get_signals: no AT); cell_info only for the identity.
        The sample built from GL's level-less rows is the one GL's own cell_info gives (levels
        with GL's thresholds, measured by running GL's cellular_manager: mudi-emu up)."""
        rows = ct.gl_signal_rows(ct.GL_CELL_SA)
        r = self.run_gl_sampler([rows], [ct.GL_CELL_SA], ticks=8)
        gets = [c for c in r["calls"] if c["method"] == "get_signals"]
        cells = [c for c in r["calls"] if c["method"] == "cell_info"]
        self.assertGreaterEqual(len(gets), 8)
        self.assertEqual(len(cells), 1, "one cell_info for the identity, then GL's rows only")
        self.assertEqual(gets[0]["args"], {"bus": "cpu", "time": 25, "slot": 1})
        want = ct_sample(ct.MODEM_STATUS_410, ct.GL_CELL_SA, ct.NETWORK_INFO_410)
        got = [strip_t(x) for x in r["samples"]]
        self.assertGreaterEqual(len(got), 8)
        for g in got:
            self.assertEqual(g, want)
        self.assertEqual((got[-1]["rsrp_level"], got[-1]["rsrq_level"], got[-1]["sinr_level"]), (4, 3, 2))

    def test_eco_gl_sampler_handover_nsa_and_no_service(self):
        """A new serving carrier in GL's rows -> one cell_info for the new identity; EN-DC rows
        get each row's own level family; no service needs no cell_info at all."""
        sa, nsa, none = (ct.gl_signal_rows(c) for c in (ct.GL_CELL_SA, ct.GL_CELL_NSA, ct.GL_CELL_NO_SERVICE))
        r = self.run_gl_sampler([sa, sa, nsa, nsa, none, none] + [sa] * 12,     # the tail outlasts the run
                                [ct.GL_CELL_SA, ct.GL_CELL_NSA, ct.GL_CELL_SA], ticks=8)
        got = [strip_t(x) for x in r["samples"]][:8]
        want = [ct_sample(ct.MODEM_STATUS_410, c, ct.NETWORK_INFO_410) for c in
                (ct.GL_CELL_SA, ct.GL_CELL_SA, ct.GL_CELL_NSA, ct.GL_CELL_NSA,
                 ct.GL_CELL_NO_SERVICE, ct.GL_CELL_NO_SERVICE, ct.GL_CELL_SA, ct.GL_CELL_SA)]
        self.assertEqual(got, want)
        cells = [c for c in r["calls"] if c["method"] == "cell_info"]
        self.assertEqual(len(cells), 3, "SA, then NSA, then SA again after the outage — never for no service")
        self.assertFalse(got[4]["registered"])

    def test_eco_gl_sampler_stale_and_identity_refresh(self):
        """GL's rows older than 25 s are not used (cell_info every tick); a steady cell's identity is
        re-read once per IDENTITY_EVERY."""
        rows = ct.gl_signal_rows(ct.GL_CELL_SA)
        stale = self.run_collector("eco", {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                                           "has_ws": True, "gl_signals": [rows], "gl_signals_age": 60,
                                           "cell_info": [ct.GL_CELL_SA]}, ticks=5)
        self.assertEqual(stale["rc"], 0, stale["stderr"])
        n_ticks = len([c for c in stale["calls"] if c["method"] == "get_signals"])
        self.assertEqual(len([c for c in stale["calls"] if c["method"] == "cell_info"]), n_ticks,
                         "stale rows: every tick reads cell_info")
        fast = self.run_gl_sampler([rows], [ct.GL_CELL_SA], ticks=12, MUDIMODEM_IDENTITY_EVERY="0.5")
        n = len([c for c in fast["calls"] if c["method"] == "cell_info"])
        self.assertTrue(3 <= n <= 8, "identity re-read about every 0.5 s at a 0.2 s poll, got %d of 12 ticks" % n)

    def test_eco_shared_trim_loses_no_line(self):
        """events.jsonl is appended to by the plugin and the watchdog while the daemon trims it:
        a line appended during a trim (before the rename, or into the old inode after it) must
        survive. A real writer process races the image's eco running jsonl.trim(shared)."""
        d = tempfile.mkdtemp(prefix="mm-trim-")
        self.addCleanup(shutil.rmtree, d, True)
        path, stop = os.path.join(d, "events.jsonl"), os.path.join(d, "stop")
        with open(path, "w") as f:
            f.write("".join(json.dumps({"t": t, "kind": "old"}) + "\n" for t in range(100)))
        trimmer = subprocess.Popen([*EMU, "eco", os.path.join(HERE, "emu", "shared-trim.lua"),
                                    os.path.join(ROOT, "src", "lib"), path, stop],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        written = list(range(100, 700))
        for t in written:                                  # one O_APPEND write per line, like `echo >>`
            fd = os.open(path, os.O_WRONLY | os.O_APPEND)
            os.write(fd, (json.dumps({"t": t, "kind": "x"}) + "\n").encode())
            os.close(fd)
            time.sleep(0.004)
        time.sleep(0.5)
        open(stop, "w").close()
        out, err = trimmer.communicate(timeout=60)
        self.assertEqual(trimmer.returncode, 0, err)
        self.assertGreaterEqual(int(out.strip() or 0), 3, "the trimmer actually raced the writer")
        got = [json.loads(l)["t"] for l in open(path) if l.strip()]
        self.assertEqual(got, sorted(got), "order kept")
        last = got[-1]
        self.assertEqual(last, written[-1])
        self.assertEqual([t for t in got if t >= last - 50], [t for t in written if t >= last - 50],
                         "a line appended during a trim was lost")

    def start_bus(self, scen):
        d = tempfile.mkdtemp(prefix="mm-emu-")
        self.addCleanup(shutil.rmtree, d, True)
        bus = os.path.join(d, "bus"); os.makedirs(bus)
        with open(os.path.join(bus, "scen.json"), "w") as f:
            json.dump(scen, f)
        mudiemu.bus("start", bus, os.path.join(bus, "scen.json"))
        self.addCleanup(mudiemu.bus, "stop", bus)
        env = dict(os.environ, MUDIMODEM_UBUS_SOCK=os.path.join(bus, "ubus.sock"),
                   MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"), MUDIMODEM_POLL="0.2",
                   MUDIMODEM_HIST=os.path.join(d, "hist"), MUDIMODEM_HISTORY_CFG=os.path.join(d, "none"),
                   MUDIMODEM_BATT_SYSFS=os.path.join(d, "none"), MUDIMODEM_SUMMARY=os.path.join(d, "summary.jsonl"),
                   MUDIMODEM_LINK_INTERVAL="0", MUDIMODEM_CRASH_INTERVAL="0")
        return d, bus, env

    def spawn_eco(self, env):
        p = subprocess.Popen(ENGINES["eco"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.kill(), p.stdout.close(), p.stderr.close()))
        return p

    def wait_samples(self, hist, n, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            got = jsonl(os.path.join(hist, "samples.jsonl"))
            if len(got) >= n:
                return got
            time.sleep(0.2)
        return jsonl(os.path.join(hist, "samples.jsonl"))

    def test_eco_survives_a_ubusd_restart(self):
        """ubusd going away and coming back must not leave the daemon alive but deaf: sampling
        resumes and `mudimodem` is registered again (eco auto_reconnect)."""
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": True}
        d, bus, env = self.start_bus(scen)
        p = self.spawn_eco(env)
        hist = env["MUDIMODEM_HIST"]
        self.assertGreaterEqual(len(self.wait_samples(hist, 2)), 2)
        mudiemu.bus("stop", bus)
        time.sleep(1.0)
        self.assertIsNone(p.poll(), "the daemon survives ubusd going away")
        before = len(jsonl(os.path.join(hist, "samples.jsonl")))
        mudiemu.bus("start", bus, os.path.join(bus, "scen.json"))
        self.assertGreaterEqual(len(self.wait_samples(hist, before + 3)), before + 3, "sampling resumed")
        out = subprocess.run([os.path.join(bus, "bin", "ubus"), "call", "mudimodem", "health"],
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, "mudimodem re-registered: " + out.stderr)
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(timeout=20), 0)

    def test_eco_a_wedged_cell_info_costs_one_timeout(self):
        """A cell_info that never answers (wedged modem stack) ends at the ubus timeout as a
        skipped tick; the next tick samples normally."""
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [{"hang": 6}, ct.CELL_INFO_410_SA], "has_ws": True}
        d, bus, env = self.start_bus(scen)
        env["MUDIMODEM_UBUS_TIMEOUT"] = "1"
        t0 = time.monotonic()
        p = self.spawn_eco(env)
        got = self.wait_samples(env["MUDIMODEM_HIST"], 2, timeout=20)
        took = time.monotonic() - t0
        p.send_signal(signal.SIGTERM)
        _, err = p.communicate(timeout=20)
        self.assertGreaterEqual(len(got), 2)
        self.assertLess(took, 5.5, "the hang cost the 1 s timeout, not the modem's 6 s")
        self.assertIn("no reply (ubus failed or timed out)", err)

    # ---- the AT queue (stage 3): the console's commands, in the daemon -------------------------
    def ubus(self, bus, method, args):
        out = subprocess.run([os.path.join(bus, "bin", "ubus"), "call", "mudimodem", method, json.dumps(args)],
                             capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def wait_health(self, bus):
        for _ in range(100):
            out = subprocess.run([os.path.join(bus, "bin", "ubus"), "call", "mudimodem", "health"],
                                 capture_output=True, text=True)
            if out.returncode == 0:
                return json.loads(out.stdout)
            time.sleep(0.2)
        self.fail("mudimodemd never registered")

    AT = {"ATI": "\r\nQuectel\r\nRG650V\r\n\r\nOK\r\n",
          "AT+SLOW": {"hang": 2, "reply": "\r\n+SLOW: 1\r\n\r\nOK\r\n"}}

    def test_eco_at_sequence_via_gl_service(self):
        """One sequence through GL's AT service, exactly as GL's console sends it (sub_id = the
        active slot), stopping at the first step that is not OK; the collector keeps sampling
        while a slow command holds the channel."""
        scen = {"modem_status": ct.MODEM_STATUS_410_TWO, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": True, "at": self.AT}
        d, bus, env = self.start_bus(scen)
        p = self.spawn_eco(env)
        self.wait_health(bus)
        j = self.ubus(bus, "at_start", {"cmd": "ATI\nAT+CSQ\nAT+NEVER", "timeout": 5})
        self.assertIn("id", j)
        r = self.ubus(bus, "at_wait", {"id": j["id"], "wait": 10})
        self.assertTrue(r["done"] and r["ok"], r)
        self.assertEqual((r["transport"], r["slot"], r["sub_id"]), ("gl", 1, 1))
        self.assertEqual([s["status"] for s in r["steps"]], ["ok", "error"])
        self.assertTrue(r["aborted"])
        self.assertIn("RG650V", r["steps"][0]["response"])
        ats = [c["args"] for c in jsonl(os.path.join(bus, "calls.jsonl")) if c["method"] == "get_result_AT"]
        self.assertEqual(ats, [{"cmd": "ATI", "timeout": 5, "source_flag": 1, "sub_id": 1},
                               {"cmd": "AT+CSQ", "timeout": 5, "source_flag": 1, "sub_id": 1}])
        # a slow command: pending first (wait 0), the collector is not held up, then done
        before = len(jsonl(os.path.join(env["MUDIMODEM_HIST"], "samples.jsonl")))
        j = self.ubus(bus, "at_start", {"cmd": "AT+SLOW", "timeout": 5})
        r = self.ubus(bus, "at_wait", {"id": j["id"], "wait": 0})
        self.assertTrue(r["pending"] and not r["done"], r)
        r = self.ubus(bus, "at_wait", {"id": j["id"], "wait": 10})
        self.assertTrue(r["done"] and r["steps"][0]["status"] == "ok", r)
        during = len(jsonl(os.path.join(env["MUDIMODEM_HIST"], "samples.jsonl"))) - before
        self.assertGreaterEqual(during, 3, "sampling went on while the AT command waited")
        # validation happens in the daemon; nothing is sent for a bad request
        self.assertIn("error", self.ubus(bus, "at_start", {"cmd": ""}))
        self.assertIn("error", self.ubus(bus, "at_start", {"cmd": "A" * 300}))
        self.assertIn("error", self.ubus(bus, "at_wait", {"id": 1}))
        # FIFO with a bounded queue: four slow jobs are accepted, the fifth is refused
        ids = [self.ubus(bus, "at_start", {"cmd": "AT+SLOW", "timeout": 5}) for _ in range(5)]
        self.assertTrue(all("id" in x for x in ids[:4]), ids)
        self.assertIn("queue full", ids[4].get("error", ""))
        h = self.ubus(bus, "health", {})
        self.assertTrue(h["at_running"] and h["at_queue"] == 3, h)
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(timeout=20), 0)

    def test_eco_at_no_slot_means_no_sub_id(self):
        """current_sim_slot 0 (no SIM / modem resetting) must never become sub_id=0."""
        scen = {"modem_status": {"modems": [{"bus": "cpu", "current_sim_slot": 0}]},
                "cell_info": [ct.CELL_INFO_410_NO_SERVICE], "at": self.AT}
        d, bus, env = self.start_bus(scen)
        p = self.spawn_eco(env)
        self.wait_health(bus)
        r = self.ubus(bus, "at_wait", {"id": self.ubus(bus, "at_start", {"cmd": "ATI"})["id"], "wait": 10})
        self.assertTrue(r["done"] and r["ok"], r)
        self.assertNotIn("sub_id", r)
        ats = [c["args"] for c in jsonl(os.path.join(bus, "calls.jsonl")) if c["method"] == "get_result_AT"]
        self.assertEqual(ats, [{"cmd": "ATI", "timeout": 8, "source_flag": 1}])
        p.send_signal(signal.SIGTERM)
        p.wait(timeout=20)

    def test_eco_at_falls_back_to_the_direct_port(self):
        """GL's AT service not registered: the whole sequence goes to the direct port (a pty
        playing the modem here), decided before anything was sent."""
        import tty, threading
        master, slave = os.openpty()
        tty.setraw(slave)
        got = []

        def serve():
            buf = b""
            while True:
                try:
                    b = os.read(master, 64)
                except OSError:
                    return
                buf += b
                while b"\r" in buf:
                    line, buf = buf.split(b"\r", 1)
                    got.append(line.decode())
                    os.write(master, b"\r\n+ECHO: " + line + b"\r\n\r\nOK\r\n")
        threading.Thread(target=serve, daemon=True).start()
        scen = {"modem_status": ct.MODEM_STATUS_410, "cell_info": [ct.CELL_INFO_410_SA], "no_at": True}
        d, bus, env = self.start_bus(scen)
        env.update(MUDIMODEM_AT_PORT=os.ttyname(slave), MUDIMODEM_AT_STATE=os.path.join(d, "at.inflight"))
        p = self.spawn_eco(env)
        self.wait_health(bus)
        r = self.ubus(bus, "at_wait", {"id": self.ubus(bus, "at_start", {"cmd": "AT+ONE\nAT+TWO", "timeout": 3})["id"],
                                       "wait": 10})
        self.assertTrue(r["done"] and r["ok"], r)
        self.assertEqual(r["transport"], "direct")
        self.assertEqual([s["cmd"] for s in r["steps"]], ["AT+ONE", "AT+TWO"])
        self.assertIn("+ECHO: AT+TWO", r["steps"][1]["response"])
        self.assertEqual(got, ["AT+ONE", "AT+TWO"])
        ats = [c for c in jsonl(os.path.join(bus, "calls.jsonl")) if c["method"] == "get_result_AT"]
        self.assertEqual(ats, [], "GL's AT service was not there to be called")
        p.send_signal(signal.SIGTERM)
        p.wait(timeout=20)

    def test_eco_without_its_collector_still_queues_at(self):
        """Python collector pinned: mudimodemd runs with MUDIMODEMD_COLLECTOR=0 — it samples
        nothing (no AT-backed cell_info twice per tick) but still serves the console."""
        scen = {"modem_status": ct.MODEM_STATUS_410, "cell_info": [ct.CELL_INFO_410_SA], "at": self.AT}
        d, bus, env = self.start_bus(scen)
        env["MUDIMODEMD_COLLECTOR"] = "0"
        p = self.spawn_eco(env)
        self.assertFalse(self.wait_health(bus)["collector"])
        r = self.ubus(bus, "at_wait", {"id": self.ubus(bus, "at_start", {"cmd": "ATI"})["id"], "wait": 10})
        self.assertTrue(r["done"] and r["ok"], r)
        time.sleep(1.0)
        methods = [c["method"] for c in jsonl(os.path.join(bus, "calls.jsonl"))]
        self.assertNotIn("cell_info", methods)
        self.assertEqual(jsonl(os.path.join(env["MUDIMODEM_HIST"], "samples.jsonl")), [])
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(timeout=20), 0)

    # ---- jobs (stage 2): the slow I/O the plugin used to do inline ------------------------------
    def fake_rpc(self, reply, delay=0.0):
        """GL's /rpc on 127.0.0.1 for the scan loop-back: records each request, answers `reply`."""
        seen = []

        class H(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                seen.append({"path": self.path, "glinet": self.headers.get("glinet"), "body": json.loads(body)})
                time.sleep(delay)
                out = json.dumps(reply).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            def log_message(self, *a):
                pass
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        return "http://127.0.0.1:%d/rpc" % srv.server_address[1], seen

    def job(self, bus, kind, args=None, wait=15):
        j = self.ubus(bus, "job_start", {"kind": kind, "args": args or {}})
        self.assertIn("id", j, j)
        return self.ubus(bus, "job_wait", {"id": j["id"], "wait": wait})

    def test_eco_jobs_version_fetch(self):
        """The version fetch (curl) runs in the daemon, bounded, with the plugin's semantics: the
        URL charset is re-checked. (The library jobs: test/library-emu.test.py.)"""
        d, bus, env = self.start_bus({"modem_status": ct.MODEM_STATUS_410})
        curl = os.path.join(d, "curl.sh")
        with open(curl, "w") as f:
            f.write('#!/bin/sh\necho "$@" >> %s/curl.args\necho \'{"version":"9.9.9"}\'\n' % d)
        os.chmod(curl, 0o755)
        env.update(MUDIMODEMD_COLLECTOR="0", MUDIMODEM_CURL=curl)
        p = self.spawn_eco(env)
        self.wait_health(bus)
        r = self.job(bus, "version_fetch", {"url": "https://raw.githubusercontent.com/x/MudiModem/main/version.json"})
        self.assertEqual((r["done"], r.get("version")), (True, "9.9.9"), r)
        with open(os.path.join(d, "curl.args")) as f:
            self.assertEqual(f.read().strip(), "-fsS --max-time 8 https://raw.githubusercontent.com/x/MudiModem/main/version.json")
        bad = self.job(bus, "version_fetch", {"url": "https://x/y;rm -rf /"})
        self.assertIn("bad version URL", bad.get("error", ""))
        with open(os.path.join(d, "curl.args")) as f:
            self.assertEqual(len(f.read().strip().splitlines()), 1, "a bad URL never reaches curl")
        self.assertIn("unknown job kind", self.ubus(bus, "job_start", {"kind": "rm"}).get("error", ""))
        self.assertIn("unknown job", self.ubus(bus, "job_wait", {"id": 5}).get("error", ""))
        p.send_signal(signal.SIGTERM); p.wait(timeout=20)

    def test_eco_a_hung_fetch_is_bounded_and_blocks_nothing(self):
        """curl that never answers ends at its 12 s bound (killed); meanwhile other jobs and the
        health call are served — the daemon is one process, but none of this blocks it."""
        d, bus, env = self.start_bus({"modem_status": ct.MODEM_STATUS_410})
        curl = os.path.join(d, "curl.sh")
        with open(curl, "w") as f:   # hangs for the version URL only (exec: the killed child IS the sleeper)
            f.write('#!/bin/sh\ncase "$*" in *slow*) exec sleep 60 ;; esac\necho \'{"revision":"r1"}\'\n')
        os.chmod(curl, 0o755)
        env.update(MUDIMODEMD_COLLECTOR="0", MUDIMODEM_CURL=curl, MUDIMODEM_LIB_URL="https://lib.example/dist",
                   MUDIMODEM_CACHE=os.path.join(d, "lib.json.gz"))
        p = self.spawn_eco(env)
        self.wait_health(bus)
        t0 = time.monotonic()
        v = self.ubus(bus, "job_start", {"kind": "version_fetch", "args": {"url": "https://x/slow/version.json"}})
        c = self.job(bus, "lib_check", wait=10)
        self.assertTrue(c["done"] and c["checked"], c)
        self.assertLess(time.monotonic() - t0, 8, "another job finished while curl hung")
        r = self.ubus(bus, "job_wait", {"id": v["id"], "wait": 20})
        took = time.monotonic() - t0
        self.assertTrue(r["done"] and "unreachable" in r.get("error", ""), r)
        self.assertTrue(11 <= took < 18, "bounded at ~12 s, took %.1f" % took)
        p.send_signal(signal.SIGTERM); p.wait(timeout=20)

    def test_eco_scan_job_through_gl_rpc(self):
        """The cell scan: GL's modem.scan_cell_tower through the local /rpc with the glinet
        header (the loop-back gl-session uses), one at a time, logged as an event."""
        towers = [{"pci": 101, "freq": 627264, "network_type": "5G SA", "band": 78, "scs": 30}]
        url, seen = self.fake_rpc({"jsonrpc": "2.0", "id": 1, "result": {"towers": towers}}, delay=1.5)
        d, bus, env = self.start_bus({"modem_status": ct.MODEM_STATUS_410, "has_ws": True})
        env.update(MUDIMODEMD_COLLECTOR="0", MUDIMODEM_RPC_URL=url)
        p = self.spawn_eco(env)
        self.wait_health(bus)
        j = self.ubus(bus, "job_start", {"kind": "scan", "args": {"slot": 2}})
        r = self.ubus(bus, "job_wait", {"id": j["id"], "wait": 0})
        self.assertTrue(r["pending"] and r["kind"] == "scan", r)
        again = self.ubus(bus, "job_start", {"kind": "scan", "args": {"slot": 2}})
        self.assertEqual((again["id"], again.get("joined")), (j["id"], True), "a second scan joins the first")
        r = self.ubus(bus, "job_wait", {"id": j["id"], "wait": 15})
        self.assertTrue(r["done"], r)
        self.assertEqual((r["towers"], r["slot"]), (towers, 2))
        self.assertEqual(len(seen), 1, "one AT+QSCAN, not two")
        self.assertEqual(seen[0]["glinet"], "1")
        self.assertEqual(seen[0]["body"]["params"], ["", "modem", "scan_cell_tower", {"bus": "cpu", "slot": 2}])
        ev = jsonl(os.path.join(env["MUDIMODEM_HIST"], "events.jsonl"))
        self.assertEqual([(e["kind"], e["label"]) for e in ev], [("user", "Cell scan")])
        self.assertEqual([n["data"]["label"] for n in jsonl(os.path.join(bus, "notify.jsonl"))
                          if n["name"] == "mudimodem.event"], ["Cell scan"])
        # slot 0 is refused before anything is sent
        self.assertIn("no active SIM", self.job(bus, "scan", {"slot": 0}).get("error", ""))
        self.assertEqual(len(seen), 1)
        p.send_signal(signal.SIGTERM); p.wait(timeout=20)
        # GL refusing the scan: its error code, as the plugin always reported, and no event
        url2, seen2 = self.fake_rpc({"jsonrpc": "2.0", "id": 1, "error": {"code": 20002044, "message": "x"}})
        env["MUDIMODEM_RPC_URL"] = url2
        p = self.spawn_eco(env)
        self.wait_health(bus)
        self.assertEqual(self.job(bus, "scan", {"slot": 1}).get("error"), "scan failed: 20002044")
        self.assertEqual(len(jsonl(os.path.join(env["MUDIMODEM_HIST"], "events.jsonl"))), 1)
        p.send_signal(signal.SIGTERM); p.wait(timeout=20)

    def test_eco_health_and_single_instance(self):
        scen = {"modem_status": ct.MODEM_STATUS_410, "network_info": ct.NETWORK_INFO_410,
                "cell_info": [ct.CELL_INFO_410_SA], "has_ws": True}
        d = tempfile.mkdtemp(prefix="mm-emu-")
        self.addCleanup(shutil.rmtree, d, True)
        bus = os.path.join(d, "bus"); os.makedirs(bus)
        with open(os.path.join(bus, "scen.json"), "w") as f:
            json.dump(scen, f)
        mudiemu.bus("start", bus, os.path.join(bus, "scen.json"))
        self.addCleanup(mudiemu.bus, "stop", bus)
        env = dict(os.environ, MUDIMODEM_UBUS_SOCK=os.path.join(bus, "ubus.sock"),
                   MUDIMODEM_LIB=os.path.join(ROOT, "src", "lib"), MUDIMODEM_POLL="0.2",
                   MUDIMODEM_HIST=os.path.join(d, "hist"), MUDIMODEM_HISTORY_CFG=os.path.join(d, "none"),
                   MUDIMODEM_BATT_SYSFS=os.path.join(d, "none"), MUDIMODEM_SUMMARY=os.path.join(d, "summary.jsonl"),
                   MUDIMODEM_LINK_INTERVAL="0", MUDIMODEM_CRASH_INTERVAL="0")
        p = subprocess.Popen(ENGINES["eco"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.kill(), p.stdout.close(), p.stderr.close()))
        h = None
        for _ in range(100):
            out = subprocess.run([os.path.join(bus, "bin", "ubus"), "call", "mudimodem", "health"],
                                 capture_output=True, text=True)
            if out.returncode == 0:
                h = json.loads(out.stdout)
                if h["rf_samples"] >= 2:
                    break
            time.sleep(0.2)
        self.assertIsNotNone(h, "health answered")
        self.assertEqual(h["engine"], "eco")
        self.assertGreaterEqual(h["rf_samples"], 2)
        self.assertTrue(h["attached"])
        # a second instance must refuse to start: two samplers would double the AT traffic
        second = subprocess.run(ENGINES["eco"], env=env, capture_output=True, text=True, timeout=30)
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("already running", second.stderr)
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(timeout=20), 0)


if __name__ == "__main__":
    unittest.main()
