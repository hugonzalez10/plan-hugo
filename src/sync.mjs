// Sincronización: backup en GitHub Gist y el bridge (Apps Script) chat↔app. Funciones PURAS
// (HTTP + merge + firmas), sin React. Extraída de app.jsx en la modularización (Etapa 1) — el
// paso más delicado: mergeBridge concentra los bugs históricos (doble-conteo, divergencia,
// dedup, fechas) y está cubierto por bridge-merge.test. La orquestación con hooks
// (useGistAutoSync, runBridgeSync, snap/pushPayload) se queda en app.jsx; acá va lo reusable.
import { todayKey } from './dates.mjs';
import { normalizeName, getDeviceId } from './util.mjs';
import {
  extraPlanSlot, resolveColacion, computeDayTotals, chatMealSig, sameWindow, dedupeDayExtras,
} from './meals.mjs';
import {
  WEIGHT_FIELDS, SEGMENT_FIELDS, STRING_FIELDS, WORKOUT_EXTRA_FIELDS, BODY_TYPE_OPTIONS, HEALTH_MERGE_FIELDS,
} from './fields.mjs';

export const GIST_FILENAME = 'plan-hugo.json';
export const GIST_DESCRIPTION = 'Plan Hugo · backup privado (no compartir)';

export function gistHeaders(pat) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${pat}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export function sanitizeStateForUpload(state) {
  const next = JSON.parse(JSON.stringify(state || {}));
  if (Array.isArray(next.weights)) {
    next.weights = next.weights.map((w) => {
      const { sourceImage, ...rest } = w || {};
      return rest;
    });
  }
  if (next.settings && typeof next.settings === 'object') {
    delete next.settings.anthropicApiKey;
    delete next.settings.githubPAT;
    delete next.settings.bridgeUrl;
  }
  return next;
}

export async function gistCreate(pat, state) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  const payload = {
    public: false,
    description: GIST_DESCRIPTION,
    files: { [GIST_FILENAME]: { content: JSON.stringify(sanitizeStateForUpload(state), null, 2) } },
  };
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: gistHeaders(pat),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist create falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  return { id: data.id, updatedAt: data.updated_at, htmlUrl: data.html_url };
}

export async function gistPush(pat, gistId, state) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  if (!gistId) throw new Error('Falta gistId — conecta primero');
  const payload = {
    files: { [GIST_FILENAME]: { content: JSON.stringify(sanitizeStateForUpload(state), null, 2) } },
  };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(pat),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist push falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  return { updatedAt: data.updated_at };
}

export async function gistPull(pat, gistId) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  if (!gistId) throw new Error('Falta gistId');
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers: gistHeaders(pat),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist pull falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  const fileObj = data.files?.[GIST_FILENAME];
  if (!fileObj) throw new Error(`El gist no contiene ${GIST_FILENAME}`);
  // Si el archivo es muy grande GitHub usa raw_url y trunca content. Resolver:
  let content = fileObj.content;
  if (fileObj.truncated && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url);
    if (!rawRes.ok) throw new Error('No se pudo descargar el contenido completo del gist');
    content = await rawRes.text();
  }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) { throw new Error('El gist contiene JSON inválido'); }
  return { state: parsed, updatedAt: data.updated_at };
}

export function syncSig(state) {
  if (!state) return 0;
  const weights = Array.isArray(state.weights)
    ? state.weights.map(({ sourceImage, ...rest }) => rest) : [];
  const slice = {
    userProfile: state.userProfile ?? null,
    snackBank: state.snackBank ?? [], proteinBank: state.proteinBank ?? [],
    dessertBank: state.dessertBank ?? [], rules: state.rules ?? [],
    recipeBank: state.recipeBank ?? [], days: state.days ?? {},
    weights, theme: state.theme ?? null,
  };
  const s = JSON.stringify(slice);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0; }
  return h;
}

export function applyRemoteState(prev, remote, updatedAt) {
  const merged = { ...remote };
  merged.settings = {
    ...(remote.settings || {}),
    githubPAT: prev.settings?.githubPAT ?? null,
    syncGistId: prev.settings?.syncGistId ?? null,
    anthropicApiKey: prev.settings?.anthropicApiKey ?? null,
    bridgeUrl: prev.settings?.bridgeUrl ?? null,
    bridgeToken: prev.settings?.bridgeToken ?? null,
    autoSync: prev.settings?.autoSync ?? true,
    lastRemoteUpdatedAt: updatedAt,
    lastSyncAt: new Date().toISOString(),
  };
  merged.bridge = prev.bridge || merged.bridge;
  merged.settings.lastPushedSig = syncSig(merged);
  return merged;
}

