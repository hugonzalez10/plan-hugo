// Tests de computeCompositionFocus: el foco de composición para la tarjeta de inicio.
// Elige un indicador de grasa que SÍ se mueve (real por prioridad o derivado), su
// trayectoria de largo plazo (arco, no scan-to-scan) y la historia de recomposición.
// Vive en src/analytics.mjs; el test lo importa directo.
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCompositionFocus, VISCERAL_GOAL } from '../src/analytics.mjs';

// Captura de Hugo: visceral pegada en índices enteros (16→13) mientras la grasa y el
// peso bajan de forma continua. La cintura (proxy de visceral) baja mucho más.
const SAMPLE = [
  { date: '2026-04-01', weightKg: 108.0, bodyFatPct: 34.0, skeletalMuscleKg: 39.0, visceralFat: 16, waistCm: 110.4 },
  { date: '2026-05-01', weightKg: 105.0, bodyFatPct: 32.5, skeletalMuscleKg: 39.8, visceralFat: 14, waistCm: 106.8 },
  { date: '2026-06-26', weightKg: 102.0, bodyFatPct: 31.3, skeletalMuscleKg: 40.1, visceralFat: 13, waistCm: 103.4 },
];

test('null sin datos', () => {
  assert.equal(computeCompositionFocus([], 'lose'), null);
  assert.equal(computeCompositionFocus(null, 'lose'), null);
});

test('prioriza fatKg real sobre subcutánea y derivada', () => {
  const data = [
    { date: '2026-05-01', weightKg: 105, bodyFatPct: 32, fatKg: 33.6, subcutaneousFatKg: 28 },
    { date: '2026-06-01', weightKg: 103, bodyFatPct: 31, fatKg: 31.9, subcutaneousFatKg: 27 },
  ];
  const f = computeCompositionFocus(data, 'lose');
  assert.equal(f.fat.key, 'fatKg');
  assert.equal(f.fat.derived, false);
  assert.equal(f.fat.last, 31.9);
});

test('usa subcutánea cuando no hay fatKg', () => {
  const data = [
    { date: '2026-05-01', weightKg: 105, bodyFatPct: 32, subcutaneousFatKg: 28.0 },
    { date: '2026-06-01', weightKg: 103, bodyFatPct: 31, subcutaneousFatKg: 26.8 },
  ];
  const f = computeCompositionFocus(data, 'lose');
  assert.equal(f.fat.key, 'subcutaneousFatKg');
  assert.equal(f.fat.derived, false);
});

test('deriva grasa total = peso × %grasa/100 cuando no hay grasa en kg', () => {
  const f = computeCompositionFocus(SAMPLE, 'lose');
  assert.equal(f.fat.key, 'fatMassKg');
  assert.equal(f.fat.derived, true);
  // Último: 102 × 31.3% = 31.93 → 31.9
  assert.equal(f.fat.last, 31.9);
  // Primero: 108 × 34% = 36.72 → 36.7
  assert.equal(f.fat.first, 36.7);
  assert.ok(f.fat.deltaArc < 0, 'la grasa derivada baja en el arco');
});

test('delta de arco usa primer→último, no el escaneo anterior', () => {
  const f = computeCompositionFocus(SAMPLE, 'lose');
  // Arco completo abr→jun, no jun vs may.
  assert.equal(f.fat.deltaArc, Number((31.9 - 36.7).toFixed(2)));
  assert.equal(f.fat.values.length, 3);
  assert.equal(f.fat.status, 'mejora');
});

test('recomposición: grasa baja sin perder músculo', () => {
  const f = computeCompositionFocus(SAMPLE, 'lose');
  assert.equal(f.recomp, true);
  assert.ok(f.muscle.deltaArc > 0, 'músculo sube en el arco');
});

test('peso fijo + músculo arriba ⇒ grasa derivada baja ⇒ recomp', () => {
  const data = [
    { date: '2026-05-01', weightKg: 100.0, bodyFatPct: 30.0, skeletalMuscleKg: 40.0, visceralFat: 12 },
    { date: '2026-06-01', weightKg: 100.0, bodyFatPct: 28.0, skeletalMuscleKg: 41.0, visceralFat: 12 },
  ];
  const f = computeCompositionFocus(data, 'lose');
  assert.ok(f.fat.deltaArc < 0, 'grasa baja aunque el peso no cambie');
  assert.equal(f.recomp, true);
});

test('visceral: arco largo + distancia a la meta', () => {
  const f = computeCompositionFocus(SAMPLE, 'lose');
  assert.equal(f.visceral.last, 13);
  assert.equal(f.visceral.first, 16);
  assert.equal(f.visceral.goal, VISCERAL_GOAL);
  assert.equal(f.visceral.toGoal, 3); // 13 - 10
  assert.equal(f.visceral.reached, false);
  assert.equal(f.visceral.deltaArc, -3);
});

test('cintura: trend con ≥2 puntos, bajar = mejora', () => {
  const f = computeCompositionFocus(SAMPLE, 'lose');
  assert.ok(f.waist);
  assert.equal(f.waist.key, 'waistCm');
  assert.equal(f.waist.unit, 'cm');
  assert.equal(f.waist.last, 103.4);
  assert.equal(f.waist.deltaArc, -7);
  assert.equal(f.waist.status, 'mejora');
});

test('cintura: null con <2 puntos o sin dato', () => {
  const oneWaist = [
    { date: '2026-05-01', weightKg: 105, bodyFatPct: 32, waistCm: 105 },
    { date: '2026-06-01', weightKg: 103, bodyFatPct: 31 },
  ];
  assert.equal(computeCompositionFocus(oneWaist, 'lose').waist, null);
  const noWaist = [
    { date: '2026-05-01', weightKg: 105, bodyFatPct: 32 },
    { date: '2026-06-01', weightKg: 103, bodyFatPct: 31 },
  ];
  assert.equal(computeCompositionFocus(noWaist, 'lose').waist, null);
});

test('visceral alcanzada cuando ≤ meta', () => {
  const data = [
    { date: '2026-05-01', weightKg: 90, bodyFatPct: 20, visceralFat: 11 },
    { date: '2026-06-01', weightKg: 88, bodyFatPct: 18, visceralFat: 9 },
  ];
  const f = computeCompositionFocus(data, 'lose');
  assert.equal(f.visceral.reached, true);
  assert.equal(f.visceral.toGoal, 0);
});

test('un solo escaneo: headline estático sin trayectoria, sin recomp', () => {
  const data = [{ date: '2026-06-26', weightKg: 102, bodyFatPct: 31.3, skeletalMuscleKg: 40.1, visceralFat: 13 }];
  const f = computeCompositionFocus(data, 'lose');
  assert.ok(f.fat);
  assert.equal(f.fat.deltaArc, 0);
  assert.equal(f.fat.values.length, 1);
  assert.equal(f.recomp, false);
  assert.equal(f.visceral.last, 13);
});

test('fase de volumen: subir grasa cuenta como mejora', () => {
  const data = [
    { date: '2026-05-01', weightKg: 100, bodyFatPct: 15, skeletalMuscleKg: 42 },
    { date: '2026-06-01', weightKg: 103, bodyFatPct: 16, skeletalMuscleKg: 43 },
  ];
  const f = computeCompositionFocus(data, 'gain');
  assert.ok(f.fat.deltaArc > 0);
  assert.equal(f.fat.status, 'mejora');
});
