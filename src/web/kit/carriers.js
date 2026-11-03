// The carriers of one collector sample, read ONE way by every surface: the strip, Tracking, the
// Cell lock card, the speed-test results, the confirm banner and the long-term table.
//
// A sample (cellular_compat build_sample) carries signals[] — one row per carrier, PCC first:
// {role, rat, network_type, band, earfcn, pci, rsrp, rsrq, sinr, …} — plus flattened PCC aliases
// (band, pci, tx_channel, pcc_rat, rsrp…). Under 5G NSA (EN-DC) the PCC is the LTE ANCHOR and the
// NR leg is an SCC row whose rat is NR5G-NSA; GL's readings (the rsrp/sinr/rsrq aliases) are the
// anchor's. Older samples, speed-test snapshots and banner pictures may lack signals[]: the PCC
// aliases then stand for the one carrier.
//
// The Cell lock target (lockTarget) must name the same cell as the plugin's serving_from_sample
// (src/lib/rpc/lock.lua): test/fixtures/carriers.json pins both against one table.

export function isNr(rat) { return /NR5G/.test(rat || ""); }

// "n78" / "B66" from the carrier's own RAT; null when there is no band.
export function bandName(rat, band) {
  if (band === undefined || band === null || band === "") return null;
  return (isNr(rat) ? "n" : "B") + band;
}

// The PRIMARY carrier's own RAT: "LTE" for an NSA anchor while the cell's mode is NR5G-NSA.
export function pccRat(s) {
  if (!s) return "";
  var sig = Array.isArray(s.signals) && s.signals[0];
  return s.pcc_rat || (sig && sig.rat) || s.mode || "";
}

// 5G NSA (EN-DC): an LTE anchor plus an NR leg.
export function isEnDc(s) { return !!s && /NSA/.test(s.rat || s.mode || ""); }

// Every carrier as {role, rat, band, label, pci, arfcn, rsrp, rsrq, sinr}, PCC first. A row
// without a band is not a carrier.
export function carriers(s) {
  if (!s) return [];
  var rows = Array.isArray(s.signals) ? s.signals : [];
  var out = [];
  rows.forEach(function (g, i) {
    if (!g || g.band === undefined || g.band === null || g.band === "") return;
    var rat = g.rat || (i === 0 ? pccRat(s) : s.mode) || "";
    out.push({ role: g.role || (i === 0 ? "PCC" : "SCC"), rat: rat, band: Number(g.band), label: bandName(rat, g.band),
               pci: g.pci, arfcn: g.earfcn, rsrp: g.rsrp, rsrq: g.rsrq, sinr: g.sinr });
  });
  if (!out.length && s.band !== undefined && s.band !== null && s.band !== "") {
    var r = pccRat(s);
    out.push({ role: "PCC", rat: r, band: Number(s.band), label: bandName(r, s.band),
               pci: s.pci, arfcn: s.tx_channel, rsrp: s.rsrp, rsrq: s.rsrq, sinr: s.sinr });
  }
  return out;
}

// The bands in use, primary first, each once: "B66 + n41", "n71", "—" when there is none.
export function bandsText(s) {
  var seen = [];
  carriers(s).forEach(function (c) { if (seen.indexOf(c.label) === -1) seen.push(c.label); });
  return seen.length ? seen.join(" + ") : "—";
}

// The NSA NR leg: the first NR row that names its cell (pci + channel), else null.
export function nrLeg(s) {
  if (!isEnDc(s)) return null;
  var rows = Array.isArray(s.signals) ? s.signals : [];
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i];
    if (g && isNr(g.rat) && g.pci !== undefined && g.pci !== null && g.earfcn !== undefined && g.earfcn !== null)
      return g;
  }
  return null;
}

// The cell "Lock to this cell" would lock — {rat, pci, arfcn, band}, else null. Under NSA it is
// the NR leg (a 5G lock); otherwise the PCC. rat is the cell's (NR5G-NSA / NR5G-SA / LTE).
export function lockTarget(s) {
  if (!s) return null;
  var rat = s.rat || s.mode || "";
  var num = function (v) { return (v === undefined || v === null || v === "") ? null : Number(v); };
  if (isEnDc(s)) {
    var g = nrLeg(s);
    return g ? { rat: rat, pci: Number(g.pci), arfcn: Number(g.earfcn), band: num(g.band) } : null;
  }
  if (s.pci === undefined || s.pci === null || s.tx_channel === undefined || s.tx_channel === null) return null;
  return { rat: rat, pci: Number(s.pci), arfcn: Number(s.tx_channel), band: num(s.band) };
}
