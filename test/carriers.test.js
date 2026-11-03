// One radio picture, every surface: the strip, Tracking (readout, band lane, CSV, long-term), the
// Cell lock card, the confirm banner and the speed-test result must name the SAME carriers for the
// same collector sample — and every identifier on the Cell lock card must belong to the carrier
// its section names. The cases are test/fixtures/carriers.json (SA, LTE, LTE-CA, 5G NSA, NSA + CA,
// an anchor-only NSA sample); test/backend-lock.test.lua pins the plugin's lock target and
// summary lines to the same table, and tools/preview.js renders them (--scenario).
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'carriers.json'), 'utf8'));
const chunk = (n) => { const module = { exports: {} }; return eval(fs.readFileSync(path.join(ROOT, 'dist/views', n), 'utf8')); };
const MAIN = 'gl-sdk4-ui-mudimodem.common.js';
const TRACKING = 'gl-sdk4-ui-mudimodem-tracking.common.js';
const SPEED = 'gl-sdk4-ui-mudimodem-speedtest.common.js';

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
const MADE = [];
test.after(() => { for (const [c, vm] of MADE) if (c.beforeDestroy) c.beforeDestroy.call(vm); });
function makeVm(c, status, over) {
  const vm = Object.assign({}, c.data());
  MADE.push([c, vm]);
  vm.$store = { getters: { moduleStatus: (n) => (status && status[n]) || {} } };
  for (const [k, f] of Object.entries(c.methods || {})) vm[k] = f.bind(vm);
  for (const [k, f] of Object.entries(c.computed || {})) Object.defineProperty(vm, k, { get: f.bind(vm), configurable: true });
  return Object.assign(vm, over || {});
}

// The oracle, straight from the fixture's rows (not the page's code): each carrier's label.
const label = (g) => (/NR5G/.test(g.rat || '') ? 'n' : 'B') + g.band;
const bandSet = (text) => new Set(text.split(' + '));
const live = (sample) => Object.assign(JSON.parse(JSON.stringify(sample)), { t: Date.now() });
const status = (sample) => ({
  'cellular.modems_status': { modems: [{ bus: 'cpu', current_sim_slot: 1, slot_switch_status: 0,
    simcard: [{ slot: 1, status: 6, dial_status: 0, technology: 5 }] }] },
  'cellular.networks_info': { networks: [{ slot: 1, bus: 'cpu', carrier: sample.carrier, mcc: '310', mnc: '260' }] },
  'mudimodem.collect': sample
});
// get_lock's serving cell for the sample, as the plugin builds it (the Lua test pins the same).
function servingOf(c) {
  const e = c.expect;
  if (!e.lock) return null;
  const s = Object.assign({ source: 'collector' }, e.lock);
  if (e.anchor) s.anchor = e.anchor; else s.cell_id = c.sample.cell_id;
  return s;
}

test('fixtures: every case derives its bands from its rows (the table is self-consistent)', () => {
  for (const c of FIX.cases) {
    const seen = [];
    c.sample.signals.forEach((g) => { if (!seen.includes(label(g))) seen.push(label(g)); });
    assert.strictEqual(c.expect.bands, seen.join(' + '), c.name);
  }
});

test('kit/carriers.js: bands and the lock target, per case', async () => {
  const kit = await import(pathToFileURL(path.join(ROOT, 'src/web/kit/carriers.js')).href);
  for (const c of FIX.cases) {
    assert.strictEqual(kit.bandsText(c.sample), c.expect.bands, c.name + ' bands');
    assert.deepStrictEqual(kit.lockTarget(c.sample), c.expect.lock, c.name + ' lock target');
  }
  assert.strictEqual(kit.bandsText({}), '—');
  assert.strictEqual(kit.bandsText({ band: 2, pcc_rat: 'LTE', mode: 'NR5G-NSA' }), 'B2', 'no signals: the PCC aliases');
});

