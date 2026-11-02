// MudiModem — the Modem page's main chunk: the shell (status strip, the page-wide
// confirm-or-revert banner, tab bar) plus the Bands, Cell lock and Config tabs. Tracking, AT
// console, Speedtest and Battery are separate lazy chunks (src/web/tabs/).
//
// Built by tools/build-web.mjs into dist/views/gl-sdk4-ui-mudimodem.common.js, which GL's SPA
// evals (one expression, `module` in scope). Vue 2.6 runtime-only: render(h), never `template:`.
//
// This file is the shell; each concern lives in its own module and compose() (kit/compose.js)
// merges them into ONE component:
//   strip.js    RSRP trace (collector preload + pushes + backfill) + mode/tower badges
//   change.js   confirm-or-revert as the router reports it (change_status), Keep / Revert
//   bands.js    the three-layer band model, mode, Apply
//   lock.js     serving cell, scan, lock / unlock
//   config.js   version / self-update, device info, history-on-flash
//   tabs.js     lazy tab chunks          serving.js  signal/band formatting   styles.js  CSS
//
// Reads (docs/cellular-api-4.10.md): /ws status via this.$store.getters.moduleStatus(name) —
// cellular.modems_info / modems_status / networks_info and our collector's mudimodem.collect —
// and /rpc through the undotted "mudimodem" plugin (window.$rpcRequest with the literal "sid"
// placeholder, or kit rpcSilent for background calls). The computed block below is the ONLY
// place raw socket shapes are read; every tab reads its output. Writes (set_bands /
// set_cell_lock) are confirm-or-revert through the backend + watchdog.
import { compose } from "../kit/compose.js";
import { localize, t } from "../kit/i18n.js";
import strip from "./strip.js";
import change from "./change.js";
import bands from "./bands.js";
import lock from "./lock.js";
import config from "./config.js";
import tabs from "./tabs.js";
import serving from "./serving.js";
import styles from "./styles.js";

