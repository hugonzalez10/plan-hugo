// Capa de análisis derivada del historial (TDEE adaptativo, balance energético, tendencias,
// racha, comparativas), pura (sin React/JSX). Extraída de app.jsx en la modularización
// (Etapa 1). Quedó extraíble recién con el núcleo de comidas fuera: estas funciones reconstruyen
// métricas sobre computeDayTotals (meals.mjs) + la math de peso (energy.mjs) + la fórmula
// (nutrition.mjs). esbuild la reinjecta en el bundle; los tests (adaptive-tdee, trend-weight,
// evolution) la importan directo.
import { todayKey, daysBetween, shiftDate } from './dates.mjs';
import { weightSeries, trendWeightAt, linRegSlopePerDay, WEEKLY_LOSS } from './energy.mjs';
import { calcTargets, KCAL_PER_KG_FAT, DEFAULT_TARGETS } from './nutrition.mjs';
import { computeDayTotals, extraPlanSlot } from './meals.mjs';
import { normalizeName } from './util.mjs';
import { slugifyExercise } from './parsing.mjs';

// TDEE de referencia fijo: TMB medida 1878 × ~1.5 factor actividad. Constante a propósito —
// estimarlo sobre ventanas cortas (peso × Δpeso × kcal de pocos días) es ruido, no señal.
const TDEE_ESTIMADO = 2850;
// Mínimo de días con registro para mostrar promedio/déficit (menos = muestra no representativa).
export const TREND_MIN_DAYS = 14;
// Ventana de análisis de tendencia: se promedia ingesta y se regresa el peso sobre estos días.
export const TREND_WINDOW_DAYS = 28;

// TDEE adaptativo: reconstruye el gasto real desde el balance energético observado, en vez de
// confiar en Mifflin × factor de actividad (ruido poblacional). Sobre una ventana móvil,
//   gasto ≈ ingesta_media − pendiente_peso(kg/día) × 7700
// (si bajaste de peso, la pendiente es negativa → gastaste más de lo que comiste → suma). La
// pendiente sale de una REGRESIÓN sobre todos los pesos de la ventana (robusta y simétrica, no
// dos lecturas sueltas). Se ancla en las mediciones REALES dentro de la ventana, porque Hugo se
// pesa cada 3-4 días, no justo hace windowDays. Devuelve null si faltan datos; el caller cae a
// la fórmula. Guardrails: ≥minDays de span medido, cobertura mínima de días registrados, y
// clamp a un rango sano respecto a Mifflin para descartar basura.
export function computeAdaptiveTDEE(state, refDate = todayKey(), options = {}) {
  const { windowDays = 28, minDays = 14, minCoverage = 0.6 } = options;
  const profile = state?.userProfile;
  if (!profile) return null;
  const days = state?.days || {};
  const weights = state?.weights || [];

  const windowStartKey = (() => {
    const d = new Date(refDate + 'T12:00:00');
    d.setDate(d.getDate() - (windowDays - 1));
    return todayKey(d);
  })();
  // Pesos reales dentro de la ventana, anclando el span en la primera y última medición.
  const series = weightSeries(weights).filter((p) => p.key >= windowStartKey && p.key <= refDate);
  if (series.length < 2) return null;
  const firstKey = series[0].key;
  const lastKey = series[series.length - 1].key;
  const spanDays = daysBetween(firstKey, lastKey);
  if (spanDays < minDays) return null;                 // sin ≥2 semanas de span medido, no estimar
  const slopePerDay = linRegSlopePerDay(series);       // kg/día (negativo = bajando)
  if (slopePerDay == null) return null;

  // Ingesta media SOLO sobre días con registro (kcalIn>0) dentro del span medido; los días en
  // blanco no son "comí 0".
  const formulaTargets = calcTargets(profile); // sin adaptiveTdee → no recursivo; solo para kcalIn
  let kcalSum = 0, logged = 0;
  const spanCount = spanDays + 1;
  for (let i = 0; i < spanCount; i++) {
    const d = new Date(lastKey + 'T12:00:00');
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    const day = days[k];
    if (!day) continue;
    const t = computeDayTotals(day, state.snackBank || [], state.proteinBank || [], formulaTargets, state.dessertBank || [], state.antojoCustomItems || []);
    const kcalIn = Number(t.kcalIn) || 0;
    if (kcalIn > 0) { kcalSum += kcalIn; logged++; }
  }
  const coverage = logged / spanCount;
  if (logged < minDays || coverage < minCoverage) return null;
  const meanKcalIn = kcalSum / logged;

  const tdee = meanKcalIn - slopePerDay * KCAL_PER_KG_FAT;

  // Clamp de sanidad: rechaza valores absurdos (datos sucios, peso mal tipeado).
  const formulaTdee = formulaTargets.tdee;
  let clamped = tdee;
  if (formulaTdee) clamped = Math.min(formulaTdee * 1.4, Math.max(formulaTdee * 0.7, tdee));
  else clamped = Math.min(5000, Math.max(1200, tdee));
  if (!Number.isFinite(clamped) || clamped <= 0) return null;

  return {
    tdee: Math.round(clamped),
    basis: 'adaptive',
    days: spanDays,
    coverage: Number(coverage.toFixed(2)),
    loggedDays: logged,
    meanKcalIn: Math.round(meanKcalIn),
    weeklyKg: Number((slopePerDay * 7).toFixed(2)),
    clampedFromRaw: Math.round(clamped) !== Math.round(tdee),
  };
}

