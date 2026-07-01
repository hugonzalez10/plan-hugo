import {
  todayKey, shiftDate, formatDateLabel, getWeekKeys, getRuleWeekKeys,
  daysBetween, fmtSleepHours, getISOWeekKey, fmtDelta, shortDate,
} from './src/dates.mjs';
import {
  WEEKLY_LOSS, smaAt, computeSMA, weightSeries, trendWeightAt,
  linRegSlopePerDay, weekAvgWeight, computeWeeklyLossRate,
} from './src/energy.mjs';
import {
  DEFAULT_TARGETS, PROTEIN_FLOOR_LOSE, ACTIVITY_FACTORS, KCAL_PER_KG_FAT,
  calcMifflinStJeor, calcTargets,
  colorForKcal, colorForProtein, colorForMacro, colorForFiber,
} from './src/nutrition.mjs';
import {
  parseJsonLoose, parseRoutineTemplate, normalizeRoutine,
  slugifyExercise, extractYoutubeId,
  parseHeartWatchDaily, parseHeartWatchWorkouts,
} from './src/parsing.mjs';
import { evalMetric } from './src/metrics.mjs';
import {
  FIXED_MEALS, mealItemsFor, getMealItemTicks, sumField,
  PLAN_SLOTS, SLOT_NAME_RE, resolveColacion, slotByTime, extraPlanSlot, extraSlotBucket,
  isItemDulce, countCategoryInWeek, computeDayTotals, currentDayKcalIn,
  chatMealSig, sameWindow, dedupeDayExtras,
} from './src/meals.mjs';
import { evaluateRule, getRulesStatus, evaluateAllRules } from './src/rules.mjs';
import {
  computeAdaptiveTDEE, buildEnergySeries, computePlanAdjustment, dayMetsTarget,
  computeTrendAnalysis, computeEvolution, interpretTrend, TREND_MIN_DAYS, TREND_WINDOW_DAYS,
  computeExerciseStats, computeRoutineExerciseProgress, computeStreak, computeComparison, computeRecents,
  computeProactiveInsights, computeCompositionFocus,
} from './src/analytics.mjs';
import { uuid, normalizeName, getDeviceId } from './src/util.mjs';
import {
  scaleFoodToPortion, foodToMealItem, mealItemToFood,
  upsertFood, searchFoods, makeFood, stripPortionSuffix,
} from './src/foods.mjs';
import {
  WEIGHT_FIELDS, SEGMENT_FIELDS, SEGMENT_OPTIONS, STRING_FIELDS,
  WEIGHT_CAT_LABELS, CHART_METRICS, WORKOUT_EXTRA_FIELDS, HEALTH_FIELDS,
  sanitizeSleepHours,
} from './src/fields.mjs';
import {
  gistCreate, gistPush, gistPull, sanitizeStateForUpload, syncSig, applyRemoteState, hashSig,
  mergeRemoteState, isPlausibleState,
  withBridgeToken, fetchBridge, postBridgeDelete, mergeBridge, bridgeVersionDrift,
} from './src/sync.mjs';
import {
  ARSENAL_V2_SNACKS, ARSENAL_V2_PROTEINS, ARSENAL_V2_DESSERTS,
  SEED_SNACKS, SNACK_TAGS, SEED_PROTEINS, SEED_DESSERTS, SEED_RECIPES, SEED_RULES,
  buildSeed,
} from './src/seed.mjs';
import {
  STORAGE_KEY, BACKUP_STORAGE_KEY, LEGACY_STORAGE_KEYS,
  migrateState, tryLoadFrom, loadState, saveState, idbGet, idbPut, recoverFromMirror,
} from './src/storage.mjs';
import {
  MODEL_DEFAULT, MODEL_CHEAP, askClaude,
  extractMetricsFromImage, extractWorkoutFromImage, estimateExerciseKcal, estimateExtraMacros,
  suggestForSlot, suggestRecipeFromIngredients, extractMealFromInputs, parseRoutineDocx,
} from './src/ai.mjs';

const { useState, useEffect, useMemo, useCallback } = React;


const FOOD_EMOJIS = [
  ['huevo', '🥚'], ['yogurt', '🥛'], ['yogur', '🥛'], ['leche', '🥛'],
  ['café', '☕'], ['cafe', '☕'], ['té', '🍵'],
  ['atún', '🐟'], ['atun', '🐟'], ['salmón', '🐟'], ['salmon', '🐟'], ['pescado', '🐟'],
  ['pollo', '🍗'], ['pavo', '🦃'],
  ['vacuno', '🥩'], ['filete', '🥩'], ['carne', '🥩'], ['lomo', '🥩'],
  ['quesillo', '🧀'], ['queso', '🧀'],
  ['not squares', '🍫'], ['barra', '🍫'], ['chocolate', '🍫'],
  ['arroz', '🍚'], ['pasta', '🍝'], ['fideo', '🍝'],
  ['galleta', '🍪'], ['pan', '🍞'], ['tostada', '🍞'],
  ['palta', '🥑'], ['ensalada', '🥗'], ['tomate', '🍅'],
  ['manzana', '🍎'], ['plátano', '🍌'], ['platano', '🍌'], ['naranja', '🍊'], ['fruta', '🍎'],
  ['shake', '🥤'], ['batido', '🥤'], ['whey', '🥤'], ['proteína', '🥤'], ['proteina', '🥤'],
  ['libre', '🎉'], ['cerveza', '🍺'], ['vino', '🍷'],
  ['papas', '🥔'], ['papa', '🥔'],
];

const EXERCISE_EMOJIS = [
  ['gym', '🏋️'], ['pesas', '🏋️'], ['fuerza', '🏋️'], ['musculación', '🏋️'], ['crossfit', '🏋️'],
  ['trote', '🏃'], ['correr', '🏃'], ['running', '🏃'], ['cinta', '🏃'],
  ['camina', '🚶'], ['caminata', '🚶'],
  ['bici', '🚴'], ['ciclismo', '🚴'], ['spinning', '🚴'],
  ['nada', '🏊'], ['piscina', '🏊'], ['natación', '🏊'],
  ['yoga', '🧘'], ['meditación', '🧘'], ['pilates', '🤸'],
  ['fútbol', '⚽'], ['futbol', '⚽'], ['tenis', '🎾'], ['pádel', '🎾'], ['paddle', '🎾'],
  ['escalada', '🧗'], ['boxeo', '🥊'],
];

// Grupos musculares para el dropdown de corrección en el historial de ejercicios.
const MUSCLE_GROUPS = ['pecho', 'espalda', 'piernas', 'hombros', 'brazos', 'core', 'glúteos', 'cardio', 'movilidad'];

function emojiFor(name, map, fallback) {
  const n = (name || '').toLowerCase();
  for (const [kw, emoji] of map) if (n.includes(kw)) return emoji;
  return fallback;
}
function emojiForFood(name) { return emojiFor(name, FOOD_EMOJIS, '🍽️'); }
function emojiForExercise(name) { return emojiFor(name, EXERCISE_EMOJIS, '💪'); }



// ---------- Sync via GitHub Gist privado ----------


// Auto-sync con el Gist, a prueba de fallos:
//  - SUBE solo (debounced) cuando hay cambios locales y la nube NO avanzó (si avanzó, no pisa).
//  - BAJA solo al abrir/volver SOLO si el equipo está limpio (sin cambios sin subir) y la nube es más nueva.
//  - Ante cualquier conflicto o error: no toca nada (quedan los botones manuales).
function useGistAutoSync(state, setState) {
  const s = state.settings || {};
  const pat = s.githubPAT, gistId = s.syncGistId;
  const enabled = (s.autoSync ?? true) && !!pat && !!gistId;
  const dataSig = syncSig(state);
  const lastPushedSig = s.lastPushedSig ?? null;
  const lastRemoteUpdatedAt = s.lastRemoteUpdatedAt ?? null;
  const busyRef = React.useRef(false);
  // Estado interno crudo: lo fijan los efectos. 'conflict'/'error' son "pegajosos"
  // hasta el próximo intento exitoso.
  const [raw, setRaw] = useState('idle');
  // Reintento automático: mientras quede en 'error' y haya cambios sin subir, reintenta cada
  // 30s en vez de quedarse rojo para siempre hasta que el usuario edite algo.
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (!enabled || raw !== 'error') return;
    const id = setInterval(() => setRetryTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [enabled, raw]);

  // SUBIR (debounced) cuando el equipo está "sucio"
  useEffect(() => {
    if (!enabled) return;
    // Sin base aún (recién conectado, sin subir/bajar manual) → NO auto-subir: evita pisar la nube buena con datos vacíos.
    if (lastPushedSig == null || dataSig === lastPushedSig) return;
    const t = setTimeout(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setRaw('syncing');
      try {
        const meta = await gistPull(pat, gistId);
        const cloudAdvanced = lastRemoteUpdatedAt && new Date(meta.updatedAt) > new Date(lastRemoteUpdatedAt);
        if (cloudAdvanced) {
          // La nube avanzó en otro equipo Y hay cambios locales sin subir = conflicto real. En vez de
          // pisar (o quedarse pegajoso en 'conflict' pidiendo pull manual destructivo) mergeamos
          // remoto⊕local por id/fecha y re-empujamos el resultado: ningún registro de ningún lado se
          // pierde. Solo si el merge no es plausible o el push falla queda 'conflict' como fallback.
          if (!isPlausibleState(meta.state)) { setRaw('conflict'); return; }
          const merged = mergeRemoteState(state, meta.state, meta.updatedAt);
          const { updatedAt: mergedAt } = await gistPush(pat, gistId, merged);
          setState((prev) => {
            const m = mergeRemoteState(prev, meta.state, meta.updatedAt);
            return { ...m, settings: { ...m.settings, lastPushedSig: syncSig(m), lastRemoteUpdatedAt: mergedAt, lastSyncAt: new Date().toISOString() } };
          });
          setRaw('ok');
          return;
        }
        const { updatedAt } = await gistPush(pat, gistId, state);
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt, lastSyncAt: new Date().toISOString() },
        }));
        setRaw('ok');
      } catch (e) { console.warn('Auto-sync (subir) falló', e); setRaw('error'); }
      finally { busyRef.current = false; }
    }, 2500);
    return () => clearTimeout(t);
  }, [enabled, dataSig, lastPushedSig, lastRemoteUpdatedAt, pat, gistId, retryTick]);

  // BAJAR al abrir / volver a primer plano (solo si limpio + nube más nueva)
  useEffect(() => {
    if (!enabled) return;
    const run = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const { state: remote, updatedAt } = await gistPull(pat, gistId);
        if (!remote || typeof remote !== 'object') return;
        setState((prev) => {
          const clean = prev.settings?.lastPushedSig != null && syncSig(prev) === prev.settings.lastPushedSig;
          const cloudNewer = !prev.settings?.lastRemoteUpdatedAt || new Date(updatedAt) > new Date(prev.settings.lastRemoteUpdatedAt);
          if (!(clean && cloudNewer)) return prev; // sucio o sin novedad → no tocar
          return applyRemoteState(prev, remote, updatedAt);
        });
        setRaw('ok');
      } catch (e) { console.warn('Auto-sync (bajar) falló', e); setRaw('error'); }
      finally { busyRef.current = false; }
    };
    run();
    const onVis = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, pat, gistId]);

  // Estado visible derivado para el indicador de la barra superior.
  const dirty = lastPushedSig != null && dataSig !== lastPushedSig;
  let status = 'off';
  if (enabled) {
    if (raw === 'syncing') status = 'syncing';
    else if (raw === 'conflict') status = 'conflict';
    else if (raw === 'error') status = 'error';
    else if (dirty) status = 'pending';
    else status = lastPushedSig != null ? 'ok' : 'idle';
  }
  return { status, lastSyncAt: s.lastSyncAt ?? null };
}

let _zxingPromise = null;
function loadZXing() {
  if (_zxingPromise) return _zxingPromise;
  if (typeof window !== 'undefined' && window.ZXing) {
    _zxingPromise = Promise.resolve(window.ZXing);
    return _zxingPromise;
  }
  _zxingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
    script.onload = () => {
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error('ZXing no cargó'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar la librería de escaneo'));
    document.head.appendChild(script);
  });
  return _zxingPromise;
}

// Carga perezosa de un <script> de CDN, una sola vez por URL (resuelve cuando cargó). jsPDF y
// mammoth pesan ~250 KB juntos pero solo se usan al exportar un PDF o renovar la rutina .docx,
// así que NO se cargan en index.html: se inyectan recién al usarlos. El SW cachea unpkg.com
// (cache-first), por lo que tras el primer uso quedan disponibles offline.
const JSPDF_SRC = 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js';
const MAMMOTH_SRC = 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js';
const _scriptPromises = {};
function loadScript(src) {
  if (_scriptPromises[src]) return _scriptPromises[src];
  _scriptPromises[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
  return _scriptPromises[src];
}

// Mapea un producto de OpenFoodFacts (de la API de código o de la de búsqueda) al shape común
// { name, portion, kcal..., barcode, raw{*Per100, servingG} }. Devuelve null si no hay kcal.
// raw carga los macros por 100g → alimenta foodFromOFF para guardar el producto como Food reusable.
function mapOFFProduct(p, fallbackCode) {
  const n = p.nutriments || {};
  const kcalPer100 = Number(n['energy-kcal_100g']) || (Number(n['energy_100g']) ? Math.round(Number(n['energy_100g']) / 4.184) : null);
  if (kcalPer100 == null) return null;

  const protPer100 = Number(n.proteins_100g) || 0;
  const carbsPer100 = Number(n.carbohydrates_100g) || 0;
  const fatPer100 = Number(n.fat_100g) || 0;
  const fiberPer100 = Number(n.fiber_100g) || 0;

  // Porción: usar serving_quantity si existe, si no serving_size string, si no 100g
  let servingG = Number(p.serving_quantity) || null;
  if (!servingG && p.serving_size) {
    const m = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*g/i);
    if (m) servingG = Number(m[1]);
  }
  if (!servingG) servingG = 100;
  const factor = servingG / 100;

  const brandName = p.brands ? p.brands.split(',')[0].trim() : '';
  const code = p.code || fallbackCode || null;
  const namePart = p.product_name || (code ? `Producto ${code}` : 'Producto');
  const portionLabel = servingG === 100 ? '100g' : `${servingG}g`;

  return {
    name: `${brandName ? brandName + ' ' : ''}${namePart}`.trim(),
    brand: brandName || undefined,
    portion: portionLabel,
    kcal: Math.round(kcalPer100 * factor),
    protein: Math.round(protPer100 * factor),
    carbs: Math.round(carbsPer100 * factor),
    fat: Math.round(fatPer100 * factor),
    fiber: Number((fiberPer100 * factor).toFixed(1)),
    barcode: code || undefined,
    imageUrl: p.image_front_small_url || null,
    raw: { kcalPer100, protPer100, carbsPer100, fatPer100, fiberPer100, servingG },
  };
}

async function searchOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity,quantity,code,image_front_small_url`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo consultar OpenFoodFacts');
  const data = await resp.json();
  if (data.status !== 1 || !data.product) return null;
  return mapOFFProduct(data.product, barcode);
}

// Búsqueda OpenFoodFacts POR NOMBRE (Fase A): el endpoint de barcode no permitía buscar texto.
// Devuelve hasta `limit` candidatos en el mismo shape que searchOpenFoodFacts (descarta los sin
// kcal). OFF es fuerte en productos de marca, flojo en integrales chilenos → es el último fallback
// del buscador del modal, detrás de "Mis alimentos".
async function searchOpenFoodFactsByName(query, limit = 12) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,brands,nutriments,serving_size,serving_quantity,code,image_front_small_url`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo consultar OpenFoodFacts');
  const data = await resp.json();
  const products = Array.isArray(data.products) ? data.products : [];
  const out = [];
  for (const p of products) {
    const r = mapOFFProduct(p);
    if (r && r.name) out.push(r);
  }
  return out;
}


async function fileToAttachment(file) {
  if (file.type.startsWith('image/')) {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, 1280, 0.85);
    return { kind: 'image', dataUrl: compressed, name: file.name };
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const dataUrl = await fileToDataUrl(file);
    const b64 = dataUrl.split(',')[1];
    return { kind: 'pdf', b64, name: file.name };
  }
  // .docx (rutina) — extraer texto plano con mammoth.js (lazy: se inyecta recién aquí, cacheado por el SW)
  if (file.name.toLowerCase().endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try { await loadScript(MAMMOTH_SRC); } catch {}
    if (!window.mammoth) throw new Error('mammoth.js no cargó (revisa la conexión y reintenta)');
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await window.mammoth.extractRawText({ arrayBuffer });
    return { kind: 'text', text: value || '', name: file.name };
  }
  // CSV, JSON, TXT, XML — leer como texto
  const text = await file.text();
  return { kind: 'text', text, name: file.name };
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageDataUrl(dataUrl, maxDim = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const SCHEDULE_BY_DOW = { 0: null, 1: '16:45', 2: '17:30', 3: '17:00', 4: '17:30', 5: '16:30', 6: '16:00' };
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Distribución proteica intradía (Schoenfeld & Aragon 2018): ≥4 tomas, ≥36 g por toma
// (0.4 g/kg/comida), sin brechas >5 h entre tomas proteicas.
const PROTEIN_DIST = { minTomas: 4, minPerToma: 36, maxGapHours: 5 };

const ACTIVITY_LABELS = {
  sedentary: { label: 'Sedentario', hint: 'Trabajo de escritorio, sin ejercicio' },
  light: { label: 'Liviano', hint: 'Ejercicio ligero 1-3 días/sem' },
  moderate: { label: 'Moderado', hint: 'Ejercicio 3-5 días/sem' },
  active: { label: 'Activo', hint: 'Ejercicio 6-7 días/sem' },
  very_active: { label: 'Muy activo', hint: 'Ejercicio intenso o 2x/día' },
};


// Ritmo de pérdida objetivo (% peso/sem) para el semáforo del Análisis de tendencia (Garthe 2011).
const LOSS_RATE_GREEN = { min: 0.55, max: 0.75 };
const MAX_IMAGES = 10;


// Tipos de regla soportados. config es específica por tipo.
const RULE_TYPES = {
  kcal_cap_extras: {
    label: 'Bloquear extras pasando kcal',
    defaultName: 'Sin extras pasando X kcal/día',
    paramLabel: 'kcal límite',
    paramKey: 'kcalCap',
    paramDefault: 2000,
    paramStep: 50,
    icon: '🚫',
  },
  count_per_week: {
    label: 'Máximo X por semana',
    defaultName: 'Máximo X por semana',
    paramLabel: 'máximo por semana',
    paramKey: 'max',
    paramDefault: 1,
    paramStep: 1,
    icon: '🔢',
  },
};

// Categorías que cuentan: 'dulce' (snacks dulces + postres + extras tag) | 'delivery' (extras tag) | 'alcohol' (extras tag)
const RULE_CATEGORIES = ['dulce', 'delivery', 'alcohol'];



// Id de dispositivo persistente (clave propia en localStorage, independiente del estado). Viaja en
// cada entrada de agua de la app (source:'app') para que el dispositivo origen reconozca su propio
// eco al leer bridge.water[] —sin depender del timing del log local— y no lo doble-cuente. Otros
// dispositivos tienen otro deviceId → sí lo importan. En node/tests (sin localStorage) → 'dev-unknown'.

// Orquesta fetch + merge + persistencia. Devuelve resumen para la UI.
async function runBridgeSync(state, setState) {
  const url = state.settings?.bridgeUrl;
  if (!url) return { ok: false, reason: 'no-url' };
  const token = state.settings?.bridgeToken;
  let bridge;
  try { bridge = await fetchBridge(url, token); }
  catch (e) {
    console.warn('Bridge sync falló', e);
    // Registrar el fallo en el estado para que el indicador del header lo muestre (antes se
    // tragaba en silencio y un sync roto era indistinguible de uno OK).
    setState((prev) => ({
      ...prev,
      bridge: {
        ...(prev.bridge || {}),
        lastSyncAttemptAt: new Date().toISOString(),
        lastSyncOk: false, lastSyncError: e.message || 'fetch',
      },
    }));
    return { ok: false, reason: 'fetch', error: e.message };
  }
  let added = { meals: 0, weights: 0, workouts: 0 };
  setState((prev) => {
    const res = mergeBridge(prev, bridge);
    added = res.added;
    return res.state;
  });
  return { ok: true, added };
}


// ---------- Lista de compras ----------

// Categoría heurística por palabras clave en el nombre. Devuelve la primera que matchee.
const SHOPPING_CATEGORIES = [
  { key: 'lacteo',   label: '🥛 Lácteos',          keywords: ['yogurt','yogur','quesillo','queso','leche','colun','protein plus','natural'] },
  { key: 'proteina', label: '🥩 Proteínas',         keywords: ['huevo','huevos','pollo','pavo','salmón','salmon','atún','atun','vacuno','carne','filete','pescado','jamón','jamon'] },
  { key: 'fruta',    label: '🍎 Frutas',            keywords: ['fruta','manzana','plátano','platano','pera','naranja','kiwi','frutilla','arándano','arandano','palta','aguacate'] },
  { key: 'verdura',  label: '🥦 Verduras',          keywords: ['ensalada','verdura','lechuga','tomate','pepino','zanahoria','espinaca','rúcula','rucula','brócoli','brocoli','coliflor','pimentón','pimenton'] },
  { key: 'carbo',    label: '🌾 Carbohidratos',     keywords: ['arroz','pan','pasta','papa','quinoa','quínoa','avena','tostada','galleta de arroz','galletas de arroz'] },
  { key: 'snack',    label: '🍫 Snacks y dulces',   keywords: ['chocolate','helado','not squares','protein bar','barra','galleta','dulce','postre'] },
  { key: 'bebida',   label: '🥤 Bebidas',           keywords: ['café','cafe','té','te','agua','infusión','infusion','jugo','leche vegetal'] },
  { key: 'otro',     label: '🛒 Otros',             keywords: [] },
];

function categorizeShoppingItem(name) {
  const norm = (name || '').toLowerCase();
  for (const cat of SHOPPING_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (norm.includes(kw)) return cat.key;
    }
  }
  return 'otro';
}

// Genera lista de compras: items usados en últimos N días, agrupados por categoría
function generateShoppingList(state, options = {}) {
  const { windowDays = 7, refDate = todayKey() } = options;
  const days = state?.days || {};
  const snackBank = state?.snackBank || [];
  const proteinBank = state?.proteinBank || [];
  const dessertBank = state?.dessertBank || [];

  // Calcula fecha de inicio
  const start = (() => {
    const d = new Date(refDate + 'T12:00:00');
    d.setDate(d.getDate() - windowDays + 1);
    return todayKey(d);
  })();

  // Recolectar items con frecuencia
  const usage = new Map(); // normalizedName → { name, count, kcal, protein, source }

  const addUsage = (item, source) => {
    if (!item || !item.name) return;
    const norm = normalizeName(item.name);
    const existing = usage.get(norm);
    if (existing) {
      existing.count += 1;
    } else {
      usage.set(norm, {
        name: item.name,
        count: 1,
        kcal: item.kcal || 0,
        protein: item.protein || 0,
        source,
      });
    }
  };

  for (const [k, day] of Object.entries(days)) {
    if (!day || k < start || k > refDate) continue;
    const e = day.eaten || {};
    // Snacks (ambas colaciones)
    for (const [idKey, eatKey] of [['snackId1', 'colacion1'], ['snackId2', 'colacion2']]) {
      if (day[idKey] && e[eatKey]) {
        const it = snackBank.find((s) => s.id === day[idKey]);
        if (it) addUsage(it, 'colacion');
      }
    }
    // Proteínas cena
    if (day.proteinId && e.cena) {
      const it = proteinBank.find((p) => p.id === day.proteinId);
      if (it) addUsage(it, 'cena');
    }
    // Postres
    if (day.dessertAlmuerzoId && e.dessertAlmuerzo) {
      const it = dessertBank.find((d) => d.id === day.dessertAlmuerzoId);
      if (it) addUsage(it, 'postre');
    }
    if (day.dessertCenaId && e.dessertCena) {
      const it = dessertBank.find((d) => d.id === day.dessertCenaId);
      if (it) addUsage(it, 'postre');
    }
    // Extras (todos, no requieren eaten flag — ya están en el día)
    for (const x of (day.extras || [])) {
      addUsage(x, 'extra');
    }
  }

  // Ingredientes de las recetas guardadas. Prioriza las favoritas (⭐); si no hay ninguna
  // marcada, toma todas. Cada ingrediente se funde por nombre con lo del historial (mismo
  // Map), así "Pollo" de una receta y "pollo" comido no se duplican.
  if (options.includeRecipes) {
    const recipes = state?.recipeBank || [];
    const favs = recipes.filter((r) => r.favorite);
    const src = favs.length ? favs : recipes;
    for (const r of src) {
      for (const ing of (r.ingredients || [])) {
        if (ing && ing.name) addUsage({ name: ing.name, kcal: 0, protein: 0 }, 'receta');
      }
    }
  }

  // Agrupar por categoría
  const byCat = {};
  for (const cat of SHOPPING_CATEGORIES) byCat[cat.key] = [];
  for (const u of usage.values()) {
    const cat = categorizeShoppingItem(u.name);
    byCat[cat].push(u);
  }
  // Ordenar cada categoría por frecuencia desc
  for (const cat of Object.keys(byCat)) {
    byCat[cat].sort((a, b) => b.count - a.count);
  }

  // Construir array final solo con categorías que tienen items
  const result = SHOPPING_CATEGORIES
    .filter((cat) => byCat[cat.key].length > 0)
    .map((cat) => ({ key: cat.key, label: cat.label, items: byCat[cat.key] }));

  return { groups: result, windowDays, start, end: refDate, totalItems: usage.size };
}

// Formatea la lista como texto plano para compartir
function formatShoppingListText(list, refDate = todayKey()) {
  const lines = [];
  lines.push(`🛒 Lista de compras · semana ${refDate}`);
  lines.push(`(basada en lo que comiste los últimos ${list.windowDays} días)`);
  lines.push('');
  for (const g of list.groups) {
    lines.push(g.label);
    for (const it of g.items) {
      const qty = it.count > 1 ? ` ×${it.count}` : '';
      lines.push(`  ☐ ${it.name}${qty}`);
    }
    lines.push('');
  }
  if (list.totalItems === 0) {
    lines.push('Sin items registrados en el período. Marca tus comidas durante la semana y vuelve a generar.');
  }
  return lines.join('\n');
}


const COLOR_CLASSES = {
  green: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30', dot: 'bg-emerald-500' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/30', dot: 'bg-amber-500' },
  red: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100 dark:bg-rose-900/30', dot: 'bg-rose-500' },
};

function showLocalNotification(title, body, tag) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // Si hay Service Worker activo, usarlo (mejor en mobile)
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'show-notification', title, body, tag,
      });
    } else {
      new Notification(title, { body, tag });
    }
  } catch (e) {
    console.warn('Notification error:', e?.message);
  }
}

function useNotificationScheduler(notifSettings) {
  useEffect(() => {
    if (!notifSettings?.enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const STORAGE_FIRED = 'plan-hugo-notif-fired';
    const loadFired = () => {
      try { return JSON.parse(localStorage.getItem(STORAGE_FIRED) || '{}'); } catch { return {}; }
    };
    const saveFired = (obj) => {
      try { localStorage.setItem(STORAGE_FIRED, JSON.stringify(obj)); } catch {}
    };

    const slots = [
      { key: 'colacion1', label: 'Colación 1', body: 'Colación de la mañana: lleva algo transportable.', time: notifSettings.colacion1 },
      { key: 'almuerzo',  label: 'Almuerzo',   body: '¿Ya almorzaste? Recuerda marcar tu comida.', time: notifSettings.almuerzo },
      { key: 'colacion2', label: 'Colación 2', body: 'Colación de la tarde: algo transportable y sin refrigerar.', time: notifSettings.colacion2 },
      { key: 'agua',      label: 'Agua',       body: 'Recordatorio de hidratación: revisa tu meta de agua.', time: notifSettings.agua },
      { key: 'cena',      label: 'Cena',       body: 'Recordatorio de cena: marca tu cena al terminar.', time: notifSettings.cena },
    ];

    const tick = () => {
      const now = new Date();
      const today = todayKey(now);
      const fired = loadFired();
      const todayFired = fired[today] || {};
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      let changed = false;
      for (const s of slots) {
        if (!s.time) continue;
        if (hhmm >= s.time && !todayFired[s.key]) {
          showLocalNotification('Plan Hugo · ' + s.label, s.body, 'plan-hugo-' + s.key);
          todayFired[s.key] = true;
          changed = true;
        }
      }
      if (changed) {
        // Limpiar entradas de >2 días para no acumular
        const cutoff = shiftDate(today, -2);
        const cleaned = Object.fromEntries(Object.entries({ ...fired, [today]: todayFired }).filter(([k]) => k >= cutoff));
        saveFired(cleaned);
      }
    };

    tick();
    const id = setInterval(tick, 60000); // 1 min
    return () => clearInterval(id);
  }, [notifSettings?.enabled, notifSettings?.almuerzo, notifSettings?.agua, notifSettings?.cena]);
}

function usePersistentState() {
  const [state, setState] = useState(() => loadState());
  // null = guardado OK; string = mensaje de error visible para el usuario.
  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    const result = saveState(state);
    setSaveError(result === 'ok' ? null : 'No se pudo guardar en este dispositivo — probablemente falta espacio. Libera datos del sitio o exporta un respaldo antes de seguir.');
  }, [state]);

  // Guard multi-pestaña: si OTRA pestaña del mismo origen reescribe el estado en localStorage
  // (el evento 'storage' solo dispara en las OTRAS pestañas, no en la que escribió), esta
  // pestaña ADOPTA ese estado en vez de pisarlo más tarde con su copia en memoria, que puede
  // ser más vieja. Antes, dos pestañas abiertas se pisaban mutuamente y se perdían cambios
  // (p.ej. el desglose de un entrenamiento recién cargado). Una pestaña inactiva no tiene
  // ediciones sin guardar (el save corre en cada cambio), así que adoptar siempre es seguro.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      if (e.newValue === lastSavedJson) return; // es nuestro propio eco
      let remote;
      try { remote = JSON.parse(e.newValue); } catch { return; }
      if (!remote || typeof remote !== 'object' || !remote.days) return;
      lastSavedJson = e.newValue; // evita que el save effect lo reescriba y dispare un ida-y-vuelta
      setState(remote);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Rescate desde el espejo IndexedDB: si arrancamos sin datos locales (Safari pudo purgar el
  // localStorage) pero IndexedDB conserva el estado, rehidratamos. Solo al montar; no pisa si el
  // usuario ya empezó a escribir (recoverFromMirror exige __freshStart).
  useEffect(() => {
    let cancelled = false;
    idbGet().then((mirrorJson) => {
      if (cancelled) return;
      setState((prev) => {
        const recovered = recoverFromMirror(prev, mirrorJson);
        if (recovered) return recovered; // rescatado: trae datos reales, sin __freshStart
        if (prev.__freshStart) { const n = { ...prev }; delete n.__freshStart; return n; } // limpia el marcador
        return prev;
      });
    });
    return () => { cancelled = true; };
  }, []);

  return [state, setState, saveError];
}

function ProgressBar({ value, max, color, label, unit, target }) {
  const cls = COLOR_CLASSES[color];
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-sm font-semibold ${cls.text}`}>
          {Math.round(value)}{unit} <span className="text-gray-400 dark:text-gray-500 font-normal">/ {target}{unit}</span>
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${cls.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MacroChip({ label, value, target, color, unit }) {
  const cls = COLOR_CLASSES[color];
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0;
  return (
    <div className="rounded-xl px-2 py-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`text-[10px] font-semibold ${cls.text}`}>{pct}%</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-sm font-bold ${cls.text}`}>{Math.round(value)}</span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">/ {Math.round(target)}{unit}</span>
      </div>
      <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${cls.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WaterRing({ ml, targetMl }) {
  const pctRaw = targetMl > 0 ? (ml / targetMl) * 100 : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const pctLabel = Math.round(pctRaw);
  const R = 18, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <div className="rounded-xl px-2 py-1.5 bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/40 flex items-center gap-2">
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
        <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" className="text-sky-200 dark:text-sky-900" strokeWidth="3" />
        <circle cx="22" cy="22" r={R} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`} transform="rotate(-90 22 22)" />
        <text x="22" y="26" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300" fontSize="11" fontWeight="700">{pctLabel}%</text>
      </svg>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-300">💧 Agua</div>
        <div className="text-sm font-bold text-sky-900 dark:text-sky-100">{ml}<span className="text-[10px] font-normal"> / {targetMl} ml</span></div>
      </div>
    </div>
  );
}

function BentoTodayHero({ totals, targets, streak, onStreakClick, weightSeries, state }) {
  const T = targets || DEFAULT_TARGETS;
  const kcalEaten = Math.round(totals.kcal);
  const kcalTarget = T.kcalMax;
  const kcalBurned = Math.round(totals.kcalBurned);
  const kcalRemaining = Math.round(totals.kcalRemaining);
  const kcalPct = Math.min(100, kcalTarget > 0 ? (kcalEaten / kcalTarget) * 100 : 0);
  const C = 2 * Math.PI * 70;
  const todayK = todayKey();

  // Ventana del sparkline de Peso en la portada: selector mini desplegable, persistido aparte
  // (pref de UI local, no entra al sync). El delta sigue la misma ventana.
  const WEIGHT_WINDOWS = [{ d: 7, label: '7d' }, { d: 28, label: '28d' }, { d: 90, label: '90d' }, { d: Infinity, label: 'Todo' }];
  const [weightWin, setWeightWin] = useState(() => {
    try { const v = localStorage.getItem('ph-home-weight-window'); if (v === 'all') return Infinity; const n = Number(v); return [7, 28, 90].includes(n) ? n : 90; } catch { return 90; }
  });
  const setWeightWindow = (d) => { setWeightWin(d); try { localStorage.setItem('ph-home-weight-window', d === Infinity ? 'all' : String(d)); } catch {} };
  const weightWinLabel = (WEIGHT_WINDOWS.find((w) => w.d === weightWin) || WEIGHT_WINDOWS[2]).label;

  const macros = [
    { label: 'Proteína', v: Math.round(totals.protein), t: T.proteinMin,   color: 'var(--bento-warm)'   },
    { label: 'Carbos',   v: Math.round(totals.carbs),   t: T.carbsTarget,  color: 'var(--bento-yellow)' },
    { label: 'Grasa',    v: Math.round(totals.fat),     t: T.fatTarget,    color: 'var(--bento-warm)'   },
    { label: 'Fibra',    v: Math.round(totals.fiber),   t: T.fiberTarget,  color: 'var(--bento-lilac)'  },
  ];

  const wCutoff = weightWin === Infinity ? '' : shiftDate(todayK, -weightWin);
  const ws = (weightSeries || []).slice().filter((w) => w.weightKg != null && (!wCutoff || (w.date || '') >= wCutoff))
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  const lastWeight = ws.length ? ws[ws.length - 1] : null;
  const firstWeight = ws.length > 1 ? ws[0] : null;
  const deltaKg = lastWeight && firstWeight ? Math.round((lastWeight.weightKg - firstWeight.weightKg) * 10) / 10 : null;

  let path = '', pts = [];
  if (ws.length >= 2) {
    const wsVals = ws.map((w) => w.weightKg);
    const wMin = Math.min(...wsVals) - 0.2, wMax = Math.max(...wsVals) + 0.2;
    pts = ws.map((w, i) => [(i / (ws.length - 1)) * 100, 30 - ((w.weightKg - wMin) / (wMax - wMin || 1)) * 30]);
    path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  }

  const days = state?.days || {};
  const chips = [];
  for (let i = 6; i >= 0; i--) {
    const k = shiftDate(todayK, -i);
    const day = days[k];
    const tot = computeDayTotals(day, state?.snackBank, state?.proteinBank, targets, state?.dessertBank, state?.antojoCustomItems || []);
    let met = null;
    if (tot.eatenAny) {
      const kcalC = colorForKcal(tot.kcal, T);
      const protC = colorForProtein(tot.protein, T);
      met = (kcalC === 'red' || protC === 'red') ? false : (kcalC === 'green' && protC === 'green') ? true : null;
    }
    const dow = new Date(k + 'T12:00:00').getDay();
    chips.push({ k, label: ['D','L','M','M','J','V','S'][dow], met, isToday: i === 0 });
  }

  // Composición: indicador de grasa CONTINUO (se mueve cada escaneo) con su trayectoria
  // de largo plazo + lente de recomposición. La grasa visceral (índice entero) queda como
  // meta de fondo con su arco, en vez del número congelado scan-to-scan. Ver
  // computeCompositionFocus en src/analytics.mjs.
  const comp = computeCompositionFocus(state?.weights || [], state?.userProfile?.goal);
  const lastCompDate = (state?.weights || [])
    .filter((w) => w.visceralFat != null || w.skeletalMuscleKg != null || w.bodyFatPct != null)
    .map((w) => w.date).sort().pop();
  // Color por estado de la métrica de grasa (mejora = verde, empeora = cálido, estable = tenue).
  const statusColor = (s) => s === 'mejora' ? 'var(--bento-pos)' : s === 'empeora' ? 'var(--bento-warm)' : 'var(--bento-muted)';
  // Color del índice visceral por rangos clínicos (mantiene la semántica previa).
  const viscColor = (v) => v == null ? 'var(--bento-faint)' : v < 10 ? 'var(--bento-pos)' : v <= 12 ? 'var(--bento-yellow)' : 'var(--bento-warm)';

  // Pacing a la meta: ¿el ritmo real de pérdida alcanza para llegar al peso objetivo en la fecha límite?
  const GOAL_DEADLINE = '2026-11-27';
  const goalKg = state?.userProfile?.goalWeightKg || 90;
  let pacing = null;
  const trend = computeTrendAnalysis(state?.weights || [], state?.days || {}, state?.snackBank || [], state?.proteinBank || [], T, state?.dessertBank || [], state?.antojoCustomItems || []);
  if (trend && trend.lossPctPerWeek != null && trend.last?.weightKg != null) {
    const curKg = trend.last.weightKg;
    const kgToGo = curKg - goalKg;
    const realRate = (trend.lossPctPerWeek / 100) * curKg; // kg/sem (+ = bajando)
    const nowMs = new Date(todayK + 'T12:00:00').getTime();
    const weeksToDeadline = (new Date(GOAL_DEADLINE + 'T12:00:00').getTime() - nowMs) / (7 * 86400000);
    if (kgToGo <= 0.2) {
      pacing = { tone: 'pos', text: `meta ${goalKg} kg alcanzada` };
    } else if (realRate <= 0.02 || weeksToDeadline <= 0) {
      pacing = { tone: 'warm', text: `a ${goalKg} kg · sin avance` };
    } else {
      const etaWeeks = kgToGo / realRate;
      const eta = new Date(nowMs + etaWeeks * 7 * 86400000);
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const slack = weeksToDeadline - etaWeeks; // + = llega antes del 27-nov
      const tone = slack >= 0 ? 'pos' : (slack >= -4 ? 'yellow' : 'warm');
      const verdict = slack >= 0 ? `en fecha · ~${eta.getDate()} ${meses[eta.getMonth()]}` : `atrasado ${Math.ceil(-slack)} sem`;
      pacing = { tone, text: `a ${goalKg} kg · ${verdict}` };
    }
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {/* Energía */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Energía · hoy</span>
          <span className="bento-label">objetivo {kcalTarget}</span>
        </div>
        <div className="flex items-center gap-4">
          <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
            <svg width="140" height="140" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="70" fill="none" stroke="var(--bento-surface)" strokeWidth="14" />
              <circle cx="80" cy="80" r="70" fill="none"
                stroke={kcalRemaining < 0 ? 'var(--bento-warm)' : 'var(--bento-ink)'}
                strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${(kcalPct/100)*C} ${C}`} transform="rotate(-90 80 80)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {kcalRemaining >= 0 ? kcalRemaining : Math.abs(kcalRemaining)}
              </div>
              <div className="bento-label" style={{ marginTop: 4, fontSize: 10 }}>{kcalRemaining >= 0 ? 'kcal restantes' : 'kcal sobre'}</div>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="bento-label">Comido</div>
              <div className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{kcalEaten} <span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}>kcal</span></div>
            </div>
            {kcalBurned > 0 && (
              <div>
                <div className="bento-label">Quemado · informativo</div>
                <div className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--bento-pos)' }}>{kcalBurned} <span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}>kcal</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Macros */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="mb-3"><span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Macros</span></div>
        <div className="space-y-2.5">
          {macros.map((m) => {
            const pct = Math.min(100, m.t > 0 ? (m.v / m.t) * 100 : 0);
            return (
              <div key={m.label}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-medium" style={{ color: 'var(--bento-muted)' }}>{m.label}</span>
                  <span className="text-xs bento-mono" style={{ color: 'var(--bento-ink)', fontVariantNumeric: 'tabular-nums' }}>{m.v}<span style={{ color: 'var(--bento-faint)' }}>/{m.t}g</span></span>
                </div>
                <div style={{ height: 4, background: 'var(--bento-surface)', borderRadius: 99, marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: m.color, borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peso */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
            <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Peso</span>
            <select
              value={weightWin === Infinity ? 'all' : String(weightWin)}
              onChange={(e) => setWeightWindow(e.target.value === 'all' ? Infinity : Number(e.target.value))}
              aria-label="Ventana del gráfico de peso"
              className="bento-mono"
              style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--bento-muted)', background: 'var(--bento-surface)', border: '1px solid var(--bento-hairline)', borderRadius: 6, padding: '1px 4px', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
              {WEIGHT_WINDOWS.map((w) => (
                <option key={w.label} value={w.d === Infinity ? 'all' : String(w.d)}>{w.label}</option>
              ))}
            </select>
          </div>
          {deltaKg != null && (
            <span className="bento-mono text-xs" style={{ color: deltaKg < 0 ? 'var(--bento-pos)' : deltaKg > 0 ? 'var(--bento-warm)' : 'var(--bento-faint)' }}>{deltaKg > 0 ? '+' : ''}{deltaKg} kg / {weightWinLabel}</span>
          )}
        </div>
        {lastWeight ? (
          <>
            <div className="text-3xl font-bold" style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{lastWeight.weightKg}<span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}> kg</span></div>
            {pacing && (
              <div className="mt-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: `var(--bento-${pacing.tone})`, flexShrink: 0 }} />
                <span className="bento-mono" style={{ fontSize: 10, color: 'var(--bento-muted)' }}>{pacing.text}</span>
              </div>
            )}
            {path && (
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 56, marginTop: 12 }}>
                <path d={path + ` L100,30 L0,30 Z`} fill="var(--bento-pos)" opacity="0.13" />
                <path d={path} fill="none" stroke="var(--bento-pos)" strokeWidth="0.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {pts.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 1.4 : 0.8} fill={i === pts.length - 1 ? 'var(--bento-pos)' : 'var(--bento-card)'} stroke="var(--bento-pos)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            )}
          </>
        ) : (
          <div className="text-sm py-3" style={{ color: 'var(--bento-faint)' }}>Sin mediciones aún.</div>
        )}
      </div>

      {/* Composición — grasa continua (se mueve cada escaneo) + recomposición; visceral = meta de fondo */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Composición</span>
          {lastCompDate && <span className="bento-label">{lastCompDate.slice(5)}</span>}
        </div>
        {comp ? (
          <>
            {comp.fat && (
              <div className="flex items-end justify-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <div className="bento-label">{comp.fat.label}</div>
                  <div className="font-bold" style={{ fontSize: 30, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: statusColor(comp.fat.status) }}>
                    {comp.fat.last}<span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}> {comp.fat.unit}</span>
                  </div>
                  {comp.fat.deltaArc !== 0 && (
                    <div className="bento-mono text-xs mt-1" style={{ color: statusColor(comp.fat.status), fontVariantNumeric: 'tabular-nums' }}>
                      {comp.fat.deltaArc > 0 ? '+' : ''}{comp.fat.deltaArc} {comp.fat.unit}
                      <span style={{ color: 'var(--bento-faint)' }}> · desde {comp.fat.first}</span>
                    </div>
                  )}
                </div>
                {comp.fat.values.length > 1 && (
                  <Sparkline values={comp.fat.values} color={statusColor(comp.fat.status)} width={76} height={30} />
                )}
              </div>
            )}
            {comp.recomp && (
              <div className="mt-3" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 99, background: 'var(--bento-surface)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--bento-pos)', flexShrink: 0 }} />
                <span className="text-xs font-medium" style={{ color: 'var(--bento-pos)' }}>Recomposición</span>
                <span className="bento-mono text-xs" style={{ color: 'var(--bento-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  grasa {comp.fat.deltaArc}{comp.fat.unit} · músculo {Math.abs(comp.muscle.deltaArc) < 0.2 ? 'intacto' : `${comp.muscle.deltaArc > 0 ? '+' : ''}${comp.muscle.deltaArc}`}
                </span>
              </div>
            )}
            {comp.muscle && (
              <div className="mt-3 flex justify-between items-baseline">
                <span className="text-xs font-medium" style={{ color: 'var(--bento-muted)' }}>{comp.muscle.label}</span>
                <span className="text-xs bento-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'var(--bento-ink)' }}>{comp.muscle.last} kg</span>
                  {comp.muscle.deltaArc !== 0 && (
                    <span style={{ marginLeft: 6, color: statusColor(comp.muscle.status) }}>{comp.muscle.deltaArc > 0 ? '+' : ''}{comp.muscle.deltaArc}</span>
                  )}
                </span>
              </div>
            )}
            {comp.visceral && (() => {
              const { first, last, goal, toGoal, reached } = comp.visceral;
              const span = first - goal;
              const done = reached ? 1 : span > 0 ? Math.min(1, Math.max(0, (first - last) / span)) : 0;
              return (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--bento-hairline)' }}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium" style={{ color: 'var(--bento-muted)' }}>
                      Grasa visceral <span style={{ color: 'var(--bento-faint)' }}>· meta &lt;{goal}</span>
                    </span>
                    <span className="text-xs bento-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: viscColor(last) }}>{last}</span>
                      {first !== last && <span style={{ color: 'var(--bento-faint)' }}> · desde {first}</span>}
                      {!reached && <span style={{ color: 'var(--bento-faint)' }}> · faltan {toGoal}</span>}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bento-surface)', borderRadius: 99, marginTop: 6 }}>
                    <div style={{ height: '100%', width: `${done * 100}%`, background: viscColor(last), borderRadius: 99 }} />
                  </div>
                  {comp.waist && comp.waist.deltaArc !== 0 && (
                    <div className="flex justify-between items-baseline mt-2">
                      <span className="text-xs font-medium" style={{ color: 'var(--bento-muted)' }}>
                        Cintura <span style={{ color: 'var(--bento-faint)' }}>· confirma el avance</span>
                      </span>
                      <span className="text-xs bento-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: 'var(--bento-ink)' }}>{comp.waist.last} cm</span>
                        <span style={{ marginLeft: 6, color: statusColor(comp.waist.status) }}>{comp.waist.deltaArc > 0 ? '+' : ''}{comp.waist.deltaArc}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : (
          <div className="text-sm py-3" style={{ color: 'var(--bento-faint)' }}>Sin escaneo de composición aún.</div>
        )}
      </div>

      {/* Día / racha */}
      <div className="bento-card" style={{ minWidth: 0, cursor: streak ? 'pointer' : 'default' }} onClick={() => streak && onStreakClick && onStreakClick()}>
        <div className="mb-3"><span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Día</span></div>
        <div className="flex gap-1.5 mb-3">
          {chips.map((c, i) => (
            <div key={i} style={{
              flex: 1, height: 32, borderRadius: 6,
              background: c.isToday ? 'var(--bento-ink)' : c.met === true ? 'var(--bento-ink)' : c.met === false ? 'var(--bento-warm)' : 'var(--bento-surface)',
              opacity: c.met === null && !c.isToday ? 0.55 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
              color: (c.isToday || c.met !== null) ? 'var(--bento-on-ink)' : 'var(--bento-faint)',
            }}>{c.label}</div>
          ))}
        </div>
        <div className="bento-label">Racha · mejor {streak?.best || 0}</div>
        {streak && (
          <div className="mt-1 text-2xl font-bold" style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{streak.current || 0} <span className="text-sm font-normal" style={{ color: 'var(--bento-faint)' }}>días</span></div>
        )}
      </div>
    </div>
  );
}

function ProgressPanel({ totals, targets, streak, onStreakClick }) {
  const T = targets || DEFAULT_TARGETS;
  const kcalColor = colorForKcal(totals.kcal, T);
  const proteinColor = colorForProtein(totals.protein, T);
  const carbsColor = colorForMacro(totals.carbs, T.carbsTarget);
  const fatColor = colorForMacro(totals.fat, T.fatTarget);
  const fiberColor = colorForFiber(totals.fiber, T.fiberTarget);
  const kcalRemaining = Math.round(totals.kcalRemaining);
  const proteinRemaining = Math.round(totals.proteinRemaining);

  return (
    <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 safe-top">
      {streak && (streak.current > 0 || streak.best > 0) && (
        <div className="mb-2 flex items-center justify-end">
          <StreakChip streak={streak} onClick={onStreakClick} />
        </div>
      )}
      <ProgressBar value={totals.kcal} max={T.kcalRed} color={kcalColor} label="Calorías" unit=" kcal" target={T.kcalMax} />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2 ${kcalRemaining >= 0 ? COLOR_CLASSES[kcalColor].bg : COLOR_CLASSES.red.bg}`}>
          <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">
            {kcalRemaining >= 0 ? 'Quedan' : 'Te pasaste'}
          </div>
          <div className={`text-lg font-bold ${kcalRemaining >= 0 ? COLOR_CLASSES[kcalColor].text : COLOR_CLASSES.red.text}`}>
            {Math.abs(kcalRemaining)} <span className="text-xs font-normal">kcal</span>
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2 ${proteinRemaining <= 0 ? COLOR_CLASSES.green.bg : COLOR_CLASSES[proteinColor].bg}`}>
          <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">
            {proteinRemaining <= 0 ? 'Meta proteína' : 'Faltan prot'}
          </div>
          <div className={`text-lg font-bold ${proteinRemaining <= 0 ? COLOR_CLASSES.green.text : COLOR_CLASSES[proteinColor].text}`}>
            {proteinRemaining <= 0 ? '✓' : <>{proteinRemaining}<span className="text-xs font-normal">g</span></>}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <MacroChip label="Prot" value={totals.protein} target={T.proteinMin} color={proteinColor} unit="g" />
        <MacroChip label="Carb" value={totals.carbs} target={T.carbsTarget} color={carbsColor} unit="g" />
        <MacroChip label="Grasa" value={totals.fat} target={T.fatTarget} color={fatColor} unit="g" />
        <MacroChip label="Fibra" value={totals.fiber} target={T.fiberTarget} color={fiberColor} unit="g" />
      </div>

      <div className="mt-2">
        <WaterRing ml={Math.round(totals.waterMl)} targetMl={T.waterTarget} />
      </div>

      {totals.kcalBurned > 0 && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
          <span>🔥</span>
          <span><span className="font-semibold text-gray-900 dark:text-gray-100">{Math.round(totals.kcalBurned)}</span> kcal quemadas hoy</span>
        </div>
      )}

      {totals.eatenAny && (kcalColor === 'red' || proteinColor === 'red') && (
        <div className="mt-2 flex flex-wrap gap-2">
          {kcalColor === 'red' && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              ⚠️ Sobre meta de kcal
            </span>
          )}
          {proteinColor === 'red' && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              ⚠️ Proteína baja
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function OnboardingModal({ state, setState, onClose, editing = false }) {
  const lastWeight = (state.weights || [])
    .filter((w) => w.weightKg != null)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .pop();
  const lastHeight = (state.weights || [])
    .filter((w) => w.heightCm != null)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .pop();
  const seed = state.userProfile || {};

  const [age, setAge] = useState(seed.age != null ? String(seed.age) : '');
  const [sex, setSex] = useState(seed.sex || 'M');
  const [heightCm, setHeightCm] = useState(
    seed.heightCm != null ? String(seed.heightCm) : (lastHeight?.heightCm != null ? String(lastHeight.heightCm) : '')
  );
  const [weightKg, setWeightKg] = useState(
    seed.weightKg != null ? String(seed.weightKg) : (lastWeight?.weightKg != null ? String(lastWeight.weightKg) : '')
  );
  const [goalWeightKg, setGoalWeightKg] = useState(seed.goalWeightKg != null ? String(seed.goalWeightKg) : '');
  const [activityLevel, setActivityLevel] = useState(seed.activityLevel || 'moderate');
  const [goal, setGoal] = useState(seed.goal || 'lose');
  const [override, setOverride] = useState(false);
  const [kcalManual, setKcalManual] = useState(seed.kcalTarget != null ? String(seed.kcalTarget) : '');
  const [proteinManual, setProteinManual] = useState(seed.proteinTarget != null ? String(seed.proteinTarget) : '');

  const profileDraft = useMemo(() => ({
    age: Number(age) || null,
    sex,
    heightCm: Number(heightCm) || null,
    weightKg: Number(weightKg) || null,
    goalWeightKg: Number(goalWeightKg) || null,
    activityLevel,
    goal,
    kcalTarget: override && kcalManual !== '' ? Number(kcalManual) : null,
    proteinTarget: override && proteinManual !== '' ? Number(proteinManual) : null,
    kcalDeficit: Number.isFinite(seed.kcalDeficit) ? seed.kcalDeficit : 400,
    lastAdjustmentDate: seed.lastAdjustmentDate || null,
  }), [age, sex, heightCm, weightKg, goalWeightKg, activityLevel, goal, override, kcalManual, proteinManual, seed.kcalDeficit, seed.lastAdjustmentDate]);

  const targets = useMemo(() => calcTargets(profileDraft), [profileDraft]);

  const canSave = profileDraft.age && profileDraft.heightCm && profileDraft.weightKg;

  const save = () => {
    if (!canSave) return;
    setState((prev) => ({
      ...prev,
      userProfile: {
        ...profileDraft,
        onboardedAt: prev.userProfile?.onboardedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
    onClose && onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? '⚙️ Mi perfil' : '👋 Configura tu plan'}</h2>
          {editing && onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
          )}
        </div>
        {!editing && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Calculamos tu meta de calorías y macros con Mifflin-St Jeor. Lo puedes editar después en Ajustes.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Edad</span>
            <input type="number" inputMode="numeric" min="10" max="100" value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sexo</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['M', 'F'].map((s) => (
                <button type="button" key={s} onClick={() => setSex(s)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium ${
                    sex === s ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{s === 'M' ? '♂ Hombre' : '♀ Mujer'}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Altura (cm)</span>
            <input type="number" inputMode="decimal" step="0.1" value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Peso actual (kg)</span>
            <input type="number" inputMode="decimal" step="0.1" value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Peso meta (kg)</span>
            <input type="number" inputMode="decimal" step="0.1" value={goalWeightKg} placeholder="opcional"
              onChange={(e) => setGoalWeightKg(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nivel de actividad</div>
          <div className="space-y-1.5">
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
              <button type="button" key={k} onClick={() => setActivityLevel(k)}
                className={`w-full text-left px-3 py-2 rounded-xl border-2 ${
                  activityLevel === k ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>
                <div className="text-sm font-semibold">{v.label}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">{v.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Objetivo</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'lose', label: 'Bajar', sub: '−400 kcal' },
              { id: 'maintain', label: 'Mantener', sub: '±0' },
              { id: 'gain', label: 'Subir', sub: '+300 kcal' },
            ].map((g) => (
              <button type="button" key={g.id} onClick={() => setGoal(g.id)}
                className={`py-2.5 rounded-xl border-2 ${
                  goal === g.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>
                <div className="text-sm font-semibold">{g.label}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{g.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {canSave && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Tus metas calculadas</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">TMB (Mifflin-St Jeor)</div>
                <div className="font-bold">{targets.bmr || '—'} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">TDEE</div>
                <div className="font-bold">{targets.tdee || '—'} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Meta diaria</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">{targets.kcalMax} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Proteína</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">{targets.proteinMin}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Carbos</div>
                <div className="font-bold">{targets.carbsTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Grasas</div>
                <div className="font-bold">{targets.fatTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Fibra</div>
                <div className="font-bold">{targets.fiberTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Agua</div>
                <div className="font-bold text-sky-700 dark:text-sky-300">{targets.waterTarget}<span className="text-[10px] font-normal">ml</span></div>
              </div>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-emerald-500" />
          <div>
            <div className="text-sm font-medium">Sobrescribir kcal/proteína manualmente</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Útil si tu nutricionista te dio un número distinto.</div>
          </div>
        </label>
        {override && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">kcal/día</span>
              <input type="number" inputMode="numeric" value={kcalManual} onChange={(e) => setKcalManual(e.target.value)}
                placeholder={String(targets.kcalMax)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g)</span>
              <input type="number" inputMode="numeric" value={proteinManual} onChange={(e) => setProteinManual(e.target.value)}
                placeholder={String(targets.proteinMin)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {editing && onClose && (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          )}
          <button onClick={save} disabled={!canSave}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
            {editing ? 'Guardar cambios' : 'Comenzar ✨'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectableCard({ item, selected, eaten, onClick, onToggleEaten, showCategory, targets }) {
  const emoji = emojiForFood(item.name);
  const T = targets || DEFAULT_TARGETS;
  const kcalPct = T.kcalMax > 0 ? Math.round((item.kcal / T.kcalMax) * 100) : 0;
  const protPct = T.proteinMin > 0 ? Math.round((item.protein / T.proteinMin) * 100) : 0;
  const baseBorder = selected
    ? (eaten ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
             : 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10')
    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700';
  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${baseBorder}`}>
      <button type="button" onClick={onClick}
        className="w-full text-left p-3.5 active:scale-[0.98] transition-transform">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0 leading-none mt-0.5">{emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm leading-snug">{item.name}</div>
              {selected && (
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</span>
              )}
            </div>
            {showCategory && item.category && (
              <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wide">{item.category}</span>
            )}
            <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
              <span className="text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{item.kcal}</span> kcal <span className="text-[10px] opacity-70">({kcalPct}%)</span></span>
              <span className="text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{item.protein}g</span> prot <span className="text-[10px] opacity-70">({protPct}%)</span></span>
            </div>
          </div>
        </div>
      </button>
      {selected && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onToggleEaten && onToggleEaten(); }}
          className={`w-full px-3 py-2 text-xs font-semibold border-t-2 transition-colors ${
            eaten
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
          }`}>
          {eaten ? '✓ Comido' : 'Marcar como comido'}
        </button>
      )}
    </div>
  );
}

function SectionHeader({ title, hint }) {
  return (
    <div className="px-1 pt-2 pb-1.5">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function QuickAddForm({ title, fields, initial, onSave, onCancel }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields) v[f.name] = initial?.[f.name] ?? (f.type === 'number' ? '' : '');
    return v;
  });

  const submit = (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          if (f.optional) { out[f.name] = 0; continue; }
          return;
        }
        out[f.name] = n;
      } else {
        const s = String(raw).trim();
        if (!s && !f.optional) return;
        out[f.name] = s;
      }
    }
    onSave({ ...(initial || {}), ...out });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {f.label}{f.optional && <span className="text-gray-400 dark:text-gray-500"> (opcional)</span>}
            </span>
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              min={f.type === 'number' ? '0' : undefined}
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              placeholder={f.placeholder}
              autoFocus={f.name === fields[0].name}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// Modal para editar una comida YA registrada. Trae un multiplicador de porción que
// escala todos los macros desde un snapshot base (½ / ×1 / ×1.5 / ×2), o se editan a mano.
function LoggedItemModal({ initial, onSave, onCancel }) {
  const baseRef = React.useRef({
    kcal: Number(initial?.kcal) || 0,
    protein: Number(initial?.protein) || 0,
    carbs: Number(initial?.carbs) || 0,
    fat: Number(initial?.fat) || 0,
    fiber: Number(initial?.fiber) || 0,
  });
  const [name, setName] = useState(initial?.name || '');
  const [vals, setVals] = useState({ ...baseRef.current });
  const [mult, setMult] = useState(1);

  const applyMult = (f) => {
    const b = baseRef.current;
    setMult(f);
    setVals({
      kcal: Math.round(b.kcal * f),
      protein: Math.round(b.protein * f),
      carbs: Math.round(b.carbs * f),
      fat: Math.round(b.fat * f),
      fiber: Math.round(b.fiber * f),
    });
  };
  const setField = (k, raw) => { setMult(null); setVals((v) => ({ ...v, [k]: raw })); };

  const submit = (e) => {
    e.preventDefault();
    const nm = name.trim();
    const kcal = Number(vals.kcal);
    if (!nm || !Number.isFinite(kcal) || kcal < 0) return;
    onSave({
      name: nm,
      kcal: Math.round(kcal),
      protein: Math.max(0, Math.round(Number(vals.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(vals.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(vals.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(vals.fiber) || 0)),
    });
  };

  const MACROS = [
    { k: 'kcal', label: 'Calorías' },
    { k: 'protein', label: 'Proteína (g)' },
    { k: 'carbs', label: 'Carbos (g)' },
    { k: 'fat', label: 'Grasa (g)' },
    { k: 'fiber', label: 'Fibra (g)' },
  ];
  const PORTIONS = [0.5, 1, 1.5, 2];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Editar comida</h2>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción</span>
          <div className="mt-1 flex gap-2">
            {PORTIONS.map((f) => (
              <button key={f} type="button" onClick={() => applyMult(f)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${mult === f ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400'}`}>
                {f === 0.5 ? '½' : f === 1 ? '×1' : '×' + f}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((m) => (
            <label key={m.k} className={m.k === 'kcal' ? 'col-span-2 block' : 'block'}>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{m.label}</span>
              <input type="number" inputMode="numeric" min="0" value={vals[m.k]}
                onChange={(e) => setField(m.k, e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function DayItemList({ title, icon, items, onAdd, onRemove, onEdit, addLabel, emptyHint, renderMeta, iconForItem, headerExtra, totalLabel }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
        </div>
        {totalLabel ? (
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{totalLabel}</span>
        ) : items.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>
        )}
      </div>
      {headerExtra && (
        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">{headerExtra}</div>
      )}
      {items.length === 0 ? (
        <div className="px-4 pb-3 text-sm text-gray-500 dark:text-gray-400 italic">{emptyHint}</div>
      ) : (
        <div className={headerExtra ? '' : 'border-t border-gray-100 dark:border-gray-800'}>
          {items.map((item, i) => (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 && !headerExtra ? '' : 'border-t border-gray-100 dark:border-gray-800'}`}>
              {iconForItem && <span className="text-xl shrink-0 leading-none">{iconForItem(item)}</span>}
              {onEdit ? (
                <button type="button" onClick={() => onEdit(item)} className="flex-1 min-w-0 text-left">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{renderMeta(item)}</div>
                </button>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{renderMeta(item)}</div>
                </div>
              )}
              <button onClick={() => onRemove(item.id)} aria-label="Borrar"
                className="shrink-0 w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-base hover:bg-rose-100 dark:hover:bg-rose-900/50">✕</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onAdd} className="w-full py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border-t border-gray-100 dark:border-gray-800">
        + {addLabel}
      </button>
    </div>
  );
}

function BarcodeScannerModal({ onCancel, onDetected }) {
  const videoRef = React.useRef(null);
  const readerRef = React.useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | searching | not_found | error
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastBarcode, setLastBarcode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let reader = null;

    const start = async () => {
      try {
        const ZXing = await loadZXing();
        if (cancelled) return;
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.QR_CODE,
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        reader = new ZXing.BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        setStatus('scanning');
        await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          async (result, err) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (text === lastBarcode) return;
              setLastBarcode(text);
              setStatus('searching');
              try {
                const product = await searchOpenFoodFacts(text);
                if (cancelled) return;
                if (product) {
                  reader.reset();
                  onDetected(product);
                } else {
                  setStatus('not_found');
                  setError(`Código ${text} no está en OpenFoodFacts. Ingresa el producto manualmente o intenta otro.`);
                  // Permitir reintentar
                  setTimeout(() => { if (!cancelled) { setStatus('scanning'); setLastBarcode(null); } }, 3000);
                }
              } catch (e) {
                if (!cancelled) {
                  setStatus('scanning');
                  setError(e.message || 'Error consultando OpenFoodFacts');
                  setLastBarcode(null);
                }
              }
            }
          }
        );
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e?.message || 'No se pudo acceder a la cámara');
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      try { reader?.reset(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryManual = async () => {
    if (!manualBarcode.trim()) return;
    setStatus('searching'); setError(null);
    try {
      const product = await searchOpenFoodFacts(manualBarcode.trim());
      if (product) {
        try { readerRef.current?.reset(); } catch {}
        onDetected(product);
      } else {
        setStatus('not_found');
        setError(`Código ${manualBarcode.trim()} no está en OpenFoodFacts.`);
      }
    } catch (e) {
      setStatus('not_found');
      setError(e.message || 'Error consultando OpenFoodFacts');
    }
  };

  const close = () => {
    try { readerRef.current?.reset(); } catch {}
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Escanear código</h2>
          <button onClick={close} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {(status === 'starting' || status === 'searching') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
              {status === 'starting' ? 'Iniciando cámara…' : 'Buscando en OpenFoodFacts…'}
            </div>
          )}
          {status === 'scanning' && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          )}
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
          {status === 'scanning' && 'Apunta la cámara al código de barras del producto'}
          {status === 'searching' && 'Buscando datos nutricionales…'}
          {status === 'not_found' && lastBarcode && `Detectado: ${lastBarcode}`}
          {status === 'error' && 'No se pudo abrir la cámara'}
        </p>

        {error && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
            ⚠️ {error}
          </p>
        )}

        <div className="border-t border-gray-200 dark:border-gray-800 pt-3 space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">O ingresa el código manualmente:</div>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Ej. 7802950002543"
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono" />
            <button onClick={tryManual} disabled={!manualBarcode.trim() || status === 'searching'}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300">
              Buscar
            </button>
          </div>
        </div>

        <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Datos de <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" className="underline">OpenFoodFacts</a> (gratis, libre). No siempre tiene todos los productos chilenos.
        </p>
      </div>
    </div>
  );
}

function AddExtraModal({ apiKey, onCancel, onSave, foods, onSaveFood }) {
  const [name, setName] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [portion, setPortion] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null); // { confidence }
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [fromBarcode, setFromBarcode] = useState(null); // {barcode, name}
  const [productMeta, setProductMeta] = useState(null); // { barcode, per100 } para recordar el producto
  const [tags, setTags] = useState([]); // ['dulce', 'delivery', 'alcohol']
  // — Buscador "Mis alimentos" (Fase B) + OpenFoodFacts por nombre (Fase A) —
  const [foodQuery, setFoodQuery] = useState('');
  const [pickedFood, setPickedFood] = useState(null); // Food elegido → ajustar gramos antes de registrar
  const [grams, setGrams] = useState('');
  const [offResults, setOffResults] = useState(null); // null=no buscado, []=sin resultados
  const [offLoading, setOffLoading] = useState(false);
  const [savedFood, setSavedFood] = useState(false);

  const toggleTag = (tag) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const localMatches = useMemo(
    () => (foodQuery.trim().length >= 1 ? searchFoods(foods || [], foodQuery, 6) : []),
    [foodQuery, foods],
  );

  const pickFood = (food) => {
    setPickedFood(food);
    setGrams(String(food.defaultPortionG || 100));
  };

  // Registra el alimento elegido escalado a los gramos indicados (vía foodToMealItem) — bypassa
  // los campos manuales. id/ts los estampa handleSave del padre.
  const registerPickedFood = () => {
    if (!pickedFood) return;
    const g = Number(grams) > 0 ? Number(grams) : (pickedFood.defaultPortionG || 100);
    onSave(foodToMealItem(pickedFood, g));
  };

  const runOffSearch = async () => {
    const q = foodQuery.trim();
    if (q.length < 2) { setError('Escribe al menos 2 letras para buscar.'); return; }
    setOffLoading(true); setOffResults(null); setError(null);
    try {
      const res = await searchOpenFoodFactsByName(q);
      setOffResults(res);
    } catch (e) {
      setError(e.message || 'Error buscando en OpenFoodFacts');
      setOffResults([]);
    } finally {
      setOffLoading(false);
    }
  };

  // Resultado de OFF → rellena el formulario manual (reusa applyProductData) para ajustar/guardar.
  const pickOff = (product) => {
    applyProductData(product);
    setOffResults(null);
    setPickedFood(null);
    setFoodQuery('');
  };

  // "Guardar como alimento": promueve lo que esté en el formulario a la biblioteca reusable.
  const saveCurrentAsFood = () => {
    if (!onSaveFood) return;
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k < 0) { setError('Necesitas nombre y kcal para guardar.'); return; }
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
    onSaveFood({
      name: portion ? `${name.trim()} (${portion})` : name.trim(),
      kcal: k, protein: num(protein), carbs: num(carbs), fat: num(fat), fiber: num(fiber),
      portion: portion || undefined,
      per100: productMeta?.per100 || undefined,
      barcode: productMeta?.barcode || undefined,
      tags: tags.length ? tags.slice() : undefined,
    });
    setSavedFood(true);
    setTimeout(() => setSavedFood(false), 2200);
  };

  const applyProductData = (product) => {
    setShowScanner(false);
    setName(String(product.name || ''));
    setPortion(String(product.portion || ''));
    setKcal(String(Math.round(Number(product.kcal) || 0)));
    setProtein(String(Math.round(Number(product.protein) || 0)));
    setCarbs(String(Math.round(Number(product.carbs) || 0)));
    setFat(String(Math.round(Number(product.fat) || 0)));
    setFiber(String(Number(product.fiber || 0).toFixed(1)));
    setEstimated(null);
    setFromBarcode({ barcode: product.barcode, name: product.name });
    setProductMeta({ barcode: product.barcode || null, per100: product.raw || null });
    setError(null);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const newAtt = await Promise.all(files.slice(0, room).map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const canEstimate = (name.trim().length > 0 || attachments.length > 0);

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe el nombre o sube una foto.'); return; }
    setEstimating(true); setError(null);
    setProductMeta(null); // los macros estimados ya no corresponden al producto escaneado
    setFromBarcode(null);
    try {
      const data = await estimateExtraMacros({ name, attachments, apiKey });
      if (data?.name && !name.trim()) setName(String(data.name));
      if (data?.portion) setPortion(String(data.portion));
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      if (data?.protein != null) setProtein(String(Math.round(Number(data.protein) || 0)));
      if (data?.carbs != null) setCarbs(String(Math.round(Number(data.carbs) || 0)));
      if (data?.fat != null) setFat(String(Math.round(Number(data.fat) || 0)));
      if (data?.fiber != null) setFiber(String(Number(data.fiber).toFixed(1)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k < 0) {
      setError('Necesitas nombre y kcal.');
      return;
    }
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const finalName = portion ? `${name.trim()} (${portion})` : name.trim();
    onSave({
      name: finalName,
      kcal: k,
      protein: num(protein),
      carbs: num(carbs),
      fat: num(fat),
      fiber: num(fiber),
      tags: tags.length ? tags.slice() : undefined,
      source: productMeta?.barcode ? 'barcode' : (estimated ? 'haiku-estimate' : 'manual'),
      barcode: productMeta?.barcode || undefined,
      per100: productMeta?.per100 || undefined,
      portion: portion || undefined,
    });
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Agregar extra</h2>

        {/* — Buscar en Mis alimentos (Fase B) + OpenFoodFacts por nombre (Fase A) — */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
          <div className="flex gap-2">
            <input type="text" value={foodQuery}
              onChange={(e) => { setFoodQuery(e.target.value); setPickedFood(null); setOffResults(null); }}
              placeholder="🔍 Buscar alimento (pollo, arroz, palta…)"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="button" onClick={runOffSearch} disabled={offLoading || foodQuery.trim().length < 2}
              title="Buscar en OpenFoodFacts por nombre"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-white dark:hover:bg-gray-900 disabled:opacity-50">
              {offLoading ? '…' : '🌐 OFF'}
            </button>
          </div>

          {/* Resultados de Mis alimentos */}
          {!pickedFood && localMatches.length > 0 && (
            <div className="space-y-1">
              {localMatches.map((f) => (
                <button type="button" key={f.id} onClick={() => pickFood(f)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-emerald-400 text-left">
                  <span className="text-sm truncate">{f.name}{f.builtin && <span className="ml-1 text-[10px] text-gray-400">semilla</span>}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{Math.round(f.per100?.kcal || 0)} kcal/100g</span>
                </button>
              ))}
            </div>
          )}
          {!pickedFood && foodQuery.trim().length >= 1 && localMatches.length === 0 && offResults == null && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Sin coincidencias en tus alimentos. Prueba 🌐 OFF o regístralo abajo.</p>
          )}

          {/* Ajuste de gramos del alimento elegido */}
          {pickedFood && (
            <div className="rounded-lg bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-700 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{stripPortionSuffix(pickedFood.name)}</span>
                <button type="button" onClick={() => setPickedFood(null)} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Gramos</label>
                <input type="number" inputMode="numeric" min="1" value={grams} onChange={(e) => setGrams(e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">
                  {(() => { const m = scaleFoodToPortion(pickedFood, Number(grams) || pickedFood.defaultPortionG); return `${m.kcal} kcal · P ${m.protein} · C ${m.carbs} · G ${m.fat}`; })()}
                </span>
              </div>
              <button type="button" onClick={registerPickedFood}
                className="w-full py-2 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600">
                Registrar {Number(grams) > 0 ? `${grams}g` : ''}
              </button>
            </div>
          )}

          {/* Resultados de OpenFoodFacts por nombre */}
          {offResults != null && (
            offResults.length === 0
              ? <p className="text-[11px] text-gray-500 dark:text-gray-400">OpenFoodFacts no encontró nada para “{foodQuery.trim()}”.</p>
              : (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">OpenFoodFacts</p>
                  {offResults.map((p, i) => (
                    <button type="button" key={p.barcode || i} onClick={() => pickOff(p)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-sky-400 text-left">
                      <span className="text-sm truncate">{p.name}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{p.kcal} kcal / {p.portion}</span>
                    </button>
                  ))}
                </div>
              )
          )}
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder='Ej. Café latte, galleta'
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        {/* Adjuntos */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a, i) => (
              <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="block py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-medium text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
            <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
            📷 Foto
          </label>
          <button type="button" onClick={() => setShowScanner(true)}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            📊 Código de barras
          </button>
          <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
            className="py-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-xs hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
            {estimating ? 'Estimando…' : '✨ Estimar'}
          </button>
        </div>
        {fromBarcode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <span>📊</span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              Datos de OpenFoodFacts · código {fromBarcode.barcode}
            </span>
          </div>
        )}
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para estimar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Estimación con confianza {estimated.confidence} (Haiku) · Edita si necesitas
            </span>
          </div>
        )}

        {portion && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción estimada</span>
            <input type="text" value={portion} onChange={(e) => setPortion(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        )}

        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1.5">Etiquetas (opcional, cuentan para reglas)</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { tag: 'dulce', label: '🍰 Dulce' },
              { tag: 'delivery', label: '🍱 Delivery' },
              { tag: 'alcohol', label: '🍷 Alcohol' },
            ].map((t) => (
              <button type="button" key={t.tag} onClick={() => toggleTag(t.tag)}
                className={`py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                  tags.includes(t.tag)
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías</span>
          <input type="number" inputMode="numeric" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={protein} onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Carbos (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={carbs} onChange={(e) => setCarbs(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Grasas (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={fat} onChange={(e) => setFat(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fibra (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="decimal" step="0.1" min="0" value={fiber} onChange={(e) => setFiber(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        {onSaveFood && (name.trim() && Number(kcal) > 0) && (
          <button type="button" onClick={saveCurrentAsFood}
            className={`w-full py-2 rounded-xl border text-xs font-semibold transition-colors ${
              savedFood
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}>
            {savedFood ? '✓ Guardado en Mis alimentos' : '💾 Guardar como alimento reusable'}
          </button>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
      {showScanner && (
        <BarcodeScannerModal
          onCancel={() => setShowScanner(false)}
          onDetected={applyProductData} />
      )}
    </div>
  );
}

// Lista compacta de alimentos registrados (vía WhatsApp/bridge o captura) asignados a un slot
// del plan (colación/cena), para mostrarlos DENTRO de su sección en vez de en "Extras del día".
function SlotLoggedItems({ items, onRemove, onEdit, onToggleFav, favKeys }) {
  if (!items || items.length === 0) return null;
  const meta = (item) => (
    <>
      <span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal
      {item.protein > 0 && <> · P <span className="font-semibold text-gray-700 dark:text-gray-300">{item.protein}g</span></>}
      {item.carbs > 0 && <> · C {Math.round(item.carbs)}g</>}
      {item.fat > 0 && <> · G {Math.round(item.fat)}g</>}
      {item.fiber > 0 && <> · F {Number(item.fiber).toFixed(0)}g</>}
    </>
  );
  return (
    <div className="mt-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">📝 Registrado</div>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xl shrink-0 leading-none">{emojiForFood(item.name)}</span>
          {onEdit ? (
            <button type="button" onClick={() => onEdit(item)} className="flex-1 min-w-0 text-left">
              <div className="font-medium text-sm truncate">{item.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{meta(item)}</div>
            </button>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{item.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{meta(item)}</div>
            </div>
          )}
          {onToggleFav && (() => {
            const starred = favKeys?.has(normalizeName(item.name));
            return (
              <button onClick={() => onToggleFav(item)} aria-label={starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base ${starred ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-gray-400 bg-gray-50 dark:bg-gray-800 hover:text-amber-500'}`}>
                {starred ? '★' : '☆'}
              </button>
            );
          })()}
          <button onClick={() => onRemove(item.id)} aria-label="Borrar"
            className="shrink-0 w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-base hover:bg-rose-100 dark:hover:bg-rose-900/50">✕</button>
        </div>
      ))}
    </div>
  );
}

// Tarjeta de "Registro rápido": chips de favoritos + recientes para re-loguear de un toque.
// Recientes se derivan de computeRecents (no hay store nuevo); favoritos viven en state.favorites.
function QuickLogChip({ item, starred, onLog, onToggleFav }) {
  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <button type="button" onClick={() => onLog(item)} aria-label={`Registrar ${item.name}`}
        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
        <span className="text-sm leading-none">{emojiForFood(item.name)}</span>
        <span className="font-medium text-gray-800 dark:text-gray-200 max-w-[11rem] truncate">{item.name}</span>
        <span className="text-gray-500 dark:text-gray-400">· {Math.round(Number(item.kcal) || 0)} kcal</span>
        {Number(item.protein) > 0 && <span className="text-gray-500 dark:text-gray-400">· P {Math.round(item.protein)}g</span>}
      </button>
      <button type="button" onClick={() => onToggleFav(item)}
        aria-label={starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
        className={`px-2 py-1.5 text-sm border-l border-gray-200 dark:border-gray-700 ${starred ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>
        {starred ? '★' : '☆'}
      </button>
    </div>
  );
}

function QuickLogCard({ recents, favorites, bankNames, favKeys, onQuickLog, onToggleFav }) {
  const favChips = favorites || [];
  // Recientes: fuera los ya favoritos y los que ya se pueden elegir desde el banco (no duplicar).
  const recentChips = (recents || [])
    .filter((r) => r.key && !favKeys.has(r.key) && !bankNames.has(r.key))
    .slice(0, 8);
  if (favChips.length === 0 && recentChips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">⚡</span>
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Registro rápido</h3>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">un toque para repetir</span>
      </div>
      {favChips.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">★ Favoritos</div>
          <div className="flex flex-wrap gap-2">
            {favChips.map((item) => (
              <QuickLogChip key={`fav-${item.key}`} item={item} starred onLog={onQuickLog} onToggleFav={onToggleFav} />
            ))}
          </div>
        </div>
      )}
      {recentChips.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recientes</div>
          <div className="flex flex-wrap gap-2">
            {recentChips.map((item) => (
              <QuickLogChip key={`rec-${item.key}`} item={item} starred={false} onLog={onQuickLog} onToggleFav={onToggleFav} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExtrasSection({ day, onUpdate, apiKey, tryWithRules, onRemoveExtra, onEditExtra, foods, onSaveFood }) {
  const [adding, setAdding] = useState(false);
  const allItems = day.extras || [];
  // Solo la cubeta 'extra' se lista aquí; colación/cena se muestran dentro de sus secciones.
  const items = allItems.filter((e) => extraSlotBucket(e) === 'extra');

  const handleSave = (item) => {
    const tagSet = new Set(item.tags || []);
    // Determinar qué acciones aplica
    const actions = ['add_extra'];
    if (tagSet.has('dulce')) actions.push('add_dulce');
    if (tagSet.has('delivery')) actions.push('add_delivery');
    if (tagSet.has('alcohol')) actions.push('add_alcohol');

    const doSave = () => {
      onUpdate({ extras: [...allItems, { ...item, id: uuid(), ts: Date.now() }] });
      setAdding(false);
    };

    if (tryWithRules) {
      tryWithRules(actions, { prospectiveKcal: item.kcal || 0 }, doSave);
    } else {
      doSave();
    }
  };
  const handleRemove = onRemoveExtra || ((id) => { onUpdate({ extras: allItems.filter((e) => e.id !== id) }); });

  return (
    <>
      <DayItemList title="Extras del día" icon="🍪" items={items}
        iconForItem={(item) => emojiForFood(item.name)}
        onAdd={() => setAdding(true)} onRemove={handleRemove} onEdit={onEditExtra}
        addLabel="Agregar extra" emptyHint="Sin extras hoy"
        renderMeta={(item) => (
          <>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal
            {item.protein > 0 && <> · P <span className="font-semibold text-gray-700 dark:text-gray-300">{item.protein}g</span></>}
            {item.carbs > 0 && <> · C {Math.round(item.carbs)}g</>}
            {item.fat > 0 && <> · G {Math.round(item.fat)}g</>}
            {item.fiber > 0 && <> · F {Number(item.fiber).toFixed(0)}g</>}
          </>
        )}
      />
      {adding && (
        <AddExtraModal apiKey={apiKey} foods={foods} onSaveFood={onSaveFood}
          onCancel={() => setAdding(false)} onSave={handleSave}
        />
      )}
    </>
  );
}

const MEAL_SLOTS = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'colacion1', label: 'Colación 1', emoji: '🥪' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍚' },
  { id: 'colacion2', label: 'Colación 2', emoji: '🥪' },
  { id: 'cena', label: 'Cena', emoji: '🍽️' },
  { id: 'extra', label: 'Extra', emoji: '➕' },
];

function MealPhotoModal({ state, setState, dateKey, onClose }) {
  const [attachments, setAttachments] = useState([]);
  const [freeText, setFreeText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [slot, setSlot] = useState('extra');
  const apiKey = state.settings?.anthropicApiKey;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} imágenes.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos.`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0 && !freeText.trim()) {
      setError('Sube una foto o describe lo que comiste.');
      return;
    }
    setProcessing(true); setError(null);
    try {
      const data = await extractMealFromInputs({ attachments, freeText, apiKey });
      const items = Array.isArray(data?.items) ? data.items : [];
      setExtracted({
        ...data,
        items: items.map((it) => ({
          id: uuid(),
          name: String(it.name || 'Sin nombre'),
          portion: String(it.portion || ''),
          kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
          protein: Math.max(0, Math.round(Number(it.protein) || 0)),
          carbs: Math.max(0, Math.round(Number(it.carbs) || 0)),
          fat: Math.max(0, Math.round(Number(it.fat) || 0)),
          fiber: Math.max(0, Number(it.fiber) || 0),
        })),
      });
    } catch (err) {
      setError(err.message || 'Error procesando');
    } finally {
      setProcessing(false);
    }
  };

  const updateItem = (id, patch) => {
    setExtracted((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  };

  const removeItem = (id) => {
    setExtracted((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  };

  const totals = useMemo(() => {
    const items = extracted?.items || [];
    return {
      kcal: items.reduce((s, x) => s + (Number(x.kcal) || 0), 0),
      protein: items.reduce((s, x) => s + (Number(x.protein) || 0), 0),
      carbs: items.reduce((s, x) => s + (Number(x.carbs) || 0), 0),
      fat: items.reduce((s, x) => s + (Number(x.fat) || 0), 0),
      fiber: items.reduce((s, x) => s + (Number(x.fiber) || 0), 0),
    };
  }, [extracted]);

  const confirm = () => {
    if (!extracted?.items?.length) return;
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      const day = { ...(days[dateKey] || {}) };
      const extras = Array.isArray(day.extras) ? [...day.extras] : [];
      for (const it of extracted.items) {
        const namePieces = [it.name];
        if (it.portion) namePieces.push(`(${it.portion})`);
        extras.push({
          id: uuid(),
          ts: Date.now(),
          name: namePieces.join(' '),
          kcal: it.kcal, protein: it.protein,
          carbs: it.carbs, fat: it.fat, fiber: it.fiber,
          mealSlot: slot,
          source: attachments.length ? 'photo' : 'text',
        });
      }
      day.extras = extras;
      if (slot !== 'extra') {
        day.eaten = { ...(day.eaten || {}), [slot]: true };
      }
      days[dateKey] = day;
      return { ...prev, days };
    });
    onClose();
  };

  const confidenceColor = extracted?.confidence === 'alta' ? 'green' : extracted?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📷 Foto / Voz / Texto</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {!extracted && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
              ))}
              {attachments.length < MAX_IMAGES && (
                <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
                  <span className="text-gray-400">📸</span>
                </label>
              )}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Describe lo que comiste (opcional — puedes dictar 🎤)
              </span>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
                placeholder='Ej. "Dos huevos revueltos con palta y café con leche"'
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </label>

            <button onClick={handleProcess} disabled={processing || !apiKey || (attachments.length === 0 && !freeText.trim())}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
              {processing ? 'Estimando macros…' : 'Estimar macros con Claude ✨'}
            </button>
            {!apiKey && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </>
        )}

        {extracted && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
              <span className="text-base">{extracted.confidence === 'alta' ? '✅' : extracted.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
              <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
                Confianza {extracted.confidence}{extracted.notes ? ` · ${extracted.notes}` : ''}
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Alimentos detectados</div>
              <div className="space-y-2">
                {extracted.items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xl shrink-0">{emojiForFood(it.name)}</span>
                      <div className="flex-1 min-w-0">
                        <input type="text" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })}
                          className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none" />
                        <input type="text" value={it.portion} onChange={(e) => updateItem(it.id, { portion: e.target.value })}
                          placeholder="porción"
                          className="w-full text-[11px] text-gray-500 dark:text-gray-400 bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none mt-0.5" />
                      </div>
                      <button onClick={() => removeItem(it.id)} className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 text-xs shrink-0">✕</button>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {[
                        ['kcal', 'kcal'],
                        ['protein', 'P'],
                        ['carbs', 'C'],
                        ['fat', 'G'],
                        ['fiber', 'F'],
                      ].map(([field, label]) => (
                        <label key={field} className="block">
                          <span className="text-[9px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{label}</span>
                          <input type="number" inputMode="decimal" step={field === 'fiber' ? '0.1' : '1'} min="0"
                            value={it[field]}
                            onChange={(e) => updateItem(it.id, { [field]: Number(e.target.value) || 0 })}
                            className="mt-0.5 w-full px-1.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-xs grid grid-cols-5 gap-1.5">
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">kcal</div><div className="font-bold">{totals.kcal}</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">P</div><div className="font-bold">{totals.protein}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">C</div><div className="font-bold">{totals.carbs}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">G</div><div className="font-bold">{totals.fat}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">F</div><div className="font-bold">{Number(totals.fiber).toFixed(1)}g</div></div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Asignar a</div>
              <div className="grid grid-cols-3 gap-1.5">
                {MEAL_SLOTS.map((s) => (
                  <button key={s.id} onClick={() => setSlot(s.id)}
                    className={`py-2 rounded-xl border-2 text-xs font-semibold ${
                      slot === s.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                    }`}>
                    <span className="mr-1">{s.emoji}</span>{s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setExtracted(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">
                ← Volver
              </button>
              <button onClick={confirm} disabled={!extracted.items.length}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300">
                Agregar al día
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

const INSIGHT_STYLE = {
  urgent: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
  warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  info: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
  good: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
};

// Tarjetas de insights proactivos deterministas (computeProactiveInsights). `readOnly` oculta los
// botones de acción (para vistas que no tienen cómo ejecutarlos). En el Coach van interactivas.
function ProactiveInsights({ insights, onAction, readOnly }) {
  if (!insights || insights.length === 0) return null;
  const actionable = (a) => a && (a.kind === 'water250' || a.kind === 'water500' || a.kind === 'substitution');
  return (
    <div className="space-y-2">
      {insights.map((i, idx) => (
        <div key={idx} className={`rounded-xl border p-3 ${INSIGHT_STYLE[i.severity] || INSIGHT_STYLE.info}`}>
          <div className="flex items-start gap-2">
            <span className="text-base leading-none">{i.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{i.title}</p>
              {i.detail && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-snug">{i.detail}</p>}
              {!readOnly && actionable(i.action) && (
                <button onClick={() => onAction && onAction(i.action)}
                  className="mt-2 px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                  {i.action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CoachModal({ state, setState, dateKey, targets, onClose, onOpenSubstitution }) {
  const day = state.days[dateKey] || {};
  const totals = useMemo(
    () => computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []),
    [day, state.snackBank, state.proteinBank, targets, state.dessertBank]
  );
  const T = targets || DEFAULT_TARGETS;
  const apiKey = state.settings?.anthropicApiKey;

  // Señales deterministas (sin IA): se muestran siempre y fundamentan el prompt del coach.
  const insights = useMemo(
    () => { const n = new Date(); return computeProactiveInsights(state, dateKey, T, { nowMinutes: n.getHours() * 60 + n.getMinutes() }); },
    [state.days, state.weights, state.snackBank, state.proteinBank, state.dessertBank, state.settings, dateKey, T]
  );

  const sig = hashSig({
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    fiber: totals.fiber,
    water: totals.waterMl,
    burned: totals.kcalBurned,
    health: hashSig(day.health || null),
    dateKey,
    hour: new Date().getHours(),
  });

  const cache = state.aiCache?.coach?.[dateKey];
  const cached = cache?.sig === sig ? cache.response : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const now = new Date();
      const hora = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      const eaten = day.eaten || {};
      const slotsPendientes = [];
      if (!eaten.desayuno) slotsPendientes.push('desayuno');
      if (!eaten.almuerzo) slotsPendientes.push('almuerzo');
      if (!eaten.colacion1) slotsPendientes.push('colación 1');
      if (!eaten.colacion2) slotsPendientes.push('colación 2');
      if (!eaten.cena) slotsPendientes.push('cena');

      const hh = day.health || null;
      const actividadLinea = hh
        ? `\n- Actividad (Apple Health, SOLO contexto — NO restes la energía activa de las kcal): ${hh.steps != null ? Math.round(hh.steps) + ' pasos' : 'pasos —'} · ${hh.activeEnergyKcal != null ? Math.round(hh.activeEnergyKcal) + ' kcal activos' : 'energía activa —'}${hh.sleepHours != null ? ' · durmió ' + hh.sleepHours.toFixed(1) + ' h' : ''}`
        : '';

      const prompt = `Eres el coach nutricional de Hugo (geriatra chileno, hombre). Sé directo, conciso, sin alarmismo. USA TUTEO CHILENO (tú, tienes, puedes). NO uses voseo argentino (vos, tenés, podés). Nada de "che", "dale".

ESTADO AHORA:
- Hora local: ${hora}
- Calorías: ${Math.round(totals.kcal)} / ${T.kcalMax} kcal (meta diaria)
- Proteína: ${Math.round(totals.protein)} / ${T.proteinMin} g
- Carbos: ${Math.round(totals.carbs)} / ${T.carbsTarget} g
- Grasas: ${Math.round(totals.fat)} / ${T.fatTarget} g
- Fibra: ${Math.round(totals.fiber)} / ${T.fiberTarget} g
- Agua: ${totals.waterMl} / ${T.waterTarget} ml
- Ejercicio quemado hoy: ${Math.round(totals.kcalBurned)} kcal (SOLO informativo — NO lo restes de las calorías; el TDEE y la meta ya incorporan la actividad)${actividadLinea}
- Comidas sin marcar todavía: ${slotsPendientes.length ? slotsPendientes.join(', ') : 'ninguna'}
${insights.length ? `\nSEÑALES DETECTADAS (deterministas, úsalas como base y NO las contradigas):\n${insights.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join('\n')}\n` : ''}
Devuelve SOLO JSON, sin markdown, así:
{
  "headline": "1 línea con titular accionable (máx 80 chars)",
  "suggestion": "2-3 líneas concretas: qué hacer ahora dado el estado",
  "microActions": [
    { "label": "etiqueta corta", "kind": "water250|water500|substitution|none" }
  ]
}

Reglas:
- microActions: máximo 2, tappables. Usa kind="water250" o "water500" si conviene tomar agua, "substitution" si sugieres pedir opciones de comida, "none" si solo es texto.
- headline corto, suggestion concreta (no genérica)
- Conservador, sin pánico, sin culpar`;

      const text = await askClaude(prompt, apiKey, 600, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed) {
        setError('No se pudo parsear la respuesta del coach.');
        return;
      }
      const resp = {
        headline: String(parsed.headline || ''),
        suggestion: String(parsed.suggestion || ''),
        microActions: Array.isArray(parsed.microActions) ? parsed.microActions.slice(0, 2) : [],
      };
      setResponse(resp);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          coach: {
            ...(prev.aiCache?.coach || {}),
            [dateKey]: { sig, response: resp, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar al coach');
    } finally {
      setLoading(false);
    }
  };

  // Si no hay respuesta y hay API key, generar de una al abrir el modal
  useEffect(() => {
    if (!response && apiKey && !loading) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMicroAction = (action) => {
    if (action.kind === 'water250' || action.kind === 'water500') {
      const ml = action.kind === 'water500' ? 500 : 250;
      setState((prev) => {
        const days = { ...(prev.days || {}) };
        const d = { ...(days[dateKey] || {}) };
        d.water = { ...(d.water || {}), ml: (Number(d.water?.ml) || 0) + ml };
        days[dateKey] = d;
        return { ...prev, days };
      });
    } else if (action.kind === 'substitution') {
      onClose();
      onOpenSubstitution && onOpenSubstitution();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">💬 Coach del día</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {insights.length > 0 && (
          <ProactiveInsights insights={insights} onAction={handleMicroAction} />
        )}

        {loading && (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Pensando…
          </div>
        )}

        {!apiKey && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
            ⚠️ El coach con IA necesita tu API key en ⚙️ Ajustes. {insights.length ? 'Las señales de arriba funcionan sin ella.' : ''}
          </p>
        )}

        {response && !loading && (
          <div className="space-y-3">
            {response.headline && (
              <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3">
                <p className="text-sm font-bold text-sky-900 dark:text-sky-100">{response.headline}</p>
              </div>
            )}
            {response.suggestion && (
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{response.suggestion}</p>
            )}
            {response.microActions && response.microActions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {response.microActions.map((a, i) => (
                  <button key={i} onClick={() => handleMicroAction(a)}
                    className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Cacheado por estado del día</span>
              <button onClick={generate} disabled={loading}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                Regenerar
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function SubstitutionModal({ state, setState, dateKey, targets, onClose }) {
  const day = state.days[dateKey] || {};
  const totals = useMemo(
    () => computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []),
    [day, state.snackBank, state.proteinBank, targets, state.dessertBank]
  );
  const T = targets || DEFAULT_TARGETS;
  const apiKey = state.settings?.anthropicApiKey;

  const [kcalBudget, setKcalBudget] = useState(Math.max(0, Math.round(totals.kcalRemaining)));
  const [proteinBudget, setProteinBudget] = useState(Math.max(0, Math.round(totals.proteinRemaining)));
  const [tipo, setTipo] = useState('cualquiera');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(state.aiCache?.lastSubstitution?.response?.options || null);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const banco = [
        ...state.snackBank.map((s) => ({ name: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat, fiber: s.fiber, tipo: 'colación' })),
        ...state.proteinBank.map((p) => ({ name: p.name, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, tipo: 'cena/proteína' })),
      ];
      const now = new Date();
      const hora = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      const prompt = `Eres un nutricionista chileno. Dame OPCIONES realistas de alimentos para una persona adulta (Hugo, hombre chileno, geriatra de UC CHRISTUS).

CONTEXTO ahora:
- Hora local: ${hora}
- Le quedan ${kcalBudget} kcal y ${proteinBudget}g proteína para llegar a meta
- Tipo de comida buscada: ${tipo}

Su BANCO favorito (priorízalo si encaja):
${JSON.stringify(banco, null, 2)}

Devuelve SOLO JSON, sin markdown, con esta forma:
{
  "options": [
    {
      "name": "...",
      "portion": "...",
      "kcal": n,
      "protein": n,
      "carbs": n,
      "fat": n,
      "fiber": n,
      "rationale": "1 frase corta de por qué encaja"
    }
  ]
}

Reglas:
- 4 a 6 opciones
- Realistas para Chile (lácteos Colun, proteínas comunes, frutas locales)
- Si su banco tiene algo que encaja, inclúyelo con su nombre exacto
- Usa TUTEO chileno (tú, tienes), no voseo
- Sé conservador con porciones`;

      const text = await askClaude(prompt, apiKey, 1200, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed?.options?.length) {
        setError('No se pudo parsear la respuesta. Reintenta.');
        return;
      }
      const opts = parsed.options.map((o) => ({
        id: uuid(),
        name: String(o.name || ''),
        portion: String(o.portion || ''),
        kcal: Math.max(0, Math.round(Number(o.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(o.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(o.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(o.fat) || 0)),
        fiber: Math.max(0, Number(o.fiber) || 0),
        rationale: String(o.rationale || ''),
      }));
      setOptions(opts);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          lastSubstitution: {
            request: { kcalBudget, proteinBudget, tipo },
            response: { options: opts, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const addAsExtra = (opt) => {
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      const d = { ...(days[dateKey] || {}) };
      const extras = Array.isArray(d.extras) ? [...d.extras] : [];
      const nameWithPortion = opt.portion ? `${opt.name} (${opt.portion})` : opt.name;
      extras.push({
        id: uuid(),
        name: nameWithPortion,
        kcal: opt.kcal, protein: opt.protein,
        carbs: opt.carbs, fat: opt.fat, fiber: opt.fiber,
        source: 'substitution',
      });
      d.extras = extras;
      days[dateKey] = d;
      return { ...prev, days };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🔄 ¿Qué puedo comer ahora?</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Margen kcal</span>
            <input type="number" inputMode="numeric" value={kcalBudget}
              onChange={(e) => setKcalBudget(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Margen proteína (g)</span>
            <input type="number" inputMode="numeric" value={proteinBudget}
              onChange={(e) => setProteinBudget(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tipo</div>
          <div className="grid grid-cols-3 gap-1.5">
            {['cualquiera', 'liviano', 'sustancioso', 'dulce', 'salado'].map((t) => (
              <button key={t} onClick={() => setTipo(t)}
                className={`py-2 rounded-xl border-2 text-xs font-semibold capitalize ${
                  tipo === t ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !apiKey}
          className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          {loading ? 'Pensando…' : (options ? 'Generar de nuevo' : 'Generar opciones ✨')}
        </button>
        {!apiKey && (
          <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
        )}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        {options && options.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Opciones</div>
            {options.map((o) => (
              <div key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-xl shrink-0">{emojiForFood(o.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{o.name}</div>
                    {o.portion && <div className="text-xs text-gray-500 dark:text-gray-400">{o.portion}</div>}
                    <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">{o.kcal}</span> kcal · P {o.protein}g · C {o.carbs}g · G {o.fat}g · F {Number(o.fiber).toFixed(0)}g
                    </div>
                    {o.rationale && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">{o.rationale}</p>}
                  </div>
                  <button onClick={() => { addAsExtra(o); onClose(); }}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                    Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const NOTE_FIELDS = [
  { key: 'energy', label: 'Energía', emoji: '⚡', low: 'Cansado', high: 'Lleno' },
  { key: 'hunger', label: 'Hambre', emoji: '🍴', low: 'Sin hambre', high: 'Muy hambriento' },
  { key: 'sleep', label: 'Sueño', emoji: '😴', low: 'Mal', high: 'Excelente' },
  { key: 'mood', label: 'Ánimo', emoji: '😊', low: 'Bajo', high: 'Alto' },
];

function DailyNotesCard({ day, onUpdate }) {
  const notes = day?.notes || null;
  const hasNotes = notes && NOTE_FIELDS.some((f) => notes[f.key] != null);
  const [expanded, setExpanded] = useState(hasNotes);
  const [comment, setComment] = useState(notes?.comment || '');

  useEffect(() => {
    setComment(notes?.comment || '');
  }, [notes?.comment]);

  const setField = (key, value) => {
    const next = { ...(notes || {}), [key]: value };
    onUpdate({ notes: next });
  };
  const commitComment = (v) => {
    const trimmed = v.slice(0, 200);
    setComment(trimmed);
    const next = { ...(notes || {}), comment: trimmed };
    onUpdate({ notes: next });
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📓</span>
          <div className="text-left">
            <div className="text-sm font-semibold">Notas del día</div>
            {hasNotes && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {NOTE_FIELDS.filter((f) => notes[f.key] != null).map((f) => `${f.emoji} ${notes[f.key]}`).join(' · ')}
                {notes.comment ? ` · "${notes.comment.slice(0, 30)}${notes.comment.length > 30 ? '…' : ''}"` : ''}
              </div>
            )}
            {!hasNotes && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Cómo te sentiste hoy (energía, sueño, hambre, ánimo)</div>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-800">
          {NOTE_FIELDS.map((f) => {
            const val = notes?.[f.key];
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {f.emoji} {f.label}
                    {f.key === 'sleep' && day?.health?.sleepHours != null && (
                      <span className="ml-1.5 text-[10px] font-normal text-sky-500 dark:text-sky-400">Health: {fmtSleepHours(day.health.sleepHours)}</span>
                    )}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{val ? `${val} / 5` : '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n}
                      onClick={() => setField(f.key, val === n ? null : n)}
                      className={`flex-1 h-7 rounded-md text-xs font-semibold transition-colors ${
                        val != null && n <= val
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-0.5">
                  <span>{f.low}</span>
                  <span>{f.high}</span>
                </div>
              </div>
            );
          })}
          <label className="block pt-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">💬 Comentario (opcional)</span>
            <input type="text" value={comment}
              onChange={(e) => commitComment(e.target.value)}
              placeholder="Ej. mucho estrés en CSCA, salí a caminar..."
              maxLength={200}
              className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <span className="text-[10px] text-gray-400 mt-0.5 block">{comment.length}/200</span>
          </label>
        </div>
      )}
    </div>
  );
}

// Tarjeta de Actividad: pasos / energía activa / sueño de Apple Health (vía iOS Shortcut →
// bridge → day.health). SOLO CONTEXTO: nunca toca las kcal (el TDEE adaptativo ya capta el
// gasto). Estado vacío si no hay datos del día.
function ActivityCard({ day }) {
  const h = day?.health;
  const has = h && (h.steps != null || h.activeEnergyKcal != null || h.sleepHours != null || h.restingHr != null || h.vo2max != null || h.hrvSleep != null || h.spo2Daily != null || h.sleepingHr != null);
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <span className="text-base">🏃</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actividad</h3>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Apple Health · solo contexto</span>
      </div>
      {!has ? (
        <div className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">
          Sin datos de Health para este día. Se actualizan con el atajo del iPhone.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 px-3 pb-2">
            <ActivityMetric label="Pasos" value={h.steps != null ? Number(h.steps).toLocaleString('es-CL') : '—'} />
            <ActivityMetric label="Energía activa" value={h.activeEnergyKcal != null ? `${Math.round(h.activeEnergyKcal)} kcal` : '—'} />
            <ActivityMetric label="Sueño" value={fmtSleepHours(h.sleepHours)} />
          </div>
          {(h.restingHr != null || h.vo2max != null) && (
            <div className="px-4 pb-1.5 text-[11px] text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
              {h.restingHr != null && <span>❤️ FC reposo {Math.round(h.restingHr)} lpm</span>}
              {h.vo2max != null && <span>🫁 VO₂máx {Number(h.vo2max).toFixed(1)}</span>}
            </div>
          )}
          {(h.hrvSleep != null || h.sleepingHr != null || h.spo2Daily != null) && (
            <div className="px-4 pb-3 text-[11px] text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
              {h.hrvSleep != null && <span>🫀 HRV {Math.round(h.hrvSleep)} ms</span>}
              {h.sleepingHr != null && <span>🌙 FC durmiendo {Math.round(h.sleepingHr)} lpm</span>}
              {h.spo2Daily != null && <span>🩸 SpO₂ {Number(h.spo2Daily).toFixed(0)}%</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActivityMetric({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-2 py-2 text-center">
      <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{value}</div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function WaterTracker({ day, onUpdate, target }) {
  const ml = Number(day?.water?.ml) || 0;            // agua que Hugo marca en la app (editable con +/-)
  const bridgeMl = Number(day?.water?.bridgeMl) || 0; // agua registrada por chat (section water[])
  const totalMl = ml + bridgeMl;                      // lo que se MUESTRA y cuenta para la meta
  const targetMl = target || 3000;
  // Cada toque actualiza `water.ml` (optimista, display instantáneo) Y anexa el delta REALMENTE
  // aplicado a `water.log` para que `pushPayload` lo empuje a `bridge.water[]` y cruce a otros
  // dispositivos. El delta aplicado (no el pedido) mantiene water.ml y el bridge en sync en el −250.
  const adjust = (delta) => {
    const nextMl = Math.max(0, ml + delta);
    const applied = nextMl - ml;
    const w = day?.water || {};
    const log = Array.isArray(w.log) ? w.log : [];
    const nextLog = applied !== 0 ? [...log, { id: uuid(), ml: applied, ts: Date.now() }] : log;
    onUpdate({ water: { ...w, ml: nextMl, log: nextLog } });
  };
  const pct = Math.max(0, Math.min(100, Math.round((totalMl / targetMl) * 100)));
  const reached = totalMl >= targetMl;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💧</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Agua</h3>
          <span className={`text-[11px] font-bold ${reached ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'}`}>
            {pct}%
          </span>
          {bridgeMl > 0 && (
            <span className="text-[10px] text-sky-500 dark:text-sky-400" title="Registrada por chat">💬 {bridgeMl} ml</span>
          )}
        </div>
        <span className={`text-xs font-semibold ${reached ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
          {totalMl} / {targetMl} ml
        </span>
      </div>
      <div className="px-4">
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-3">
        <button onClick={() => adjust(250)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+250</button>
        <button onClick={() => adjust(500)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+500</button>
        <button onClick={() => adjust(750)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+750</button>
        <button onClick={() => adjust(-250)} disabled={ml <= 0}
          className="py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:bg-gray-200 disabled:opacity-40">−250</button>
      </div>
    </div>
  );
}

function WorkoutCaptureModal({ apiKey, onClose, onSave }) {
  const [attachments, setAttachments] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [targetDate, setTargetDate] = useState(todayKey()); // a qué día se asigna el entrenamiento

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null); setExtracted(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos (máximo ${MAX_IMAGES}).`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0) return;
    setProcessing(true); setError(null);
    try {
      const data = await extractWorkoutFromImage(attachments, apiKey);
      setExtracted(data);
      // Autodetecta la fecha de la sesión si la captura la trae (y no es futura)
      if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && data.date <= todayKey()) {
        setTargetDate(data.date);
      }
    } catch (err) {
      setError(err.message || 'Error procesando archivos');
    } finally {
      setProcessing(false);
    }
  };

  const isAggregate = extracted?.period && ['7days', '30days', 'month', 'all'].includes(extracted.period);
  const periodLabel = {
    today: 'Hoy', session: 'Sesión', '7days': 'Últimos 7 días', '30days': 'Últimos 30 días', month: 'Mes', all: 'Histórico',
  }[extracted?.period] || extracted?.period;

  const numOrNull = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const exercises = Array.isArray(extracted?.exercises)
    ? extracted.exercises.filter((e) => e && e.name).map((e) => ({
        name: String(e.name).trim(),
        muscle: e.muscle ? String(e.muscle).trim().toLowerCase() : null,
        sets: numOrNull(e.sets),
        reps: e.reps != null ? e.reps : null,
        weightKg: numOrNull(e.weightKg),
        volumeKg: numOrNull(e.volumeKg),
        oneRepMaxKg: numOrNull(e.oneRepMaxKg),
        quality: e.quality ? String(e.quality).trim().toUpperCase().slice(0, 2) : null,
      }))
    : [];
  // Cardio si la IA lo marca, o si trae métricas de cardio sin desglose de fuerza.
  const isCardio = extracted?.type === 'cardio'
    || (exercises.length === 0 && (extracted?.distanceM != null || extracted?.avgPowerW != null || extracted?.avgCadenceRpm != null));
  const canSave = !!extracted && !isAggregate && (extracted.kcal != null || exercises.length > 0 || isCardio);

  const confirm = () => {
    if (!canSave) return;
    const minutesNote = extracted.minutes ? ` · ${extracted.minutes} min` : '';
    // ts ancla a mediodía del día elegido (para entrenamientos pasados ordena bien); hoy usa el reloj
    const ts = targetDate === todayKey() ? Date.now() : new Date(targetDate + 'T12:00:00').getTime();
    const out = {
      id: uuid(),
      ts,
      name: (isCardio ? (extracted.activity || 'Cardio') : 'Entrenamiento Speediance') + minutesNote,
      kcal: extracted.kcal != null ? Number(extracted.kcal) : 0,
      type: isCardio ? 'cardio' : 'strength',
      source: 'photo',
    };
    if (extracted.minutes != null) out.minutes = Number(extracted.minutes);
    if (extracted.volumeKg != null) out.volumeKg = Number(extracted.volumeKg);
    if (exercises.length) out.exercises = exercises;
    if (isCardio) {
      if (extracted.distanceM != null) out.distanceM = Number(extracted.distanceM);
      if (extracted.avgPowerW != null) out.avgPowerW = Number(extracted.avgPowerW);
      if (extracted.avgCadenceRpm != null) out.avgCadenceRpm = Number(extracted.avgCadenceRpm);
      if (extracted.avgHr != null) out.avgHr = Number(extracted.avgHr);
    }
    onSave(out, targetDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📸 Importar entrenamiento</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {attachments.length === 0 ? (
          <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-500">
            <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
            <div className="text-4xl mb-2">📎</div>
            <div className="text-sm font-medium">Subir capturas, PDFs o exportaciones</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Foto · PDF · CSV · JSON · TXT — hasta {MAX_IMAGES} archivos</div>
          </label>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <AttachmentPreview key={i} attachment={a} onRemove={!extracted ? () => removeAttachment(i) : null} />
              ))}
              {!extracted && attachments.length < MAX_IMAGES && (
                <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                  <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                  +
                </label>
              )}
            </div>
            {!extracted && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{attachments.length} / {MAX_IMAGES} archivos</p>
            )}
            {!extracted && (
              <button onClick={handleProcess} disabled={processing || !apiKey}
                className="w-full py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
                {processing ? 'Procesando…' : `Procesar ${attachments.length} archivo${attachments.length === 1 ? '' : 's'} con Claude ✨`}
              </button>
            )}
            {!apiKey && !extracted && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </div>
        )}

        {extracted && (
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Período detectado</span>
                <span className="font-semibold">{periodLabel}</span>
              </div>
              {extracted.kcal != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">🔥 Calorías</span>
                  <span className="text-lg font-bold">{extracted.kcal} <span className="text-xs font-normal">kcal</span></span>
                </div>
              )}
              {extracted.minutes != null && (
                <div className="flex items-center justify-between text-sm">
                  <span>⏱️ Duración</span>
                  <span className="font-semibold">{extracted.minutes} min</span>
                </div>
              )}
              {extracted.volumeKg != null && (
                <div className="flex items-center justify-between text-sm">
                  <span>🏋️ Volumen</span>
                  <span className="font-semibold">{extracted.volumeKg} kg</span>
                </div>
              )}
              {isCardio && (
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">🚴 Cardio{extracted.activity ? ` · ${extracted.activity}` : ''}</span>
                </div>
              )}
              {isCardio && extracted.distanceM != null && (
                <div className="flex items-center justify-between text-sm"><span>📏 Distancia</span><span className="font-semibold">{(extracted.distanceM / 1000).toFixed(2)} km</span></div>
              )}
              {isCardio && extracted.avgPowerW != null && (
                <div className="flex items-center justify-between text-sm"><span>⚡ Potencia prom.</span><span className="font-semibold">{extracted.avgPowerW} W</span></div>
              )}
              {isCardio && extracted.avgCadenceRpm != null && (
                <div className="flex items-center justify-between text-sm"><span>🔄 Cadencia prom.</span><span className="font-semibold">{extracted.avgCadenceRpm} rpm</span></div>
              )}
              {isCardio && extracted.avgHr != null && (
                <div className="flex items-center justify-between text-sm"><span>❤️ FC prom.</span><span className="font-semibold">{extracted.avgHr} lpm</span></div>
              )}
            </div>

            {!isAggregate && (
              <label className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2">
                <span className="text-sm flex items-center gap-1.5">📅 Día del entrenamiento</span>
                <input type="date" value={targetDate} max={todayKey()}
                  onChange={(e) => e.target.value && setTargetDate(e.target.value)}
                  className="text-sm font-semibold bg-transparent focus:outline-none text-right" />
              </label>
            )}
            {!isAggregate && extracted.date && extracted.date !== targetDate && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">La captura sugería {extracted.date}.</p>
            )}

            {exercises.length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {exercises.length} ejercicio{exercises.length === 1 ? '' : 's'} detectado{exercises.length === 1 ? '' : 's'}
                </div>
                {exercises.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-lg shrink-0">{emojiForExercise(e.name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-medium truncate">{e.name}</div>
                        {e.quality && <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">{e.quality}</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {e.muscle ? <span className="uppercase tracking-wide">{e.muscle}</span> : null}
                        {(e.sets != null || e.reps != null) ? ` · ${e.sets ?? '?'}×${e.reps ?? '?'}` : ''}
                        {e.weightKg != null ? ` · ${e.weightKg} kg` : ''}
                        {e.oneRepMaxKg != null ? ` · 1RM ${e.oneRepMaxKg}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isAggregate ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ Esta captura es un resumen de varios días ({periodLabel}). No se puede importar como ejercicio de hoy. Súbeme la captura del día específico o la sesión individual.
              </div>
            ) : (
              <button onClick={confirm} disabled={!canSave}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
                {targetDate === todayKey()
                  ? 'Agregar como ejercicio de hoy'
                  : `Agregar al ${new Date(targetDate + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}`}
              </button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function AddExerciseModal({ apiKey, userWeightKg, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [kcal, setKcal] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null);
  const [error, setError] = useState(null);

  const canEstimate = name.trim().length > 0;

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe la actividad primero.'); return; }
    setEstimating(true); setError(null);
    try {
      const desc = minutes ? `${name.trim()} (${minutes} min)` : name.trim();
      const data = await estimateExerciseKcal({ description: desc, weightKg: userWeightKg, apiKey });
      if (data?.name) setName(String(data.name));
      if (data?.minutes != null) setMinutes(String(Math.round(Number(data.minutes) || 0)));
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k <= 0) {
      setError('Necesitas nombre y kcal > 0.');
      return;
    }
    const finalName = minutes && Number(minutes) > 0 ? `${name.trim()} · ${Number(minutes)} min` : name.trim();
    onSave({
      name: finalName,
      kcal: k,
      source: estimated ? 'haiku-estimate' : 'manual',
    });
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Agregar entrenamiento</h2>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Actividad</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Trote, Pesas, Yoga, Fútbol"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Duración (min) <span className="text-gray-400">(opcional)</span></span>
          <input type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            placeholder="Ej. 30, 60"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
          className="w-full py-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
          {estimating ? 'Estimando…' : '✨ Estimar kcal con Claude'}
        </button>
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para estimar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {!userWeightKg && apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ℹ️ Para estimación más precisa, completa tu peso en el perfil de Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Estimación con confianza {estimated.confidence} · Edita si necesitas
            </span>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías quemadas</span>
          <input type="number" inputMode="numeric" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function ExerciseSection({ day, onUpdate, apiKey, userWeightKg, onSaveToDate }) {
  const [adding, setAdding] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [quickKcal, setQuickKcal] = useState('');
  const items = day.exercise || [];
  const totalBurned = items.reduce((s, x) => s + (Number(x.kcal) || 0), 0);

  const handleQuickAdd = () => {
    const n = Number(quickKcal);
    if (!Number.isFinite(n) || n <= 0) return;
    onUpdate({ exercise: [...items, { id: uuid(), ts: Date.now(), name: 'Entrenamiento', kcal: n }] });
    setQuickKcal('');
  };
  const handleSave = (item) => { onUpdate({ exercise: [...items, { ...item, id: uuid(), ts: Date.now() }] }); setAdding(false); };
  const handleRemove = (id) => { onUpdate({ exercise: items.filter((e) => e.id !== id) }); };
  const handleCaptureSave = (item, date) => {
    // Si el modal eligió otra fecha (entrenamiento pasado), escribe en ese día vía onSaveToDate;
    // si es el día que se está viendo, usa el onUpdate normal.
    if (date && onSaveToDate) onSaveToDate(item, date);
    else onUpdate({ exercise: [...items, { ...item, id: item.id ?? uuid(), ts: item.ts ?? Date.now() }] });
    setCapturing(false);
  };

  const headerExtra = (
    <div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Total rápido del día (pega lo que te marca tu app)</div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number" inputMode="numeric" min="0"
            value={quickKcal} onChange={(e) => setQuickKcal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
            placeholder="0"
            className="w-full px-3 py-2.5 pr-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">kcal</span>
        </div>
        <button type="button" onClick={() => setCapturing(true)}
          className="w-12 h-[42px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg active:scale-95"
          aria-label="Subir captura">📸</button>
        <button type="button" onClick={handleQuickAdd}
          disabled={!quickKcal || Number(quickKcal) <= 0}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          Agregar
        </button>
      </div>
    </div>
  );

  return (
    <>
      <DayItemList title="Ejercicio" icon="🔥" items={items}
        iconForItem={(item) => emojiForExercise(item.name)}
        onAdd={() => setAdding(true)} onRemove={handleRemove}
        addLabel="Agregar con detalle (o estimar con IA)"
        emptyHint="Sin entrenamientos aún"
        totalLabel={totalBurned > 0 ? `🔥 ${totalBurned} kcal` : null}
        headerExtra={headerExtra}
        renderMeta={(item) => (<><span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal quemadas</>)}
      />
      {adding && (
        <AddExerciseModal apiKey={apiKey} userWeightKg={userWeightKg}
          onCancel={() => setAdding(false)} onSave={handleSave} />
      )}
      {capturing && (
        <WorkoutCaptureModal apiKey={apiKey}
          onClose={() => setCapturing(false)}
          onSave={handleCaptureSave} />
      )}
    </>
  );
}

function StreakChip({ streak, onClick }) {
  if (!streak) return null;
  const { current, best, todayMet, todayHasData, lastBrokenDate } = streak;
  if (current === 0 && best === 0) return null;

  if (current > 0) {
    return (
      <button onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-semibold active:scale-95">
        <span>🔥</span>
        <span>{current} día{current === 1 ? '' : 's'} seguido{current === 1 ? '' : 's'}</span>
        {best > current && <span className="text-[10px] font-normal opacity-70">· récord {best}</span>}
      </button>
    );
  }

  // current === 0: si recientemente se rompió, mostrar mensaje suave
  if (best > 0 && lastBrokenDate) {
    return (
      <button onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">
        <span>💫</span>
        <span>Mejor racha: {best} días</span>
      </button>
    );
  }

  return null;
}

function StreakModal({ streak, onClose }) {
  if (!streak) return null;
  const { current, best, lastBrokenDate, todayMet } = streak;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><span>🔥</span>Tu racha</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-orange-50 dark:bg-orange-900/30 p-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-orange-700 dark:text-orange-300">Hoy</div>
            <div className="text-2xl font-bold text-orange-800 dark:text-orange-200">{current}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{current === 1 ? 'día' : 'días'} seguidos</div>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300">Récord</div>
            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{best}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{best === 1 ? 'día' : 'días'} históricos</div>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-sm text-gray-700 dark:text-gray-300">
          {current === 0 && best > 0 && lastBrokenDate && (
            <p>Tu última racha de <span className="font-semibold">{best} días</span> terminó el {lastBrokenDate}. Hoy es nuevo día — vamos.</p>
          )}
          {current > 0 && todayMet && (
            <p>Vas <span className="font-semibold">{current} {current === 1 ? 'día' : 'días'} seguidos</span> cumpliendo kcal en rango y proteína sobre meta. Sigue así.</p>
          )}
          {current === 0 && best === 0 && (
            <p>Aún no tienes racha registrada. Un día cumple cuando tus calorías caen en rango y tu proteína supera el umbral.</p>
          )}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          Un día cumple si: kcal entre {streak.kcalMin || '?'} y {streak.kcalRed || '?'} · proteína ≥ {streak.proteinYellow || '?'}g
        </p>
      </div>
    </div>
  );
}

function HabitNudge({ day, totals, targets, isToday, onUpdate }) {
  if (!isToday) return null;
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const timeMin = hour * 60 + minutes;
  const eaten = day?.eaten || {};
  const dismissed = day?.nudgesDismissed || [];
  const skippedSet = new Set(day?.skipped || []);

  // Una sección registrada como extra (chat/bridge) cuenta como cumplida aunque NO marque
  // eaten: almuerzo/desayuno no setean eaten para no sumar las kcal fantasma del plan fijo
  // (ver mergeBridge/BRIDGE_SLOT_DETECT). Sin esto, el nudge "no marcaste el almuerzo"
  // aparecía pese a tener el almuerzo en REGISTRADO.
  const coveredByExtra = new Set();
  for (const x of (day?.extras || [])) {
    const slot = extraPlanSlot(x);
    if (slot) coveredByExtra.add(slot);
  }
  const isDone = (slot) => !!eaten[slot] || coveredByExtra.has(slot) || skippedSet.has(slot);

  const T = targets || DEFAULT_TARGETS;
  const candidates = [];

  if (timeMin >= 14 * 60 && !isDone('almuerzo')) {
    candidates.push({
      id: 'almuerzo-pendiente',
      icon: '🍚',
      text: 'Aún no marcaste el almuerzo de hoy.',
      action: 'Marcar como comido',
      onAction: () => onUpdate({ eaten: { ...eaten, almuerzo: true } }),
    });
  }
  if (timeMin >= 16 * 60 && totals.waterMl < T.waterTarget * 0.4) {
    candidates.push({
      id: 'agua-baja',
      icon: '💧',
      text: `Vas ${totals.waterMl} de ${T.waterTarget} ml de agua. Hidrátate.`,
      action: '+500 ml',
      onAction: () => onUpdate({ water: { ...(day?.water || {}), ml: (day?.water?.ml || 0) + 500 } }),
    });
  }
  if (timeMin >= 20 * 60 && totals.proteinRemaining > 40 && !skippedSet.has('cena')) {
    candidates.push({
      id: 'proteina-baja',
      icon: '🥩',
      text: `Te faltan ${Math.round(totals.proteinRemaining)}g de proteína para meta.`,
      action: null,
    });
  }
  if (timeMin >= 22 * 60 && !isDone('cena')) {
    candidates.push({
      id: 'cena-pendiente',
      icon: '🍽️',
      text: 'No marcaste cena. ¿Cenaste ya o la saltaste?',
      action: 'No cené hoy',
      onAction: () => onUpdate({ skipped: [...(day?.skipped || []), 'cena'] }),
    });
  }

  const active = candidates.find((c) => !dismissed.includes(c.id));
  if (!active) return null;

  const dismiss = () => onUpdate({ nudgesDismissed: [...dismissed, active.id] });

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-start gap-3">
      <span className="text-2xl shrink-0">{active.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-900 dark:text-amber-100">{active.text}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {active.action && active.onAction && (
            <button onClick={() => { active.onAction(); dismiss(); }}
              className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">
              {active.action}
            </button>
          )}
          <button onClick={dismiss}
            className="px-3 py-1 rounded-full bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-medium">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({ comparison }) {
  if (!comparison || (!comparison.weekAgo && !comparison.monthAgo)) return null;

  const renderDelta = (delta, unit = '', invertColors = false) => {
    if (delta == null) return null;
    const positive = delta > 0;
    const negative = delta < 0;
    const greenWhenNegative = invertColors; // para kcal: subir = "rojo"; bajar = "verde"
    const tone = positive
      ? (greenWhenNegative ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')
      : negative
      ? (greenWhenNegative ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
      : 'text-gray-500 dark:text-gray-400';
    return (
      <span className={`text-xs font-semibold ${tone}`}>
        {positive ? '↑' : negative ? '↓' : '='}{Math.abs(delta)}{unit}
      </span>
    );
  };

  const block = (label, entry) => {
    if (!entry) return null;
    return (
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">kcal {renderDelta(entry.kcalDelta, ' kcal', true)}</span>
          <span className="text-gray-600 dark:text-gray-400">prot {renderDelta(entry.proteinDelta, 'g')}</span>
          {entry.kgDelta != null && (
            <span className="text-gray-600 dark:text-gray-400">peso {renderDelta(entry.kgDelta, ' kg', true)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Comparación</h3>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {block('Vs. hace 7 días', comparison.weekAgo)}
        {block('Vs. hace 28 días', comparison.monthAgo)}
      </div>
    </div>
  );
}

function RecentsRow({ recents, onPick }) {
  if (!recents.length) return null;
  return (
    <div>
      <SectionHeader title="Recientes" hint="Tap para agregarlo como extra del día" />
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {recents.map((r, i) => (
            <button key={i} onClick={() => onPick(r)}
              className="shrink-0 px-3 py-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-emerald-400 active:scale-[0.97]">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{emojiForFood(r.name)}</span>
                <span className="text-xs font-medium max-w-[140px] truncate">{r.name}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                {r.kcal} kcal · {r.protein}g P · ×{r.count}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TodayView({ state, setState, dateKey, setDateKey, targets, onAddMealCapture, onAddSubstitution, onCoach }) {
  const todayReal = todayKey();
  const today = dateKey;
  const isToday = dateKey === todayReal;
  const dateObj = new Date(today + 'T12:00:00');
  const dow = dateObj.getDay();
  const dayName = DAY_NAMES[dow];
  const day = state.days[today] || {};
  const eaten = day.eaten || {};
  const dateInputRef = React.useRef(null);

  const updateDay = useCallback((patch) => {
    setState((prev) => {
      const prevDay = prev.days[today] || {};
      // Detectar extras/ejercicio que el patch ELIMINA, para (1) avisarle al bridge y (2)
      // anotarlos en removedBridgeIds, así mergeBridge no los reimporta. POST idempotente.
      const removed = [];
      if (Array.isArray(patch.extras)) {
        const keep = new Set(patch.extras.map((e) => e && e.id));
        for (const e of (prevDay.extras || [])) if (e && e.id != null && !keep.has(e.id)) removed.push(['meals', e.id]);
      }
      if (Array.isArray(patch.exercise)) {
        const keep = new Set(patch.exercise.map((e) => e && e.id));
        for (const e of (prevDay.exercise || [])) if (e && e.id != null && !keep.has(e.id)) removed.push(['workouts', e.id]);
      }
      let bridge = prev.bridge;
      if (removed.length) {
        for (const [section, id] of removed) postBridgeDelete(prev.settings, section, id);
        const rb = new Set([...(prev.bridge?.removedBridgeIds || []), ...removed.map((r) => r[1])]);
        bridge = { ...(prev.bridge || {}), removedBridgeIds: [...rb] };
      }
      return { ...prev, bridge, days: { ...prev.days, [today]: { ...prevDay, ...patch } } };
    });
  }, [setState, today]);

  // Alimentos registrados (bridge/captura) asignados a una sección del plan, para mostrarlos
  // dentro de su sección con "📝 Registrado". Quitar uno lo borra de day.extras.
  const dayExtras = day.extras || [];
  const desayunoExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'desayuno');
  const almuerzoExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'almuerzo');
  const colacion1Extras = dayExtras.filter((x) => extraSlotBucket(x) === 'colacion1');
  const colacion2Extras = dayExtras.filter((x) => extraSlotBucket(x) === 'colacion2');
  const cenaExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'cena');
  const removeSlotExtra = (slot, id) => {
    const target = dayExtras.find((e) => e.id === id);
    const nextExtras = dayExtras.filter((e) => e.id !== id);
    const patch = { extras: nextExtras };
    // Solo colaciones/cena marcan el slot como cumplido vía eaten; al quedar vacío y sin pick
    // de banco, se vuelve a marcar pendiente. Desayuno/almuerzo no tocan eaten.
    if (slot === 'colacion1' || slot === 'colacion2' || slot === 'cena') {
      const stillHasSlot = nextExtras.some((e) => extraSlotBucket(e) === slot);
      const bankPick = slot === 'colacion1' ? day.snackId1 : slot === 'colacion2' ? day.snackId2 : day.proteinId;
      if (!stillHasSlot && !bankPick) patch.eaten = { ...(day.eaten || {}), [slot]: false };
    }
    updateDay(patch);
    if (target) setUndoItem({ ...target });
  };

  // Edita una comida ya registrada en su sitio (mismo slot/source, nuevos macros/nombre).
  const editExtra = (id, patch) => {
    const cur = day.extras || [];
    updateDay({ extras: cur.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  // Restaura el último extra borrado (id nuevo). Reinstaura el eaten de colación/cena.
  const restoreUndo = () => {
    if (!undoItem) return;
    const { id, ...rest } = undoItem;
    const slot = extraSlotBucket(rest);
    const cur = day.extras || [];
    const patch = { extras: [...cur, { ...rest, id: uuid() }] };
    if (slot === 'colacion1' || slot === 'colacion2' || slot === 'cena') patch.eaten = { ...(day.eaten || {}), [slot]: true };
    updateDay(patch);
    setUndoItem(null);
  };

  // Enforcement de reglas: acumula violaciones, muestra modal único si hay
  const [pendingViolation, setPendingViolation] = useState(null);
  const [suggestSlot, setSuggestSlot] = useState(null); // 'snack' | 'dinner' | 'dessert_almuerzo' | 'dessert_cena' | null
  const [snackSuggestTarget, setSnackSuggestTarget] = useState('colacion1'); // a qué colación va la sugerencia 'snack'
  const [bankPicker, setBankPicker] = useState(null); // 'colacion1' | 'colacion2' | 'cena' | null — picker manual del banco

  const handleSuggestionSelected = (item) => {
    const slot = suggestSlot;
    setSuggestSlot(null);
    if (!slot || !item?.id) return;
    // Elegir desde "¿Qué como?" registra en un toque (queda marcado como comido).
    if (slot === 'snack') pickForSlot(snackSuggestTarget, item.id);
    else if (slot === 'dinner') pickForSlot('cena', item.id);
  };
  const tryWithRules = useCallback((actions, ctxExtra, doAction) => {
    const actionList = Array.isArray(actions) ? actions : [actions];
    const allViolations = [];
    const seen = new Set();
    for (const action of actionList) {
      const vs = evaluateAllRules(state, action, { dateKey: today, targets, ...ctxExtra });
      for (const v of vs) {
        if (!seen.has(v.rule.id)) {
          seen.add(v.rule.id);
          allViolations.push(v);
        }
      }
    }
    if (allViolations.length === 0) { doAction(); return; }
    setPendingViolation({ violations: allViolations, onConfirm: doAction });
  }, [state, today, targets]);

  // ── Registro rápido: recientes + favoritos de un toque ────────────────────────
  const favorites = useMemo(() => (Array.isArray(state.favorites) ? state.favorites : []), [state.favorites]);
  const favKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites]);
  const recents = useMemo(() => computeRecents(state.days || {}, 12), [state.days]);
  const bankNames = useMemo(() => new Set([
    ...(state.snackBank || []),
    ...(state.proteinBank || []),
    ...(state.dessertBank || []),
  ].map((b) => normalizeName(b.name))), [state.snackBank, state.proteinBank, state.dessertBank]);

  // Re-loguea un ítem (reciente o favorito) como extra de hoy, de un toque. id/ts FRESCOS en
  // cada registro (nunca reusar: rompería el dedup del bridge y el guard multi-pestaña). Rutea
  // por las MISMAS reglas que el modal vía tryWithRules.
  const quickLogExtra = (item) => {
    const tagSet = new Set(item.tags || []);
    const actions = ['add_extra'];
    if (tagSet.has('dulce')) actions.push('add_dulce');
    if (tagSet.has('delivery')) actions.push('add_delivery');
    if (tagSet.has('alcohol')) actions.push('add_alcohol');
    const doSave = () => updateDay({
      extras: [...(day.extras || []), {
        name: item.name,
        kcal: Number(item.kcal) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        fiber: Number(item.fiber) || 0,
        tags: Array.isArray(item.tags) && item.tags.length ? item.tags.slice() : undefined,
        barcode: item.barcode || undefined,
        per100: item.per100 || undefined,
        portion: item.portion || undefined,
        source: 'quicklog',
        id: uuid(),
        ts: Date.now(),
      }],
    });
    tryWithRules(actions, { prospectiveKcal: Number(item.kcal) || 0 }, doSave);
  };

  // Marca/desmarca un alimento como favorito (estado global, persiste entre días). Keyed por
  // normalizeName para coincidir con computeRecents y el dedup.
  const toggleFavorite = (item) => {
    setState((prev) => {
      const key = normalizeName(item.name);
      if (!key) return prev;
      const list = Array.isArray(prev.favorites) ? prev.favorites : [];
      if (list.some((f) => f.key === key)) {
        return { ...prev, favorites: list.filter((f) => f.key !== key) };
      }
      return { ...prev, favorites: [...list, {
        key,
        name: item.name,
        kcal: Number(item.kcal) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        fiber: Number(item.fiber) || 0,
        barcode: item.barcode || undefined,
        per100: item.per100 || undefined,
        portion: item.portion || undefined,
        source: item.source || 'manual',
        addedAt: Date.now(),
      }] };
    });
  };

  const toggleEaten = (key) => {
    const cur = day.eaten || {};
    updateDay({ eaten: { ...cur, [key]: !cur[key] } });
  };

  // Guarda un alimento reusable en la biblioteca (state.foods). Acepta un Food ya armado o un
  // registro/resultado a promover (mealItemToFood). Dedup por nombre/código en upsertFood.
  const saveFood = (foodOrExtra) => {
    if (!foodOrExtra) return;
    const food = foodOrExtra.per100 && foodOrExtra.per100.kcal != null && foodOrExtra.key
      ? foodOrExtra
      : mealItemToFood(foodOrExtra);
    if (!food || !food.name) return;
    setState((prev) => {
      const key = food.key || normalizeName(food.name);
      const removed = new Set((prev.bridge?.removedFoodKeys) || []);
      removed.delete(key); // re-agregar des-veta (ver removedFoodKeys / mergeBridge)
      return { ...prev, foods: upsertFood(prev.foods || [], food), bridge: { ...(prev.bridge || {}), removedFoodKeys: [...removed] } };
    });
  };

  // Agrega un ítem custom al antojo (persiste en state, disponible todos los días)
  const addAntojoItem = ({ label, kcal, protein, carbs, fat, fiber }) => {
    setState((prev) => {
      const list = Array.isArray(prev.antojoCustomItems) ? [...prev.antojoCustomItems] : [];
      list.push({
        id: 'custom-' + uuid(),
        label: String(label || '').trim() || 'Ítem',
        kcal:    Number(kcal)    || 0,
        protein: Number(protein) || 0,
        carbs:   Number(carbs)   || 0,
        fat:     Number(fat)     || 0,
        fiber:   Number(fiber)   || 0,
        custom: true,
      });
      return { ...prev, antojoCustomItems: list };
    });
  };

  // Elimina un ítem custom del antojo (también limpia ticks históricos sobre ese id)
  const removeAntojoItem = (itemId) => {
    setState((prev) => {
      const list = (prev.antojoCustomItems || []).filter((it) => it.id !== itemId);
      const days = { ...(prev.days || {}) };
      for (const k of Object.keys(days)) {
        const d = days[k];
        if (d?.eatenItems?.antojo && Object.prototype.hasOwnProperty.call(d.eatenItems.antojo, itemId)) {
          const antojoTicks = { ...d.eatenItems.antojo };
          delete antojoTicks[itemId];
          days[k] = { ...d, eatenItems: { ...d.eatenItems, antojo: antojoTicks } };
        }
      }
      return { ...prev, antojoCustomItems: list, days };
    });
  };

  const selectSnack = (slot, id) => {
    const idKey = slot === 'colacion2' ? 'snackId2' : 'snackId1';
    const same = day[idKey] === id;
    const cur = day.eaten || {};
    const skippedNow = (day.skipped || []).filter((s) => s !== slot);
    const doSelect = () => updateDay({ [idKey]: same ? null : id, eaten: { ...cur, [slot]: false }, skipped: skippedNow });
    if (same) { doSelect(); return; }
    const snack = (state.snackBank || []).find((s) => s.id === id);
    if (isItemDulce(snack, 'snack')) {
      tryWithRules(['add_dulce'], {}, doSelect);
    } else {
      doSelect();
    }
  };

  const selectDinner = (id) => {
    const same = day.proteinId === id;
    const cur = day.eaten || {};
    const skippedNow = (day.skipped || []).filter((s) => s !== 'cena');
    updateDay({ proteinId: same ? null : id, eaten: { ...cur, cena: false }, skipped: skippedNow });
  };

  // Elige un ítem del banco para una toma (colación/cena) Y lo marca como comido en el mismo
  // toque ("ir registrando"). A diferencia de selectSnack/selectDinner (que dejan eaten=false
  // para el flujo "planear y luego marcar"), aquí registra de inmediato. Pasa por las reglas
  // de dulces igual que selectSnack.
  const pickForSlot = (slot, id) => {
    const cur = day.eaten || {};
    const skippedNow = (day.skipped || []).filter((s) => s !== slot);
    if (slot === 'cena') {
      updateDay({ proteinId: id, eaten: { ...cur, cena: true }, skipped: skippedNow });
      return;
    }
    const idKey = slot === 'colacion2' ? 'snackId2' : 'snackId1';
    const doPick = () => updateDay({ [idKey]: id, eaten: { ...cur, [slot]: true }, skipped: skippedNow });
    const snack = (state.snackBank || []).find((s) => s.id === id);
    if (isItemDulce(snack, 'snack')) tryWithRules(['add_dulce'], {}, doPick);
    else doPick();
  };

  const skippedSet = new Set(day.skipped || []);

  const toggleSkipped = (slot) => {
    const list = Array.isArray(day.skipped) ? [...day.skipped] : [];
    const cur = day.eaten || {};
    const newEaten = { ...cur };
    let newSkipped;
    if (list.includes(slot)) {
      newSkipped = list.filter((s) => s !== slot);
    } else {
      newSkipped = [...list, slot];
      // Si se salta, deshacer "comido"
      newEaten[slot] = false;
    }
    const patch = { skipped: newSkipped, eaten: newEaten };
    // Si se salta colación/cena, también limpiar selección del banco
    if (slot === 'colacion1' && !list.includes(slot)) patch.snackId1 = null;
    if (slot === 'colacion2' && !list.includes(slot)) patch.snackId2 = null;
    if (slot === 'cena' && !list.includes(slot)) patch.proteinId = null;
    // Si se salta un meal fijo (desayuno/almuerzo), limpiar sus ticks de ítems
    if (!list.includes(slot) && FIXED_MEALS.some((m) => m.id === slot)) {
      const items = { ...(day.eatenItems || {}) };
      items[slot] = {};
      patch.eatenItems = items;
    }
    updateDay(patch);
  };

  const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);

  // Render de un slot fijo (desayuno/almuerzo) ya sin ítems predeterminados: solo encabezado,
  // el toggle "no comí" y lo que Hugo registró por chat en ese slot. Lo demás se loguea con el
  // botón 📷 Foto · Voz · Texto de arriba.
  const renderFixedSlot = (slot, label, time, slotExtras) => {
    const isSkipped = skippedSet.has(slot);
    return (
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title={`${label} · ${time}`}
            hint={isSkipped ? `🚫 Hoy no comí ${label.toLowerCase()}` : 'Registra con 📷 Foto · Voz · Texto'} />
          <button onClick={() => toggleSkipped(slot)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              isSkipped
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>
            {isSkipped ? '↩️ Deshacer' : '🚫 No comí'}
          </button>
        </div>
        {!isSkipped && (
          <SlotLoggedItems items={slotExtras} onRemove={(id) => removeSlotExtra(slot, id)} onEdit={setEditTarget}
            onToggleFav={toggleFavorite} favKeys={favKeys} />
        )}
      </div>
    );
  };

  // Render de una colación (1 ó 2). Las aptas para llevar van primero; el resto del banco,
  // bajo un separador. requireNoRefrig exige también 'sin-refrigeración' (colación 2 a las 18h,
  // sin nevera). El picker escribe en snackId1/snackId2 y eaten.colacion1/colacion2.
  const renderColacion = (slot, label, time, requireNoRefrig, slotExtras) => {
    const idKey = slot === 'colacion2' ? 'snackId2' : 'snackId1';
    const isSkipped = skippedSet.has(slot);
    const reqLabel = requireNoRefrig ? 'transportable · sin refrigeración' : 'transportable';
    const selectedItem = (state.snackBank || []).find((s) => s.id === day[idKey]);
    return (
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title={`${label} · ${time}`} hint={isSkipped ? `🚫 Hoy no tomé ${label.toLowerCase()}` : `Para llevar (${reqLabel})`} />
          <div className="flex items-center gap-1.5">
            {!isSkipped && (
              <>
                <button onClick={() => setBankPicker(slot)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                  📋 Ver banco
                </button>
                <button onClick={() => { setSnackSuggestTarget(slot); setSuggestSlot('snack'); }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
                  🤔 ¿Qué como?
                </button>
              </>
            )}
            <button onClick={() => toggleSkipped(slot)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                isSkipped
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {isSkipped ? '↩️ Deshacer' : '🚫 No comí'}
            </button>
          </div>
        </div>
        {!isSkipped && (
          selectedItem ? (
            <SelectableCard item={selectedItem}
              selected
              eaten={!!eaten[slot]}
              onClick={() => setBankPicker(slot)}
              onToggleEaten={() => toggleEaten(slot)}
              showCategory targets={targets} />
          ) : (
            <button onClick={() => setBankPicker(slot)}
              className="w-full rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-400 dark:text-gray-500 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              + Elige del banco o usa 🤔 ¿Qué como?
            </button>
          )
        )}
        {!isSkipped && (
          <SlotLoggedItems items={slotExtras} onRemove={(id) => removeSlotExtra(slot, id)} onEdit={setEditTarget}
            onToggleFav={toggleFavorite} favKeys={favKeys} />
        )}
      </div>
    );
  };

  const streak = useMemo(
    () => {
      const base = computeStreak(state.days || {}, state.snackBank, state.proteinBank, targets, today, state.dessertBank, state.antojoCustomItems || []);
      return {
        ...base,
        kcalMin: targets?.kcalMin,
        kcalRed: targets?.kcalRed,
        proteinYellow: targets?.proteinYellow,
      };
    },
    [state.days, state.snackBank, state.proteinBank, targets, today]
  );

  const comparison = useMemo(
    () => computeComparison(state, today, targets),
    [state, today, targets]
  );

  const [showStreakModal, setShowStreakModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // extra en edición | null
  const [undoItem, setUndoItem] = useState(null); // último extra borrado, para deshacer

  // El toast de "deshacer" se autodescarta a los 6s.
  useEffect(() => {
    if (!undoItem) return;
    const t = setTimeout(() => setUndoItem(null), 6000);
    return () => clearTimeout(t);
  }, [undoItem]);

  return (
    <>
      <BentoTodayHero totals={totals} targets={targets} streak={streak} onStreakClick={() => setShowStreakModal(true)} weightSeries={state.weights} state={state} />
      {showStreakModal && <StreakModal streak={streak} onClose={() => setShowStreakModal(false)} />}
      {pendingViolation && (
        <RuleViolationModal
          violations={pendingViolation.violations}
          onConfirm={() => { pendingViolation.onConfirm(); setPendingViolation(null); }}
          onCancel={() => setPendingViolation(null)}
        />
      )}
      {suggestSlot && (
        <SuggestSlotModal
          slot={suggestSlot}
          state={state}
          targets={targets}
          onSelect={handleSuggestionSelected}
          onClose={() => setSuggestSlot(null)}
        />
      )}
      {bankPicker && (
        <BankPickerModal
          kind={bankPicker}
          state={state}
          targets={targets}
          onSelect={(id) => { pickForSlot(bankPicker, id); setBankPicker(null); }}
          onClose={() => setBankPicker(null)}
        />
      )}
      {editTarget && (
        <LoggedItemModal initial={editTarget}
          onCancel={() => setEditTarget(null)}
          onSave={(patch) => { editExtra(editTarget.id, patch); setEditTarget(null); }} />
      )}
      {undoItem && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-900 dark:bg-gray-800 text-white shadow-xl border border-gray-700 max-w-md w-full">
            <span className="text-sm flex-1 truncate">Borraste «{undoItem.name}»</span>
            <button onClick={restoreUndo} className="shrink-0 text-sm font-bold text-emerald-400 hover:text-emerald-300">Deshacer</button>
            <button onClick={() => setUndoItem(null)} aria-label="Cerrar" className="shrink-0 text-gray-400 hover:text-white">✕</button>
          </div>
        </div>
      )}
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <button onClick={() => setDateKey(shiftDate(today, -1))}
            className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-lg active:scale-95"
            aria-label="Día anterior">◀</button>
          <button onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
            className="flex-1 text-center font-semibold text-sm py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {formatDateLabel(today, todayReal)}
          </button>
          <input ref={dateInputRef} type="date" value={today} max={todayReal}
            onChange={(e) => e.target.value && setDateKey(e.target.value)}
            className="absolute opacity-0 w-0 h-0 pointer-events-none" />
          <button onClick={() => setDateKey(shiftDate(today, 1))}
            disabled={today >= todayReal}
            className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            aria-label="Día siguiente">▶</button>
          {!isToday && (
            <button onClick={() => setDateKey(todayReal)}
              className="px-3 h-10 rounded-full bg-emerald-500 text-white font-semibold text-xs">Hoy</button>
          )}
        </div>
        {!isToday && (
          <div className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
            📅 Viendo día pasado · editable
          </div>
        )}
        <div className="px-1">
          <h1 className="text-2xl font-bold tracking-tight">{dayName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {dateObj.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {isToday && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tap en cada comida para marcarla como comida ✓</p>
          )}
        </div>

        <HabitNudge day={day} totals={totals} targets={targets} isToday={isToday} onUpdate={updateDay} />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onAddMealCapture}
            className="py-3 rounded-2xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 flex items-center justify-center gap-1.5 shadow-sm">
            <span className="text-base">📷</span>
            <span>Foto · Voz · Texto</span>
          </button>
          <button onClick={onAddSubstitution}
            className="py-3 rounded-2xl bg-white dark:bg-gray-900 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-center gap-1.5">
            <span className="text-base">🔄</span>
            <span>¿Qué puedo comer?</span>
          </button>
        </div>

        {onCoach && (
          <button onClick={onCoach}
            className="w-full py-2.5 rounded-2xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 flex items-center justify-center gap-2">
            <span>💬</span>
            <span>Pregunta al coach</span>
          </button>
        )}

        <ComparisonCard comparison={comparison} />

        <RuleChips state={state} dateKey={today} targets={targets} />

        <WaterTracker day={day} onUpdate={updateDay} target={targets?.waterTarget || 3000} />

        <ActivityCard day={day} />

        {renderFixedSlot('desayuno', 'Desayuno', '08:00', desayunoExtras)}
        {renderColacion('colacion1', 'Colación 1', '11:00', false, colacion1Extras)}
        {renderFixedSlot('almuerzo', 'Almuerzo', '13:30', almuerzoExtras)}
        {renderColacion('colacion2', 'Colación 2', '18:00', true, colacion2Extras)}
        <div>
          <div className="flex items-end justify-between mb-1">
            <SectionHeader title="Cena" hint={skippedSet.has('cena') ? '🚫 Hoy no cené' : 'Proteína + ensalada/verduras (sin arroz)'} />
            <div className="flex items-center gap-1.5">
              {!skippedSet.has('cena') && (
                <>
                  <button onClick={() => setBankPicker('cena')}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                    📋 Ver banco
                  </button>
                  <button onClick={() => setSuggestSlot('dinner')}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
                    🤔 ¿Qué como?
                  </button>
                </>
              )}
              <button onClick={() => toggleSkipped('cena')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                skippedSet.has('cena')
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {skippedSet.has('cena') ? '↩️ Deshacer' : '🚫 No comí'}
            </button>
            </div>
          </div>
          {!skippedSet.has('cena') && (() => {
            const selectedProtein = (state.proteinBank || []).find((p) => p.id === day.proteinId);
            return selectedProtein ? (
              <SelectableCard item={selectedProtein}
                selected
                eaten={!!eaten.cena}
                onClick={() => setBankPicker('cena')}
                onToggleEaten={() => toggleEaten('cena')}
                targets={targets} />
            ) : (
              <button onClick={() => setBankPicker('cena')}
                className="w-full rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-400 dark:text-gray-500 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                + Elige del banco o usa 🤔 ¿Qué como?
              </button>
            );
          })()}
          {!skippedSet.has('cena') && (
            <SlotLoggedItems items={cenaExtras} onRemove={(id) => removeSlotExtra('cena', id)} onEdit={setEditTarget}
              onToggleFav={toggleFavorite} favKeys={favKeys} />
          )}
        </div>
        <QuickLogCard recents={recents} favorites={favorites} bankNames={bankNames} favKeys={favKeys}
          onQuickLog={quickLogExtra} onToggleFav={toggleFavorite} />
        <ExtrasSection day={day} onUpdate={updateDay} apiKey={state.settings?.anthropicApiKey} tryWithRules={tryWithRules}
          foods={state.foods} onSaveFood={saveFood}
          onRemoveExtra={(id) => removeSlotExtra('extra', id)} onEditExtra={setEditTarget} />
        <ExerciseSection day={day} onUpdate={updateDay} apiKey={state.settings?.anthropicApiKey} userWeightKg={state.userProfile?.weightKg}
          onSaveToDate={(item, date) => setState((prev) => {
            const d = prev.days[date] || {};
            const ex = Array.isArray(d.exercise) ? d.exercise : [];
            return { ...prev, days: { ...prev.days, [date]: { ...d, exercise: [...ex, { ...item, id: item.id ?? uuid(), ts: item.ts ?? Date.now() }] } } };
          })} />
        <DailyNotesCard day={day} onUpdate={updateDay} />
      </div>
    </>
  );
}

function WeeklyAnalysisCard({ state, setState, weekKey, rows, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const cached = state.aiCache?.weekly?.[weekKey];
  const weekRefKey = rows[0]?.key;
  const lossSig = useMemo(() => {
    const lr = computeWeeklyLossRate(state.weights || [], weekRefKey);
    return lr ? lr.pctPerWeek.toFixed(2) : 'na';
  }, [state.weights, weekRefKey]);
  const sig = useMemo(() => hashSig({
    v: 2, // bump: ahora el análisis usa kcalIn bruto (no neto) — invalida cachés con el doble descuento
    rows: rows.map((r) => ({
      k: r.key,
      kcal: Math.round(r.totals.kcalIn),
      p: Math.round(r.totals.protein),
      c: Math.round(r.totals.carbs),
      f: Math.round(r.totals.fat),
      fi: Math.round(r.totals.fiber),
      w: Math.round(r.totals.waterMl),
      burn: Math.round(r.totals.kcalBurned),
      eaten: !!r.totals.eatenAny,
    })),
    loss: lossSig,
  }), [rows, lossSig]);
  const isStale = cached && cached.sig !== sig;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);

  const hasData = rows.some((r) => r.totals.eatenAny);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!hasData) { setError('Aún no hay datos suficientes en la semana.'); return; }
    setLoading(true); setError(null);
    try {
      const T = targets || DEFAULT_TARGETS;
      const weights = (state.weights || []).filter((w) => w.weightKg != null && rows.some((r) => r.key === w.date));
      const compactRows = rows.map((r) => ({
        fecha: r.key,
        dia: r.label,
        // kcal_consumidas = comida BRUTA (sin restar ejercicio). Es lo que se compara contra el
        // rango de la meta, porque el TDEE adaptativo ya descuenta la actividad. Restar el
        // ejercicio aquí lo contaría dos veces (ver kcalNet en computeDayTotals).
        kcal_consumidas: Math.round(r.totals.kcalIn),
        proteina: Math.round(r.totals.protein),
        carbos: Math.round(r.totals.carbs),
        grasas: Math.round(r.totals.fat),
        fibra: Math.round(r.totals.fiber),
        agua_ml: Math.round(r.totals.waterMl),
        ejercicio_kcal: Math.round(r.totals.kcalBurned),
        registrado: r.totals.eatenAny,
      }));

      const lossRate = computeWeeklyLossRate(state.weights || [], weekRefKey);
      const lossLine = lossRate
        ? `TASA DE PÉRDIDA SEMANAL (peso prom. esta semana ${lossRate.curr.toFixed(1)} kg vs semana anterior ${lossRate.prev.toFixed(1)} kg): ${lossRate.deltaKg <= 0 ? '−' : '+'}${Math.abs(lossRate.deltaKg).toFixed(2)} kg = ${lossRate.pctPerWeek.toFixed(2)} %/sem.`
        : 'TASA DE PÉRDIDA SEMANAL: sin datos de peso en ambas semanas para calcularla.';

      const prompt = `Eres el coach nutricional de Hugo (geriatra chileno). Analiza su SEMANA de lunes a sábado. Sé directo, sin alarmismo. USA TUTEO CHILENO (tú, tienes). NO uses voseo argentino.

METAS DIARIAS:
- Calorías: ${T.kcalMin}-${T.kcalMax} kcal (rojo sobre ${T.kcalRed})
- Proteína: ≥ ${T.proteinMin} g (piso innegociable en déficit)
- Carbos: ${T.carbsTarget} g · Grasas: ${T.fatTarget} g · Fibra: ${T.fiberTarget} g
- Agua: ${T.waterTarget} ml
- Distribución proteica: ≥${PROTEIN_DIST.minTomas} tomas/día de ≥${PROTEIN_DIST.minPerToma} g c/u, sin brechas >${PROTEIN_DIST.maxGapHours} h. En días de entrenamiento, toma pre-sueño de 30-40 g (caseína/proteína lenta).

PROGRESO POR TASA DE PÉRDIDA SEMANAL (no por déficit fijo). Rango objetivo: ${WEEKLY_LOSS.minPct}-${WEEKLY_LOSS.maxPct} %/sem (~0.55-0.75 kg/sem):
- >${WEEKLY_LOSS.fastPct} %/sem → "pérdida demasiado rápida, riesgo de masa magra": sugiere SUBIR ~100-150 kcal.
- <${WEEKLY_LOSS.slowPct} %/sem por 2 semanas → sugiere EXTENDER la duración del cardio (NO agregar días ni recortar más calorías).
${lossLine}

SEMANA (cada día: "kcal_consumidas" = comida ingerida, YA es el número a comparar contra el rango de la meta; "ejercicio_kcal" es solo contexto informativo):
${JSON.stringify(compactRows, null, 2)}

IMPORTANTE: para evaluar el cumplimiento calórico y el déficit usa SIEMPRE "kcal_consumidas" tal cual. NO le restes "ejercicio_kcal" — el TDEE y el rango de la meta ya incorporan la actividad, así que restar el ejercicio sería contarlo dos veces e inflar el déficit.

${weights.length ? `PESOS DE LA SEMANA: ${JSON.stringify(weights.map(w => ({ fecha: w.date, kg: w.weightKg })))}` : 'Sin mediciones de peso esta semana.'}

Devuelve un análisis en PROSA (texto corrido, no JSON), de 3 a 4 párrafos:
1. Cumplimiento general (kcal, proteína ≥${T.proteinMin} g, agua) — qué se cumplió, qué no.
2. Patrones de la semana: día(s) que se desviaron, día(s) que cumpliste mejor.
3. Tasa de pérdida semanal: ubícala en el rango ${WEEKLY_LOSS.minPct}-${WEEKLY_LOSS.maxPct} %/sem y aplica la recomendación correspondiente (subir kcal si >${WEEKLY_LOSS.fastPct} %, extender cardio si lenta). Grasa visceral es la prioridad #1.
4. 1-2 recomendaciones concretas para la próxima semana.

Tono: conversado, cercano, sin culpa. Máximo ~250 palabras totales. No uses listas ni viñetas, prosa fluida.`;

      const text = await askClaude(prompt, apiKey, 1024, MODEL_CHEAP);
      setResponse(text);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          weekly: {
            ...(prev.aiCache?.weekly || {}),
            [weekKey]: { sig, response: text, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><span>✨</span>Análisis de la semana</h3>
        {(response || cached) && (
          <button onClick={generate} disabled={loading}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {loading ? 'Generando…' : (isStale ? 'Actualizar' : 'Regenerar')}
          </button>
        )}
      </div>
      {!response && !cached && !loading && (
        <button onClick={generate} disabled={!hasData || !apiKey}
          className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          Generar análisis con Claude
        </button>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400 italic">Pensando…</div>}
      {!apiKey && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
          ⚠️ Configura tu API key en ⚙️ Ajustes primero.
        </p>
      )}
      {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      {(response || cached?.response) && !loading && (
        <div className="space-y-2">
          {isStale && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
              ⚠️ Los datos cambiaron desde que se generó. Considera actualizar.
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
            {response || cached.response}
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Generado {cached?.generatedAt ? new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'recién'}
          </p>
        </div>
      )}
    </div>
  );
}


function WeekView({ state, setState, onSelectDay, targets }) {
  const weekKeys = useMemo(() => getWeekKeys(), []);
  const weekKey = useMemo(() => getISOWeekKey(), []);
  const rows = weekKeys.map((key) => {
    const day = state.days[key];
    const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);
    const d = new Date(key + 'T12:00:00');
    return { key, label: DAY_SHORT[d.getDay()], dateStr: `${d.getDate()}/${d.getMonth() + 1}`, day, totals, isToday: key === todayKey() };
  });

  const completedRows = rows.filter((r) => r.totals.hasSnack && r.totals.hasDinner);
  const avgKcal = completedRows.length ? Math.round(completedRows.reduce((s, r) => s + r.totals.kcal, 0) / completedRows.length) : 0;
  const avgProtein = completedRows.length ? Math.round(completedRows.reduce((s, r) => s + r.totals.protein, 0) / completedRows.length) : 0;

  // Δ peso de la semana (primer vs último registro dentro de la semana)
  const weekWeights = (state.weights || []).filter((w) => weekKeys.includes(w.date) && w.weightKg != null).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const deltaKg = weekWeights.length >= 2 ? +(weekWeights[weekWeights.length - 1].weightKg - weekWeights[0].weightKg).toFixed(1) : null;
  const daysMet = completedRows.filter((r) => colorForKcal(r.totals.kcal, targets) === 'green' && colorForProtein(r.totals.protein, targets) !== 'red').length;
  const maxKcal = Math.max(1, ...rows.map((r) => r.totals.kcal));

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Esta semana</h1>
        <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>Lunes a sábado</p>
      </div>

      {/* Resumen · 4 métricas */}
      <div className="bento-card">
        <div className="bento-label" style={{ marginBottom: 14 }}>Resumen</div>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <div className="bento-label">Δ Peso</div>
            <div className="bento-num" style={{ fontSize: 23, marginTop: 4, color: deltaKg == null ? 'var(--bento-ink)' : deltaKg <= 0 ? 'var(--bento-pos)' : 'var(--bento-warm)' }}>{deltaKg == null ? '—' : (deltaKg > 0 ? '+' : '') + deltaKg}</div>
            <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>kg</div>
          </div>
          <div>
            <div className="bento-label">Kcal/día</div>
            <div className="bento-num" style={{ fontSize: 23, marginTop: 4 }}>{avgKcal || '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>prom</div>
          </div>
          <div>
            <div className="bento-label">En meta</div>
            <div className="bento-num" style={{ fontSize: 23, marginTop: 4 }}>{daysMet}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--bento-faint)' }}>/{completedRows.length}</span></div>
            <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>días</div>
          </div>
          <div>
            <div className="bento-label">Proteína</div>
            <div className="bento-num" style={{ fontSize: 23, marginTop: 4 }}>{avgProtein || '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>g/día</div>
          </div>
        </div>
      </div>

      {/* Calorías por día */}
      <div className="bento-card">
        <div className="bento-label" style={{ marginBottom: 16 }}>Calorías por día · meta {targets.kcalMax}</div>
        <div className="flex items-end gap-2" style={{ height: 130 }}>
          {rows.map((r) => {
            const has = r.totals.hasSnack && r.totals.hasDinner;
            const col = !has ? 'var(--bento-surface)' : colorForKcal(r.totals.kcal, targets) === 'green' ? 'var(--bento-ink)' : 'var(--bento-warm)';
            const h = has ? Math.max(6, (r.totals.kcal / maxKcal) * 96) : 6;
            return (
              <div key={r.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="bento-mono" style={{ fontSize: 9, color: 'var(--bento-faint)' }}>{has ? Math.round(r.totals.kcal) : ''}</div>
                <div style={{ width: '100%', maxWidth: 44, height: `${h}px`, background: col, borderRadius: 4 }} title={`${r.label}: ${Math.round(r.totals.kcal)} kcal`} />
                <div style={{ fontSize: 11, color: 'var(--bento-muted)' }}>{r.label}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4" style={{ marginTop: 14, fontSize: 11, color: 'var(--bento-muted)' }}>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--bento-ink)' }} /> En meta</span>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--bento-warm)' }} /> Sobre meta</span>
        </div>
      </div>

      {/* Lista de días (tap para abrir) */}
      <div className="bento-card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const kcalColor = r.totals.hasSnack && r.totals.hasDinner ? colorForKcal(r.totals.kcal, targets) : null;
          const proteinColor = r.totals.hasSnack && r.totals.hasDinner ? colorForProtein(r.totals.protein, targets) : null;
          const worst = kcalColor === 'red' || proteinColor === 'red' ? 'red'
            : kcalColor === 'amber' || proteinColor === 'amber' ? 'amber'
            : kcalColor ? 'green' : null;
          const worstColor = worst === 'red' ? 'var(--bento-warm)' : worst === 'amber' ? 'var(--bento-yellow)' : worst === 'green' ? 'var(--bento-pos)' : null;
          return (
            <button key={r.key} onClick={() => onSelectDay && onSelectDay(r.key)}
              className="w-full text-left flex items-center gap-3 px-4 py-3"
              style={{ borderTop: i ? '1px solid var(--bento-hairline)' : 'none', background: r.isToday ? 'var(--bento-surface)' : 'transparent' }}>
              <div className="w-14 shrink-0">
                <div className="font-semibold text-sm" style={r.isToday ? { color: 'var(--bento-pos)' } : undefined}>{r.label}</div>
                <div style={{ fontSize: 12, color: 'var(--bento-faint)' }}>{r.dateStr}</div>
              </div>
              <div className="flex-1 min-w-0 truncate" style={{ fontSize: 12, color: 'var(--bento-muted)' }}>
                {r.totals.snackLabel ? r.totals.snackLabel : <span className="italic">— sin colación</span>}
                <br />
                {r.totals.dinnerLabel ? r.totals.dinnerLabel : <span className="italic">— sin cena</span>}
              </div>
              <div className="text-right shrink-0">
                <div className="bento-num text-sm">{Math.round(r.totals.kcal)} kcal</div>
                <div style={{ fontSize: 12, color: 'var(--bento-faint)' }}>{Math.round(r.totals.protein)}g prot</div>
              </div>
              <div className="w-3 shrink-0 flex justify-end">
                {worstColor && <div style={{ width: 10, height: 10, borderRadius: 99, background: worstColor }} />}
              </div>
            </button>
          );
        })}
      </div>

      <WeeklyAnalysisCard state={state} setState={setState} weekKey={weekKey} rows={rows} targets={targets} />
    </div>
  );
}

function InsightsView({ state, setState, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const cached = state.aiCache?.patterns;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);

  const series = useMemo(() => {
    const today = todayKey();
    const start = shiftDate(today, -27);
    const out = [];
    let cursor = start;
    while (cursor <= today) {
      const day = state.days[cursor];
      const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);
      const dow = new Date(cursor + 'T12:00:00').getDay();
      const weight = (state.weights || []).find((w) => w.date === cursor && w.weightKg != null);
      const dh = day?.health || null;
      out.push({
        fecha: cursor,
        dow,
        dia: DAY_SHORT[dow],
        kcal: Math.round(totals.kcal),
        proteina: Math.round(totals.protein),
        carbos: Math.round(totals.carbs),
        grasas: Math.round(totals.fat),
        fibra: Math.round(totals.fiber),
        agua_ml: Math.round(totals.waterMl),
        ejercicio_kcal: Math.round(totals.kcalBurned),
        registrado: totals.eatenAny,
        peso_kg: weight?.weightKg ?? null,
        pasos: dh?.steps ?? null,
        energia_activa_kcal: dh?.activeEnergyKcal ?? null,
        sueno_horas: dh?.sleepHours ?? null,
      });
      cursor = shiftDate(cursor, 1);
    }
    return out;
  }, [state.days, state.snackBank, state.proteinBank, state.weights, targets]);

  const sig = useMemo(() => hashSig(series), [series]);
  const isStale = cached && cached.sig !== sig;
  const cacheAgeMs = cached ? (Date.now() - new Date(cached.generatedAt).getTime()) : Infinity;
  const cacheOlderThan7Days = cacheAgeMs > 7 * 86400000;

  const recordedCount = series.filter((s) => s.registrado).length;

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (recordedCount < 7) { setError(`Necesitas al menos 7 días con registro. Tienes ${recordedCount}.`); return; }
    setLoading(true); setError(null);
    try {
      const T = targets || DEFAULT_TARGETS;
      const prompt = `Eres analista de datos nutricionales de Hugo (geriatra chileno). Busca patrones interesantes en sus últimas 4 semanas. USA TUTEO CHILENO. Sé concreto, usa números reales del dataset.

METAS:
- kcal: ${T.kcalMin}-${T.kcalMax} · proteína ≥ ${T.proteinMin}g · agua ${T.waterTarget} ml

DATOS (28 días, dow 0=domingo, 6=sábado). "kcal" = comida consumida (BRUTA), ya comparable contra la meta; "ejercicio_kcal" es solo contexto — NO lo restes de "kcal" (el TDEE y la meta ya incorporan la actividad). "pasos"/"energia_activa_kcal"/"sueno_horas" son contexto de Apple Health (pueden venir null): úsalos para correlacionar actividad/sueño con la adherencia, pero NO restes la energía activa de las kcal:
${JSON.stringify(series, null, 2)}

Devuelve SOLO JSON, sin markdown:
{
  "insights": [
    {
      "title": "1 línea con el patrón",
      "evidence": "datos concretos que respaldan (con números)",
      "suggestion": "qué hacer con eso"
    }
  ],
  "confidence": "alta|media|baja"
}

Reglas:
- 2 a 4 insights, los MÁS interesantes (no obvios)
- Cada insight: título corto (máx 70 chars), evidencia con números reales del dataset, sugerencia accionable
- Buscar: patrones por día de semana, correlación con ejercicio, cumplimiento de agua/proteína, tendencias de peso
- Si los datos son escasos, devuelve menos insights con confidence baja
- No inventes datos. Si no hay patrón claro, dilo`;

      const text = await askClaude(prompt, apiKey, 1500);
      const parsed = parseJsonLoose(text);
      if (!parsed?.insights) {
        setError('No se pudo parsear la respuesta.');
        return;
      }
      setResponse(parsed);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          patterns: { sig, response: parsed, generatedAt: new Date().toISOString() },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = response?.confidence === 'alta' ? 'green' : response?.confidence === 'media' ? 'amber' : 'red';
  const insightTones = ['var(--bento-warm)', 'var(--bento-pos)', 'var(--bento-blue)', 'var(--bento-yellow)', 'var(--bento-lilac)'];

  // Señales proactivas de HOY (deterministas, sin IA): se muestran arriba, no requieren el análisis.
  const todayInsights = useMemo(
    () => { const n = new Date(); return computeProactiveInsights(state, todayKey(), targets, { nowMinutes: n.getHours() * 60 + n.getMinutes() }); },
    [state.days, state.weights, state.snackBank, state.proteinBank, state.dessertBank, state.settings, targets]
  );

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><span>🧠</span>Insights</h1>
        <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>Patrones de las últimas 4 semanas</p>
      </div>

      {todayInsights.length > 0 && (
        <div className="space-y-2">
          <div className="bento-label px-1">Hoy</div>
          <ProactiveInsights insights={todayInsights} readOnly />
        </div>
      )}

      {/* 3 stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Registro</div>
          <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>{recordedCount}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--bento-faint)' }}>/28</span></div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>{Math.round(recordedCount / 28 * 100)}% cobertura</div>
        </div>
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Patrones</div>
          <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>{response?.insights?.length ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>por Claude</div>
        </div>
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Confianza</div>
          <div className="bento-num" style={{ fontSize: 22, marginTop: 6 }}>{response?.confidence ? response.confidence.charAt(0).toUpperCase() + response.confidence.slice(1) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>{response ? 'del análisis' : 'sin análisis'}</div>
        </div>
      </div>

      {/* Generar */}
      <div className="bento-card space-y-3">
        {!apiKey && (
          <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
        )}
        <button onClick={generate} disabled={loading || !apiKey || recordedCount < 7}
          className="w-full py-2.5 rounded-xl font-semibold"
          style={loading || !apiKey || recordedCount < 7 ? { background: 'var(--bento-surface)', color: 'var(--bento-faint)' } : { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
          {loading ? 'Buscando patrones…' : (response ? (isStale || cacheOlderThan7Days ? 'Actualizar análisis' : 'Regenerar') : 'Detectar patrones con Claude ✨')}
        </button>
        {recordedCount < 7 && <p style={{ fontSize: 11, color: 'var(--bento-faint)' }}>Necesitas al menos 7 días con registro ({recordedCount} hasta ahora).</p>}
        {error && <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>{error}</p>}
      </div>

      {response && (
        <>
          {response.confidence && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'var(--bento-surface)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: confidenceColor === 'green' ? 'var(--bento-pos)' : confidenceColor === 'amber' ? 'var(--bento-yellow)' : 'var(--bento-warm)' }} />
              <span style={{ fontSize: 11, color: 'var(--bento-muted)' }}>Confianza {response.confidence}{isStale && ' · datos cambiaron'}</span>
            </div>
          )}

          {response.insights.map((ins, i) => (
            <div key={i} className="bento-card space-y-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span style={{ width: 9, height: 9, borderRadius: 99, background: insightTones[i % insightTones.length], flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{ins.title}</span>
              </div>
              {ins.evidence && <p style={{ fontSize: 13, color: 'var(--bento-muted)', lineHeight: 1.5, paddingLeft: 19 }}>{ins.evidence}</p>}
              {ins.suggestion && <p style={{ fontSize: 12.5, lineHeight: 1.5, padding: '10px 12px', background: 'var(--bento-surface)', borderRadius: 8, marginLeft: 19 }}>💡 {ins.suggestion}</p>}
            </div>
          ))}

          {cached?.generatedAt && (
            <p className="text-center" style={{ fontSize: 10, color: 'var(--bento-faint)' }}>
              Generado {new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Pestaña Ejercicios: stats locales (siempre visibles) + evaluación crítica con Claude (a
// pedido, cacheada). Las capturas se suben con WorkoutCaptureModal y guardan el detalle por
// ejercicio que alimenta los desbalances/progresión.
// Subida de .docx para renovar la rutina (control reutilizado en vacío y en cabecera).
function RoutineUpload({ apiKey, onParsed, label = 'Renovar rutina (.docx)' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const handleFile = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const att = await fileToAttachment(file);
      const { routine, source } = await parseRoutineDocx(att.text || '', apiKey);
      if (!routine.days.length) throw new Error('No se detectaron días/ejercicios en el documento.');
      onParsed(routine, source);
    } catch (err) {
      setError(err.message || 'No se pudo leer el documento.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}
        style={{ background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
        <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} className="hidden" disabled={busy} />
        {busy ? '⏳ Leyendo…' : `📄 ${label}`}
      </label>
      {error && <p className="text-xs mt-2" style={{ color: 'var(--bento-warm)' }}>{error}</p>}
    </div>
  );
}

// Modal de video por ejercicio: reproduce el embed si hay video, o muestra pegar-link + buscar.
function RoutineVideoModal({ exercise, video, onAssign, onRemove, onClose }) {
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(!video);
  const [error, setError] = useState(null);
  const save = () => {
    const id = extractYoutubeId(url);
    if (!id) { setError('No reconocí un link de YouTube válido.'); return; }
    onAssign(id);
    setError(null); setEditing(false); setUrl('');
  };
  const search = () => {
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(exercise.name + ' form technique'), '_blank', 'noopener');
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold truncate">{exercise.anchor ? '⚓ ' : ''}{exercise.name}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm shrink-0">✕</button>
        </div>

        {video && !editing ? (
          <div className="space-y-3">
            <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${video.youtube_id}`}
                title={exercise.name}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">El video necesita conexión para reproducir.</p>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(true); setUrl(''); }} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-700">Cambiar</button>
              <button onClick={onRemove} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--bento-warm)', color: '#fff' }}>Quitar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!video && <p className="text-sm text-gray-500 dark:text-gray-400">Sin video. Pega un link de YouTube o búscalo y luego pégalo.</p>}
            <input
              type="url" inputMode="url" placeholder="https://youtube.com/watch?v=…"
              value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }}
              className="w-full px-3 py-2 rounded-xl text-sm bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-emerald-500 outline-none"
            />
            {error && <p className="text-xs" style={{ color: 'var(--bento-warm)' }}>{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>Guardar</button>
              <button onClick={search} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-700">🔎 Buscar</button>
            </div>
            {video && <button onClick={() => setEditing(false)} className="w-full text-xs text-gray-500 dark:text-gray-400 underline">Cancelar</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// Tarjeta de bloque de prosa del día (calentamiento / rampa / cardio / note).
function RoutineBlock({ icon, label, text }) {
  if (!text) return null;
  return (
    <div className="bento-card">
      <div className="bento-label" style={{ marginBottom: 6 }}>{icon} {label}</div>
      <p className="text-sm text-gray-600 dark:text-gray-300" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    </div>
  );
}

function RoutineView({ state, setState }) {
  const apiKey = state.settings?.anthropicApiKey;
  const routine = state.routine;
  const videos = state.exercise_videos || {};
  const [activeDayId, setActiveDayId] = useState(routine?.days?.[0]?.id ?? null);
  const [videoModal, setVideoModal] = useState(null); // { slug, name, anchor } | null
  const [preview, setPreview] = useState(null);        // { routine, source } | null

  // Si cambia la rutina (renovación) y el día activo ya no existe, vuelve al primero.
  const activeDay = useMemo(() => {
    const days = routine?.days || [];
    return days.find((d) => d.id === activeDayId) || days[0] || null;
  }, [routine, activeDayId]);

  const assignVideo = (slug, youtube_id) => {
    setState((prev) => ({
      ...prev,
      exercise_videos: { ...(prev.exercise_videos || {}), [slug]: { youtube_id, assignedAt: new Date().toISOString() } },
    }));
  };
  const removeVideo = (slug) => {
    setState((prev) => {
      const next = { ...(prev.exercise_videos || {}) };
      delete next[slug];
      return { ...prev, exercise_videos: next };
    });
  };

  const confirmRenew = () => {
    if (!preview) return;
    const saved = { ...preview.routine, updatedAt: new Date().toISOString() };
    setState((prev) => ({ ...prev, routine: saved })); // exercise_videos intacto → videos persisten por slug
    setActiveDayId(saved.days[0]?.id ?? null);
    setPreview(null);
  };

  // ── Preview de renovación (antes de guardar) ──
  if (preview) {
    const allEx = preview.routine.days.flatMap((d) => d.exercises);
    const sinVideo = allEx.filter((ex) => !videos[ex.slug]);
    return (
      <div className="px-4 pt-4 pb-24 space-y-4">
        <div className="bento-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Revisar rutina</h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bento-surface)', color: 'var(--bento-faint)' }}>
              {preview.source === 'ai' ? '🤖 IA' : '📐 Plantilla'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {preview.routine.days.length} días · {allEx.length} ejercicios
          </p>
        </div>

        {preview.routine.days.map((d) => (
          <div key={d.id} className="bento-card">
            <div className="font-semibold text-sm">{d.label}{d.durationMin ? ` · ~${d.durationMin} min` : ''}</div>
            {d.warmup && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">🔥 {d.warmup}</div>}
            {d.ramp && <div className="text-xs mt-1" style={{ color: 'var(--bento-blue)' }}>📈 {d.ramp}</div>}
            <ul className="mt-2 space-y-1">
              {d.exercises.map((ex, i) => (
                <li key={i} className="text-sm text-gray-600 dark:text-gray-300">
                  {ex.anchor ? '⚓ ' : ''}{ex.name}
                  {(ex.pesoInicio || ex.seriesReps) ? <span className="text-gray-400"> · {[ex.pesoInicio, ex.seriesReps].filter(Boolean).join(' × ')}</span> : null}
                  {ex.ramp && <span className="block text-xs" style={{ color: 'var(--bento-blue)' }}>📈 Rampa: {ex.ramp}</span>}
                </li>
              ))}
              {!d.exercises.length && !d.note && <li className="text-sm text-gray-400">Sin ejercicios detectados</li>}
            </ul>
            {d.note && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">🚴 {d.note}</div>}
            {d.cardioClose && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">🚴 Cardio de cierre: {d.cardioClose}</div>}
          </div>
        ))}

        {sinVideo.length > 0 && (
          <div className="bento-card">
            <div className="bento-label" style={{ marginBottom: 8 }}>Ejercicios nuevos sin video ({sinVideo.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {sinVideo.map((ex, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bento-surface)', color: 'var(--bento-faint)' }}>{ex.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={confirmRenew} className="flex-1 px-3 py-3 rounded-xl text-sm font-bold" style={{ background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>Guardar rutina</button>
          <button onClick={() => setPreview(null)} className="flex-1 px-3 py-3 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-700">Cancelar</button>
        </div>
      </div>
    );
  }

  // ── Estado vacío ──
  if (!routine || !routine.days?.length) {
    return (
      <div className="px-4 pt-4 pb-24 space-y-4">
        <div className="bento-card text-center py-10 space-y-3">
          <div className="text-4xl">📐</div>
          <h2 className="text-lg font-bold">Sin rutina aún</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">Sube el documento de tu rutina (.docx) para verla por día y asignar videos de técnica.</p>
          <div className="flex justify-center pt-1"><RoutineUpload apiKey={apiKey} onParsed={(r, s) => setPreview({ routine: r, source: s })} label="Subir rutina (.docx)" /></div>
          {!apiKey && <p className="text-xs text-gray-400">Sin API key se usa el parser de plantilla (formato Speediance).</p>}
        </div>
      </div>
    );
  }

  // ── Vista principal ──
  const modalEx = videoModal;
  const allExercises = routine.days.flatMap((d) => d.exercises);
  const totalEx = allExercises.length;
  const withVideo = allExercises.filter((ex) => videos[ex.slug]?.youtube_id).length;
  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* Header */}
      <div className="px-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{routine.title || 'Rutina'}</h1>
          <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>
            {routine.updatedAt ? `Actualizada ${shortDate(routine.updatedAt.slice(0, 10))}` : 'Tu rutina vigente'}
          </p>
        </div>
        <div className="shrink-0"><RoutineUpload apiKey={apiKey} onParsed={(r, s) => setPreview({ routine: r, source: s })} /></div>
      </div>

      {/* Hero · 3 stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Días</div>
          <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>{routine.days.length}</div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>por semana</div>
        </div>
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Ejercicios</div>
          <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>{totalEx}</div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>en total</div>
        </div>
        <div className="bento-card" style={{ padding: '14px' }}>
          <div className="bento-label">Con video</div>
          <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>{withVideo}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--bento-faint)' }}>/{totalEx}</span></div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 3 }}>{totalEx ? Math.round(withVideo / totalEx * 100) : 0}% técnica</div>
        </div>
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {routine.days.map((d) => {
          const on = d.id === activeDay?.id;
          return (
            <button key={d.id} onClick={() => setActiveDayId(d.id)}
              className="px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0"
              style={on
                ? { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }
                : { background: 'var(--bento-surface)', color: 'var(--bento-faint)' }}>
              {d.label}
            </button>
          );
        })}
      </div>

      {activeDay && (
        <div className="space-y-2.5">
          <div className="bento-label px-1">{activeDay.exercises.length} ejercicios{activeDay.durationMin ? ` · ~${activeDay.durationMin} min` : ''}</div>
          <RoutineBlock icon="🔥" label="Calentamiento" text={activeDay.warmup} />
          <RoutineBlock icon="📈" label="Rampa de aproximación" text={activeDay.ramp} />
          {activeDay.exercises.map((ex, i) => {
            const hasVideo = !!videos[ex.slug]?.youtube_id;
            const detail = [ex.pesoInicio, ex.seriesReps].filter(Boolean).join(' × ');
            return (
              <div key={i} className="bento-card" style={{ padding: 16 }}>
                <div className="flex items-start gap-3">
                  <div className="bento-num shrink-0" style={{ fontSize: 13, color: 'var(--bento-faint)', width: 20, paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{ex.anchor ? '⚓ ' : ''}{ex.name}</div>
                    {detail && <div className="bento-mono" style={{ fontSize: 12.5, color: 'var(--bento-muted)', marginTop: 2 }}>{detail}</div>}
                    {ex.descanso && <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 2 }}>Descanso {ex.descanso}</div>}
                    {ex.ramp && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--bento-blue)' }}>📈 Rampa: {ex.ramp}</div>}
                    {ex.notas && <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 4, fontStyle: 'italic' }}>{ex.notas}</div>}
                  </div>
                  <button onClick={() => setVideoModal({ slug: ex.slug, name: ex.name, anchor: ex.anchor })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                    style={hasVideo
                      ? { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }
                      : { background: 'var(--bento-surface)', color: 'var(--bento-muted)' }}>
                    {hasVideo ? '🎬 Ver' : '▶ Video'}
                  </button>
                </div>
              </div>
            );
          })}
          <RoutineBlock icon="🚴" label="Cardio" text={activeDay.note} />
          <RoutineBlock icon="🚴" label="Cardio de cierre" text={activeDay.cardioClose} />
          {!activeDay.exercises.length && !activeDay.note && <div className="bento-card text-sm text-center py-6" style={{ color: 'var(--bento-faint)' }}>Este día no tiene ejercicios.</div>}
        </div>
      )}

      {modalEx && (
        <RoutineVideoModal
          exercise={modalEx}
          video={videos[modalEx.slug] || null}
          onAssign={(id) => assignVideo(modalEx.slug, id)}
          onRemove={() => { removeVideo(modalEx.slug); setVideoModal(null); }}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}

// Mini-gráfico de tendencia (sparkline) para una métrica de salud. `points` = lista alineada
// al rango (28 días); y=null deja hueco (se conecta por encima). Sin ejes, compacto.
// `refY`: dibuja una línea de referencia horizontal (p. ej. el umbral clínico de 6h de sueño) y
// pinta en color de alerta los puntos que quedan por DEBAJO. El dominio y se estira para incluir
// refY, así la línea siempre cae dentro del viewBox aunque todos los datos estén de un lado.
function MetricSparkline({ points, color = 'var(--bento-blue)', height = 42, refY = null }) {
  const real = (points || []).filter((p) => p && p.y != null);
  if (real.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--bento-faint)' }}>pocos datos</div>;
  }
  const ys = real.map((p) => Number(p.y));
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (refY != null) { minY = Math.min(minY, refY); maxY = Math.max(maxY, refY); }
  const range = (maxY - minY) || 1;
  const n = points.length;
  const W = 100, H = height;
  const px = (i) => (n > 1 ? (i / (n - 1)) * W : 0);
  const py = (y) => H - 3 - ((Number(y) - minY) / range) * (H - 8);
  const coords = points.map((p, i) => (p && p.y != null ? `${px(i).toFixed(1)},${py(p.y).toFixed(1)}` : null)).filter(Boolean);
  const last = real[real.length - 1];
  const lastI = points.map((p, i) => (p && p.y != null ? i : -1)).filter((i) => i >= 0).pop();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      {refY != null && (
        <line x1="0" y1={py(refY)} x2={W} y2={py(refY)} stroke="var(--bento-warm)" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" opacity="0.65" />
      )}
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {refY != null && points.map((p, i) => (p && p.y != null && Number(p.y) < refY
        ? <circle key={i} cx={px(i)} cy={py(p.y)} r="1.8" fill="var(--bento-warm)" vectorEffect="non-scaling-stroke" /> : null))}
      {lastI != null && <circle cx={px(lastI)} cy={py(last.y)} r="2" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

// Umbral clínico de sueño: bajo esto es la señal de alerta (freno metabólico a grasa visceral,
// prioridad #1). Se marca en el sparkline y en el gráfico de detalle del sueño.
const SLEEP_ALERT_H = 6;

// Planifica (sin mutar) el merge de un import de HeartWatch contra el estado actual: cuántos días
// de salud entran (nuevos vs actualizaciones) y qué sesiones de entreno calzan con un entrenamiento
// local existente. El match de entrenos es por fecha + hora de inicio más cercana (±30 min); cada
// entrada local se reclama UNA vez (las sesiones más largas primero, para que la principal reclame
// el entrenamiento de Speediance). Las sesiones sin match NO se agregan en v1: el watch registra
// varias entradas solapadas por sesión real (ej. Remo + 2× pesas concurrentes) → duplicaría.
function planHeartWatchMerge(state, daily, workouts) {
  const healthDays = daily?.days || [];
  const sessions = workouts?.sessions || [];
  const stateDays = state.days || {};
  let healthNew = 0, healthUpd = 0;
  for (const h of healthDays) {
    const cur = stateDays[h.date]?.health;
    if (cur && (cur.hrvSleep != null || cur.spo2Daily != null)) healthUpd++; else healthNew++;
  }
  const WINDOW = 30 * 60 * 1000;
  const claimed = new Set();
  const matches = [];
  let unmatched = 0;
  const ordered = [...sessions].sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  for (const s of ordered) {
    const cands = (stateDays[s.date]?.exercise || []).filter((e) => e && e.id != null && !claimed.has(e.id));
    let best = null, bestDt = Infinity;
    for (const e of cands) {
      const dt = (e.ts != null && s.ts != null) ? Math.abs(e.ts - s.ts) : Infinity;
      if (dt < bestDt) { bestDt = dt; best = e; }
    }
    if (best && bestDt <= WINDOW) { claimed.add(best.id); matches.push({ session: s, dayKey: s.date, exId: best.id }); }
    else unmatched++;
  }
  return { healthDays, healthNew, healthUpd, matches, matched: matches.length, unmatched, totalSessions: sessions.length };
}

const HW_ENRICH_FIELDS = ['avgHr', 'rpe', 'trainingLoad', 'calsPerHour'];

// Modal: importar export CSV de HeartWatch (resumen diario + entrenamientos). Parsea client-side
// (sin IA), muestra un preview de lo que se mergeará y, al confirmar, mergea en el estado local
// (aditivo: nunca pisa datos del Shortcut/Speediance) y empuja al bridge (idempotente: salud por
// fecha, entrenos por nombre+ts) para que cruce a otros dispositivos.
function HeartWatchImportModal({ state, setState, onClose }) {
  const [daily, setDaily] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const bridgePost = useMemo(() => {
    const url = state.settings?.bridgeUrl;
    return url ? withBridgeToken(url, state.settings?.bridgeToken) : null;
  }, [state.settings]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    setErr(null);
    for (const f of files) {
      let text;
      try { text = await f.text(); } catch { setErr('No se pudo leer ' + f.name); continue; }
      const d = parseHeartWatchDaily(text);
      if (d.ok && d.days.length) { setDaily({ name: f.name, ...d }); continue; }
      const w = parseHeartWatchWorkouts(text);
      if (w.ok && w.sessions.length) { setWorkouts({ name: f.name, ...w }); continue; }
      setErr(`«${f.name}» no es un CSV de HeartWatch reconocido (resumen diario o entrenamientos).`);
    }
    if (e.target) e.target.value = '';
  };

  const plan = useMemo(() => planHeartWatchMerge(state, daily, workouts), [state.days, daily, workouts]);
  const hasData = (daily?.days?.length || 0) + (workouts?.sessions?.length || 0) > 0;

  const apply = async () => {
    setBusy(true);
    const healthDays = daily?.days || [];
    const matches = plan.matches;
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      for (const h of healthDays) {
        const d = days[h.date] ? { ...days[h.date] } : { date: h.date, meals: [], extras: [], exercise: [] };
        const cur = { ...(d.health || {}) };
        for (const k of Object.keys(h)) {
          if (k === 'date') continue;
          if (k === 'sleepHours') { const s = sanitizeSleepHours(h.sleepHours); if (cur.sleepHours == null && s != null) cur.sleepHours = s; continue; }
          if (h[k] != null) cur[k] = h[k];
        }
        cur.healthTs = Date.now();
        d.health = cur;
        days[h.date] = d;
      }
      for (const m of matches) {
        const d = days[m.dayKey]; if (!d) continue;
        const exArr = (d.exercise || []).map((e) => {
          if (e.id !== m.exId) return e;
          const ne = { ...e };
          for (const f of HW_ENRICH_FIELDS) if (ne[f] == null && m.session[f] != null) ne[f] = m.session[f];
          if ((!ne.hrZones || !Object.keys(ne.hrZones).length) && m.session.hrZones) ne.hrZones = m.session.hrZones;
          return ne;
        });
        days[m.dayKey] = { ...d, exercise: exArr };
      }
      return { ...prev, days };
    });
    if (bridgePost) {
      const post = (section, today, entry) => fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ op: 'add', section, today, entries: [{ ...entry, ts: entry.ts != null ? entry.ts : Date.now() }] }),
      }).catch(() => {});
      for (const h of healthDays) {
        const entry = { ...h };
        // sleepHours solo si el día no tiene ya uno (el del Shortcut manda); evita pisarlo en el server.
        if (state.days?.[h.date]?.health?.sleepHours != null) delete entry.sleepHours;
        await post('health', h.date, entry);
      }
      for (const m of matches) {
        const ex = (state.days?.[m.dayKey]?.exercise || []).find((e) => e.id === m.exId);
        if (!ex) continue;
        const entry = { name: ex.name, date: m.dayKey, ts: ex.ts, source: 'app' };
        for (const f of HW_ENRICH_FIELDS) if (m.session[f] != null) entry[f] = m.session[f];
        if (m.session.hrZones) entry.hrZones = m.session.hrZones;
        await post('workouts', m.dayKey, entry);
      }
    }
    setBusy(false);
    setDone({ health: healthDays.length, matched: plan.matched, unmatched: plan.unmatched });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold flex items-center gap-2"><span>⌚</span> Importar HeartWatch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!done ? (
            <>
              <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>
                Arrastra o elige los CSV de HeartWatch: el <b>resumen diario</b> (HRV, SpO₂, FC durmiendo,
                recuperación) y/o el de <b>entrenamientos</b> (zonas de FC, carga, RPE). Es aditivo: no pisa
                lo que ya viene del atajo de Apple Health ni de Speediance.
              </p>
              <label className="block">
                <input type="file" accept=".csv,text/csv" multiple onChange={handleFiles} className="hidden" />
                <span className="block text-center px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium cursor-pointer hover:border-gray-400">
                  Elegir CSV…
                </span>
              </label>
              {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
              {(daily || workouts) && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 text-sm space-y-1.5">
                  {daily && <div>📄 <b>{daily.name}</b> · resumen diario</div>}
                  {workouts && <div>📄 <b>{workouts.name}</b> · entrenamientos</div>}
                  <div className="pt-1.5 mt-1.5 border-t border-gray-200 dark:border-gray-700 space-y-1" style={{ color: 'var(--bento-faint)' }}>
                    {daily && <div>❤️ <b>{plan.healthDays.length}</b> días de recuperación ({plan.healthNew} nuevos, {plan.healthUpd} se actualizan)</div>}
                    {workouts && <div>🏋️ <b>{plan.matched}</b> de {plan.totalSessions} sesiones calzan con un entreno tuyo{plan.unmatched ? ` · ${plan.unmatched} sin match (no se agregan)` : ''}</div>}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium">Cancelar</button>
                <button onClick={apply} disabled={!hasData || busy} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
                  {busy ? 'Importando…' : 'Importar'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="text-base font-semibold flex items-center gap-2"><span>✅</span> Listo</div>
              <ul className="space-y-1" style={{ color: 'var(--bento-faint)' }}>
                <li>❤️ {done.health} días de recuperación importados</li>
                <li>🏋️ {done.matched} entrenamientos enriquecidos{done.unmatched ? ` · ${done.unmatched} sesiones del watch sin match` : ''}</li>
              </ul>
              <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Pestaña Salud: tendencias de Apple Health (pasos, energía activa, sueño, FC reposo, VO2máx) +
// recuperación de HeartWatch (HRV, SpO₂, FC durmiendo) + banderas automáticas + evaluación crítica
// de Claude que cruza sueño/actividad/recuperación con la pérdida de peso y la adherencia. SOLO
// LECTURA: nunca altera kcal ni totales.
function HealthView({ state, setState, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const cached = state.aiCache?.health;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);
  const [detail, setDetail] = useState(null); // métrica abierta en el detalle día por día
  const [showImport, setShowImport] = useState(false); // modal de import de HeartWatch

  // Serie de 28 días: salud + peso + adherencia (para que Claude correlacione)
  const series = useMemo(() => {
    const today = todayKey();
    const start = shiftDate(today, -27);
    const out = [];
    let cursor = start;
    while (cursor <= today) {
      const day = state.days[cursor];
      const dh = day?.health || null;
      const totals = day ? computeDayTotals(day, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []) : null;
      const w = (state.weights || []).find((x) => x.date === cursor && x.weightKg != null);
      out.push({
        fecha: cursor,
        pasos: dh?.steps != null ? Math.round(Number(dh.steps)) : null,
        energia_activa_kcal: dh?.activeEnergyKcal != null ? Math.round(Number(dh.activeEnergyKcal)) : null,
        sueno_horas: dh?.sleepHours != null ? +Number(dh.sleepHours).toFixed(1) : null,
        fc_reposo: dh?.restingHr != null ? Math.round(Number(dh.restingHr)) : null,
        vo2max: dh?.vo2max != null ? +Number(dh.vo2max).toFixed(1) : null,
        // Recuperación de HeartWatch (importador CSV). null si no hay ese día.
        hrv_sueno: dh?.hrvSleep != null ? Math.round(Number(dh.hrvSleep)) : null,
        hrv_vigilia: dh?.hrvWake != null ? Math.round(Number(dh.hrvWake)) : null,
        fc_durmiendo: dh?.sleepingHr != null ? Math.round(Number(dh.sleepingHr)) : null,
        fc_sedentaria: dh?.sedentaryHr != null ? Math.round(Number(dh.sedentaryHr)) : null,
        spo2: dh?.spo2Daily != null ? +Number(dh.spo2Daily).toFixed(1) : null,
        spo2_durmiendo: dh?.spo2Sleep != null ? +Number(dh.spo2Sleep).toFixed(1) : null,
        recuperacion_2min: dh?.recovery2min != null ? Math.round(Number(dh.recovery2min)) : null,
        peso_kg: w?.weightKg ?? null,
        cumple_meta: totals && totals.eatenAny ? dayMetsTarget(totals, targets) : null,
        kcal_consumido: totals && totals.eatenAny ? Math.round(totals.kcal) : null,
      });
      cursor = shiftDate(cursor, 1);
    }
    return out;
  }, [state.days, state.weights, state.snackBank, state.proteinBank, state.dessertBank, state.antojoCustomItems, targets]);

  const daysWithHealth = series.filter((s) => s.pasos != null || s.sueno_horas != null || s.energia_activa_kcal != null || s.fc_reposo != null || s.hrv_sueno != null || s.spo2 != null || s.fc_durmiendo != null).length;

  // Métricas: último valor, promedio 28d, dirección de tendencia (mitad inicial vs final)
  const METRIC_DEFS = [
    { key: 'pasos', label: 'Pasos', icon: '👟', color: 'var(--bento-ink)', goodUp: true, fmt: (v) => Math.round(v).toLocaleString('es-CL'), unit: '' },
    { key: 'energia_activa_kcal', label: 'Energía activa', icon: '🔥', color: 'var(--bento-warm)', goodUp: true, fmt: (v) => Math.round(v), unit: 'kcal' },
    { key: 'sueno_horas', label: 'Sueño', icon: '😴', color: 'var(--bento-blue)', goodUp: true, fmt: (v) => v.toFixed(1), unit: 'h' },
    { key: 'fc_reposo', label: 'FC reposo', icon: '❤️', color: 'var(--bento-pos)', goodUp: false, fmt: (v) => Math.round(v), unit: 'lpm' },
    { key: 'vo2max', label: 'VO₂máx', icon: '🫁', color: 'var(--bento-lilac)', goodUp: true, fmt: (v) => v.toFixed(1), unit: '' },
    // Recuperación de HeartWatch (importador CSV). Solo aparecen cuando hay datos (count>0 más abajo).
    { key: 'hrv_sueno', label: 'HRV (sueño)', icon: '🫀', color: 'var(--bento-lilac)', goodUp: true, fmt: (v) => Math.round(v), unit: 'ms' },
    { key: 'fc_durmiendo', label: 'FC durmiendo', icon: '🌙', color: 'var(--bento-blue)', goodUp: false, fmt: (v) => Math.round(v), unit: 'lpm' },
    { key: 'spo2', label: 'SpO₂', icon: '🩸', color: 'var(--bento-pos)', goodUp: true, fmt: (v) => v.toFixed(0), unit: '%' },
    { key: 'recuperacion_2min', label: 'Recuperación 2′', icon: '📉', color: 'var(--bento-warm)', goodUp: true, fmt: (v) => Math.round(v), unit: 'lpm' },
  ];
  const metrics = useMemo(() => METRIC_DEFS.map((d) => {
    const vals = series.map((s) => s[d.key]).filter((v) => v != null).map(Number);
    const last = vals.length ? vals[vals.length - 1] : null;
    // Fecha de la última lectura: el filter de arriba descarta los nulos y pierde el día, así que
    // lo recuperamos recorriendo la serie al revés. Sirve para etiquetar el tile (un valor de
    // ayer no debe verse como "ahora").
    let lastDate = null;
    for (let i = series.length - 1; i >= 0; i--) { if (series[i][d.key] != null) { lastDate = series[i].fecha; break; } }
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    let dir = 'flat';
    if (vals.length >= 4) {
      const half = Math.floor(vals.length / 2);
      const fa = vals.slice(0, half).reduce((a, b) => a + b, 0) / half;
      const la = vals.slice(half).reduce((a, b) => a + b, 0) / (vals.length - half);
      if (fa > 0) dir = la > fa * 1.03 ? 'up' : la < fa * 0.97 ? 'down' : 'flat';
    }
    return { ...d, vals, last, lastDate, avg, dir, count: vals.length, spark: series.map((s, i) => ({ x: i, y: s[d.key] })) };
  }), [series]);

  // Banderas automáticas (sin IA)
  const flags = useMemo(() => {
    const out = [];
    // Frescura: si la lectura de salud más reciente no es de hoy, dilo explícito. El watch muestra
    // hoy en vivo; sin esto, un dato de ayer en las tarjetas se vería como si fuera "ahora".
    const healthDates = series.filter((s) => s.pasos != null || s.sueno_horas != null || s.energia_activa_kcal != null || s.fc_reposo != null || s.vo2max != null || s.hrv_sueno != null || s.spo2 != null || s.fc_durmiendo != null).map((s) => s.fecha);
    const lastHealthDate = healthDates.length ? healthDates[healthDates.length - 1] : null;
    if (lastHealthDate && lastHealthDate !== todayKey()) {
      const lbl = formatDateLabel(lastHealthDate, todayKey());
      const pretty = lbl === 'Ayer' ? 'de ayer' : `del ${lbl.toLowerCase()}`;
      out.push({ tone: 'warm', text: `Las cifras de salud son ${pretty}, no de hoy — el watch muestra el día en curso en vivo` });
    }
    const last7 = series.slice(-7);
    const sleepLow = last7.filter((s) => s.sueno_horas != null && s.sueno_horas < 6).length;
    if (sleepLow >= 2) out.push({ tone: 'warm', text: `Dormiste menos de 6h en ${sleepLow} de las últimas 7 noches` });
    const sed = last7.filter((s) => s.pasos != null && s.pasos < 3000).length;
    if (sed >= 2) out.push({ tone: 'warm', text: `${sed} días sedentarios esta semana (<3.000 pasos)` });
    const fc = metrics.find((m) => m.key === 'fc_reposo');
    if (fc && fc.dir === 'up' && fc.count >= 4) out.push({ tone: 'warm', text: 'Tu FC en reposo viene subiendo — ojo con el estrés o sobrecarga' });
    // Recuperación (HeartWatch): HRV cayendo y/o FC durmiendo subiendo = baja recuperación.
    const hrv = metrics.find((m) => m.key === 'hrv_sueno');
    const fcSleep = metrics.find((m) => m.key === 'fc_durmiendo');
    if (hrv && hrv.dir === 'down' && hrv.count >= 4) out.push({ tone: 'warm', text: 'Tu HRV (variabilidad cardíaca) viene cayendo — señal de recuperación incompleta o estrés acumulado' });
    if (hrv && hrv.avg != null && hrv.dir !== 'down' && hrv.count >= 6) out.push({ tone: 'pos', text: `HRV estable/al alza (prom ${Math.round(hrv.avg)} ms) — buena recuperación` });
    if (fcSleep && fcSleep.dir === 'up' && fcSleep.count >= 4) out.push({ tone: 'warm', text: 'Tu FC durmiendo viene subiendo — descanso menos reparador (alcohol, comer tarde, carga o estrés)' });
    const stepsM = metrics.find((m) => m.key === 'pasos');
    if (stepsM && stepsM.dir === 'down' && stepsM.count >= 6) out.push({ tone: 'warm', text: 'Tu actividad (pasos) viene cayendo' });
    const sleepM = metrics.find((m) => m.key === 'sueno_horas');
    if (sleepM && sleepM.avg != null && sleepM.avg >= 7 && sleepLow === 0) out.push({ tone: 'pos', text: `Buen sueño: promedio ${sleepM.avg.toFixed(1)}h` });
    if (stepsM && stepsM.avg != null && stepsM.avg >= 8000) out.push({ tone: 'pos', text: `Actividad sólida: ${Math.round(stepsM.avg).toLocaleString('es-CL')} pasos/día en promedio` });
    return out;
  }, [series, metrics]);

  const aiSeries = useMemo(() => series.filter((s) => s.pasos != null || s.sueno_horas != null || s.energia_activa_kcal != null || s.fc_reposo != null || s.hrv_sueno != null || s.spo2 != null || s.fc_durmiendo != null), [series]);
  const sig = useMemo(() => hashSig(aiSeries), [aiSeries]);
  const isStale = cached && cached.sig !== sig;
  const cacheOld = cached ? (Date.now() - new Date(cached.generatedAt).getTime()) > 7 * 86400000 : false;
  const confColor = response?.confianza === 'alta' ? 'green' : response?.confianza === 'media' ? 'amber' : 'red';

  const streak = useMemo(() => computeStreak(state.days || {}, state.snackBank, state.proteinBank, targets, todayKey(), state.dessertBank, state.antojoCustomItems || []), [state.days, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems]);
  const pesoTrend = useMemo(() => {
    const withW = series.filter((s) => s.peso_kg != null);
    if (withW.length < 2) return null;
    const first = withW[0], last = withW[withW.length - 1];
    return { from: first.peso_kg, to: last.peso_kg, delta: +(last.peso_kg - first.peso_kg).toFixed(1), dias: daysBetween(first.fecha, last.fecha) };
  }, [series]);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (daysWithHealth < 7) { setError(`Necesitas al menos 7 días con datos de salud. Tienes ${daysWithHealth}.`); return; }
    setLoading(true); setError(null);
    try {
      const T = targets || DEFAULT_TARGETS;
      const prompt = `Eres un analista de salud y rendimiento evaluando a Hugo (geriatra chileno de 36 años, en plan de pérdida de peso, entrena fuerza en Speediance + algo de cardio). USA TUTEO CHILENO. NO uses voseo. Sé directo, honesto y crítico — no adules. Usa los números reales del dataset.

META DIARIA: ${T.kcalMin}-${T.kcalMax} kcal · proteína ≥ ${T.proteinMin}g. Racha de adherencia actual: ${streak.current} días (mejor: ${streak.best}).
${pesoTrend ? `PESO: de ${pesoTrend.from} a ${pesoTrend.to} kg en ${pesoTrend.dias} días (${pesoTrend.delta >= 0 ? '+' : ''}${pesoTrend.delta} kg).` : 'Sin suficientes mediciones de peso en la ventana.'}

DATOS DIARIOS (28 días). Cada fila puede traer: pasos, energia_activa_kcal, sueno_horas, fc_reposo (en reposo), vo2max, peso_kg, cumple_meta (si ese día cumplió la meta calórica+proteína), kcal_consumido. Si tiene reloj con HeartWatch, además: hrv_sueno y hrv_vigilia (variabilidad cardíaca en ms — MAYOR es MEJOR recuperación), fc_durmiendo y fc_sedentaria (lpm — menor mejor), spo2 y spo2_durmiendo (% saturación), recuperacion_2min (caída de FC 2 min post-esfuerzo en lpm — MAYOR es mejor fitness cardiovascular). Campos en null = sin dato ese día.
${JSON.stringify(aiSeries, null, 2)}

IMPORTANTE: "energia_activa_kcal" y "pasos" son CONTEXTO de Apple Health — NO los restes de las kcal ni del déficit; el TDEE adaptativo ya incorpora la actividad. Restarlos sería doble conteo.

Evalúa CRÍTICAMENTE estas 4 dimensiones, cruzando datos entre sí (no las analices aisladas):
1. SUEÑO/ACTIVIDAD ↔ PESO Y ADHERENCIA: ¿hay relación entre dormir mal y los días que NO cumple la meta (cumple_meta=false)? ¿baja más de peso las semanas que se mueve más? Cita días/semanas concretos.
2. RECUPERACIÓN/ESTRÉS: el HRV (hrv_sueno) es el marcador RECTOR — un HRV que cae es señal de recuperación incompleta, estrés acumulado o sobre-entrenamiento. Cruza hrv_sueno + fc_durmiendo + fc_reposo + sueno_horas: ¿bajó el HRV o subió la FC durmiendo en alguna semana? ¿coincide con noches cortas, alcohol, o más carga de Speediance? ¿Debería bajar la intensidad alguna semana? Si no hay HRV, usa fc_reposo + sueño y dilo. (recuperacion_2min y spo2 son contexto secundario.)
3. ACTIVIDAD/NEAT: ¿es consistente o irregular? ¿días sedentarios? El NEAT importa para el déficit.
4. FITNESS: tendencia de vo2max, fc_reposo y recuperacion_2min en el tiempo — ¿su condición mejora?

Devuelve SOLO JSON, sin markdown:
{
  "resumen": "1-2 frases del estado general de su salud/recuperación y su relación con el objetivo",
  "peso_y_adherencia": "el cruce sueño/actividad ↔ peso y adherencia, con números/días reales (o 'sin datos suficientes')",
  "recuperacion": "evaluación de recuperación y estrés liderada por HRV (hrv_sueno) + fc_durmiendo + fc_reposo + sueño, con números reales",
  "actividad": "consistencia de actividad/NEAT con números",
  "fitness": "tendencia de fitness cardiovascular (vo2max/fc_reposo/recuperacion_2min)",
  "recomendaciones": [ { "que": "qué cambiar", "porque": "por qué importa para SU objetivo", "como": "cómo hacerlo, concreto" } ],
  "confianza": "alta|media|baja"
}

Reglas: 2 a 4 recomendaciones, las más importantes y accionables. Si una dimensión no tiene datos suficientes, dilo y baja la confianza. No inventes datos.`;
      const text = await askClaude(prompt, apiKey, 2800, MODEL_DEFAULT);
      const parsed = parseJsonLoose(text);
      if (!parsed?.resumen && !Array.isArray(parsed?.recomendaciones)) { setError('No se pudo parsear la respuesta.'); return; }
      setResponse(parsed);
      setState((prev) => ({ ...prev, aiCache: { ...(prev.aiCache || {}), health: { sig, response: parsed, generatedAt: new Date().toISOString() } } }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally { setLoading(false); }
  };

  const dirArrow = (m) => {
    if (m.dir === 'flat' || m.last == null) return { ch: '→', col: 'var(--bento-faint)' };
    const good = (m.dir === 'up') === m.goodUp;
    return { ch: m.dir === 'up' ? '↑' : '↓', col: good ? 'var(--bento-pos)' : 'var(--bento-warm)' };
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {showImport && <HeartWatchImportModal state={state} setState={setState} onClose={() => setShowImport(false)} />}
      <div className="px-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><span>❤️</span>Salud</h1>
          <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>Tu actividad, sueño y recuperación — y qué dicen sobre tu objetivo</p>
        </div>
        <button onClick={() => setShowImport(true)} className="shrink-0 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold flex items-center gap-1.5" title="Importar export CSV de HeartWatch">
          <span>⌚</span> Importar
        </button>
      </div>

      {daysWithHealth === 0 ? (
        <div className="bento-card text-center text-sm" style={{ borderStyle: 'dashed', color: 'var(--bento-muted)' }}>
          Aún no hay datos de Apple Health. Configura el atajo "Plan Hugo Health" en tu iPhone (lee pasos, energía activa, sueño, FC y VO₂máx y los manda solo), o usa <b>⌚ Importar</b> para subir un export CSV de HeartWatch. Acá verás tus tendencias y una evaluación crítica.
        </div>
      ) : (
        <>
          {/* Tiles por métrica */}
          <div className="bento-grid2 is-a items-stretch">
            {metrics.filter((m) => m.count > 0).map((m) => {
              const a = dirArrow(m);
              return (
                <button key={m.key} type="button" onClick={() => setDetail(m)}
                  className="bento-card text-left" style={{ padding: '14px 16px', cursor: 'pointer' }}
                  aria-label={`Ver detalle de ${m.label}`}>
                  <div className="flex items-center justify-between">
                    <div className="bento-label">{m.icon} {m.label}</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: a.col }}>{a.ch}</span>
                      <span style={{ fontSize: 13, color: 'var(--bento-faint)' }}>›</span>
                    </span>
                  </div>
                  <div className="bento-num" style={{ fontSize: 26, marginTop: 4 }}>
                    {m.last != null ? m.fmt(m.last) : '—'}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--bento-faint)' }}> {m.unit}</span>
                    {m.lastDate && m.lastDate !== todayKey() && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--bento-warm)', marginLeft: 6 }}>{formatDateLabel(m.lastDate, todayKey())}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--bento-faint)', marginTop: 2 }}>
                    prom {m.avg != null ? m.fmt(m.avg) : '—'} · {m.count}d
                    {m.key === 'sueno_horas' && (() => {
                      const low = m.vals.filter((v) => v < SLEEP_ALERT_H).length;
                      return low > 0 ? <span style={{ color: 'var(--bento-warm)', fontWeight: 600 }}> · {low}/{m.count} &lt;6h</span> : null;
                    })()}
                  </div>
                  <div style={{ marginTop: 8 }}><MetricSparkline points={m.spark} color={m.color} refY={m.key === 'sueno_horas' ? SLEEP_ALERT_H : null} /></div>
                </button>
              );
            })}
          </div>

          {/* Banderas automáticas */}
          {flags.length > 0 && (
            <div className="bento-card space-y-2">
              <div className="bento-label">Señales</div>
              <div className="space-y-1.5">
                {flags.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-xl"
                    style={f.tone === 'pos' ? { background: 'rgba(122,154,120,0.10)', color: 'var(--bento-pos)' } : { background: 'rgba(205,122,85,0.10)', color: 'var(--bento-warm)' }}>
                    <span>{f.tone === 'pos' ? '✅' : '⚠️'}</span><span style={{ lineHeight: 1.4 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Evaluación crítica con Claude */}
      <div className="bento-label" style={{ marginTop: 8 }}>Evaluación crítica · Claude</div>
      <div className="bento-card space-y-3">
        {!apiKey && (
          <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
        )}
        <button onClick={generate} disabled={loading || !apiKey || daysWithHealth < 7}
          className="w-full py-2.5 rounded-xl font-semibold"
          style={loading || !apiKey || daysWithHealth < 7
            ? { background: 'var(--bento-surface)', color: 'var(--bento-faint)' }
            : { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
          {loading ? 'Analizando tu salud…' : (response ? (isStale || cacheOld ? 'Actualizar evaluación' : 'Regenerar') : 'Evaluar mi salud con Claude ✨')}
        </button>
        {daysWithHealth < 7 && (
          <p style={{ fontSize: 11, color: 'var(--bento-faint)' }}>Necesitas al menos 7 días con datos de salud ({daysWithHealth} hasta ahora).</p>
        )}
        {error && <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>{error}</p>}
      </div>

      {response && (
        <>
          {response.confianza && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'var(--bento-surface)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: confColor === 'green' ? 'var(--bento-pos)' : confColor === 'amber' ? 'var(--bento-yellow)' : 'var(--bento-warm)' }} />
              <span style={{ fontSize: 11, color: 'var(--bento-muted)' }}>Confianza {response.confianza}{isStale && ' · datos cambiaron'}</span>
            </div>
          )}

          {response.resumen && (
            <div className="bento-card"><p className="text-sm">{response.resumen}</p></div>
          )}

          {[
            { key: 'peso_y_adherencia', icon: '⚖️', label: 'Peso y adherencia' },
            { key: 'recuperacion', icon: '🔋', label: 'Recuperación y estrés' },
            { key: 'actividad', icon: '👟', label: 'Actividad' },
            { key: 'fitness', icon: '🫁', label: 'Fitness' },
          ].filter((s) => response[s.key]).map((s) => (
            <div key={s.key} className="bento-card">
              <div className="bento-label" style={{ marginBottom: 8 }}>{s.icon} {s.label}</div>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--bento-muted)' }}>{response[s.key]}</p>
            </div>
          ))}

          {Array.isArray(response.recomendaciones) && response.recomendaciones.map((m, i) => (
            <div key={i} className="bento-card space-y-2.5">
              <div className="bento-label">🔧 {typeof m === 'string' ? m : m.que}</div>
              {m.porque && <p style={{ fontSize: 12.5, color: 'var(--bento-muted)', lineHeight: 1.5 }}>{m.porque}</p>}
              {m.como && <p style={{ fontSize: 12.5, lineHeight: 1.5, padding: '10px 12px', background: 'var(--bento-surface)', borderRadius: 8 }}>💡 {m.como}</p>}
            </div>
          ))}
        </>
      )}

      {detail && <HealthMetricDetail metric={detail} series={series} onClose={() => setDetail(null)} />}
    </div>
  );
}

// Detalle día por día de una métrica de salud: lista cronológica + máx/mín/prom + gráfico grande.
function HealthMetricDetail({ metric, series, onClose }) {
  const rows = useMemo(() => series
    .filter((s) => s[metric.key] != null)
    .map((s) => ({ fecha: s.fecha, value: Number(s[metric.key]) }))
    .reverse(), [series, metric.key]);
  const vals = rows.map((r) => r.value);
  const minV = vals.length ? Math.min(...vals) : null;
  const maxV = vals.length ? Math.max(...vals) : null;
  const fmtDay = (k) => new Date(k + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800" style={{ top: 0 }}>
          <div>
            <div className="bento-label">{metric.icon} {metric.label}</div>
            <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 2 }}>{rows.length} días con datos</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumen máx/prom/mín */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { lbl: 'Mínimo', v: minV },
              { lbl: 'Promedio', v: metric.avg },
              { lbl: 'Máximo', v: maxV },
            ].map((c) => (
              <div key={c.lbl} className="bento-card text-center" style={{ padding: '10px 8px' }}>
                <div style={{ fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--bento-faint)' }}>{c.lbl}</div>
                <div className="bento-num" style={{ fontSize: 18, marginTop: 2 }}>{c.v != null ? metric.fmt(c.v) : '—'}</div>
              </div>
            ))}
          </div>

          {/* Gráfico grande */}
          <div className="bento-card" style={{ padding: '14px 16px' }}>
            <MetricSparkline points={series.map((s, i) => ({ x: i, y: s[metric.key] }))} color={metric.color} height={90} refY={metric.key === 'sueno_horas' ? SLEEP_ALERT_H : null} />
            <div style={{ fontSize: 10, color: 'var(--bento-faint)', marginTop: 6, textAlign: 'center' }}>Últimos 28 días {metric.unit ? `· ${metric.unit}` : ''}{metric.key === 'sueno_horas' ? ' · línea = umbral 6h' : ''}</div>
          </div>

          {/* Lista día por día */}
          <div className="space-y-1">
            {rows.length === 0 ? (
              <div className="text-center text-sm py-6" style={{ color: 'var(--bento-faint)' }}>Sin mediciones registradas</div>
            ) : rows.map((r, i) => {
              const prev = rows[i + 1]; // siguiente en la lista = día anterior (orden descendente)
              const delta = prev ? r.value - prev.value : null;
              const up = delta != null && delta > 0;
              const good = delta != null && delta !== 0 && (up === metric.goodUp);
              return (
                <div key={r.fecha} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'var(--bento-surface)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--bento-muted)', textTransform: 'capitalize' }}>{fmtDay(r.fecha)}</span>
                  <span className="flex items-center gap-2">
                    <span className="bento-num" style={{ fontSize: 15 }}>{metric.fmt(r.value)}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--bento-faint)' }}> {metric.unit}</span></span>
                    {delta != null && delta !== 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, minWidth: 26, textAlign: 'right', color: good ? 'var(--bento-pos)' : 'var(--bento-warm)' }}>
                        {up ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sparkline SVG liviano (línea, sin librería): normaliza la serie a un viewBox fijo. Si hay un
// solo punto dibuja una marca; vacío no renderiza nada.
function Sparkline({ values, color = 'var(--bento-blue)', width = 96, height = 28 }) {
  const vals = (values || []).filter((v) => v != null);
  if (vals.length < 1) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => vals.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (vals.length - 1);
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  if (vals.length === 1) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <circle cx={x(0)} cy={y(vals[0])} r={2.5} fill={color} />
      </svg>
    );
  }
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}

function ExercisesView({ state, setState, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const [capturing, setCapturing] = useState(false);
  const cached = state.aiCache?.exercise;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [csvFrom, setCsvFrom] = useState('');           // '' = sin límite inferior (todo)
  const [csvTo, setCsvTo] = useState(todayKey());

  const stats = useMemo(() => computeExerciseStats(state.days || {}, todayKey(), 8), [state.days]);

  // Récords y progresión acotados a la rutina vigente (cruce por slug; "otros" = lo no-rutina).
  const routineProg = useMemo(() => computeRoutineExerciseProgress(stats, state.routine, todayKey()), [stats, state.routine]);

  const trainingHistory = useMemo(() => {
    const start = shiftDate(todayKey(), -55);
    return (stats.sessions || [])
      .filter((s) => s.date >= start)
      .map((s) => {
        const dow = new Date(s.date + 'T12:00:00').getDay();
        return {
          fecha: s.date, dia: DAY_SHORT[dow], nombre: s.name, tipo: s.type,
          kcal: Math.round(s.kcal), minutos: s.minutes, volumen_kg: s.volumeKg,
          distancia_km: s.distanceM != null ? +(s.distanceM / 1000).toFixed(1) : null,
          potencia_w: s.avgPowerW, cadencia_rpm: s.avgCadenceRpm, fc_prom: s.avgHr, fc_max: s.maxHr ?? null,
          // Intensidad de HeartWatch (donde haya): RPE, carga, kcal/h y minutos por zona de FC.
          rpe: s.rpe ?? null, carga: s.trainingLoad ?? null, kcal_h: s.calsPerHour ?? null,
          zonas_fc_min: s.hrZones || null, zonas_fc_pct: s.hrZonePct || null,
          ejercicios: (s.exercises || []).map((e) => ({
            nombre: e.name, musculo: e.muscle || null,
            series: e.sets ?? null, reps: e.reps ?? null, peso_kg: e.weightKg ?? null,
            volumen_kg: e.volumeKg ?? null, rm1_kg: e.oneRepMaxKg ?? null, calidad: e.quality ?? null,
          })),
        };
      });
  }, [stats.sessions]);

  const sig = useMemo(() => hashSig(trainingHistory), [trainingHistory]);
  const isStale = cached && cached.sig !== sig;
  const cacheAgeMs = cached ? (Date.now() - new Date(cached.generatedAt).getTime()) : Infinity;
  const cacheOld = cacheAgeMs > 7 * 86400000;

  const addCapture = (item, date) => {
    const key = date || todayKey();
    setState((prev) => {
      const prevDay = prev.days[key] || {};
      const ex = Array.isArray(prevDay.exercise) ? prevDay.exercise : [];
      return { ...prev, days: { ...prev.days, [key]: { ...prevDay, exercise: [...ex, { ...item, id: item.id ?? uuid(), ts: item.ts ?? Date.now() }] } } };
    });
    setCapturing(false);
  };

  // Historial: borrar una sesión (entrada de day.exercise[]) o corregir el músculo de sus ejercicios.
  const removeSession = (date, id) => {
    if (!window.confirm('¿Borrar esta sesión de entrenamiento?')) return;
    setState((prev) => {
      const d = prev.days[date]; if (!d) return prev;
      return { ...prev, days: { ...prev.days, [date]: { ...d, exercise: (d.exercise || []).filter((w) => w.id !== id) } } };
    });
  };
  // Export CSV (reusa el patrón de exportCsv de Ajustes). Rango [csvFrom, csvTo]; csvFrom '' = todo.
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const downloadCsv = (lines, name) => {
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const rangeSessions = () => (stats.sessions || [])
    .filter((s) => (!csvFrom || s.date >= csvFrom) && s.date <= (csvTo || todayKey()))
    .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const exportDetailed = () => {
    const header = ['fecha', 'sesion', 'ejercicio', 'musculo', 'series', 'reps', 'peso_max_kg', 'volumen_kg', 'rm1_kg', 'calidad'];
    const lines = [header.join(',')];
    for (const s of rangeSessions()) {
      for (const e of (s.exercises || [])) {
        lines.push([s.date, s.name, e.name, e.muscle ?? '', e.sets ?? '', e.reps ?? '', e.weightKg ?? '', e.volumeKg ?? '', e.oneRepMaxKg ?? '', e.quality ?? ''].map(csvCell).join(','));
      }
    }
    downloadCsv(lines, `plan-hugo-ejercicios-detalle-${todayKey()}.csv`);
  };
  const exportSummary = () => {
    const header = ['fecha', 'tipo', 'nombre', 'kcal', 'minutos', 'volumen_kg', 'n_ejercicios', 'distancia_km', 'potencia_w', 'cadencia_rpm', 'fc_prom'];
    const lines = [header.join(',')];
    for (const s of rangeSessions()) {
      lines.push([
        s.date, s.type || 'strength', s.name, Math.round(s.kcal), s.minutes ?? '', s.volumeKg ?? '', (s.exercises || []).length,
        s.distanceM != null ? (s.distanceM / 1000).toFixed(2) : '', s.avgPowerW ?? '', s.avgCadenceRpm ?? '', s.avgHr ?? '',
      ].map(csvCell).join(','));
    }
    downloadCsv(lines, `plan-hugo-ejercicios-sesiones-${todayKey()}.csv`);
  };

  // ── Exportar la evaluación de Claude (PDF + Markdown) para discutirla con otra IA ──
  const downloadBlob = (content, name, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  // jsPDF (helvetica) no dibuja emojis: para el PDF se quitan; en el Markdown se conservan.
  const stripEmoji = (s) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();

  // Fuente única de verdad: secciones {heading, lines[]} con evaluación + datos de respaldo.
  const buildEvalSections = () => {
    const r = response || {};
    const secs = [];
    const gen = cached?.generatedAt
      ? new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    secs.push({ heading: 'Plan Hugo — Evaluación de rutina', lines: [
      gen ? `Generado: ${gen}` : null,
      r.confidence ? `Confianza: ${r.confidence}` : null,
    ].filter(Boolean) });
    if (r.resumen || r.consistencia) secs.push({ heading: 'Resumen', lines: [r.resumen, r.consistencia ? `📅 ${r.consistencia}` : null].filter(Boolean) });
    if (Array.isArray(r.seguir) && r.seguir.length) secs.push({ heading: '✅ Qué seguir', lines: r.seguir.map((s) => `• ${s}`) });
    if (Array.isArray(r.mejorar) && r.mejorar.length) {
      const lines = [];
      r.mejorar.forEach((m, i) => { const o = typeof m === 'string' ? { que: m } : m; lines.push(`${i + 1}. ${o.que}`); if (o.porque) lines.push(`   Por qué: ${o.porque}`); if (o.como) lines.push(`   Cómo: ${o.como}`); });
      secs.push({ heading: '🔧 Qué mejorar', lines });
    }
    if (r.desbalances) secs.push({ heading: '⚖️ Desbalances', lines: [r.desbalances] });
    if (r.progresion) secs.push({ heading: '📈 Progresión', lines: [r.progresion] });
    if (r.nota_critica) secs.push({ heading: '🎯 Nota crítica', lines: [r.nota_critica] });
    secs.push({ heading: '— Datos de respaldo —', lines: [
      `Ventana: últimas ${stats.weeks} semanas`,
      `Frecuencia: ${stats.freqPerWeek.toFixed(1)}/sem (fuerza ${stats.freqStrengthPerWeek.toFixed(1)} + cardio ${stats.freqCardioPerWeek.toFixed(1)})`,
      `Sesiones: ${stats.totalSessions} totales · ${stats.sessionsThisMonth} este mes · última hace ${stats.daysSinceLast ?? '?'} días`,
    ] });
    if (stats.muscleVolume?.length) secs.push({ heading: 'Volumen por grupo muscular (series)', lines: stats.muscleVolume.map((m) => `• ${m.muscle}: ${m.sets}`) });
    if (stats.byExercise?.length) {
      secs.push({ heading: 'Récords por ejercicio', lines: stats.byExercise.slice(0, 25).map((x) => {
        const parts = []; if (x.bestRm != null) parts.push(`1RM ${x.bestRm}`); if (x.bestWeight != null) parts.push(`peso ${x.bestWeight}`); if (x.bestVolume != null) parts.push(`vol ${Math.round(x.bestVolume)}`);
        return `• ${x.name}: ${parts.join(' · ')}`;
      }) });
      const prog = stats.byExercise.filter((x) => (x.entries || []).length >= 2).slice(0, 25).map((x) => {
        const v = (e) => (e.oneRepMaxKg ?? e.weightKg);
        const first = x.entries[0], last = x.entries[x.entries.length - 1];
        const fv = v(first), lv = v(last); if (fv == null || lv == null) return null;
        return `• ${x.name}: ${first.date} ${fv} → ${last.date} ${lv} kg (${lv - fv >= 0 ? '+' : ''}${(lv - fv).toFixed(0)})`;
      }).filter(Boolean);
      if (prog.length) secs.push({ heading: 'Progresión por ejercicio (1RM/peso)', lines: prog });
    }
    const hist = (trainingHistory || []).map((s) => `${s.fecha} · ${s.tipo} · ${s.nombre} · ${s.kcal} kcal${s.volumen_kg ? ` · ${Math.round(s.volumen_kg)} kg` : ''}${s.distancia_km ? ` · ${s.distancia_km} km` : ''}${(s.ejercicios || []).length ? ` · ${s.ejercicios.length} ej` : ''}`);
    if (hist.length) secs.push({ heading: `Historial de sesiones (${hist.length})`, lines: hist });
    return secs;
  };

  const exportEvalMarkdown = () => {
    const secs = buildEvalSections();
    let md = '';
    secs.forEach((s, i) => { md += (i === 0 ? `# ${s.heading}\n\n` : `## ${s.heading}\n\n`); md += s.lines.join('\n') + '\n\n'; });
    md += '## Historial detallado (JSON)\n\n```json\n' + JSON.stringify(trainingHistory, null, 2) + '\n```\n';
    downloadBlob(md, `plan-hugo-evaluacion-${todayKey()}.md`, 'text/markdown;charset=utf-8');
  };

  const exportEvalPdf = async () => {
    try { await loadScript(JSPDF_SRC); } catch {}
    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) { setError('No se pudo cargar el generador de PDF. Usa "Exportar texto", o reintenta con conexión.'); return; }
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48, pageH = doc.internal.pageSize.getHeight(), maxW = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;
    const ensure = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };
    buildEvalSections().forEach((s, si) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(si === 0 ? 15 : 12);
      ensure(22); doc.text(stripEmoji(s.heading) || s.heading, margin, y); y += si === 0 ? 24 : 18;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      for (const line of s.lines) {
        for (const w of doc.splitTextToSize(stripEmoji(line), maxW)) { ensure(14); doc.text(w, margin, y); y += 14; }
      }
      y += 8;
    });
    doc.save(`plan-hugo-evaluacion-${todayKey()}.pdf`);
  };

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (stats.totalSessions < 3) { setError(`Necesitas al menos 3 sesiones registradas. Tienes ${stats.totalSessions}.`); return; }
    setLoading(true); setError(null);
    try {
      const prompt = `Eres un entrenador de fuerza chileno evaluando el entrenamiento de Hugo (geriatra de 36 años en plan de pérdida de peso). USA TUTEO CHILENO. Sé directo, honesto y crítico — no adules. Usa números reales del historial.

FRECUENCIA: ${stats.freqPerWeek.toFixed(1)} sesiones/semana (últimas ${stats.weeks} semanas), ${stats.totalSessions} sesiones totales registradas, última hace ${stats.daysSinceLast ?? '?'} días.

HISTORIAL (sesiones, recientes primero):
${JSON.stringify(trainingHistory, null, 2)}

Cada sesión tiene "tipo": "strength" (fuerza, con ejercicios) o "cardio" (bici/trote/etc., con distancia_km/potencia_w/fc_prom y SIN ejercicios). Considera el BALANCE fuerza vs cardio. En las de fuerza, cada ejercicio puede traer rm1_kg (1RM estimado), volumen_kg y calidad (nota A/B/C/D de técnica). Úsalos: la PROGRESIÓN se ve si rm1_kg/peso_kg/volumen suben sesión a sesión para el mismo ejercicio o grupo (en cardio, si sube distancia/potencia); la TÉCNICA se ve en la nota de calidad (una C/D repetida = problema a corregir).

Algunas sesiones traen datos de INTENSIDAD del reloj (HeartWatch): rpe (esfuerzo percibido 1-10), carga (carga de entrenamiento), kcal_h (kcal/hora) y zonas_fc_min ({z90,z80,z70,z60,z50} = minutos en cada zona de FC, z90 ≈ máxima). Úsalos para juzgar la DISTRIBUCIÓN de intensidad, no solo el volumen: si casi todo cae en z50-z60 el estímulo cardiovascular es bajo; mucho z80-z90 sostenido sin descanso suficiente es señal de carga alta. Cruza rpe/carga con la recuperación si la mencionas.

Evalúa: consistencia/frecuencia, volumen por grupo muscular (¿desbalances? ¿algún músculo descuidado?), progresión (¿sube 1RM/peso/volumen en el tiempo o está estancado?), distribución de intensidad (zonas de FC / RPE / carga donde haya), técnica (notas de calidad bajas) y qué cambiarías.

Devuelve SOLO JSON, sin markdown:
{
  "resumen": "1-2 frases del estado general",
  "consistencia": "evaluación de la frecuencia con números",
  "seguir": ["cosas que está haciendo bien y debe mantener"],
  "mejorar": [ { "que": "qué cambiar", "porque": "por qué importa", "como": "cómo hacerlo, concreto" } ],
  "desbalances": "grupos sobre/subtrabajados con números (o 'sin datos suficientes' si no hay desglose por ejercicio)",
  "progresion": "¿está progresando? evidencia",
  "nota_critica": "evaluación honesta y directa, sin adular",
  "confidence": "alta|media|baja"
}

Reglas:
- 2 a 4 items en "mejorar", los más importantes.
- Si no hay desglose por ejercicio en el historial, dilo en desbalances/progresion y baja la confidence.
- No inventes datos.`;
      const text = await askClaude(prompt, apiKey, 3200);
      const parsed = parseJsonLoose(text);
      if (!parsed?.resumen && !parsed?.mejorar) { setError('No se pudo parsear la respuesta.'); return; }
      setResponse(parsed);
      setState((prev) => ({ ...prev, aiCache: { ...(prev.aiCache || {}), exercise: { sig, response: parsed, generatedAt: new Date().toISOString() } } }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally { setLoading(false); }
  };

  // Chips de los últimos 28 días (verde si entrenó)
  const trainedSet = new Set(stats.trainedDates);
  const last28 = [];
  for (let i = 27; i >= 0; i--) {
    const d = shiftDate(todayKey(), -i);
    last28.push({ date: d, trained: trainedSet.has(d), dow: new Date(d + 'T12:00:00').getDay() });
  }
  const maxWeekSessions = Math.max(1, ...stats.weekBuckets.map((w) => w.sessions));
  const maxMuscle = Math.max(1, ...stats.muscleVolume.map((m) => m.sets));
  const maxTonnage = Math.max(1, ...stats.tonnage.weeks.map((w) => w.volumeKg));
  const confColor = response?.confidence === 'alta' ? 'green' : response?.confidence === 'media' ? 'amber' : 'red';
  // Color por grupo muscular (variante B): piernas→ink, espalda→blue, pecho/brazos→warm,
  // core→yellow, movilidad→lilac, glúteos/hombros→pos. Las claves vienen en minúscula.
  const muscleColorVar = (m) => {
    const k = (m || '').toLowerCase();
    if (k.includes('pierna') || k.includes('cuad') || k.includes('cuád')) return 'var(--bento-ink)';
    if (k.includes('espalda') || k.includes('dorsal')) return 'var(--bento-blue)';
    if (k.includes('pecho') || k.includes('brazo') || k.includes('bicep') || k.includes('bícep') || k.includes('tricep') || k.includes('trícep')) return 'var(--bento-warm)';
    if (k.includes('core') || k.includes('abdom')) return 'var(--bento-yellow)';
    if (k.includes('movil')) return 'var(--bento-lilac)';
    if (k.includes('glute') || k.includes('glúte') || k.includes('hombro')) return 'var(--bento-pos)';
    return 'var(--bento-blue)';
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><span>🏋️</span>Ejercicios</h1>
        <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>Tus rutinas, consistencia y evaluación crítica</p>
      </div>

      <button onClick={() => setCapturing(true)}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
        style={{ background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
        <span className="text-base">📸</span><span>Subir captura de entrenamiento</span>
      </button>

      {stats.totalSessions === 0 ? (
        <div className="bento-card text-center text-sm" style={{ borderStyle: 'dashed', color: 'var(--bento-muted)' }}>
          Aún no hay entrenamientos registrados. Sube una captura cada día que entrenes y acá verás tu consistencia y una evaluación crítica de tu rutina.
        </div>
      ) : (
        <>
          {/* Hero · 4 stats */}
          <div className="bento-grid4">
            <div className="bento-card" style={{ padding: '16px 18px' }}>
              <div className="bento-label">Frecuencia</div>
              <div className="bento-num" style={{ fontSize: 32, marginTop: 4 }}>
                {stats.freqPerWeek.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--bento-faint)' }}> /sem</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 4 }}>
                {stats.cardioSessions > 0
                  ? `🏋️ ${stats.freqStrengthPerWeek.toFixed(1)} · 🚴 ${stats.freqCardioPerWeek.toFixed(1)} /sem`
                  : `últimas ${stats.weeks} sem`}
              </div>
            </div>
            <div className="bento-card" style={{ padding: '16px 18px' }}>
              <div className="bento-label">Este mes</div>
              <div className="bento-num" style={{ fontSize: 32, marginTop: 4 }}>{stats.sessionsThisMonth}</div>
              <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 4 }}>sesiones</div>
            </div>
            <div className="bento-card" style={{ padding: '16px 18px' }}>
              <div className="bento-label">Totales</div>
              <div className="bento-num" style={{ fontSize: 32, marginTop: 4 }}>{stats.totalSessions}</div>
              <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 4 }}>sesiones registradas</div>
            </div>
            <div className="bento-card" style={{ padding: '16px 18px' }}>
              <div className="bento-label">Última</div>
              <div className="bento-num" style={{ fontSize: 32, marginTop: 4 }}>{stats.daysSinceLast === 0 ? 'Hoy' : stats.daysSinceLast != null ? `${stats.daysSinceLast}d` : '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 4 }}>desde la última</div>
            </div>
          </div>

          {/* Sesiones por semana · Días entrenados */}
          <div className="bento-grid2 is-a items-start">
            <div className="bento-card">
              <div className="bento-label" style={{ marginBottom: 16 }}>Sesiones por semana</div>
              <div className="flex items-end gap-2.5" style={{ height: 104 }}>
                {stats.weekBuckets.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="bento-num" style={{ fontSize: 11, color: 'var(--bento-faint)' }}>{w.sessions}</div>
                    <div style={{ width: '100%', maxWidth: 54, height: `${Math.max(4, (w.sessions / maxWeekSessions) * 72)}px`, background: 'var(--bento-ink)', borderRadius: 4 }} title={`${w.sessions} sesiones`} />
                    <div className="bento-mono" style={{ fontSize: 9, color: 'var(--bento-faint)' }}>{w.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bento-card">
              <div className="bento-label" style={{ marginBottom: 14 }}>Días entrenados · últimas 4 semanas</div>
              <div className="flex flex-wrap gap-1.5">
                {last28.map((d) => (
                  <div key={d.date} title={d.date} style={{ width: 18, height: 18, borderRadius: 4, background: d.trained ? 'var(--bento-ink)' : 'var(--bento-surface)' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Tonelaje semanal (tendencia de carga) · Esfuerzo medio (RPE + FC) */}
          {(stats.tonnage.weeksWithData >= 1 || stats.effort.avgRpe != null || stats.effort.avgHr != null) && (
            <div className="bento-grid2 is-a items-start">
              <div className="bento-card">
                <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: 14 }}>
                  <div className="bento-label">Tonelaje semanal · carga kg/sem</div>
                  {stats.tonnage.pctPerWeek != null && (
                    <span className="bento-mono" style={{ fontSize: 12, fontWeight: 600, color: stats.tonnage.pctPerWeek > 0 ? 'var(--bento-pos)' : stats.tonnage.pctPerWeek < 0 ? 'var(--bento-warm)' : 'var(--bento-faint)' }}>
                      {stats.tonnage.pctPerWeek > 0 ? '↑' : stats.tonnage.pctPerWeek < 0 ? '↓' : ''} {stats.tonnage.pctPerWeek > 0 ? '+' : ''}{stats.tonnage.pctPerWeek}%/sem
                    </span>
                  )}
                </div>
                {stats.tonnage.weeksWithData >= 1 ? (
                  <>
                    <div className="flex items-end gap-2.5" style={{ height: 96 }}>
                      {stats.tonnage.weeks.map((w, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                          <div style={{ width: '100%', maxWidth: 54, height: `${Math.max(3, (w.volumeKg / maxTonnage) * 72)}px`, background: w.volumeKg > 0 ? 'var(--bento-blue)' : 'var(--bento-surface)', borderRadius: 4 }} title={`${w.volumeKg.toLocaleString('es-CL')} kg`} />
                          <div className="bento-mono" style={{ fontSize: 9, color: 'var(--bento-faint)' }}>{w.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bento-muted)', marginTop: 10 }}>
                      Esta semana <span className="bento-mono" style={{ fontWeight: 600, color: 'var(--bento-ink)' }}>{stats.tonnage.current.toLocaleString('es-CL')} kg</span>
                      {stats.tonnage.slopePerWeek != null && stats.tonnage.slopePerWeek !== 0 && <> · {stats.tonnage.slopePerWeek > 0 ? '+' : ''}{stats.tonnage.slopePerWeek.toLocaleString('es-CL')} kg/sem de tendencia</>}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--bento-faint)' }}>Sin volumen de carga aún. Sube capturas con kg×reps para ver la tendencia de tonelaje.</p>
                )}
              </div>
              <div className="bento-card">
                <div className="bento-label" style={{ marginBottom: 16 }}>Esfuerzo medio · últimas {stats.weeks} sem</div>
                {(stats.effort.avgRpe != null || stats.effort.avgHr != null) ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="bento-label" style={{ fontSize: 9, marginBottom: 4 }}>RPE medio</div>
                      {stats.effort.avgRpe != null ? (
                        <>
                          <div className="bento-num" style={{ fontSize: 26 }}>{stats.effort.avgRpe}<span style={{ fontSize: 13, color: 'var(--bento-faint)', fontWeight: 400 }}>/10</span></div>
                          {stats.effort.rpeTrend != null && stats.effort.rpeTrend !== 0 && (
                            <div className="bento-mono" style={{ fontSize: 11, color: stats.effort.rpeTrend > 0 ? 'var(--bento-warm)' : 'var(--bento-pos)' }}>{stats.effort.rpeTrend > 0 ? '↑ +' : '↓ '}{stats.effort.rpeTrend} vs antes</div>
                          )}
                          <div style={{ fontSize: 9, color: 'var(--bento-faint)', marginTop: 2 }}>{stats.effort.nRpe} sesiones</div>
                        </>
                      ) : <div style={{ fontSize: 12, color: 'var(--bento-faint)' }}>—</div>}
                    </div>
                    <div>
                      <div className="bento-label" style={{ fontSize: 9, marginBottom: 4 }}>FC media</div>
                      {stats.effort.avgHr != null ? (
                        <>
                          <div className="bento-num" style={{ fontSize: 26 }}>{stats.effort.avgHr}<span style={{ fontSize: 13, color: 'var(--bento-faint)', fontWeight: 400 }}> lpm</span></div>
                          {stats.effort.hrTrend != null && stats.effort.hrTrend !== 0 && (
                            <div className="bento-mono" style={{ fontSize: 11, color: stats.effort.hrTrend > 0 ? 'var(--bento-warm)' : 'var(--bento-pos)' }}>{stats.effort.hrTrend > 0 ? '↑ +' : '↓ '}{stats.effort.hrTrend} vs antes</div>
                          )}
                          <div style={{ fontSize: 9, color: 'var(--bento-faint)', marginTop: 2 }}>{stats.effort.nHr} sesiones</div>
                        </>
                      ) : <div style={{ fontSize: 12, color: 'var(--bento-faint)' }}>—</div>}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--bento-faint)' }}>Sin datos de RPE/FC. Importa HeartWatch o registra entrenos con pulso para verlo.</p>
                )}
              </div>
            </div>
          )}

          {/* Volumen por grupo muscular */}
          {stats.muscleVolume.length > 0 && (
            <div className="bento-card">
              <div className="bento-label" style={{ marginBottom: 16 }}>Volumen por grupo muscular · series/sem ({stats.weeks} sem)</div>
              <div className="flex flex-col gap-3">
                {stats.muscleVolume.map((m) => {
                  const perWeek = m.sets / stats.weeks;
                  return (
                  <div key={m.muscle} className="grid items-center gap-3" style={{ gridTemplateColumns: '84px 1fr 44px' }}>
                    <div className="capitalize" style={{ fontSize: 12, color: 'var(--bento-muted)' }}>{m.muscle}</div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bento-surface)', overflow: 'hidden' }} title={`${m.sets} series en ${stats.weeks} sem`}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${(m.sets / maxMuscle) * 100}%`, background: muscleColorVar(m.muscle) }} />
                    </div>
                    <div className="bento-mono" style={{ fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{perWeek.toFixed(1)}</div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.detailSessions === 0 && (
            <p className="text-[11px] p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>
              💡 Ninguna captura trae el desglose por ejercicio todavía. Sube capturas que listen los movimientos (series/reps/peso) para desbloquear el análisis de desbalances y progresión.
            </p>
          )}

          {/* Aviso de mesetas · ejercicios de la rutina sin progreso reciente */}
          {routineProg.hasRoutine && (() => {
            const stuck = routineProg.routine.filter((x) => x.data && x.stagnant);
            if (!stuck.length) return null;
            return (
              <div className="bento-card" style={{ borderLeft: '3px solid var(--bento-warm)' }}>
                <div className="bento-label" style={{ marginBottom: 8, color: 'var(--bento-warm)' }}>⚠️ Posible meseta · {stuck.length} ejercicio{stuck.length > 1 ? 's' : ''}</div>
                <div className="flex flex-col gap-2">
                  {stuck.map((x) => (
                    <div key={x.slug} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                      <span className="flex items-center gap-1.5 min-w-0"><span className="shrink-0">{emojiForExercise(x.name)}</span><span className="truncate">{x.name}</span></span>
                      <span className="bento-mono shrink-0" style={{ color: 'var(--bento-faint)', fontSize: 11 }}>{x.current != null ? `${x.current} kg` : ''}{x.daysSince != null ? ` · hace ${x.daysSince}d` : ''}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--bento-muted)', marginTop: 10 }}>Sin récord en las últimas sesiones. Considera un deload, subir reps antes que peso, o cambiar la variante.</p>
              </div>
            );
          })()}

          {/* Adherencia a la rutina · esta semana */}
          {routineProg.hasRoutine && (() => {
            const r = routineProg.routine;
            const done = r.filter((x) => x.trainedThisWeek).length;
            return (
              <div className="bento-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="bento-label">🎯 Adherencia a la rutina · esta semana</div>
                  <div className="bento-mono" style={{ fontSize: 12, fontWeight: 600 }}>{done}/{r.length}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.map((x) => {
                    const label = x.trainedThisWeek ? '✓' : (x.daysSince != null ? `${x.daysSince}d` : '—');
                    return (
                      <span key={x.slug} title={x.daysSince != null ? `Última hace ${x.daysSince} días` : 'Sin registro'}
                        className="inline-flex items-center gap-1.5" style={{
                          padding: '5px 9px', borderRadius: 8, fontSize: 12,
                          background: x.trainedThisWeek ? 'rgba(122,154,120,0.16)' : 'var(--bento-surface)',
                          color: x.trainedThisWeek ? 'var(--bento-pos)' : 'var(--bento-faint)',
                          border: x.trainedThisWeek ? '1px solid var(--bento-pos)' : '1px solid var(--bento-hairline)',
                        }}>
                        {emojiForExercise(x.name)} <span className="truncate" style={{ maxWidth: 140 }}>{x.name}</span>
                        <span className="bento-mono" style={{ fontSize: 10 }}>{label}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Récords + historial por ejercicio · SOLO ejercicios de la rutina (expandible) */}
          {routineProg.hasRoutine ? (
            <div className="bento-card space-y-1">
              <div className="bento-label" style={{ marginBottom: 4 }}>🏋️ Récords e historial · ejercicios de la rutina</div>
              <div style={{ fontSize: 10.5, color: 'var(--bento-faint)', marginBottom: 6 }}>Toca un ejercicio para ver su historial · ↑ = sugerencia de carga próxima</div>
              {routineProg.routine.map((it) => {
                const noData = it.entries.length < 1;
                const primVal = it.bestWeight != null ? it.bestWeight : it.bestRm;
                const head = (
                  <div className="flex items-center gap-3" style={{ padding: '8px 0' }}>
                    <div className="min-w-0" style={{ flex: '1 1 0' }}>
                      <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        <span>{emojiForExercise(it.name)}</span><span className="truncate">{it.name}</span>
                        {it.stagnant && <span title="Sin progreso en las últimas sesiones" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(205,122,85,0.14)', color: 'var(--bento-warm)' }}>meseta</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--bento-faint)', marginTop: 2 }}>
                        {noData ? 'sin datos aún' : (
                          <>
                            <b style={{ color: 'var(--bento-ink)' }}>PR {primVal} kg</b>
                            {it.bestVolume != null ? <span> · vol {Math.round(it.bestVolume)}</span> : null}
                            {it.delta != null && it.delta !== 0 ? <span style={{ color: it.delta >= 0 ? 'var(--bento-pos)' : 'var(--bento-warm)' }}> · {it.delta >= 0 ? '+' : ''}{it.delta}</span> : null}
                            {it.suggestNextKg != null ? (it.suggestUp
                              ? <span style={{ color: 'var(--bento-blue)' }}> · ↑ ~{it.suggestNextKg}kg</span>
                              : <span style={{ color: 'var(--bento-faint)' }}> · → mantén {it.suggestNextKg}kg</span>) : null}
                          </>
                        )}
                      </div>
                    </div>
                    {!noData && it.spark.length >= 1 && <div className="shrink-0"><Sparkline values={it.spark} color={it.stagnant ? 'var(--bento-warm)' : 'var(--bento-blue)'} /></div>}
                  </div>
                );
                if (noData) {
                  return <div key={it.slug} style={{ borderTop: '1px solid var(--bento-hairline)', opacity: 0.55 }}>{head}</div>;
                }
                return (
                  <details key={it.slug} style={{ borderTop: '1px solid var(--bento-hairline)' }}>
                    <summary style={{ listStyle: 'none', cursor: 'pointer' }}>{head}</summary>
                    <div style={{ padding: '2px 0 10px 26px' }}>
                      {it.entries.slice().reverse().map((e, i) => (
                        <div key={i} className="bento-mono flex items-center justify-between" style={{ fontSize: 11, padding: '3px 0', color: 'var(--bento-muted)' }}>
                          <span style={{ color: 'var(--bento-faint)' }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</span>
                          <span style={{ flex: 1, textAlign: 'right' }}>
                            {e.weightKg != null ? `${e.weightKg}kg` : (e.oneRepMaxKg != null ? `1RM ${e.oneRepMaxKg}` : '—')}
                            {e.reps != null ? ` ×${e.reps}` : ''}
                            {e.volumeKg != null ? ` · ${Math.round(e.volumeKg)} vol` : ''}
                            {e.quality ? ` · ${e.quality}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : stats.byExercise.length > 0 ? (
            <div className="bento-card">
              <div className="bento-label" style={{ marginBottom: 6 }}>🏆 Récords por ejercicio</div>
              <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginBottom: 12 }}>Carga tu rutina en la pestaña Rutina para ver acá los PR e historial de tus ejercicios.</div>
              <div className="bento-grid2 is-eq">
                {stats.byExercise.slice(0, 6).map((x) => {
                  const primVal = x.bestRm != null ? x.bestRm : x.bestWeight;
                  return (
                    <div key={x.name} style={{ padding: '12px 14px', border: '1px solid var(--bento-hairline)', borderRadius: 10 }}>
                      <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        <span>{emojiForExercise(x.name)}</span><span className="truncate">{x.name}</span>
                      </div>
                      <div className="bento-num" style={{ fontSize: 18, marginTop: 8 }}>{primVal ?? '—'}<span style={{ fontSize: 10, color: 'var(--bento-faint)' }}> kg</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Historial de sesiones (ver/editar/borrar) */}
          <div className="bento-card space-y-2">
            <button onClick={() => setHistoryOpen((v) => !v)} className="w-full flex items-center justify-between">
              <span className="bento-label">📜 Historial de sesiones ({stats.sessions.length})</span>
              <span style={{ fontSize: 10, color: 'var(--bento-faint)' }}>{historyOpen ? '▼' : '▶'}</span>
            </button>
            {historyOpen && (
              <div className="space-y-1.5 pt-1">
                {stats.sessions.map((s) => (
                  <div key={s.id || s.date + s.name} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ border: '1px solid var(--bento-hairline)' }}>
                    <span className="text-base shrink-0">{s.type === 'cardio' ? '🚴' : '🏋️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{new Date(s.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 11, color: 'var(--bento-faint)' }}>
                        {Math.round(s.kcal)} kcal
                        {s.type === 'cardio'
                          ? `${s.distanceM != null ? ` · ${(s.distanceM / 1000).toFixed(1)} km` : ''}${s.avgPowerW != null ? ` · ${s.avgPowerW} W` : ''}${s.minutes != null ? ` · ${s.minutes} min` : ''}`
                          : `${s.volumeKg ? ` · ${Math.round(s.volumeKg)} kg` : ''}${s.exercises.length ? ` · ${s.exercises.length} ej.` : ''}`}
                      </div>
                      {(s.avgHr != null || s.maxHr != null || s.rpe != null || s.trainingLoad != null || s.mets != null) && (
                        <div style={{ fontSize: 10.5, color: 'var(--bento-faint)', marginTop: 1 }}>
                          {[s.avgHr != null ? `❤️ ${Math.round(s.avgHr)} lpm` : null,
                            s.maxHr != null ? `máx ${Math.round(s.maxHr)}` : null,
                            s.rpe != null ? `RPE ${s.rpe}` : null,
                            s.trainingLoad != null ? `carga ${Math.round(s.trainingLoad)}` : null,
                            s.mets != null ? `${s.mets.toFixed(1)} MET` : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {s.hrZonePct && (
                        <div style={{ fontSize: 10.5, color: 'var(--bento-faint)', marginTop: 1 }}>
                          🫀 zonas FC {s.hrZonePct.split('/').map((p, i) => `Z${i + 1} ${p}%`).join(' · ')}
                        </div>
                      )}
                      {s.hrSeries && s.hrSeries.length >= 2 && (
                        <div style={{ marginTop: 3 }} title="Curva de FC intra-sesión">
                          <MetricSparkline points={s.hrSeries.map((p, i) => ({ x: i, y: p.bpm }))} color="var(--bento-pos)" height={28} />
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeSession(s.date, s.id)}
                      className="shrink-0 text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(205,122,85,0.12)', color: 'var(--bento-warm)' }} aria-label="Borrar">🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exportar CSV */}
          <div className="bento-card space-y-3">
            <div className="bento-label">📤 Exportar CSV</div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex-1">Desde
                <input type="date" value={csvFrom} max={csvTo || todayKey()} onChange={(e) => setCsvFrom(e.target.value)}
                  className="mt-0.5 w-full px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--bento-hairline)', background: 'var(--bento-surface)', color: 'var(--bento-ink)' }} />
              </label>
              <label className="flex-1">Hasta
                <input type="date" value={csvTo} max={todayKey()} onChange={(e) => setCsvTo(e.target.value || todayKey())}
                  className="mt-0.5 w-full px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--bento-hairline)', background: 'var(--bento-surface)', color: 'var(--bento-ink)' }} />
              </label>
            </div>
            <p style={{ fontSize: 10, color: 'var(--bento-faint)' }}>Deja "Desde" vacío para exportar todo el historial.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportDetailed} className="py-2 rounded-xl text-xs font-semibold" style={{ border: '1px solid var(--bento-hairline)' }}>📊 Por ejercicio</button>
              <button onClick={exportSummary} className="py-2 rounded-xl text-xs font-semibold" style={{ border: '1px solid var(--bento-hairline)' }}>📋 Por sesión</button>
            </div>
          </div>
        </>
      )}

      {/* Evaluación crítica con Claude */}
      <div className="bento-label" style={{ marginTop: 8 }}>Evaluación crítica · Claude</div>
      <div className="bento-card space-y-3">
        {!apiKey && (
          <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
        )}
        <button onClick={generate} disabled={loading || !apiKey || stats.totalSessions < 3}
          className="w-full py-2.5 rounded-xl font-semibold"
          style={loading || !apiKey || stats.totalSessions < 3
            ? { background: 'var(--bento-surface)', color: 'var(--bento-faint)' }
            : { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
          {loading ? 'Evaluando tu rutina…' : (response ? (isStale || cacheOld ? 'Actualizar evaluación' : 'Regenerar') : 'Evaluar mi rutina con Claude ✨')}
        </button>
        {stats.totalSessions < 3 && (
          <p style={{ fontSize: 11, color: 'var(--bento-faint)' }}>Necesitas al menos 3 sesiones registradas ({stats.totalSessions} hasta ahora).</p>
        )}
        {error && <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--bento-warm)', background: 'rgba(205,122,85,0.10)' }}>{error}</p>}
      </div>

      {response && (
        <>
          {response.confidence && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'var(--bento-surface)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: confColor === 'green' ? 'var(--bento-pos)' : confColor === 'amber' ? 'var(--bento-yellow)' : 'var(--bento-warm)' }} />
              <span style={{ fontSize: 11, color: 'var(--bento-muted)' }}>Confianza {response.confidence}{isStale && ' · datos cambiaron'}</span>
            </div>
          )}

          {(response.resumen || response.consistencia) && (
            <div className="bento-card space-y-2">
              {response.resumen && <p className="text-sm">{response.resumen}</p>}
              {response.consistencia && <p style={{ fontSize: 12, color: 'var(--bento-muted)' }}>📅 {response.consistencia}</p>}
            </div>
          )}

          {Array.isArray(response.seguir) && response.seguir.length > 0 && (
            <div className="bento-card" style={{ background: 'rgba(122,154,120,0.10)', borderColor: 'transparent' }}>
              <div className="bento-label" style={{ color: 'var(--bento-pos)', marginBottom: 10 }}>✅ Qué seguir</div>
              <ul className="space-y-1.5" style={{ margin: 0, paddingLeft: 18 }}>
                {response.seguir.map((s, i) => (<li key={i} style={{ fontSize: 13, lineHeight: 1.45 }}>{s}</li>))}
              </ul>
            </div>
          )}

          {Array.isArray(response.mejorar) && response.mejorar.map((m, i) => (
            <div key={i} className="bento-card space-y-2.5">
              <div className="bento-label">🔧 {typeof m === 'string' ? m : m.que}</div>
              {m.porque && <p style={{ fontSize: 12.5, color: 'var(--bento-muted)', lineHeight: 1.5 }}>{m.porque}</p>}
              {m.como && <p style={{ fontSize: 12.5, lineHeight: 1.5, padding: '10px 12px', background: 'var(--bento-surface)', borderRadius: 8 }}>💡 {m.como}</p>}
            </div>
          ))}

          {(response.desbalances || response.progresion) && (
            <div className="bento-grid2 is-eq items-start">
              {response.desbalances && (
                <div className="bento-card">
                  <div className="bento-label" style={{ marginBottom: 10 }}>⚖️ Desbalances</div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--bento-muted)' }}>{response.desbalances}</p>
                </div>
              )}
              {response.progresion && (
                <div className="bento-card">
                  <div className="bento-label" style={{ marginBottom: 10 }}>📉 Progresión</div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--bento-muted)' }}>{response.progresion}</p>
                </div>
              )}
            </div>
          )}

          {response.nota_critica && (
            <div className="bento-card" style={{ background: 'rgba(205,122,85,0.10)', borderColor: 'transparent' }}>
              <div className="bento-label" style={{ color: 'var(--bento-warm)', marginBottom: 10 }}>🐂 Nota crítica</div>
              <p className="text-sm" style={{ lineHeight: 1.6 }}>{response.nota_critica}</p>
            </div>
          )}

          <div className="bento-card space-y-2">
            <div className="bento-label">📤 Exportar evaluación (para discutir con otra IA)</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportEvalPdf} className="py-2 rounded-xl text-xs font-semibold" style={{ border: '1px solid var(--bento-hairline)' }}>📄 PDF</button>
              <button onClick={exportEvalMarkdown} className="py-2 rounded-xl text-xs font-semibold" style={{ border: '1px solid var(--bento-hairline)' }}>📝 Texto (Markdown)</button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--bento-faint)' }}>Incluyen la evaluación + datos de respaldo (frecuencia, volumen por músculo, récords, progresión e historial). El Markdown agrega el historial completo en JSON.</p>
          </div>

          {cached?.generatedAt && (
            <p className="text-center" style={{ fontSize: 10, color: 'var(--bento-faint)' }}>
              Generado {new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}

      {capturing && (
        <WorkoutCaptureModal apiKey={apiKey} onClose={() => setCapturing(false)} onSave={addCapture} />
      )}
    </div>
  );
}

function BankItemForm({ initial, kind, apiKey, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [kcal, setKcal] = useState(initial?.kcal ?? '');
  const [protein, setProtein] = useState(initial?.protein ?? '');
  const [carbs, setCarbs] = useState(initial?.carbs ?? '');
  const [fat, setFat] = useState(initial?.fat ?? '');
  const [fiber, setFiber] = useState(initial?.fiber ?? '');
  const [category, setCategory] = useState(initial?.category || 'salado');
  const [gi, setGi] = useState(initial?.gi || 'bajo');
  const [tags, setTags] = useState(Array.isArray(initial?.tags) ? initial.tags : []);
  const [portionGrams, setPortionGrams] = useState(initial?.portionGrams ?? '');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null);
  const [error, setError] = useState(null);

  const toggleTag = (t) => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  const canEstimate = name.trim().length > 0;

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe el nombre primero.'); return; }
    setEstimating(true); setError(null);
    try {
      const data = await estimateExtraMacros({ name, attachments: [], apiKey });
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      if (data?.protein != null) setProtein(String(Math.round(Number(data.protein) || 0)));
      if (data?.carbs != null) setCarbs(String(Math.round(Number(data.carbs) || 0)));
      if (data?.fat != null) setFat(String(Math.round(Number(data.fat) || 0)));
      if (data?.fiber != null) setFiber(String(Number(data.fiber).toFixed(1)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const k = Number(kcal);
    const p = Number(protein);
    if (!name.trim() || !Number.isFinite(k) || k < 0 || !Number.isFinite(p) || p < 0) return;
    const numOrZero = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const item = {
      ...(initial || {}),
      name: name.trim(),
      kcal: k, protein: p,
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
      fiber: numOrZero(fiber),
      gi,
      tags,
    };
    const pg = Number(portionGrams);
    if (Number.isFinite(pg) && pg > 0) item.portionGrams = pg;
    if (kind === 'snack') item.category = category;
    onSave(item);
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial ? 'Editar' : 'Agregar'} {kind === 'snack' ? 'colación' : kind === 'dessert' ? 'postre' : 'proteína de cena'}</h2>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Ej. Shake whey 30g" autoFocus />
        </label>

        <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
          className="w-full py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
          {estimating ? 'Estimando…' : '✨ Completar con Claude'}
        </button>
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para auto-completar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Confianza {estimated.confidence} · Edita si necesitas
            </span>
          </div>
        )}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías (kcal)</span>
            <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g)</span>
            <input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Carbos (g)</span>
            <input type="number" inputMode="decimal" step="1" value={carbs} onChange={(e) => setCarbs(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Grasas (g)</span>
            <input type="number" inputMode="decimal" step="1" value={fat} onChange={(e) => setFat(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fibra (g)</span>
            <input type="number" inputMode="decimal" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Índice glicémico</span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {['bajo', 'medio', 'alto'].map((g) => (
                <button type="button" key={g} onClick={() => setGi(g)}
                  className={`py-1.5 rounded-lg border-2 text-[11px] font-semibold capitalize ${
                    gi === g ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{g}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción (g) — opcional</span>
            <input type="number" inputMode="numeric" value={portionGrams} onChange={(e) => setPortionGrams(e.target.value)}
              placeholder="p.ej. 150"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Etiquetas</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {['proteína', 'fibra', 'portable', 'sin-refrigeración', 'dulce'].map((t) => (
              <button type="button" key={t} onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  tags.includes(t) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}>{t}</button>
            ))}
          </div>
        </div>
        {kind === 'snack' && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Categoría</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['salado', 'dulce'].map((c) => (
                <button type="button" key={c} onClick={() => setCategory(c)}
                  className={`py-2 rounded-xl border-2 text-sm font-medium capitalize ${
                    category === c ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{c}</button>
              ))}
            </div>
          </label>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function BankList({ items, kind, onAdd, onEdit, onDelete }) {
  return (
    <div className="bento-card" style={{ padding: 0, overflow: 'hidden' }}>
      {items.length === 0 ? (
        <div className="p-4 text-sm italic" style={{ color: 'var(--bento-faint)' }}>Sin opciones todavía.</div>
      ) : (
        items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid var(--bento-hairline)' : 'none' }}>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.name}</div>
              <div style={{ fontSize: 12, color: 'var(--bento-faint)' }}>
                <span className="bento-num" style={{ color: 'var(--bento-ink)' }}>{item.kcal}</span> kcal · P {item.protein}g
                {(item.carbs || item.fat || item.fiber) ? <> · C {Math.round(item.carbs || 0)} · G {Math.round(item.fat || 0)} · F {Number(item.fiber || 0).toFixed(0)}</> : null}
                {kind === 'snack' && item.category && ` · ${item.category}`}
                {item.gi && item.gi !== 'bajo' ? ` · GI ${item.gi}` : null}
                {item.portionGrams ? ` · ${item.portionGrams}g` : null}
              </div>
              {Array.isArray(item.tags) && item.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: 'var(--bento-surface)', color: 'var(--bento-faint)' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => onEdit(item)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bento-surface)' }}>Editar</button>
            <button onClick={() => { if (confirm(`¿Eliminar "${item.name}"?`)) onDelete(item.id); }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(205,122,85,0.12)', color: 'var(--bento-warm)' }}>Borrar</button>
          </div>
        ))
      )}
      <button onClick={onAdd} className="w-full py-3 text-sm font-semibold" style={{ color: 'var(--bento-ink)', borderTop: '1px solid var(--bento-hairline)' }}>
        + Agregar {kind === 'snack' ? 'colación' : kind === 'dessert' ? 'postre' : 'proteína'}
      </button>
    </div>
  );
}

function cleanupRefs(days, field, id) {
  const out = {};
  for (const [k, v] of Object.entries(days)) {
    if (v && v[field] === id) {
      const { [field]: _, ...rest } = v;
      out[k] = rest;
    } else { out[k] = v; }
  }
  return out;
}

function SuggestBankModal({ kind, state, setState, onClose }) {
  const apiKey = state.settings?.anthropicApiKey;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  const existing = kind === 'snack' ? state.snackBank : kind === 'dessert' ? (state.dessertBank || []) : state.proteinBank;
  const existingNames = existing.map((i) => i.name);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const tipo = kind === 'snack'
        ? 'colaciones (snacks salados o dulces)'
        : kind === 'dessert'
        ? 'postres en porción controlada (mezcla saludables y algún indulgente moderado)'
        : 'opciones de cena (proteína principal con guarnición simple)';
      const prompt = `Eres nutricionista chileno. Genera 5 ideas de ${tipo} para Hugo (geriatra chileno, hombre adulto en plan de pérdida de grasa). Que sean realistas para el contexto chileno (lácteos Colun, atún, salmón, palta, pollo, etc.).

Ya tiene estas opciones (no las repitas):
${existingNames.map(n => `- ${n}`).join('\n')}

Devuelve SOLO JSON, sin markdown:
{
  "items": [
    {
      "name": "nombre corto y específico (ej. 'Quínoa con palta y huevo' o '120g pavo + queso fresco')",
      "kcal": número,
      "protein": número (g),
      "carbs": número,
      "fat": número,
      "fiber": número con 1 decimal${kind === 'snack' ? ',\n      "category": "salado" o "dulce"' : ''}
    }
  ]
}

Reglas:
- 5 opciones, variedad de macros (algunas altas en P, otras balanceadas)
- ${kind === 'snack' ? 'kcal 150-300 por colación' : kind === 'dessert' ? 'kcal 60-180 por postre (porción individual)' : 'kcal 250-450 para cena (porción individual)'}
- Productos reales encontrables en supermercado chileno
- Nombres autoexplicativos (no necesita instrucciones)`;

      const text = await askClaude(prompt, apiKey, 1000, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed?.items?.length) {
        setError('No se pudo parsear la respuesta.');
        return;
      }
      const items = parsed.items.map((it) => ({
        id: uuid(),
        name: String(it.name || '').trim(),
        kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(it.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(it.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(it.fat) || 0)),
        fiber: Math.max(0, Number(it.fiber) || 0),
        ...(kind === 'snack' ? { category: (it.category === 'dulce' ? 'dulce' : 'salado') } : {}),
        selected: true,
      }));
      setSuggestions(items);
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id) => {
    setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const confirmAdd = () => {
    const toAdd = suggestions.filter((s) => s.selected).map(({ selected, ...rest }) => ({ ...rest, builtin: false }));
    if (toAdd.length === 0) { onClose(); return; }
    setState((prev) => {
      if (kind === 'snack') return { ...prev, snackBank: [...prev.snackBank, ...toAdd] };
      if (kind === 'dessert') return { ...prev, dessertBank: [...(prev.dessertBank || []), ...toAdd] };
      return { ...prev, proteinBank: [...prev.proteinBank, ...toAdd] };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">✨ Sugerir {kind === 'snack' ? 'colaciones' : kind === 'dessert' ? 'postres' : 'cenas'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {!suggestions && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Claude generará 5 ideas nuevas (sin repetir las que ya tienes) y podrás elegir cuáles agregar.
            </p>
            <button onClick={generate} disabled={loading || !apiKey}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300">
              {loading ? 'Generando ideas…' : 'Generar 5 ideas ✨'}
            </button>
            {!apiKey && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </>
        )}

        {suggestions && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Selecciona cuáles agregar ({suggestions.filter(s => s.selected).length}/{suggestions.length})
            </div>
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => toggleSelected(s.id)}
                className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                  s.selected
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                }`}>
                <div className="flex items-start gap-2">
                  <span className="text-xl shrink-0">{emojiForFood(s.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">{s.kcal}</span> kcal · P {s.protein}g · C {s.carbs}g · G {s.fat}g · F {Number(s.fiber).toFixed(0)}g
                      {s.category && <> · {s.category}</>}
                    </div>
                  </div>
                  <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                    s.selected
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {s.selected && '✓'}
                  </div>
                </div>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <button onClick={generate} disabled={loading}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium">
                {loading ? 'Generando…' : '🔄 Otras 5'}
              </button>
              <button onClick={confirmAdd}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
                Agregar {suggestions.filter(s => s.selected).length}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

// Formulario de un alimento reusable: macros POR 100g + porción por defecto. Distinto de
// BankItemForm (que edita macros absolutos de una toma); aquí la fuente de verdad es per100.
function FoodEditModal({ initial, onCancel, onSave }) {
  const p = initial?.per100 || {};
  const [name, setName] = useState(initial?.name || '');
  const [kcal, setKcal] = useState(initial ? String(p.kcal ?? '') : '');
  const [protein, setProtein] = useState(initial ? String(p.protein ?? '') : '');
  const [carbs, setCarbs] = useState(initial ? String(p.carbs ?? '') : '');
  const [fat, setFat] = useState(initial ? String(p.fat ?? '') : '');
  const [fiber, setFiber] = useState(initial ? String(p.fiber ?? '') : '');
  const [portionG, setPortionG] = useState(String(initial?.defaultPortionG || 100));
  const [error, setError] = useState(null);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!name.trim()) { setError('Necesitas un nombre.'); return; }
    const n = (v) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
    onSave(makeFood({
      id: initial?.id,
      name: name.trim(),
      per100: { kcal: n(kcal), protein: n(protein), carbs: n(carbs), fat: n(fat), fiber: n(fiber) },
      defaultPortionG: Number(portionG) > 0 ? Number(portionG) : 100,
      barcode: initial?.barcode,
      tags: initial?.tags,
      source: initial?.source || 'manual',
      builtin: initial?.builtin,
      usageCount: initial?.usageCount,
      lastUsedAt: initial?.lastUsedAt,
    }));
  };

  const field = (label, val, set, step) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input type="number" inputMode="decimal" step={step || '1'} min="0" value={val} onChange={(e) => set(e.target.value)} placeholder="0"
        className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial?.id ? 'Editar alimento' : 'Nuevo alimento'}</h2>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pechuga de pollo cocida"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        </label>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Macros <strong>por 100 g</strong> (se escalan por gramos al registrar)</p>
        {field('Calorías /100g', kcal, setKcal)}
        <div className="grid grid-cols-2 gap-3">
          {field('Proteína /100g', protein, setProtein)}
          {field('Carbos /100g', carbs, setCarbs)}
          {field('Grasas /100g', fat, setFat)}
          {field('Fibra /100g', fiber, setFiber, '0.1')}
        </div>
        {field('Porción por defecto (g)', portionG, setPortionG)}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// Sección "Mis alimentos" del tab Banco: biblioteca reusable con buscador + CRUD. Editar por id
// (permite renombrar); los nuevos pasan por upsertFood (dedup por nombre/código).
function FoodsBankSection({ state, setState }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // food (edit) | {} (nuevo) | null
  const foods = state.foods || [];
  const shown = useMemo(() => searchFoods(foods, query, query.trim() ? 40 : 300), [foods, query]);

  const saveFood = (food) => {
    setState((prev) => {
      const list = prev.foods || [];
      // Re-agregar un alimento lo DES-veta (sácalo de removedFoodKeys), si no el bridge nunca
      // lo volvería a traer y el merge tampoco lo importaría.
      const key = food.key || normalizeName(food.name);
      const removed = new Set((prev.bridge?.removedFoodKeys) || []);
      removed.delete(key);
      const foods = (food.id && list.some((f) => f.id === food.id))
        ? list.map((f) => (f.id === food.id ? food : f))
        : upsertFood(list, food);
      return { ...prev, foods, bridge: { ...(prev.bridge || {}), removedFoodKeys: [...removed] } };
    });
    setEditing(null);
  };
  const deleteFood = (id) => {
    setState((prev) => {
      const food = (prev.foods || []).find((f) => f.id === id);
      const key = food ? (food.key || normalizeName(food.name)) : null;
      // Propaga el borrado al bridge (otros dispositivos + limpieza) y veta la key para que
      // mergeBridge NO lo resucite en el próximo sync (espejo del flujo de weights/meals).
      if (key) postBridgeDelete(prev.settings, 'foods', key);
      const removed = new Set((prev.bridge?.removedFoodKeys) || []);
      if (key) removed.add(key);
      return {
        ...prev,
        foods: (prev.foods || []).filter((f) => f.id !== id),
        bridge: { ...(prev.bridge || {}), removedFoodKeys: [...removed] },
      };
    });
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <SectionHeader title="Mis alimentos" hint="Base reusable · macros por 100g, se escalan por gramos al registrar" />
        <button onClick={() => setEditing({})}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(90,141,181,0.14)', color: 'var(--bento-blue)' }}>
          + Agregar
        </button>
      </div>
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Buscar en mis alimentos…"
        className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2" />
      <div className="space-y-1.5">
        {shown.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--bento-faint)' }}>
            {foods.length === 0 ? 'Aún no tienes alimentos. Agrega uno o guárdalos al registrar un extra.' : 'Sin coincidencias.'}
          </p>
        )}
        {shown.map((f) => (
          <div key={f.id} className="bento-card flex items-center gap-2" style={{ padding: 10 }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {stripPortionSuffix(f.name)}
                {f.builtin && <span className="ml-1 text-[10px]" style={{ color: 'var(--bento-faint)' }}>semilla</span>}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--bento-faint)' }}>
                {Math.round(f.per100?.kcal || 0)} kcal · P {Math.round(f.per100?.protein || 0)} · C {Math.round(f.per100?.carbs || 0)} · G {Math.round(f.per100?.fat || 0)} /100g · porción {f.defaultPortionG}g
              </div>
            </div>
            <button onClick={() => setEditing(f)} className="px-2 py-1 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-800" title="Editar">✏️</button>
            <button onClick={() => deleteFood(f.id)} className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="Borrar">🗑️</button>
          </div>
        ))}
      </div>
      {editing && (
        <FoodEditModal initial={editing.id ? editing : null} onCancel={() => setEditing(null)} onSave={saveFood} />
      )}
    </div>
  );
}

function BankView({ state, setState }) {
  const [editing, setEditing] = useState(null);
  const [suggesting, setSuggesting] = useState(null);
  const [showShopping, setShowShopping] = useState(false);

  const upsertSnack = (item) => {
    setState((prev) => {
      const exists = item.id && prev.snackBank.some((s) => s.id === item.id);
      const next = exists ? prev.snackBank.map((s) => (s.id === item.id ? { ...s, ...item } : s))
                          : [...prev.snackBank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, snackBank: next };
    });
    setEditing(null);
  };

  const upsertProtein = (item) => {
    setState((prev) => {
      const exists = item.id && prev.proteinBank.some((p) => p.id === item.id);
      const next = exists ? prev.proteinBank.map((p) => (p.id === item.id ? { ...p, ...item } : p))
                          : [...prev.proteinBank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, proteinBank: next };
    });
    setEditing(null);
  };

  const upsertDessert = (item) => {
    setState((prev) => {
      const bank = prev.dessertBank || [];
      const exists = item.id && bank.some((d) => d.id === item.id);
      const next = exists ? bank.map((d) => (d.id === item.id ? { ...d, ...item } : d))
                          : [...bank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, dessertBank: next };
    });
    setEditing(null);
  };

  const deleteSnack = (id) => {
    setState((prev) => ({ ...prev, snackBank: prev.snackBank.filter((s) => s.id !== id), days: cleanupRefs(prev.days, 'snackId', id) }));
  };
  const deleteProtein = (id) => {
    setState((prev) => ({ ...prev, proteinBank: prev.proteinBank.filter((p) => p.id !== id), days: cleanupRefs(prev.days, 'proteinId', id) }));
  };
  const deleteDessert = (id) => {
    setState((prev) => {
      const bank = (prev.dessertBank || []).filter((d) => d.id !== id);
      const cleaned1 = cleanupRefs(prev.days, 'dessertAlmuerzoId', id);
      const cleaned2 = cleanupRefs(cleaned1, 'dessertCenaId', id);
      return { ...prev, dessertBank: bank, days: cleaned2 };
    });
  };

  return (
    <div className="px-4 py-4 space-y-5">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Banco</h1>
        <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>Tus comidas frecuentes · colaciones, cenas y postres</p>
      </div>

      <button onClick={() => setShowShopping(true)}
        className="w-full flex items-center gap-3 bento-card"
        style={{ padding: 14 }}>
        <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-lg" style={{ background: 'var(--bento-surface)' }}>🛒</span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold">Generar lista de compras</div>
          <div style={{ fontSize: 11, color: 'var(--bento-faint)', marginTop: 2 }}>Basada en lo que comiste esta semana · compartible por WhatsApp</div>
        </div>
        <span className="shrink-0 font-bold" style={{ color: 'var(--bento-faint)' }}>→</span>
      </button>

      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Colaciones" />
          <button onClick={() => setSuggesting('snack')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(90,141,181,0.14)', color: 'var(--bento-blue)' }}>
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.snackBank} kind="snack"
          onAdd={() => setEditing({ kind: 'snack', item: null })}
          onEdit={(item) => setEditing({ kind: 'snack', item })}
          onDelete={deleteSnack} />
      </div>
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Proteínas de cena" />
          <button onClick={() => setSuggesting('protein')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(90,141,181,0.14)', color: 'var(--bento-blue)' }}>
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.proteinBank} kind="protein"
          onAdd={() => setEditing({ kind: 'protein', item: null })}
          onEdit={(item) => setEditing({ kind: 'protein', item })}
          onDelete={deleteProtein} />
      </div>
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Postres" hint="Opcional, para almuerzo o cena" />
          <button onClick={() => setSuggesting('dessert')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(90,141,181,0.14)', color: 'var(--bento-blue)' }}>
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.dessertBank || []} kind="dessert"
          onAdd={() => setEditing({ kind: 'dessert', item: null })}
          onEdit={(item) => setEditing({ kind: 'dessert', item })}
          onDelete={deleteDessert} />
      </div>
      <FoodsBankSection state={state} setState={setState} />
      {editing && (
        <BankItemForm kind={editing.kind} initial={editing.item}
          apiKey={state.settings?.anthropicApiKey}
          onCancel={() => setEditing(null)}
          onSave={editing.kind === 'snack' ? upsertSnack : editing.kind === 'dessert' ? upsertDessert : upsertProtein} />
      )}
      {suggesting && (
        <SuggestBankModal kind={suggesting} state={state} setState={setState}
          onClose={() => setSuggesting(null)} />
      )}
      {showShopping && (
        <ShoppingListModal state={state} onClose={() => setShowShopping(false)} />
      )}
    </div>
  );
}

function AttachmentPreview({ attachment, onRemove }) {
  const a = attachment;
  return (
    <div className="relative h-24 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {a.kind === 'image' ? (
        <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/60 p-1.5 text-center">
          <span className="text-2xl">{a.kind === 'pdf' ? '📄' : '📋'}</span>
          <span className="text-[10px] mt-0.5 text-gray-600 dark:text-gray-400 line-clamp-2 break-all">{a.name}</span>
        </div>
      )}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center shadow-md">✕</button>
      )}
    </div>
  );
}

function RulesEditor({ rules, onChange }) {
  const list = Array.isArray(rules) ? rules : [];

  const updateRule = (id, patch) => {
    onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateConfig = (id, configPatch) => {
    onChange(list.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...configPatch } } : r)));
  };
  const removeRule = (id) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    onChange(list.filter((r) => r.id !== id));
  };
  const addRule = (type) => {
    const id = 'rule-' + Math.random().toString(36).slice(2, 8);
    let newRule;
    if (type === 'kcal_cap_extras') {
      newRule = { id, name: 'Sin extras pasando 2.000 kcal', enabled: true, type, config: { kcalCap: 2000 } };
    } else {
      // count_per_week — pedimos categoría
      const cat = prompt('Categoría (dulce / delivery / alcohol):', 'dulce');
      if (!cat || !RULE_CATEGORIES.includes(cat.trim().toLowerCase())) return;
      const category = cat.trim().toLowerCase();
      newRule = { id, name: `Máximo 1 ${category} por semana`, enabled: true, type: 'count_per_week', config: { category, max: 1 } };
    }
    onChange([...list, newRule]);
  };

  return (
    <div className="space-y-2">
      {list.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin reglas configuradas.</p>
      ) : (
        list.map((rule) => {
          const meta = RULE_TYPES[rule.type] || {};
          const paramKey = meta.paramKey;
          const paramVal = rule.config?.[paramKey];
          return (
            <div key={rule.id} className={`rounded-xl border ${rule.enabled ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'} bg-white dark:bg-gray-900 p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{meta.icon || '⚙️'}</span>
                <input type="text" value={rule.name}
                  onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                  className="flex-1 text-sm font-semibold bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none" />
                <label className="inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={!!rule.enabled}
                    onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    className="sr-only peer" />
                  <span className="relative w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></span>
                </label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{meta.paramLabel || 'valor'}:</span>
                <input type="number" step={meta.paramStep || 1} value={paramVal ?? ''}
                  onChange={(e) => updateConfig(rule.id, { [paramKey]: Number(e.target.value) || 0 })}
                  className="w-24 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {rule.config?.category && (
                  <span className="text-gray-500 dark:text-gray-400">· {rule.config.category}</span>
                )}
                <button type="button" onClick={() => removeRule(rule.id)}
                  className="ml-auto text-[11px] px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200">Borrar</button>
              </div>
            </div>
          );
        })
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={() => addRule('kcal_cap_extras')}
          className="py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          + Cap kcal/día
        </button>
        <button type="button" onClick={() => addRule('count_per_week')}
          className="py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          + Máximo por semana
        </button>
      </div>
    </div>
  );
}

function SyncSection({ state, setState }) {
  const initialPAT = state.settings?.githubPAT || '';
  const [pat, setPat] = useState(initialPAT);
  const [showPat, setShowPat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const gistId = state.settings?.syncGistId;
  const lastSync = state.settings?.lastSyncAt;
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [existingGistId, setExistingGistId] = useState('');

  const savePAT = (newPAT) => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), githubPAT: newPAT || null } }));
  };
  const saveGistId = (id) => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), syncGistId: id || null, lastSyncAt: new Date().toISOString() } }));
  };
  const updateLastSync = () => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), lastSyncAt: new Date().toISOString() } }));
  };

  const handleCreate = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Pega tu Personal Access Token primero.'); return; }
    setLoading(true);
    try {
      savePAT(pat.trim());
      const { id, updatedAt, htmlUrl } = await gistCreate(pat.trim(), state);
      saveGistId(id);
      setState((prev) => ({ ...prev, settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt } }));
      setInfo(`Gist creado ✓ — abre ${htmlUrl} para copiar el ID y usarlo en otro dispositivo.`);
    } catch (err) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectExisting = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Pega tu Personal Access Token primero.'); return; }
    const id = existingGistId.trim();
    if (!id) { setError('Pega el Gist ID que quieres conectar.'); return; }
    setLoading(true);
    try {
      savePAT(pat.trim());
      // Validar que el gist exista descargándolo
      await gistPull(pat.trim(), id);
      saveGistId(id);
      setExistingGistId('');
      setInfo('Gist conectado ✓ — usa "📥 Bajar y reemplazar" para traer los datos.');
    } catch (err) {
      setError(err.message || 'No se pudo conectar al gist');
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Falta PAT'); return; }
    if (!gistId) { setError('Conecta primero (crea el gist).'); return; }
    setLoading(true);
    try {
      const { updatedAt } = await gistPush(pat.trim(), gistId, state);
      setState((prev) => ({ ...prev, settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt, lastSyncAt: new Date().toISOString() } }));
      setInfo('Backup subido a GitHub ✓');
    } catch (err) {
      setError(err.message || 'Error al subir');
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Falta PAT'); return; }
    if (!gistId) { setError('Conecta primero.'); return; }
    setLoading(true);
    try {
      const { state: remoteState, updatedAt } = await gistPull(pat.trim(), gistId);
      if (!remoteState || typeof remoteState !== 'object') throw new Error('Backup remoto inválido');
      // Reemplazar local con remoto, preservando credenciales/endpoint locales y fijando la base del auto-sync.
      setState((prev) => applyRemoteState(prev, remoteState, updatedAt));
      setInfo('Backup restaurado desde GitHub ✓');
      setConfirmRestore(false);
    } catch (err) {
      setError(err.message || 'Error al bajar');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    if (!confirm('¿Desconectar el gist? (no se borra el gist en GitHub, solo el link local)')) return;
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), syncGistId: null, lastSyncAt: null } }));
    setInfo('Desconectado.');
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Backup privado vía GitHub Gist. Tu PAT necesita scope <span className="font-mono">gist</span> (crea uno en github.com → Settings → Developer settings → Personal access tokens).
      </p>

      <label className="block">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">GitHub Personal Access Token</span>
        <div className="mt-1 flex gap-2">
          <input
            type={showPat ? 'text' : 'password'}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_..."
            autoComplete="off"
            spellCheck={false}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
          />
          <button type="button" onClick={() => setShowPat((v) => !v)}
            className="px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-xs">👁️</button>
        </div>
      </label>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 dark:text-gray-400">Estado:</span>
          <span className={`font-semibold ${gistId ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {gistId ? '✓ Conectado' : '○ Sin conectar'}
          </span>
        </div>
        {gistId && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Gist ID:</span>
              <button type="button"
                onClick={() => { navigator.clipboard.writeText(gistId).then(() => { setInfo('Gist ID copiado al portapapeles ✓'); setTimeout(() => setInfo(null), 2500); }).catch(() => {}); }}
                className="font-mono text-[10px] text-gray-700 dark:text-gray-300 truncate ml-2 hover:text-emerald-600 dark:hover:text-emerald-400">
                {gistId} 📋
              </button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">tap para copiar · úsalo en otro dispositivo</p>
          </div>
        )}
        {lastSync && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">Última sync:</span>
            <span className="text-gray-700 dark:text-gray-300">{new Date(lastSync).toLocaleString('es-CL')}</span>
          </div>
        )}
        {gistId && (
          <label className="flex items-center justify-between text-[11px] pt-1 cursor-pointer">
            <span className="text-gray-600 dark:text-gray-300 font-medium">⚡ Sincronizar automático</span>
            <input type="checkbox"
              checked={state.settings?.autoSync ?? true}
              onChange={(e) => setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), autoSync: e.target.checked } }))}
              className="w-4 h-4 accent-emerald-500" />
          </label>
        )}
        {gistId && (state.settings?.autoSync ?? true) && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Sube solo al editar; baja solo al abrir si el otro equipo tiene algo más nuevo (y este no tiene cambios sin subir).</p>
        )}
      </div>

      {!gistId && (
        <div className="space-y-3">
          <button type="button" onClick={handleCreate} disabled={loading || !pat.trim()}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-sm">
            {loading ? 'Creando…' : '➕ Crear gist privado nuevo'}
          </button>
          <div className="relative flex items-center text-[10px] text-gray-400 dark:text-gray-500 gap-2">
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></span>
            <span>o si ya tienes uno en otro dispositivo</span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></span>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Gist ID existente</span>
            <input type="text" value={existingGistId}
              onChange={(e) => setExistingGistId(e.target.value)}
              placeholder="ej. 7a8b9c0d1e2f..."
              spellCheck={false}
              autoComplete="off"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono" />
          </label>
          <button type="button" onClick={handleConnectExisting} disabled={loading || !pat.trim() || !existingGistId.trim()}
            className="w-full py-2.5 rounded-xl border-2 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 text-sm">
            {loading ? 'Conectando…' : '🔗 Conectar a gist existente'}
          </button>
        </div>
      )}

      {gistId && !confirmRestore && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handlePush} disabled={loading}
            className="py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-sm">
            {loading ? '…' : '📤 Subir ahora'}
          </button>
          <button type="button" onClick={() => setConfirmRestore(true)} disabled={loading}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            📥 Bajar y reemplazar
          </button>
        </div>
      )}

      {gistId && confirmRestore && (
        <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            ⚠️ Esto reemplazará TODO tu state local con el backup remoto. ¿Continuar?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmRestore(false)}
              className="py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-xs">Cancelar</button>
            <button type="button" onClick={handlePull} disabled={loading}
              className="py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50">
              {loading ? 'Bajando…' : 'Sí, reemplazar'}
            </button>
          </div>
        </div>
      )}

      {gistId && (
        <button type="button" onClick={disconnect}
          className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400">
          🔓 Desconectar gist
        </button>
      )}

      {info && <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg">{info}</p>}
      {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
    </div>
  );
}

function BridgeSyncSection({ state, setState }) {
  const [url, setUrl] = useState(state.settings?.bridgeUrl || '');
  const [token, setToken] = useState(state.settings?.bridgeToken || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', msg }

  const saveUrl = (val) => setState((prev) => ({
    ...prev, settings: { ...(prev.settings || {}), bridgeUrl: val.trim() || null },
  }));
  const saveToken = (val) => setState((prev) => ({
    ...prev, settings: { ...(prev.settings || {}), bridgeToken: val.trim() || null },
  }));

  const doSync = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setStatus({ type: 'err', msg: 'Pega la URL del Apps Script primero.' }); return; }
    saveUrl(trimmed);
    const tok = token.trim();
    saveToken(tok);
    setBusy(true); setStatus(null);
    const res = await runBridgeSync({ settings: { bridgeUrl: trimmed, bridgeToken: tok } }, setState);
    setBusy(false);
    if (!res.ok) {
      setStatus({ type: 'err', msg: res.reason === 'fetch' ? ('No se pudo leer Drive: ' + (res.error || '')) : 'Configura la URL.' });
    } else {
      const a = res.added; const n = a.meals + a.weights + a.workouts + (a.checks || 0);
      const checksMsg = a.checks ? ` · ${a.checks} marcada(s) del plan` : '';
      setStatus({ type: 'ok', msg: n === 0 ? 'Al día, nada nuevo.' : `Importado: ${a.meals} comida(s) · ${a.weights} peso(s) · ${a.workouts} entrenamiento(s)${checksMsg}.` });
    }
  };

  const last = state.bridge?.lastSyncAt;
  const lastLabel = last ? new Date(last).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        Lee lo que registras por el chat de Claude (foto de comida, peso o entrenamiento). La app revisa al abrir; aquí puedes forzarlo.
      </p>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={(e) => saveUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off"
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs" />
        <button type="button" onClick={doSync} disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 whitespace-nowrap">
          {busy ? '…' : 'Sincronizar'}
        </button>
      </div>
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onBlur={(e) => saveToken(e.target.value)}
        placeholder="Token del bridge (mismo que SHARED_TOKEN del Apps Script)" autoComplete="off"
        className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs" />
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        Secreto compartido obligatorio: sin él, cualquiera con la URL puede leer o borrar tus datos. Debe ser idéntico al de <code className="bento-mono">SHARED_TOKEN</code> en el Apps Script.
      </p>
      {status && (
        <p className={`text-[11px] mt-1.5 ${status.type === 'err' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {status.type === 'ok' ? '✓ ' : '⚠️ '}{status.msg}
        </p>
      )}
      {lastLabel && !status && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Último: {lastLabel}</p>
      )}
    </div>
  );
}

function SettingsModal({ state, setState, onClose }) {
  const [key, setKey] = useState(state.settings?.anthropicApiKey || '');
  const [saveImages, setSaveImages] = useState(!!state.settings?.saveImages);
  const [show, setShow] = useState(false);
  const [bulkWeights, setBulkWeights] = useState(false);
  const [bulkWorkouts, setBulkWorkouts] = useState(false);
  const [editProfile, setEditProfile] = useState(false);

  const initialNotif = state.settings?.notifications || { enabled: false, colacion1: '11:00', almuerzo: '13:30', colacion2: '18:00', agua: '16:00', cena: '20:30' };
  const [notifEnabled, setNotifEnabled] = useState(!!initialNotif.enabled);
  const [notifColacion1, setNotifColacion1] = useState(initialNotif.colacion1 || '11:00');
  const [notifAlmuerzo, setNotifAlmuerzo] = useState(initialNotif.almuerzo || '13:30');
  const [notifColacion2, setNotifColacion2] = useState(initialNotif.colacion2 || '18:00');
  const [notifAgua, setNotifAgua] = useState(initialNotif.agua || '16:00');
  const [notifCena, setNotifCena] = useState(initialNotif.cena || '20:30');
  const [notifPermStatus, setNotifPermStatus] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [rulesDraft, setRulesDraft] = useState(() => (state.rules || []).map((r) => ({ ...r, config: { ...r.config } })));
  const [kcalDeficitDraft, setKcalDeficitDraft] = useState(() => {
    const v = state.userProfile?.kcalDeficit;
    return Number.isFinite(v) ? v : 400;
  });
  // Overrides manuales de los objetivos que mueven la racha. null = automático (deriva del TDEE).
  const [kcalTargetDraft, setKcalTargetDraft] = useState(() => {
    const v = state.userProfile?.kcalTarget;
    return Number.isFinite(v) ? v : null;
  });
  const [proteinTargetDraft, setProteinTargetDraft] = useState(() => {
    const v = state.userProfile?.proteinTarget;
    return Number.isFinite(v) ? v : null;
  });
  // Valores AUTO (sin override): para mostrar en gris cuando un objetivo está en modo automático.
  const previewAuto = useMemo(() => {
    if (!state.userProfile) return null;
    return calcTargets({ ...state.userProfile, kcalDeficit: kcalDeficitDraft, kcalTarget: null, proteinTarget: null });
  }, [state.userProfile, kcalDeficitDraft]);
  // Targets efectivos con los drafts actuales: alimentan el preview de la racha.
  const previewTargets = useMemo(() => {
    if (!state.userProfile) return null;
    const draftProfile = { ...state.userProfile, kcalDeficit: kcalDeficitDraft, kcalTarget: kcalTargetDraft, proteinTarget: proteinTargetDraft };
    return calcTargets(draftProfile);
  }, [state.userProfile, kcalDeficitDraft, kcalTargetDraft, proteinTargetDraft]);

  const existing = state.settings?.anthropicApiKey;
  const profile = state.userProfile;

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Tu navegador no soporta notificaciones.');
      return false;
    }
    if (Notification.permission === 'granted') {
      setNotifPermStatus('granted');
      return true;
    }
    if (Notification.permission === 'denied') {
      alert('Las notificaciones están bloqueadas en este navegador. Habilítalas desde la configuración del sitio.');
      setNotifPermStatus('denied');
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermStatus(result);
      return result === 'granted';
    } catch (e) {
      return false;
    }
  };

  const toggleNotifEnabled = async (v) => {
    if (v) {
      const granted = await requestNotifPermission();
      if (!granted) return;
    }
    setNotifEnabled(v);
  };

  const testNotification = () => {
    showLocalNotification('Plan Hugo · Prueba', 'Las notificaciones funcionan.', 'plan-hugo-test');
  };

  const save = () => {
    const p = state.userProfile;
    const profileChanged = p && (
      p.kcalDeficit !== kcalDeficitDraft ||
      (p.kcalTarget ?? null) !== kcalTargetDraft ||
      (p.proteinTarget ?? null) !== proteinTargetDraft
    );
    setState((prev) => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        anthropicApiKey: key.trim() || null,
        saveImages,
        notifications: { enabled: notifEnabled, colacion1: notifColacion1, almuerzo: notifAlmuerzo, colacion2: notifColacion2, agua: notifAgua, cena: notifCena },
      },
      rules: rulesDraft,
      userProfile: prev.userProfile
        ? { ...prev.userProfile, kcalDeficit: kcalDeficitDraft, kcalTarget: kcalTargetDraft, proteinTarget: proteinTargetDraft, ...(profileChanged ? { updatedAt: new Date().toISOString() } : {}) }
        : prev.userProfile,
    }));
    onClose();
  };

  // Descarga el estado actual (sin credenciales) como .json. Devuelve true si gatilló la
  // descarga. Lo usan Exportar JSON y, como red de seguridad, las acciones destructivas
  // (reset / importar): siempre cae un respaldo antes de pisar datos.
  const downloadBackup = (filename) => {
    try {
      const blob = new Blob([JSON.stringify(sanitizeStateForUpload(state), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Resumen de una persona en una línea: para mostrar qué se importa vs. qué se reemplaza.
  const stateSummary = (s) => {
    const days = s && s.days ? Object.keys(s.days).length : 0;
    const weights = Array.isArray(s && s.weights) ? s.weights.length : 0;
    const recipes = Array.isArray(s && s.recipeBank) ? s.recipeBank.length : 0;
    return `${days} días · ${weights} pesos · ${recipes} recetas`;
  };

  const exportJson = () => {
    if (!downloadBackup(`plan-hugo-backup-${todayKey()}.json`)) {
      alert('Error al exportar el respaldo.');
    }
  };

  // CSV por día (fecha, kcal in, macros, agua, peso medido, peso-tendencia) para abrir en
  // Sheets/Excel. Reusa computeDayTotals + trendWeightAt: misma señal suavizada que la app.
  const exportCsv = () => {
    try {
      const days = state.days || {};
      const targets = calcTargets(state.userProfile, { adaptiveTdee: computeAdaptiveTDEE(state)?.tdee });
      const series = weightSeries(state.weights || []);
      const measured = new Map(series.map((p) => [p.key, p.y]));
      const cell = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const header = ['fecha', 'kcal_in', 'proteina_g', 'carbos_g', 'grasa_g', 'fibra_g', 'agua_ml', 'peso_kg', 'peso_tendencia_kg'];
      const lines = [header.join(',')];
      for (const k of Object.keys(days).sort()) {
        const t = computeDayTotals(days[k] || {}, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
        const trend = trendWeightAt(series, k);
        lines.push([
          k, Math.round(t.kcalIn || 0), Math.round(t.protein || 0), Math.round(t.carbs || 0),
          Math.round(t.fat || 0), Math.round(t.fiber || 0), Math.round(t.waterMl || 0),
          measured.has(k) ? measured.get(k) : '', trend != null ? trend.toFixed(2) : '',
        ].map(cell).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-hugo-dias-${todayKey()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar CSV: ' + e.message);
    }
  };

  // Importa un respaldo .json (el que genera Exportar JSON) y REEMPLAZA el estado del
  // dispositivo. Preserva las credenciales actuales (el export las quita en sanitize).
  const importJsonFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(String(reader.result || ''));
          if (!obj || typeof obj !== 'object' || (!obj.days && !obj.weights && !obj.userProfile)) {
            alert('El archivo no parece un respaldo de Plan Hugo.');
            return;
          }
          const msg = `Vas a IMPORTAR:\n  ${stateSummary(obj)}\n\nReemplaza lo de este dispositivo:\n  ${stateSummary(state)}\n\nAntes de continuar se descargará un respaldo de tus datos actuales. ¿Continuar?`;
          if (!confirm(msg)) return;
          downloadBackup(`plan-hugo-PRE-IMPORT-${todayKey()}.json`);
          setState((prev) => ({ ...prev, ...obj, settings: { ...(prev.settings || {}), ...(obj.settings || {}) } }));
          alert('Respaldo importado. Revísalo y guarda.');
        } catch (e) {
          alert('No se pudo leer el JSON: ' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Restaura la copia rotatoria local (plan-hugo-v3-bak) que saveState mantiene antes de cada
  // escritura. Red de seguridad si el estado actual quedó mal pero el backup sigue bueno.
  const restoreLocalBackup = () => {
    let raw = null;
    try { raw = localStorage.getItem(BACKUP_STORAGE_KEY); } catch {}
    if (!raw) { alert('No hay respaldo local (plan-hugo-v3-bak) en este dispositivo.'); return; }
    let obj = null;
    try { obj = JSON.parse(raw); } catch { alert('El respaldo local está dañado.'); return; }
    if (!obj || typeof obj !== 'object') { alert('El respaldo local no es válido.'); return; }
    if (!confirm('¿Restaurar la copia local anterior (plan-hugo-v3-bak)? Reemplaza el estado actual de este dispositivo.')) return;
    setState(() => obj);
    alert('Respaldo local restaurado.');
  };

  // Orden de pestañas: mismo settings.tabOrder que el arrastre de la barra; acá lo movemos
  // con ↑↓ (sirve en móvil, donde arrastrar la barra inferior es latoso).
  const moveTab = (i, delta) => {
    const ids = orderBentoTabs(state.settings?.tabOrder).map((t) => t.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), tabOrder: ids } }));
  };
  const resetTabOrder = () => setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), tabOrder: null } }));

  const resetAll = () => {
    if (!confirm('¿Borrar TODOS los datos? Esto incluye historial de comidas, pesos, banco y onboarding.')) return;
    const backed = downloadBackup(`plan-hugo-PRE-RESET-${todayKey()}.json`);
    const ok = confirm(backed
      ? 'Se descargó un respaldo (plan-hugo-PRE-RESET-…json) por si te arrepientes.\n\nConfirma una vez más: ¿resetear todo?'
      : 'OJO: no se pudo descargar el respaldo automático. Mejor cancela y usa "Exportar JSON" primero.\n\n¿Resetear igual?');
    if (!ok) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
    } catch {}
    // Pequeña espera para no cancelar la descarga del respaldo en algunos navegadores.
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">⚙️ Ajustes</h2>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Mi perfil & metas</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {profile
                  ? `${profile.age}a · ${profile.sex === 'F' ? '♀' : '♂'} · ${profile.heightCm}cm · ${profile.weightKg}kg · ${ACTIVITY_LABELS[profile.activityLevel]?.label || profile.activityLevel}`
                  : 'Sin configurar — usando targets default'}
              </div>
            </div>
            <button type="button" onClick={() => setEditProfile(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
              {profile ? 'Editar' : 'Configurar'}
            </button>
          </div>
          {profile && (() => {
            const adaptive = computeAdaptiveTDEE(state);
            const t = calcTargets(profile, { adaptiveTdee: adaptive?.tdee });
            return (
              <>
                <div className="grid grid-cols-4 gap-1 text-center pt-1">
                  <div><div className="text-[9px] uppercase text-gray-500">kcal</div><div className="text-xs font-bold">{t.kcalMax}</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">P</div><div className="text-xs font-bold">{t.proteinMin}g</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">C</div><div className="text-xs font-bold">{t.carbsTarget}g</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">G</div><div className="text-xs font-bold">{t.fatTarget}g</div></div>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 pt-1.5 text-center">
                  {adaptive
                    ? `Gasto real estimado ${adaptive.tdee} kcal · de tus últimos ${adaptive.days} días (${adaptive.loggedDays} con registro)`
                    : `Gasto por fórmula ${t.formulaTdee || '—'} kcal · registra ≥14 días para estimar tu gasto real`}
                </div>
              </>
            );
          })()}
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Anthropic API Key</span>
          <div className="mt-1 flex gap-2">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
            />
            <button type="button" onClick={() => setShow((s) => !s)}
              className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm">
              {show ? '🙈' : '👁️'}
            </button>
          </div>
          {existing && !show && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Guardada · termina en {existing.slice(-4)}</p>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
            Solo se guarda en este dispositivo. Se envía únicamente a api.anthropic.com.
          </p>
        </label>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Orden de pestañas</div>
            <button type="button" onClick={resetTabOrder}
              className="text-[11px] text-gray-500 dark:text-gray-400 underline">Restablecer</button>
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1">Mueve con ↑↓. En el desktop también puedes arrastrarlas directo en la barra.</div>
          <div className="space-y-1">
            {orderBentoTabs(state.settings?.tabOrder).map((t, i, arr) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <span className="text-base">{t.icon}</span>
                <span className="flex-1 text-sm">{t.label}</span>
                <button type="button" disabled={i === 0} onClick={() => moveTab(i, -1)} aria-label={`Subir ${t.label}`}
                  className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-700 text-sm disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800">↑</button>
                <button type="button" disabled={i === arr.length - 1} onClick={() => moveTab(i, 1)} aria-label={`Bajar ${t.label}`}
                  className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-700 text-sm disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800">↓</button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={saveImages} onChange={(e) => setSaveImages(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-emerald-500" />
          <div>
            <div className="text-sm font-medium">Guardar imágenes de mediciones</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Conserva la captura original (comprimida) en localStorage. Default: apagado.</div>
          </div>
        </label>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Recordatorios</div>
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={notifEnabled} onChange={(e) => toggleNotifEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500" />
            <div className="flex-1">
              <div className="text-sm font-medium">Notificaciones del navegador</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Permiso: <span className="font-semibold">{notifPermStatus}</span>
              </div>
              {notifPermStatus !== 'granted' && notifEnabled && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                  En iOS solo funciona si instalas la app desde Safari → Compartir → Agregar a inicio (iOS 16.4+).
                </p>
              )}
            </div>
          </label>
          {notifEnabled && notifPermStatus === 'granted' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🥪 Colación 1</span>
                  <input type="time" value={notifColacion1} onChange={(e) => setNotifColacion1(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🍚 Almuerzo</span>
                  <input type="time" value={notifAlmuerzo} onChange={(e) => setNotifAlmuerzo(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🥪 Colación 2</span>
                  <input type="time" value={notifColacion2} onChange={(e) => setNotifColacion2(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🍽️ Cena</span>
                  <input type="time" value={notifCena} onChange={(e) => setNotifCena(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">💧 Agua</span>
                  <input type="time" value={notifAgua} onChange={(e) => setNotifAgua(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
              </div>
              <button type="button" onClick={testNotification}
                className="mt-2 w-full py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                Enviar notificación de prueba
              </button>
            </>
          )}
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">🎯 Objetivos de la racha</div>
          {!profile ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Configura tu perfil para poder fijar tus objetivos a mano.</p>
              <button type="button" onClick={() => setEditProfile(true)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">Configurar</button>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Fija la meta de kcal y proteína que decide si un día cuenta para la racha. En automático salen de tu TDEE.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-4">
                {/* kcal */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">🔥 Calorías</span>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <button type="button"
                        onClick={() => setKcalTargetDraft(null)}
                        className={`px-2 py-1 rounded-lg font-semibold ${kcalTargetDraft == null ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>Auto</button>
                      <button type="button"
                        onClick={() => setKcalTargetDraft((v) => (v == null ? (previewAuto?.kcalMax || 2300) : v))}
                        className={`px-2 py-1 rounded-lg font-semibold ${kcalTargetDraft != null ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>Manual</button>
                    </div>
                  </div>
                  {kcalTargetDraft == null ? (
                    <div className="text-center text-[11px] text-gray-500 dark:text-gray-400">Automático: <span className="font-semibold text-gray-700 dark:text-gray-300">{previewAuto?.kcalMax ?? '—'}</span> kcal/día</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-3">
                        <button type="button"
                          onClick={() => setKcalTargetDraft((v) => Math.max(1000, (v || 0) - 50))}
                          className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">−</button>
                        <div className="text-center">
                          <input type="number" inputMode="numeric" step="50" min="1000" max="5000"
                            value={kcalTargetDraft}
                            onChange={(e) => setKcalTargetDraft(Math.max(1000, Math.min(5000, Number(e.target.value) || 0)))}
                            className="w-24 text-center text-2xl font-bold bg-transparent border-0 focus:outline-none" />
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">kcal/día</div>
                        </div>
                        <button type="button"
                          onClick={() => setKcalTargetDraft((v) => Math.min(5000, (v || 0) + 50))}
                          className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">+</button>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[10px]">
                        {[2200, 2300, 2400, 2500].map((v) => (
                          <button type="button" key={v}
                            onClick={() => setKcalTargetDraft(v)}
                            className={`py-1 rounded-lg font-semibold ${kcalTargetDraft === v ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>{v}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* proteína */}
                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">🥩 Proteína</span>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <button type="button"
                        onClick={() => setProteinTargetDraft(null)}
                        className={`px-2 py-1 rounded-lg font-semibold ${proteinTargetDraft == null ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>Auto</button>
                      <button type="button"
                        onClick={() => setProteinTargetDraft((v) => (v == null ? (previewAuto?.proteinMin || 180) : v))}
                        className={`px-2 py-1 rounded-lg font-semibold ${proteinTargetDraft != null ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>Manual</button>
                    </div>
                  </div>
                  {proteinTargetDraft == null ? (
                    <div className="text-center text-[11px] text-gray-500 dark:text-gray-400">Automático: <span className="font-semibold text-gray-700 dark:text-gray-300">{previewAuto?.proteinMin ?? '—'}</span> g/día</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-3">
                        <button type="button"
                          onClick={() => setProteinTargetDraft((v) => Math.max(50, (v || 0) - 5))}
                          className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">−</button>
                        <div className="text-center">
                          <input type="number" inputMode="numeric" step="5" min="50" max="400"
                            value={proteinTargetDraft}
                            onChange={(e) => setProteinTargetDraft(Math.max(50, Math.min(400, Number(e.target.value) || 0)))}
                            className="w-24 text-center text-2xl font-bold bg-transparent border-0 focus:outline-none" />
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">g/día</div>
                        </div>
                        <button type="button"
                          onClick={() => setProteinTargetDraft((v) => Math.min(400, (v || 0) + 5))}
                          className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">+</button>
                      </div>
                      {profile.goal === 'lose' && proteinTargetDraft < PROTEIN_FLOOR_LOSE && (
                        <div className="text-center text-[10px] text-amber-600 dark:text-amber-400">Recomendado ≥ {PROTEIN_FLOOR_LOSE} g en déficit para preservar músculo.</div>
                      )}
                    </>
                  )}
                </div>
                {/* preview racha */}
                {previewTargets && (
                  <div className="text-center text-[11px] text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                    Un día cuenta si: kcal entre <span className="font-semibold text-emerald-600 dark:text-emerald-400">{previewTargets.kcalMin}–{previewTargets.kcalRed}</span> y proteína ≥ <span className="font-semibold text-emerald-600 dark:text-emerald-400">{previewTargets.proteinYellow} g</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {profile && profile.goal === 'lose' && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">📉 Déficit calórico diario</div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Cuánto comes por debajo de tu TDEE. El banner de ajuste automático también lo modifica cada ~2 semanas.</p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
              <div className="flex items-center justify-center gap-3">
                <button type="button"
                  onClick={() => setKcalDeficitDraft((v) => Math.max(0, v - 50))}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  −
                </button>
                <div className="text-center">
                  <input type="number" inputMode="numeric" step="50" min="0" max="1500"
                    value={kcalDeficitDraft}
                    onChange={(e) => setKcalDeficitDraft(Math.max(0, Math.min(1500, Number(e.target.value) || 0)))}
                    className="w-24 text-center text-2xl font-bold bg-transparent border-0 focus:outline-none" />
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">kcal/día</div>
                </div>
                <button type="button"
                  onClick={() => setKcalDeficitDraft((v) => Math.min(1500, v + 50))}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  +
                </button>
              </div>
              {previewAuto && previewAuto.tdee != null && (
                <div className="text-center text-[11px] text-gray-600 dark:text-gray-400">
                  TDEE: <span className="font-semibold">{previewAuto.tdee}</span> kcal · Meta diaria: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{previewAuto.kcalMax}</span> kcal
                </div>
              )}
              {kcalTargetDraft != null && (
                <div className="text-center text-[11px] text-amber-600 dark:text-amber-400">
                  Meta de kcal en modo manual ({kcalTargetDraft}) — el déficit no la afecta.
                </div>
              )}
              <div className="grid grid-cols-5 gap-1 text-[10px]">
                {[200, 400, 500, 600, 750].map((v) => (
                  <button type="button" key={v}
                    onClick={() => setKcalDeficitDraft(v)}
                    className={`py-1 rounded-lg font-semibold ${kcalDeficitDraft === v ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">☁️ Sync entre dispositivos</div>
          <SyncSection state={state} setState={setState} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">📲 Sincronizar desde el chat</div>
          <BridgeSyncSection state={state} setState={setState} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Importar histórico</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setBulkWeights(true)}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              ⚖️ Pesos
            </button>
            <button type="button" onClick={() => setBulkWorkouts(true)}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              🔥 Entrenamientos
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Datos</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={exportJson}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              📤 Exportar JSON
            </button>
            <button type="button" onClick={exportCsv}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              📊 Exportar CSV
            </button>
            <button type="button" onClick={importJsonFile}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              📥 Importar JSON
            </button>
            <button type="button" onClick={restoreLocalBackup}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              ↩️ Restaurar respaldo
            </button>
            <button type="button" onClick={resetAll}
              className="col-span-2 py-2.5 px-3 rounded-xl border border-rose-300 dark:border-rose-700 text-sm font-medium text-left text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20">
              🗑️ Resetear todo
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="button" onClick={save}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </div>

      {editProfile && <OnboardingModal state={state} setState={setState} onClose={() => setEditProfile(false)} editing />}
      {bulkWeights && <BulkWeightsModal state={state} setState={setState} onClose={() => setBulkWeights(false)} />}
      {bulkWorkouts && <BulkWorkoutsModal state={state} setState={setState} onClose={() => setBulkWorkouts(false)} />}
    </div>
  );
}

const SMA_METRICS = new Set([
  'weightKg', 'bodyFatPct', 'fatKg', 'muscleKg', 'skeletalMuscleKg',
  'fatFreeMassKg', 'subcutaneousFatKg', 'waterKg', 'proteinKg',
  'waistCm', 'hipCm', 'chestCm', 'neckCm', 'bicepCm', 'thighCm',
  'bmi', 'ffmi', 'waistHipRatio',
]);

function WeightChart({ weights, metric, rangeDays, goalWeightKg }) {
  const m = CHART_METRICS.find((x) => x.key === metric) || CHART_METRICS[0];
  // Mide el ancho real del contenedor para que el viewBox sea 1:1 con los píxeles:
  // sin esto (preserveAspectRatio none) el SVG se estira y deforma puntos y trazos.
  const wrapRef = React.useRef(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allPoints = weights
    .filter((w) => w[m.key] != null)
    .map((w) => ({ x: new Date(w.date + 'T' + (w.time || '12:00')).getTime(), y: Number(w[m.key]) }))
    .sort((a, b) => a.x - b.x);
  // Recorte a la ventana visible (7/28/90d). Si quedaran <2 puntos, cae a todo el historial
  // para no dejar el gráfico vacío con ventanas cortas y poca data.
  const winMs = Number.isFinite(rangeDays) ? rangeDays * 86400000 : Infinity;
  let points = winMs === Infinity ? allPoints : allPoints.filter((p) => p.x >= Date.now() - winMs);
  if (points.length < 2) points = allPoints;

  if (points.length === 0) {
    return (
      <div ref={wrapRef} className="h-48 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 italic">
        Sin datos de {m.label.toLowerCase()} aún
      </div>
    );
  }

  const useSMA = SMA_METRICS.has(m.key) && points.length >= 3;
  const sma = useSMA ? computeSMA(points, 7) : [];

  // Tendencia lineal (regresión) sobre los puntos visibles + proyección a futuro.
  // Guard: ≥3 puntos y span ≥14 días (mismo criterio que computeTrendAnalysis), si no la
  // pendiente es ruido. La proyección visual se limita a 28 días (o hasta cruzar la meta antes).
  const dataMaxX = points[points.length - 1].x;
  const spanDaysVis = (dataMaxX - points[0].x) / 86400000;
  const showTrend = points.length >= 3 && spanDaysVis >= 14;
  let trendYAt = null, projEndX = null;
  if (showTrend) {
    const slopePerDay = linRegSlopePerDay(points); // unidades/día (− = bajando)
    if (slopePerDay != null) {
      const tx0 = points[0].x;
      let n = 0, sxd = 0, sy = 0;
      for (const p of points) { const xd = (p.x - tx0) / 86400000; n++; sxd += xd; sy += p.y; }
      const mxd = sxd / n, my = sy / n;
      trendYAt = (x) => my + slopePerDay * ((x - tx0) / 86400000 - mxd);
      let projDays = 28;
      if (m.key === 'weightKg' && goalWeightKg && slopePerDay < 0) {
        const yNow = trendYAt(dataMaxX);
        projDays = yNow > goalWeightKg ? Math.min(28, (goalWeightKg - yNow) / slopePerDay) : 0;
      }
      projEndX = dataMaxX + Math.max(0, projDays) * 86400000;
    }
  }

  const H = 224, padL = 38, padR = 16, padT = 22, padB = 26;
  const xs = points.map((p) => p.x);
  const allY = useSMA ? [...points.map((p) => p.y), ...sma.map((p) => p.y)] : [...points.map((p) => p.y)];
  if (trendYAt) {
    allY.push(trendYAt(points[0].x), trendYAt(dataMaxX));
    if (projEndX != null) allY.push(trendYAt(projEndX));
  }
  const minX = Math.min(...xs);
  const maxX = projEndX != null ? Math.max(dataMaxX, projEndX) : Math.max(...xs);
  let minY = Math.min(...allY), maxY = Math.max(...allY);
  const spanY = maxY - minY || 1;
  minY -= spanY * 0.12; maxY += spanY * 0.12;
  const spanX = maxX - minX || 1;

  const sx = (x) => padL + ((x - minX) / spanX) * (W - padL - padR);
  const sy = (y) => H - padB - ((y - minY) / (maxY - minY || 1)) * (H - padT - padB);
  const baseY = H - padB;

  // Línea principal: la media móvil cuando aplica, si no la serie cruda.
  const mainPts = useSMA ? sma : points;
  const linePath = mainPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const areaPath = mainPts.length
    ? `${linePath} L ${sx(mainPts[mainPts.length - 1].x).toFixed(1)} ${baseY.toFixed(1)} L ${sx(mainPts[0].x).toFixed(1)} ${baseY.toFixed(1)} Z`
    : '';
  const rawPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');

  const spansMultipleYears = points.length > 1
    && new Date(points[0].x).getFullYear() !== new Date(points[points.length - 1].x).getFullYear();

  const fmtDate = (ts, withYear = false) => {
    const d = new Date(ts);
    const base = `${d.getDate()}/${d.getMonth() + 1}`;
    return withYear ? `${base}/${String(d.getFullYear()).slice(-2)}` : base;
  };
  const dec = spanY < 5 ? 1 : 0;
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);

  const last = points[points.length - 1];
  const lastX = sx(last.x), lastY = sy(last.y);
  const lastLabel = `${last.y.toFixed(dec)}${m.unit ? ' ' + m.unit : ''}`;
  const labelAnchor = lastX > W - 60 ? 'end' : 'middle';
  const labelY = Math.max(padT - 6, lastY - 14);
  const gradId = `wchart-grad-${m.key}`;

  return (
    <div ref={wrapRef} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: H }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={m.color} stopOpacity="0.28" />
            <stop offset="92%" stopColor={m.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke="var(--bento-hairline)"
              strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 5'} strokeLinecap="round" />
            <text x={padL - 8} y={sy(v) + 3.5} textAnchor="end" fill="var(--bento-faint)" fontSize="10.5">
              {v.toFixed(dec)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}

        {/* Serie cruda tenue detrás de la media móvil */}
        {useSMA && (
          <path d={rawPath} fill="none" stroke={m.color} strokeWidth="1.5" strokeOpacity="0.22" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Línea principal */}
        <path d={linePath} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Tendencia lineal (sólida) + proyección a futuro (punteada) */}
        {trendYAt && (
          <>
            <path d={`M ${sx(points[0].x).toFixed(1)} ${sy(trendYAt(points[0].x)).toFixed(1)} L ${sx(dataMaxX).toFixed(1)} ${sy(trendYAt(dataMaxX)).toFixed(1)}`}
              fill="none" stroke="var(--bento-ink)" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
            {projEndX != null && projEndX > dataMaxX && (
              <path d={`M ${sx(dataMaxX).toFixed(1)} ${sy(trendYAt(dataMaxX)).toFixed(1)} L ${sx(projEndX).toFixed(1)} ${sy(trendYAt(projEndX)).toFixed(1)}`}
                fill="none" stroke="var(--bento-ink)" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
            )}
          </>
        )}

        {points.map((p, i) => {
          const skipLabel = points.length > 6 && i % Math.ceil(points.length / 6) !== 0 && i !== points.length - 1;
          const anchor = spansMultipleYears
            ? (i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle'))
            : 'middle';
          return !skipLabel && (
            <text key={`x${i}`} x={sx(p.x)} y={H - 7} textAnchor={anchor} fill="var(--bento-faint)" fontSize="10.5">
              {fmtDate(p.x, spansMultipleYears)}
            </text>
          );
        })}

        {/* Puntos crudos discretos (cuando hay media móvil) */}
        {useSMA && points.map((p, i) => (
          <circle key={`pt${i}`} cx={sx(p.x)} cy={sy(p.y)} r="2.5" fill={m.color} fillOpacity="0.35">
            <title>{`${fmtDate(p.x, true)}: ${p.y.toFixed(1)}${m.unit ? ' ' + m.unit : ''}`}</title>
          </circle>
        ))}
        {!useSMA && points.map((p, i) => (
          <circle key={`pt${i}`} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="var(--bento-card)"
            stroke={m.color} strokeWidth="2.5">
            <title>{`${fmtDate(p.x, true)}: ${p.y.toFixed(1)}${m.unit ? ' ' + m.unit : ''}`}</title>
          </circle>
        ))}

        {/* Último punto destacado + valor actual */}
        <circle cx={lastX} cy={lastY} r="9" fill={m.color} fillOpacity="0.16" />
        <circle cx={lastX} cy={lastY} r="4.5" fill={m.color} stroke="var(--bento-card)" strokeWidth="2" />
        <text x={lastX} y={labelY} textAnchor={labelAnchor} fontSize="12.5" fontWeight="700" fill={m.color}>
          {lastLabel}
          <title>{`${fmtDate(last.x, true)}: ${lastLabel}`}</title>
        </text>
      </svg>

      {(useSMA || trendYAt) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] px-1 mt-1.5" style={{ color: 'var(--bento-faint)' }}>
          {useSMA && (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: m.color, opacity: 0.3 }}></span>
                valores crudos
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3.5 h-1 rounded-full" style={{ background: m.color }}></span>
                media móvil 7d
              </span>
            </>
          )}
          {trendYAt && (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3.5 h-1 rounded-full" style={{ background: 'var(--bento-ink)', opacity: 0.5 }}></span>
                tendencia
              </span>
              {projEndX != null && projEndX > dataMaxX && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3.5 h-0 border-t-2 border-dashed" style={{ borderColor: 'var(--bento-ink)', opacity: 0.5 }}></span>
                  proyección
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WeightEntryModal({ state, setState, editing, initialMode, onClose }) {
  const [mode, setMode] = useState(editing ? 'manual' : (initialMode || 'upload'));
  const [attachments, setAttachments] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState(() => {
    const f = { date: todayKey(), time: '' };
    for (const wf of WEIGHT_FIELDS) f[wf.key] = '';
    for (const sf of STRING_FIELDS) f[sf.key] = '';
    for (const seg of SEGMENT_FIELDS) f[seg.key] = '';
    if (editing) {
      f.date = editing.date || todayKey();
      f.time = editing.time || '';
      for (const wf of WEIGHT_FIELDS) f[wf.key] = editing[wf.key] != null ? String(editing[wf.key]) : '';
      for (const sf of STRING_FIELDS) f[sf.key] = editing[sf.key] || '';
      for (const seg of SEGMENT_FIELDS) f[seg.key] = editing[seg.key] || '';
    }
    return f;
  });
  const [note, setNote] = useState(editing?.note || '');
  const [extraFields, setExtraFields] = useState(editing?.rawExtracted && Object.keys(editing.rawExtracted).filter(k => !WEIGHT_FIELDS.find(wf => wf.key === k) && !STRING_FIELDS.find(sf => sf.key === k) && !SEGMENT_FIELDS.find(seg => seg.key === k)) || []);
  const [mergePrompt, setMergePrompt] = useState(false);
  // Secciones colapsables: por defecto colapsadas si no hay datos
  const hasDataInCat = (cat) => {
    if (cat === 'seg') return SEGMENT_FIELDS.some(seg => editing?.[seg.key]);
    return WEIGHT_FIELDS.filter(wf => wf.cat === cat).some(wf => editing?.[wf.key] != null)
      || STRING_FIELDS.filter(sf => sf.cat === cat).some(sf => editing?.[sf.key]);
  };
  const [openSections, setOpenSections] = useState(() => ({
    main: true, // siempre abierta
    mass: editing ? hasDataInCat('mass') : true,
    pct: editing ? hasDataInCat('pct') : false,
    idx: editing ? hasDataInCat('idx') : false,
    static: editing ? hasDataInCat('static') : false,
    circ: editing ? hasDataInCat('circ') : false,
    seg: editing ? hasDataInCat('seg') : false,
  }));
  const toggleSection = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const apiKey = state.settings?.anthropicApiKey;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos (máximo ${MAX_IMAGES}).`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0) return;
    setProcessing(true); setError(null);
    try {
      const extracted = await extractMetricsFromImage(attachments, apiKey);
      const next = { ...fields };
      if (typeof extracted.measurementDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.measurementDate)) {
        next.date = extracted.measurementDate;
      }
      for (const wf of WEIGHT_FIELDS) {
        if (extracted[wf.key] != null) next[wf.key] = String(extracted[wf.key]);
      }
      for (const sf of STRING_FIELDS) {
        if (extracted[sf.key] != null) next[sf.key] = String(extracted[sf.key]);
      }
      for (const seg of SEGMENT_FIELDS) {
        if (extracted[seg.key] != null) next[seg.key] = String(extracted[seg.key]);
      }
      setFields(next);
      const knownKeys = new Set([
        ...WEIGHT_FIELDS.map(wf => wf.key),
        ...STRING_FIELDS.map(sf => sf.key),
        ...SEGMENT_FIELDS.map(seg => seg.key),
        'measurementDate',
      ]);
      const extras = Object.keys(extracted).filter((k) => !knownKeys.has(k) && extracted[k] != null);
      if (extras.length) {
        setExtraFields(extras.map((k) => ({ key: k, value: extracted[k] })));
      }
      // Auto-expand sections that received data
      setOpenSections((s) => ({
        ...s,
        mass: s.mass || WEIGHT_FIELDS.filter(wf => wf.cat === 'mass').some(wf => extracted[wf.key] != null),
        pct: s.pct || WEIGHT_FIELDS.filter(wf => wf.cat === 'pct').some(wf => extracted[wf.key] != null),
        idx: s.idx || WEIGHT_FIELDS.filter(wf => wf.cat === 'idx').some(wf => extracted[wf.key] != null) || STRING_FIELDS.some(sf => extracted[sf.key] != null),
        static: s.static || WEIGHT_FIELDS.filter(wf => wf.cat === 'static').some(wf => extracted[wf.key] != null),
        circ: s.circ || WEIGHT_FIELDS.filter(wf => wf.cat === 'circ').some(wf => extracted[wf.key] != null),
        seg: s.seg || SEGMENT_FIELDS.some(seg => extracted[seg.key] != null),
      }));
      setMode('manual');
    } catch (err) {
      setError(err.message || 'Error procesando archivos');
    } finally {
      setProcessing(false);
    }
  };

  const buildPayload = () => {
    const out = { id: editing?.id || uuid(), date: fields.date, time: fields.time || null, note: note.trim() };
    for (const wf of WEIGHT_FIELDS) {
      const v = String(fields[wf.key] || '').trim();
      out[wf.key] = v === '' ? null : Number(v);
    }
    for (const sf of STRING_FIELDS) {
      const v = String(fields[sf.key] || '').trim();
      out[sf.key] = v === '' ? null : v;
    }
    for (const seg of SEGMENT_FIELDS) {
      const v = String(fields[seg.key] || '').trim();
      out[seg.key] = v === '' ? null : v;
    }
    if (extraFields.length) {
      out.rawExtracted = {};
      for (const ef of extraFields) {
        if (ef.key && ef.value !== '' && ef.value != null) {
          out.rawExtracted[ef.key] = typeof ef.value === 'number' ? ef.value : (isNaN(Number(ef.value)) ? ef.value : Number(ef.value));
        }
      }
    }
    if (state.settings?.saveImages && attachments.length) {
      const firstImage = attachments.find((a) => a.kind === 'image');
      if (firstImage) out.sourceImage = firstImage.dataUrl;
    }
    return out;
  };

  const sameDayExisting = !editing
    ? (state.weights || []).find((w) => w.date === fields.date)
    : null;

  const doSave = (mergeWithId = null) => {
    const out = buildPayload();
    setState((prev) => {
      const list = prev.weights || [];
      let next;
      if (editing) {
        next = list.map((w) => (w.id === editing.id ? { ...w, ...out } : w));
      } else if (mergeWithId) {
        next = list.map((w) => {
          if (w.id !== mergeWithId) return w;
          const merged = { ...w };
          for (const wf of WEIGHT_FIELDS) {
            if (out[wf.key] != null) merged[wf.key] = out[wf.key];
          }
          for (const sf of STRING_FIELDS) {
            if (out[sf.key] != null) merged[sf.key] = out[sf.key];
          }
          for (const seg of SEGMENT_FIELDS) {
            if (out[seg.key] != null) merged[seg.key] = out[seg.key];
          }
          if (out.note) merged.note = w.note ? `${w.note} · ${out.note}` : out.note;
          if (out.rawExtracted) merged.rawExtracted = { ...(w.rawExtracted || {}), ...out.rawExtracted };
          if (out.time && !w.time) merged.time = out.time;
          if (out.sourceImage && !w.sourceImage) merged.sourceImage = out.sourceImage;
          return merged;
        });
      } else {
        next = [...list, out];
      }
      return { ...prev, weights: next };
    });
    onClose();
  };

  const save = () => {
    if (sameDayExisting) {
      setMergePrompt(true);
      return;
    }
    doSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? 'Editar medición' : 'Nueva medición'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm">✕</button>
        </div>

        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('upload')}
              className={`py-2 rounded-xl text-sm font-medium border-2 ${mode === 'upload' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              📸 Captura
            </button>
            <button onClick={() => setMode('manual')}
              className={`py-2 rounded-xl text-sm font-medium border-2 ${mode === 'manual' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              ✏️ Manual
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fecha</span>
            <input type="date" value={fields.date}
              onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Hora (opcional)</span>
            <input type="time" value={fields.time}
              onChange={(e) => setFields((f) => ({ ...f, time: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>
        {mode === 'upload' && !editing && fields.date === todayKey() && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 -mt-2">
            ⚠️ Si la medición es de otro día, cambia la fecha antes de procesar.
          </p>
        )}

        {mode === 'upload' && !editing && (
          <div className="space-y-3">
            {attachments.length === 0 ? (
              <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-500">
                <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                <div className="text-4xl mb-2">📎</div>
                <div className="text-sm font-medium">Subir capturas, PDFs o exportaciones</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Foto · PDF · CSV · JSON · TXT — hasta {MAX_IMAGES} archivos</div>
              </label>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {attachments.map((a, i) => (
                    <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
                  ))}
                  {attachments.length < MAX_IMAGES && (
                    <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                      <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                      +
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{attachments.length} / {MAX_IMAGES} archivos · Claude los procesará juntos y combinará los campos.</p>
                <button onClick={handleProcess} disabled={processing || !apiKey}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
                  {processing ? 'Procesando…' : 'Procesar con Claude ✨'}
                </button>
                {!apiKey && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
                )}
              </div>
            )}
            {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
          </div>
        )}

        {(mode === 'manual' || editing) && (
          <div className="space-y-3">
            {Object.entries(WEIGHT_CAT_LABELS).map(([catKey, catLabel]) => {
              const fieldsInCat = WEIGHT_FIELDS.filter((wf) => wf.cat === catKey);
              const stringFieldsInCat = STRING_FIELDS.filter((sf) => sf.cat === catKey);
              if (fieldsInCat.length === 0 && stringFieldsInCat.length === 0) return null;
              const isOpen = openSections[catKey];
              const filledCount = fieldsInCat.filter(wf => fields[wf.key] !== '').length
                + stringFieldsInCat.filter(sf => fields[sf.key] !== '').length;
              return (
                <div key={catKey} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <button type="button" onClick={() => toggleSection(catKey)}
                    className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">{catLabel}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {filledCount > 0 && <span className="mr-2 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">{filledCount}</span>}
                      {isOpen ? '▼' : '▶'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-3 grid grid-cols-2 gap-3">
                      {fieldsInCat.map((wf) => (
                        <label key={wf.key} className="block">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{wf.label}{wf.unit && ` (${wf.unit})`}</span>
                          <input type="number" inputMode="decimal" step={wf.step} value={fields[wf.key]}
                            onChange={(e) => setFields((f) => ({ ...f, [wf.key]: e.target.value }))}
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                        </label>
                      ))}
                      {stringFieldsInCat.map((sf) => (
                        <label key={sf.key} className="block col-span-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{sf.label}</span>
                          <select value={fields[sf.key]}
                            onChange={(e) => setFields((f) => ({ ...f, [sf.key]: e.target.value }))}
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="">— Sin especificar —</option>
                            {sf.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Análisis segmental */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button type="button" onClick={() => toggleSection('seg')}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/60">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Análisis segmental</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {(() => {
                    const n = SEGMENT_FIELDS.filter(sf => fields[sf.key] !== '').length;
                    return n > 0 ? <span className="mr-2 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">{n}</span> : null;
                  })()}
                  {openSections.seg ? '▼' : '▶'}
                </span>
              </button>
              {openSections.seg && (
                <div className="p-3 space-y-3">
                  {['fat', 'muscle'].map((grp) => (
                    <div key={grp}>
                      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        {grp === 'fat' ? 'Grasa por zona' : 'Músculo por zona'}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {SEGMENT_FIELDS.filter(sf => sf.group === grp).map((seg) => (
                          <label key={seg.key} className="block">
                            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{seg.label}</span>
                            <select value={fields[seg.key]}
                              onChange={(e) => setFields((f) => ({ ...f, [seg.key]: e.target.value }))}
                              className="mt-0.5 w-full px-2 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                              <option value="">—</option>
                              {SEGMENT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {extraFields.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Campos extra detectados</div>
                <div className="space-y-1.5">
                  {extraFields.map((ef, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-gray-700 dark:text-gray-300">{ef.key}</span>
                      <span className="font-semibold">{String(ef.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nota (opcional)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. en ayunas, post-entreno"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          </div>
        )}

        {(mode === 'manual' || editing) && (
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
          </div>
        )}
      </div>

      {mergePrompt && sameDayExisting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <h3 className="text-base font-bold">Ya hay una medición del {fields.date}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">¿Quieres agregar estos datos a la medición existente o crear una nueva?</p>
            <div className="space-y-2">
              <button onClick={() => doSave(sameDayExisting.id)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
                Mergear con existente
              </button>
              <button onClick={() => doSave()}
                className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">
                Crear nueva medición
              </button>
              <button onClick={() => setMergePrompt(false)}
                className="w-full py-2 text-sm text-gray-500 dark:text-gray-400">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EvolutionAnalysis({ state }) {
  const ev = computeEvolution(state.weights || [], state.userProfile?.goal);
  const total = (state.weights || []).filter((w) => w.weightKg != null).length;

  if (!ev) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📈</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tu evolución</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Necesitas al menos <span className="font-semibold">2 pesajes</span> para ver tu evolución.
          {total === 1 && ' Te falta 1 medición más.'}
          {total === 0 && ' Agrega tu primer pesaje arriba.'}
        </p>
      </div>
    );
  }

  const mantener = ev.metrics.filter((m) => m.status === 'mejora');
  const mejorar = ev.metrics.filter((m) => m.status === 'empeora');
  const toneFor = (status) => status === 'mejora' ? COLOR_CLASSES.green.text
    : status === 'empeora' ? COLOR_CLASSES.red.text : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tu evolución</h3>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          desde {shortDate(ev.firstDate)} · {ev.spanDays} {ev.spanDays === 1 ? 'día' : 'días'} · {ev.count} pesajes
        </span>
      </div>

      {/* Cambio total por métrica */}
      <div className="grid grid-cols-2 gap-3">
        {ev.metrics.map((m) => (
          <div key={m.key}>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{m.label}</div>
            <div className={`text-lg font-bold ${toneFor(m.status)}`}>
              {fmtDelta(m.delta, m.decimals)}<span className="text-xs font-normal ml-0.5">{m.unit}</span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">
              {m.first.toFixed(m.decimals)} → {m.last.toFixed(m.decimals)}{m.unit ? ` ${m.unit}` : ''}
            </div>
          </div>
        ))}
      </div>

      {ev.recomp && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <span className="text-base">💪</span>
          <p className={`text-xs ${COLOR_CLASSES.green.text}`}>
            <span className="font-semibold">Recomposición:</span> estás bajando grasa sin perder músculo. Justo lo que buscas.
          </p>
        </div>
      )}

      {/* Qué mantener */}
      {mantener.length > 0 && (
        <div className={`px-3 py-2.5 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${COLOR_CLASSES.green.text}`}>✅ Qué mantener</div>
          <ul className={`space-y-1 text-xs ${COLOR_CLASSES.green.text}`}>
            {mantener.map((m) => (
              <li key={m.key}>
                <span className="font-semibold">{m.label}</span>{' '}
                {m.better === 'down' ? 'bajando' : 'subiendo'} {Math.abs(m.weekly).toFixed(m.decimals)}{m.unit ? ` ${m.unit}` : ''}/sem — sigue así.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Qué mejorar */}
      {mejorar.length > 0 ? (
        <div className={`px-3 py-2.5 rounded-xl ${COLOR_CLASSES.amber.bg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${COLOR_CLASSES.amber.text}`}>⚠️ Qué mejorar</div>
          <ul className={`space-y-1 text-xs ${COLOR_CLASSES.amber.text}`}>
            {mejorar.map((m) => (
              <li key={m.key}>
                <span className="font-semibold">{m.label}</span>{' '}
                {m.better === 'down'
                  ? `subió ${Math.abs(m.delta).toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''} — apunta a bajarla.`
                  : `bajó ${Math.abs(m.delta).toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''} — cuídala con proteína y fuerza.`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <span className="text-base">🎯</span>
          <p className={`text-xs ${COLOR_CLASSES.green.text}`}>Nada que corregir: todas tus métricas van en la dirección correcta.</p>
        </div>
      )}
    </div>
  );
}

function TrendAnalysis({ state, targets }) {
  const data = computeTrendAnalysis(state.weights || [], state.days || {}, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
  const total = (state.weights || []).filter((w) => w.weightKg != null).length;

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis de tendencia</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Necesitas al menos <span className="font-semibold">2 pesajes</span> para ver análisis.
          {total === 1 && ' Te falta 1 medición más.'}
          {total === 0 && ' Agrega tu primer pesaje arriba.'}
        </p>
      </div>
    );
  }

  const i = interpretTrend(data, targets);
  const tone = i.tone;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis de tendencia</h3>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">Últimos {data.diasReal} {data.diasReal === 1 ? 'día' : 'días'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Cambio de peso</div>
          <div className={`text-lg font-bold ${data.deltaKg < 0 ? COLOR_CLASSES.green.text : data.deltaKg > 0 ? COLOR_CLASSES.red.text : ''}`}>
            {data.deltaKg > 0 ? '+' : ''}{data.deltaKg.toFixed(1)}<span className="text-xs font-normal ml-0.5">kg</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Promedio diario</div>
          {data.enoughData ? (
            <>
              <div className="text-lg font-bold">{data.promedioKcal}<span className="text-xs font-normal ml-0.5">kcal</span></div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{data.daysCount} de {data.diasReal} días</div>
            </>
          ) : (
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Datos insuficientes (n&lt;14)</div>
          )}
        </div>
      </div>

      {/* Ritmo de pérdida semanal — métrica operativa (regresión lineal 14-28 días, Garthe 2011) */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">Ritmo de pérdida · regresión 14-28 días</div>
        {data.lossPctPerWeek != null ? (
          <div className={`text-lg font-bold ${data.lossPctPerWeek >= LOSS_RATE_GREEN.min && data.lossPctPerWeek <= LOSS_RATE_GREEN.max ? COLOR_CLASSES.green.text : COLOR_CLASSES.amber.text}`}>
            {data.lossPctPerWeek < 0 ? '+' : '−'}{Math.abs(data.lossPctPerWeek).toFixed(2)}<span className="text-xs font-normal ml-0.5">%/sem{data.lossPctPerWeek < 0 ? ' (subiendo)' : ''}</span>
          </div>
        ) : (
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Datos insuficientes (n&lt;14)</div>
        )}
        <div className="text-[10px] text-gray-500 dark:text-gray-400">objetivo {LOSS_RATE_GREEN.min}-{LOSS_RATE_GREEN.max} %/sem</div>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">TDEE estimado</div>
          <div className="text-lg font-bold">~{data.tdeeEstimado}<span className="text-xs font-normal ml-0.5">kcal</span></div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Déficit</div>
          {data.enoughData && data.deficitDiario != null ? (
            <div className={`text-lg font-bold ${data.deficitDiario > 0 ? COLOR_CLASSES.green.text : data.deficitDiario < 0 ? COLOR_CLASSES.red.text : ''}`}>
              {data.deficitDiario > 0 ? '−' : data.deficitDiario < 0 ? '+' : ''}{Math.abs(data.deficitDiario)}<span className="text-xs font-normal ml-0.5">kcal/día</span>
            </div>
          ) : (
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Datos insuficientes (n&lt;14)</div>
          )}
        </div>
      </div>

      {data.promedioKcal == null && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
          Sin días con comidas registradas entre las dos mediciones. No puedo calcular tu TDEE estimado.
        </p>
      )}

      <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[tone].bg}`}>
        <span className="text-base">{i.icon}</span>
        <p className={`text-xs ${COLOR_CLASSES[tone].text}`}>{i.text}</p>
      </div>
    </div>
  );
}

const SEGMENT_TONE = {
  'Bajo':       { bg: 'bg-sky-100 dark:bg-sky-900/30',     text: 'text-sky-700 dark:text-sky-300' },
  'Bien':       { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'Alto':       { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  'Muy alto':   { bg: 'bg-rose-100 dark:bg-rose-900/30',   text: 'text-rose-700 dark:text-rose-300' },
};

function MetricStatusChip({ statusLabel }) {
  if (!statusLabel) return null;
  const tone = SEGMENT_TONE[statusLabel] || SEGMENT_TONE['Bien'];
  return <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold align-middle ${tone.bg} ${tone.text}`}>{statusLabel}</span>;
}

function NotesHistory({ state }) {
  const today = todayKey();
  const days = state?.days || {};
  // Recolectar últimos 14 días con notas
  const entries = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    const day = days[k];
    if (day?.notes) {
      const notes = day.notes;
      const hasAny = NOTE_FIELDS.some((f) => notes[f.key] != null) || notes.comment;
      if (hasAny) entries.push({ date: k, notes });
    }
  }
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">📓</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notas recientes</h3>
        <span className="ml-auto text-[10px] text-gray-400">últimos 14 días</span>
      </div>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.date} className="flex items-start gap-2 text-xs py-1 border-t border-gray-100 dark:border-gray-800 first:border-0">
            <div className="w-14 shrink-0 text-gray-500 dark:text-gray-400 font-mono">{e.date.slice(5)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {NOTE_FIELDS.filter((f) => e.notes[f.key] != null).map((f) => (
                  <span key={f.key} className="text-gray-700 dark:text-gray-300">
                    {f.emoji} <span className="font-semibold">{e.notes[f.key]}</span>
                  </span>
                ))}
              </div>
              {e.notes.comment && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-0.5 truncate">"{e.notes.comment}"</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanAdjustmentBanner({ state, setState }) {
  const adjustment = useMemo(() => computePlanAdjustment(state), [state]);
  if (!adjustment) return null;

  const stampAdjustment = (newDeficit, newLastAdjustmentDate) => {
    setState((prev) => ({
      ...prev,
      userProfile: {
        ...(prev.userProfile || {}),
        ...(newDeficit != null ? { kcalDeficit: newDeficit } : {}),
        lastAdjustmentDate: newLastAdjustmentDate,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const onPostpone7 = () => {
    // Mantener todo, marcar lastAdjustmentDate como hace 7 días → vuelve a evaluar en 7 días
    const d = new Date(); d.setDate(d.getDate() - 7);
    stampAdjustment(null, todayKey(d));
  };
  const onDismiss = () => stampAdjustment(null, todayKey());

  // CASO LENTO (<0.4 %/sem por ≥2 sem): extender duración del cardio. No tocar calorías.
  if (adjustment.kind === 'too_slow') {
    const onAck = () => stampAdjustment(null, todayKey());
    return (
      <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">🐢</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Pérdida lenta — extiende el cardio</h3>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">{adjustment.message}</p>
          </div>
        </div>
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Alarga la <strong>duración</strong> de tus sesiones de cardio. No agregues días ni recortes más calorías: la meta calórica (máx 2.092 kcal) se mantiene.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onAck}
            className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
            ✓ Entendido
          </button>
          <button onClick={onPostpone7}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            ⏰ 7 días
          </button>
        </div>
      </div>
    );
  }

  // CASO RÁPIDO (>0.8 %/sem): riesgo de masa magra. Solo AVISO — la meta calórica es fija,
  // NO se sugiere subir kcal. La palanca es proteína + fuerza, no comer más.
  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚠️</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Pérdida demasiado rápida</h3>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">{adjustment.message}</p>
        </div>
      </div>

      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        Asegura proteína (≥200 g/día) y fuerza para proteger la masa magra. La meta calórica se mantiene fija — no subas kcal.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onDismiss}
          className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
          ✓ Entendido
        </button>
        <button onClick={onPostpone7}
          className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          ⏰ 7 días
        </button>
      </div>
    </div>
  );
}

function WeighInNudge({ weights, onAction }) {
  const last = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const today = todayKey();
  let daysSince = 999;
  if (last?.date) {
    const ms = new Date(today + 'T12:00:00') - new Date(last.date + 'T12:00:00');
    daysSince = Math.max(0, Math.round(ms / 86400000));
  }
  if (daysSince < 3) return null;

  const isFirst = !last;
  return (
    <button onClick={onAction}
      className="w-full text-left rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-3.5 flex items-center gap-3 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
      <span className="text-2xl shrink-0">📸</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {isFirst ? 'Empieza tu primer pesaje' : `Toca pesaje Speediance (${daysSince} días sin medir)`}
        </div>
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
          Cada ~3-4 días. Saca 4-5 capturas de la app y Claude las procesa.
        </div>
      </div>
      <span className="shrink-0 text-emerald-700 dark:text-emerald-300 font-bold text-lg">→</span>
    </button>
  );
}

function RuleChips({ state, dateKey, targets }) {
  const statuses = useMemo(
    () => getRulesStatus(state, dateKey, targets),
    [state, dateKey, targets]
  );
  if (!statuses.length) return null;
  const toneClasses = {
    green: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    red: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
      {statuses.map((s) => (
        <div key={s.rule.id} title={s.rule.name}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${toneClasses[s.tone] || toneClasses.green}`}>
          <span>{s.rule.type === 'kcal_cap_extras' ? '🚫' : s.label === 'dulces' ? '🍰' : s.label === 'delivery' ? '🍱' : s.label === 'alcohol' ? '🍷' : '🔢'}</span>
          <span>{s.label}</span>
          <span className="opacity-80">{s.current}/{s.max}</span>
        </div>
      ))}
    </div>
  );
}

function ShoppingListModal({ state, onClose }) {
  const [windowDays, setWindowDays] = useState(7);
  const [includeRecipes, setIncludeRecipes] = useState(true);
  const list = useMemo(
    () => generateShoppingList(state, { windowDays, includeRecipes }),
    [state, windowDays, includeRecipes]
  );
  const anyFav = (state.recipeBank || []).some((r) => r.favorite);
  const hasRecipes = (state.recipeBank || []).length > 0;
  const [checked, setChecked] = useState({}); // normalizedName → bool
  const [copied, setCopied] = useState(false);

  const toggleItem = (norm) => {
    setChecked((prev) => ({ ...prev, [norm]: !prev[norm] }));
  };

  const text = useMemo(() => formatShoppingListText(list), [list]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🛒 Lista de compras</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          De lo que comiste los últimos <span className="font-semibold">{windowDays}</span> días
          {includeRecipes && hasRecipes ? <> + ingredientes de tus recetas {anyFav ? 'favoritas ⭐' : ''}</> : null}.
        </p>

        <div className="flex gap-1 text-[11px]">
          {[7, 14, 21].map((d) => (
            <button key={d} onClick={() => setWindowDays(d)}
              className={`flex-1 py-1.5 rounded-lg font-semibold ${
                windowDays === d
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
              {d} días
            </button>
          ))}
        </div>

        {hasRecipes && (
          <button onClick={() => setIncludeRecipes((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-left">
            <span className="text-xs text-gray-700 dark:text-gray-300">📒 Incluir ingredientes de mis recetas {anyFav ? 'favoritas' : ''}</span>
            <span className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${includeRecipes ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${includeRecipes ? 'left-[1.125rem]' : 'left-0.5'}`} />
            </span>
          </button>
        )}

        {list.groups.length === 0 ? (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 text-center">
            <div className="text-3xl mb-2">🛒</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Sin items en los últimos {windowDays} días.</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Marca tus comidas durante la semana y vuelve.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.groups.map((g) => (
              <div key={g.key}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">{g.label}</div>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const norm = normalizeName(it.name);
                    const isChecked = !!checked[norm];
                    return (
                      <button key={norm} onClick={() => toggleItem(norm)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition-colors ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-gray-400 dark:text-gray-500 line-through'
                            : 'bg-gray-50 dark:bg-gray-800/60 text-gray-800 dark:text-gray-200'
                        }`}>
                        <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isChecked ? '✓' : ''}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{it.name}</span>
                        {it.count > 1 && (
                          <span className="shrink-0 text-[10px] font-semibold text-gray-500 dark:text-gray-400">×{it.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={copyText}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            {copied ? '✅ Copiado' : '📋 Copiar texto'}
          </button>
          <button onClick={shareWhatsApp}
            className="py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600">
            📲 WhatsApp
          </button>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Ver texto plano</summary>
          <pre className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono">{text}</pre>
        </details>
      </div>
    </div>
  );
}

// Picker manual del banco para una toma (colación 1/2 o cena). Reemplaza la grilla inline que
// antes volcaba todo el banco en la portada. Tocar una opción la registra (vía pickForSlot).
function BankPickerModal({ kind, state, targets, onSelect, onClose }) {
  const isCena = kind === 'cena';
  const title = isCena ? 'Cena' : kind === 'colacion2' ? 'Colación 2' : 'Colación 1';
  const requireNoRefrig = kind === 'colacion2';
  const hasTag = (s, t) => Array.isArray(s.tags) && s.tags.includes(t);
  const bank = isCena ? (state.proteinBank || []) : (state.snackBank || []);
  let ordered = bank, aptasLen = 0;
  if (!isCena) {
    const apta = (s) => hasTag(s, 'portable') && (!requireNoRefrig || hasTag(s, 'sin-refrigeración'));
    const aptas = bank.filter(apta);
    const resto = bank.filter((s) => !apta(s));
    ordered = [...aptas, ...resto];
    aptasLen = aptas.length;
  }
  const hint = isCena ? 'Proteína + ensalada/verduras'
    : requireNoRefrig ? 'Para llevar · sin refrigeración' : 'Para llevar';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📋 Banco · {title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint} · toca una opción para registrarla.</p>
        <div className="grid grid-cols-1 gap-2.5">
          {ordered.map((s, i) => (
            <React.Fragment key={s.id}>
              {!isCena && i === aptasLen && aptasLen > 0 && ordered.length > aptasLen && (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 pt-1">
                  Resto del banco (no aptas para llevar)
                </div>
              )}
              <SelectableCard item={s}
                selected={false}
                onClick={() => onSelect(s.id)}
                showCategory={!isCena} targets={targets} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestSlotModal({ slot, state, targets, onSelect, onClose }) {
  const apiKey = state.settings?.anthropicApiKey;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const recents = useMemo(
    () => computeRecents(state.days || {}, 5),
    [state.days]
  );

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const recs = await suggestForSlot({ slot, state, targets, apiKey, recents });
      if (recs.length === 0) {
        setError('Claude no devolvió sugerencias válidas. Prueba refrescar.');
      }
      setSuggestions(recs);
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiKey) fetchSuggestions();
    else {
      setError('Configura tu API key en ⚙️ Ajustes primero.');
      setLoading(false);
    }
  }, []);

  const slotTitle = slot === 'snack' ? 'colación'
    : slot === 'dinner' ? 'cena'
    : slot === 'dessert_almuerzo' ? 'postre del almuerzo'
    : 'postre de la cena';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🤔 ¿Qué como de {slotTitle}?</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Claude (Haiku) revisa tus macros restantes, reglas activas y recientes.
        </p>

        {loading && (
          <div className="rounded-xl bg-sky-50 dark:bg-sky-900/30 p-6 text-center">
            <div className="text-2xl mb-2 animate-pulse">🤔</div>
            <p className="text-sm text-sky-700 dark:text-sky-300">Pensando…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/30 p-3 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onSelect(s.item)}
                className="w-full text-left rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 hover:border-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{emojiForFood(s.item.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.item.name}</div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                      <span className="font-semibold">{s.item.kcal}</span> kcal · P {s.item.protein}g
                      {s.item.carbs ? ` · C ${s.item.carbs}g` : ''}
                      {s.item.fat ? ` · G ${s.item.fat}g` : ''}
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 italic">
                      💡 {s.reason}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={fetchSuggestions} disabled={loading || !apiKey}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            🔄 Otras opciones
          </button>
          <button onClick={onClose}
            className="py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleViolationModal({ violations, onConfirm, onCancel }) {
  if (!violations || violations.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl">⚠️</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold">
              {violations.length === 1 ? 'Esto rompe una regla' : `Esto rompe ${violations.length} reglas`}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tus reglas personales (edita en ⚙️ Ajustes)</p>
          </div>
        </div>
        <div className="space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 p-3">
              <div className="text-sm font-semibold text-rose-800 dark:text-rose-200">{v.rule.name}</div>
              <div className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{v.message}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-sm">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 text-sm">Seguir igual</button>
        </div>
      </div>
    </div>
  );
}

function SegmentChip({ value }) {
  if (!value) return <span className="text-[10px] text-gray-400">—</span>;
  const tone = SEGMENT_TONE[value] || SEGMENT_TONE['Bien'];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone.bg} ${tone.text}`}>{value}</span>;
}

function SegmentAnalysis({ weight }) {
  if (!weight) return null;
  const hasAny = SEGMENT_FIELDS.some((seg) => weight[seg.key]);
  if (!hasAny) return null;

  const renderGroup = (group, title, emoji) => {
    const fields = SEGMENT_FIELDS.filter((sf) => sf.group === group);
    const hasData = fields.some((f) => weight[f.key]);
    if (!hasData) return null;
    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
          {emoji} {title}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {fields.map((seg) => (
            <div key={seg.key} className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{seg.label}</span>
              <SegmentChip value={weight[seg.key]} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🫁</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis segmental</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderGroup('fat', 'Grasa por zona', '🍔')}
        {renderGroup('muscle', 'Músculo por zona', '💪')}
      </div>
    </div>
  );
}

function WeightView({ state, setState, targets }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [metric, setMetric] = useState('weightKg');
  const [rangeDays, setRangeDays] = useState(90);
  const goalWeightKg = state.userProfile?.goalWeightKg ?? 90;
  const weights = (state.weights || []).slice().sort((a, b) => {
    const ka = (a.date || '') + 'T' + (a.time || '00:00');
    const kb = (b.date || '') + 'T' + (b.time || '00:00');
    return kb.localeCompare(ka);
  });
  const last = weights[0];

  // Tabla de historial: columnas de composición + circunferencias (sin segmentos),
  // mostrando solo las que tengan al menos un dato en el set de mediciones.
  const HIST_SHORT = {
    weightKg: 'Peso', bodyFatPct: '%Gr', score: 'Score',
    fatKg: 'Grasa', muscleKg: 'Músc', skeletalMuscleKg: 'M.esq', fatFreeMassKg: 'MLG',
    subcutaneousFatKg: 'Subcut', waterKg: 'Agua', proteinKg: 'Prot', boneKg: 'Hueso',
    musclePct: '%Músc', waterPct: '%Agua', proteinPct: '%Prot',
    bmi: 'IMC', ffmi: 'FFMI', metabolicAge: 'Edad', visceralFat: 'Visc', basalMetabolismKcal: 'TMB',
    waistHipRatio: 'C/C', referenceWeightKg: 'PesoRef',
    neckCm: 'Cuello', chestCm: 'Pecho', waistCm: 'Cintura', hipCm: 'Cadera',
    bicepCm: 'Bíceps', armCm: 'Brazo', forearmCm: 'Antebr', thighCm: 'Muslo', calfCm: 'Pant',
  };
  const histCols = WEIGHT_FIELDS
    .filter((wf) => ['main', 'mass', 'pct', 'idx', 'circ'].includes(wf.cat))
    .filter((wf) => weights.some((w) => w[wf.key] != null));
  const histFmt = (wf, v) => {
    const d = wf.step === '1' ? 0 : wf.step === '0.01' ? 2 : 1;
    return Number(v).toFixed(d);
  };

  const remove = (id) => {
    if (!confirm('¿Eliminar esta medición?')) return;
    setState((prev) => {
      // Propagar el borrado al bridge y anotarlo, para que mergeBridge no lo reimporte.
      postBridgeDelete(prev.settings, 'weights', id);
      const rb = new Set([...(prev.bridge?.removedBridgeIds || []), id]);
      return {
        ...prev,
        weights: (prev.weights || []).filter((w) => w.id !== id),
        bridge: { ...(prev.bridge || {}), removedBridgeIds: [...rb] },
      };
    });
  };

  const metricDots = ['var(--bento-warm)', 'var(--bento-blue)', 'var(--bento-lilac)', 'var(--bento-yellow)', 'var(--bento-pos)', 'var(--bento-ink)'];

  // Titular de ritmo %/sem + ETA a la meta (misma fuente que la tarjeta TrendAnalysis de abajo).
  const trendHead = useMemo(() => {
    const d = computeTrendAnalysis(state.weights || [], state.days || {}, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
    if (!d || d.lossPctPerWeek == null) return null;
    const pct = d.lossPctPerWeek; // + = perdiendo peso
    const inGreen = pct >= LOSS_RATE_GREEN.min && pct <= LOSS_RATE_GREEN.max;
    const lastW = d.last?.weightKg;
    let etaWeeks = null;
    if (lastW != null && pct > 0.05 && lastW > goalWeightKg) {
      const kgPerWeek = (pct / 100) * lastW;
      etaWeeks = Math.round((lastW - goalWeightKg) / kgPerWeek);
    }
    return { pct, inGreen, etaWeeks };
  }, [state.weights, state.days, state.snackBank, state.proteinBank, state.dessertBank, state.antojoCustomItems, targets, goalWeightKg]);

  const RANGE_OPTIONS = [{ d: 7, label: '7d' }, { d: 28, label: '28d' }, { d: 90, label: '90d' }, { d: Infinity, label: 'Todo' }];

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">⚖️ Peso & composición</h1>
        <p className="text-sm" style={{ color: 'var(--bento-faint)' }}>{last ? `Última medición · ${last.date}${last.time ? ' · ' + last.time : ''}` : 'Sube la captura de tu Speediance o ingresa manual'}</p>
      </div>

      <WeighInNudge weights={weights} onAction={() => setAdding(true)} />

      {last ? (
        <div className="bento-card">
          <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
            <div>
              <div className="bento-label">Peso actual</div>
              <div className="bento-num" style={{ fontSize: 44, lineHeight: 1, marginTop: 6 }}>{last.weightKg != null ? Number(last.weightKg).toFixed(1) : '—'}<span style={{ fontSize: 15, fontWeight: 400, color: 'var(--bento-faint)' }}> kg</span></div>
            </div>
            {last.bodyType && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide" style={{ background: 'rgba(217,166,72,0.16)', color: 'var(--bento-yellow)' }}>{last.bodyType}</span>
            )}
          </div>
          <div className="bento-label" style={{ marginBottom: 12 }}>Composición corporal</div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            {WEIGHT_FIELDS.filter((wf) => wf.key !== 'weightKg' && last[wf.key] != null).map((wf, i) => {
              const status = evalMetric(wf.key, last[wf.key], state.userProfile);
              return (
                <div key={wf.key}>
                  <div className="bento-label flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 99, background: metricDots[i % metricDots.length], flexShrink: 0 }} />{wf.label}</div>
                  <div className="bento-num flex items-center gap-1.5" style={{ fontSize: 20, marginTop: 5 }}>
                    <span>{last[wf.key]}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--bento-faint)' }}>{wf.unit ? ' ' + wf.unit : ''}</span></span>
                    <MetricStatusChip statusLabel={status} />
                  </div>
                </div>
              );
            })}
          </div>
          {last.note && <p className="mt-3 text-xs italic" style={{ color: 'var(--bento-faint)' }}>{last.note}</p>}
        </div>
      ) : (
        <div className="bento-card text-center" style={{ padding: 24 }}>
          <div className="text-3xl mb-2">⚖️</div>
          <div className="text-sm font-medium">Sin mediciones aún</div>
          <div style={{ fontSize: 12, color: 'var(--bento-faint)', marginTop: 4 }}>Agrega tu primera medición para empezar a ver la tendencia</div>
        </div>
      )}

      <div className="bento-card">
        <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto -mx-1 px-1">
          {CHART_METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
              style={metric === m.key ? { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' } : { background: 'var(--bento-surface)', color: 'var(--bento-muted)' }}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          {RANGE_OPTIONS.map((r) => (
            <button key={r.label} onClick={() => setRangeDays(r.d)}
              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={rangeDays === r.d ? { background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' } : { background: 'var(--bento-surface)', color: 'var(--bento-faint)' }}>
              {r.label}
            </button>
          ))}
        </div>
        {metric === 'weightKg' && trendHead && (
          <div className="flex items-end justify-between mb-3 px-0.5">
            <div>
              <div className="bento-label">Ritmo · regresión</div>
              <div className="bento-num" style={{ fontSize: 22, lineHeight: 1.1, color: trendHead.inGreen ? 'var(--bento-pos)' : 'var(--bento-warm)' }}>
                {trendHead.pct < 0 ? '+' : '−'}{Math.abs(trendHead.pct).toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--bento-faint)' }}> %/sem{trendHead.pct < 0 ? ' (subiendo)' : ''}</span>
              </div>
              <div className="bento-label" style={{ marginTop: 2 }}>objetivo {LOSS_RATE_GREEN.min}–{LOSS_RATE_GREEN.max} %/sem</div>
            </div>
            <div className="text-right">
              <div className="bento-label">Proyección</div>
              <div className="bento-num" style={{ fontSize: 18, lineHeight: 1.1 }}>
                {trendHead.etaWeeks != null ? <>{goalWeightKg}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--bento-faint)' }}> kg ≈ {trendHead.etaWeeks} sem</span></> : <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--bento-faint)' }}>sin proyección</span>}
              </div>
            </div>
          </div>
        )}
        <WeightChart weights={weights} metric={metric} rangeDays={rangeDays} goalWeightKg={goalWeightKg} />
      </div>

      <EvolutionAnalysis state={state} />

      <SegmentAnalysis weight={last} />

      <TrendAnalysis state={state} targets={targets} />

      <PlanAdjustmentBanner state={state} setState={setState} />

      <NotesHistory state={state} />

      {weights.length > 0 && (
        <div className="bento-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="px-4 pt-3.5 pb-2">
            <div className="bento-label">Historial</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--bento-card)', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--bento-hairline)', borderRight: '1px solid var(--bento-hairline)' }}>
                    <span className="bento-label">Fecha</span>
                  </th>
                  {histCols.map((wf) => (
                    <th key={wf.key} title={wf.label + (wf.unit ? ` (${wf.unit})` : '')}
                      style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bento-hairline)', color: 'var(--bento-faint)', fontWeight: 600 }}>
                      {HIST_SHORT[wf.key] || wf.label}
                    </th>
                  ))}
                  <th style={{ position: 'sticky', right: 0, zIndex: 3, background: 'var(--bento-card)', borderBottom: '1px solid var(--bento-hairline)', borderLeft: '1px solid var(--bento-hairline)' }} />
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.id}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bento-card)', padding: '6px 10px', whiteSpace: 'nowrap', borderTop: '1px solid var(--bento-hairline)', borderRight: '1px solid var(--bento-hairline)', color: 'var(--bento-faint)' }}>
                      {w.date.slice(5)}{w.time ? <span style={{ opacity: 0.7 }}> {w.time}</span> : ''}
                    </td>
                    {histCols.map((wf) => (
                      <td key={wf.key} style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid var(--bento-hairline)' }}>
                        {w[wf.key] != null
                          ? <span className="bento-num">{histFmt(wf, w[wf.key])}</span>
                          : <span style={{ color: 'var(--bento-faint)' }}>·</span>}
                      </td>
                    ))}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, background: 'var(--bento-card)', padding: '6px 10px', borderTop: '1px solid var(--bento-hairline)', borderLeft: '1px solid var(--bento-hairline)', whiteSpace: 'nowrap' }}>
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditing(w)} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: 'var(--bento-surface)' }}>Editar</button>
                        <button onClick={() => remove(w.id)} aria-label="Borrar"
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(205,122,85,0.12)', color: 'var(--bento-warm)' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button onClick={() => setAdding(true)}
        className="w-full py-3.5 rounded-2xl font-semibold" style={{ background: 'var(--bento-ink)', color: 'var(--bento-on-ink)' }}>
        + Nueva medición
      </button>

      {(adding || editing) && (
        <WeightEntryModal state={state} setState={setState} editing={editing}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

const IDEA_OCCASIONS = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍚' },
  { id: 'colacion', label: 'Snack', emoji: '🥪' },
  { id: 'cena', label: 'Cena', emoji: '🍽️' },
];

function autoDetectOccasion() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'colacion';
  return 'cena';
}

function occasionToPromptKey(id) {
  return id === 'colacion' ? 'snack' : id;
}

// Picker de items para el planificador semanal. Fuentes: recetas y bancos (NO las comidas
// fijas: esas ya se aplican solas cada día, ofrecerlas aquí confunde). onPick(item) recibe
// { name, kcal, protein, carbs, fat, fiber, mealSlot? }.
// Fila del picker. Si el item tiene `portionGrams`, ofrece un campo de gramos y escala los
// macros proporcionalmente; si no, se agrega tal cual con un toque.
function PlanPickerItem({ item, onPick }) {
  const base = Number(item.portionGrams) || 0;
  const [grams, setGrams] = useState(base || '');
  const scalable = base > 0;
  const f = scalable ? ((Number(grams) || base) / base) : 1;
  const sc = (v) => Math.round((Number(v) || 0) * f);
  const add = () => {
    if (scalable) {
      const g = Math.round(Number(grams) || base);
      onPick({ name: `${item.name} (${g}g)`, kcal: (item.kcal || 0) * f, protein: (item.protein || 0) * f,
        carbs: (item.carbs || 0) * f, fat: (item.fat || 0) * f, fiber: (item.fiber || 0) * f });
    } else { onPick(item); }
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800">
      <button onClick={add} className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left hover:opacity-80">
        <span className="text-sm font-medium truncate">
          {item.name}
          {item.gi && item.gi !== 'bajo' ? <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400">GI {item.gi}</span> : null}
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{sc(item.kcal)} kcal · P{sc(item.protein)}</span>
      </button>
      {scalable && (
        <span className="shrink-0 flex items-center gap-1">
          <input type="number" inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value)}
            className="w-14 px-1.5 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-[11px] text-right focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          <span className="text-[10px] text-gray-400">g</span>
        </span>
      )}
    </div>
  );
}

// Comida a mano para el planificador: Hugo escribe un alimento que NO está en su banco,
// teclea (o estima con Claude) sus calorías/macros, y lo agrega al plan. Sin API key igual
// funciona escribiendo los números a mano. El total de kcal se ve en vivo mientras edita.
function PlanManualEntry({ apiKey, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [m, setM] = useState({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(false);

  const setField = (k, v) => setM((prev) => ({ ...prev, [k]: v }));
  const num = (v) => Number(v) || 0;
  const canAdd = name.trim() && num(m.kcal) > 0;

  const reset = () => { setName(''); setPortion(''); setM({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' }); setError(null); };

  const estimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes para estimar (o escribe los números a mano).'); return; }
    if (!name.trim()) { setError('Escribe primero qué comiste.'); return; }
    setEstimating(true); setError(null);
    try {
      const desc = portion.trim() ? `${name.trim()} (${portion.trim()})` : name.trim();
      const d = await estimateExtraMacros({ name: desc, apiKey });
      setM({
        kcal: String(Math.round(d.kcal || 0)), protein: String(Math.round(d.protein || 0)),
        carbs: String(Math.round(d.carbs || 0)), fat: String(Math.round(d.fat || 0)),
        fiber: String(Math.round((d.fiber || 0) * 10) / 10),
      });
      if (d.portion && !portion.trim()) setPortion(d.portion);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setEstimating(false);
    }
  };

  const add = () => {
    if (!canAdd) return;
    const label = portion.trim() ? `${name.trim()} (${portion.trim()})` : name.trim();
    onAdd({ name: label, kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat), fiber: num(m.fiber) });
    reset();
    setFlash(true); setTimeout(() => setFlash(false), 1400);
  };

  const fields = [
    { k: 'kcal', label: 'kcal' }, { k: 'protein', label: 'P (g)' },
    { k: 'carbs', label: 'C (g)' }, { k: 'fat', label: 'G (g)' }, { k: 'fiber', label: 'Fibra' },
  ];

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
        ✏️ Comida a mano
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-2 bg-gray-50 dark:bg-gray-800/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">✏️ Comida a mano</span>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-gray-400 hover:text-gray-600 text-sm" aria-label="Cerrar">✕</button>
      </div>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="¿Qué comiste? ej. Pan con palta"
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
      <input type="text" value={portion} onChange={(e) => setPortion(e.target.value)} placeholder="Porción (opcional) ej. 1 taza, 150g"
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      <button type="button" onClick={estimate} disabled={estimating || !name.trim()}
        className="w-full py-2 rounded-lg bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 disabled:opacity-60">
        {estimating ? 'Estimando…' : '✨ Estimar calorías con Claude'}
      </button>
      <div className="grid grid-cols-5 gap-1.5">
        {fields.map((f) => (
          <label key={f.k} className="block">
            <span className="block text-[9px] uppercase text-gray-500 dark:text-gray-400 text-center mb-0.5">{f.label}</span>
            <input type="number" inputMode="decimal" min="0" value={m[f.k]} onChange={(e) => setField(f.k, e.target.value)}
              placeholder="0"
              className="w-full px-1 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        ))}
      </div>
      {error && <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded-lg">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {num(m.kcal) > 0 ? <><b className="text-gray-700 dark:text-gray-200">{num(m.kcal)} kcal</b> · P{num(m.protein)}</> : 'Estima o escribe las kcal'}
        </span>
        <button type="button" onClick={add} disabled={!canAdd}
          className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          Agregar
        </button>
      </div>
      {flash && <p className="text-[11px] text-emerald-700 dark:text-emerald-300 text-center">✓ Agregado al plan</p>}
    </div>
  );
}

function PlanPickerModal({ state, onPick, onClose, slotLabel }) {
  const [q, setQ] = useState('');
  const apiKey = state.settings?.anthropicApiKey;
  const recipes = (state.recipeBank || []).map((r) => ({
    name: r.name, kcal: r.totals?.kcal || 0, protein: r.totals?.protein || 0,
    carbs: r.totals?.carbs || 0, fat: r.totals?.fat || 0, fiber: r.totals?.fiber || 0,
    mealSlot: r.occasion === 'snack' ? 'colacion' : r.occasion,
  }));
  const bankItems = (bank) => (bank || []).map((x) => ({
    name: x.name, kcal: x.kcal || 0, protein: x.protein || 0,
    carbs: x.carbs || 0, fat: x.fat || 0, fiber: x.fiber || 0,
    gi: x.gi, portionGrams: x.portionGrams,
  }));
  const groups = [
    { title: '📒 Recetas', items: recipes },
    { title: '🍗 Proteínas', items: bankItems(state.proteinBank) },
    { title: '🥪 Snacks', items: bankItems(state.snackBank) },
    { title: '🍫 Postres', items: bankItems(state.dessertBank) },
  ];
  const norm = (s) => (s || '').toLowerCase();
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !q.trim() || norm(it.name).includes(norm(q))) }))
    .filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 my-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Agregar{slotLabel ? ` · ${slotLabel}` : ' al plan'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Cerrar">✕</button>
        </div>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tu banco…"
          className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        <PlanManualEntry apiKey={apiKey} onAdd={onPick} />
        <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
          {filtered.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Nada que mostrar.</p>}
          {filtered.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5 py-0.5">{g.title}</div>
              <div className="space-y-1">
                {g.items.map((it, i) => (
                  <PlanPickerItem key={i} item={it} onPick={onPick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Las 5 tomas del método (anclar fijo → repartir en tomas). Cada toma tiene hora canónica
// para detectar brechas >5h, y `eat` = el mealSlot real de la app al pasar a comido.
const PLAN_TOMAS = [
  { id: 'desayuno',  label: 'Desayuno',   time: '08:30', eat: 'desayuno' },
  { id: 'colacion1', label: 'Colación AM', time: '11:00', eat: 'colacion' },
  { id: 'almuerzo',  label: 'Almuerzo',    time: '14:00', eat: 'almuerzo' },
  { id: 'colacion2', label: 'Colación PM', time: '18:00', eat: 'colacion' },
  { id: 'cena',      label: 'Cena',        time: '21:00', eat: 'cena' },
];
const MIN_PROTEIN_TOMA = 36; // g — umbral de estímulo MPS por toma (Schoenfeld & Aragon 2018)
const MAX_GAP_HOURS = 5;     // h — máximo entre tomas con proteína

function hhmmToMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

// Analiza un día planificado contra el método: totales, desglose por toma con badge ≥36g,
// brecha temporal >5h, y restante hacia las metas (la "brújula" del armado). Función pura.
function analyzePlannedDay(planned, targets) {
  const T = targets || DEFAULT_TARGETS;
  const items = Array.isArray(planned) ? planned : [];
  const slotIds = new Set(PLAN_TOMAS.map((s) => s.id));
  const slotOf = (x) => (x && slotIds.has(x.planSlot)) ? x.planSlot : 'otros';
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);

  const totals = {
    kcal: sum(items, 'kcal'), protein: sum(items, 'protein'),
    carbs: sum(items, 'carbs'), fat: sum(items, 'fat'), fiber: sum(items, 'fiber'),
  };
  const bySlot = PLAN_TOMAS.map((s) => {
    const its = items.filter((x) => slotOf(x) === s.id);
    const protein = sum(its, 'protein');
    return { ...s, items: its, protein, kcal: sum(its, 'kcal'),
      hasItems: its.length > 0, lowProtein: its.length > 0 && protein < MIN_PROTEIN_TOMA };
  });
  const otros = items.filter((x) => slotOf(x) === 'otros');

  // Brecha: primera distancia >5h entre tomas consecutivas que tienen proteína.
  const active = bySlot.filter((s) => s.hasItems && s.protein > 0);
  let gapWarn = null;
  for (let i = 1; i < active.length; i++) {
    const dh = (hhmmToMin(active[i].time) - hhmmToMin(active[i - 1].time)) / 60;
    if (dh > MAX_GAP_HOURS) { gapWarn = { from: active[i - 1].label, to: active[i].label, hours: dh }; break; }
  }

  const fiberColor = !items.length ? null
    : totals.fiber >= T.fiberTarget ? 'green'
    : totals.fiber >= T.fiberTarget * 0.8 ? 'amber' : 'red';

  return {
    totals, bySlot, otros, gapWarn,
    remainingProtein: Math.max(0, Math.round((T.proteinMin || 0) - totals.protein)),
    remainingKcal: Math.round((T.kcalMax || 0) - totals.kcal),
    kcalColor: items.length ? colorForKcal(totals.kcal, T) : null,
    proteinColor: items.length ? colorForProtein(totals.protein, T) : null,
    fiberColor,
    hasItems: items.length > 0,
  };
}

// VTIMEZONE de America/Santiago. iOS usa el TZID (nombre IANA) contra su propia base; este
// bloque es fallback para otros parsers. Reglas actuales de Chile continental.
const VTIMEZONE_SANTIAGO = [
  'BEGIN:VTIMEZONE', 'TZID:America/Santiago',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0300', 'TZNAME:-03',
  'DTSTART:19700906T000000', 'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=1SA', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0400', 'TZNAME:-04',
  'DTSTART:19700405T000000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SA', 'END:STANDARD',
  'END:VTIMEZONE',
];

function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Genera un .ics con un VTODO por toma planificada (DUE a su hora, TZID Santiago, alarma a la
// hora, macros en la nota, UID único por toma+día para no duplicar al reimportar).
function buildDayICS(dateKey, planned, targets, nowIso) {
  const a = analyzePlannedDay(planned, targets);
  const tomas = a.bySlot.filter((s) => s.hasItems);
  if (!tomas.length) return null;
  const ymd = String(dateKey).replace(/-/g, '');
  const dtstamp = String(nowIso || '1970-01-01T00:00:00Z').replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace(/Z?$/, 'Z');
  const sum = (arr, k) => arr.reduce((acc, x) => acc + (Number(x[k]) || 0), 0);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PlanHugo//ES', 'CALSCALE:GREGORIAN', ...VTIMEZONE_SANTIAGO];
  for (const t of tomas) {
    const hhmmss = t.time.replace(':', '') + '00';
    const names = t.items.map((i) => i.name).join(' + ');
    const macros = `~${Math.round(t.kcal)} kcal | P ${Math.round(t.protein)} | C ${Math.round(sum(t.items, 'carbs'))} | G ${Math.round(sum(t.items, 'fat'))} | fibra ${Math.round(sum(t.items, 'fiber'))}`;
    lines.push(
      'BEGIN:VTODO',
      `UID:${ymd}-${t.id}@planhugo`,
      `DTSTAMP:${dtstamp}`,
      `DUE;TZID=America/Santiago:${ymd}T${hhmmss}`,
      `SUMMARY:${icsEscape(`${t.label} — ${names}`)}`,
      `DESCRIPTION:${icsEscape(macros)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:RELATED=START;PT0M', 'DESCRIPTION:Hora de comer', 'END:VALARM',
      'END:VTODO',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Entrega el .ics: hoja de compartir si hay (mejor en iPhone), si no descarga directa.
async function exportDayICS(dateKey, planned, targets) {
  const ics = buildDayICS(dateKey, planned, targets, new Date().toISOString());
  if (!ics) return;
  const filename = `plan-${dateKey}.ics`;
  try {
    const file = new File([ics], filename, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `Plan ${dateKey}` });
      return;
    }
  } catch (e) { /* cancelado o no soportado → descarga */ }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = filename;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// "Armar día" con IA: llena SOLO las tomas vacías respetando lo ya fijado, las reglas del
// método (≥36g/toma, ≤5h, no nueces, no repetir, fibra, portable, banda no punto) y usando
// SOLO la biblioteca (bancos + recetas). Valida nombres contra la biblioteca y descarta
// inventados. Devuelve items {planSlot,name,macros} listos para popular el plan (editable).
// Qué bancos alimentan cada toma. Las proteínas (Salmón, Pollo, Filete) son platos
// principales: SOLO almuerzo/cena, nunca desayuno ni colación. Desayuno y colaciones
// se arman con colaciones (huevos, atún, yogur, quesillo) + postres (fruta, yogur).
// Las recetas son comidas completas y entran en desayuno/almuerzo/cena.
const SLOT_GROUPS = {
  desayuno:  ['colacion', 'postre', 'receta'],
  colacion1: ['colacion', 'postre'],
  almuerzo:  ['main', 'postre', 'receta'],
  colacion2: ['colacion', 'postre'],
  cena:      ['main', 'postre', 'receta'],
};
const GROUP_LABEL = {
  main: 'PLATOS PRINCIPALES (solo almuerzo/cena)',
  colacion: 'COLACIONES (desayuno y colaciones)',
  postre: 'POSTRES/COMPLEMENTOS (fruta, yogur — acompañan cualquier toma)',
  receta: 'RECETAS COMPLETAS (desayuno/almuerzo/cena)',
};

async function suggestDayPlan({ state, targets, anchored, apiKey }) {
  const T = targets || DEFAULT_TARGETS;
  const byName = new Map();   // name normalizado → { ...macros, group }
  const groups = { main: [], colacion: [], postre: [], receta: [] };
  const push = (x, group) => {
    if (!x || !x.name) return;
    const item = { name: x.name, kcal: Math.round(x.kcal || 0), protein: Math.round(x.protein || 0), carbs: Math.round(x.carbs || 0), fat: Math.round(x.fat || 0), fiber: Math.round(x.fiber || 0), gi: x.gi || 'bajo', group };
    groups[group].push(item);
    byName.set(normalizeName(x.name), item);
  };
  (state.proteinBank || []).forEach((x) => push(x, 'main'));
  (state.snackBank || []).forEach((x) => push(x, 'colacion'));
  (state.dessertBank || []).forEach((x) => push(x, 'postre'));
  (state.recipeBank || []).forEach((r) => push({ name: r.name, ...(r.totals || {}), gi: 'bajo' }, 'receta'));

  const anchoredList = anchored || [];
  const emptyTomas = PLAN_TOMAS.filter((t) => !anchoredList.some((a) => a.planSlot === t.id));
  if (!emptyTomas.length) return { items: [], nota: 'Todas las tomas ya tienen algo planificado.' };
  const anchoredDesc = anchoredList.map((a) => `${a.planSlot}: ${a.name} (P${Math.round(a.protein || 0)})`);

  // Eligibilidad por toma: a la IA le pasamos, slot por slot, SOLO los alimentos válidos.
  const slotEligible = (slotId) => (SLOT_GROUPS[slotId] || []).flatMap((g) => groups[g].map((it) => ({ ...it, rol: g })));
  const bibliotecaPorToma = emptyTomas.map((t) => {
    const ops = slotEligible(t.id).map((it) => ({ name: it.name, P: it.protein, kcal: it.kcal, fibra: it.fiber, rol: GROUP_LABEL[it.rol].split(' ')[0] }));
    return `• ${t.id} (${t.time}, ${t.label}): ${JSON.stringify(ops)}`;
  }).join('\n');

  const prompt = `Eres coach nutricional de Hugo (chileno, tuteo). Arma SOLO las tomas vacías de su día, con comida COHERENTE con cada horario.
TARGETS DEL DÍA: kcal máx ${T.kcalMax}, proteína mín ${T.proteinMin} g, fibra ${T.fiberTarget} g.
REGLAS (método): cada toma apunta a ≥36 g de proteína (combina ítems si hace falta); sin brechas >5 h; NO nueces (jamás); no repitas el mismo alimento en el día; prioriza fibra; colaciones portables sin refrigeración; índice glicémico bajo. BANDA NO PUNTO: no rellenes hasta el techo de kcal, quedar 200-400 abajo está bien. El ejercicio NO abre margen.
COHERENCIA POR TOMA — esto es lo más importante: un plato principal (carne/pollo/pescado) NUNCA va al desayuno ni a una colación. El desayuno y las colaciones se arman con huevos, atún, yogur, quesillo y fruta. El almuerzo y la cena llevan el plato principal.
Para cada toma elige SOLO de su lista de opciones (cada una ya filtrada para ese horario), por su "name" EXACTO:
${bibliotecaPorToma}
YA FIJO (no lo toques): ${anchoredDesc.length ? anchoredDesc.join('; ') : 'nada'}
Devuelve SOLO JSON, sin markdown ni backticks:
{ "tomas": [ { "slot": "<id de la lista>", "items": [ { "name": "<name EXACTO de su lista>" } ] } ], "nota": "1 línea tipo coach" }`;

  const text = await askClaude(prompt, apiKey, 900, MODEL_DEFAULT);
  const parsed = parseJsonLoose(text);
  if (!parsed || !Array.isArray(parsed.tomas)) throw new Error('La IA no devolvió un plan válido. Intenta de nuevo.');
  const validSlots = new Set(emptyTomas.map((t) => t.id));
  const out = [];
  for (const t of parsed.tomas) {
    if (!validSlots.has(t?.slot)) continue;
    const allowed = new Set(SLOT_GROUPS[t.slot] || []);
    for (const it of (t.items || [])) {
      const f = byName.get(normalizeName(it?.name || ''));
      // Refuerzo: aunque la IA se salte la regla, descartamos un plato principal en
      // desayuno/colación (o cualquier ítem fuera del grupo permitido para esa toma).
      if (f && allowed.has(f.group)) out.push({ planSlot: t.slot, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber });
    }
  }
  return { items: out, nota: String(parsed.nota || '') };
}

// Hash estable de un string (djb2) → entero ≥0. Se usa para rotar la elección del
// planificador por fecha, así cada día sale distinto sin azar (determinístico).
function hashStr(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// "Armar con banco" SIN IA: llena las tomas vacías eligiendo del banco con las mismas
// reglas de coherencia por horario (SLOT_GROUPS) y método (≥36g/toma, no repetir, fibra,
// banda no punto). 100% local: no llama a Anthropic, no necesita API key. Determinístico
// con rotación por fecha para que no salga idéntico todos los días.
function planDayFromBank({ state, targets, anchored, dateKey }) {
  const T = targets || DEFAULT_TARGETS;
  const groups = { main: [], colacion: [], postre: [], receta: [] };
  const toItem = (x, group) => ({ name: x.name, kcal: Math.round(x.kcal || 0), protein: Math.round(x.protein || 0), carbs: Math.round(x.carbs || 0), fat: Math.round(x.fat || 0), fiber: Math.round(x.fiber || 0), group });
  (state.proteinBank || []).forEach((x) => { if (x && x.name) groups.main.push(toItem(x, 'main')); });
  (state.snackBank || []).forEach((x) => { if (x && x.name) groups.colacion.push(toItem(x, 'colacion')); });
  (state.dessertBank || []).forEach((x) => { if (x && x.name) groups.postre.push(toItem(x, 'postre')); });
  (state.recipeBank || []).forEach((r) => { if (r && r.name) groups.receta.push(toItem({ name: r.name, ...(r.totals || {}) }, 'receta')); });

  const anchoredList = anchored || [];
  const emptyTomas = PLAN_TOMAS.filter((t) => !anchoredList.some((a) => a.planSlot === t.id));
  if (!emptyTomas.length) return { items: [], nota: 'Todas las tomas ya tienen algo planificado.' };

  const used = new Set(anchoredList.map((a) => normalizeName(a.name)));
  let kcalRun = anchoredList.reduce((s, a) => s + (Number(a.kcal) || 0), 0);
  const rot = hashStr(dateKey);
  const out = [];

  // Elige de un pool: descarta usados, ordena por la clave dada y rota entre los 3 mejores.
  const pick = (pool, cmp, offset = 0) => {
    const avail = pool.filter((it) => !used.has(normalizeName(it.name)));
    if (!avail.length) return null;
    const sorted = [...avail].sort(cmp);
    const top = sorted.slice(0, Math.min(3, sorted.length));
    return top[(rot + offset) % top.length];
  };
  const byProtFiber = (a, b) => (b.protein - a.protein) || (b.fiber - a.fiber);
  const byFiber = (a, b) => (b.fiber - a.fiber) || (a.kcal - b.kcal);
  // Eficiencia proteica: para "completar" a 36g, el ítem que más proteína aporta por kcal,
  // así no doblamos con dos colaciones de 280 kcal y reventamos el techo.
  const byLean = (a, b) => (b.protein / (b.kcal || 1)) - (a.protein / (a.kcal || 1));

  emptyTomas.forEach((t, i) => {
    const allowed = SLOT_GROUPS[t.id] || [];
    let slotP = 0;
    const add = (it) => {
      if (!it) return;
      out.push({ planSlot: t.id, name: it.name, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber });
      used.add(normalizeName(it.name)); slotP += it.protein; kcalRun += it.kcal;
    };
    if (allowed.includes('main')) {
      // Plato principal: prioriza recetas armadas (con guarnición) sobre proteína pelada.
      add(pick([...groups.receta, ...groups.main], byProtFiber, i));
      // Complemento de fibra (fruta) si ya cumplió proteína y hay margen de kcal.
      if (slotP >= MIN_PROTEIN_TOMA && kcalRun + 90 <= T.kcalMax) add(pick(groups.postre, byFiber, i));
    } else {
      // Desayuno/colación: arma desde colaciones. Solo completo con un segundo ítem si la
      // toma viene FLOJA (<30g); si ya viene en 30-35g la dejo así (banda no punto: no
      // sumo 185 kcal por 4g). El booster es el más eficiente en proteína/kcal y respeta el techo.
      const BANK_PROTEIN_FLOOR = 30;
      add(pick(groups.colacion, byProtFiber, i));
      if (slotP < BANK_PROTEIN_FLOOR) {
        const second = pick([...groups.colacion, ...groups.postre], byLean, i + 1);
        if (second && second.protein >= 8 && kcalRun + second.kcal <= T.kcalMax) add(second);
      }
    }
  });

  const totalP = anchoredList.reduce((s, a) => s + (Number(a.protein) || 0), 0) + out.reduce((s, o) => s + o.protein, 0);
  if (!out.length) return { items: [], nota: 'Tu banco no tiene alimentos para llenar estas tomas. Agrega ítems en Banco.' };
  return { items: out, nota: `🎲 Armado del banco · ~${Math.round(totalP)}g proteína. Edítalo a gusto.` };
}

function PlanWeekView({ state, setState, targets }) {
  const weekKeys = useMemo(() => getWeekKeys(), []);
  const [picking, setPicking] = useState(null); // dateKey al que se está agregando
  const [flash, setFlash] = useState(null);
  const [armando, setArmando] = useState(null); // dateKey en generación IA
  const [armarError, setArmarError] = useState(null);
  const days = state.days || {};
  const apiKey = state.settings?.anthropicApiKey;

  // Vacía las tomas planificadas al lienzo del día (ambos botones terminan acá).
  const applyPlanItems = (dk, items, nota) => {
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      const cur = Array.isArray(d.plannedMeals) ? [...d.plannedMeals] : [];
      for (const it of items) cur.push({ id: uuid(), ...it });
      d.plannedMeals = cur;
      if (nota) d.planNota = nota;
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
  };

  const armarDia = async (dk) => {
    if (!apiKey) { setArmarError({ dk, msg: 'La IA necesita API key (⚙️ Ajustes). O usa "Armar con banco" acá abajo — ese es gratis.' }); return; }
    setArmando(dk); setArmarError(null);
    try {
      const planned = (days[dk]?.plannedMeals) || [];
      const { items, nota } = await suggestDayPlan({ state, targets, anchored: planned, apiKey });
      if (!items.length) { setArmarError({ dk, msg: nota || 'No se pudo armar nada con tu biblioteca actual.' }); return; }
      applyPlanItems(dk, items, nota);
    } catch (e) {
      setArmarError({ dk, msg: String(e?.message || e) });
    } finally {
      setArmando(null);
    }
  };

  // Armado local (sin IA, sin costo): elige del banco con las reglas del método.
  const armarDiaBanco = (dk) => {
    setArmarError(null);
    const planned = (days[dk]?.plannedMeals) || [];
    const { items, nota } = planDayFromBank({ state, targets, anchored: planned, dateKey: dk });
    if (!items.length) { setArmarError({ dk, msg: nota || 'No se pudo armar con tu banco actual.' }); return; }
    applyPlanItems(dk, items, nota);
  };

  const dotColor = (c) => c === 'red' ? 'bg-rose-500' : c === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  const txtColor = (c) => c === 'red' ? 'text-rose-600 dark:text-rose-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';

  const addPlanned = (dk, slot, item) => {
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      const planned = Array.isArray(d.plannedMeals) ? [...d.plannedMeals] : [];
      planned.push({
        id: uuid(), name: item.name,
        kcal: Number(item.kcal) || 0, protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0, fat: Number(item.fat) || 0, fiber: Number(item.fiber) || 0,
        planSlot: slot,
      });
      d.plannedMeals = planned;
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
  };

  const removePlanned = (dk, id) => {
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      d.plannedMeals = (d.plannedMeals || []).filter((x) => x.id !== id);
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
  };

  // Convierte un planificado en comida real (extra) del día y lo saca del plan. El planSlot
  // del método (colacion1/colacion2/…) se mapea al mealSlot real de la app.
  const eatPlanned = (dk, item) => {
    const slotDef = PLAN_TOMAS.find((s) => s.id === item.planSlot);
    const eatSlot = slotDef ? slotDef.eat : 'extra';
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      const extras = Array.isArray(d.extras) ? [...d.extras] : [];
      extras.push({
        id: uuid(), ts: Date.now(), name: item.name,
        kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber,
        mealSlot: eatSlot, source: 'plan',
      });
      d.extras = extras;
      d.plannedMeals = (d.plannedMeals || []).filter((x) => x.id !== item.id);
      if (eatSlot !== 'extra') d.eaten = { ...(d.eaten || {}), [eatSlot]: true };
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
    setFlash(dk); setTimeout(() => setFlash(null), 1500);
  };

  const ItemRow = ({ dk, x }) => (
    <li className="flex items-center gap-2 px-1 py-1">
      <span className="flex-1 min-w-0">
        <span className="text-sm truncate block">{x.name}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{Math.round(x.kcal)} kcal · P{Math.round(x.protein)}</span>
      </span>
      <button onClick={() => eatPlanned(dk, x)}
        className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">✓ Comí</button>
      <button onClick={() => removePlanned(dk, x.id)}
        className="shrink-0 text-gray-400 hover:text-rose-500 px-1" aria-label="Quitar del plan">✕</button>
    </li>
  );

  return (
    <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Planificar la semana</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Reparte la proteína en tomas (≥{MIN_PROTEIN_TOMA}g c/u, sin brechas &gt;{MAX_GAP_HOURS}h). Lo planificado no cuenta hasta que marcas “Comí”.</p>
      </div>
      {weekKeys.map((dk) => {
        const day = days[dk] || {};
        const planned = day.plannedMeals || [];
        const a = analyzePlannedDay(planned, targets);
        const dd = new Date(dk + 'T12:00:00');
        const isToday = dk === todayKey();
        return (
          <div key={dk} className={`rounded-2xl border bg-white dark:bg-gray-900 overflow-hidden ${isToday ? 'border-emerald-400 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-800'}`}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className={`font-semibold text-sm ${isToday ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{DAY_SHORT[dd.getDay()]} {dd.getDate()}/{dd.getMonth() + 1}{isToday ? ' · hoy' : ''}</div>
              {a.hasItems && (
                <div className="text-[11px] flex items-center gap-2">
                  <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dotColor(a.kcalColor)}`} /><span className={txtColor(a.kcalColor)}>{Math.round(a.totals.kcal)}</span><span className="text-gray-400">/{targets.kcalMax}</span></span>
                  <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dotColor(a.proteinColor)}`} /><span className={txtColor(a.proteinColor)}>{Math.round(a.totals.protein)}</span><span className="text-gray-400">/{targets.proteinMin}g</span></span>
                </div>
              )}
            </div>

            <div className="px-2 pb-2 divide-y divide-gray-100 dark:divide-gray-800">
              {a.bySlot.map((s) => (
                <div key={s.id} className="py-1.5">
                  <div className="flex items-center justify-between gap-2 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{s.label}</span>
                      <span className="text-[10px] text-gray-400">{s.time}</span>
                      {s.hasItems && (
                        <span className={`text-[10px] font-semibold ${s.lowProtein ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                          title={`Umbral de estímulo ${MIN_PROTEIN_TOMA}g por toma`}>
                          {Math.round(s.protein)}g P {s.lowProtein ? '⚠︎' : '✓'}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setPicking({ dk, slot: s.id })}
                      className="shrink-0 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">+</button>
                  </div>
                  {s.items.length > 0 && <ul className="mt-0.5">{s.items.map((x) => <ItemRow key={x.id} dk={dk} x={x} />)}</ul>}
                </div>
              ))}
              {a.otros.length > 0 && (
                <div className="py-1.5">
                  <div className="px-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">Otros</div>
                  <ul className="mt-0.5">{a.otros.map((x) => <ItemRow key={x.id} dk={dk} x={x} />)}</ul>
                </div>
              )}
            </div>

            {a.hasItems && (
              <div className="px-4 pb-3 space-y-1.5">
                {a.gapWarn && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-lg">
                    ⏱️ {Math.round(a.gapWarn.hours)} h entre {a.gapWarn.from} y {a.gapWarn.to} — mete una toma con proteína en medio.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  {a.remainingProtein > 0
                    ? <span className="text-amber-600 dark:text-amber-400">Faltan <b>{a.remainingProtein}g</b> de proteína</span>
                    : <span className="text-emerald-600 dark:text-emerald-400">Proteína cubierta ✓</span>}
                  <span className="text-gray-400">·</span>
                  <span className={txtColor(a.kcalColor)}>{a.remainingKcal >= 0 ? `${a.remainingKcal} kcal de margen` : `${-a.remainingKcal} kcal sobre el techo`}</span>
                  <span className="text-gray-400">·</span>
                  <span className={txtColor(a.fiberColor)}>Fibra {Math.round(a.totals.fiber)}/{targets.fiberTarget}</span>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">El ejercicio no abre margen: el techo de kcal es fijo.</p>
                <button onClick={() => exportDayICS(dk, planned, targets)}
                  className="w-full mt-1 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">
                  📅 Exportar a Recordatorios
                </button>
              </div>
            )}
            <div className="px-4 pb-3 space-y-1.5">
              {day.planNota && a.hasItems && (
                <p className="text-[11px] text-gray-600 dark:text-gray-400 italic">💬 {day.planNota}</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => armarDiaBanco(dk)} disabled={armando === dk}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60">
                  🎲 Armar con banco
                </button>
                <button onClick={() => armarDia(dk)} disabled={armando === dk}
                  className="flex-1 py-2 rounded-xl bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 disabled:opacity-60">
                  {armando === dk ? 'Pensando…' : '✨ Con IA'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">🎲 Banco = gratis, sin internet · ✨ IA = combina y ajusta (usa tu API key)</p>
              {armarError && armarError.dk === dk && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-lg">{armarError.msg}</p>
              )}
            </div>
            {flash === dk && <div className="mx-4 mb-3 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-1.5 rounded-lg text-center">✓ Pasado a comido</div>}
          </div>
        );
      })}
      {picking && (
        <PlanPickerModal state={state}
          slotLabel={(PLAN_TOMAS.find((s) => s.id === picking.slot) || {}).label}
          onPick={(it) => { addPlanned(picking.dk, picking.slot, it); }}
          onClose={() => setPicking(null)} />
      )}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'today', label: 'Hoy', icon: '🍽️' },
    { id: 'week', label: 'Semana', icon: '📅' },
    { id: 'plan', label: 'Plan', icon: '📋' },
    { id: 'insights', label: 'Insights', icon: '🧠' },
    { id: 'weight', label: 'Peso', icon: '⚖️' },
    { id: 'bank', label: 'Banco', icon: '📚' },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 safe-bottom">
      <div className="flex">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2 ${tab === t.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="text-xl">{t.icon}</span>
            <span className="text-[11px] font-medium mt-0.5">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function BulkWeightsModal({ state, setState, onClose }) {
  const [rows, setRows] = useState([{ id: uuid(), date: todayKey(), weightKg: '', bodyFatPct: '', muscleKg: '', waistCm: '' }]);

  const addRow = () => {
    const lastDate = rows[rows.length - 1]?.date || todayKey();
    setRows((r) => [...r, { id: uuid(), date: shiftDate(lastDate, -1), weightKg: '', bodyFatPct: '', muscleKg: '', waistCm: '' }]);
  };
  const removeRow = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id, field, value) => setRows((r) => r.map((x) => x.id === id ? { ...x, [field]: value } : x));

  const save = () => {
    const valid = rows.filter((r) => r.date && (r.weightKg !== '' || r.bodyFatPct !== '' || r.muscleKg !== '' || r.waistCm !== ''));
    if (valid.length === 0) { onClose(); return; }
    const newWeights = valid.map((r) => ({
      id: uuid(),
      date: r.date,
      time: null,
      weightKg: r.weightKg !== '' ? Number(r.weightKg) : null,
      bodyFatPct: r.bodyFatPct !== '' ? Number(r.bodyFatPct) : null,
      muscleKg: r.muscleKg !== '' ? Number(r.muscleKg) : null,
      waistCm: r.waistCm !== '' ? Number(r.waistCm) : null,
      note: 'Importado en lote',
    }));
    setState((prev) => ({ ...prev, weights: [...(prev.weights || []), ...newWeights] }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Importar histórico de peso</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-[110px_70px_60px_70px_70px_28px] gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <div>Fecha</div>
            <div>Peso kg</div>
            <div>% Grasa</div>
            <div>Músc. kg</div>
            <div>Cint. cm</div>
            <div></div>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[110px_70px_60px_70px_70px_28px] gap-1.5 items-center">
                <input type="date" value={r.date} onChange={(e) => updateRow(r.id, 'date', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.weightKg} onChange={(e) => updateRow(r.id, 'weightKg', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.bodyFatPct} onChange={(e) => updateRow(r.id, 'bodyFatPct', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.muscleKg} onChange={(e) => updateRow(r.id, 'muscleKg', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.waistCm} onChange={(e) => updateRow(r.id, 'waistCm', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <button onClick={() => removeRow(r.id)}
                  className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-sm">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow}
            className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            + Agregar fila
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar {rows.length} fila{rows.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

function BulkWorkoutsModal({ state, setState, onClose }) {
  const [rows, setRows] = useState([{ id: uuid(), date: todayKey(), name: 'Entrenamiento', kcal: '', minutes: '' }]);

  const addRow = () => {
    const lastDate = rows[rows.length - 1]?.date || todayKey();
    setRows((r) => [...r, { id: uuid(), date: shiftDate(lastDate, -1), name: 'Entrenamiento', kcal: '', minutes: '' }]);
  };
  const removeRow = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id, field, value) => setRows((r) => r.map((x) => x.id === id ? { ...x, [field]: value } : x));

  const save = () => {
    const valid = rows.filter((r) => r.date && r.kcal !== '' && Number(r.kcal) > 0);
    if (valid.length === 0) { onClose(); return; }
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      for (const r of valid) {
        const day = days[r.date] || {};
        const existing = day.exercise || [];
        const minLabel = r.minutes && Number(r.minutes) > 0 ? ` · ${Number(r.minutes)} min` : '';
        const name = (r.name?.trim() || 'Entrenamiento') + minLabel;
        days[r.date] = { ...day, exercise: [...existing, { id: uuid(), ts: Date.now(), name, kcal: Number(r.kcal) }] };
      }
      return { ...prev, days };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Importar histórico de entrenamientos</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-[110px_1fr_70px_70px_28px] gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <div>Fecha</div>
            <div>Nombre</div>
            <div>Kcal</div>
            <div>Min</div>
            <div></div>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[110px_1fr_70px_70px_28px] gap-1.5 items-center">
                <input type="date" value={r.date} onChange={(e) => updateRow(r.id, 'date', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="text" value={r.name} onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                  placeholder="Entrenamiento"
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="numeric" value={r.kcal} onChange={(e) => updateRow(r.id, 'kcal', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => updateRow(r.id, 'minutes', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <button onClick={() => removeRow(r.id)}
                  className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-sm">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow}
            className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            + Agregar fila
          </button>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Si la fecha ya tiene entrenamientos registrados, se agregan a los existentes (no los reemplazan).
          </p>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar {rows.length} fila{rows.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

function TopButtons({ theme, setTheme, onOpenSettings }) {
  const isDark = theme === 'dark';
  return (
    <div className="fixed top-3 right-3 z-40 flex gap-2">
      <button onClick={onOpenSettings}
        className="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-lg"
        aria-label="Ajustes">⚙️</button>
      <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-lg"
        aria-label="Cambiar tema">{isDark ? '☀️' : '🌙'}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BENTO SHELL — top bar, mobile tab bar, ⌘K command palette
// ═══════════════════════════════════════════════════════════════

const BENTO_TABS = [
  { id: 'today',    label: 'Hoy',      short: 'Hoy',  icon: '🍽️' },
  { id: 'week',     label: 'Semana',   short: 'Sem',  icon: '📅' },
  { id: 'plan',     label: 'Plan',     short: 'Plan', icon: '📋' },
  { id: 'insights', label: 'Insights', short: 'Stats',icon: '🧠' },
  { id: 'exercise', label: 'Ejercicios', short: 'Gym', icon: '🏋️' },
  { id: 'routine',  label: 'Rutina',   short: 'Rutina', icon: '📐' },
  { id: 'weight',   label: 'Peso',     short: 'Peso', icon: '⚖️' },
  { id: 'health',   label: 'Salud',    short: 'Salud', icon: '❤️' },
  { id: 'bank',     label: 'Banco',    short: 'Banco',icon: '📚' },
];

// Aplica el orden guardado por el usuario (settings.tabOrder = lista de ids) sobre
// BENTO_TABS. Ignora ids desconocidos y agrega al final cualquier tab nuevo que aún no
// esté en el orden guardado (compatibilidad hacia adelante si sumamos pestañas después).
function orderBentoTabs(order) {
  const byId = new Map(BENTO_TABS.map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const id of (Array.isArray(order) ? order : [])) {
    const t = byId.get(id);
    if (t && !seen.has(id)) { out.push(t); seen.add(id); }
  }
  for (const t of BENTO_TABS) if (!seen.has(t.id)) out.push(t);
  return out;
}

function BentoLogo() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: 'var(--bento-ink)', color: 'var(--bento-on-ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em', flexShrink: 0,
    }}>PH</div>
  );
}

const SYNC_UI = {
  ok:       { color: '#22c55e', label: 'Sincronizado' },
  pending:  { color: '#f59e0b', label: 'Cambios sin sincronizar' },
  syncing:  { color: '#3b82f6', label: 'Sincronizando…' },
  conflict: { color: '#f59e0b', label: 'Conflicto: baja de la nube en Ajustes' },
  error:    { color: '#ef4444', label: 'Error de sincronización' },
  idle:     { color: '#9ca3af', label: 'Sin sincronizar aún' },
};

function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'hace segundos';
  if (secs < 3600) return `hace ${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)} h`;
  return `hace ${Math.floor(secs / 86400)} d`;
}

function SyncIndicator({ sync, onClick, size = 36 }) {
  if (!sync || sync.status === 'off') return null;
  const ui = SYNC_UI[sync.status] || SYNC_UI.idle;
  const ago = timeAgo(sync.lastSyncAt);
  const title = ago ? `${ui.label} · ${ago}` : ui.label;
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: size, height: size, borderRadius: 10, cursor: 'pointer',
      border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: '50%', background: ui.color,
        boxShadow: `0 0 0 3px ${ui.color}22`,
        animation: sync.status === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none',
      }} />
    </button>
  );
}

// Estado del sync del BRIDGE (chat↔app), distinto del Gist (backup en la nube). Deriva de
// state.bridge, que runBridgeSync/mergeBridge actualizan (lastSyncOk/Error/At/Added).
function bridgeSyncStatus(state) {
  if (!state?.settings?.bridgeUrl) return null; // sin bridge configurado → no se muestra
  const b = state.bridge || {};
  if (b.lastSyncOk === false) {
    return { color: '#ef4444', label: 'Error de sync (bridge)', detail: b.lastSyncError || null, at: b.lastSyncAttemptAt || b.lastSyncAt || null };
  }
  if (b.lastSyncAt) {
    const a = b.lastSyncAdded || {};
    const n = (a.meals || 0) + (a.weights || 0) + (a.workouts || 0);
    // Drift de versión: el .gs desplegado quedó atrás del código (campos nuevos se descartan en
    // silencio). Ámbar accionable hasta que se redeploye el bridge. Solo si ya sincronizó OK.
    const drift = bridgeVersionDrift(b.deployedVersion);
    if (drift) {
      const detail = drift.deployed == null
        ? 'Implementación vieja sin sello de versión · redeploy del .gs pendiente'
        : `Bridge desplegado v${drift.deployed}, el código espera v${drift.expected} · redeploy pendiente`;
      return { color: '#f59e0b', label: 'Bridge: redeploy pendiente', detail, at: b.lastSyncAt };
    }
    // Items del bridge descartados por malformados (campo mal nombrado, sin id, kcal ilegible).
    // Se avisa en ámbar para que el dato no se pierda en silencio (ver validate.mjs).
    const d = b.lastSyncDropped || {};
    const nDrop = (d.meals || 0) + (d.weights || 0) + (d.workouts || 0) + (d.water || 0) + (d.health || 0) + (d.checks || 0);
    if (nDrop > 0) {
      const detail = (b.lastSyncWarnings || [])[0] || `${nDrop} registro(s) del bridge descartado(s)`;
      return { color: '#f59e0b', label: `Bridge: ${nDrop} descartado(s)`, detail, at: b.lastSyncAt };
    }
    return { color: '#22c55e', label: n > 0 ? `Bridge: +${n} ítem(s)` : 'Bridge sincronizado', detail: null, at: b.lastSyncAt };
  }
  return { color: '#9ca3af', label: 'Bridge: sin sincronizar aún', detail: null, at: null };
}

function BridgeSyncIndicator({ status, syncing, onSync, size = 36 }) {
  if (!status) return null;
  const ago = timeAgo(status.at);
  const title = `${status.label}${ago ? ' · ' + ago : ''}${status.detail ? ' · ' + status.detail : ''} — toca para sincronizar ahora`;
  const color = syncing ? '#3b82f6' : status.color;
  return (
    <button onClick={onSync} title={title} aria-label={title} style={{
      width: size, height: size, borderRadius: 10, cursor: 'pointer',
      border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <span style={{ fontSize: 12, lineHeight: 1, filter: 'grayscale(1)', opacity: 0.65 }}>🔗</span>
      <span style={{
        position: 'absolute', top: 6, right: 6,
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: `0 0 0 2px var(--bento-card), 0 0 0 4px ${color}22`,
        animation: syncing ? 'pulse 1s ease-in-out infinite' : 'none',
      }} />
    </button>
  );
}

function BentoTopBar({ activeTab, onTabChange, onCmdK, onAddMeal, onOpenSettings, theme, onToggleTheme, dateLabel, sync, bridgeSync, onBridgeSync, bridgeSyncing, tabs, onReorder }) {
  const isDark = theme === 'dark';
  const list = tabs || BENTO_TABS;
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const drop = (dropId) => {
    if (dragId && dropId && dragId !== dropId && onReorder) {
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(dropId);
      if (from >= 0 && to >= 0) { ids.splice(to, 0, ids.splice(from, 1)[0]); onReorder(ids); }
    }
    setDragId(null); setOverId(null);
  };
  return (
    <div className="bento-topbar-desktop" style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'var(--bento-bg)', borderBottom: '1px solid var(--bento-hairline)',
      padding: '14px 22px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <BentoLogo />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--bento-ink)' }}>Plan Hugo</div>
          <div style={{ fontSize: 12, color: 'var(--bento-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
        {list.map((t) => (
          <button key={t.id} draggable
            onClick={() => onTabChange(t.id)}
            onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { e.preventDefault(); if (overId !== t.id) setOverId(t.id); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDrop={(e) => { e.preventDefault(); drop(t.id); }}
            title="Arrastra para reordenar"
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none',
              cursor: dragId ? 'grabbing' : 'grab',
              fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
              background: activeTab === t.id ? 'var(--bento-ink)' : 'transparent',
              color: activeTab === t.id ? 'var(--bento-on-ink)' : 'var(--bento-muted)',
              opacity: dragId === t.id ? 0.4 : 1,
              boxShadow: (overId === t.id && dragId && dragId !== t.id) ? 'inset 0 0 0 2px var(--bento-muted)' : 'none',
              transition: 'opacity .12s',
            }}>{t.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BridgeSyncIndicator status={bridgeSync} syncing={bridgeSyncing} onSync={onBridgeSync} />
        <SyncIndicator sync={sync} onClick={onOpenSettings} />
        <button onClick={onCmdK} style={{
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
          fontSize: 12, color: 'var(--bento-muted)', fontWeight: 500,
          fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        }}>⌘K</button>
        <button onClick={onToggleTheme} title="Tema" style={{
          width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }}>{isDark ? '☀️' : '🌙'}</button>
        <button onClick={onOpenSettings} title="Ajustes" style={{
          width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }}>⚙️</button>
        <button onClick={onAddMeal} style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          border: 'none', background: 'var(--bento-ink)', color: 'var(--bento-on-ink)',
          fontSize: 13, fontWeight: 500,
        }}>+ Comida</button>
      </div>
    </div>
  );
}

function BentoMobileTopBar({ activeTab, onCmdK, onOpenSettings, theme, onToggleTheme, dateLabel, sync, bridgeSync, onBridgeSync, bridgeSyncing }) {
  const tab = BENTO_TABS.find((t) => t.id === activeTab);
  const isDark = theme === 'dark';
  return (
    <div className="bento-topbar-mobile" style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'var(--bento-bg)', borderBottom: '1px solid var(--bento-hairline)',
      padding: 'calc(env(safe-area-inset-top) + 10px) 14px 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <BentoLogo />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--bento-ink)' }}>{tab?.label || 'Plan Hugo'}</div>
          <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>{dateLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <BridgeSyncIndicator status={bridgeSync} syncing={bridgeSyncing} onSync={onBridgeSync} />
        <SyncIndicator sync={sync} onClick={onOpenSettings} />
        <button onClick={onCmdK} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
          fontSize: 14, color: 'var(--bento-muted)', fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        }}>⌘K</button>
        <button onClick={onToggleTheme} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }} aria-label="Tema">{isDark ? '☀️' : '🌙'}</button>
        <button onClick={onOpenSettings} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 16,
        }} aria-label="Ajustes">⚙️</button>
      </div>
    </div>
  );
}

function BentoMobileTabBar({ activeTab, onTabChange, tabs }) {
  const list = tabs || BENTO_TABS;
  return (
    <nav className="bento-mobile-tabbar safe-bottom" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'var(--bento-card)', borderTop: '1px solid var(--bento-hairline)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {list.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer',
            color: activeTab === t.id ? 'var(--bento-ink)' : 'var(--bento-faint)',
            fontWeight: activeTab === t.id ? 600 : 400,
          }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ fontSize: 10 }}>{t.short}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function CmdKPalette({ open, onClose, onAction, tabs }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const items = useMemo(() => {
    const navs = (tabs || BENTO_TABS).map((t, i) => ({
      id: 'nav:' + t.id, kind: 'Navegar', label: 'Ir a · ' + t.label, hint: '#' + (i + 1), kbd: String(i + 1),
      action: () => onAction({ type: 'nav', tab: t.id }),
    }));
    const acts = [
      { id: 'act:meal',  kind: 'Acción', label: 'Agregar comida',         hint: 'foto · voz · texto', action: () => onAction({ type: 'meal' }) },
      { id: 'act:sub',   kind: 'Acción', label: '¿Qué puedo comer?',      hint: 'sustituciones',      action: () => onAction({ type: 'sub' }) },
      { id: 'act:coach', kind: 'Acción', label: 'Pregúntale al coach',    hint: 'análisis del día',   action: () => onAction({ type: 'coach' }) },
      { id: 'act:water', kind: 'Acción', label: 'Agregar 250 ml de agua', hint: '+1 vaso',            action: () => onAction({ type: 'water', ml: 250 }) },
      { id: 'act:weight',kind: 'Acción', label: 'Nueva medición de peso', hint: 'captura báscula',    action: () => onAction({ type: 'nav', tab: 'weight' }) },
      { id: 'act:settings',kind:'Acción',label: 'Ajustes',                hint: 'API key, reglas…',   action: () => onAction({ type: 'settings' }) },
    ];
    const themes = [
      { id: 'th:auto',  kind: 'Tema', label: 'Tema · sistema', action: () => onAction({ type: 'theme', value: null   }) },
      { id: 'th:light', kind: 'Tema', label: 'Tema · claro',   action: () => onAction({ type: 'theme', value: 'light'}) },
      { id: 'th:dark',  kind: 'Tema', label: 'Tema · oscuro',  action: () => onAction({ type: 'theme', value: 'dark' }) },
    ];
    return [...navs, ...acts, ...themes];
  }, [onAction, tabs]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const qq = q.toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(qq) || it.kind.toLowerCase().includes(qq) || (it.hint || '').toLowerCase().includes(qq));
  }, [q, items]);

  useEffect(() => { setIdx(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape')         { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter')     { e.preventDefault(); const it = filtered[idx]; if (it) { it.action(); onClose(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, idx, onClose]);

  if (!open) return null;

  const groups = [];
  let lastKind = null;
  filtered.forEach((it, i) => {
    if (it.kind !== lastKind) { groups.push({ kind: it.kind, items: [] }); lastKind = it.kind; }
    groups[groups.length - 1].items.push({ ...it, _i: i });
  });

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" placeholder="Buscar pantalla, acción o tema…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--bento-faint)', fontSize: 13 }}>Sin resultados</div>
          )}
          {groups.map((g) => (
            <div key={g.kind}>
              <div className="cmdk-section">{g.kind}</div>
              {g.items.map((it) => (
                <div key={it.id} className="cmdk-item" data-active={it._i === idx}
                  onMouseEnter={() => setIdx(it._i)} onClick={() => { it.action(); onClose(); }}>
                  <span style={{ fontWeight: 500 }}>{it.label}</span>
                  {it.hint && <span style={{ color: 'var(--bento-faint)', fontSize: 11 }}>· {it.hint}</span>}
                  {it.kbd && <span className="cmdk-meta">{it.kbd}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--bento-hairline)',
          display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--bento-faint)',
          fontFamily: 'ui-monospace, JetBrains Mono, monospace' }}>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>↵</kbd> ejecutar</span>
          <span><kbd>esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, setState, saveError] = usePersistentState();
  const sync = useGistAutoSync(state, setState);
  const corruptionDetected = !!state.__corruptionDetected;
  const dismissCorruption = useCallback(() => setState((prev) => { const n = { ...prev }; delete n.__corruptionDetected; return n; }), [setState]);
  const [tab, setTab] = useState(() => {
    const h = (location.hash || '').replace(/^#?\/?/, '').toLowerCase();
    const hit = BENTO_TABS.find((t) => t.id === h);
    return hit ? hit.id : 'today';
  });
  // Orden de pestañas elegido por el usuario (arrastre en la barra), persistido en settings.
  const orderedTabs = useMemo(() => orderBentoTabs(state.settings?.tabOrder), [state.settings?.tabOrder]);
  const handleReorderTabs = useCallback((ids) => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), tabOrder: ids } }));
  }, [setState]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showSettings, setShowSettings] = useState(false);
  const [showMealCapture, setShowMealCapture] = useState(false);
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  useEffect(() => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = state.theme || (sysDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', effective === 'dark');
  }, [state.theme]);

  // Almacenamiento persistente: iOS Safari puede purgar el localStorage de PWAs tras ~7 días
  // sin uso. persist() reduce esa purga (best-effort; ignora si la API no está disponible).
  useEffect(() => {
    try {
      if (navigator.storage?.persist && navigator.storage?.persisted) {
        navigator.storage.persisted()
          .then((already) => { if (!already) navigator.storage.persist().catch(() => {}); })
          .catch(() => {});
      }
    } catch {}
  }, []);

  const setTheme = useCallback((t) => setState((prev) => ({ ...prev, theme: t })), [setState]);
  const effectiveTheme = state.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');

  // TDEE adaptativo (gasto real reconstruido) → base de las metas. Se recalcula cuando cambian
  // los días, pesos o el perfil. Si no hay datos suficientes, calcTargets cae a Mifflin.
  const adaptiveTdee = useMemo(
    () => computeAdaptiveTDEE(state),
    [state.days, state.weights, state.userProfile, state.snackBank, state.proteinBank, state.dessertBank]
  );
  const targets = useMemo(
    () => calcTargets(state.userProfile, { adaptiveTdee: adaptiveTdee?.tdee }),
    [state.userProfile, adaptiveTdee]
  );
  const needsOnboarding = !state.userProfile;

  // Scheduler de notificaciones (hook que vive mientras la app esté abierta)
  useNotificationScheduler(state.settings?.notifications);

  // Auto-sync del puente chat→app: al montar, al volver a primer plano, y cada 30s mientras
  // la app está visible. El polling es lo que hace que los datos del OTRO dispositivo aparezcan
  // sin tener que reabrir la app (antes solo sincronizaba en mount/visibilitychange).
  const bridgeUrl = state.settings?.bridgeUrl;
  const bridgeToken = state.settings?.bridgeToken;
  const bridgePost = bridgeUrl ? withBridgeToken(bridgeUrl, bridgeToken) : null;
  useEffect(() => {
    if (!bridgeUrl) return;
    const sync = () => { runBridgeSync({ settings: { bridgeUrl, bridgeToken } }, setState).catch(() => {}); };
    sync();
    const onVis = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVis);
    // Poll cada 30s, pero solo con la pestaña visible (no gastar red/batería en segundo plano).
    const poll = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 30000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(poll); };
  }, [bridgeUrl, bridgeToken, setState]);

  // Sync manual del bridge (al tocar el indicador 🔗 del header). `bridgeSyncing` solo pulsa
  // el punto en este disparo manual, no en el poll de 30s (evita parpadeo constante).
  const [bridgeSyncing, setBridgeSyncing] = useState(false);
  const bridgeSyncUi = bridgeSyncStatus(state);
  const manualBridgeSync = useCallback(async () => {
    if (!bridgeUrl) return;
    setBridgeSyncing(true);
    try { await runBridgeSync({ settings: { bridgeUrl, bridgeToken } }, setState); }
    finally { setBridgeSyncing(false); }
  }, [bridgeUrl, bridgeToken, setState]);

  // Empuje app→bridge: manda al bridge el total REAL del día (lo que la app
  // calcula: plan fijo marcado + extras − ejercicio) para que el chat pueda
  // responder "cómo voy hoy" con el mismo número que se ve en pantalla.
  const snapDayKey = todayKey();
  const snapPayload = useMemo(() => {
    const t = computeDayTotals(
      (state.days || {})[snapDayKey], state.snackBank || [], state.proteinBank || [],
      targets, state.dessertBank || [], state.antojoCustomItems || []);
    return {
      op: 'snapshot', date: snapDayKey, ts: Date.now(),
      // planScope:'plan-only' marca la PARTICIÓN ADITIVA: `totals` lleva SOLO la porción
      // del plan (fijos + banco) + agua, que no viaja a meals[]. El bridge SUMA esto con
      // meals[]/workouts[] (no Math.max). Los snapshots sin este marcador son legacy
      // (totales completos) y el bridge los trata con la regla vieja para no romper datos
      // en vuelo. Subir el marcador si la semántica vuelve a cambiar.
      planScope: 'plan-only',
      totals: {
        kcalIn: t.planIn, kcalBurned: 0, kcalNet: t.planIn,
        protein: t.planProtein, carbs: t.planCarbs, fat: t.planFat, fiber: t.planFiber,
        // 0: el agua de la app ahora viaja por bridge.water[] (water.log → pushPayload), que el
        // ?totals YA suma (bridgeWater). Empujarla también aquí la doble-contaría en el chat
        // (_reconcile: tt.waterMl + bridgeWater). Ver WaterTracker.adjust y mergeBridge (eco propio).
        waterMl: 0,
      },
      targets: {
        kcalMax: targets.kcalMax, proteinMin: targets.proteinMin, carbsTarget: targets.carbsTarget,
        fatTarget: targets.fatTarget, fiberTarget: targets.fiberTarget, waterTarget: targets.waterTarget,
      },
      remaining: {
        kcal: t.kcalRemaining, protein: t.proteinRemaining, carbs: t.carbsRemaining,
        fat: t.fatRemaining, fiber: t.fiberRemaining, water: t.waterRemaining,
      },
      extras: (t.extras || []).map((x) => x?.name).filter(Boolean),
    };
  }, [state.days, state.snackBank, state.proteinBank, state.dessertBank, state.antojoCustomItems, targets, snapDayKey]);
  // El `ts` cambia en cada render; para no empujar de más, comparamos solo lo sustantivo.
  const snapBody = useMemo(() => {
    const { ts, ...rest } = snapPayload; void ts; return JSON.stringify(rest);
  }, [snapPayload]);
  useEffect(() => {
    if (!bridgeUrl) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...JSON.parse(snapBody), ts: Date.now() }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [bridgePost, snapBody]);

  // Empuje app→bridge: manda el perfil + metas calculadas (meta diaria, déficit,
  // TMB/TDEE, antropometría) para que la skill food-tracker NO hardcodee ~2.150 y
  // lea la meta real. Se guarda en `config` del bridge (GET ?config=1 lo devuelve).
  const configBody = useMemo(() => {
    const p = state.userProfile;
    if (!p) return null;
    return JSON.stringify({
      op: 'config',
      config: {
        goal: p.goal ?? null, sex: p.sex ?? null, age: p.age ?? null,
        heightCm: p.heightCm ?? null, weightKg: p.weightKg ?? null,
        activityLevel: p.activityLevel ?? null,
        kcalTarget: p.kcalTarget ?? null, kcalDeficit: p.kcalDeficit ?? null,
        targets: {
          kcalMax: targets.kcalMax, kcalMin: targets.kcalMin, proteinMin: targets.proteinMin,
          carbsTarget: targets.carbsTarget, fatTarget: targets.fatTarget,
          fiberTarget: targets.fiberTarget, waterTarget: targets.waterTarget,
          bmr: targets.bmr ?? null, tdee: targets.tdee ?? null,
        },
      },
    });
  }, [state.userProfile, targets]);
  // configBody no lleva timestamp: el efecto solo dispara cuando el perfil/metas
  // cambian de verdad, no en cada render. Debounce 1800ms (escalonado del snapshot).
  useEffect(() => {
    if (!bridgeUrl || !configBody) return;
    const id = setTimeout(() => {
      const payload = JSON.parse(configBody);
      payload.config.updatedAt = new Date().toISOString();
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 1800);
    return () => clearTimeout(id);
  }, [bridgePost, configBody]);

  // Empuje app→bridge de la serie `energy` ({date, kcalIn, trendWeightKg}). El bridge la
  // retiene para siempre (RETENTION.energy=0) y la mergea por fecha, así el historial de
  // balance sobrevive a la poda de meals y propaga a otros dispositivos. Mismo patrón POST.
  const energyBody = useMemo(() => {
    if (!state.userProfile) return null;
    const series = buildEnergySeries(state);
    return series.length ? JSON.stringify({ energy: series }) : null;
  }, [state.days, state.weights, state.snackBank, state.proteinBank, state.dessertBank, state.antojoCustomItems, state.userProfile]);
  useEffect(() => {
    if (!bridgeUrl || !energyBody) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: energyBody,
      }).catch(() => {});
    }, 2100);
    return () => clearTimeout(id);
  }, [bridgePost, energyBody]);

  // Rutina app→bridge (op:'routine', timestamp-gated del lado servidor). Objeto singleton.
  const routineBody = useMemo(() => {
    if (!state.routine || !state.routine.updatedAt) return null;
    return JSON.stringify({ op: 'routine', routine: state.routine });
  }, [state.routine]);
  useEffect(() => {
    if (!bridgeUrl || !routineBody) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: routineBody,
      }).catch(() => {});
    }, 2400);
    return () => clearTimeout(id);
  }, [bridgePost, routineBody]);

  // Videos por ejercicio app→bridge (op:'exercise_videos', el servidor mergea por clave).
  const videosBody = useMemo(() => {
    const v = state.exercise_videos;
    if (!v || !Object.keys(v).length) return null;
    return JSON.stringify({ op: 'exercise_videos', exercise_videos: v });
  }, [state.exercise_videos]);
  useEffect(() => {
    if (!bridgeUrl || !videosBody) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: videosBody,
      }).catch(() => {});
    }, 2600);
    return () => clearTimeout(id);
  }, [bridgePost, videosBody]);

  // Biblioteca de alimentos app→bridge (op:'foods', upsert por nombre del lado servidor). Es una
  // LIBRERÍA, no un log diario → mismo patrón singleton que routine/exercise_videos. Empuja el
  // DELTA útil: lo que NO es semilla (escaneos/manuales/promovidos) + las semillas que Hugo ya usó
  // (usageCount>0). La skill tiene la tabla semilla embebida, así que el bridge solo necesita el
  // delta para que el chat conozca lo que Hugo agregó. El servidor dedup por nombre, reenviar es inocuo.
  const foodsBody = useMemo(() => {
    const list = (state.foods || []).filter((f) => f && f.name && f.per100
      && (f.source !== 'seed' || Number(f.usageCount) > 0));
    if (!list.length) return null;
    const compact = list.map((f) => {
      const o = {
        name: f.name, key: f.key || normalizeName(f.name),
        per100: f.per100, defaultPortionG: f.defaultPortionG || 100,
        source: f.source || 'manual', usageCount: Number(f.usageCount) || 0,
      };
      if (Array.isArray(f.tags) && f.tags.length) o.tags = f.tags;
      if (f.barcode) o.barcode = f.barcode;
      return o;
    });
    return JSON.stringify({ op: 'foods', foods: compact });
  }, [state.foods]);
  useEffect(() => {
    if (!bridgeUrl || !foodsBody) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: foodsBody,
      }).catch(() => {});
    }, 2800);
    return () => clearTimeout(id);
  }, [bridgePost, foodsBody]);

  // Empuje app→bridge de entradas creadas en la app (extras, ejercicios, pesos) para que el
  // chat y el bridge las vean (bidireccional). El servidor reasigna el id y dedup por contenido,
  // así que reenviar es inocuo. NO se reenvía lo que vino del bridge (id en importedIds) ni lo ya
  // enviado (id en pushedIds). Mismo patrón POST no-cors/text-plain que snapshot/config.
  const pushPayload = useMemo(() => {
    const imported = new Set(state.bridge?.importedIds || []);
    const pushed = new Set(state.bridge?.pushedIds || []);
    const cutoff = shiftDate(todayKey(), -10);
    const numv = (v) => Number(v) || 0;
    const out = [];
    const days = state.days || {};
    for (const dk of Object.keys(days)) {
      const d = days[dk] || {};
      // Comidas: solo ventana de 10 días (crecen rápido y la app no necesita el log viejo).
      if (dk >= cutoff) for (const x of (d.extras || [])) {
        if (!x || x.id == null || imported.has(x.id) || pushed.has(x.id)) continue;
        out.push({ localId: x.id, section: 'meals', date: dk, entry: {
          name: x.name, kcal: numv(x.kcal), protein: numv(x.protein), carbs: numv(x.carbs),
          fat: numv(x.fat), fiber: numv(x.fiber), mealSlot: x.mealSlot || 'extra',
          date: dk, ts: x.ts != null ? x.ts : null, source: 'app',
        } });
      }
      // Agua de los botones de la app: cada toque (water.log) se empuja a bridge.water[] —el mismo
      // canal que el chat— para que cruce a otros dispositivos. Ventana de 10 días: el agua solo
      // importa cerca de hoy. El servidor conserva el `ts`, así que mergeBridge excluye el eco propio.
      if (dk >= cutoff) for (const w of (d.water?.log || [])) {
        if (!w || w.id == null || imported.has(w.id) || pushed.has(w.id)) continue;
        out.push({ localId: w.id, section: 'water', date: dk, entry: {
          ml: numv(w.ml), date: dk, ts: w.ts != null ? w.ts : null, source: 'app', deviceId: getDeviceId(),
        } });
      }
      // Entrenamientos: SIN ventana → backfill del historial completo (el bridge ya no los poda).
      // pushedIds/importedIds dedupea, así que cada sesión se empuja una sola vez.
      for (const ex of (d.exercise || [])) {
        if (!ex || ex.id == null || imported.has(ex.id) || pushed.has(ex.id)) continue;
        const entry = { name: ex.name, kcal: numv(ex.kcal), date: dk, ts: ex.ts != null ? ex.ts : null, source: 'app' };
        for (const f of WORKOUT_EXTRA_FIELDS) {
          if (ex[f] == null) continue;
          entry[f] = (f === 'type' || f === 'activity') ? ex[f] : numv(ex[f]);
        }
        if (Array.isArray(ex.exercises) && ex.exercises.length) entry.exercises = ex.exercises;
        out.push({ localId: ex.id, section: 'workouts', date: dk, entry });
      }
    }
    for (const wt of (state.weights || [])) {
      if (!wt || wt.id == null) continue;
      const wdate = wt.date || '';
      // Peso: SIN ventana → backfill del historial completo (retención del bridge ya es 0 = nunca poda).
      if (imported.has(wt.id) || pushed.has(wt.id)) continue;
      const entry = { date: wdate, source: 'app', ts: wt.ts != null ? wt.ts : null };
      for (const wf of WEIGHT_FIELDS) if (wt[wf.key] != null) entry[wf.key] = wt[wf.key];
      if (wt.time) entry.time = wt.time;
      out.push({ localId: wt.id, section: 'weights', date: wdate, entry });
    }
    return out;
  }, [state.days, state.weights, state.bridge]);
  const pushBody = useMemo(() => JSON.stringify(pushPayload), [pushPayload]);
  useEffect(() => {
    if (!bridgeUrl) return;
    let items;
    try { items = JSON.parse(pushBody); } catch (e) { items = []; }
    if (!items.length) return;
    const id = setTimeout(async () => {
      const pushedNow = [];
      for (const it of items) {
        try {
          await fetch(bridgePost, {
            method: 'POST', mode: 'no-cors', keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              op: 'add', section: it.section, today: it.date,
              entries: [{ ...it.entry, ts: it.entry.ts != null ? it.entry.ts : Date.now() }],
            }),
          });
          pushedNow.push(it.localId);
        } catch (e) { /* red caída: queda sin marcar y se reintenta en el próximo cambio */ }
      }
      if (pushedNow.length) {
        setState((prev) => ({
          ...prev,
          bridge: { ...(prev.bridge || {}), pushedIds: [...new Set([...(prev.bridge?.pushedIds || []), ...pushedNow])] },
        }));
      }
    }, 2200);
    return () => clearTimeout(id);
  }, [bridgePost, pushBody, setState]);

  // Persist tab en hash + shortcuts
  useEffect(() => { history.replaceState(null, '', '#/' + tab); }, [tab]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen((v) => !v); return; }
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (!inField && /^[1-6]$/.test(e.key)) {
        const t = orderedTabs[Number(e.key) - 1];
        if (t) setTab(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedTabs]);

  const handleSelectDay = (key) => { setSelectedDate(key); setTab('today'); };

  const dateLabel = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [selectedDate]);

  const handleCmdkAction = useCallback((action) => {
    if (action.type === 'nav') setTab(action.tab);
    else if (action.type === 'meal') setShowMealCapture(true);
    else if (action.type === 'sub') setShowSubstitution(true);
    else if (action.type === 'coach') setShowCoach(true);
    else if (action.type === 'settings') setShowSettings(true);
    else if (action.type === 'theme') setTheme(action.value);
    else if (action.type === 'water') {
      setState((prev) => {
        const days = { ...(prev.days || {}) };
        const d = { ...(days[selectedDate] || {}) };
        d.water = { ...(d.water || {}), ml: (Number(d.water?.ml) || 0) + action.ml };
        days[selectedDate] = d;
        return { ...prev, days };
      });
    }
  }, [setTheme, setState, selectedDate]);

  return (
    <div className="bento-app min-h-screen pb-24" style={{ background: 'var(--bento-bg)', color: 'var(--bento-ink)' }}>
      <BentoTopBar activeTab={tab} onTabChange={setTab} onCmdK={() => setCmdkOpen(true)}
        onAddMeal={() => setShowMealCapture(true)} onOpenSettings={() => setShowSettings(true)}
        theme={effectiveTheme} onToggleTheme={toggleTheme} dateLabel={dateLabel} sync={sync}
        bridgeSync={bridgeSyncUi} onBridgeSync={manualBridgeSync} bridgeSyncing={bridgeSyncing}
        tabs={orderedTabs} onReorder={handleReorderTabs} />
      <BentoMobileTopBar activeTab={tab} onCmdK={() => setCmdkOpen(true)}
        onOpenSettings={() => setShowSettings(true)} theme={effectiveTheme} onToggleTheme={toggleTheme} dateLabel={dateLabel} sync={sync}
        bridgeSync={bridgeSyncUi} onBridgeSync={manualBridgeSync} bridgeSyncing={bridgeSyncing} />

      {saveError && (
        <div className="mx-3 mt-2 rounded-xl px-3 py-2 text-sm font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
          ⚠️ {saveError}
        </div>
      )}
      {corruptionDetected && (
        <div className="mx-3 mt-2 rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800 flex items-start gap-2 justify-between">
          <span>⚠️ Los datos locales estaban dañados y se recuperó una copia anterior (o se partió de cero). {state.settings?.syncGistId ? 'Revisa Ajustes y haz "Bajar de la nube" para restaurar tu respaldo.' : 'Si tienes respaldo en la nube, conéctalo en Ajustes.'}</span>
          <button onClick={dismissCorruption} className="shrink-0 text-amber-700 dark:text-amber-300 underline">Entendido</button>
        </div>
      )}

      <div key={tab} className="screen-enter">
        {tab === 'today' && (
          <TodayView state={state} setState={setState} dateKey={selectedDate} setDateKey={setSelectedDate}
            targets={targets}
            onAddMealCapture={() => setShowMealCapture(true)}
            onAddSubstitution={() => setShowSubstitution(true)}
            onCoach={() => setShowCoach(true)} />
        )}
        {tab === 'week' && <WeekView state={state} setState={setState} onSelectDay={handleSelectDay} targets={targets} />}
        {tab === 'plan' && <PlanWeekView state={state} setState={setState} targets={targets} />}
        {tab === 'insights' && <InsightsView state={state} setState={setState} targets={targets} />}
        {tab === 'exercise' && <ExercisesView state={state} setState={setState} targets={targets} />}
        {tab === 'routine' && <RoutineView state={state} setState={setState} />}
        {tab === 'weight' && <WeightView state={state} setState={setState} targets={targets} />}
        {tab === 'health' && <HealthView state={state} setState={setState} targets={targets} />}
        {tab === 'bank' && <BankView state={state} setState={setState} />}
      </div>

      <BentoMobileTabBar activeTab={tab} onTabChange={setTab} tabs={orderedTabs} />
      <CmdKPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onAction={handleCmdkAction} tabs={orderedTabs} />

      {needsOnboarding && (
        <OnboardingModal state={state} setState={setState} onClose={() => {}} />
      )}
      {showMealCapture && (
        <MealPhotoModal state={state} setState={setState} dateKey={selectedDate}
          onClose={() => setShowMealCapture(false)} />
      )}
      {showSubstitution && (
        <SubstitutionModal state={state} setState={setState} dateKey={selectedDate} targets={targets}
          onClose={() => setShowSubstitution(false)} />
      )}
      {showCoach && (
        <CoachModal state={state} setState={setState} dateKey={selectedDate} targets={targets}
          onClose={() => setShowCoach(false)}
          onOpenSubstitution={() => setShowSubstitution(true)} />
      )}
      {showSettings && <SettingsModal state={state} setState={setState} onClose={() => setShowSettings(false)} />}

      {/* Hint de teclado (solo desktop) */}
      <div className="bento-topbar-desktop" style={{
        position: 'fixed', bottom: 14, left: 14, zIndex: 25,
        background: 'var(--bento-card)', color: 'var(--bento-muted)',
        padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bento-hairline)',
        fontSize: 11, fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)', display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span><kbd>⌘K</kbd> palette</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><kbd>1</kbd>–<kbd>7</kbd> tabs</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// PWA: registrar Service Worker (solo desde http/https, no desde file://)
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('SW registration failed:', e?.message);
    });
  });
}
