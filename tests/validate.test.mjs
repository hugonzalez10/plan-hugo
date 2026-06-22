// Test del normalizador de la frontera del bridge (src/validate.mjs) + su integración con
// mergeBridge. Cubre la clase de bug que destapó el handoff: campos mal nombrados
// (calories/fats/kg) y basura (kcal:"abc") que antes entraba como 0 mudo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBridgePayload, hasDrops } from '../src/validate.mjs';
import { mergeBridge } from '../src/sync.mjs';

const baseBridge = (over = {}) => ({
  meals: [], workouts: [], weights: [], water: [], health: [], checks: [],
  energy: [], routine: null, exercise_videos: {}, ...over,
});
const baseState = () => ({ days: {}, weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] } });

test('remapea calories→kcal cuando falta el canónico (no se pierde la comida)', () => {
  const { payload, warnings, dropped } = normalizeBridgePayload(
    baseBridge({ meals: [{ id: 'm1', date: '2026-06-20', name: 'Pan', calories: 300, protein: 10 }] })
  );
  assert.equal(payload.meals.length, 1);
  assert.equal(payload.meals[0].kcal, 300, 'calories se remapeó a kcal');
  assert.equal(dropped.meals, 0);
  assert.ok(warnings.some((w) => w.includes("'calories'") && w.includes("'kcal'")));
});

test('remapea fats→fat y kg→weightKg', () => {
  const r = normalizeBridgePayload(baseBridge({
    meals: [{ id: 'm1', ts: Date.now(), name: 'X', kcal: 100, fats: 7 }],
    weights: [{ id: 'w1', date: '2026-06-20', kg: 90.5 }],
  }));
  assert.equal(r.payload.meals[0].fat, 7);
  assert.equal(r.payload.weights[0].weightKg, 90.5);
});

test('el canónico explícito gana sobre el alias (no lo pisa)', () => {
  const r = normalizeBridgePayload(baseBridge({ meals: [{ id: 'm1', date: '2026-06-20', name: 'X', kcal: 250, calories: 999 }] }));
  assert.equal(r.payload.meals[0].kcal, 250);
});

test('meal sin id se descarta y se cuenta', () => {
  const r = normalizeBridgePayload(baseBridge({ meals: [{ date: '2026-06-20', name: 'Anónima', kcal: 100 }] }));
  assert.equal(r.payload.meals.length, 0);
  assert.equal(r.dropped.meals, 1);
  assert.ok(hasDrops(r.dropped));
});

test('meal con kcal:"abc" (NaN) se descarta — NO entra como 0 mudo', () => {
  const r = normalizeBridgePayload(baseBridge({ meals: [{ id: 'm1', date: '2026-06-20', name: 'Basura', kcal: 'abc' }] }));
  assert.equal(r.payload.meals.length, 0);
  assert.equal(r.dropped.meals, 1);
});

test('meal sin date ni ts se descarta (no se planta en hoy)', () => {
  const r = normalizeBridgePayload(baseBridge({ meals: [{ id: 'm1', name: 'Huérfana', kcal: 100 }] }));
  assert.equal(r.payload.meals.length, 0);
  assert.equal(r.dropped.meals, 1);
});

test('weight con weightKg ilegible se descarta (no crea peso fantasma)', () => {
  const r = normalizeBridgePayload(baseBridge({ weights: [{ id: 'w1', date: '2026-06-20', weightKg: 'NaN-ish' }] }));
  assert.equal(r.payload.weights.length, 0);
  assert.equal(r.dropped.weights, 1);
});

test('payload limpio: sin descartes ni warnings, singletons intactos', () => {
  const clean = baseBridge({
    meals: [{ id: 'm1', date: '2026-06-20', name: 'Pollo', kcal: 400, protein: 40, mealSlot: 'almuerzo' }],
    routine: { updatedAt: '2026-06-01', x: 1 }, exercise_videos: { sentadilla: { youtube_id: 'abc' } },
  });
  const r = normalizeBridgePayload(clean);
  assert.equal(hasDrops(r.dropped), false);
  assert.equal(r.warnings.length, 0);
  assert.deepEqual(r.payload.routine, { updatedAt: '2026-06-01', x: 1 });
  assert.deepEqual(r.payload.exercise_videos, { sentadilla: { youtube_id: 'abc' } });
});

test('no muta la entrada', () => {
  const meals = [{ id: 'm1', date: '2026-06-20', name: 'X', calories: 100 }];
  const snapshot = JSON.parse(JSON.stringify(meals));
  normalizeBridgePayload(baseBridge({ meals }));
  assert.deepEqual(meals, snapshot);
});

// — Integración con mergeBridge —

test('mergeBridge remapea calories→kcal end-to-end (la comida cuenta sus kcal reales)', () => {
  const bridge = baseBridge({ meals: [{ id: 'm1', date: '2026-06-20', name: 'Pan', calories: 300, mealSlot: 'desayuno' }] });
  const { state, dropped } = mergeBridge(baseState(), bridge);
  const extras = state.days['2026-06-20'].extras;
  assert.equal(extras.length, 1);
  assert.equal(extras[0].kcal, 300, 'no entró como 0');
  assert.equal((dropped.meals || 0), 0);
});

test('mergeBridge descarta el meal basura y lo expone en state.bridge.lastSyncDropped', () => {
  const bridge = baseBridge({ meals: [
    { id: 'ok', date: '2026-06-20', name: 'Buena', kcal: 200, mealSlot: 'cena' },
    { id: 'bad', date: '2026-06-20', name: 'Mala', kcal: 'xxx', mealSlot: 'cena' },
  ] });
  const { state } = mergeBridge(baseState(), bridge);
  assert.equal(state.days['2026-06-20'].extras.length, 1);
  assert.equal(state.bridge.lastSyncDropped.meals, 1);
  assert.ok(Array.isArray(state.bridge.lastSyncWarnings));
});
