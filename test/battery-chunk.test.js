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
      online: 0, status: 'Discharging', ctype: 'N/A', cycles: 4, health: 'Good',
      // glbattlimit's watcher exits on unplug, so an unplugged sample carries
      // lim: 0. See read_limiter in src/sbin/mudimodem-collectd.
      lim: 0, lim_gauge: null },
      fn ? fn(n - 1 - i, t) : {}));
  }
  return out;
}

// ---------------------------------------------------------------------------
// window.$rpcRequest stub for fetchBattLimit/applyBattLimit — same shape as
// test/chunk.test.js's stubRpc (that's the harness these two methods were
// tested against before they moved here from the Config tab; see 8d5d790).
// Also stubs addEventListener/removeEventListener because mounted() calls
// window.addEventListener("resize", ...) unconditionally once window exists.
// ---------------------------------------------------------------------------
function stubRpc(replies) {
  const calls = [];
  const take = () => replies.shift();
  global.window = {
    $rpcRequest(method, params, opts) {
      calls.push({ method, params, opts });
      const r = take();
      return (r instanceof Error) ? Promise.reject(r) : Promise.resolve(r);
    },
    $getCookie: () => 'tok',
    addEventListener() {},
    removeEventListener() {},
    $axios: {
      post(url, body, opts) {
        calls.push({ method: body.method, params: body.params, opts });
        const r = take();
        return (r instanceof Error)
          ? Promise.reject(r)
          : Promise.resolve({ data: { result: r } });
      }
    }
  };
  return calls;
}
function unstubRpc() { delete global.window; }

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

// ---------------------------------------------------------------------------
// chargeState. THE FIXTURE BELOW IS THE LIVE BOX, 2026-07-28:
//   /etc/mudimodem/battlimit.json  {"enabled":true,"limit_gui":80}
//   glbattlimit status  ->  Limit: active (71 % gauge / ~80 % GUI, PID 26702)
//                           Current: 0 mA · Charger: online=1 · charge_en=0
//                           Buck vreg: 3900000 uV (factory 4400000)
//   sysfs               ->  capacity=71 current_now=0 online=1
//                           status=Full charge_type=Trickle
// cap 71 IS gui_to_gauge(80), i.e. the configured target: the limiter is
// holding the charge off. status=Full is what the CHARGER reports when the
// limiter drops vreg below Vbat — it is the limiter's signature, NOT a full
// cell (a full cell here reads ~86 gauge). Keying "full" off `status` inverts
// the label exactly when the feature has something to show, which is why the
// discriminator is the limiter's own per-sample state (lim / lim_gauge).
// test/collectd.test.py asserts the same fixture from the collector's side.
// ---------------------------------------------------------------------------
test('chargeState reads current and online for the unambiguous states', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.chargeState({ online: 1, cur: 1183, lim: 0 }), 'charging');
  assert.equal(vm.chargeState({ online: 1, cur: -50, lim: 0 }), 'draining');
  assert.equal(vm.chargeState({ online: 0, cur: -363, lim: 0 }), 'discharging');
});

test('chargeState: a missing current reading is unknown, not a measured behaviour', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // current_now absent or garbage => `cur: null`. Reporting that as
  // "Draining on power" would state a measurement we never took.
  assert.equal(vm.chargeState({ online: 1, cur: null, lim: 0 }), 'unknown');
});

test('chargeState: the limiter holding charge off at its target reads BLOCKED, not full', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // The live capture above, verbatim. status/ctype say Full/Trickle and must
  // NOT win: the limiter is running (lim 1) and the gauge is at its target.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full', ctype: 'Trickle',
    cap: 71, lim: 1, lim_gauge: 71 }), 'blocked');
  // Above the target too (the gauge can sit a point high).
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full',
    cap: 73, lim: 1, lim_gauge: 71 }), 'blocked');
});

test('chargeState: the same charger strings with NO limiter running are a genuinely full battery', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // Byte-identical charger state; only the limiter differs. This is the pair
  // that proves the two cases are actually distinguishable.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full', ctype: 'Trickle',
    cap: 86, lim: 0, lim_gauge: null }), 'full');
  // status is a raw sysfs string - tolerate whitespace and case.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: '  full  ', cap: 86, lim: 0 }), 'full');
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'FULL', cap: 86, lim: 0 }), 'full');
});

test('chargeState: a running watcher BELOW its target is not the one blocking', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // glbattlimit only gates at/above its target (watch_loop: cap -ge lim), so a
  // 0 mA reading well below the target is not attributable to it.
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full',
    cap: 60, lim: 1, lim_gauge: 71 }), 'full');
});

test('chargeState: plugged in at 0 mA with no limiter and no Full is honestly "not charging"', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Not charging', cap: 60, lim: 0 }), 'idle');
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: '', cap: 60, lim: 0 }), 'idle');
});

test('chargeState: samples predating the lim field claim neither Full nor blocked', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // Retained history written before the collector recorded the limiter state.
  // status=Full is ambiguous on this hardware, so the honest answer is
  // "not charging" - never a confident "Full", never a false "blocked".
  assert.equal(vm.chargeState({ online: 1, cur: 0, status: 'Full', cap: 71 }), 'idle');
  assert.equal(vm.chargeState({ online: 1, cur: 0, cap: 71 }), 'idle');
  // ...but the unambiguous states still work without it.
  assert.equal(vm.chargeState({ online: 1, cur: 1183 }), 'charging');
});

test('the blocked and full labels are distinct words in the UI', () => {
  const c = loadChunk();
  assert.notEqual(c.STATE_LABEL.blocked, c.STATE_LABEL.full);
  assert.match(c.STATE_LABEL.blocked, /limit/i,
    'the blocked label must name the limiter - that is the whole point of the tab');
});

test('stateRuns collapses consecutive samples into labelled runs', () => {
  const c = loadChunk();
  const now = Date.now();
  // Second half is a battery that finished charging (status Full) settling
  // onto trickle at 0 mA with NO limiter running - a distinct "full" state.
  const samples = seed(now, 6, 20000, (i) => (
    i < 3 ? { online: 1, cur: 1183, status: 'Charging', cap: 85, lim: 0 }
          : { online: 1, cur: 0, status: 'Full', cap: 86, lim: 0 }));
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
    i < 5 ? { online: 1, cur: 1183, status: 'Charging', cap: 85, lim: 0 }
          : { online: 1, cur: 0, status: 'Full', cap: 86, lim: 0 }));
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

