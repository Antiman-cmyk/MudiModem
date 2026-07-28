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

test('stateRuns collapses consecutive samples into labelled runs', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 6, 20000, (i) => (
    i < 3 ? { online: 1, cur: 1183, status: 'Charging' }
          : { online: 1, cur: 0, status: 'Full' }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const runs = vm.stateRuns();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].v, 'charging');
  assert.equal(runs[1].v, 'blocked');
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
