// Every CSS custom property a page chunk uses must exist in GL 4.10's theme (or be declared by the
// chunk itself, or carry a literal fallback). An undefined variable fails silently in the browser:
// the console's read/set/nv risk badges once rendered as plain text because of exactly this.
//
// The token list is reference/4.10/theme-vars.txt, generated from the firmware image; when the
// extracted rootfs is present (tools/mudi-emu: `mudi-emu fetch && mudi-emu extract`), the list is
// also checked against it.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const LIST = path.join(ROOT, "reference/4.10/theme-vars.txt");
const known = new Set(fs.readFileSync(LIST, "utf8").split("\n").filter((l) => l && !l.startsWith("#")));
// Every page source under src/web (the chunks are built from them).
function walkJs(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkJs(path.join(d, e.name)) : (e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
}
const chunks = walkJs(path.join(ROOT, "src/web")).map((f) => path.relative(path.join(ROOT, "src/web"), f));

// The extracted image, wherever mudi-emu keeps it ("" when there is none).
function rootfs() {
  const cli = process.env.MUDI_EMU || path.join(ROOT, "tools/mudi-emu/bin/mudi-emu");
  try {
    return execFileSync(cli, ["path", "rootfs"], { env: { MUDI_EMU_IMAGE: "e5800-4.10.0", ...process.env } }).toString().trim();
  } catch (e) {
    return "";
  }
}

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

test("theme-vars.txt matches the firmware image (when extracted)", (t) => {
  const theme = path.join(rootfs(), "www/theme");
  if (!fs.existsSync(path.join(theme, "base.css"))) return t.skip("no extracted image (tools/mudi-emu: mudi-emu extract)");
  let css = fs.readFileSync(path.join(theme, "base.css"), "utf8");
  for (const v of ["default", "classic", "dark"]) css += zlib.gunzipSync(fs.readFileSync(path.join(theme, v, "index.css.gz"))).toString();
  const fromImage = new Set([...css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
  assert.deepStrictEqual([...known].sort(), [...fromImage].sort(), "regenerate reference/4.10/theme-vars.txt from the image");
});

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
