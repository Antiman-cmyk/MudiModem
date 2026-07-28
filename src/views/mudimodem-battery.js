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
// 0 = charging stopped), `volt` is mV, `temp` is °C, `cap` is the RAW GAUGE %.
// Each sample also carries the charge limiter's own state at that instant
// (`lim`, `lim_gauge`) — the ONLY thing that distinguishes "the limit is
// holding charge off" from "the battery is full"; see limiterHeld().
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
    { key: "capGui", label: "GL UI Reported Charge · %", unit: "%",  h: 96, dec: 0,
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
  // Consecutive failed 10 s polls before we say so on the page. One dropped
  // poll on a travel router's cellular link is normal and must not alarm;
  // three in a row (~30 s) means the chart is stale and the user should know.
  var FAIL_NOTE_AFTER = 3;
  var PADL = 42, PADR = 12, LANE_GAP = 16, BAND_H = 9, TOP = 18;
  // Fallback GUI fit, mirroring glbattlimit + the Lua backend. Only used before
  // get_battlimit lands; the served gui_m/gui_b win.
  var GUI_M = 13867, GUI_B = 189300;
  // Slider bounds, in GUI %. The floor is not cosmetic: glbattlimit enforces
  // gauge >= 50, and gui_to_gauge(49) === 49, so GUI 50 is the lowest target
  // the box will accept. Anything below it is a value the backend would take
  // and then refuse — so the control simply cannot express it.
  var LIMIT_MIN = 50, LIMIT_MAX = 100;
  var STATE_COLOR = {
    charging:    "var(--success)",
    // A genuinely full battery on mains is a healthy, unremarkable state —
    // same token as charging, not the `blocked` warning colour.
    full:        "var(--success)",
    blocked:     "var(--warning)",
    draining:    "var(--error)",
    discharging: "var(--text-hint)",
    // Plugged in, 0 mA, and the limiter is NOT the reason — something else
    // stopped the charge (thermal, fault, a charger that just terminated).
    idle:        "var(--text-hint)",
    unknown:     "var(--text-hint)"
  };
  var STATE_LABEL = {
    charging: "Charging", full: "Full", blocked: "Charge blocked (limit)",
    draining: "Draining on power", discharging: "On battery",
    idle: "Not charging", unknown: "Unknown"
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
        // Poll health. `okCount` distinguishes "the collector has nothing yet"
        // from "we have never reached the box"; `failStreak` keeps one dropped
        // poll on a flaky cellular link from raising an alarm.
        okCount: 0, failStreak: 0,
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
      //
      // ⚠️ It RESOLVES `null` on every failure and never rejects — that is the
      // contract, and it is why attaching a .catch to it is pointless (there
      // was one here once; it was dead code and `this.err` could never be set,
      // so a dead /rpc showed "No battery history yet" forever). Silent to GL's
      // banner is NOT the same as silent to the user: the caller must treat a
      // `null` resolution as the failure it is. See fetchHistory.
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
        // Returned so callers can sequence on it (the tests do); mounted() and
        // the 10 s interval both ignore it.
        return this.rpcSilent("get_battery_history", params)
          .then(function (res) {
            self.fetching = false;
            // rpcSilent resolves null for EVERY failure mode — transport down,
            // session expired, JSON-RPC error payload. A successful call always
            // yields an object, so null here is unambiguously a failed poll.
            if (!res) {
              self.failStreak++;
              // One dropped poll on a cellular link is weather, not news. A run
              // of them means the chart is quietly going stale, and the user
              // has to be told — without GL's global banner.
              if (self.failStreak >= FAIL_NOTE_AFTER)
                self.err = "Can't reach the router — battery history stopped updating "
                  + (self.failStreak * 10) + " s ago.";
              self.loading = false;
              self.tick++;                       // re-render so the note appears
              self.drainPending();
              return;
            }
            self.okCount++; self.failStreak = 0;
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
            self.loading = false;
            self.drainPending();
          });
          // NO .catch: rpcSilent never rejects (see above). One used to live
          // here and was unreachable — the failure branch is inside .then.
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
            // Clamp the DRAFT into the slider's range so the thumb cannot
            // misrepresent a stored value below the floor. Deliberately does
            // NOT write the clamped value back: silently rewriting a user's
            // setting because the UI changed shape is worse than a clamped
            // thumb. The next deliberate interaction saves a valid value.
            if (r && typeof r.limit_gui === "number")
              self.blDraft = Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, r.limit_gui));
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
          this.blErr = "Target must be 20–100 % GL UI Reported Charge";
          return;
        }
        // Same gui2gauge floor as glbattlimit / the backend (gauge must be ≥ 50).
        //
        // ⚠️ This guard is NOT dead just because the slider starts at 50. The
        // OTHER caller is the enable/disable checkbox, which passes the
        // SERVER's stored limit_gui — and a stored value below the floor can
        // exist (a hand-edited /etc/mudimodem/battlimit.json, or a legacy
        // setting). The slider closes the invalid range through the slider;
        // this closes it through the toggle.
        var gauge = this.gaugeOf(limit_gui);
        if (gauge < 50 || gauge > 100) {
          this.blErr = "Target too low — the charge IC needs at least "
            + "50 % IC Reported Charge (about 50 % GL UI Reported Charge)";
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
      // GUI % -> gauge %, the inverse of guiOf and byte-for-byte the integer
      // formula the Lua backend's gui_to_gauge uses, so the UI and the box
      // never disagree about what a target means. Same served-constants-with-
      // fallback rule as guiOf.
      gaugeOf: function (gui) {
        if (gui == null) return null;
        var bl = this.bl || {};
        var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
        return Math.floor((gui * 10000 + b + m / 2) / m);
      },
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
      //
      // ⚠️ PERFORMANCE: winSamples() is O(n log n) over the whole retained
      // array (filter + map + sort + dedupe). Everything below therefore comes
      // in a `*From(ss, …)` flavour that takes an ALREADY-COMPUTED window, so
      // one render computes the window ONCE and hands it down (the pattern
      // mudimodem-tracking.js:342 uses). The zero-argument wrappers are kept
      // for callers outside a render pass (and for the tests); never call them
      // per point or per lane. See the render-budget test in
      // test/battery-chunk.test.js.
      segmentsFrom: function (ss, key) {
        var segs = [], cur = [];
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
      segments: function (key) { return this.segmentsFrom(this.winSamples(), key); },
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
      domainFrom: function (ss, lane) {
        var lo = null, hi = null;
        this.segmentsFrom(ss, lane.key).forEach(function (seg) {
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
      domainFor: function (lane) { return this.domainFrom(this.winSamples(), lane); },
      // `dom` is the lane's ALREADY-RESOLVED [lo, hi]. A render resolves it once
      // per lane and passes it in — computing it here would put a full
      // winSamples()+segments() pass behind every plotted point (the O(n²)
      // freeze that made the 6 h and 24 h ranges unusable). The fallback is for
      // one-off callers outside a render pass only.
      yIn: function (lane, top, v, dom) {
        var d = dom || this.domainFor(lane), d0 = d[0], d1 = d[1];
        if (d1 === d0) return top + lane.h / 2;
        return top + lane.h - (Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0) * lane.h;
      },
      // Is the charge limiter itself holding this sample's charge off?
      //
      // ⚠️⚠️ READ THIS BEFORE "FIXING" chargeState AGAIN. The charger reports
      // `status = Full`, `charge_type = Trickle` when the limiter is engaged —
      // because glbattlimit blocks charging by writing the buck's `vreg` BELOW
      // the current cell voltage (src/sbin/glbattlimit `gate_on`), which is
      // exactly the condition a charger calls "charge complete". Verified on
      // the box 2026-07-28 at gauge 71 = gui_to_gauge(80), i.e. sitting on the
      // configured target with the watcher alive: cur=0, online=1,
      // status=Full, ctype=Trickle, charge_en=0, vreg=3900000 (factory
      // 4400000). So `status === "Full"` is the LIMITER'S SIGNATURE, not
      // evidence of a full cell, and keying "full" off it inverts the label
      // precisely when the feature has something to show.
      //
      // The discriminator is the limiter's own state, recorded PER SAMPLE by
      // mudimodem-collectd (`lim` = watcher alive, `lim_gauge` = its gauge
      // target). Per-sample, not from the live get_battlimit snapshot: the
      // snapshot describes NOW, and a 24 h window routinely spans a settings
      // change that would otherwise relabel history retroactively.
      limiterHeld: function (s) {
        if (s.lim !== 1) return false;                 // watcher not running
        // The watcher gates only at/above its target (glbattlimit watch_loop:
        // `[ "$(cap)" -ge "$lim" ]`). Below it, a 0 mA reading is not ours.
        if (s.lim_gauge == null || s.cap == null) return true;
        return s.cap >= s.lim_gauge;
      },
      // What the charger is doing, per sample.
      chargeState: function (s) {
        if (!s.online) return "discharging";
        if (s.cur == null) return "unknown";           // no reading != a reading
        if (s.cur > 0) return "charging";
        if (s.cur < 0) return "draining";
        // cur === 0 while plugged in: charging is stopped. By whom?
        if (this.limiterHeld(s)) return "blocked";
        // `lim` absent => a sample retained from before the collector recorded
        // it. We genuinely cannot attribute the stop, so we don't guess: the
        // honest answer is "not charging", never a confident "Full".
        if (s.lim == null) return "idle";
        var status = (s.status == null ? "" : String(s.status)).trim().toLowerCase();
        // Nothing of ours is gating and the charger says it terminated on its
        // own — that is a genuinely full cell.
        if (status === "full") return "full";
        return "idle";
      },
      // Same gap discipline as segments(): a hole bigger than GAP_MS ends the
      // current run rather than extending across it, even when the state on
      // both sides matches — otherwise a multi-hour outage between two
      // "charging" samples paints one solid "charging" band through data we
      // don't have.
      stateRunsFrom: function (ss) {
        var runs = [], self = this;
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
      stateRuns: function () { return this.stateRunsFrom(this.winSamples()); },
      nearestSampleIn: function (ss, m) {
        if (!ss.length) return null;
        var best = ss[0];
        for (var i = 1; i < ss.length; i++)
          if (Math.abs(ss[i].m - m) < Math.abs(best.m - m)) best = ss[i];
        return best;
      },
      nearestSample: function (m) { return this.nearestSampleIn(this.winSamples(), m); },
      clock: function (t) {
        var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getHours()) + ":" + p(d.getMinutes());
      },

      // ---- interaction ----
      mFromEvent: function (e) {
        var el = this.$refs && this.$refs.lanes; if (!el) return null;
        var r = el.getBoundingClientRect(); if (!r.width) return null;
        // clientX is CSS px within the container; the SVG scales its viewBox to
        // the rendered width. Convert px -> viewBox units before applying the
        // geometry, or the drawn cursor drifts right of the pointer.
        var ux = (e.clientX - r.left) * this.width / r.width;
        var plotW = this.width - PADL - PADR;
        return -this.winW + (ux - PADL) / plotW * this.winW;
      },
      clampM: function (m) { return Math.max(-this.winW, Math.min(0, m)); },
      onMove: function (e) {
        if (this.pinnedM != null) return;
        var m = this.mFromEvent(e); if (m == null) return;
        this.cursor = this.clampM(m);
      },
      onLeave: function () { if (this.pinnedM == null) this.cursor = null; },
      onClick: function (e) {
        if (this.pinnedM != null) { this.pinnedM = null; return; }
        var m = this.mFromEvent(e); if (m == null) return;
        this.pinnedM = this.cursor = this.clampM(m);
      },

      injectStyle: function () {
        if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
        // GL theme tokens only — never hand-picked colours (CLAUDE.md §8).
        var css = [
          ".mmb{display:flex;flex-direction:column;gap:12px}",
          ".mmb-card{background:var(--card-bg,var(--bg-content));border-radius:8px;padding:12px 14px}",
          ".mmb-h{font-weight:600;margin-bottom:8px;color:var(--text-primary)}",
          ".mmb-row{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline}",
          ".mmb-stat{display:flex;flex-direction:column;min-width:84px}",
          ".mmb-stat b{font-size:18px;font-weight:600;color:var(--text-primary);line-height:1.25}",
          ".mmb-stat span{font-size:11px;color:var(--text-badge)}",
          ".mmb-seg{display:inline-flex;gap:2px}",
          ".mmb-seg button{border:0;background:var(--bg-body);color:var(--text-badge);",
          "padding:3px 10px;font-size:12px;border-radius:4px;cursor:pointer}",
          ".mmb-seg button.on{background:var(--primary);color:#fff}",
          ".mmb-lanes{width:100%;display:block;cursor:crosshair}",
          ".mmb-note{font-size:12px;color:var(--text-badge);margin-top:6px}",
          ".mmb-kv{display:flex;align-items:center;gap:10px;margin:6px 0}",
          ".mmb-k{font-size:13px;color:var(--text-badge);min-width:92px}",
          ".mmb-v{font-size:13px;color:var(--text-primary)}",
          // accent-color keeps the thumb/track on the GL palette without a hex
          // literal; engines without it fall back to the default control colour.
          ".mmb-v input[type=range]{width:180px;vertical-align:middle;accent-color:var(--primary)}",
          ".mmb-err{font-size:12px;color:var(--error);margin-top:6px}",
          // Attribution: deliberately the quietest text on the card.
          ".mmb-credit{font-size:11px;color:var(--text-hint);margin-top:10px}"
        ].join("");
        var el = document.createElement("style");
        el.id = this.styleId; el.textContent = css;
        document.head.appendChild(el);
      },

      // ---- render helpers ----
      // `ss` is the window computed once by render(); the fallback keeps this
      // callable on its own (tests).
      renderStatusRow: function (h, ss) {
        ss = ss || this.winSamples();
        var s = ss.length ? ss[ss.length - 1] : null;
        var bl = this.bl || {};
        var fmt = function (v, dec, unit) {
          return (v == null) ? "—" : (dec ? Number(v).toFixed(dec) : String(v)) + unit;
        };
        var stats = [];
        var push = function (label, value) {
          stats.push(h("div", { staticClass: "mmb-stat" },
            [h("b", value), h("span", label)]));
        };
        // Two scales for one battery, and the labels say which is which:
        //   GL UI Reported Charge — the rescaled figure GL's admin + LCD show
        //   IC Reported Charge    — the raw CW221x fuel-gauge reading, and what
        //                           glbattlimit actually enforces against
        // GL UI leads, IC follows (battery spec 2026-07-22, decision 3).
        push("GL UI Reported Charge", s ? fmt(s.capGui, 1, " %") : "—");
        push("IC Reported Charge", s ? fmt(s.cap, 0, " %") : "—");
        push("Current", s ? fmt(s.cur, 0, " mA") : "—");
        push("Voltage", s ? fmt(s.voltV, 2, " V") : "—");
        push("Temp", s ? fmt(s.temp, 1, " °C") : "—");
        push("State", s ? STATE_LABEL[this.chargeState(s)] : "—");
        push("Limit", bl.available === false ? "n/a"
          : (bl.enabled ? bl.limit_gui + " % GL UI" : "Off"));
        return h("div", { staticClass: "mmb-card" }, [
          h("div", { staticClass: "mmb-row" }, stats)
        ]);
      },

      // `ss` is the sample window, computed ONCE by render() and threaded
      // through everything below. Nothing in here may call winSamples(),
      // segments(), domainFor() or stateRuns() — their zero-argument forms
      // recompute the whole window, and doing that per lane (or worse, per
      // plotted point) is what made 6 h/24 h renders take seconds.
      renderLanes: function (h, ss) {
        var self = this, W = this.width, kids = [];
        ss = ss || this.winSamples();
        var cols = Math.max(40, Math.round((W - PADL - PADR) / 2));
        var top = TOP;

        LANES.forEach(function (L) {
          // ONE domain resolution per lane per render; every y-mapping below
          // reuses it, so all marks in a lane share one scale by construction.
          var d = self.domainFrom(ss, L), d0 = d[0], d1 = d[1];
          var laneTop = top;

          // frame + label + the two domain bounds (each lane has its own scale,
          // so a single shared y-axis could not label them)
          [laneTop, laneTop + L.h].forEach(function (yy) {
            kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yy, y2: yy,
              stroke: "var(--divider)", "stroke-width": 1 } }));
          });
          kids.push(h("text", { attrs: { x: PADL, y: laneTop - 4, "font-size": 9.5,
            fill: "var(--text-badge)" } }, L.label));
          [[d1, laneTop + 8], [d0, laneTop + L.h - 2]].forEach(function (p) {
            kids.push(h("text", { attrs: { x: PADL - 5, y: p[1], "font-size": 8.5,
              "text-anchor": "end", fill: "var(--text-hint)" } },
              Number(p[0]).toFixed(L.dec)));
          });

          // zero rule where zero is meaningful — the Current lane's 0 is the
          // "charging blocked" line, so it gets drawn, not implied.
          if (L.zero && d0 < 0 && d1 > 0) {
            var yz = self.yIn(L, laneTop, 0, d);
            kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yz, y2: yz,
              stroke: "var(--divider)", "stroke-width": 1, "stroke-dasharray": "2 3" } }));
          }

          // the target line lives on the Charge lane only, and only when armed
          if (L.key === "capGui" && self.bl && self.bl.enabled
              && typeof self.bl.limit_gui === "number") {
            var yt = self.yIn(L, laneTop, self.bl.limit_gui, d);
            kids.push(h("line", { attrs: { class: "mmb-target",
              x1: PADL, x2: W - PADR, y1: yt, y2: yt, stroke: "var(--warning)",
              "stroke-width": 1.25, "stroke-dasharray": "5 3" } }));
            kids.push(h("text", { attrs: { x: W - PADR, y: yt - 3, "font-size": 8.5,
              "text-anchor": "end", fill: "var(--warning)" } },
              "target " + self.bl.limit_gui + "%"));
          }

          // one path per contiguous segment: a break is an outage, never bridged
          self.segmentsFrom(ss, L.key).forEach(function (seg) {
            var pts = self.reduce(seg, cols), dstr = "";
            pts.forEach(function (p, i) {
              dstr += (i ? "L" : "M") + self.xOf(p.m).toFixed(1) + " "
                + self.yIn(L, laneTop, p.v, d).toFixed(1) + " ";
            });
            if (dstr) kids.push(h("path", { attrs: { fill: "none", stroke: L.color,
              "stroke-width": 1.75, "stroke-linejoin": "round", "stroke-linecap": "round",
              d: dstr.trim() } }));
          });

          top = laneTop + L.h + LANE_GAP;
        });

        // ---- charger-state band + plug/unplug ticks, under the lanes
        var bandY = top - LANE_GAP + 6;
        var runs = this.stateRunsFrom(ss);
        runs.forEach(function (r) {
          var x0 = self.xOf(r.m0), x1 = self.xOf(r.m1);
          kids.push(h("rect", { attrs: { x: x0, y: bandY, width: Math.max(1, x1 - x0),
            height: BAND_H, fill: STATE_COLOR[r.v], "fill-opacity": 0.55 } }));
        });
        for (var i = 1; i < runs.length; i++) {
          var wasOn = runs[i - 1].v !== "discharging", isOn = runs[i].v !== "discharging";
          if (wasOn === isOn) continue;                 // not a plug/unplug edge
          var xe = self.xOf(runs[i].m0);
          kids.push(h("line", { attrs: { x1: xe, x2: xe, y1: TOP - 10, y2: bandY + BAND_H,
            stroke: "var(--text-hint)", "stroke-width": 1, "stroke-dasharray": "1 3" } }));
          kids.push(h("text", { attrs: { x: xe + 3, y: TOP - 12, "font-size": 8.5,
            fill: "var(--text-hint)" } }, isOn ? "plugged" : "unplugged"));
        }

        // ---- x axis
        var axisY = bandY + BAND_H + 11;
        var step = TICKSTEP[this.winW] || 10;
        for (var m = -this.winW; m <= 0; m += step) {
          var x = this.xOf(m);
          kids.push(h("text", { attrs: { x: x, y: axisY, "font-size": 9,
            "text-anchor": "middle", fill: "var(--text-hint)" } },
            m === 0 ? "now" : (m + " m")));
        }

        // ---- hover cursor + readout
        if (this.cursor != null) {
          var cx = this.xOf(this.cursor);
          kids.push(h("line", { attrs: { x1: cx, x2: cx, y1: TOP, y2: bandY + BAND_H,
            stroke: "var(--text-hint)", "stroke-width": 1 } }));
          var near = this.nearestSampleIn(ss, this.cursor);
          if (near) {
            var bits = [this.clock(near.t),
              (near.capGui == null ? "—" : near.capGui.toFixed(1) + "%")
                + (near.cap == null ? "" : " (IC " + near.cap + "%)"),
              (near.cur == null ? "—" : near.cur + " mA"),
              (near.voltV == null ? "—" : near.voltV.toFixed(2) + " V"),
              (near.temp == null ? "—" : near.temp.toFixed(1) + " °C"),
              STATE_LABEL[this.chargeState(near)]];
            kids.push(h("text", { attrs: { x: PADL, y: axisY + 12, "font-size": 10,
              fill: "var(--text-primary)" } }, bits.join("  ·  ")));
          }
        }

        var H = axisY + 20;
        return h("svg", {
          ref: "lanes", staticClass: "mmb-lanes",
          attrs: { viewBox: "0 0 " + W + " " + H, height: H,
            preserveAspectRatio: "none" },
          on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick }
        }, kids);
      },

      renderLimitCard: function (h) {
        var self = this, bl = this.bl, kids = [h("div", { staticClass: "mmb-h" }, "Battery charge limit")];
        if (!bl) {
          // A first-load failure must not stick on "Loading…" — surface the error.
          kids.push(h("div", { staticClass: "mmb-note" }, this.blErr || "Loading…"));
        } else if (bl.available === false) {
          kids.push(h("div", { staticClass: "mmb-note" }, "Charge limit not available on this device."));
          if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
        } else {
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("label", { staticClass: "mmb-k" }, [
              h("input", {
                attrs: { type: "checkbox", disabled: !!self.blBusy },
                domProps: { checked: !!bl.enabled },
                on: { change: function (e) {
                  self.applyBattLimit({ enabled: !!(e.target && e.target.checked) });
                } }
              }),
              " Limit charging"
            ])
          ]));
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("span", { staticClass: "mmb-k" }, "Target"),
            h("span", { staticClass: "mmb-v" }, [
              // A SLIDER, floored at LIMIT_MIN: the backend refuses anything
              // below it (gauge < 50), so the old number input's 20–49 range
              // was values it would accept and then reject. Unreachable beats
              // validated-against.
              h("input", {
                attrs: { type: "range", min: LIMIT_MIN, max: LIMIT_MAX, step: 1,
                  disabled: !bl.enabled || !!self.blBusy },
                domProps: { value: self.blDraft },
                on: {
                  // `input` fires per drag-pixel: update the label only. Each
                  // save spawns a process on the router, so committing here
                  // would hammer it. `change` fires once, on release.
                  input: function (e) { self.blDraft = Number(e.target && e.target.value); },
                  change: function () { self.applyBattLimit({ limit_gui: self.blDraft }); }
                }
              }),
              " " + self.blDraft + " % GL UI Reported Charge",
              // Tracks the DRAFT, not bl.limit_gauge — the latter is the SAVED
              // value and would lag the thumb during a drag.
              h("span", { staticClass: "mmb-note" },
                "  (≈ " + self.gaugeOf(self.blDraft) + " % IC Reported Charge)")
            ])
          ]));
          var statusLine;
          if (bl.active) statusLine = "Active · " + (bl.active_gauge != null ? bl.active_gauge + " % IC Reported Charge" : "on");
          else if (bl.enabled && !bl.charger_online) statusLine = "Armed · will apply when the charger connects";
          else if (bl.enabled && bl.charger_online) statusLine = "Enabled · not active";
          else statusLine = "Off";
          kids.push(h("div", { staticClass: "mmb-kv" }, [
            h("span", { staticClass: "mmb-k" }, "Status"),
            h("span", { staticClass: "mmb-v" }, statusLine)
          ]));
          if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
        }
        // Credit, shown in every state of the card (including "not available"):
        // the whole charge-limit stack is ChiliApple's work, vendored here.
        kids.push(h("div", { staticClass: "mmb-credit" },
          "Based on ChiliApple's battery control scripts"));
        return h("div", { staticClass: "mmb-card" }, kids);
      },
    },

    render: function (h) {
      var self = this;
      this.tick;                                   // re-render on each poll
      var kids = [];
      // The sample window is computed EXACTLY ONCE per render and threaded
      // into every helper. It is a local, never cached on the instance, so it
      // cannot go stale between renders — a new poll, a range change or a
      // cursor move all produce a fresh one.
      var ss = this.winSamples();
      if (!this.embedded) kids.push(h("div", { staticClass: "mmb-h" }, "Battery"));
      kids.push(this.renderStatusRow(h, ss));

      var chartKids = [
        h("div", { staticClass: "mmb-row" }, [
          h("div", { staticClass: "mmb-h" }, "History"),
          h("span", { staticClass: "mmb-seg" }, RANGES.map(function (r) {
            return h("button", {
              key: r[0], staticClass: (self.winW === r[0] ? "on" : ""),
              on: { click: function () { self.setRange(r[0]); } }
            }, r[1]);
          }))
        ])
      ];
      if (this.loading) {
        chartKids.push(h("div", { staticClass: "mmb-note" }, "Loading battery history…"));
      } else if (!ss.length) {
        // Two different nothings, and saying the wrong one is a lie: "sampling
        // starts within 20 s" is only true if we actually reached the box and
        // it had no data. If every request so far has failed we know nothing
        // about the collector — say THAT instead.
        chartKids.push(h("div", { staticClass: "mmb-note" },
          (!this.okCount && this.failStreak)
            ? "Couldn't reach the router — retrying every 10 s."
            : "No battery history yet — sampling starts within 20 s."));
        if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
      } else {
        chartKids.push(this.renderLanes(h, ss));
        if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
      }
      kids.push(h("div", { staticClass: "mmb-card" }, chartKids));
      kids.push(this.renderLimitCard(h));
      return h("div", { staticClass: "mmb" }, kids);
    }
  };

  component.LANES = LANES;
  component.RANGES = RANGES;
  component.TICKSTEP = TICKSTEP;
  component.GAP_MS = GAP_MS;
  component.FAIL_NOTE_AFTER = FAIL_NOTE_AFTER;
  component.STATE_LABEL = STATE_LABEL;
  return component;
})();
