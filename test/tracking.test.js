const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = path.join(__dirname, '..', 'src', 'views', 'mudimodem-tracking.js');

function loadChunk() {
  const module = { exports: {} };
  return eval(fs.readFileSync(SRC, 'utf8'));
}
function h(tag, data, children) {
  if (Array.isArray(data) || typeof data === 'string') { children = data; data = {}; }
  return { tag, data: data || {}, children };
}
function textOf(n) {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(textOf).join('');
  return textOf(n.children);
}
function walk(n, out) {
  out = out || [];
  if (n == null || typeof n === 'string') return out;
  if (Array.isArray(n)) { n.forEach((x) => walk(x, out)); return out; }
  out.push(n); walk(n.children, out); return out;
}
function makeVm(c, over) {
  const vm = Object.assign({}, c.data());
  vm.$store = { getters: { moduleStatus() { return {}; } } };
  for (const [k, f] of Object.entries(c.methods || {})) vm[k] = f.bind(vm);
  for (const [k, f] of Object.entries(c.computed || {}))
    Object.defineProperty(vm, k, { get: f.bind(vm), configurable: true });
  Object.assign(vm, over || {});
  return vm;
}
// A 21-sample history over the last 20 min, handover at t-10 (id A1->B2, band 71->41).
function seedSamples() {
  const now = Date.now(), out = [];
  for (let i = 20; i >= 0; i--) {
    out.push({ t: now - i * 60000, slot: '1', id: i > 10 ? 'A1' : 'B2', band: i > 10 ? 71 : 41,
      mode: 'NR5G-SA FDD', rsrp: -100 - i, sinr: 5, rsrq: -13,
      rsrp_level: 3, sinr_level: 2, rsrq_level: 3, carrier: 'T-Mobile',
      tx_channel: '127490', dl_bandwidth: '15MHz' });
  }
  return out;
}
function s(over) {
  return Object.assign({ t: 1000, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
    rsrp: -101, sinr: 4, rsrq: -14, carrier: 'T-Mobile' }, over || {});
}

// ---- deriveNetEvents (pure) ----

test('deriveNetEvents flags a handover on an id change', () => {
  const vm = makeVm(loadChunk());
  const ev = vm.deriveNetEvents([s({ t: 1000 }), s({ t: 2000, id: 'B2' })], []);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].label, 'Handover');
  assert.strictEqual(ev[0].kind, 'net');
});

test('deriveNetEvents flags a failover on a slot change', () => {
  const vm = makeVm(loadChunk());
  const ev = vm.deriveNetEvents([s({ t: 1000 }), s({ t: 2000, slot: '2', id: 'C3', carrier: 'AT&T' })], []);
  assert.strictEqual(ev[0].label, 'Failover');
});

test('deriveNetEvents suppresses a change near a user event', () => {
  const vm = makeVm(loadChunk());
  const known = [{ t: 2000, kind: 'user', label: 'Bands applied', detail: '' }];
  const ev = vm.deriveNetEvents([s({ t: 1000 }), s({ t: 2500, id: 'B2', band: 41 })], known);
  assert.strictEqual(ev.length, 0, 'change within 8s of a user event is not a net tick');
});

test('deriveNetEvents ignores steady state', () => {
  const vm = makeVm(loadChunk());
  const ev = vm.deriveNetEvents([s({ t: 1000 }), s({ t: 2000, rsrp: -99 })], []);
  assert.strictEqual(ev.length, 0);
});

// ---- component render ----

test('loading state before any data', () => {
  const c = loadChunk();
  const vm = makeVm(c, { loading: true, samples: [] });
  assert.match(textOf(c.render.call(vm, h)), /Loading history/);
});

test('empty (loaded, no samples) explains the collector', () => {
  const c = loadChunk();
  const vm = makeVm(c, { loading: false, samples: [] });
  assert.match(textOf(c.render.call(vm, h)), /collector runs on the router/);
});

test('default range is the 15 m view (state + active segment)', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  assert.strictEqual(vm.winW, 15, 'data() default winW is 15');
  const on = walk(c.render.call(makeVm(c, { samples: seedSamples(), events: [] }), h))
    .filter((n) => n.tag === 'button' && n.data.staticClass === 'on');
  assert.strictEqual(on.length, 1, 'exactly one active range segment');
  assert.strictEqual(textOf(on[0]), '15 m', 'the 15 m segment is the active one');
});