// ---------------------------------------------------------------------------
// Charge-limit form: fetchBattLimit (read) / applyBattLimit (write), ported
// from test/chunk.test.js (see git show 8d5d790:test/chunk.test.js) when the
// form moved from the Config tab into this chunk. Same RPC shape
// (window.$rpcRequest("call", ["sid","mudimodem",method,args])) and same
// validation rules, just against `vm.bl`/`vm.blDraft`/`vm.blErr`/`vm.blBusy`
// instead of the old `battLimit`/`battLimitDraft`/`battLimitErr`/`battLimitBusy`.
// ---------------------------------------------------------------------------

const BL_OFF = {
  enabled: false, limit_gui: 80, limit_gauge: 71,
  active: false, active_gauge: null, capacity_gauge: 72, capacity_gui: 81,
  charger_online: false, available: true, error: null
};
const BL_ARMED = {
  enabled: true, limit_gui: 80, limit_gauge: 71,
  active: false, active_gauge: null, capacity_gauge: 72, capacity_gui: 81,
  charger_online: false, available: true, error: null
};
const BL_ACTIVE = {
  enabled: true, limit_gui: 80, limit_gauge: 71,
  active: true, active_gauge: 71, capacity_gauge: 68, capacity_gui: 77,
  charger_online: true, available: true, error: null
};
const BL_ENABLED_NOT_ACTIVE = {
  enabled: true, limit_gui: 80, limit_gauge: 71,
  active: false, active_gauge: null, capacity_gauge: 72, capacity_gui: 81,
  charger_online: true, available: true, error: null
};

test('fetchBattLimit stores the snapshot and seeds blDraft from limit_gui', async () => {
  const calls = stubRpc([Object.assign({}, BL_OFF)]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, {});
    await vm.fetchBattLimit();
    assert.equal(calls.length, 1, 'one get_battlimit call');
    assert.equal(calls[0].params[0], 'sid', 'literal sid placeholder');
    assert.equal(calls[0].params[1], 'mudimodem');
    assert.equal(calls[0].params[2], 'get_battlimit');
    assert.ok(vm.bl && vm.bl.limit_gui === 80, 'stores get_battlimit result');
    assert.equal(vm.blDraft, 80, 'seeds draft from limit_gui');
    assert.equal(vm.blErr, '');
  } finally { unstubRpc(); }
});

test('fetchBattLimit: a null response is stored as null, not left stuck on a stale value', async () => {
  const calls = stubRpc([null]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_ACTIVE) });
    await vm.fetchBattLimit();
    assert.equal(vm.bl, null, 'a null get_battlimit reply clears any stale snapshot');
  } finally { unstubRpc(); }
});

test('fetchBattLimit: a rejection surfaces as blErr, not an eternal Loading', async () => {
  const calls = stubRpc([Object.assign(new Error('rpc down'), { type: 'timeout' })]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, {});
    await vm.fetchBattLimit();
    assert.equal(vm.bl, null, 'bl stays null on rejection');
    assert.ok(vm.blErr, 'blErr set from the rejection');
    assert.match(vm.blErr, /timeout|rpc down|request failed/);
    // renderLimitCard directly - isolates the charge-limit card from the
    // chart's own loading state, which is unrelated to this behaviour.
    const txt = textOf(vm.renderLimitCard(h));
    assert.match(txt, /Battery charge limit/, 'card still present');
    assert.match(txt, /timeout|rpc down|request failed/, 'error text surfaced in the card');
    assert.doesNotMatch(txt, /Loading…$/, 'not stuck on the bare Loading placeholder');
  } finally { unstubRpc(); }
});

test('applyBattLimit: rejects limit_gui outside 20–100 without making an RPC call', async () => {
  const calls = stubRpc([]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 5 });
    vm.applyBattLimit({ limit_gui: 5 });
    assert.equal(calls.length, 0, 'no RPC on invalid input - the guard runs before any network call');
    assert.match(vm.blErr, /20–100/, 'validation error message');
  } finally { unstubRpc(); }
});

test('applyBattLimit: rejects a GUI value that maps below gauge 50, without making an RPC call', async () => {
  const calls = stubRpc([]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 40 });
    vm.applyBattLimit({ limit_gui: 40 });
    assert.equal(calls.length, 0, 'no RPC when the gauge floor rejects the target');
    assert.match(vm.blErr, /too low|50% gauge/i, 'gauge-floor message');
  } finally { unstubRpc(); }
});

test('applyBattLimit: toggling enabled posts set_battlimit and refreshes state', async () => {
  const calls = stubRpc([Object.assign({}, BL_ARMED)]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 80 });
    await vm.applyBattLimit({ enabled: true });
    assert.equal(calls.length, 1, 'one set_battlimit call');
    assert.equal(calls[0].params[2], 'set_battlimit');
    assert.deepEqual(calls[0].params[3], { enabled: true, limit_gui: 80 });
    assert.equal(vm.bl.enabled, true, 'state updated from the response');
    assert.equal(vm.blBusy, false);
  } finally { unstubRpc(); }
});

test('applyBattLimit: an incomplete error response keeps the prior bl snapshot', async () => {
  const prior = Object.assign({}, BL_OFF);
  const calls = stubRpc([{ error: 'tool failed' }]);   // no available / limit_gui
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: prior, blDraft: 80 });
    await vm.applyBattLimit({ enabled: true });
    assert.equal(calls.length, 1, 'set_battlimit called');
    assert.equal(vm.bl, prior, 'snapshot object not overwritten by an incomplete response');
    assert.equal(vm.bl.enabled, false, 'prior enabled preserved');
    assert.match(vm.blErr, /tool failed/, 'error from the response is shown');
    assert.equal(vm.blBusy, false);
  } finally { unstubRpc(); }
});

