const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = path.join(__dirname, '..', 'src', 'views', 'mudimodem-speedtest.js');

function loadChunk() {
  const module = { exports: {} };
  const source = fs.readFileSync(SRC, 'utf8');
  return eval(source);
}

function h(tag, data, children) {
  if (Array.isArray(data) || typeof data === 'string') { children = data; data = {}; }
  return { tag, data: data || {}, children };
}
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}
function walk(node, out) {
  out = out || [];
  if (node == null || typeof node === 'string') return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  out.push(node);
  walk(node.children, out);
  return out;
}
function makeVm(component) {
  const vm = Object.assign({}, component.data());
  for (const [k, fn] of Object.entries(component.methods || {})) vm[k] = fn.bind(vm);
  for (const [k, fn] of Object.entries(component.computed || {})) {
    Object.defineProperty(vm, k, { get: fn.bind(vm), configurable: true });
  }
  return vm;
}
// One reply queue for both transports: $rpcRequest (user-initiated) and the
// silent $axios POST (background status poll). `transport` says which one a
// call went through; `params` has the same [sid, object, method, args] shape.
function stubRpc(replies) {
  const calls = [];
  global.window = {
    $rpcRequest(method, params, opts) {
      calls.push({ method, params, opts, transport: 'rpcRequest' });
      const r = replies.shift();
      return (r instanceof Error) ? Promise.reject(r) : Promise.resolve(r);
    },
    $getCookie: () => 'tok',
    $axios: { post(url, body, opts) {
      calls.push({ method: body.method, params: body.params, opts, transport: 'silent' });
      const r = replies.shift();
      return (r instanceof Error) ? Promise.reject(r) : Promise.resolve({ data: { result: r } });
    } }
  };
  return calls;
}
function unstubRpc() { delete global.window; }

test('chunk evals to a render-only component named mudimodem-speedtest', () => {
  const c = loadChunk();
  assert.strictEqual(c.name, 'mudimodem-speedtest');
  assert.strictEqual(c.template, undefined, 'template: is forbidden');
  assert.strictEqual(typeof c.render, 'function');
});

test('renders an honest empty state before data arrives', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = true;
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /Run speed test/);
  assert.match(txt, /Loading history/);
});

test('runTest(): calls run_speedtest with the picked interface, sets running state', async () => {
  const calls = stubRpc([{ started: true }]);
  let vm;
  try {
    vm = makeVm(loadChunk());
    vm.runIface = 'wired';
    vm.runTest();
    assert.strictEqual(vm.status.running, true, 'optimistic running state set immediately');
    await Promise.resolve(); await Promise.resolve();
    assert.deepStrictEqual(calls[0].params, ['sid', 'mudimodem', 'run_speedtest', { iface: 'wired' }]);
  } finally {
    if (vm && vm.statusPoll) clearInterval(vm.statusPoll);
    unstubRpc();
  }
});

test('runTest(): iface_down surfaces as a friendly error, not a crash', async () => {
  const calls = stubRpc([{ error: 'iface_down', iface: 'wired' }]);
  try {
    const vm = makeVm(loadChunk());
    vm.runIface = 'wired';
    vm.runTest();
    await Promise.resolve(); await Promise.resolve();
    assert.strictEqual(vm.status.running, false);
    assert.match(vm.status.message, /Wired WAN is not connected/);
  } finally { unstubRpc(); calls; }
});

test('runTest(): no-ops while a test is already running', () => {
  const vm = makeVm(loadChunk());
  vm.status = { running: true, phase: 'download' };
  const calls = stubRpc([]);
  try {
    vm.runTest();
    assert.strictEqual(calls.length, 0, 'must not start a second test');
  } finally { unstubRpc(); }
});

test('fetchStatus(): a finished test stops polling and refreshes history', async () => {
  const calls = stubRpc([{ running: false, phase: 'done' }, { results: [{ t: 1, down_mbps: 1 }] }]);
  try {
    const vm = makeVm(loadChunk());
    vm.statusPoll = setInterval(() => {}, 100000);
    vm.fetchStatus(false);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.strictEqual(vm.statusPoll, null, 'poll cleared once the test is done');
    assert.strictEqual(calls[1].params[2], 'get_speedtest_history', 'history refetched after completion');
  } finally { unstubRpc(); }
});