// Serie compacta de balance energético por día: { date, kcalIn, trendWeightKg }. Es lo que la
// app empuja al bridge (sección `energy`, never-pruned) para que el historial de ingesta+peso
// sobreviva a la poda de meals (30 días) y esté disponible en otros dispositivos. Acotada a
// `windowDays` para no reenviar todo cada vez. Reusa computeDayTotals + trendWeightAt.
export function buildEnergySeries(state, windowDays = 180) {
  const days = state?.days || {};
  const targets = calcTargets(state?.userProfile);
  const series = weightSeries(state?.weights || []);
  const cutoff = shiftDate(todayKey(), -windowDays);
  const out = [];
  for (const k of Object.keys(days).sort()) {
    if (k < cutoff) continue;
    const t = computeDayTotals(days[k], state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
    const kcalIn = Math.round(Number(t.kcalIn) || 0);
    const trend = trendWeightAt(series, k);
    if (kcalIn <= 0 && trend == null) continue; // día sin nada que guardar
    out.push({ date: k, kcalIn, trendWeightKg: trend != null ? Number(trend.toFixed(2)) : null });
  }
  return out;
}

// Sugerencia de ajuste del plan según la TASA DE PÉRDIDA SEMANAL (% peso/sem, Garthe 2011),
// NO según un déficit fijo esperado. Objetivo 0.5-0.7 %/sem.
// - >0.8 %/sem → pérdida demasiado rápida (riesgo masa magra) → subir ~100-150 kcal.
// - <0.4 %/sem (con ≥14 días de data ≈ 2 semanas) → extender duración del cardio,
//   NO recortar más calorías ni agregar días.
// - 0.4-0.8 %/sem → sin banner.
export function computePlanAdjustment(state, refDate = todayKey(), options = {}) {
  const {
    minDays = 14,         // ignora la evaluación dinámica con <14 días de data
    windowDays = 28,      // mirar hasta los últimos 28 días
    stepKcal = 125,       // ~100-150 kcal por ajuste
    cooldownDays = 14,    // mínimo entre ajustes
    minDeficit = 100,
  } = options;

  const profile = state?.userProfile;
  if (!profile) return null;
  if (profile.goal !== 'lose') return null;

  // Cooldown
  if (profile.lastAdjustmentDate) {
    const elapsed = daysBetween(profile.lastAdjustmentDate, refDate);
    if (elapsed < cooldownDays) return null;
  }

  const weights = (state.weights || [])
    .filter((w) => w && w.weightKg != null && w.date)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (weights.length < 2) return null;

  // Tomar pesos dentro de la ventana de los últimos windowDays
  const windowStart = (() => {
    const d = new Date(refDate + 'T12:00:00');
    d.setDate(d.getDate() - windowDays);
    return todayKey(d);
  })();
  const inWindow = weights.filter((w) => w.date >= windowStart && w.date <= refDate);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < minDays) return null;       // <14 días: no evaluar (ignora TDEE dinámico)
  if (!first.weightKg) return null;

  // Tendencia robusta: pendiente de regresión sobre TODOS los pesos de la ventana, no el delta
  // crudo entre dos lecturas sueltas (el agua corporal mueve ±1.5 kg y disparaba falsos
  // "bajas muy rápido"). realDeltaKg queda solo para mostrar.
  const series = weightSeries(inWindow);
  const slopePerDay = linRegSlopePerDay(series);
  const realDeltaKg = Number((last.weightKg - first.weightKg).toFixed(2));
  const weeklyKg = slopePerDay != null ? slopePerDay * 7 : (realDeltaKg / days) * 7; // negativo = pérdida
  const baseWeight = trendWeightAt(series, last.date) ?? first.weightKg;
  const pctPerWeek = (-weeklyKg / baseWeight) * 100;     // positivo = pérdida
  const currentDeficit = Number.isFinite(profile.kcalDeficit) ? profile.kcalDeficit : 400;

  if (pctPerWeek > WEEKLY_LOSS.fastPct) {
    // Demasiado rápido → riesgo de masa magra → comer ~100-150 kcal MÁS (bajar déficit).
    const suggestedDeficit = Math.max(minDeficit, currentDeficit - stepKcal);
    if (suggestedDeficit === currentDeficit) return null; // ya en el piso
    return {
      kind: 'too_fast',
      decision: 'decrease_deficit',
      pctPerWeek: Number(pctPerWeek.toFixed(2)),
      weeklyKg: Number(weeklyKg.toFixed(2)),
      days, currentDeficit, suggestedDeficit,
      delta: suggestedDeficit - currentDeficit,
      message: `En ${days} días vas a ${pctPerWeek.toFixed(2)} %/sem (${Math.abs(weeklyKg).toFixed(2)} kg/sem). Sobre 0,8 %/sem hay riesgo de perder masa magra.`,
    };
  }

  if (pctPerWeek < WEEKLY_LOSS.slowPct) {
    // Lento (≥2 sem) → extender la DURACIÓN del cardio. NO recortar calorías ni sumar días.
    const verb = pctPerWeek >= 0 ? 'bajando' : 'subiendo';
    return {
      kind: 'too_slow',
      decision: 'extend_cardio',
      pctPerWeek: Number(pctPerWeek.toFixed(2)),
      weeklyKg: Number(weeklyKg.toFixed(2)),
      days, currentDeficit,
      message: `En ${days} días vas ${verb} ${Math.abs(pctPerWeek).toFixed(2)} %/sem (objetivo 0,5-0,7 %). Extiende la duración del cardio; no recortes más calorías ni agregues días.`,
    };
  }

  return null; // 0.4-0.8 %/sem (incluye el óptimo 0.5-0.7): sin banner
}

export function dayMetsTarget(totals, targets) {
  if (!totals || !totals.eatenAny) return false;
  const T = targets || DEFAULT_TARGETS;
  return (
    totals.kcal >= T.kcalMin &&
    totals.kcal <= T.kcalRed &&
    totals.protein >= T.proteinYellow
  );
}

