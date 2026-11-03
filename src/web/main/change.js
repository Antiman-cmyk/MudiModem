// Confirm-or-revert: the pending change as the router reports it (change_status), countdown, Keep / Revert, banner.
import { rpc, rpcJob } from "../kit/rpc.js";
import { t, tp } from "../kit/i18n.js";
import { bandsText, carriers, pccRat } from "../kit/carriers.js";

// GL's network_mode codes in the selector's own words.
function modeName(m) { return t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[m] || m); }
export default {
  data() {
    return {
      pending: null,        // { kind, window, applied, remaining } after Apply/Lock
      cdTimer: null,        // countdown interval handle
    };
  },
  methods: {
    // kind defaults to "bands" so the existing bands call sites keep working
    // unchanged; the cell-lock flow passes "cell" so the banner + refetch land
    // on the right tab (§renderRevert / renderBands / renderLock).
    // ---- confirm-or-revert, as the BOX sees it ----------------------------------------------
    // The countdown runs to the watchdog's real deadline on the box clock (change_status /
    // set_* replies carry `deadline` + `now`), so it survives a reload, a tab switch and a phone
    // that slept; Keep / Revert report what actually happened instead of assuming.
    startCountdown(window_s, applied, kind, clock) {
      var self = this;
      this.clearCountdown();
      var w = window_s || 60;
      var end = Date.now() + w * 1000;
      // When the change went out, on the BOX clock (sample timestamps): the deadline minus the
      // window when the box said so, else "now" corrected by the strip's box-clock offset.
      var appliedBox = null;
      if (clock && typeof clock.deadline === "number" && typeof clock.now === "number") {
        end = Date.now() + (clock.deadline - clock.now) * 1000;
        appliedBox = (clock.deadline - w) * 1000;
      } else if (this.histNow) appliedBox = Date.now() + (this.histNow - this.histNowAt);
      // The radio picture just before the change: the router's own record (the pending file's
      // BEFORE), else the last sample this page saw.
      var before = (clock && clock.before) || this.pictureOf(this.serving);
      this.pending = { kind: kind || "bands", window: w, applied: applied, done: false, end: end,
                       appliedBox: appliedBox, before: before,
                       remaining: Math.max(0, Math.ceil((end - Date.now()) / 1000)),
                       keeping: false, reverting: false, expiring: false, keepError: "", revertError: "" };
      this.cdTimer = setInterval(function () {
        var p = self.pending;
        if (!p || p.done || p.end == null) return;
        p.remaining = Math.max(0, Math.ceil((p.end - Date.now()) / 1000));
        if (p.remaining <= 0 && !p.expiring) { self.patchPending({ expiring: true }); self.awaitWatchdog(0); }
      }, 1000);
    },

    clearCountdown() {
      if (this.cdTimer) { clearInterval(this.cdTimer); this.cdTimer = null; }
    },

    patchPending(o) { if (this.pending) this.pending = Object.assign({}, this.pending, o); },

    refetchAfterChange(kind) {
      if (kind === "cell") { this.fetchLock(); this.fetchBands({ light: true }); } else this.fetchBands();
    },

    // The deadline passed: ask the box what the watchdog did instead of assuming it reverted.
    awaitWatchdog(tries) {
      var self = this;
      if (typeof window === "undefined" || !window.$axios) {          // no transport: cannot ask
        var k0 = this.pending && this.pending.kind;
        this.clearCountdown();
        this.pending = { kind: k0, done: true, unknown: true };
        return;
      }
      this.rpcSilent("change_status", {}, 8000).then(function (res) {
        var p = self.pending;
        if (!p || p.done || self.pollStopped) return;
        if ((!res || res.pending) && tries < 10) {          // box busy / still restoring: look again
          self.patchPending({ reverting: true });
          self.watchdogTimer = setTimeout(function () { self.awaitWatchdog(tries + 1); }, 3000);
          return;
        }
        if (res && res.pending) {
          self.patchPending({ reverting: false, revertError:
            t("The auto-revert has not finished after 30 s - use Revert now, or the ssh panic restore.") });
          return;
        }
        var k = p.kind;
        self.clearCountdown();
        self.pending = { kind: k, done: true, reverted: !!res, unknown: !res };
        self.refetchAfterChange(k);
        self.doneTimer = setTimeout(function () { if (self.pending && self.pending.done) self.pending = null; }, 5000);
      });
    },

    // Pick up a change that is pending on the box (page load, another tab, a dropped reply).
    // `tries` > 0 keeps asking while the box is unreachable (the apply's redial drops the link).
    restoreChange(tries) {
      var self = this;
      if (typeof window === "undefined" || !window.$axios) return;   // no transport: nothing to ask
      this.rpcSilent("change_status", {}, 8000).then(function (res) {
        if (self.pollStopped) return;
        if (!res) {
          if (tries > 0) self.restoreTimer = setTimeout(function () { self.restoreChange(tries - 1); }, 2500);
          return;
        }
        var q = res.pending, p = self.pending;
        if (q) {
          if (p && !p.done && p.end != null) return;          // already counting down
          if (typeof q.deadline === "number")
            self.startCountdown(q.window || 60, q.applied || (p && p.applied) || {}, q.kind,
                                { deadline: q.deadline, now: res.now, before: q.before });
          else if (!p)                                          // pending from an older version: no timer
            self.pending = { kind: q.kind, applied: q.applied || {}, uncertain: true, window: 60, remaining: 60 };
        } else if (p && p.uncertain) {
          // Nothing is armed: the dropped apply never took, or was already reverted.
          self.pending = null;
          self.applyError = t("The connection dropped while applying, and nothing is pending on the router now - the change did not take, or was already reverted.");
        }
      });
    },

    keepBands() {
      var self = this, p = this.pending;
      if (!p || p.done || p.keeping || p.reverting) return;
      var k = p.kind;
      this.patchPending({ keeping: true, keepError: "" });
      rpc("confirm", {})
        .then(function (res) {
          self.clearCountdown();
          if (res && res.was_pending === false) {
            // The watchdog had already reverted it (window over, or a reboot's boot-check).
            self.pending = { kind: k, done: true, tooLate: true };
            self.doneTimer = setTimeout(function () { if (self.pending && self.pending.done) self.pending = null; }, 8000);
          } else {
            self.pending = null;
          }
          self.refetchAfterChange(k);
        })
        .catch(function (e) {
          // Most likely the apply's redial: the change is still pending and the watchdog still
          // counts, so keep the banner (and its timer) and let the user try again.
          self.patchPending({ keeping: false, keepError: t("Couldn't reach the router to keep it ({err}). The countdown is still running - press Keep again.",
            { err: (e && (e.type || e.message)) || "error" }) });
        });
    },

    revertBands() {
      var self = this, p = this.pending;
      if (!p || p.done || p.keeping || p.reverting) return;
      var k = p.kind;
      this.patchPending({ reverting: true, revertError: "" });
      // A cell revert is a router job (restore-now in mudimodemd): followed through job_result.
      rpcJob("revert_now", {})
        .then(function (res) {
          if (res && res.error) {
            // Nothing was restored; the watchdog stays armed and retries at the deadline.
            self.patchPending({ reverting: false, revertError: res.error });
            return;
          }
          self.clearCountdown();
          self.pending = { kind: k, done: true, reverted: true };
          self.refetchAfterChange(k);
          self.doneTimer = setTimeout(function () { if (self.pending && self.pending.done) self.pending = null; }, 4000);
        })
        .catch(function (e) {
          self.patchPending({ reverting: false, revertError: t("Couldn't reach the router to revert ({err}). The auto-revert is still armed.",
            { err: (e && (e.type || e.message)) || "error" }) });
        });
    },

    // A sample reduced to what the banner compares: {t, registered, rat, band, pci, rsrp, sinr,
    // signals: [{rat, band}]}, or null when there is none. Same shape as the router's BEFORE record.
    pictureOf(s) {
      if (!s || !s.t) return null;
      var num = function (v) { return (v === null || v === undefined || v === "" || isNaN(Number(v))) ? undefined : Number(v); };
      var sigs = carriers(s).map(function (c) { return { rat: c.rat, band: c.band }; });
      return { t: s.t, registered: num(s.rsrp) !== undefined, rat: pccRat(s), mode: s.mode,
               band: num(s.band), pci: num(s.pci), rsrp: num(s.rsrp), sinr: num(s.sinr),
               signals: sigs.length ? sigs : undefined };
    },

    pictureText(x) {
      if (!x.registered) return t("no service");
      // A BEFORE record from 3.0.0 has no signals: its PCC band alone.
      var bands = Array.isArray(x.signals) && x.signals.length ? bandsText({ signals: x.signals }) : this.formatBand(x.rat, x.band);
      return [bands, x.rsrp !== undefined ? "RSRP " + x.rsrp : "",
              x.sinr !== undefined ? "SINR " + x.sinr : "", x.pci !== undefined ? "PCI " + x.pci : ""]
        .filter(function (v) { return v && v !== "—"; }).join(" · ");
    },

    // "Before n71 · RSRP -99 · SINR 4 → now B66 · RSRP -105 · SINR 2": the change's effect in one
    // line, so judging Keep vs Revert needs no reading of the trace. "Now" is a sample taken
    // AFTER the change went out (until one arrives, the line says so).
    renderBeforeNow(h) {
      var p = this.pending, before = p.before;
      var s = this.serving, live = (s && s.t && !s.stale && (p.appliedBox == null || s.t > p.appliedBox))
        ? this.pictureOf(s) : null;
      var now = live ? this.pictureText(live) : t("waiting for the next sample...");
      return h("div", { staticClass: "mm-hint mm-beforenow", staticStyle: { marginTop: "6px" } },
        before ? tp("Before {b}  →  now {n}", { b: h("b", this.pictureText(before)), n: h("b", now) })
               : tp("Now {n}", { n: h("b", now) }));
    },

    // Confirm-or-revert banner: page-wide, above the tab bar (render in index.js).
    revertButtons(h) {
      var self = this, p = this.pending, busy = p.keeping || p.reverting;
      return h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
        h("button", { staticClass: "mm-btn danger", attrs: { disabled: busy },
                      on: { click: function () { self.revertBands(); } } }, p.reverting ? "Reverting..." : "Revert now"),
        h("button", { staticClass: "mm-btn keep", attrs: { disabled: busy },
                      on: { click: function () { self.keepBands(); } } }, p.keeping ? "Keeping..." : "Keep")
      ]);
    },

    revertErrors(h) {
      var p = this.pending, msg = p.keepError || p.revertError;
      return msg ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--error)", marginTop: "6px" } }, msg) : null;
    },

    renderRevert(h) {
      var self = this, p = this.pending;
      if (p.done) {
        var doneMsg = p.reverting ? "Reverting..." :
          p.tooLate ? (p.kind === "cell"
            ? "Too late to keep: the auto-revert had already restored your previous cell setting. Apply it again if you want it."
            : "Too late to keep: the auto-revert had already restored your previous bands. Apply it again if you want it.") :
          p.unknown ? "Couldn't reach the router to see what the auto-revert did - reload once you're back online." :
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
          ? tp("Your connection dropped while applying, but the {lock} did apply.",
               { lock: h("b", t("{rat} lock PCI {pci} / ARFCN {freq}", { rat: ua.rat === "4g" ? "LTE" : "5G", pci: ua.pci, freq: ua.freq })) })
          : tp("Your connection dropped while applying, but the band change ({what}) most likely applied.",
               { what: h("b", ua.reset ? t("filtering off + Auto") :
                 [ua.mode ? t("mode {m}", { m: modeName(ua.mode) }) : "", ua.sa ? " SA " + ua.sa : "", ua.nsa ? " NSA " + ua.nsa : "", ua.lte ? " LTE " + ua.lte : ""].join("").trim()) });
        return h("div", { staticClass: "mm-revert" }, [
          h("div", { staticClass: "mm-revert-row" }, [
            h("span", what.concat([" "]).concat(
              tp("If the auto-revert is still running it will undo this within ~60s - {keep} to make it stick, or {revert} to remove it now.",
                 { keep: h("b", t("Keep")), revert: h("b", t("Revert")) }))),
            this.revertButtons(h)
          ]),
          this.revertErrors(h)
        ]);
      }
      // Summarise what changed (applied = { mode, sa, nsa, lte } for bands;
      // { rat, pci, freq } for a cell lock).
      var a = p.applied || {}, bits = [];
      if (p.kind === "cell") {
        bits.push(t("{rat} cell PCI {pci} / ARFCN {freq}", { rat: a.rat === "4g" ? "LTE" : "5G", pci: a.pci, freq: a.freq }));
      } else if (a.reset) {
        bits.push(t("default: band filtering off, mode Auto"));
      } else {
        if (a.mode) bits.push(t("mode {m}", { m: modeName(a.mode) }));
        if (a.sa) bits.push("5G-SA " + a.sa.split(":").map(function (b) { return "n" + b; }).join(" "));
        if (a.nsa) bits.push("5G-NSA " + a.nsa.split(":").map(function (b) { return "n" + b; }).join(" "));
        if (a.lte) bits.push("LTE " + a.lte.split(":").map(function (b) { return "B" + b; }).join(" "));
      }
      var pct = Math.max(0, Math.min(100, (p.remaining / p.window) * 100));
      return h("div", { staticClass: "mm-revert" }, [
        h("div", { staticClass: "mm-revert-row" }, [
          h("span", p.expiring
            ? tp("Applied {what}. Time's up - the auto-revert is restoring your previous settings...",
                 { what: h("b", bits.join("; ") || t("band change")) })
            : tp("Applied {what}. Reverting in {s} unless you keep it.",
                 { what: h("b", bits.join("; ") || t("band change")),
                   s: h("b", { staticClass: "mm-cd" }, String(p.remaining) + "s") })),
          this.revertButtons(h)
        ]),
        h("div", { staticClass: "mm-bar" }, [h("i", { staticStyle: { width: pct.toFixed(1) + "%" } })]),
        this.renderBeforeNow(h),
        this.revertErrors(h)
      ]);
    },
  }
};