test('renders one overlaid plot (RSRP/SINR/RSRQ) + three buses + a derived handover tick', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  const txt = textOf(c.render.call(vm, h));
  // legend carries each metric name; buses carry BAND/CELL/SIM.
  ['RSRP · dBm', 'SINR · dB', 'RSRQ · dB', 'BAND', 'CELL', 'SIM'].forEach((L) =>
    assert.match(txt, new RegExp(L.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${L} present`));
  assert.match(txt, /n71/, 'band bus shows the pre-handover band');
  assert.match(txt, /n41/, 'band bus shows the post-handover band');
  const dashed = walk(c.render.call(vm, h)).filter(
    (n) => n.data.attrs && n.data.attrs['stroke-dasharray'] === '3 3');
  assert.ok(dashed.length >= 1, 'derived handover tick rendered');
});

test('legend shows each metric name with its domain range', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /RSRP · dBm {2}-120…-80/, 'RSRP range in legend');
  assert.match(txt, /SINR · dB {2}-10…30/, 'SINR range in legend');
  assert.match(txt, /RSRQ · dB {2}-20…-3/, 'RSRQ range in legend');
});

test('domainFor keeps the fixed base when samples sit inside it', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  const L = { key: 'rsrp', dom: [-120, -80] };
  assert.deepStrictEqual(vm.domainFor(L, [
    s({ rsrp: -100 }), s({ rsrp: -95 }), s({ rsrp: -90 })
  ]), [-120, -80], 'in-range data does not auto-zoom');
});

test('domainFor expands past the base when RSRP is stronger than −80', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  const L = { key: 'rsrp', dom: [-120, -80] };
  // A strong outdoor/indoor reading — previously clamped flat to the plot top.
  assert.deepStrictEqual(vm.domainFor(L, [
    s({ rsrp: -72 }), s({ rsrp: -68 }), s({ rsrp: -65 })
  ]), [-120, -65], 'ceiling rises to the strongest sample');
});

test('domainFor expands the floor for a very weak RSRP', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  const L = { key: 'rsrp', dom: [-120, -80] };
  assert.deepStrictEqual(vm.domainFor(L, [s({ rsrp: -128 })]), [-128, -80]);
});

test('strong RSRP is not pinned to the top of the plot', () => {
  const c = loadChunk();
  const now = Date.now();
  // Two strong points with a real 7 dB swing — under the old clamp both sat at y=plotTop.
  const samples = [
    { t: now - 60000, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -72, sinr: 18, rsrq: -8, rsrp_level: 4, sinr_level: 4, rsrq_level: 4,
      carrier: 'T-Mobile', tx_channel: '127490', dl_bandwidth: '15MHz' },
    { t: now, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -65, sinr: 22, rsrq: -7, rsrp_level: 4, sinr_level: 4, rsrq_level: 4,
      carrier: 'T-Mobile', tx_channel: '127490', dl_bandwidth: '15MHz' }
  ];
  const vm = makeVm(c, { samples, events: [], winW: 15, serverNow: now, serverNowAt: Date.now() });
  const paths = walk(c.render.call(vm, h)).filter((n) => n.tag === 'path');
  // First path is RSRP (LINES order).
  const rsrpPath = paths[0].data.attrs.d;
  const ys = rsrpPath.match(/[\d.]+/g).filter((_, i) => i % 2 === 1).map(Number);
  assert.strictEqual(ys.length, 2, 'two RSRP points drawn');
  assert.ok(ys[0] > ys[1], 'stronger (−65) is higher on the plot than −72');
  assert.ok(ys[0] - ys[1] > 5, 'the 7 dB swing is visible, not collapsed by clamping');
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /RSRP · dBm {2}-120…-65/, 'legend shows the expanded ceiling');
});

test('yTicks walks the domain top→bottom inclusive', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  assert.deepStrictEqual(vm.yTicks(-120, -80), [-80, -90, -100, -110, -120]);
  assert.deepStrictEqual(vm.yTicks(-120, -65), [-65, -78.75, -92.5, -106.25, -120]);
});

test('fmtTick rounds near-integers and keeps one decimal otherwise', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  assert.strictEqual(vm.fmtTick(-80), '-80');
  assert.strictEqual(vm.fmtTick(-92.5), '-92.5');
  assert.strictEqual(vm.fmtTick(-89.999), '-90');
});

test('plot draws RSRP left + SINR right y-axes with units and one interior grid', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  const tree = c.render.call(vm, h);
  // Left = RSRP (primary, end-anchored); right = SINR (success, start-anchored).
  // Assert against individual text nodes — full-page concat fuses "10"+"0" into "100".
  const rsrpLabels = walk(tree).filter((n) =>
    n.tag === 'text' && n.data.attrs && n.data.attrs['text-anchor'] === 'end'
    && n.data.attrs.fill === 'var(--primary)');
  const sinrLabels = walk(tree).filter((n) =>
    n.tag === 'text' && n.data.attrs && n.data.attrs['text-anchor'] === 'start'
    && n.data.attrs.fill === 'var(--success)');
  // First text node on each axis is the metric name above the frame; then ticks.
  assert.deepStrictEqual(rsrpLabels.map((n) => textOf(n)),
    ['RSRP', '-80', '-90', '-100', '-110', '-120'], 'RSRP name + ticks');
  assert.deepStrictEqual(sinrLabels.map((n) => textOf(n)),
    ['SINR', '30', '20', '10', '0', '-10'], 'SINR name + ticks');
  // Names sit above the plot frame (y < plotTop=22).
  assert.ok(rsrpLabels[0].data.attrs.y < 22, 'RSRP label above the axis');
  assert.ok(sinrLabels[0].data.attrs.y < 22, 'SINR label above the axis');
  const txt = textOf(tree);
  assert.match(txt, /dBm/, 'RSRP unit marked');
  assert.match(txt, /dB/, 'SINR unit marked');
  // Interior gridlines come from the LEFT axis only (not doubled by SINR).
  const grids = walk(tree).filter((n) =>
    n.tag === 'line' && n.data.attrs && n.data.attrs['stroke-dasharray'] === '2 3'
    && n.data.attrs.x1 === 42 /* PADL */);
  assert.strictEqual(grids.length, 3, 'three interior y-gridlines from RSRP only');
});

test('y-axis ceiling tracks an expanded strong-signal domain', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = [
    { t: now - 60000, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -68, sinr: 20, rsrq: -8, carrier: 'T-Mobile' },
    { t: now, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -65, sinr: 22, rsrq: -7, carrier: 'T-Mobile' }
  ];
  const vm = makeVm(c, { samples, events: [], winW: 15, serverNow: now, serverNowAt: Date.now() });
  const labels = walk(c.render.call(vm, h)).filter((n) =>
    n.tag === 'text' && n.data.attrs && n.data.attrs.fill === 'var(--primary)');
  const nums = labels.map((n) => textOf(n));
  assert.ok(nums.includes('-65'), 'expanded ceiling on the axis');
  assert.ok(nums.includes('-120'), 'field-test floor still labelled');
  assert.ok(!nums.includes('-80'), 'old fixed ceiling is gone once domain expands');
});

test('SINR right axis expands when samples exceed the base domain', () => {
  const c = loadChunk();
  const now = Date.now();
  // SINR 35 is above the base ceiling of 30 — axis should expand, not clamp.
  const samples = [
    { t: now - 60000, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -95, sinr: 28, rsrq: -12, carrier: 'T-Mobile' },
    { t: now, slot: '1', id: 'A1', band: 71, mode: 'NR5G-SA FDD',
      rsrp: -94, sinr: 35, rsrq: -11, carrier: 'T-Mobile' }
  ];
  const vm = makeVm(c, { samples, events: [], winW: 15, serverNow: now, serverNowAt: Date.now() });
  const sinrLabels = walk(c.render.call(vm, h)).filter((n) =>
    n.tag === 'text' && n.data.attrs && n.data.attrs.fill === 'var(--success)');
  const nums = sinrLabels.map((n) => textOf(n));
  assert.ok(nums.includes('35'), 'expanded SINR ceiling on the right axis');
  assert.ok(nums.includes('-10'), 'SINR floor still labelled');
});

test('three overlaid metric lines, one fixed distinct GL colour each', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  const paths = walk(c.render.call(vm, h)).filter((n) => n.tag === 'path');
  // Exactly one path per metric — overlaid, NOT lane-stacked and NOT
  // quality-segmented (segmenting would yield many same-coloured paths).
  assert.strictEqual(paths.length, 3, 'one path per metric');
  const strokes = paths.map((p) => p.data.attrs.stroke);
  assert.ok(strokes.every((s) => /^var\(--/.test(s)), 'stroke is a GL token');
  assert.strictEqual(new Set(strokes).size, 3, 'three distinct fixed colours');
});

test('nearestSample returns the closest sample to a minute offset', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  const near = vm.nearestSample(-5);
  assert.ok(near && Math.abs(near.m + 5) < 1.5, 'picks a sample near t-5min');
});

test('event log merges server + derived events, newest first', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seedSamples(),
    events: [{ t: now, kind: 'user', label: 'Bands applied', detail: 'SA n41' }],
    winW: 60
  });
  const txt = textOf(vm.renderLog(h));
  assert.match(txt, /Bands applied/, 'server user event shown');
  assert.match(txt, /Handover/, 'derived net event shown');
  assert.ok(txt.indexOf('Bands applied') < txt.indexOf('Handover'), 'newest (now) first');
});

test('clicking pins the cursor; clicking again releases it', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60, width: 900 });
  vm.$refs = { lanes: { getBoundingClientRect: () => ({ left: 0, width: 900 }) } };
  vm.onClick({ clientX: 800 });
  assert.ok(vm.pinnedT != null, 'pinned after first click');
  assert.ok(vm.samples.some((x) => x.t === vm.pinnedT), 'the pin is a SAMPLE time, not a minute offset');
  vm.onClick({ clientX: 400 });
  assert.strictEqual(vm.pinnedT, null, 'released after second click');
});

// Faithfully model how a browser paints a viewBox-space x for the <svg>'s actual
// preserveAspectRatio. This is what makes the test catch the real bug: the default
// "meet" uniformly scales + CENTERS (so points drift toward centre), whereas "none"
// stretches to fill the width. `elemH == viewBox H` here, so meet's scale = 1.
function renderedX(svg, vbX, rectW) {
  const a = svg.data.attrs;
  const [, , W, H] = a.viewBox.split(' ').map(Number);
  const par = a.preserveAspectRatio || 'xMidYMid meet';
  if (/\bnone\b/.test(par)) return vbX * rectW / W;              // stretch X to fill
  const scale = Math.min(rectW / W, Number(a.height) / H);       // meet: uniform min-scale
  return (rectW - W * scale) / 2 + vbX * scale;                  // + horizontal centring
}

test('cursor line sits under the mouse when the panel is wider than the viewBox', () => {
  // Embedded, the container renders WIDER than the 900-unit viewBox (measure lags
  // the panel). The drawn line xOf(m) must render under the pointer regardless —
  // which requires the SVG to stretch (preserveAspectRatio:none), not "meet"
  // (uniform-scale + centre), or the line lags the cursor toward both edges.
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60, width: 900 });
  const rectW = 1280;
  vm.$refs = { lanes: { getBoundingClientRect: () => ({ left: 0, width: rectW }) } };
  const svg = walk(c.render.call(vm, h)).find((n) => n.tag === 'svg');
  assert.ok(svg, 'plot svg rendered');
  [120, 450, 800, 1150].forEach((clientX) => {
    const m = vm.clampM(vm.mFromEvent({ clientX }));
    const lineCss = renderedX(svg, vm.xOf(m), rectW);
    assert.ok(Math.abs(lineCss - clientX) < 0.6,
      `line at ${lineCss.toFixed(1)}px must sit under the mouse at ${clientX}px`);
  });
});

test('parseHash reads #w= and #m= into range + pin', () => {
  const c = loadChunk();
  global.window = { location: { hash: '#w=360&m=-42' } };
  const vm = makeVm(c);
  vm.parseHash();
  assert.strictEqual(vm.winW, 360, 'range set from hash');
  assert.ok(Math.abs(vm.cursorM() + 42) < 0.01, 'pin set from hash');
  assert.strictEqual(vm.hashPinM, -42, 're-anchored on the box clock once the preload lands');
  delete global.window;
});

test('sliceReadout shows the nearby event and metric rows', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60, cursor: -10, width: 900 });
  const txt = textOf(vm.sliceReadout(h));
  assert.match(txt, /RSRP/); assert.match(txt, /Band/);
});

test('fetches over RPC (get_history), never touches raw AT or window.__mmHist', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /"get_history"/, 'reads history via the backend RPC');
  assert.doesNotMatch(src, /__mmHist/, 'no in-memory window recorder anymore');
  assert.doesNotMatch(src, /get_result_AT|QNWPREFCFG/, 'never issues raw AT');
});

test('updated() re-syncs this.width to the rendered width (no stretched viewBox)', () => {
  const c = loadChunk();
  assert.strictEqual(typeof c.updated, 'function', 'has an updated hook');
  // width starts at its default; after a render the lanes element reports its real
  // width, and updated() must adopt it so the SVG scale stays ≈ 1.
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60, width: 900 });
  vm.$refs = { lanes: { clientWidth: 1280,
    getBoundingClientRect: () => ({ left: 0, width: 1280 }) } };
  c.updated.call(vm);
  assert.strictEqual(vm.width, 1280, 'viewBox width now matches the rendered width');
});

test('embedded mode drops the "← Modem" breadcrumb (kept standalone)', () => {
  const c = loadChunk();
  const standalone = makeVm(c, { samples: seedSamples(), events: [], winW: 60 });
  assert.match(textOf(c.render.call(standalone, h)), /← Modem/, 'standalone route keeps the breadcrumb');
  const embedded = makeVm(c, { samples: seedSamples(), events: [], winW: 60, embedded: true });
  assert.doesNotMatch(textOf(c.render.call(embedded, h)), /← Modem/, 'embedded tab drops the breadcrumb');
});

test('render-only: no template, render is a function', () => {
  const c = loadChunk();
  assert.strictEqual(c.template, undefined);
  assert.strictEqual(typeof c.render, 'function');
  assert.strictEqual(c.name, 'mudimodem-tracking');
});

// ---- hover readout: fixed position + fixed size (no jitter) ----
// The readout used min-width (not a fixed width) with nowrap value cells, so its
// width tracked the widest content and jittered every pixel as the values, cell
// id, and optional event row changed. It also followed the cursor (left = cx+12,
// flipping sides near the right edge). It now sits fixed at the plot's top-left.

test('slice readout stays put and does not follow the cursor', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: seedSamples(), events: [], winW: 60, width: 900 });
  const leftOf = (t) => (t.data.staticStyle && t.data.staticStyle.left) || null;
  vm.cursor = -55;                       // far left
  const a = vm.sliceReadout(h);
  vm.cursor = -3;                        // far right
  const b = vm.sliceReadout(h);
  assert.strictEqual(leftOf(a), leftOf(b), 'tip position must not change with the cursor');
});

test('slice readout CSS is fixed-size and left-anchored (no resize jitter)', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const m = src.match(/\.mmt-tip\{([^}]*)\}/);
  assert.ok(m, '.mmt-tip rule present');
  const rule = m[1];
  assert.match(rule, /left:\s*\d/, 'anchored at a fixed left');
  assert.match(rule, /width:\s*\d+px/, 'fixed width');
  assert.match(rule, /height:\s*\d+px/, 'fixed height');
  assert.match(rule, /overflow:\s*hidden/, 'clips so content never resizes the box');
  assert.doesNotMatch(rule, /min-width/, 'no content-driven min-width');
});

// ---- in-memory sample ordering (the "line across the whole graph" bug) ----
// The draw + bus code walk winSamples() in array order, drawing one polyline per
// metric. Incremental polling builds this.samples with .concat(), which does NOT
// guarantee ascending t: a full/incremental poll race, or a re-fetch with a stale
// `since`, re-appends already-held samples. A point ordered before its neighbours
// makes the single polyline draw a long L segment jumping back across the plot —
// the straight line spanning the whole graph.

// Longest single drawn segment (in window-minutes) across every metric path. A
// backward jump across the plot shows up here as a segment approaching winW.
function longestSegMin(c, vm) {
  const paths = [];
  const cap = (tag, data) => {
    if (tag === 'path' && data && data.attrs && data.attrs.d) paths.push(data.attrs.d);
    return {};
  };
  c.methods.renderLanes.call(vm, cap);
  const minPerPx = 60 / (vm.width - 30 - 12);   // PADL 30, PADR 12
  let worst = 0;
  for (const d of paths) {
    const pts = d.split(/(?=[ML])/).map((x) => x.trim()).filter(Boolean)
      .map((t) => ({ cmd: t[0], x: Number(t.slice(1).trim().split(/\s+/)[0]) }));
    for (let i = 1; i < pts.length; i++)
      if (pts[i].cmd === 'L') worst = Math.max(worst, Math.abs(pts[i].x - pts[i - 1].x));
  }
  return worst * minPerPx;
}

test('winSamples returns ascending, de-duplicated time order', () => {
  const c = loadChunk();
  const base = seedSamples();                       // 21 ordered samples
  // Model an incremental-poll overlap: the whole history re-appended (a full/
  // incremental race or a stale `since`). Raw array is now out of order + dup'd.
  const vm = makeVm(c, { samples: base.concat(base.slice()), winW: 60, width: 1900 });
  const ts = vm.winSamples().map((x) => x.t);
  assert.deepStrictEqual(ts, ts.slice().sort((a, b) => a - b), 'winSamples must be ascending by t');
  assert.strictEqual(new Set(ts).size, ts.length, 'winSamples must not contain duplicate timestamps');
  assert.strictEqual(ts.length, base.length, 'duplicates collapse back to the unique set');
});

test('an overlapping in-memory merge does NOT draw a line across the plot', () => {
  const c = loadChunk();
  const base = seedSamples();
  assert.ok(longestSegMin(c, makeVm(c, { samples: base, winW: 60, width: 1900 })) < 2,
    'clean data has only short segments');
  // Full re-append — without a sort in winSamples this drew a ~winW-minute L
  // segment straight back across the graph.
  assert.ok(
    longestSegMin(c, makeVm(c, { samples: base.concat(base.slice()), winW: 60, width: 1900 })) < 2,
    'a re-appended/duplicated merge must not produce a cross-plot segment');
});

test('a single out-of-order sample cannot streak across the plot', () => {
  const c = loadChunk();
  const base = seedSamples();
  // Newest sample ordered before the oldest (two batches concatenated newest-first).
  const scrambled = base.slice(1).concat([base[0]]);
  assert.ok(longestSegMin(c, makeVm(c, { samples: scrambled, winW: 60, width: 1900 })) < 2,
    'a lone misordered sample must be sorted back into place before drawing');
});

// Capture the get_history arguments of each /rpc post.
function stubAxios() {
  const calls = [], resolvers = [];
  global.window = {
    $getCookie: () => 'sid',
    $axios: { post: (url, body) => {
      calls.push({ since: body.params[3].since, window_ms: body.params[3].window_ms,
        method: body.params[2] });
      return new Promise((res) => resolvers.push(res));
    } }
  };
  return { calls, resolvers,
    settle: (i, result) => resolvers[i]({ data: { result } }) };
}

test('initial fetch requests the visible window RELATIVE to the box clock', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], winW: 60, width: 1900, serverNow: 0 });
  const ax = stubAxios();
  try {
    vm.fetchHistory();                      // the mount-time load
    assert.strictEqual(ax.calls.length, 1);
    assert.strictEqual(ax.calls[0].window_ms, 60 * 60000,
      'the window is sent as a duration for the box to resolve');
    assert.strictEqual(ax.calls[0].since, undefined,
      'no browser-derived absolute timestamp may be sent — it would mis-size the window by the clock skew');
  } finally { delete global.window; }
});

// The reason the window is a duration and not `Date.now() - winW`: the Mudi is a
// travel router and the two clocks can disagree. A browser 10 minutes slow used
// to ask for 25 minutes of history (slow, wrong axis); 10 minutes fast got a
// nearly empty graph. (Timezone was never the mechanism — Date.now() and Lua's
// os.time() are both UTC epoch, unaffected by TZ. Absolute skew was.)
test('a badly skewed browser clock cannot change what is requested', () => {
  const c = loadChunk();
  const realNow = Date.now;
  const ask = (skewMs) => {
    const vm = makeVm(c, { samples: [], winW: 15, width: 1900, serverNow: 0 });
    const ax = stubAxios();
    try {
      Date.now = () => realNow() + skewMs;
      vm.fetchHistory();
      return ax.calls[0];
    } finally { Date.now = realNow; delete global.window; }
  };
  const slow = ask(-45 * 60000);            // browser 45 minutes behind the box
  const fast = ask(+45 * 60000);            // browser 45 minutes ahead
  assert.deepStrictEqual(
    { since: slow.since, window_ms: slow.window_ms },
    { since: fast.since, window_ms: fast.window_ms },
    'the request must be identical regardless of the local clock');
  assert.strictEqual(slow.window_ms, 15 * 60000, 'and it is still the 15m window');
});

test('selecting a LARGER range backfills the wider window; SMALLER/equal does not', async () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], winW: 60, width: 1900, serverNow: 0 });
  const ax = stubAxios();
  const flush = () => new Promise((r) => setImmediate(r));
  try {
    vm.fetchHistory();                                  // loads 60m, loadedFrom = now-60m
    ax.settle(0, { samples: [], events: [], now: Date.now() });
    await flush();
    // Go to 24h → must backfill the wider window.
    const before = ax.calls.length;
    vm.setRange(1440);
    assert.strictEqual(ax.calls.length, before + 1, 'a wider range fetches more history');
    assert.strictEqual(ax.calls[before].window_ms, 1440 * 60000,
      'backfill requests the 24h window as a duration');
    assert.strictEqual(ax.calls[before].since, undefined, 'and no browser timestamp');
    ax.settle(before, { samples: [], events: [], now: Date.now() });
    await flush();
    // Back down to 1h → already loaded, no fetch.
    const n = ax.calls.length;
    vm.setRange(60);
    assert.strictEqual(ax.calls.length, n, 'a narrower range re-filters in memory, no fetch');
  } finally { delete global.window; }
});

test('the 10s poll fetches incrementally from lastT and merges', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], winW: 60, width: 1900, serverNow: 0, lastT: 111111, loading: false });
  const ax = stubAxios();
  try {
    vm.fetchHistory({ since: vm.lastT, merge: true });
    assert.strictEqual(ax.calls[0].since, 111111, 'poll uses lastT, not the window');
    assert.strictEqual(ax.calls[0].window_ms, undefined, 'lastT is box-stamped; no window needed');
  } finally { delete global.window; }
});

// lastT is 0 until the first sample lands (collector just started, or the window
// happens to be empty). since=0 would make the box decode the ENTIRE retained
// 24h file — every 10 seconds, forever. Fall back to the window instead.
test('the poll never asks since=0 before the first sample arrives', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], winW: 15, width: 1900, serverNow: 0, lastT: 0, loading: false });
  const ax = stubAxios();
  try {
    vm.fetchHistory({ since: vm.lastT, merge: true });
    assert.strictEqual(ax.calls[0].since, undefined, 'must not request the whole file');
    assert.strictEqual(ax.calls[0].window_ms, 15 * 60000, 'falls back to the visible window');
  } finally { delete global.window; }
});

test('an overlapping fetch is skipped, and a range request made during one runs after it settles', async () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], winW: 60, width: 1900, serverNow: 0 });
  const ax = stubAxios();
  try {
    vm.fetchHistory();                       // initial load, stays pending
    assert.strictEqual(ax.calls.length, 1);
    vm.fetchHistory({ since: vm.lastT, merge: true });   // a poll fires mid-flight
    assert.strictEqual(ax.calls.length, 1, 'the overlapping poll is dropped');
    vm.setRange(1440);                       // user widens the range while still fetching
    assert.strictEqual(ax.calls.length, 1, 'the backfill is deferred, not lost');
    ax.settle(0, { samples: [], events: [], now: Date.now() });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(ax.calls.length, 2, 'the deferred backfill runs once the first settles');
    assert.strictEqual(ax.calls[1].window_ms, 1440 * 60000, 'and it is the 24h window');
  } finally { delete global.window; }
});

// ---- 2.x: live data arrives as pushes over GL's ws bus, not by polling ----
test('onPush appends a collector sample, advances lastT, dedups replays', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  vm.samples = [{ t: 1000, rsrp: -100, slot: 1, id: 'A' }]; vm.lastT = 1000;
  vm.onPush({ t: 11000, rsrp: -97, slot: 1, id: 'A' });
  assert.strictEqual(vm.samples.length, 2);
  assert.strictEqual(vm.lastT, 11000);
  assert.strictEqual(vm.serverNow, 11000, 'box clock reference follows the pushed stamp');
  vm.onPush({ t: 11000, rsrp: -97, slot: 1, id: 'A' });
  assert.strictEqual(vm.samples.length, 2, 'seed replay ignored');
  vm.onPush(null); vm.onPush({});
  assert.strictEqual(vm.samples.length, 2, 'empty frames ignored');
});

test('onEventPush appends a user/watchdog event once', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  vm.events = [];
  vm.onEventPush({ t: 5000, kind: 'user', label: 'Kept', detail: '' });
  vm.onEventPush({ t: 5000, kind: 'user', label: 'Kept', detail: '' });
  assert.strictEqual(vm.events.length, 1);
  assert.strictEqual(vm.events[0].label, 'Kept');
});

test('mounted() installs a stall guard, never a 10 s poll', () => {
  const c = loadChunk();
  const src = String(c.mounted);
  assert.ok(!/10000/.test(src), 'no 10 s interval');
  assert.ok(/pushSeenAt/.test(src), 'stall guard keyed on the last push');
});


// ---- 2.0.0 review fixes (2026-09-02) ----

test('deriveNetEvents: a CA add/drop (network_type 4 <-> 41) on the same cell is NOT a handover', () => {
  const vm = makeVm(loadChunk());
  const base = { t: 1000, slot: '1', id: 'A1', band: 66, pci: 12, tx_channel: 66886, mode: 'LTE', network_type: 4 };
  const ev = vm.deriveNetEvents([
    Object.assign({}, base),
    Object.assign({}, base, { t: 2000, network_type: 41, mode: 'LTE+' }),
    Object.assign({}, base, { t: 3000, network_type: 4, mode: 'LTE' })
  ], []);
  assert.deepStrictEqual(ev, [], 'same id/band/pci/earfcn: CA only');
  // a real RAT change on the same cell id still signs differently
  const ev2 = vm.deriveNetEvents([Object.assign({}, base), Object.assign({}, base, { t: 2000, network_type: 51, mode: 'NR5G-NSA' })], []);
  assert.strictEqual(ev2.length, 1);
});

test('deriveNetEvents: a failover followed by not-yet-registered samples emits exactly ONE Failover', () => {
  const vm = makeVm(loadChunk());
  const ev = vm.deriveNetEvents([
    s({ t: 1000, slot: '1', id: 'A' }),
    s({ t: 11000, slot: '2', id: null, band: null, carrier: 'AT&T' }),
    s({ t: 21000, slot: '2', id: null, band: null, carrier: 'AT&T' }),
    s({ t: 31000, slot: '2', id: null, band: null, carrier: 'AT&T' }),
    s({ t: 41000, slot: '2', id: 'B', band: 12, carrier: 'AT&T' })
  ], []);
  const fo = ev.filter((e) => e.label === 'Failover');
  assert.strictEqual(fo.length, 1, 'one slot change, one event (got ' + ev.length + ')');
  assert.strictEqual(fo[0].t, 11000);
  assert.ok(!ev.some((e) => e.label === 'Handover'), 'registering on the new SIM is not a handover from the old one');
});

test('pushedEvent is watched deep (same-second events share a whole-second t)', () => {
  const c = loadChunk();
  const w = c.watch.pushedEvent;
  assert.ok(w && w.deep === true && typeof w.handler === 'function', 'deep watcher on the event object');
  assert.ok(!c.watch['pushedEvent.t'], 'the .t watcher would miss a second event in the same second');
});


test('incremental derivation equals a from-scratch derivation across pushes and 24 h trimming', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  vm.events = [];
  const base = Date.now() - 24 * 3600 * 1000 + 60000;   // oldest sample is 1 min inside the window
  const mk = (i, over) => Object.assign({ t: base + i * 10000, slot: '1', id: i < 5 ? 'A' : (i < 9 ? 'B' : 'C'),
    band: 71, pci: 1, tx_channel: 100, mode: 'NR5G-SA', network_type: 5, rsrp: -100 }, over || {});
  vm.samples = []; vm.lastT = 0;
  for (let i = 0; i < 12; i++) vm.onPush(mk(i));
  const arr = vm.samples;
  const inc = vm.deriveNetEventsIncremental(vm.samples, vm.events);
  const full = vm.deriveNetEvents(vm.samples, vm.events);
  assert.deepStrictEqual(inc, full, 'same events after 12 pushes');
  assert.strictEqual(inc.length, 2, 'two handovers (A->B, B->C)');
  // more pushes: only the new samples are derived, result still equals full
  vm.onPush(mk(12, { id: 'D' }));
  vm.onPush(mk(13));
  assert.strictEqual(vm.samples, arr, 'push is in place — array identity kept');
  assert.deepStrictEqual(vm.deriveNetEventsIncremental(vm.samples, vm.events), vm.deriveNetEvents(vm.samples, vm.events));
  // a new user event invalidates the cache (retroactive suppression) — still equal
  vm.onEventPush({ t: base + 13 * 10000 + 2000, kind: 'user', label: 'Bands applied', detail: '' });
  const inc2 = vm.deriveNetEventsIncremental(vm.samples, vm.events);
  assert.deepStrictEqual(inc2, vm.deriveNetEvents(vm.samples, vm.events));
  // 24 h trim: push a sample far in the future so the head ages out (shift), cache survives
  vm.onPush(mk(14, { t: base + 24 * 3600 * 1000 + 5000, id: 'D' }));
  assert.ok(vm.samples[0].t > base, 'head trimmed in place');
  assert.deepStrictEqual(vm.deriveNetEventsIncremental(vm.samples, vm.events), vm.deriveNetEvents(vm.samples, vm.events));
});

test('deriveNetEvents without state still returns a plain array (pure API unchanged)', () => {
  const vm = makeVm(loadChunk());
  const ev = vm.deriveNetEvents([s({ t: 1000 }), s({ t: 2000, id: 'B2' })], []);
  assert.ok(Array.isArray(ev) && ev.length === 1);
});


test('onPush: a sample landing after a hole triggers a since-fetch that is merged deduped and in order', async () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const calls = [];
  global.window = {
    $getCookie() { return 'tok'; },
    $axios: { post(url, body) {
      calls.push(body.params[3]);
      // backfill reply: the three withheld samples plus the pushed one again
      return Promise.resolve({ data: { result: { samples: [
        { t: 11000, rsrp: -97, slot: 1, id: 'A' }, { t: 21000, rsrp: -96, slot: 1, id: 'A' },
        { t: 31000, rsrp: -95, slot: 1, id: 'A' }, { t: 41000, rsrp: -94, slot: 1, id: 'A' }], events: [], now: 41000 } } });
    } }
  };
  try {
    vm.samples = [{ t: 1000, rsrp: -100, slot: 1, id: 'A' }]; vm.lastT = 1000;
    vm.onPush({ t: 41000, rsrp: -94, slot: 1, id: 'A' });          // 40 s after the last sample
    assert.strictEqual(calls.length, 1, 'one backfill fetch');
    assert.deepStrictEqual(calls[0], { since: 1000 }, 'from the cursor before the push');
    await new Promise((r) => setImmediate(r));
    assert.deepStrictEqual(vm.samples.map((s) => s.t), [1000, 11000, 21000, 31000, 41000], 'filled, sorted, no duplicate');
    vm.onPush({ t: 51000, rsrp: -93, slot: 1, id: 'A' });
    assert.strictEqual(calls.length, 1, 'a regular 10 s push does not fetch');
  } finally { delete global.window; }
});


test('lanes break across a time hole (> 45 s with no sample), like the strip, instead of bridging it', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const now = Date.now();
  // 5 samples, then a 2-minute hole, then 5 more — all with readings.
  const mk = (t) => ({ t, slot: '1', id: 'A', band: 71, mode: 'NR5G-SA', rsrp: -100, sinr: 5, rsrq: -12, carrier: 'X' });
  const ss = [];
  for (let i = 10; i > 5; i--) ss.push(mk(now - i * 10000 - 120000));
  for (let i = 5; i > 0; i--) ss.push(mk(now - i * 10000));
  vm.samples = ss; vm.serverNow = now; vm.serverNowAt = now; vm.loading = false; vm.winW = 15;
  const tree = c.render.call(vm, h);
  const paths = walk(tree).filter((n) => n.tag === 'path' && n.data.attrs && /^M/.test(n.data.attrs.d));
  assert.ok(paths.length >= 1, 'lanes drawn');
  const rsrpPath = paths[0].data.attrs.d;
  const moves = (rsrpPath.match(/M/g) || []).length;
  assert.strictEqual(moves, 2, 'the RSRP lane is two segments: it breaks across the hole rather than bridging it');
});


// ---- 2.x review fixes (2026-10-28) ----

// #1: an EN-DC cell's LTE anchor carries `mode: NR5G-NSA` but its band is an
// LTE band. The n/B prefix follows the CARRIER (pcc_rat), like the parent's
// servingRat(); older samples fall back to signals[0].rat, then mode.
test('band labels follow the carrier RAT: an NSA LTE anchor on B2 is "B2", never "n2"', () => {
  const vm = makeVm(loadChunk());
  assert.strictEqual(vm.bandLabel(s({ mode: 'NR5G-NSA', pcc_rat: 'LTE', band: 2 })), 'B2');
  assert.strictEqual(vm.bandLabel(s({ mode: 'NR5G-NSA', band: 2, signals: [{ rat: 'LTE', band: 2 }] })), 'B2',
    'no pcc_rat: signals[0].rat decides');
  assert.strictEqual(vm.bandLabel(s({ mode: 'NR5G-SA', pcc_rat: 'NR5G-SA', band: 71 })), 'n71');
  assert.strictEqual(vm.bandLabel(s({ mode: 'NR5G-SA', band: 71 })), 'n71', 'oldest samples: mode');
  const ev = vm.deriveNetEvents([
    s({ t: 1000, id: 'A', mode: 'NR5G-NSA', pcc_rat: 'LTE', band: 66 }),
    s({ t: 11000, id: 'B', mode: 'NR5G-NSA', pcc_rat: 'LTE', band: 2 })], []);
  assert.strictEqual(ev.length, 1);
  assert.match(ev[0].detail, / B2$/, 'Handover detail names the anchor as an LTE band');
  assert.doesNotMatch(ev[0].detail, /n2/);
});

// #4: collection is every 10 s and every band apply / cell lock REDIALS, so
// the first registered sample after the change lands well past 8 s.
test('a user change registered 25 s later (redial + 10 s ticks) is not logged as a Handover', () => {
  const vm = makeVm(loadChunk());
  const known = [{ t: 100000, kind: 'user', label: 'Bands applied', detail: '' }];
  const ev = vm.deriveNetEvents([
    s({ t: 95000, id: 'A1', band: 71 }),
    s({ t: 103000, id: null, band: null }),            // redialing: no service
    s({ t: 113000, id: null, band: null }),
    s({ t: 125000, id: 'B2', band: 41 })               // registered on the new band
  ], known);
  assert.deepStrictEqual(ev, [], 'the user\'s own change is not the network\'s');
  const dog = [{ t: 100000, kind: 'dog', label: 'Auto-revert', detail: '' }];
  assert.deepStrictEqual(vm.deriveNetEvents([s({ t: 95000 }), s({ t: 133000, id: 'B2' })], dog), [],
    'a watchdog revert redials too');
});

test('a genuine handover well after a user change is still reported', () => {
  const vm = makeVm(loadChunk());
  const known = [{ t: 100000, kind: 'user', label: 'Bands applied', detail: '' }];
  const ev = vm.deriveNetEvents([
    s({ t: 95000, id: 'A1' }), s({ t: 125000, id: 'B2' }),      // ours
    s({ t: 135000, id: 'B2' }), s({ t: 190000, id: 'C3' })      // 90 s later: the network's
  ], known);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].t, 190000);
  assert.match(ev[0].detail, /B2 → C3/);
  // A "Kept" confirmation touches nothing on the modem: a change 20 s after it
  // is the network's, not ours.
  const kept = vm.deriveNetEvents([s({ t: 95000, id: 'A1' }), s({ t: 120000, id: 'B2' })],
    [{ t: 100000, kind: 'user', label: 'Kept', detail: '' }]);
  assert.strictEqual(kept.length, 1, 'Kept gets no redial window');
});

// #2: PAUSED used to only disable the stall guard; every 10 s push re-rendered
// and slid the view (and a pinned slice) to newer data.
test('PAUSED freezes the view; pushes are still collected and appear on resume', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, { samples: [], winW: 15, serverNow: now, serverNowAt: Date.now(), loading: false });
  for (let i = 5; i >= 1; i--) vm.onPush(s({ t: now - i * 10000, rsrp: -100 - i }));
  vm.togglePause();
  assert.strictEqual(vm.live, false);
  const frozenLast = vm.winSamples().slice(-1)[0].t;
  vm.onPush(s({ t: now + 10000, rsrp: -80 }));
  vm.onPush(s({ t: now + 20000, rsrp: -79 }));
  assert.strictEqual(vm.samples.length, 7, 'pushes are collected while paused');
  assert.strictEqual(vm.winSamples().slice(-1)[0].t, frozenLast, 'the view does not move');
  assert.strictEqual(vm.heldCount(), 2);
  assert.match(textOf(c.render.call(vm, h)), /2 new samples held/, 'says what it is holding');
  assert.match(textOf(c.render.call(vm, h)), /PAUSED/);
  vm.togglePause();
  assert.strictEqual(vm.winSamples().slice(-1)[0].t, now + 20000, 'resume shows everything collected');
});

test('a pinned slice stays on its sample while pushes keep arriving (live or paused)', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, { samples: [], winW: 15, serverNow: now, serverNowAt: Date.now(), width: 900, loading: false });
  for (let i = 30; i >= 0; i--) vm.onPush(s({ t: now - i * 10000, rsrp: -120 + i }));
  vm.$refs = { lanes: { getBoundingClientRect: () => ({ left: 0, width: 900 }) } };
  vm.onClick({ clientX: 820 });                       // pin near the right edge
  const pinned = vm.focusSample();
  assert.ok(pinned, 'pinned a sample');
  // Six more pushes (one minute). Under the old minutes-relative pin the
  // readout slid one sample newer on every push.
  for (let i = 1; i <= 6; i++) vm.onPush(s({ t: now + i * 10000, rsrp: -50 }));
  assert.strictEqual(vm.focusSample().t, pinned.t, 'live: same sample after a minute of pushes');
  assert.match(textOf(vm.sliceReadout(h)), new RegExp(String(pinned.rsrp)), 'readout still shows its reading');
  vm.togglePause();
  vm.onPush(s({ t: now + 70000, rsrp: -40 }));
  assert.strictEqual(vm.focusSample().t, pinned.t, 'paused: same sample');
});

// #3: rpcSilent resolves null and never rejects, so the old .catch was dead,
// err was never set, and a failed preload left only post-open samples forever.
function captureTimers() {
  const realSet = global.setTimeout, realClear = global.clearTimeout, pending = [];
  global.setTimeout = (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; };
  global.clearTimeout = (t) => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); };
  return { pending, restore() { global.setTimeout = realSet; global.clearTimeout = realClear; } };
}
const flush = () => new Promise((r) => setImmediate(r));

test('a failed preload is reported, retried with backoff, and merged with the pushes that landed meanwhile', async () => {
  const c = loadChunk();
  const replies = [null, null];               // two failed preloads (result absent => rpcSilent null)
  const calls = [];
  global.window = { $getCookie: () => 'tok', $axios: { post(url, body) {
    calls.push(body.params[3]);
    const r = replies.shift();
    return Promise.resolve({ data: r === undefined ? {} : { result: r } });
  } } };
  const timers = captureTimers();
  try {
    const vm = makeVm(c, { samples: [], winW: 15, width: 900 });
    vm._alive = true;                          // mounted
    vm.fetchHistory();
    await flush();
    assert.strictEqual(vm.preloaded, false);
    assert.strictEqual(timers.pending.length, 1, 'a retry is scheduled');
    assert.strictEqual(timers.pending[0].ms, 2000, 'first backoff step');
    assert.match(textOf(c.render.call(vm, h)), /Couldn't load history.*retrying every 2 s/,
      'the failure is on the page, with the real cadence');
    // pushes arrive while the preload is failing: the first one used to set
    // the cursor and end any chance of the window loading
    const now = Date.now();
    vm.onPush(s({ t: now - 10000 })); vm.onPush(s({ t: now }));
    assert.strictEqual(calls.length, 1, 'a regular push does not fetch');
    timers.pending.shift().fn();               // retry #1 -> fails again
    await flush();
    assert.strictEqual(calls[1].window_ms, 15 * 60000, 'the retry asks for the window, not the tail');
    assert.strictEqual(timers.pending[0].ms, 4000, 'backoff doubles');
    assert.match(textOf(c.render.call(vm, h)), /Earlier history didn't load.*retrying every 4 s/,
      'with live samples drawn, the missing history is still called out');
    // retry #2 succeeds: older history + the two pushed samples again
    replies.push({ samples: [s({ t: now - 300000 }), s({ t: now - 200000 }), s({ t: now - 10000 }), s({ t: now })],
      events: [], now });
    timers.pending.shift().fn();
    await flush();
    assert.strictEqual(vm.preloaded, true);
    assert.deepStrictEqual(vm.samples.map((x) => x.t), [now - 300000, now - 200000, now - 10000, now],
      'merged with the pushes: deduped, ascending');
    assert.strictEqual(timers.pending.length, 0, 'no further retries');
    assert.doesNotMatch(textOf(c.render.call(vm, h)), /retrying/);
  } finally { timers.restore(); delete global.window; }
});

test('the backoff is bounded at 30 s and stops when the page is torn down', async () => {
  const c = loadChunk();
  global.window = { $getCookie: () => 'tok', $axios: { post() { return Promise.resolve({ data: {} }); } } };
  const timers = captureTimers();
  try {
    const vm = makeVm(c, { samples: [], winW: 15 });
    vm._alive = true;
    vm.fetchHistory(); await flush();
    const steps = [timers.pending[0].ms];
    for (let i = 0; i < 6; i++) { timers.pending.shift().fn(); await flush(); steps.push(timers.pending[0].ms); }
    assert.deepStrictEqual(steps, [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    c.beforeDestroy.call(vm);
    assert.strictEqual(timers.pending.length, 0, 'beforeDestroy clears the pending retry');
  } finally { timers.restore(); delete global.window; }
});

test('a failed hole backfill is asked again on the next push', async () => {
  const c = loadChunk();
  const replies = [null];
  const calls = [];
  global.window = { $getCookie: () => 'tok', $axios: { post(url, body) {
    calls.push(body.params[3]);
    const r = replies.shift();
    return Promise.resolve({ data: r == null ? {} : { result: r } });
  } } };
  try {
    const vm = makeVm(c, { samples: [s({ t: 1000 })], lastT: 1000, preloaded: true });
    vm.onPush(s({ t: 41000 }));                 // a hole: backfill since 1000 -> fails
    await flush();
    assert.deepStrictEqual(calls[0], { since: 1000 });
    replies.push({ samples: [s({ t: 11000 }), s({ t: 21000 }), s({ t: 31000 })], events: [], now: 51000 });
    vm.onPush(s({ t: 51000 }));                 // a regular push...
    assert.deepStrictEqual(calls[1], { since: 1000 }, '...re-asks for the tail that failed');
    await flush();
    assert.deepStrictEqual(vm.samples.map((x) => x.t), [1000, 11000, 21000, 31000, 41000, 51000]);
    assert.strictEqual(vm.missingSince, null);
    vm.onPush(s({ t: 61000 }));
    assert.strictEqual(calls.length, 2, 'and stops once it has it');
  } finally { delete global.window; }
});

// #5: two SIMs are two radios — never one line, never one bar.
test('the lanes break at a SIM change instead of joining SIM1 to SIM2', () => {
  const c = loadChunk();
  const now = Date.now();
  const ss = [];
  for (let i = 6; i >= 4; i--) ss.push(s({ t: now - i * 10000, slot: '1', rsrp: -100 }));
  for (let i = 3; i >= 0; i--) ss.push(s({ t: now - i * 10000, slot: '2', id: 'Z9', carrier: 'AT&T', rsrp: -90 }));
  const vm = makeVm(c, { samples: ss, serverNow: now, serverNowAt: Date.now(), winW: 15, loading: false });
  const rsrp = walk(c.render.call(vm, h)).filter((n) => n.tag === 'path')[0].data.attrs.d;
  assert.strictEqual((rsrp.match(/M/g) || []).length, 2, 'two segments, one per SIM: ' + rsrp);
  const band = vm.busRuns('band');
  assert.strictEqual(band.length, 2, 'same band on both SIMs is still two runs');
});

test('the last bus run ends at the last sample once data has stopped, like the lanes', () => {
  const c = loadChunk();
  const now = Date.now();
  // Live data: the last sample is 5 s old -> the run reaches now.
  let vm = makeVm(c, { samples: [s({ t: now - 25000 }), s({ t: now - 15000 }), s({ t: now - 5000 })],
    serverNow: now, serverNowAt: Date.now(), winW: 15 });
  assert.strictEqual(vm.busRuns('band').slice(-1)[0].m1, 0, 'live: extends to now');
  // Collector stopped 5 minutes ago: the bar must not run on to now.
  vm = makeVm(c, { samples: [s({ t: now - 320000 }), s({ t: now - 310000 }), s({ t: now - 300000 })],
    serverNow: now, serverNowAt: Date.now(), winW: 15 });
  const last = vm.busRuns('band').slice(-1)[0];
  assert.ok(Math.abs(last.m1 + 5) < 0.05, 'ends at the last sample (-5 min), got ' + last.m1);
});
