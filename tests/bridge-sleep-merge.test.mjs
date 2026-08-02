// mergeBridge (lado app): la sección `sleep` aterriza en state.sleep (array plano, como
// weights), con dedup por id y por (date|kind) —el eco del empuje app→bridge vuelve con id
// de servidor distinto y no debe duplicar—. La frontera (validate) exige id/date/asleepMin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridge } from '../src/sync.mjs';
import { normalizeBridgePayload } from '../src/validate.mjs';

const baseState = (over = {}) => ({ days: {}, weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] }, ...over });
const baseBridge = (over = {}) => ({
  meals: [], workouts: [], weights: [], water: [], health: [], checks: [],
  energy: [], lifts: [], sleep: [], routine: null, exercise_videos: {}, ...over,
});

test('importa entradas sleep a state.sleep ordenadas por fecha', () => {
  const bridge = baseBridge({ sleep: [
    { id: 's2', date: '2026-07-19', kind: 'daily', asleepMin: 387, inBedMin: 402, bedtime: '23:42', wakeTime: '06:09', source: 'apple-health', ts: 1789000000000 },
    { id: 's1', date: '2026-07-18', kind: 'daily', asleepMin: 350 },
    { id: 's3', date: '2026-07-19', kind: 'weekly', asleepMin: 371, periodStart: '2026-07-13', periodEnd: '2026-07-19' },
  ] });
  const { state, added } = mergeBridge(baseState(), bridge);
  assert.equal(added.sleep, 3);
  assert.equal(state.sleep.length, 3);
  assert.deepEqual(state.sleep.map((s) => s.date), ['2026-07-18', '2026-07-19', '2026-07-19']);
  const night = state.sleep.find((s) => s.id === 's2');
  assert.equal(night.asleepMin, 387);
  assert.equal(night.inBedMin, 402);
  assert.equal(night.bedtime, '23:42');
  const wk = state.sleep.find((s) => s.kind === 'weekly');
  assert.equal(wk.periodStart, '2026-07-13');
  assert.ok(state.bridge.importedIds.includes('s2'));
});

test('re-sync idempotente: mismo bridge dos veces no duplica ni cuenta added', () => {
  const bridge = baseBridge({ sleep: [{ id: 's1', date: '2026-07-19', kind: 'daily', asleepMin: 380 }] });
  const r1 = mergeBridge(baseState(), bridge);
  const r2 = mergeBridge(r1.state, bridge);
  assert.equal(r2.state.sleep.length, 1);
  assert.equal(r2.added.sleep, 0, 'un sync sin novedades no debe contar imports');
});

test('eco del empuje app→bridge: id distinto pero misma (fecha|kind) → mergea, no duplica', () => {
  const local = baseState({ sleep: [{ id: 'local-1', date: '2026-07-19', kind: 'daily', asleepMin: 380, source: 'app', ts: 1 }] });
  const bridge = baseBridge({ sleep: [{ id: 'srv-9', date: '2026-07-19', kind: 'daily', asleepMin: 387, bedtime: '23:42', source: 'app' }] });
  const { state } = mergeBridge(local, bridge);
  assert.equal(state.sleep.length, 1, 'el eco duplicó la noche');
  assert.equal(state.sleep[0].asleepMin, 387, 'el bridge es autoridad para corregir la fila');
  assert.equal(state.sleep[0].bedtime, '23:42');
  assert.ok(state.bridge.importedIds.includes('srv-9'));
});

test('removedBridgeIds frena la reimportación de una entrada borrada a propósito', () => {
  const local = baseState({ bridge: { importedIds: [], removedBridgeIds: ['s1'] } });
  const bridge = baseBridge({ sleep: [{ id: 's1', date: '2026-07-19', kind: 'daily', asleepMin: 380 }] });
  const { state } = mergeBridge(local, bridge);
  assert.equal((state.sleep || []).length, 0);
});

test('una daily implausible (>14h) no entra al estado', () => {
  const bridge = baseBridge({ sleep: [{ id: 's1', date: '2026-07-19', kind: 'daily', asleepMin: 15 * 60 }] });
  const { state } = mergeBridge(baseState(), bridge);
  assert.equal((state.sleep || []).length, 0);
});

test('frontera (validate): sin id, sin date o sin asleepMin numérico → descartado y contado', () => {
  const { payload, dropped } = normalizeBridgePayload(baseBridge({ sleep: [
    { date: '2026-07-19', kind: 'daily', asleepMin: 380 },            // sin id
    { id: 's2', kind: 'daily', asleepMin: 380 },                      // sin date
    { id: 's3', date: '2026-07-19', kind: 'daily' },                  // sin asleepMin
    { id: 's4', date: '2026-07-19', kind: 'daily', asleepMin: 'abc' },// asleepMin basura
    { id: 's5', date: '2026-07-19', kind: 'daily', asleepMin: '387' },// string numérico: ok
  ] }));
  assert.equal(dropped.sleep, 4);
  assert.equal(payload.sleep.length, 1);
  assert.equal(payload.sleep[0].asleepMin, 387, 'debía coaccionar el string a número');
});

test('bridge viejo sin sección sleep: no rompe y deja state.sleep utilizable', () => {
  const legacy = { meals: [], workouts: [], weights: [], water: [], health: [], checks: [], energy: [], lifts: [] };
  const { state } = mergeBridge(baseState(), legacy);
  assert.ok(Array.isArray(state.sleep));
  assert.equal(state.sleep.length, 0);
});
