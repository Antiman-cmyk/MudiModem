// Tracking: the long-term card — 7 or 30 days of mudimodemd's hourly per-cell record
// (src/lib/mudimodemd/summary.lua, served by mudimodem.get_summary). The 24 h sample history is
// too fine and too short to compare days or places; this answers "was it like this last week?"
// and "which cells did I spend my time on, and how were they?".
//
//   hourly(lines, slot)  one point per hour for one SIM: RSRP min / avg / max (time-weighted
//                        across the hour's cells), and the no-service seconds in it
//   cells(lines)         per cell over the range: time on it, average RSRP / SINR, ping loss,
//                        last seen; most time first
//   render(h, vm)        the card; vm carries lt {days, lines, loading, err, now} and width
import { t as T } from "../kit/i18n.js";
import { dur, mdhm } from "../kit/fmt.js";
import { bandName, bandsText } from "../kit/carriers.js";

var HOUR = 3600000;

function wavg(acc, v, w) {
  if (v == null || !isFinite(v) || !(w > 0)) return;
  acc.s += v * w; acc.w += w;
}
function avgOf(acc) { return acc.w > 0 ? Math.round(acc.s / acc.w * 10) / 10 : null; }

export function hourly(lines, slot) {
  var by = {};
  (lines || []).forEach(function (l) {
    if (!l || typeof l.t !== "number" || String(l.slot) !== String(slot)) return;
    var b = by[l.t] || (by[l.t] = { t: l.t, secs: 0, ns: 0, min: null, max: null, avg: { s: 0, w: 0 } });
    if (l.no_service) { b.ns += l.secs || 0; return; }
    b.secs += l.secs || 0;
    var r = Array.isArray(l.rsrp) ? l.rsrp : null;
    if (r) {
      if (b.min == null || r[0] < b.min) b.min = r[0];
      if (b.max == null || r[2] > b.max) b.max = r[2];
      wavg(b.avg, r[1], l.secs || 1);
    }
  });
  return Object.keys(by).map(function (k) {
    var b = by[k];
    return { t: b.t, secs: b.secs, ns: b.ns, min: b.min, max: b.max, avg: avgOf(b.avg) };
  }).sort(function (a, b) { return a.t - b.t; });
}

export function cells(lines) {
  var by = {};
  (lines || []).forEach(function (l) {
    if (!l || l.no_service || l.cell == null) return;
    var k = [l.slot, l.carrier, l.rat, l.band, l.cell].join("|");
    var c = by[k] || (by[k] = { slot: l.slot, carrier: l.carrier, rat: l.rat, band: l.band, cell: l.cell, signals: [],
      secs: 0, rsrp: { s: 0, w: 0 }, sinr: { s: 0, w: 0 }, ping_n: 0, ping_lost: 0, last: 0 });
    (Array.isArray(l.signals) ? l.signals : []).forEach(function (g) {
      if (g && g.band != null && !c.signals.some(function (x) { return x.rat === g.rat && x.band === g.band; }))
        c.signals.push({ rat: g.rat, band: g.band });
    });
    var w = l.secs || 0;
    c.secs += w;
    wavg(c.rsrp, Array.isArray(l.rsrp) ? l.rsrp[1] : null, w);
    wavg(c.sinr, Array.isArray(l.sinr) ? l.sinr[1] : null, w);
    c.ping_n += l.ping_n || 0; c.ping_lost += l.ping_lost || 0;
    if (l.t > c.last) c.last = l.t;
  });
  return Object.keys(by).map(function (k) {
    var c = by[k];
    return { slot: c.slot, carrier: c.carrier, rat: c.rat, band: c.band, cell: c.cell, signals: c.signals, secs: c.secs,
             rsrp: avgOf(c.rsrp), sinr: avgOf(c.sinr), last: c.last,
             loss: c.ping_n ? Math.round(c.ping_lost / c.ping_n * 1000) / 10 : null };
  }).sort(function (a, b) { return b.secs - a.secs; });
}

