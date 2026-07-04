// Persistencia local (localStorage + espejo IndexedDB con rescate) y migración de versiones.
// Sin React/JSX. Extraída de app.jsx en la modularización (Etapa 1). Quedó extraíble recién
// con el seed fuera: migrateState mergea el arsenal/seed en instalaciones viejas, así que
// importa esos datos de seed.mjs (+ uuid/normalizeName de util.mjs).
import { uuid, normalizeName } from './util.mjs';
import {
  buildSeed, SEED_SNACKS, SEED_PROTEINS, SEED_DESSERTS, SEED_RECIPES, SEED_RULES, SNACK_TAGS,
  ARSENAL_V2_SNACKS, ARSENAL_V2_PROTEINS, ARSENAL_V2_DESSERTS, SEED_FOODS, FOODS_V2,
} from './seed.mjs';
import { extraPlanSlot, dedupeDayExtras } from './meals.mjs';
import { sanitizeSleepHours } from './fields.mjs';

export const STORAGE_KEY = 'plan-hugo-v3';
export const BACKUP_STORAGE_KEY = 'plan-hugo-v3-bak';
export const LEGACY_STORAGE_KEYS = ['plan-hugo-v2', 'plan-hugo-v1'];

export const IDB_NAME = 'plan-hugo';
export const IDB_STORE = 'kv';
export const IDB_KEY = 'state';

