// Test directo de mergeBridge — el corazón de la reconciliación app↔bridge (app.jsx).
// Hasta ahora solo se probaba el lado .gs y helpers sueltos; mergeBridge no tenía test propio
// pese a concentrar los bugs históricos (doble-conteo, divergencia, fechas, dedup).
//
// app.jsx es un IIFE sin exports, así que —igual que double-count.test.mjs— extraemos la
// función y su cierre de dependencias por regex y las instanciamos con `new Function`. Las
// declaraciones de función se hoistean; los `const` se ponen antes (BODY_TYPE_OPTIONS antes
// de STRING_FIELDS, que lo referencia).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { todayKey } from '../src/dates.mjs';
import { normalizeName } from '../src/util.mjs';
import { extraPlanSlot, resolveColacion, computeDayTotals } from '../src/meals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

function grab(re, label) {
  const m = appSrc.match(re);
  assert.ok(m, `no se extrajo ${label} de app.jsx (¿cambió la forma?)`);
  return m[0];
}
function fn(name) {
  // [^{]* en los params (no [^)]*) para tolerar defaults con paréntesis, p.ej. todayKey(d = new Date()).
  return grab(new RegExp('function ' + name + '\\s*\\([^{]*\\)\\s*\\{[\\s\\S]*?\\n\\}'), `function ${name}`);
}

const bundle = [
  grab(/const WORKOUT_EXTRA_FIELDS = \[[\s\S]*?\];/, 'WORKOUT_EXTRA_FIELDS'),
  grab(/const WEIGHT_FIELDS = \[[\s\S]*?\n\];/, 'WEIGHT_FIELDS'),
  grab(/const SEGMENT_FIELDS = \[[\s\S]*?\n\];/, 'SEGMENT_FIELDS'),
  grab(/const BODY_TYPE_OPTIONS = \[[\s\S]*?\];/, 'BODY_TYPE_OPTIONS'),
  grab(/const STRING_FIELDS = \[[\s\S]*?\n\];/, 'STRING_FIELDS'),
  grab(/const DEDUP_WINDOW_MS = [^;]*;/, 'DEDUP_WINDOW_MS'),
  fn('chatMealSig'), fn('sameWindow'),
  fn('bridgeDateKey'), fn('healthDateKey'), fn('getDeviceId'), fn('mergeBridge'),
  'return { mergeBridge, healthDateKey };',
].join('\n');
// todayKey (dates) + normalizeName (util) + extraPlanSlot/resolveColacion/computeDayTotals (meals)
// se inyectan al cierre: chatMealSig/mergeBridge los llaman.
const { mergeBridge, healthDateKey } = new Function(
  'todayKey', 'normalizeName', 'extraPlanSlot', 'resolveColacion', 'computeDayTotals', bundle
)(todayKey, normalizeName, extraPlanSlot, resolveColacion, computeDayTotals);

// --- helpers de fixture ---
const baseState = () => ({ days: {}, weights: [], energy: [], bridge: { importedIds: [], removedBridgeIds: [] } });
const baseBridge = (over = {}) => ({
  meals: [], workouts: [], weights: [], water: [], health: [], checks: [],
  energy: [], routine: null, exercise_videos: {}, ...over,
});
const mkDay = (extras = []) => ({ eaten: {}, extras, exercise: [], water: { ml: 0 } });

test('importa una comida nueva del bridge como extra skill-chat en su fecha', () => {
  const bridge = baseBridge({ meals: [{ id: 'm1', date: '2026-06-10', name: 'Tostadas', kcal: 300, protein: 12, mealSlot: 'desayuno' }] });
  const { state, added } = mergeBridge(baseState(), bridge);
  assert.equal(added.meals, 1);
  const extras = state.days['2026-06-10'].extras;
  assert.equal(extras.length, 1);
  assert.equal(extras[0].name, 'Tostadas');
  assert.equal(extras[0].source, 'skill-chat');
  assert.ok(state.bridge.importedIds.includes('m1'));
});

test('comida sin date pero con ts cae en el día del ts, NO en hoy (bug de divergencia)', () => {
  const ts = new Date('2025-01-15T12:00:00').getTime(); // un día claramente pasado
  const bridge = baseBridge({ meals: [{ id: 'm2', ts, name: 'Café', kcal: 5 }] });
  const { state } = mergeBridge(baseState(), bridge);
  assert.deepEqual(Object.keys(state.days), ['2025-01-15']);
  assert.ok(!state.days[todayKey()], 'no se planta en hoy');
});

