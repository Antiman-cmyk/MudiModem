// MudiModem — Speedtest tab. A hidden /mudimodem-speedtest route, loaded the
// same way as Tracking: eval()'d by GL's SPA (module.exports = {...}), and
// lazy-loaded + embedded by the main page's "Speedtest" tab (props.embedded
// drops the "← Modem" breadcrumb since the tab bar is already visible).
//
// The test itself runs device-side (mudimodemd's speedtest.lua, started
// as a daemon job by mudimodem.run_speedtest because a time-limited download+upload+
// latency test takes ~10-20s -- too long for one $rpcRequest). This page
// polls mudimodem.get_speedtest_status roughly once a second while a test is
// in flight, then refetches history. Results persist in /etc/mudimodem (NOT
// /tmp, unlike the RF-history telemetry) so they survive a normal reboot.
//
// Transport: the 1 Hz status poll is BACKGROUND work, so it goes through
// rpcSilent (a direct $axios POST to /rpc) — $rpcRequest's interceptor pops
// GL's global error banner on any failure before our .catch runs. The
// user-initiated calls (run, schedule save, clear) stay on $rpcRequest.
//
// Vue is runtime-only here too: render(h) only, never template:.
import { hasRpc, rpc, rpcSilent } from "../kit/rpc.js";
import { mdhm } from "../kit/fmt.js";
import { localize } from "../kit/i18n.js";
import { t as T } from "../kit/i18n.js";
import { csv, isoTime, download } from "../kit/csv.js";
export default localize((function () {
  "use strict";

  var IFACES = [["cellular", "Cellular"], ["wired", "Wired WAN"]];
  // The most data one test can move, per profile (mudimodemd/speedtest.lua PROFILES: streams x
  // per-stream cap, down + up; a test is time-limited, so a slower link uses less).
  var PROFILES = [["quick", "Quick", 29], ["full", "Thorough", 288]];   // not "Full": the battery tab's "Full" is "charged"
  function profileMB(id) {
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i][0] === id) return PROFILES[i][2];
    return PROFILES[0][2];
  }
  var INTERVALS = [[1800, "30 min"], [3600, "1 hour"], [7200, "2 hours"],
    [21600, "6 hours"], [43200, "12 hours"], [86400, "24 hours"]];
  var PHASE_TEXT = { starting: "Starting…", download: "Testing download…", upload: "Testing upload…",
    latency: "Testing latency…" };
  function ifaceLabel(id) {
    for (var i = 0; i < IFACES.length; i++) if (IFACES[i][0] === id) return IFACES[i][1];
    return "—";
  }
  // The PRIMARY carrier's RAT for a result's radio snapshot — "LTE" for an
  // NSA anchor, while `mode` is the cell's (NR5G-NSA). New results carry
  // pcc_rat; older ones fall back to signals[0].rat, then mode.
  function carrierRat(r) {
    var sig = Array.isArray(r.signals) && r.signals[0];
    return r.pcc_rat || (sig && sig.rat) || r.mode || "";
  }
  // Shared label+value rows for a result record `r` -- used by both the
  // graph's hover tooltip and the latest-result panel, so the field list and
  // formatting (units, band prefix, — for null) live in exactly one place.
  // The carrier's max bit rate (AMBR) recorded with a cellular result, and whether the result
  // reached it (>= 90%): then the number measured the plan, not the radio. null when unknown.
  function capRow(r) {
    if (r.ambr_dl == null && r.ambr_ul == null) return null;
    var v = T("{dl} / {ul} Mbps", { dl: r.ambr_dl == null ? "—" : r.ambr_dl, ul: r.ambr_ul == null ? "—" : r.ambr_ul });
    var at = [];
    if (r.ambr_dl && r.down_mbps != null && r.down_mbps >= 0.9 * r.ambr_dl) at.push(T("download at the cap"));
    if (r.ambr_ul && r.up_mbps != null && r.up_mbps >= 0.9 * r.ambr_ul) at.push(T("upload at the cap"));
    return ["Carrier cap", at.length ? v + " · " + at.join(", ") : v];
  }
  // What the test cost and how it ran (3.0 results; older ones have neither field).
  function testRow(r) {
    if (r.data_mb == null && r.profile == null) return null;
    var name = null;
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i][0] === r.profile) name = T(PROFILES[i][1]);
    var bits = [];
    if (r.data_mb != null) bits.push(T("{n} MB", { n: r.data_mb }));
    if (name) bits.push(r.streams ? T("{name}, {n} streams", { name: name, n: r.streams }) : name);
    if (r.server === "librespeed") bits.push("LibreSpeed");
    return ["Test", bits.join(" · ")];
  }
  function resultDetailRows(r) {
    var cap = capRow(r), tr = testRow(r);
    return [
      ["Latency", r.latency_ms == null ? "—" : r.latency_ms + " ms (±" + (r.jitter_ms == null ? "—" : r.jitter_ms) + ")"]
    ].concat(cap ? [cap] : []).concat(tr ? [tr] : []).concat([
      ["Carrier", (r.carrier || "—") + " · SIM " + (r.slot == null ? "—" : r.slot)],
      // The prefix follows the carrier: an EN-DC anchor on B2 is "B2", not "n2".
      ["Band", r.band == null ? "—" : (/NR5G/.test(carrierRat(r)) ? "n" : "B") + r.band],
      ["Cell", r.cell_id == null ? "—" : r.cell_id],
      ["RSRP", r.rsrp == null ? "—" : r.rsrp + " dBm"],
      ["SINR", r.sinr == null ? "—" : r.sinr + " dB"],
      ["RSRQ", r.rsrq == null ? "—" : r.rsrq + " dB"]
    ]);
  }

  var component = {
    name: "mudimodem-speedtest",
    props: { embedded: { type: Boolean, default: false } },

    data: function () {
      return {
        styleId: "mms-css",
        results: [], resultsLoading: true, resultsErr: "",
        ifaces: null, ifacesErr: "",
        runIface: "cellular",
        filterIface: "cellular",
        // "all" or a slot number as a string: cellular results from two SIMs
        // are two radios, so the graph can show one SIM at a time.
        filterSlot: "all",
        status: { running: false },
        lastResult: null,
        statusPoll: null,
        schedule: null, scheduleErr: "", scheduleSaving: false,
        // {profile, server, librespeed_url} (get_speedtest_settings); urlDraft = the URL being typed
        settings: null, settingsErr: "", settingsSaving: false, urlDraft: null,
        cursor: null, pinned: null, width: 900,
        clearArmed: false, clearTimer: null   // "Clear history" asks twice: it deletes up to 500 results
      };
    },

    computed: {
      // Distinct SIM slots among the cellular results, in first-seen order.
      // Wired results have no radio (older ones may still carry a snapshot of
      // the cellular link — irrelevant to the wired test), so never for wired.
      slotsShown: function () {
        if (this.filterIface !== "cellular") return [];
        var seen = [];
        this.results.forEach(function (r) {
          if (r.iface !== "cellular" || r.slot == null) return;
          var k = String(r.slot);
          if (seen.indexOf(k) === -1) seen.push(k);
        });
        return seen;
      },
      // The slot filter in force: a slot that has no results (any more) falls
      // back to "all" rather than hiding everything behind a vanished control.
      slotFilter: function () {
        return (this.filterSlot !== "all" && this.slotsShown.indexOf(this.filterSlot) !== -1)
          ? this.filterSlot : "all";
      },
      filtered: function () {
        var f = this.filterIface, sf = (f === "cellular") ? this.slotFilter : "all";
        return this.results.filter(function (r) {
          return r.iface === f && (sf === "all" || String(r.slot) === sf);
        });
      }
    },

    created: function () { this.injectStyle(); },
    mounted: function () {
      var self = this;
      if (typeof window === "undefined") return;
      this.measure();
      this._onResize = function () { self.measure(); };
      window.addEventListener("resize", this._onResize);
      this.fetchInterfaces();
      this.fetchHistory();
      this.fetchSchedule();
      this.fetchSettings();
      this.fetchStatus(true);
    },
    // Torn down (a tab switch destroys us): every async continuation checks
    // _dead first, so a reply landing afterwards can't start an orphan 1 Hz
    // poll that would run until the test ends.
    beforeDestroy: function () {
      this._dead = true;
      if (this.clearTimer) clearTimeout(this.clearTimer);
      if (this.statusPoll) clearInterval(this.statusPoll);
      this.statusPoll = null;
      if (typeof window !== "undefined" && this._onResize) window.removeEventListener("resize", this._onResize);
    },

    methods: {
      measure: function () {
        if (this.$refs && this.$refs.graph && this.$refs.graph.clientWidth)
          this.width = this.$refs.graph.clientWidth;
      },
      // User-initiated one-shots: a failure there is real, GL's banner is fine.
      rpc: function (method, params) {
        if (!hasRpc()) return Promise.reject(new Error("RPC unavailable"));
        return rpc(method, params || {});
      },
      // Background calls: POST to /rpc via $axios DIRECTLY. Resolves the
      // result, or null on ANY failure (it never rejects) — the caller treats
      // null as "try again next tick".
      rpcSilent: function (method, params, timeout) { return rpcSilent(method, params, timeout || 8000); },
      fetchInterfaces: function () {
        var self = this;
        this.rpc("get_speedtest_interfaces", {})
          .then(function (r) { if (self._dead) return; self.ifaces = r; self.ifacesErr = ""; })
          .catch(function (e) {
            if (self._dead) return;
            self.ifacesErr = (e && (e.message || e.type)) || "could not check interfaces";
          });
      },
      fetchHistory: function () {
        var self = this;
        this.resultsLoading = true;
        this.rpc("get_speedtest_history", {})
          .then(function (r) {
            if (self._dead) return;
            self.results = (r && r.results) || [];
            self.resultsErr = ""; self.resultsLoading = false;
            // Show the newest stored result until a new test lands, instead of an empty panel.
            if (!self.lastResult && self.results.length) {
              self.lastResult = self.results.reduce(function (a, b) { return (b.t || 0) > (a.t || 0) ? b : a; });
            }
          })
          .catch(function (e) {
            if (self._dead) return;
            self.resultsErr = (e && (e.message || e.type)) || "could not load history";
            self.resultsLoading = false;
          });
      },
      fetchSchedule: function () {
        var self = this;
        return this.rpc("get_speedtest_schedule", {})
          .then(function (r) { if (!self._dead) self.schedule = r; })
          .catch(function () { /* leave schedule null -> honest "unavailable" */ });
      },
      // Status poll — background, so SILENT. One request in flight at most:
      // on a slow link a 1 Hz interval would otherwise stack them up.
      fetchStatus: function (startPollIfRunning) {
        var self = this;
        if (this._statusInFlight) return Promise.resolve();
        this._statusInFlight = true;
        return this.rpcSilent("get_speedtest_status", {})
          .then(function (r) {
            self._statusInFlight = false;
            if (self._dead || !r) return;       // torn down / transient: the next tick tries again
            self.applyStatus(r, startPollIfRunning);
          });
      },
      applyStatus: function (r, startPollIfRunning) {
        var polling = !!this.statusPoll;
        // phase "error" is terminal whatever `running` says (the backend
        // reports a dead/abandoned run as running:false, phase:"error", and
        // may not carry a message).
        if (r.running && r.phase !== "error") {
          this.status = r;
          if (startPollIfRunning) this.startPoll();
          return;
        }
        if (r.phase === "error")
          r = { running: false, phase: "error", iface: r.iface,
            message: r.message || "the speed test stopped without a result" };
        this.status = r;
        if (polling) {
          if (r.phase === "done" && r.result) this.lastResult = r.result;
          this.stopPollAndRefresh();
        }
      },
      startPoll: function () {
        var self = this;
        if (this.statusPoll || this._dead) return;
        this.statusPoll = setInterval(function () { self.fetchStatus(false); }, 1000);
      },
      stopPollAndRefresh: function () {
        clearInterval(this.statusPoll);
        this.statusPoll = null;
        this.fetchHistory();
      },
      runTest: function () {
        var self = this;
        if (this.status.running) return;
        this.status = { running: true, phase: "download", iface: this.runIface };
        return this.rpc("run_speedtest", { iface: this.runIface })
          .then(function (r) {
            if (self._dead) return;
            if (r && r.error === "iface_down") {
              self.status = { running: false, phase: "error",
                message: T("{name} is not connected", { name: T(self.runIface === "cellular" ? "Cellular" : "Wired WAN") }) };
              return;
            }
            if (r && r.error) { self.status = { running: false, phase: "error", message: r.error }; return; }
            self.startPoll();
          })
          .catch(function (e) {
            if (self._dead) return;
            self.status = { running: false, phase: "error", message: (e && (e.message || e.type)) || "could not start" };
          });
      },
      // Resolves once the save AND the re-read have settled, so the caller can
      // put its control back to whatever this.schedule now says.
      fetchSettings: function () {
        var self = this;
        return this.rpc("get_speedtest_settings", {})
          .then(function (r) { if (!self._dead && r && !r.error) self.settings = r; })
          .catch(function () { /* leave null: the controls stay hidden, the router's defaults apply */ });
      },
      // Save a change to the test size or server; the reply is what the router now holds.
      saveSettings: function (patch) {
        var self = this;
        if (!this.settings) return Promise.resolve();
        var next = Object.assign({}, this.settings, patch);
        this.settingsSaving = true; this.settingsErr = "";
        return this.rpc("set_speedtest_settings", { profile: next.profile, server: next.server,
                                                    librespeed_url: next.librespeed_url || "" })
          .then(function (r) {
            if (self._dead) return;
            self.settingsSaving = false;
            if (!r || r.error) { self.settingsErr = (r && r.error) || "could not save"; return; }
            self.settings = { profile: r.profile, server: r.server, librespeed_url: r.librespeed_url || "" };
            self.urlDraft = null;
          })
          .catch(function (e) {
            if (self._dead) return;
            self.settingsSaving = false;
            self.settingsErr = (e && (e.message || e.type)) || "could not save";
          });
      },
      setSchedule: function (enabled, intervalSeconds) {
        var self = this;
        this.scheduleSaving = true; this.scheduleErr = "";
        return this.rpc("set_speedtest_schedule", { enabled: enabled, interval_seconds: intervalSeconds })
          .then(function (r) {
            if (self._dead) return;
            self.scheduleSaving = false;
            // A resolved {error} is a refusal, not a save.
            if (r && r.error) { self.scheduleErr = String(r.error); return; }
            if (r && typeof r.enabled === "boolean")
              self.schedule = Object.assign({}, self.schedule, { enabled: r.enabled,
                interval_seconds: r.interval_seconds != null ? r.interval_seconds : intervalSeconds });
            return self.fetchSchedule();
          })
          .catch(function (e) {
            if (self._dead) return;
            self.scheduleSaving = false;
            self.scheduleErr = (e && (e.message || e.type)) || "could not save schedule";
          });
      },
      // Vue patches `checked`/`value` only when the BOUND value changes, so a
      // refused save would leave the box ticked (or the interval moved) while
      // the schedule is not. Force the DOM control back to the real state.
      syncScheduleControl: function (el, prop) {
        if (!el || !this.schedule) return;
        if (prop === "checked") el.checked = !!this.schedule.enabled;
        else el.value = String(this.schedule.interval_seconds);
      },
      armClear: function () {
        var self = this;
        if (this.clearArmed) { this.clearArmed = false; clearTimeout(this.clearTimer); this.clearHistory(); return; }
        this.clearArmed = true;
        this.clearTimer = setTimeout(function () { self.clearArmed = false; }, 5000);
      },
      // The results the history shows (interface + SIM filter), one row each.
      exportResults: function () {
        var col = function (k) { return function (r) { return r[k]; }; };
        var text = csv(this.filtered, [
          ["time_utc", function (r) { return isoTime(r.t); }], ["t_ms", col("t")], ["interface", col("iface")],
          ["trigger", col("trigger")], ["down_mbps", col("down_mbps")], ["up_mbps", col("up_mbps")],
          ["latency_ms", col("latency_ms")], ["jitter_ms", col("jitter_ms")], ["data_mb", col("data_mb")],
          ["profile", col("profile")], ["streams", col("streams")], ["server", col("server")],
          ["measure_down", col("measure_down")], ["measure_up", col("measure_up")],
          ["sim", col("slot")], ["carrier", col("carrier")], ["mode", col("mode")], ["band", col("band")],
          ["pci", col("pci")], ["rsrp_dbm", col("rsrp")], ["sinr_db", col("sinr")], ["rsrq_db", col("rsrq")],
          ["ambr_dl_mbps", col("ambr_dl")], ["ambr_ul_mbps", col("ambr_ul")]]);
        return download("mudimodem-speedtests-" + isoTime(Date.now()).slice(0, 10).replace(/-/g, "") + ".csv", text);
      },
      clearHistory: function () {
        var self = this;
        this.rpc("clear_speedtest_history", {})
          .then(function () { if (!self._dead) self.results = []; })
          .catch(function () { /* $rpcRequest already reported it */ });
      },
      clock: function (t) { return mdhm(t); },

      // ---- render ----
      renderControls: function (h) {
        var self = this;
        var ifaceSel = h("select", {
          domProps: { value: this.runIface },
          attrs: { disabled: this.status.running },
          on: { change: function (ev) { self.runIface = ev.target.value; } }
        }, IFACES.map(function (i) {
          var down = self.ifaces && self.ifaces[i[0]] && !self.ifaces[i[0]].up;
          return h("option", { attrs: { value: i[0] }, key: i[0] }, down ? T("{name} (not connected)", { name: T(i[1]) }) : i[1]);
        }));
        var runBtn = h("button", {
          staticClass: "mms-btn primary",
          attrs: { disabled: this.status.running },
          on: { click: function () { self.runTest(); } }
        }, this.status.running ? (PHASE_TEXT[this.status.phase] || "Testing…") : "Run speed test");
        // Test size: quick (2 streams, a few seconds) or full (4 streams, longer; more accurate on
        // fast links, more data). Saved on the router: scheduled tests use it too.
        var sizeSel = this.settings ? h("select", {
          domProps: { value: this.settings.profile },
          attrs: { disabled: this.status.running || this.settingsSaving, title: T("Test size") },
          on: { change: function (ev) { var el = ev.target; self.saveSettings({ profile: el.value })
            .then(function () { if (self.settings) el.value = self.settings.profile; }); } }
        }, PROFILES.map(function (p) {
          return h("option", { attrs: { value: p[0] }, key: p[0] }, T("{name} (up to {mb} MB)", { name: T(p[1]), mb: p[2] }));
        })) : null;
        var err = (!this.status.running && this.status.phase === "error")
          ? h("span", { staticClass: "mms-err" }, this.status.message) : null;
        var ifaceErr = this.ifacesErr
          ? h("span", { staticClass: "mms-err" }, T("Couldn't check interfaces: {err}", { err: this.ifacesErr })) : null;
        return h("div", { staticClass: "mms-controls" }, [ifaceSel, sizeSel, runBtn, err, ifaceErr].filter(Boolean));
      },
      // Where the test runs against: Cloudflare (default) or the user's own LibreSpeed server, for
      // regions where Cloudflare's speed endpoints are slow or blocked.
      renderServer: function (h) {
        var self = this, st = this.settings;
        if (!st) return null;
        var lib = st.server === "librespeed" || this.urlDraft != null;
        var sel = h("select", {
          domProps: { value: lib ? "librespeed" : "cloudflare" },
          attrs: { disabled: this.status.running || this.settingsSaving },
          on: { change: function (ev) {
            if (ev.target.value === "librespeed") { self.urlDraft = st.librespeed_url || ""; return; }
            self.urlDraft = null;
            if (st.server !== "cloudflare") self.saveSettings({ server: "cloudflare" });
          } }
        }, [h("option", { attrs: { value: "cloudflare" } }, "Cloudflare"),
            h("option", { attrs: { value: "librespeed" } }, "LibreSpeed (your server)")]);
        var kids = [h("span", "Test server"), sel];
        if (lib) {
          var val = this.urlDraft != null ? this.urlDraft : st.librespeed_url;
          kids.push(h("input", { staticClass: "mms-url",
            attrs: { type: "text", placeholder: "https://speed.example.com/backend/", spellcheck: "false",
                     disabled: this.status.running || this.settingsSaving },
            domProps: { value: val },
            on: { input: function (ev) { self.urlDraft = ev.target.value; } } }));
          kids.push(h("button", { staticClass: "mms-btn",
            attrs: { disabled: this.status.running || this.settingsSaving || !String(val || "").trim() ||
                     (this.urlDraft == null && st.server === "librespeed") },
            on: { click: function () { self.saveSettings({ server: "librespeed", librespeed_url: String(val).trim() }); } }
          }, "Save"));
        }
        if (this.settingsErr)
          kids.push(h("span", { staticClass: "mms-err" }, T("Couldn't save: {err}", { err: T(this.settingsErr) })));
        return h("div", { staticClass: "mms-server" }, kids);
      },
      renderSchedule: function (h) {
        var self = this;
        if (!this.schedule) return null;
        var toggle = h("label", { staticClass: "mms-sched-toggle" }, [
          h("input", {
            attrs: { type: "checkbox", checked: this.schedule.enabled, disabled: this.scheduleSaving },
            domProps: { checked: this.schedule.enabled },
            on: { change: function (ev) {
              var el = ev.target;
              self.setSchedule(el.checked, self.schedule.interval_seconds)
                .then(function () { self.syncScheduleControl(el, "checked"); });
            } }
          }),
          "Automatic background tests"
        ]);
        var sel = h("select", {
          attrs: { disabled: !this.schedule.enabled || this.scheduleSaving },
          domProps: { value: this.schedule.interval_seconds },
          on: { change: function (ev) {
            var el = ev.target;
            self.setSchedule(self.schedule.enabled, parseInt(el.value, 10))
              .then(function () { self.syncScheduleControl(el, "value"); });
          } }
        }, INTERVALS.map(function (iv) { return h("option", { attrs: { value: iv[0] }, key: iv[0] }, T("Every {n}", { n: T(iv[1]) })); }));
        var err = this.scheduleErr
          ? h("span", { staticClass: "mms-err" }, T("Couldn't save the schedule: {err}", { err: this.scheduleErr })) : null;
        // Every automatic test spends real data on the SIM: say how much before it is switched on.
        var mb = profileMB(this.settings && this.settings.profile);
        var perDay = (86400 / (this.schedule.interval_seconds || 21600)) * mb;
        var cost = h("span", { staticClass: "mms-hint" }, T("Each test uses up to {mb} MB of data — up to {day} a day at this interval.", {
          mb: mb, day: perDay >= 1000 ? T("{n} GB", { n: (perDay / 1000).toFixed(1) }) : T("{n} MB", { n: Math.round(perDay) }) }));
        return h("div", { staticClass: "mms-sched" }, [toggle, sel, err, cost].filter(Boolean));
      },
      renderLatestResult: function (h) {
        if (!this.lastResult) return null;
        var r = this.lastResult;
        var big = h("div", { staticClass: "mms-latest-big" }, [
          h("div", { staticClass: "mms-latest-metric" }, [
            h("span", { staticClass: "v", style: { color: "var(--primary)" } }, r.down_mbps == null ? "—" : String(r.down_mbps)),
            h("span", { staticClass: "u" }, "Mbps down")
          ]),
          h("div", { staticClass: "mms-latest-metric" }, [
            h("span", { staticClass: "v", style: { color: "var(--success)" } }, r.up_mbps == null ? "—" : String(r.up_mbps)),
            h("span", { staticClass: "u" }, "Mbps up")
          ]),
          h("div", { staticClass: "mms-latest-metric" }, [
            h("span", { staticClass: "v" }, r.latency_ms == null ? "—" : String(r.latency_ms)),
            h("span", { staticClass: "u" }, "ms latency")
          ])
        ]);
        var rows = resultDetailRows(r);
        return h("div", { staticClass: "mms-card" }, [
          h("div", { staticClass: "mms-latest-head" }, [
            h("span", { staticClass: "mms-title" }, "Latest result"),
            h("span", { staticClass: "mms-latest-when" }, T(ifaceLabel(r.iface)) + " · " + this.clock(r.t))
          ]),
          big,
          h("div", {}, rows.map(function (row) {
            return h("div", { staticClass: "mms-tip-row" }, [h("span", row[0]), h("b", row[1])]);
          }))
        ]);
      },
      renderGraph: function (h) {
        var self = this, results = this.filtered;
        if (this.resultsLoading) return h("div", { staticClass: "mms-empty" }, "Loading history…");
        if (this.resultsErr) return h("div", { staticClass: "mms-empty" }, T("Couldn't load history: {err}", { err: this.resultsErr }));
        if (!results.length) return h("div", { staticClass: "mms-empty" },
          "No results yet for this interface. Run a speed test above.");

        var W = this.width, PADL = 34, PADR = 12, PLOT_H = 160, LAT_H = 40, GAP = 14;
        var plotTop = 18, plotBot = plotTop + PLOT_H;      // the legend sits above the plot
        var latTop = plotBot + GAP, latBot = latTop + LAT_H;
        var n = results.length;
        var xOf = function (i) { return n <= 1 ? PADL : PADL + i / (n - 1) * (W - PADL - PADR); };

        var maxMbps = 1;
        results.forEach(function (r) {
          if (r.down_mbps > maxMbps) maxMbps = r.down_mbps;
          if (r.up_mbps > maxMbps) maxMbps = r.up_mbps;
        });
        var yMax = maxMbps * 1.15;
        var yOf = function (v) { return plotBot - (Math.max(0, v || 0) / yMax) * PLOT_H; };
        var maxLatency = 1;
        results.forEach(function (r) { if (r.latency_ms > maxLatency) maxLatency = r.latency_ms; });
        var latYOf = function (v) { return latBot - (Math.max(0, v || 0) / (maxLatency * 1.15)) * LAT_H; };
        // Cellular results from two SIMs are two radios: every line breaks at a
        // SIM change (never one series across SIM1 -> SIM2), and each SIM's
        // stretch is labelled. Wired results have no SIM.
        var cellular = this.filterIface === "cellular";
        var slotOf = function (r) { return cellular ? (r.slot == null ? "?" : String(r.slot)) : ""; };
        var multiSim = false;
        for (var si = 1; si < n; si++) if (slotOf(results[si]) !== slotOf(results[0])) { multiSim = true; break; }

        var kids = [];
        kids.push(h("rect", { attrs: { x: PADL, y: 5, width: 10, height: 3, fill: "var(--primary)" } }));
        kids.push(h("text", { attrs: { x: PADL + 14, y: 10, "font-size": 9.5, fill: "var(--text-badge)" } }, "Download"));
        kids.push(h("rect", { attrs: { x: PADL + 78, y: 5, width: 10, height: 3, fill: "var(--success)" } }));
        kids.push(h("text", { attrs: { x: PADL + 92, y: 10, "font-size": 9.5, fill: "var(--text-badge)" } }, "Upload"));

        [plotTop, plotBot].forEach(function (yy) {
          kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yy, y2: yy,
            stroke: "var(--divider)", "stroke-width": 1 } }));
        });
        // Scale: the plot's top value and 0 (Mbps), so a glance reads magnitudes, not shapes.
        var axis = function (y, txt) {
          kids.push(h("text", { attrs: { x: PADL - 4, y: y, "text-anchor": "end", "font-size": 9,
            fill: "var(--text-badge)", "font-family": "ui-monospace,monospace" } }, txt));
        };
        axis(plotTop + 4, String(Math.round(yMax)));
        axis(plotTop + 14, "Mbps");
        axis(plotBot, "0");

        // SIM-change boundaries: a dashed divider between the two results and
        // a "SIM n · carrier" label at the start of each stretch.
        if (multiSim) {
          results.forEach(function (r, i) {
            if (i > 0 && slotOf(r) === slotOf(results[i - 1])) return;
            if (i > 0) {
              var bx = (xOf(i - 1) + xOf(i)) / 2;
              kids.push(h("line", { attrs: { x1: bx.toFixed(1), x2: bx.toFixed(1), y1: plotTop, y2: latBot,
                stroke: "var(--divider)", "stroke-width": 1, "stroke-dasharray": "3 3" } }));
            }
            kids.push(h("text", { staticClass: "mms-sim", attrs: { x: (xOf(i) + (i > 0 ? 4 : 0)).toFixed(1), y: plotTop + 10,
              "font-size": 9.5, fill: "var(--text-badge)" } },
              "SIM " + slotOf(r) + (r.carrier ? " · " + r.carrier : "")));
          });
        }

        function linePath(key, color) {
          var d = "", pen = false, prevSlot = null;
          results.forEach(function (r, i) {
            var v = r[key];
            if (prevSlot !== null && slotOf(r) !== prevSlot) pen = false;
            prevSlot = slotOf(r);
            if (v == null) { pen = false; return; }
            d += (pen ? "L" : "M") + xOf(i).toFixed(1) + " " + yOf(v).toFixed(1) + " ";
            pen = true;
          });
          return d ? h("path", { attrs: { fill: "none", stroke: color, "stroke-width": 1.75, d: d.trim() } }) : null;
        }
        var downLine = linePath("down_mbps", "var(--primary)");
        var upLine = linePath("up_mbps", "var(--success)");
        if (downLine) kids.push(downLine);
        if (upLine) kids.push(upLine);
        results.forEach(function (r, i) {
          if (r.down_mbps != null) {
            kids.push(h("circle", { attrs: { cx: xOf(i).toFixed(1), cy: yOf(r.down_mbps).toFixed(1), r: 2.5, fill: "var(--primary)" } }));
          }
          if (r.up_mbps != null) {
            kids.push(h("circle", { attrs: { cx: xOf(i).toFixed(1), cy: yOf(r.up_mbps).toFixed(1), r: 2.5, fill: "var(--success)" } }));
          }
        });

        kids.push(h("text", { attrs: { x: 4, y: latTop + LAT_H / 2 + 3, "font-size": 9, fill: "var(--text-badge)" } }, "MS"));
        kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: latBot, y2: latBot,
          stroke: "var(--divider)", "stroke-width": 1 } }));
        axis(latTop + 4, String(Math.round(maxLatency * 1.15)));
        var latD = "", penL = false, prevSlotL = null;
        results.forEach(function (r, i) {
          if (prevSlotL !== null && slotOf(r) !== prevSlotL) penL = false;
          prevSlotL = slotOf(r);
          if (r.latency_ms == null) { penL = false; return; }
          latD += (penL ? "L" : "M") + xOf(i).toFixed(1) + " " + latYOf(r.latency_ms).toFixed(1) + " ";
          penL = true;
        });
        if (latD) kids.push(h("path", { attrs: { fill: "none", stroke: "var(--warning)", "stroke-width": 1.5, d: latD.trim() } }));

        if (this.cursor != null && results[this.cursor]) {
          var cx = xOf(this.cursor);
          kids.push(h("line", { attrs: { x1: cx.toFixed(1), x2: cx.toFixed(1), y1: plotTop, y2: latBot,
            stroke: this.pinned != null ? "var(--primary)" : "var(--text-weak)", "stroke-width": 1 } }));
        }

        // When: the first and the last result's date (results are evenly spaced, not by time).
        var dateY = latBot + 13;
        kids.push(h("text", { attrs: { x: PADL, y: dateY, "font-size": 9, fill: "var(--text-badge)",
          "font-family": "ui-monospace,monospace" } }, this.clock(results[0].t)));
        if (n > 1) kids.push(h("text", { attrs: { x: W - PADR, y: dateY, "text-anchor": "end", "font-size": 9,
          fill: "var(--text-badge)", "font-family": "ui-monospace,monospace" } }, this.clock(results[n - 1].t)));

        var svg = h("svg", { ref: "svg", attrs: { viewBox: "0 0 " + W + " " + (dateY + 4),
          width: W, height: dateY + 4, preserveAspectRatio: "none" } }, kids);

        var nearestIdx = function (evX) {
          if (n <= 1) return 0;
          var idx = Math.round((evX - PADL) / (W - PADL - PADR) * (n - 1));
          return Math.max(0, Math.min(n - 1, idx));
        };
        var onMove = function (e) {
          if (self.pinned != null) return;
          var el = self.$refs && self.$refs.graph;
          if (!el || !el.getBoundingClientRect) { self.cursor = results.length - 1; return; }
          var rect = el.getBoundingClientRect();
          if (!rect.width) { self.cursor = results.length - 1; return; }
          var ux = ((e.clientX || 0) - rect.left) * self.width / rect.width;
          self.cursor = nearestIdx(ux);
        };
        var onLeave = function () { if (self.pinned == null) self.cursor = null; };
        var onClick = function (e) {
          if (self.pinned != null) { self.pinned = null; return; }
          onMove(e);
          if (self.cursor == null) self.cursor = results.length - 1;
          self.pinned = self.cursor;
        };

        var tip = null;
        if (this.cursor != null && results[this.cursor]) {
          var r = results[this.cursor];
          var rows = [
            ["Down", r.down_mbps == null ? "—" : r.down_mbps + " Mbps"],
            ["Up", r.up_mbps == null ? "—" : r.up_mbps + " Mbps"]
          ].concat(resultDetailRows(r));
          tip = h("div", { staticClass: "mms-tip" }, [
            h("div", { staticClass: "t" }, this.clock(r.t) + (this.pinned != null ? " · " + T("pinned") : ""))
          ].concat(rows.map(function (row) {
            return h("div", { staticClass: "mms-tip-row" }, [h("span", row[0]), h("b", row[1])]);
          })));
        }

        return h("div", { ref: "graph", staticClass: "mms-graph",
          on: { mousemove: onMove, mouseleave: onLeave, click: onClick } }, [svg, tip]);
      },
      injectStyle: function () {
        if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
        var css =
          '.mms{color:var(--text-regular)}' +
          '.mms-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:12px 14px;margin-bottom:11px}' +
          '.mms-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}' +
          '.mms-crumb{background:none;border:0;font:inherit;font-size:12px;color:var(--primary);cursor:pointer;padding:0}' +
          '.mms-title{font-size:14px;font-weight:600;color:var(--text-title)}' +
          '.mms-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
          '.mms-btn{font-size:12px;font-weight:600;border-radius:3px;padding:7px 14px;cursor:pointer;font-family:inherit;border:1px solid var(--border);background:var(--background-card);color:var(--text-regular)}' +
          '.mms-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}' +
          '.mms-btn.danger{color:var(--error);border-color:var(--error)}' +
          '.mms-hint{font-size:11.5px;color:var(--text-weak);flex-basis:100%}' +
          '.mms-btn:disabled{opacity:.6;cursor:default}' +
          '.mms-err{color:var(--error);font-size:12px}' +
          '.mms-sched{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px;font-size:12px}' +
          '.mms-sched-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}' +
          '.mms-server{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px;font-size:12px}' +
          '.mms-url{flex:1 1 220px;min-width:0;font:inherit;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular)}' +
          '.mms-empty{padding:24px 0;text-align:center;color:var(--text-hint);font-size:12.5px}' +
          '.mms-graph{position:relative;cursor:crosshair}.mms-graph svg{display:block;width:100%}' +
          '.mms-tip{position:absolute;top:8px;left:8px;pointer-events:none;z-index:5;background:var(--background-card);border:1px solid var(--border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:8px 10px;min-width:170px}' +
          '.mms-tip .t{font-size:10.5px;color:var(--text-badge);margin-bottom:5px}' +
          '.mms-tip-row{display:flex;justify-content:space-between;gap:14px;font-size:11.5px;padding:1px 0}' +
          '.mms-tip-row b{font-weight:600;color:var(--text-title)}' +
          '.mms-latest-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}' +
          '.mms-latest-when{font-size:11px;color:var(--text-badge)}' +
          '.mms-latest-big{display:flex;gap:22px;margin-bottom:10px;flex-wrap:wrap}' +
          '.mms-latest-metric{display:flex;flex-direction:column}' +
          '.mms-latest-metric .v{font-size:22px;font-weight:700;color:var(--text-title);line-height:1.15}' +
          '.mms-latest-metric .u{font-size:10.5px;color:var(--text-badge)}';
        var el = document.createElement("style");
        el.id = this.styleId; el.textContent = css;
        document.head.appendChild(el);
      },
      renderPage: function (h) {
        var self = this;
        var head = h("div", { staticClass: "mms-head" }, [
          this.embedded ? null : h("button", { staticClass: "mms-crumb", on: { click: function () {
            if (self.$router) self.$router.push("/mudimodem"); } } }, "← Modem"),
          h("span", { staticClass: "mms-title" }, "Speedtest")
        ].filter(Boolean));
        var ifaceFilterSel = h("select", {
          domProps: { value: this.filterIface },
          on: { change: function (ev) { self.filterIface = ev.target.value; } }
        }, IFACES.map(function (i) { return h("option", { attrs: { value: i[0] }, key: i[0] }, i[1]); }));
        // Only when the cellular history actually spans more than one SIM.
        var slotSel = null;
        if (this.slotsShown.length > 1) {
          var carrierOf = function (slot) {
            for (var i = self.results.length - 1; i >= 0; i--) {
              var r = self.results[i];
              if (r.iface === "cellular" && String(r.slot) === slot && r.carrier) return r.carrier;
            }
            return "";
          };
          slotSel = h("select", {
            staticClass: "mms-slotsel",
            domProps: { value: this.slotFilter },
            on: { change: function (ev) { self.filterSlot = ev.target.value; self.cursor = null; self.pinned = null; } }
          }, [h("option", { attrs: { value: "all" }, key: "all" }, "All SIMs")].concat(
            this.slotsShown.map(function (sl) {
              var c = carrierOf(sl);
              return h("option", { attrs: { value: sl }, key: sl }, "SIM " + sl + (c ? " · " + c : ""));
            })));
        }
        return h("div", { staticClass: "mms" }, [
          h("div", { staticClass: "mms-card" }, [head, this.renderControls(h), this.renderServer(h), this.renderSchedule(h)].filter(Boolean)),
          this.renderLatestResult(h),
          h("div", { staticClass: "mms-card" }, [
            h("div", { staticClass: "mms-controls" }, [
              h("span", "History"), ifaceFilterSel, slotSel,
              this.filtered.length ? h("button", { staticClass: "mms-btn", attrs: { title: "Download these results as CSV" },
                on: { click: function () { self.exportResults(); } } }, "CSV") : null,
              h("button", { staticClass: "mms-btn" + (self.clearArmed ? " danger" : ""),
                on: { click: function () { self.armClear(); } } },
                self.clearArmed ? "Click again to delete all results" : "Clear history")
            ].filter(Boolean)),
            this.renderGraph(h)
          ])
        ]);
      }
    },

    render: function (h) { return this.renderPage(h); }
  };
  return component;
})());
