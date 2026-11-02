// Cell lock tab: neighbour cells WITHOUT a scan — one read-only AT+QENG="neighbourcell" through
// mudimodemd's AT queue (the console's transport), only when the user asks. The link stays up;
// GL's scan_cells takes the modem offline for minutes.
//
// What the modem returns — from the baseband itself (NON-HLOS modem.b24, quectel_eng_atc.c: only
// quec_qeng_query_lte_ncell and quec_qeng_query_wcdma_ncell exist, so NO NR neighbours on any RAT):
//   +QENG: "neighbourcell intra","LTE",<earfcn>,<pci>,<rsrq>,<rsrp>,<rssi>,<sinr>,<srxlev>,…
//   +QENG: "neighbourcell inter","LTE",<earfcn>,<pci>,<rsrq>,<rsrp>,<rssi>,<sinr>,<srxlev>,…
// where an inter-frequency cell's PCI…SINR are strings that may read "-". 5G SA answers a bare OK.
import { rpcAt } from "../kit/rpc.js";
import { t as T } from "../kit/i18n.js";

// LTE downlink EARFCN ranges (3GPP TS 36.101 table 5.7.3-1) -> band, for display only: a 4G
// lock needs EARFCN + PCI, not the band.
var LTE_DL = [[1, 0, 599], [2, 600, 1199], [3, 1200, 1949], [4, 1950, 2399], [5, 2400, 2649],
  [7, 2750, 3449], [8, 3450, 3799], [12, 5010, 5179], [13, 5180, 5279], [14, 5280, 5379],
  [17, 5730, 5849], [18, 5850, 5999], [19, 6000, 6149], [20, 6150, 6449], [25, 8040, 8689],
  [26, 8690, 9039], [28, 9210, 9659], [29, 9660, 9769], [30, 9770, 9869], [32, 9920, 10359],
  [34, 36200, 36349], [38, 37750, 38249], [39, 38250, 38649], [40, 38650, 39649],
  [41, 39650, 41589], [42, 41590, 43589], [43, 43590, 45589], [46, 46790, 54539],
  [48, 55240, 56739], [66, 66436, 67335], [71, 68586, 68935]];

export function lteBandOf(earfcn) {
  var n = Number(earfcn);
  if (!isFinite(n)) return undefined;
  for (var i = 0; i < LTE_DL.length; i++) if (n >= LTE_DL[i][1] && n <= LTE_DL[i][2]) return LTE_DL[i][0];
  return undefined;
}

// The modem's reply -> { cells: [{kind, rat, earfcn, pci, rsrq, rsrp, rssi, sinr, srxlev, band}] }.
// A "-" or empty field is undefined, never 0 (such a cell shows, but cannot be locked).
export function parseNeighbours(text) {
  var cells = [];
  var num = function (v) {
    var s = String(v == null ? "" : v).trim();
    if (s === "" || s === "-") return undefined;
    var n = Number(s);
    return isFinite(n) ? n : undefined;
  };
  String(text || "").replace(/\r/g, "\n").split("\n").forEach(function (l) {
    l = l.trim();
    var m = l.match(/^\+QENG:\s*"neighbourcell ?([a-z]*)"\s*,\s*"LTE"\s*,(.*)$/i);
    if (!m) return;
    var f = m[2].split(",");
    if (num(f[0]) === undefined) return;
    cells.push({ kind: m[1].toLowerCase() || "?", rat: "LTE", earfcn: num(f[0]), pci: num(f[1]),
                 rsrq: num(f[2]), rsrp: num(f[3]), rssi: num(f[4]), sinr: num(f[5]), srxlev: num(f[6]),
                 band: lteBandOf(f[0]) });
  });
  return { cells: cells };
}

