// Helpers de fecha puros (sin React/JSX). Extraídos de app.jsx en la modularización
// (Etapa 1, sub-etapa 0). esbuild los reinjecta en el bundle vía `--bundle`; los tests
// los importan directo (más robusto que el regex-extract anterior).

// "YYYY-MM-DD" de una fecha local (default: hoy).
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Suma/resta `days` a una date key, anclando a mediodía para esquivar DST.
export function shiftDate(key, days) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

// "Hoy" / "Ayer" / "lun 5 jun" para una date key.
export function formatDateLabel(key, todayK) {
  if (key === todayK) return 'Hoy';
  if (key === shiftDate(todayK, -1)) return 'Ayer';
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

// [date keys] de lunes a sábado (6 días) de la semana que contiene `reference`.
export function getWeekKeys(reference = new Date()) {
  const d = new Date(reference);
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const keys = [];
  for (let i = 0; i < 6; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    keys.push(todayKey(x));
  }
  return keys;
}

// [date keys] de lunes a domingo (7 días) de la semana que contiene refDate. Usado por las reglas.
export function getRuleWeekKeys(refDate = new Date()) {
  const d = (typeof refDate === 'string') ? new Date(refDate + 'T12:00:00') : new Date(refDate);
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    keys.push(todayKey(x));
  }
  return keys;
}

// Diferencia en días enteros entre dos date keys YYYY-MM-DD.
export function daysBetween(aKey, bKey) {
  const a = new Date(aKey + 'T12:00:00');
  const b = new Date(bKey + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

// Horas de sueño → "7h 30m" / "8h" / "—".
export function fmtSleepHours(hrs) {
  if (hrs == null) return '—';
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Techo fisiológico del sueño de una noche. Un valor mayor es doble conteo: muestras "In Bed"
// + "Asleep" solapadas (atajo iOS) o segmentos de varias fuentes en Google Fit sumados crudos
// → 15-23 h/noche. No es real; se descarta antes de mostrar o mergear.
export const MAX_PLAUSIBLE_SLEEP_H = 14;

// Sanea horas de sueño: null (descartar) si no es finito o supera el techo fisiológico; si no,
// el valor tal cual. Se usa en el merge del bridge y en el parser de HeartWatch para que ningún
// re-import ni atajo aún sin corregir plante un "15h" fantasma. Umbral <6h (alerta clínica) es
// otra cosa y vive en la UI; acá solo cortamos lo imposible.
export function sanitizeSleepHours(hrs) {
  const v = Number(hrs);
  if (!Number.isFinite(v)) return null;
  if (v > MAX_PLAUSIBLE_SLEEP_H) return null;
  return v;
}

// Clave ISO de semana "2026-W26" de una fecha.
export function getISOWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// "+1.2", "−0.4", "0.0" — usa el signo menos tipográfico como en TrendAnalysis.
export function fmtDelta(v, decimals = 1) {
  const s = Math.abs(v).toFixed(decimals);
  if (v > 0) return `+${s}`;
  if (v < 0) return `−${s}`;
  return s;
}

// "2026-05-27" → "27/5".
export function shortDate(key) {
  const [, mm, dd] = (key || '').split('-');
  return dd && mm ? `${Number(dd)}/${Number(mm)}` : key;
}
