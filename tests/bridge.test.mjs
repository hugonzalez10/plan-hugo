// Tests de la lógica pura del bridge (apps-script/bridge-writer.gs).
// Cubre lo que más se ha roto históricamente: dedup por contenido + ventana, merge de
// pesos, idempotencia de checks, suma de totales, y la adopción de snapshot/config.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gs } from './load-gs.mjs';

const { _norm, _sig, _entryTs, _contentUnion, _totals, _mergeInto, _updateInto, _prune, _authed, RETENTION, WINDOW_MS } = gs;

const emptyBridge = () => ({ meals: [], weights: [], workouts: [], checks: [], water: [], snapshots: {}, config: {} });

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

// ── agua: _entryFromParams mapea waterMl/water al campo canónico `ml` y _totals suma ─
test('_entryFromParams: waterMl y water son alias de ml; _totals los suma', () => {
  const { _entryFromParams } = gs;
  assert.equal(_entryFromParams({ section: 'water', date: '2026-06-15', ml: '500' }).ml, 500);
  assert.equal(_entryFromParams({ section: 'water', date: '2026-06-15', waterMl: '1500' }).ml, 1500);
  assert.equal(_entryFromParams({ section: 'water', date: '2026-06-15', water: '250' }).ml, 250);
  // ml explícito gana sobre los alias
  assert.equal(_entryFromParams({ section: 'water', ml: '100', waterMl: '999' }).ml, 100);

  const b = emptyBridge();
  b.water = [
    _entryFromParams({ section: 'water', date: '2026-06-15', waterMl: '1500' }),
    _entryFromParams({ section: 'water', date: '2026-06-15', waterMl: '500' }),
    _entryFromParams({ section: 'water', date: '2026-06-14', waterMl: '999' }), // otro día
  ];
  assert.equal(_totals(b, '2026-06-15').waterMl, 2000);
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

// ── op:add estampa la fecha del día si la entrada no la trae ──────────────────────
// Sin fecha, ?totals la ignoraba (filtra por date) pero la app la importaba a "hoy" y
// reaparecía como extra de hoy cada día (_prune no caduca entradas sin date). El servidor
// la sella con `day` en el origen para que el antipatrón sea imposible.
test('_mergeInto add: estampa la fecha (day) cuando la entrada no la trae', () => {
  const b = emptyBridge();
  const added = _mergeInto(b, { op: 'add', section: 'meals', entries: [{ name: 'Charqui', kcal: 62, protein: 11, ts: 1 }] }, '2026-06-07');
  assert.equal(added, 1);
  assert.equal(b.meals[0].date, '2026-06-07');
});

test('_mergeInto add: NO pisa la fecha que la entrada ya trae', () => {
  const b = emptyBridge();
  _mergeInto(b, { op: 'add', section: 'meals', entries: [{ name: 'Pan', date: '2026-06-05', kcal: 80, ts: 1 }] }, '2026-06-09');
  assert.equal(b.meals[0].date, '2026-06-05');
});

// ── op:add rechaza valores NEGATIVOS (antipatrón "corrección por neteo") ──────────
// Una comida/entrenamiento nunca aporta kcal/macros negativos. El bridge los descarta en
// el origen para forzar la corrección por ?w=delete. Solo en op:add; la unión de bridge
// completo no filtra (no toca negativas históricas).
test('_mergeInto add: descarta meals con nutriente negativo, conserva las válidas', () => {
  const b = emptyBridge();
  const added = _mergeInto(b, { op: 'add', section: 'meals', entries: [
    { name: 'Almuerzo real', date: '2026-06-09', kcal: 520, protein: 42, ts: 1 },
    { name: 'ANULA desayuno duplicado', date: '2026-06-09', kcal: -305, protein: -52, ts: 2 },
    { name: 'AJUSTE carne (-130)', date: '2026-06-09', kcal: -130, protein: 1, ts: 3 },
  ] });
  assert.equal(added, 1);                 // solo la válida
  assert.equal(b.meals.length, 1);
  assert.equal(b.meals[0].name, 'Almuerzo real');
});

test('_mergeInto add: workout con kcal negativo se descarta', () => {
  const b = emptyBridge();
  const added = _mergeInto(b, { op: 'add', section: 'workouts', entries: [{ name: 'X', date: '2026-06-09', kcal: -50, ts: 1 }] });
  assert.equal(added, 0);
  assert.equal(b.workouts.length, 0);
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

// ── _updateInto: merge NO destructivo para COMPLETAR/CORREGIR una entrada ─────────
test('_updateInto weights: completa por date sin borrar lo existente ni duplicar', () => {
  const b = emptyBridge();
  b.weights.push({ id: 'w1', date: '2026-06-04', weightKg: 104.8, bodyFatPct: 32.3 });
  const res = _updateInto(b, 'weights', { date: '2026-06-04' }, { fatKg: 33.8, ffmi: 21.8, bodyType: 'Obesidad' });
  assert.equal(res.ok, true);
  assert.equal(res.updated, 1);
  assert.equal(b.weights.length, 1);               // no duplica
  assert.equal(b.weights[0].weightKg, 104.8);      // conserva lo previo
  assert.equal(b.weights[0].fatKg, 33.8);          // agrega lo nuevo
  assert.equal(b.weights[0].bodyType, 'Obesidad');
});

test('_updateInto: selecciona por id si viene; no reescribe el id', () => {
  const b = emptyBridge();
  b.meals.push({ id: 'm1', date: '2026-06-09', name: 'Pan', kcal: 100 });
  const res = _updateInto(b, 'meals', { id: 'm1' }, { kcal: 120, id: 'HACK' });
  assert.equal(res.ok, true);
  assert.equal(b.meals[0].kcal, 120);
  assert.equal(b.meals[0].id, 'm1');               // id es autoridad del servidor
});

test('_updateInto: no encuentra → not_found, sin tocar nada', () => {
  const b = emptyBridge();
  const res = _updateInto(b, 'weights', { date: '2099-01-01' }, { fatKg: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_found');
});

test('_updateInto: ignora valores vacíos/null (no pisa con vacío)', () => {
  const b = emptyBridge();
  b.weights.push({ id: 'w1', date: '2026-06-04', weightKg: 104.8 });
  const res = _updateInto(b, 'weights', { date: '2026-06-04' }, { weightKg: '', fatKg: null, ffmi: 21.8 });
  assert.equal(res.fields, 1);                     // solo ffmi
  assert.equal(b.weights[0].weightKg, 104.8);      // no lo pisó con ''
});

// ── _prune: retención por sección (weights nunca; el resto, RETENTION[s] días) ────
const ymdDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

test('_prune: weights NO se poda aunque sea muy viejo', () => {
  assert.equal(RETENTION.weights, 0);              // contrato: 0 = sin poda
  const b = emptyBridge();
  b.weights.push({ id: 'w1', date: ymdDaysAgo(400) });
  _prune(b);
  assert.equal(b.weights.length, 1);
});

test('_prune: meals viejas (>30d) se podan; las recientes quedan', () => {
  const b = emptyBridge();
  b.meals.push({ id: 'm-old', date: ymdDaysAgo(40), name: 'vieja', kcal: 100 });
  b.meals.push({ id: 'm-new', date: ymdDaysAgo(5),  name: 'nueva', kcal: 100 });
  _prune(b);
  const ids = b.meals.map((m) => m.id);
  assert.deepEqual(ids, ['m-new']);
});
