// Parsing puro (JSON tolerante de la IA, plantillas de rutina, slugs), sin React/JSX.
// Extraído de app.jsx en la modularización (Etapa 1, sub-etapa 2). Autocontenido: no
// depende de otros módulos. esbuild lo reinjecta en el bundle.

// Slug estable de un ejercicio: minúsculas, sin tildes, espacios/símbolos → guiones. Es la
// clave de unión entre la rutina y el mapa exercise_videos, así un video sobrevive a renovar
// la rutina (se re-vincula por slug). OJO: distinto de normalizeName (que NO quita tildes y se
// usa para el dedup de comidas — no tocar ese).
export function slugifyExercise(name) {
  return (name || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Extrae el youtube_id (11 chars) de una URL pegada. Cubre watch?v=, youtu.be/, /shorts/ y
// /embed/. Devuelve null si no parsea (la app nunca auto-asigna: Hugo siempre pega y confirma).
export function extractYoutubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// JSON tolerante: la IA (sonnet) envuelve el JSON en fences markdown pese al prompt, y a veces
// trunca la respuesta. Quita fences, recorta del primer { al cierre balanceado (respetando
// strings) y, si quedó truncado, cierra lo abierto en orden inverso (mejor esfuerzo). null si
// no se puede parsear. Lo comparten las 6 funciones de extracción/sugerencia con IA.
export function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  // Quitar fences markdown ```json … ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  // Intento directo: del primer { al último }
  const last = s.lastIndexOf('}');
  if (last > start) {
    try { return JSON.parse(s.slice(start, last + 1)); } catch {}
  }
  // Recorrer balanceando llaves/corchetes (respetando strings); stack guarda los cierres pendientes
  const stack = [];
  let inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') { stack.pop(); if (stack.length === 0) { end = i; break; } }
  }
  if (end >= 0) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  // Respuesta truncada: cerrar lo que quedó abierto, en orden inverso del stack (mejor esfuerzo)
  let frag = s.slice(start);
  if (inStr) frag += '"';
  frag = frag.replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) frag += stack[i];
  try { return JSON.parse(frag); } catch {}
  if (typeof console !== 'undefined') console.warn('[parseJsonLoose] no se pudo parsear:', s.slice(0, 500));
  return null;
}

// — Parser de plantilla de rutina (texto/markdown del .docx) → estructura de días+ejercicios.
// Líneas de prosa (calentamiento, rampa, ▶ enlaces, cardio de cierre, progresión) se ignoran
// porque no calzan el patrón fila (nombre + peso-kg + series×reps).
const RX_DAY_HEADER = /^#{0,3}\s*Día\s*(\d+)\s*[—–-]\s*(.+?)\s*(?:\(~?\s*(\d+)\s*min\))?\s*$/i;
const RX_WEIGHT = /^\d+([.,]\d+)?\s*kg\b/i;            // "75 kg", "42,5 kg", "8 kg"
const RX_REPS = /\d+\s*[×xX]\s*\d+/;                    // "4 × 8", "3 × 12 c/pierna"
const RX_REST = /\b(min|seg|s)\b/i;                     // "2-3 min", "45-60 s", "2 min"

function _mkExercise(rawName, peso, reps, descanso) {
  let name = String(rawName || '').trim();
  let anchor = false;
  const am = name.match(/^⚓\s*/);
  if (am) { anchor = true; name = name.slice(am[0].length).trim(); }
  if (!name) return null;
  return {
    name, anchor,
    pesoInicio: peso ? String(peso).trim() : null,
    seriesReps: reps ? String(reps).trim() : null,
    descanso: descanso ? String(descanso).trim() : null,
    ramp: null, // la rampa por ejercicio solo la rellena la IA; el template deja el bloque del día
    notas: null,
  };
}

// Devuelve el valor tras el primer ":" de una línea etiquetada (o la línea completa si no hay).
function _afterColon(line) {
  const i = line.indexOf(':');
  return (i >= 0 ? line.slice(i + 1) : line).trim();
}

