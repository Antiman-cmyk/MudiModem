// Config tab: version / self-update, device info, history-on-flash.
import { rpc, hasRpc, rpcSilentJob } from "../kit/rpc.js";
import { t, tp } from "../kit/i18n.js";
export default {
  data() {
    return {
      // ---- Config tab (Phase 5) ----
      deviceInfo: null,       // { model, cpu } — fetched once via system.board
      appVer: null,           // app_version result { installed, latest, update_available, checked, error? }
      updateConfirm: false,   // "Update now" armed, awaiting a second click
      updateConfirmTimer: null,
      updating: false,        // self_update in flight / polling
      updateDone: false,      // an update SUCCEEDED in this page's lifetime — the
                              // offer is spent until reload (the running chunk is
                              // still the old one, so re-offering it is a lie)
      updateMsg: "",          // final status line after an update attempt
      verRefreshTimer: null,  // re-read of the installed version after an update
      updatePollTimer: null,
      pollAttempts: 0,        // bounds the poll loop — give up after POLL_MAX
      POLL_MAX: 40,           // ~2 minutes at the 3s poll interval
      // History eMMC backup (get/set_history_persist) — off by default
      histPersist: null,
      histPersistBusy: false,
      histPersistErr: "",
    };
  },
  methods: {
    // ---- Config tab (Phase 5) ----
    modemName() {
      return (this.modem && this.modem.name) || "";   // this.modem already exists (computed)
    },

    fetchDeviceInfo() {
      var self = this;
      if (!hasRpc()) return Promise.resolve();
      return rpc("device_info", {}, { timeout: 8000 })
        .then(function (r) {
          self.deviceInfo = { model: (r && r.model) || "", cpu: (r && r.cpu) || "" };
        })
        .catch(function () { /* fail-silent: next tab-open retries via the !deviceInfo watcher */ });
    },

    // Fail-silent by contract: a failed version check shows the installed version
    // alone, never an error. That contract needs the SILENT transport — through
    // $rpcRequest the interceptor pops GL's global banner before our .catch runs,
    // which is exactly the noise this method promises not to make. It matters
    // most in refreshVersionAfterUpdate, which reads while nginx may still be
    // restarting. A failed read keeps whatever we already had.
    checkAppVersion() {
      var self = this;
      return rpcSilentJob("app_version", {})
        .then(function (r) { if (r) self.appVer = r; });
    },

    // After a successful self-update the box's /etc/mudimodem/version.json holds
    // the NEW version, but this card is still showing the one we just replaced.
    // Re-read it so the screen states what is actually installed.
    //
    // The install restarts nginx, so the first read can fail outright or race
    // the file swap and return the old number — retry a few times until it
    // matches the version we installed (or we run out of tries; a stale number
    // beats a spinner that never settles).
    refreshVersionAfterUpdate(target, tries) {
      var self = this;
      if (this.pollStopped) return;
      this.checkAppVersion().then(function () {
        if (self.pollStopped) return;
        var inst = (self.appVer && self.appVer.installed) || "";
        if (tries > 1 && target && inst !== target) {
          if (self.verRefreshTimer) clearTimeout(self.verRefreshTimer);
          self.verRefreshTimer = setTimeout(function () {
            self.refreshVersionAfterUpdate(target, tries - 1);
          }, 2500);
        }
      });
    },

    reloadPage() {
      if (typeof window !== "undefined" && window.location && window.location.reload) {
        window.location.reload();
      }
    },

    fetchHistoryPersist() {
      var self = this;
      if (!hasRpc()) return Promise.resolve();
      return rpc("get_history_persist", {}, { timeout: 8000 })
        .then(function (r) {
          self.histPersist = r || null;
          self.histPersistErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.histPersistErr = (e && (e.message || e.type)) || "request failed";
        });
    },

    applyHistoryPersist(enabled) {
      var self = this;
      if (this.histPersistBusy || !hasRpc()) return;
      this.histPersistBusy = true;
      this.histPersistErr = "";
      return rpc("set_history_persist", { enabled: !!enabled }, { timeout: 10000 })
        .then(function (r) {
          self.histPersistBusy = false;
          if (r && typeof r.enabled === "boolean") self.histPersist = r;
          self.histPersistErr = (r && r.error) || "";
        })
        .catch(function (e) {
          self.histPersistBusy = false;
          self.histPersistErr = (e && (e.message || e.type)) || "request failed";
        });
    },

    fmtHistSize(bytes) {
      var n = Number(bytes) || 0;
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KiB";
      return (n / (1024 * 1024)).toFixed(2) + " MiB";
    },

    armUpdate() {
      var self = this;
      if (this.updateConfirm || this.updating || this.updateDone) return;
      this.updateConfirm = true;
      if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
      this.updateConfirmTimer = setTimeout(function () { self.updateConfirm = false; }, 5000);
    },

    confirmUpdate() {
      var self = this;
      this.updateConfirm = false;
      if (this.updateConfirmTimer) { clearTimeout(this.updateConfirmTimer); this.updateConfirmTimer = null; }
      if (this.updating || this.updateDone) return Promise.resolve();
      if (!hasRpc()) return Promise.resolve();
      // The offer disappears from here on; the target version moves into the
      // status line so it stays visible without an actionable link beside it.
      var target = (this.appVer && this.appVer.latest) || "";
      this.updating = true;
      this.updateMsg = target ? t("Updating to v{v}…", { v: target }) : t("Updating…");
      this.pollStopped = false; this.pollAttempts = 0;   // fresh run — a prior update may have stopped/capped it
      return rpc("self_update", {}, { timeout: 12000 })
        .then(function () { self.pollUpdate(); })
        .catch(function (e) {
          self.updating = false;
          self.updateMsg = t("Couldn't start update: {err}", { err: (e && (e.message || e.type)) || "error" });
        });
    },

    // Polls update_status every 3s until a terminal result, a give-up cap
    // (POLL_MAX attempts), or the component tears down. `pollStopped` is the
    // teardown guard: `updatePollTimer` only ever holds the id of the NEXT
    // scheduled timer, so once a timer fires and its RPC is in flight, a plain
    // clearTimeout in beforeDestroy can no longer cancel anything — the async
    // continuation below is what must notice and stop rescheduling.
    pollUpdate() {
      var self = this;
      if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
      this.updatePollTimer = setTimeout(function () {
        if (self.pollStopped) return;   // torn down while this timer was pending
        self.pollAttempts++;
        // ⚠️ SILENT transport, not $rpcRequest. The install restarts nginx about
        // 6s into a ~9s update, so a poll landing in that window is guaranteed to
        // fail — and $rpcRequest's interceptor raises GL's global timeout banner
        // before our .catch can suppress it. That banner was the whole bug: the
        // update succeeded, the retry a few seconds later saw ok, and the user
        // still got a scary timeout. Failure now returns null and just retries.
        self.rpcSilent("update_status", {}, 8000)
          .then(function (s) {
            if (self.pollStopped) return;   // torn down while the request was in flight
            if (s && s.result) {
              self.updating = false;
              if (s.result.ok) {
                var v = (self.appVer && self.appVer.latest) || "";
                self.updateDone = true;   // spent: this page can't offer it again
                self.updateMsg = v ? t("Updated to v{v}. The page is still running the old interface —", { v: v })
                                   : t("Updated. The page is still running the old interface —");
                self.refreshVersionAfterUpdate(v, 4);
              } else {
                self.updateMsg = t("Update failed: {err} — see /var/log/mudimodem-update.log", { err: s.result.error || "unknown" });
              }
            } else if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();   // still running (or nginx mid-restart) — keep polling
            }
          })
          .catch(function () {
            if (self.pollStopped) return;   // torn down while the request was in flight
            if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();   // nginx restart drops a request; retry
            }
          });
      }, 3000);
    },

    renderConfig(h) {
      var self = this;
      var row = function (label, value) {
        return h("div", { staticClass: "mm-kv" }, [
          h("span", { staticClass: "mm-k" }, label),
          h("span", { staticClass: "mm-v" }, value || "—")
        ]);
      };

      // --- Device card ---
      var di = this.deviceInfo || {};
      var device = h("div", { staticClass: "mm-card" }, [
        h("div", { staticClass: "mm-card-h" }, "Device"),
        row("Model", di.model),
        row("CPU", di.cpu),
        row("Modem", this.modemName())
      ]);

      // --- MudiModem / version card ---
      var av = this.appVer || {};
      var installed = av.installed || "unknown";
      var verNodes = [h("span", {}, installed === "unknown" ? t("MudiModem (version unknown)") : "MudiModem v" + installed)];
      // The offer shows only while it is actionable: not mid-update (the click
      // would do nothing, and the status line already says what's happening),
      // and not after a successful one (this page is still running the OLD
      // chunk, so its "available" flag is stale until reload).
      if (av.checked && av.update_available && av.latest && !this.updating && !this.updateDone) {
        verNodes.push(h("span", { staticClass: "mm-upd" }, [
          " (" + t("v{v} available", { v: av.latest }) + " — ",
          this.updateConfirm
            ? h("a", { staticClass: "mm-link mm-warn", attrs: { href: "#" },
                on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.confirmUpdate(); } } },
                "click to confirm — briefly restarts the admin panel")
            : h("a", { staticClass: "mm-link", attrs: { href: "#" },
                on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.armUpdate(); } } },
                "Update now"),
          ")"
        ]));
      }
      var verLine = h("div", { staticClass: "mm-kv" }, verNodes);

      var cardKids = [h("div", { staticClass: "mm-card-h" }, "MudiModem"), verLine];
      if (this.updateMsg) {
        // On success the version line above already shows the newly installed
        // version; what's left is swapping THIS page for the new chunk, so the
        // note carries the reload as an action rather than an instruction.
        cardKids.push(h("div", { staticClass: "mm-note" }, this.updateDone
          ? [this.updateMsg + " ",
             h("a", { staticClass: "mm-link", attrs: { href: "#" },
               on: { click: function (e) { if (e.preventDefault) e.preventDefault(); self.reloadPage(); } } },
               "reload now")]
          : this.updateMsg));
      }
      var app = h("div", { staticClass: "mm-card" }, cardKids);

      // --- History persistence (eMMC backup, approach #2) ---
      var hp = this.histPersist;
      var histKids = [h("div", { staticClass: "mm-card-h" }, "History across reboots")];
      if (!hp) {
        histKids.push(h("div", { staticClass: "mm-note" },
          this.histPersistErr || "Loading…"));
      } else {
        histKids.push(h("div", { staticClass: "mm-kv" }, [
          h("label", { staticClass: "mm-k" }, [
            h("input", {
              attrs: { type: "checkbox", disabled: !!self.histPersistBusy },
              domProps: { checked: !!hp.enabled },
              on: { change: function (e) {
                self.applyHistoryPersist(!!(e.target && e.target.checked));
              } }
            }),
            " Keep signal & battery history across reboots"
          ])
        ]));
        histKids.push(h("div", { staticClass: "mm-note" },
          t("Live charts still use RAM. When this is on, the collector appends new samples to eMMC about every {n} minutes (~6 MiB for a full day of signal + battery). Off by default.",
            { n: (hp.flush_interval_s && Math.round(hp.flush_interval_s / 60)) || 10 })));
        if (hp.enabled || (hp.size_bytes && hp.size_bytes > 0)) {
          histKids.push(row("Backup size", self.fmtHistSize(hp.size_bytes)));
        }
        if (this.histPersistErr) {
          histKids.push(h("div", { staticClass: "mm-note" }, this.histPersistErr));
        }
      }
      var hist = h("div", { staticClass: "mm-card" }, histKids);

      return h("div", {}, [device, app, hist]);
    },
  }
};
