// Biblioteca de alimentos reusables (src/foods.mjs) + carga de la semilla por foodsVersion en
// migrateState. El store guarda macros por 100g y se escala por gramos al registrar; promover un
// extra deriva el per100. La migración no debe resucitar alimentos que el usuario haya borrado.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleFoodToPortion, foodToMealItem, mealItemToFood, foodFromOFF,
  upsertFood, searchFoods, makeFood, parseGrams, stripPortionSuffix, markFoodUsed,
} from '../src/foods.mjs';
import { migrateState } from '../src/storage.mjs';
import { buildSeed, SEED_FOODS } from '../src/seed.mjs';

const pollo = makeFood({ name: 'Pechuga de pollo cocida', per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, defaultPortionG: 150 });

test('scaleFoodToPortion escala por gramos y redondea', () => {
  const m = scaleFoodToPortion(pollo, 150);
  assert.equal(m.kcal, 248);      // 165 * 1.5 = 247.5 → 248
  assert.equal(m.protein, 47);    // 31 * 1.5 = 46.5 → 47
  assert.equal(m.fat, 5);         // 3.6 * 1.5 = 5.4 → 5
  assert.equal(m.fiber, 0);
});

test('scaleFoodToPortion sin gramos usa defaultPortionG', () => {
  const m = scaleFoodToPortion(pollo);
  assert.equal(m.kcal, 248);
});

test('foodToMealItem produce un MealItem con porción, per100 y source=food', () => {
  const item = foodToMealItem(pollo, 200, 'almuerzo');
  assert.equal(item.name, 'Pechuga de pollo cocida (200g)');
  assert.equal(item.kcal, 330);   // 165 * 2
  assert.equal(item.protein, 62);
  assert.equal(item.mealSlot, 'almuerzo');
  assert.equal(item.source, 'food');
  assert.equal(item.portion, '200g');
  assert.equal(item.foodId, pollo.id);
  assert.equal(item.per100.kcal, 165);
  assert.ok(!('id' in item) && !('ts' in item), 'id/ts los estampa el caller');
});

test('foodToMealItem no acumula porción en el nombre (strip + re-add)', () => {
  const base = makeFood({ name: 'Yogur griego (170g)', per100: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0 }, defaultPortionG: 170 });
  const item = foodToMealItem(base, 170);
  assert.equal(item.name, 'Yogur griego (170g)');
});

test('mealItemToFood deriva per100 desde per100 raw de OFF', () => {
  const extra = {
    name: 'Colún Protein (250g)', kcal: 200, protein: 23, carbs: 25, fat: 5, fiber: 0,
    portion: '250g', barcode: '7800', per100: { kcalPer100: 80, protPer100: 9, carbsPer100: 10, fatPer100: 2, fiberPer100: 0, servingG: 250 },
  };
  const f = mealItemToFood(extra);
  assert.equal(f.name, 'Colún Protein');
  assert.equal(f.per100.kcal, 80);
  assert.equal(f.per100.protein, 9);
  assert.equal(f.defaultPortionG, 250);
  assert.equal(f.barcode, '7800');
  assert.equal(f.source, 'promoted');
});

test('mealItemToFood deriva per100 desde gramos de la porción cuando no hay per100', () => {
  const extra = { name: 'Pollo asado', kcal: 330, protein: 62, carbs: 0, fat: 7.2, fiber: 0, portion: '200g' };
  const f = mealItemToFood(extra);
  assert.equal(f.per100.kcal, 165);   // 330 / 2
  assert.equal(f.per100.protein, 31);
  assert.equal(f.defaultPortionG, 200);
});

test('mealItemToFood sin porción ni per100 cae a 100g', () => {
  const f = mealItemToFood({ name: 'Galleta', kcal: 150, protein: 2, carbs: 20, fat: 7, fiber: 1 });
  assert.equal(f.per100.kcal, 150);
  assert.equal(f.defaultPortionG, 100);
});

