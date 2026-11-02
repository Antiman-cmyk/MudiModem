// Every CSS custom property a page chunk uses must exist in GL 4.10's theme (or be declared by the
// chunk itself, or carry a literal fallback). An undefined variable fails silently in the browser:
// the console's read/set/nv risk badges once rendered as plain text because of exactly this.
//
// The token list is mudi-emu's reference/e5800-4.10.0/theme-vars.txt (tools/mudi-emu, a submodule),
// generated from the firmware image; mudi-emu's own test checks it against the image.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
// mudi-emu's copy for the image MudiModem targets ($MUDI_EMU: another checkout's CLI).
function referenceDir() {
  const cli = process.env.MUDI_EMU || path.join(ROOT, "tools/mudi-emu/bin/mudi-emu");
  try {
    return execFileSync(cli, ["path", "reference"], { env: { ...process.env, MUDI_EMU_IMAGE: "e5800-4.10.0" } }).toString().trim();
  } catch (e) {
    throw new Error("no mudi-emu at " + cli + " (git submodule update --init): it holds GL's theme variable list");
  }
}
const LIST = path.join(referenceDir(), "theme-vars.txt");
const known = new Set(fs.readFileSync(LIST, "utf8").split("\n").filter((l) => l && !l.startsWith("#")));
// Every page source under src/web (the chunks are built from them).
function walkJs(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkJs(path.join(d, e.name)) : (e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
}
const chunks = walkJs(path.join(ROOT, "src/web")).map((f) => path.relative(path.join(ROOT, "src/web"), f));

// Drop JS comments (a comment may mention var(--token) as prose).
function code(src) {
  return src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
}

// var(--name) / var(--name, fallback) with the fallback's raw text (one nesting level).
function uses(src) {
  const out = [];
  const re = /var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], fallback: m[2] && m[2].trim() });
  return out;
}

for (const f of chunks) {
  test(`${f}: every var(--x) is defined by GL's theme, the chunk, or a literal fallback`, () => {
    const src = code(fs.readFileSync(path.join(ROOT, "src/web", f), "utf8"));
    const own = new Set([...src.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const ok = (name) => known.has(name) || own.has(name);
    const bad = [];
    for (const u of uses(src)) {
      if (ok(u.name)) continue;
      if (u.fallback) {
        const inner = uses(u.fallback);
        if (inner.length === 0 || inner.some((i) => ok(i.name))) continue;   // literal or defined fallback
      }
      bad.push(u.name);
    }
    assert.deepStrictEqual([...new Set(bad)], [], `undefined CSS variables in ${f}`);
  });
}
