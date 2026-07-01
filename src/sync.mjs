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
  sanitizeSleepHours,
} from './fields.mjs';
import { normalizeBridgePayload } from './validate.mjs';
import { makeFood } from './foods.mjs';

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
    foods: state.foods ?? [],
    weights, theme: state.theme ?? null,
  };
  const s = JSON.stringify(slice);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0; }
  return h;
}

// ¿El estado remoto del Gist tiene la forma mínima esperada? Defensa contra un Gist corrupto
// o truncado: `days` debe ser objeto y los bancos/weights arrays. Si no, NO se adopta (se
// conserva el estado local bueno) en vez de pisarlo con basura.
export function isPlausibleState(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.days != null && (typeof s.days !== 'object' || Array.isArray(s.days))) return false;
  for (const k of ['weights', 'snackBank', 'proteinBank', 'dessertBank', 'foods']) {
    if (s[k] != null && !Array.isArray(s[k])) return false;
  }
  return true;
}

export function applyRemoteState(prev, remote, updatedAt) {
  if (!isPlausibleState(remote)) return prev; // Gist corrupto → no pisar lo local
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

// --- Merge 3-way local⊕remoto (sin pérdida) ---------------------------------------------------
// applyRemoteState PISA lo local con el remoto: correcto solo cuando el equipo está limpio (no hay
// nada local que perder). Ante CONFLICTO real (editaste local Y la nube avanzó en otro equipo) hace
// falta unir, no reemplazar. mergeRemoteState une por id/fecha: conserva los registros de AMBOS
// lados. Es pura y testeable (ver tests/gist-merge.test.mjs).

// Unión por clave: conserva todos los de `local` y agrega de `remote` los que no estén ya. Las
// entradas sin clave utilizable (k == null) se conservan siempre — preferimos un duplicado raro a
// perder un registro. `local` gana ante colisión (es el dispositivo actual).
function unionBy(local, remote, keyFn) {
  const out = Array.isArray(local) ? [...local] : [];
  const seen = new Set();
  for (const x of out) { const k = keyFn(x); if (k != null) seen.add(k); }
  for (const x of (Array.isArray(remote) ? remote : [])) {
    const k = keyFn(x);
    if (k != null && seen.has(k)) continue;
    if (k != null) seen.add(k);
    out.push(x);
  }
  return out;
}

const weightKey = (w) => (w == null ? null
  : w.id != null ? 'id:' + w.id
  : w.date != null ? 'dt:' + w.date + '|' + (w.weightKg ?? '') : null);

// Sirve para bancos (objetos con id/name) y para favorites (ids sueltos string/number).
const bankKey = (x) => (x == null ? null
  : typeof x !== 'object' ? 'v:' + String(x)
  : x.id != null ? 'id:' + x.id
  : x.name ? 'nm:' + normalizeName(x.name) : null);

const idKey = (e) => (e && e.id != null ? e.id : null);

// Mergea un día presente en ambos lados: las COLECCIONES (extras/exercise/water.log) se unen para no
// perder ningún registro; los ESCALARES (eaten/snackId/notes…) prefieren el local. Las marcas
// (skipped/nudgesDismissed) se unen como conjunto.
export function mergeDay(a, b) {
  if (!a) return b;
  if (!b) return a;
  const extras = dedupeDayExtras([...(Array.isArray(a.extras) ? a.extras : []), ...(Array.isArray(b.extras) ? b.extras : [])]);
  const exercise = unionBy(a.exercise, b.exercise, idKey);
  const aw = a.water && typeof a.water === 'object' ? a.water : { ml: 0 };
  const bw = b.water && typeof b.water === 'object' ? b.water : { ml: 0 };
  const log = unionBy(aw.log, bw.log, idKey);
  const water = log.length
    ? { ...bw, ...aw, log, ml: log.reduce((s, e) => s + (Number(e?.ml) || 0), 0) }
    : { ...bw, ...aw, ml: Math.max(Number(aw.ml) || 0, Number(bw.ml) || 0) };
  const eaten = { ...(b.eaten || {}), ...(a.eaten || {}) };
  const asArr = (v) => (Array.isArray(v) ? v : []);
  const skipped = [...new Set([...asArr(a.skipped), ...asArr(b.skipped)])];
  const nudgesDismissed = [...new Set([...asArr(a.nudgesDismissed), ...asArr(b.nudgesDismissed)])];
  return { ...b, ...a, extras, exercise, water, eaten, skipped, nudgesDismissed };
}

export function mergeRemoteState(prev, remote, updatedAt) {
  if (!isPlausibleState(remote)) return prev;            // Gist corrupto → no tocar lo local
  if (!prev || typeof prev !== 'object') return applyRemoteState(prev, remote, updatedAt);
  const merged = { ...remote, ...prev };                  // base: lo local gana en escalares de tope
  // days: unión por fecha; los días en ambos lados se mergean campo a campo.
  const localDays = prev.days && typeof prev.days === 'object' ? prev.days : {};
  const remoteDays = remote.days && typeof remote.days === 'object' ? remote.days : {};
  const days = {};
  for (const k of new Set([...Object.keys(localDays), ...Object.keys(remoteDays)])) {
    days[k] = mergeDay(localDays[k], remoteDays[k]);
  }
  merged.days = days;
  merged.weights = unionBy(prev.weights, remote.weights, weightKey);
  merged.energy = unionBy(prev.energy, remote.energy, (e) => (e && e.date != null ? 'dt:' + e.date : null));
  for (const bank of ['snackBank', 'proteinBank', 'dessertBank', 'recipeBank', 'rules', 'favorites']) {
    merged[bank] = unionBy(prev[bank], remote[bank], bankKey);
  }
  // settings/secretos/bridge: preservar lo local sensible (PAT, tokens) y refijar la base del sync.
  merged.settings = {
    ...(remote.settings || {}),
    ...(prev.settings || {}),
    lastRemoteUpdatedAt: updatedAt,
    lastSyncAt: new Date().toISOString(),
  };
  merged.bridge = prev.bridge || remote.bridge;
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

// — Handshake de versión (anti-drift). El .gs sella cada lectura con bridgeVersion = BRIDGE_VERSION;
//   la app compara contra EXPECTED_BRIDGE_VERSION y avisa si la implementación desplegada quedó
//   atrás (el síntoma clásico: campos nuevos descartados en silencio porque no se redeployó el .gs).
//   SUBIR EN LOCKSTEP con BRIDGE_VERSION en apps-script/bridge-writer.gs cada vez que cambie el shape.
export const EXPECTED_BRIDGE_VERSION = 4;

// Drift de versión del bridge desplegado. Devuelve null si está al día; si no, el detalle para el
// indicador. deployed=null = implementación vieja sin sello (todavía no redeployada).
export function bridgeVersionDrift(deployedVersion) {
  const dep = (deployedVersion != null && Number.isFinite(Number(deployedVersion))) ? Number(deployedVersion) : null;
  if (dep != null && dep >= EXPECTED_BRIDGE_VERSION) return null;
  return { stale: true, deployed: dep, expected: EXPECTED_BRIDGE_VERSION };
}

// Endurecimiento de la lectura (Nivel 1): timeout explícito + reintentos con backoff. Sin esto un
// fetch lento colgaba ~2min (default del navegador) y un fallo transitorio rompía el sync hasta el
// siguiente poll (30s). Reintenta SOLO fallos transitorios (red, timeout, 5xx, JSON corrupto/HTML
// de página de error de Google); 4xx y token inválido NO se reintentan.
export const BRIDGE_FETCH_TIMEOUT_MS = 15000;
export const BRIDGE_FETCH_RETRIES = 2; // intentos totales = 1 + reintentos

function bridgeBackoffMs(attempt) {
  return Math.min(4000, 500 * Math.pow(3, attempt)); // 500ms, 1500ms, (4000)
}

async function fetchBridgeOnce(fullUrl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(fullUrl, { redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBridge(url, token, opts = {}) {
  const tokenized = withBridgeToken(url, token);
  const sep = tokenized.includes('?') ? '&' : '?';
  const timeoutMs = opts.timeoutMs ?? BRIDGE_FETCH_TIMEOUT_MS;
  const retries = opts.retries ?? BRIDGE_FETCH_RETRIES;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(bridgeBackoffMs(attempt - 1));
    let resp;
    try {
      resp = await fetchBridgeOnce(tokenized + sep + 't=' + Date.now(), timeoutMs);
    } catch (e) {
      lastErr = (e && e.name === 'AbortError') ? new Error('Timeout del bridge (' + timeoutMs + 'ms)') : (e || new Error('red'));
      continue; // red/timeout → reintentable
    }
    if (!resp.ok) {
      if (resp.status >= 500) { lastErr = new Error('HTTP ' + resp.status); continue; } // 5xx reintentable
      throw new Error('HTTP ' + resp.status); // 4xx no
    }
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      lastErr = new Error('Respuesta del bridge no es JSON (¿página de error de Google?)');
      continue; // HTML/JSON corrupto → reintentable
    }
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
      lifts: Array.isArray(data.lifts) ? data.lifts : [],
      // Biblioteca de alimentos reusables (chat→app): los que la skill agregue al escanear/confirmar
      // fluyen acá y mergeBridge los suma a state.foods sin pisar los curados del usuario.
      foods: Array.isArray(data.foods) ? data.foods : [],
      // Singletons (objetos, no arrays). El doGet del bridge devuelve el archivo completo, así que
      // basta con forwardearlos acá para que fluyan bridge→app (energy no está y por eso nunca fluyó).
      routine: (data.routine && typeof data.routine === 'object' && !Array.isArray(data.routine)) ? data.routine : null,
      exercise_videos: (data.exercise_videos && typeof data.exercise_videos === 'object' && !Array.isArray(data.exercise_videos)) ? data.exercise_videos : {},
      // Sello de versión del .gs desplegado (null si la implementación es vieja y no lo sella).
      bridgeVersion: Number.isFinite(Number(data.bridgeVersion)) ? Number(data.bridgeVersion) : null,
    };
  }
  throw lastErr || new Error('fetch');
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

export function mergeBridge(state, rawBridge) {
  // Frontera del bridge: validar/normalizar ANTES de mergear. Remapea alias conocidos
  // (calories→kcal, kg→weightKg, …) y descarta items irrecuperables, contándolos. Va acá
  // dentro (no solo en fetchBridge) para cubrir TODO camino que llega al merge —live y tests.
  const { payload: bridge, dropped, warnings } = normalizeBridgePayload(rawBridge);
  const num = (v) => Number(v) || 0;
  const importedIds = new Set((state.bridge?.importedIds) || []);
  // Borrados a propósito en la app: el bridge los conserva hasta 10 días, pero NO debemos
  // reimportarlos. `importedIds` ya no basta como freno (ahora es solo optimización: un dato
  // del bridge ausente localmente se reimporta aunque su id figure en importedIds), así que
  // la intención de borrado vive aquí. Ver pushDelete / handlers de borrado.
  const removedBridgeIds = new Set((state.bridge?.removedBridgeIds) || []);
  const days = { ...(state.days || {}) };
  const weights = Array.isArray(state.weights) ? [...state.weights] : [];
  const added = { meals: 0, weights: 0, workouts: 0, checks: 0, water: 0, health: 0, lifts: 0, foods: 0 };

  const ensureDay = (dk) => {
    const base = days[dk] || { eaten: {}, snackId1: null, snackId2: null, proteinId: null, water: { ml: 0 }, skipped: [], nudgesDismissed: [], dessertAlmuerzoId: null, dessertCenaId: null, notes: null };
    days[dk] = { ...base, extras: [...(base.extras || [])], exercise: [...(base.exercise || [])], lifts: [...(base.lifts || [])] };
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
    const localIdx = d.exercise.findIndex((x) => x.id === w.id);
    if (localIdx >= 0) {
      // Ya importado por id. Reconcilia SOLO enriquecimiento: rellena los campos que la sesión
      // local aún NO tiene (p.ej. mets/hrSeries/hrZones que el import de Takeout añade después
      // por w=update sobre una sesión simple ya vista). No pisa detalle local existente. Sin
      // esto, el skip-por-id ignoraba el enriquecimiento y nunca llegaba a la app.
      const cur = d.exercise[localIdx];
      const patch = {};
      for (const f of WORKOUT_EXTRA_FIELDS) {
        if (w[f] == null || cur[f] != null) continue;
        patch[f] = (f === 'type' || f === 'activity' || f === 'hrZonePct') ? w[f] : num(w[f]);
      }
      if (!(Array.isArray(cur.exercises) && cur.exercises.length) && Array.isArray(w.exercises) && w.exercises.length) patch.exercises = w.exercises;
      if (!(cur.hrZones && Object.keys(cur.hrZones).length) && w.hrZones && typeof w.hrZones === 'object' && Object.keys(w.hrZones).length) patch.hrZones = w.hrZones;
      if (!(Array.isArray(cur.hrSeries) && cur.hrSeries.length) && Array.isArray(w.hrSeries) && w.hrSeries.length) patch.hrSeries = w.hrSeries;
      if (Object.keys(patch).length) d.exercise = d.exercise.map((x, i) => (i === localIdx ? { ...x, ...patch } : x));
      importedIds.add(w.id); continue;
    }
    // Dedup por contenido: mismo nombre normalizado DENTRO del día = mismo entreno. NO se exige
    // ventana de ±5 min: el eco del empuje app→bridge vuelve con id E HORA distintos (el servidor
    // sella otro ts), así que `sameWindow` lo dejaba pasar y duplicaba la sesión. Dentro de un día
    // no hay dos sesiones con el mismo nombre, así que el nombre basta (igual que dedup del bridge).
    const wname = normalizeName(w.name);
    if (d.exercise.some((x) => normalizeName(x.name) === wname)) {
      importedIds.add(w.id); continue;
    }
    const ex = { id: w.id, ts: w.ts != null ? w.ts : Date.now(), name: w.name || 'Entrenamiento', kcal: num(w.kcal) };
    for (const f of WORKOUT_EXTRA_FIELDS) {
      if (w[f] == null) continue;
      // type/activity/hrZonePct son strings (hrZonePct = "86/12/1/0/0"); el resto, numérico.
      ex[f] = (f === 'type' || f === 'activity' || f === 'hrZonePct') ? w[f] : num(w[f]);
    }
    if (Array.isArray(w.exercises) && w.exercises.length) ex.exercises = w.exercises;
    if (w.hrZones && typeof w.hrZones === 'object' && Object.keys(w.hrZones).length) ex.hrZones = w.hrZones;
    if (Array.isArray(w.hrSeries) && w.hrSeries.length) ex.hrSeries = w.hrSeries; // curva FC intra-sesión
    d.exercise.push(ex);
    importedIds.add(w.id); added.workouts++;
  }

  // Auto-heal de duplicados ya plantados: colapsa entrenos del MISMO nombre el MISMO día que el eco
  // app→bridge dejó antes de este fix (cuando la ventana de ±5 min no los reconocía). Por nombre, se
  // conserva uno: prioriza el de id del bridge (estable en futuros sync), luego el de más campos. Solo
  // toca días que el bridge cubre (a prueba de fallos de fetch), igual que la reconciliación de meals.
  const bridgeWorkoutIds = new Set((bridge.workouts || []).filter(Boolean).map((w) => w.id));
  const bridgeWorkoutDates = new Set((bridge.workouts || []).filter((w) => w && w.id != null).map((w) => bridgeDateKey(w)));
  for (const dk of bridgeWorkoutDates) {
    const d = days[dk];
    if (!d || !Array.isArray(d.exercise) || d.exercise.length < 2) continue;
    const seen = new Map(); // nombre normalizado → índice en `kept`
    const kept = [];
    for (const x of d.exercise) {
      const key = normalizeName(x.name);
      if (!seen.has(key)) { seen.set(key, kept.length); kept.push(x); continue; }
      const i = seen.get(key); const cur = kept[i];
      const xWins = bridgeWorkoutIds.has(x.id) !== bridgeWorkoutIds.has(cur.id)
        ? bridgeWorkoutIds.has(x.id)                        // el de id del bridge gana
        : Object.keys(x).length > Object.keys(cur).length; // si empatan, el más completo
      if (xWins) kept[i] = x;
    }
    if (kept.length !== d.exercise.length) days[dk] = { ...d, exercise: kept };
  }

  // Sección `lifts`: una SERIE de fuerza por fila (ejercicio ancla + nº de serie). Espejo del loop
  // de workouts: dedup por id y luego por contenido (ejercicio|nº de serie|fecha), import a
  // day.lifts[]. Solo plumbing a estado (no hay UI todavía); fluye al estado persistido vía `days`.
  for (const l of (bridge.lifts || [])) {
    if (l.id == null || removedBridgeIds.has(l.id)) continue;
    const dk = bridgeDateKey(l);
    const d = ensureDay(dk);
    if (d.lifts.some((x) => x.id === l.id)) { importedIds.add(l.id); continue; }
    const lname = normalizeName(l.exercise);
    if (d.lifts.some((x) => normalizeName(x.exercise) === lname && (x.setNumber ?? null) === (l.setNumber ?? null))) {
      importedIds.add(l.id); continue;
    }
    d.lifts.push({
      id: l.id, ts: l.ts != null ? l.ts : Date.now(), date: dk,
      exercise: l.exercise || 'Ejercicio',
      setNumber: l.setNumber != null ? num(l.setNumber) : null,
      weightKg: l.weightKg != null ? num(l.weightKg) : null,
      reps: l.reps != null ? num(l.reps) : null,
      rpe: l.rpe != null ? num(l.rpe) : null,
      isPR: l.isPR === true || l.isPR === 'true' || l.isPR === 1,
      bilateralFlag: l.bilateralFlag === true || l.bilateralFlag === 'true' || l.bilateralFlag === 1,
      source: l.source || 'skill-chat',
    });
    importedIds.add(l.id); added.lifts++;
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
        // Sueño >14h = doble conteo del Shortcut (In Bed+Asleep solapados) o Fit multi-fuente →
        // se descarta para no plantar "15h" ni ensuciar el promedio (no pisa el valor previo bueno).
        if (k === 'sleepHours' && sanitizeSleepHours(v) == null) continue;
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

  // Biblioteca de alimentos (chat→app): la skill agrega al bridge los que Hugo escanea/confirma.
  // Se importan SOLO los nombres que el usuario aún no tiene (no pisar sus per100 curados); cada uno
  // recibe id/key frescos vía makeFood. Espejo del enriquecimiento que la app ya hace localmente.
  // removedFoodKeys (como removedBridgeIds para meals) frena la RESURRECCIÓN: si Hugo borró un food,
  // su key queda vetada y el bridge no lo reimporta aunque siga ahí (el borrado se propaga al .gs,
  // pero esto cubre la ventana hasta que ese write llegue y a otros dispositivos).
  const removedFoodKeys = new Set((state.bridge?.removedFoodKeys) || []);
  let foods = Array.isArray(state.foods) ? state.foods : [];
  if (Array.isArray(bridge.foods) && bridge.foods.length) {
    const haveKeys = new Set(foods.map((f) => f.key || normalizeName(f.name)));
    const incoming = [];
    for (const bf of bridge.foods) {
      if (!bf || !bf.name || !bf.per100) continue;
      const key = bf.key || normalizeName(bf.name);
      if (haveKeys.has(key) || removedFoodKeys.has(key)) continue;
      haveKeys.add(key);
      incoming.push(makeFood({ ...bf, source: bf.source || 'promoted' }));
      added.foods++;
    }
    if (incoming.length) foods = [...foods, ...incoming];
  }

  const nextState = {
    ...state, days, weights, energy, routine, exercise_videos, foods,
    bridge: {
      ...(state.bridge || {}),
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true, lastSyncError: null, lastSyncAdded: added,
      lastSyncDropped: dropped, lastSyncWarnings: warnings,
      // Versión del .gs desplegado (handshake anti-drift). El indicador del header avisa si quedó
      // atrás de EXPECTED_BRIDGE_VERSION. undefined en rawBridge viejos → null (vieja, redeploy).
      deployedVersion: (rawBridge && rawBridge.bridgeVersion != null) ? rawBridge.bridgeVersion : null,
      importedIds: [...importedIds],
    },
  };
  return { state: nextState, added, dropped, warnings };
}