for (const c of FIX.cases) {
  test(`one picture everywhere — ${c.name}: ${c.expect.bands}`, () => {
    const want = c.expect.bands, sample = live(c.sample);
    const main = chunk(MAIN);

    // the strip
    const vm = makeVm(main, status(sample));
    assert.strictEqual(vm.bandLabel, want, 'strip Band');
    const facts = walk(main.render.call(vm, h)).filter((n) => n.data && n.data.staticClass === 'mm-facts')[0];
    assert.match(textOf(facts), new RegExp('Band' + want.replace(/\+/g, '\\+')), 'strip renders it');

    // the confirm banner's "now"
    assert.ok(vm.pictureText(vm.pictureOf(sample)).startsWith(want), 'banner picture');

    // Tracking: readout, band lane, CSV
    const tr = chunk(TRACKING);
    const tv = makeVm(tr, {}, { samples: [sample], events: [], winW: 60, pinnedT: sample.t });
    const tip = walk(tv.sliceReadout(h)).filter((n) => n.tag === 'tr');
    const bandRow = tip.find((r) => textOf(r.children[0]) === 'Band');
    assert.strictEqual(textOf(bandRow.children[1]).split(' · ')[0].trim(), want, 'Tracking readout');
    const readings = tip.find((r) => textOf(r.children[0]) === 'Readings');
    if (/NSA/.test(sample.rat) && sample.signals.length > 1)
      assert.strictEqual(textOf(readings.children[1]).trim(), 'LTE anchor ' + label(sample.signals[0]), 'NSA: whose readings');
    else assert.strictEqual(readings, undefined, 'no "Readings" row outside NSA');
    assert.deepStrictEqual(tv.busRuns('band').map((r) => r.v), [want], 'band lane');
    assert.strictEqual(tv.bandLabel(sample), want, 'CSV bands column');

    // long-term: the hour's line carries the carriers seen (src/lib/mudimodemd/summary.lua)
    const line = { t: Date.UTC(2026, 10, 2), secs: 3600, slot: 1, carrier: sample.carrier, rat: sample.pcc_rat,
      band: sample.band, cell: sample.cell_id, rsrp: [-100, -95, -90], sinr: [1, 5, 9],
      signals: sample.signals.map((g) => ({ rat: g.rat, band: g.band })) };
    tv.lt = { days: 7, lines: [line], loading: false, err: '', now: line.t + 3600000 };
    assert.ok(textOf(tr.render.call(tv, h)).includes(sample.carrier + ' · ' + want), 'long-term cell row');

    // the speed-test result (its radio snapshot = the collector sample's SNAP_KEYS)
    const sp = chunk(SPEED);
    const sv = makeVm(sp);
    sv.resultsLoading = false;
    sv.lastResult = Object.assign({ t: 1000, iface: 'cellular', down_mbps: 1, up_mbps: 1, latency_ms: 1 },
      ...['slot', 'carrier', 'band', 'mode', 'pcc_rat', 'cell_id', 'rsrp', 'sinr', 'rsrq', 'pci', 'tx_channel', 'signals']
        .map((k) => ({ [k]: sample[k] })));
    const srow = walk(sp.render.call(sv, h)).filter((n) => n.data && n.data.staticClass === 'mms-tip-row')
      .find((n) => textOf(n.children[0]) === 'Band');
    assert.strictEqual(textOf(srow.children[1]), want, 'speed-test Band');

    // Cell lock: the live cell is the one get_lock names
    const lv = makeVm(main, status(sample), { tab: 'lock' });
    const serving = servingOf(c);
    assert.deepStrictEqual(lv.liveCell, serving ? { slot: 1, pci: serving.pci, arfcn: serving.arfcn } : null, 'liveCell');
    if (!serving) return;   // get_lock reads QENG for this one (backend-lock.test.lua)
    lv.lockData = { lock: { l4g: { locked: false }, l5g: { locked: false }, save_ctrl: {} }, gl: { locked: false, tower: null },
                    serving, stale: false, meta: { slot: 1, sub_id: 1 } };
    assert.strictEqual(lv.servingMoved, null, 'the picture is the live cell');
    const secs = lv.currentCellSections();
    const cardBands = new Set();
    for (const sec of secs) {
      const get = (k) => (sec.rows.find((r) => r[0] === sec.id + ':' + k) || [])[2];
      if (sec.id === 'c') { bandSet(get('carriers')).forEach((b) => cardBands.add(b)); continue; }
      const band = get('band');
      cardBands.add(band);
      // every identifier in a section belongs to that section's carrier
      const row = sample.signals.find((g) => String(g.pci) === String(get('pci')) && String(g.earfcn) === String(get('arfcn')));
      assert.ok(row, `${sec.id}: PCI ${get('pci')} / channel ${get('arfcn')} name a carrier of the sample`);
      assert.strictEqual(band, label(row), `${sec.id}: Band is that carrier's`);
      assert.strictEqual(get('rsrp'), row.rsrp != null ? row.rsrp + ' dBm' : undefined, `${sec.id}: RSRP is that carrier's`);
      assert.strictEqual(get('sinr'), row.sinr != null ? row.sinr + ' dB' : undefined, `${sec.id}: SINR is that carrier's`);
      const cell = get('cell');
      if (cell !== undefined) {
        assert.strictEqual(row.role, 'PCC', `${sec.id}: the cell ID is the PCC's (the anchor under NSA)`);
        assert.strictEqual(cell, sample.cell_id);
      }
    }
    assert.deepStrictEqual([...cardBands].sort(), [...bandSet(want)].sort(), 'the card shows every band, no other');
    if (c.expect.anchor) {
      assert.deepStrictEqual(secs.filter((s) => s.id !== 'c').map((s) => s.title), ['5G leg · lock target', 'LTE anchor']);
      const txt = textOf(lv.renderCurrentCell(h));
      assert.match(txt, /5G leg · lock target/); assert.match(txt, /LTE anchor/);
    } else {
      assert.deepStrictEqual(secs.filter((s) => s.id !== 'c').map((s) => s.title), [''], 'one untitled section');
    }
  });
}