test('mounted() fetches get_battlimit up front, alongside the history load', async () => {
  const calls = stubRpc([Object.assign({}, BL_OFF)]);
  let vm;
  try {
    const c = loadChunk();
    vm = makeVm(c, {});
    vm.fetchHistory = function () {};   // isolate: history has its own test coverage above
    c.mounted.call(vm);
    await Promise.resolve(); await Promise.resolve();
    const blCalls = calls.filter((x) => x.params && x.params[2] === 'get_battlimit');
    assert.equal(blCalls.length, 1, 'get_battlimit called once on mount');
    assert.ok(vm.bl && vm.bl.limit_gui === 80, 'stores the result');
  } finally {
    if (vm && vm.poll) clearInterval(vm.poll);
    unstubRpc();
  }
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

test('the status row reports the blocked state in words, and does not contradict the limit card', () => {
  const c = loadChunk();
  const now = Date.now();
  // The live box, 2026-07-28: the limiter is active and holding at the target,
  // and the charger says Full/Trickle *because of that*. The limit card says
  // "Active"; the status row beside it must not say "Full".
  const samples = seed(now, 10, 20000, () => ({
    online: 1, cur: 0, status: 'Full', ctype: 'Trickle', cap: 71, lim: 1, lim_gauge: 71 }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, loading: false,
    bl: { available: true, enabled: true, limit_gui: 80, limit_gauge: 71,
      active: true, active_gauge: 71, charger_online: true,
      gui_m: 13867, gui_b: 189300 }
  });
  const out = textOf(render(vm, c));
  assert.ok(out.includes('Charge blocked (limit)'),
    'an actively-limited battery must be shown as limited - that is the feature');
  assert.ok(out.includes('Active ·'), 'the limit card still reports Active');
  assert.ok(!out.includes('Full'),
    'the status row must not call the limiter\'s own signature a full battery');
});

test('the status row reports a genuinely full battery as "Full", not "Charge blocked"', () => {
  const c = loadChunk();
  const now = Date.now();
  // Same charger strings as the test above, but no limiter running.
  const samples = seed(now, 10, 20000, () => ({
    online: 1, cur: 0, status: 'Full', ctype: 'Trickle', cap: 86, lim: 0, lim_gauge: null }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, loading: false,
    bl: { available: true, enabled: false, limit_gui: 80, gui_m: 13867, gui_b: 189300 }
  });
  const out = textOf(render(vm, c));
  // No separator between adjacent stat nodes in this fake render harness
  // (e.g. "...°CTempFullState80..."), so there's no word boundary to anchor
  // on either side of "Full" - a plain substring check is what the rest of
  // this file already uses for the same reason (see the range-selector test).
  assert.ok(out.includes('Full'), 'a genuinely full battery must not be mislabeled as blocked');
  assert.ok(!out.includes('Charge blocked'), 'must not also claim the charge is blocked');
});

// ---------------------------------------------------------------------------
// Render budget. THE REGRESSION THIS GUARDS:
// yIn() used to resolve its lane domain itself, and domainFor() -> segments()
// -> winSamples() re-filters, re-maps, re-sorts and re-dedupes the entire
// retained sample array. Calling that per PLOTTED POINT made one 24 h render
// take 6.0 s (3,157 winSamples() calls, measured on this repo before the fix;
// 1.2 s at 6 h), and the chart re-renders on every 10 s poll AND every
// mousemove — i.e. the two widest ranges locked the tab up.
//
// The call-count assertion is the real guard: it is exact, machine-independent,
// and any reintroduction of per-point (or even per-lane) recomputation breaks
// it immediately. The wall-clock budget is the backstop for a slow algorithm
// that somehow keeps the call count down; it is set ~50x over the measured
// post-fix time (~12 ms here) and far under the 1.2-6.0 s pathological figures,
// so it will not flake on a loaded CI box but cannot pass a quadratic render.
// ---------------------------------------------------------------------------
test('a 24 h render computes the sample window once, and stays inside its time budget', () => {
  const c = loadChunk();
  const now = Date.now();
  const N = 24 * 60 * 60 / 20;            // 4,320 — 24 h at the collector's 20 s
  // Varied values, so no lane collapses to a trivial domain and the min/max
  // downsampler has real work to do.
  const samples = seed(now, N, 20000, (i) => ({
    cap: 60 + (i % 30), volt: 3700 + (i % 400), temp: 28 + (i % 90) / 10,
    cur: (i % 40 === 0) ? 0 : (i % 3 ? -300 - (i % 200) : 900 + (i % 300)),
    online: (i % 7) ? 1 : 0, status: (i % 40 === 0) ? 'Full' : 'Charging',
    lim: (i % 40 === 0) ? 1 : 0, lim_gauge: 71
  }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, winW: 1440, loading: false,
    width: 900, cursor: -100,             // hover active: the mousemove path too
    bl: { available: true, enabled: true, limit_gui: 80, limit_gauge: 71,
      gui_m: 13867, gui_b: 189300 }
  });
  let calls = 0;
  const real = vm.winSamples;
  vm.winSamples = function () { calls++; return real.call(vm); };

  const t0 = process.hrtime.bigint();
  const tree = render(vm, c);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.equal(calls, 1,
    'the sample window must be computed ONCE per render and threaded down, '
    + 'not recomputed per lane or per point (got ' + calls + ' calls)');
  assert.ok(walk(tree).some((n) => n.tag === 'path'), 'actually drew the lanes');
  assert.ok(ms < 750, '24 h render took ' + ms.toFixed(0)
    + ' ms; budget is 750 ms (pre-fix this was ~6,000 ms)');
});

// ---------------------------------------------------------------------------
// Poll failures must be visible on the page — WITHOUT going through
// $rpcRequest, whose interceptor raises GL's global banner. rpcSilent keeps
// swallowing the rejection (required); the caller has to notice the `null`.
// ---------------------------------------------------------------------------
test('a failed first load says so, instead of promising samples "within 20 s"', async () => {
  stubRpc([Object.assign(new Error('ECONNREFUSED'), { type: 'timeout' })]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { loading: true });
    await vm.fetchHistory();
    assert.equal(vm.okCount, 0, 'nothing ever loaded');
    assert.equal(vm.failStreak, 1);
    assert.equal(vm.loading, false, 'must not hang on the loading placeholder');
    const out = textOf(render(vm, c));
    assert.match(out, /Couldn't reach the router/i);
    assert.doesNotMatch(out, /No battery history yet/i,
      'claiming the collector is about to produce samples is a falsehood when we never reached it');
  } finally { unstubRpc(); }
});

test('one dropped poll is not an alarm; three in a row surfaces an error', async () => {
  stubRpc([
    Object.assign(new Error('down'), { type: 'timeout' }),
    Object.assign(new Error('down'), { type: 'timeout' }),
    Object.assign(new Error('down'), { type: 'timeout' })
  ]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { loading: false });
    await vm.fetchHistory();
    assert.equal(vm.err, '', 'a single failed poll on a cellular link is normal');
    await vm.fetchHistory();
    assert.equal(vm.err, '', 'two is still not worth alarming about');
    await vm.fetchHistory();
    assert.ok(vm.err, 'a sustained failure must become visible');
    assert.match(vm.err, /reach the router/i);
    assert.equal(c.FAIL_NOTE_AFTER, 3, 'the threshold this test encodes');
  } finally { unstubRpc(); }
});

test('the error note reaches the page while a chart is already drawn', async () => {
  const now = Date.now();
  stubRpc([null, null, null]);   // result absent => rpcSilent resolves null
  try {
    const c = loadChunk();
    const vm = makeVm(c, {
      samples: seed(now, 30, 20000), serverNow: now, serverNowAt: now,
      loading: false, okCount: 1
    });
    await vm.fetchHistory({ since: now - 60000, merge: true });
    await vm.fetchHistory({ since: now - 60000, merge: true });
    await vm.fetchHistory({ since: now - 60000, merge: true });
    const out = textOf(render(vm, c));
    assert.match(out, /reach the router/i,
      'the stale-chart case must surface the error too, not only the empty state');
  } finally { unstubRpc(); }
});

test('a successful poll clears the failure note and the streak', async () => {
  const now = Date.now();
  stubRpc([
    Object.assign(new Error('down'), { type: 'timeout' }),
    Object.assign(new Error('down'), { type: 'timeout' }),
    Object.assign(new Error('down'), { type: 'timeout' }),
    { samples: seed(now, 3, 20000), now }
  ]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { loading: false });
    await vm.fetchHistory(); await vm.fetchHistory(); await vm.fetchHistory();
    assert.ok(vm.err, 'precondition: the note is up');
    await vm.fetchHistory();
    assert.equal(vm.err, '', 'recovery clears it');
    assert.equal(vm.failStreak, 0);
    assert.equal(vm.okCount, 1);
    const out = textOf(render(vm, c));
    assert.doesNotMatch(out, /reach the router/i);
  } finally { unstubRpc(); }
});