// The SIM to chart: the one with the newest radio line (the active one, usually).
export function chartSlot(lines) {
  var best = null;
  (lines || []).forEach(function (l) {
    if (l && !l.no_service && l.slot != null && (!best || l.t >= best.t)) best = l;
  });
  return best ? best.slot : null;
}

// Every band the cell's hours saw, primary first ("B66 + n41", kit/carriers.js); an older line
// has no signals: its PCC band alone.
function bandLabel(c) {
  if (Array.isArray(c.signals) && c.signals.length) return bandsText({ signals: c.signals });
  return bandName(c.rat, c.band) || "";
}

export function render(h, vm) {
  var lt = vm.lt, W = vm.width || 900;
  var seg = h("span", { staticClass: "mmt-seg" }, [[7, "7 d"], [30, "30 d"]].map(function (d) {
    return h("button", { key: d[0], staticClass: lt.days === d[0] ? "on" : "",
      on: { click: function () { vm.fetchLongTerm(d[0]); } } }, d[1]);
  }));
  var head = h("div", { staticClass: "mmt-head" }, [
    h("span", { staticClass: "mmt-title" }, "Long term"),
    h("span", { staticClass: "mmt-hint" }, "hourly, kept 30 days"),
    h("span", { staticStyle: { flex: "1" } }),
    seg
  ]);
  var body;
  if (lt.loading && !lt.lines.length) body = h("div", { staticClass: "mmt-empty" }, "Loading…");
  else if (lt.err) body = h("div", { staticClass: "mmt-empty" }, T("Couldn't load the long-term record: {err}", { err: lt.err }));
  else if (!lt.lines.length)
    body = h("div", { staticClass: "mmt-empty" },
      "No long-term record yet. The router writes one line per hour, so the first appears after the first full hour.");
  else body = [renderChart(h, vm, W), renderCells(h, vm)];
  return h("div", { staticClass: "mmt-card" }, [head].concat(body));
}

