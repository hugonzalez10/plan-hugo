// Guard del doble conteo plan↔chat: una comida del PLAN registrada por el chat entra como
// extra con mealSlot (desayuno/almuerzo/colacion/cena/antojo) y SUS macros. Si además el
// slot está tildado en la app, computeDayTotals la sumaba dos veces (la "proteína fantasma"
// de la divergencia app↔bridge). El fix suprime la porción fija/bancaria de todo slot que un
// extra ya cubre. Este test extrae computeDayTotals + sus deps puras de app.jsx (sin JSX) y
// verifica la supresión, la no-regresión (sin extra cuenta normal) y la idempotencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

// Extrae `function NAME(...) { ... }` (corta en la primera `}` a inicio de línea).
function fn(name) {
  const m = src.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(m, 'no se encontró ' + name + ' en app.jsx');
  return m[0];
}
// Extrae una const con literal multilínea terminado en la secuencia `end` a inicio de línea.
function constLit(decl, end) {
  const m = src.match(new RegExp(decl + '[\\s\\S]*?\\n' + end));
  assert.ok(m, 'no se encontró ' + decl);
  return m[0];
}

const FIXED_MEALS = constLit('const FIXED_MEALS = \\[', '\\];');
const PLAN_SLOTS = src.match(/const PLAN_SLOTS = new Set\(\[[\s\S]*?\]\);/)[0];

const bundle = [
  FIXED_MEALS, PLAN_SLOTS,
  fn('mealItemsFor'), fn('sumField'), fn('getMealItemTicks'),
  fn('planSlotsCoveredByExtras'), fn('computeDayTotals'),
  'return { computeDayTotals, planSlotsCoveredByExtras };',
].join('\n');

const { computeDayTotals, planSlotsCoveredByExtras } = new Function(bundle)();

const TARGETS = {
  kcalMax: 2000, proteinMin: 200, carbsTarget: 200,
  fatTarget: 67, fiberTarget: 30, waterTarget: 3675,
};
// Proteína de los ítems fijos del almuerzo (arroz 4 + proteína 40 + fruta 1 + yogurt-granola 4).
const ALMUERZO_FIXED_PROTEIN = 4 + 40 + 1 + 4; // 49
const extraAlmuerzo = { id: 'x1', mealSlot: 'almuerzo', name: 'Almuerzo', kcal: 520, protein: 42, carbs: 62, fat: 10, fiber: 8 };
const run = (day, snackBank = []) => computeDayTotals(day, snackBank, [], TARGETS, [], []);

test('planSlotsCoveredByExtras: solo slots del plan', () => {
  const covered = planSlotsCoveredByExtras([
    { mealSlot: 'almuerzo' }, { mealSlot: 'extra' }, { mealSlot: 'cena' }, { mealSlot: 'random' },
  ]);
  assert.deepEqual([...covered].sort(), ['almuerzo', 'cena']);
});

test('doble conteo: almuerzo tildado + extra del chat NO suma dos veces', () => {
  const day = { eaten: { almuerzo: true }, extras: [extraAlmuerzo] };
  // Sin el fix daría 49 (fijo) + 42 (extra) = 91. Con el fix, solo el extra.
  assert.equal(run(day).protein, 42);
});

test('no-regresión: almuerzo tildado SIN extra cuenta la porción fija', () => {
  const day = { eaten: { almuerzo: true }, extras: [] };
  assert.equal(run(day).protein, ALMUERZO_FIXED_PROTEIN); // 49
});

test('colación: snack del banco tildado + extra del chat NO suma dos veces', () => {
  const snackBank = [{ id: 's1', protein: 30, kcal: 190, carbs: 21, fat: 7, fiber: 7 }];
  const day = {
    snackId: 's1', eaten: { colacion: true },
    extras: [{ id: 'x2', mealSlot: 'colacion', name: 'Colación', kcal: 190, protein: 30, carbs: 21, fat: 7, fiber: 7 }],
  };
  assert.equal(run(day, snackBank).protein, 30); // solo el extra, no snack+extra=60
});
