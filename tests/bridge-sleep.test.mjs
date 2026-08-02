// Sección `sleep` del bridge (.gs): dedup por date|kind SIN ventana de 5 min, merge de
// campos al re-registrar, poda con exención weekly/monthly, y el casteo de ?w=add.
// Carga las funciones puras del .gs sin desplegar. Espejo de bridge-lifts.test (sección nueva).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

test('sleep está en SECTIONS con retención estándar de log diario (30 días)', () => {
  assert.ok(gs.SECTIONS.includes('sleep'), 'sleep no está en SECTIONS');
  assert.equal(gs.RETENTION.sleep, 30);
});

test('_sig de sleep = fecha|kind (kind ausente = daily); kinds distintos no colisionan', () => {
  assert.equal(gs._sig('sleep', { date: '2026-07-19', kind: 'daily' }), '2026-07-19|daily');
  assert.equal(gs._sig('sleep', { date: '2026-07-19' }), '2026-07-19|daily', 'kind ausente debe firmar como daily');
  assert.notEqual(
    gs._sig('sleep', { date: '2026-07-19', kind: 'daily' }),
    gs._sig('sleep', { date: '2026-07-19', kind: 'weekly' }),
    'daily y weekly de la misma fecha deben ser filas distintas',
  );
});

test('_contentUnion: la misma noche re-registrada MERGEA (no duplica), aunque el ts difiera en horas', () => {
  const bridge = { sleep: [] };
  gs._contentUnion(bridge, 'sleep', [
    { date: '2026-07-19', kind: 'daily', asleepMin: 380, ts: 1789000000000 },
  ], true);
  assert.equal(bridge.sleep.length, 1);
  assert.ok(bridge.sleep[0].id, 'el servidor asigna id en op:add');

  // Corrección 6 horas después (fuera de la ventana de ±5 min de meals/workouts, que acá NO aplica)
  gs._contentUnion(bridge, 'sleep', [
    { date: '2026-07-19', kind: 'daily', asleepMin: 387, inBedMin: 402, bedtime: '23:42', wakeTime: '06:09', ts: 1789000000000 + 6 * 3600000 },
  ], true);
  assert.equal(bridge.sleep.length, 1, 'duplicó la misma noche en vez de mergear');
  assert.equal(bridge.sleep[0].asleepMin, 387);
  assert.equal(bridge.sleep[0].inBedMin, 402);
  assert.equal(bridge.sleep[0].bedtime, '23:42');
  assert.equal(bridge.sleep[0].wakeTime, '06:09');
});

test('_contentUnion: noches de fechas distintas y promedios weekly conviven', () => {
  const bridge = { sleep: [] };
  gs._contentUnion(bridge, 'sleep', [
    { date: '2026-07-18', kind: 'daily', asleepMin: 350 },
    { date: '2026-07-19', kind: 'daily', asleepMin: 400 },
    { date: '2026-07-19', kind: 'weekly', asleepMin: 372, periodStart: '2026-07-13', periodEnd: '2026-07-19' },
  ], true);
  assert.equal(bridge.sleep.length, 3);
  const wk = bridge.sleep.find((s) => s.kind === 'weekly');
  assert.equal(wk.periodStart, '2026-07-13');
});

test('_prune: poda las daily viejas pero EXIME weekly/monthly (histórico de tendencia)', () => {
  const mk = () => ({
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [], health: [], lifts: [],
    sleep: [
      { id: 's1', date: '2020-01-01', kind: 'daily', asleepMin: 380 },
      { id: 's2', date: '2020-01-05', kind: 'weekly', asleepMin: 370 },
      { id: 's3', date: '2020-01-31', kind: 'monthly', asleepMin: 365 },
    ],
    snapshots: {},
  });
  const bridge = mk();
  gs._prune(bridge);
  const ids = bridge.sleep.map((s) => s.id);
  assert.ok(!ids.includes('s1'), 'la daily vieja debía podarse');
  assert.ok(ids.includes('s2'), 'la weekly NO debía podarse');
  assert.ok(ids.includes('s3'), 'la monthly NO debía podarse');
});

test('_prune: una daily reciente NO se poda', () => {
  const today = new Date().toISOString().slice(0, 10);
  const bridge = {
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [], health: [], lifts: [],
    sleep: [{ id: 's1', date: today, kind: 'daily', asleepMin: 380 }],
    snapshots: {},
  };
  gs._prune(bridge);
  assert.equal(bridge.sleep.length, 1);
});

test('_entryFromParams: castea asleepMin/inBedMin a número y conserva kind/horas como string', () => {
  const e = gs._entryFromParams({
    section: 'sleep', date: '2026-07-19', kind: 'daily',
    asleepMin: '387', inBedMin: '402', bedtime: '23:42', wakeTime: '06:09', note: 'siesta no',
    source: 'apple-health',
  });
  assert.equal(e.asleepMin, 387);
  assert.equal(e.inBedMin, 402);
  assert.equal(e.kind, 'daily');
  assert.equal(e.bedtime, '23:42');
  assert.equal(e.wakeTime, '06:09');
  assert.equal(e.note, 'siesta no');
  assert.equal(e.source, 'apple-health');
});

test('_mergeInto op:add acepta sleep y estampa la fecha del día si falta', () => {
  const bridge = {
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [], health: [], lifts: [],
    sleep: [], snapshots: {}, config: {},
  };
  const added = gs._mergeInto(bridge, { op: 'add', section: 'sleep', entries: [{ kind: 'daily', asleepMin: 390 }] }, '2026-07-19');
  assert.equal(added, 1);
  assert.equal(bridge.sleep[0].date, '2026-07-19', 'debía estampar la fecha resuelta del día');
});

test('SLEEP_MERGE_FIELDS del .gs coincide con el esquema (sin date/kind, que son la firma)', () => {
  assert.deepEqual(
    [...gs.SLEEP_MERGE_FIELDS].sort(),
    ['asleepMin', 'bedtime', 'inBedMin', 'note', 'periodEnd', 'periodStart', 'source', 'wakeTime'].sort(),
  );
});
