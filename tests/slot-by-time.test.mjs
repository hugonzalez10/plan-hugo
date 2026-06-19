// Relleno de mealSlot por hora. La skill no siempre estampa mealSlot (≈18% de las comidas
// llegaban sin él) y caían a 'extra'. Ahora:
//   · gs._slotByTime / app.slotByTime: mapean una hora (time "HH:MM" o ts) a su sección.
//   · gs._entryFromParams estampa el slot AUSENTE al escribir (nombre → hora), sin pisar
//     un 'extra' explícito de la skill.
//   · app.extraPlanSlot cae a la hora del ts para comidas viejas ya guardadas sin mealSlot.
// La tabla DEBE coincidir en skill ↔ gs ↔ app (5 tomas, sin antojo; la colación AM cae antes
// del almuerzo):
//   <10:30 desayuno · 10:30–12:29 colacion1 · 12:30–15:29 almuerzo · 15:30–19:29 colacion2 · 19:30+ cena
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';
import { slotByTime, extraPlanSlot } from '../src/meals.mjs';

// Una fecha local con hora HH:MM (sin tocar el huso: el test corre en local, como la app).
const at = (h, m) => new Date(2026, 5, 10, h, m, 0);

// ── Fronteras de la tabla (app.slotByTime ↔ gs._slotByTime por time string) ──────────
const BOUNDARIES = [
  [10, 29, 'desayuno'], [10, 30, 'colacion1'], [12, 29, 'colacion1'],
  [12, 30, 'almuerzo'], [15, 29, 'almuerzo'], [15, 30, 'colacion2'],
  [19, 29, 'colacion2'], [19, 30, 'cena'], [23, 15, 'cena'], [0, 5, 'desayuno'],
];

test('slotByTime (app) y _slotByTime (gs) coinciden en las fronteras', () => {
  for (const [h, m, expected] of BOUNDARIES) {
    const hhmm = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    assert.equal(slotByTime(at(h, m)), expected, `app divergió en ${hhmm}`);
    assert.equal(gs._slotByTime(hhmm, null), expected, `gs (time) divergió en ${hhmm}`);
    assert.equal(gs._slotByTime(null, at(h, m).getTime()), expected, `gs (ts) divergió en ${hhmm}`);
  }
});

test('slotByTime: nulo/NaN devuelve null', () => {
  assert.equal(slotByTime(null), null);
  assert.equal(slotByTime(new Date('no-fecha')), null);
  assert.equal(gs._slotByTime(null, null), null);
});

// ── _entryFromParams: estampa el slot ausente, conserva el explícito ─────────────────
test('_entryFromParams: comida sin mealSlot + time de almuerzo → mealSlot almuerzo', () => {
  const e = gs._entryFromParams({ section: 'meals', name: 'Arroz + pollo', time: '13:30', kcal: 600 });
  assert.equal(e.mealSlot, 'almuerzo');
});

test('_entryFromParams: comida sin time pero con ts de cena → mealSlot cena', () => {
  const e = gs._entryFromParams({ section: 'meals', name: 'Atún', ts: at(20, 0).getTime(), kcal: 400 });
  assert.equal(e.mealSlot, 'cena');
});

test('_entryFromParams: nombre con prefijo gana sobre la hora', () => {
  // "Colacion 1 - ..." a las 13:30 (hora de almuerzo) → debe quedar colacion1 por el nombre.
  const e = gs._entryFromParams({ section: 'meals', name: 'Colacion 1 - barra', time: '13:30', kcal: 200 });
  assert.equal(e.mealSlot, 'colacion1');
});

test('_entryFromParams: mealSlot "extra" explícito NO se pisa', () => {
  const e = gs._entryFromParams({ section: 'meals', name: 'Mousse', mealSlot: 'extra', time: '15:30', kcal: 116 });
  assert.equal(e.mealSlot, 'extra');
});

test('_entryFromParams: mealSlot explícito de plan se conserva', () => {
  const e = gs._entryFromParams({ section: 'meals', name: 'Lentejas', mealSlot: 'cena', time: '12:00', kcal: 420 });
  assert.equal(e.mealSlot, 'cena');
});

test('_entryFromParams: solo estampa en section meals, no en otras', () => {
  const e = gs._entryFromParams({ section: 'weights', weightKg: 80, time: '13:30' });
  assert.equal(e.mealSlot, undefined);
});

// ── app.extraPlanSlot: cae a la hora del ts para comidas viejas sin mealSlot ──────────
test('extraPlanSlot: extra del chat sin mealSlot, con ts de colación tarde → colacion2', () => {
  const x = { source: 'skill-chat', name: 'Charqui 20g', ts: at(16, 0).getTime() };
  assert.equal(extraPlanSlot(x), 'colacion2');
});

test('extraPlanSlot: mealSlot "extra" explícito no se reclasifica por hora', () => {
  const x = { source: 'skill-chat', name: 'Mousse', mealSlot: 'extra', ts: at(16, 0).getTime() };
  assert.equal(extraPlanSlot(x), null);
});

test('extraPlanSlot: sin ts ni nombre reconocible → null (extra genuino)', () => {
  const x = { source: 'skill-chat', name: 'Algo' };
  assert.equal(extraPlanSlot(x), null);
});

// ── 'antojo' legacy: ya no es sección; se pliega a su toma por hora, NO a Extras ──────
test('extraPlanSlot: mealSlot "antojo" tarde de noche → cena (no Extras)', () => {
  const x = { source: 'skill-chat', name: 'Helado', mealSlot: 'antojo', ts: at(22, 30).getTime() };
  assert.equal(extraPlanSlot(x), 'cena');
});

test('extraPlanSlot: mealSlot "antojo" sin ts → cena por defecto', () => {
  const x = { source: 'skill-chat', name: 'Helado', mealSlot: 'antojo' };
  assert.equal(extraPlanSlot(x), 'cena');
});

test('gs._mealSlot: "antojo" tarde de noche → cena (espejo de la app)', () => {
  assert.equal(gs._mealSlot({ mealSlot: 'antojo', time: '22:30', name: 'Helado' }), 'cena');
  assert.equal(gs._mealSlot({ mealSlot: 'antojo', name: 'Helado' }), 'cena');
});
