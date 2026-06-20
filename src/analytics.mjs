// Capa de análisis derivada del historial (TDEE adaptativo, balance energético, tendencias,
// racha, comparativas), pura (sin React/JSX). Extraída de app.jsx en la modularización
// (Etapa 1). Quedó extraíble recién con el núcleo de comidas fuera: estas funciones reconstruyen
// métricas sobre computeDayTotals (meals.mjs) + la math de peso (energy.mjs) + la fórmula
// (nutrition.mjs). esbuild la reinjecta en el bundle; los tests (adaptive-tdee, trend-weight,
// evolution) la importan directo.
import { todayKey, daysBetween, shiftDate } from './dates.mjs';
import { weightSeries, trendWeightAt, linRegSlopePerDay, WEEKLY_LOSS } from './energy.mjs';
import { calcTargets, KCAL_PER_KG_FAT, DEFAULT_TARGETS } from './nutrition.mjs';
import { computeDayTotals } from './meals.mjs';
import { normalizeName } from './util.mjs';

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
        // Intensidad de HeartWatch (importador CSV): RPE, carga, kcal/h y zonas de FC.
        rpe: w.rpe != null ? Number(w.rpe) : null,
        trainingLoad: w.trainingLoad != null ? Number(w.trainingLoad) : null,
        calsPerHour: w.calsPerHour != null ? Number(w.calsPerHour) : null,
        hrZones: (w.hrZones && typeof w.hrZones === 'object') ? w.hrZones : null,
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

  // Volumen por grupo muscular (sets como proxy; 1 por ejercicio si no hay sets) + top ejercicios
  const muscleSets = {};
  const exNameCount = {};
  for (const s of inWindow) {
    for (const e of s.exercises) {
      const m = (e.muscle || 'otros').toLowerCase();
      const sets = Number(e.sets) > 0 ? Number(e.sets) : 1;
      muscleSets[m] = (muscleSets[m] || 0) + sets;
      const nm = (e.name || '').trim();
      if (nm) exNameCount[nm] = (exNameCount[nm] || 0) + 1;
    }
  }
  const muscleVolume = Object.entries(muscleSets).map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
  const topExercises = Object.entries(exNameCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
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
    muscleVolume,
    topExercises,
    detailSessions,
    byExercise,
    weeks,
    sessions,
  };
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
