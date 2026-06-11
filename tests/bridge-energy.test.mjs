// Fase 6: el bridge retiene la serie `energy` ({date, kcalIn, trendWeightKg}) para siempre y la
// mergea por fecha (no duplica), igual que weights. Es lo que el TDEE adaptativo necesita cuando
// el log de comidas (meals) ya se podó a 30 días. Carga las funciones puras del .gs sin desplegar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

test('energy está en SECTIONS y nunca se poda (RETENTION 0)', () => {
  assert.ok(gs.SECTIONS.includes('energy'), 'energy no está en SECTIONS');
  assert.equal(gs.RETENTION.energy, 0);
});

test('_sig de energy es la fecha (merge por día)', () => {
  assert.equal(gs._sig('energy', { date: '2026-06-01', kcalIn: 2000 }), '2026-06-01');
});

test('_contentUnion mergea energy por fecha (latest gana, no duplica)', () => {
  const bridge = { energy: [] };
  gs._contentUnion(bridge, 'energy', [{ date: '2026-06-01', kcalIn: 2000, trendWeightKg: 90.5 }], false);
  assert.equal(bridge.energy.length, 1);

  // misma fecha, valores actualizados → mergea sobre la existente
  gs._contentUnion(bridge, 'energy', [{ date: '2026-06-01', kcalIn: 2100, trendWeightKg: 90.3 }], false);
  assert.equal(bridge.energy.length, 1, 'duplicó en vez de mergear');
  assert.equal(bridge.energy[0].kcalIn, 2100);
  assert.equal(bridge.energy[0].trendWeightKg, 90.3);

  // fecha distinta → entrada nueva
  gs._contentUnion(bridge, 'energy', [{ date: '2026-06-02', kcalIn: 1900, trendWeightKg: 90.2 }], false);
  assert.equal(bridge.energy.length, 2);
});

test('_prune NO toca energy aunque sea viejísima, pero sí poda meals', () => {
  const bridge = {
    meals: [{ id: 'm1', date: '2020-01-01', kcal: 500 }],
    weights: [], workouts: [], checks: [], water: [],
    energy: [{ date: '2020-01-01', kcalIn: 2000, trendWeightKg: 88 }],
    snapshots: {},
  };
  gs._prune(bridge);
  assert.equal(bridge.energy.length, 1, 'podó energy (no debía)');
  assert.equal(bridge.meals.length, 0, 'no podó meals viejas (debía)');
});
