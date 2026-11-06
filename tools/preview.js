#!/usr/bin/env node
// tools/preview.js — render MudiModem's page in headless Chromium the way GL's SPA would, with
// GL 4.10's own theme CSS, the same Vue (2.6.12 runtime-only) and fake GL data. Dev box only.
//
//   node tools/preview.js [--tab bands] [--theme default|dark|classic] [--width 1280] [--height 900]
//                         [--pending] [--out build/preview/bands.png]
//   node tools/preview.js --matrix            every tab x {desktop, phone} x {default, dark}, plus the
//                                             RF tabs under each radio scenario below
//   node tools/preview.js --scenario nsa ...  the radio picture: sa (default, T-Mobile n71) or a case of
//                                             test/fixtures/carriers.json (lte, lte_ca, nsa, nsa_ca, …)
//   node tools/preview.js --locale zh-cn ...  as if GL's language were zh-cn (window.$i18n.locale)
//   node tools/preview.js --i18n-audit [--locale zh-cn]
//                                             render every tab (also with a pending change) and
//                                             list the English text the active table does not
//                                             translate -> build/i18n-audit.json
//
// What is real: GL's theme CSS (from the image mudi-emu extracts, tools/mudi-emu), Vue 2.6.12 runtime
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
const ROOTFS = (() => {                            // the extracted image, wherever mudi-emu keeps it
  const cli = process.env.MUDI_EMU || path.join(ROOT, "tools/mudi-emu/bin/mudi-emu");
  try {
    return execFileSync(cli, ["path", "rootfs"], { env: { MUDI_EMU_IMAGE: "e5800-4.10.0", ...process.env } }).toString().trim();
  } catch (e) {
    return path.join(ROOT, "build/no-mudi-emu");
  }
})();
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
  if (!fs.existsSync(path.join(t, "base.css"))) throw new Error("no extracted image: tools/mudi-emu/bin/mudi-emu fetch && tools/mudi-emu/bin/mudi-emu extract");
  return fs.readFileSync(path.join(t, "base.css"), "utf8") + "\n" +
         zlib.gunzipSync(fs.readFileSync(path.join(t, theme, "index.css.gz"))).toString();
}

