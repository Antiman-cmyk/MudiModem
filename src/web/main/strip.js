// The status strip: RSRP trace (collector preload + pushes + backfill) and the mode / tower lock badges.
import { rpcSilent } from "../kit/rpc.js";
import { t } from "../kit/i18n.js";
export default {
  data() {
    return {
      // ---- status-strip trace: ONE source, the collector ----
      // mudimodem-collectd samples the modem every 10s and keeps 24h of history.
      // The strip PRELOADS the last 15 minutes once (get_history) and is then
      // fed LIVE by the collector's own pushes over the websocket
      // (mudimodem.collect) — no polling. A slow safety poll only fires when
      // no push has arrived for a while (collector restarting, ws hiccup).
      showGlossary: false,    // the "?" next to the RSRP label: what each reading means
      STRIP_MIN: 15,          // minutes of history the strip shows
      STRIP_POLL_MS: 30000,   // safety-poll cadence (only acts when pushes stalled)
      STRIP_STALL_MS: 45000,  // no push for this long => safety poll fetches the tail
      STRIP_GAP_MS: 45000,    // a hole wider than this breaks the line, not bridges it
      STRIP_HOLE_MS: 25000,   // a push landing this long after the last point => backfill the hole
      pushSeenAt: 0,          // browser clock of the last collector push
      hist: [],               // [{t, v, s}] oldest-first, BOX timestamps, rsrp + the sample's SIM slot
      histLastT: 0,           // newest t held — the incremental `since` cursor
      histPreloaded: false,   // the 15-min window has been fetched once (gates {since})
      histNow: 0,             // box clock as of the last reply
      histNowAt: 0,           // browser clock at that same instant (skew correction)
      histFetching: false,    // one strip fetch at a time
      histTimer: null,        // strip poll interval handle
    };
  },
  methods: {
    // --- network-type lock conflict ---------------------------------------
    // A cell/tower lock names a RAT (LTE or NR5G). If the network mode excludes
    // that RAT the lock is stranded: stored, reported, but inert (an LTE lock
    // under 5G-only never binds). meta.lock rides on get_bands' feat.tower.
    lockInfo() {
      var lk = this.bands && this.bands.meta && this.bands.meta.lock;
      return (lk && lk.active) ? lk : null;
    },

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
      if (m === "LTE") return { text: t("4G only"), active: true };
      if (m === "NR5G") return { text: t("5G only"), active: true };
      return { text: t("Auto"), active: false };
    },

    towerBadge() {
      if (!this.bands) return null;
      var lk = this.lockInfo();
      if (!lk) return { text: t("Unlocked"), locked: false };
      var rat = lk.rat === "4g" ? "LTE" : "5G";
      var tag = (lk.band !== undefined && lk.band !== null && lk.band !== "")
        ? (lk.rat === "4g" ? "B" : "n") + lk.band
        : (lk.pci !== undefined && lk.pci !== null ? "PCI " + lk.pci : "");
      return { text: rat + (tag ? " " + tag : ""), locked: true, title: this.lockLabel() };
    },

    // What each reading means, with rough ranges — tap the "?" (works on touch, unlike a title).
    renderGlossary(h) {
      var items = [
        ["RSRP", "Received power from the cell, in dBm. Above −90 is good, −90 to −105 fair, below −110 poor."],
        ["SINR", "Signal against noise and interference, in dB. Above 13 is good, 0 to 13 fair, below 0 poor."],
        ["RSRQ", "Signal quality including how busy the cell is, in dB. Above −10 is good, −10 to −15 fair, below −15 poor."],
        ["Band", "The frequency band in use: n = 5G NR, B = LTE. Low bands reach far; high bands are faster but shorter."],
        ["Cell / Ch", "Which cell the modem is on (its ID) and the channel number with its frequency."],
        ["CA", "Carrier aggregation: several carriers combined for more speed."]
      ];
      return h("div", { staticClass: "mm-gloss" }, items.map(function (it) {
        return h("div", { key: it[0] }, [h("b", it[0]), " ", h("span", it[1])]);
      }));
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
                 title: (tb.locked ? tb.title + " — " : "") + t("Cell lock — open Cell lock tab") },
        on: { click: function () { self.tab = "lock"; } }
      }, (tb.locked ? "🔒 " : "🔓 ") + tb.text));
      return h("div", { staticClass: "mm-lockbadges" }, kids);
    },

    // Post to /rpc via $axios DIRECTLY, not $rpcRequest. $rpcRequest's axios
    // interceptor pops GL's global error/timeout banner on any failure BEFORE
    // our .catch can run — unacceptable for a background poll, which on this box
    // is GUARANTEED to hit a dead socket at some point (the self-update restarts
    // nginx; a cellular link drops requests on its own). Same reasoning and shape
    // as the tracking chunk's rpcSilent. Resolves null on any failure: the caller
    // treats that as "no answer yet" and tries again.
    rpcSilent(method, params, timeoutMs) { return rpcSilent(method, params, timeoutMs || 15000); },

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
          if (!isNaN(v) && ns[i].t) fresh.push({ t: ns[i].t, v: v, s: ns[i].slot });
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
      if (!isNaN(v)) this.hist.push({ t: s.t, v: v, s: s.slot });
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

    startStripPoll() { this.startStrip(); },   // legacy name (tests),

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

    // x (0..320) of a BOX-clock instant on the strip, or null when it is outside the window.
    stripX(tBox) {
      if (tBox == null) return null;
      var span = this.STRIP_MIN * 60000, end = this.stripEnd(), start = end - span;
      if (tBox < start || tBox > end) return null;
      return ((tBox - start) / span) * 320;
    },

    // The pending change's moment on the trace: a dashed line, so "did it get better after
    // this?" is answered where the eye already is.
    applyMark(h) {
      var p = this.pending;
      var x = (p && !p.done) ? this.stripX(p.appliedBox) : null;
      if (x == null) return null;
      return h("line", { attrs: { x1: x.toFixed(1), x2: x.toFixed(1), y1: "0", y2: "40", stroke: "var(--warning)",
        "stroke-width": "1", "stroke-dasharray": "3 2", "vector-effect": "non-scaling-stroke" } });
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
      var d = "", prev = null, prevSim = null;
      for (var i = 0; i < pts.length; i++) {
        var t = pts[i].t, sim = pts[i].s;
        var x = ((t - start) / span) * W;
        if (x < 0) x = 0; else if (x > W) x = W;
        var cl = Math.max(FLOOR, Math.min(CEIL, pts[i].v));
        var y = ySpan ? H - ((cl - FLOOR) / ySpan) * H : H / 2;
        // A SIM switch starts a new line: SIM1's and SIM2's RSRP are two
        // different radios, not one trace that jumped.
        var newSim = sim != null && prevSim != null && String(sim) !== String(prevSim);
        d += ((prev === null || t - prev > this.STRIP_GAP_MS || newSim) ? "M" : "L") +
             x.toFixed(1) + "," + y.toFixed(1);
        prev = t;
        if (sim != null) prevSim = sim;
      }
      return d;
    },
  }
};
