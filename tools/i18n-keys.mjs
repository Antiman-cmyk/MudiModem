#!/usr/bin/env node
// tools/i18n-keys.mjs — list the English UI strings of src/web that a translation table may
// cover, and (with --check) report which ones a locale table is missing.
//
//   node tools/i18n-keys.mjs                 print every key (t/T/tp/TP template + static UI text)
//   node tools/i18n-keys.mjs --check zh-cn   missing / unused entries of src/web/locales/zh-cn.js
//
// Keys come from two places: the first argument of t()/T()/tp()/TP() calls (string literals,
// literal concatenations and both arms of a ternary), and literal text passed straight to h() /
// title / placeholder (translated at render by kit/i18n.js localize()). Heuristic on purpose:
// it errs towards listing; the preview's --i18n-audit is the runtime check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = ["main", "tabs"].flatMap((d) => fs.readdirSync(path.join(ROOT, "src/web", d))
  .filter((f) => f.endsWith(".js") && f !== "styles.js").map((f) => path.join(ROOT, "src/web", d, f)));

const STR = String.raw`"(?:[^"\\]|\\.)*"`;
const unq = (s) => JSON.parse(s);

function templateKeys(src) {
  const out = new Set();
  const re = /\b(?:t|T|tp|TP)\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    // read the first argument up to a top-level comma/close paren
    let i = m.index + m[0].length, depth = 0, arg = "";
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"') { const mm = new RegExp("^" + STR).exec(src.slice(i)); arg += mm[0]; i += mm[0].length - 1; continue; }
      if ("([{".includes(c)) depth++;
      if (")]}".includes(c)) { if (depth === 0) break; depth--; }
      if (c === "," && depth === 0) break;
      arg += c;
    }
    // Every maximal chain of string literals joined by + is one key: covers "a" + "b"
    // concatenations and both arms of cond ? "x" : "y" (a condition's own literal, e.g.
    // kind === "cell", is filtered as an identifier).
    for (const chain of arg.matchAll(new RegExp(STR + "(?:\\s*\\+\\s*" + STR + ")*", "g"))) {
      const key = chain[0].match(new RegExp(STR, "g")).map(unq).join("");
      if (!IGNORE.test(key.trim()) && !/^[a-z_]+$/.test(key) && /[A-Za-z]{2,}/.test(key)) out.add(key);
    }
  }
  return out;
}

// Not UI text: identifiers, CSS, key names, units and other technical tokens that stay as-is.
const IGNORE = /px\b|^(mm|mmb|mmc|mms|mmt)-| mm-|^cat-$|^use strict$|^[a-z]+[A-Z]\w*$|^\w+\.\w+$|^(Arrow\w+|Enter|NR5G|POWERED DOWN|dB|dBm|mA|MHz\)?|Mbps|KiB|MiB|% IC|\(IC|ms \(±|· SIM|CA ×|MudiModem v|MudiModem|Ch|current cell PCI|scanned cell PCI|no terminator after|modem|5G-N?SA|cell|bands|ssh root@<router> \/usr\/sbin\/mudimodem-revert panic)$/;

function staticKeys(src) {
  const out = new Set();
  // Pieces of a "literal" + "literal" chain belong to the joined key (templateKeys), not alone.
  const chained = new Set();
  for (const m of src.matchAll(new RegExp("(" + STR + ")(?=\\s*\\+\\s*\")|(?<=\"\\s*\\+\\s*)(" + STR + ")", "g")))
    chained.add((m[1] || m[2]));
  for (const line of src.split("\n")) {
    const st = line.trim();
    if (st.startsWith("//") || st.startsWith("*")) continue;
    for (const m of line.matchAll(new RegExp(STR, "g"))) {
      if (chained.has(m[0])) continue;
      let x; try { x = unq(m[0]); } catch (e) { continue; }
      const core = x.trim();
      if (!/[A-Za-z]{2,}/.test(core)) continue;
      if (/var\(--|^\.|[{};]|^#|^[a-z]+(-[a-z0-9]+)+$|^mm[a-z-]*$|^[a-z_]+$|^[A-Z_]+$|^https?:|^\/|\.js\b|\.json\b|\bpx\b|^[a-z]+\.[a-z]|\{\w+\}/.test(core)) continue;
      if (/^(AT\+|AT$|\+[A-Z])/.test(core) || IGNORE.test(core)) continue;
      out.add(core);
    }
  }
  return out;
}

const keys = new Set();
for (const f of SRC) {
  const src = fs.readFileSync(f, "utf8");
  templateKeys(src).forEach((k) => keys.add(k));
  staticKeys(src).forEach((k) => keys.add(k));
}
const i = process.argv.indexOf("--check");
if (i < 0) { [...keys].sort().forEach((k) => console.log(k)); process.exit(0); }
const loc = process.argv[i + 1] || "zh-cn";
const tablePath = path.join(ROOT, "src/web/locales", loc + ".js");
const table = (await import(tablePath)).default;
const missing = [...keys].filter((k) => !(k in table)).sort();
const unused = Object.keys(table).filter((k) => !keys.has(k)).sort();
console.log(JSON.stringify({ locale: loc, keys: keys.size, entries: Object.keys(table).length, missing, unused }, null, 1));