// ---- fake GL data (shapes: docs/cellular-api-4.10.md) ----
const NOW = Date.now();
// The radio scenarios: the same table test/carriers.test.js checks every surface against.
const CARRIERS = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/carriers.json"), "utf8")).cases;
const SCENARIOS = ["nsa", "nsa_ca", "lte_ca"];        // rendered by --matrix on the RF tabs
function fixtures(scenario) {
const SA = {
  t: NOW, slot: 1, registered: true, carrier: "T-Mobile", rat: "NR5G-SA", network_type: 5,
  cell_id: "187461035", tac: "870100",
  signals: [{ role: "PCC", ca: 0, network_type: 5, rat: "NR5G-SA", band: 71, earfcn: 127490, pci: 516,
              bandwidth_mhz: 15, rsrp: -101, rsrq: -14, sinr: 4, rssi: null, rsrp_level: 3, rsrq_level: 3, sinr_level: 2 }],
  id: "187461035", band: 71, mode: "NR5G-SA", pci: 516, tx_channel: 127490, dl_bandwidth: "15MHz",
  rsrp: -101, rsrq: -14, sinr: 4, rssi: null, rsrp_level: 3, rsrq_level: 3, sinr_level: 2
};
const fx = scenario && scenario !== "sa" ? CARRIERS.find((c) => c.name === scenario) : null;
if (scenario && scenario !== "sa" && !fx) throw new Error("no scenario " + scenario + " (sa, " + CARRIERS.map((c) => c.name).join(", ") + ")");
const SAMPLE = fx ? Object.assign(JSON.parse(JSON.stringify(fx.sample)), { t: NOW }) : SA;
const history = [];
for (let i = 90; i >= 0; i--) {
  const w = Math.sin(i / 7) * 6;
  history.push(Object.assign({}, SAMPLE, { t: NOW - i * 10000, rsrp: Math.round(-101 + w), sinr: Math.round(4 + w / 2),
    rsrq: Math.round(-14 + w / 3), signals: SAMPLE.signals.map((g, j) => j ? g : Object.assign({}, g, { rsrp: Math.round(-101 + w) })),
    rx_kbps: i === 90 ? undefined : Math.round(24000 + w * 3000), tx_kbps: i === 90 ? undefined : Math.round(1800 + w * 200) }));
  const h = history[history.length - 1];
  if (i % 3 === 0) { if (i >= 30 && i <= 36) h.ping_lost = true; else h.ping_ms = Math.round(38 + Math.abs(w) * 4); }
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
// get_lock's serving cell for the scenario, as the plugin builds it (backend-lock.test.lua 7f)
const serving = !fx ? { rat: "NR5G-SA", pci: 516, arfcn: 127490, band: 71, cell_id: "187461035", source: "collector" }
  : !fx.expect.lock ? null
  : Object.assign({ source: "collector" }, fx.expect.lock, fx.expect.anchor ? { anchor: fx.expect.anchor } : { cell_id: fx.sample.cell_id });
const snap = () => fx ? ["band", "mode", "pcc_rat", "cell_id", "pci", "tx_channel", "signals"].reduce((o, x) => (o[x] = SAMPLE[x], o), {}) : { band: 41, pcc_rat: "NR5G-SA" };
const nowS = Math.floor(NOW / 1000);
const RPC = {
  get_bands: { supported: { sa: WS["cellular.modems_info"].modems[0].band["NR-SA"], nsa: WS["cellular.modems_info"].modems[0].band["NR-NSA"],
                            LTE: WS["cellular.modems_info"].modems[0].band.LTE },
               config: { enable: true, mode: "AUTO", sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 66, 71] },
               policy: { sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 13, 25, 26, 41, 46, 48, 66, 71] },
               capability: { sa: [25, 41, 48, 66, 71, 77], nsa: [2, 5, 41, 66, 71, 77], LTE: [2, 4, 5, 12, 66, 71] },
               meta: { bus: "cpu", slot: 1, mode: "AUTO", mode_known: true, plmn: "310260", sub_id: 1, plmn_matched: true, lock: { active: false } } },
  get_lock: { lock: { l4g: { locked: false }, l5g: { locked: false }, save_ctrl: {} }, gl: { locked: false, tower: {} },
              serving,
              stale: false, meta: { slot: 1, sub_id: 1, plmn: "310260", plmn_matched: true } },
  get_history: { now: NOW, samples: history, events: [
    { t: NOW - 600000, kind: "user", label: "Bands applied", detail: "SA n71" },
    { t: NOW - 350000, kind: "link", label: "Offline", detail: "No reply to ping" },
    { t: NOW - 290000, kind: "link", label: "Back online", detail: "after 70 s", secs: 70 }] },
  get_battery_history: { now: NOW, samples: [] },
  get_summary: { now: NOW, days: 7, lines: Array.from({ length: 7 * 24 }, (_, i) => {
    const t = Math.floor((NOW - 7 * 86400000) / 3600000) * 3600000 + i * 3600000, w = Math.sin(i / 9) * 7;
    const out = [{ t, secs: i % 24 === 3 ? 2400 : 3600, slot: 1, carrier: "T-Mobile", rat: i % 30 < 20 ? "NR5G-SA" : "LTE",
      band: i % 30 < 20 ? 71 : 2, cell: i % 30 < 20 ? "187461035" : "310260-2201", rsrp: [Math.round(-108 + w), Math.round(-101 + w), Math.round(-95 + w)],
      sinr: [0, Math.round(5 + w / 2), 12], ping_n: 120, ping_lost: i % 24 === 3 ? 9 : 0, ping_ms: 38 }];
    if (i % 24 === 3) out.push({ t, secs: 1200, slot: 1, no_service: true });
    return out;
  }).flat() },
  change_status: flag("pending")
    ? { now: nowS, pending: { kind: "bands", slot: 1, deadline: nowS + 42, window: 60, applied: { sa: "41:71", mode: "AUTO" } } }
    : { now: nowS },
  app_version: { version: "3.0.2", latest: "3.0.2", update_available: false },
  device_info: {}, get_history_persist: { enabled: false, size_bytes: 0 },
  library_status: { ok: true }, get_speedtest_interfaces: { cellular: { up: true }, wired: { up: false } },
  get_speedtest_history: { results: [0, 1, 2, 3, 4, 5].map((i) => ({ t: NOW - (5 - i) * 21600000, iface: "cellular",
    trigger: i % 2 ? "schedule" : "manual", down_mbps: [182.4, 240.1, 96.3, 310.7, 205.2, 268.9][i],
    up_mbps: [22.1, 31.4, 12.9, 40.2, 27.5, 35.8][i], latency_ms: [38, 34, 61, 29, 41, 33][i], jitter_ms: 4,
    slot: 1, carrier: SAMPLE.carrier, ...snap(), ambr_dl: 300, ambr_ul: 50,
    profile: i === 3 ? "full" : "quick", streams: i === 3 ? 4 : 2, data_mb: i === 3 ? 251.3 : 27.4, server: "cloudflare" })) }, get_speedtest_schedule: { enabled: true, interval_seconds: 21600 },
  get_speedtest_settings: { profile: "quick", server: "librespeed", librespeed_url: "https://speed.example.com/backend/" },
  get_speedtest_status: { running: false }, get_battlimit: { enabled: false, limit_gui: 80, state: "off" }
};
return { WS, RPC };
}
function chunk(name) { return fs.readFileSync(path.join(ROOT, "dist/views", name), "utf8"); }
const CHUNKS = {};
for (const f of fs.readdirSync(path.join(ROOT, "dist/views"))) CHUNKS["/views/" + f] = chunk(f);
CHUNKS["/mudimodem/at-library.json"] = JSON.parse(fs.readFileSync(path.join(ROOT, "src/at-library.snapshot.json"), "utf8"));

