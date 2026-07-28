// MudiModem — Battery tab. Four-lane battery history + the charge-limit form.
//
// Loaded by the main chunk via eval(): the file is ONE expression whose value is
// the component. Vue is runtime-only -> render(h) only, never template:.
//
// History comes from mudimodem-collectd (20 s sysfs samples), read via a SILENT
// POST to /rpc (window.$axios directly, NOT $rpcRequest) so a failed background
// poll can't trigger GL's global "Unknown error" banner. The charge-limit form
// is user-initiated, so it DOES use $rpcRequest — a banner there is real.
//
// ⚠️ Units arrive already converted by the collector: `cur` is mA (signed;
// 0 = charging blocked), `volt` is mV, `temp` is °C, `cap` is the RAW GAUGE %.
// GL's "GUI %" is a linear re-fit of the gauge; we convert at render using the
// constants get_battlimit serves, so the formula lives in exactly one place.
//
// Times are the box clock (os.time()*1000). We render relative to a skew-
// corrected box-now so the axis doesn't jump if the browser clock differs.
module.exports = (function () {
  "use strict";

  // Four lanes stacked on ONE shared x-axis — deliberately NOT the Tracking
  // chunk's normalized overlay. Normalizing would destroy the single value the
  // whole feature exists to show: `cur == 0` must read as ZERO, not as "low".
  // Each lane keeps real units and its own y-domain; `h` is its pixel height.
  var LANES = [
    { key: "capGui", label: "Charge · %",        unit: "%",  h: 96, dec: 0,
      color: "var(--primary)",    fixed: [0, 100] },
    { key: "cur",    label: "Current · mA",      unit: "mA", h: 64, dec: 0,
      color: "var(--success)",    zero: true },
    { key: "voltV",  label: "Voltage · V",       unit: "V",  h: 64, dec: 2,
      color: "var(--info-hover)", fixed: [3.3, 4.3] },
    { key: "temp",   label: "Temperature · °C",  unit: "°C", h: 64, dec: 1,
      color: "var(--warning)",    minSpan: 5 }
  ];
  var RANGES   = [[15, "15 m"], [60, "1 h"], [360, "6 h"], [1440, "24 h"]];
  var TICKSTEP = { 15: 2, 60: 10, 360: 60, 1440: 240 };
  // The collector samples every 20 s; 3 missed samples is an outage, not jitter.
  var GAP_MS = 60000;
  var PADL = 42, PADR = 12, LANE_GAP = 16, BAND_H = 9, TOP = 18;
  // Fallback GUI fit, mirroring glbattlimit + the Lua backend. Only used before
  // get_battlimit lands; the served gui_m/gui_b win.
  var GUI_M = 13867, GUI_B = 189300;
  var STATE_COLOR = {
    charging:    "var(--success)",
    blocked:     "var(--warning)",
    draining:    "var(--error)",
    discharging: "var(--text-hint)"
  };
  var STATE_LABEL = {
    charging: "Charging", blocked: "Charge blocked",
    draining: "Draining on power", discharging: "On battery"
  };

  var component = {
    name: "mudimodem-battery",

    // `embedded` is set when the main Modem page renders us inside its Battery
    // tab (the only caller today); it drops our own heading.
    props: { embedded: { type: Boolean, default: false } },

    data: function () {
      return {
        winW: 15, samples: [], lastT: 0, serverNow: 0, serverNowAt: 0,
        loading: true, err: "", fetching: false, loadedFrom: null,
        pendingWindow: null, poll: null, tick: 0, live: true,
        width: 900, styleId: "mmb-css", cursor: null, pinnedM: null,
        // charge-limit form state (moved here from the Config tab)
        bl: null, blBusy: false, blErr: "", blDraft: 80
      };
    },

    created: function () { this.injectStyle(); },
    mounted: function () {
      var self = this;
      if (typeof window === "undefined") return;
      this.measure();
      this._onResize = function () { self.measure(); };
      window.addEventListener("resize", this._onResize);
      this.fetchBattLimit();
      this.fetchHistory();
      this.poll = setInterval(function () {
        if (self.live) self.fetchHistory({ since: self.lastT, merge: true });
      }, 10000);
    },
    updated: function () { this.measure(); },
    beforeDestroy: function () {
      if (this.poll) clearInterval(this.poll);
      if (typeof window !== "undefined" && this._onResize)
        window.removeEventListener("resize", this._onResize);
    },

    methods: {
      // ---- data ----
      // POST to /rpc via $axios DIRECTLY, not $rpcRequest: $rpcRequest's axios
      // interceptor pops GL's global error banner on any failure BEFORE our
      // .catch runs — unacceptable for a silent 10 s background poll on a flaky
      // cellular link. Fails silently; a bad poll just retries next tick.
      rpcSilent: function (method, params) {
        if (typeof window === "undefined" || !window.$axios) return Promise.resolve(null);
        var sid = (window.$getCookie && window.$getCookie("Admin-Token")) || "";
        return window.$axios.post("/rpc", {
          jsonrpc: "2.0", id: 1, method: "call",
          params: [sid, "mudimodem", method, params || {}]
        }, { timeout: 20000 })
          .then(function (r) { return (r && r.data && r.data.result) || null; })
          .catch(function () { return null; });
      },

      // opts = { window: <minutes>, since: <ms>, merge: <bool> }.
      // ⚠️ A window goes to the box as a DURATION (window_ms), never as a
      // browser-computed absolute cutoff: the two clocks disagree on a travel
      // router, and an absolute cutoff mis-sizes the window by exactly the skew.
      // The poll's `since` is exempt — it is a timestamp the BOX stamped.
      fetchHistory: function (opts) {
        opts = opts || {};
        var self = this;
        if (typeof window === "undefined" || !window.$axios) { self.loading = false; return; }
        // One fetch at a time; a range request landing mid-flight is remembered.
        if (self.fetching) {
          if (opts.window != null && !opts.merge)
            self.pendingWindow = (self.pendingWindow == null)
              ? opts.window : Math.max(self.pendingWindow, opts.window);
          return;
        }
        self.fetching = true;
        var merge = !!opts.merge;
        // lastT is 0 until the first sample lands; since=0 would make the box
        // decode the whole retained 24 h on every 10 s tick.
        var incremental = (opts.since != null && opts.since > 0);
        var winMs = (opts.window || self.winW) * 60000;
        var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
        this.rpcSilent("get_battery_history", params)
          .then(function (res) {
            self.fetching = false;
            if (res) {
              var ns = res.samples || [];
              if (merge) { if (ns.length) self.samples = self.samples.concat(ns); }
              else self.samples = ns;
              self.serverNow = res.now || Date.now();
              self.serverNowAt = Date.now();
              var cut = self.serverNow - 24 * 3600 * 1000;
              self.samples = self.samples.filter(function (s) { return s.t >= cut; });
              if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
              var reached = incremental ? opts.since : (self.serverNow - winMs);
              self.loadedFrom = (self.loadedFrom == null)
                ? reached : Math.min(self.loadedFrom, reached);
              self.err = ""; self.tick++;
            }
            self.loading = false;
            self.drainPending();
          })
          .catch(function (e) {
            self.fetching = false;
            self.err = (e && (e.type || e.message)) || "couldn't load battery history";
            self.loading = false;
            self.drainPending();
          });
      },
      drainPending: function () {
        if (this.pendingWindow == null) return;
        var w = this.pendingWindow; this.pendingWindow = null;
        this.fetchHistory({ window: w });
      },
      setRange: function (w) {
        this.winW = w; this.pinnedM = null; this.cursor = null;
        // Backfill only when the new window reaches earlier than we hold.
        var cutoff = this.nowMs() - w * 60000;
        if (this.loadedFrom == null || cutoff < this.loadedFrom - 1000)
          this.fetchHistory({ window: w });
      },

      // ---- charge limit (user-initiated => $rpcRequest is correct here) ----
      fetchBattLimit: function () {
        var self = this;
        if (typeof window === "undefined" || !window.$rpcRequest) return Promise.resolve();
        return window.$rpcRequest("call", ["sid", "mudimodem", "get_battlimit", {}], { timeout: 8000 })
          .then(function (r) {
            self.bl = r || null;
            if (r && typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            self.blErr = (r && r.error) || "";
          })
          .catch(function (e) {
            self.blErr = (e && (e.message || e.type)) || "request failed";
          });
      },
      applyBattLimit: function (patch) {
        var self = this;
        if (this.blBusy || typeof window === "undefined" || !window.$rpcRequest) return;
        var cur = this.bl || { enabled: false, limit_gui: 80 };
        var enabled = (patch && typeof patch.enabled === "boolean") ? patch.enabled : !!cur.enabled;
        var limit_gui = (patch && patch.limit_gui != null)
          ? Number(patch.limit_gui) : Number(this.blDraft || cur.limit_gui);
        if (!(limit_gui >= 20 && limit_gui <= 100)) {
          this.blErr = "Target must be 20–100 % GUI";
          return;
        }
        // Same gui2gauge floor as glbattlimit / the backend (gauge must be ≥ 50).
        var gauge = Math.floor((limit_gui * 10000 + GUI_B + GUI_M / 2) / GUI_M);
        if (gauge < 50 || gauge > 100) {
          this.blErr = "limit too low (min ~50% gauge / use higher GUI %)";
          return;
        }
        this.blBusy = true; this.blErr = "";
        return window.$rpcRequest("call", ["sid", "mudimodem", "set_battlimit",
          { enabled: enabled, limit_gui: limit_gui }], { timeout: 15000 })
          .then(function (r) {
            self.blBusy = false;
            // An error payload without available/limit_gui must not wipe UI state.
            if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number")) {
              self.bl = r;
              if (typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            }
            if (r && r.error) self.blErr = r.error;
            else if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number"))
              self.blErr = "";
          })
          .catch(function (e) {
            self.blBusy = false;
            self.blErr = (e && (e.message || e.type)) || "request failed";
          });
      },

      // ---- scales + derived series ----
      measure: function () {
        if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
          this.width = this.$refs.lanes.clientWidth;
      },
      // skew-corrected box-now: server clock advanced by browser elapsed time.
      nowMs: function () {
        if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
        return Date.now();
      },
      mOf: function (t) { return -((this.nowMs() - t) / 60000); },
      xOf: function (m) {
        var plotW = this.width - PADL - PADR;
        return PADL + (m + this.winW) / this.winW * plotW;
      },
      // gauge % -> GL's "GUI" %, using the constants get_battlimit serves so the
      // fit lives in exactly one place (the Lua backend).
      guiOf: function (gauge) {
        if (gauge == null) return null;
        var bl = this.bl || {};
        var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
        var v = Math.round((gauge * m - b) / 1000) / 10;
        return Math.max(0, Math.min(100, v));
      },
      // Samples inside the window, ascending, de-duplicated, decorated with the
      // derived fields the lanes plot. Incremental polling concats, which can
      // leave this.samples out of order or with duplicate t — a backward point
      // would draw one long line across the whole plot. Sort/dedupe HERE, the
      // single choke point every consumer goes through.
      winSamples: function () {
        var cutoff = this.nowMs() - this.winW * 60000, self = this;
        var win = this.samples.filter(function (s) { return s.t >= cutoff; })
          .map(function (s) {
            return Object.assign({}, s, {
              m: self.mOf(s.t),
              capGui: self.guiOf(s.cap),
              voltV: (s.volt == null) ? null : Math.round(s.volt) / 1000
            });
          });
        win.sort(function (a, b) { return a.t - b.t; });
        var out = [], prev = null;
        for (var i = 0; i < win.length; i++) {
          if (prev !== null && win[i].t === prev) continue;
          out.push(win[i]); prev = win[i].t;
        }
        return out;
      },
      // Contiguous runs of a metric: split on a null value AND on a time hole
      // bigger than GAP_MS, so an outage renders as a break rather than a
      // straight line pretending the battery held steady through it.
      segments: function (key) {
        var ss = this.winSamples(), segs = [], cur = [];
        for (var i = 0; i < ss.length; i++) {
          var s = ss[i];
          if (i > 0 && (s.t - ss[i - 1].t) > GAP_MS) {
            if (cur.length) segs.push(cur);
            cur = [];
          }
          var v = s[key];
          if (v == null) { if (cur.length) segs.push(cur); cur = []; continue; }
          cur.push({ m: s.m, v: v, t: s.t });
        }
        if (cur.length) segs.push(cur);
        return segs;
      },
      // Min/max-preserving reduction to roughly `cols` columns.
      // ⚠️ NEVER average. Averaging smears the Current lane's exact 0 (the
      // charge limit engaging) into a small non-zero number and erases the one
      // reading this whole feature exists to show.
      // ⚠️ min/max alone is NOT the same as "0 survives": a bucket straddling
      // zero (e.g. charging (+) -> blocked (0) -> discharging (-)) has the 0
      // as neither its min nor its max, so it must be tracked and kept
      // EXPLICITLY, not assumed to fall out of the lo/hi selection.
      reduce: function (pts, cols) {
        if (!pts.length || pts.length <= cols) return pts;
        var span = (pts[pts.length - 1].m - pts[0].m) / cols;
        if (!(span > 0)) return pts;
        var out = [], i = 0;
        while (i < pts.length) {
          var edge = pts[i].m + span, lo = pts[i], hi = pts[i], zero = null, j = i;
          while (j < pts.length && pts[j].m < edge) {
            if (pts[j].v < lo.v) lo = pts[j];
            if (pts[j].v > hi.v) hi = pts[j];
            if (pts[j].v === 0 && zero === null) zero = pts[j];
            j++;
          }
          if (j === i) j = i + 1;                        // always advance
          if (lo === hi) {
            out.push(lo);
          } else {
            var keep = [lo, hi];
            if (zero !== null && zero !== lo && zero !== hi) keep.push(zero);
            keep.sort(function (a, b) { return a.m - b.m; });
            for (var k = 0; k < keep.length; k++) out.push(keep[k]);
          }
          i = j;
        }
        return out;
      },
      domainFor: function (lane) {
        var lo = null, hi = null;
        this.segments(lane.key).forEach(function (seg) {
          seg.forEach(function (p) {
            if (lo === null || p.v < lo) lo = p.v;
            if (hi === null || p.v > hi) hi = p.v;
          });
        });
        if (lane.fixed) {
          // Fixed domains are absolute and meaningful (0-100 %, the Li-ion
          // range). They still EXPAND for an out-of-range reading rather than
          // clipping it silently — a clipped line looks like a flat line.
          var d0 = lane.fixed[0], d1 = lane.fixed[1];
          if (lo !== null && lo < d0) d0 = lo;
          if (hi !== null && hi > d1) d1 = hi;
          return [d0, d1];
        }
        if (lo === null) return [0, 1];
        if (lane.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        var span = hi - lo, min = lane.minSpan || 0;
        if (span < min) {
          var mid = (lo + hi) / 2;
          lo = mid - min / 2; hi = mid + min / 2;
        } else if (span === 0) { lo -= 1; hi += 1; }
        else { var pad = span * 0.08; lo -= pad; hi += pad; }
        if (lane.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        return [lo, hi];
      },
      yIn: function (lane, top, v) {
        var d = this.domainFor(lane), d0 = d[0], d1 = d[1];
        if (d1 === d0) return top + lane.h / 2;
        return top + lane.h - (Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0) * lane.h;
      },
      // What the charger is doing, per sample.
      // `blocked` (online with exactly 0 mA) is glbattlimit's own signature for
      // "charging is being held off" — far crisper than reading `status`.
      chargeState: function (s) {
        if (!s.online) return "discharging";
        if (s.cur === 0) return "blocked";
        if (s.cur > 0) return "charging";
        return "draining";
      },
      // Same gap discipline as segments(): a hole bigger than GAP_MS ends the
      // current run rather than extending across it, even when the state on
      // both sides matches — otherwise a multi-hour outage between two
      // "charging" samples paints one solid "charging" band through data we
      // don't have.
      stateRuns: function () {
        var ss = this.winSamples(), runs = [], self = this;
        for (var i = 0; i < ss.length; i++) {
          var v = self.chargeState(ss[i]), last = runs[runs.length - 1];
          var gap = i > 0 && (ss[i].t - ss[i - 1].t) > GAP_MS;
          if (last && !gap && last.v === v) {
            last.m1 = ss[i].m;
          } else {
            if (last) last.m1 = gap ? ss[i - 1].m : ss[i].m;
            runs.push({ v: v, m0: ss[i].m, m1: ss[i].m });
          }
        }
        if (runs.length) runs[runs.length - 1].m1 = 0;
        return runs;
      },
      nearestSample: function (m) {
        var ss = this.winSamples(); if (!ss.length) return null;
        var best = ss[0];
        for (var i = 1; i < ss.length; i++)
          if (Math.abs(ss[i].m - m) < Math.abs(best.m - m)) best = ss[i];
        return best;
      },
      clock: function (t) {
        var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getHours()) + ":" + p(d.getMinutes());
      },
      injectStyle: function () { /* Task 4 */ }
    },

    // Replaced in Task 4.
    render: function (h) { return h("div", { staticClass: "mmb" }, ""); }
  };

  component.LANES = LANES;
  component.RANGES = RANGES;
  component.TICKSTEP = TICKSTEP;
  component.GAP_MS = GAP_MS;
  return component;
})();
