// Fase 1: las decisiones de ajuste deben correr sobre la TENDENCIA del peso (regresión /
// SMA temporal), no sobre lecturas crudas. El agua corporal mueve ±1.5 kg de un día a otro
// y eso disparaba falsos "bajas muy rápido". Aquí construimos series con tendencia real
// conocida + ruido y verificamos que el clasificador no se deja engañar por el ruido.
// Funciones puras sin JSX: se extraen de app.jsx con regex (mismo patrón que los demás tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

function extractFn(name) {
  // No anclamos en `)` ni `{` de la firma: defaults como `new Date()` u `options = {}` los
  // romperían. Tomamos desde `function NAME(` hasta el primer `}` a inicio de línea (= cierre).
  const m = appSrc.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(m, `no se encontró ${name} en app.jsx`);
  return m[0];
}
const weeklyLossM = appSrc.match(/const WEEKLY_LOSS = \{[^}]*\};/);
assert.ok(weeklyLossM, 'no se encontró WEEKLY_LOSS');

const NAMES = [
  'todayKey', 'daysBetween', 'getRuleWeekKeys', 'smaAt', 'weightSeries',
  'trendWeightAt', 'linRegSlopePerDay', 'weekAvgWeight',
  'computeWeeklyLossRate', 'computePlanAdjustment',
];
const body = weeklyLossM[0] + '\n' + NAMES.map(extractFn).join('\n');
const exported = new Function(`${body}\n return { ${NAMES.join(', ')} };`)();
const {
  todayKey, linRegSlopePerDay, trendWeightAt, computeWeeklyLossRate, computePlanAdjustment,
} = exported;

// Genera nDays de pesos diarios terminando en endDateKey, con tendencia lineal slopePerDay
// (kg/día) sobre startWeight + ruido determinista de noiseArr. Opcional override del último día.
function mkWeights(slopePerDay, startWeight, nDays, endDateKey, noiseArr, lastOverride) {
  const out = [];
  const end = new Date(endDateKey + 'T12:00:00');
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const dayIdx = nDays - 1 - i; // 0..nDays-1 ascendente
    const noise = noiseArr[dayIdx % noiseArr.length];
    let kg = startWeight + slopePerDay * dayIdx + noise;
    if (dayIdx === nDays - 1 && lastOverride != null) kg = startWeight + slopePerDay * dayIdx + lastOverride;
    out.push({ date: todayKey(d), weightKg: Number(kg.toFixed(2)) });
  }
  return out;
}

const NOISE = [1.4, -1.2, 0.6, -0.8, 1.1, -1.5, 0.3]; // ±1.5 kg, media ~0
const END = '2026-06-28';

test('regresión recupera la pendiente real bajo ruido', () => {
  // 90 kg bajando 0.1 kg/día durante 29 días, con ruido ±1.5 kg.
  const w = mkWeights(-0.1, 90, 29, END, NOISE);
  const slope = linRegSlopePerDay(w);
  assert.ok(Math.abs(slope - (-0.1)) < 0.02, `slope ${slope} lejos de -0.1`);
});

test('peso-tendencia ≈ media local, no la última lectura ruidosa', () => {
  // Peso plano 88 kg con un spike de +1.5 el último día.
  const w = mkWeights(0, 88, 14, END, NOISE, 1.5);
  const trend = trendWeightAt(w, END, 10);
  assert.ok(Math.abs(trend - 88) < 0.6, `tendencia ${trend} se dejó llevar por el spike`);
});

test('tendencia real de -0.5%/sem NO se clasifica como fast', () => {
  // 90 kg, -0.45 kg/sem = -0.0643 kg/día → 0.5 %/sem (banda ok). Con ruido + spike adverso.
  const w = mkWeights(-0.45 / 7, 90, 29, END, NOISE, 1.6);
  const rate = computeWeeklyLossRate(w, END);
  assert.ok(rate, 'rate null');
  assert.notEqual(rate.status, 'fast', `clasificó fast con tendencia 0.5%/sem (pct ${rate.pctPerWeek})`);

  const adj = computePlanAdjustment({ userProfile: { goal: 'lose', kcalDeficit: 400 }, weights: w }, END);
  assert.ok(adj == null || adj.kind !== 'too_fast', `disparó too_fast por ruido: ${JSON.stringify(adj)}`);
});

test('tendencia real de -1.2%/sem SÍ se clasifica como fast pese a un spike reciente', () => {
  // 90 kg, -1.08 kg/sem = -0.154 kg/día → 1.2 %/sem. Último día con spike UP que despistaría
  // a un método "última vs primera lectura".
  const w = mkWeights(-1.08 / 7, 90, 29, END, NOISE, 1.6);
  const rate = computeWeeklyLossRate(w, END);
  assert.equal(rate.status, 'fast', `no detectó fast (pct ${rate.pctPerWeek})`);

  const adj = computePlanAdjustment({ userProfile: { goal: 'lose', kcalDeficit: 400 }, weights: w }, END);
  assert.ok(adj && adj.kind === 'too_fast', `no sugirió bajar déficit: ${JSON.stringify(adj)}`);
});