function renderChart(h, vm, W) {
  var lt = vm.lt, slot = chartSlot(lt.lines), pts = hourly(lt.lines, slot);
  var PADL = 42, PADR = 36, TOP = 16, PH = 120, NS_H = 10;
  var t1 = lt.now || Date.now(), t0 = t1 - lt.days * 24 * HOUR;
  var xOf = function (t) { return PADL + (t - t0) / (t1 - t0) * (W - PADL - PADR); };
  var lo = -125, hi = -65;
  pts.forEach(function (p) {
    if (p.min != null && p.min < lo + 5) lo = Math.floor(p.min / 5) * 5 - 5;
    if (p.max != null && p.max > hi - 5) hi = Math.ceil(p.max / 5) * 5 + 5;
  });
  var yOf = function (v) { return TOP + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * PH; };
  var bot = TOP + PH, nsTop = bot + 6, kids = [];
  var bw = Math.max(1, (W - PADL - PADR) / (lt.days * 24) - 0.5);
  kids.push(h("text", { attrs: { x: PADL, y: 10, "font-size": 9.5, fill: "var(--text-badge)" } },
    T("RSRP · hourly min / avg / max · SIM {slot}", { slot: slot == null ? "—" : slot })));
  [hi, lo].forEach(function (v) {
    kids.push(h("text", { attrs: { x: PADL - 4, y: yOf(v) + 3, "text-anchor": "end", "font-size": 9,
      fill: "var(--text-badge)", "font-family": "ui-monospace,monospace" } }, String(v)));
    kids.push(h("line", { attrs: { x1: PADL, x2: W - PADR, y1: yOf(v), y2: yOf(v), stroke: "var(--divider)", "stroke-width": 1 } }));
  });
  // midnights (box clock as the browser shows it) with the date
  var d = new Date(t0); d.setHours(24, 0, 0, 0);
  var every = lt.days > 10 ? 5 : 1, i = 0;
  for (var m = d.getTime(); m < t1; m += 24 * HOUR, i++) {
    var x = xOf(m);
    kids.push(h("line", { attrs: { x1: x.toFixed(1), x2: x.toFixed(1), y1: TOP, y2: nsTop + NS_H,
      stroke: "var(--divider)", "stroke-width": 1, "stroke-dasharray": "2 3" } }));
    if (i % every === 0) kids.push(h("text", { attrs: { x: x.toFixed(1), y: nsTop + NS_H + 12, "text-anchor": "middle",
      "font-size": 9, fill: "var(--text-badge)", "font-family": "ui-monospace,monospace" } }, mdhm(m).slice(0, 5)));
  }
  var range = "", avg = "", ns = "", pen = false, prev = null;
  pts.forEach(function (p) {
    var x = xOf(p.t + HOUR / 2);
    if (p.min != null && p.max != null)
      range += "M" + x.toFixed(1) + " " + yOf(p.max).toFixed(1) + "V" + yOf(p.min).toFixed(1) + " ";
    if (p.avg != null) {
      if (prev != null && p.t - prev > HOUR) pen = false;       // a missing hour breaks the line
      avg += (pen ? "L" : "M") + x.toFixed(1) + " " + yOf(p.avg).toFixed(1) + " ";
      pen = true; prev = p.t;
    } else pen = false;
    if (p.ns > 0) {
      var nh = Math.max(1.5, Math.min(1, p.ns / 3600) * NS_H);
      ns += "M" + x.toFixed(1) + " " + (nsTop + NS_H).toFixed(1) + "v" + (-nh).toFixed(1) + " ";
    }
  });
  if (range) kids.push(h("path", { attrs: { fill: "none", stroke: "var(--primary)", "stroke-opacity": 0.3,
    "stroke-width": bw.toFixed(1), d: range.trim() } }));
  if (avg) kids.push(h("path", { attrs: { fill: "none", stroke: "var(--primary)", "stroke-width": 1.5,
    "stroke-linejoin": "round", d: avg.trim() } }));
  kids.push(h("text", { attrs: { x: 6, y: nsTop + NS_H - 1, "font-size": 9, fill: "var(--text-badge)" } }, "NO SVC"));
  if (ns) kids.push(h("path", { attrs: { fill: "none", stroke: "var(--error)", "stroke-width": Math.max(1.5, bw).toFixed(1),
    d: ns.trim() } }));
  var H = nsTop + NS_H + 16;
  return h("svg", { attrs: { viewBox: "0 0 " + W + " " + H, width: W, height: H, preserveAspectRatio: "none" },
    staticStyle: { display: "block", width: "100%" } }, kids);
}

function renderCells(h, vm) {
  var list = cells(vm.lt.lines).slice(0, 12);
  if (!list.length) return null;
  var rows = list.map(function (c, i) {
    return h("tr", { key: i }, [
      h("td", [h("b", (c.carrier || "—") + " · " + bandLabel(c)), " " + c.cell + (c.slot != null ? " · SIM " + c.slot : "")]),
      h("td", { staticClass: "mmt-nw" }, dur(c.secs)),
      h("td", { staticClass: "mmt-nw" }, c.rsrp == null ? "—" : c.rsrp + " dBm"),
      h("td", { staticClass: "mmt-nw mmt-opt" }, c.sinr == null ? "—" : c.sinr + " dB"),
      h("td", { staticClass: "mmt-nw" }, c.loss == null ? "—" : c.loss + " %"),
      h("td", { staticClass: "mmt-opt tm" }, mdhm(c.last))
    ]);
  });
  // phones: SINR and Last seen drop out (CSS .mmt-opt), and the table scrolls inside its card
  return h("div", { staticClass: "mmt-cellswrap" }, [h("table", { staticClass: "mmt-log mmt-cells" }, [
    h("thead", [h("tr", [h("th", "Cell"), h("th", "Time"), h("th", "RSRP"), h("th", { staticClass: "mmt-opt" }, "SINR"),
      h("th", "Ping loss"), h("th", { staticClass: "mmt-opt" }, "Last seen")])]),
    h("tbody", rows)
  ])]);
}
