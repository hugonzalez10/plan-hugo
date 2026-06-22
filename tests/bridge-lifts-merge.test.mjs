// mergeBridge (lado app): la sección `lifts` aterriza en day.lifts[] y los campos nuevos de
// workouts (maxHr numérico, hrZonePct string) sobreviven el round-trip. Solo plumbing a estado
// (no hay UI); confirma que el dato llega y que hrZonePct NO se castea a 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridge } from '../src/sync.mjs';

const baseState = () => ({ days: {}, weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] } });
const baseBridge = (over = {}) => ({
  meals: [], workouts: [], weights: [], water: [], health: [], checks: [],
  energy: [], lifts: [], routine: null, exercise_videos: {}, ...over,
});

test('importa series de lifts a day.lifts[] en su fecha', () => {
  const bridge = baseBridge({ lifts: [
    { id: 'l1', date: '2026-06-22', exercise: 'Sentadilla', setNumber: 1, weightKg: 100, reps: 5, rpe: 8, isPR: true, bilateralFlag: false },
    { id: 'l2', date: '2026-06-22', exercise: 'Sentadilla', setNumber: 2, weightKg: 100, reps: 4 },
  ] });
  const { state, added } = mergeBridge(baseState(), bridge);
  assert.equal(added.lifts, 2);
  const lifts = state.days['2026-06-22'].lifts;
  assert.equal(lifts.length, 2);
  assert.equal(lifts[0].exercise, 'Sentadilla');
  assert.equal(lifts[0].setNumber, 1);
  assert.equal(lifts[0].weightKg, 100);
  assert.equal(lifts[0].isPR, true);
  assert.equal(lifts[0].bilateralFlag, false);
  assert.ok(state.bridge.importedIds.includes('l1'));
});

test('dedup de lifts por id: re-sync no duplica', () => {
  const bridge = baseBridge({ lifts: [{ id: 'l1', date: '2026-06-22', exercise: 'Sentadilla', setNumber: 1, weightKg: 100 }] });
  const r1 = mergeBridge(baseState(), bridge);
  const r2 = mergeBridge(r1.state, bridge);
  assert.equal(r2.state.days['2026-06-22'].lifts.length, 1, 'duplicó al re-sincronizar');
});

test('lifts no toca extras ni exercise del día', () => {
  const bridge = baseBridge({
    workouts: [{ id: 'w1', date: '2026-06-22', name: 'Pierna', kcal: 400 }],
    lifts: [{ id: 'l1', date: '2026-06-22', exercise: 'Sentadilla', setNumber: 1, weightKg: 100 }],
  });
  const { state } = mergeBridge(baseState(), bridge);
  const d = state.days['2026-06-22'];
  assert.equal(d.lifts.length, 1);
  assert.equal(d.exercise.length, 1);
  assert.equal(d.extras.length, 0);
});

test('hrZonePct sobrevive como string; maxHr como número', () => {
  const bridge = baseBridge({ workouts: [
    { id: 'w1', date: '2026-06-22', name: 'Pierna', kcal: 400, avgHr: 140, maxHr: 178, hrZonePct: '86/12/1/0/0', rpe: 8, volumeKg: 5400 },
  ] });
  const { state } = mergeBridge(baseState(), bridge);
  const ex = state.days['2026-06-22'].exercise[0];
  assert.equal(ex.hrZonePct, '86/12/1/0/0', 'hrZonePct se castó a número o se perdió');
  assert.equal(ex.maxHr, 178);
  assert.equal(ex.avgHr, 140);
  assert.equal(ex.volumeKg, 5400);
});

test('lift sin id se descarta en la frontera (validate) y se cuenta en dropped', () => {
  const bridge = baseBridge({ lifts: [{ date: '2026-06-22', exercise: 'Sentadilla', setNumber: 1 }] });
  const { state, dropped } = mergeBridge(baseState(), bridge);
  assert.equal(dropped.lifts, 1);
  assert.ok(!state.days['2026-06-22'] || (state.days['2026-06-22'].lifts || []).length === 0);
});
