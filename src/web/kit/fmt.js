// Small formatting helpers shared by every tab (browser-local clock, as the charts' axes use).
function p2(n) { return (n < 10 ? "0" : "") + n; }

// 14:05
export function hhmm(t) { var d = new Date(t); return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
// 14:05:09
export function hhmmss(t) { var d = new Date(t); return hhmm(t) + ":" + p2(d.getSeconds()); }
// 11/02 14:05
export function mdhm(t) { var d = new Date(t); return p2(d.getMonth() + 1) + "/" + p2(d.getDate()) + " " + hhmm(t); }
