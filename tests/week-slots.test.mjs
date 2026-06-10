// Vista semanal reconoce las colaciones/cenas registradas por chat. Antes la fila de Semana
// y el promedio solo miraban el banco (day.snackId / day.proteinId); las comidas del chat
// viven en day.extras[] con su mealSlot y nunca tocan esos campos, así que la semana mostraba
// "— sin colación / — sin cena" y "0 días completos" aunque hubiera datos. Ahora computeDayTotals
// expone hasSnack/hasDinner/snackLabel/dinnerLabel derivados también de los extras con slot.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

function fn(name) {
  const m = appSrc.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(m, 'no se encontró ' + name + ' en app.jsx');
  return m[0];
}
function constLit(decl, end) {
  const m = appSrc.match(new RegExp(decl + '[\\s\\S]*?\\n' + end));
  assert.ok(m, 'no se encontró ' + decl);
  return m[0];
}
const planM = appSrc.match(/const PLAN_SLOTS = new Set\(\[[^\]]*\]\);/);
const reM = appSrc.match(/const SLOT_NAME_RE = \{[\s\S]*?\n\};/);
const FIXED_MEALS = constLit('const FIXED_MEALS = \\[', '\\];');
const { computeDayTotals } = new Function([
  FIXED_MEALS, planM[0], reM[0],
  fn('mealItemsFor'), fn('sumField'), fn('getMealItemTicks'),
  fn('slotByTime'), fn('extraPlanSlot'), fn('computeDayTotals'),
  'return { computeDayTotals };',
].join('\n'))();

const TARGETS = { kcalMax: 2000, proteinMin: 200, carbsTarget: 200, fatTarget: 67, fiberTarget: 30, waterTarget: 3675 };
const run = (day, snackBank = [], proteinBank = []) => computeDayTotals(day, snackBank, proteinBank, TARGETS, [], []);
const extra = (over) => ({ id: 'x', source: 'skill-chat', name: 'Comida', kcal: 200, protein: 20, carbs: 10, fat: 5, fiber: 3, ...over });

test('día solo con extras del chat (colación + cena) cuenta como completo', () => {
  const day = { extras: [
    extra({ id: 'c', mealSlot: 'colacion', name: 'Quest Bar' }),
    extra({ id: 'd', mealSlot: 'cena', name: 'Lentejas con arroz' }),
  ] };
  const t = run(day);
  assert.equal(t.hasSnack, true);
  assert.equal(t.hasDinner, true);
  assert.equal(t.snackLabel, 'Quest Bar');
  assert.equal(t.dinnerLabel, 'Lentejas con arroz');
});

test('varios extras del mismo slot se concatenan en el label', () => {
  const day = { extras: [
    extra({ id: 'c1', mealSlot: 'colacion', name: 'Charqui' }),
    extra({ id: 'c2', mealSlot: 'colacion', name: 'Brownie' }),
  ] };
  assert.equal(run(day).snackLabel, 'Charqui + Brownie');
});

test('extra sin mealSlot pero con ts de cena alimenta hasDinner (datos viejos)', () => {
  const tsCena = new Date(2026, 5, 10, 20, 0, 0).getTime();
  const day = { extras: [extra({ id: 'd', name: 'Atún quinoa', ts: tsCena })] };
  const t = run(day);
  assert.equal(t.hasDinner, true);
  assert.equal(t.dinnerLabel, 'Atún quinoa');
});

test('el banco sigue funcionando: snack del banco sin extras', () => {
  const snackBank = [{ id: 's1', name: 'Yogurt proteico', protein: 30, kcal: 190, carbs: 21, fat: 7, fiber: 7 }];
  const day = { snackId: 's1', eaten: { colacion: true }, extras: [] };
  const t = run(day, snackBank);
  assert.equal(t.hasSnack, true);
  assert.equal(t.snackLabel, 'Yogurt proteico');
});

test('día sin colación ni cena: hasSnack/hasDinner false y labels null', () => {
  const day = { extras: [extra({ id: 'a', mealSlot: 'desayuno', name: 'Café' })] };
  const t = run(day);
  assert.equal(t.hasSnack, false);
  assert.equal(t.hasDinner, false);
  assert.equal(t.snackLabel, null);
  assert.equal(t.dinnerLabel, null);
});
