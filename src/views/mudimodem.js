// MudiModem — Phase 1 diagnostics + Phase 2 interactive three-layer band grid +
// cell-lock tab (pin to the serving cell, confirm-or-revert like band writes).
//
// Loaded by GL's SPA via eval(), so this file MUST be a single expression whose
// value is the component (module.exports = {...}). `module` is in scope at eval
// time. Vue here is runtime-only: render(h) only, never `template:`.
//
// Reads (GL firmware 4.10 — docs/cellular-api-4.10.md), all server-trusted:
//   - status over /ws via this.$store.getters.moduleStatus(name):
//       cellular.modems_info    (module identity, supported bands)
//       cellular.modems_status  (active slot + merged per-SIM simcard[] state)
//       cellular.networks_info  (per-slot carrier + SIM identity)
//       mudimodem.collect       (OUR collector's latest RF sample, pushed by
//                                mudimodem-collectd through gl-session notify)
//     ws = status, collector = RF — never cross-read. `cellModel` below is the
//     ONLY place raw socket shapes are touched; every tab reads its output.
//   - band model:  window.$rpcRequest("call",["sid","mudimodem","get_bands",{}])
// The "sid" string is a verbatim placeholder GL swaps for the session cookie.
//
// Writes: set_bands / set_cell_lock are confirm-or-revert via the mudimodem
// backend + watchdog (the band write itself is GL's own per-slot
// modem.set_band_config). SIM slot / APN / failover management is NOT here:
// GL 4.10's own Internet page has it in full, and this add-on ships only what
// stock lacks or does incompletely.
//
// All colour is GL theme tokens (var(--success) etc.), so light/dark/classic
// all work with zero extra code.
//
// A hidden sibling page (/mudimodem-tracking) shows history gathered by the
// device-side collector (mudimodem-collectd) — this page only links to it via
// the strip's "History ->". User/watchdog events for that timeline are persisted
// server-side by the backend (set_bands/confirm/revert_now) + the watchdog, so
// nothing is recorded here.
module.exports = {
  name: "mudimodem",

  data() {
    return {
      tab: "tracking",
      // ---- status-strip trace: ONE source, the collector ----
      // mudimodem-collectd samples the modem every 10s and keeps 24h of history.
      // The strip PRELOADS the last 15 minutes once (get_history) and is then
      // fed LIVE by the collector's own pushes over the websocket
      // (mudimodem.collect) — no polling. A slow safety poll only fires when
      // no push has arrived for a while (collector restarting, ws hiccup).
      STRIP_MIN: 15,          // minutes of history the strip shows
      STRIP_POLL_MS: 30000,   // safety-poll cadence (only acts when pushes stalled)
      STRIP_STALL_MS: 45000,  // no push for this long => safety poll fetches the tail
      STRIP_GAP_MS: 45000,    // a hole wider than this breaks the line, not bridges it
      STRIP_HOLE_MS: 25000,   // a push landing this long after the last point => backfill the hole
      pushSeenAt: 0,          // browser clock of the last collector push
      hist: [],               // [{t, v}] oldest-first, BOX timestamps, rsrp only
      histLastT: 0,           // newest t held — the incremental `since` cursor
      histPreloaded: false,   // the 15-min window has been fetched once (gates {since})
      histNow: 0,             // box clock as of the last reply
      histNowAt: 0,           // browser clock at that same instant (skew correction)
      histFetching: false,    // one strip fetch at a time
      histTimer: null,        // strip poll interval handle
      styleId: "mudimodem-css",
      bands: null,          // get_bands result, once fetched
      bandsLoading: false,
      bandsError: "",
      sel: { sa: null, nsa: null, LTE: null },   // desired allowlists per editable RAT
      selMode: null,        // desired network mode (AUTO | NR5G | LTE)
      pending: null,        // { kind, window, applied, remaining } after Apply/Lock
      cdTimer: null,        // countdown interval handle
      applying: false,      // Apply in flight
      applyError: "",
      resetNote: "",        // transient feedback from "Reset to default"
      resetTimer: null,     // handle clearing resetNote
      lockData: null,       // get_lock result, once fetched
      lockLoading: false,
      lockError: "",
      lockBusy: false,      // a lock/unlock RPC in flight
      lockVerifying: false, // set_cell_lock dropped mid-flight; probing get_lock
      lockConfirm: null,    // target awaiting inline confirm ({...target,label})
      scanConfirm: false,   // explicit confirm gate before firing the disruptive scan
      // Scanned neighbour towers (Task 5 fills the scan card); pinTarget reads
      // scan.towers now to confirm an SCS reading when one is available.
      scan: { towers: [], running: false, error: "", ts: 0 },
      // Tracking tab: the graph lives in its OWN chunk (gl-sdk4-ui-mudimodem-
      // tracking). Rather than route away (which hides our strip + tab bar), we
      // lazy-load that chunk on first open and render it as an in-page child
      // component, exactly as the SPA's own loader evals a view chunk.
      trackingComp: null,   // the loaded tracking component options, once fetched
      trackingLoading: false,
      trackingErr: "",
      // AT console tab: same lazy-chunk pattern as Tracking.
      consoleComp: null,
      consoleLoading: false,
      consoleErr: "",
      // Speedtest tab: same lazy-chunk pattern as Tracking/AT console.
      speedtestComp: null,
      speedtestLoading: false,
      speedtestErr: "",
      // Battery tab: same lazy-chunk pattern as Tracking/AT console/Speedtest.
      batteryComp: null,
      batteryLoading: false,
      batteryErr: "",
      // ---- Config tab (Phase 5) ----
      deviceInfo: null,       // { model, cpu } — fetched once via system.board
      appVer: null,           // app_version result { installed, latest, update_available, checked, error? }
      updateConfirm: false,   // "Update now" armed, awaiting a second click
      updateConfirmTimer: null,
      updating: false,        // self_update in flight / polling
      updateDone: false,      // an update SUCCEEDED in this page's lifetime — the
                              // offer is spent until reload (the running chunk is
                              // still the old one, so re-offering it is a lie)
      updateMsg: "",          // final status line after an update attempt
      verRefreshTimer: null,  // re-read of the installed version after an update
      updatePollTimer: null,
      pollStopped: false,     // set true on teardown; makes an in-flight poll continuation a no-op
      pollAttempts: 0,        // bounds the poll loop — give up after POLL_MAX
      POLL_MAX: 40,           // ~2 minutes at the 3s poll interval
      // History eMMC backup (get/set_history_persist) — off by default
      histPersist: null,
      histPersistBusy: false,
      histPersistErr: "",
      // Approximate downlink centre freq (MHz) per band, for spectrum ordering
      // and labels. Source: 3GPP TS 38.101-1 (NR) / 36.101 (LTE), rounded to the
      // marketing figure. Labels only — the modem is never sent a frequency.
      // Covers BOTH RG650V variants (NA + EU) — the module set differs per unit.
      freq: {
        n: { 1: 2100, 2: 1900, 3: 1800, 5: 850, 7: 2600, 8: 900, 12: 700, 13: 750, 14: 700,
             20: 800, 25: 1900, 26: 850, 28: 700, 29: 700, 30: 2300, 38: 2600, 40: 2300,
             41: 2500, 48: 3500, 66: 1700, 70: 1700, 71: 600, 75: 1500, 76: 1500,
             77: 3700, 78: 3500, 79: 4700 },
        B: { 1: 2100, 2: 1900, 3: 1800, 4: 1700, 5: 850, 7: 2600, 8: 900, 12: 700, 13: 750,
             14: 700, 17: 700, 18: 850, 19: 850, 20: 800, 25: 1900, 26: 850, 28: 700,
             29: 700, 30: 2300, 32: 1500, 34: 2000, 38: 2600, 39: 1900, 40: 2300,
             41: 2500, 42: 3500, 43: 3600, 46: 5200, 48: 3500, 66: 1700, 71: 600 }
      },
      // LTE band -> [F_DL_low MHz, N_Offs-DL] (3GPP TS 36.101 table 5.7.3-1), for
      // the channel readout. NR uses the global raster (chanMhz below).
      LTE_EARFCN: { 1: [2110, 0], 2: [1930, 600], 3: [1805, 1200], 4: [2110, 1950], 5: [869, 2400],
                    7: [2620, 2750], 8: [925, 3450], 12: [729, 5010], 13: [746, 5180], 14: [758, 5280],
                    17: [734, 5730], 18: [860, 5850], 19: [875, 6000], 20: [791, 6150], 25: [1930, 8040],
                    26: [859, 8690], 28: [758, 9210], 29: [717, 9660], 30: [2350, 9770], 32: [1452, 9920],
                    34: [2010, 36200], 38: [2570, 37750], 39: [1880, 38250], 40: [2300, 38650],
                    41: [2496, 39650], 42: [3400, 41590], 43: [3600, 43590], 46: [5150, 46790],
                    48: [3550, 55240], 66: [2110, 66436], 71: [617, 68586] },
      // Default NR SS-block SCS per band (kHz), used ONLY when no scan result
      // covers the serving cell. Source: 3GPP TS 38.104 §5.4.3 band tables —
      // FDD low/mid bands are 15 kHz, the TDD mid bands 30 kHz. The confirm
      // text says when this assumption is in play. Encoding (kHz vs index)
      // verified at the supervised milestone before first use.
      SCS_DEFAULT: { 1: 15, 2: 15, 3: 15, 5: 15, 7: 15, 8: 15, 12: 15, 13: 15, 14: 15,
                     20: 15, 25: 15, 26: 15, 28: 15, 29: 15, 30: 15, 38: 30, 40: 30,
                     41: 30, 48: 30, 66: 15, 70: 15, 71: 15, 75: 15, 76: 15,
                     77: 30, 78: 30, 79: 30 }
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
      if (this.serving.carrier) return this.serving.carrier;
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
    rsrqQ() { return this.qFromLevel(this.serving.rsrq_level); },
    facts() {
      var c = this.serving, out = [];
      var push = function (k, v) { if (v !== undefined && v !== null && v !== "") out.push([k, v]); };
      push("Mode", c.mode);
      push("Band", this.bandLabel === "—" ? null : this.bandLabel);
      push("Bandwidth", c.dl_bandwidth);
      push("Cell ID", c.id);
      push("TAC", c.tac);
      push("PCI", c.pci);
      push("Channel", this.chanLabel(this.servingRat, c.band, c.tx_channel));
      push("CA", this.caLabel || null);
      // `!= null` not `!== undefined`: the /ws seed keeps JSON nulls (cjson),
      // and "null dB" is not a reading.
      push("RSRP", c.rsrp != null ? c.rsrp + " dBm" : null);
      push("RSRQ", c.rsrq != null ? c.rsrq + " dB" : null);
      push("SINR", c.sinr != null ? c.sinr + " dB" : null);
      if (c.rssi != null) push("RSSI", c.rssi + " dBm");
      push("Carrier", this.servingCarrier);
      push("SIM slot", this.activeSlot);
      return out;
    }
  },

  watch: {
    // Each collector push (a new sample `t`) extends the strip history in place
    // — the same record get_history would return, minus the round-trip.
    "serving.t": {
      immediate: true,
      handler(t) { this.onSamplePush(this.serving); }
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

  created() { this.injectStyle(); },
  mounted() {
    this.startStrip();       // preload the strip window; live updates arrive as pushes
    if (this.tab === "tracking") this.loadTracking();
    // Load the band/lock model up front so the banner's mode + tower badges have
    // data whatever tab we land on (the tab watcher only fires on a change).
    if (!this.bands && !this.bandsLoading) this.fetchBands();
  },
  beforeDestroy() {
    this.clearCountdown(); this.stopStripPoll();
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
    if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
    if (this.verRefreshTimer) clearTimeout(this.verRefreshTimer);
    this.pollStopped = true;
  },

  methods: {
    qFromLevel(lvl) {
      return ({ 1: "poor", 2: "fair", 3: "good", 4: "excellent" })[lvl] || "none";
    },
    qColor(q) {
      return ({
        poor: "var(--error)", fair: "var(--warning)", good: "var(--info-hover)",
        excellent: "var(--success)", none: "var(--text-hint)"
      })[q];
    },
    // Case/punctuation-insensitive containment: "T-Mobile US" vs "T-Mobile".
    nameOverlap(a, b) {
      var n = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); };
      var x = n(a), y = n(b);
      return !!x && !!y && (x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
    },
    freqOf(group, b) {
      var t = (group === "LTE") ? this.freq.B : this.freq.n;
      return t[b];
    },
    prefixOf(group) { return group === "LTE" ? "B" : "n"; },
    // rat/mode string -> band group key (sa | nsa | LTE), null when unknown.
    groupOf(mode) {
      var m = mode || "";
      if (/NR5G-SA/.test(m)) return "sa";
      if (/NR5G/.test(m)) return "nsa";
      if (/LTE/.test(m)) return "LTE";
      return null;
    },
    // The one band formatter: "n78" / "B3" from the carrier's RAT.
    formatBand(rat, band) {
      if (band === undefined || band === null || band === "") return "—";
      return (/NR5G/.test(rat || "") ? "n" : "B") + band;
    },
    // Channel -> MHz. NR: 3GPP TS 38.104 global raster (no band needed).
    // LTE: band-aware (TS 36.101); unknown band => null (show the raw EARFCN).
    chanMhz(rat, band, arfcn) {
      var n = Number(arfcn);
      if (!n || isNaN(n)) return null;
      if (/NR5G/.test(rat || "")) {
        if (n < 600000) return n * 0.005;
        if (n < 2016667) return 3000 + (n - 600000) * 0.015;
        return 24250.08 + (n - 2016667) * 0.06;
      }
      var e = this.LTE_EARFCN[Number(band)];
      if (!e) return null;
      return e[0] + 0.1 * (n - e[1]);
    },
    chanLabel(rat, band, arfcn) {
      if (arfcn === undefined || arfcn === null || arfcn === "") return null;
      var mhz = this.chanMhz(rat, band, arfcn);
      return mhz ? String(arfcn) + " (" + mhz.toFixed(1) + " MHz)" : String(arfcn);
    },
    // seconds -> "45 s" / "12 min" / "3 h" for the stale-seed notice.
    fmtAge(sec) {
      sec = Number(sec) || 0;
      if (sec < 90) return Math.round(sec) + " s";
      if (sec < 5400) return Math.round(sec / 60) + " min";
      return (sec / 3600).toFixed(sec < 36000 ? 1 : 0) + " h";
    },

    // Open the in-page Tracking tab, lazy-loading its chunk on first use.
    openTracking() { this.tab = "tracking"; this.loadTracking(); },
    // Fetch + eval the tracking chunk the same way the SPA's route loader does
    // (axios GET, then `eval` with `module` in scope → the component object).
    // Cached on the instance; a failed load shows a message and can be retried.
    loadTracking() {
      var self = this;
      if (this.trackingComp || this.trackingLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.trackingLoading = true; this.trackingErr = "";
      window.$axios.get("/views/gl-sdk4-ui-mudimodem-tracking.common.js?_t=" + Date.now())
        .then(function (res) {
          var module = { exports: {} };            // eslint-disable-line no-unused-vars
          var comp = eval(res.data);               // chunk is `module.exports = {...}`
          if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
          self.trackingComp = comp; self.trackingLoading = false;
        })
        .catch(function (e) {
          self.trackingLoading = false;
          self.trackingErr = (e && (e.message || e.type)) || "could not load the graph";
        });
    },

    // Fetch + eval the AT-console chunk exactly like loadTracking above.
    loadConsole() {
      var self = this;
      if (this.consoleComp || this.consoleLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.consoleLoading = true; this.consoleErr = "";
      window.$axios.get("/views/gl-sdk4-ui-mudimodem-console.common.js?_t=" + Date.now())
        .then(function (res) {
          var module = { exports: {} };            // eslint-disable-line no-unused-vars
          var comp = eval(res.data);               // chunk is `module.exports = {...}`
          if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
          self.consoleComp = comp; self.consoleLoading = false;
        })
        .catch(function (e) {
          self.consoleLoading = false;
          self.consoleErr = (e && e.message) || "load failed";
        });
    },

    // Open the in-page Speedtest tab, lazy-loading its chunk on first use.
    openSpeedtest() { this.tab = "speedtest"; this.loadSpeedtest(); },
    loadSpeedtest() {
      var self = this;
      if (this.speedtestComp || this.speedtestLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.speedtestLoading = true; this.speedtestErr = "";
      window.$axios.get("/views/gl-sdk4-ui-mudimodem-speedtest.common.js?_t=" + Date.now())
        .then(function (res) {
          var module = { exports: {} };            // eslint-disable-line no-unused-vars
          var comp = eval(res.data);
          if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
          self.speedtestComp = comp; self.speedtestLoading = false;
        })
        .catch(function (e) {
          self.speedtestLoading = false;
          self.speedtestErr = (e && (e.message || e.type)) || "could not load the speed test";
        });
    },

    // Open the in-page Battery tab, lazy-loading its chunk on first use.
    openBattery() { this.tab = "battery"; this.loadBattery(); },
    loadBattery() {
      var self = this;
      if (this.batteryComp || this.batteryLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.batteryLoading = true; this.batteryErr = "";
      window.$axios.get("/views/gl-sdk4-ui-mudimodem-battery.common.js?_t=" + Date.now())
        .then(function (res) {
          var module = { exports: {} };            // eslint-disable-line no-unused-vars
          var comp = eval(res.data);               // chunk is `module.exports = {...}`
          if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
          self.batteryComp = comp; self.batteryLoading = false;
        })
        .catch(function (e) {
          self.batteryLoading = false;
          self.batteryErr = (e && (e.message || e.type)) || "could not load the battery view";
        });
    },

    // Fetch the three-layer band model from our backend.
    // opts.light: after a cell-lock action only GL's store can have changed
    // (network_mode, the tower badge) — policy/capability (2-3 AT reads) cannot
    // — so ask for config+meta only (zero AT) and merge them into the model
    // already held. Falls back to a full fetch when there is no model yet.
    fetchBands(opts) {
      var self = this;
      var light = !!(opts && opts.light) && !!this.bands;
      if (typeof window === "undefined" || !window.$rpcRequest) {
        this.bandsError = "RPC helper unavailable";
        return;
      }
      if (!light) { this.bandsLoading = true; this.bandsError = ""; }
      this.clearResetNote();
      window.$rpcRequest("call", ["sid", "mudimodem", "get_bands", light ? { light: 1 } : {}], { timeout: 15000 })
        .then(function (res) {
          // A soft error ({error}) RESOLVES through $rpcRequest (it only rejects
          // on err_msg/err_code). Storing it as `bands` would make renderGroup
          // dereference d.supported and throw — freezing the tab on the
          // loading text with no message and no refresh button.
          if (!res || res.error) {
            if (!light) self.bandsError = (res && res.error) || "request failed";
            return;
          }
          if (light) {
            self.bands.config = res.config;
            self.bands.meta = Object.assign({}, self.bands.meta, res.meta);
          } else {
            self.bands = res;
          }
          // Seed each editable selection from the current config; an empty config
          // means "unrestricted", so start from everything the carrier permits.
          self.sel = { sa: self.seedFor("sa"), nsa: self.seedFor("nsa"), LTE: self.seedFor("LTE") };
          self.selMode = (res.meta && res.meta.mode) || "AUTO";
        })
        .catch(function (e) {
          if (!light) self.bandsError = (e && (e.type || e.message)) || "request failed";
        })
        .then(function () { if (!light) self.bandsLoading = false; });
    },
    seedFor(group) {
      var cfg = (this.bands.config && this.bands.config[group]) || [];
      var pol = (this.bands.policy && this.bands.policy[group]) || [];
      return (cfg.length ? cfg : pol).slice();
    },

    // Fetch the current cell-lock state (serving cell + any existing lock).
    fetchLock() {
      var self = this;
      if (typeof window === "undefined" || !window.$rpcRequest) {
        this.lockError = "RPC helper unavailable"; return;
      }
      this.lockLoading = true; this.lockError = "";
      window.$rpcRequest("call", ["sid", "mudimodem", "get_lock", {}], { timeout: 20000 })
        .then(function (res) {
          // {error} resolves, not rejects — keep the previous picture (if any)
          // and say why instead of rendering the error object as a lock state.
          if (!res || res.error) { self.lockError = (res && res.error) || "request failed"; return; }
          self.lockData = res;
        })
        .catch(function (e) { self.lockError = (e && (e.type || e.message)) || "request failed"; })
        .then(function () { self.lockLoading = false; });
    },
    scsFor(band) { return this.SCS_DEFAULT[band]; },
    // Build the lock target for the serving cell. SCS: last scan result for
    // this pci+arfcn if we have one, else the band default (flagged assumed).
    pinTarget() {
      var s = this.lockData && this.lockData.serving;
      // == null, not falsy: PCI 0 (LTE 0-503 / NR 0-1007) and EARFCN 0 (LTE B1) are real.
      if (!s || s.pci == null || s.arfcn == null) return null;
      var isNR = /NR5G/.test(s.rat || "");
      var t = { rat: isNR ? "5g" : "4g", pci: s.pci, freq: s.arfcn,
                band: s.band, label: "current cell PCI " + s.pci };
      if (isNR) {
        var match = (this.scan.towers || []).filter(function (tw) {
          return String(tw.pci) === String(s.pci) && String(tw.freq) === String(s.arfcn);
        })[0];
        if (match && match.scs !== undefined) { t.scs = Number(match.scs); t.scsAssumed = false; }
        else { t.scs = this.scsFor(s.band); t.scsAssumed = true; }
        if (t.scs === undefined) return null;   // unknown band: refuse rather than guess
      }
      return t;
    },
    lockCell(target) {
      var self = this;
      if (this.lockBusy || this.pending || !target) return;
      this.lockBusy = true; this.lockError = "";
      var args = { rat: target.rat, pci: target.pci, freq: target.freq };
      if (target.scs !== undefined) args.scs = target.scs;
      if (target.band !== undefined) args.band = target.band;
      if (target.extra) args.extra = target.extra;
      window.$rpcRequest("call", ["sid", "mudimodem", "set_cell_lock", args], { timeout: 30000 })
        .then(function (res) {
          if (!res || res.error) { self.lockError = (res && res.error) || "lock failed"; return; }
          self.lockConfirm = null;
          self.startCountdown(res.window || 60, res.applied, "cell");
        })
        .catch(function (e) {
          var t = e && (e.type || e.message);
          // A connection drop mid-round-trip is EXPECTED here, not a failure:
          // applying the lock re-registers the modem, which bounces the
          // cellular ifup, which makes GL restart Tailscale (19-tailscale-iface)
          // and flush conntrack - killing this very request even though the
          // lock very likely APPLIED server-side and is now on the 60s revert
          // timer. Auth/param errors mean the lock truly didn't take; anything
          // else (timeout, rpcCancel, network reset) is ambiguous - go verify.
          if (t === "invalidParams" || t === "accessDenied") {
            self.lockError = t || "lock failed";
            return;
          }
          self.verifyLockAfterDrop({ rat: args.rat, pci: args.pci, freq: args.freq });
        })
        .then(function () {
          // verifyLockAfterDrop owns lockBusy while it probes; don't clear it here.
          if (!self.lockVerifying) self.lockBusy = false;
        });
    },
    // set_cell_lock's reply never arrived (the lock bounced our own tunnel).
    // Find out what actually happened: give the tunnel a moment, then re-query
    // get_lock a few times. If a lock is present / a revert is armed, surface
    // an (uncertain) revert panel so a good lock can still be kept; otherwise
    // report a clean no-op. Owns lockBusy/lockVerifying for its lifetime.
    verifyLockAfterDrop(applied) {
      var self = this;
      this.lockVerifying = true;
      this.lockBusy = true;
      this.lockError = "";
      this.pending = { kind: "cell", verifying: true };
      var attempts = 0, MAX = 6;
      var probe = function () {
        attempts += 1;
        window.$rpcRequest("call", ["sid", "mudimodem", "get_lock", {}], { timeout: 15000 })
          .then(function (res) {
            var lk = res && res.lock;
            var locked = (lk && lk.l4g && lk.l4g.locked) || (lk && lk.l5g && lk.l5g.locked);
            var armed = res && res.pending_kind === "cell";
            self.lockData = res;
            if (locked || armed) {
              self.lockConfirm = null;
              self.pending = { kind: "cell", applied: applied, uncertain: true, armed: !!armed };
              self.finishVerify();
            } else if (attempts < MAX) {
              setTimeout(probe, 2500);
            } else {
              self.pending = null;
              self.lockError = "The lock request was cut off by a connection drop and no lock is set - try again.";
              self.finishVerify();
            }
          })
          .catch(function () {
            if (attempts < MAX) { setTimeout(probe, 2500); }
            else {
              self.pending = null;
              self.lockError = "Connection dropped while locking and hasn't recovered yet - refresh once you're back to see the current lock state.";
              self.finishVerify();
            }
          });
      };
      setTimeout(probe, 2500);
    },
    finishVerify() {
      this.lockVerifying = false;
      this.lockBusy = false;
    },
    unlockCell() {
      var self = this;
      if (this.lockBusy || this.pending) return;
      this.lockBusy = true; this.lockError = "";
      window.$rpcRequest("call", ["sid", "mudimodem", "clear_cell_lock", {}], { timeout: 30000 })
        .then(function (res) {
          if (res && res.error) { self.lockError = res.error; return; }
          self.fetchLock();
          self.fetchBands({ light: true });   // meta.lock / mode from GL's store only — no AT
        })
        .catch(function (e) { self.lockError = (e && (e.type || e.message)) || "unlock failed"; })
        .then(function () { self.lockBusy = false; });
    },

    // Disruptive network scan (GL's scan_cells): takes the modem offline for
    // up to ~10 minutes. Only ever fired after an explicit scanConfirm. Stores
    // towers UNSORTED — renderScanCard sorts a slice at paint time so the raw
    // fetch order is never mutated under us.
    scanCells() {
      var self = this;
      if (this.scan.running || this.pending || this.lockBusy) return;
      this.scanConfirm = false;
      this.scan.running = true; this.scan.error = "";
      window.$rpcRequest("call", ["sid", "mudimodem", "scan_cells", {}], { timeout: 600000 })
        .then(function (res) {
          if (!res || res.error) { self.scan.error = (res && res.error) || "scan failed"; return; }
          self.scan.towers = res.towers || [];   // renderScanCard sorts at paint time
          self.scan.ts = res.ts || Date.now();
        })
        .catch(function (e) { self.scan.error = (e && (e.type || e.message)) || "scan failed"; })
        .then(function () { self.scan.running = false; self.fetchLock(); });
    },
    // Lock target from a scan row: GL's own values verbatim, whole row as extra.
    scanTarget(row) {
      var isNR = /5G/.test(row.network_type || "");
      var t = { rat: isNR ? "5g" : "4g", pci: Number(row.pci), freq: Number(row.freq),
                band: row.band !== undefined ? Number(row.band) : undefined,
                label: "scanned cell PCI " + row.pci, extra: row };
      if (isNR) { t.scs = Number(row.scs); t.scsAssumed = false; }
      return t;
    },

    // ---- Config tab (Phase 5) ----
    modemName() {
      return (this.modem && this.modem.name) || "";   // this.modem already exists (computed)
    },
    fetchDeviceInfo() {
      var self = this;
      if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
      return window.$rpcRequest("call", ["sid", "mudimodem", "device_info", {}], { timeout: 8000 })
        .then(function (r) {
          self.deviceInfo = { model: (r && r.model) || "", cpu: (r && r.cpu) || "" };
        })
        .catch(function () { /* fail-silent: next tab-open retries via the !deviceInfo watcher */ });
    },
    // Fail-silent by contract: a failed version check shows the installed version
    // alone, never an error. That contract needs the SILENT transport — through
    // $rpcRequest the interceptor pops GL's global banner before our .catch runs,
    // which is exactly the noise this method promises not to make. It matters
    // most in refreshVersionAfterUpdate, which reads while nginx may still be
    // restarting. A failed read keeps whatever we already had.
    checkAppVersion() {
      var self = this;
      return this.rpcSilent("app_version", {}, 12000)
        .then(function (r) { if (r) self.appVer = r; });
    },
    // After a successful self-update the box's /etc/mudimodem/version.json holds
    // the NEW version, but this card is still showing the one we just replaced.
    // Re-read it so the screen states what is actually installed.
    //
    // The install restarts nginx, so the first read can fail outright or race
    // the file swap and return the old number — retry a few times until it
    // matches the version we installed (or we run out of tries; a stale number
    // beats a spinner that never settles).
    refreshVersionAfterUpdate(target, tries) {
      var self = this;
      if (this.pollStopped) return;
      this.checkAppVersion().then(function () {
        if (self.pollStopped) return;
        var inst = (self.appVer && self.appVer.installed) || "";
        if (tries > 1 && target && inst !== target) {
          if (self.verRefreshTimer) clearTimeout(self.verRefreshTimer);
          self.verRefreshTimer = setTimeout(function () {
            self.refreshVersionAfterUpdate(target, tries - 1);
          }, 2500);
        }
      });
    },
    reloadPage() {
      if (typeof window !== "undefined" && window.location && window.location.reload) {
        window.location.reload();
      }
    },
    fetchHistoryPersist() {
      var self = this;
      if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
      return window.$rpcRequest("call", ["sid", "mudimodem", "get_history_persist", {}], { timeout: 8000 })
        .then(function (r) {
          self.histPersist = r || null;
          self.histPersistErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.histPersistErr = (e && (e.message || e.type)) || "request failed";
        });
    },
    applyHistoryPersist(enabled) {
      var self = this;
      if (this.histPersistBusy || typeof window === "undefined" || !window.$rpcRequest) return;
      this.histPersistBusy = true;
      this.histPersistErr = "";
      return window.$rpcRequest("call",
        ["sid", "mudimodem", "set_history_persist", { enabled: !!enabled }], { timeout: 10000 })
        .then(function (r) {
          self.histPersistBusy = false;
          if (r && typeof r.enabled === "boolean") self.histPersist = r;
          self.histPersistErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.histPersistBusy = false;
          self.histPersistErr = (e && (e.message || e.type)) || "request failed";
        });
    },
    fmtHistSize(bytes) {
      var n = Number(bytes) || 0;
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KiB";
      return (n / (1024 * 1024)).toFixed(2) + " MiB";
    },
    armUpdate() {
      var self = this;
      if (this.updateConfirm || this.updating || this.updateDone) return;
      this.updateConfirm = true;
      if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
      this.updateConfirmTimer = setTimeout(function () { self.updateConfirm = false; }, 5000);
    },
    confirmUpdate() {
      var self = this;
      this.updateConfirm = false;
      if (this.updateConfirmTimer) { clearTimeout(this.updateConfirmTimer); this.updateConfirmTimer = null; }
      if (this.updating || this.updateDone) return Promise.resolve();
      if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
      // The offer disappears from here on; the target version moves into the
      // status line so it stays visible without an actionable link beside it.
      var target = (this.appVer && this.appVer.latest) || "";
      this.updating = true;
      this.updateMsg = "Updating" + (target ? " to v" + target : "") + "…";
      this.pollStopped = false; this.pollAttempts = 0;   // fresh run — a prior update may have stopped/capped it
      return window.$rpcRequest("call", ["sid", "mudimodem", "self_update", {}], { timeout: 12000 })
        .then(function () { self.pollUpdate(); })
        .catch(function (e) {
          self.updating = false;
          self.updateMsg = "Couldn't start update: " + ((e && (e.message || e.type)) || "error");
        });
    },
    // Polls update_status every 3s until a terminal result, a give-up cap
    // (POLL_MAX attempts), or the component tears down. `pollStopped` is the
    // teardown guard: `updatePollTimer` only ever holds the id of the NEXT
    // scheduled timer, so once a timer fires and its RPC is in flight, a plain
    // clearTimeout in beforeDestroy can no longer cancel anything — the async
    // continuation below is what must notice and stop rescheduling.
    pollUpdate() {
      var self = this;
      if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
      this.updatePollTimer = setTimeout(function () {
        if (self.pollStopped) return;   // torn down while this timer was pending
        self.pollAttempts++;
        // ⚠️ SILENT transport, not $rpcRequest. The install restarts nginx about
        // 6s into a ~9s update, so a poll landing in that window is guaranteed to
        // fail — and $rpcRequest's interceptor raises GL's global timeout banner
        // before our .catch can suppress it. That banner was the whole bug: the
        // update succeeded, the retry a few seconds later saw ok, and the user
        // still got a scary timeout. Failure now returns null and just retries.
        self.rpcSilent("update_status", {}, 8000)
          .then(function (s) {
            if (self.pollStopped) return;   // torn down while the request was in flight
            if (s && s.result) {
              self.updating = false;
              if (s.result.ok) {
                var v = (self.appVer && self.appVer.latest) || "";
                self.updateDone = true;   // spent: this page can't offer it again
                self.updateMsg = "Updated" + (v ? " to v" + v : "") +
                  ". The page is still running the old interface —";
                self.refreshVersionAfterUpdate(v, 4);
              } else {
                self.updateMsg = "Update failed: " + (s.result.error || "unknown") +
                  " — see /var/log/mudimodem-update.log";
              }
            } else if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();   // still running (or nginx mid-restart) — keep polling
            }
          })
          .catch(function () {
            if (self.pollStopped) return;   // torn down while the request was in flight
            if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();   // nginx restart drops a request; retry
            }
          });
      }, 3000);
    },
    renderConfig(h) {
      var self = this;
      var row = function (label, value) {
        return h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, label),
          h("span", { staticClass: "mm-v" }, value || "—")
        ]);
      };

      // --- Device card ---
      var di = this.deviceInfo || {};
      var device = h("div", { staticClass: "mm-card" }, [
        h("div", { staticClass: "mm-card-h" }, "Device"),
        row("Model", di.model),
        row("CPU", di.cpu),
        row("Modem", this.modemName())
      ]);

      // --- MudiModem / version card ---
      var av = this.appVer || {};
      var installed = av.installed || "unknown";
      var verNodes = [h("span", {}, "MudiModem "
        + (installed === "unknown" ? "(version unknown)" : "v" + installed))];
      // The offer shows only while it is actionable: not mid-update (the click
      // would do nothing, and the status line already says what's happening),
      // and not after a successful one (this page is still running the OLD
      // chunk, so its "available" flag is stale until reload).
      if (av.checked && av.update_available && av.latest && !this.updating && !this.updateDone) {
        verNodes.push(h("span", { staticClass: "mm-upd" }, [
          " (v" + av.latest + " available — ",
          this.updateConfirm
            ? h("a", { staticClass: "mm-link mm-warn", attrs: { href: "#" },
                on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.confirmUpdate(); } } },
                "click to confirm — briefly restarts the admin panel")
            : h("a", { staticClass: "mm-link", attrs: { href: "#" },
                on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.armUpdate(); } } },
                "Update now"),
          ")"
        ]));
      }
      var verLine = h("div", { staticClass: "mm-kv" }, verNodes);

      var cardKids = [h("div", { staticClass: "mm-card-h" }, "MudiModem"), verLine];
      if (this.updateMsg) {
        // On success the version line above already shows the newly installed
        // version; what's left is swapping THIS page for the new chunk, so the
        // note carries the reload as an action rather than an instruction.
        cardKids.push(h("div", { staticClass: "mm-note" }, this.updateDone
          ? [this.updateMsg + " ",
             h("a", { staticClass: "mm-link", attrs: { href: "#" },
               on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.reloadPage(); } } },
               "reload now")]
          : this.updateMsg));
      }
      var app = h("div", { staticClass: "mm-card" }, cardKids);

      // --- History persistence (eMMC backup, approach #2) ---
      var hp = this.histPersist;
      var histKids = [h("div", { staticClass: "mm-card-h" }, "History across reboots")];
      if (!hp) {
        histKids.push(h("div", { staticClass: "mm-note" },
          this.histPersistErr || "Loading…"));
      } else {
        histKids.push(h("div", { staticClass: "mm-kv" }, [
          h("label", { staticClass: "mm-k" }, [
            h("input", {
              attrs: { type: "checkbox", disabled: !!self.histPersistBusy },
              domProps: { checked: !!hp.enabled },
              on: { change: function (e) {
                self.applyHistoryPersist(!!(e.target && e.target.checked));
              } }
            }),
            " Keep signal & battery history across reboots"
          ])
        ]));
        histKids.push(h("div", { staticClass: "mm-note" },
          "Live charts still use RAM. When this is on, the collector appends new "
          + "samples to eMMC about every "
          + ((hp.flush_interval_s && Math.round(hp.flush_interval_s / 60)) || 10)
          + " minutes (~6 MiB for a full day of signal + battery). Off by default."));
        if (hp.enabled || (hp.size_bytes && hp.size_bytes > 0)) {
          histKids.push(row("Backup size", self.fmtHistSize(hp.size_bytes)));
        }
        if (this.histPersistErr) {
          histKids.push(h("div", { staticClass: "mm-note" }, this.histPersistErr));
        }
      }
      var hist = h("div", { staticClass: "mm-card" }, histKids);

      return h("div", {}, [device, app, hist]);
    },

    // The interactive RATs (each maps to a set_bands arg).
    interactive(group) { return group === "sa" || group === "nsa" || group === "LTE"; },
    argKey(group) { return group === "LTE" ? "lte" : group; },   // set_bands arg name
    // Which RATs a given network mode actually enables (NSA needs an LTE anchor).
    modeEnables(group, mode) {
      if (group === "sa") return mode === "AUTO" || mode === "NR5G";
      if (group === "nsa") return mode === "AUTO";
      if (group === "LTE") return mode === "AUTO" || mode === "LTE";
      return false;
    },
    ratActive(group) { return this.modeEnables(group, this.selMode); },
    // --- network-type lock conflict ---------------------------------------
    // A cell/tower lock names a RAT (LTE or NR5G). If the network mode excludes
    // that RAT the lock is stranded: stored, reported, but inert (an LTE lock
    // under 5G-only never binds). meta.lock rides on get_bands' feat.tower.
    lockInfo() {
      var lk = this.bands && this.bands.meta && this.bands.meta.lock;
      return (lk && lk.active) ? lk : null;
    },
    appliedMode() { return (this.bands && this.bands.meta && this.bands.meta.mode) || "AUTO"; },
    // Would `mode` strand the active lock? Reuse the band-group RAT gate:
    // a 4g lock needs LTE enabled, a 5g lock needs SA enabled.
    modeStrands(mode) {
      var lk = this.lockInfo();
      if (!lk) return false;
      return !this.modeEnables(lk.rat === "4g" ? "LTE" : "sa", mode);
    },
    lockConflict() { return this.modeStrands(this.appliedMode()); },
    // "LTE B12 / PCI 115" or "5G n71 / PCI 516" for the warning banner + tooltip.
    lockLabel() {
      var lk = this.lockInfo();
      if (!lk) return "";
      var rat = lk.rat === "4g" ? "LTE" : "5G";
      var band = (lk.band !== undefined && lk.band !== null && lk.band !== "")
        ? " " + (lk.rat === "4g" ? "B" : "n") + lk.band : "";
      var pci = (lk.pci !== undefined && lk.pci !== null) ? " / PCI " + lk.pci : "";
      return rat + band + pci;
    },
    // --- banner control-state badges (mode lock + tower lock) ------------
    // Both ride on this.bands (get_bands). Return null until it has loaded, so
    // the strip never asserts a state we don't yet know (a false "Unlocked").
    modeBadge() {
      if (!this.bands) return null;
      var m = this.appliedMode();
      if (m === "LTE") return { text: "4G only", active: true };
      if (m === "NR5G") return { text: "5G only", active: true };
      return { text: "Auto", active: false };
    },
    towerBadge() {
      if (!this.bands) return null;
      var lk = this.lockInfo();
      if (!lk) return { text: "Unlocked", locked: false };
      var rat = lk.rat === "4g" ? "LTE" : "5G";
      var tag = (lk.band !== undefined && lk.band !== null && lk.band !== "")
        ? (lk.rat === "4g" ? "B" : "n") + lk.band
        : (lk.pci !== undefined && lk.pci !== null ? "PCI " + lk.pci : "");
      return { text: rat + (tag ? " " + tag : ""), locked: true, title: this.lockLabel() };
    },
    // Two clickable status badges for the trace header. Each jumps to its tab.
    renderLockBadges(h) {
      var self = this, mb = this.modeBadge(), tb = this.towerBadge();
      if (!mb && !tb) return h("span");   // bands not loaded yet — assert nothing
      var kids = [];
      if (mb) kids.push(h("button", {
        staticClass: "mm-lockbadge" + (mb.active ? " mode" : ""),
        attrs: { type: "button", title: "Network mode — open Bands" },
        on: { click: function () { self.tab = "bands"; } }
      }, mb.text));
      if (tb) kids.push(h("button", {
        staticClass: "mm-lockbadge" + (tb.locked ? " lock" : ""),
        attrs: { type: "button",
                 title: (tb.locked ? tb.title + " — " : "") + "Cell lock — open Cell lock tab" },
        on: { click: function () { self.tab = "lock"; } }
      }, (tb.locked ? "🔒 " : "🔓 ") + tb.text));
      return h("div", { staticClass: "mm-lockbadges" }, kids);
    },
    setMode(m) {
      // Block moving INTO a mode that would strand the lock. The mode the modem
      // is already in is exempt — we never auto-write it away; only a NEW
      // stranding selection is refused (the banner tells the user how to fix it).
      if (this.pending) return;
      if (this.modeStrands(m) && m !== this.appliedMode()) return;
      this.clearResetNote();
      this.selMode = m;
    },
    modeChanged() { return this.bands && this.selMode !== ((this.bands.meta && this.bands.meta.mode) || "AUTO"); },
    // Only policy-permitted bands are selectable; blocked ones never take.
    selectable(group, b) {
      if (!this.interactive(group) || !this.bands) return false;
      return (this.bands.policy[group] || []).indexOf(b) !== -1;
    },
    isSelected(group, b) {
      var s = this.sel[group];
      return s && s.indexOf(b) !== -1;
    },
    toggleBand(group, b) {
      if (this.pending || !this.sel[group]) return;   // locked during a pending revert
      this.clearResetNote();
      var i = this.sel[group].indexOf(b);
      if (i === -1) this.sel[group].push(b); else this.sel[group].splice(i, 1);
    },
    selectAll(group) {
      if (this.pending || !this.bands) return;
      this.clearResetNote();
      this.sel[group] = (this.bands.policy[group] || []).slice();   // all permitted
    },
    selectNone(group) {
      if (this.pending) return;
      this.clearResetNote();
      this.sel[group] = [];
    },
    invertSel(group) {
      if (this.pending || !this.bands) return;
      this.clearResetNote();
      var perm = this.bands.policy[group] || [], cur = this.sel[group] || [];
      this.sel[group] = perm.filter(function (b) { return cur.indexOf(b) === -1; });
    },
    resetDefault() {
      // GL's TRUE default: band filtering OFF + Auto mode (set_band_config
      // {band_enable:false, network_mode:"AUTO"}) — not "every permitted band"
      // re-listed. Always written, still through confirm-or-revert.
      if (this.applying) return;
      if (this.pending) return this.flashReset("A change is already pending - Keep or Revert it first.");
      if (!this.bands) return this.flashReset("Bands haven't loaded yet - hit refresh.");
      this.applyError = "";
      this.applyBands({ reset: true });   // clears the note, so flash AFTER it
      this.flashReset(this.bands.config && this.bands.config.enable === false && this.appliedMode() === "AUTO"
        ? "Already at the default - re-sending 'filtering off + Auto' to the modem anyway."
        : "Sending the default to the modem: band filtering off + Auto mode.");
    },
    // Transient one-line feedback under the Bands footer. Any later edit clears
    // it, so the note never describes a state the user has since moved off.
    flashReset(msg) {
      var self = this;
      this.clearResetNote();
      this.resetNote = msg;
      this.resetTimer = setTimeout(function () {
        self.resetNote = ""; self.resetTimer = null;
      }, 8000);
    },
    clearResetNote() {
      if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
      this.resetNote = "";
    },
    changed(group) {
      if (!this.bands || !this.sel[group]) return false;
      var cur = this.seedFor(group).sort(function (a, b) { return a - b; });
      var sel = this.sel[group].slice().sort(function (a, b) { return a - b; });
      if (cur.length !== sel.length) return true;
      for (var i = 0; i < cur.length; i++) if (cur[i] !== sel[i]) return true;
      return false;
    },
    // A group edit that would actually be SENT: under 4G-only the NR groups are
    // never sent (GL empties them in its store under LTE mode, so "applying"
    // them would be a lie the countdown then repeats). They stay edited in the
    // grid and go out once the mode includes them.
    sendable(group) { return this.changed(group) && !(this.selMode === "LTE" && group !== "LTE"); },
    changedAny() {
      return this.sendable("sa") || this.sendable("nsa") || this.sendable("LTE") || this.modeChanged();
    },
    emptyChange() {
      // an edited RAT with zero bands selected — not allowed (would drop the RAT)
      return (this.sendable("sa") && this.sel.sa.length === 0) ||
             (this.sendable("nsa") && this.sel.nsa.length === 0) ||
             (this.sendable("LTE") && this.sel.LTE.length === 0);
    },

    // opts.reset=true sends GL's default (filtering off + AUTO) instead of the
    // grid — the "Reset to default" contract: press it and the modem is written,
    // so the result is never ambiguous. Still confirm-or-revert. Otherwise only
    // the changed groups + mode go out; the backend keeps the rest as-is.
    applyBands(opts) {
      var self = this;
      var reset = !!(opts && opts.reset);
      if (this.applying || this.pending) return;
      if (!reset && (!this.changedAny() || this.emptyChange())) return;
      if (typeof window === "undefined" || !window.$rpcRequest) return;
      var payload = {};
      if (reset) payload.reset = true;
      else {
        var include = function (group, key) {
          if (self.sendable(group)) payload[key] = (self.sel[group] || []).slice();
        };
        include("sa", "sa");
        include("nsa", "nsa");
        include("LTE", "lte");
        if (this.modeChanged()) payload.mode = this.selMode;
      }
      this.applying = true;
      this.applyError = "";
      this.clearResetNote();
      window.$rpcRequest("call", ["sid", "mudimodem", "set_bands", payload], { timeout: 20000 })
        .then(function (res) {
          if (!res || res.error) { self.applyError = (res && res.error) || "apply failed"; return; }
          self.startCountdown(res.window || 60, res.applied);
        })
        .catch(function (e) {
          var t = e && (e.type || e.message);
          // Auth/param errors mean nothing was written. Anything else (timeout,
          // rpcCancel, network reset) is AMBIGUOUS: GL's set_band_config may
          // re-register the modem and drop this very reply after the write took
          // and the watchdog armed. Offer Keep/Revert without a false timer —
          // confirm() on a non-pending state is a harmless no-op.
          if (t === "invalidParams" || t === "accessDenied") { self.applyError = t; return; }
          var a = { mode: payload.mode };
          if (payload.reset) a.reset = true;
          if (payload.sa) a.sa = payload.sa.join(":");
          if (payload.nsa) a.nsa = payload.nsa.join(":");
          if (payload.lte) a.lte = payload.lte.join(":");
          self.clearCountdown();
          self.pending = { kind: "bands", applied: a, uncertain: true, window: 60, remaining: 60 };
        })
        .then(function () { self.applying = false; });
    },
    // kind defaults to "bands" so the existing bands call sites keep working
    // unchanged; the cell-lock flow passes "cell" so the banner + refetch land
    // on the right tab (§renderRevert / renderBands / renderLock).
    startCountdown(window_s, applied, kind) {
      var self = this;
      this.clearCountdown();
      this.pending = { kind: kind || "bands", remaining: window_s, window: window_s,
                       applied: applied, done: false };
      this.cdTimer = setInterval(function () {
        if (!self.pending) return;
        self.pending.remaining -= 1;
        if (self.pending.remaining <= 0) {
          // The watchdog has reverted server-side. Reflect it and re-read.
          var k = self.pending.kind;
          self.clearCountdown();
          self.pending = { kind: k, done: true, reverted: true };
          if (k === "cell") { self.fetchLock(); self.fetchBands({ light: true }); } else self.fetchBands();
          setTimeout(function () { self.pending = null; }, 4000);
        }
      }, 1000);
    },
    clearCountdown() {
      if (this.cdTimer) { clearInterval(this.cdTimer); this.cdTimer = null; }
    },
    keepBands() {
      var self = this;
      this.clearCountdown();
      window.$rpcRequest("call", ["sid", "mudimodem", "confirm", {}])
        .then(function () {}).catch(function () {})
        .then(function () {
          var k = self.pending && self.pending.kind;
          self.pending = null;
          if (k === "cell") { self.fetchLock(); self.fetchBands({ light: true }); } else self.fetchBands();
        });
    },
    revertBands() {
      var self = this;
      this.clearCountdown();
      var k = this.pending && this.pending.kind;
      this.pending = { kind: k, done: true, reverting: true };
      window.$rpcRequest("call", ["sid", "mudimodem", "revert_now", {}], { timeout: 20000 })
        .then(function () {}).catch(function () {})
        .then(function () {
          self.pending = null;
          if (k === "cell") { self.fetchLock(); self.fetchBands({ light: true }); } else self.fetchBands();
        });
    },

    // Classify one band for the read-only groups: active / permitted / blocked.
    bandState(group, b) {
      var d = this.bands;
      var has = function (list, x) { return (list || []).indexOf(x) !== -1; };
      if (has(d.capability[group], b)) return "active";
      if (has(d.policy[group], b)) return "permitted";
      return "blocked";
    },
    // ---- strip trace, fed by mudimodem-collectd via get_history ----

    // Post to /rpc via $axios DIRECTLY, not $rpcRequest. $rpcRequest's axios
    // interceptor pops GL's global error/timeout banner on any failure BEFORE
    // our .catch can run — unacceptable for a background poll, which on this box
    // is GUARANTEED to hit a dead socket at some point (the self-update restarts
    // nginx; a cellular link drops requests on its own). Same reasoning and shape
    // as the tracking chunk's rpcSilent. Resolves null on any failure: the caller
    // treats that as "no answer yet" and tries again.
    rpcSilent(method, params, timeoutMs) {
      if (typeof window === "undefined" || !window.$axios) return Promise.resolve(null);
      var sid = (window.$getCookie && window.$getCookie("Admin-Token")) || "";
      return window.$axios.post("/rpc", {
        jsonrpc: "2.0", id: 1, method: "call",
        params: [sid, "mudimodem", method, params || {}]
      }, { timeout: timeoutMs || 15000 })
        .then(function (r) { return (r && r.data && r.data.result) || null; })
        .catch(function () { return null; });
    },
    stripRpc(params) { return this.rpcSilent("get_history", params, 15000); },
    // Preload the whole strip window once (a DURATION, window_ms, never a
    // browser-computed cutoff — box and browser clocks disagree on a travel
    // router). After that, samples arrive as collector pushes (onSamplePush);
    // the incremental {since} form is only used by the stall safety-poll.
    fetchStripHistory(opts) {
      var self = this;
      if (this.histFetching || this.pollStopped) return;
      if (typeof window === "undefined" || !window.$axios) return;
      var span = this.STRIP_MIN * 60000;
      // The FIRST load is always the window: an explicit flag, not `histLastT
      // > 0` — the `serving.t` watcher is immediate and runs before mounted(),
      // so a store already holding a collect frame (the /ws seed, or a return
      // to this route) has moved the cursor before this ever runs. A caller
      // may name an older `since` to backfill a hole it noticed.
      var params = (opts && opts.since > 0) ? { since: opts.since }
                 : (this.histPreloaded ? { since: this.histLastT } : { window_ms: span });
      this.histFetching = true;
      this.stripRpc(params).then(function (res) {
        self.histFetching = false;
        if (self.pollStopped || !res) return;         // teardown, or a failed poll: keep what we have
        self.histPreloaded = true;
        var fresh = [];
        var ns = res.samples || [];
        for (var i = 0; i < ns.length; i++) {
          var v = parseFloat(ns[i] && ns[i].rsrp);
          // Drop samples with no reading (out of service): a hole in the data is
          // drawn as a hole, not interpolated across.
          if (!isNaN(v) && ns[i].t) fresh.push({ t: ns[i].t, v: v });
        }
        self.histNow = res.now || Date.now();
        self.histNowAt = Date.now();
        var merged = fresh;
        if (params.since) {
          // Incremental: points already held (a push that arrived while this
          // was in flight, or the push that triggered a backfill) are skipped
          // by t, and the result is re-sorted — a backfill is OLDER than the
          // pushed point that revealed the hole.
          var have = {};
          for (var k = 0; k < self.hist.length; k++) have[self.hist[k].t] = 1;
          merged = self.hist.concat(fresh.filter(function (p) { return !have[p.t]; }))
            .sort(function (a, b) { return a.t - b.t; });
        }
        var cut = self.histNow - span;
        self.hist = merged.filter(function (p) { return p.t >= cut; });
        // Cursor advances off the RAW reply, not the filtered points — a tail of
        // rsrp-less samples must still move it, or every poll refetches them.
        if (ns.length) {
          var newest = ns[ns.length - 1].t;
          if (newest > self.histLastT) self.histLastT = newest;
        }
      });
    },
    // A live sample from the collector (mudimodem.collect push): append it to
    // the strip history exactly as get_history would have returned it. The box
    // stamped `t`, so it slots into the box-time axis directly; the box clock
    // reference advances with it (no round-trip to re-sync).
    onSamplePush(s) {
      if (!s || !s.t) return;
      if (s.t <= this.histLastT) return;              // replay of the seed / out of order
      var prevT = this.histLastT;
      // A seed flagged stale is the collector's LAST sample, not a live push:
      // keep the reading (real data at its own t) but leave the stall guard
      // armed so the safety poll keeps looking for a recovery.
      if (!s.stale) this.pushSeenAt = Date.now();
      this.histLastT = s.t;
      this.histNow = s.t; this.histNowAt = Date.now();
      var v = parseFloat(s.rsrp);
      if (!isNaN(v)) this.hist.push({ t: s.t, v: v });
      var cut = s.t - this.STRIP_MIN * 60000;
      if (this.hist.length && this.hist[0].t < cut) {
        this.hist = this.hist.filter(function (p) { return p.t >= cut; });
      }
      // The push landed well over a tick after the last point: pushes were
      // withheld or lost in between — the collector only pushes while its
      // has_websocket probe (every 30 s when idle) says a browser is attached,
      // so the first ~3 ticks after a page opens are never pushed; a ws
      // reconnect drops some too. Those samples ARE in the collector's log:
      // fetch them once instead of leaving a hole or a straight bridge in the
      // trace. (The stall guard cannot catch this — the push itself resets it.)
      if (this.histPreloaded && prevT > 0 && !s.stale && s.t - prevT > this.STRIP_HOLE_MS)
        this.fetchStripHistory({ since: prevT });
    },
    startStrip() {
      var self = this;
      if (this.histTimer || typeof window === "undefined") return;
      this.fetchStripHistory();
      // Safety net only: when pushes have stalled (collector restarting, ws
      // reconnect), fetch the tail — otherwise this timer does nothing.
      this.histTimer = setInterval(function () {
        if (Date.now() - self.pushSeenAt > self.STRIP_STALL_MS) self.fetchStripHistory();
      }, this.STRIP_POLL_MS);
    },
    startStripPoll() { this.startStrip(); },   // legacy name (tests)
    stopStripPoll() {
      if (this.histTimer) { clearInterval(this.histTimer); this.histTimer = null; }
    },
    // "Now" on the BOX's clock: the last reply's os.time() advanced by however
    // long ago it landed. Used for both ends of the x-axis so the window is
    // sized in box time, matching the timestamps being plotted.
    stripEnd() {
      if (!this.histNow) return Date.now();
      return this.histNow + (Date.now() - this.histNowAt);
    },
    // Collector points inside the visible window (may be empty: the line is
    // simply not drawn until two samples exist).
    stripPoints() {
      var end = this.stripEnd(), start = end - this.STRIP_MIN * 60000;
      return this.hist.filter(function (p) { return p.t >= start; });
    },
    // RSRP field-test base is −120…−80 dBm. Expand (never shrink) when a point
    // sits outside so a strong signal isn't clamped flat to the top of the strip
    // — same rule as Tracking's domainFor. Absolute scale stays absolute for
    // in-range data; noise is not auto-zoomed into a full-height wiggle.
    stripRsrpDomain(vals) {
      var FLOOR = -120, CEIL = -80;
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i];
        if (v == null || v === "" || isNaN(v)) continue;
        v = +v;
        if (v < FLOOR) FLOOR = v;
        if (v > CEIL) CEIL = v;
      }
      return [FLOOR, CEIL];
    },
    stripAxisDomain() {
      return this.stripRsrpDomain(this.stripPoints().map(function (p) { return p.v; }));
    },
    tracePath() {
      var pts = this.stripPoints();
      return pts.length >= 2 ? this.tracePathTimed(pts) : "";
    },
    // Daemon path: x is real time across [now-window, now], so an outage or a
    // stopped collector leaves a visible hole instead of a straight line drawn
    // across it.
    tracePathTimed(pts) {
      var dom = this.stripRsrpDomain(pts.map(function (p) { return p.v; }));
      var FLOOR = dom[0], CEIL = dom[1], W = 320, H = 40, ySpan = CEIL - FLOOR;
      var span = this.STRIP_MIN * 60000, end = this.stripEnd(), start = end - span;
      var d = "", prev = null;
      for (var i = 0; i < pts.length; i++) {
        var t = pts[i].t;
        var x = ((t - start) / span) * W;
        if (x < 0) x = 0; else if (x > W) x = W;
        var cl = Math.max(FLOOR, Math.min(CEIL, pts[i].v));
        var y = ySpan ? H - ((cl - FLOOR) / ySpan) * H : H / 2;
        d += ((prev === null || t - prev > this.STRIP_GAP_MS) ? "M" : "L") +
             x.toFixed(1) + "," + y.toFixed(1);
        prev = t;
      }
      return d;
    },
    injectStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(this.styleId)) return;
      var css =
        '.mm{color:var(--text-regular);font-variant-numeric:tabular-nums}' +
        '.mm-strip{display:flex;align-items:stretch;background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin-bottom:11px;overflow:hidden}' +
        '.mm-trace{flex:1;min-width:0;padding:9px 0 6px 13px}' +
        '.mm-eyebrow{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}' +
        '.mm-plot{height:40px;margin-top:3px}.mm-plot svg{display:block;width:100%;height:100%;overflow:visible}' +
        '.mm-axis{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:2px}' +
        '.mm-read{flex:none;min-width:120px;padding:10px 14px 9px 15px;text-align:right;border-left:1px solid var(--divider);display:flex;flex-direction:column;justify-content:center}' +
        '.mm-rsrp{font-size:29px;font-weight:600;line-height:1;letter-spacing:-.025em}.mm-rsrp .u{font-size:11px;font-weight:500;color:var(--text-hint);margin-left:2px}' +
        '.mm-facts{display:flex;flex-wrap:wrap;gap:5px 13px;justify-content:flex-end;margin-top:7px}' +
        '.mm-facts .k{display:block;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-badge)}.mm-facts b{font-size:12.5px;font-weight:600}' +
        // Control-state badges on the trace header: mode lock + tower lock. Muted
        // when idle (Auto / Unlocked), tinted when a restriction is in force.
        '.mm-lockbadges{display:flex;gap:6px;align-items:center}' +
        '.mm-lockbadge{background:var(--background-3,rgba(0,0,0,.04));border:1px solid transparent;border-radius:9px;padding:1px 8px;font:inherit;font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--text-hint);cursor:pointer;white-space:nowrap}' +
        '.mm-lockbadge.mode{color:var(--warning);border-color:var(--warning-disabled,var(--warning));background:var(--warning-disabled,transparent)}' +
        '.mm-lockbadge.lock{color:var(--error);border-color:var(--error);background:transparent}' +
        '.mm-tabs{display:flex;gap:22px;border-bottom:1px solid var(--divider);margin-bottom:11px;padding:0 4px}' +
        '.mm-tab{background:none;border:0;padding:9px 0 8px;font:inherit;font-size:13px;cursor:pointer;color:var(--text-weak);border-bottom:2px solid transparent;margin-bottom:-1px}' +
        '.mm-tab.on{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}' +
        '.mm-tab:disabled{color:var(--text-hint);cursor:default}' +
        '.mm-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:13px 14px}' +
        '.mm-sect{font-size:13px;font-weight:600;color:var(--text-title)}.mm-hint{font-size:11.5px;color:var(--text-badge)}' +
        '.mm-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 16px;margin-top:11px}' +
        '.mm-dl .k{display:block;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mm-dl b{font-size:13px;font-weight:600;color:var(--text-title)}' +
        '.mm-soon{padding:26px 14px;text-align:center;color:var(--text-hint);font-size:12px;line-height:1.6}' +
        '.mm-empty{padding:30px 14px;text-align:center;color:var(--text-hint);font-size:12.5px}' +
        // band grid
        '.mm-grp{margin-bottom:15px}.mm-grp:last-child{margin-bottom:2px}' +
        '.mm-grp-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}' +
        '.mm-grp-t{font-size:12px;font-weight:600;color:var(--text-title)}' +
        '.mm-acts{display:flex;gap:2px}' +
        '.mm-act{background:none;border:0;font:inherit;font-size:10.5px;cursor:pointer;color:var(--primary);padding:2px 6px;border-radius:3px}' +
        '.mm-act:hover{background:var(--primary-background)}' +
        '.mm-grp-off .mm-wrap{opacity:.5}' +
        '.mm-gate{font-size:10.5px;color:var(--warning-hover);background:var(--warning-background);border:1px solid var(--warning-disabled);border-radius:3px;padding:4px 8px;margin-bottom:6px}' +
        '.mm-seg{display:inline-flex;border:1px solid var(--border);border-radius:4px;overflow:hidden}' +
        '.mm-seg-b{font:inherit;font-size:12px;background:transparent;border:0;padding:5px 14px;cursor:pointer;color:var(--text-weak);border-right:1px solid var(--border)}' +
        '.mm-seg-b:last-child{border-right:0}' +
        '.mm-seg-b.on{background:var(--primary);color:#fff;font-weight:600}' +
        '.mm-seg-b:disabled{cursor:default;opacity:.6}' +
        '.mm-wrap{display:flex;gap:4px;flex-wrap:wrap}' +
        '.mm-band{position:relative;min-width:44px;padding:4px 6px 3px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--background-card);transition:border-color .1s,background .1s}' +
        '.mm-band b{display:block;font-size:12px;font-weight:600;line-height:1.2}.mm-band s{display:block;font-size:9px;line-height:1.2;color:var(--text-hint);text-decoration:none}' +
        // read-only states
        '.mm-band.active{background:var(--success);border-color:var(--success)}.mm-band.active b{color:#fff}.mm-band.active s{color:rgba(255,255,255,.75)}' +
        '.mm-band.permitted{border-color:var(--primary)}.mm-band.permitted b{color:var(--primary)}' +
        // interactive states
        '.mm-band.sel{background:var(--success);border-color:var(--success)}.mm-band.sel b{color:#fff}.mm-band.sel s{color:rgba(255,255,255,.75)}' +
        '.mm-band.unsel b{color:var(--text-regular)}' +
        '.mm-band.blocked{opacity:.5}.mm-band.blocked b{color:var(--text-hint);text-decoration:line-through}' +
        '.mm-band.clickable{cursor:pointer}.mm-band.clickable:hover{border-color:var(--primary)}' +
        '.mm-band.serving{box-shadow:0 0 0 2px var(--success)}' +
        '.mm-band.serving::after{content:"";position:absolute;top:-3px;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--success);border:1.5px solid var(--background-card)}' +
        '.mm-axis2{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:6px}' +
        '.mm-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--text-badge);margin-top:12px;padding-top:10px;border-top:1px solid var(--divider)}' +
        '.mm-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}' +
        // apply + revert
        '.mm-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--divider);padding-top:11px;margin-top:11px}' +
        '.mm-btn{font:inherit;font-size:11.5px;font-weight:600;border-radius:3px;padding:6px 13px;cursor:pointer;border:1px solid transparent}' +
        '.mm-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}' +
        '.mm-btn.primary:disabled{background:var(--primary-disabled);border-color:transparent;cursor:default}' +
        '.mm-btn.keep{background:var(--warning);color:#fff;border-color:var(--warning)}' +
        '.mm-btn.danger{background:transparent;color:var(--error);border-color:var(--error)}' +
        '.mm-revert{background:var(--warning-background);border:1px solid var(--warning);border-radius:3px;padding:9px 11px;margin:0 0 12px}' +
        '.mm-revert-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11.5px;color:var(--warning-hover)}' +
        '.mm-revert b{font-weight:600}.mm-cd{font-variant-numeric:tabular-nums}' +
        '.mm-bar{height:2px;background:var(--warning-disabled);border-radius:1px;margin-top:8px;overflow:hidden}.mm-bar i{display:block;height:100%;background:var(--warning);transition:width 1s linear}' +
        // nearby-cells scan card
        '.mm-scan-row{display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--divider);font-size:12px}' +
        '.mm-scan-row>span{min-width:0}.mm-scan-row>span:nth-child(2){flex:1}' +
        '.mm-scan-badge{flex:none;font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:3px;color:var(--text-badge)}' +
        '@media(max-width:640px){.mm-strip{flex-direction:column}.mm-read{border-left:0;border-top:1px solid var(--divider);text-align:left;align-items:flex-start}.mm-facts{justify-content:flex-start}.mm-revert-row{flex-direction:column;align-items:flex-start}}' +
        // Config tab
        '.mm-card+.mm-card{margin-top:11px}' +
        '.mm-card-h{font-size:13px;font-weight:600;color:var(--text-title);margin-bottom:6px}' +
        '.mm-kv{display:flex;gap:12px;padding:4px 0;font-size:14px}' +
        '.mm-k{color:var(--text-hint);min-width:64px}' +
        '.mm-v{color:var(--text)}' +
        '.mm-link{color:var(--primary);cursor:pointer;text-decoration:underline}' +
        '.mm-warn{color:var(--warning)}' +
        '.mm-upd{color:var(--text-hint)}' +
        '.mm-note{margin-top:8px;color:var(--text-hint);font-size:13px}';
      var el = document.createElement("style");
      el.id = this.styleId; el.textContent = css;
      document.head.appendChild(el);
    },

    // ---- band grid render helpers ----
    // sa + LTE are interactive (set_bands writes them); nsa stays read-only.
    renderGroup(h, group, title) {
      var self = this, d = this.bands;
      var interactive = this.interactive(group);
      var supported = (d.supported[group] || []).slice();
      supported.sort(function (a, b) {
        var fa = self.freqOf(group, a), fb = self.freqOf(group, b);
        if (fa === undefined) fa = 1e9; if (fb === undefined) fb = 1e9;
        return (fa - fb) || (a - b);
      });
      if (supported.length === 0) return null;
      var pre = this.prefixOf(group);
      var servingHere = {};
      self.servingBands.forEach(function (sb) { if (sb.group === group) servingHere[sb.band] = sb.role; });
      var chips = supported.map(function (b) {
        var serving = servingHere[b] !== undefined;
        var f = self.freqOf(group, b);
        var cls, tip;
        if (interactive) {
          if (!self.selectable(group, b)) {
            cls = "blocked"; tip = pre + b + " blocked by carrier policy; selecting has no effect";
          } else if (self.isSelected(group, b)) {
            cls = "sel"; tip = pre + b + " allowed (click to remove)";
          } else {
            cls = "unsel"; tip = pre + b + " permitted (click to allow)";
          }
        } else {
          var st = self.bandState(group, b);
          cls = st;
          tip = pre + b + " " + ({ active: "in use", permitted: "permitted, not active", blocked: "blocked by carrier policy" })[st];
        }
        var clickable = interactive && cls !== "blocked" && !self.pending;
        if (serving) tip += " — serving now (" + servingHere[b] + ")";
        return h("span", {
          key: b,
          staticClass: "mm-band " + cls + (serving ? " serving" : "") + (clickable ? " clickable" : ""),
          attrs: { title: tip },
          on: clickable ? { click: function () { self.toggleBand(group, b); } } : {}
        }, [h("b", pre + b), h("s", f ? String(f) : " ")]);
      });
      // per-group actions (interactive groups only): All / None / Invert
      var actions = null;
      if (interactive && !this.pending) {
        var mkAct = function (label, fn) {
          return h("button", { staticClass: "mm-act", on: { click: fn } }, label);
        };
        actions = h("span", { staticClass: "mm-acts" }, [
          mkAct("All", function () { self.selectAll(group); }),
          mkAct("None", function () { self.selectNone(group); }),
          mkAct("Invert", function () { self.invertSel(group); })
        ]);
      }
      var counts = (d.supported[group] || []).length + " supported / " +
        (d.policy[group] || []).length + " permitted / " + (d.capability[group] || []).length + " active";
      // Mode gate: if the selected mode doesn't enable this RAT, say so — the
      // selections are inert until the mode includes it.
      var gate = null;
      if (interactive && !this.ratActive(group)) {
        var need = group === "nsa" ? "Auto" : (group === "LTE" ? "Auto or 4G only" : "Auto or 5G only");
        gate = h("div", { staticClass: "mm-gate" },
          this.selMode === "LTE" && group !== "LTE"
            ? "Off under " + this.selMode + " mode - 5G selections are not sent (GL clears them under 4G-only). Set mode to " + need + " to use them."
            : "Off under " + this.selMode + " mode - these won't apply. Set mode to " + need + " to use them.");
      }
      return h("div", { staticClass: "mm-grp" + (gate ? " mm-grp-off" : ""), key: group }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, title + (interactive ? "" : "  (read-only)")),
          actions || h("span", { staticClass: "mm-hint" }, counts)
        ]),
        interactive ? h("div", { staticClass: "mm-hint", staticStyle: { margin: "-3px 0 6px" } }, counts) : null,
        gate,
        h("div", { staticClass: "mm-wrap" }, chips),
        h("div", { staticClass: "mm-axis2" }, [
          h("span", "low band, reaches far"),
          h("span", "high band, fast + short range")
        ])
      ]);
    },

    // The network-mode selector (Auto / 5G only / 4G only).
    renderMode(h) {
      var self = this, cur = this.selMode;
      var opts = [["AUTO", "Auto"], ["NR5G", "5G only"], ["LTE", "4G only"]];
      return h("div", { staticClass: "mm-grp" }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Network mode"),
          this.modeChanged()
            ? h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } }, "changed")
            : h("span", { staticClass: "mm-hint" }, "which radios the modem may use")
        ]),
        h("div", { staticClass: "mm-seg" }, opts.map(function (o) {
          // Block the mode that would strand an active cell lock — but never the
          // mode the modem is already in (greying the current option reads as broken).
          var blocked = self.modeStrands(o[0]) && o[0] !== self.appliedMode();
          return h("button", {
            key: o[0],
            staticClass: "mm-seg-b" + (cur === o[0] ? " on" : ""),
            attrs: {
              disabled: !!self.pending || blocked,
              title: blocked
                ? ("Would strand your " + (self.lockInfo().rat === "4g" ? "LTE" : "5G") +
                   " cell lock - clear the lock first")
                : undefined
            },
            on: { click: function () { self.setMode(o[0]); } }
          }, o[1]);
        }))
      ]);
    },

    // Confirm-or-revert banner (design C1: inline, on the tab that caused it).
    renderRevert(h) {
      var self = this, p = this.pending;
      if (p.done) {
        var doneMsg = p.reverting ? "Reverting..." :
          (p.reverted ? (p.kind === "cell" ? "Reverted - cell lock removed." : "Reverted - restored your previous bands.") : "");
        return h("div", { staticClass: "mm-revert" }, [
          h("span", { staticClass: "mm-revert-row" }, doneMsg)
        ]);
      }
      // The set_cell_lock reply never came back (the lock bounced our own remote
      // tunnel). We're re-querying to learn the real state - hold this panel.
      if (p.verifying) {
        return h("div", { staticClass: "mm-revert" }, [
          h("span", { staticClass: "mm-revert-row" },
            "Connection dropped while applying the lock - checking whether it took...")
        ]);
      }
      // Verified: a lock IS present, but the drop cost us the exact countdown.
      // Offer Keep / Revert without a false timer.
      if (p.uncertain) {
        var ua = p.applied || {};
        var what = p.kind === "cell"
          ? [" the ", h("b", (ua.rat === "4g" ? "LTE" : "5G") + " lock PCI " + ua.pci + " / ARFCN " + ua.freq), " did apply."]
          : [" the band change (", h("b", ua.reset ? "filtering off + Auto" :
              [ua.mode ? "mode " + ua.mode : "", ua.sa ? " SA " + ua.sa : "", ua.nsa ? " NSA " + ua.nsa : "", ua.lte ? " LTE " + ua.lte : ""].join("").trim()),
             ") most likely applied."];
        return h("div", { staticClass: "mm-revert" }, [
          h("div", { staticClass: "mm-revert-row" }, [
            h("span", [
              "Your connection dropped while applying, but"].concat(what).concat([
              " If the auto-revert is still running it will undo this within ~60s - ",
              h("b", "Keep"), " to make it stick, or ", h("b", "Revert"), " to remove it now."
            ])),
            h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
              h("button", { staticClass: "mm-btn danger", on: { click: function () { self.revertBands(); } } }, "Revert now"),
              h("button", { staticClass: "mm-btn keep", on: { click: function () { self.keepBands(); } } }, "Keep")
            ])
          ])
        ]);
      }
      // Summarise what changed (applied = { mode, sa, nsa, lte } for bands;
      // { rat, pci, freq } for a cell lock).
      var a = p.applied || {}, bits = [];
      if (p.kind === "cell") {
        bits.push((a.rat === "4g" ? "LTE" : "5G") + " cell PCI " + a.pci + " / ARFCN " + a.freq);
      } else if (a.reset) {
        bits.push("default: band filtering off, mode Auto");
      } else {
        if (a.mode) bits.push("mode " + a.mode);
        if (a.sa) bits.push("5G-SA " + a.sa.split(":").map(function (b) { return "n" + b; }).join(" "));
        if (a.nsa) bits.push("5G-NSA " + a.nsa.split(":").map(function (b) { return "n" + b; }).join(" "));
        if (a.lte) bits.push("LTE " + a.lte.split(":").map(function (b) { return "B" + b; }).join(" "));
      }
      var pct = Math.max(0, Math.min(100, (p.remaining / p.window) * 100));
      return h("div", { staticClass: "mm-revert" }, [
        h("div", { staticClass: "mm-revert-row" }, [
          h("span", [
            "Applied ", h("b", bits.join("; ") || "band change"),
            ". Reverting in ", h("b", { staticClass: "mm-cd" }, String(p.remaining) + "s"),
            " unless you keep it - watch the trace above."
          ]),
          h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
            h("button", { staticClass: "mm-btn danger", on: { click: function () { self.revertBands(); } } }, "Revert now"),
            h("button", { staticClass: "mm-btn keep", on: { click: function () { self.keepBands(); } } }, "Keep")
          ])
        ]),
        h("div", { staticClass: "mm-bar" }, [h("i", { staticStyle: { width: pct.toFixed(1) + "%" } })])
      ]);
    },

    renderBands(h) {
      if (this.bandsLoading) return h("div", { staticClass: "mm-empty" }, "Reading band configuration from the modem...");
      if (this.bandsError) return h("div", { staticClass: "mm-empty" }, "Couldn't read bands: " + this.bandsError);
      if (!this.bands) return h("div", { staticClass: "mm-empty" }, "...");
      var d = this.bands, self = this;
      var groups = [
        this.renderMode(h),
        this.renderGroup(h, "sa", "5G NR standalone"),
        this.renderGroup(h, "nsa", "5G NR non-standalone"),
        this.renderGroup(h, "LTE", "LTE")
      ].filter(Boolean);
      var op = (d.meta && d.meta.plmn) ? d.meta.plmn : "carrier";
      var warn = (d.meta && d.meta.plmn_matched === false)
        ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
            "Couldn't confirm which SIM answered - values may be for the other slot")
        : null;
      // GL stores a network mode outside Auto/5G/4G (e.g. the LTE:NR5G a GL 4G
      // tower lock leaves behind): shown as-is; a band-only apply passes it
      // through untouched, only an explicit mode pick here replaces it.
      var modeWarn = (d.meta && d.meta.mode_known === false)
        ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
            "GL reports network mode \"" + d.meta.mode_raw + "\", which this panel doesn't offer - it stays as it is unless you pick a mode below.")
        : null;
      // Network-type lock conflict: the modem is cell-locked to a RAT the current
      // mode excludes, so the lock can't take effect. Name the lock + the fix.
      var lockWarn = this.lockConflict()
        ? h("div", { staticClass: "mm-revert" }, [
            h("div", { staticClass: "mm-revert-row", staticStyle: { display: "block", color: "var(--warning-hover)" } }, [
              h("b", "⚠ Modem is cell-locked to " + this.lockLabel() + ", "),
              "but network mode is " +
                ({ NR5G: "5G only", LTE: "4G only", AUTO: "Auto" }[this.appliedMode()] || this.appliedMode()) +
                " - the lock can't take effect. Set mode to " +
                (this.lockInfo().rat === "4g" ? "Auto or 4G only" : "Auto or 5G only") +
                ", or clear the lock on the Cell Lock tab."
            ])
          ])
        : null;
      var head = [
        h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, [
          h("span", { staticClass: "mm-sect" }, "Bands"),
          h("span", [
            h("span", { staticClass: "mm-hint", staticStyle: { marginRight: "10px" } }, "carrier " + op),
            h("button", {
              staticClass: "mm-tab", staticStyle: { fontSize: "11.5px", padding: "2px 0", borderBottom: "0" },
              attrs: { disabled: !!this.pending },
              on: { click: function () { if (!self.pending) self.fetchBands(); } }
            }, self.bandsLoading ? "refreshing..." : "refresh")
          ])
        ]),
        h("div", { staticClass: "mm-hint", staticStyle: { margin: "3px 0 12px" } },
          "Choose the network mode and which 5G/LTE bands the modem may use. Blocked bands are ones " +
          "the module supports but your carrier forbids - they can't be selected because they never take."),
        warn,
        modeWarn,
        lockWarn,
        (this.pending && this.pending.kind !== "cell") ? this.renderRevert(h) : null
      ];
      var footer = [];
      if (!this.pending) {
        var changed = this.changedAny();
        var empty = this.emptyChange();
        var status;
        if (this.applyError) status = h("span", { staticStyle: { color: "var(--error)" } }, this.applyError);
        else if (empty) status = h("span", { staticStyle: { color: "var(--error)" } }, "Each edited band group needs at least one band");
        else if (changed) {
          var parts = [];
          if (this.modeChanged()) parts.push("mode -> " + this.selMode);
          if (this.selMode === "LTE" && (this.changed("sa") || this.changed("nsa")))
            parts.push("5G selections held back under 4G-only");
          if (this.changed("sa")) parts.push(this.sel.sa.length + " SA");
          if (this.changed("nsa")) parts.push(this.sel.nsa.length + " NSA");
          if (this.changed("LTE")) parts.push(this.sel.LTE.length + " LTE");
          status = parts.join(" + ") + " changed; applies with a 60s revert";
        } else status = "No changes";
        footer.push(h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, [status]),
          h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
            h("button", {
              staticClass: "mm-btn",
              attrs: { disabled: this.applying },
              on: { click: function () { self.resetDefault(); } }
            }, "Reset to default"),
            h("button", {
              staticClass: "mm-btn primary",
              attrs: { disabled: !changed || this.applying || empty },
              on: { click: function () { self.applyBands(); } }
            }, this.applying ? "Applying..." : "Apply")
          ])
        ]));
        if (this.resetNote) footer.push(h("div", { staticClass: "mm-note" }, this.resetNote));
      }
      var legend = [h("div", { staticClass: "mm-legend" }, [
        h("span", [h("i", { staticStyle: { background: "var(--success)" } }), "allowed"]),
        h("span", [h("i", { staticStyle: { background: "transparent", border: "1px solid var(--border)" } }), "permitted, not selected"]),
        h("span", [h("i", { staticStyle: { background: "var(--text-hint)" } }), "blocked by policy"]),
        h("span", "ring = serving now (every carrier: PCC + SCCs)")
      ])];
      return h("div", { staticClass: "mm-card" }, head.filter(Boolean).concat(groups).concat(footer).concat(legend));
    },

    // ---- cell-lock render helpers ----
    renderCurrentCell(h) {
      var self = this, d = this.lockData;
      var s = d.serving || {};
      var l5 = (d.lock && d.lock.l5g) || {}, l4 = (d.lock && d.lock.l4g) || {};
      var locked = !!(l5.locked || l4.locked || (d.gl && d.gl.locked));
      var rows = [];
      var push = function (k, v) { if (v !== undefined && v !== null && v !== "") rows.push([k, v]); };
      push("RAT", s.rat); push("PCI", s.pci); push("ARFCN", s.arfcn);
      push("Band", s.band != null ? ((/NR5G/.test(s.rat || "") ? "n" : "B") + s.band) : null);
      push("Cell ID", s.cell_id);
      push("RSRP", this.serving.rsrp != null ? this.serving.rsrp + " dBm" : null);
      push("SINR", this.serving.sinr != null ? this.serving.sinr + " dB" : null);

      var action;
      if (locked) {
        // Prefer whichever AT-side lock is actually set; if the lock is known
        // only via GL's store (d.gl.locked, with both l4g/l5g reading unlocked
        // — a documented GL/AT disagreement), fall back to GL's stored tower
        // rather than rendering l4g's empty pci/freq as "undefined".
        var lk = l5.locked ? l5 : (l4.locked ? l4 : ((d.gl && d.gl.tower) || {}));
        var hasPci = lk.pci !== undefined && lk.pci !== null;
        var hasFreq = lk.freq !== undefined && lk.freq !== null;
        var lockedDetail;
        if (hasPci && hasFreq) lockedDetail = " to PCI " + lk.pci + " / ARFCN " + lk.freq;
        else if (hasPci) lockedDetail = " to PCI " + lk.pci;
        else if (hasFreq) lockedDetail = " to ARFCN " + lk.freq;
        else lockedDetail = " (details unavailable)";
        var lockedSuffix = (hasPci || hasFreq) && lk.band ? " (n" + lk.band + ")" : "";
        action = h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, [
            h("b", { staticStyle: { color: "var(--success)" } }, "Locked"),
            lockedDetail + lockedSuffix + ". The modem will not hand over."
          ]),
          h("button", {
            staticClass: "mm-btn danger",
            attrs: { disabled: this.lockBusy || !!this.pending },
            on: { click: function () { self.unlockCell(); } }
          }, this.lockBusy ? "Unlocking..." : "Unlock")
        ]);
      } else {
        var target = this.pinTarget();
        if (this.lockConfirm && this.lockConfirm.pin) {
          action = h("div", { staticClass: "mm-foot" }, [
            h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } },
              "Lock to PCI " + target.pci + "? Network mode switches to " +
              (target.rat === "5g" ? "5G-only" : "4G-preferred") + " until unlocked." +
              (target.scsAssumed ? " SCS " + target.scs + " kHz is assumed from the band." : "") +
              " Auto-reverts in 60s unless kept."),
            h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
              h("button", { staticClass: "mm-btn", on: { click: function () { self.lockConfirm = null; } } }, "Cancel"),
              h("button", {
                staticClass: "mm-btn primary", attrs: { disabled: this.lockBusy || !!this.pending },
                on: { click: function () { self.lockCell(target); } }
              }, this.lockBusy ? "Locking..." : "Lock it")
            ])
          ]);
        } else {
          action = h("div", { staticClass: "mm-foot" }, [
            h("span", { staticClass: "mm-hint" },
              "Pin the modem to the cell it is using now - the safest lock target."),
            h("button", {
              staticClass: "mm-btn primary",
              attrs: { disabled: !target || this.lockBusy || !!this.pending },
              on: { click: function () { self.lockConfirm = { pin: true }; } }
            }, "Lock to this cell")
          ]);
        }
      }
      return h("div", { staticClass: "mm-grp" }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Current cell"),
          h("span", { staticClass: "mm-hint" }, locked ? "locked" : "serving now")
        ]),
        h("div", { staticClass: "mm-dl" }, rows.map(function (r, i) {
          return h("div", { key: i }, [h("span", { staticClass: "k" }, r[0]), h("b", String(r[1]))]);
        })),
        action
      ]);
    },

    // Nearby-cells scan card. GL's scan_cells is DISRUPTIVE (modem offline up
    // to ~10 minutes), so it never fires without an explicit confirm step, and
    // the empty state is honest that 5G SA exposes no neighbour list at all.
    renderScanCard(h) {
      var self = this;
      var locked = this.lockData && ((this.lockData.lock.l5g || {}).locked ||
                                     (this.lockData.lock.l4g || {}).locked);
      var head = h("div", { staticClass: "mm-grp-h" }, [
        h("span", { staticClass: "mm-grp-t" }, "Nearby cells"),
        this.scan.ts
          ? h("span", { staticClass: "mm-hint" },
              "scanned " + Math.max(1, Math.round((Date.now() - this.scan.ts) / 60000)) + " min ago")
          : h("span", { staticClass: "mm-hint" }, "requires a scan")
      ]);
      var body;
      if (this.scan.running) {
        body = h("div", { staticClass: "mm-empty" },
          "Scanning... the modem is offline until this finishes (up to ~10 minutes). Watch the strip.");
      } else if (this.scan.towers.length) {
        // Our serving carrier's cells float to the very top — those are the ones
        // that can actually work; other carriers' cells almost never will. Match
        // on the serving network NAME (roaming-aware; from sim status) with an
        // MCC+MNC fallback against the active SIM's home PLMN.
        var servingC = this.servingCarrier;
        var simMcc = this.activeSim.mcc, simMnc = this.activeSim.mnc;
        var isOurs = function (t) {
          if (servingC && t.carrier && self.nameOverlap(servingC, t.carrier)) return true;
          return !!simMcc && String(t.mcc) === String(simMcc) && String(t.mnc) === String(simMnc);
        };
        // Then 5G above LTE, then group by carrier (A–Z), then strongest RSRP;
        // cells with no RSRP sink to the bottom of their group. Carrier key
        // mirrors the row's own display fallback (carrier name, else mcc-mnc).
        var ckey = function (t) {
          return (t.carrier || ((t.mcc || "") + "-" + (t.mnc || ""))).toLowerCase();
        };
        var is5g = function (t) { return /5G/.test(t.network_type || "") ? 0 : 1; };
        var sorted = this.scan.towers.slice().sort(function (a, b) {
          var oa = isOurs(a) ? 0 : 1, ob = isOurs(b) ? 0 : 1;
          if (oa !== ob) return oa - ob;   // serving carrier first
          var ra = is5g(a), rb = is5g(b);
          if (ra !== rb) return ra - rb;   // 5G above LTE
          var ca = ckey(a), cb = ckey(b);
          if (ca !== cb) return ca < cb ? -1 : 1;
          if (a.rsrp === undefined && b.rsrp === undefined) return 0;
          if (a.rsrp === undefined) return 1;
          if (b.rsrp === undefined) return -1;
          return b.rsrp - a.rsrp;   // -84 before -95 (strongest first)
        });
        var rows = sorted.map(function (tw, i) {
          var q = tw.rsrp !== undefined ? (tw.rsrp >= -95 ? "good" : (tw.rsrp >= -105 ? "fair" : "poor")) : "none";
          var confirming = self.lockConfirm && self.lockConfirm.scanIdx === i;
          var target = self.scanTarget(tw);
          return h("div", { key: i, staticClass: "mm-scan-row" }, [
            h("span", { staticClass: "mm-scan-badge" }, tw.network_type || "?"),
            h("span", (tw.carrier || ((tw.mcc || "") + "-" + (tw.mnc || ""))) + "  " + (tw.cellid || "")),
            h("span", (/5G/.test(tw.network_type || "") ? "n" : "B") + (tw.band !== undefined ? tw.band : "?") +
              "  ARFCN " + tw.freq + "  PCI " + tw.pci),
            h("span", { style: { color: self.qColor(q) } },
              tw.rsrp !== undefined ? tw.rsrp + " dBm" : ""),
            confirming
              ? h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
                  h("button", { staticClass: "mm-btn", on: { click: function () { self.lockConfirm = null; } } }, "Cancel"),
                  h("button", { staticClass: "mm-btn primary", attrs: { disabled: self.lockBusy || !!self.pending },
                    on: { click: function () { self.lockCell(target); } } },
                    self.lockBusy ? "Locking..." : "Confirm")
                ])
              : h("button", { staticClass: "mm-btn",
                  attrs: { disabled: !!self.pending || self.lockBusy || locked ||
                           (/5G/.test(tw.network_type || "") && tw.scs === undefined) },
                  on: { click: function () { self.lockConfirm = { scanIdx: i }; } } }, "Lock")
          ]);
        });
        body = h("div", rows);
      } else {
        body = h("div", { staticClass: "mm-empty" }, this.scan.error
          ? "Scan failed: " + this.scan.error
          : "5G SA exposes no neighbour list - only the serving cell is visible without a scan, " +
            "and a scan takes the modem offline for up to ~10 minutes.");
      }
      var foot;
      if (!this.scan.running) {
        foot = this.scanConfirm
          ? h("div", { staticClass: "mm-foot" }, [
              h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } },
                "Scanning takes the modem OFFLINE for up to ~10 minutes. This connection will drop if it runs over cellular."),
              h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
                h("button", { staticClass: "mm-btn", on: { click: function () { self.scanConfirm = false; } } }, "Cancel"),
                h("button", { staticClass: "mm-btn danger",
                  attrs: { disabled: !!self.pending || self.lockBusy },
                  on: { click: function () { self.scanCells(); } } }, "Scan now")
              ])
            ])
          : h("div", { staticClass: "mm-foot" }, [
              h("span", { staticClass: "mm-hint" }, "Find every cell in range, with lockable details."),
              h("button", { staticClass: "mm-btn primary",
                attrs: { disabled: !!this.pending || this.lockBusy },
                on: { click: function () { self.scanConfirm = true; } } }, "Scan for cells")
            ]);
      }
      return h("div", { staticClass: "mm-grp" }, [head, body, foot].filter(Boolean));
    },

    renderLock(h) {
      if (this.lockLoading && !this.lockData)
        return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, "Reading lock state from the modem...")]);
      if (this.lockError && !this.lockData)
        return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, "Couldn't read lock state: " + this.lockError)]);
      if (!this.lockData)
        return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, "...")]);
      var kids = [
        h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, [
          h("span", { staticClass: "mm-sect" }, "Cell lock"),
          h("button", {
            staticClass: "mm-tab", staticStyle: { fontSize: "11.5px", padding: "2px 0", borderBottom: "0" },
            attrs: { disabled: !!this.pending },
            on: { click: this.fetchLock }
          }, this.lockLoading ? "refreshing..." : "refresh")
        ]),
        (this.pending && this.pending.kind === "cell") ? this.renderRevert(h) : null,
        this.lockError && this.lockData
          ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--error)" } }, this.lockError) : null,
        (this.lockData.stale)
          ? h("div", { staticClass: "mm-revert" }, [
              h("div", { staticClass: "mm-revert-row" }, [
                h("span", [
                  "The watchdog reverted a lock, but ", h("b", "GL's stored lock"),
                  " still remembers it - GL may re-apply it later. Clear it to reconcile."
                ]),
                h("button", { staticClass: "mm-btn keep", attrs: { disabled: this.lockBusy },
                  on: { click: this.unlockCell } }, "Clear it")
              ])
            ])
          : null,
        this.renderCurrentCell(h),
        this.renderScanCard(h),
        this.renderRecovery(h)
      ];
      return h("div", { staticClass: "mm-card" }, kids.filter(Boolean));
    },

    renderRecovery(h) {
      return h("div", { staticClass: "mm-grp" }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Recovery"),
          h("span", { staticClass: "mm-hint" }, "read before locking")
        ]),
        h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6" } }, [
          "A kept cell lock lives in the modem's own NV (survives reboot, reflash and factory reset) ",
          "and in GL's store. Every lock made here auto-reverts in 60s unless you keep it, and the ",
          "watchdog fires even if this page is closed. If the router ever becomes unreachable over ",
          "the web, the ssh way back is: ", h("b", "ssh root@<router> /usr/sbin/mudimodem-revert panic"),
          " - it clears the cell lock on both slots (GL's store and the modem), resets lock persistence ",
          "and the network mode to Auto, and turns band filtering off."
        ]),
        h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6", marginTop: "8px", color: "var(--warning-hover)" } }, [
          h("b", "Remote sessions: "),
          "applying a lock briefly re-registers the modem, which can drop a remote (Tailscale / VPN) ",
          "connection to this router for a few seconds. It reconnects on its own - if the request ",
          "seems to hang or fail, wait a moment; the lock likely applied and this page will offer to ",
          "keep or revert it once you're back."
        ])
      ]);
    }
  },

  render(h) {
    var self = this, c = this.serving;

    // ---- status strip ----
    var stripKids;
    if (this.hasData) {
      var rsrpColor = this.qColor(this.rsrpQ);
      stripKids = [
        h("div", { staticClass: "mm-trace" }, [
          h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
            h("span", { staticClass: "mm-eyebrow", style: this.staleFor ? { color: "var(--warning)" } : {}, attrs: {
              title: this.staleFor
                ? "The collector's last sample is " + this.fmtAge(this.staleFor) + " old - nothing newer has been pushed"
                : "Sampled every 10s by the MudiModem collector (pushed live), last " + this.STRIP_MIN + " minutes"
            } }, this.staleFor ? "RSRP · last sample " + this.fmtAge(this.staleFor) + " ago" : "RSRP · last " + this.STRIP_MIN + " min"),
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
              (this.servingCarrier ? "  " + this.servingCarrier : "") +
              (this.activeSlot ? "  SIM " + this.activeSlot : "")),
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
              "The collector has not produced a sample for " + this.fmtAge(this.staleFor) +
              " (modem resetting, or mudimodem-collectd stopped) - these are its last known values, not live readings.")
          : null
      ];
    } else {
      var slot = this.activeSlot;
      stripKids = [h("div", { staticClass: "mm-empty" },
        (slot && this.anyNetwork)
          ? "SIM " + slot + " (active) is not registered on a network right now" +
            (this.servingCarrier ? " - " + this.servingCarrier : "") + "."
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
          this.trackingErr ? "Couldn't load the graph: " + this.trackingErr
            : "Loading the signal graph…")]);
      }
    } else if (this.tab === "at") {
      if (this.consoleComp) {
        panel = h(this.consoleComp, { props: { cell: { slot: this.activeSlot, carrier: this.servingCarrier, modem: this.modemName() } } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.consoleErr ? "Couldn't load the AT console: " + this.consoleErr
            : "Loading the AT console…")]);
      }
    } else if (this.tab === "config") {
      panel = this.renderConfig(h);
    } else if (this.tab === "speedtest") {
      if (this.speedtestComp) {
        panel = h(this.speedtestComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.speedtestErr ? "Couldn't load the speed test: " + this.speedtestErr
            : "Loading the speed test…")]);
      }
    } else if (this.tab === "battery") {
      if (this.batteryComp) {
        panel = h(this.batteryComp, { props: { embedded: true } });
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" },
          this.batteryErr ? "Couldn't load the battery view: " + this.batteryErr
            : "Loading the battery view…")]);
      }
    } else {
      panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" }, "Unknown tab.")]);
    }

    return h("div", { staticClass: "mm" }, [strip, tabs, panel]);
  }
};
