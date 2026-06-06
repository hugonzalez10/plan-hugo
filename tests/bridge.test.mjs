// Tests de la lógica pura del bridge (apps-script/bridge-writer.gs).
// Cubre lo que más se ha roto históricamente: dedup por contenido + ventana, merge de
// pesos, idempotencia de checks, suma de totales, y la adopción de snapshot/config.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

const { _norm, _sig, _entryTs, _contentUnion, _totals, _mergeInto, _authed, WINDOW_MS } = gs;

const emptyBridge = () => ({ meals: [], weights: [], workouts: [], checks: [], snapshots: {}, config: {} });

// ── _norm: idéntica a normalizeName de app.jsx (minúsculas, trim, colapsa espacios,
//    conserva acentos). Si esto diverge entre app y .gs, el dedup se rompe. ──────────
test('_norm: minúsculas, trim y colapso de espacios, conserva acentos', () => {
  assert.equal(_norm('  Empanada   de   Pino '), 'empanada de pino');
  assert.equal(_norm('Café CON Leche'), 'café con leche');
  assert.equal(_norm(null), '');
  assert.equal(_norm(undefined), '');
});

// ── _sig: firma de contenido por sección ─────────────────────────────────────────
test('_sig: firma por sección', () => {
  assert.equal(_sig('meals', { name: 'Pan', mealSlot: 'extra', date: '2026-06-05' }), 'pan|extra|2026-06-05');
  assert.equal(_sig('meals', { name: 'Pan', date: '2026-06-05' }), 'pan|extra|2026-06-05'); // mealSlot default
  assert.equal(_sig('workouts', { name: 'Trote', date: '2026-06-05' }), 'trote|2026-06-05');
  assert.equal(_sig('weights', { date: '2026-06-05' }), '2026-06-05');
  assert.equal(_sig('checks', { meal: 'Cena', date: '2026-06-05' }), 'cena|2026-06-05');
});

// ── _entryTs: prioridad ts > date+time > id-unix > now ───────────────────────────
test('_entryTs: respeta la prioridad de fuentes de tiempo', () => {
  const now = 1_000_000_000_000;
  assert.equal(_entryTs({ ts: 123456 }, now), 123456);
  const fromDateTime = _entryTs({ date: '2026-06-05', time: '20:48' }, now);
  assert.equal(fromDateTime, new Date('2026-06-05T20:48:00').getTime());
  assert.equal(_entryTs({ id: '1700000000' }, now), 1700000000 * 1000); // id unix-segundos
  assert.equal(_entryTs({}, now), now); // fallback
});

// ── _contentUnion meals: dedup por contenido dentro de la ventana ────────────────
test('_contentUnion meals: colapsa duplicado dentro de la ventana de 5 min', () => {
  const b = emptyBridge();
  const base = { name: 'Empanada', mealSlot: 'extra', date: '2026-06-05', kcal: 290, ts: 1_700_000_000_000 };
  assert.equal(_contentUnion(b, 'meals', [{ ...base }], true), 1);
  // misma firma, +2 min (dentro de ventana) → NO agrega
  assert.equal(_contentUnion(b, 'meals', [{ ...base, ts: base.ts + 2 * 60 * 1000 }], true), 0);
  assert.equal(b.meals.length, 1);
});

test('_contentUnion meals: misma comida fuera de la ventana SÍ se agrega (comer dos veces)', () => {
  const b = emptyBridge();
  const base = { name: 'Café', mealSlot: 'extra', date: '2026-06-05', kcal: 5, ts: 1_700_000_000_000 };
  _contentUnion(b, 'meals', [{ ...base }], true);
  // +6 min (fuera de WINDOW_MS=5min) → es otra ingesta legítima
  assert.equal(_contentUnion(b, 'meals', [{ ...base, ts: base.ts + WINDOW_MS + 1 }], true), 1);
  assert.equal(b.meals.length, 2);
});

test('_contentUnion: assignId=true reasigna uuid del servidor (autoridad)', () => {
  const b = emptyBridge();
  _contentUnion(b, 'meals', [{ name: 'X', date: '2026-06-05', id: 'cliente-999', ts: 1 }], true);
  assert.notEqual(b.meals[0].id, 'cliente-999');
  assert.match(String(b.meals[0].id), /^uuid-/);
});

// ── _contentUnion weights: mergea campos del día, no duplica ─────────────────────
test('_contentUnion weights: una medición por día, mergea composición', () => {
  const b = emptyBridge();
  _contentUnion(b, 'weights', [{ date: '2026-06-05', weightKg: 80 }], false);
  _contentUnion(b, 'weights', [{ date: '2026-06-05', bodyFatPct: 18 }], false);
  assert.equal(b.weights.length, 1);
  assert.equal(b.weights[0].weightKg, 80);
  assert.equal(b.weights[0].bodyFatPct, 18);
});

