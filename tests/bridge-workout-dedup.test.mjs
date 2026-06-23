// Dedup de entrenos en mergeBridge: el "eco" del empuje app→bridge volvía con id E HORA distintos y,
// como la ventana era ±5 min, duplicaba la sesión (bug visto 2026-06-22: "Dia 1 Pierna" ×2). Fix:
// dentro de un día, mismo nombre = mismo entreno (sin ventana) + un barrido que colapsa los dups ya plantados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridge } from '../src/sync.mjs';

const T_AM = new Date('2026-06-22T07:00:00').getTime();
const T_PM = new Date('2026-06-22T15:00:00').getTime(); // >5 min después → la ventana NO lo cubría

const baseBridge = (over = {}) => ({
  meals: [], workouts: [], weights: [], water: [], health: [], checks: [],
  energy: [], lifts: [], routine: null, exercise_videos: {}, ...over,
});
const dayWith = (exercise) => ({ eaten: {}, extras: [], exercise, water: { ml: 0 } });

test('el eco del bridge (mismo nombre, otra hora) NO se importa como duplicado', () => {
  const state = {
    days: { '2026-06-22': dayWith([{ id: 'local1', ts: T_AM, name: 'Dia 1 Pierna - Fuerza (Speediance)', kcal: 540 }]) },
    weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] },
  };
  const bridge = baseBridge({ workouts: [{ id: 'srv1', date: '2026-06-22', ts: T_PM, name: 'Dia 1 Pierna - Fuerza (Speediance)', kcal: 540 }] });
  const { state: out } = mergeBridge(state, bridge);
  assert.equal(out.days['2026-06-22'].exercise.length, 1, 'duplicó el entreno por la hora distinta');
});

test('colapsa un duplicado YA plantado, conservando el de id del bridge', () => {
  const state = {
    days: { '2026-06-22': dayWith([
      { id: 'local1', ts: T_AM, name: 'Dia 1 Pierna - Fuerza (Speediance)', kcal: 540 },
      { id: 'c1a1dd91', ts: T_PM, name: 'Dia 1 Pierna - Fuerza (Speediance)', kcal: 540, avgHr: 140 },
    ]) },
    weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] },
  };
  const bridge = baseBridge({ workouts: [{ id: 'c1a1dd91', date: '2026-06-22', ts: T_PM, name: 'Dia 1 Pierna - Fuerza (Speediance)', kcal: 540 }] });
  const { state: out } = mergeBridge(state, bridge);
  const ex = out.days['2026-06-22'].exercise;
  assert.equal(ex.length, 1, 'no colapsó el duplicado existente');
  assert.equal(ex[0].id, 'c1a1dd91', 'conservó el que NO tiene id del bridge');
});

test('NO toca entrenos legítimos distintos del mismo día (Speediance + Bicicleta)', () => {
  const state = {
    days: { '2026-06-22': dayWith([
      { id: 'a', ts: T_AM, name: 'Entrenamiento Speediance · 30 min', kcal: 300 },
      { id: 'b', ts: T_PM, name: 'Bicicleta · 20 min', kcal: 200 },
    ]) },
    weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] },
  };
  const bridge = baseBridge({ workouts: [
    { id: 'a', date: '2026-06-22', name: 'Entrenamiento Speediance · 30 min', kcal: 300 },
    { id: 'b', date: '2026-06-22', name: 'Bicicleta · 20 min', kcal: 200 },
  ] });
  const { state: out } = mergeBridge(state, bridge);
  assert.equal(out.days['2026-06-22'].exercise.length, 2, 'colapsó entrenos que NO eran duplicados');
});