test('fetchStatus(): captures the finished result into lastResult', async () => {
  const result = { t: 5000, iface: 'cellular', down_mbps: 42, up_mbps: 9, latency_ms: 55, jitter_ms: 3 };
  const calls = stubRpc([{ running: false, phase: 'done', result: result }, { results: [] }]);
  try {
    const vm = makeVm(loadChunk());
    vm.statusPoll = setInterval(() => {}, 100000);
    vm.fetchStatus(false);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.deepStrictEqual(vm.lastResult, result);
  } finally { unstubRpc(); }
});

test('fetchStatus(): a stale "done" status already on disk at mount does not populate lastResult', async () => {
  const calls = stubRpc([{ running: false, phase: 'done', result: { t: 1, iface: 'cellular', down_mbps: 1 } }]);
  try {
    const vm = makeVm(loadChunk());
    vm.fetchStatus(true);   // mount-time call; statusPoll is null, nothing was being watched
    await Promise.resolve(); await Promise.resolve();
    assert.strictEqual(vm.lastResult, null);
  } finally { unstubRpc(); calls; }
});

test('runTest(): a new run does not clear the previous lastResult until it completes', async () => {
  const vm = makeVm(loadChunk());
  vm.lastResult = { t: 1, iface: 'cellular', down_mbps: 10 };
  const calls = stubRpc([{ started: true }]);
  try {
    vm.runIface = 'cellular';
    vm.runTest();
    assert.deepStrictEqual(vm.lastResult, { t: 1, iface: 'cellular', down_mbps: 10 }, 'old result stays until replaced');
    await Promise.resolve(); await Promise.resolve();
  } finally {
    if (vm.statusPoll) clearInterval(vm.statusPoll);
    unstubRpc(); calls;
  }
});

test('setSchedule(): posts enabled+interval, then re-fetches', async () => {
  const calls = stubRpc([{ ok: true }, { enabled: true, interval_seconds: 3600, last_run: 0 }]);
  try {
    const vm = makeVm(loadChunk());
    vm.setSchedule(true, 3600);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.deepStrictEqual(calls[0].params, ['sid', 'mudimodem', 'set_speedtest_schedule',
      { enabled: true, interval_seconds: 3600 }]);
    assert.strictEqual(calls[1].params[2], 'get_speedtest_schedule');
  } finally { unstubRpc(); }
});

test('clearHistory(): empties the local results list', async () => {
  const calls = stubRpc([{ ok: true }]);
  try {
    const vm = makeVm(loadChunk());
    vm.results = [{ t: 1 }];
    vm.clearHistory();
    await Promise.resolve(); await Promise.resolve();
    assert.deepStrictEqual(vm.results, []);
    assert.strictEqual(calls[0].params[2], 'clear_speedtest_history');
  } finally { unstubRpc(); }
});

test('filtered: only shows results matching filterIface', () => {
  const vm = makeVm(loadChunk());
  vm.results = [{ t: 1, iface: 'cellular' }, { t: 2, iface: 'wired' }];
  vm.filterIface = 'cellular';
  assert.strictEqual(vm.filtered.length, 1);
  assert.strictEqual(vm.filtered[0].t, 1);
});

test('interface dropdown marks a down interface as not connected', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.ifaces = { cellular: { device: 'rmnet_data0', up: true }, wired: { device: null, up: false } };
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /Wired WAN \(not connected\)/);
});

test('ifacesErr renders as a visible error instead of failing silently', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.ifacesErr = 'timeout';
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /Couldn't check interfaces: timeout/);
});

test('renderLatestResult: absent until a result exists', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  const txt = textOf(c.render.call(vm, h));
  assert.doesNotMatch(txt, /Latest result/);
});

test('renderLatestResult: shows headline numbers + detail rows for the just-finished test', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  vm.lastResult = { t: 2000, iface: 'cellular', down_mbps: 55, up_mbps: 12, latency_ms: 58, jitter_ms: 4,
    carrier: 'T-Mobile', slot: 1, band: 71, mode: 'NR5G-SA FDD', cell_id: 'ABC', rsrp: -95, sinr: 9, rsrq: -10 };
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /Latest result/);
  assert.match(txt, /Cellular/);
  assert.match(txt, /55/);
  assert.match(txt, /12/);
  assert.match(txt, /58/);
  assert.match(txt, /T-Mobile/);
  assert.match(txt, /n71/);
  assert.match(txt, /-95 dBm/);
});

