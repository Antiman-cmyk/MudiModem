// The translation layer (src/web/kit/i18n.js) and the zh-cn table.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");

test("zh-cn covers every UI string in src/web (tools/i18n-keys.mjs --check)", () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, "tools/i18n-keys.mjs"), "--check", "zh-cn"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const r = JSON.parse(out);
  assert.deepStrictEqual(r.missing, [], "untranslated keys");
});

test("every zh-cn entry keeps exactly the placeholders of its English key", async () => {
  const zh = (await load("src/web/locales/zh-cn.js")).default;
  const bad = Object.keys(zh).filter((k) => typeof zh[k] !== "string" || !zh[k].trim() || placeholders(k) !== placeholders(zh[k]));
  assert.deepStrictEqual(bad, []);
});

test("t / tp / tr / localize", async () => {
  const i18n = await load("src/web/kit/i18n.js");
  const saved = global.window;
  try {
    global.window = { $i18n: { locale: "en" } };
    assert.strictEqual(i18n.t("Scan failed: {err}", { err: "x" }), "Scan failed: x", "English fills the template");
    assert.strictEqual(i18n.tr("  Apply "), "  Apply ", "English passes through");
    window.$i18n.locale = "zh-cn";
    assert.strictEqual(i18n.locale(), "zh-cn");
    assert.strictEqual(i18n.t("Scan failed: {err}", { err: "x" }), "扫描失败：x");
    assert.strictEqual(i18n.tr("  Apply "), "  应用 ", "padding around a static string survives");
    assert.strictEqual(i18n.t("no such key {a}", { a: 1 }), "no such key 1", "untranslated stays English");
    const parts = i18n.tp("Applied {what}. Reverting in {s} unless you keep it.", { what: { b: 1 }, s: { b: 2 } });
    assert.ok(parts.some((p) => p && p.b === 1) && parts.some((p) => p && p.b === 2), "VNode parts kept");
    assert.ok(parts.some((p) => typeof p === "string" && p.includes("已应用")), "text around them translated");
    for (const [l, want] of [["zh", "zh-cn"], ["zh-Hans-CN", "zh-cn"], ["zh-TW", "zh-tw"], ["de", "de"]]) {
      window.$i18n.locale = l;
      assert.strictEqual(i18n.locale(), want, l);
    }
    window.$i18n.locale = "zh-cn";
    const h = (tag, data, kids) => ({ tag, data, kids });
    const comp = i18n.localize({ render(hh) { return [hh("b", "Apply"), hh("i", { attrs: { title: "Copy", placeholder: "Search library" } }, ["Send", 42]), hh("u", ["Keep"])]; } });
    const [a, b, c] = comp.render(h);
    assert.strictEqual(a.data, "应用", "string child (h(tag, text))");
    assert.deepStrictEqual(b.data.attrs, { title: "复制", placeholder: "搜索命令库" }, "attributes");
    assert.deepStrictEqual(b.kids, ["发送", 42], "array children, non-strings untouched");
    assert.deepStrictEqual(c.data, ["保留"], "h(tag, [children])");
  } finally { global.window = saved; }
});
