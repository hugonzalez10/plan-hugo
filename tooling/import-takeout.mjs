#!/usr/bin/env node
// Import de una pasada de Google Takeout (Google Fit) al bridge de Plan Hugo. Corre LOCAL en el
// Mac donde está el export (~520 MB); el export NO se versiona. Enriquece con:
//   • sueño histórico  → sección `health` (fusiona segmentos solapados; gap-fill, no pisa Watch)
//   • METs por sesión  → enriquece workouts existentes por op:update (no crea sesiones)
//   • curva FC (.tcx)  → workouts.hrSeries, downsampled, solo últimos N días
//
// Lógica pura y testeada en takeout-parse.mjs. Acá va solo fs + HTTP + orquestación.
//
// Uso:
//   BRIDGE_URL=... BRIDGE_TOKEN=... node tooling/import-takeout.mjs <takeout-dir> [opciones]
// Opciones:
//   --sleep --mets --hr   qué importar (si no pasas ninguno, hace los tres)
//   --hr-days N           ventana de la curva FC en días (default 90)
//   --commit              POSTea de verdad. SIN esto es DRY-RUN (solo imprime el plan).
//   --out <archivo>       vuelca el plan (JSON) a un archivo para revisar
//
// Seguridad: dry-run por defecto. Verifica cada write con un GET (el POST puede devolver HTML
// "Page Not Found" aunque escriba OK — nunca reintentar a ciegas, duplica).

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  sleepHoursByNight, deriveMets, parseTcxHeartRate, downsampleHrSeries, localDateKey, MAX_SLEEP_H,
} from './takeout-parse.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const takeoutDir = positional[0];
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const COMMIT = flags.has('--commit');
const OUT = getOpt('--out', null);
const HR_DAYS = Number(getOpt('--hr-days', '90'));
// Si no se pide nada explícito, se hacen los tres.
const wantAll = !flags.has('--sleep') && !flags.has('--mets') && !flags.has('--hr');
const DO_SLEEP = wantAll || flags.has('--sleep');
const DO_METS = wantAll || flags.has('--mets');
const DO_HR = wantAll || flags.has('--hr');

const BRIDGE_URL = process.env.BRIDGE_URL;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

if (!takeoutDir) die('Falta el directorio del export. Uso: node tooling/import-takeout.mjs <takeout-dir> [--commit]');
if (!BRIDGE_URL || !BRIDGE_TOKEN) die('Define BRIDGE_URL y BRIDGE_TOKEN en el entorno (ver skills/food-tracker/SKILL.md).');

const bridgeUrlWithToken = `${BRIDGE_URL}?k=${encodeURIComponent(BRIDGE_TOKEN)}`;

