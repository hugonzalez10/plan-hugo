// Sección `lifts` (una SERIE de fuerza por fila) + campos nuevos de FC/volumen en workouts.
// Carga las funciones puras del .gs sin desplegar. Espejo de bridge-energy.test (sección nueva).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

test('lifts está en SECTIONS y nunca se poda (RETENTION 0)', () => {
  assert.ok(gs.SECTIONS.includes('lifts'), 'lifts no está en SECTIONS');
  assert.equal(gs.RETENTION.lifts, 0);
});

test('_sig de lifts = ejercicio|fecha|nº de serie (normaliza el nombre)', () => {
  assert.equal(
    gs._sig('lifts', { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 2 }),
    'sentadilla|2026-06-22|2',
  );
  // setNumber distinto → firma distinta (serie 1 vs 2 NO colisionan)
  assert.notEqual(
    gs._sig('lifts', { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 1 }),
    gs._sig('lifts', { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 2 }),
  );
});

test('_contentUnion: series distintas se agregan; misma serie se mergea (no duplica)', () => {
  const bridge = { lifts: [] };
  gs._contentUnion(bridge, 'lifts', [
    { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 1, weightKg: 100, reps: 5 },
    { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 2, weightKg: 100, reps: 4 },
  ], true);
  assert.equal(bridge.lifts.length, 2, 'series 1 y 2 deben ser filas distintas');
  assert.ok(bridge.lifts[0].id, 'el servidor asigna id en op:add');

  // Re-registrar la serie 2 con corrección (más reps + PR) → mergea sobre la existente
  gs._contentUnion(bridge, 'lifts', [
    { exercise: 'Sentadilla', date: '2026-06-22', setNumber: 2, weightKg: 102.5, reps: 5, isPR: true },
  ], true);
  assert.equal(bridge.lifts.length, 2, 'duplicó en vez de mergear la serie 2');
  const s2 = bridge.lifts.find((l) => l.setNumber === 2);
  assert.equal(s2.weightKg, 102.5);
  assert.equal(s2.reps, 5);
  assert.equal(s2.isPR, true);
});

test('_contentUnion: bilateralFlag se puede corregir a false (el guard deja escribir false)', () => {
  const bridge = { lifts: [] };
  gs._contentUnion(bridge, 'lifts', [{ exercise: 'Peso muerto', date: '2026-06-22', setNumber: 1, bilateralFlag: true }], true);
  gs._contentUnion(bridge, 'lifts', [{ exercise: 'Peso muerto', date: '2026-06-22', setNumber: 1, bilateralFlag: false }], true);
  assert.equal(bridge.lifts.length, 1);
  assert.equal(bridge.lifts[0].bilateralFlag, false);
});

test('_prune NO toca lifts aunque sea viejísima', () => {
  const bridge = {
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [], health: [],
    lifts: [{ id: 'l1', date: '2020-01-01', exercise: 'Sentadilla', setNumber: 1 }],
    snapshots: {},
  };
  gs._prune(bridge);
  assert.equal(bridge.lifts.length, 1, 'podó lifts (no debía)');
});

test('_entryFromParams arma una serie de fuerza (numéricos + booleanos)', () => {
  const e = gs._entryFromParams({
    section: 'lifts', date: '2026-06-22', exercise: 'Sentadilla',
    setNumber: '1', weightKg: '100', reps: '5', rpe: '8', isPR: 'true', bilateralFlag: 'false',
    source: 'skill-chat',
  });
  assert.equal(e.exercise, 'Sentadilla');
  assert.equal(e.setNumber, 1);   // numérico
  assert.equal(e.weightKg, 100);
  assert.equal(e.reps, 5);
  assert.equal(e.rpe, 8);
  assert.equal(e.isPR, true);     // booleano parseado
  assert.equal(e.bilateralFlag, false);
  assert.equal(e.source, 'skill-chat');
});

test('_entryFromParams captura los campos nuevos de workouts (avgHr/maxHr/hrZonePct/rpe/volumeKg)', () => {
  const e = gs._entryFromParams({
    section: 'workouts', date: '2026-06-22', name: 'Pierna', kcal: '400',
    avgHr: '140', maxHr: '178', hrZonePct: '86/12/1/0/0', rpe: '8', volumeKg: '5400',
  });
  assert.equal(e.avgHr, 140);
  assert.equal(e.maxHr, 178);
  assert.equal(e.hrZonePct, '86/12/1/0/0'); // string, NO casteado a número
  assert.equal(e.rpe, 8);
  assert.equal(e.volumeKg, 5400);
});

test('WORKOUT_MERGE_FIELDS incluye maxHr y hrZonePct (round-trip por el bridge)', () => {
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('maxHr'));
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('hrZonePct'));
});

test('un workout viejo SIN campos nuevos sigue armándose sin error (backward-compat)', () => {
  const e = gs._entryFromParams({ section: 'workouts', date: '2026-06-22', name: 'Bici', kcal: '300', minutes: '40' });
  assert.equal(e.kcal, 300);
  assert.equal(e.minutes, 40);
  assert.equal(e.maxHr, undefined);
  assert.equal(e.hrZonePct, undefined);
});
