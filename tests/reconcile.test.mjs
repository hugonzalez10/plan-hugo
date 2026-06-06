// Tests de _reconcile: la reconciliación de totales del día (el corazón del refactor
// "una sola verdad"). Cubre los tres regímenes: aditivo (plan-only), legacy (max), y
// sin snapshot. El foco es que el aditivo NO solape y que las correcciones hacia abajo
// se reflejen — justo lo que el viejo Math.max no hacía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

const { _reconcile } = gs;

// `waterMl` = agua registrada por chat (suma del section water[], la trae _totals).
const meal = (totals, workoutsKcal = 0, waterMl = 0) => ({ totals, workoutsKcal, waterMl });
const mt = (kcal, protein = 0, carbs = 0, fat = 0, fiber = 0) => ({ kcal, protein, carbs, fat, fiber });

// ── Sin snapshot: totales puros desde meals[] ────────────────────────────────────
test('_reconcile sin snapshot: refleja meals[] tal cual', () => {
  const r = _reconcile('2026-06-05', null, meal(mt(500, 40), 200), ['Pan', 'Pollo']);
  assert.equal(r.source, 'bridge');
  assert.deepEqual(r.totals, { ...mt(500, 40), waterMl: 0 });
  assert.equal(r.workoutsKcal, 200);
  assert.deepEqual(r.eaten, ['Pan', 'Pollo']);
});

test('_reconcile sin snapshot: incluye el agua del chat (water[])', () => {
  const r = _reconcile('2026-06-05', null, meal(mt(500, 40), 0, 750), []);
  assert.equal(r.totals.waterMl, 750);          // agua del section water[], sin snapshot
});

// ── ADITIVO (plan-only): plan + meals[] se SUMAN, sin solape ──────────────────────
test('_reconcile aditivo: suma plan (snapshot) + log (meals[])', () => {
  const snap = {
    planScope: 'plan-only',
    totals: { kcalIn: 1000, protein: 80, carbs: 100, fat: 30, fiber: 10, waterMl: 1500, kcalBurned: 0 },
    targets: { kcalMax: 2000, proteinMin: 180, carbsTarget: 200, fatTarget: 60, fiberTarget: 30, waterTarget: 3000 },
    ts: 42,
  };
  // meals[] = extras + comidas del chat: 300 kcal, 25 prot; workouts[] = 150 kcal;
  // water[] del chat = 600 ml (lo trae _totals como meal.waterMl).
  const r = _reconcile('2026-06-05', snap, meal(mt(300, 25, 20, 10, 4), 150, 600), ['Empanada']);
  assert.equal(r.source, 'app+meals');
  assert.equal(r.totals.kcalIn, 1300);          // 1000 + 300, NO max(1000,300)=1000
  assert.equal(r.totals.protein, 105);          // 80 + 25
  assert.equal(r.totals.carbs, 120);            // 100 + 20
  assert.equal(r.totals.fat, 40);               // 30 + 10
  assert.equal(r.totals.fiber, 14);             // 10 + 4
  assert.equal(r.totals.kcalBurned, 150);       // workouts[] (el snapshot aporta 0)
  assert.equal(r.totals.waterMl, 2100);         // 1500 (snapshot/app) + 600 (water[]/chat)
  assert.equal(r.totals.kcal, 1150);            // neto: 1300 - 150
});

test('_reconcile aditivo: remaining se recomputa contra metas (no del snapshot viejo)', () => {
  const snap = {
    planScope: 'plan-only',
    totals: { kcalIn: 1000, protein: 80, waterMl: 0, kcalBurned: 0 },
    targets: { kcalMax: 2000, proteinMin: 180, waterTarget: 3000 },
    remaining: { kcal: 9999 }, // basura del snapshot: NO debe usarse en aditivo
  };
  const r = _reconcile('2026-06-05', snap, meal(mt(300, 20), 0), []);
  assert.equal(r.remaining.kcal, 2000 - 1300);  // 700, recomputado
  assert.equal(r.remaining.protein, 180 - 100); // 80
});

test('_reconcile aditivo: corrección hacia ABAJO se refleja (lo que max() no hacía)', () => {
  const snap = { planScope: 'plan-only', totals: { kcalIn: 1000, protein: 80 }, targets: {} };
  // Hugo borró todos los extras → meals[] queda en 0. El total debe BAJAR a solo el plan.
  const r = _reconcile('2026-06-05', snap, meal(mt(0, 0), 0), []);
  assert.equal(r.totals.kcalIn, 1000);          // solo el plan, no arrastra extras viejos
  assert.equal(r.totals.protein, 80);
});

test('_reconcile aditivo: eaten = snapshot.eaten ∪ nombres de meals[]', () => {
  const snap = { planScope: 'plan-only', totals: {}, targets: {}, eaten: ['Huevos', 'Yogurt'] };
  const r = _reconcile('2026-06-05', snap, meal(mt(0)), ['Empanada', 'Yogurt']);
  assert.deepEqual(r.eaten, ['Huevos', 'Yogurt', 'Empanada']); // sin duplicar Yogurt
});

// ── LEGACY (sin planScope): MAYOR por nutriente, compat con datos en vuelo ────────
test('_reconcile legacy: toma el mayor por nutriente (snapshot completo)', () => {
  const snap = {
    totals: { kcalIn: 1800, protein: 150, carbs: 180, fat: 55, fiber: 25, waterMl: 2000, kcalBurned: 100 },
    targets: { kcalMax: 2000, proteinMin: 180 },
  };
  // meals[] trae MENOS que el snapshot (snapshot ya incluía los extras) → gana el snapshot
  const r = _reconcile('2026-06-05', snap, meal(mt(300, 20), 50), []);
  assert.equal(r.totals.kcalIn, 1800);   // max(1800, 300)
  assert.equal(r.totals.protein, 150);   // max(150, 20)
  assert.equal(r.totals.kcalBurned, 100); // max(100, 50)
});

test('_reconcile legacy: si meals[] supera al snapshot, usa meals y marca app+meals', () => {
  const snap = { totals: { kcalIn: 100, protein: 5 }, targets: { kcalMax: 2000, proteinMin: 180 } };
  const r = _reconcile('2026-06-05', snap, meal(mt(900, 70), 0), []);
  assert.equal(r.source, 'app+meals');
  assert.equal(r.totals.kcalIn, 900);
  assert.equal(r.totals.protein, 70);
  assert.equal(r.remaining.kcal, 2000 - 900);
});
