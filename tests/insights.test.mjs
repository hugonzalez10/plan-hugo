// Test del motor de insights proactivos deterministas (sin IA). Puro: hora y fecha de referencia
// entran por options. Cubre proteína/agua/exceso/racha/peso, severidad y orden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProactiveInsights } from '../src/analytics.mjs';

const T = {
  kcalMax: 2000, kcalRed: 2160, kcalMin: 1840,
  proteinMin: 200, proteinYellow: 174,
  carbsTarget: 200, fatTarget: 67, fiberTarget: 30, waterTarget: 3000,
};
// Extra que cuenta en su slot. source 'app' + mealSlot del plan → extraPlanSlot lo ubica.
const extra = (over) => ({ id: 'x' + Math.round(over.kcal || 0) + (over.protein || 0), name: 'Comida', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, mealSlot: 'almuerzo', source: 'app', ...over });
const stateWith = (days, weights = []) => ({ days, weights, snackBank: [], proteinBank: [], dessertBank: [], antojoCustomItems: [] });
const has = (ins, frag) => ins.some((i) => i.title.toLowerCase().includes(frag));

test('proteína: brecha grande de noche → insight urgente', () => {
  const st = stateWith({ '2026-06-26': { eaten: {}, extras: [extra({ kcal: 900, protein: 100 })], water: { ml: 3000 } } });
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 20, refDate: '2026-06-26' });
  const p = ins.find((i) => i.title.toLowerCase().includes('proteína'));
  assert.ok(p, 'debe haber insight de proteína');
  assert.equal(p.severity, 'urgent');
});

test('proteína: misma brecha a mediodía → NO avisa (demasiado temprano)', () => {
  const st = stateWith({ '2026-06-26': { eaten: {}, extras: [extra({ kcal: 900, protein: 100 })], water: { ml: 3000 } } });
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 12, refDate: '2026-06-26' });
  assert.ok(!has(ins, 'proteína'));
});

test('agua: lejos de la meta en la tarde → aviso con acción de agua', () => {
  const st = stateWith({ '2026-06-26': { eaten: {}, extras: [extra({ kcal: 1900, protein: 190 })], water: { ml: 1000 } } });
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 19, refDate: '2026-06-26' });
  const w = ins.find((i) => i.title.toLowerCase().includes('agua'));
  assert.ok(w);
  assert.equal(w.action.kind, 'water500');
});

test('exceso de kcal sobre el umbral rojo → aviso', () => {
  const st = stateWith({ '2026-06-26': { eaten: {}, extras: [extra({ kcal: 2400, protein: 190 })], water: { ml: 3000 } } });
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 21, refDate: '2026-06-26' });
  assert.ok(ins.some((i) => i.title.toLowerCase().includes('sobre la meta')));
});

test('peso desactualizado (≥10 días) → insight info', () => {
  const st = stateWith(
    { '2026-06-26': { eaten: {}, extras: [extra({ kcal: 1900, protein: 190 })], water: { ml: 3000 } } },
    [{ id: 'w1', date: '2026-06-10', weightKg: 90 }]
  );
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 12, refDate: '2026-06-26' });
  const wt = ins.find((i) => i.title.toLowerCase().includes('sin pesarte'));
  assert.ok(wt);
  assert.equal(wt.severity, 'info');
  assert.equal(wt.action.kind, 'logWeight');
});

test('racha en juego: días previos cumplidos, hoy sin cerrar y de noche', () => {
  const met = () => ({ eaten: {}, extras: [extra({ kcal: 1900, protein: 190 })], water: { ml: 3000 } });
  const days = {
    '2026-06-23': met(), '2026-06-24': met(), '2026-06-25': met(),
    '2026-06-26': { eaten: {}, extras: [], water: { ml: 0 } }, // hoy vacío
  };
  const ins = computeProactiveInsights(stateWith(days), '2026-06-26', T, { hour: 20, refDate: '2026-06-26' });
  const r = ins.find((i) => i.title.toLowerCase().includes('racha') && i.title.toLowerCase().includes('en juego'));
  assert.ok(r, 'debe avisar que la racha está en juego');
  assert.match(r.title, /3 días/);
});

test('día cumplido con racha ≥3 → insight positivo', () => {
  const met = () => ({ eaten: {}, extras: [extra({ kcal: 1900, protein: 190 })], water: { ml: 3000 } });
  const days = { '2026-06-24': met(), '2026-06-25': met(), '2026-06-26': met() };
  const ins = computeProactiveInsights(stateWith(days), '2026-06-26', T, { hour: 21, refDate: '2026-06-26' });
  assert.ok(ins.some((i) => i.severity === 'good' && i.title.toLowerCase().includes('racha')));
});

test('orden: lo urgente va primero', () => {
  const st = stateWith(
    { '2026-06-26': { eaten: {}, extras: [extra({ kcal: 900, protein: 80 })], water: { ml: 3000 } } },
    [{ id: 'w1', date: '2026-06-10', weightKg: 90 }] // peso viejo → info
  );
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 20, refDate: '2026-06-26' });
  assert.ok(ins.length >= 2);
  assert.equal(ins[0].severity, 'urgent'); // proteína urgente antes que el info de peso
});

test('día tranquilo y temprano sin pesajes → sin ruido (lista vacía)', () => {
  const st = stateWith({ '2026-06-26': { eaten: {}, extras: [extra({ kcal: 1900, protein: 190 })], water: { ml: 3000 } } });
  const ins = computeProactiveInsights(st, '2026-06-26', T, { hour: 11, refDate: '2026-06-26' });
  assert.deepEqual(ins, []);
});
