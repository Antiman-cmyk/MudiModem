import { loadChunk } from "../kit/chunks.js";

// Lazy tab chunks (Tracking, AT console, Speedtest, Battery): fetched on first open (kit/chunks.js).
export default {
  data() {
    return {
      // Tracking tab: the graph lives in its OWN chunk (gl-sdk4-ui-mudimodem-
      // tracking). Rather than route away (which hides our strip + tab bar), we
      // lazy-load that chunk on first open and render it as an in-page child
      // component, exactly as the SPA's own loader evals a view chunk.
      trackingComp: null,   // the loaded tracking component options, once fetched
      trackingLoading: false,
      trackingErr: "",
      // AT console tab: same lazy-chunk pattern as Tracking.
      consoleComp: null,
      consoleLoading: false,
      consoleErr: "",
      // Speedtest tab: same lazy-chunk pattern as Tracking/AT console.
      speedtestComp: null,
      speedtestLoading: false,
      speedtestErr: "",
      // Battery tab: same lazy-chunk pattern as Tracking/AT console/Speedtest.
      batteryComp: null,
      batteryLoading: false,
      batteryErr: "",
    };
  },
  methods: {
    // Open the in-page Tracking tab, lazy-loading its chunk on first use.
    openTracking() { this.tab = "tracking"; this.loadTracking(); },

    // Fetch + evaluate the tracking chunk the way the SPA's route loader does (kit/chunks.js).
    // Cached on the instance; a failed load shows a message and can be retried.
    loadTracking() {
      var self = this;
      if (this.trackingComp || this.trackingLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.trackingLoading = true; this.trackingErr = "";
      loadChunk("tracking")
        .then(function (comp) {
          self.trackingComp = comp; self.trackingLoading = false;
        })
        .catch(function (e) {
          self.trackingLoading = false;
          self.trackingErr = (e && (e.message || e.type)) || "could not load the graph";
        });
    },

    // Fetch + eval the AT-console chunk exactly like loadTracking above.
    loadConsole() {
      var self = this;
      if (this.consoleComp || this.consoleLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.consoleLoading = true; this.consoleErr = "";
      loadChunk("console")
        .then(function (comp) {
          self.consoleComp = comp; self.consoleLoading = false;
        })
        .catch(function (e) {
          self.consoleLoading = false;
          self.consoleErr = (e && e.message) || "load failed";
        });
    },

    // Open the in-page Speedtest tab, lazy-loading its chunk on first use.
    openSpeedtest() { this.tab = "speedtest"; this.loadSpeedtest(); },

    loadSpeedtest() {
      var self = this;
      if (this.speedtestComp || this.speedtestLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.speedtestLoading = true; this.speedtestErr = "";
      loadChunk("speedtest")
        .then(function (comp) {
          self.speedtestComp = comp; self.speedtestLoading = false;
        })
        .catch(function (e) {
          self.speedtestLoading = false;
          self.speedtestErr = (e && (e.message || e.type)) || "could not load the speed test";
        });
    },

    // Open the in-page Battery tab, lazy-loading its chunk on first use.
    openBattery() { this.tab = "battery"; this.loadBattery(); },

    loadBattery() {
      var self = this;
      if (this.batteryComp || this.batteryLoading) return;
      if (typeof window === "undefined" || !window.$axios) return;
      this.batteryLoading = true; this.batteryErr = "";
      loadChunk("battery")
        .then(function (comp) {
          self.batteryComp = comp; self.batteryLoading = false;
        })
        .catch(function (e) {
          self.batteryLoading = false;
          self.batteryErr = (e && (e.message || e.type)) || "could not load the battery view";
        });
    },
  }
};
