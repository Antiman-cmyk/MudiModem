const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = path.join(__dirname, '..', 'src', 'views', 'mudimodem-battery.js');

function loadChunk() {
  const module = { exports: {} };   // eslint-disable-line no-unused-vars
  return eval(fs.readFileSync(SRC, 'utf8'));
}
function makeVm(c, over) {
  const vm = Object.assign({}, c.data());
  for (const [k, f] of Object.entries(c.methods || {})) vm[k] = f.bind(vm);
  for (const [k, f] of Object.entries(c.computed || {}))
    Object.defineProperty(vm, k, { get: f.bind(vm), configurable: true });
  Object.assign(vm, over || {});
  return vm;
}
// n samples ending `now`, `step` ms apart, newest last.
function seed(now, n, step, fn) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * step;
    out.push(Object.assign({ t, cap: 70, volt: 4010, cur: -363, temp: 31.6,
      online: 0, status: 'Discharging', ctype: 'N/A', cycles: 4, health: 'Good' },
      fn ? fn(n - 1 - i, t) : {}));
  }
  return out;
}

test('chunk is one expression exporting a runtime-only component', () => {
  const c = loadChunk();
  assert.equal(c.name, 'mudimodem-battery');
  assert.equal(typeof c.render, 'function');
  assert.equal(c.template, undefined, 'Vue here is runtime-only: template: would render nothing');
});

test('guiOf converts gauge to GUI % using the served constants', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: { gui_m: 13867, gui_b: 189300 } });
  assert.equal(vm.guiOf(70), 78.1);     // (70*13867 - 189300)/10000
  assert.equal(vm.guiOf(null), null);
});

test('guiOf falls back to the documented constants when get_battlimit has not landed', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: null });
  assert.equal(vm.guiOf(70), 78.1);
});

test('winSamples decorates gauge->GUI and uV->V and sorts ascending', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: [{ t: now - 1000, cap: 70, volt: 4010, cur: -1, temp: 30 },
              { t: now - 5000, cap: 69, volt: 4000, cur: -2, temp: 30 }],
    serverNow: now, serverNowAt: now, winW: 15
  });
  const ss = vm.winSamples();
  assert.equal(ss.length, 2);
  assert.equal(ss[0].t, now - 5000, 'ascending by t regardless of insertion order');
  assert.equal(ss[1].capGui, 78.1);
  assert.equal(ss[1].voltV, 4.01);
});

test('segments break across a gap longer than 60s', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = [
    { t: now - 300000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    { t: now - 280000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    // 200 s hole: the collector was down. Must NOT be bridged by a straight line.
    { t: now - 80000,  cap: 68, volt: 3990, cur: -300, temp: 31 },
    { t: now - 60000,  cap: 68, volt: 3990, cur: -300, temp: 31 }
  ];
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const segs = vm.segments('cur');
  assert.equal(segs.length, 2, 'an outage is a break, not a bridge');
  assert.equal(segs[0].length, 2);
  assert.equal(segs[1].length, 2);
});

test('segments drop null metrics without bridging them', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = [
    { t: now - 60000, cap: 70, volt: 4010, cur: -300, temp: 31 },
    { t: now - 40000, cap: 70, volt: 4010, cur: null, temp: 31 },
    { t: now - 20000, cap: 70, volt: 4010, cur: -300, temp: 31 }
  ];
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  assert.equal(vm.segments('cur').length, 2);
  assert.equal(vm.segments('temp').length, 1, 'a null in one lane does not break another');
});

test('reduce is min/max-preserving and never averages away a zero', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // 400 points; exactly one is 0 (the moment the charge limit engaged).
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push({ m: -400 + i, v: i === 200 ? 0 : 1200, t: i });
  const out = vm.reduce(pts, 50);
  assert.ok(out.length < pts.length, 'actually reduced');
  assert.ok(out.some((p) => p.v === 0),
    'the exact 0 survives: averaging would smear it into a small non-zero value');
  for (let i = 1; i < out.length; i++)
    assert.ok(out[i].m >= out[i - 1].m, 'output stays in time order');
});

