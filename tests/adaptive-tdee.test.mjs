// Fase 2: TDEE adaptativo. Reconstruye el gasto real desde el balance energético
//   gasto ≈ ingesta_media + (peso_tendencia_inicio − peso_tendencia_fin) × 7700 / días
// y reemplaza a Mifflin como base de la meta cuando hay datos. Aquí inyectamos un stub de
// computeDayTotals (que solo suma kcal de extras) para probar la MATEMÁTICA del balance de
// forma aislada, sin arrastrar toda la maquinaria de totales del día.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { todayKey, daysBetween } from '../src/dates.mjs';
import { weightSeries, linRegSlopePerDay } from '../src/energy.mjs';
import { calcTargets, KCAL_PER_KG_FAT } from '../src/nutrition.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '..', 'app.jsx'), 'utf8');

function extractFn(name) {
  const m = appSrc.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(m, `no se encontró ${name}`);
  return m[0];
}

// La fórmula (calcMifflinStJeor/calcTargets + constantes) vive en src/nutrition.mjs y la math de
// peso en src/energy.mjs. Solo computeAdaptiveTDEE sigue en app.jsx: se extrae por regex y se le
// inyecta su cierre. Stub de computeDayTotals: kcalIn = suma de kcal de los extras (lo único que
// usa el balance), el resto en 0.
const computeDayTotalsStub = (day) => { const e = (day && day.extras) || []; return { kcalIn: e.reduce((s, x) => s + (Number(x.kcal) || 0), 0), protein: 0, carbs: 0, fat: 0, fiber: 0, waterMl: 0 }; };
const computeAdaptiveTDEE = new Function(
  'todayKey', 'daysBetween', 'weightSeries', 'linRegSlopePerDay', 'calcTargets', 'KCAL_PER_KG_FAT', 'computeDayTotals',
  `${extractFn('computeAdaptiveTDEE')}\n return computeAdaptiveTDEE;`
)(todayKey, daysBetween, weightSeries, linRegSlopePerDay, calcTargets, KCAL_PER_KG_FAT, computeDayTotalsStub);

const PROFILE = { sex: 'M', age: 36, heightCm: 178, weightKg: 90, activityLevel: 'moderate', goal: 'lose', kcalDeficit: 400 };

// Construye un state sintético: `intake` kcal/día como extra, y pesos diarios linealmente
// decrecientes a `lossPerDay` kg, cubriendo desde end-(coverDays) hasta end (ventanas SMA llenas).
function mkState(endKey, intake, lossPerDay, coverDays = 31, startWeight = 90, logEveryDay = true) {
  const end = new Date(endKey + 'T12:00:00');
  const days = {};
  const weights = [];
  for (let i = 0; i < coverDays; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const k = todayKey(d);
    weights.push({ date: k, weightKg: Number((startWeight - lossPerDay * (coverDays - 1 - i)).toFixed(3)) });
    if (logEveryDay || i % 1 === 0) days[k] = { extras: [{ name: 'comida', kcal: intake }] };
  }
  return { userProfile: PROFILE, days, weights };
}

const END = '2026-06-28';

test('TDEE adaptativo recupera el gasto del balance energético (intake 2000, déficit 200)', () => {
  // Para gasto real 2200 con intake 2000: déficit 200 kcal/día → pierde 200/7700 kg/día.
  const lossPerDay = 200 / 7700;
  const st = mkState(END, 2000, lossPerDay);
  const r = computeAdaptiveTDEE(st, END);
  assert.ok(r, 'devolvió null con datos suficientes');
  assert.equal(r.basis, 'adaptive');
  assert.ok(Math.abs(r.tdee - 2200) <= 25, `TDEE ${r.tdee} lejos de 2200`);
});

test('peso estable + intake 2400 → TDEE ≈ intake', () => {
  const st = mkState(END, 2400, 0);
  const r = computeAdaptiveTDEE(st, END);
  assert.ok(r, 'null con peso estable');
  assert.ok(Math.abs(r.tdee - 2400) <= 25, `TDEE ${r.tdee} lejos de 2400`);
});

test('cobertura insuficiente (pocos días registrados) → null (cae a fórmula)', () => {
  const st = mkState(END, 2000, 200 / 7700);
  // Borra casi todos los días registrados: deja 4 de 21.
  const keys = Object.keys(st.days).sort();
  for (const k of keys.slice(0, keys.length - 4)) delete st.days[k];
  const r = computeAdaptiveTDEE(st, END);
  assert.equal(r, null);
});

test('clamp de sanidad: pérdida absurda no infla el TDEE sin tope', () => {
  // Pérdida de 0.5 kg/día (irreal) → balance daría >5000 kcal; debe quedar topado.
  const st = mkState(END, 2000, 0.5);
  const r = computeAdaptiveTDEE(st, END);
  assert.ok(r, 'null');
  // El clamp es 1.4× Mifflin (BMR 1837.5 × 1.55 = 2848 → tope 3987). El raw sin tope sería
  // 2000 + 0.5×7700 ≈ 5850, así que cualquier valor ≤4000 confirma que el clamp actuó.
  assert.ok(r.tdee <= 4000, `TDEE ${r.tdee} no respetó el clamp`);
  assert.ok(r.clampedFromRaw, 'no marcó que vino del clamp');
});

test('calcTargets usa el TDEE adaptativo como base (reemplaza Mifflin)', () => {
  const withAdaptive = calcTargets(PROFILE, { adaptiveTdee: 2200 });
  assert.equal(withAdaptive.tdeeBasis, 'adaptive');
  assert.equal(withAdaptive.tdee, 2200);
  assert.equal(withAdaptive.kcalMax, 2200 - 400); // déficit 400

  const formula = calcTargets(PROFILE);
  assert.equal(formula.tdeeBasis, 'formula');
  assert.notEqual(formula.kcalMax, 1800); // base distinta a la adaptativa
});