export function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.snackBank) || !Array.isArray(parsed.proteinBank)) return null;
  const next = { ...parsed };
  next.version = 3;
  if (next.userProfile === undefined) next.userProfile = null;
  if (next.userProfile && typeof next.userProfile === 'object') {
    // Migración de esquema viejo→nuevo: perfiles guardados por versiones previas
    // usaban otros nombres de campo, lo que dejaba a calcMifflinStJeor con valores
    // undefined y la meta caía al fallback plano (2300). Mapear a los nombres que
    // calcTargets espera (solo si el campo nuevo aún no existe).
    const up = next.userProfile;
    if (up.weightKg == null && up.weight != null) up.weightKg = Number(up.weight) || null;
    if (up.heightCm == null && up.height != null) up.heightCm = Number(up.height) || null;
    if (up.activityLevel == null && up.activity != null) up.activityLevel = up.activity;
    if (up.sex === 'male' || up.sex === 'M') up.sex = 'M';
    else if (up.sex === 'female' || up.sex === 'F') up.sex = 'F';
    if (up.goal === 'cut') up.goal = 'lose';
    else if (up.goal === 'bulk') up.goal = 'gain';
    else if (up.goal === 'maintain' || up.goal === 'maintenance') up.goal = 'maintain';
    delete up.weight; delete up.height; delete up.activity;
    if (!Number.isFinite(next.userProfile.kcalDeficit)) {
      next.userProfile.kcalDeficit = next.userProfile.goal === 'lose' ? 400 : null;
    }
    if (next.userProfile.lastAdjustmentDate === undefined) {
      next.userProfile.lastAdjustmentDate = null;
    }
  }
  next.days = next.days || {};
  next.settings = next.settings || {};
  next.settings = {
    anthropicApiKey: next.settings.anthropicApiKey ?? null,
    saveImages: next.settings.saveImages ?? false,
    notifications: next.settings.notifications || { enabled: false, colacion1: '11:00', almuerzo: '13:30', colacion2: '18:00', agua: '16:00', cena: '20:30' },
    githubPAT: next.settings.githubPAT ?? null,
    syncGistId: next.settings.syncGistId ?? null,
    lastSyncAt: next.settings.lastSyncAt ?? null,
    bridgeUrl: next.settings.bridgeUrl ?? null,
    bridgeToken: next.settings.bridgeToken ?? null,
    autoSync: next.settings.autoSync ?? true,
    lastPushedSig: next.settings.lastPushedSig ?? null,
    lastRemoteUpdatedAt: next.settings.lastRemoteUpdatedAt ?? null,
    tabOrder: Array.isArray(next.settings.tabOrder) ? next.settings.tabOrder : null,
  };
  next.weights = Array.isArray(next.weights) ? next.weights : [];
  next.recipeBank = Array.isArray(next.recipeBank) ? next.recipeBank : [];

  // Carga única del "arsenal v1": suma los seeds nuevos (desayunos/colaciones, recetas
  // armadas, postres) SIN tocar lo que el usuario ya tiene, y sin resucitar nada que él
  // haya borrado después (la marca arsenalVersion hace que corra solo una vez).
  const mergeBuiltins = (existing, seeds, makeEntry) => {
    const have = new Set((existing || []).map((x) => normalizeName(x.name)));
    const add = seeds.filter((s) => !have.has(normalizeName(s.name))).map(makeEntry);
    return [...(existing || []), ...add];
  };
  if (!(Number(next.arsenalVersion) >= 1)) {
    next.snackBank = mergeBuiltins(next.snackBank, SEED_SNACKS, (s) => ({ carbs: 0, fat: 0, fiber: 0, ...s, id: uuid(), builtin: true }));
    next.dessertBank = mergeBuiltins(next.dessertBank, SEED_DESSERTS, (d) => ({ carbs: 0, fat: 0, fiber: 0, ...d, id: uuid(), builtin: true }));
    next.recipeBank = mergeBuiltins(next.recipeBank, SEED_RECIPES, (r) => ({ ...r, id: uuid(), builtin: true, createdAt: null }));
    next.arsenalVersion = 1;
  }
  // Carga única del "arsenal v2": suma el arsenal de Hugo (proteínas/colaciones/postres
  // nuevos) sin tocar lo existente. Mergea SOLO el delta ARSENAL_V2_* (no el SEED completo)
  // para no resucitar builtins viejos que el usuario haya borrado. A diferencia de v1, acá
  // sí se mergea proteinBank (el atún de cena sin cocción cae ahí).
  if (!(Number(next.arsenalVersion) >= 2)) {
    next.snackBank = mergeBuiltins(next.snackBank, ARSENAL_V2_SNACKS, (s) => ({ carbs: 0, fat: 0, fiber: 0, ...s, id: uuid(), builtin: true }));
    next.proteinBank = mergeBuiltins(next.proteinBank, ARSENAL_V2_PROTEINS, (p) => ({ carbs: 0, fat: 0, fiber: 0, ...p, id: uuid(), builtin: true }));
    next.dessertBank = mergeBuiltins(next.dessertBank, ARSENAL_V2_DESSERTS, (d) => ({ carbs: 0, fat: 0, fiber: 0, ...d, id: uuid(), builtin: true }));
    next.arsenalVersion = 2;
  }
  // Arsenal v3: las dos colaciones (11h transportable / 18h transportable + sin nevera) usan
  // las etiquetas de transporte para ordenar el banco. Retro-rellena esas tags en los snacks
  // builtin ya guardados que nacieron sin ellas (el merge solo agrega, no actualiza). Solo
  // toca builtin SIN tags propias, para no pisar lo que Hugo haya etiquetado a mano.
  if (!(Number(next.arsenalVersion) >= 3)) {
    next.snackBank = (next.snackBank || []).map((s) => {
      if (!s || !s.builtin || (Array.isArray(s.tags) && s.tags.length)) return s;
      const t = SNACK_TAGS[normalizeName(s.name)];
      return t ? { ...s, tags: [...t] } : s;
    });
    next.arsenalVersion = 3;
  }
  // Biblioteca de alimentos reusables (state.foods, Fase B/C). Inicializa el store y carga la
  // semilla curada de integrales una sola vez (foodsVersion), sin resucitar lo que el usuario
  // borre — mismo patrón que el arsenal. Dedup por nombre normalizado.
  next.foods = Array.isArray(next.foods) ? next.foods : [];
  if (!(Number(next.foodsVersion) >= 1)) {
    const haveFoods = new Set(next.foods.map((f) => normalizeName(f.name)));
    const addFoods = SEED_FOODS
      .filter((f) => !haveFoods.has(normalizeName(f.name)))
      .map((f) => ({ ...f, id: uuid(), key: normalizeName(f.name), source: 'seed', builtin: true, usageCount: 0, lastUsedAt: null }));
    next.foods = [...next.foods, ...addFoods];
    next.foodsVersion = 1;
  }
  // foodsVersion 2: delta de la base curada de Hugo (FOODS_V2). Mismo patrón que el arsenal —
  // mergea solo los nombres ausentes, así no resucita lo que el usuario haya borrado en v1.
  if (!(Number(next.foodsVersion) >= 2)) {
    const haveFoods = new Set(next.foods.map((f) => normalizeName(f.name)));
    const addFoods = FOODS_V2
      .filter((f) => !haveFoods.has(normalizeName(f.name)))
      .map((f) => ({ ...f, id: uuid(), key: normalizeName(f.name), source: 'seed', builtin: true, usageCount: 0, lastUsedAt: null }));
    next.foods = [...next.foods, ...addFoods];
    next.foodsVersion = 2;
  }
  next.bridge = (next.bridge && Array.isArray(next.bridge.importedIds))
    ? next.bridge
    : { lastSyncAt: next.bridge?.lastSyncAt || null, importedIds: [] };
  // Sets auxiliares del sync (pueden faltar en estados viejos):
  //  · pushedIds       → ya empujados app→bridge (no reenviar).
  //  · removedBridgeIds → borrados a propósito en la app; el merge NO los reimporta
  //    aunque sigan en el bridge (vive 10 días). Sin esto, volver importedIds "blando"
  //    resucitaría lo borrado. Ver mergeBridge.
  if (!Array.isArray(next.bridge.pushedIds)) next.bridge.pushedIds = [];
  if (!Array.isArray(next.bridge.removedBridgeIds)) next.bridge.removedBridgeIds = [];
  //  · removedFoodKeys → foods (por nombre normalizado) que el usuario borró; mergeBridge no los
  //    reimporta del bridge (anti-resurrección, espejo de removedBridgeIds para la sección foods).
  if (!Array.isArray(next.bridge.removedFoodKeys)) next.bridge.removedFoodKeys = [];
  //  · removedMealSigs → firmas {sig, ts} de extras de la APP borrados tras ser empujados. El
  //    .gs reasigna id en op:'add', así que el delete por id local nunca alcanza la copia del
  //    servidor y removedBridgeIds no la frena: sin esta lápida por contenido, el extra borrado
  //    resucitaba como skill-chat en el próximo merge. Ver mergeBridge.
  if (!Array.isArray(next.bridge.removedMealSigs)) next.bridge.removedMealSigs = [];
  next.snackBank = next.snackBank.map((s) => ({
    carbs: 0, fat: 0, fiber: 0, ...s,
  }));
  next.proteinBank = next.proteinBank.map((p) => ({
    carbs: 0, fat: 0, fiber: 0, ...p,
  }));
  next.dessertBank = Array.isArray(next.dessertBank) && next.dessertBank.length
    ? next.dessertBank.map((d) => ({ carbs: 0, fat: 0, fiber: 0, ...d }))
    : SEED_DESSERTS.map((d) => ({ ...d, id: uuid(), builtin: true }));
  next.rules = Array.isArray(next.rules) && next.rules.length
    ? next.rules
    : SEED_RULES.map((r) => ({ ...r }));
  const migratedDays = {};
  for (const [k, v] of Object.entries(next.days)) {
    if (!v) continue;
    const cleanExtras = Array.isArray(v.extras)
      ? dedupeDayExtras(v.extras).map((x) => ({ carbs: 0, fat: 0, fiber: 0, ...x }))
      : [];
    // Sesiones escritas directo en localStorage (p.ej. vía Chrome MCP) pueden no traer id; sin id
    // pushPayload las descarta y nunca sincronizan. Estampar uuid es idempotente (conserva el existente).
    const cleanExercise = Array.isArray(v.exercise)
      ? v.exercise.map((e) => (e && e.id == null ? { ...e, id: uuid() } : e))
      : v.exercise;
    const eaten = { ...(v.eaten || {}) };
    // Migración a 2 colaciones: el snack/colación único histórico pasa a ser la colación 1
    // (la mañana). Idem su "comido" y su "no comí". Idempotente: tras la 1ª pasada snackId1
    // ya existe y eaten.colacion queda borrado.
    let snackId1 = v.snackId1 ?? null;
    const snackId2 = v.snackId2 ?? null;
    if (snackId1 == null && v.snackId != null) snackId1 = v.snackId;
    if (eaten.colacion1 == null && eaten.colacion != null) eaten.colacion1 = eaten.colacion;
    delete eaten.colacion;
    const skipped = (Array.isArray(v.skipped) ? v.skipped : []).map((s) => (s === 'colacion' ? 'colacion1' : s));
    // Si ya hay comida registrada de una colación/cena, el slot está cumplido aunque se haya
    // importado antes de existir la detección automática (resuelve el paraguas 'colacion' → 1/2).
    for (const x of cleanExtras) {
      const s = extraPlanSlot(x);
      if (s === 'colacion1' || s === 'colacion2' || s === 'cena') eaten[s] = true;
    }
    // Agua: asegurar `log` (cola de toques empujables a bridge.water[]). Backfill del agua ya
    // registrada antes de esta feature: si water.ml > 0 y el log no la cubre, sintetizar una
    // entrada por el residual para que TAMBIÉN se propague a otros dispositivos (si no, queda
    // solo local). Idempotente: tras el backfill sum(log)===ml, así que no se re-sintetiza.
    const w0 = v.water && typeof v.water === 'object' ? v.water : { ml: 0 };
    const wLog = Array.isArray(w0.log) ? w0.log : [];
    const wMl = Number(w0.ml) || 0;
    const wLogSum = wLog.reduce((s, e) => s + (Number(e?.ml) || 0), 0);
    const cleanWater = (wMl > 0 && wLogSum !== wMl)
      ? { ...w0, log: [...wLog, { id: uuid(), ml: wMl - wLogSum, ts: Date.now() }] }
      : { ...w0, log: wLog };
    // Sueño corrupto ya guardado (p.ej. 15.2h del doble conteo del Shortcut): se borra para
    // que la tarjeta caiga al último valor válido y el promedio no lo arrastre. Idempotente:
    // un valor sano se conserva, uno ausente no se toca.
    let cleanHealth = v.health;
    if (cleanHealth && cleanHealth.sleepHours != null && sanitizeSleepHours(cleanHealth.sleepHours) == null) {
      cleanHealth = { ...cleanHealth };
      delete cleanHealth.sleepHours;
    }
    migratedDays[k] = {
      ...v,
      water: cleanWater,
      health: cleanHealth,
      extras: cleanExtras,
      exercise: cleanExercise,
      eaten,
      snackId1, snackId2,
      nudgesDismissed: Array.isArray(v.nudgesDismissed) ? v.nudgesDismissed : [],
      skipped,
      dessertAlmuerzoId: v.dessertAlmuerzoId ?? null,
      dessertCenaId: v.dessertCenaId ?? null,
      notes: v.notes && typeof v.notes === 'object' ? v.notes : null,
    };
  }
  next.days = migratedDays;
  next.favorites = Array.isArray(next.favorites) ? next.favorites : [];
  // Rutina (objeto singleton, null = sin rutina) + mapa de videos por slug (back-fill defensivo).
  if (next.routine !== null && (typeof next.routine !== 'object' || Array.isArray(next.routine))) next.routine = null;
  if (typeof next.exercise_videos !== 'object' || next.exercise_videos === null || Array.isArray(next.exercise_videos)) next.exercise_videos = {};
  next.aiCache = next.aiCache || { coach: {}, weekly: {}, patterns: null, lastSubstitution: null };
  next.aiCache.coach = next.aiCache.coach || {};
  next.aiCache.weekly = next.aiCache.weekly || {};
  return next;
}

