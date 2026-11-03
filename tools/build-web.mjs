#!/usr/bin/env node
// tools/build-web.mjs — build the page chunks: src/web/** (ES modules) -> dist/views/*.js.
//
//   node tools/build-web.mjs           write dist/views/
//   node tools/build-web.mjs --check   fail if dist/views/ differs from a fresh build (CI/tests)
//
// GL's SPA loads a page with axios + DIRECT eval inside a webpack module wrapper that has
// `module` in scope, so every output file must be ONE expression statement whose value is the
// Vue component: `module.exports = (function(){ ...; return component; })();`. esbuild bundles
// each entry (with whatever it imports from src/web/kit) as an IIFE; this script wraps it.
// Vue 2.6 runtime-only: components use render(h), never `template:`.
//
// dist/ is committed: install.sh fetches files from a raw GitHub URL (any fork/branch), so the
// built chunks must exist in the tree. The router never builds anything.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist/views");
// entry (under src/web) -> the file name GL's SPA (or our main chunk) requests, minus .gz
export const ENTRIES = {
  "main/index.js":    "gl-sdk4-ui-mudimodem.common.js",
  "tabs/tracking.js": "gl-sdk4-ui-mudimodem-tracking.common.js",
  "tabs/console.js":  "gl-sdk4-ui-mudimodem-console.common.js",
  "tabs/speedtest.js": "gl-sdk4-ui-mudimodem-speedtest.common.js",
  "tabs/battery.js":  "gl-sdk4-ui-mudimodem-battery.common.js",
};

async function bundle(entry) {
  const r = await build({
    entryPoints: [path.join(ROOT, "src/web", entry)],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "__mm",
    platform: "browser",
    target: "es2017",          // every browser since 2017; GL's SPA itself needs no less
    charset: "utf8",
    legalComments: "none",
    logLevel: "silent",
  });
  if (r.warnings.length) throw new Error(entry + ": " + r.warnings.map((w) => w.text).join("; "));
  const body = r.outputFiles[0].text.trimEnd();
  return `/* MudiModem — built from src/web/${entry} by tools/build-web.mjs. Do not edit: run npm run build:web. */\n` +
         `module.exports = (function () {\n${body}\nreturn __mm.default;\n})();\n`;
}

export async function buildAll() {
  const out = {};
  for (const [entry, name] of Object.entries(ENTRIES)) out[name] = await bundle(entry);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = await buildAll();
  if (process.argv.includes("--check")) {
    const stale = Object.entries(files).filter(([n, txt]) => {
      const f = path.join(OUT, n);
      return !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== txt;
    }).map(([n]) => n);
    const extra = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((n) => !(n in files)) : [];
    if (stale.length || extra.length) {
      console.error("dist/views is stale - run: npm run build:web\n  " + stale.concat(extra.map((n) => n + " (not built by any entry)")).join("\n  "));
      process.exit(1);
    }
    console.log("dist/views is up to date (" + Object.keys(files).length + " chunks)");
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [n, txt] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), txt);
    console.log(Object.entries(files).map(([n, t]) => `dist/views/${n} ${t.length} bytes`).join("\n"));
  }
}