test('reduce leaves small series untouched', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const pts = [{ m: -3, v: 1 }, { m: -2, v: 2 }, { m: -1, v: 3 }];
  assert.deepEqual(vm.reduce(pts, 50), pts);
});

test('reduce keeps a 0 that straddles a bucket - neither its min nor its max', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // One bucket (of two) holds a charging run (1200), a single blocked sample
  // (0), then a discharging run (-50). min/max alone picks -50 and 1200 and
  // silently drops the 0 sitting strictly between them - the exact failure
  // this fixture is built to catch (the old fixture never could, because its
  // one 0 was always the bucket's global minimum).
  const pts = [
    { m: 0, v: 1200, t: 0 }, { m: 1, v: 1200, t: 1 }, { m: 2, v: 0, t: 2 },
    { m: 3, v: -50, t: 3 }, { m: 4, v: -50, t: 4 },
    { m: 5, v: -50, t: 5 }, { m: 6, v: -50, t: 6 }, { m: 7, v: -50, t: 7 },
    { m: 8, v: -50, t: 8 }, { m: 9, v: -50, t: 9 }
  ];
  const out = vm.reduce(pts, 2);
  assert.ok(out.length < pts.length, 'actually reduced');
  assert.ok(out.some((p) => p.v === 0),
    'the exact 0 survives even when it is neither the bucket min nor max');
  for (let i = 1; i < out.length; i++)
    assert.ok(out[i].m >= out[i - 1].m, 'output stays in time order');
});

test('charge lane is fixed 0-100 so drift is not dramatised', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, () => ({ cap: 70 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const lane = c.LANES.find((l) => l.key === 'capGui');
  assert.deepEqual(vm.domainFor(lane), [0, 100]);
});

test('current lane always includes zero even when nothing hits it', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, () => ({ cur: -400 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const [lo, hi] = vm.domainFor(c.LANES.find((l) => l.key === 'cur'));
  assert.ok(lo <= -400 && hi >= 0, 'zero on scale: it is the evidence the limit engaged');
});

test('temperature lane enforces a minimum span', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 5, 20000, (i) => ({ temp: 31.5 + i * 0.05 })),
    serverNow: now, serverNowAt: now, winW: 15
  });
  const [lo, hi] = vm.domainFor(c.LANES.find((l) => l.key === 'temp'));
  assert.ok(hi - lo >= 5, 'a 0.2 C wobble must not fill the lane');
});

test('voltage lane is fixed to the Li-ion range but expands rather than clipping', () => {
  const c = loadChunk();
  const now = Date.now();
  const lane = c.LANES.find((l) => l.key === 'voltV');
  let vm = makeVm(c, { samples: seed(now, 3, 20000, () => ({ volt: 4010 })),
    serverNow: now, serverNowAt: now, winW: 15 });
  assert.deepEqual(vm.domainFor(lane), [3.3, 4.3]);
  vm = makeVm(c, { samples: seed(now, 3, 20000, () => ({ volt: 3100 })),
    serverNow: now, serverNowAt: now, winW: 15 });
  assert.ok(vm.domainFor(lane)[0] <= 3.1, 'an out-of-range reading expands, never clips silently');
});

test('chargeState distinguishes blocked from merely idle', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.chargeState({ online: 1, cur: 1183 }), 'charging');
  assert.equal(vm.chargeState({ online: 1, cur: 0 }), 'blocked');
  assert.equal(vm.chargeState({ online: 1, cur: -50 }), 'draining');
  assert.equal(vm.chargeState({ online: 0, cur: -363 }), 'discharging');
});