// ── HTTP ────────────────────────────────────────────────────────────────────
async function getBridge() {
  const res = await fetch(bridgeUrlWithToken, { redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { die(`GET del bridge no devolvió JSON (¿token malo?). Primeros 200: ${text.slice(0, 200)}`); }
}

// POST de un delta. Igual que `curl -sL --data` (sin -X POST): fetch sigue el 302 y baja a GET,
// que devuelve el resultado del doPost. NO confía en la respuesta: la verificación va aparte.
async function postDelta(delta) {
  const res = await fetch(bridgeUrlWithToken, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(delta),
  });
  return res.text();
}

// ── Walk del export ──────────────────────────────────────────────────────────
async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

// ── Sueño ─────────────────────────────────────────────────────────────────────
async function collectSleep(files) {
  const sleepFiles = files.filter((f) => /sleep\.segment/i.test(f) && f.endsWith('.json'));
  const allPoints = [];
  for (const f of sleepFiles) {
    try {
      const j = JSON.parse(await readFile(f, 'utf8'));
      const pts = j['Data Points'] || j.dataPoints || [];
      if (Array.isArray(pts)) allPoints.push(...pts);
    } catch (err) { console.warn(`  ⚠ sueño ilegible ${f}: ${err.message}`); }
  }
  return { byNight: sleepHoursByNight(allPoints), fileCount: sleepFiles.length, ptCount: allPoints.length };
}

// Gap-fill: aplica Takeout solo si el día no tiene sueño plausible. Un valor bueno del Watch
// (≤14h) se respeta; un hueco o un valor inflado (>14h, la firma del doble conteo) se corrige.
function planSleepEntries(byNight, bridgeHealth) {
  const existing = new Map();
  for (const h of bridgeHealth || []) {
    const dk = typeof h?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date) ? h.date : null;
    if (dk && h.sleepHours != null) existing.set(dk, Number(h.sleepHours));
  }
  const entries = [];
  let skipped = 0;
  for (const [date, hours] of Object.entries(byNight)) {
    const cur = existing.get(date);
    const hasPlausible = cur != null && cur > 0 && cur <= MAX_SLEEP_H;
    if (hasPlausible) { skipped++; continue; } // dato bueno ya presente → no lo tocamos
    if (!(hours > 0 && hours <= MAX_SLEEP_H)) continue; // Takeout tampoco es plausible → fuera
    entries.push({ date, sleepHours: hours, source: 'fit-takeout' });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { entries, skipped };
}

// ── Sesiones (METs) ────────────────────────────────────────────────────────────
function parseSessionFile(json) {
  // Sesión de Google Fit: startTime/endTime ISO + aggregate[] con metricName/value.
  const start = Date.parse(json.startTime);
  const end = Date.parse(json.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  let kcal = null;
  for (const a of json.aggregate || []) {
    if (/calories\.expended/i.test(a.metricName || '')) {
      kcal = Number(a.floatValue ?? a.value ?? a.intValue);
    }
  }
  return { start, end, hours: (end - start) / 3600000, kcal };
}

// Peso (kg) más cercano en fecha a un instante, desde weights[] del bridge.
function nearestWeight(weights, ms) {
  let best = null, bestDelta = Infinity;
  for (const w of weights || []) {
    const wk = Number(w.weightKg);
    if (!(wk > 0)) continue;
    const wts = w.ts != null ? Number(w.ts) : Date.parse(w.date);
    if (!Number.isFinite(wts)) continue;
    const delta = Math.abs(wts - ms);
    if (delta < bestDelta) { bestDelta = delta; best = wk; }
  }
  return best;
}

// Empareja una sesión de Takeout con un workout del bridge por fecha (y cercanía de hora si hay
// varios ese día). Devuelve el workout o null.
function matchWorkout(bridgeWorkouts, sessionStartMs) {
  const dk = localDateKey(sessionStartMs);
  const sameDay = (bridgeWorkouts || []).filter((w) => {
    const wts = w.ts != null ? Number(w.ts) : Date.parse(w.date);
    return Number.isFinite(wts) && localDateKey(wts) === dk;
  });
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];
  let best = null, bestDelta = Infinity;
  for (const w of sameDay) {
    const wts = w.ts != null ? Number(w.ts) : Date.parse(w.date);
    const delta = Math.abs(wts - sessionStartMs);
    if (delta < bestDelta) { bestDelta = delta; best = w; }
  }
  return best;
}

async function planMets(files, bridge) {
  const sessionFiles = files.filter((f) => /sesion|session/i.test(f) && f.endsWith('.json'));
  const updates = [];
  let noMatch = 0, noWeight = 0;
  for (const f of sessionFiles) {
    let json; try { json = JSON.parse(await readFile(f, 'utf8')); } catch { continue; }
    const s = parseSessionFile(json);
    if (!s || !(s.kcal > 0)) continue;
    const w = matchWorkout(bridge.workouts, s.start);
    if (!w) { noMatch++; continue; }
    const kg = nearestWeight(bridge.weights, s.start);
    if (!kg) { noWeight++; continue; }
    const mets = deriveMets(s.kcal, kg, s.hours);
    if (mets == null) continue;
    if (w.mets != null) continue; // ya enriquecido → idempotente
    updates.push({ id: w.id, date: w.date, name: w.name, fields: { mets } });
  }
  return { updates, noMatch, noWeight, fileCount: sessionFiles.length };
}

// ── Curva FC (.tcx) ─────────────────────────────────────────────────────────
async function planHr(files, bridge) {
  const tcxFiles = files.filter((f) => f.toLowerCase().endsWith('.tcx'));
  const cutoff = Date.now() - HR_DAYS * 86400000;
  const updates = [];
  let noMatch = 0, tooOld = 0, noHr = 0;
  for (const f of tcxFiles) {
    let xml; try { xml = await readFile(f, 'utf8'); } catch { continue; }
    const raw = parseTcxHeartRate(xml);
    if (!raw.length) { noHr++; continue; }
    const start = raw[0].t;
    if (start < cutoff) { tooOld++; continue; }
    const w = matchWorkout(bridge.workouts, start);
    if (!w) { noMatch++; continue; }
    if (Array.isArray(w.hrSeries) && w.hrSeries.length) continue; // ya tiene curva → idempotente
    const hrSeries = downsampleHrSeries(raw, { stepSec: 30, cap: 240 });
    if (!hrSeries.length) continue;
    updates.push({ id: w.id, date: w.date, name: w.name, fields: { hrSeries }, pts: hrSeries.length });
  }
  return { updates, noMatch, tooOld, noHr, fileCount: tcxFiles.length };
}

// ── Verificación tras write ────────────────────────────────────────────────
function verifySleep(after, entries) {
  const idx = new Map((after.health || []).filter((h) => h?.date).map((h) => [h.date, Number(h.sleepHours)]));
  let ok = 0, bad = 0;
  for (const e of entries) {
    if (Math.abs((idx.get(e.date) ?? -999) - e.sleepHours) < 0.11) ok++; else bad++;
  }
  return { ok, bad };
}

// ── Orquestación ──────────────────────────────────────────────────────────────
async function main() {
  const st = await stat(takeoutDir).catch(() => null);
  if (!st || !st.isDirectory()) die(`No es un directorio: ${takeoutDir}`);

  console.log(`▶ Escaneando ${takeoutDir} …`);
  const files = await walk(takeoutDir);
  console.log(`  ${files.length} archivos.`);

  console.log('▶ Leyendo bridge actual …');
  const bridge = await getBridge();
  console.log(`  health:${(bridge.health || []).length} workouts:${(bridge.workouts || []).length} weights:${(bridge.weights || []).length}`);

  const plan = { sleep: null, mets: null, hr: null };

  if (DO_SLEEP) {
    const { byNight, fileCount, ptCount } = await collectSleep(files);
    const nights = Object.keys(byNight).length;
    const { entries, skipped } = planSleepEntries(byNight, bridge.health);
    plan.sleep = entries;
    const under6 = entries.filter((e) => e.sleepHours < 6).length;
    console.log(`\n😴 SUEÑO — ${fileCount} archivos, ${ptCount} segmentos → ${nights} noches fusionadas.`);
    console.log(`   ${entries.length} a escribir (gap-fill), ${skipped} respetadas (dato bueno ya presente), ${under6} noches <6h.`);
    if (entries.length) console.log(`   rango: ${entries[0].date} → ${entries[entries.length - 1].date}`);
  }

  if (DO_METS) {
    plan.mets = (await planMets(files, bridge)).updates;
    const r = plan.mets;
    console.log(`\n💪 METs — ${r.length} sesiones a enriquecer (por op:update, sin crear workouts).`);
  }

  if (DO_HR) {
    const res = await planHr(files, bridge);
    plan.hr = res.updates;
    console.log(`\n🫀 CURVA FC — ${res.fileCount} .tcx, ventana ${HR_DAYS}d → ${res.updates.length} sesiones a enriquecer (${res.tooOld} fuera de ventana, ${res.noMatch} sin match).`);
  }

  if (OUT) { await writeFile(OUT, JSON.stringify(plan, null, 2)); console.log(`\n📄 Plan volcado a ${OUT}`); }

  if (!COMMIT) {
    console.log('\n⚠ DRY-RUN. Nada escrito. Revisa el plan y re-corre con --commit para postear.');
    return;
  }

  // ── Escritura ──
  const today = localDateKey(Date.now());
  if (DO_SLEEP && plan.sleep.length) {
    console.log(`\n▶ Escribiendo ${plan.sleep.length} noches de sueño …`);
    const CHUNK = 200;
    for (let i = 0; i < plan.sleep.length; i += CHUNK) {
      const entries = plan.sleep.slice(i, i + CHUNK);
      await postDelta({ op: 'add', section: 'health', today, entries });
      console.log(`  … ${Math.min(i + CHUNK, plan.sleep.length)}/${plan.sleep.length}`);
    }
    const after = await getBridge();
    const v = verifySleep(after, plan.sleep);
    console.log(`  ✔ verificado por GET: ${v.ok} OK, ${v.bad} sin confirmar.`);
  }

  for (const [label, updates] of [['METs', DO_METS ? plan.mets : []], ['curva FC', DO_HR ? plan.hr : []]]) {
    if (!updates || !updates.length) continue;
    console.log(`\n▶ Enriqueciendo ${updates.length} sesiones (${label}) por op:update …`);
    for (const u of updates) {
      const sel = u.id != null ? { id: u.id } : { date: u.date };
      await postDelta({ op: 'update', section: 'workouts', ...sel, fields: u.fields });
    }
    console.log(`  ✔ ${updates.length} enviadas. (Verifica en la app tras recargar.)`);
  }

  console.log('\n✅ Listo.');
}

main().catch((e) => die(e.stack || e.message));