test('upsertFood dedup por key (nombre normalizado) conservando id y usageCount', () => {
  let foods = [];
  foods = upsertFood(foods, { name: 'Avena', per100: { kcal: 389, protein: 17, carbs: 66, fat: 7, fiber: 10 } });
  const id = foods[0].id;
  foods = markFoodUsed(foods, id, 1000);
  foods = upsertFood(foods, { name: '  avena ', per100: { kcal: 380, protein: 16, carbs: 65, fat: 7, fiber: 10 } });
  assert.equal(foods.length, 1, 'no duplica por nombre normalizado');
  assert.equal(foods[0].id, id, 'conserva el id existente');
  assert.equal(foods[0].usageCount, 1, 'conserva usageCount');
  assert.equal(foods[0].per100.kcal, 380, 'actualiza per100');
});

test('upsertFood dedup por barcode aunque cambie el nombre', () => {
  let foods = upsertFood([], { name: 'Yogur X', barcode: '123', per100: { kcal: 60, protein: 5, carbs: 4, fat: 2, fiber: 0 } });
  foods = upsertFood(foods, { name: 'Yogur Y renombrado', barcode: '123', per100: { kcal: 62, protein: 5, carbs: 4, fat: 2, fiber: 0 } });
  assert.equal(foods.length, 1);
  assert.equal(foods[0].name, 'Yogur Y renombrado');
});

test('searchFoods rankea exacto > prefijo > substring', () => {
  const foods = [
    makeFood({ name: 'Arroz integral cocido', per100: {} }),
    makeFood({ name: 'Arroz', per100: {} }),
    makeFood({ name: 'Pan con arroz', per100: {} }),
  ];
  const r = searchFoods(foods, 'arroz');
  assert.equal(r[0].name, 'Arroz');                  // exacto primero
  assert.equal(r[1].name, 'Arroz integral cocido');  // prefijo
  assert.equal(r[2].name, 'Pan con arroz');          // substring
});

test('searchFoods sin query ordena por usageCount', () => {
  let foods = [makeFood({ name: 'A', per100: {} }), makeFood({ name: 'B', per100: {} })];
  foods = markFoodUsed(foods, foods[1].id, 1);
  const r = searchFoods(foods, '');
  assert.equal(r[0].name, 'B');
});

test('foodFromOFF mapea raw *Per100 a per100 limpio', () => {
  const off = { name: 'Quaker Avena', barcode: '999', brand: 'Quaker', raw: { kcalPer100: 389, protPer100: 17, carbsPer100: 66, fatPer100: 7, fiberPer100: 10, servingG: 40 } };
  const f = foodFromOFF(off);
  assert.equal(f.per100.kcal, 389);
  assert.equal(f.defaultPortionG, 40);
  assert.equal(f.barcode, '999');
  assert.equal(f.source, 'off');
});

test('parseGrams / stripPortionSuffix', () => {
  assert.equal(parseGrams('150g'), 150);
  assert.equal(parseGrams('1.5 g'), 1.5);
  assert.equal(parseGrams('una porción'), null);
  assert.equal(stripPortionSuffix('Palta (50g)'), 'Palta');
  assert.equal(stripPortionSuffix('Palta'), 'Palta');
});

test('buildSeed trae la biblioteca de alimentos semilla', () => {
  const s = buildSeed();
  assert.equal(s.foods.length, SEED_FOODS.length);
  assert.equal(s.foodsVersion, 1);
  assert.ok(s.foods.every((f) => f.builtin && f.source === 'seed' && f.id && f.key));
});

test('migrateState inicializa foods y carga la semilla una sola vez', () => {
  const old = { snackBank: [], proteinBank: [], days: {} }; // estado viejo sin foods
  const m = migrateState(old);
  assert.ok(Array.isArray(m.foods));
  assert.equal(m.foods.length, SEED_FOODS.length);
  assert.equal(m.foodsVersion, 1);
});

test('migrateState NO resucita alimentos semilla que el usuario borró', () => {
  // Usuario ya pasó por foodsVersion 1 y borró todo: el merge no debe re-agregar.
  const state = { snackBank: [], proteinBank: [], days: {}, foods: [], foodsVersion: 1 };
  const m = migrateState(state);
  assert.equal(m.foods.length, 0);
});

test('migrateState preserva alimentos del usuario al migrar', () => {
  const mine = makeFood({ name: 'Mi batido', per100: { kcal: 200, protein: 30, carbs: 10, fat: 3, fiber: 1 } });
  const state = { snackBank: [], proteinBank: [], days: {}, foods: [mine], foodsVersion: 1 };
  const m = migrateState(state);
  assert.ok(m.foods.some((f) => f.name === 'Mi batido'));
});