test('renderLatestResult: null fields render as an honest em-dash placeholder', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  vm.lastResult = { t: 1000, iface: 'wired', down_mbps: 500, up_mbps: 100, latency_ms: 8, jitter_ms: 1 };
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /Wired WAN/);
  assert.match(txt, /—/, 'missing carrier/band/cell/rsrp/sinr/rsrq render as em dash');
});

test('renderLatestResult: Down headline uses --primary, Up headline uses --success', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  vm.lastResult = { t: 2000, iface: 'cellular', down_mbps: 55, up_mbps: 12, latency_ms: 58, jitter_ms: 4 };
  const nodes = walk(c.render.call(vm, h)).filter((n) => n.data && n.data.staticClass === 'v');
  assert.strictEqual(nodes.length, 3, 'down, up, and latency headline spans');
  assert.strictEqual(nodes[0].data.style && nodes[0].data.style.color, 'var(--primary)', 'down uses --primary');
  assert.strictEqual(nodes[1].data.style && nodes[1].data.style.color, 'var(--success)', 'up uses --success');
  assert.ok(!nodes[2].data.style || nodes[2].data.style.color !== 'var(--primary)',
    'latency stays neutral, not colored like a direction');
});

test('ifaceLabel: an unmatched/missing iface never renders the literal string "undefined"', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  vm.lastResult = { t: 1000, down_mbps: 10, up_mbps: 2, latency_ms: 20, jitter_ms: 1 }; // no iface
  const txt = textOf(c.render.call(vm, h));
  assert.doesNotMatch(txt, /undefined/);
});

test('renderLatestResult: card sits between the controls card and the History card', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.resultsLoading = false;
  vm.lastResult = { t: 1000, iface: 'cellular', down_mbps: 10, up_mbps: 2, latency_ms: 20, jitter_ms: 1 };
  const txt = textOf(c.render.call(vm, h));
  const speedtestIdx = txt.indexOf('Speedtest');
  const latestIdx = txt.indexOf('Latest result');
  const historyIdx = txt.indexOf('History');
  assert.ok(speedtestIdx >= 0 && latestIdx > speedtestIdx, 'Latest result comes after the page header');
  assert.ok(historyIdx > latestIdx, 'History still comes after Latest result');
});

const RESULTS = [
  { t: 1000, iface: 'cellular', down_mbps: 40, up_mbps: 10, latency_ms: 60, jitter_ms: 5,
    carrier: 'T-Mobile', slot: 1, band: 71, mode: 'NR5G-SA FDD', cell_id: 'ABC', rsrp: -98, sinr: 8, rsrq: -11 },
  { t: 2000, iface: 'cellular', down_mbps: 55, up_mbps: 12, latency_ms: 58, jitter_ms: 4,
    carrier: 'T-Mobile', slot: 1, band: 71, mode: 'NR5G-SA FDD', cell_id: 'ABC', rsrp: -95, sinr: 9, rsrq: -10 },
  { t: 3000, iface: 'wired', down_mbps: 500, up_mbps: 100, latency_ms: 8, jitter_ms: 1 }
];

test('renderGraph: draws a line for cellular results only when filtered', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = RESULTS;
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  const svg = walk(c.render.call(vm, h)).find((n) => n.tag === 'svg');
  assert.ok(svg, 'graph renders an svg once results exist');
  const paths = walk(svg).filter((n) => n.tag === 'path');
  assert.ok(paths.length >= 2, 'at least a download and upload line');
});

test('renderGraph: hovering picks the nearest result and shows a full snapshot popover', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = RESULTS;
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  vm.width = 400;
  vm.cursor = 1;   // simulate onMove having picked index 1
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /55 Mbps/);
  assert.match(txt, /12 Mbps/);
  assert.match(txt, /58 ms/);
  assert.match(txt, /T-Mobile/);
  assert.match(txt, /n71/);
  assert.match(txt, /-95 dBm/);
});

test('renderGraph: clicking pins the cursor; clicking again unpins', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = RESULTS;
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  vm.width = 400;
  const graphDiv = walk(c.render.call(vm, h)).find((n) => n.data.staticClass === 'mms-graph');
  assert.ok(graphDiv.data.on && graphDiv.data.on.click, 'graph wires a click handler');
  graphDiv.data.on.click({ clientX: 0, currentTarget: null });
  assert.notStrictEqual(vm.pinned, null, 'click pins a cursor position');
  const pinnedAt = vm.pinned;
  graphDiv.data.on.click({ clientX: 0, currentTarget: null });
  assert.strictEqual(vm.pinned, null, 'second click unpins');
  pinnedAt;
});

