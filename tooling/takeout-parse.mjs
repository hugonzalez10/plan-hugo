// Lógica PURA del import de Google Takeout (sueño, METs, curva FC). Sin fs, sin HTTP: todo
// entra como datos y sale como datos, para poder testearlo con `node --test`. La orquestación
// (leer archivos, GET/POST al bridge, matching) vive en import-takeout.mjs.
//
// Por qué existe: el export de Google Fit trae segmentos de sueño de VARIAS fuentes (Apple
// Watch + otras apps) que se SOLAPAN. Sumar crudo infla la noche a 15-23 h (bug confirmado).
// La pieza clave es fusionar los intervalos solapados antes de sumar.

// Estados de sueño de Google Fit (com.google.sleep.segment, fitValue.intVal):
//   1 = despierto (en cama), 2 = dormido (genérico), 3 = fuera de cama,
//   4 = sueño ligero, 5 = sueño profundo, 6 = REM.
// Dormido de verdad = {2,4,5,6}. 1 y 3 NO cuentan.
export const ASLEEP_STATES = new Set([2, 4, 5, 6]);

const NANOS_PER_MS = 1e6;

// Techo fisiológico de una noche (horas). Debe coincidir con MAX_PLAUSIBLE_SLEEP_H de dates.mjs:
// tras fusionar bien, ninguna noche debería superarlo; si lo hace, algo quedó sin fusionar.
export const MAX_SLEEP_H = 14;

// Fecha local YYYY-MM-DD de un instante (ms) en una zona horaria. Usa Intl (maneja DST de Chile
// automáticamente, sin librería). 'en-CA' formatea como YYYY-MM-DD.
export function localDateKey(ms, tz = 'America/Santiago') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date(ms));
}

// Fusiona intervalos [start,end] (ms) solapados o contiguos en intervalos disjuntos. Ordena por
// inicio y va extendiendo. Es EL paso que evita el doble conteo multi-fuente.
export function mergeIntervals(intervals) {
  const sorted = intervals
    .filter((iv) => iv && Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end; // extiende el solape
    } else {
      out.push({ start: iv.start, end: iv.end });
    }
  }
  return out;
}

// Extrae intervalos de sueño (dormido) de los data points de un archivo de segmentos de Fit.
// Cada punto: { fitValue:[{value:{intVal}}], startTimeNanos, endTimeNanos }.
export function asleepIntervals(dataPoints) {
  const out = [];
  for (const p of dataPoints || []) {
    if (!p) continue;
    const intVal = p.fitValue && p.fitValue[0] && p.fitValue[0].value && p.fitValue[0].value.intVal;
    if (!ASLEEP_STATES.has(Number(intVal))) continue;
    const start = Number(p.startTimeNanos) / NANOS_PER_MS;
    const end = Number(p.endTimeNanos) / NANOS_PER_MS;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    out.push({ start, end });
  }
  return out;
}

// Horas de sueño por noche a partir de data points de segmentos (uno o varios archivos ya
// concatenados). Fusiona solapados, atribuye cada intervalo a la fecha local del DESPERTAR (fin)
// —convención del handoff— y suma. Devuelve { 'YYYY-MM-DD': horas (1 decimal) }.
export function sleepHoursByNight(dataPoints, tz = 'America/Santiago') {
  const merged = mergeIntervals(asleepIntervals(dataPoints));
  const byNight = new Map();
  for (const iv of merged) {
    const night = localDateKey(iv.end, tz);
    const hours = (iv.end - iv.start) / 3600000;
    byNight.set(night, (byNight.get(night) || 0) + hours);
  }
  const out = {};
  for (const [night, hours] of byNight) out[night] = Math.round(hours * 10) / 10;
  return out;
}

// MET ≈ kcal / (pesoKg × horas). Intensidad relativa de la sesión. Devuelve null si algún
// insumo es inválido (evita METs absurdos o divisiones por 0). Redondea a 1 decimal.
export function deriveMets(kcal, weightKg, hours) {
  const k = Number(kcal), w = Number(weightKg), h = Number(hours);
  if (!(k > 0) || !(w > 0) || !(h > 0)) return null;
  const mets = k / (w * h);
  if (!Number.isFinite(mets) || mets <= 0 || mets > 30) return null; // >30 METs no es humano
  return Math.round(mets * 10) / 10;
}

// Parsea los <Trackpoint> de un .tcx → [{t: epochMs, bpm}] ordenado por tiempo. Regex (no XML
// parser): los .tcx son planos y regulares. Ignora puntos sin FC.
export function parseTcxHeartRate(xml) {
  const out = [];
  if (typeof xml !== 'string') return out;
  const tpRe = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/g;
  let m;
  while ((m = tpRe.exec(xml)) !== null) {
    const block = m[1];
    const timeM = block.match(/<Time>([^<]+)<\/Time>/);
    const hrM = block.match(/<HeartRateBpm\b[^>]*>[\s\S]*?<Value>\s*([\d.]+)\s*<\/Value>/);
    if (!timeM || !hrM) continue;
    const t = Date.parse(timeM[1]);
    const bpm = Number(hrM[1]);
    if (!Number.isFinite(t) || !(bpm > 0)) continue;
    out.push({ t, bpm: Math.round(bpm) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// Downsamplea una serie [{t: epochMs, bpm}] a ~1 punto / stepSec, promediando por bucket, y la
// devuelve como offsets desde el inicio: [{t: offsetSeg, bpm}]. Mantiene el JSON del bridge chico
// (~60-120 pts/sesión). `cap` recorta duro por si una sesión es larguísima.
export function downsampleHrSeries(points, { stepSec = 30, cap = 240 } = {}) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.t) && p.bpm > 0).sort((a, b) => a.t - b.t);
  if (!pts.length) return [];
  const t0 = pts[0].t;
  const buckets = new Map(); // idx de bucket → { sum, n }
  for (const p of pts) {
    const offset = Math.round((p.t - t0) / 1000);
    const idx = Math.floor(offset / stepSec);
    const b = buckets.get(idx) || { sum: 0, n: 0 };
    b.sum += p.bpm; b.n += 1;
    buckets.set(idx, b);
  }
  const series = [...buckets.keys()].sort((a, b) => a - b).map((idx) => ({
    t: idx * stepSec,
    bpm: Math.round(buckets.get(idx).sum / buckets.get(idx).n),
  }));
  return series.length > cap ? series.slice(0, cap) : series;
}