// ---------------------------------------------------------------------------
// renderLimitCard status branches — ported from the old Config-tab tests
// (git show 8d5d790:test/chunk.test.js), rendered against renderLimitCard
// directly instead of the old renderConfig, since the card has no Config-tab
// scaffolding around it here.
// ---------------------------------------------------------------------------

test('renderLimitCard: null bl shows Loading, not a blank card', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: null, blErr: '' });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /Battery charge limit/, 'card still present');
  assert.match(txt, /Loading/, 'loading placeholder');
});

test('renderLimitCard: unavailable shows a static note, no interactive controls', () => {
  const c = loadChunk();
  const vm = makeVm(c, {
    bl: { enabled: false, limit_gui: 80, limit_gauge: null, active: false, available: false,
      error: 'glbattlimit not installed', charger_online: false, capacity_gauge: null, capacity_gui: null }
  });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /not available/i, 'static unavailability note');
  assert.doesNotMatch(txt, /Limit charging/, 'no interactive toggle when the tool is unavailable');
});

test('renderLimitCard: shows the form fields once bl has loaded', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 80 });
  const tree = vm.renderLimitCard(h);
  const txt = textOf(tree);
  assert.match(txt, /Battery charge limit/, 'card title');
  assert.match(txt, /Limit charging/, 'toggle label');
  assert.match(txt, /% GL UI Reported Charge/, 'names the scale the target is set in');
  assert.match(txt, /71 % IC Reported Charge/, 'shows the IC-scale equivalent');
  // limit_gui is a slider VALUE (domProps), which this harness's textOf never
  // surfaces as text (it only walks .children) - assert on the actual node
  // instead of scraping for a "80" substring that could just as easily match
  // unrelated text.
  const slider = walk(tree).find((n) => n.data.attrs && n.data.attrs.type === 'range');
  assert.ok(slider, 'target slider renders');
  assert.equal(slider.data.domProps.value, 80, 'slider value seeded from blDraft/limit_gui');
});

// ---------------------------------------------------------------------------
// Target slider (spec: docs/superpowers/specs/2026-07-28-charge-limit-slider-design.md).
// The old number input accepted GUI 20-100 while the backend rejects anything
// below GUI 50 (glbattlimit's gauge>=50 floor), so ~30% of its range was dead.
// The slider makes that range unreachable rather than merely validated-against.
// ---------------------------------------------------------------------------

function sliderOf(vm) {
  return walk(vm.renderLimitCard(h)).find((n) => n.data.attrs && n.data.attrs.type === 'range');
}

test('target slider is bounded at the gauge>=50 floor, so a rejected value cannot be picked', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
  const s = sliderOf(vm);
  assert.ok(s, 'renders a range input, not a number input');
  assert.equal(s.data.attrs.min, 50, 'GUI 49 maps to gauge 49, which glbattlimit refuses');
  assert.equal(s.data.attrs.max, 100);
  assert.equal(s.data.attrs.step, 1);
});

test('dragging the slider updates the draft and makes NO rpc call', () => {
  const calls = stubRpc([]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
    // Each save spawns a process on the router; firing per drag-pixel would hammer it.
    sliderOf(vm).data.on.input({ target: { value: '65' } });
    assert.equal(vm.blDraft, 65, 'draft follows the thumb');
    assert.equal(calls.length, 0, 'no RPC while dragging');
  } finally { unstubRpc(); }
});

test('releasing the slider commits exactly one set_battlimit', async () => {
  const calls = stubRpc([Object.assign({}, BL_ARMED, { limit_gui: 65, limit_gauge: 61 })]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
    sliderOf(vm).data.on.input({ target: { value: '65' } });
    await sliderOf(vm).data.on.change();
    assert.equal(calls.length, 1, 'exactly one call on release');
    assert.equal(calls[0].params[2], 'set_battlimit');
    assert.deepEqual(calls[0].params[3], { enabled: true, limit_gui: 65 });
  } finally { unstubRpc(); }
});

test('the readout tracks the DRAFT, not the saved snapshot', () => {
  const c = loadChunk();
  // saved value is 80 (gauge 71); the user has dragged to 60 but not released.
  const vm = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 60 });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /60 % GL UI Reported Charge/, 'shows the dragged value, not the stored 80');
  assert.match(txt, /57 % IC Reported Charge/, 'IC estimate follows the draft (gaugeOf(60) === 57)');
  assert.doesNotMatch(txt, /71 % IC Reported Charge/,
    'must not show the stale saved IC value while dragging');
});

