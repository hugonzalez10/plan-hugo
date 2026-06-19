// Tests de computeEvolution: la trayectoria completa primer→último pesaje por métrica de
// composición. computeEvolution + EVOLUTION_METRICS viven en src/analytics.mjs y evalMetric +
// REFERENCE_RANGES en src/metrics.mjs; el test los importa directo.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalMetric } from '../src/metrics.mjs';
import { computeEvolution } from '../src/analytics.mjs';

// Datos reales de la captura (27/5 → 4/6).
const SAMPLE = [
  { date: '2026-05-27', weightKg: 105.1, bodyFatPct: 33.5, visceralFat: 15 },
  { date: '2026-05-30', weightKg: 106.0, bodyFatPct: 33.6, visceralFat: 15 },
  { date: '2026-06-02', weightKg: 105.4, bodyFatPct: 33.0, visceralFat: 14 },
  { date: '2026-06-04', weightKg: 104.8, bodyFatPct: 32.3, visceralFat: 14 },
];

test('null si hay menos de 2 pesajes', () => {
  assert.equal(computeEvolution([], 'lose'), null);
  assert.equal(computeEvolution([{ date: '2026-06-04', weightKg: 104.8 }], 'lose'), null);
});

test('delta usa primer y último valor, no min/max', () => {
  const ev = computeEvolution(SAMPLE, 'lose');
  assert.ok(ev);
  const peso = ev.metrics.find((m) => m.key === 'weightKg');
  assert.equal(peso.first, 105.1);
  assert.equal(peso.last, 104.8);
  assert.equal(peso.delta, -0.3); // bajó pese a haber subido a 106 en el medio
});

test('clasifica mejora/empeora/estable según la dirección deseada (lose)', () => {
  const ev = computeEvolution(SAMPLE, 'lose');
  const peso = ev.metrics.find((m) => m.key === 'weightKg');
  const grasa = ev.metrics.find((m) => m.key === 'bodyFatPct');
  const visc = ev.metrics.find((m) => m.key === 'visceralFat');
  assert.equal(peso.status, 'mejora');   // -0.3 kg, bajar es mejor
  assert.equal(grasa.status, 'mejora');  // 33.5 → 32.3
  assert.equal(visc.status, 'mejora');   // 15 → 14
});

test('músculo: subir es mejor, bajar empeora', () => {
  const data = [
    { date: '2026-05-27', weightKg: 105, muscleKg: 66.5 },
    { date: '2026-06-04', weightKg: 104, muscleKg: 66.1 },
  ];
  const ev = computeEvolution(data, 'lose');
  const m = ev.metrics.find((x) => x.key === 'muscleKg');
  assert.equal(m.delta, -0.4);
  assert.equal(m.status, 'empeora');
});

test('zona muerta: cambio menor al eps es estable', () => {
  const data = [
    { date: '2026-05-27', weightKg: 105.0 },
    { date: '2026-06-04', weightKg: 105.1 }, // +0.1 kg < eps 0.2
  ];
  const ev = computeEvolution(data, 'lose');
  assert.equal(ev.metrics.find((m) => m.key === 'weightKg').status, 'estable');
});

test('ritmo semanal se normaliza por días del rango', () => {
  const data = [
    { date: '2026-05-28', weightKg: 105.0 },
    { date: '2026-06-04', weightKg: 104.0 }, // -1 kg en 7 días
  ];
  const ev = computeEvolution(data, 'lose');
  const peso = ev.metrics.find((m) => m.key === 'weightKg');
  assert.equal(peso.days, 7);
  assert.equal(peso.weekly, -1);
});

test('solo incluye métricas con ≥2 puntos en el historial', () => {
  const data = [
    { date: '2026-05-27', weightKg: 105, waistCm: 110 },
    { date: '2026-06-04', weightKg: 104 }, // sin waist en el 2º
  ];
  const ev = computeEvolution(data, 'lose');
  assert.ok(ev.metrics.find((m) => m.key === 'weightKg'));
  assert.equal(ev.metrics.find((m) => m.key === 'waistCm'), undefined);
});

test('recomp: baja grasa y mantiene músculo', () => {
  const data = [
    { date: '2026-05-27', weightKg: 105, fatKg: 35, muscleKg: 66.0 },
    { date: '2026-06-04', weightKg: 103, fatKg: 33, muscleKg: 66.1 },
  ];
  const ev = computeEvolution(data, 'lose');
  assert.equal(ev.recomp, true);
});

test('goal gain invierte la dirección del peso pero no del músculo', () => {
  const data = [
    { date: '2026-05-27', weightKg: 80, muscleKg: 60 },
    { date: '2026-06-04', weightKg: 82, muscleKg: 61 },
  ];
  const ev = computeEvolution(data, 'gain');
  assert.equal(ev.metrics.find((m) => m.key === 'weightKg').status, 'mejora'); // subir peso = mejora en gain
  assert.equal(ev.metrics.find((m) => m.key === 'muscleKg').status, 'mejora'); // músculo siempre sube=mejora
});

test('metadatos del rango: spanDays, count, fechas', () => {
  const ev = computeEvolution(SAMPLE, 'lose');
  assert.equal(ev.count, 4);
  assert.equal(ev.firstDate, '2026-05-27');
  assert.equal(ev.lastDate, '2026-06-04');
  assert.equal(ev.spanDays, 8);
});

// ── evalMetric: semáforo por rangos de referencia ───────────────────────────────
test('evalMetric clasifica con los valores reales de Hugo (hombre)', () => {
  const M = { sex: 'M' };
  assert.equal(evalMetric('bodyFatPct', 33.0, M), 'Muy alto');
  assert.equal(evalMetric('bmi', 32.5, M), 'Muy alto');       // obesidad
  assert.equal(evalMetric('visceralFat', 14, M), 'Alto');
  assert.equal(evalMetric('visceralFat', 15, M), 'Muy alto');
  assert.equal(evalMetric('waistHipRatio', 0.93, M), 'Alto');
  assert.equal(evalMetric('ffmi', 21.7, M), 'Bien');
});

test('evalMetric respeta el sexo y los límites de banda', () => {
  assert.equal(evalMetric('bodyFatPct', 18, { sex: 'M' }), 'Bien');
  assert.equal(evalMetric('bodyFatPct', 18, { sex: 'F' }), 'Bien');
  assert.equal(evalMetric('bodyFatPct', 30, { sex: 'F' }), 'Alto');
  assert.equal(evalMetric('bmi', 24.9, undefined), 'Bien');   // default hombre
  assert.equal(evalMetric('bmi', 25, undefined), 'Alto');     // límite exclusivo
});

test('evalMetric devuelve null sin rango o sin valor', () => {
  assert.equal(evalMetric('weightKg', 105, { sex: 'M' }), null); // peso no lleva semáforo
  assert.equal(evalMetric('muscleKg', 65, { sex: 'M' }), null);  // kg de músculo: sin rango absoluto
  assert.equal(evalMetric('bmi', null, { sex: 'M' }), null);
  assert.equal(evalMetric('bmi', '', { sex: 'M' }), null);
});
