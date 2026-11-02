#!/usr/bin/env node
// tools/preview.js — render MudiModem's page in headless Chromium the way GL's SPA would, with
// GL 4.10's own theme CSS, the same Vue (2.6.12 runtime-only) and fake GL data. Dev box only.
//
//   node tools/preview.js [--tab bands] [--theme default|dark|classic] [--width 1280] [--height 900]
//                         [--pending] [--out build/preview/bands.png]
//   node tools/preview.js --matrix            every tab x {desktop, phone} x {default, dark}
//
// What is real: GL's theme CSS (from firmware/rootfs, tools/firmware.sh), Vue 2.6.12 runtime
// (fetched once into build/.cache with `npm pack`), the BUILT chunks from dist/views loaded by
// eval exactly as GL's SPA does (lazy tab chunks through a fake $axios.get). What is fake: the
// /ws status (cellular.* + mudimodem.collect) and /rpc replies — FIXTURE below. A page error,
// an uncaught exception or a horizontal page scroll fails the run.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ROOTFS = path.join(ROOT, process.env.MM_ROOTFS || "firmware/rootfs");
const CACHE = path.join(ROOT, "build/.cache");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes("--" + k);

function vueRuntime() {
  const f = path.join(CACHE, "vue-2.6.12/package/dist/vue.runtime.min.js");
  if (!fs.existsSync(f)) {
    const dir = path.join(CACHE, "vue-2.6.12");
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("npm", ["pack", "vue@2.6.12", "--silent"], { cwd: dir, stdio: "pipe" });
    execFileSync("tar", ["-xzf", "vue-2.6.12.tgz"], { cwd: dir });
  }
  return fs.readFileSync(f, "utf8");
}
function themeCss(theme) {
  const t = path.join(ROOTFS, "www/theme");
  if (!fs.existsSync(path.join(t, "base.css"))) throw new Error("no firmware rootfs: tools/firmware.sh fetch && tools/firmware.sh extract");
  return fs.readFileSync(path.join(t, "base.css"), "utf8") + "\n" +
         zlib.gunzipSync(fs.readFileSync(path.join(t, theme, "index.css.gz"))).toString();
}