test('the slider is disabled when the limit is off or a save is in flight', () => {
  const c = loadChunk();
  const off = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 80 });
  assert.equal(sliderOf(off).data.attrs.disabled, true, 'disabled while the limit is off');
  const busy = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80, blBusy: true });
  assert.equal(sliderOf(busy).data.attrs.disabled, true, 'disabled while a save is in flight');
  const on = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
  assert.equal(sliderOf(on).data.attrs.disabled, false, 'enabled otherwise');
});

test('a stored limit below the slider floor clamps the thumb and saves nothing', async () => {
  // Only reachable by hand-editing /etc/mudimodem/battlimit.json, but the thumb
  // must not misrepresent what is stored - and rewriting the user's setting
  // just because the UI changed shape would be worse than a clamped thumb.
  const calls = stubRpc([Object.assign({}, BL_ARMED, { limit_gui: 30, limit_gauge: 35 })]);
  try {
    const c = loadChunk();
    const vm = makeVm(c, {});
    await vm.fetchBattLimit();
    assert.equal(vm.blDraft, 50, 'draft clamped up to the floor for display');
    assert.equal(calls.length, 1, 'the get_battlimit read only - no write');
    assert.equal(calls[0].params[2], 'get_battlimit');
  } finally { unstubRpc(); }
});

test('the charge-limit card credits ChiliApple in every state', () => {
  const c = loadChunk();
  const CREDIT = /Based on ChiliApple's battery control scripts/;
  const loaded = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
  assert.match(textOf(loaded.renderLimitCard(h)), CREDIT, 'shown with the form');
  // The attribution is owed whether or not the tool is present, so it must not
  // sit inside the branch that renders the form.
  const missing = makeVm(c, { bl: { available: false, error: 'glbattlimit not installed' } });
  assert.match(textOf(missing.renderLimitCard(h)), CREDIT, 'shown when the tool is unavailable');
  const loading = makeVm(c, { bl: null });
  assert.match(textOf(loading.renderLimitCard(h)), CREDIT, 'shown while still loading');
});

test('gaugeOf matches the backend integer formula at the boundaries', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: { gui_m: 13867, gui_b: 189300 } });
  assert.equal(vm.gaugeOf(50), 50, 'the floor maps exactly onto gauge 50');
  assert.equal(vm.gaugeOf(80), 71);
  assert.equal(vm.gaugeOf(100), 86, '100 % GUI is NOT a full cell - it is gauge 86');
  const noSnap = makeVm(c, { bl: null });
  assert.equal(noSnap.gaugeOf(80), 71, 'falls back to the module constants');
});

test('renderLimitCard status: Off when disabled', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_OFF), blDraft: 80 });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /Off/, 'Off status');
  assert.doesNotMatch(txt, /Active ·/, 'not Active');
  assert.doesNotMatch(txt, /Armed ·/, 'not Armed');
  assert.doesNotMatch(txt, /Enabled · not active/, 'not the enabled-not-active line');
});

test('renderLimitCard status: Armed when enabled and charger offline', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_ARMED), blDraft: 80 });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /Armed ·/, 'Armed status');
  assert.match(txt, /will apply when the charger connects/, 'explains the wait');
  assert.match(txt, /target 80%/, 'GUI target leads');
  assert.doesNotMatch(txt, /Active ·/, 'not Active');
  assert.doesNotMatch(txt, /Enabled · not active/, 'not the plugged-in stuck line');
});

test('renderLimitCard status: Enabled - not active when plugged in but not currently limiting', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_ENABLED_NOT_ACTIVE), blDraft: 80 });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /Enabled · not active/, 'honest stuck/failed-apply line');
  assert.doesNotMatch(txt, /Armed ·/, 'not Armed while charger is online');
  assert.doesNotMatch(txt, /Active ·/, 'not Active');
});

test('renderLimitCard status: Active when the limiter is actually holding charge off', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: Object.assign({}, BL_ACTIVE), blDraft: 80 });
  const txt = textOf(vm.renderLimitCard(h));
  assert.match(txt, /Active ·/, 'Active status');
  assert.match(txt, /target 80%/, 'GUI target leads the status line');
  assert.match(txt, /Low-level:.*71% IC/, 'gauge target demoted to the diagnostic line');
});

test('renderLimitCard: Charging stopped only when a fresh sample confirms 0 mA', () => {
  const c = loadChunk();
  const now = Date.now();
  // Watcher active + fresh sample with |cur|<=10 while plugged in.
  const samples = Object.freeze([
    { t: now - 10000, cap: 71, cur: 0, volt: 4040, temp: 32, online: 1,
      status: 'Full', ctype: 'Trickle', lim: 1, lim_gauge: 71 }
  ]);
  const vm = makeVm(c, {
    bl: Object.assign({}, BL_ACTIVE), blDraft: 80,
    samples: samples, serverNow: now, serverNowAt: now
  });
  assert.match(textOf(vm.renderLimitCard(h)), /Charging stopped/,
    'fresh zero-current sample while active means charging has stopped');

  // Stale sample (>30 s): do not claim "stopped" from ancient data.
  const stale = Object.freeze([
    { t: now - 60000, cap: 71, cur: 0, volt: 4040, temp: 32, online: 1,
      status: 'Full', ctype: 'Trickle', lim: 1, lim_gauge: 71 }
  ]);
  const vm2 = makeVm(c, {
    bl: Object.assign({}, BL_ACTIVE), blDraft: 80,
    samples: stale, serverNow: now, serverNowAt: now
  });
  assert.doesNotMatch(textOf(vm2.renderLimitCard(h)), /Charging stopped/,
    'a sample older than 30 s is not evidence of the present');
});

// ---------------------------------------------------------------------------
// Runtime / charge-time estimate (spec:
// docs/superpowers/specs/2026-07-28-battery-runtime-estimate-design.md).
//
// SoC-slope based, because the box exposes NO charge_full/energy_* node - the
// pack capacity in mAh does not exist anywhere on the device, so the obvious
// "remaining mAh / current mA" is impossible without inventing a figure.
// ---------------------------------------------------------------------------