export function computeTrendAnalysis(weights, days, snackBank, proteinBank, targets, dessertBank, customAntojoItems) {
  const sorted = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const last = sorted[sorted.length - 1];
  const lastT = new Date(last.date + 'T12:00:00').getTime();

  // Ventana de análisis = últimos TREND_WINDOW_DAYS, NO el hueco entre los dos últimos pesajes
  // (eso daba "3 días" e "insuficiente" aunque hubiera un mes de historial). El primer pesaje
  // dentro de la ventana ancla el cambio de peso y el conteo de días con registro.
  const windowStartT = lastT - TREND_WINDOW_DAYS * 86400000;
  const inWindow = sorted.filter((w) => new Date(w.date + 'T12:00:00').getTime() >= windowStartT);
  const first = inWindow.length >= 2 ? inWindow[0] : sorted[sorted.length - 2];
  const d1 = new Date(first.date + 'T12:00:00');
  const d2 = new Date(last.date + 'T12:00:00');
  const diasReal = Math.round((d2 - d1) / 86400000);
  if (diasReal < 1) return null;

  const deltaKg = Number((last.weightKg - first.weightKg).toFixed(2));

  let kcalSum = 0, daysCount = 0;
  for (let i = 0; i <= diasReal; i++) {
    const d = new Date(d1); d.setDate(d.getDate() + i);
    const k = todayKey(d);
    const day = days[k];
    if (!day) continue;
    const totals = computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (totals.eatenAny) { kcalSum += totals.kcalIn; daysCount++; }
  }

  const promedioKcal = daysCount > 0 ? Math.round(kcalSum / daysCount) : null;
  // n = días con registro. Bajo TREND_MIN_DAYS el promedio/déficit son ruido → no se muestran.
  const enoughData = daysCount >= TREND_MIN_DAYS;
  // TDEE fijo (no dinámico): evita el inflado por ventanas cortas. Déficit = TDEE − ingesta,
  // solo cuando hay muestra suficiente.
  const tdeeEstimado = TDEE_ESTIMADO;
  const deficitDiario = (enoughData && promedioKcal != null) ? tdeeEstimado - promedioKcal : null;

  // Ritmo de pérdida semanal por regresión lineal sobre los pesajes de la misma ventana
  // (requiere span ≥14 d). Es la métrica operativa, no el déficit calórico estimado.
  const recentPts = weightSeries(inWindow.length >= 2 ? inWindow : sorted);
  let lossPctPerWeek = null;
  if (recentPts.length >= 2) {
    const spanDays = (recentPts[recentPts.length - 1].x - recentPts[0].x) / 86400000;
    const slopePerDay = spanDays >= 14 ? linRegSlopePerDay(recentPts) : null; // kg/día (− = bajando)
    if (slopePerDay != null && last.weightKg > 0) {
      lossPctPerWeek = -(slopePerDay * 7) / last.weightKg * 100; // + = perdiendo peso
    }
  }

  return { last, first, diasReal, deltaKg, promedioKcal, tdeeEstimado, deficitDiario, daysCount, enoughData, lossPctPerWeek };
}

// Métricas de composición para el análisis de evolución de largo plazo.
// `better: 'down'` → bajar es mejor (en déficit); `'up'` → subir es mejor (músculo).
// `eps` = cambio mínimo (en unidades de la métrica) para contar como movimiento;
// por debajo se considera 'estable'. Un umbral relativo único no sirve porque las
// bases difieren mucho (105 kg de peso vs 14 de visceral).
const EVOLUTION_METRICS = [
  { key: 'weightKg',         label: 'Peso',            unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'bodyFatPct',       label: '% grasa',         unit: '%',  better: 'down', decimals: 1, eps: 0.2 },
  { key: 'fatKg',            label: 'Grasa',           unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'muscleKg',         label: 'Masa muscular',   unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'skeletalMuscleKg', label: 'Músculo esq.',    unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'visceralFat',      label: 'Grasa visceral',  unit: '',   better: 'down', decimals: 1, eps: 0.5 },
  { key: 'subcutaneousFatKg',label: 'Grasa subcutánea',unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'waistCm',          label: 'Cintura',         unit: 'cm', better: 'down', decimals: 1, eps: 0.5 },
  { key: 'hipCm',            label: 'Cadera',          unit: 'cm', better: 'down', decimals: 1, eps: 0.5 },
  { key: 'waistHipRatio',    label: 'Cintura-cadera',  unit: '',   better: 'down', decimals: 2, eps: 0.02 },
  { key: 'bmi',              label: 'IMC',             unit: '',   better: 'down', decimals: 1, eps: 0.15 },
  { key: 'fatFreeMassKg',    label: 'Masa libre grasa',unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'proteinKg',        label: 'Masa proteica',   unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'ffmi',             label: 'FFMI',            unit: '',   better: 'up',   decimals: 1, eps: 0.15 },
];

// Analiza la trayectoria completa (primer pesaje → último) de cada métrica de
// composición. `goal` invierte la dirección deseada para objetivos de subir masa.
export function computeEvolution(weights, goal) {
  const sorted = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const gain = goal === 'gain';
  const metrics = [];
  for (const m of EVOLUTION_METRICS) {
    const pts = sorted.filter((w) => w[m.key] != null);
    if (pts.length < 2) continue;
    const first = Number(pts[0][m.key]);
    const last = Number(pts[pts.length - 1][m.key]);
    const delta = Number((last - first).toFixed(2));
    const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
    const d1 = new Date(pts[0].date + 'T12:00:00');
    const d2 = new Date(pts[pts.length - 1].date + 'T12:00:00');
    const days = Math.max(1, Math.round((d2 - d1) / 86400000));
    const weekly = Number(((delta / days) * 7).toFixed(2));

    // Dirección deseada: en 'gain' se invierte salvo el músculo, que siempre sube.
    let better = m.better;
    if (gain && m.key !== 'muscleKg' && m.key !== 'skeletalMuscleKg') {
      better = m.better === 'down' ? 'up' : 'down';
    }

    // Zona muerta: cambio menor al eps de la métrica se considera estable.
    let status;
    if (Math.abs(delta) < (m.eps || 0.2)) status = 'estable';
    else if (better === 'down') status = delta < 0 ? 'mejora' : 'empeora';
    else status = delta > 0 ? 'mejora' : 'empeora';

    metrics.push({ ...m, first, last, delta, pct, days, weekly, better, status });
  }
  if (metrics.length === 0) return null;

  const firstW = sorted[0];
  const lastW = sorted[sorted.length - 1];
  const spanDays = Math.max(1, Math.round(
    (new Date(lastW.date + 'T12:00:00') - new Date(firstW.date + 'T12:00:00')) / 86400000));

  // Recomposición: baja grasa (peso o %grasa o grasa kg) sin perder músculo.
  const fatDown = metrics.some((x) => (x.key === 'fatKg' || x.key === 'bodyFatPct' || x.key === 'weightKg') && x.delta < 0);
  const muscle = metrics.find((x) => x.key === 'muscleKg' || x.key === 'skeletalMuscleKg');
  const muscleKept = muscle && muscle.delta >= -0.2;
  const recomp = fatDown && muscleKept;

  return { metrics, count: sorted.length, firstDate: firstW.date, lastDate: lastW.date, spanDays, recomp };
}

