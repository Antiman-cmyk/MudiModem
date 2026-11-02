// Bands tab: the three-layer band model (module / carrier policy / config), mode, Apply.
import { rpc, hasRpc } from "../kit/rpc.js";
import { t, tp } from "../kit/i18n.js";
export default {
  data() {
    return {
      bands: null,          // get_bands result, once fetched
      bandsLoading: false,
      bandsSeq: 0,          // bumps per fetch; a reply from an older one is dropped
      seenSlot: null,       // last real active slot (current_sim_slot) this page saw
      bandsError: "",
      sel: { sa: null, nsa: null, LTE: null },   // desired allowlists per editable RAT
      selMode: null,        // desired network mode (AUTO | NR5G | LTE)
      selNr5g: null,        // desired 5G method: both | nsa (SA off) | sa (NSA off)
      bandSlot: null,       // null = the SIM in use; a slot number = the standby SIM being edited
      storedNote: "",       // the note shown after a standby write
      applying: false,      // Apply in flight
      applyError: "",
      resetNote: "",        // transient feedback from "Apply defaults"
      resetTimer: null,     // handle clearing resetNote
    };
  },
  methods: {
    // Fetch the three-layer band model from our backend.
    // opts.light: after a cell-lock action only GL's store can have changed
    // (network_mode, the tower badge) — policy/capability (2-3 AT reads) cannot
    // — so ask for config+meta only (zero AT) and merge them into the model
    // already held. Falls back to a full fetch when there is no model yet.
    fetchBands(opts) {
      var self = this;
      var light = !!(opts && opts.light) && !!this.bands;
      if (!hasRpc()) {
        this.bandsError = "RPC helper unavailable";
        return;
      }
      if (!light) { this.bandsLoading = true; this.bandsError = ""; }
      this.clearResetNote();
      var seq = ++this.bandsSeq;
      var args = light ? { light: 1 } : {};
      if (this.bandSlot != null) args.slot = this.bandSlot;
      rpc("get_bands", args, { timeout: 15000 })
        .then(function (res) {
          // A newer fetch (e.g. after a SIM switch) owns the model now.
          if (seq !== self.bandsSeq) return;
          // A soft error ({error}) RESOLVES through $rpcRequest (it only rejects
          // on err_msg/err_code). Storing it as `bands` would make renderGroup
          // dereference d.supported and throw — freezing the tab on the
          // loading text with no message and no refresh button.
          if (!res || res.error || !res.config) {   // a reply without a config is not a band model
            if (!light) self.bandsError = (res && res.error) || "request failed";
            return;
          }
          if (light) {
            if (!self.bands) return;
            self.bands.config = res.config;
            self.bands.meta = Object.assign({}, self.bands.meta, res.meta);
          } else {
            self.bands = res;
          }
          // Seed each editable selection from the current config; an empty config
          // means "unrestricted", so start from everything the carrier permits.
          self.sel = { sa: self.seedFor("sa"), nsa: self.seedFor("nsa"), LTE: self.seedFor("LTE") };
          self.selMode = (res.meta && res.meta.mode) || "AUTO";
          self.selNr5g = (res.config && res.config.nr5g) || "both";
        })
        .catch(function (e) {
          if (seq !== self.bandsSeq) return;
          if (!light) self.bandsError = (e && (e.type || e.message)) || "request failed";
        })
        .then(function () { if (!light && seq === self.bandsSeq) self.bandsLoading = false; });
    },

    seedFor(group) {
      var cfg = (this.bands.config && this.bands.config[group]) || [];
      var pol = (this.bands.policy && this.bands.policy[group]) || [];
      return (cfg.length ? cfg : pol).slice();
    },

    // The interactive RATs (each maps to a set_bands arg).
    interactive(group) { return group === "sa" || group === "nsa" || group === "LTE"; },

    argKey(group) { return group === "LTE" ? "lte" : group; },   // set_bands arg name,

    // Which RATs a given network mode actually enables (NSA needs an LTE anchor).
    modeEnables(group, mode) {
      if (group === "sa") return mode === "AUTO" || mode === "NR5G";
      if (group === "nsa") return mode === "AUTO";
      if (group === "LTE") return mode === "AUTO" || mode === "LTE";
      return false;
    },

    ratActive(group) { return this.modeEnables(group, this.selMode); },

    appliedMode() { return (this.bands && this.bands.meta && this.bands.meta.mode) || "AUTO"; },

    // Would `mode` strand the active lock? Reuse the band-group RAT gate:
    // a 4g lock needs LTE enabled, a 5g lock needs SA enabled.
    modeStrands(mode) {
      var lk = this.lockInfo();
      if (!lk) return false;
      return !this.modeEnables(lk.rat === "4g" ? "LTE" : "sa", mode);
    },

    lockConflict() { return this.modeStrands(this.appliedMode()); },

    setMode(m) {
      // Block moving INTO a mode that would strand the lock. The mode the modem
      // is already in is exempt — we never auto-write it away; only a NEW
      // stranding selection is refused (the banner tells the user how to fix it).
      if (this.pending) return;
      if (this.modeStrands(m) && m !== this.appliedMode()) return;
      this.clearResetNote();
      this.selMode = m;
    },

    modeChanged() { return this.bands && this.selMode !== ((this.bands.meta && this.bands.meta.mode) || "AUTO"); },

    // The 5G method (SA + NSA / NSA only / SA only): GL turns an empty NR-SA list into
    // nr5g_disable_mode 1 and an empty NR-NSA list into 2 (measured by running GL itself).
    appliedNr5g() { return (this.bands && this.bands.config && this.bands.config.nr5g) || "both"; },
    nr5gChanged() { return !!this.bands && this.selMode !== "LTE" && (this.selNr5g || "both") !== this.appliedNr5g(); },
    offByMethod(group) {
      return this.selMode !== "LTE" && ((this.selNr5g === "nsa" && group === "sa") || (this.selNr5g === "sa" && group === "nsa"));
    },
    setNr5g(m) {
      if (this.pending) return;
      this.selNr5g = m;
      this.applyError = "";
    },
    // The SIM not in use, when there is one: its bands can be edited and are stored, then applied by
    // GL the next time it connects (SIM switch / failover) — docs/knowledge.md §4.2.
    standbySlot() {
      var self = this;
      var other = (this.networks || []).filter(function (n) {
        return String(n.slot) !== String(self.activeSlot) && (n.iccid || n.imsi);
      })[0];
      return other ? Number(other.slot) : null;
    },
    editStandby(on) {
      if (this.pending || this.applying) return;
      this.bandSlot = on ? this.standbySlot() : null;
      this.storedNote = "";
      this.applyError = "";
      this.bands = null;
      this.fetchBands();
    },

    // Only policy-permitted bands are selectable; blocked ones never take.
    selectable(group, b) {
      if (!this.interactive(group) || !this.bands) return false;
      return (this.bands.policy[group] || []).indexOf(b) !== -1;
    },

    isSelected(group, b) {
      var s = this.sel[group];
      return s && s.indexOf(b) !== -1;
    },

    toggleBand(group, b) {
      if (this.pending || !this.sel[group]) return;   // locked during a pending revert
      this.clearResetNote();
      var i = this.sel[group].indexOf(b);
      if (i === -1) this.sel[group].push(b); else this.sel[group].splice(i, 1);
    },

    selectAll(group) {
      if (this.pending || !this.bands) return;
      this.clearResetNote();
      this.sel[group] = (this.bands.policy[group] || []).slice();   // all permitted
    },

    selectNone(group) {
      if (this.pending) return;
      this.clearResetNote();
      this.sel[group] = [];
    },

    invertSel(group) {
      if (this.pending || !this.bands) return;
      this.clearResetNote();
      var perm = this.bands.policy[group] || [], cur = this.sel[group] || [];
      this.sel[group] = perm.filter(function (b) { return cur.indexOf(b) === -1; });
    },

    resetDefault() {
      // GL's TRUE default: band filtering OFF + Auto mode (set_band_config
      // {band_enable:false, network_mode:"AUTO"}) — not "every permitted band"
      // re-listed. Always written, still through confirm-or-revert.
      if (this.applying) return;
      if (this.pending) return this.flashReset("A change is already pending - Keep or Revert it first.");
      if (!this.bands) return this.flashReset("Bands haven't loaded yet - hit refresh.");
      this.applyError = "";
      this.applyBands({ reset: true });   // clears the note, so flash AFTER it
      this.flashReset(this.bands.config && this.bands.config.enable === false && this.appliedMode() === "AUTO"
        ? "Already at the default - re-sending 'filtering off + Auto' to the modem anyway."
        : "Sending the default to the modem: band filtering off + Auto mode.");
    },

    // Transient one-line feedback under the Bands footer. Any later edit clears
    // it, so the note never describes a state the user has since moved off.
    flashReset(msg) {
      var self = this;
      this.clearResetNote();
      this.resetNote = msg;
      this.resetTimer = setTimeout(function () {
        self.resetNote = ""; self.resetTimer = null;
      }, 8000);
    },

    clearResetNote() {
      if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
      this.resetNote = "";
    },

    changed(group) {
      if (!this.bands || !this.sel[group]) return false;
      var cur = this.seedFor(group).sort(function (a, b) { return a - b; });
      var sel = this.sel[group].slice().sort(function (a, b) { return a - b; });
      if (cur.length !== sel.length) return true;
      for (var i = 0; i < cur.length; i++) if (cur[i] !== sel[i]) return true;
      return false;
    },

    // A group edit that would actually be SENT: under 4G-only the NR groups are
    // never sent (GL empties them in its store under LTE mode, so "applying"
    // them would be a lie the countdown then repeats). They stay edited in the
    // grid and go out once the mode includes them.
    sendable(group) {
      return this.changed(group) && !(this.selMode === "LTE" && group !== "LTE") && !this.offByMethod(group);
    },

    changedAny() {
      return this.sendable("sa") || this.sendable("nsa") || this.sendable("LTE") || this.modeChanged() || this.nr5gChanged();
    },

    emptyChange() {
      // an edited RAT with zero bands selected — not allowed (would drop the RAT)
      return (this.sendable("sa") && this.sel.sa.length === 0) ||
             (this.sendable("nsa") && this.sel.nsa.length === 0) ||
             (this.sendable("LTE") && this.sel.LTE.length === 0);
    },

    // opts.reset=true sends GL's default (filtering off + AUTO) instead of the
    // grid — the "Apply defaults" contract: press it and the modem is written,
    // so the result is never ambiguous. Still confirm-or-revert. Otherwise only
    // the changed groups + mode go out; the backend keeps the rest as-is.
    applyBands(opts) {
      var self = this;
      var reset = !!(opts && opts.reset);
      if (this.applying || this.pending) return;
      if (!reset && (!this.changedAny() || this.emptyChange())) return;
      if (!hasRpc()) return;
      var payload = {};
      if (reset) payload.reset = true;
      else {
        var include = function (group, key) {
          if (self.sendable(group)) payload[key] = (self.sel[group] || []).slice();
        };
        include("sa", "sa");
        include("nsa", "nsa");
        include("LTE", "lte");
        if (this.modeChanged()) payload.mode = this.selMode;
        if (this.nr5gChanged()) payload.nr5g = this.selNr5g;
      }
      var slot = this.slotOf(this.bands);
      if (slot !== undefined) payload.slot = slot;
      var standby = this.bandSlot != null;
      if (standby) { payload.standby = true; payload.slot = this.bandSlot; }
      this.applying = true;
      this.applyError = "";
      this.clearResetNote();
      rpc("set_bands", payload, { timeout: 20000 })
        .then(function (res) {
          if (!res || res.error) {
            self.applyError = (res && res.error) || "apply failed";
            if (self.onStaleSlot(res)) self.applyError = res.error;   // onSlotChange cleared it; keep the why
            return;
          }
          if (res.stored) {                       // the standby SIM: nothing to confirm now
            self.storedNote = t("Stored for SIM {n}. GL applies it the next time SIM {n} connects.", { n: res.slot });
            self.fetchBands();
            return;
          }
          self.startCountdown(res.window || 60, res.applied, "bands", res);
        })
        .catch(function (e) {
          var t = e && (e.type || e.message);
          // Auth/param errors mean nothing was written. Anything else (timeout,
          // rpcCancel, network reset) is AMBIGUOUS: GL's set_band_config may
          // re-register the modem and drop this very reply after the write took
          // and the watchdog armed. Offer Keep/Revert without a false timer —
          // confirm() on a non-pending state is a harmless no-op.
          if (t === "invalidParams" || t === "accessDenied") { self.applyError = t; return; }
          if (standby) { self.applyError = t || "request failed"; return; }   // a store, not a radio change
          var a = { mode: payload.mode };
          if (payload.reset) a.reset = true;
          if (payload.sa) a.sa = payload.sa.join(":");
          if (payload.nsa) a.nsa = payload.nsa.join(":");
          if (payload.lte) a.lte = payload.lte.join(":");
          self.clearCountdown();
          self.pending = { kind: "bands", applied: a, uncertain: true, window: 60, remaining: 60 };
          self.restoreChange(24);     // ~60 s: once the box answers, show the real countdown (or nothing)
        })
        .then(function () { self.applying = false; });
    },

    // Classify one band for the read-only groups: active / permitted / blocked.
    bandState(group, b) {
      var d = this.bands;
      var has = function (list, x) { return (list || []).indexOf(x) !== -1; };
      if (has(d.capability[group], b)) return "active";
      if (has(d.policy[group], b)) return "permitted";
      return "blocked";
    },
    // ---- strip trace, fed by mudimodem-collectd via get_history ----,

    // ---- band grid render helpers ----
    // sa + LTE are interactive (set_bands writes them); nsa stays read-only.
    renderGroup(h, group, title) {
      var self = this, d = this.bands;
      var interactive = this.interactive(group);
      var supported = (d.supported[group] || []).slice();
      supported.sort(function (a, b) {
        var fa = self.freqOf(group, a), fb = self.freqOf(group, b);
        if (fa === undefined) fa = 1e9; if (fb === undefined) fb = 1e9;
        return (fa - fb) || (a - b);
      });
      if (supported.length === 0) return null;
      var pre = this.prefixOf(group);
      var servingHere = {};
      self.servingBands.forEach(function (sb) { if (sb.group === group) servingHere[sb.band] = sb.role; });
      var chips = supported.map(function (b) {
        var serving = servingHere[b] !== undefined;
        var f = self.freqOf(group, b);
        var cls, tip;
        if (interactive) {
          if (!self.selectable(group, b)) {
            cls = "blocked"; tip = t("{b} blocked by carrier policy; selecting has no effect", { b: pre + b });
          } else if (self.isSelected(group, b)) {
            cls = "sel"; tip = t("{b} allowed (click to remove)", { b: pre + b });
          } else {
            cls = "unsel"; tip = t("{b} permitted (click to allow)", { b: pre + b });
          }
        } else {
          var st = self.bandState(group, b);
          cls = st;
          tip = pre + b + " " + t(({ active: "in use", permitted: "permitted, not active", blocked: "blocked by carrier policy" })[st]);
        }
        var clickable = interactive && cls !== "blocked" && !self.pending;
        if (serving) tip += " — " + t("serving now ({role})", { role: servingHere[b] });
        return h("span", {
          key: b,
          staticClass: "mm-band " + cls + (serving ? " serving" : "") + (clickable ? " clickable" : ""),
          attrs: { title: tip },
          on: clickable ? { click: function () { self.toggleBand(group, b); } } : {}
        }, [h("b", pre + b), h("s", f ? String(f) : " ")]);
      });
      // per-group actions (interactive groups only): All / None / Invert
      var actions = null;
      if (interactive && !this.pending) {
        var mkAct = function (label, fn) {
          return h("button", { staticClass: "mm-act", on: { click: fn } }, label);
        };
        actions = h("span", { staticClass: "mm-acts" }, [
          mkAct("All", function () { self.selectAll(group); }),
          mkAct("None", function () { self.selectNone(group); }),
          mkAct("Invert", function () { self.invertSel(group); })
        ]);
      }
      var counts = t("{s} supported / {p} permitted / {a} active", {
        s: (d.supported[group] || []).length, p: (d.policy[group] || []).length, a: (d.capability[group] || []).length });
      // Mode gate: if the selected mode doesn't enable this RAT, say so — the
      // selections are inert until the mode includes it.
      var gate = null;
      if (interactive && !this.ratActive(group)) {
        var need = t(group === "nsa" ? "Auto" : (group === "LTE" ? "Auto or 4G only" : "Auto or 5G only"));
        var modeName = t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[this.selMode] || this.selMode);
        gate = h("div", { staticClass: "mm-gate" },
          this.selMode === "LTE" && group !== "LTE"
            ? t("Off under {mode} - 5G selections are not sent (GL clears them under 4G-only). Set the mode to {need} to use them.", { mode: modeName, need: need })
            : t("Off under {mode} - these won't apply. Set the mode to {need} to use them.", { mode: modeName, need: need }));
      }
      if (interactive && !gate && this.offByMethod(group)) {
        gate = h("div", { staticClass: "mm-gate" }, this.selNr5g === "nsa"
          ? "Off: 5G NSA only - SA is turned off, so these bands are not used."
          : "Off: 5G SA only - NSA is turned off, so these bands are not used.");
      }
      return h("div", { staticClass: "mm-grp" + (gate ? " mm-grp-off" : ""), key: group }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, interactive ? t(title) : t("{title} (read-only)", { title: t(title) })),
          // interactive groups show the counts on their own line below; never twice
          actions || (interactive ? null : h("span", { staticClass: "mm-hint" }, counts))
        ]),
        interactive ? h("div", { staticClass: "mm-hint", staticStyle: { margin: "-3px 0 6px" } }, counts) : null,
        gate,
        h("div", { staticClass: "mm-wrap" }, chips),
        h("div", { staticClass: "mm-axis2" }, [
          h("span", "low band, reaches far"),
          h("span", "high band, fast + short range")
        ])
      ]);
    },

    // The network-mode selector (Auto / 5G only / 4G only).
    renderMode(h) {
      var self = this, cur = this.selMode;
      var opts = [["AUTO", "Auto"], ["NR5G", "5G only"], ["LTE", "4G only"]];
      return h("div", { staticClass: "mm-grp" }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Network mode"),
          this.modeChanged()
            ? h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } }, "changed")
            : h("span", { staticClass: "mm-hint" }, "which radios the modem may use")
        ]),
        h("div", { staticClass: "mm-seg" }, opts.map(function (o) {
          // Block the mode that would strand an active cell lock — but never the
          // mode the modem is already in (greying the current option reads as broken).
          var blocked = self.modeStrands(o[0]) && o[0] !== self.appliedMode();
          return h("button", {
            key: o[0],
            staticClass: "mm-seg-b" + (cur === o[0] ? " on" : ""),
            attrs: {
              disabled: !!self.pending || blocked,
              title: blocked
                ? t("Would strand your {rat} cell lock - clear the lock first", { rat: self.lockInfo().rat === "4g" ? "LTE" : "5G" })
                : undefined
            },
            on: { click: function () { self.setMode(o[0]); } }
          }, o[1]);
        }))
      ]);
    },

    // The 5G method selector. Hidden under 4G-only (no 5G at all); under 5G-only, "NSA only" is
    // refused: GL re-sends mode_pref NR5G after the apply, and NSA needs an LTE anchor.
    renderNr5g(h) {
      var self = this;
      if (this.selMode === "LTE") return null;
      var opts = [["both", "SA + NSA"], ["nsa", "NSA only"], ["sa", "SA only"]];
      return h("div", { staticClass: "mm-grp" }, [
        h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "5G"),
          this.nr5gChanged()
            ? h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } }, "changed")
            : h("span", { staticClass: "mm-hint" }, "standalone, non-standalone, or both")
        ]),
        h("div", { staticClass: "mm-seg" }, opts.map(function (o) {
          var blocked = o[0] === "nsa" && self.selMode === "NR5G";
          return h("button", {
            key: o[0],
            staticClass: "mm-seg-b" + ((self.selNr5g || "both") === o[0] ? " on" : ""),
            attrs: { disabled: !!self.pending || blocked,
                     title: blocked ? t("NSA needs LTE: choose Auto to use NSA only") : undefined },
            on: { click: function () { self.setNr5g(o[0]); } }
          }, o[1]);
        }))
      ]);
    },

    // Which SIM's bands this panel edits: the one in use (confirm-or-revert) or the standby one
    // (stored, applied by GL when that SIM next connects). Only with two SIMs.
    renderSimPick(h) {
      var self = this, other = this.standbySlot();
      if (other == null && this.bandSlot == null) return null;
      var on = this.bandSlot != null;
      return h("div", { staticClass: "mm-seg", staticStyle: { marginBottom: "10px" } }, [
        h("button", { staticClass: "mm-seg-b" + (on ? "" : " on"), attrs: { disabled: !!this.pending || this.applying },
          on: { click: function () { if (on) self.editStandby(false); } } }, t("SIM {n} (in use)", { n: this.activeSlot })),
        h("button", { staticClass: "mm-seg-b" + (on ? " on" : ""), attrs: { disabled: !!this.pending || this.applying || other == null },
          on: { click: function () { if (!on) self.editStandby(true); } } }, t("SIM {n} (standby)", { n: on ? this.bandSlot : other }))
      ]);
    },

    renderBands(h) {
      if (this.bandsLoading) return h("div", { staticClass: "mm-empty" }, "Reading band configuration from the modem...");
      if (this.bandsError) return h("div", { staticClass: "mm-empty" }, t("Couldn't read bands: {err}", { err: this.bandsError }));
      if (!this.bands) return h("div", { staticClass: "mm-empty" }, "...");
      var d = this.bands, self = this;
      var groups = [
        this.renderMode(h),
        this.renderNr5g(h),
        this.renderGroup(h, "sa", "5G NR standalone"),
        this.renderGroup(h, "nsa", "5G NR non-standalone"),
        this.renderGroup(h, "LTE", "LTE")
      ].filter(Boolean);
      var op = (d.meta && d.meta.plmn) ? d.meta.plmn : "";
      var warn = (d.meta && d.meta.plmn_matched === false)
        ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
            "Couldn't confirm which SIM answered - values may be for the other slot")
        : null;
      // GL stores a network mode outside Auto/5G/4G (e.g. the LTE:NR5G a GL 4G
      // tower lock leaves behind): shown as-is; a band-only apply passes it
      // through untouched, only an explicit mode pick here replaces it.
      var modeWarn = (d.meta && d.meta.mode_known === false)
        ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
            t("GL reports network mode \"{mode}\", which this panel doesn't offer - it stays as it is unless you pick a mode below.", { mode: d.meta.mode_raw }))
        : null;
      // Network-type lock conflict: the modem is cell-locked to a RAT the current
      // mode excludes, so the lock can't take effect. Name the lock + the fix.
      var lockWarn = this.lockConflict()
        ? h("div", { staticClass: "mm-revert" }, [
            h("div", { staticClass: "mm-revert-row", staticStyle: { display: "block", color: "var(--warning-hover)" } }, [
              h("b", t("⚠ Modem is cell-locked to {lock}, ", { lock: this.lockLabel() })),
              t("but the network mode is {mode} - the lock can't take effect. Set the mode to {need}, or clear the lock on the Cell lock tab.", {
                mode: t({ NR5G: "5G only", LTE: "4G only", AUTO: "Auto" }[this.appliedMode()] || this.appliedMode()),
                need: t(this.lockInfo().rat === "4g" ? "Auto or 4G only" : "Auto or 5G only") })
            ])
          ])
        : null;
      var head = [
        h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, [
          h("span", { staticClass: "mm-sect" }, "Bands"),
          h("span", [
            h("span", { staticClass: "mm-hint", staticStyle: { marginRight: "10px" } }, op ? t("carrier {plmn}", { plmn: op }) : ""),
            h("button", {
              staticClass: "mm-tab", staticStyle: { fontSize: "11.5px", padding: "2px 0", borderBottom: "0" },
              attrs: { disabled: !!this.pending },
              on: { click: function () { if (!self.pending) self.fetchBands(); } }
            }, self.bandsLoading ? "refreshing..." : "refresh")
          ])
        ]),
        h("div", { staticClass: "mm-hint", staticStyle: { margin: "3px 0 12px" } },
          "Choose the network mode and which 5G/LTE bands the modem may use. Blocked bands are ones the module supports but your carrier forbids - they can't be selected because they never take."),
        this.renderSimPick(h),
        this.bandSlot != null
          ? h("div", { staticClass: "mm-note", staticStyle: { marginBottom: "10px" } }, t("Editing SIM {n}, which is not in use. Changes are stored and GL applies them the next time SIM {n} connects (a SIM switch or failover) - without the 60 s revert, since nothing changes now.", { n: this.bandSlot }))
          : null,
        warn,
        modeWarn,
        lockWarn,
        null   // the pending banner is page-wide (render), not per tab
      ];
      var footer = [];
      if (!this.pending) {
        var changed = this.changedAny();
        var empty = this.emptyChange();
        var status;
        if (this.applyError) status = h("span", { staticStyle: { color: "var(--error)" } }, this.applyError);
        else if (empty) status = h("span", { staticStyle: { color: "var(--error)" } }, "Each edited band group needs at least one band");
        else if (changed) {
          var parts = [];
          if (this.modeChanged()) parts.push(t("mode -> {m}", { m: t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[this.selMode] || this.selMode) }));
          if (this.selMode === "LTE" && (this.changed("sa") || this.changed("nsa")))
            parts.push(t("5G selections held back under 4G-only"));
          if (this.changed("sa")) parts.push(this.sel.sa.length + " SA");
          if (this.changed("nsa")) parts.push(this.sel.nsa.length + " NSA");
          if (this.changed("LTE")) parts.push(this.sel.LTE.length + " LTE");
          if (this.nr5gChanged()) parts.push(t({ both: "5G SA + NSA", nsa: "5G NSA only", sa: "5G SA only" }[this.selNr5g]));
          status = this.bandSlot != null
            ? t("{what} changed; stored for SIM {n}", { what: parts.join(" + "), n: this.bandSlot })
            : t("{what} changed; applies with a 60s revert", { what: parts.join(" + ") }) + " " +
              t("The link drops for a few seconds while the modem re-registers.");
        } else status = "No changes";
        footer.push(h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, [status]),
          h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
            h("button", {
              staticClass: "mm-btn",
              attrs: { disabled: this.applying, title: "Writes GL's default to the modem now: band filtering off + Auto mode (60s revert)" },
              on: { click: function () { self.resetDefault(); } }
            }, "Apply defaults"),
            h("button", {
              staticClass: "mm-btn primary",
              attrs: { disabled: !changed || this.applying || empty },
              on: { click: function () { self.applyBands(); } }
            }, this.applying ? "Applying..." : "Apply")
          ])
        ]));
        if (this.resetNote) footer.push(h("div", { staticClass: "mm-note" }, this.resetNote));
        if (this.storedNote) footer.push(h("div", { staticClass: "mm-note" }, this.storedNote));
      }
      var legend = [h("div", { staticClass: "mm-legend" }, [
        h("span", [h("i", { staticStyle: { background: "var(--success)" } }), "allowed"]),
        h("span", [h("i", { staticStyle: { background: "transparent", border: "1px solid var(--border)" } }), "permitted, not selected"]),
        h("span", [h("i", { staticStyle: { background: "var(--text-hint)" } }), "blocked by policy"]),
        h("span", "ring = serving now (every carrier: PCC + SCCs)")
      ])];
      return h("div", { staticClass: "mm-card" }, head.filter(Boolean).concat(groups).concat(footer).concat(legend));
    },
  }
};