// El merge del mismo día debe conservar TODOS los campos de composición, no solo los
// cuatro clásicos: si Speediance reparte los datos en varias pantallas/llamadas, no se
// pueden perder grasa subcutánea, segmentos, bodyType, etc. (frente "que se llenen todos").
test('_contentUnion weights: el merge conserva campos extendidos y segmentos', () => {
  const b = emptyBridge();
  _contentUnion(b, 'weights', [{ date: '2026-06-05', weightKg: 105.4, bodyFatPct: 33 }], false);
  _contentUnion(b, 'weights', [{
    date: '2026-06-05',
    subcutaneousFatKg: 24.8, waterKg: 51.8, proteinKg: 14.1, ffmi: 21.7,
    waistHipRatio: 0.93, referenceWeightKg: 71, bodyType: 'Obesidad',
    fatSegTorso: 'Alto', muscleSegTorso: 'Bien',
  }], false);
  assert.equal(b.weights.length, 1);
  const w = b.weights[0];
  assert.equal(w.weightKg, 105.4);
  assert.equal(w.subcutaneousFatKg, 24.8);
  assert.equal(w.waterKg, 51.8);
  assert.equal(w.bodyType, 'Obesidad');
  assert.equal(w.fatSegTorso, 'Alto');
  assert.equal(w.muscleSegTorso, 'Bien');
});

// ── _contentUnion checks: idempotente por (meal|fecha) ───────────────────────────
test('_contentUnion checks: idempotente', () => {
  const b = emptyBridge();
  assert.equal(_contentUnion(b, 'checks', [{ meal: 'cena', date: '2026-06-05' }], false), 1);
  assert.equal(_contentUnion(b, 'checks', [{ meal: 'cena', date: '2026-06-05' }], false), 0);
  assert.equal(b.checks.length, 1);
});

// ── _totals: suma meals del día + kcal de workouts ───────────────────────────────
test('_totals: suma solo las meals del día pedido', () => {
  const b = emptyBridge();
  b.meals = [
    { date: '2026-06-05', kcal: 100, protein: 10, carbs: 5, fat: 2, fiber: 1 },
    { date: '2026-06-05', kcal: 200, protein: 20, carbs: 10, fat: 4, fiber: 2 },
    { date: '2026-06-04', kcal: 999, protein: 99 }, // otro día, no cuenta
  ];
  b.workouts = [{ date: '2026-06-05', kcal: 300 }, { date: '2026-06-04', kcal: 50 }];
  const r = _totals(b, '2026-06-05');
  assert.deepEqual(r.totals, { kcal: 300, protein: 30, carbs: 15, fat: 6, fiber: 3 });
  assert.equal(r.workoutsKcal, 300);
});

// ── _mergeInto snapshot: guarda en snapshots[date] ───────────────────────────────
test('_mergeInto snapshot: guarda los totales por fecha', () => {
  const b = emptyBridge();
  _mergeInto(b, { op: 'snapshot', date: '2026-06-05', totals: { kcalIn: 1500 }, ts: 42 });
  assert.equal(b.snapshots['2026-06-05'].totals.kcalIn, 1500);
  assert.equal(b.snapshots['2026-06-05'].ts, 42);
});

// ── _mergeInto config: solo adopta si es más nuevo (la app es la autoridad) ───────
test('_mergeInto config: adopta el más nuevo, ignora el viejo', () => {
  const b = emptyBridge();
  b.config = { kcalTarget: 2000, updatedAt: '2026-06-05T10:00:00Z' };
  // más viejo → se ignora
  _mergeInto(b, { op: 'config', config: { kcalTarget: 1, updatedAt: '2026-06-01T00:00:00Z' } });
  assert.equal(b.config.kcalTarget, 2000);
  // más nuevo → adopta
  _mergeInto(b, { op: 'config', config: { kcalTarget: 1800, updatedAt: '2026-06-06T00:00:00Z' } });
  assert.equal(b.config.kcalTarget, 1800);
});

// ── _mergeInto add: delega en _contentUnion y devuelve cuántas agregó ────────────
test('_mergeInto add: agrega entradas a la sección', () => {
  const b = emptyBridge();
  const added = _mergeInto(b, { op: 'add', section: 'meals', entries: [{ name: 'Pan', date: '2026-06-05', kcal: 80, ts: 1 }] });
  assert.equal(added, 1);
  assert.equal(b.meals.length, 1);
});

// ── _authed: el guard de seguridad del bridge ────────────────────────────────────
// Token DESACTIVADO (SHARED_TOKEN === '', deploy v13): el guard deja pasar TODO, con o
// sin ?k=. Rompía el registro por chat; la URL /exec ya es secreta. Si algún día se
// reactiva (SHARED_TOKEN con valor), volver a exigir el token aquí.
test('_authed: token desactivado → deja pasar todo', () => {
  assert.equal(_authed({ parameter: { k: 'lo-que-sea' } }), true);
  assert.equal(_authed({ parameter: {} }), true);
  assert.equal(_authed({}), true);
});
