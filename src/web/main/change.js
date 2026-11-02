// Confirm-or-revert: the pending change as the router reports it (change_status), countdown, Keep / Revert, banner.
import { rpc } from "../kit/rpc.js";
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
      if (clock && typeof clock.deadline === "number" && typeof clock.now === "number")
        end = Date.now() + (clock.deadline - clock.now) * 1000;
      this.pending = { kind: kind || "bands", window: w, applied: applied, done: false, end: end,
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
            "The auto-revert has not finished after 30 s - use Revert now, or the ssh panic restore." });
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
                                { deadline: q.deadline, now: res.now });
          else if (!p)                                          // pending from an older version: no timer
            self.pending = { kind: q.kind, applied: q.applied || {}, uncertain: true, window: 60, remaining: 60 };
        } else if (p && p.uncertain) {
          // Nothing is armed: the dropped apply never took, or was already reverted.
          self.pending = null;
          self.applyError = "The connection dropped while applying, and nothing is pending on the router now - the change did not take, or was already reverted.";
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
          self.patchPending({ keeping: false, keepError: "Couldn't reach the router to keep it (" +
            ((e && (e.type || e.message)) || "error") + "). The countdown is still running - press Keep again." });
        });
    },

    revertBands() {
      var self = this, p = this.pending;
      if (!p || p.done || p.keeping || p.reverting) return;
      var k = p.kind;
      this.patchPending({ reverting: true, revertError: "" });
      rpc("revert_now", {}, { timeout: 20000 })
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
          self.patchPending({ reverting: false, revertError: "Couldn't reach the router to revert (" +
            ((e && (e.type || e.message)) || "error") + "). The auto-revert is still armed." });
        });
    },

    // Confirm-or-revert banner (design C1: inline, on the tab that caused it).
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
          p.tooLate ? "Too late to keep: the auto-revert had already restored your previous " +
                      (p.kind === "cell" ? "cell setting." : "bands.") + " Apply it again if you want it." :
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
            this.revertButtons(h)
          ]),
          this.revertErrors(h)
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
          h("span", p.expiring
            ? ["Applied ", h("b", bits.join("; ") || "band change"),
               ". Time's up - the auto-revert is restoring your previous settings..."]
            : ["Applied ", h("b", bits.join("; ") || "band change"),
               ". Reverting in ", h("b", { staticClass: "mm-cd" }, String(p.remaining) + "s"),
               " unless you keep it - watch the trace above."]),
          this.revertButtons(h)
        ]),
        h("div", { staticClass: "mm-bar" }, [h("i", { staticStyle: { width: pct.toFixed(1) + "%" } })]),
        this.revertErrors(h)
      ]);
    },
  }
};
