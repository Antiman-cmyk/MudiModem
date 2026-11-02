// Translation for the Modem page. The English text IS the key (gettext style): a string with no
// entry in the active table stays English, so nothing can break by being untranslated.
//
// Language: GL's own vue-i18n instance, window.$i18n.locale ("en", "zh-cn", "zh-tw", ...). Its
// locale is reactive, so reading it inside render makes the page re-render when the user switches
// GL's language. Outside GL (tests, preview) it falls back to MM_LOCALE / navigator.language.
//
//   localize(component)   wraps render(h): every string child of h() and the title / placeholder
//                          / aria-label attributes are looked up as exact English text. Static
//                          copy therefore needs NO code change - only an entry in the table.
//   t("Reverting in {s}s", { s: 42 })        a sentence with values (template, then substitute)
//   tp("Applied {what}. Keep it?", { what: h("b", x) })   the same, with VNode parts -> array
//
// Technical tokens (RSRP, SINR, PCI, n71, B66, AT commands, carrier names) are never translated.
import zhCN from "../locales/zh-cn.js";

var TABLES = { "zh-cn": zhCN, "zh-tw": zhCN };   // no Traditional table yet: Simplified beats English

export function locale() {
  var l = "";
  if (typeof window !== "undefined") {
    if (window.$i18n && window.$i18n.locale) l = window.$i18n.locale;
    else if (window.MM_LOCALE) l = window.MM_LOCALE;
    else if (typeof navigator !== "undefined" && navigator.language) l = navigator.language;
  }
  l = String(l || "en").toLowerCase();
  if (l === "zh" || l.indexOf("zh-hans") === 0 || l.indexOf("zh-cn") === 0 || l.indexOf("zh-sg") === 0) return "zh-cn";
  if (l.indexOf("zh") === 0) return "zh-tw";
  return l;
}

function table() { return TABLES[locale()] || null; }

// Exact-text lookup; the surrounding whitespace is kept (render code pads with spaces).
export function tr(s) {
  var tb = table();
  if (!tb || typeof s !== "string") return s;
  var core = s.trim();
  if (!core || !Object.prototype.hasOwnProperty.call(tb, core)) return s;
  var lead = s.slice(0, s.indexOf(core)), trail = s.slice(s.indexOf(core) + core.length);
  return lead + tb[core] + trail;
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, function (m, k) {
    return vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
}

export function t(en, vars) { return fill(tr(en), vars); }

// Like t(), but values may be VNodes: returns an array of strings and VNodes for h() children.
export function tp(en, parts) {
  var tpl = tr(en), out = [], re = /\{(\w+)\}/g, last = 0, m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) out.push(tpl.slice(last, m.index));
    out.push(parts && Object.prototype.hasOwnProperty.call(parts, m[1]) ? parts[m[1]] : m[0]);
    last = m.index + m[0].length;
  }
  if (last < tpl.length) out.push(tpl.slice(last));
  return out;
}

var ATTRS = ["title", "placeholder", "aria-label"];
function trData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !data.attrs) return data;
  var a = null;
  ATTRS.forEach(function (k) {
    if (typeof data.attrs[k] === "string") {
      var v = tr(data.attrs[k]);
      if (v !== data.attrs[k]) { a = a || Object.assign({}, data.attrs); a[k] = v; }
    }
  });
  return a ? Object.assign({}, data, { attrs: a }) : data;
}
function trKids(k) {
  if (typeof k === "string") return tr(k);
  if (Array.isArray(k)) return k.map(function (x) { return typeof x === "string" ? tr(x) : x; });
  return k;
}

// h(tag, data?, children?) with translated text. Also used by the preview's i18n audit.
// `seen` (the preview's audit) receives the text AS RENDERED, i.e. after translation.
export function wrapH(h, seen) {
  return function (tag, data, children) {
    if (typeof data === "string" || Array.isArray(data)) {
      var k1 = trKids(data);
      if (seen) record(seen, null, k1);
      return h(tag, k1);
    }
    var d = trData(data), k = trKids(children);
    if (seen) record(seen, d, k);
    return h(tag, d, k);
  };
}
function record(seen, data, children) {
  [].concat(children == null ? [] : children).forEach(function (x) { if (typeof x === "string") seen(x); });
  if (data && data.attrs) ATTRS.forEach(function (a) { if (typeof data.attrs[a] === "string") seen(data.attrs[a]); });
}

export function localize(component) {
  var render = component.render;
  component.render = function (h) {
    var seen = typeof window !== "undefined" && window.__mmI18nSeen;
    return render.call(this, wrapH(h, seen));
  };
  return component;
}