// Build a decorated window the way winSamples() would: `capGui` present, `m`
// unused by the estimator, ascending by t. GUI = (gauge*13867 - 189300)/10000.
function estSeries(opts) {
  const o = Object.assign({ n: 60, stepMs: 20000, gaugeFrom: 71, gaugeTo: 65,
    online: 0, cur: -500, lim: 0, lim_gauge: null, status: 'Discharging' }, opts || {});
  const now = o.now || Date.now();
  const out = [];
  for (let i = 0; i < o.n; i++) {
    const f = o.n === 1 ? 0 : i / (o.n - 1);
    // integer gauge, as the hardware reports it (1 % quantisation is the point)
    const gauge = Math.round(o.gaugeFrom + (o.gaugeTo - o.gaugeFrom) * f);
    out.push({
      t: now - (o.n - 1 - i) * o.stepMs,
      cap: gauge, capGui: Math.round((gauge * 13867 - 189300) / 1000) / 10,
      volt: 4000, cur: o.cur, temp: 31, online: o.online,
      status: o.status, lim: o.lim, lim_gauge: o.lim_gauge
    });
  }
  return out;
}

test('estimate: a falling series yields a runtime to GUI 0', () => {
  const c = loadChunk();
  const vm = makeVm(c, { bl: { gui_m: 13867, gui_b: 189300 } });
  // 71 -> 65 gauge over 60 min == GUI 79.5 -> 71.2, i.e. 8.3 % per hour.
  const ss = estSeries({ n: 180, stepMs: 20000, gaugeFrom: 71, gaugeTo: 65 });
  const r = vm.runEstimate(ss, null);
  assert.equal(r.kind, 'down');
  assert.equal(r.targetPct, 0, 'extrapolates to GUI 0');
  assert.ok(r.minutes > 0, 'produces a runtime');
  // 71.2 % remaining at 8.3 %/h is about 8.5 h; allow a wide band, the point is
  // that it is hours and not minutes or days.
  assert.ok(r.minutes > 300 && r.minutes < 900, 'plausible runtime, got ' + r.minutes);
});

test('estimate: extrapolates to GUI 0, NOT to IC 0', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // Ends at gauge 20 == GUI 8.4. Extrapolating the IC value to 0 would claim
  // ~2.4x more runtime than the user's own "empty" allows.
  const ss = estSeries({ n: 180, stepMs: 20000, gaugeFrom: 26, gaugeTo: 20 });
  const r = vm.runEstimate(ss, null);
  assert.equal(r.kind, 'down');
  // GUI left is 8.4 at 8.3 %/h -> ~1 h. An IC-0 extrapolation would give ~2.4 h.
  assert.ok(r.minutes < 100, 'must not promise runtime below GUI 0, got ' + r.minutes);
});

test('estimate: charging targets the limit, not 100', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const ss = estSeries({ n: 180, gaugeFrom: 50, gaugeTo: 56, online: 1, cur: 900,
    lim: 1, lim_gauge: 71, status: 'Charging' });
  const r = vm.runEstimate(ss, { enabled: true, limit_gui: 80 });
  assert.equal(r.kind, 'up');
  assert.equal(r.targetPct, 80, 'target is the configured limit');
  assert.ok(r.minutes > 0);
});

test('estimate: charging with no limit targets 100', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const ss = estSeries({ n: 180, gaugeFrom: 50, gaugeTo: 56, online: 1, cur: 900,
    lim: 0, lim_gauge: null, status: 'Charging' });
  const r = vm.runEstimate(ss, { enabled: false, limit_gui: 80 });
  assert.equal(r.kind, 'up');
  assert.equal(r.targetPct, 100);
});

test('estimate: a limiter hold reports holding with NO countdown', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // Plugged, 0 mA, limiter running and at its target -> chargeState "blocked".
  const ss = estSeries({ n: 180, gaugeFrom: 71, gaugeTo: 71, online: 1, cur: 0,
    lim: 1, lim_gauge: 71, status: 'Full' });
  const r = vm.runEstimate(ss, { enabled: true, limit_gui: 80 });
  assert.equal(r.kind, 'hold');
  assert.equal(r.minutes, null,
    'the limiter resumes charging at a lower threshold, so a countdown here is a prediction the device will falsify');
});

test('estimate: a genuinely full battery reports full', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const ss = estSeries({ n: 180, gaugeFrom: 86, gaugeTo: 86, online: 1, cur: 0,
    lim: 0, lim_gauge: null, status: 'Full' });
  const r = vm.runEstimate(ss, { enabled: false });
  assert.equal(r.kind, 'full');
  assert.equal(r.minutes, null);
});

test('estimate: too little data yields no number rather than a guess', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // 4 minutes of history - under the 8 min span floor.
  const short = vm.runEstimate(estSeries({ n: 12, stepMs: 20000, gaugeFrom: 71, gaugeTo: 70 }), null);
  assert.equal(short.minutes, null, 'span below the floor -> no number');
  // Long enough, but only 1 % of movement - inside the quantisation error band.
  const flat = vm.runEstimate(estSeries({ n: 180, stepMs: 20000, gaugeFrom: 71, gaugeTo: 70 }), null);
  assert.equal(flat.minutes, null, 'delta below the floor -> no number');
  // And a dead-flat series must not divide by a zero slope.
  const still = vm.runEstimate(estSeries({ n: 180, gaugeFrom: 71, gaugeTo: 71 }), null);
  assert.equal(still.minutes, null);
  assert.ok(Number.isFinite(still.spanMin), 'still reports its span');
});

test('estimate: a direction change mid-window resets the basis', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const now = Date.now();
  // 60 min of charging, then 20 min of discharging. The runtime must be based
  // on the discharge only - averaging the two regimes is meaningless.
  const up = estSeries({ n: 180, gaugeFrom: 50, gaugeTo: 62, online: 1, cur: 900,
    lim: 0, status: 'Charging', now: now - 20 * 60000 });
  const down = estSeries({ n: 60, gaugeFrom: 62, gaugeTo: 58, online: 0, cur: -600,
    status: 'Discharging', now: now });
  const r = vm.runEstimate(up.concat(down), null);
  assert.equal(r.kind, 'down', 'direction comes from the newest samples');
  assert.ok(r.spanMin <= 21, 'basis is the discharge segment only, got ' + r.spanMin + ' min');
});

test('estimate: fmtEstimate never shows false precision', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.match(vm.fmtEstimate(35), /^~35 m$/, 'minutes under an hour');
  assert.match(vm.fmtEstimate(260), /^~4 h 20 m$/, 'hours and minutes');
  assert.match(vm.fmtEstimate(3000), /^> 2 d$/, 'beyond 48 h is not given a precise figure');
  assert.match(vm.fmtEstimate(37), /^~35 m$/, 'rounds to 5 min under 2 h');
});