test('chargeState reports full for a genuinely full battery, even at zero current', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // A battery that finished charging sits on trickle: online, 0 mA - the same
  // signature glbattlimit uses for "held off". `status` is what tells them
  // apart, so it must win over the current-based rule, not the reverse.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full' }), 'full');
  // status is a raw sysfs string - tolerate whitespace and case.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: '  full  ' }), 'full');
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'FULL' }), 'full');
});

test('chargeState still reports blocked when status says something other than Full', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Not charging' }), 'blocked');
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Charging' }), 'blocked');
});

test('chargeState falls through to the current-based rules when status is missing', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // Older retained samples predate the `status` field entirely - must not
  // crash, and a missing status must not silently read as "full".
  assert.equal(vm.chargeState({ online: 1, cur: 0 }), 'blocked');
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: '' }), 'blocked');
  assert.equal(vm.chargeState({ online: 1, cur: 1183 }), 'charging');
});

test('stateRuns collapses consecutive samples into labelled runs', () => {
  const c = loadChunk();
  const now = Date.now();
  // Second half is a battery that finished charging (status Full) settling
  // onto trickle at 0 mA - a distinct "full" state, not "blocked".
  const samples = seed(now, 6, 20000, (i) => (
    i < 3 ? { online: 1, cur: 1183, status: 'Charging' }
          : { online: 1, cur: 0, status: 'Full' }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const runs = vm.stateRuns();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].v, 'charging');
  assert.equal(runs[1].v, 'full');
});

test('a full<->charging transition is not a plug/unplug event', () => {
  const c = loadChunk();
  const now = Date.now();
  // Contiguous samples, no gap: bulk-charging (cur>0) settles into trickle at
  // full (cur=0, status=Full). Neither side is "discharging", so this must
  // NOT be read as an unplug/replug - the charger never left.
  const samples = seed(now, 10, 20000, (i) => (
    i < 5 ? { online: 1, cur: 1183, status: 'Charging', cap: 99 }
          : { online: 1, cur: 0, status: 'Full', cap: 100 }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15, loading: false });
  const runs = vm.stateRuns();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].v, 'charging');
  assert.equal(runs[1].v, 'full');
  const out = textOf(render(vm, c));
  assert.ok(!/\b(un)?plugged\b/i.test(out),
    'full<->charging must not draw a plug/unplug tick - the charger never left');
});

test('stateRuns breaks across a gap longer than GAP_MS, like segments does', () => {
  const c = loadChunk();
  const now = Date.now();
  // Two 'charging' samples 4 hours apart, nothing in between - a real
  // collector outage, not jitter. Must NOT collapse into one solid run
  // claiming the device was charging the whole time we have no data for.
  const samples = [
    { t: now - 4 * 3600000 - 60000, cap: 70, volt: 4010, cur: 1183, temp: 31, online: 1 },
    { t: now - 60000, cap: 70, volt: 4010, cur: 1183, temp: 31, online: 1 }
  ];
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 300 });
  const runs = vm.stateRuns();
  assert.equal(runs.length, 2, 'an outage is a break, not a bridge, even when the state matches on both sides');
  assert.equal(runs[0].v, 'charging');
  assert.equal(runs[1].v, 'charging');
});

test('nowMs is skew-corrected to the box clock', () => {
  const c = loadChunk();
  const vm = makeVm(c, { serverNow: 5000000, serverNowAt: Date.now() });
  assert.ok(Math.abs(vm.nowMs() - 5000000) < 1000,
    'the axis follows the box clock, not the browser clock');
});

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
function render(vm, c) { return c.render.call(vm, h); }

test('renders an empty state, not a broken chart, before the first sample', () => {
  const c = loadChunk();
  const vm = makeVm(c, { samples: [], loading: false, bl: { available: true, enabled: false } });
  const out = textOf(render(vm, c));
  assert.match(out, /No battery history yet/i);
});