test('dedup por id + reconcilia campos mutables de un meal skill-chat (no duplica)', () => {
  const r1 = mergeBridge(baseState(), baseBridge({ meals: [{ id: 'm3', date: '2026-06-10', name: 'Pollo', kcal: 400, protein: 40, mealSlot: 'almuerzo' }] }));
  // el chat corrige el mismo id: pasa a cena con más kcal
  const r2 = mergeBridge(r1.state, baseBridge({ meals: [{ id: 'm3', date: '2026-06-10', name: 'Pollo', kcal: 450, protein: 45, mealSlot: 'cena' }] }));
  const ex = r2.state.days['2026-06-10'].extras;
  assert.equal(ex.length, 1, 'no duplica por id');
  assert.equal(ex[0].kcal, 450, 'reconcilia kcal');
  assert.equal(ex[0].mealSlot, 'cena', 'reconcilia el slot');
});

test('dedup por contenido+ventana: el eco app→bridge (id de servidor distinto) no se re-agrega', () => {
  const ts = new Date('2026-06-10T13:00:00').getTime();
  const s0 = baseState();
  // extra de la app (source no skill-chat) que ya empujamos al bridge
  s0.days['2026-06-10'] = mkDay([{ id: 'local-1', ts, name: 'Ensalada', kcal: 200, mealSlot: 'almuerzo', source: 'manual' }]);
  // el bridge lo devuelve con id de servidor y +1 min
  const bridge = baseBridge({ meals: [{ id: 'srv-9', date: '2026-06-10', ts: ts + 60_000, name: 'Ensalada', kcal: 200, mealSlot: 'almuerzo' }] });
  const { state, added } = mergeBridge(s0, bridge);
  assert.equal(added.meals, 0, 'absorbido por contenido+ventana');
  assert.equal(state.days['2026-06-10'].extras.length, 1);
  assert.ok(state.bridge.importedIds.includes('srv-9'));
});

test('removedBridgeIds frena la reimportación de un borrado deliberado', () => {
  const s0 = baseState();
  s0.bridge.removedBridgeIds = ['m9'];
  const bridge = baseBridge({ meals: [{ id: 'm9', date: '2026-06-10', name: 'Borrada', kcal: 100 }] });
  const { state, added } = mergeBridge(s0, bridge);
  assert.equal(added.meals, 0);
  assert.ok(!state.days['2026-06-10'], 'ni siquiera crea el día');
});

test('reconciliación: poda el extra skill-chat huérfano (ya no está en el bridge), respeta los de la app', () => {
  const s0 = baseState();
  s0.days['2026-06-10'] = mkDay([
    { id: 'gone', ts: 1, name: 'Vieja', kcal: 100, mealSlot: 'cena', source: 'skill-chat' },
    { id: 'keep-manual', ts: 1, name: 'Mía', kcal: 50, mealSlot: 'cena', source: 'manual' },
  ]);
  // el bridge cubre ese día con OTRO meal (dispara la reconciliación), pero 'gone' desapareció
  const bridge = baseBridge({ meals: [{ id: 'new1', date: '2026-06-10', name: 'Nueva', kcal: 300, mealSlot: 'almuerzo' }] });
  const ids = mergeBridge(s0, bridge).state.days['2026-06-10'].extras.map((x) => x.id);
  assert.ok(!ids.includes('gone'), 'huérfano skill-chat podado');
  assert.ok(ids.includes('keep-manual'), 'extra manual intacto');
  assert.ok(ids.includes('new1'), 'el nuevo se importó');
});

test('pesos: una medición por día; un segundo sync completa campos sin duplicar', () => {
  const r1 = mergeBridge(baseState(), baseBridge({ weights: [{ id: 'w1', date: '2026-06-10', weightKg: 80 }] }));
  assert.equal(r1.added.weights, 1);
  assert.equal(r1.state.weights.length, 1);
  assert.equal(r1.state.weights[0].weightKg, 80);
  const r2 = mergeBridge(r1.state, baseBridge({ weights: [{ id: 'w1', date: '2026-06-10', weightKg: 80, bodyFatPct: 18 }] }));
  assert.equal(r2.state.weights.length, 1, 'no duplica la medición del día');
  assert.equal(r2.state.weights[0].bodyFatPct, 18, 'mergea el campo nuevo');
});

test('agua: suma en day.water.bridgeMl y es idempotente por importedIds (no re-suma)', () => {
  const bridge = baseBridge({ water: [{ id: 'aq1', date: '2026-06-10', ml: 500 }] });
  const r1 = mergeBridge(baseState(), bridge);
  assert.equal(r1.state.days['2026-06-10'].water.bridgeMl, 500);
  assert.equal(r1.added.water, 1);
  const r2 = mergeBridge(r1.state, bridge); // mismo id
  assert.equal(r2.state.days['2026-06-10'].water.bridgeMl, 500, 'freno duro: no re-suma');
  assert.equal(r2.added.water, 0);
});