test('estimate: renderEstimate shows the figure and its provenance', () => {
  const c = loadChunk();
  const ss = estSeries({ n: 180, stepMs: 20000, gaugeFrom: 71, gaugeTo: 65 });
  const vm = makeVm(c, { samples: ss, bl: null });
  const txt = textOf(vm.renderEstimate(h, ss));
  assert.match(txt, /remaining/, 'names what the figure means');
  assert.match(txt, /from the last \d+ min/, 'states its own provenance');
});

test('estimate: renderEstimate says Estimating rather than inventing a number', () => {
  const c = loadChunk();
  const ss = estSeries({ n: 12, stepMs: 20000, gaugeFrom: 71, gaugeTo: 70 });
  const vm = makeVm(c, { samples: ss, bl: null });
  const txt = textOf(vm.renderEstimate(h, ss));
  assert.match(txt, /Estimating/, 'no fabricated figure below the evidence threshold');
  assert.doesNotMatch(txt, /remaining/);
});

test('estimate: runEstimate takes the window as an argument (no requadratic)', () => {
  // The chart was quadratic because a per-point helper recomputed winSamples().
  // The estimator must never repeat that: it receives the window.
  const c = loadChunk();
  const ss = estSeries({ n: 180 });
  let calls = 0;
  const vm = makeVm(c, { samples: ss });
  const real = vm.winSamples;
  vm.winSamples = function () { calls++; return real.call(vm); };
  vm.runEstimate(ss, null);
  assert.equal(calls, 0, 'runEstimate must not recompute the sample window');
});

// ---------------------------------------------------------------------------
// 60 s average current. The instantaneous reading is nearly unreadable — over
// 40 min of real history it spanned 758 mA (stdev 139). A 60 s mean is only
// ~3 samples at the collector's 20 s cadence, but it cuts stdev to ~100.
// ---------------------------------------------------------------------------

test('avgCurrent averages only the trailing window', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const now = Date.now();
  const ss = [
    { t: now - 200000, cur: -100 },   // 200 s old: outside a 60 s window
    { t: now - 120000, cur: -100 },   // 120 s old: outside
    { t: now - 40000,  cur: -600 },   // inside
    { t: now - 20000,  cur: -400 },   // inside
    { t: now,          cur: -500 }    // inside
  ];
  assert.equal(vm.avgCurrent(ss, 60000), -500, 'mean of the three in-window samples');
});

test('avgCurrent anchors on the newest SAMPLE, not the browser clock', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  // The collector stalled an hour ago. The tile should average the last 60 s of
  // data that exists, not average an empty window because wall-clock moved on.
  const old = Date.now() - 3600000;
  const ss = [
    { t: old - 120000, cur: -100 },
    { t: old - 40000,  cur: -600 },
    { t: old,          cur: -400 }
  ];
  assert.equal(vm.avgCurrent(ss, 60000), -500, 'window is relative to the last sample');
});

test('avgCurrent ignores null readings and preserves sign', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const now = Date.now();
  const ss = [
    { t: now - 40000, cur: null },
    { t: now - 20000, cur: -800 },
    { t: now,         cur: -400 }
  ];
  assert.equal(vm.avgCurrent(ss, 60000), -600, 'a null reading is skipped, not counted as 0');
  const charging = [{ t: now - 20000, cur: 900 }, { t: now, cur: 1100 }];
  assert.equal(vm.avgCurrent(charging, 60000), 1000, 'positive (charging) sign preserved');
});

test('avgCurrent returns null when nothing usable is in the window', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  assert.equal(vm.avgCurrent([], 60000), null, 'empty window');
  const now = Date.now();
  assert.equal(vm.avgCurrent([{ t: now, cur: null }], 60000), null, 'all readings null');
});

test('the status row carries a 60 s average tile beside the instantaneous one', () => {
  const c = loadChunk();
  const now = Date.now();
  const ss = seed(now, 6, 20000, (i) => ({ cur: i < 3 ? -100 : -900 }));
  ss.forEach((s) => { s.capGui = 78.1; s.voltV = 4.01; });
  const vm = makeVm(c, { samples: ss, serverNow: now, serverNowAt: now, bl: {} });
  const txt = textOf(vm.renderStatusRow(h, ss));
  assert.match(txt, /Current 60 s avg/, 'the averaged tile is labelled as an average');
  assert.match(txt, /Current(?!\s*60)/, 'the instantaneous tile is still there');
});

test('avgCurrent takes the window as an argument (no requadratic)', () => {
  const c = loadChunk();
  const now = Date.now();
  const ss = [{ t: now, cur: -500 }];
  let calls = 0;
  const vm = makeVm(c, { samples: ss });
  const real = vm.winSamples;
  vm.winSamples = function () { calls++; return real.call(vm); };
  vm.avgCurrent(ss, 60000);
  assert.equal(calls, 0, 'avgCurrent must not recompute the sample window');
});

// ---------------------------------------------------------------------------
// Chart legibility. The axis labels and the hover readout shipped at 8.5–10
// viewBox units, which is ~8.5–10 CSS px (the viewBox width is the measured
// pixel width and preserveAspectRatio is "none", so the scale is ~1:1).
// ---------------------------------------------------------------------------

function lanesSvg(vm, ss) {
  return vm.renderLanes(h, ss);
}

test('no chart text is smaller than 10 units', () => {
  const c = loadChunk();
  const now = Date.now();
  const ss = seed(now, 60, 20000, (i) => ({ cap: 71 - Math.floor(i / 10), cur: -500 }))
    .map((s) => Object.assign(s, { capGui: 78.1, voltV: 4.01, m: 0 }));
  const vm = makeVm(c, { samples: ss, serverNow: now, serverNowAt: now, winW: 60,
    bl: { enabled: true, limit_gui: 80, gui_m: 13867, gui_b: 189300 }, cursor: -5 });
  const sizes = walk(lanesSvg(vm, vm.winSamples()))
    .filter((n) => n.tag === 'text' && n.data.attrs && n.data.attrs['font-size'] != null)
    .map((n) => Number(n.data.attrs['font-size']));
  assert.ok(sizes.length >= 5, 'found the chart text nodes, got ' + sizes.length);
  const tiny = sizes.filter((s) => s < 10);
  assert.deepEqual(tiny, [], 'every chart label is at least 10 units, got ' + JSON.stringify(sizes));
});

