/* MudiModem — built from src/web/tabs/battery.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
module.exports = (function () {
var __mm = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/web/tabs/battery.js
  var battery_exports = {};
  __export(battery_exports, {
    default: () => battery_default
  });

  // src/web/kit/rpc.js
  function hasRpc() {
    return typeof window !== "undefined" && !!window.$rpcRequest;
  }
  function rpc(method, params, opts) {
    return window.$rpcRequest("call", ["sid", "mudimodem", method, params || {}], opts);
  }
  function rpcSilent(method, params, timeoutMs) {
    if (typeof window === "undefined" || !window.$axios || !window.$axios.post) return Promise.resolve(null);
    var sid = window.$getCookie && window.$getCookie("Admin-Token") || "";
    return window.$axios.post("/rpc", {
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: [sid, "mudimodem", method, params || {}]
    }, { timeout: timeoutMs || 15e3 }).then(function(r) {
      return r && r.data && r.data.result || null;
    }).catch(function() {
      return null;
    });
  }

  // src/web/kit/fmt.js
  function p2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function hhmm(t) {
    var d = new Date(t);
    return p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  // src/web/tabs/battery.js
  var battery_default = function() {
    "use strict";
    var LANES = [
      {
        key: "capGui",
        label: "GL UI Reported Charge · %",
        unit: "%",
        h: 96,
        dec: 0,
        color: "var(--primary)",
        fixed: [0, 100]
      },
      {
        key: "cur",
        label: "Current · mA",
        unit: "mA",
        h: 64,
        dec: 0,
        color: "var(--success)",
        zero: true
      },
      {
        key: "voltV",
        label: "Voltage · V",
        unit: "V",
        h: 64,
        dec: 2,
        color: "var(--secondary)",
        fixed: [3.3, 4.3]
      },
      // not --info-hover: equals --text-hint in the dark theme
      {
        key: "temp",
        label: "Temperature · °C",
        unit: "°C",
        h: 64,
        dec: 1,
        color: "var(--warning)",
        minSpan: 5
      }
    ];
    var RANGES = [[15, "15 m"], [60, "1 h"], [360, "6 h"], [1440, "24 h"]];
    var TICKSTEP = { 15: 2, 60: 10, 360: 60, 1440: 240 };
    var GAP_MS = 6e4;
    var FAIL_NOTE_AFTER = 3;
    var STALL_MS = 6e4;
    var HOLE_MS = 5e4;
    var RETRY_BASE_MS = 2e3, RETRY_MAX_MS = 3e4;
    var BL_REFRESH_MS = 6e4;
    var PADL = 8, PADR = 42, LANE_GAP = 16, BAND_H = 9, TOP = 24, PLOT_INSET = 5;
    var FS_LANE = 11.5, FS_SCALE = 10.5, FS_TICK = 10.5, FS_AXIS = 11, FS_READOUT = 14;
    var GUI_M = 13867, GUI_B = 189300;
    var LIMIT_MIN = 50, LIMIT_MAX = 100;
    var EST_WINDOW_MS = 60 * 6e4, EST_MIN_SPAN_MIN = 8, EST_MIN_DELTA_PCT = 2;
    var EST_MAX_MIN = 48 * 60;
    var AVG_WINDOW_MS = 6e4;
    var STATE_COLOR = {
      charging: "var(--success)",
      // A genuinely full battery on mains is a healthy, unremarkable state —
      // same token as charging, not the `blocked` warning colour.
      full: "var(--success)",
      blocked: "var(--warning)",
      draining: "var(--error)",
      discharging: "var(--text-hint)",
      // Plugged in, 0 mA, and the limiter is NOT the reason — something else
      // stopped the charge (thermal, fault, a charger that just terminated).
      idle: "var(--text-hint)",
      unknown: "var(--text-hint)"
    };
    var STATE_LABEL = {
      charging: "Charging",
      full: "Full",
      blocked: "Charge blocked (limit)",
      draining: "Draining on power",
      discharging: "On battery",
      idle: "Not charging",
      unknown: "Unknown"
    };
    var component = {
      name: "mudimodem-battery",
      // `embedded` is set when the main Modem page renders us inside its Battery
      // tab (the only caller today); it drops our own heading.
      props: { embedded: { type: Boolean, default: false } },
      data: function() {
        return {
          winW: 15,
          samples: [],
          lastT: 0,
          serverNow: 0,
          serverNowAt: 0,
          loading: true,
          err: "",
          fetching: false,
          loadedFrom: null,
          // Poll health. `okCount` distinguishes "the collector has nothing yet"
          // from "we have never reached the box"; `failStreak` keeps one dropped
          // poll on a flaky cellular link from raising an alarm.
          okCount: 0,
          failStreak: 0,
          lastGoodAt: 0,
          // browser clock of the last successful fetch/push (stale-note arithmetic)
          // Bumped on every fetchHistory call; late replies for a superseded
          // range request are dropped so a 24 h click mid-15 m load cannot
          // repaint the short window (jayck88 requestSeq pattern).
          histRequestSeq: 0,
          pendingWindow: null,
          poll: null,
          tick: 0,
          live: true,
          pushSeenAt: 0,
          // pinnedT: the pinned slice as an ABSOLUTE box-clock sample time (a
          // minutes-relative pin slid to a newer sample on every push).
          width: 900,
          styleId: "mmb-css-v4",
          cursor: null,
          pinnedT: null,
          // preloaded: a WINDOW load has succeeded at least once (pushes alone
          // only carry what happened after the tab opened). loadFails/retryMs
          // drive the backoff and the note; missingSince is the start of a tail
          // (hole backfill) that failed or was dropped — the next push re-asks.
          preloaded: false,
          loadFails: 0,
          retryMs: 0,
          missingSince: null,
          // charge-limit form state (moved here from the Config tab)
          bl: null,
          blBusy: false,
          blErr: "",
          blDraft: 80,
          blFetchedAt: 0
          // browser clock of the last get_battlimit (the slow refresh cadence)
        };
      },
      computed: {
        // The collector's battery pushes (mudimodem.battery) land in the SPA's
        // status store; watching them is how this chart stays live.
        pushedSample: function() {
          var g = this.$store && this.$store.getters;
          var s = g && g.moduleStatus ? g.moduleStatus("mudimodem.battery") : null;
          return s && s.t ? s : null;
        }
      },
      watch: {
        "pushedSample.t": function() {
          this.onPush(this.pushedSample);
        }
      },
      created: function() {
        this.injectStyle();
      },
      mounted: function() {
        var self = this;
        if (typeof window === "undefined") return;
        this.measure();
        this._onResize = function() {
          self.measure();
        };
        window.addEventListener("resize", this._onResize);
        this._alive = true;
        this.fetchBattLimit();
        this.fetchHistory();
        this.pushSeenAt = Date.now();
        this.poll = setInterval(function() {
          if (self.live && Date.now() - self.pushSeenAt > STALL_MS) self.fetchHistory({ since: self.lastT, merge: true });
          if (Date.now() - self.blFetchedAt >= BL_REFRESH_MS) self.refreshBattLimit();
        }, 3e4);
      },
      updated: function() {
        this.measure();
      },
      beforeDestroy: function() {
        this._alive = false;
        if (this._retryTimer) {
          clearTimeout(this._retryTimer);
          this._retryTimer = null;
        }
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
        rpcSilent: function(method, params, timeout) {
          return rpcSilent(method, params, timeout || 2e4);
        },
        // opts = { window: <minutes>, since: <ms>, merge: <bool> }.
        // ⚠️ A window goes to the box as a DURATION (window_ms), never as a
        // browser-computed absolute cutoff: the two clocks disagree on a travel
        // router, and an absolute cutoff mis-sizes the window by exactly the skew.
        // The poll's `since` is exempt — it is a timestamp the BOX stamped.
        //
        // Every reply MERGES into what is held (dedupe by t, sort) — including a
        // window load: pushes may have landed while it was in flight, or while it
        // was failing and being retried, and replacing would drop them.
        fetchHistory: function(opts) {
          opts = opts || {};
          var self = this;
          if (typeof window === "undefined" || !window.$axios) {
            self.loading = false;
            return;
          }
          var merge = !!opts.merge;
          var incremental = opts.since != null && opts.since > 0;
          if (self.fetching && merge) {
            if (incremental) self.noteMissing(opts.since);
            return;
          }
          self.fetching = true;
          var requestSeq = ++self.histRequestSeq;
          var winMs = (opts.window || self.winW) * 6e4;
          var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
          return this.rpcSilent("get_battery_history", params).then(function(res) {
            if (requestSeq !== self.histRequestSeq) return;
            self.fetching = false;
            if (self._alive === false) return;
            if (!res) {
              self.failStreak++;
              if (self.failStreak >= FAIL_NOTE_AFTER) {
                var stale = self.lastGoodAt ? Math.round((Date.now() - self.lastGoodAt) / 1e3) : 0;
                self.err = "Can't reach the router — battery history stopped updating" + (stale ? " " + (stale >= 120 ? Math.round(stale / 60) + " min" : stale + " s") + " ago." : ".");
              }
              if (incremental) {
                self.noteMissing(opts.since);
              } else {
                self.loadFails++;
                self.retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, self.loadFails - 1));
                self.scheduleRetry();
              }
              self.loading = false;
              self.tick++;
              self.drainPending();
              return;
            }
            self.okCount++;
            self.failStreak = 0;
            self.lastGoodAt = Date.now();
            var ns = res.samples || [];
            var merged = ns;
            if (self.samples && self.samples.length) {
              var haveT = {};
              for (var i = 0; i < self.samples.length; i++) haveT[self.samples[i].t] = 1;
              merged = self.samples.concat(ns.filter(function(x) {
                return x && x.t && !haveT[x.t];
              })).sort(function(a, b) {
                return a.t - b.t;
              });
            }
            if (incremental) {
              if (self.missingSince != null && opts.since <= self.missingSince) self.missingSince = null;
            } else {
              self.preloaded = true;
              self.loadFails = 0;
              self.retryMs = 0;
              if (self._retryTimer) {
                clearTimeout(self._retryTimer);
                self._retryTimer = null;
              }
            }
            self.serverNow = res.now || Date.now();
            self.serverNowAt = Date.now();
            var cut = self.serverNow - 24 * 3600 * 1e3;
            merged = merged.filter(function(s) {
              return s.t >= cut;
            });
            self.samples = typeof Object.freeze === "function" ? Object.freeze(merged) : merged;
            if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
            var reached = incremental ? opts.since : self.serverNow - winMs;
            self.loadedFrom = self.loadedFrom == null ? reached : Math.min(self.loadedFrom, reached);
            self.err = "";
            self.tick++;
            self.loading = false;
            self.drainPending();
          });
        },
        noteMissing: function(since) {
          this.missingSince = this.missingSince == null ? since : Math.min(this.missingSince, since);
        },
        // One pending retry at a time, only while mounted. It asks for the range
        // shown NOW (the user may have changed it since the failure).
        scheduleRetry: function() {
          var self = this;
          if (!this._alive || this._retryTimer) return;
          this._retryTimer = setTimeout(function() {
            self._retryTimer = null;
            if (self._alive) self.fetchHistory({ window: self.winW });
          }, this.retryMs || RETRY_BASE_MS);
        },
        drainPending: function() {
          if (this.pendingWindow == null) return;
          var w = this.pendingWindow;
          this.pendingWindow = null;
          this.fetchHistory({ window: w });
        },
        // A live battery sample (mudimodem.battery push): append it exactly as an
        // incremental fetch would have; a push also proves the box is reachable,
        // so it clears the stale-history note.
        onPush: function(s) {
          if (!s || !s.t || s.t <= this.lastT) return;
          var prevT = this.lastT;
          var prev = this.samples.length ? this.samples[this.samples.length - 1] : null;
          this.pushSeenAt = Date.now();
          this.lastGoodAt = Date.now();
          var merged = this.samples.concat([s]);
          var cut = s.t - 24 * 3600 * 1e3;
          if (merged.length && merged[0].t < cut) merged = merged.filter(function(x) {
            return x.t >= cut;
          });
          this.samples = typeof Object.freeze === "function" ? Object.freeze(merged) : merged;
          this.lastT = s.t;
          this.serverNow = s.t;
          this.serverNowAt = Date.now();
          this.okCount++;
          this.failStreak = 0;
          this.err = "";
          this.tick++;
          var from = prevT > 0 && s.t - prevT > HOLE_MS ? prevT : null;
          if (this.missingSince != null) from = from == null ? this.missingSince : Math.min(from, this.missingSince);
          if (from != null) this.fetchHistory({ since: from, merge: true });
          if (prev && this.limiterStateChanged(prev, s)) this.refreshBattLimit();
        },
        // Did anything the limit card describes change between two samples?
        // Charger online, the watcher alive (`lim`), its gauge target.
        limiterStateChanged: function(a, b) {
          var n = function(v) {
            return v == null ? null : Number(v);
          };
          return !!a.online !== !!b.online || n(a.lim) !== n(b.lim) || n(a.lim_gauge) !== n(b.lim_gauge);
        },
        setRange: function(w) {
          this.winW = w;
          this.pinnedT = null;
          this.cursor = null;
          var cutoff = this.nowMs() - w * 6e4;
          if (this.loadedFrom == null || cutoff < this.loadedFrom - 1e3)
            this.fetchHistory({ window: w });
        },
        // ---- charge limit (user-initiated => $rpcRequest is correct here) ----
        // Clamp a stored target into the slider's range so the thumb cannot
        // misrepresent a stored value below the floor. Deliberately does NOT
        // write the clamped value back: silently rewriting a user's setting
        // because the UI changed shape is worse than a clamped thumb. The next
        // deliberate interaction saves a valid value.
        clampDraft: function(v) {
          return Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, v));
        },
        fetchBattLimit: function() {
          var self = this;
          if (!hasRpc()) return Promise.resolve();
          this.blFetchedAt = Date.now();
          return rpc("get_battlimit", {}, { timeout: 8e3 }).then(function(r) {
            self.bl = r || null;
            if (r && typeof r.limit_gui === "number") self.blDraft = self.clampDraft(r.limit_gui);
            self.blErr = r && r.error || "";
            self._blErrBg = false;
          }).catch(function(e) {
            self.blErr = e && (e.message || e.type) || "request failed";
            self._blErrBg = false;
          });
        },
        // Background re-read of the same snapshot (a push showed the charger or
        // the limiter changed, or BL_REFRESH_MS passed). SILENT transport — a
        // background call must never raise GL's banner — and fail-soft: a failed
        // re-read keeps the snapshot we have instead of blanking the card.
        refreshBattLimit: function() {
          var self = this;
          if (this.blBusy || this._blRefreshing) return Promise.resolve();
          this._blRefreshing = true;
          this.blFetchedAt = Date.now();
          return this.rpcSilent("get_battlimit", {}).then(function(r) {
            self._blRefreshing = false;
            if (self._alive === false || self.blBusy) return;
            if (!r || !(typeof r.available === "boolean" || typeof r.limit_gui === "number")) return;
            var prev = self.bl;
            self.bl = r;
            if (typeof r.limit_gui === "number" && (!prev || typeof prev.limit_gui !== "number" || self.blDraft === self.clampDraft(prev.limit_gui)))
              self.blDraft = self.clampDraft(r.limit_gui);
            if (r.error) {
              self.blErr = r.error;
              self._blErrBg = true;
            } else if (self._blErrBg) {
              self.blErr = "";
              self._blErrBg = false;
            }
          });
        },
        applyBattLimit: function(patch) {
          var self = this;
          if (this.blBusy || !hasRpc()) return;
          var cur = this.bl || { enabled: false, limit_gui: 80 };
          var enabled = patch && typeof patch.enabled === "boolean" ? patch.enabled : !!cur.enabled;
          var limit_gui = patch && patch.limit_gui != null ? Number(patch.limit_gui) : Number(this.blDraft || cur.limit_gui);
          if (!(limit_gui >= 20 && limit_gui <= 100)) {
            this.blErr = "Target must be 20–100 % GL UI Reported Charge";
            return;
          }
          var gauge = this.gaugeOf(limit_gui);
          if (gauge < 50 || gauge > 100) {
            this.blErr = "Target too low — the charge IC needs at least 50 % IC Reported Charge (about 50 % GL UI Reported Charge)";
            return;
          }
          this.blBusy = true;
          this.blErr = "";
          this._blErrBg = false;
          return rpc(
            "set_battlimit",
            { enabled, limit_gui },
            { timeout: 15e3 }
          ).then(function(r) {
            self.blBusy = false;
            self.blFetchedAt = Date.now();
            if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number")) {
              self.bl = r;
              if (typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            }
            if (r && r.error) self.blErr = r.error;
            else if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number"))
              self.blErr = "";
          }).catch(function(e) {
            self.blBusy = false;
            self.blErr = e && (e.message || e.type) || "request failed";
          });
        },
        // ---- scales + derived series ----
        measure: function() {
          if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
            this.width = this.$refs.lanes.clientWidth;
        },
        // skew-corrected box-now: server clock advanced by browser elapsed time.
        nowMs: function() {
          if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
          return Date.now();
        },
        mOf: function(t) {
          return -((this.nowMs() - t) / 6e4);
        },
        // Plot domain in box-clock ms. When retained history is shorter than the
        // selected range, raise `start` to the first sample so the real data
        // spans the full plot (jayck88 partial-window stretch) instead of sitting
        // in a stub on the right of an empty 24 h canvas.
        chartBounds: function(ss) {
          var end = this.nowMs();
          var start = end - this.winW * 6e4;
          if (ss && ss.length) {
            for (var i = 0; i < ss.length; i++) {
              if (ss[i] && ss[i].t != null && isFinite(ss[i].t)) {
                if (ss[i].t > start) start = ss[i].t;
                break;
              }
            }
          }
          if (start >= end) start = end - 6e4;
          return { start, end };
        },
        // Minutes of the *plotted* span (may be < winW on a short history).
        spanMin: function(bounds) {
          return Math.max(1 / 60, (bounds.end - bounds.start) / 6e4);
        },
        xOf: function(m, bounds) {
          var plotW = this.width - PADL - PADR;
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return PADL + (m + span) / span * plotW;
        },
        xOfT: function(t, bounds) {
          var plotW = this.width - PADL - PADR;
          var span = Math.max(1, bounds.end - bounds.start);
          return PADL + (t - bounds.start) / span * plotW;
        },
        // Window min–max for a metric, as a label fragment (e.g. "72.0–84.1").
        observedRange: function(ss, key, dec) {
          var lo = null, hi = null;
          for (var i = 0; i < (ss ? ss.length : 0); i++) {
            var v = ss[i][key];
            if (v == null || !isFinite(Number(v))) continue;
            v = Number(v);
            if (lo === null || v < lo) lo = v;
            if (hi === null || v > hi) hi = v;
          }
          if (lo === null) return "—";
          if (lo === hi) return Number(lo).toFixed(dec);
          return Number(lo).toFixed(dec) + "–" + Number(hi).toFixed(dec);
        },
        fmtAgo: function(t) {
          if (t == null) return "—";
          var seconds = Math.max(0, Math.round((this.nowMs() - t) / 1e3));
          if (seconds < 60) return seconds + "s ago";
          var minutes = Math.round(seconds / 60);
          if (minutes < 60) return minutes + " min ago";
          var hours = Math.round(minutes / 60);
          return hours + " h ago";
        },
        // gauge % -> GL's "GUI" %, using the constants get_battlimit serves so the
        // fit lives in exactly one place (the Lua backend).
        // GUI % -> gauge %, the inverse of guiOf and byte-for-byte the integer
        // formula the Lua backend's gui_to_gauge uses, so the UI and the box
        // never disagree about what a target means. Same served-constants-with-
        // fallback rule as guiOf.
        gaugeOf: function(gui) {
          if (gui == null) return null;
          var bl = this.bl || {};
          var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
          return Math.floor((gui * 1e4 + b + m / 2) / m);
        },
        guiOf: function(gauge) {
          if (gauge == null) return null;
          var bl = this.bl || {};
          var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
          var v = Math.round((gauge * m - b) / 1e3) / 10;
          return Math.max(0, Math.min(100, v));
        },
        // Samples inside the window, ascending, de-duplicated, decorated with the
        // derived fields the lanes plot. Incremental polling concats, which can
        // leave this.samples out of order or with duplicate t — a backward point
        // would draw one long line across the whole plot. Sort/dedupe HERE, the
        // single choke point every consumer goes through.
        winSamples: function() {
          var cutoff = this.nowMs() - this.winW * 6e4, self = this;
          var win = this.samples.filter(function(s) {
            return s.t >= cutoff;
          }).map(function(s) {
            return Object.assign({}, s, {
              m: self.mOf(s.t),
              capGui: self.guiOf(s.cap),
              voltV: s.volt == null ? null : Math.round(s.volt) / 1e3
            });
          });
          win.sort(function(a, b) {
            return a.t - b.t;
          });
          var out = [], prev = null;
          for (var i = 0; i < win.length; i++) {
            if (prev !== null && win[i].t === prev) continue;
            out.push(win[i]);
            prev = win[i].t;
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
        segmentsFrom: function(ss, key) {
          var segs = [], cur = [];
          for (var i = 0; i < ss.length; i++) {
            var s = ss[i];
            if (i > 0 && s.t - ss[i - 1].t > GAP_MS) {
              if (cur.length) segs.push(cur);
              cur = [];
            }
            var v = s[key];
            if (v == null) {
              if (cur.length) segs.push(cur);
              cur = [];
              continue;
            }
            cur.push({ m: s.m, v, t: s.t });
          }
          if (cur.length) segs.push(cur);
          return segs;
        },
        segments: function(key) {
          return this.segmentsFrom(this.winSamples(), key);
        },
        // Min/max-preserving reduction to roughly `cols` columns.
        // ⚠️ NEVER average. Averaging smears the Current lane's exact 0 (the
        // charge limit engaging) into a small non-zero number and erases the one
        // reading this whole feature exists to show.
        // ⚠️ min/max alone is NOT the same as "0 survives": a bucket straddling
        // zero (e.g. charging (+) -> blocked (0) -> discharging (-)) has the 0
        // as neither its min nor its max, so it must be tracked and kept
        // EXPLICITLY, not assumed to fall out of the lo/hi selection.
        reduce: function(pts, cols) {
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
            if (j === i) j = i + 1;
            if (lo === hi) {
              out.push(lo);
            } else {
              var keep = [lo, hi];
              if (zero !== null && zero !== lo && zero !== hi) keep.push(zero);
              keep.sort(function(a, b) {
                return a.m - b.m;
              });
              for (var k = 0; k < keep.length; k++) out.push(keep[k]);
            }
            i = j;
          }
          return out;
        },
        domainFrom: function(ss, lane) {
          var lo = null, hi = null;
          this.segmentsFrom(ss, lane.key).forEach(function(seg) {
            seg.forEach(function(p) {
              if (lo === null || p.v < lo) lo = p.v;
              if (hi === null || p.v > hi) hi = p.v;
            });
          });
          if (lane.fixed) {
            var d0 = lane.fixed[0], d1 = lane.fixed[1];
            if (lo !== null && lo < d0) d0 = lo;
            if (hi !== null && hi > d1) d1 = hi;
            return [d0, d1];
          }
          if (lo === null) return [0, 1];
          if (lane.zero) {
            lo = Math.min(lo, 0);
            hi = Math.max(hi, 0);
          }
          var span = hi - lo, min = lane.minSpan || 0;
          if (span < min) {
            var mid = (lo + hi) / 2;
            lo = mid - min / 2;
            hi = mid + min / 2;
          } else if (span === 0) {
            lo -= 1;
            hi += 1;
          } else {
            var pad = span * 0.08;
            lo -= pad;
            hi += pad;
          }
          if (lane.zero) {
            lo = Math.min(lo, 0);
            hi = Math.max(hi, 0);
          }
          return [lo, hi];
        },
        domainFor: function(lane) {
          return this.domainFrom(this.winSamples(), lane);
        },
        // `dom` is the lane's ALREADY-RESOLVED [lo, hi]. A render resolves it once
        // per lane and passes it in — computing it here would put a full
        // winSamples()+segments() pass behind every plotted point (the O(n²)
        // freeze that made the 6 h and 24 h ranges unusable). The fallback is for
        // one-off callers outside a render pass only.
        yIn: function(lane, top, v, dom) {
          var d = dom || this.domainFor(lane), d0 = d[0], d1 = d[1];
          var h = Math.max(1, lane.h - 2 * PLOT_INSET);
          if (d1 === d0) return top + PLOT_INSET + h / 2;
          var t = (Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0);
          return top + PLOT_INSET + h - t * h;
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
        limiterHeld: function(s) {
          if (s.lim !== 1) return false;
          if (s.lim_gauge == null || s.cap == null) return true;
          return s.cap >= s.lim_gauge;
        },
        // What the charger is doing, per sample.
        // Mean current over the trailing `windowMs`. `ss` is the already-computed
        // window (same no-requadratic discipline as runEstimate).
        //
        // Why this exists: the instantaneous reading is close to unreadable. Over
        // 40 min of real history it spanned 758 mA (stdev 139); at 20 s sampling a
        // 60 s mean is only ~3 samples, but it brings stdev to ~100.
        //
        // ⚠️ The window is anchored on the NEWEST SAMPLE'S timestamp, not
        // Date.now(). If the collector stalls, this then reports the mean of the
        // last 60 s of data that actually exists, instead of averaging an empty
        // window because wall-clock time moved on without it.
        avgCurrent: function(ss, windowMs) {
          if (!ss || !ss.length) return null;
          var edge = ss[ss.length - 1].t - windowMs;
          var sum = 0, n = 0;
          for (var i = ss.length - 1; i >= 0; i--) {
            if (ss[i].t < edge) break;
            if (ss[i].cur == null) continue;
            sum += ss[i].cur;
            n++;
          }
          return n ? Math.round(sum / n) : null;
        },
        // ---- runtime / charge-time estimate -------------------------------
        // Spec: docs/design/2026-07-28-battery-runtime-estimate-design.md
        //
        // ⚠️ SoC-slope based, and it has to be: the box exposes NO charge_full /
        // charge_now / energy_* node, so the pack's capacity in mAh does not
        // exist anywhere on the device. "remaining mAh / current mA" is not
        // available without inventing a nameplate figure.
        // Spot current is useless anyway — measured live it swings −449…−985 mA.
        // Which way the battery is going, collapsed from chargeState().
        estDirection: function(s) {
          var st = this.chargeState(s);
          if (st === "discharging" || st === "draining") return "down";
          if (st === "charging") return "up";
          if (st === "blocked") return "hold";
          if (st === "full") return "full";
          return "none";
        },
        // Pure. `ss` is the ALREADY-COMPUTED sample window (see the C1 regression
        // in the 2026-07-27 final review — a helper that recomputes the window
        // internally is what made the chart quadratic). Returns:
        //   { kind, minutes, targetPct, spanMin, deltaPct }
        // `minutes` is null whenever we cannot honestly produce a figure.
        runEstimate: function(ss, bl) {
          var none = { kind: "none", minutes: null, targetPct: null, spanMin: 0, deltaPct: 0 };
          if (!ss || !ss.length) return none;
          var last = ss[ss.length - 1];
          var dir = this.estDirection(last);
          if (dir === "hold" || dir === "full" || dir === "none")
            return { kind: dir, minutes: null, targetPct: null, spanMin: 0, deltaPct: 0 };
          var seg = [], edge = last.t - EST_WINDOW_MS;
          for (var i = ss.length - 1; i >= 0; i--) {
            if (ss[i].t < edge) break;
            if (this.estDirection(ss[i]) !== dir) break;
            if (ss[i].capGui == null) break;
            seg.push(ss[i]);
          }
          seg.reverse();
          var spanMin = seg.length > 1 ? (seg[seg.length - 1].t - seg[0].t) / 6e4 : 0;
          var deltaPct = seg.length > 1 ? seg[seg.length - 1].capGui - seg[0].capGui : 0;
          var out = {
            kind: dir,
            minutes: null,
            targetPct: null,
            spanMin,
            deltaPct
          };
          out.targetPct = dir === "down" ? 0 : bl && bl.enabled && typeof bl.limit_gui === "number" ? bl.limit_gui : 100;
          if (spanMin < EST_MIN_SPAN_MIN) return out;
          if (Math.abs(deltaPct) < EST_MIN_DELTA_PCT) return out;
          var n = seg.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
          for (var j = 0; j < n; j++) {
            var x = seg[j].t - seg[0].t, y = seg[j].capGui;
            sx += x;
            sy += y;
            sxx += x * x;
            sxy += x * y;
          }
          var denom = n * sxx - sx * sx;
          if (!denom) return out;
          var slope = (n * sxy - sx * sy) / denom;
          if (!slope) return out;
          if (dir === "down" && slope >= 0) return out;
          if (dir === "up" && slope <= 0) return out;
          var mins = (out.targetPct - last.capGui) / slope / 6e4;
          if (!(mins > 0) || !isFinite(mins)) return out;
          out.minutes = mins;
          return out;
        },
        // Approximations get approximate formatting — false precision on an
        // extrapolation is its own kind of lie.
        fmtEstimate: function(mins) {
          if (mins == null || !isFinite(mins)) return "—";
          if (mins > EST_MAX_MIN) return "> 2 d";
          var m = Math.round(mins / 5) * 5;
          if (m < 60) return "~" + m + " m";
          var hh = Math.floor(m / 60), mm = m % 60;
          return mm ? "~" + hh + " h " + mm + " m" : "~" + hh + " h";
        },
        chargeState: function(s) {
          if (!s.online) return "discharging";
          if (s.cur == null) return "unknown";
          if (s.cur > 0) return "charging";
          if (s.cur < 0) return "draining";
          if (this.limiterHeld(s)) return "blocked";
          if (s.lim == null) return "idle";
          var status = (s.status == null ? "" : String(s.status)).trim().toLowerCase();
          if (status === "full") return "full";
          return "idle";
        },
        // Same gap discipline as segments(): a hole bigger than GAP_MS ends the
        // current run rather than extending across it, even when the state on
        // both sides matches — otherwise a multi-hour outage between two
        // "charging" samples paints one solid "charging" band through data we
        // don't have.
        stateRunsFrom: function(ss) {
          var runs = [], self = this;
          for (var i = 0; i < ss.length; i++) {
            var v = self.chargeState(ss[i]), last = runs[runs.length - 1];
            var gap = i > 0 && ss[i].t - ss[i - 1].t > GAP_MS;
            if (last && !gap && last.v === v) {
              last.m1 = ss[i].m;
            } else {
              if (last) last.m1 = gap ? ss[i - 1].m : ss[i].m;
              runs.push({ v, m0: ss[i].m, m1: ss[i].m });
            }
          }
          if (runs.length) {
            var lastS = ss[ss.length - 1];
            runs[runs.length - 1].m1 = this.nowMs() - lastS.t > GAP_MS ? lastS.m : 0;
          }
          return runs;
        },
        stateRuns: function() {
          return this.stateRunsFrom(this.winSamples());
        },
        // Binary search by sample `t`. Cursor `m` is minutes relative to nowMs
        // (negative past → 0 now), same contract as before so existing tests and
        // the pin path keep working.
        nearestSampleIn: function(ss, m) {
          if (!ss || !ss.length) return null;
          var target = this.nowMs() + m * 6e4;
          var lo = 0, hi = ss.length;
          while (lo < hi) {
            var mid = lo + hi >> 1;
            if (ss[mid].t < target) lo = mid + 1;
            else hi = mid;
          }
          var best = null, bestD = Infinity;
          for (var i = Math.max(0, lo - 1); i <= Math.min(ss.length - 1, lo); i++) {
            var d = Math.abs(ss[i].t - target);
            if (d < bestD) {
              best = ss[i];
              bestD = d;
            }
          }
          return best;
        },
        nearestSample: function(m) {
          return this.nearestSampleIn(this.winSamples(), m);
        },
        clock: function(t) {
          return hhmm(t);
        },
        clockFull: function(t) {
          var d = new Date(t), p = function(n) {
            return (n < 10 ? "0" : "") + n;
          };
          return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
        },
        // ---- interaction ----
        // bounds comes from the last render (_lastBounds) so mousemove does not
        // recompute winSamples on every pixel.
        mFromEvent: function(e, bounds) {
          var el = this.$refs && this.$refs.lanes;
          if (!el) return null;
          var r = el.getBoundingClientRect();
          if (!r.width) return null;
          var ux = (e.clientX - r.left) * this.width / r.width;
          var plotW = this.width - PADL - PADR;
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return -span + (ux - PADL) / plotW * span;
        },
        clampM: function(m, bounds) {
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return Math.max(-span, Math.min(0, m));
        },
        onMove: function(e) {
          if (this.pinnedT != null) return;
          var bounds = this._lastBounds;
          var m = this.mFromEvent(e, bounds);
          if (m == null) return;
          this.cursor = this.clampM(m, bounds);
        },
        onLeave: function() {
          if (this.pinnedT == null) this.cursor = null;
        },
        onClick: function(e) {
          if (this.pinnedT != null) {
            this.pinnedT = null;
            this.cursor = null;
            return;
          }
          var bounds = this._lastBounds;
          var m = this.mFromEvent(e, bounds);
          if (m == null) return;
          m = this.clampM(m, bounds);
          var s = this.nearestSampleIn(this._lastSs || this.winSamples(), m);
          this.pinnedT = s ? s.t : this.nowMs() + m * 6e4;
          this.cursor = this.mOf(this.pinnedT);
        },
        // The pinned sample in window `ss` (exact box time), or null once it
        // has scrolled out of the window.
        pinnedSampleIn: function(ss) {
          if (this.pinnedT == null || !ss) return null;
          for (var i = ss.length - 1; i >= 0; i--) if (ss[i].t === this.pinnedT) return ss[i];
          return null;
        },
        injectStyle: function() {
          if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
          var css = [
            ".mmb{display:flex;flex-direction:column;gap:12px}",
            ".mmb-card{background:var(--background-card);border-radius:8px;padding:12px 14px}",
            ".mmb-h{font-weight:600;margin-bottom:8px;color:var(--text-title)}",
            ".mmb-row{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline}",
            ".mmb-stat{display:flex;flex-direction:column;min-width:84px}",
            ".mmb-stat b{font-size:18px;font-weight:600;color:var(--text-title);line-height:1.25}",
            ".mmb-stat span{font-size:11px;color:var(--text-badge)}",
            ".mmb-seg{display:inline-flex;gap:2px}",
            ".mmb-seg button{border:0;background:var(--background-content);color:var(--text-badge);",
            "padding:3px 10px;font-size:12px;border-radius:4px;cursor:pointer}",
            ".mmb-seg button.on{background:var(--primary);color:#fff}",
            // Chart: HTML lane headers (value + Range) sit above the shared SVG so
            // bold/small render as real text, not as SVG presentation attributes
            // that some WebKits drop when fill=var(--token).
            ".mmb-chart{display:flex;flex-direction:column;gap:10px;width:100%}",
            ".mmb-lane-row{display:flex;flex-direction:column;gap:2px;width:100%}",
            // Single line, left-aligned: name · bold current · Range a–b
            ".mmb-lane-head{display:flex;flex-direction:row;flex-wrap:wrap;",
            "align-items:baseline;gap:8px;padding:0 0 4px;line-height:1.3}",
            ".mmb-lane-name{font-size:12px;color:var(--text-badge)}",
            ".mmb-lane-head b{font-size:14px;font-weight:700;color:var(--text-title);",
            "font-variant-numeric:tabular-nums}",
            ".mmb-lane-head small{font-size:12px;font-weight:400;color:var(--text-hint);",
            "font-variant-numeric:tabular-nums}",
            ".mmb-lanes{width:100%;display:block;cursor:crosshair;overflow:visible}",
            ".mmb-lanes-foot{margin-top:2px}",
            ".mmb-note{font-size:12px;color:var(--text-badge);margin-top:6px}",
            ".mmb-kv{display:flex;align-items:center;gap:10px;margin:6px 0}",
            ".mmb-k{font-size:13px;color:var(--text-badge);min-width:92px}",
            ".mmb-v{font-size:13px;color:var(--text-title)}",
            // accent-color keeps the thumb/track on the GL palette without a hex
            // literal; engines without it fall back to the default control colour.
            ".mmb-v input[type=range]{width:180px;vertical-align:middle;accent-color:var(--primary)}",
            ".mmb-err{font-size:12px;color:var(--error);margin-top:6px}",
            // Attribution: deliberately the quietest text on the card.
            ".mmb-credit{font-size:11px;color:var(--text-hint);margin-top:10px}",
            // Headline estimate: the largest thing on the card, with its own
            // provenance kept deliberately quiet beside it.
            ".mmb-est{display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap}",
            ".mmb-est b{font-size:22px;font-weight:600;color:var(--text-title);line-height:1.2}",
            ".mmb-prov{font-size:11px;color:var(--text-hint)}"
          ].join("");
          var el = document.createElement("style");
          el.id = this.styleId;
          el.textContent = css;
          document.head.appendChild(el);
        },
        // ---- render helpers ----
        // `ss` is the window computed once by render(); the fallback keeps this
        // callable on its own (tests).
        // The headline figure, above the tiles. Formatting only — every decision
        // about whether a number is defensible lives in runEstimate.
        renderEstimate: function(h, ss) {
          ss = ss || this.winSamples();
          var r = this.runEstimate(ss, this.bl);
          var bl = this.bl || {};
          var head;
          if (r.minutes != null && r.kind === "down") {
            head = this.fmtEstimate(r.minutes) + " remaining";
          } else if (r.minutes != null && r.kind === "up") {
            head = this.fmtEstimate(r.minutes) + " to " + r.targetPct + " %";
          } else if (r.kind === "hold") {
            head = "Holding at " + (typeof bl.limit_gui === "number" ? bl.limit_gui + " %" : "the limit");
          } else if (r.kind === "full") {
            head = "Full";
          } else {
            head = "Estimating…";
          }
          var kids = [h("b", head)];
          if (r.spanMin >= 1) {
            kids.push(h(
              "span",
              { staticClass: "mmb-prov" },
              "from the last " + Math.round(r.spanMin) + " min"
            ));
          }
          return h("div", { staticClass: "mmb-est" }, kids);
        },
        renderStatusRow: function(h, ss) {
          ss = ss || this.winSamples();
          var s = ss.length ? ss[ss.length - 1] : null;
          var bl = this.bl || {};
          var fmt = function(v, dec, unit) {
            return v == null ? "—" : (dec ? Number(v).toFixed(dec) : String(v)) + unit;
          };
          var stats = [];
          var push = function(label, value) {
            stats.push(h(
              "div",
              { staticClass: "mmb-stat" },
              [h("b", value), h("span", label)]
            ));
          };
          push("GL UI Reported Charge", s ? fmt(s.capGui, 1, " %") : "—");
          push("IC Reported Charge", s ? fmt(s.cap, 0, " %") : "—");
          push("Current", s ? fmt(s.cur, 0, " mA") : "—");
          push("Current 60 s avg", fmt(this.avgCurrent(ss, AVG_WINDOW_MS), 0, " mA"));
          push("Voltage", s ? fmt(s.voltV, 2, " V") : "—");
          push("Temp", s ? fmt(s.temp, 1, " °C") : "—");
          push("State", s ? STATE_LABEL[this.chargeState(s)] : "—");
          push("Limit", bl.available === false ? "n/a" : bl.enabled ? bl.limit_gui + " % GL UI" : "Off");
          return h("div", { staticClass: "mmb-card" }, [
            this.renderEstimate(h, ss),
            h("div", { staticClass: "mmb-row" }, stats)
          ]);
        },
        // Format a focus reading for a lane header: "−360 mA", "80 %", …
        // Leading space before the unit so the bold figure doesn't run into it.
        fmtLaneValue: function(L, sample) {
          if (!sample) return "—";
          var fv = sample[L.key];
          if (fv == null || !isFinite(Number(fv))) return "—";
          return Number(fv).toFixed(L.dec) + " " + L.unit;
        },
        // HTML lane header — one left-aligned line:
        //   Metric name   <bold current>   Range a–b unit
        // Real HTML <b>/<small> so weight and colour are not fighting SVG
        // presentation-attribute rules.
        renderLaneHead: function(h, L, focus, ss) {
          var valueStr = this.fmtLaneValue(L, focus);
          var rangeStr = "Range " + this.observedRange(ss, L.key, L.dec) + " " + L.unit;
          return h("div", { staticClass: "mmb-lane-head" }, [
            h("span", { staticClass: "mmb-lane-name" }, L.label),
            h("b", valueStr),
            h("small", rangeStr)
          ]);
        },
        // `ss` is the sample window, computed ONCE by render() and threaded
        // through everything below. Nothing in here may call winSamples(),
        // segments(), domainFor() or stateRuns() — their zero-argument forms
        // recompute the whole window, and doing that per lane (or worse, per
        // plotted point) is what made 6 h/24 h renders take seconds.
        //
        // Layout (jayck88): each lane is HTML head (name + bold value + Range)
        // immediately above its own plot strip. Cursor state is shared so a
        // hover on any strip updates every head and every crosshair together.
        renderLanes: function(h, ss) {
          var self = this, W = this.width;
          ss = ss || this.winSamples();
          var bounds = this.chartBounds(ss);
          this._lastBounds = bounds;
          this._lastSs = ss;
          var spanM = this.spanMin(bounds);
          var partial = spanM < this.winW - 1;
          var cols = Math.max(40, Math.round((W - PADL - PADR) / 2));
          var near, focusM;
          if (this.pinnedT != null) {
            near = this.pinnedSampleIn(ss);
            focusM = near ? near.m : null;
          } else {
            focusM = this.cursor;
            near = focusM != null ? this.nearestSampleIn(ss, focusM) : null;
          }
          var focus = near || (ss.length ? ss[ss.length - 1] : null);
          var rows = [];
          var measureRefSet = false;
          LANES.forEach(function(L) {
            var d = self.domainFrom(ss, L), d0 = d[0], d1 = d[1];
            var H = L.h;
            var strip = [];
            var plotW = W - PADL - PADR;
            strip.push(h("rect", { attrs: {
              x: PADL,
              y: 0.5,
              width: Math.max(1, plotW),
              height: Math.max(1, H - 1),
              fill: "var(--background-content)",
              stroke: "#999999",
              "stroke-width": 1.5,
              rx: 2
            } }));
            [[d1, 10], [d0, H - 3]].forEach(function(p) {
              strip.push(h(
                "text",
                { attrs: {
                  x: W - PADR + 5,
                  y: p[1],
                  "font-size": FS_SCALE,
                  "text-anchor": "start",
                  fill: "var(--text-hint)"
                } },
                Number(p[0]).toFixed(L.dec)
              ));
            });
            if (L.zero && d0 < 0 && d1 > 0) {
              var yz = self.yIn(L, 0, 0, d);
              strip.push(h("line", { attrs: {
                x1: PADL,
                x2: W - PADR,
                y1: yz,
                y2: yz,
                stroke: "var(--divider)",
                "stroke-width": 1,
                "stroke-dasharray": "2 3"
              } }));
            }
            if (L.key === "capGui" && self.bl && self.bl.enabled && typeof self.bl.limit_gui === "number") {
              var yt = self.yIn(L, 0, self.bl.limit_gui, d);
              strip.push(h("line", { attrs: {
                class: "mmb-target",
                x1: PADL,
                x2: W - PADR,
                y1: yt,
                y2: yt,
                stroke: "var(--warning)",
                "stroke-width": 1.25,
                "stroke-dasharray": "5 3"
              } }));
              strip.push(h(
                "text",
                { attrs: {
                  x: W - PADR,
                  y: Math.max(10, yt - 3),
                  "font-size": FS_TICK,
                  "text-anchor": "end",
                  fill: "var(--warning)"
                } },
                "target " + self.bl.limit_gui + "%"
              ));
            }
            self.segmentsFrom(ss, L.key).forEach(function(seg) {
              var pts = self.reduce(seg, cols), dstr = "";
              pts.forEach(function(p, i) {
                dstr += (i ? "L" : "M") + self.xOfT(p.t, bounds).toFixed(1) + " " + self.yIn(L, 0, p.v, d).toFixed(1) + " ";
              });
              if (dstr) strip.push(h("path", { attrs: {
                fill: "none",
                stroke: L.color,
                "stroke-width": 1.75,
                "stroke-linejoin": "round",
                "stroke-linecap": "round",
                d: dstr.trim()
              } }));
            });
            if (focusM != null) {
              var cx = self.xOf(focusM, bounds);
              strip.push(h("line", { attrs: {
                x1: cx,
                x2: cx,
                y1: 0,
                y2: H,
                stroke: "var(--text-hint)",
                "stroke-width": 1
              } }));
              if (near && near[L.key] != null && isFinite(Number(near[L.key]))) {
                strip.push(h("circle", { attrs: {
                  cx: self.xOfT(near.t, bounds).toFixed(1),
                  cy: self.yIn(L, 0, near[L.key], d).toFixed(1),
                  r: 3.5,
                  fill: L.color,
                  stroke: "var(--background-card)",
                  "stroke-width": 1.5
                } }));
              }
            }
            var svgAttrs = {
              viewBox: "0 0 " + W + " " + H,
              height: H,
              preserveAspectRatio: "none"
            };
            var svgData = {
              staticClass: "mmb-lanes",
              attrs: svgAttrs,
              on: { mousemove: self.onMove, mouseleave: self.onLeave, click: self.onClick }
            };
            if (!measureRefSet) {
              svgData.ref = "lanes";
              measureRefSet = true;
            }
            rows.push(h("div", { staticClass: "mmb-lane-row", key: L.key }, [
              self.renderLaneHead(h, L, focus, ss),
              h("svg", svgData, strip)
            ]));
          });
          var foot = [];
          var bandY = 4;
          var runs = this.stateRunsFrom(ss);
          runs.forEach(function(r) {
            var x0 = self.xOf(r.m0, bounds), x1 = self.xOf(r.m1, bounds);
            foot.push(h("rect", { attrs: {
              x: x0,
              y: bandY,
              width: Math.max(1, x1 - x0),
              height: BAND_H,
              fill: STATE_COLOR[r.v],
              "fill-opacity": 0.55
            } }));
          });
          var axisY = bandY + BAND_H + 13;
          var step = spanM <= 15 ? 2 : spanM <= 60 ? 10 : spanM <= 360 ? 60 : 240;
          var ticks = [];
          for (var m = -spanM; m < -1e-3; m += step) ticks.push(m);
          ticks.push(0);
          for (var ti = 0; ti < ticks.length; ti++) {
            var tm = ticks[ti];
            var tx = this.xOf(tm, bounds);
            var label;
            if (tm === 0) label = "now";
            else if (Math.abs(tm + spanM) < 0.01 && partial) {
              label = spanM >= 60 ? "~" + Math.max(1, Math.round(spanM / 60)) + " h" : "~" + Math.max(1, Math.round(spanM)) + " m";
            } else {
              label = Math.round(tm * 10) / 10 + " m";
            }
            foot.push(h("text", { attrs: {
              x: tx,
              y: axisY,
              "font-size": FS_AXIS,
              "text-anchor": "middle",
              fill: "var(--text-hint)"
            } }, label));
          }
          if (focusM != null && near) {
            var bits = [
              this.fmtAgo(near.t),
              this.clockFull(near.t),
              (near.capGui == null ? "—" : near.capGui.toFixed(1) + "%") + (near.cap == null ? "" : " (IC " + near.cap + "%)"),
              near.cur == null ? "—" : near.cur + " mA",
              near.voltV == null ? "—" : near.voltV.toFixed(2) + " V",
              near.temp == null ? "—" : near.temp.toFixed(1) + " °C",
              STATE_LABEL[this.chargeState(near)]
            ];
            foot.push(h("text", { attrs: {
              x: PADL,
              y: axisY + 16,
              "font-size": FS_READOUT,
              fill: "var(--text-title)"
            } }, bits.join("  ·  ")));
          }
          var footH = axisY + 24;
          rows.push(h("svg", {
            staticClass: "mmb-lanes mmb-lanes-foot",
            attrs: {
              viewBox: "0 0 " + W + " " + footH,
              height: footH,
              preserveAspectRatio: "none"
            },
            on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick }
          }, foot));
          return h("div", { staticClass: "mmb-chart" }, rows);
        },
        renderLimitCard: function(h) {
          var self = this, bl = this.bl, kids = [h("div", { staticClass: "mmb-h" }, "Battery charge limit")];
          if (!bl) {
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
                  on: { change: function(e) {
                    var el = e && e.target;
                    var p = self.applyBattLimit({ enabled: !!(el && el.checked) });
                    Promise.resolve(p).then(function() {
                      if (el) el.checked = !!(self.bl && self.bl.enabled);
                    });
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
                  attrs: {
                    type: "range",
                    min: LIMIT_MIN,
                    max: LIMIT_MAX,
                    step: 1,
                    disabled: !bl.enabled || !!self.blBusy
                  },
                  domProps: { value: self.blDraft },
                  on: {
                    // `input` fires per drag-pixel: update the label only. Each
                    // save spawns a process on the router, so committing here
                    // would hammer it. `change` fires once, on release.
                    input: function(e) {
                      self.blDraft = Number(e.target && e.target.value);
                    },
                    change: function() {
                      self.applyBattLimit({ limit_gui: self.blDraft });
                    }
                  }
                }),
                " " + self.blDraft + " % GL UI Reported Charge",
                // Tracks the DRAFT, not bl.limit_gauge — the latter is the SAVED
                // value and would lag the thumb during a drag.
                h(
                  "span",
                  { staticClass: "mmb-note" },
                  "  (≈ " + self.gaugeOf(self.blDraft) + " % IC Reported Charge)"
                )
              ])
            ]));
            var last = this.samples && this.samples.length ? this.samples[this.samples.length - 1] : null;
            var sampleFresh = !!(last && last.t && Math.abs(this.nowMs() - last.t) <= 3e4);
            var chargeStopped = !!(bl.active && sampleFresh && last.online && last.cur != null && Math.abs(Number(last.cur)) <= 10);
            var targetGui = typeof bl.limit_gui === "number" ? bl.limit_gui + "%" : "—";
            var currentGui = typeof bl.capacity_gui === "number" ? "~" + bl.capacity_gui + "%" : "—";
            var statusLine;
            if (bl.active) {
              statusLine = "Active · target " + targetGui + " GL UI · current " + currentGui;
              if (chargeStopped) statusLine += " · Charging stopped";
            } else if (bl.enabled && !bl.charger_online) {
              statusLine = "Armed · target " + targetGui + " · will apply when the charger connects · current " + currentGui;
            } else if (bl.enabled && bl.charger_online) {
              statusLine = "Enabled · not active · target " + targetGui + " · current " + currentGui;
            } else {
              statusLine = "Off · current " + currentGui;
            }
            kids.push(h("div", { staticClass: "mmb-kv" }, [
              h("span", { staticClass: "mmb-k" }, "Status"),
              h("span", { staticClass: "mmb-v" }, statusLine)
            ]));
            if (bl.active_gauge != null || bl.capacity_gauge != null) {
              kids.push(h(
                "div",
                { staticClass: "mmb-note" },
                "Low-level: target " + (bl.limit_gauge != null ? bl.limit_gauge + "% IC" : "—") + ", current " + (bl.capacity_gauge != null ? bl.capacity_gauge + "% IC" : "—")
              ));
            }
            if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
          }
          kids.push(h(
            "div",
            { staticClass: "mmb-credit" },
            "Based on ChiliApple's battery control scripts"
          ));
          return h("div", { staticClass: "mmb-card" }, kids);
        }
      },
      render: function(h) {
        var self = this;
        this.tick;
        var kids = [];
        var ss = this.winSamples();
        if (!this.embedded) kids.push(h("div", { staticClass: "mmb-h" }, "Battery"));
        kids.push(this.renderStatusRow(h, ss));
        var chartKids = [
          h("div", { staticClass: "mmb-row" }, [
            h("div", { staticClass: "mmb-h" }, "History"),
            h("span", { staticClass: "mmb-seg" }, RANGES.map(function(r) {
              return h("button", {
                key: r[0],
                staticClass: self.winW === r[0] ? "on" : "",
                on: { click: function() {
                  self.setRange(r[0]);
                } }
              }, r[1]);
            }))
          ])
        ];
        var every = Math.round((this.retryMs || RETRY_BASE_MS) / 1e3);
        var failing = this.loadFails > 0;
        if (this.loading) {
          chartKids.push(h("div", { staticClass: "mmb-note" }, "Loading battery history…"));
        } else if (!ss.length) {
          chartKids.push(h(
            "div",
            { staticClass: "mmb-note" },
            failing && !this.preloaded ? "Couldn't reach the router — retrying every " + every + " s." : "No battery history yet — sampling starts within 20 s."
          ));
          if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
        } else {
          chartKids.push(this.renderLanes(h, ss));
          if (failing)
            chartKids.push(h("div", { staticClass: "mmb-note" }, (this.preloaded ? "Couldn't load the wider range yet" : "Earlier battery history didn't load — showing samples since the tab opened") + "; retrying every " + every + " s."));
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
    component.PLOT_INSET = PLOT_INSET;
    component.FAIL_NOTE_AFTER = FAIL_NOTE_AFTER;
    component.STATE_LABEL = STATE_LABEL;
    return component;
  }();
  return __toCommonJS(battery_exports);
})();
return __mm.default;
})();
