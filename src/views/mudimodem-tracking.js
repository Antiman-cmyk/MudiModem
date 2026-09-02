// MudiModem — Tracking (the uber graph). A hidden /mudimodem-tracking route.
//
// Loaded by GL's SPA via eval(): the file is ONE expression whose value is the
// component. Vue is runtime-only -> render(h) only, never template:.
//
// History comes from the device-side collector (mudimodem-collectd), read via a
// SILENT POST to /rpc (window.$axios directly, NOT $rpcRequest) so a failed
// background poll can't trigger GL's global "Unknown error" banner — see
// rpcSilent(). -> { samples:[...], events:[...], now }. The page fetches the full
// visible window once on mount, then stays live on the collector's pushes.
// Handover/failover ticks are DERIVED here from the sample stream (net events
// aren't persisted); user/watchdog events come from the server.
//
// Times are the box clock (os.time()*1000). We render relative to a skew-
// corrected box-now so the axis doesn't jump if the browser clock differs.
//
// The middle bus is CELL ID + ARFCN (4.10 collector samples also carry PCI) — over
// ubus. Metrics arrive as numbers already (parsed by the collector); _level
// buckets drive the GL quality ramp. All colour is GL theme tokens.
module.exports = (function () {
  "use strict";

  // Three metrics OVERLAID in one plot. Each keeps its own domain (`dom`) but
  // maps into the same shared rectangle (PLOT_H) — a normalized overlay, so the
  // lines are comparable in shape. Fixed GL-token colour per metric keeps them
  // apart: RSRP=primary(blue), SINR=success(mint), RSRQ=error(rose). (GL ships no
  // saturated purple that survives the dark theme — its --gl-purple ramp is the
  // desaturated text ramp — so rose is the third distinct hue.) Signal QUALITY is
  // no longer painted on the lines; it lives in the hover readout + the strip.
  // `lvl` is retained for the readout's quality colouring.
  //
  // `dom` is a FIXED field-test base — never auto-zoomed to the series (that
  // makes noise look like signal). domainFor() still EXPANDS past the base when
  // a sample falls outside, so a strong RSRP (better than −80) is not clamped
  // flat against the top of the plot. Same expand-on-overflow rule as the
  // battery tab's fixed lanes.
  var LINES = [
    { key: "rsrp", label: "RSRP · dBm", dom: [-120, -80], color: "var(--primary)", lvl: "rsrp_level" },
    { key: "sinr", label: "SINR · dB",  dom: [-10, 30],   color: "var(--success)", lvl: "sinr_level" },
    { key: "rsrq", label: "RSRQ · dB",  dom: [-20, -3],   color: "var(--error)",   lvl: "rsrq_level" }
  ];
  var BUSES = [{ key: "band", label: "BAND" }, { key: "id", label: "CELL" }, { key: "sim", label: "SIM" }];
  var FREQ_N = { 2:1900,5:850,7:2600,12:700,13:750,14:700,25:1900,26:850,29:700,30:2300,
    38:2600,41:2500,48:3500,66:1700,70:1700,71:600,77:3700,78:3500,79:4700 };
  var RANGES = [[15,"15 m"],[60,"1 h"],[360,"6 h"],[1440,"24 h"]];
  var TICKSTEP = { 15:2, 60:10, 360:60, 1440:240 };
  var RECENT_USER_MS = 8000;
  var STALL_MS = 45000;            // no push for this long => one catch-up fetch
  var HOLE_MS = 25000;             // a push landing this long after the last sample => backfill the hole
  var GAP_MS = 45000;              // no sample for this long => the lanes break (same rule as the strip)
  // PADL / PADR clear the RSRP (left) and SINR (right) y-axis labels. Was 30/12
  // when the overlay had no numeric scale and the legend carried every domain.
  var PADL = 42, PADR = 36, BUS_H = 20, PLOT_H = 230;
  // How many intervals on each numeric y-axis (→ N+1 labels, incl. floor + ceiling).
  var Y_INTERVALS = 4;

  var component = {
    name: "mudimodem-tracking",

    // `embedded` is set when the main Modem page renders us inside its own
    // "Tracking" tab (vs. the standalone /mudimodem-tracking route). When
    // embedded we drop the "← Modem" breadcrumb — the tab bar is right above us.
    props: { embedded: { type: Boolean, default: false } },

    data: function () {
      return { winW: 15, pinnedM: null, tick: 0, live: true, width: 900,
        styleId: "mmt-css", cursor: null, poll: null, pushSeenAt: 0,
        samples: [], events: [], lastT: 0, serverNow: 0, serverNowAt: 0,
        loading: true, err: "", fetching: false,
        // how far back we've fetched (epoch ms, BOX clock); null = nothing yet.
        // A larger range only refetches when it reaches earlier than this.
        // pendingWindow holds a range request (in minutes) that arrived while a
        // fetch was in flight.
        loadedFrom: null, pendingWindow: null };
    },

    computed: {
      // The collector's pushes (mudimodem.collect / mudimodem.event) land in the
      // SPA's status store; watching them is how this page stays live.
      pushedSample: function () {
        var g = this.$store && this.$store.getters;
        var s = g && g.moduleStatus ? g.moduleStatus("mudimodem.collect") : null;
        return (s && s.t) ? s : null;
      },
      pushedEvent: function () {
        var g = this.$store && this.$store.getters;
        var e = g && g.moduleStatus ? g.moduleStatus("mudimodem.event") : null;
        return (e && e.t) ? e : null;
      },
      // handover/failover ticks derived from the sample stream, merged with the
      // server's user/watchdog events, newest last. Depends on `tick` for polling.
      allEvents: function () {
        this.tick;
        var derived = this.deriveNetEventsIncremental(this.samples, this.events);
        return this.events.concat(derived).sort(function (a, b) { return a.t - b.t; });
      }
    },

    watch: {
      "pushedSample.t": function () { this.onPush(this.pushedSample); },
      // Deep, on the object: event `t` is whole-second (os.time()*1000 in the
      // backend, date +%s in the watchdog), so two events stamped in the same
      // second share a `t` and a `.t` watcher would never fire for the second
      // one. onEventPush dedupes replays by (t, label) itself.
      "pushedEvent": { deep: true, handler: function (e) { this.onEventPush(e); } }
    },

    created: function () { this.injectStyle(); this._derived = null; },
    mounted: function () {
      var self = this;
      if (typeof window === "undefined") return;
      this.measure();
      this.parseHash();
      this._onResize = function () { self.measure(); };
      window.addEventListener("resize", this._onResize);
      this.fetchHistory();                        // initial: just the visible window
      // No polling: samples and events arrive as pushes. The timer is only a
      // stall guard — when no push has landed for a while (collector restart,
      // websocket reconnect) it fetches the tail once.
      this.pushSeenAt = Date.now();
      this.poll = setInterval(function () {
        if (self.live && Date.now() - self.pushSeenAt > STALL_MS) self.fetchHistory({ since: self.lastT, merge: true });
      }, 30000);
    },
    // Keep the viewBox width in sync with the rendered width. At mount the lanes
    // element is usually absent (loading state), so the initial measure() no-ops
    // and this.width stays at its default until data arrives and the SVG renders.
    // Re-measuring here makes the SVG scale ≈ 1 (no stretched text) and keeps the
    // pointer→time mapping exact. measure() only sets when clientWidth is truthy,
    // and Vue skips the reactive write when unchanged, so this converges — no loop.
    updated: function () { this.measure(); },
    beforeDestroy: function () {
      if (this.poll) clearInterval(this.poll);
      if (typeof window !== "undefined" && this._onResize) window.removeEventListener("resize", this._onResize);
    },

    methods: {
      // ---- data ----
      // Post to /rpc via $axios DIRECTLY, not $rpcRequest. $rpcRequest's axios
      // interceptor pops GL's global "Unknown error" banner on any 500 or
      // JSON-RPC error BEFORE our .catch can run — unacceptable for a silent 10s
      // background poll on a flaky cellular link (GL exempts only its own "alive"
      // heartbeat). We handle the envelope ourselves and fail silently: a bad
      // poll just retries next tick. Returns the result object, or null.
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
      // opts = { window, since, merge }. Default (no opts) = the initial load:
      // fetch the visible window, replacing. A poll passes { since: lastT,
      // merge: true } to append just the new tail. Backfill (a wider range)
      // passes { window: minutes } to replace with the wider window.
      // Fetching only the shown window keeps first paint small: the full 24h is
      // ~1.4 MB uncompressed, the 1h default ~85 KB.
      //
      // ⚠️ A window is sent to the box as a DURATION (window_ms), never as a
      // browser-computed `Date.now() - winW`. The two clocks can disagree — this
      // is a travel router — and an absolute cutoff mis-sizes the window by
      // exactly that skew: 10 minutes slow asked for 25 minutes of history, 10
      // minutes fast drew a nearly empty graph. (Not a timezone problem: both
      // Date.now() and the box's os.time() are UTC epoch. Absolute skew.) The
      // poll's `since` is exempt — lastT is a timestamp the BOX stamped on a
      // sample, so it needs no clock agreement at either end.
      fetchHistory: function (opts) {
        opts = opts || {};
        var self = this;
        if (typeof window === "undefined" || !window.$axios) { self.loading = false; return; }
        // One fetch at a time. On a slow load the 10s poll would otherwise fire
        // before it settles and (with a stale lastT) re-fetch + concat overlapping
        // data. A range request that lands mid-flight is remembered, not dropped.
        if (self.fetching) {
          if (opts.window != null && !opts.merge)
            self.pendingWindow = (self.pendingWindow == null) ? opts.window : Math.max(self.pendingWindow, opts.window);
          return;
        }
        self.fetching = true;
        var merge = !!opts.merge;
        // An incremental poll rides on lastT; everything else asks for a window.
        // lastT is 0 until the first sample lands (collector just started, or an
        // empty window) — since=0 would make the box decode the whole retained
        // 24h file on every 10s tick, so fall back to the window there too.
        var incremental = (opts.since != null && opts.since > 0);
        var winMs = (opts.window || self.winW) * 60000;
        var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
        this.rpcSilent("get_history", params)
          .then(function (res) {
            self.fetching = false;
            if (res) {
              var ns = res.samples || [], ne = res.events || [];
              if (merge) {
                // Skip what is already held (a push that landed meanwhile, or
                // the one that revealed a hole) and keep time order: a hole
                // backfill is OLDER than the newest pushed sample.
                var haveT = {};
                for (var i = 0; i < self.samples.length; i++) haveT[self.samples[i].t] = 1;
                var add = ns.filter(function (x) { return x && x.t && !haveT[x.t]; });
                if (add.length) self.samples = self.samples.concat(add).sort(function (a, b) { return a.t - b.t; });
                var haveE = {};
                for (var j = 0; j < self.events.length; j++) haveE[self.events[j].t + "|" + self.events[j].label] = 1;
                var addE = ne.filter(function (e) { return e && !haveE[e.t + "|" + e.label]; });
                if (addE.length) self.events = self.events.concat(addE);
              } else { self.samples = ns; self.events = ne; }
              self.serverNow = res.now || Date.now();
              self.serverNowAt = Date.now();
              var cut = self.serverNow - 24 * 3600 * 1000;
              self.samples = self.samples.filter(function (s) { return s.t >= cut; });
              self.events = self.events.filter(function (e) { return e.t >= cut; });
              if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
              // How far back we now hold, in BOX time — derived from the reply's
              // own clock, so setRange's backfill test compares like with like.
              var reached = incremental ? opts.since : (self.serverNow - winMs);
              self.loadedFrom = (self.loadedFrom == null) ? reached : Math.min(self.loadedFrom, reached);
              self.err = ""; self.tick++;
            }
            self.loading = false;
            self.drainPending();
          })
          .catch(function (e) {
            self.fetching = false;
            self.err = (e && (e.type || e.message)) || "couldn't load history"; self.loading = false;
            self.drainPending();
          });
      },
      drainPending: function () {
        if (this.pendingWindow == null) return;
        var w = this.pendingWindow; this.pendingWindow = null;
        this.fetchHistory({ window: w });
      },
      // A live collector sample (mudimodem.collect push): append it exactly as
      // an incremental fetch would have. The box stamped `t`, so it also
      // advances the box-clock reference without a round-trip.
      onPush: function (s) {
        if (!s || !s.t || s.t <= this.lastT) return;
        var prevT = this.lastT;
        this.pushSeenAt = Date.now();
        // In place: push + shift are O(1) and keep the array identity, so the
        // derived-event cache below stays valid. (concat + filter copied all
        // 8,640 samples on every 10 s push once the 24 h window was full.)
        this.samples.push(s);
        this.lastT = s.t;
        this.serverNow = s.t; this.serverNowAt = Date.now();
        var cut = s.t - 24 * 3600 * 1000;
        while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
        this.tick++;
        // Well over a tick since the last sample: pushes were withheld (the
        // collector's has_websocket gate, up to ~3 ticks after a page opens)
        // or lost (ws reconnect). The samples exist in the collector's log —
        // backfill them once; the stall guard cannot see this, the push reset it.
        if (prevT > 0 && s.t - prevT > HOLE_MS) this.fetchHistory({ since: prevT, merge: true });
      },
      // A user/watchdog event (mudimodem.event push) — Keep, Revert, auto-revert.
      onEventPush: function (e) {
        if (!e || !e.t) return;
        for (var i = this.events.length - 1; i >= 0 && this.events[i].t >= e.t; i--) {
          if (this.events[i].t === e.t && this.events[i].label === e.label) return;   // replay
        }
        this.events = this.events.concat([e]);
        this.tick++;
      },
      // Incremental front for deriveNetEvents: a push adds ONE sample, so only
      // that sample needs deriving — re-deriving all 8,640 on every push was the
      // page's one O(n)-per-10 s cost. The cache resumes from the last sample
      // it processed (found by identity from the tail, so head trimming does not
      // invalidate it); a change to the known events resets it, since those
      // suppress derived ticks retroactively (RECENT_USER_MS around each).
      deriveNetEventsIncremental: function (samples, known) {
        var c = this._derived;
        if (c && c.known === known && c.knownLen === known.length && c.lastSample &&
            samples.length && samples[samples.length - 1] !== c.lastSample) {
          var i = samples.length - 1;
          while (i >= 0 && samples[i] !== c.lastSample) i--;
          if (i >= 0) {
            var r = this.deriveNetEvents(samples, known, { from: i + 1, last: c.last, out: c.out });
            var cutT = samples[0].t;
            c.out = r.out.filter(function (e) { return e.t >= cutT; });
            c.last = r.last; c.lastSample = samples[samples.length - 1];
            return c.out.slice();
          }
        }
        if (c && c.known === known && c.knownLen === known.length && c.lastSample &&
            samples.length && samples[samples.length - 1] === c.lastSample) return c.out.slice();
        var full = this.deriveNetEvents(samples, known, { withState: true });
        this._derived = { known: known, knownLen: known.length, out: full.out, last: full.last,
                          lastSample: samples.length ? samples[samples.length - 1] : null };
        return full.out.slice();
      },
      // pure: derive net (handover/failover) events from consecutive samples,
      // suppressing any within RECENT_USER_MS of a known user/watchdog event so a
      // change WE applied isn't double-counted as a network event.
      // With `state` ({from, last, out} or {withState:true}) it resumes from a
      // prior run and returns {out, last}; without it, the plain event array.
      deriveNetEvents: function (samples, known, state) {
        var out = (state && state.out) ? state.out.slice() : [], last = (state && state.last) || null;
        var start = (state && state.from) || 0;
        var recentUser = function (t) {
          for (var i = 0; i < known.length; i++)
            if (Math.abs(known[i].t - t) <= RECENT_USER_MS &&
                (known[i].kind === "user" || known[i].kind === "dog")) return true;
          return false;
        };
        // Topology signature of a sample: slot + serving cell + RAT + the PCC's
        // band/pci/arfcn. A no-service sample (null id) has NO signature and can
        // neither start nor end a handover — an outage is a gap, not an event.
        // SCC add/remove (CA) is deliberately NOT a handover — and GL reports a
        // CA add/drop on the SAME cell as network_type 4 <-> 41 (LTE <-> LTE+),
        // so that flip is collapsed before signing or every CA change would
        // read as a "Handover … (carrier change)".
        var pcc = function (x) { return (Array.isArray(x.signals) && x.signals[0]) || x; };
        var ratKey = function (x) {
          var nt = x.network_type;
          if (nt === 41 || nt === "41") nt = 4;
          if (nt != null) return String(nt);
          return String(x.mode || "").replace(/\+$/, "");
        };
        var sig = function (x) {
          if (x.id == null) return null;
          var c = pcc(x);
          return [x.id, ratKey(x), c.band, c.pci, c.earfcn != null ? c.earfcn : x.tx_channel].join(":");
        };
        for (var i = start; i < samples.length; i++) {
          var s = samples[i];
          if (last && !recentUser(s.t)) {
            if (String(s.slot) !== String(last.slot)) {
              out.push({ t: s.t, kind: "net", label: "Failover",
                detail: "Data now on SIM " + s.slot + (s.carrier ? " · " + s.carrier : "") });
              // The slot changed: this sample is the new baseline, registered
              // or not. Keeping the old slot's cell as `last` would re-compare
              // every not-yet-registered sample on the new slot against it and
              // emit the same failover once per 10 s tick.
              last = s;
              continue;
            } else {
              var a = sig(last), b = sig(s);
              if (a && b && a !== b) {
                var fmt = function (x) {
                  var c = pcc(x);
                  return (c.band != null ? ((/NR5G/.test(x.mode || "") ? " n" : " B") + c.band) : "");
                };
                out.push({ t: s.t, kind: "net", label: "Handover",
                  detail: "Cell " + last.id + " → " + s.id + fmt(s) +
                          (b.split(":")[0] === a.split(":")[0] ? " (carrier change)" : "") });
              }
            }
          }
          // A no-service sample keeps `last` (so the next registered sample
          // compares against the pre-outage cell) but never emits.
          if (s.id != null) last = s; else if (!last) last = s;
        }
        if (state) return { out: out, last: last };
        return out;
      },

      measure: function () {
        if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
          this.width = this.$refs.lanes.clientWidth;
      },
      // skew-corrected box-now: server clock advanced by browser elapsed time.
      // Before the first fetch, fall back to the local clock (Date is universal).
      nowMs: function () {
        if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
        return Date.now();
      },
      qFromLevel: function (l) { return ({1:"poor",2:"fair",3:"good",4:"excellent"})[l] || "none"; },
      qColor: function (q) {
        return ({ poor:"var(--error)", fair:"var(--warning)", good:"var(--info-hover)",
          excellent:"var(--success)", none:"var(--text-hint)" })[q];
      },
      clock: function (t) {
        var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getHours()) + ":" + p(d.getMinutes());
      },
      freqOf: function (b) { return FREQ_N[b]; },
      bandLabel: function (s) {
        var pre = /NR5G/.test(s.mode || "") ? "n" : "B";
        return (s.band == null || s.band === "") ? "—" : pre + s.band;
      },

      mOf: function (t) { return -((this.nowMs() - t) / 60000); },
      xOf: function (m) {
        var plotW = this.width - PADL - PADR;
        return PADL + (m + this.winW) / this.winW * plotW;
      },
      winSamples: function () {
        var cutoff = this.nowMs() - this.winW * 60000, self = this;
        var win = this.samples.filter(function (s) { return s.t >= cutoff; })
          .map(function (s) { return Object.assign({ m: self.mOf(s.t) }, s); });
        // The draw + bus code walk this in array order and connect consecutive
        // points, so they REQUIRE ascending t. Incremental polling builds
        // this.samples with .concat(), which can leave it out of order or with
        // duplicate timestamps (a full/incremental poll race, or a re-fetch with
        // a stale `since`) — a backward point then draws one long line jumping
        // across the whole plot. Sort ascending and drop duplicate t here, at the
        // single choke point every consumer goes through.
        win.sort(function (a, b) { return a.t - b.t; });
        var out = [], prev = null;
        for (var i = 0; i < win.length; i++) {
          if (prev !== null && win[i].t === prev) continue;   // keep first of a dup t
          out.push(win[i]); prev = win[i].t;
        }
        return out;
      },
      // Fixed base domain from L.dom, expanded for out-of-range samples in `ss`
      // (window samples). Never shrinks to the series min/max — in-range data
      // keeps the absolute field-test scale. Pass `ss` once per render so legend
      // + y-map share one pass over the same array.
      domainFor: function (L, ss) {
        var d0 = L.dom[0], d1 = L.dom[1], key = L.key;
        for (var i = 0; i < ss.length; i++) {
          var v = ss[i][key];
          if (v == null || v === "" || isNaN(v)) continue;
          v = +v;
          if (v < d0) d0 = v;
          if (v > d1) d1 = v;
        }
        return [d0, d1];
      },
      // Y-axis tick values, top→bottom inclusive. Evenly spaced across the
      // effective domain (which may have expanded past the metric's fixed base).
      yTicks: function (d0, d1) {
        var out = [], n = Y_INTERVALS, span = d1 - d0;
        for (var i = 0; i <= n; i++) out.push(d1 - (span * i) / n);
        return out;
      },
      fmtTick: function (v) {
        if (v == null || isNaN(v)) return "";
        var r = Math.round(v);
        return Math.abs(v - r) < 0.05 ? String(r) : v.toFixed(1);
      },
      // Paint one metric's y-axis into `kids`. `side` is "left" (RSRP) or
      // "right" (SINR). Only the left axis draws interior gridlines — two sets
      // at different absolute positions would fight, and RSRP is the headline.
      // The two axes do NOT share a scale; colour + name + unit make that explicit.
      paintYAxis: function (h, kids, opts) {
        var self = this;
        var d0 = opts.d0, d1 = opts.d1, span = d1 - d0;
        var plotTop = opts.plotTop, plotBot = opts.plotBot, W = opts.W;
        var left = opts.side === "left";
        var xLab = left ? PADL - 5 : W - PADR + 5;
        var anchor = left ? "end" : "start";
        var yOf = function (v) {
          if (!span) return plotTop + PLOT_H / 2;
          return plotBot - (Math.max(d0, Math.min(d1, v)) - d0) / span * PLOT_H;
        };
        // Metric name sits ABOVE the plot frame in the axis gutter so the
        // column reads as "RSRP · dBm" / "SINR · dB" without scanning the legend.
        kids.push(h("text", { attrs: {
          x: xLab, y: plotTop - 6, "text-anchor": anchor, "font-size": 9.5,
          "font-weight": 600, fill: opts.color,
          "font-family": "var(--mono,ui-monospace,monospace)"
        } }, opts.name));
        self.yTicks(d0, d1).forEach(function (tv, i, arr) {
          var yy = yOf(tv);
          if (left && i > 0 && i < arr.length - 1) {
            kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yy, y2: yy,
              stroke: "var(--divider)", "stroke-width": 1, "stroke-dasharray": "2 3" } }));
          }
          var dy = i === 0 ? 10 : (i === arr.length - 1 ? -3 : 3);
          kids.push(h("text", { attrs: {
            x: xLab, y: yy + dy, "text-anchor": anchor, "font-size": 9.5,
            fill: opts.color,
            "font-family": "var(--mono,ui-monospace,monospace)"
          } }, self.fmtTick(tv)));
        });
        // Unit under the ceiling tick so it isn't repeated on every label.
        kids.push(h("text", { attrs: {
          x: xLab, y: plotTop + 20, "text-anchor": anchor, "font-size": 8,
          fill: "var(--text-badge)",
          "font-family": "var(--mono,ui-monospace,monospace)"
        } }, opts.unit));
      },
      winEvents: function () {
        var cutoff = this.nowMs() - this.winW * 60000, self = this;
        return this.allEvents.filter(function (e) { return e.t >= cutoff; })
          .map(function (e) { return Object.assign({ m: self.mOf(e.t) }, e); });
      },
      nearestSample: function (m) {
        var ss = this.winSamples(); if (!ss.length) return null;
        var best = ss[0];
        for (var i = 1; i < ss.length; i++)
          if (Math.abs(ss[i].m - m) < Math.abs(best.m - m)) best = ss[i];
        return best;
      },
      busRuns: function (key) {
        var ss = this.winSamples(), runs = [], self = this;
        var label = function (s) {
          return key === "band" ? self.bandLabel(s)
            : key === "id" ? (s.id == null ? "—" : String(s.id))
            : (s.carrier ? s.carrier + " · SIM " + s.slot : "SIM " + s.slot);
        };
        for (var i = 0; i < ss.length; i++) {
          var v = label(ss[i]), lastRun = runs[runs.length - 1];
          if (lastRun && lastRun.v === v) lastRun.m1 = ss[i].m;
          else { if (lastRun) lastRun.m1 = ss[i].m; runs.push({ v: v, m0: ss[i].m, m1: ss[i].m, s: ss[i] }); }
        }
        if (runs.length) runs[runs.length - 1].m1 = 0;
        return runs;
      },

      // ---- interaction ----
      mFromEvent: function (e) {
        var el = this.$refs.lanes; if (!el) return null;
        var r = el.getBoundingClientRect(); if (!r.width) return null;
        // clientX is CSS px within the container; the SVG scales its viewBox
        // (this.width user-units) to the container's rendered width (width:100%).
        // Convert CSS px -> viewBox units before applying the plot geometry, so
        // the cursor tracks the mouse even when this.width != rendered width
        // (e.g. embedded, before measure() catches up). Otherwise the drawn line
        // (xOf, in viewBox units) drifts right of the pointer.
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
      setRange: function (w) {
        this.winW = w; this.pinnedM = null; this.cursor = null;
        // Backfill only when the new window reaches earlier than we've loaded; a
        // narrower range just re-filters the samples already in memory.
        // nowMs() is skew-corrected to the box after the first reply, and
        // loadedFrom is box-derived too, so this compares like with like.
        var cutoff = this.nowMs() - w * 60000;
        if (this.loadedFrom == null || cutoff < this.loadedFrom - 1000) this.fetchHistory({ window: w });
      },
      parseHash: function () {
        if (typeof window === "undefined" || !window.location) return;
        var q = {};
        (window.location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
          var p = kv.split("="); if (p[0]) q[p[0]] = p[1];
        });
        var w = parseInt(q.w, 10);
        if ([15, 60, 360, 1440].indexOf(w) !== -1) this.winW = w;
        var m = parseFloat(q.m);
        if (!isNaN(m)) this.pinnedM = this.cursor = this.clampM(m);
      },

      // ---- render helpers ----
      renderLanes: function (h) {
        var self = this, W = this.width, kids = [];
        var ss = this.winSamples();
        // Resolve each metric's domain ONCE for this render — legend labels and
        // y-mapping must agree, and walking samples thrice would re-expand thrice.
        var doms = LINES.map(function (L) { return self.domainFor(L, ss); });

        // ---- legend: one swatch + name + domain range per metric. RSRP has a
        // left y-axis and SINR a right one (each in its own colour/unit); RSRQ
        // stays legend + hover only — three absolute scales can't all get an
        // axis without turning the plot into a muddle. Legend shows the
        // *effective* domain (base, possibly expanded).
        var lx = PADL;
        LINES.forEach(function (L, i) {
          var dom = doms[i];
          var lab = L.label + "  " + dom[0] + "…" + dom[1];
          kids.push(h("rect", { attrs: { x: lx, y: 3, width: 13, height: 3, rx: 1.5, fill: L.color } }));
          kids.push(h("text", { attrs: { x: lx + 18, y: 9, "font-size": 9.5,
            fill: "var(--text-badge)" } }, lab));
          lx += 18 + String(lab).length * 5.7 + 20;
        });

        // ---- one shared plot rectangle; each metric normalized into it.
        var plotTop = 22, plotBot = plotTop + PLOT_H;
        [plotTop, plotBot].forEach(function (yy) {
          kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yy, y2: yy,
            stroke: "var(--divider)", "stroke-width": 1 } }));
        });

        // Dual y-axes: RSRP left (primary/dBm, draws the interior grid), SINR
        // right (success/dB, labels only). Same pixel height, different domains
        // — colour + name + unit keep them from looking like one shared scale.
        self.paintYAxis(h, kids, {
          side: "left", d0: doms[0][0], d1: doms[0][1],
          name: "RSRP", color: LINES[0].color, unit: "dBm",
          plotTop: plotTop, plotBot: plotBot, W: W
        });
        self.paintYAxis(h, kids, {
          side: "right", d0: doms[1][0], d1: doms[1][1],
          name: "SINR", color: LINES[1].color, unit: "dB",
          plotTop: plotTop, plotBot: plotBot, W: W
        });

        LINES.forEach(function (L, i) {
          var d0 = doms[i][0], d1 = doms[i][1], span = d1 - d0;
          var yv = function (v) {
            if (!span) return plotTop + PLOT_H / 2;
            // Still clamp to the *effective* domain (which already expanded to
            // cover every sample) so a NaN/outlier can't paint outside the frame.
            return plotBot - (Math.max(d0, Math.min(d1, v)) - d0) / span * PLOT_H;
          };
          var d = "", pen = false, prevT = null;         // one path per metric
          ss.forEach(function (s) {
            var v = s[L.key];
            // Break the pen on a missing reading AND on a time hole: no sample
            // for over GAP_MS (collector down, outage) is a gap in the data, and
            // drawing a straight bridge across it would hide the outage as a
            // flat "no fluctuation" segment — the strip already breaks there.
            if (v == null) { pen = false; prevT = s.t != null ? s.t : prevT; return; }
            if (prevT != null && s.t != null && s.t - prevT > GAP_MS) pen = false;
            d += (pen ? "L" : "M") + self.xOf(s.m).toFixed(1) + " " + yv(v).toFixed(1) + " ";
            pen = true; prevT = s.t != null ? s.t : prevT;
          });
          if (d) kids.push(h("path", { attrs: { fill: "none", stroke: L.color,
            "stroke-width": 1.75, "stroke-linejoin": "round", "stroke-linecap": "round",
            d: d.trim() } }));
        });

        // ---- buses below the plot (unchanged layout, new origin).
        var y = plotBot + 12;
        BUSES.forEach(function (B) {
          kids.push(h("text", { attrs: { x: 6, y: y + BUS_H / 2 + 3, "font-size": 9,
            fill: "var(--text-badge)" } }, B.label));
          self.busRuns(B.key).forEach(function (r) {
            var x0 = Math.max(PADL, self.xOf(r.m0)), x1 = Math.min(W - PADR, self.xOf(r.m1));
            var w = x1 - x0; if (w < 1.2) return;
            kids.push(h("rect", { attrs: { x: x0.toFixed(1), y: y, width: w.toFixed(1), height: BUS_H,
              rx: 2, fill: "var(--background-title,#f2f2f7)", stroke: "var(--border)", "stroke-width": 1 } }));
            var lab = r.v;
            if (B.key === "band" && self.freqOf(r.s.band)) lab += " · " + self.freqOf(r.s.band) + " MHz";
            if (w > String(lab).length * 6.2 + 10)
              kids.push(h("text", { attrs: { x: ((x0 + x1) / 2).toFixed(1), y: y + BUS_H / 2 + 3.5,
                "text-anchor": "middle", "font-size": 10, fill: "var(--text-weak)",
                "font-family": "var(--mono,ui-monospace,monospace)" } }, lab));
          });
          y += BUS_H + 7;
        });
        var evTop = plotTop, evBot = y - 7;
        this.winEvents().forEach(function (e) {
          var col = e.kind === "user" ? "var(--primary)" : e.kind === "dog" ? "var(--warning)" : "var(--text-hint)";
          var ex = self.xOf(e.m);
          kids.push(h("line", { attrs: { x1: ex.toFixed(1), x2: ex.toFixed(1), y1: evTop, y2: evBot,
            stroke: col, "stroke-width": 1, "stroke-dasharray": "3 3" } }));
        });
        var step = TICKSTEP[this.winW];
        for (var m = -this.winW; m <= 0; m += step) {
          var xx = self.xOf(m);
          kids.push(h("line", { attrs: { x1: xx.toFixed(1), x2: xx.toFixed(1), y1: y, y2: y + 4,
            stroke: "var(--divider)", "stroke-width": 1 } }));
          kids.push(h("text", { attrs: { x: xx.toFixed(1), y: y + 14, "text-anchor": "middle",
            "font-size": 9, fill: "var(--text-badge)", "font-family": "var(--mono,ui-monospace,monospace)" } },
            this.clock(this.nowMs() + m * 60000)));
        }
        y += 22;
        if (this.cursor != null) {
          var cx = this.xOf(this.cursor);
          kids.push(h("line", { attrs: { x1: cx.toFixed(1), x2: cx.toFixed(1), y1: evTop, y2: evBot,
            stroke: this.pinnedM != null ? "var(--primary)" : "var(--text-weak)",
            "stroke-width": this.pinnedM != null ? 1.25 : 1 } }));
        }
        // preserveAspectRatio:none — STRETCH the viewBox to fill the container
        // width (CSS width:100%). The default "meet" would uniformly scale and
        // CENTRE the content (elemH == viewBox H makes its scale 1), so whenever
        // this.width != the rendered width the cursor line lags the pointer
        // toward both edges. "none" keeps X mapping = rendered/viewBox, matching
        // mFromEvent's inverse. (Y is unaffected: elemH == viewBox H already.)
        return h("svg", { ref: "svg", attrs: { viewBox: "0 0 " + W + " " + y,
          width: W, height: y, preserveAspectRatio: "none" } }, kids);
      },
      sliceReadout: function (h) {
        var s = this.nearestSample(this.cursor); if (!s) return null;
        var self = this, cx = this.xOf(s.m), near = null, evs = this.winEvents();
        for (var i = 0; i < evs.length; i++)
          if (Math.abs(this.xOf(evs[i].m) - cx) < 6) near = evs[i];
        var val = function (v) { return (v == null) ? "—" : String(v); };
        var row = function (k, v, u, q) {
          return h("tr", [h("td", { staticClass: "k" }, k),
            h("td", { staticClass: "v", staticStyle: q ? { color: self.qColor(q) } : {} },
              val(v) + (u ? " " + u : ""))]);
        };
        var rows = [
          row("RSRP", s.rsrp, "dBm", this.qFromLevel(s.rsrp_level)),
          row("SINR", s.sinr, "dB", this.qFromLevel(s.sinr_level)),
          row("RSRQ", s.rsrq, "dB", this.qFromLevel(s.rsrq_level)),
          row("Band", this.bandLabel(s), this.freqOf(s.band) ? "· " + this.freqOf(s.band) + " MHz" : "", null),
          row("Cell", s.id == null ? "—" : s.id, "", null),
          row("SIM", (s.carrier || "SIM") + " · " + s.slot, "", null)
        ];
        var kids = [h("div", { staticClass: "t" },
          this.clock(this.nowMs() + s.m * 60000) + (this.pinnedM != null ? " · pinned" : ""))];
        if (near) kids.push(h("div", { staticClass: "e",
          staticStyle: { color: near.kind === "user" ? "var(--primary)"
            : near.kind === "dog" ? "var(--warning-hover,#c4851c)" : "var(--text-weak)" } },
          near.label + " — " + near.detail));
        kids.push(h("table", rows));
        // Fixed at the plot's top-left with a fixed size (see .mmt-tip CSS) — it no
        // longer follows the cursor or resizes to its content, so it can't jitter.
        return h("div", { staticClass: "mmt-tip" }, kids);
      },
      renderLog: function (h) {
        var self = this;
        var evs = this.allEvents.slice().reverse();
        var rows = evs.map(function (e, i) {
          var src = { user: "User", dog: "Watchdog", net: "Network" }[e.kind];
          return h("tr", { key: i }, [
            h("td", { staticClass: "tm" }, self.clock(e.t)),
            h("td", [h("span", { staticClass: "mmt-chip " + e.kind }, src)]),
            h("td", { staticStyle: { fontWeight: "600", color: "var(--text-title)" } }, e.label),
            h("td", { staticStyle: { color: "var(--text-weak)" } }, e.detail || "")
          ]);
        });
        return h("div", { staticClass: "mmt-card" }, [
          h("div", { staticClass: "mmt-head" }, [
            h("span", { staticClass: "mmt-title" }, "Event log"),
            h("span", { staticClass: "mmt-hint" }, "newest first")
          ]),
          rows.length
            ? h("table", { staticClass: "mmt-log" }, [
                h("thead", [h("tr", [h("th", "Time"), h("th", "Source"), h("th", "Event"), h("th", "Detail")])]),
                h("tbody", rows)])
            : h("div", { staticClass: "mmt-empty" }, "No band changes, handovers or failovers recorded yet.")
        ]);
      },
      renderPage: function (h) {
        var self = this;
        var hasData = this.winSamples().length > 0;
        var head = h("div", { staticClass: "mmt-head" }, [
          this.embedded ? null : h("button", { staticClass: "mmt-crumb", on: { click: function () {
            if (self.$router) self.$router.push("/mudimodem"); } } }, "← Modem"),
          h("span", { staticClass: "mmt-title" }, "Tracking"),
          h("span", { staticClass: "mmt-hint" }, "one clock, all three metrics — hover for a slice, click to pin"),
          h("span", { staticClass: "mmt-sp" }),
          h("span", { staticClass: "mmt-seg" }, RANGES.map(function (r) {
            return h("button", { key: r[0], staticClass: self.winW === r[0] ? "on" : "",
              on: { click: function () { self.setRange(r[0]); } } }, r[1]);
          })),
          h("button", { staticClass: "mmt-live" + (self.live ? "" : " off"),
            on: { click: function () { self.live = !self.live; } } },
            [h("span", { staticClass: "d" }), self.live ? "LIVE" : "PAUSED"])
        ]);
        var body;
        if (hasData) {
          body = h("div", { ref: "lanes", staticClass: "mmt-lanes",
            on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick } },
            [this.renderLanes(h), this.cursor != null ? this.sliceReadout(h) : null]);
        } else {
          var msg = this.err ? "Couldn't load history: " + this.err
            : this.loading ? "Loading history from the router…"
            : "No samples yet. The collector runs on the router and gathers continuously — "
              + "check back in a minute, or confirm the mudimodem-collectd service is running.";
          body = h("div", { staticClass: "mmt-empty" }, msg);
        }
        var foot = h("div", { staticClass: "mmt-foot" }, [
          h("span", { staticClass: "mmt-lg" }, "■ User"),
          h("span", { staticClass: "mmt-lg" }, "▲ Watchdog"),
          h("span", { staticClass: "mmt-lg" }, "○ Network"),
          h("span", "a tick marks the moment — everything to its right is the radio's answer")
        ]);
        return h("div", { staticClass: "mmt" }, [
          h("div", { staticClass: "mmt-card" }, [head, body, foot]),
          this.renderLog(h)
        ]);
      },

      injectStyle: function () {
        if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
        var css =
          '.mmt{color:var(--text-regular);font-variant-numeric:tabular-nums}' +
          '.mmt-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin-bottom:11px}' +
          '.mmt-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px 10px}' +
          '.mmt-title{font-size:14px;font-weight:600;color:var(--text-title)}' +
          '.mmt-hint{font-size:11.5px;color:var(--text-badge)}.mmt-sp{flex:1}' +
          '.mmt-crumb{background:none;border:0;font:inherit;font-size:12px;color:var(--primary);cursor:pointer;padding:0}' +
          '.mmt-seg{display:inline-flex;border:1px solid var(--border);border-radius:3px;overflow:hidden}' +
          '.mmt-seg button{font:inherit;font-size:11.5px;background:transparent;border:0;padding:5px 12px;cursor:pointer;color:var(--text-weak);border-right:1px solid var(--border)}' +
          '.mmt-seg button:last-child{border-right:0}.mmt-seg button.on{background:var(--primary);color:#fff;font-weight:600}' +
          '.mmt-live{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--success);cursor:pointer;background:none;border:1px solid var(--border);border-radius:3px;padding:5px 10px}' +
          '.mmt-live .d{width:7px;height:7px;border-radius:50%;background:var(--success)}' +
          '.mmt-live.off{color:var(--text-badge)}.mmt-live.off .d{background:var(--text-hint)}' +
          '.mmt-lanes{position:relative;padding:2px 0 6px;cursor:crosshair}.mmt-lanes svg{display:block;width:100%;overflow:visible}' +
          '.mmt-foot{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:8px 14px 11px;border-top:1px solid var(--divider);font-size:11px;color:var(--text-badge)}' +
          '.mmt-lg{display:inline-flex;align-items:center;gap:5px}' +
          '.mmt-tip{position:absolute;top:26px;left:8px;pointer-events:none;z-index:5;background:var(--background-card);border:1px solid var(--border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:8px 10px;width:184px;height:158px;overflow:hidden}' +
          '.mmt-tip .t{font-size:10.5px;color:var(--text-badge);margin-bottom:5px}' +
          '.mmt-tip .e{font-size:11px;font-weight:600;margin:-1px 0 5px;padding-bottom:5px;border-bottom:1px solid var(--divider);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
          '.mmt-tip table{border-collapse:collapse;width:100%}.mmt-tip td{padding:1px 0;font-size:11.5px}' +
          '.mmt-tip td.k{color:var(--text-badge);font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding-right:10px}' +
          '.mmt-tip td.v{font-weight:600;color:var(--text-title);text-align:right;white-space:nowrap}' +
          '.mmt-empty{padding:30px 14px;text-align:center;color:var(--text-hint);font-size:12.5px;line-height:1.6}' +
          '.mmt-log{width:100%;border-collapse:collapse}' +
          '.mmt-log th{font-size:10px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge);text-align:left;padding:7px 14px 6px;border-bottom:1px solid var(--divider)}' +
          '.mmt-log td{font-size:12px;padding:6px 14px;border-bottom:1px solid var(--divider);color:var(--text-regular)}' +
          '.mmt-log td.tm{font-family:var(--mono,ui-monospace,monospace);font-size:11px;color:var(--text-weak);white-space:nowrap}' +
          '.mmt-chip{display:inline-block;font-size:10px;font-weight:600;border-radius:2px;padding:1px 6px}' +
          '.mmt-chip.user{background:var(--primary-background,#eef1fe);color:var(--primary)}' +
          '.mmt-chip.dog{background:var(--warning-background,#fef6e9);color:var(--warning-hover,#c4851c)}' +
          '.mmt-chip.net{background:var(--background-title,#f2f2f7);color:var(--text-badge)}' +
          '@media(max-width:720px){.mmt-hint{display:none}}';
        var el = document.createElement("style");
        el.id = this.styleId; el.textContent = css;
        document.head.appendChild(el);
      }
    },

    render: function (h) { return this.renderPage(h); }
  };
  return component;
})();
