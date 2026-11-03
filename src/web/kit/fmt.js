// Small formatting helpers shared by every tab (browser-local clock, as the charts' axes use).
import { t } from "./i18n.js";
function p2(n) { return (n < 10 ? "0" : "") + n; }

// 14:05
export function hhmm(t) { var d = new Date(t); return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
// 14:05:09
export function hhmmss(t) { var d = new Date(t); return hhmm(t) + ":" + p2(d.getSeconds()); }
// 11/02 14:05
export function mdhm(t) { var d = new Date(t); return p2(d.getMonth() + 1) + "/" + p2(d.getDate()) + " " + hhmm(t); }

// 45 s · 3 min 20 s · 2 h 5 min, in the page's language
export function dur(secs) {
  secs = Math.max(0, Math.round(Number(secs) || 0));
  if (secs < 60) return t("{n} s", { n: secs });
  var m = Math.floor(secs / 60), s = secs % 60;
  if (m < 60) return s ? t("{n} min", { n: m }) + " " + t("{n} s", { n: s }) : t("{n} min", { n: m });
  var h = Math.floor(m / 60); m %= 60;
  return m ? t("{n} h", { n: h }) + " " + t("{n} min", { n: m }) : t("{n} h", { n: h });
}
