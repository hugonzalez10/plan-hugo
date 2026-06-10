// Relleno de mealSlot por hora. La skill no siempre estampa mealSlot (≈18% de las comidas
// llegaban sin él) y caían a 'extra'. Ahora:
//   · gs._slotByTime / app.slotByTime: mapean una hora (time "HH:MM" o ts) a su sección.
//   · gs._entryFromParams estampa el slot AUSENTE al escribir (nombre → hora), sin pisar
//     un 'extra' explícito de la skill.
//   · app.extraPlanSlot cae a la hora del ts para comidas viejas ya guardadas sin mealSlot.
// La tabla DEBE coincidir en skill ↔ gs ↔ app:
//   <11:00 desayuno · 11:00–14:59 almuerzo · 15:00–18:59 colacion · 19:00–21:29 cena · 21:30+ antojo
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gs } from './load-gs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

// Extrae slotByTime + PLAN_SLOTS + SLOT_NAME_RE + extraPlanSlot de app.jsx (JS puro).
function fn(name) {
  const m = appSrc.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(m, 'no se encontró ' + name + ' en app.jsx');
  return m[0];
}
const planM = appSrc.match(/const PLAN_SLOTS = new Set\(\[[^\]]*\]\);/);
const reM = appSrc.match(/const SLOT_NAME_RE = \{[\s\S]*?\n\};/);
assert.ok(planM && reM, 'no se encontró PLAN_SLOTS/SLOT_NAME_RE en app.jsx');
const { slotByTime, extraPlanSlot } = new Function(
  `${planM[0]}; ${reM[0]}; ${fn('slotByTime')}; ${fn('extraPlanSlot')}; return { slotByTime, extraPlanSlot };`
)();

// Una fecha local con hora HH:MM (sin tocar el huso: el test corre en local, como la app).
const at = (h, m) => new Date(2026, 5, 10, h, m, 0);

// ── Fronteras de la tabla (app.slotByTime ↔ gs._slotByTime por time string) ──────────
const BOUNDARIES = [
  [10, 59, 'desayuno'], [11, 0, 'almuerzo'], [14, 59, 'almuerzo'],
  [15, 0, 'colacion'], [18, 59, 'colacion'], [19, 0, 'cena'],
  [21, 29, 'cena'], [21, 30, 'antojo'], [23, 15, 'antojo'], [0, 5, 'desayuno'],
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
  // "Colacion 1 - ..." a las 13:30 (hora de almuerzo) → debe quedar colacion por el nombre.
  const e = gs._entryFromParams({ section: 'meals', name: 'Colacion 1 - barra', time: '13:30', kcal: 200 });
  assert.equal(e.mealSlot, 'colacion');
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
test('extraPlanSlot: extra del chat sin mealSlot, con ts de colación → colacion', () => {
  const x = { source: 'skill-chat', name: 'Charqui 20g', ts: at(16, 0).getTime() };
  assert.equal(extraPlanSlot(x), 'colacion');
});

test('extraPlanSlot: mealSlot "extra" explícito no se reclasifica por hora', () => {
  const x = { source: 'skill-chat', name: 'Mousse', mealSlot: 'extra', ts: at(16, 0).getTime() };
  assert.equal(extraPlanSlot(x), null);
});

test('extraPlanSlot: sin ts ni nombre reconocible → null (extra genuino)', () => {
  const x = { source: 'skill-chat', name: 'Algo' };
  assert.equal(extraPlanSlot(x), null);
});
