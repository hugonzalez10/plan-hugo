// Regresión del doble-conteo del desayuno: la skill registra la comida real como extra
// ("Desayuno - yogur griego...") Y mandaba un check {meal:'desayuno'} que marcaba el
// desayuno FIJO del plan como comido → sumaba 325 kcal / 24 g P fantasma. El fix:
//   · extraPlanSlot (app) / _mealSlot (gs): mapean un extra a la sección que reemplaza.
//   · computeDayTotals suprime el plan/banco de esa sección si hay registro del chat.
//   · _checkRedundant (gs) descarta el check redundante en el origen.
// Aquí cubrimos la PARIDAD de inferencia app↔gs y el descarte server-side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gs } from './load-gs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

// Extrae PLAN_SLOTS + SLOT_NAME_RE + extraPlanSlot de app.jsx (todo JS puro, sin JSX).
const planM = appSrc.match(/const PLAN_SLOTS = new Set\(\[[^\]]*\]\);/);
const reM = appSrc.match(/const SLOT_NAME_RE = \{[\s\S]*?\n\};/);
const fnM = appSrc.match(/function extraPlanSlot\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
assert.ok(planM && reM && fnM, 'no se encontró extraPlanSlot/PLAN_SLOTS/SLOT_NAME_RE en app.jsx');
const extraPlanSlot = new Function(
  `${planM[0]}; ${reM[0]}; ${fnM[0]}; return extraPlanSlot;`
)();

const CASES = [
  { in: { mealSlot: 'cena', name: 'Lentejas' },                    out: 'cena' },          // mealSlot manda
  { in: { mealSlot: null, source: 'skill-chat', name: 'Desayuno - yogur griego 0% + ISO 100' }, out: 'desayuno' },
  { in: { mealSlot: null, source: 'skill-chat', name: 'Colacion 1 - Colun Protein + 2 huevos' }, out: 'colacion' },
  { in: { mealSlot: null, source: 'skill-chat', name: 'Colación nocturna' },               out: 'colacion' }, // con tilde
  { in: { mealSlot: null, source: 'skill-chat', name: 'Almuerzo en restaurante' },         out: 'almuerzo' },
  { in: { mealSlot: 'extra', source: 'skill-chat', name: 'Media mousse proteica' },        out: null },       // extra genuino
  { in: { mealSlot: null, source: 'app', name: 'Desayuno casero' },                        out: null },       // no skill-chat → no inferir
  { in: { mealSlot: null, source: 'skill-chat', name: 'Brownie proteico' },                out: null },
];

test('extraPlanSlot (app) y _mealSlot (gs) infieren el MISMO slot', () => {
  for (const c of CASES) {
    assert.equal(extraPlanSlot(c.in), c.out, `app divergió en: ${c.in.name}`);
    assert.equal(gs._mealSlot(c.in), c.out, `gs divergió en: ${c.in.name}`);
  }
});

// ── _checkRedundant + _contentUnion: el check redundante NO se almacena ──────────────
const bridgeWith = (meals) => ({ meals, weights: [], workouts: [], checks: [], snapshots: {}, config: {} });

test('_checkRedundant: true si ese día ya hay comida de esa sección', () => {
  const b = bridgeWith([{ date: '2026-06-09', mealSlot: null, source: 'skill-chat', name: 'Desayuno - yogur griego' }]);
  assert.equal(gs._checkRedundant(b, { meal: 'desayuno', date: '2026-06-09' }), true);
  assert.equal(gs._checkRedundant(b, { meal: 'almuerzo', date: '2026-06-09' }), false); // otra sección
  assert.equal(gs._checkRedundant(b, { meal: 'desayuno', date: '2026-06-08' }), false); // otro día
});

test('_contentUnion descarta el check redundante (no lo agrega)', () => {
  const b = bridgeWith([{ date: '2026-06-09', mealSlot: 'desayuno', source: 'skill-chat', name: 'Desayuno - yogur griego' }]);
  const added = gs._contentUnion(b, 'checks', [{ meal: 'desayuno', date: '2026-06-09' }], true);
  assert.equal(added, 0, 'no debió agregar el check redundante');
  assert.equal(b.checks.length, 0);
});

test('_contentUnion SÍ agrega el check si no hay comida de esa sección (comió el plan tal cual)', () => {
  const b = bridgeWith([]);
  const added = gs._contentUnion(b, 'checks', [{ meal: 'desayuno', date: '2026-06-09' }], true);
  assert.equal(added, 1);
  assert.equal(b.checks.length, 1);
  assert.equal(b.checks[0].meal, 'desayuno');
});