export default {
  data() {
    return {
      // the last read: cells/other from parseNeighbours, the slot it was read for, its time
      nb: { cells: [], running: false, error: "", ts: 0, slot: null, read: false },
      nbConfirm: null,      // index of the row whose Lock awaits confirm
    };
  },
  methods: {
    readNeighbours() {
      var self = this;
      if (this.nb.running || this.scan.running) return;
      var slot = this.slotOf(this.lockData);
      this.nb = { cells: [], running: true, error: "", ts: 0, slot: slot == null ? null : slot, read: false };
      this.nbConfirm = null;
      rpcAt('AT+QENG="neighbourcell"', 8)
        .then(function (r) {
          if (!r || r.error) { self.nb.error = (r && r.error) || "request failed"; return; }
          var st = Array.isArray(r.steps) ? r.steps[0] : null;
          if (!st || st.status !== "ok") {
            self.nb.error = (st && st.status === "timeout") ? "the modem did not answer"
              : "the modem refused the command"; return;
          }
          var p = parseNeighbours(st.response);
          self.nb.cells = p.cells; self.nb.read = true; self.nb.ts = Date.now();
        })
        .catch(function (e) { self.nb.error = (e && (e.type || e.message)) || "request failed"; })
        .then(function () { self.nb.running = false; });
    },
    // Lock target from a neighbour row: a 4G lock is EARFCN + PCI (GL: QNWLOCK "common/4g").
    nbTarget(c) {
      return { rat: "4g", pci: c.pci, freq: c.earfcn, band: c.band, label: "neighbour cell PCI " + c.pci,
               slot: this.nb.slot != null ? this.nb.slot : this.slotOf(this.lockData) };
    },
    renderNeighbours(h) {
      var self = this, nb = this.nb;
      var locked = this.lockData && ((this.lockData.lock.l5g || {}).locked ||
                                     (this.lockData.lock.l4g || {}).locked);
      var head = h("div", { staticClass: "mm-grp-h" }, [
        h("span", { staticClass: "mm-grp-t" }, "Neighbour cells"),
        h("span", { staticClass: "mm-hint" }, !nb.ts ? "no scan, the link stays up"
          : Date.now() - nb.ts < 60000 ? "read just now"
          : T("read {n} min ago", { n: Math.round((Date.now() - nb.ts) / 60000) }))
      ]);
      var body = null;
      if (nb.running) body = h("div", { staticClass: "mm-empty" }, "Asking the modem...");
      else if (nb.error) body = h("div", { staticClass: "mm-empty" }, T("Couldn't read neighbours: {err}", { err: T(nb.error) }));
      else if (nb.read && !nb.cells.length)
        body = h("div", { staticClass: "mm-empty" },
          "The modem reports no neighbours. On 5G SA it never does - only a scan finds other cells there.");
      else if (nb.read) {
        var sorted = nb.cells.slice().sort(function (a, b) {
          if (a.rsrp === undefined) return 1;
          if (b.rsrp === undefined) return -1;
          return b.rsrp - a.rsrp;
        });
        var rows = sorted.map(function (c, i) {
          var q = c.rsrp !== undefined ? (c.rsrp >= -95 ? "good" : (c.rsrp >= -105 ? "fair" : "poor")) : "none";
          var confirming = self.nbConfirm === i;
          var target = self.nbTarget(c);
          return h("div", { key: "n" + i, staticClass: "mm-scan-row" }, [
            h("span", { staticClass: "mm-scan-badge" }, "LTE"),
            h("span", c.kind === "intra" ? T("same frequency") : c.kind === "inter" ? T("other frequency") : c.kind),
            h("span", (c.band !== undefined ? "B" + c.band : "B?") + "  EARFCN " + c.earfcn + "  PCI " + c.pci),
            h("span", { style: { color: self.qColor(q) } },
              (c.rsrp !== undefined ? c.rsrp + " dBm" : "") + (c.sinr !== undefined ? " · SINR " + c.sinr : "")),
            confirming
              ? h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
                  h("button", { staticClass: "mm-btn", on: { click: function () { self.nbConfirm = null; } } }, "Cancel"),
                  h("button", { staticClass: "mm-btn primary", attrs: { disabled: self.lockBusy || !!self.pending },
                    on: { click: function () { self.lockCell(target); } } }, self.lockBusy ? "Locking..." : "Confirm")
                ])
              : h("button", { staticClass: "mm-btn",
                  attrs: { disabled: !!self.pending || self.lockBusy || locked || c.pci === undefined },
                  on: { click: function () { self.nbConfirm = i; } } }, "Lock")
          ]);
        });
        body = h("div", rows);
      }
      var foot = h("div", { staticClass: "mm-foot" }, [
        h("span", { staticClass: "mm-hint" }, "Asks the modem which cells it measures besides the serving one (LTE and NSA anchors)."),
        h("button", { staticClass: "mm-btn", attrs: { disabled: nb.running || this.scan.running || !!this.pending },
          on: { click: function () { self.readNeighbours(); } } }, nb.read || nb.error ? "Read again" : "Read neighbours")
      ]);
      return h("div", { staticClass: "mm-grp" }, [head, body, foot].filter(Boolean));
    },
  },
};
