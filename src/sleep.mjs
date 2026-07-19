// Métrica de sueño — el KPI #1 del plan. Lógica pura (sin React), espejo del esquema
// canónico documentado en apps-script/bridge-writer.gs (sección `sleep`): una entrada por
// noche (kind:"daily") y opcionalmente promedios kind:"weekly"/"monthly" para tendencia.
// El sueño es un CENTINELA DURO: <6h de promedio en 7 días congela ajustes de dieta/carga.
import { todayKey, shiftDate } from './dates.mjs';
import { MAX_PLAUSIBLE_SLEEP_H } from './fields.mjs';

// ── Umbrales del semáforo (UN solo lugar; el promedio de 7 días es lo que colorea) ──
//   <SLEEP_FLOOR_MIN  → rojo  (centinela: congela ajustes de dieta/carga)
//   FLOOR..TARGET-1   → ámbar (sobre el piso, bajo el objetivo)
//   ≥SLEEP_TARGET_MIN → verde
export const SLEEP_FLOOR_MIN = 360;   // 6h — piso duro (centinela)
export const SLEEP_TARGET_MIN = 390;  // 6h30 — objetivo

export const SLEEP_KINDS = ['daily', 'weekly', 'monthly'];

// Campos que viajan por el bridge y se mergean sobre la fila del mismo (date|kind).
// Mantener en sync con SLEEP_MERGE_FIELDS del .gs (date/kind son la firma, van aparte).
export const SLEEP_NUMERIC_FIELDS = ['asleepMin', 'inBedMin'];
export const SLEEP_STRING_FIELDS = ['bedtime', 'wakeTime', 'periodStart', 'periodEnd', 'source', 'note'];

// Minutos dormidos plausibles: >0 y ≤ la misma cota fisiológica del resto de la app
// (MAX_PLAUSIBLE_SLEEP_H, ver fields.mjs — >14h = muestra corrupta). null = basura.
export function sanitizeSleepMin(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PLAUSIBLE_SLEEP_H * 60) return null;
  return n;
}

// Minutos → "6h 27min" / "6h" / "45min" / "—".
export function fmtSleepMin(min) {
  if (min == null || !Number.isFinite(Number(min))) return '—';
  const total = Math.round(Number(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Semáforo por promedio de minutos dormidos. null si no hay dato.
export function sleepTone(avgMin) {
  if (avgMin == null || !Number.isFinite(Number(avgMin))) return null;
  if (avgMin < SLEEP_FLOOR_MIN) return 'red';
  if (avgMin < SLEEP_TARGET_MIN) return 'amber';
  return 'green';
}

// ¿El centinela está activo? (promedio 7d bajo el piso → congelar ajustes de dieta/carga).
export function sleepSentinelTripped(avg7Min) {
  return avg7Min != null && Number.isFinite(Number(avg7Min)) && avg7Min < SLEEP_FLOOR_MIN;
}

// Estadísticas para la tarjeta de Sueño a partir de las entradas del bridge/estado.
// Solo las kind:"daily" (una por fecha; si hubiera duplicadas gana la última) alimentan
// promedio y tendencia; weekly/monthly son histórico aparte. Devuelve:
//   last     → { date, asleepMin, ... } de la última noche registrada (o null)
//   avg7     → promedio de asleepMin de los ÚLTIMOS 7 DÍAS calendario (o null si 0 noches)
//   avg7Count→ cuántas noches reales respaldan ese promedio
//   tone     → semáforo del promedio 7d ('red'|'amber'|'green'|null)
//   series14 → [{date, asleepMin|null}] de los últimos 14 días (para la mini-tendencia)
export function sleepStats(entries, today = todayKey()) {
  const byDate = new Map();
  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || (e.kind || 'daily') !== 'daily' || !e.date) continue;
    const min = sanitizeSleepMin(e.asleepMin);
    if (min == null) continue;
    byDate.set(e.date, { ...e, asleepMin: min });
  }
  const dates = [...byDate.keys()].sort();
  const last = dates.length ? byDate.get(dates[dates.length - 1]) : null;

  const from7 = shiftDate(today, -6);
  const win7 = dates.filter((d) => d >= from7 && d <= today).map((d) => byDate.get(d).asleepMin);
  const avg7 = win7.length ? win7.reduce((a, b) => a + b, 0) / win7.length : null;

  const series14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = shiftDate(today, -i);
    series14.push({ date: d, asleepMin: byDate.get(d)?.asleepMin ?? null });
  }
  return { last, avg7, avg7Count: win7.length, tone: sleepTone(avg7), series14 };
}
