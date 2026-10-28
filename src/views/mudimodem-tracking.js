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
  // Attribution window around a user/watchdog event: a topology change inside
  // it is OURS, not the network's. 4.8's symmetric 8 s was sized for a 4 s
  // cadence and no redial. On 4.10 the collector samples every 10 s and every
  // band apply / cell lock / revert REDIALS (the link drops for a few
  // seconds), so the first registered sample after the change lands up to a
  // tick + the redial + a tick later — routinely >8 s, and it was logged as a
  // "Handover". PRE covers a sample taken while the backend was still inside
  // the write (the event is stamped after it returns, floored to the second).
  // POST = ~20 s redial/re-register + two 10 s ticks; a genuine handover later
  // than that is still reported. A confirmation ("Kept") touches nothing on
  // the modem, so it only gets the PRE slack on either side.
  var USER_PRE_MS = 5000, USER_POST_MS = 40000;
  var NO_RADIO_EVENT = { Kept: 1 };
  var STALL_MS = 45000;            // no push for this long => one catch-up fetch
  var HOLE_MS = 25000;             // a push landing this long after the last sample => backfill the hole
  var GAP_MS = 45000;              // no sample for this long => the lanes break (same rule as the strip)
  // A failed WINDOW load (the preload on open, or a wider range) is retried
  // with a bounded backoff: 2, 4, 8, 16, then every 30 s until it lands.
  var RETRY_BASE_MS = 2000, RETRY_MAX_MS = 30000;
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
      // pinnedT: the pinned slice as an ABSOLUTE box-clock sample time (never
      // minutes-relative-to-now, which slid to a newer sample on every push).
      // cursor: the hover position, minutes relative to the view's now.
      // frozenAt: box-clock "now" of the view while PAUSED (null = live).
      return { winW: 15, pinnedT: null, hashPinM: null, tick: 0, live: true, frozenAt: null,
        width: 900, styleId: "mmt-css", cursor: null, poll: null, pushSeenAt: 0,
        samples: [], events: [], lastT: 0, serverNow: 0, serverNowAt: 0,
        loading: true, err: "", fetching: false,
        // how far back we've fetched (epoch ms, BOX clock); null = nothing yet.
        // A larger range only refetches when it reaches earlier than this.
        // pendingWindow holds a range request (in minutes) that arrived while a
        // fetch was in flight.
        loadedFrom: null, pendingWindow: null,
        // preloaded: a WINDOW load has succeeded at least once. Pushes alone
        // never set it — they only carry what happened after the page opened.
        // loadFails/retryMs drive the backoff and the honest message.
        // missingSince: the start of a tail (hole backfill) that failed or
        // was dropped mid-flight; the next push asks for it again.
        preloaded: false, loadFails: 0, retryMs: 0, missingSince: null };
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
      // Torn-down flag: retries are only scheduled while this is true, and a
      // late reply after beforeDestroy changes nothing.
      this._alive = true;
      this.fetchHistory();                        // initial: just the visible window
      // No polling: samples and events arrive as pushes. The timer is only a
      // stall guard — when no push has landed for a while (collector restart,
      // websocket reconnect) it fetches the tail once. It runs while PAUSED
      // too: pausing freezes the VIEW, collection carries on underneath.
      this.pushSeenAt = Date.now();
      this.poll = setInterval(function () {
        if (Date.now() - self.pushSeenAt > STALL_MS) self.fetchHistory({ since: self.lastT, merge: true });
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
      this._alive = false;
      if (this.poll) clearInterval(this.poll);
      if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
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
      //
      // Every reply MERGES into what is held (dedupe by t, sort) — including
      // the window preload: pushes may have landed while it was in flight (or
      // while it was failing and being retried), and replacing would drop them.
      //
      // ⚠️ rpcSilent RESOLVES null on every failure and never rejects, so the
      // failure path lives inside .then (a .catch here was dead code once, and
      // with it a failed preload was never retried nor reported).
      fetchHistory: function (opts) {
        opts = opts || {};
        var self = this;
        if (typeof window === "undefined" || !window.$axios) { self.loading = false; return; }
        // An incremental poll rides on lastT; everything else asks for a window.
        // lastT is 0 until the first sample lands (collector just started, or an
        // empty window) — since=0 would make the box decode the whole retained
        // 24h file on every 10s tick, so fall back to the window there too.
        var incremental = (opts.since != null && opts.since > 0);
        // One fetch at a time. On a slow load the 10s poll would otherwise fire
        // before it settles and (with a stale lastT) re-fetch + concat overlapping
        // data. A range request that lands mid-flight is remembered, not dropped;
        // so is the start of a tail (a hole backfill) — the next push asks again.
        if (self.fetching) {
          if (opts.window != null && !opts.merge)
            self.pendingWindow = (self.pendingWindow == null) ? opts.window : Math.max(self.pendingWindow, opts.window);
          else if (incremental) self.noteMissing(opts.since);
          return;
        }
        self.fetching = true;
        var winMs = (opts.window || self.winW) * 60000;
        var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
        this.rpcSilent("get_history", params)
          .then(function (res) {
            self.fetching = false;
            if (self._alive === false) return;      // torn down while in flight
            if (res) {
              self.mergeHistory(res.samples || [], res.events || []);
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
              if (incremental) {
                if (self.missingSince != null && opts.since <= self.missingSince) self.missingSince = null;
              } else {
                // The window is in: stop retrying, and re-anchor a #m= pin on
                // the box clock now that we have it.
                self.preloaded = true; self.loadFails = 0; self.retryMs = 0;
                if (self._retryTimer) { clearTimeout(self._retryTimer); self._retryTimer = null; }
                if (self.hashPinM != null) {
                  var near = self.nearestByT(self.samples, self.serverNow + self.hashPinM * 60000);
                  if (near) self.pinnedT = near.t;
                  self.hashPinM = null;
                }
              }
              self.err = ""; self.tick++;
            } else if (incremental) {
              self.noteMissing(opts.since);           // the next push asks again
            } else {
              // A WINDOW load failed. Unretried, the first push then set the
              // cursor and the page showed only post-open samples forever.
              self.loadFails++;
              self.retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, self.loadFails - 1));
              self.err = "couldn't reach the router";
              self.scheduleRetry();
              self.tick++;
            }
            self.loading = false;
            self.drainPending();
          });
      },
      // Merge a reply into the held samples/events: skip what is already held
      // (a push that landed meanwhile, or the one that revealed a hole) and keep
      // time order — a hole backfill or a late preload is OLDER than the newest
      // pushed sample.
      mergeHistory: function (ns, ne) {
        var haveT = {};
        for (var i = 0; i < this.samples.length; i++) haveT[this.samples[i].t] = 1;
        var add = ns.filter(function (x) { return x && x.t && !haveT[x.t]; });
        if (add.length) {
          this.samples = this.samples.concat(add).sort(function (a, b) { return a.t - b.t; });
          // Inserted BEFORE the tail: the incremental derivation only knows how
          // to extend at the end, so rebuild it once.
          this._derived = null;
        }
        var haveE = {};
        for (var j = 0; j < this.events.length; j++) haveE[this.events[j].t + "|" + this.events[j].label] = 1;
        var addE = ne.filter(function (e) { return e && !haveE[e.t + "|" + e.label]; });
        if (addE.length) this.events = this.events.concat(addE);
      },
      noteMissing: function (since) {
        this.missingSince = (this.missingSince == null) ? since : Math.min(this.missingSince, since);
      },
      // One pending retry at a time, only while mounted. It asks for whatever
      // the view needs NOW (the range may have changed since the failure).
      scheduleRetry: function () {
        var self = this;
        if (!this._alive || this._retryTimer) return;
        this._retryTimer = setTimeout(function () {
          self._retryTimer = null;
          if (self._alive) self.fetchHistory({ window: self.neededWindowMin(self.winW) });
        }, this.retryMs || RETRY_BASE_MS);
      },
      drainPending: function () {
        if (this.pendingWindow == null) return;
        var w = this.pendingWindow; this.pendingWindow = null;
        this.fetchHistory({ window: w });
      },
      // A live collector sample (mudimodem.collect push): append it exactly as
      // an incremental fetch would have. The box stamped `t`, so it also
      // advances the box-clock reference without a round-trip. While PAUSED it
      // is still collected — only the view is frozen (see viewNow).
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
        // A tail that failed (or was dropped mid-flight) earlier is asked again.
        var from = (prevT > 0 && s.t - prevT > HOLE_MS) ? prevT : null;
        if (this.missingSince != null) from = (from == null) ? this.missingSince : Math.min(from, this.missingSince);
        if (from != null) this.fetchHistory({ since: from, merge: true });
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
      // suppress derived ticks retroactively (the USER_PRE/POST_MS window).
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
      // suppressing any inside the attribution window of a known user/watchdog
      // event (USER_PRE_MS before .. USER_POST_MS after) so a change WE applied
      // isn't double-counted as a network event.
      // With `state` ({from, last, out} or {withState:true}) it resumes from a
      // prior run and returns {out, last}; without it, the plain event array.
      deriveNetEvents: function (samples, known, state) {
        var self = this;
        var out = (state && state.out) ? state.out.slice() : [], last = (state && state.last) || null;
        var start = (state && state.from) || 0;
        var recentUser = function (t) {
          for (var i = 0; i < known.length; i++) {
            var k = known[i];
            if (k.kind !== "user" && k.kind !== "dog") continue;
            var post = NO_RADIO_EVENT[k.label] ? USER_PRE_MS : USER_POST_MS;
            if (t >= k.t - USER_PRE_MS && t <= k.t + post) return true;
          }
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
                // The prefix follows the CARRIER's RAT (an EN-DC cell's LTE
                // anchor is B2, not "n2"), never the cell's mode.
                var fmt = function (x) {
                  var c = pcc(x);
                  return (c.band != null ? ((/NR5G/.test(self.carrierRat(x)) ? " n" : " B") + c.band) : "");
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
      // The VIEW's now: frozen at the moment PAUSED was pressed, the live box
      // clock otherwise. Everything drawn (window, x-axis, clock labels, slice)
      // is relative to this; collection keeps using the real clock.
      viewNow: function () { return this.frozenAt != null ? this.frozenAt : this.nowMs(); },
      // Minutes a window fetch must ask for so the VIEW's window is covered:
      // while paused the box has moved on past the frozen edge.
      neededWindowMin: function (w) {
        var extra = this.frozenAt != null ? Math.ceil((this.nowMs() - this.frozenAt) / 60000) : 0;
        return Math.min(1440, w + Math.max(0, extra));
      },
      togglePause: function () {
        if (this.live) { this.live = false; this.frozenAt = this.nowMs(); }
        else { this.live = true; this.frozenAt = null; }
        this.tick++;
      },
      // Samples collected after the freeze, waiting for RESUME. Walks the tail
      // only (the array is ascending).
      heldCount: function () {
        if (this.frozenAt == null) return 0;
        var n = 0;
        for (var i = this.samples.length - 1; i >= 0 && this.samples[i].t > this.frozenAt; i--) n++;
        return n;
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
      // The PRIMARY carrier's own RAT — "LTE" for an NSA anchor, while `mode`
      // is the cell's (NR5G-NSA). Same rule as the parent's servingRat():
      // pcc_rat (4.10 collector) -> signals[0].rat -> mode (older samples).
      carrierRat: function (s) {
        if (!s) return "";
        var sig = Array.isArray(s.signals) && s.signals[0];
        return s.pcc_rat || (sig && sig.rat) || s.mode || "";
      },
      bandLabel: function (s) {
        var pre = /NR5G/.test(this.carrierRat(s)) ? "n" : "B";
        return (s.band == null || s.band === "") ? "—" : pre + s.band;
      },

      mOf: function (t) { return -((this.viewNow() - t) / 60000); },
      xOf: function (m) {
        var plotW = this.width - PADL - PADR;
        return PADL + (m + this.winW) / this.winW * plotW;
      },
      winSamples: function () {
        var now = this.viewNow(), cutoff = now - this.winW * 60000;
        // While paused, anything stamped after the freeze is held back (it is
        // in this.samples, and shows on resume). Live, there is no upper bound:
        // get_history's `now` is floored to the second, so the newest sample
        // can be stamped a few hundred ms "after" it.
        var top = this.frozenAt != null ? this.frozenAt : Infinity;
        var win = this.samples.filter(function (s) { return s.t >= cutoff && s.t <= top; })
          .map(function (s) { return Object.assign({ m: -((now - s.t) / 60000) }, s); });
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
        var now = this.viewNow(), cutoff = now - this.winW * 60000, self = this;
        var top = this.frozenAt != null ? this.frozenAt : Infinity;
        return this.allEvents.filter(function (e) { return e.t >= cutoff && e.t <= top; })
          .map(function (e) { return Object.assign({ m: self.mOf(e.t) }, e); });
      },
      // Closest sample to box time `t` in an ascending array, or null.
      nearestByT: function (ss, t) {
        if (!ss || !ss.length) return null;
        var best = ss[0];
        for (var i = 1; i < ss.length; i++)
          if (Math.abs(ss[i].t - t) < Math.abs(best.t - t)) best = ss[i];
        return best;
      },
      nearestSample: function (m) {
        return this.nearestByT(this.winSamples(), this.viewNow() + m * 60000);
      },
      // Where the slice line sits (minutes, view-relative): the pinned
      // sample's own time when pinned, the hover position otherwise.
      cursorM: function () {
        if (this.pinnedT != null) return this.mOf(this.pinnedT);
        return this.cursor;
      },
      // The sample the readout describes. A pin is an absolute SAMPLE time, so
      // it keeps describing that sample however many pushes land after it; it
      // shows nothing once that sample has left the visible window.
      focusSample: function () {
        if (this.pinnedT != null) {
          var pm = this.mOf(this.pinnedT);
          if (pm < -this.winW || pm > 0) return null;
          return this.nearestByT(this.winSamples(), this.pinnedT);
        }
        return this.cursor == null ? null : this.nearestSample(this.cursor);
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
          // A SIM change starts a new run even when the label matches (both
          // SIMs on n71): two radios are never one bar.
          var sameSim = i === 0 || String(ss[i].slot) === String(ss[i - 1].slot);
          if (lastRun && sameSim && lastRun.v === v) lastRun.m1 = ss[i].m;
          else { if (lastRun) lastRun.m1 = ss[i].m; runs.push({ v: v, m0: ss[i].m, m1: ss[i].m, s: ss[i] }); }
        }
        // The last run reaches "now" only while data is still arriving: past
        // the lanes' own GAP_MS with no sample, it ends at the last sample
        // rather than painting a bar through time we have nothing for.
        if (runs.length) {
          var lastS = ss[ss.length - 1];
          runs[runs.length - 1].m1 = (this.viewNow() - lastS.t > GAP_MS) ? lastS.m : 0;
        }
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
        if (this.pinnedT != null) return;
        var m = this.mFromEvent(e); if (m == null) return;
        this.cursor = this.clampM(m);
      },
      onLeave: function () { if (this.pinnedT == null) this.cursor = null; },
      onClick: function (e) {
        this.hashPinM = null;          // the user's own pin wins over a #m= link
        // A second click releases a VISIBLE pin; a pin whose sample has scrolled
        // out of the window is replaced instead (releasing an invisible pin
        // would read as a click that did nothing).
        if (this.pinnedT != null && this.focusSample()) { this.pinnedT = null; this.cursor = null; return; }
        var m = this.mFromEvent(e); if (m == null) return;
        m = this.clampM(m);
        // Pin the SAMPLE under the pointer, by its box time — not a minute
        // offset from now, which slid to a newer sample on every push.
        var s = this.nearestSample(m);
        this.pinnedT = s ? s.t : this.viewNow() + m * 60000;
        this.cursor = this.mOf(this.pinnedT);
      },
      setRange: function (w) {
        this.winW = w; this.pinnedT = null; this.hashPinM = null; this.cursor = null;
        // Backfill only when the new window reaches earlier than we've loaded; a
        // narrower range just re-filters the samples already in memory.
        // nowMs() is skew-corrected to the box after the first reply, and
        // loadedFrom is box-derived too, so this compares like with like.
        // While paused the window hangs off the frozen edge, not the live one.
        var cutoff = this.viewNow() - w * 60000;
        if (this.loadedFrom == null || cutoff < this.loadedFrom - 1000)
          this.fetchHistory({ window: this.neededWindowMin(w) });
      },
      parseHash: function () {
        if (typeof window === "undefined" || !window.location) return;
        var q = {};
        (window.location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
          var p = kv.split("="); if (p[0]) q[p[0]] = p[1];
        });
        var w = parseInt(q.w, 10);
        if ([15, 60, 360, 1440].indexOf(w) !== -1) this.winW = w;
        // #m= is minutes before now. It becomes an absolute pin right away on
        // the clock we have, and is re-anchored to the nearest SAMPLE on the
        // box clock once the window preload lands (fetchHistory).
        var m = parseFloat(q.m);
        if (!isNaN(m)) {
          m = this.clampM(m);
          this.hashPinM = m;
          this.pinnedT = this.viewNow() + m * 60000;
          this.cursor = m;
        }
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
          var d = "", pen = false, prevT = null, prevSlot = null;   // one path per metric
          ss.forEach(function (s) {
            var v = s[L.key];
            // A SIM change breaks the pen too: SIM1's last reading and SIM2's
            // first are two different radios, never one line.
            var slot = s.slot == null ? null : String(s.slot);
            if (prevSlot !== null && slot !== prevSlot) pen = false;
            prevSlot = slot;
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
            this.clock(this.viewNow() + m * 60000)));
        }
        y += 22;
        var cm = this.cursorM();
        if (cm != null && cm >= -this.winW && cm <= 0) {
          var cx = this.xOf(cm);
          kids.push(h("line", { attrs: { x1: cx.toFixed(1), x2: cx.toFixed(1), y1: evTop, y2: evBot,
            stroke: this.pinnedT != null ? "var(--primary)" : "var(--text-weak)",
            "stroke-width": this.pinnedT != null ? 1.25 : 1 } }));
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
        var s = this.focusSample(); if (!s) return null;
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
          this.clock(s.t) + (this.pinnedT != null ? " · pinned" : ""))];
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
        var self = this, top = this.frozenAt;
        // Frozen with the graph while PAUSED, so the two never disagree.
        var evs = (top == null ? this.allEvents.slice()
          : this.allEvents.filter(function (e) { return e.t <= top; })).reverse();
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
          // PAUSED freezes the view (window, axis, slice, log); pushes keep
          // being collected underneath and appear on resume.
          self.live ? null : h("span", { staticClass: "mmt-held" }, (function () {
            var n = self.heldCount();
            return n ? n + " new sample" + (n === 1 ? "" : "s") + " held — resume to show" : "view frozen";
          })()),
          h("button", { staticClass: "mmt-live" + (self.live ? "" : " off"),
            on: { click: function () { self.togglePause(); } } },
            [h("span", { staticClass: "d" }), self.live ? "LIVE" : "PAUSED"])
        ]);
        // How often the failed window load is being retried, as the code does it.
        var every = Math.round((this.retryMs || RETRY_BASE_MS) / 1000);
        var body, note = null;
        if (hasData) {
          body = h("div", { ref: "lanes", staticClass: "mmt-lanes",
            on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick } },
            [this.renderLanes(h), this.cursorM() != null ? this.sliceReadout(h) : null]);
          // Pushes are drawing, but the window before them never loaded: say
          // so, instead of passing off "since the page opened" as the history.
          if (this.loadFails > 0)
            note = h("div", { staticClass: "mmt-note" }, (this.preloaded
              ? "Couldn't load the wider range yet"
              : "Earlier history didn't load — showing live samples since the page opened")
              + "; retrying every " + every + " s.");
        } else {
          var msg = (this.loadFails > 0 && this.err)
              ? "Couldn't load history: " + this.err + " — retrying every " + every + " s."
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
          h("div", { staticClass: "mmt-card" }, [head, note, body, foot]),
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
          '.mmt-held{font-size:11px;color:var(--text-badge)}' +
          '.mmt-note{font-size:11.5px;color:var(--warning-hover,#c4851c);padding:0 14px 8px}' +
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