export function parseRoutineTemplate(rawText) {
  const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim());
  const days = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const h = line.match(RX_DAY_HEADER);
    if (h) {
      cur = { label: `Día ${h[1]} — ${h[2].trim()}`, durationMin: h[3] ? Number(h[3]) : null, warmup: null, ramp: null, cardioClose: null, note: null, exercises: [] };
      days.push(cur);
      continue;
    }
    if (!cur) continue;
    // Bloques de prosa del día (primer-valor-gana: las secciones globales del FINAL del doc
    // —"Rampa de aproximación — regla general", "Cómo progresar"— caen bajo el último día,
    // que ya tiene sus bloques, así que no los pisan).
    if (/^Calentamiento/i.test(line)) { if (!cur.warmup) cur.warmup = _afterColon(line); continue; }
    if (/^Rampa de aproximación/i.test(line)) { if (!cur.ramp) cur.ramp = _afterColon(line); continue; }
    if (/^Cardio de cierre/i.test(line)) { if (!cur.cardioClose) cur.cardioClose = _afterColon(line); continue; }
    // (a) Fila markdown con pipes.
    if (line.indexOf('|') >= 0) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length && cells[0] === '') cells.shift();
      if (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (!cells.length) continue;
      if (/ejercicio/i.test(cells[0])) continue;                          // encabezado
      if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) continue;   // separador ---
      const ex = _mkExercise(cells[0], cells[1], cells[2], cells[3]);
      if (ex) cur.exercises.push(ex);
      continue;
    }
    // (b) Celdas sueltas (mammoth): nombre + línea-peso + línea-reps (+ línea-descanso).
    const w = lines[i + 1], r = lines[i + 2], d = lines[i + 3];
    if (w && r && RX_WEIGHT.test(w) && RX_REPS.test(r)) {
      const hasRest = d && RX_REST.test(d) && !RX_DAY_HEADER.test(d);
      const ex = _mkExercise(line, w, r, hasRest ? d : null);
      if (ex) cur.exercises.push(ex);
      i += hasRest ? 3 : 2; // saltar las celdas ya consumidas
      continue;
    }
    // (c) Catch-all `note`: días de cardio puro SIN tabla (ej. Día 3). El guard exercises.length===0
    // evita capturar la prosa global del final (que cae bajo el último día, ya con ejercicios) y
    // los encabezados de tabla. No captura ▶ enlaces ni celdas de tabla sueltas.
    if (cur.exercises.length === 0 && !line.startsWith('▶') &&
        !/^(Ejercicio|Peso inicio|Series|Descanso)\b/i.test(line) && !RX_WEIGHT.test(line) && !RX_REPS.test(line)) {
      cur.note = cur.note ? `${cur.note} ${line}` : line;
    }
  }
  return { title: 'Rutina Speediance', days };
}

// Converge ambos caminos: estampa updatedAt, id por día y slug por ejercicio.
export function normalizeRoutine(j) {
  const str = (v) => (v != null && String(v).trim() ? String(v).trim() : null);
  const days = (Array.isArray(j?.days) ? j.days : []).map((d, i) => ({
    id: `dia-${i + 1}`,
    label: String(d?.label || `Día ${i + 1}`).trim(),
    durationMin: d?.durationMin != null && !isNaN(Number(d.durationMin)) ? Number(d.durationMin) : null,
    warmup: str(d?.warmup),
    ramp: str(d?.ramp),
    cardioClose: str(d?.cardioClose),
    note: str(d?.note),
    exercises: (Array.isArray(d?.exercises) ? d.exercises : []).map((ex) => {
      const name = String(ex?.name || '').trim();
      return {
        slug: slugifyExercise(name),
        name,
        anchor: !!ex?.anchor,
        pesoInicio: str(ex?.pesoInicio),
        seriesReps: str(ex?.seriesReps),
        descanso: str(ex?.descanso),
        ramp: str(ex?.ramp),
        notas: str(ex?.notas),
      };
    }).filter((ex) => ex.name),
  }));
  return {
    title: String(j?.title || 'Rutina').trim() || 'Rutina',
    updatedAt: new Date().toISOString(),
    days,
  };
}
