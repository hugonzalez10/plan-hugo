// Auto-clasificación server-side del `type` de un entreno cuando la skill lo omite. Sin esto,
// la pestaña Ejercicios no sabía si la sesión era fuerza o cardio (salían como "•"). El .gs
// infiere el tipo desde el nombre en CUALQUIER camino de escritura (op:add / ?w=add / unión).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

const emptyBridge = () => ({
  meals: [], weights: [], workouts: [], checks: [], water: [], energy: [], health: [], lifts: [],
});

test('_inferWorkoutType: clasifica fuerza vs cardio por el nombre', () => {
  const f = gs._inferWorkoutType;
  assert.equal(f('Dia 1 Pierna - Fuerza (Speediance)'), 'strength');
  assert.equal(f('Fuerza tradicional'), 'strength');
  assert.equal(f('Empuje fuerza + cardio (Speediance + trote)'), 'strength'); // fuerza gana
  assert.equal(f('Dia 4 Traccion - Fuerza'), 'strength');
  assert.equal(f('Bicicleta fija'), 'cardio');
  assert.equal(f('Cardio Z2 - Bici fija (cierre)'), 'cardio');
  assert.equal(f('Trote Z2 caminadora'), 'cardio');
  assert.equal(f('Remo en interiores (Z2)'), 'cardio');
  assert.equal(f('Caminatas Pucón'), 'cardio');
  assert.equal(f('Algo rarísimo sin pistas'), ''); // no inventa
});

test('op:add sin type → el servidor lo clasifica antes de guardar', () => {
  const b = emptyBridge();
  gs._mergeInto(b, { op: 'add', section: 'workouts', today: '2026-06-26',
    entries: [{ name: 'Caminatas Pucón', kcal: 107, minutes: 18 }] });
  assert.equal(b.workouts.length, 1);
  assert.equal(b.workouts[0].type, 'cardio');
});

test('no pisa un type ya provisto por la entrada', () => {
  const b = emptyBridge();
  // nombre "fuerza" pero la entrada ya trae type cardio → se respeta
  gs._contentUnion(b, 'workouts', [{ name: 'Fuerza con bici de cierre', type: 'cardio', date: '2026-06-26', kcal: 200 }], true);
  assert.equal(b.workouts[0].type, 'cardio');
});

test('nombre sin pistas → queda sin type (no se fuerza)', () => {
  const b = emptyBridge();
  gs._contentUnion(b, 'workouts', [{ name: 'xyz', date: '2026-06-26', kcal: 100 }], true);
  assert.ok(!b.workouts[0].type);
});