export function hashSig(obj) {
  const str = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export function withBridgeToken(url, token) {
  if (!url || !token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'k=' + encodeURIComponent(token);
}

export async function fetchBridge(url, token) {
  const tokenized = withBridgeToken(url, token);
  const sep = tokenized.includes('?') ? '&' : '?';
  const resp = await fetch(tokenized + sep + 't=' + Date.now(), { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data && data.ok === false && data.reason === 'unauthorized') {
    throw new Error('Token del bridge inválido (revisa Ajustes → Token del bridge).');
  }
  return {
    meals: Array.isArray(data.meals) ? data.meals : [],
    weights: Array.isArray(data.weights) ? data.weights : [],
    workouts: Array.isArray(data.workouts) ? data.workouts : [],
    checks: Array.isArray(data.checks) ? data.checks : [],
    water: Array.isArray(data.water) ? data.water : [],
    health: Array.isArray(data.health) ? data.health : [],
    // Singletons (objetos, no arrays). El doGet del bridge devuelve el archivo completo, así que
    // basta con forwardearlos acá para que fluyan bridge→app (energy no está y por eso nunca fluyó).
    routine: (data.routine && typeof data.routine === 'object' && !Array.isArray(data.routine)) ? data.routine : null,
    exercise_videos: (data.exercise_videos && typeof data.exercise_videos === 'object' && !Array.isArray(data.exercise_videos)) ? data.exercise_videos : {},
  };
}

export function postBridgeDelete(settings, section, id) {
  const url = settings?.bridgeUrl;
  if (!url || id == null) return;
  try {
    fetch(withBridgeToken(url, settings?.bridgeToken), {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ op: 'delete', section, id }),
    }).catch(() => {});
  } catch (e) { /* fire-and-forget */ }
}

export function bridgeDateKey(entry) {
  if (entry && entry.date) return entry.date;
  if (entry && entry.ts != null) {
    const d = new Date(Number(entry.ts));
    if (!Number.isNaN(d.getTime())) return todayKey(d);
  }
  return todayKey();
}

export function healthDateKey(h) {
  const d = h && h.date;
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; // YYYY-MM-DD limpio
    const m = d.match(/^(\d{2})-(\d{2})-(\d{2})$/); // dd-MM-yy del atajo iOS → 20yy-MM-dd
    if (m) {
      const dd = +m[1], mm = +m[2];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `20${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  if (h && h.ts != null) {
    const dt = new Date(Number(h.ts));
    if (!Number.isNaN(dt.getTime())) return todayKey(dt);
  }
  return null;
}

export function mergeBridge(state, bridge) {
  const num = (v) => Number(v) || 0;
  const importedIds = new Set((state.bridge?.importedIds) || []);
  // Borrados a propósito en la app: el bridge los conserva hasta 10 días, pero NO debemos
  // reimportarlos. `importedIds` ya no basta como freno (ahora es solo optimización: un dato
  // del bridge ausente localmente se reimporta aunque su id figure en importedIds), así que
  // la intención de borrado vive aquí. Ver pushDelete / handlers de borrado.
  const removedBridgeIds = new Set((state.bridge?.removedBridgeIds) || []);
  const days = { ...(state.days || {}) };
  const weights = Array.isArray(state.weights) ? [...state.weights] : [];
  const added = { meals: 0, weights: 0, workouts: 0, checks: 0, water: 0, health: 0 };

  const ensureDay = (dk) => {
    const base = days[dk] || { eaten: {}, snackId1: null, snackId2: null, proteinId: null, water: { ml: 0 }, skipped: [], nudgesDismissed: [], dessertAlmuerzoId: null, dessertCenaId: null, notes: null };
    days[dk] = { ...base, extras: [...(base.extras || [])], exercise: [...(base.exercise || [])] };
    return days[dk];
  };

  // Slots que, al venir del bridge, marcan la sección como cumplida: solo colaciones/cena
  // (no tienen ítems fijos con kcal, así que marcar `eaten` no duplica calorías —las kcal
  // vienen del extra). Marcar desayuno/almuerzo sí dispararía el fallback legacy de
  // getMealItemTicks y sumaría kcal fantasma, por eso se excluyen. El slot se resuelve con
  // extraPlanSlot, que mapea el paraguas 'colacion' a colacion1/colacion2 por la hora.
  const BRIDGE_EATEN_SLOTS = new Set(['colacion1', 'colacion2', 'cena']);
  for (const m of bridge.meals) {
    if (m.id == null || removedBridgeIds.has(m.id)) continue;
    const slot = m.mealSlot || 'extra';
    // La fecha la fija el bridge; si faltara (escritura legacy sin `date`), se deriva del
    // ts —NUNCA se asume "hoy", o una comida vieja sin fecha reaparecería como extra de
    // hoy cada día (el bug de divergencia app↔bridge). Sin date ni ts no se puede ubicar.
    const mealDate = m.date || (m.ts != null ? todayKey(new Date(m.ts)) : null);
    if (!mealDate) continue;
    const d = ensureDay(mealDate);
    // NO se corta por importedIds: si el dato está en el bridge pero falta localmente (estado
    // perdido), se reimporta. El freno real es la presencia local (por id o por contenido) y
    // removedBridgeIds (borrados deliberados, ya filtrados arriba).
    const localIdx = d.extras.findIndex((x) => x.id === m.id);
    if (localIdx >= 0) {
      // La comida ya está importada por id. Antes solo se IGNORABA, así que corregir la toma
      // o los macros en el chat (p.ej. "ese filete era cena, no almuerzo") nunca llegaba a la
      // app: quedaba pegado al mealSlot original. El bridge es la autoridad para lo que nació
      // de él (skill-chat), así que reconciliamos los campos mutables cuando difieren. No se
      // tocan los extras de la app (foto/texto): esos se editan localmente.
      const ex = d.extras[localIdx];
      if (ex.source === 'skill-chat') {
        const name = m.name || ex.name;
        const patch = { name, kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat), fiber: num(m.fiber), mealSlot: slot };
        const changed = Object.keys(patch).some((k) => ex[k] !== patch[k]);
        if (changed) {
          d.extras = d.extras.map((x, i) => (i === localIdx ? { ...x, ...patch } : x));
          const detected = extraPlanSlot({ mealSlot: slot, name, ts: ex.ts, source: 'skill-chat' });
          if (BRIDGE_EATEN_SLOTS.has(detected)) d.eaten = { ...(d.eaten || {}), [detected]: true };
        }
      }
      importedIds.add(m.id); continue;
    }
    // Dedup por contenido+ventana contra CUALQUIER extra ya presente ese día (no solo del chat):
    // así también se absorbe el eco del propio empuje app→bridge, que vuelve con id de servidor
    // distinto. Lo damos por importado.
    const sig = chatMealSig(slot, m.name, m.kcal);
    if (d.extras.some((x) => chatMealSig(x.mealSlot, x.name, x.kcal) === sig && sameWindow(x.ts, m.ts))) {
      importedIds.add(m.id); continue;
    }
    d.extras.push({
      id: m.id, ts: m.ts != null ? m.ts : Date.now(), name: m.name || 'Comida',
      kcal: num(m.kcal), protein: num(m.protein),
      carbs: num(m.carbs), fat: num(m.fat), fiber: num(m.fiber),
      mealSlot: slot, source: 'skill-chat',
    });
    const detected = extraPlanSlot({ mealSlot: slot, name: m.name, ts: m.ts, source: 'skill-chat' });
    if (BRIDGE_EATEN_SLOTS.has(detected)) d.eaten = { ...(d.eaten || {}), [detected]: true };
    importedIds.add(m.id); added.meals++;
  }

  // Reconciliación: poda extras del chat que el bridge ya no tiene. Cada extra con
  // source 'skill-chat' nació de un meal del bridge y conserva su id de servidor. Si ese id
  // desapareció de bridge.meals (anulado, borrado vía ?w=delete, o re-dedupeado/movido de
  // fecha en el servidor), el extra local quedó HUÉRFANO. Sin esto el merge solo AGREGA y
  // nunca quita, así que una corrección del chat (p.ej. anular una comida de fecha errónea)
  // neteaba en el bridge pero seguía inflando el total local —el bug de divergencia app↔bridge.
  // Solo se reconcilian días que el bridge cubre (≥1 meal): si bridge.meals viene vacío o el
  // día ya se podó por antigüedad (retención del bridge: meals 30d), no se toca nada (a prueba de fallos de fetch).
  // Los extras de la app (manual/photo/repeat/...) llevan otro source y uuid local: intactos.
  const bridgeMealIds = new Set();
  const bridgeMealDates = new Set();
  for (const m of bridge.meals) {
    if (m == null || m.id == null) continue;
    // Mismo criterio que el import: fecha del bridge, o derivada del ts; nunca "hoy" a ciegas.
    const mealDate = m.date || (m.ts != null ? todayKey(new Date(m.ts)) : null);
    if (mealDate) bridgeMealDates.add(mealDate);
    if (!removedBridgeIds.has(m.id)) bridgeMealIds.add(m.id);
  }
  for (const dk of bridgeMealDates) {
    const d = days[dk];
    if (!d || !Array.isArray(d.extras)) continue;
    const kept = d.extras.filter((x) => x?.source !== 'skill-chat' || bridgeMealIds.has(x.id));
    if (kept.length !== d.extras.length) days[dk] = { ...d, extras: kept };
  }

  for (const w of bridge.workouts) {
    if (w.id == null || removedBridgeIds.has(w.id)) continue;
    const d = ensureDay(bridgeDateKey(w));
    // No se corta por importedIds (ver meals): reimporta si falta localmente.
    if (d.exercise.some((x) => x.id === w.id)) { importedIds.add(w.id); continue; }
    // Dedup por contenido+ventana (nombre normalizado dentro del día): absorbe el eco del
    // empuje app→bridge, que vuelve con id de servidor distinto.
    const wname = normalizeName(w.name);
    if (d.exercise.some((x) => normalizeName(x.name) === wname && sameWindow(x.ts, w.ts))) {
      importedIds.add(w.id); continue;
    }
    const ex = { id: w.id, ts: w.ts != null ? w.ts : Date.now(), name: w.name || 'Entrenamiento', kcal: num(w.kcal) };
    for (const f of WORKOUT_EXTRA_FIELDS) {
      if (w[f] == null) continue;
      ex[f] = (f === 'type' || f === 'activity') ? w[f] : num(w[f]);
    }
    if (Array.isArray(w.exercises) && w.exercises.length) ex.exercises = w.exercises;
    if (w.hrZones && typeof w.hrZones === 'object' && Object.keys(w.hrZones).length) ex.hrZones = w.hrZones;
    d.exercise.push(ex);
    importedIds.add(w.id); added.workouts++;
  }

  for (const wt of bridge.weights) {
    if (wt.id == null || removedBridgeIds.has(wt.id)) continue;
    const date = bridgeDateKey(wt);
    const idx = weights.findIndex((x) => x.date === date);
    if (idx >= 0) {
      // Ya hay medición local de ese día (dedup por fecha). Mergeamos los campos que el bridge
      // traiga en CADA sync —no solo la primera vez— para que un `w=update` que COMPLETA o
      // corrige una medición se propague aunque su id ya esté en importedIds (antes el freno
      // por importedIds hacía el enriquecimiento de una sola pasada y los updates no llegaban).
      // La asignación de campos es idempotente; solo aplicamos `changed` cuando el valor del
      // bridge difiere del local, así un sync sin novedades no churna ni cuenta como import. El
      // único riesgo no idempotente era duplicar la nota (`nota · nota · …`): se evita
      // comprobando que no esté ya contenida.
      const cur = weights[idx];
      const merged = { ...cur };
      let changed = false;
      for (const wf of WEIGHT_FIELDS) {
        if (wt[wf.key] != null && wt[wf.key] !== merged[wf.key]) { merged[wf.key] = wt[wf.key]; changed = true; }
      }
      for (const sf of STRING_FIELDS) {
        if (wt[sf.key] != null && wt[sf.key] !== merged[sf.key]) { merged[sf.key] = wt[sf.key]; changed = true; }
      }
      for (const seg of SEGMENT_FIELDS) {
        if (wt[seg.key] != null && wt[seg.key] !== merged[seg.key]) { merged[seg.key] = wt[seg.key]; changed = true; }
      }
      if (wt.note && !String(merged.note || '').includes(wt.note)) {
        merged.note = merged.note ? `${merged.note} · ${wt.note}` : wt.note; changed = true;
      }
      if (wt.rawExtracted) merged.rawExtracted = { ...(merged.rawExtracted || {}), ...wt.rawExtracted };
      if (wt.time && !merged.time) { merged.time = wt.time; changed = true; }
      if (changed) { weights[idx] = merged; added.weights++; }
      importedIds.add(wt.id);
      continue;
    }
    // No hay medición local de ese día → agregar. Reimporta aunque el id ya esté en importedIds
    // (el dato se perdió del estado local); el freno de borrado es removedBridgeIds (arriba).
    const out = { id: wt.id, date, time: wt.time || null, note: wt.note || '', rawExtracted: wt.rawExtracted || {}, sourceImage: null };
    for (const wf of WEIGHT_FIELDS) out[wf.key] = wt[wf.key] != null ? wt[wf.key] : null;
    for (const sf of STRING_FIELDS) out[sf.key] = wt[sf.key] != null ? wt[sf.key] : null;
    for (const seg of SEGMENT_FIELDS) out[seg.key] = wt[seg.key] != null ? wt[seg.key] : null;
    weights.push(out);
    importedIds.add(wt.id); added.weights++;
  }

  // Agua registrada por chat (section `water`, append-only, cada entrada es un `ml`).
  // Se acumula en `day.water.bridgeMl` — SEPARADO de `day.water.ml` (el agua que Hugo
  // marca en la app) — para que el snapshot siga empujando solo SU agua y el bridge no
  // la doble-cuente en ?totals (que ya suma el water[] del servidor). importedIds es
  // freno DURO aquí (a diferencia de meals): el agua es una suma corriente, reimportar
  // un id ausente la inflaría.
  // ECO PROPIO: ahora la app TAMBIÉN escribe en bridge.water[] (los botones +/−, vía water.log,
  // con source:'app' + deviceId). Reconocemos nuestra propia entrada por deviceId —disponible SIEMPRE
  // al importar, sin depender del timing del log local— y NO la sumamos a bridgeMl (ya está en
  // water.ml; si no, doble conteo en el origen). El agua del chat (sin deviceId) y la de OTROS
  // dispositivos (otro deviceId) sí se importan. Entradas legacy source:'app' sin deviceId también.
  if (Array.isArray(bridge.water)) {
    const myDevice = getDeviceId();
    for (const wd of bridge.water) {
      if (wd == null || wd.id == null || removedBridgeIds.has(wd.id) || importedIds.has(wd.id)) continue;
      const d = ensureDay(bridgeDateKey(wd));
      const cur = d.water || { ml: 0 };
      const isOwnEcho = wd.source === 'app' && wd.deviceId != null && wd.deviceId === myDevice;
      if (!isOwnEcho) { d.water = { ...cur, bridgeMl: (Number(cur.bridgeMl) || 0) + (Number(wd.ml) || 0) }; }
      importedIds.add(wd.id); added.water++;
    }
  }

  // Métricas de Apple Health (sección `health`, una fila/día). SOLO CONTEXTO: nunca se restan
  // de las kcal ni entran como ejercicio — el TDEE adaptativo ya captura el gasto vía tendencia
  // de peso (evita el doble conteo). Overwrite-por-fecha e idempotente: re-mergear la misma fila
  // reescribe los mismos valores, así que NO usa importedIds (a diferencia del agua, que suma).
  // El Shortcut re-postea el día completo, así que el último valor del día es el bueno.
  if (Array.isArray(bridge.health)) {
    for (const h of bridge.health) {
      if (h == null) continue;
      const dk = healthDateKey(h); // normaliza fechas no-estándar del Shortcut (deriva del ts)
      if (!dk) continue; // sin fecha ubicable
      const d = ensureDay(dk);
      const next = { ...(d.health || {}) };
      // FC/HRV/SpO₂/VO₂máx nunca son 0 en una persona viva: un 0 es el promedio vacío del atajo
      // (no encontró muestra de hoy) o una celda vacía del CSV → se descarta para no mostrar
      // "FC reposo 0 lpm" ni pisar el valor previo. Pasos/energía/sueño SÍ pueden ser 0
      // legítimamente, así que solo se filtran las métricas de signos vitales.
      const POSITIVE_ONLY = new Set(['restingHr', 'vo2max', 'hrvSleep', 'hrvWake', 'sleepingHr', 'sedentaryHr', 'spo2Daily', 'spo2Sleep', 'recovery2min']);
      for (const k of HEALTH_MERGE_FIELDS) {
        if (h[k] == null || h[k] === '') continue;
        const v = Number(h[k]);
        if (!Number.isFinite(v)) continue;
        if (POSITIVE_ONLY.has(k) && v <= 0) continue;
        next[k] = v;
      }
      if (h.ts != null) next.healthTs = Number(h.ts);
      d.health = next;
      added.health++;
    }
  }

  // Marca secciones FIJAS del plan como comidas (sin duplicar). Backward-compatible:
  // los bridges antiguos no traen `checks`. Cada check se aplica una sola vez (id en
  // importedIds), para no re-marcar si Hugo lo destilda manualmente en la app.
  if (Array.isArray(bridge.checks)) {
    const FIXED_MEAL_SLOTS = new Set(['desayuno', 'almuerzo', 'colacion1', 'colacion2', 'cena', 'dessertAlmuerzo', 'dessertCena']);
    for (const c of bridge.checks) {
      if (c == null || c.id == null || importedIds.has(c.id)) continue;
      // El check 'colacion' (paraguas de la skill) se resuelve a colacion1/2 por la hora.
      const meal = c.meal === 'colacion' ? resolveColacion(c) : c.meal;
      if (!FIXED_MEAL_SLOTS.has(meal)) continue;
      const d = ensureDay(bridgeDateKey(c));
      // Si esa sección ya tiene un registro real del chat, NO marcar el fijo como comido:
      // el extra es la comida y marcar el plan sumaría kcal fantasma (ver computeDayTotals).
      const alreadyLogged = (d.extras || []).some((x) => extraPlanSlot(x) === meal);
      if (!alreadyLogged) d.eaten = { ...(d.eaten || {}), [meal]: true };
      importedIds.add(c.id); added.checks++;
    }
  }

  // Serie `energy` (balance energético por día) que el bridge retiene para siempre. Se mergea
  // por fecha en state.energy (latest gana) SIN tocar el log de comidas: alimenta el TDEE
  // adaptativo en dispositivos cuyo `days` no tiene el historial (meals podadas a 30 días).
  let energy = Array.isArray(state.energy) ? [...state.energy] : [];
  if (Array.isArray(bridge.energy) && bridge.energy.length) {
    const byDate = new Map(energy.map((e) => [e.date, e]));
    for (const e of bridge.energy) {
      if (!e || !e.date) continue;
      const cur = byDate.get(e.date);
      byDate.set(e.date, {
        date: e.date,
        kcalIn: e.kcalIn != null ? Number(e.kcalIn) : (cur?.kcalIn ?? null),
        trendWeightKg: e.trendWeightKg != null ? Number(e.trendWeightKg) : (cur?.trendWeightKg ?? null),
      });
    }
    energy = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Rutina: objeto singleton, gana el más nuevo por updatedAt (el bridge solo pisa si es posterior).
  let routine = state.routine;
  if (bridge.routine && bridge.routine.updatedAt) {
    const cur = state.routine?.updatedAt || '';
    if (!cur || bridge.routine.updatedAt > cur) routine = bridge.routine;
  }
  // Videos por ejercicio: unión de claves del mapa (NUNCA reemplazo total, así devices concurrentes
  // conservan sus slugs). Por slug, gana el assignedAt más reciente.
  let exercise_videos = { ...(state.exercise_videos || {}) };
  if (bridge.exercise_videos && typeof bridge.exercise_videos === 'object') {
    for (const [slug, v] of Object.entries(bridge.exercise_videos)) {
      if (!v || !v.youtube_id) continue;
      const local = exercise_videos[slug];
      if (!local || (v.assignedAt && (!local.assignedAt || v.assignedAt > local.assignedAt))) {
        exercise_videos[slug] = v;
      }
    }
  }

  const nextState = {
    ...state, days, weights, energy, routine, exercise_videos,
    bridge: {
      ...(state.bridge || {}),
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true, lastSyncError: null, lastSyncAdded: added,
      importedIds: [...importedIds],
    },
  };
  return { state: nextState, added };
}

