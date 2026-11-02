// Cell lock tab: serving cell, pin / scan / lock / unlock, recovery notes.
import { rpc, hasRpc } from "../kit/rpc.js";
import { t as T, tp as TP } from "../kit/i18n.js";
export default {
  data() {
    return {
      lockSeq: 0,           // same, for get_lock
      lockData: null,       // get_lock result, once fetched
      lockLoading: false,
      lockError: "",
      lockBusy: false,      // a lock/unlock RPC in flight
      lockVerifying: false, // set_cell_lock dropped mid-flight; probing get_lock
      lockConfirm: null,    // target awaiting inline confirm ({...target,label})
      scanConfirm: false,   // explicit confirm gate before firing the disruptive scan
      // Scanned neighbour towers (Task 5 fills the scan card); pinTarget reads
      // scan.towers now to confirm an SCS reading when one is available.
      scan: { towers: [], running: false, error: "", ts: 0, slot: null },
    };
  },
  methods: {
    // Fetch the current cell-lock state (serving cell + any existing lock).
    fetchLock() {
      var self = this;
      if (!hasRpc()) {
        this.lockError = "RPC helper unavailable"; return;
      }
      this.lockLoading = true; this.lockError = "";
      var seq = ++this.lockSeq;
      rpc("get_lock", {}, { timeout: 20000 })
        .then(function (res) {
          if (seq !== self.lockSeq) return;   // a newer read owns the picture
          // {error} resolves, not rejects — keep the previous picture (if any)
          // and say why instead of rendering the error object as a lock state.
          if (!res || res.error) { self.lockError = (res && res.error) || "request failed"; return; }
          self.lockData = res;
        })
        .catch(function (e) { if (seq === self.lockSeq) self.lockError = (e && (e.type || e.message)) || "request failed"; })
        .then(function () { if (seq === self.lockSeq) self.lockLoading = false; });
    },

    // The slot a picture was read for (get_bands / get_lock meta.slot), sent
    // with every write so the backend can refuse one aimed at a SIM that is no
    // longer active. undefined when unknown (the backend then skips the check).
    slotOf(d) {
      var n = d && d.meta ? Number(d.meta.slot) : NaN;
      return isFinite(n) && n > 0 ? n : undefined;
    },

    // Active SIM changed: everything per-SIM on this page describes the other
    // one. Drop what can't be refetched (a scan, an armed confirm) and re-read
    // the rest. A pending change belongs to the old SIM and its watchdog — the
    // banner stays, and its own Keep/Revert refetch on completion.
    onSlotChange() {
      this.lockConfirm = null;
      this.scanConfirm = false;
      if (!this.scan.running) this.scan = { towers: [], running: false, error: "", ts: 0, slot: null };
      this.applyError = "";
      this.clearResetNote();
      if (this.bands || this.bandsLoading) this.fetchBands();
      if (this.lockData || this.lockLoading || this.tab === "lock") this.fetchLock();
    },

    // A write the backend refused because the active SIM changed under the
    // page: re-read so the user sees the SIM that is actually active.
    onStaleSlot(res) {
      if (!res || !res.slot_changed) return false;
      this.onSlotChange();
      return true;
    },

    // Build the lock target for the serving cell. SCS: last scan result for
    // this pci+arfcn if we have one, else the band default (flagged assumed).
    pinTarget() {
      var s = this.lockData && this.lockData.serving;
      // == null, not falsy: PCI 0 (LTE 0-503 / NR 0-1007) and EARFCN 0 (LTE B1) are real.
      if (!s || s.pci == null || s.arfcn == null) return null;
      var isNR = /NR5G/.test(s.rat || "");
      var t = { rat: isNR ? "5g" : "4g", pci: s.pci, freq: s.arfcn,
                band: s.band, label: "current cell PCI " + s.pci, slot: this.slotOf(this.lockData) };
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
      if (target.slot !== undefined) args.slot = target.slot;
      rpc("set_cell_lock", args, { timeout: 30000 })
        .then(function (res) {
          if (!res || res.error) {
            self.lockError = (res && res.error) || "lock failed";
            if (self.onStaleSlot(res)) self.lockConfirm = null;
            return;
          }
          self.lockConfirm = null;
          self.startCountdown(res.window || 60, res.applied, "cell", res);
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
        rpc("get_lock", {}, { timeout: 15000 })
          .then(function (res) {
            var lk = res && res.lock;
            var locked = (lk && lk.l4g && lk.l4g.locked) || (lk && lk.l5g && lk.l5g.locked);
            var armed = res && res.pending_kind === "cell";
            self.lockData = res;
            if (locked || armed) {
              self.lockConfirm = null;
              self.pending = { kind: "cell", applied: applied, uncertain: true, armed: !!armed };
              self.finishVerify();
              if (armed) self.restoreChange(3);   // replace "uncertain" with the real countdown
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
      var slot = this.slotOf(this.lockData);
      rpc("clear_cell_lock", slot !== undefined ? { slot: slot } : {}, { timeout: 30000 })
        .then(function (res) {
          if (res && res.error) { self.lockError = res.error; self.onStaleSlot(res); return; }
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
      rpc("scan_cells", {}, { timeout: 600000 })
        .then(function (res) {
          if (!res || res.error) { self.scan.error = (res && res.error) || "scan failed"; return; }
          self.scan.towers = res.towers || [];   // renderScanCard sorts at paint time
          self.scan.ts = res.ts || Date.now();
          self.scan.slot = res.slot != null ? Number(res.slot) : null;   // the SIM these cells were scanned for
        })
        .catch(function (e) { self.scan.error = (e && (e.type || e.message)) || "scan failed"; })
        .then(function () { self.scan.running = false; self.fetchLock(); });
    },

    // Lock target from a scan row: GL's own values verbatim, whole row as extra.
    scanTarget(row) {
      var isNR = /5G/.test(row.network_type || "");
      var t = { rat: isNR ? "5g" : "4g", pci: Number(row.pci), freq: Number(row.freq),
                band: row.band !== undefined ? Number(row.band) : undefined,
                label: "scanned cell PCI " + row.pci, extra: row,
                slot: this.scan.slot != null ? this.scan.slot : this.slotOf(this.lockData) };
      if (isNR) { t.scs = Number(row.scs); t.scsAssumed = false; }
      return t;
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
      push(T("Band"), s.band != null ? ((/NR5G/.test(s.rat || "") ? "n" : "B") + s.band) : null);
      push(T("Cell ID"), s.cell_id);
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
        var lkTarget = (hasPci ? "PCI " + lk.pci : "") + (hasPci && hasFreq ? " / " : "") + (hasFreq ? "ARFCN " + lk.freq : "");
        // GL's tower record names the RAT: an LTE lock's band is B<n>, an NR lock's n<n>.
        var lkNR = l5.locked || /NR|5G/.test(String(lk.network_type || ""));
        if (lkTarget && lk.band) lkTarget += " (" + (lkNR ? "n" : "B") + lk.band + ")";
        action = h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, TP("{locked} to {target}. The modem will not hand over.", {
            locked: h("b", { staticStyle: { color: "var(--success)" } }, T("Locked")),
            target: lkTarget || T("(details unavailable)") })),
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
            h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning-hover)" } },
              T(target.rat === "5g"
                ? "Lock to PCI {pci}? Network mode switches to 5G-only until unlocked."
                : "Lock to PCI {pci}? Network mode switches to 4G-preferred until unlocked.", { pci: target.pci }) +
              (target.scsAssumed ? " " + T("SCS {scs} kHz is assumed from the band.", { scs: target.scs }) : "") +
              " " + T("Auto-reverts in 60s unless kept.")),
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
              T("scanned {n} min ago", { n: Math.max(1, Math.round((Date.now() - this.scan.ts) / 60000)) }))
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
          ? T("Scan failed: {err}", { err: this.scan.error })
          : "5G SA exposes no neighbour list - only the serving cell is visible without a scan, and a scan takes the modem offline for up to ~10 minutes.");
      }
      var foot;
      if (!this.scan.running) {
        foot = this.scanConfirm
          ? h("div", { staticClass: "mm-foot" }, [
              h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning-hover)" } },
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
        return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, T("Couldn't read lock state: {err}", { err: this.lockError }))]);
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
        null,  // the pending banner is page-wide (render), not per tab
        this.lockError && this.lockData
          ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--error)" } }, this.lockError) : null,
        (this.lockData.stale)
          ? h("div", { staticClass: "mm-revert" }, [
              h("div", { staticClass: "mm-revert-row" }, [
                h("span", TP("The watchdog reverted a lock, but {gl} still remembers it - GL may re-apply it later. Clear it to reconcile.",
                  { gl: h("b", T("GL's stored lock")) })),
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
        h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6" } }, TP(
          "A kept cell lock lives in the modem's own NV (survives reboot, reflash and factory reset) and in GL's store. " +
          "Every lock made here auto-reverts in 60s unless you keep it, and the watchdog fires even if this page is closed. " +
          "If the router ever becomes unreachable over the web, the ssh way back is: {cmd} - it clears the cell lock on " +
          "both slots (GL's store and the modem), resets lock persistence and the network mode to Auto, and turns band filtering off.",
          { cmd: h("b", "ssh root@<router> /usr/sbin/mudimodem-revert panic") })),
        h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6", marginTop: "8px", color: "var(--warning-hover)" } }, TP(
          "{label} applying a lock briefly re-registers the modem, which can drop a remote (Tailscale / VPN) connection to " +
          "this router for a few seconds. It reconnects on its own - if the request seems to hang or fail, wait a moment; " +
          "the lock likely applied and this page will offer to keep or revert it once you're back.",
          { label: h("b", T("Remote sessions:")) }))
      ]);
    },
  }
};
