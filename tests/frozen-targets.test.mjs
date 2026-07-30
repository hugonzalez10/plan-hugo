// Metas diarias congeladas: migrateState fija los overrides manuales del perfil (kcal 2000,
// proteína 200, agua 3675) para goal:'lose', y calcTargets deriva carbos/grasa a 200/67. Esto
// desacopla la meta diaria del TDEE adaptativo, que en modo Auto había caído a su piso y
// arrastrado la meta a 1694 kcal (bucle de subingesta). Ver src/storage.mjs (frozenTargetsV1) y
// src/nutrition.mjs (calcTargets corta en kcalTarget manual antes de mirar opts.adaptiveTdee).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState } from '../src/storage.mjs';
import { calcTargets } from '../src/nutrition.mjs';

// Perfil base viejo en modo Auto (kcalTarget/proteinTarget/waterTarget en null).
const loseProfile = (extra = {}) => ({
  snackBank: [], proteinBank: [], days: {},
  userProfile: {
    sex: 'M', weightKg: 90, heightCm: 178, age: 36, activityLevel: 'moderate',
    goal: 'lose', kcalTarget: null, proteinTarget: null, waterTarget: null, ...extra,
  },
});

test('migrateState congela kcal/proteína/agua para goal:lose en Auto', () => {
  const m = migrateState(loseProfile());
  const up = m.userProfile;
  assert.equal(up.kcalTarget, 2000);
  assert.equal(up.proteinTarget, 200);
  assert.equal(up.waterTarget, 3675);
  assert.equal(up.frozenTargetsV1, true);
});

test('calcTargets sobre el perfil migrado da 2000/200/200/67, fibra 30, agua 3675', () => {
  const m = migrateState(loseProfile());
  const t = calcTargets(m.userProfile);
  assert.equal(t.kcalMax, 2000);
  assert.equal(t.proteinMin, 200);
  assert.equal(t.carbsTarget, 200); // round(2000*0.40/4)
  assert.equal(t.fatTarget, 67);    // round(2000*0.30/9)
  assert.equal(t.fiberTarget, 30);
  assert.equal(t.waterTarget, 3675);
});

test('la meta queda DESACOPLADA del TDEE adaptativo bajo (no vuelve a 1694)', () => {
  const m = migrateState(loseProfile());
  // Aunque el adaptativo esté pegado a su piso (~2094), la meta manual manda.
  const t = calcTargets(m.userProfile, { adaptiveTdee: 2094 });
  assert.equal(t.kcalMax, 2000);
});

test('idempotencia: con frozenTargetsV1 ya seteado NO pisa un override propio', () => {
  const m = migrateState(loseProfile({ frozenTargetsV1: true, kcalTarget: 1800, proteinTarget: 190 }));
  assert.equal(m.userProfile.kcalTarget, 1800);
  assert.equal(m.userProfile.proteinTarget, 190);
});

test('no pisa un kcalTarget manual preexistente aunque falte el flag', () => {
  const m = migrateState(loseProfile({ kcalTarget: 2200 }));
  assert.equal(m.userProfile.kcalTarget, 2200); // guarda == null no lo toca
  assert.equal(m.userProfile.proteinTarget, 200); // este sí estaba en null → se congela
  assert.equal(m.userProfile.frozenTargetsV1, true);
});

test('goal:gain / maintain NO reciben la congelación', () => {
  const gain = migrateState(loseProfile({ goal: 'gain' }));
  assert.equal(gain.userProfile.kcalTarget, null);
  assert.equal(gain.userProfile.frozenTargetsV1, undefined);
  const maintain = migrateState(loseProfile({ goal: 'maintain' }));
  assert.equal(maintain.userProfile.kcalTarget, null);
  assert.equal(maintain.userProfile.frozenTargetsV1, undefined);
});