export function interpretTrend(data, targets) {
  if (!data) return null;
  const T = targets || DEFAULT_TARGETS;
  const { deltaKg, daysCount } = data;
  if (daysCount < 3) {
    return { icon: 'ℹ️', tone: 'amber', text: 'Pocos días registrados — el promedio puede no ser representativo.' };
  }
  if (deltaKg > 0.3) {
    return { icon: '⚠️', tone: 'red', text: 'Subiste peso. Revisa si registraste todas las comidas o si necesitas más déficit.' };
  }
  if (deltaKg <= 0) {
    return { icon: '✅', tone: 'green', text: 'Vas en línea con tu objetivo de bajar grasa.' };
  }
  return { icon: 'ℹ️', tone: 'amber', text: 'Resultado mixto — sigue trackeando.' };
}

// Stats locales (sin IA) para la pestaña Ejercicios. Recorre el histórico de días y agrega
// cada entrada de day.exercise[] como una "sesión". Calcula frecuencia, días entrenados,
// tendencia semanal, volumen por grupo muscular (sets como proxy) y top de ejercicios.
export function computeExerciseStats(days, refDate, weeks = 8) {
  const today = refDate || todayKey();
  const start = shiftDate(today, -(weeks * 7 - 1));
  const sessions = [];
  for (const [dk, day] of Object.entries(days || {})) {
    if (dk > today) continue;
    const ex = Array.isArray(day?.exercise) ? day.exercise : [];
    for (const w of ex) {
      const exs = Array.isArray(w.exercises) ? w.exercises : [];
      const type = w.type === 'cardio' ? 'cardio'
        : w.type === 'strength' ? 'strength'
        : ((w.distanceM != null || w.avgPowerW != null || w.avgCadenceRpm != null) && exs.length === 0 ? 'cardio' : 'strength');
      sessions.push({
        id: w.id,
        date: dk,
        name: w.name || 'Entrenamiento',
        type,
        kcal: Number(w.kcal) || 0,
        minutes: w.minutes != null ? Number(w.minutes) : null,
        volumeKg: w.volumeKg != null ? Number(w.volumeKg) : null,
        distanceM: w.distanceM != null ? Number(w.distanceM) : null,
        avgPowerW: w.avgPowerW != null ? Number(w.avgPowerW) : null,
        avgCadenceRpm: w.avgCadenceRpm != null ? Number(w.avgCadenceRpm) : null,
        avgHr: w.avgHr != null ? Number(w.avgHr) : null,
        maxHr: w.maxHr != null ? Number(w.maxHr) : null,
        // Intensidad de HeartWatch (importador CSV): RPE, carga, kcal/h y zonas de FC.
        rpe: w.rpe != null ? Number(w.rpe) : null,
        trainingLoad: w.trainingLoad != null ? Number(w.trainingLoad) : null,
        calsPerHour: w.calsPerHour != null ? Number(w.calsPerHour) : null,
        hrZones: (w.hrZones && typeof w.hrZones === 'object') ? w.hrZones : null,
        // hrZonePct: string "86/12/1/0/0" (%Z1..Z5) que aporta el chat/skill, distinto de hrZones (minutos).
        hrZonePct: (typeof w.hrZonePct === 'string' && w.hrZonePct) ? w.hrZonePct : null,
        exercises: exs,
      });
    }
  }
  sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // recientes primero
  const inWindow = sessions.filter((s) => s.date >= start);
  const trainedDates = [...new Set(sessions.map((s) => s.date))].sort();
  const trainedDatesWindow = new Set(inWindow.map((s) => s.date));

  const lastDate = trainedDates.length ? trainedDates[trainedDates.length - 1] : null;
  const daysSinceLast = lastDate ? daysBetween(lastDate, today) : null;
  const ym = today.slice(0, 7);
  const sessionsThisMonth = new Set(sessions.filter((s) => s.date.slice(0, 7) === ym).map((s) => s.date)).size;
  const freqPerWeek = trainedDatesWindow.size / weeks;
  // Frecuencia separada por tipo (días distintos con fuerza / con cardio, en la ventana)
  const strengthDatesWindow = new Set(inWindow.filter((s) => s.type === 'strength').map((s) => s.date));
  const cardioDatesWindow = new Set(inWindow.filter((s) => s.type === 'cardio').map((s) => s.date));
  const freqStrengthPerWeek = strengthDatesWindow.size / weeks;
  const freqCardioPerWeek = cardioDatesWindow.size / weeks;
  const cardioSessions = sessions.filter((s) => s.type === 'cardio').length;
  const strengthSessions = sessions.filter((s) => s.type === 'strength').length;

  // Tendencia: una barra por semana (de la más vieja a la más nueva)
  const weekBuckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wEnd = shiftDate(today, -(i * 7));
    const wStart = shiftDate(wEnd, -6);
    const ws = sessions.filter((s) => s.date >= wStart && s.date <= wEnd);
    weekBuckets.push({
      label: wStart.slice(5),
      sessions: new Set(ws.map((s) => s.date)).size,
      kcal: ws.reduce((a, s) => a + s.kcal, 0),
      volumeKg: ws.reduce((a, s) => a + (s.volumeKg || 0), 0),
    });
  }

  // Tonelaje semanal (carga total kg/sem) + tendencia por regresión sobre las semanas con datos.
  // weekBuckets ya trae volumeKg por semana; la pendiente es el indicador de progresión en fuerza.
  const tonnageWeeks = weekBuckets.map((b) => ({ label: b.label, volumeKg: Math.round(b.volumeKg) }));
  const tonnagePts = tonnageWeeks.map((b, i) => ({ x: i, y: b.volumeKg })).filter((p) => p.y > 0);
  let tonnageSlope = null, tonnagePctPerWeek = null;
  if (tonnagePts.length >= 2) {
    const n = tonnagePts.length;
    const sx = tonnagePts.reduce((a, p) => a + p.x, 0);
    const sy = tonnagePts.reduce((a, p) => a + p.y, 0);
    const sxx = tonnagePts.reduce((a, p) => a + p.x * p.x, 0);
    const sxy = tonnagePts.reduce((a, p) => a + p.x * p.y, 0);
    const denom = n * sxx - sx * sx;
    if (denom !== 0) {
      tonnageSlope = (n * sxy - sx * sy) / denom; // kg por semana
      const mean = sy / n;
      if (mean > 0) tonnagePctPerWeek = (tonnageSlope / mean) * 100;
    }
  }
  const tonnage = {
    weeks: tonnageWeeks,
    slopePerWeek: tonnageSlope != null ? Math.round(tonnageSlope) : null,
    pctPerWeek: tonnagePctPerWeek != null ? Number(tonnagePctPerWeek.toFixed(1)) : null,
    current: tonnageWeeks.length ? tonnageWeeks[tonnageWeeks.length - 1].volumeKg : 0,
    weeksWithData: tonnagePts.length,
  };

  // Esfuerzo medio (RPE + FC) en la ventana, con tendencia primera-mitad vs segunda-mitad.
  const asc = inWindow.slice().reverse(); // ventana en orden cronológico
  const halfDelta = (arr) => {
    if (arr.length < 4) return null;
    const mid = Math.floor(arr.length / 2);
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    return mean(arr.slice(mid)) - mean(arr.slice(0, mid));
  };
  const rpeVals = asc.map((s) => s.rpe).filter((v) => v != null && v > 0);
  const hrVals = asc.map((s) => s.avgHr).filter((v) => v != null && v > 0);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const effort = {
    avgRpe: rpeVals.length ? Number(mean(rpeVals).toFixed(1)) : null,
    avgHr: hrVals.length ? Math.round(mean(hrVals)) : null,
    rpeTrend: rpeVals.length >= 4 ? Number(halfDelta(rpeVals).toFixed(1)) : null,
    hrTrend: hrVals.length >= 4 ? Math.round(halfDelta(hrVals)) : null,
    nRpe: rpeVals.length,
    nHr: hrVals.length,
  };

  // Volumen por grupo muscular (sets como proxy; 1 por ejercicio si no hay sets)
  const muscleSets = {};
  for (const s of inWindow) {
    for (const e of s.exercises) {
      const m = (e.muscle || 'otros').toLowerCase();
      const sets = Number(e.sets) > 0 ? Number(e.sets) : 1;
      muscleSets[m] = (muscleSets[m] || 0) + sets;
    }
  }
  const muscleVolume = Object.entries(muscleSets).map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
  const detailSessions = sessions.filter((s) => s.exercises.length > 0).length;

  // Progresión / récords por ejercicio (solo los que cargan peso/volumen, no movilidad pura).
  // Histórico completo, no solo la ventana. Una entrada por aparición del ejercicio en una sesión.
  const byEx = {};
  for (const s of sessions) {
    for (const e of (s.exercises || [])) {
      if (e.weightKg == null && e.oneRepMaxKg == null && e.volumeKg == null) continue;
      const key = (e.name || '').trim();
      if (!key) continue;
      if (!byEx[key]) byEx[key] = { name: key, muscle: e.muscle || null, entries: [] };
      byEx[key].entries.push({
        date: s.date,
        weightKg: e.weightKg ?? null,
        oneRepMaxKg: e.oneRepMaxKg ?? null,
        volumeKg: e.volumeKg ?? null,
        quality: e.quality ?? null,
      });
    }
  }
  const byExercise = Object.values(byEx).map((x) => {
    const entries = x.entries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const best = (k) => { const vals = entries.map((e) => e[k]).filter((v) => v != null); return vals.length ? Math.max(...vals) : null; };
    return { ...x, entries, sessions: entries.length, bestRm: best('oneRepMaxKg'), bestWeight: best('weightKg'), bestVolume: best('volumeKg') };
  }).sort((a, b) => b.sessions - a.sessions);

  return {
    totalSessions: sessions.length,
    sessionsThisMonth,
    trainedDates,
    freqPerWeek,
    freqStrengthPerWeek,
    freqCardioPerWeek,
    cardioSessions,
    strengthSessions,
    daysSinceLast,
    lastDate,
    weekBuckets,
    tonnage,
    effort,
    muscleVolume,
    detailSessions,
    byExercise,
    weeks,
    sessions,
  };
}