test('renderGraph: empty-for-this-interface state is honest, no crash', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = [RESULTS[2]];        // only a wired result
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  const txt = textOf(c.render.call(vm, h));
  assert.match(txt, /No results yet for this interface/);
});

test('renderGraph: skips circles when down_mbps or up_mbps is null (honest gaps)', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  // Create results where index 1 has down_mbps: null (simulating a partial result).
  // We should get 2*(results.length) circles total if all were present, but only 2*3-1=5 because one is missing.
  vm.results = [
    { t: 1000, iface: 'cellular', down_mbps: 40, up_mbps: 10, latency_ms: 60 },
    { t: 2000, iface: 'cellular', down_mbps: null, up_mbps: 12, latency_ms: 58 },  // down is null
    { t: 3000, iface: 'cellular', down_mbps: 55, up_mbps: null, latency_ms: 62 }   // up is null
  ];
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  const svg = walk(c.render.call(vm, h)).find((n) => n.tag === 'svg');
  const circles = walk(svg).filter((n) => n.tag === 'circle');
  // With 3 results, we'd have 6 circles if all were present.
  // Result 1: down_mbps null -> skip down circle, keep up -> 1 circle
  // Result 2: up_mbps null -> keep down, skip up -> 1 circle
  // Result 3: both present -> 2 circles
  // Total: 4 circles (not 6)
  assert.strictEqual(circles.length, 4, 'must skip circles for null values; found ' + circles.length);
});

test('renderGraph: x positions are evenly spaced by index, not proportional to elapsed time', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  // A burst of three tests seconds apart, then one nearly a day later -- a
  // time-proportional axis would squash the first three into a sliver.
  vm.results = [
    { t: 1000, iface: 'cellular', down_mbps: 10, up_mbps: 2, latency_ms: 20 },
    { t: 2000, iface: 'cellular', down_mbps: 20, up_mbps: 4, latency_ms: 22 },
    { t: 3000, iface: 'cellular', down_mbps: 30, up_mbps: 6, latency_ms: 24 },
    { t: 86403000, iface: 'cellular', down_mbps: 40, up_mbps: 8, latency_ms: 26 }
  ];
  vm.filterIface = 'cellular';
  vm.resultsLoading = false;
  vm.width = 400;
  const svg = walk(c.render.call(vm, h)).find((n) => n.tag === 'svg');
  const downCircles = walk(svg).filter((n) => n.tag === 'circle' && n.data.attrs.fill === 'var(--primary)');
  assert.strictEqual(downCircles.length, 4);
  const xs = downCircles.map((n) => Number(n.data.attrs.cx));
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  gaps.forEach((g) => assert.ok(Math.abs(g - gaps[0]) < 0.01, 'gaps between consecutive points must be equal: ' + gaps));
});

test('the chunk never issues raw AT and never calls tracking/console RPC objects', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.doesNotMatch(src, /get_result_AT|modem\.CPU\.AT|at_console/);
});


// ---- 2.x review fixes (2026-10-28) ----
const tick = () => new Promise((r) => setImmediate(r));

test('Band row: the prefix follows the CARRIER — an NSA LTE anchor on B2 is "B2"', () => {
  const c = loadChunk();
  const band = (r) => {
    const vm = makeVm(c);
    vm.resultsLoading = false;
    vm.lastResult = Object.assign({ t: 1000, iface: 'cellular', down_mbps: 1, up_mbps: 1, latency_ms: 1 }, r);
    const rows = walk(c.render.call(vm, h)).filter((n) => n.data && n.data.staticClass === 'mms-tip-row');
    const row = rows.find((n) => textOf(n.children[0]) === 'Band');
    return textOf(row.children[1]);
  };
  assert.strictEqual(band({ band: 2, mode: 'NR5G-NSA', pcc_rat: 'LTE' }), 'B2', 'new results: pcc_rat');
  assert.strictEqual(band({ band: 2, mode: 'NR5G-NSA', signals: [{ rat: 'LTE', band: 2 }] }), 'B2',
    'old results: signals[0].rat');
  assert.strictEqual(band({ band: 71, mode: 'NR5G-SA FDD' }), 'n71', 'oldest: mode');
  assert.strictEqual(band({ band: 66, mode: 'LTE' }), 'B66');
});