test('agua: el eco propio (source app + deviceId propio) NO suma a bridgeMl; chat y otros device SÍ', () => {
  // En node getDeviceId() → "dev-unknown" (sin localStorage). Una entrada source:'app' con ese
  // deviceId es eco propio → ya está en water.ml, no se suma a bridgeMl. El agua del chat (sin
  // deviceId) y la de otro dispositivo (otro deviceId) sí se importan.
  const bridge = baseBridge({ water: [
    { id: 'own', date: '2026-06-10', ml: 250, source: 'app', deviceId: 'dev-unknown' }, // eco propio → excluir
    { id: 'oth', date: '2026-06-10', ml: 300, source: 'app', deviceId: 'otro-iphone' },  // otro device → importar
    { id: 'chat', date: '2026-06-10', ml: 400 },                                         // chat → importar
  ] });
  const r = mergeBridge(baseState(), bridge);
  assert.equal(r.state.days['2026-06-10'].water.bridgeMl, 700, 'solo otro-device (300) + chat (400)');
  assert.equal(r.added.water, 3, 'las 3 se marcan importadas (importedIds), aunque una no sume');
});

test('checks: marca la sección como comida, pero NO si ya hay un extra que la cubre', () => {
  // (a) sin extra → marca eaten.cena
  const ra = mergeBridge(baseState(), baseBridge({ checks: [{ id: 'c1', date: '2026-06-10', meal: 'cena' }] }));
  assert.equal(ra.state.days['2026-06-10'].eaten.cena, true);
  // (b) con un extra de cena ya logueado → no marca el plan (evita kcal fantasma)
  const s1 = baseState();
  s1.days['2026-06-10'] = mkDay([{ id: 'e1', ts: 1, name: 'Cena - algo', kcal: 300, mealSlot: 'cena', source: 'skill-chat' }]);
  const rb = mergeBridge(s1, baseBridge({ checks: [{ id: 'c2', date: '2026-06-10', meal: 'cena' }] }));
  assert.notEqual(rb.state.days['2026-06-10'].eaten.cena, true, 'el extra ya cubre la cena');
});

test('health: overwrite por fecha, idempotente y sin usar importedIds', () => {
  const r1 = mergeBridge(baseState(), baseBridge({ health: [{ date: '2026-06-10', steps: 8000, activeEnergyKcal: 400 }] }));
  assert.equal(r1.state.days['2026-06-10'].health.steps, 8000);
  // re-post del mismo día con pasos nuevos → sobreescribe (el Shortcut re-postea el día completo)
  const r2 = mergeBridge(r1.state, baseBridge({ health: [{ date: '2026-06-10', steps: 9000 }] }));
  assert.equal(r2.state.days['2026-06-10'].health.steps, 9000, 'overwrite por fecha');
  assert.equal(r2.state.days['2026-06-10'].health.activeEnergyKcal, 400, 'conserva lo no reenviado');
});

test('healthDateKey normaliza el dd-MM-yy del atajo iOS (la etiqueta date es la autoridad)', () => {
  // El atajo manda "16-06-26" (dd-MM-yy); antes caía al fallback de ts. Ahora es la autoridad.
  assert.equal(healthDateKey({ date: '16-06-26' }), '2026-06-16');
  assert.equal(healthDateKey({ date: '2026-06-16' }), '2026-06-16'); // YYYY-MM-DD limpio intacto
  // dd-MM-yy con ts del día siguiente (atajo corrió pasada la medianoche) → manda la fecha, no el ts
  const tsNextDay = new Date('2026-06-17T00:30:00').getTime();
  assert.equal(healthDateKey({ date: '16-06-26', ts: tsNextDay }), '2026-06-16');
  // fecha ilegible → cae al ts
  assert.equal(healthDateKey({ date: 'basura', ts: new Date('2026-06-16T12:00:00').getTime() }), '2026-06-16');
  // mes inválido en formato dd-MM-yy → no lo acepta, cae al ts
  assert.equal(healthDateKey({ date: '16-13-26', ts: new Date('2026-06-16T12:00:00').getTime() }), '2026-06-16');
});

test('health con date dd-MM-yy del atajo aterriza en el día correcto vía mergeBridge', () => {
  const r = mergeBridge(baseState(), baseBridge({ health: [{ date: '16-06-26', steps: 9665, activeEnergyKcal: 879 }] }));
  assert.equal(r.state.days['2026-06-16'].health.steps, 9665);
});