export default localize(compose({
  name: "mudimodem",

  data() {
    return {
      tab: "tracking",
      pollStopped: false,     // set true on teardown; makes an in-flight poll continuation a no-op
    };
  },

  computed: {
    ms() {
      var s = this.$store && this.$store.getters;
      return (s && s.moduleStatus) ? s.moduleStatus : function () { return {}; };
    },
    modem() {
      var modems = this.ms("cellular.modems_info").modems || [];
      return modems.filter(function (m) { return m.type === 0; })[0] || modems[0] || {};
    },
    modemStatus() {
      var self = this;
      var modems = this.ms("cellular.modems_status").modems || [];
      return modems.filter(function (m) { return m.bus === self.modem.bus; })[0] || modems[0] || {};
    },
    // GL declares ONE active SIM: the SELECTED slot (current_sim_slot). The panel
    // anchors on THAT SIM and shows its state honestly — even when it is
    // unregistered — and never borrows the other slot's cell (which may be
    // carrying failover data; that's GL's own SIM1-active / modem-connected split).
    activeSlot() { return this.modemStatus.current_sim_slot; },
    // ---- cellModel: the ONLY reader of raw 4.10 socket shapes ----
    // modems_status merges SIM + network state into per-modem simcard[]
    // (slot, status, dial_status, technology, apn, iccid, pin_counter, …);
    // networks_info carries carrier + SIM identity (iccid/imsi/mcc/mnc/
    // phone_number/apn_list) per {bus, slot}. RF comes ONLY from the collector.
    simcards() { return this.modemStatus.simcard || []; },
    networks() {
      var bus = this.modem.bus;
      return (this.ms("cellular.networks_info").networks || [])
        .filter(function (n) { return !bus || n.bus == null || n.bus === bus; });
    },
    anyNetwork() { return this.networks.length > 0; },
    activeNet() {
      var self = this;
      return this.networks.filter(function (n) { return String(n.slot) === String(self.activeSlot); })[0] || {};
    },
    activeCard() {
      var self = this;
      return this.simcards.filter(function (c) { return String(c.slot) === String(self.activeSlot); })[0] || {};
    },
    // SIM identity of the active slot (mcc/mnc/iccid/imsi/phone_number/apn_list).
    activeSim() { return this.activeNet; },
    // The collector's latest normalized sample (cellular_compat schema:
    // signals[] + flattened PCC aliases), pushed over mudimodem.collect. A
    // frame without `t` is the "nothing yet" seed.
    latestSample() {
      var s = this.ms("mudimodem.collect");
      return (s && s.t) ? s : null;
    },
    serving() { return this.latestSample || {}; },
    // Is the active SIM actually registered (has a serving cell)?
    activeRegistered() { return this.serving.rsrp !== undefined && this.serving.rsrp !== null && this.serving.rsrp !== ""; },
    // Carrier of the ACTIVE SIM, for the strip label: the sample carries it; the
    // networks_info entry is the fallback (then the home PLMN name).
    servingCarrier() {
      // The sample names its own SIM; right after a switch it can still be the
      // OTHER SIM's, and its carrier must not be labelled with this slot.
      var sameSim = this.serving.slot == null || String(this.serving.slot) === String(this.activeSlot);
      if (sameSim && this.serving.carrier) return this.serving.carrier;
      if (this.activeNet.carrier) return this.activeNet.carrier;
      return this.activeNet.mcc ? (this.activeNet.mcc + this.activeNet.mnc) : "";
    },
    // Every serving component carrier, as {group, band, role} — SA = one NR
    // chip, NSA = LTE anchor + NR chips, LTE-CA = several LTE chips.
    servingBands() {
      var self = this, out = [];
      var sigs = this.serving.signals;
      if (Array.isArray(sigs) && sigs.length) {
        sigs.forEach(function (sg) {
          if (sg && sg.band != null) out.push({ group: self.groupOf(sg.rat || self.serving.mode), band: Number(sg.band), role: sg.role || "PCC" });
        });
      } else if (this.serving.band != null && this.serving.band !== "") {
        out.push({ group: this.groupOf(this.serving.mode), band: Number(this.serving.band), role: "PCC" });
      }
      return out.filter(function (b) { return b.group; });
    },
    hasData() { return this.serving.rsrp !== undefined && this.serving.rsrp !== null; },
    isNR() { return /NR5G/.test(this.serving.mode || ""); },
    // The PRIMARY carrier's own RAT — "LTE" for an NSA anchor, while `mode` is
    // the cell's (NR5G-NSA). Band prefix, channel raster and the "you are
    // here" ring follow the carrier, never the cell's mode: the LTE anchor of
    // an EN-DC cell is B3 at 1855 MHz, not "n3" on the NR raster.
    servingRat() { return this.serving.pcc_rat || this.serving.mode; },
    // The /ws seed is flagged `stale` (with its box-clock age) when the
    // collector has not written for over a minute; live pushes never are.
    // >0 = seconds since the collector's last sample, as of the seed.
    staleFor() { return this.serving.stale ? Number(this.serving.age_s) || 1 : 0; },
    bandLabel() {
      if (this.serving.band === undefined || this.serving.band === null || this.serving.band === "") return "—";
      return this.formatBand(this.servingRat, this.serving.band);
    },
    // Which band group the PCC is on (for the "you are here" ring).
    servingGroup() { return this.groupOf(this.servingRat); },
    // Carrier-aggregation summary for the strip: "" for a single carrier.
    caLabel() {
      var n = Array.isArray(this.serving.signals) ? this.serving.signals.length : 0;
      return n > 1 ? "CA ×" + n : "";
    },
    rsrpQ() { return this.qFromLevel(this.serving.rsrp_level); },
    sinrQ() { return this.qFromLevel(this.serving.sinr_level); },
    rsrqQ() { return this.qFromLevel(this.serving.rsrq_level); }
  },

  watch: {
    // Each collector push (a new sample `t`) extends the strip history in place
    // — the same record get_history would return, minus the round-trip.
    "serving.t": {
      immediate: true,
      handler(t) { this.onSamplePush(this.serving); }
    },
    // The band grid, the lock picture and a scan all belong to ONE SIM. When
    // GL's active slot changes (a switch on its Internet page, slot failover)
    // they describe the other SIM: re-read them, never edit SIM2 through
    // SIM1's picture (the backend also refuses a write tagged with a stale slot).
    // Compared against the last REAL slot: a blip through "no slot" (modem
    // resetting) between SIM1 and SIM2 is still a switch.
    activeSlot: {
      immediate: true,
      handler(n) {
        var s = Number(n);
        if (!(s > 0)) return;
        var prev = this.seenSlot;
        this.seenSlot = s;
        if (prev && prev !== s) this.onSlotChange();
      }
    },
    tab(t) {
      if (t === "bands" && !this.bands && !this.bandsLoading) this.fetchBands();
      if (t === "lock" && !this.lockData && !this.lockLoading) this.fetchLock();
      if (t === "at" && !this.consoleComp && !this.consoleLoading) this.loadConsole();
      if (t === "config") {
        if (!this.deviceInfo) this.fetchDeviceInfo();   // retries on every open until it succeeds
        this.checkAppVersion();   // re-check every open, per spec
        this.fetchHistoryPersist();
      }
    }
  },

  created() { this.injectStyle(); this.restoreChange(0); },
  mounted() {
    this.startStrip();       // preload the strip window; live updates arrive as pushes
    if (this.tab === "tracking") this.loadTracking();
    // Load the band/lock model up front so the banner's mode + tower badges have
    // data whatever tab we land on (the tab watcher only fires on a change).
    if (!this.bands && !this.bandsLoading) this.fetchBands();
  },
  beforeDestroy() {
    this.clearCountdown(); this.stopStripPoll();
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    if (this.doneTimer) clearTimeout(this.doneTimer);
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
    if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
    if (this.verRefreshTimer) clearTimeout(this.verRefreshTimer);
    this.pollStopped = true;
  },

  render(h) {
    var self = this, c = this.serving;

    // ---- status strip ----
    var stripKids;
    if (this.hasData) {
      var rsrpColor = this.qColor(this.rsrpQ);
      // The axis describes THESE readings: the sample's own SIM and carrier —
      // right after a switch that is still the previous SIM, not the active one.
      var rfSlot = c.slot != null ? c.slot : this.activeSlot;
      var rfCarrier = c.carrier || (String(rfSlot) === String(this.activeSlot) ? this.servingCarrier : "");
      stripKids = [
        h("div", { staticClass: "mm-trace" }, [
          h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
            h("span", { staticClass: "mm-eyebrow", style: this.staleFor ? { color: "var(--warning)" } : {}, attrs: {
              title: this.staleFor
                ? t("The collector's last sample is {age} old - nothing newer has been pushed", { age: this.fmtAge(this.staleFor) })
                : t("Sampled every 10s by the MudiModem collector (pushed live), last {n} minutes", { n: this.STRIP_MIN })
            } }, this.staleFor ? t("RSRP · last sample {age} ago", { age: this.fmtAge(this.staleFor) })
                               : t("RSRP · last {n} min", { n: this.STRIP_MIN })),
            this.renderLockBadges(h)
          ]),
          h("div", { staticClass: "mm-plot" }, [
            h("svg", { attrs: { viewBox: "0 0 320 40", preserveAspectRatio: "none" } }, [
              h("path", { attrs: {
                d: this.tracePath(), fill: "none", stroke: rsrpColor,
                "stroke-width": "1.75", "stroke-linejoin": "round", "stroke-linecap": "round"
              } })
            ])
          ]),
          h("div", { staticClass: "mm-axis" }, [
            h("span", String(this.stripAxisDomain()[0])),
            h("span", (c.mode || "") + (this.caLabel ? " " + this.caLabel : "") +
              (rfCarrier ? "  " + rfCarrier : "") + (rfSlot ? "  SIM " + rfSlot : "")),
            h("span", this.stripAxisDomain()[1] + " dBm")
          ])
        ]),
        h("div", { staticClass: "mm-read" }, [
          h("div", { staticClass: "mm-rsrp", style: { color: rsrpColor } }, [
            String(c.rsrp), h("span", { staticClass: "u" }, "dBm")
          ]),
          h("div", { staticClass: "mm-facts" }, [
            h("div", [h("span", { staticClass: "k" }, "SINR"),
              h("b", { style: { color: this.qColor(this.sinrQ) } }, c.sinr != null ? String(c.sinr) : "-")]),
            h("div", [h("span", { staticClass: "k" }, "RSRQ"),
              h("b", { style: { color: this.qColor(this.rsrqQ) } }, c.rsrq != null ? String(c.rsrq) : "-")]),
            h("div", [h("span", { staticClass: "k" }, "Band"), h("b", this.bandLabel)])
          ].concat(
            [["BW", c.dl_bandwidth], ["Cell", c.id], ["Ch", this.chanLabel(this.servingRat, c.band, c.tx_channel)], ["RSSI", c.rssi]]
              .filter(function (f) { return f[1] !== undefined && f[1] !== null && f[1] !== ""; })
              .map(function (f) {
                return h("div", [h("span", { staticClass: "k" }, f[0]), h("b", String(f[1]))]);
              })
          ))
        ]),
        this.staleFor
          ? h("div", { staticClass: "mm-hint mm-stale", staticStyle: { color: "var(--warning)", flexBasis: "100%" } },
              t("The collector has not produced a sample for {age} (modem resetting, or mudimodem-collectd stopped) - these are its last known values, not live readings.",
                { age: this.fmtAge(this.staleFor) }))
          : null
      ];
    } else {
      var slot = this.activeSlot;
      stripKids = [h("div", { staticClass: "mm-empty" },
        (slot && this.anyNetwork)
          ? (this.servingCarrier
              ? t("SIM {slot} (active) is not registered on a network right now - {carrier}.", { slot: slot, carrier: this.servingCarrier })
              : t("SIM {slot} (active) is not registered on a network right now.", { slot: slot }))
          : "Waiting for the collector's first sample (mudimodem-collectd pushes every 10s)...")];
    }
    var strip = h("div", { staticClass: "mm-strip" }, stripKids);

    // ---- tabs ----
    // "tracking" is an in-page tab like the rest — the strip + tab bar stay put;
    // its graph chunk is lazy-loaded into the panel on first open.
    var TABS = [["tracking", "Tracking"], ["lock", "Cell lock"],
      ["bands", "Bands"], ["at", "AT console"], ["speedtest", "Speedtest"],
      ["battery", "Battery"], ["config", "Config"]];
    var tabs = h("div", { staticClass: "mm-tabs" }, TABS.map(function (t) {
      return h("button", {
        key: t[0], staticClass: "mm-tab" + (self.tab === t[0] ? " on" : ""),
        on: { click: function () {
          if (t[0] === "tracking") self.openTracking();
          else if (t[0] === "speedtest") self.openSpeedtest();
          else if (t[0] === "battery") self.openBattery();
          else self.tab = t[0];
        } }
      }, t[1]);
    }));

    // ---- panel ----
    var panel;
    if (this.tab === "bands") {
      panel = this.renderBands(h);
    } else if (this.tab === "lock") {
      panel = this.renderLock(h);
    } else if (this.tab === "tracking") {
      if (this.trackingComp) {
        // Render the lazy-loaded graph as a child component. `embedded` tells it
        // to drop its own "← Modem" breadcrumb (redundant inside our tab bar).
        panel = h(this.trackingComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.trackingErr ? t("Couldn't load the graph: {err}", { err: this.trackingErr })
            : "Loading the signal graph…")]);
      }
    } else if (this.tab === "at") {
      if (this.consoleComp) {
        panel = h(this.consoleComp, { props: { cell: { slot: this.activeSlot, carrier: this.servingCarrier, modem: this.modemName() } } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.consoleErr ? t("Couldn't load the AT console: {err}", { err: this.consoleErr })
            : "Loading the AT console…")]);
      }
    } else if (this.tab === "config") {
      panel = this.renderConfig(h);
    } else if (this.tab === "speedtest") {
      if (this.speedtestComp) {
        panel = h(this.speedtestComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.speedtestErr ? t("Couldn't load the speed test: {err}", { err: this.speedtestErr })
            : "Loading the speed test…")]);
      }
    } else if (this.tab === "battery") {
      if (this.batteryComp) {
        panel = h(this.batteryComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.batteryErr ? t("Couldn't load the battery view: {err}", { err: this.batteryErr })
            : "Loading the battery view…")]);
      }
    } else {
      panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" }, "Unknown tab.")]);
    }

    // A pending confirm-or-revert change is shown on EVERY tab: leaving the Bands tab (or the
    // page) must never hide the only Keep button while the watchdog counts down.
    return h("div", { staticClass: "mm" }, [strip, this.pending ? this.renderRevert(h) : null, tabs, panel]);
  }
}, [strip, change, bands, lock, config, tabs, serving, styles]));