test('the status poll goes through the silent transport; the run stays on $rpcRequest', async () => {
  const calls = stubRpc([{ started: true }, { running: true, phase: 'upload', iface: 'cellular' }]);
  let vm;
  try {
    vm = makeVm(loadChunk());
    await vm.runTest();
    assert.strictEqual(calls[0].transport, 'rpcRequest', 'user-initiated run: $rpcRequest');
    assert.ok(vm.statusPoll, 'polling');
    await vm.fetchStatus(false);
    assert.strictEqual(calls[1].params[2], 'get_speedtest_status');
    assert.strictEqual(calls[1].transport, 'silent', 'background poll: never GL\'s banner');
    assert.strictEqual(vm.status.phase, 'upload');
  } finally { if (vm && vm.statusPoll) clearInterval(vm.statusPoll); unstubRpc(); }
});

test('a failed status poll is silent and changes nothing; one poll in flight at most', async () => {
  const calls = stubRpc([new Error('network down')]);
  try {
    const vm = makeVm(loadChunk());
    vm.status = { running: true, phase: 'download' };
    const a = vm.fetchStatus(false);
    vm.fetchStatus(false);                     // the next 1 Hz tick while the first is in flight
    assert.strictEqual(calls.length, 1, 'no stacked requests on a slow link');
    await a;
    assert.deepStrictEqual(vm.status, { running: true, phase: 'download' });
  } finally { unstubRpc(); }
});

test('a run resolving after the tab is destroyed starts no orphan poll', async () => {
  const c = loadChunk();
  stubRpc([{ started: true }]);
  try {
    const vm = makeVm(c);
    const p = vm.runTest();
    c.beforeDestroy.call(vm);                  // tab switch before the reply lands
    await p;
    assert.strictEqual(vm.statusPoll, null, 'no 1 Hz interval left behind');
  } finally { unstubRpc(); }
  stubRpc([{ running: true, phase: 'download', iface: 'cellular' }]);
  try {
    const vm = makeVm(c);
    const p = vm.fetchStatus(true);            // mount-time check
    c.beforeDestroy.call(vm);
    await p;
    assert.strictEqual(vm.statusPoll, null, 'mount-time status check: no poll either');
  } finally { unstubRpc(); }
});

test('a terminal error status (no message, dead run) stops polling and is shown', async () => {
  const c = loadChunk();
  stubRpc([{ running: false, phase: 'error', pid: 4242, started: 1700000000 }, { results: [] }]);
  try {
    const vm = makeVm(c);
    vm.resultsLoading = false;
    vm.statusPoll = setInterval(() => {}, 100000);
    await vm.fetchStatus(false);
    assert.strictEqual(vm.statusPoll, null, 'poll stopped');
    assert.match(textOf(c.render.call(vm, h)), /stopped without a result/, 'an honest error, not an empty span');
  } finally { unstubRpc(); }
  stubRpc([{ running: true, phase: 'error', message: 'download failed' }, { results: [] }]);
  try {
    const vm = makeVm(c);
    vm.statusPoll = setInterval(() => {}, 100000);
    await vm.fetchStatus(false);
    assert.strictEqual(vm.statusPoll, null, 'phase error is terminal whatever `running` says');
    assert.strictEqual(vm.status.running, false);
    assert.match(textOf(c.render.call(vm, h)), /download failed/);
  } finally { unstubRpc(); }
});

function scheduleCheckbox(c, vm) {
  return walk(c.render.call(vm, h)).find((n) => n.tag === 'input' && n.data.attrs && n.data.attrs.type === 'checkbox');
}