// ---- fake GL data (shapes: docs/cellular-api-4.10.md) ----
const NOW = Date.now();
const SAMPLE = {
  t: NOW, slot: 1, registered: true, carrier: "T-Mobile", rat: "NR5G-SA", network_type: 5,
  cell_id: "187461035", tac: "870100",
  signals: [{ role: "PCC", ca: 0, network_type: 5, rat: "NR5G-SA", band: 71, earfcn: 127490, pci: 516,
              bandwidth_mhz: 15, rsrp: -101, rsrq: -14, sinr: 4, rssi: null, rsrp_level: 3, rsrq_level: 3, sinr_level: 2 }],
  id: "187461035", band: 71, mode: "NR5G-SA", pci: 516, tx_channel: 127490, dl_bandwidth: "15MHz",
  rsrp: -101, rsrq: -14, sinr: 4, rssi: null, rsrp_level: 3, rsrq_level: 3, sinr_level: 2
};
const history = [];
for (let i = 90; i >= 0; i--) {
  const w = Math.sin(i / 7) * 6;
  history.push(Object.assign({}, SAMPLE, { t: NOW - i * 10000, rsrp: Math.round(-101 + w), sinr: Math.round(4 + w / 2),
    rsrq: Math.round(-14 + w / 3), signals: [Object.assign({}, SAMPLE.signals[0], { rsrp: Math.round(-101 + w) })] }));
}
const WS = {
  "cellular.modems_info": { modems: [{ bus: "cpu", name: "RG650V-NA", type: 0,
    band: { LTE: [2, 4, 5, 12, 13, 14, 25, 26, 29, 30, 41, 46, 48, 66, 71], "NR-NSA": [2, 5, 25, 41, 66, 71, 77],
            "NR-SA": [2, 5, 7, 12, 13, 14, 25, 26, 29, 30, 38, 41, 48, 66, 70, 71, 77, 78] } }] },
  "cellular.modems_status": { modems: [{ bus: "cpu", current_sim_slot: 1, slot_switch_status: 0, slot_switch_enable: false,
    simcard: [{ slot: 1, status: 6, dial_status: 0, technology: 5, apn: "fast.t-mobile.com", iccid: "89012601000000000001" },
              { slot: 2, status: 6, dial_status: 2, technology: 4, apn: "broadband", iccid: "89014100000000000002" }] }] },
  "cellular.networks_info": { networks: [
    { slot: 1, bus: "cpu", carrier: "T-Mobile", mcc: "310", mnc: "260", iccid: "89012601000000000001", imsi: "310260000000001",
      ambr_dl: 300, ambr_ul: 50, apn_list: ["fast.t-mobile.com"] },
    { slot: 2, bus: "cpu", carrier: "AT&T", mcc: "310", mnc: "410", iccid: "89014100000000000002", imsi: "310410000000002" }] },
  "mudimodem.collect": SAMPLE, "mudimodem.battery": {}, "mudimodem.event": {}
};
const nowS = Math.floor(NOW / 1000);
const RPC = {
  get_bands: { supported: { sa: WS["cellular.modems_info"].modems[0].band["NR-SA"], nsa: WS["cellular.modems_info"].modems[0].band["NR-NSA"],
                            LTE: WS["cellular.modems_info"].modems[0].band.LTE },
               config: { enable: true, mode: "AUTO", sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 66, 71] },
               policy: { sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 13, 25, 26, 41, 46, 48, 66, 71] },
               capability: { sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 66, 71] },
               meta: { bus: "cpu", slot: 1, mode: "AUTO", mode_known: true, plmn: "310260", sub_id: 1, plmn_matched: true, lock: { active: false } } },
  get_lock: { lock: { l4g: { locked: false }, l5g: { locked: false }, save_ctrl: {} }, gl: { locked: false, tower: {} },
              serving: { rat: "NR5G-SA", pci: 516, arfcn: 127490, band: 71, cell_id: "187461035", source: "collector" },
              stale: false, meta: { slot: 1, sub_id: 1, plmn: "310260", plmn_matched: true } },
  get_history: { now: NOW, samples: history, events: [{ t: NOW - 300000, kind: "user", label: "Bands applied", detail: "SA n71" }] },
  get_battery_history: { now: NOW, samples: [] },
  change_status: flag("pending")
    ? { now: nowS, pending: { kind: "bands", slot: 1, deadline: nowS + 42, window: 60, applied: { sa: "41:71", mode: "AUTO" } } }
    : { now: nowS },
  app_version: { version: "2.2.0", latest: "2.2.0", update_available: false },
  device_info: {}, get_history_persist: { enabled: false, size_bytes: 0 },
  library_status: { ok: true }, get_speedtest_interfaces: { cellular: { up: true }, wired: { up: false } },
  get_speedtest_history: { results: [] }, get_speedtest_schedule: { enabled: false, interval_seconds: 21600 },
  get_speedtest_status: { running: false }, get_battlimit: { enabled: false, limit_gui: 80, state: "off" }
};
function chunk(name) { return fs.readFileSync(path.join(ROOT, "dist/views", name), "utf8"); }
const CHUNKS = {};
for (const f of fs.readdirSync(path.join(ROOT, "dist/views"))) CHUNKS["/views/" + f] = chunk(f);
CHUNKS["/mudimodem/at-library.json"] = JSON.parse(fs.readFileSync(path.join(ROOT, "src/at-library.snapshot.json"), "utf8"));