export function tryLoadFrom(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { return null; }
  if (!raw) return null;
  try {
    const migrated = migrateState(JSON.parse(raw));
    return migrated || null;
  } catch (e) {
    console.warn(`localStorage "${key}" corrupto, lo salto`, e);
    return null;
  }
}

export function loadState() {
  const current = tryLoadFrom(STORAGE_KEY);
  if (current) return current;

  const backup = tryLoadFrom(BACKUP_STORAGE_KEY);
  if (backup) {
    console.warn('Recuperado desde backup local');
    return backup;
  }

  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    const legacy = tryLoadFrom(legacyKey);
    if (legacy) return legacy;
  }

  // ¿Había algo escrito (aunque ilegible)? Entonces es corrupción, no primer arranque.
  let hadData = false;
  try {
    hadData = !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(BACKUP_STORAGE_KEY)
      || LEGACY_STORAGE_KEYS.some((k) => localStorage.getItem(k)));
  } catch {}
  const seed = buildSeed();
  if (hadData) seed.__corruptionDetected = true;
  else seed.__freshStart = true; // sin datos locales: puede ser device nuevo O purga de Safari →
  // el mount de usePersistentState intentará rescatar del espejo IndexedDB.
  return seed;
}

export function saveState(state) {
  let json;
  try { json = JSON.stringify(state); }
  catch (e) { console.warn('No se pudo serializar el estado', e); return 'failed'; }

  // Respaldar la copia buena previa (best-effort; no aborta el guardado).
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) localStorage.setItem(BACKUP_STORAGE_KEY, prev);
  } catch {}

  // Espejo durable en IndexedDB (fire-and-forget): se escribe incluso si el localStorage falla
  // por cuota, porque IndexedDB tiene cuota mayor y es la red de rescate. EXCEPTO cuando el
  // estado es un seed de arranque (__freshStart): guardarlo clobberearía el espejo bueno justo
  // antes de que el rescate al montar lo lea (el save effect corre en el mismo mount).
  if (!state.__freshStart) idbPut(json);

  try {
    localStorage.setItem(STORAGE_KEY, json);
    // Verificación: releer y confirmar que quedó completo.
    if (localStorage.getItem(STORAGE_KEY) !== json) throw new Error('verificación de escritura falló');
    lastSavedJson = json; // para el guard multi-pestaña: ignorar nuestro propio eco
    return 'ok';
  } catch (e) {
    console.warn('No se pudo guardar localStorage', e);
    // Restaurar la copia buena para no dejar el estado a medio escribir.
    try {
      const bak = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (bak) localStorage.setItem(STORAGE_KEY, bak);
    } catch {}
    return 'failed';
  }
}

// Memoiza la conexión IndexedDB (una sola apertura por sesión).
let _idbPromise = null;
export function idbOpen() {
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return _idbPromise;
}

export function idbPut(value) {
  return idbOpen().then((db) => {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, IDB_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  });
}

export function idbGet() {
  return idbOpen().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  });
}

export function recoverFromMirror(localState, mirrorJson) {
  // Rescatar del espejo IndexedDB en DOS casos: arranque vacío (__freshStart, device nuevo o purga
  // de Safari) Y corrupción del localStorage (__corruptionDetected: había datos pero ilegibles). Sin
  // el segundo caso, una corrupción del store primario borraba todo aunque el espejo durable estuviera
  // intacto. Con datos locales buenos (ninguna marca) NO se toca nada.
  if (!localState || !(localState.__freshStart || localState.__corruptionDetected)) return null;
  if (!mirrorJson) return null;
  let parsed;
  try { parsed = migrateState(JSON.parse(mirrorJson)); } catch { return null; }
  if (!parsed) return null;
  const hasData = !!(parsed.userProfile || (parsed.days && Object.keys(parsed.days).length > 0)
    || (Array.isArray(parsed.weights) && parsed.weights.length > 0));
  return hasData ? parsed : null;
}