// Cruza los récords/progresión (stats.byExercise, por nombre libre) con la rutina vigente
// (routine.days[].exercises[], cada uno con slug). Devuelve un item por ejercicio de la rutina
// enriquecido con su histórico (o data:false si nunca se registró), más los que NO calzan con la
// rutina ("otros"). El match es por slug exacto y, si falla, por subconjunto de tokens (la rutina
// dice "Sentadilla" → calza "sentadilla-frontal-con-mancuernas", y viceversa). Puro, sin React.
export function computeRoutineExerciseProgress(stats, routine, refDate = todayKey()) {
  const today = refDate || todayKey();
  const byExercise = Array.isArray(stats?.byExercise) ? stats.byExercise : [];
  const reg = byExercise.map((x) => {
    const slug = slugifyExercise(x.name);
    return { x, slug, tokens: slug.split('-').filter(Boolean) };
  });
  const valOf = (e) => (e.oneRepMaxKg ?? e.weightKg ?? null);

  const matchFor = (name) => {
    const slug = slugifyExercise(name);
    if (!slug) return null;
    let hit = reg.find((r) => r.slug === slug);
    if (hit) return hit;
    const rtoks = slug.split('-').filter(Boolean);
    if (!rtoks.length) return null;
    // Todos los tokens de la rutina presentes en el registro (registro más específico).
    hit = reg.find((r) => rtoks.every((t) => r.tokens.includes(t)));
    if (hit) return hit;
    // O al revés: el registro más corto contenido en el nombre de la rutina.
    hit = reg.find((r) => r.tokens.length && r.tokens.every((t) => rtoks.includes(t)));
    return hit || null;
  };

  const enrich = (base, name, slug) => {
    if (!base) {
      return {
        slug, name, muscle: null, data: false, entries: [], spark: [],
        current: null, first: null, delta: null, lastDate: null, daysSince: null,
        trainedThisWeek: false, stagnant: false, suggestNextKg: null,
        bestRm: null, bestWeight: null, bestVolume: null, sessions: 0,
      };
    }
    const entries = base.entries || [];
    const vals = entries.map(valOf).filter((v) => v != null);
    const first = vals.length ? vals[0] : null;
    const current = vals.length ? vals[vals.length - 1] : null;
    const delta = first != null && current != null ? Math.round((current - first) * 10) / 10 : null;
    const lastDate = entries.length ? entries[entries.length - 1].date : null;
    const daysSince = lastDate ? daysBetween(lastDate, today) : null;
    const trainedThisWeek = daysSince != null && daysSince <= 7;
    // Meseta: el máximo de las últimas 3 apariciones no supera el de las previas (necesita ≥4).
    let stagnant = false;
    if (vals.length >= 4) {
      const maxRecent = Math.max(...vals.slice(-3));
      const maxEarlier = Math.max(...vals.slice(0, -3));
      stagnant = maxRecent <= maxEarlier;
    }
    // Sobrecarga progresiva: sobre el peso (o 1RM) — si la última sesión igualó/superó la previa,
    // sugerir +2.5 kg; si bajó, mantener. Heurística, etiquetada como sugerencia en la UI.
    let suggestNextKg = null, suggestUp = false;
    const wVals = entries.map((e) => e.weightKg ?? e.oneRepMaxKg).filter((v) => v != null);
    if (wVals.length) {
      const lastW = wVals[wVals.length - 1];
      const prevW = wVals.length >= 2 ? wVals[wVals.length - 2] : null;
      suggestUp = (prevW == null || lastW >= prevW);
      suggestNextKg = suggestUp ? Math.round((lastW + 2.5) * 10) / 10 : lastW;
    }
    return {
      slug, name, muscle: base.muscle || null, data: true, entries, spark: vals,
      current, first, delta, lastDate, daysSince, trainedThisWeek, stagnant, suggestNextKg, suggestUp,
      bestRm: base.bestRm ?? null, bestWeight: base.bestWeight ?? null, bestVolume: base.bestVolume ?? null,
      sessions: base.sessions ?? entries.length,
    };
  };

  const routineExs = [];
  const seenSlugs = new Set();
  const usedNames = new Set();
  const days = Array.isArray(routine?.days) ? routine.days : [];
  for (const d of days) {
    for (const ex of (Array.isArray(d?.exercises) ? d.exercises : [])) {
      const name = (ex?.name || '').trim();
      const slug = ex?.slug || slugifyExercise(name);
      if (!name || !slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      const hit = matchFor(name);
      if (hit) usedNames.add(hit.x.name);
      routineExs.push(enrich(hit ? hit.x : null, name, slug));
    }
  }

  const others = byExercise.filter((x) => !usedNames.has(x.name));
  const hasRoutine = routineExs.length > 0;
  return { hasRoutine, routine: routineExs, others };
}

export function computeStreak(days, snackBank, proteinBank, targets, refDate, dessertBank, customAntojoItems) {
  const today = refDate || todayKey();
  let current = 0;
  let best = 0;
  let run = 0;
  let lastBrokenDate = null;

  // Buscar hasta 365 días atrás
  const allKeys = Object.keys(days || {}).filter((k) => k <= today).sort();
  if (allKeys.length === 0) {
    return { current: 0, best: 0, lastBrokenDate: null, todayMet: false };
  }
  const earliest = allKeys[0];

  // Best ever: iterar desde el día más antiguo hasta hoy
  let cursor = earliest;
  while (cursor <= today) {
    const totals = computeDayTotals(days[cursor], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (dayMetsTarget(totals, targets)) {
      run++;
      if (run > best) best = run;
    } else {
      if (run > 0) lastBrokenDate = cursor;
      run = 0;
    }
    cursor = shiftDate(cursor, 1);
  }

  // Current: contar hacia atrás desde hoy
  cursor = today;
  while (cursor >= earliest) {
    const totals = computeDayTotals(days[cursor], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (dayMetsTarget(totals, targets)) {
      current++;
      cursor = shiftDate(cursor, -1);
    } else {
      break;
    }
  }

  const todayTotals = computeDayTotals(days[today], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
  return {
    current,
    best,
    lastBrokenDate,
    todayMet: dayMetsTarget(todayTotals, targets),
    todayHasData: !!todayTotals.eatenAny,
  };
}

// Orden de prioridad para rankear las tarjetas (urgent primero).
const INSIGHT_RANK = { urgent: 0, warn: 1, info: 2, good: 3 };

// Motor de insights proactivos DETERMINISTA (sin IA): compone las señales que ya calculamos
// (ajuste de plan, racha) con chequeos del día (brecha de proteína/agua/exceso según la hora) en
// una lista rankeada de tarjetas accionables. Funciona offline y sin API key, y alimenta tanto el
// panel del Coach como su prompt (para que la IA hable de números REALES, no de generalidades).
// Puro y testeable: la hora y la fecha de referencia entran por `options` (sin tocar el reloj).
export function computeProactiveInsights(state, dateKey, targets, options = {}) {
  const refDate = options.refDate || dateKey || todayKey();
  // Hora del día en minutos desde medianoche. Acepta nowMinutes, o hour(+minute), o el reloj.
  const mins = Number.isFinite(options.nowMinutes) ? options.nowMinutes
    : Number.isFinite(options.hour) ? options.hour * 60 + (Number(options.minute) || 0)
    : (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const hour = Math.floor(mins / 60);
  const T = targets || DEFAULT_TARGETS;
  const days = state?.days || {};
  const day = days[dateKey] || {};
  const snackBank = state?.snackBank || [];
  const proteinBank = state?.proteinBank || [];
  const dessertBank = state?.dessertBank || [];
  const customAntojo = state?.antojoCustomItems || [];
  const totals = computeDayTotals(day, snackBank, proteinBank, T, dessertBank, customAntojo);
  const out = [];
  const push = (severity, icon, title, detail, action) =>
    out.push({ id: title, severity, icon, title, detail, action: action || { kind: 'none' } });

  // --- Horarios del usuario (Ajustes → notificaciones) para nudges puntuales por comida ---
  const notif = state?.settings?.notifications || {};
  const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fmtHM = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const cenaMin = parseHM(notif.cena);
  // ¿Está cubierta la sección? eaten flag, registro del chat (logged), marcada como saltada, o el
  // banco/extra de esa colación/cena (hasSnack*/hasDinner).
  const eaten = day.eaten || {};
  const skipped = new Set(Array.isArray(day.skipped) ? day.skipped : []);
  const logged = new Set();
  for (const x of (day.extras || [])) { const s = extraPlanSlot(x); if (s) logged.add(s); }
  const slotDone = (slot) => {
    if (skipped.has(slot) || logged.has(slot) || eaten[slot]) return true;
    if (slot === 'colacion1') return totals.hasSnack1;
    if (slot === 'colacion2') return totals.hasSnack2;
    if (slot === 'cena') return totals.hasDinner;
    return false;
  };

  // 1. Ajuste de plan (pérdida muy rápida/lenta): ya es determinista.
  const adj = computePlanAdjustment(state, refDate);
  if (adj) {
    push(adj.kind === 'too_fast' ? 'warn' : 'info',
      adj.kind === 'too_fast' ? '🐇' : '🐢',
      adj.kind === 'too_fast' ? 'Bajando muy rápido' : 'Ritmo lento',
      adj.message);
  }

  // 2. Comida puntual atrasada: la más temprana cuya hora (de tus Ajustes) ya pasó con margen y que
  // no registraste/marcaste/saltaste. Nudge personal en vez de un umbral de hora genérico.
  const SLOT_LABEL = { desayuno: 'desayuno', colacion1: 'colación 1', almuerzo: 'almuerzo', colacion2: 'colación 2', cena: 'cena' };
  const MEAL_SCHEDULE = [
    ['desayuno', notif.desayuno],
    ['colacion1', notif.colacion1],
    ['almuerzo', notif.almuerzo],
    ['colacion2', notif.colacion2],
    ['cena', notif.cena],
  ];
  const GRACE_MIN = 75; // margen tras la hora pautada antes de avisar
  for (const [slot, time] of MEAL_SCHEDULE) {
    const t = parseHM(time);
    if (t == null) continue;
    if (mins > t + GRACE_MIN && !slotDone(slot)) {
      push('warn', '🍽️', `Pasó tu hora de ${SLOT_LABEL[slot]}`,
        `La tenías ~${fmtHM(t)} y no la registraste. Anótala o márcala para no perder el hilo del día.`,
        { kind: 'substitution', label: 'Ver opciones' });
      break; // solo la más temprana, no spamear
    }
  }

  // 3. Proteína: brecha grande pasada tu hora de cena → urgente; media a la tarde → aviso.
  const lateForProtein = cenaMin != null ? mins >= cenaMin : hour >= 19;
  const protGap = Math.round(totals.proteinRemaining);
  if (protGap >= 25 && lateForProtein) {
    push('urgent', '🥩', `Faltan ${protGap} g de proteína`,
      `Son las ${fmtHM(mins)} y vas ${Math.round(totals.protein)}/${T.proteinMin} g. Mete una fuente proteica ya (atún, claras, yogur proteico).`,
      { kind: 'substitution', label: 'Ver opciones' });
  } else if (protGap >= 40 && hour >= 16) {
    push('warn', '🥩', `Vas corto de proteína (${protGap} g)`,
      `${Math.round(totals.protein)}/${T.proteinMin} g a media tarde. Prioriza proteína en lo que queda del día.`,
      { kind: 'substitution', label: 'Ver opciones' });
  }

  // 3. Agua: lejos de la meta entrada la tarde/noche.
  const waterGap = Math.round(totals.waterRemaining);
  if (T.waterTarget > 0 && waterGap >= 750 && hour >= 17) {
    push('warn', '💧', `Faltan ${waterGap} ml de agua`,
      `${totals.waterMl}/${T.waterTarget} ml. Un par de vasos ahora y llegas.`,
      { kind: 'water500', label: '+500 ml' });
  }

  // 4. Exceso de calorías sobre el umbral rojo.
  if (totals.eatenAny && T.kcalRed && totals.kcal > T.kcalRed) {
    const over = Math.round(totals.kcal - T.kcalMax);
    push('warn', '⚠️', `${over} kcal sobre la meta`,
      `Vas ${Math.round(totals.kcal)} kcal (meta ${T.kcalMax}). Mañana retoma; no compenses saltándote comidas.`);
  }

  // 5. Racha: viva pero hoy sin cumplir y se hace tarde → en juego; cumplida y larga → felicitar.
  // Ojo: streak.current se corta HOY si hoy no está cumplido, así que el "en juego" mira la racha
  // hasta AYER (prev) para saber cuántos días se arriesgan.
  const streak = computeStreak(days, snackBank, proteinBank, T, refDate, dessertBank, customAntojo);
  if (!streak.todayMet && hour >= 18) {
    const prev = computeStreak(days, snackBank, proteinBank, T, shiftDate(refDate, -1), dessertBank, customAntojo);
    if (prev.current > 0) {
      push('warn', '🔥', `Tu racha de ${prev.current} días está en juego`,
        'Completa kcal y proteína del día para no cortarla.');
    }
  } else if (streak.todayMet && streak.current >= 3) {
    push('good', '🔥', `Racha de ${streak.current} días`, 'Día cumplido. Sigue así.');
  }

  // 6. Peso desactualizado: el pacing y el TDEE adaptativo se vuelven ruido sin pesajes recientes.
  const lastW = (state?.weights || [])
    .filter((w) => w && w.weightKg != null && w.date)
    .map((w) => w.date).sort().pop();
  if (lastW) {
    const stale = daysBetween(lastW, refDate);
    if (stale >= 10) {
      push('info', '⚖️', `${stale} días sin pesarte`,
        'El pacing y el TDEE adaptativo se desactualizan. Registra un peso cuando puedas.',
        { kind: 'logWeight', label: 'Registrar peso' });
    }
  }

  // 7. Cierre del día: por la tarde, ANTES de la cena y si no te pasaste, proyecta cuánto falta
  // para la meta y si la cena del plan lo cubre. Forward-looking (planificar el resto del día),
  // distinto de los nudges urgentes de la noche.
  // "Comida" es más estricto que slotDone (que cuenta la mera selección del banco): la cena pendiente
  // es la elegida (proteinId) que todavía NO marcaste/registraste/saltaste.
  const cenaEaten = eaten.cena || logged.has('cena') || skipped.has('cena');
  const cenaPend = !cenaEaten && day.proteinId ? proteinBank.find((p) => p.id === day.proteinId) : null;
  const kRem = Math.round(totals.kcalRemaining);
  const pRem = Math.round(totals.proteinRemaining);
  const beforeCena = cenaMin == null ? hour < 20 : mins < cenaMin;
  if (totals.eatenAny && hour >= 14 && beforeCena && totals.kcal <= T.kcalRed && (pRem >= 15 || kRem >= 200)) {
    let detail = `Quedan ${Math.max(0, kRem)} kcal de margen y ${Math.max(0, pRem)} g de proteína para la meta.`;
    if (cenaPend) {
      const dk = Math.round(Number(cenaPend.kcal) || 0);
      const dp = Math.round(Number(cenaPend.protein) || 0);
      const after = pRem - dp;
      detail += ` Tu cena del plan (${cenaPend.name}) aporta ~${dk} kcal/${dp} g → ${after <= 5 ? 'cierras la proteína' : `aún faltarían ${Math.round(after)} g`}.`;
    }
    push('info', '🎯', 'Cómo cerrar el día', detail);
  }

  return out
    .sort((a, b) => INSIGHT_RANK[a.severity] - INSIGHT_RANK[b.severity])
    .slice(0, 5);
}

export function computeComparison(state, dateKey, targets) {
  const days = state.days || {};
  const weights = state.weights || [];
  const snackBank = state.snackBank || [];
  const proteinBank = state.proteinBank || [];
  const dessertBank = state.dessertBank || [];
  const customAntojo = state.antojoCustomItems || [];

  const current = days[dateKey];
  if (!current) return null;
  const cT = computeDayTotals(current, snackBank, proteinBank, targets, dessertBank, customAntojo);
  if (!cT.eatenAny) return null;

  const buildEntry = (offsetDays) => {
    const k = shiftDate(dateKey, -offsetDays);
    const day = days[k];
    if (!day) return null;
    const t = computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojo);
    if (!t.eatenAny) return null;
    const weight = weights.find((w) => w.date === k && w.weightKg != null);
    return {
      dateKey: k,
      kcalDelta: Math.round(cT.kcal - t.kcal),
      proteinDelta: Math.round(cT.protein - t.protein),
      kcal: Math.round(cT.kcal),
      prevKcal: Math.round(t.kcal),
      protein: Math.round(cT.protein),
      prevProtein: Math.round(t.protein),
      weight: weight?.weightKg ?? null,
    };
  };

  const weekAgo = buildEntry(7);
  const monthAgo = buildEntry(28);
  if (!weekAgo && !monthAgo) return null;

  // Delta de peso: comparar último peso ≤ dateKey con último peso ≤ shiftDate(-7) y ≤ shiftDate(-28)
  const lastWeightOnOrBefore = (k) => {
    const ws = weights.filter((w) => w.weightKg != null && (w.date || '') <= k)
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return ws.length ? ws[ws.length - 1].weightKg : null;
  };
  const currentWeight = lastWeightOnOrBefore(dateKey);
  const weekAgoWeight = lastWeightOnOrBefore(shiftDate(dateKey, -7));
  const monthAgoWeight = lastWeightOnOrBefore(shiftDate(dateKey, -28));

  return {
    weekAgo: weekAgo ? {
      ...weekAgo,
      kgDelta: (currentWeight != null && weekAgoWeight != null)
        ? Number((currentWeight - weekAgoWeight).toFixed(1))
        : null,
    } : null,
    monthAgo: monthAgo ? {
      ...monthAgo,
      kgDelta: (currentWeight != null && monthAgoWeight != null)
        ? Number((currentWeight - monthAgoWeight).toFixed(1))
        : null,
    } : null,
  };
}

// Comidas recientes (extras) ponderadas por recencia, para el registro rápido de un toque.
export function computeRecents(days, limit = 10, windowDays = 21) {
  const now = Date.now();
  const cutoff = now - windowDays * 86400000;
  const buckets = new Map();
  for (const [dateKey, day] of Object.entries(days || {})) {
    if (!day?.extras?.length) continue;
    const ts = new Date(dateKey + 'T12:00:00').getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const ageDays = Math.max(0, (now - ts) / 86400000);
    const recencyWeight = Math.exp(-ageDays / 10);
    for (const item of day.extras) {
      const norm = normalizeName(item.name);
      if (!norm) continue;
      const existing = buckets.get(norm);
      if (existing) {
        existing.count += 1;
        existing.score += recencyWeight;
        if (ts > existing.lastTs) {
          existing.lastTs = ts;
          existing.sample = item;
        }
      } else {
        buckets.set(norm, { norm, count: 1, score: recencyWeight, lastTs: ts, sample: item });
      }
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((b) => ({
      name: b.sample.name,
      kcal: Number(b.sample.kcal) || 0,
      protein: Number(b.sample.protein) || 0,
      carbs: Number(b.sample.carbs) || 0,
      fat: Number(b.sample.fat) || 0,
      fiber: Number(b.sample.fiber) || 0,
      count: b.count,
      // Fidelidad para re-loguear de un toque (todos opcionales, backward-compatible):
      key: b.norm,
      barcode: b.sample.barcode || undefined,
      per100: b.sample.per100 || undefined,
      portion: b.sample.portion || undefined,
      source: b.sample.source || undefined,
      tags: Array.isArray(b.sample.tags) ? b.sample.tags : undefined,
    }));
}