test('schedule save: a resolved {error} is a refusal — shown, and the checkbox is put back', async () => {
  const c = loadChunk();
  const calls = stubRpc([{ error: 'cannot write schedule config' }]);
  try {
    const vm = makeVm(c);
    vm.schedule = { enabled: false, interval_seconds: 21600, last_run: 0 };
    const el = { checked: true };              // the user ticked it
    scheduleCheckbox(c, vm).data.on.change({ target: el });
    await tick(); await tick();
    assert.strictEqual(calls.length, 1, 'no re-read after a refusal');
    assert.strictEqual(vm.schedule.enabled, false);
    assert.strictEqual(el.checked, false, 'the box is back to the real (off) state');
    assert.match(textOf(c.render.call(vm, h)), /Couldn't save the schedule: cannot write schedule config/);
  } finally { unstubRpc(); }
});

test('schedule save: a rejection is shown too, and the interval select is put back', async () => {
  const c = loadChunk();
  stubRpc([new Error('timeout')]);
  try {
    const vm = makeVm(c);
    vm.schedule = { enabled: true, interval_seconds: 21600, last_run: 0 };
    const sel = walk(c.render.call(vm, h)).find((n) => n.tag === 'select' && n.data.domProps
      && n.data.domProps.value === 21600);
    const el = { value: '3600' };
    sel.data.on.change({ target: el });
    await tick(); await tick();
    assert.strictEqual(el.value, '21600', 'the select shows the interval actually in force');
    assert.match(textOf(c.render.call(vm, h)), /Couldn't save the schedule: timeout/);
  } finally { unstubRpc(); }
});

test('schedule save: success re-reads and leaves the control on the saved state', async () => {
  const c = loadChunk();
  stubRpc([{ ok: true, enabled: true, interval_seconds: 3600 }, { enabled: true, interval_seconds: 3600, last_run: 0 }]);
  try {
    const vm = makeVm(c);
    vm.schedule = { enabled: false, interval_seconds: 3600, last_run: 0 };
    vm.scheduleErr = 'old failure';
    const el = { checked: true };
    scheduleCheckbox(c, vm).data.on.change({ target: el });
    await tick(); await tick(); await tick();
    assert.strictEqual(vm.schedule.enabled, true);
    assert.strictEqual(el.checked, true);
    assert.strictEqual(vm.scheduleErr, '', 'a good save clears the old error');
  } finally { unstubRpc(); }
});

const TWO_SIMS = [
  { t: 1000, iface: 'cellular', slot: 1, carrier: 'T-Mobile', down_mbps: 40, up_mbps: 10, latency_ms: 60 },
  { t: 2000, iface: 'cellular', slot: 1, carrier: 'T-Mobile', down_mbps: 45, up_mbps: 11, latency_ms: 58 },
  { t: 3000, iface: 'cellular', slot: 2, carrier: 'AT&T', down_mbps: 90, up_mbps: 20, latency_ms: 40 },
  { t: 4000, iface: 'cellular', slot: 2, carrier: 'AT&T', down_mbps: 95, up_mbps: 21, latency_ms: 42 },
  { t: 5000, iface: 'wired', slot: 1, carrier: 'T-Mobile', down_mbps: 500, up_mbps: 100, latency_ms: 8 }
];

test('graph: two SIMs are never one line — it breaks at the SIM change and labels each stretch', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = TWO_SIMS; vm.filterIface = 'cellular'; vm.resultsLoading = false; vm.width = 400;
  const svg = walk(c.render.call(vm, h)).find((n) => n.tag === 'svg');
  const paths = walk(svg).filter((n) => n.tag === 'path').map((n) => n.data.attrs.d);
  assert.strictEqual(paths.length, 3, 'down, up, latency');
  paths.forEach((d) => assert.strictEqual((d.match(/M/g) || []).length, 2, 'one segment per SIM: ' + d));
  const txt = textOf(svg);
  assert.match(txt, /SIM 1 · T-Mobile/);
  assert.match(txt, /SIM 2 · AT&T/);
});

test('graph: a SIM selector appears when the cellular history spans two SIMs, and filters', () => {
  const c = loadChunk();
  const vm = makeVm(c);
  vm.results = TWO_SIMS; vm.filterIface = 'cellular'; vm.resultsLoading = false;
  const sel = walk(c.render.call(vm, h)).find((n) => n.tag === 'select' && n.data.staticClass === 'mms-slotsel');
  assert.ok(sel, 'selector rendered');
  assert.match(textOf(sel), /All SIMs.*SIM 1 · T-Mobile.*SIM 2 · AT&T/);
  sel.data.on.change({ target: { value: '2' } });
  assert.deepStrictEqual(vm.filtered.map((r) => r.t), [3000, 4000], 'SIM 2 only');
  vm.filterIface = 'wired';
  assert.deepStrictEqual(vm.filtered.map((r) => r.t), [5000], 'wired ignores the SIM filter');
  assert.ok(!walk(c.render.call(vm, h)).some((n) => n.data && n.data.staticClass === 'mms-slotsel'),
    'no SIM selector for wired (a stale snapshot slot is not the wired link)');
  vm.filterIface = 'cellular';
  vm.results = TWO_SIMS.filter((r) => r.slot === 1);
  assert.strictEqual(vm.filtered.length, 2, 'a vanished SIM falls back to all, not to nothing');
});