test('the hover readout fits inside the svg height', () => {
  const c = loadChunk();
  const now = Date.now();
  const ss = seed(now, 60, 20000, () => ({ cur: -500 }))
    .map((s) => Object.assign(s, { capGui: 78.1, voltV: 4.01, m: 0 }));
  const vm = makeVm(c, { samples: ss, serverNow: now, serverNowAt: now, winW: 60,
    bl: {}, cursor: -5 });
  const svg = lanesSvg(vm, vm.winSamples());
  const height = Number(svg.data.attrs.height);
  // Every text baseline, plus its descender, must sit inside the viewBox —
  // otherwise the readout is silently clipped at the bottom of the chart.
  walk(svg).filter((n) => n.tag === 'text' && n.data.attrs).forEach((n) => {
    const y = Number(n.data.attrs.y), fs = Number(n.data.attrs['font-size'] || 10);
    assert.ok(y + fs * 0.3 <= height,
      'text at y=' + y + ' (size ' + fs + ') overflows svg height ' + height);
    assert.ok(y - fs >= 0, 'text at y=' + y + ' (size ' + fs + ') clips off the top');
  });
});

// ---------------------------------------------------------------------------
// Chart hybrid craft (2026-07-29) — jayck88 hover/range presentation on our
// data plane. Spec: docs/superpowers/specs/2026-07-29-battery-chart-hybrid-design.md
// ---------------------------------------------------------------------------

test('chartBounds stretches when retained history is shorter than the selected range', () => {
  const c = loadChunk();
  const now = Date.now();
  // Only ~2 h of samples, but the user picked 24 h.
  const samples = seed(now, 10, 12 * 60 * 1000, () => ({}));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 1440 });
  const ss = vm.winSamples();
  const b = vm.chartBounds(ss);
  assert.ok(b.end - b.start < 3 * 3600 * 1000,
    'plot span collapses to the real data, not a padded empty 24 h');
  assert.ok(b.start >= samples[0].t - 1, 'start is the first sample');
});

test('chartBounds keeps the full window when history already fills it', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 20, 60000, () => ({})); // 20 min at 1 min step
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15 });
  const ss = vm.winSamples();
  const b = vm.chartBounds(ss);
  // Requested 15 m; samples extend further back so the first in-window sample
  // is near the window edge — start should stay near now-15m.
  assert.ok(Math.abs((b.end - b.start) - 15 * 60000) < 60000,
    'full window is not artificially shortened when data fills it');
});

test('observedRange reports min-max for a metric in the window', () => {
  const c = loadChunk();
  const vm = makeVm(c, {});
  const ss = [
    { cur: -100 }, { cur: -400 }, { cur: -200 }, { cur: null }
  ];
  assert.equal(vm.observedRange(ss, 'cur', 0), '-400–-100');
  assert.equal(vm.observedRange([{ cur: 5 }, { cur: 5 }], 'cur', 0), '5');
  assert.equal(vm.observedRange([], 'cur', 0), '—');
});

test('nearestSampleIn binary-searches by time and matches the closest sample', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 50, 20000, () => ({}));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 60 });
  const ss = vm.winSamples();
  // Cursor ~ halfway through the window.
  const mid = ss[Math.floor(ss.length / 2)];
  const m = vm.mOf(mid.t);
  const near = vm.nearestSampleIn(ss, m);
  assert.equal(near.t, mid.t, 'nearest is the sample at the cursor time');
  // Slightly past the midpoint should still land on a neighbour.
  const near2 = vm.nearestSampleIn(ss, m + 0.05);
  assert.ok(near2 && Math.abs(near2.t - mid.t) <= 20000 * 2);
});

test('lane labels carry the focus value and the observed range', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 30, 20000, (i) => ({
    cap: 70 + (i % 5), cur: -300 - i, temp: 30 + (i % 3)
  }));
  const vm = makeVm(c, { samples, serverNow: now, serverNowAt: now, winW: 15, bl: {} });
  const txt = textOf(lanesSvg(vm, vm.winSamples()));
  // Observed range fragment uses an en-dash between two numbers.
  assert.match(txt, /\d+(?:\.\d+)?–\d+(?:\.\d+)?/, 'observed min–max appears in a lane label');
  assert.match(txt, /mA/, 'current unit is present');
});

test('hover readout includes relative time and sample dots land on the svg', () => {
  const c = loadChunk();
  const now = Date.now();
  const samples = seed(now, 40, 20000, () => ({ cur: -500, cap: 71 }))
    .map((s) => Object.assign(s, { capGui: 78.1, voltV: 4.01 }));
  const vm = makeVm(c, {
    samples, serverNow: now, serverNowAt: now, winW: 15, bl: {}, cursor: -5
  });
  const ss = vm.winSamples();
  const svg = lanesSvg(vm, ss);
  const txt = textOf(svg);
  assert.match(txt, /\d+\s*(s|min|h)\s+ago/, 'relative-time fragment in the hover readout');
  const dots = walk(svg).filter((n) => n.tag === 'circle');
  assert.ok(dots.length >= 1, 'at least one sample dot is drawn while hovering');
});

test('fetchHistory ignores a stale reply after a newer request supersedes it', async () => {
  const c = loadChunk();
  let resolveA, resolveB;
  const pA = new Promise((r) => { resolveA = r; });
  const pB = new Promise((r) => { resolveB = r; });
  let n = 0;
  global.window = {
    $getCookie: () => 'tok',
    addEventListener() {}, removeEventListener() {},
    $axios: {
      post() {
        const i = n++;
        return (i === 0 ? pA : pB).then((res) => ({ data: { result: res } }));
      }
    }
  };
  try {
    const now = Date.now();
    const vm = makeVm(c, { live: false, loading: true, samples: [], lastT: 0 });
    // Start a 15 m load, then supersede it with a 24 h load before it returns.
    const a = vm.fetchHistory({ window: 15 });
    const b = vm.fetchHistory({ window: 1440 });
    // Stale 15 m reply arrives first with a short series.
    resolveA({
      now, samples: seed(now, 3, 20000, () => ({ cap: 50 }))
    });
    await a;
    // Samples must still be empty — the stale reply was dropped.
    assert.equal(vm.samples.length, 0, 'stale reply must not paint the short window');
    // Live 24 h reply lands with a longer series.
    resolveB({
      now, samples: seed(now, 8, 20000, () => ({ cap: 70 }))
    });
    await b;
    assert.equal(vm.samples.length, 8, 'the latest request wins');
    assert.ok(Object.isFrozen(vm.samples), 'successful history is frozen for Vue 2');
  } finally {
    delete global.window;
  }
});
