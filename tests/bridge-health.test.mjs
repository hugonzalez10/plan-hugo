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

test('_prune NO toca health aunque sea viejísima', () => {
  const bridge = {
    meals: [], weights: [], workouts: [], checks: [], water: [], energy: [],
    health: [{ date: '2020-01-01', steps: 1234, activeEnergyKcal: 200 }],
    snapshots: {},
  };
  gs._prune(bridge);
  assert.equal(bridge.health.length, 1, 'podó health (no debía)');
});
