// Math de peso/tendencia y balance, pura (sin React/JSX). Extraída de app.jsx en la
// modularización (Etapa 1, sub-etapa 1). Solo depende de helpers de fecha. esbuild la
// reinjecta en el bundle vía `--bundle`; los tests la importan directo.
import { todayKey, getRuleWeekKeys } from './dates.mjs';

// Tasa de pérdida semanal objetivo como % del peso corporal/sem (Garthe 2011): 0.5-0.7%
// preserva/aumenta LBM. >0.8% = demasiado rápido (riesgo masa magra). <0.4% = lento.
export const WEEKLY_LOSS = { minPct: 0.5, maxPct: 0.7, fastPct: 0.8, slowPct: 0.4 };

// Núcleo del SMA por ventana temporal: promedia las `y` de los puntos cuyo `x` (ms) cae en
// (evalT - windowMs, evalT]. Asume `points` ordenado ascendente por x. null si la ventana
// queda vacía. Lo comparten trendWeightAt (peso-tendencia) y computeSMA (gráfico).
export function smaAt(points, evalT, windowMs) {
  if (!points || !points.length || !Number.isFinite(evalT)) return null;
  const cutoff = evalT - windowMs;
  let sum = 0, count = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].x > evalT) continue;   // puntos futuros respecto al de evaluación
    if (points[i].x < cutoff) break;     // fuera de la ventana (resto es aún más viejo)
    sum += points[i].y;
    count++;
  }
  return count > 0 ? sum / count : null;
}

// SMA deslizante sobre una serie {x,y}: cada punto se reemplaza por su media de `windowDays`.
export function computeSMA(points, windowDays = 7) {
  if (!points.length) return [];
  const windowMs = windowDays * 86400000;
  return points.map((p) => {
    const y = smaAt(points, p.x, windowMs);
    return { x: p.x, y: y != null ? y : p.y };
  });
}

// Serie de pesos limpia y ordenada por fecha ascendente: [{ x:ms, y:kg, key:'YYYY-MM-DD' }].
export function weightSeries(weights) {
  return (weights || [])
    .filter((w) => w && w.weightKg != null && w.date)
    .map((w) => ({ x: new Date(w.date + 'T12:00:00').getTime(), y: Number(w.weightKg), key: w.date }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);
}

// Peso-tendencia (SMA temporal) evaluado en `dateKey`: el valor "denoised" del peso ese día,
// promediando las mediciones de los últimos `windowDays`. Es la señal que deben usar la tasa
// de pérdida y el ajuste, en vez del peso crudo (que el agua corporal mueve ±1.5 kg).
// null si no hay mediciones en la ventana. Acepta weights crudos o una serie ya construida.
export function trendWeightAt(weights, dateKey, windowDays = 10) {
  const series = (Array.isArray(weights) && weights.length && weights[0] && 'x' in weights[0] && 'y' in weights[0])
    ? weights
    : weightSeries(weights);
  if (!series.length) return null;
  const evalT = dateKey ? new Date(dateKey + 'T12:00:00').getTime() : series[series.length - 1].x;
  return smaAt(series, evalT, windowDays * 86400000);
}

// Pendiente de regresión lineal por mínimos cuadrados, en kg/día (y=kg, x=tiempo). Usa TODOS
// los puntos (no solo los extremos), así que es robusta al ruido diario. Acepta weights crudos
// o una serie ya construida. null si <2 puntos o varianza nula.
export function linRegSlopePerDay(series) {
  const pts = (Array.isArray(series) && series.length && series[0] && 'x' in series[0] && 'y' in series[0])
    ? series : weightSeries(series);
  if (!pts || pts.length < 2) return null;
  const x0 = pts[0].x;
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    const xd = (p.x - x0) / 86400000; // días desde el primer punto
    n++; sx += xd; sy += p.y; sxx += xd * xd; sxy += xd * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom; // kg/día (negativo = bajando)
}

// Peso promedio de una semana (lunes-domingo que contiene refDate). null si no hay datos.
export function weekAvgWeight(weights, refDate) {
  const keys = new Set(getRuleWeekKeys(refDate));
  const vals = (weights || []).filter((w) => w && w.weightKg != null && keys.has(w.date)).map((w) => Number(w.weightKg));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// Tasa de pérdida semanal: compara el peso promedio de la semana que contiene `refDateKey`
// (cualquier fecha YYYY-MM-DD de esa semana) con el de la semana anterior y la expresa como
// % del peso corporal/semana (Garthe 2011).
// Devuelve { deltaKg, pctPerWeek, curr, prev, status } o null si falta una de las semanas.
// status: 'fast' (>0.8%, riesgo masa magra) | 'ok' (0.5-0.7%) | 'slow' (<0.4%) | 'mid'.
export function computeWeeklyLossRate(weights, refDateKey) {
  const ref = refDateKey ? new Date(refDateKey + 'T12:00:00') : new Date();
  const prevRef = new Date(ref);
  prevRef.setDate(prevRef.getDate() - 7);
  // Peso-tendencia (denoised) para que la tarjeta de tasa use la MISMA señal suavizada que el
  // ajuste; cae al promedio de semana calendario si la ventana de tendencia queda vacía.
  const refKey = refDateKey || todayKey(ref);
  const prevKey = todayKey(prevRef);
  const curr = trendWeightAt(weights, refKey) ?? weekAvgWeight(weights, ref);
  const prev = trendWeightAt(weights, prevKey) ?? weekAvgWeight(weights, prevRef);
  if (curr == null || prev == null || prev === 0) return null;
  const deltaKg = curr - prev; // negativo = bajó
  const pctPerWeek = (-deltaKg / prev) * 100; // positivo = pérdida
  let status = 'mid';
  if (pctPerWeek > WEEKLY_LOSS.fastPct) status = 'fast';
  else if (pctPerWeek >= WEEKLY_LOSS.minPct && pctPerWeek <= WEEKLY_LOSS.maxPct) status = 'ok';
  else if (pctPerWeek < WEEKLY_LOSS.slowPct) status = 'slow';
  return { deltaKg, pctPerWeek, curr, prev, status };
}