test('renders all four lane labels once samples exist', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now,
    loading: false, bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  const tree = render(vm, c);
  // Assert against renderLanes' OWN svg subtree, not the whole component: the
  // bare words 'Charge'/'Current'/'Voltage' are also emitted unconditionally
  // by renderStatusRow's stat captions and renderLimitCard's heading, so a
  // whole-page text check on those words would pass even if renderLanes never
  // drew a label. Scoping to the '.mmb-lanes' svg, plus asserting the FULL
  // label strings with units (which appear nowhere else), makes this
  // discriminating for all four lanes, not just Temperature/Temp.
  const svg = walk(tree).find((n) => n.data && n.data.staticClass === 'mmb-lanes');
  assert.ok(svg, 'lanes svg missing');
  const out = textOf(svg);
  for (const label of ['Charge · %', 'Current · mA', 'Voltage · V', 'Temperature · °C'])
    assert.ok(out.includes(label), 'missing lane: ' + label);
});

test('draws the target line only when the limit is enabled', () => {
  const c = loadChunk();
  const now = Date.now();
  const base = { samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false };
  const on = makeVm(c, Object.assign({}, base,
    { bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 } }));
  assert.ok(walk(render(on, c)).some((n) => n.data && n.data.attrs
    && n.data.attrs.class === 'mmb-target'), 'target line missing when enabled');
  const off = makeVm(c, Object.assign({}, base,
    { bl: { available: true, enabled: false, limit_gui: 80 } }));
  assert.ok(!walk(render(off, c)).some((n) => n.data && n.data.attrs
    && n.data.attrs.class === 'mmb-target'), 'target line drawn while the limit is off');
});

test('the chart still renders when glbattlimit is unavailable', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, {
    samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false,
    bl: { available: false, error: 'glbattlimit not installed' }
  });
  const tree = render(vm, c);
  // Same fix as the lane-labels test above: check the actual '.mmb-lanes' svg
  // (and a full, unit-bearing label) rather than a bare word ('Charge') that
  // renderStatusRow/renderLimitCard emit regardless of whether the chart drew.
  const svg = walk(tree).find((n) => n.data && n.data.staticClass === 'mmb-lanes');
  assert.ok(svg, 'chart must not depend on the charge-limit tool');
  assert.ok(textOf(svg).includes('Charge · %'),
    'lane label missing - the chart must still draw when glbattlimit is unavailable');
  assert.match(textOf(tree), /not available/i);
});

test('the range selector offers the four spec windows', () => {
  const c = loadChunk();
  const now = Date.now();
  const vm = makeVm(c, { samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now, loading: false });
  const out = textOf(render(vm, c));
  for (const r of ['15 m', '1 h', '6 h', '24 h']) assert.ok(out.includes(r), 'missing range ' + r);
});

test('render survives a sample stream full of nulls', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 10, 20000, () => ({ cap: null, volt: null, cur: null, temp: null }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, loading: false });
  assert.doesNotThrow(() => render(vm, c));
});

test('the status row reports the blocked state in words', () => {
  const c = loadChunk();
  const now = Date.now();
  // status is NOT 'Full' here - this is the limiter genuinely holding charge
  // off below the target, not a battery that finished charging.
  const samples = seed(now, 10, 20000, () => ({ online: 1, cur: 0, status: 'Not charging', cap: 71 }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, loading: false,
    bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  assert.match(textOf(render(vm, c)), /Charge blocked/i);
});

test('the status row reports a full battery as "Full", not "Charge blocked"', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 10, 20000, () => ({ online: 1, cur: 0, status: 'Full', cap: 100 }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, loading: false,
    bl: { available: true, enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  const out = textOf(render(vm, c));
  // No separator between adjacent stat nodes in this fake render harness
  // (e.g. "...°CTempFullState80..."), so there's no word boundary to anchor
  // on either side of "Full" - a plain substring check is what the rest of
  // this file already uses for the same reason (see the range-selector test).
  assert.ok(out.includes('Full'), 'a full, trickle-charging battery must not be mislabeled as blocked');
  assert.ok(!out.includes('Charge blocked'), 'must not also claim the charge is blocked');
});
