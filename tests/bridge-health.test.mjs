// Apple Health: el bridge guarda una serie diaria `health` ({date, steps, activeEnergyKcal,
// sleepHours, restingHr, vo2max}) que la app muestra como CONTEXTO (nunca la resta de las kcal:
// el TDEE adaptativo ya captura el gasto). Se mergea por fecha (no duplica) y nunca se poda,
// igual que energy/weights. La postea un iOS Shortcut. Carga las funciones puras del .gs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

test('health está en SECTIONS y nunca se poda (RETENTION 0)', () => {
  assert.ok(gs.SECTIONS.includes('health'), 'health no está en SECTIONS');
  assert.equal(gs.RETENTION.health, 0);
});

test('_sig de health es la fecha (merge por día)', () => {
  assert.equal(gs._sig('health', { date: '2026-06-14', steps: 8421 }), '2026-06-14');
});

test('_contentUnion mergea health por fecha (latest no-nulo gana, no duplica)', () => {
  const bridge = { health: [] };
  gs._contentUnion(bridge, 'health', [{ date: '2026-06-14', steps: 8000, activeEnergyKcal: 500, sleepHours: 7 }], false);
  assert.equal(bridge.health.length, 1);

  // misma fecha, valores actualizados → mergea sobre la existente
  gs._contentUnion(bridge, 'health', [{ date: '2026-06-14', steps: 8421, activeEnergyKcal: 540 }], false);
  assert.equal(bridge.health.length, 1, 'duplicó en vez de mergear');
  assert.equal(bridge.health[0].steps, 8421);
  assert.equal(bridge.health[0].activeEnergyKcal, 540);
  // un campo ausente en el re-post NO borra el valor previo (latest no-nulo gana)
  assert.equal(bridge.health[0].sleepHours, 7, 'un re-post sin sleepHours borró el valor previo');

  // fecha distinta → entrada nueva
  gs._contentUnion(bridge, 'health', [{ date: '2026-06-15', steps: 6000 }], false);
  assert.equal(bridge.health.length, 2);
});

test('mergea los campos de recuperación de HeartWatch (HRV/SpO₂/FC durmiendo)', () => {
  assert.ok(gs.HEALTH_MERGE_FIELDS.includes('hrvSleep'), 'hrvSleep no está en HEALTH_MERGE_FIELDS');
  assert.ok(gs.HEALTH_MERGE_FIELDS.includes('spo2Daily'));
  assert.ok(gs.HEALTH_MERGE_FIELDS.includes('recovery2min'));
  const bridge = { health: [] };
  // El Shortcut postea pasos/sueño; luego el importador CSV postea recuperación → se acumulan.
  gs._contentUnion(bridge, 'health', [{ date: '2026-06-18', steps: 4960, sleepHours: 5.42 }], false);
  gs._contentUnion(bridge, 'health', [{ date: '2026-06-18', hrvSleep: 69, hrvWake: 29, sleepingHr: 57.7, spo2Daily: 94, recovery2min: 31 }], false);
  assert.equal(bridge.health.length, 1, 'duplicó en vez de enriquecer el mismo día');
  const h = bridge.health[0];
  assert.equal(h.steps, 4960, 'el merge de recuperación borró los pasos del Shortcut');
  assert.equal(h.sleepHours, 5.42);
  assert.equal(h.hrvSleep, 69);
  assert.equal(h.spo2Daily, 94);
  assert.equal(h.recovery2min, 31);
});

test('workouts: hrZones/rpe/carga se mergean sobre la sesión existente (no duplica)', () => {
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('hrZones'));
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('rpe'));
  const ts = new Date('2026-06-15T07:00:00-04:00').getTime();
  const bridge = { workouts: [] };
  // Primero la sesión de Speediance (nombre propio), luego el enriquecimiento de HeartWatch
  // (mismo nombre+ventana, aporta FC/zonas). Debe mergear, no crear una segunda fila.
  gs._contentUnion(bridge, 'workouts', [{ name: 'Día 2 — Empuje', date: '2026-06-15', ts, kcal: 540 }], false);
  gs._contentUnion(bridge, 'workouts', [{ name: 'Día 2 — Empuje', date: '2026-06-15', ts: ts + 60000, avgHr: 117, rpe: 6, trainingLoad: 379, hrZones: { z60: 63.9, z50: 2.1 } }], false);
  assert.equal(bridge.workouts.length, 1, 'duplicó la sesión en vez de enriquecerla');
  const w = bridge.workouts[0];
  assert.equal(w.kcal, 540);
  assert.equal(w.avgHr, 117);
  assert.equal(w.rpe, 6);
  assert.deepEqual(w.hrZones, { z60: 63.9, z50: 2.1 });
});

test('workouts: mets (escalar) y hrSeries (array) están en WORKOUT_MERGE_FIELDS y se enriquecen', () => {
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('mets'), 'mets no está en WORKOUT_MERGE_FIELDS');
  assert.ok(gs.WORKOUT_MERGE_FIELDS.includes('hrSeries'), 'hrSeries no está en WORKOUT_MERGE_FIELDS');
  const ts = new Date('2026-07-01T07:00:00-04:00').getTime();
  const bridge = { workouts: [] };
  // Sesión simple ya en el bridge; el import de Takeout la enriquece (mismo nombre+ventana) con
  // mets + curva FC. Debe mergear sobre la fila, no crear otra.
  gs._contentUnion(bridge, 'workouts', [{ name: 'Trote cinta', date: '2026-07-01', ts, kcal: 693, minutes: 62 }], false);
  const hrSeries = [{ t: 0, bpm: 120 }, { t: 30, bpm: 142 }, { t: 60, bpm: 148 }];
  gs._contentUnion(bridge, 'workouts', [{ name: 'Trote cinta', date: '2026-07-01', ts: ts + 60000, mets: 7.9, hrSeries }], false);
  assert.equal(bridge.workouts.length, 1, 'duplicó la sesión en vez de enriquecerla');
  const w = bridge.workouts[0];
  assert.equal(w.kcal, 693, 'conserva la línea simple');
  assert.equal(w.mets, 7.9);
  assert.deepEqual(w.hrSeries, hrSeries);
});

test('workouts: hrSeries vacío NO pisa una curva ya presente (solo sobrescribe si trae items)', () => {
  const ts = new Date('2026-07-01T07:00:00-04:00').getTime();
  const bridge = { workouts: [] };
  const good = [{ t: 0, bpm: 120 }, { t: 30, bpm: 142 }];
  gs._contentUnion(bridge, 'workouts', [{ name: 'Trote', date: '2026-07-01', ts, kcal: 500, hrSeries: good }], false);
  gs._contentUnion(bridge, 'workouts', [{ name: 'Trote', date: '2026-07-01', ts: ts + 60000, hrSeries: [] }], false);
  assert.deepEqual(bridge.workouts[0].hrSeries, good, 'un hrSeries vacío borró la curva buena');
});

test('_prune NO toca health aunque sea viejísima', () => {
  const bridge = {
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [],
    health: [{ date: '2020-01-01', steps: 1234, activeEnergyKcal: 200 }],
    snapshots: {},
  };
  gs._prune(bridge);
  assert.equal(bridge.health.length, 1, 'podó health (no debía)');
});