function page(theme, scenario) {
  const { WS, RPC } = fixtures(scenario);
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
  if (${JSON.stringify(opt("locale", ""))}) window.$i18n = { locale: ${JSON.stringify(opt("locale", ""))} };
  window.__mmI18nSeen = function (s) { (window.__mmSeen = window.__mmSeen || {})[s] = 1; };
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
  const html = page(o.theme, o.scenario);
  await pg.route("http://mudi.preview/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await pg.goto("http://mudi.preview/", { waitUntil: "load" });
  await pg.waitForTimeout(300);
  if (o.tab && o.tab !== "tracking") {
    // By position, not label: the labels are translated under --locale.
    const order = ["tracking", "lock", "bands", "at", "speedtest", "battery", "config"];
    await pg.locator(".mm-tabs .mm-tab").nth(order.indexOf(o.tab)).click();
  }
  await pg.waitForTimeout(700);
  // The strip's "?" glossary must be a full-width row under the trace + readings (it once landed
  // beside them as a third flex column and crushed the trace): open it, measure, close it again.
  if (await pg.locator(".mm-strip .mm-help").count()) {
    await pg.click(".mm-strip .mm-help");
    const bad = await pg.evaluate(() => {
      const box = (el) => el && el.getBoundingClientRect();
      const s = box(document.querySelector(".mm-strip")), tr = box(document.querySelector(".mm-strip > .mm-trace"));
      const g = box(document.querySelector(".mm-strip > .mm-gloss"));
      if (!g) return "the strip's ? opened no glossary";
      if (Math.abs(g.width - s.width) > 1 || g.top < tr.bottom - 1)
        return `strip glossary is not a full-width row under the trace (glossary x=${Math.round(g.left)} w=${Math.round(g.width)}, strip w=${Math.round(s.width)}, trace w=${Math.round(tr.width)})`;
      return "";
    });
    if (bad) errors.push(bad);
    await pg.evaluate(() => document.querySelector(".mm-strip .mm-help").click());   // a crushed trace can cover it
  }
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
  o.seen = await pg.evaluate(() => Object.keys(window.__mmSeen || {}));
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
    // the radio pictures where the tabs differ (NSA anchor + 5G leg, carrier aggregation)
    for (const scenario of SCENARIOS)
      for (const tab of ["tracking", "lock", "speedtest"])
        for (const [dev, w, hgt] of [["desktop", 1280, 900], ["phone", 375, 800]])
          jobs.push({ tab, theme: "default", scenario, width: w, height: hgt,
                      out: path.join(ROOT, `build/preview/${scenario}/${tab}-${dev}-default.png`) });
  } else {
    const tab = opt("tab", "tracking"), theme = opt("theme", "default"), scenario = opt("scenario", "sa");
    jobs.push({ tab, theme, scenario, width: +opt("width", 1280), height: +opt("height", 900),
                out: path.resolve(opt("out", path.join(ROOT, `build/preview/${scenario === "sa" ? "" : scenario + "/"}${tab}-${theme}.png`))) });
  }
  if (flag("i18n-audit")) {
    const loc = opt("locale", "zh-cn");
    const all = new Set();
    for (const tab of ["tracking", "bands", "lock", "at", "speedtest", "battery", "config"]) {
      const j = { tab, theme: "default", width: 1280, height: 900, out: path.join(ROOT, `build/preview/i18n-${tab}.png`) };
      await shot(browser, j);
      j.seen.forEach((x) => all.add(x));
    }
    for (const scenario of SCENARIOS)            // text only an NSA / CA picture shows
      for (const tab of ["tracking", "lock"]) {
        const j = { tab, theme: "default", scenario, width: 1280, height: 900, out: path.join(ROOT, `build/preview/i18n-${scenario}-${tab}.png`) };
        await shot(browser, j);
        j.seen.forEach((x) => all.add(x));
      }
    await browser.close();
    // A string "needs translation" when it has a word of 2+ Latin letters that is not a
    // technical token, and the page did not translate it (it reached h() as English).
    const TECH = /^(RSRP|RSRQ|SINR|RSSI|PCI|ARFCN|EARFCN|SCS|SA|NSA|LTE|NR|NR5G|NR5G-SA|NR5G-NSA|5G|4G|AT|ATI|SIM|ms|MHz|kHz|dBm|dB|mA|mV|V|Mbps|ID|TAC|CA|PCC|SCC\d*|B\d+|n\d+|IMSI|ICCID|MCC|MNC|PLMN|AMBR|GL|eMMC|T-Mobile|AT&T|USB|API|JSON|OK|Wi-Fi|GitHub|Cloudflare|LibreSpeed|Modem|MudiModem|WAN|NV|nv|VPN|Tailscale|ChiliApple|CPU|RAT|RG650V-NA|RG650V-EU|ssh|root|router|usr|sbin|mudimodem-revert|mudimodem-collectd|panic|unknown|Ch|BW|KiB|MiB|GiB|ping|Ping|PING|MBPS)$/;
    // AT-library entries are community data (English by design), never page copy.
    const lib = JSON.parse(fs.readFileSync(path.join(ROOT, "src/at-library.snapshot.json"), "utf8"));
    const libText = new Set();
    (lib.entries || []).forEach((e) => ["title", "cat", "summary"].forEach((k) => { if (typeof e[k] === "string") libText.add(e[k]); }));
    const words = (x) => (x.match(/[A-Za-z][A-Za-z0-9+&-]*/g) || []).filter((w) => /[a-z]{2}|^[A-Z][a-z]/.test(w));
    const needs = [...all].filter((x) => !libText.has(x.trim()) && words(x).some((w) => w.length > 1 && !TECH.test(w)) && !/^[A-Z]{2,}\+|^AT\+/.test(x.trim()) && !/^https?:\/\/\S+$/.test(x.trim()));
    fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "build/i18n-audit.json"), JSON.stringify({ locale: loc, untranslated: needs.sort() }, null, 1));
    console.log(`${needs.length} untranslated string(s) at ${loc} -> build/i18n-audit.json`);
    needs.forEach((x) => console.log("  " + JSON.stringify(x)));
    process.exit(needs.length ? 1 : 0);
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
