// Capa de análisis derivada del historial (TDEE adaptativo, balance energético, tendencias,
// racha, comparativas), pura (sin React/JSX). Extraída de app.jsx en la modularización
// (Etapa 1). Quedó extraíble recién con el núcleo de comidas fuera: estas funciones reconstruyen
// métricas sobre computeDayTotals (meals.mjs) + la math de peso (energy.mjs) + la fórmula
// (nutrition.mjs). esbuild la reinjecta en el bundle; los tests (adaptive-tdee, trend-weight,
// evolution) la importan directo.
import { todayKey, daysBetween, shiftDate } from './dates.mjs';
import { weightSeries, trendWeightAt, linRegSlopePerDay } from './energy.mjs';
import { calcTargets, KCAL_PER_KG_FAT } from './nutrition.mjs';
import { computeDayTotals } from './meals.mjs';

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
