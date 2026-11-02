// Signal / band formatting helpers shared by the strip, the Bands and Cell lock tabs.
export default {
  data() {
    return {
      // Approximate downlink centre freq (MHz) per band, for spectrum ordering
      // and labels. Source: 3GPP TS 38.101-1 (NR) / 36.101 (LTE), rounded to the
      // marketing figure. Labels only — the modem is never sent a frequency.
      // Covers BOTH RG650V variants (NA + EU) — the module set differs per unit.
      freq: {
        n: { 1: 2100, 2: 1900, 3: 1800, 5: 850, 7: 2600, 8: 900, 12: 700, 13: 750, 14: 700,
             20: 800, 25: 1900, 26: 850, 28: 700, 29: 700, 30: 2300, 38: 2600, 40: 2300,
             41: 2500, 48: 3500, 66: 1700, 70: 1700, 71: 600, 75: 1500, 76: 1500,
             77: 3700, 78: 3500, 79: 4700 },
        B: { 1: 2100, 2: 1900, 3: 1800, 4: 1700, 5: 850, 7: 2600, 8: 900, 12: 700, 13: 750,
             14: 700, 17: 700, 18: 850, 19: 850, 20: 800, 25: 1900, 26: 850, 28: 700,
             29: 700, 30: 2300, 32: 1500, 34: 2000, 38: 2600, 39: 1900, 40: 2300,
             41: 2500, 42: 3500, 43: 3600, 46: 5200, 48: 3500, 66: 1700, 71: 600 }
      },
      // LTE band -> [F_DL_low MHz, N_Offs-DL] (3GPP TS 36.101 table 5.7.3-1), for
      // the channel readout. NR uses the global raster (chanMhz below).
      LTE_EARFCN: { 1: [2110, 0], 2: [1930, 600], 3: [1805, 1200], 4: [2110, 1950], 5: [869, 2400],
                    7: [2620, 2750], 8: [925, 3450], 12: [729, 5010], 13: [746, 5180], 14: [758, 5280],
                    17: [734, 5730], 18: [860, 5850], 19: [875, 6000], 20: [791, 6150], 25: [1930, 8040],
                    26: [859, 8690], 28: [758, 9210], 29: [717, 9660], 30: [2350, 9770], 32: [1452, 9920],
                    34: [2010, 36200], 38: [2570, 37750], 39: [1880, 38250], 40: [2300, 38650],
                    41: [2496, 39650], 42: [3400, 41590], 43: [3600, 43590], 46: [5150, 46790],
                    48: [3550, 55240], 66: [2110, 66436], 71: [617, 68586] },
      // Default NR SS-block SCS per band (kHz), used ONLY when no scan result
      // covers the serving cell. Source: 3GPP TS 38.104 §5.4.3 band tables —
      // FDD low/mid bands are 15 kHz, the TDD mid bands 30 kHz. The confirm
      // text says when this assumption is in play. Encoding (kHz vs index)
      // verified at the supervised milestone before first use.
      SCS_DEFAULT: { 1: 15, 2: 15, 3: 15, 5: 15, 7: 15, 8: 15, 12: 15, 13: 15, 14: 15,
                     20: 15, 25: 15, 26: 15, 28: 15, 29: 15, 30: 15, 38: 30, 40: 30,
                     41: 30, 48: 30, 66: 15, 70: 15, 71: 15, 75: 15, 76: 15,
                     77: 30, 78: 30, 79: 30 }
    };
  },
  methods: {
    // GL's own signal levels (libcm_network.so; cellular_compat LEVEL_AT, measured by running GL):
    // the ONE scale this page colours readings by. The strip and Tracking take the levels the
    // collector carries; rows without them (a scan, the neighbour list) compute the same here.
    // RSRP and SINR are the same for LTE and NR, RSRQ is not. 0 = no reading.
    glLevel(kind, v, nr) {
      var at = { rsrp: [-100, -105, -110], sinr: [12, 6, 0], rsrq: nr ? [-12, -16, -20] : [-6, -10, -14] }[kind];
      if (!at || v === null || v === undefined || v === "" || isNaN(Number(v))) return 0;
      v = Number(v);
      return v >= at[0] ? 4 : v >= at[1] ? 3 : v >= at[2] ? 2 : 1;
    },

    qFromLevel(lvl) {
      return ({ 1: "poor", 2: "fair", 3: "good", 4: "excellent" })[lvl] || "none";
    },

    qColor(q) {
      return ({
        poor: "var(--error)", fair: "var(--warning)", good: "var(--secondary)",   // GL 4.10 cellular-detail uses --secondary; --info-hover == --text-hint in dark
        excellent: "var(--success)", none: "var(--text-hint)"
      })[q];
    },

    // Case/punctuation-insensitive containment: "T-Mobile US" vs "T-Mobile".
    nameOverlap(a, b) {
      var n = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); };
      var x = n(a), y = n(b);
      return !!x && !!y && (x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
    },

    freqOf(group, b) {
      var t = (group === "LTE") ? this.freq.B : this.freq.n;
      return t[b];
    },

    prefixOf(group) { return group === "LTE" ? "B" : "n"; },

    // rat/mode string -> band group key (sa | nsa | LTE), null when unknown.
    groupOf(mode) {
      var m = mode || "";
      if (/NR5G-SA/.test(m)) return "sa";
      if (/NR5G/.test(m)) return "nsa";
      if (/LTE/.test(m)) return "LTE";
      return null;
    },

    // The one band formatter: "n78" / "B3" from the carrier's RAT.
    formatBand(rat, band) {
      if (band === undefined || band === null || band === "") return "—";
      return (/NR5G/.test(rat || "") ? "n" : "B") + band;
    },

    // Channel -> MHz. NR: 3GPP TS 38.104 global raster (no band needed).
    // LTE: band-aware (TS 36.101); unknown band => null (show the raw EARFCN).
    chanMhz(rat, band, arfcn) {
      var n = Number(arfcn);
      if (!n || isNaN(n)) return null;
      if (/NR5G/.test(rat || "")) {
        if (n < 600000) return n * 0.005;
        if (n < 2016667) return 3000 + (n - 600000) * 0.015;
        return 24250.08 + (n - 2016667) * 0.06;
      }
      var e = this.LTE_EARFCN[Number(band)];
      if (!e) return null;
      return e[0] + 0.1 * (n - e[1]);
    },

    chanLabel(rat, band, arfcn) {
      if (arfcn === undefined || arfcn === null || arfcn === "") return null;
      var mhz = this.chanMhz(rat, band, arfcn);
      return mhz ? String(arfcn) + " (" + mhz.toFixed(1) + " MHz)" : String(arfcn);
    },

    // seconds -> "45 s" / "12 min" / "3 h" for the stale-seed notice.
    fmtAge(sec) {
      sec = Number(sec) || 0;
      if (sec < 90) return Math.round(sec) + " s";
      if (sec < 5400) return Math.round(sec / 60) + " min";
      return (sec / 3600).toFixed(sec < 36000 ? 1 : 0) + " h";
    },

    scsFor(band) { return this.SCS_DEFAULT[band]; },
  }
};