function page(theme) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${themeCss(theme)}
html,body{margin:0;background:var(--background-content);color:var(--text-regular);font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif}
#app{padding:16px}</style></head><body><div id="app"></div>
<script>${vueRuntime()}</script>
<script>
(function () {
  var WS = ${JSON.stringify(WS)}, RPC = ${JSON.stringify(RPC)}, CHUNKS = ${JSON.stringify(CHUNKS)};
  function reply(params) { var m = params[2]; return RPC.hasOwnProperty(m) ? JSON.parse(JSON.stringify(RPC[m])) : {}; }
  window.$getCookie = function () { return "sid"; };
  window.$message = { success: function () {}, error: function () {}, warning: function () {}, info: function () {} };
  window.$rpcRequest = function (method, params) { return Promise.resolve(reply(params)); };
  window.$axios = {
    post: function (url, body) { return Promise.resolve({ data: { result: reply(body.params) } }); },
    get: function (url) {
      var p = url.split("?")[0];
      if (!CHUNKS.hasOwnProperty(p)) return Promise.reject(new Error("404 " + p));
      return Promise.resolve({ data: CHUNKS[p] });
    }
  };
  Vue.prototype.$store = { getters: { moduleStatus: function (n) { return WS[n] || {}; } }, state: {} };
  Vue.prototype.$t = function (k) { return k; };
  var module = { exports: {} };
  var comp = eval(${JSON.stringify(chunk("gl-sdk4-ui-mudimodem.common.js"))});
  window.__vm = new Vue({ render: function (h) { return h(comp); } }).$mount("#app");
})();
</script></body></html>`;
}

async function shot(browser, o) {
  const pg = await browser.newPage({ viewport: { width: o.width, height: o.height } });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  // Serve from a real origin (not about:blank) so localStorage behaves as on the router.
  const html = page(o.theme);
  await pg.route("http://mudi.preview/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await pg.goto("http://mudi.preview/", { waitUntil: "load" });
  await pg.waitForTimeout(300);
  if (o.tab && o.tab !== "tracking") {
    const label = { bands: "Bands", lock: "Cell lock", at: "AT console", speedtest: "Speedtest", battery: "Battery", config: "Config" }[o.tab] || o.tab;
    await pg.click(`.mm-tab:has-text("${label}")`);
  }
  await pg.waitForTimeout(700);
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) {   // name the widest offenders, so a layout bug is findable from the log
    const who = await pg.evaluate(() => {
      const W = document.documentElement.clientWidth, out = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > W + 1 && r.width > 0 && !el.closest(".mm-tabs")) out.push(el.tagName.toLowerCase() + "." + String(el.className || "").split(" ").join(".") + " right=" + Math.round(r.right));
      }
      return out.slice(0, 6);
    });
    o.offenders = who;
  }
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  await pg.screenshot({ path: o.out, fullPage: true });
  await pg.close();
  return { errors, overflow };
}

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const jobs = [];
  if (flag("matrix")) {
    for (const tab of ["tracking", "bands", "lock", "at", "speedtest", "battery", "config"])
      for (const [dev, w, hgt] of [["desktop", 1280, 900], ["phone", 375, 800]])
        for (const theme of ["default", "dark"])
          jobs.push({ tab, theme, width: w, height: hgt, out: path.join(ROOT, `build/preview/${tab}-${dev}-${theme}.png`) });
  } else {
    const tab = opt("tab", "tracking"), theme = opt("theme", "default");
    jobs.push({ tab, theme, width: +opt("width", 1280), height: +opt("height", 900),
                out: path.resolve(opt("out", path.join(ROOT, `build/preview/${tab}-${theme}.png`))) });
  }
  let bad = 0;
  for (const j of jobs) {
    const r = await shot(browser, j);
    const problems = r.errors.slice();
    if (r.overflow > 1) problems.push(`page scrolls sideways by ${r.overflow}px at ${j.width}px wide: ${(j.offenders || []).join(", ")}`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${path.relative(ROOT, j.out)}${problems.length ? "\n     " + problems.join("\n     ") : ""}`);
    if (problems.length) bad++;
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
