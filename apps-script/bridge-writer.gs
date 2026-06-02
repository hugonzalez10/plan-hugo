// ─── Plan Hugo · bridge-writer (Apps Script Web App) ─────────────────────────
//
// Resuelve los problemas de la skill food-tracker:
//
//  1) DUPLICADOS: el conector de Drive de la skill solo sabe crear archivos (no
//     actualizar ni borrar por fileId), así que cada registro paría un
//     plan-hugo-bridge.json nuevo. Acá el bridge vive en UN fileId fijo
//     (CANONICAL_ID) y SIEMPRE se sobrescribe en sitio; los duplicados se barren.
//
//  2) LENTITUD: la skill solo manda la ENTRADA NUEVA (~300 bytes) y este script
//     hace el merge del lado del servidor: agrega, poda lo viejo (>10 días),
//     guarda y devuelve los totales del día ya sumados.
//
//  3) AUTO-HEAL (red de seguridad): si la skill se salta el flujo y vuelve a hacer
//     `create_file` de un `plan-hugo-bridge.json` (o deja un `.upload.json`
//     colgando), la LECTURA del bridge (doGet sin parámetros, lo que usa la app)
//     ABSORBE esos archivos sueltos al canónico —unión por id, sin perder datos—
//     y los manda a la papelera ANTES de servir. Así el sistema se cura solo
//     aunque el escritor falle, y la app nunca ve datos incompletos. Ver
//     `_absorbStrays`.
//
// ── Cómo desplegar ───────────────────────────────────────────────────────────
//  1. Abre el proyecto de Apps Script que ya sirve el bridge (el de la URL /exec
//     que tienes pegada en la app, Ajustes → URL del Apps Script).
//  2. Reemplaza TODO el contenido de Code.gs por este archivo.
//  3. Implementar → Administrar implementaciones → editar la implementación
//     existente → Versión nueva → Implementar. (Misma implementación = misma URL;
//     no hace falta repegar nada en la app.)
//     Ejecutar como: Yo.  Quién tiene acceso: Cualquier usuario.
//  4. La primera vez pedirá permiso de Drive: acéptalo.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//  GET  /exec?w=add&section=...&...  → ESCRITURA INLINE (chat por curl/bash o app).
//                                       Arma una entrada desde params key=value y la
//                                       aplica. section ∈ meals|weights|workouts|checks.
//                                       Ej: ?w=add&section=meals&date=..&name=..&kcal=..
//                                       El SERVIDOR asigna el id (uuid) y deduplica por
//                                       CONTENIDO (ver "Dedup" abajo); el id del cliente
//                                       es opcional/ignorado en esta rama.
//  GET  /exec?w=delete&section=..&id=..→ borra de una sección la entrada con ese id y
//                                       devuelve { ok, deleted:<n>, section, id }. Para
//                                       limpiar errores desde el chat.
//  GET  /exec?delta=<json url-enc>   → aplica un payload/delta JSON entero por GET.
//  POST /exec  (body = delta|bridge) → escritura por POST (runtimes con curl/Bash).
//                                       Aplica el delta directo al canónico y
//                                       devuelve los totales del día.
//  GET  /exec                        → lee y devuelve el JSON del canónico (la app).
//                                       Antes de servir, AUTO-HEAL: absorbe y borra
//                                       cualquier duplicado/upload suelto.
//  GET  /exec?totals=YYYY-MM-DD      → devuelve solo los totales de ese día (rápido)
//  GET  /exec?config=1               → devuelve solo el bloque `config` (la skill)
//  GET  /exec?cleanup=1              → barre duplicados en todo Drive (mantención)
//  GET  /exec?heal=1                 → fuerza el auto-heal y reporta cuántos absorbió
//  GET  /exec?commit=<uploadFileId>  → LEGACY: aplica un upload suelto al canónico.
//                                       Era del flujo viejo `create_file` + commit,
//                                       que fallaba en la raíz del Shared Drive
//                                       (canAddChildren:false). Se conserva por
//                                       compatibilidad / auto-heal; la skill ya no
//                                       lo usa: postea el delta directo (ver arriba).
//
//  ── Cómo postea la skill (gotcha de curl, NO cambiar) ────────────────────────
//   El `/exec` responde el resultado del doPost vía un 302 a
//   script.googleusercontent.com. Con `curl`:
//     curl -sL --data '<delta JSON>' "<BRIDGE_URL>"      ✓ (postea y baja a GET)
//   NUNCA con `-X POST`: fuerza re-POST en el redirect y googleusercontent da 405.
//   `-L` es obligatorio para seguir ese redirect.
//
//  Formato del "delta" (lo que postea el chat/app):
//    { "op":"add", "section":"meals", "today":"2026-05-30",
//      "entries":[ { ...una o varias entradas... } ] }
//    section ∈ meals | weights | workouts | checks
//  Borrado:  { "op":"delete", "section":"meals", "id":"<id>" }
//  También acepta un BRIDGE COMPLETO ({meals,weights,...}) → unión por contenido.
//
//  ── Dedup por CONTENIDO + autoridad del id en el servidor ────────────────────
//   El id ya NO lo fija el cliente: en la rama `op:add` el servidor asigna un uuid
//   y deduplica por CONTENIDO, no por id. Así el mismo plato registrado desde la app
//   y desde el chat (o dos veces) NO se duplica aunque traiga ids distintos. Firma:
//     · meals    : nombre normalizado | mealSlot | date   (+ ventana ±5 min sobre ts)
//     · workouts : nombre normalizado | date              (+ ventana ±5 min sobre ts)
//     · weights  : date  → si ya hay medición del día, MERGEA campos (no duplica)
//     · checks   : meal | date  → idempotente
//   Conviene mandar `ts` (ms) o `time` para que la ventana funcione; si faltan, el
//   servidor sella `ts` con la hora de llegada. La normalización debe ser idéntica a
//   `normalizeName` de app.jsx (minúsculas, trim, espacios colapsados) o el dedup
//   diverge entre lados. En la unión de un BRIDGE COMPLETO / auto-heal los ids
//   existentes se conservan (estabilidad); solo se asignan en `op:add` o si faltan.
//
//  SNAPSHOT (lo empuja la APP por POST): el total real del día ya calculado en
//  pantalla, para que el chat responda "cómo voy hoy" con ese número:
//    { "op":"snapshot", "date":"2026-05-30",
//      "totals":{kcalNet,kcalIn,kcalBurned,protein,carbs,fat,fiber,waterMl},
//      "targets":{...}, "remaining":{...}, "eaten":[...] }
//  Se guarda en `snapshots[date]`. GET ?totals=<date> lo devuelve con source:"app".
//
//  CONFIG (lo empuja la APP por POST cuando cambia el perfil): meta diaria, déficit,
//  TMB/TDEE y antropometría, para que la skill no hardcodee ~2.150 kcal:
//    { "op":"config", "config":{ goal, sex, age, heightCm, weightKg, activityLevel,
//      kcalTarget, kcalDeficit, targets:{kcalMax,proteinMin,...,bmr,tdee} } }
//  Se guarda en `config`. GET ?config=1 lo devuelve. NO se poda.
//
// ── CORS ─────────────────────────────────────────────────────────────────────
//  ContentService NO permite fijar cabeceras (no se puede poner
//  Access-Control-Allow-Origin a mano). Funciona igual porque:
//   · La LECTURA de la app es un GET simple → la respuesta final desde
//     script.googleusercontent.com ya trae CORS permisivo; el `fetch` del browser
//     la lee sin problema.
//   · La ESCRITURA de la app (snapshot/config) usa `mode:'no-cors'` +
//     `Content-Type: text/plain` → es una "simple request" (sin preflight), fire
//     and forget; la respuesta es opaca pero el POST llega igual a doPost.
//  NO cambies esos dos patrones en la app o se rompe el CORS.
//
// ── Mantenimiento ────────────────────────────────────────────────────────────
//  Si algún día se recrea el archivo, actualiza CANONICAL_ID aquí Y en
//  food-tracker/SKILL.md (constante FILE_ID). Deben coincidir siempre.

var CANONICAL_ID = '1YN3F48EZoRWSpOabwDqoXzKrGkTqIa2t';
var BRIDGE_TITLE = 'plan-hugo-bridge.json';
var UPLOAD_TITLE = 'plan-hugo-bridge.upload.json';
var PRUNE_DAYS   = 10;
var SECTIONS     = ['meals', 'weights', 'workouts', 'checks'];
var WINDOW_MS    = 5 * 60 * 1000; // ventana de dedup por contenido (meals/workouts)
// Campos de composición que se mergean sobre la medición del día (no duplica peso).
var WEIGHT_MERGE_FIELDS = ['weightKg', 'bodyFatPct', 'muscleKg', 'visceralFat', 'time', 'note',
  'skeletalMuscleKg', 'fatFreeMassKg', 'boneKg', 'musclePct', 'waterPct', 'proteinPct',
  'bmi', 'ffmi', 'metabolicAge', 'basalMetabolismKcal', 'waistCm', 'rawExtracted'];

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _bridgeFolder() {
  var parents = DriveApp.getFileById(CANONICAL_ID).getParents();
  return parents.hasNext() ? parents.next() : null;
}

function _readCanonical() {
  var raw = DriveApp.getFileById(CANONICAL_ID).getBlob().getDataAsString();
  var b = raw ? JSON.parse(raw) : {};
  b.version = b.version || 1;
  SECTIONS.forEach(function (s) { if (!Array.isArray(b[s])) b[s] = []; });
  // `snapshots` = mapa por fecha con los totales que la APP calcula y empuja.
  if (typeof b.snapshots !== 'object' || b.snapshots === null || Array.isArray(b.snapshots)) b.snapshots = {};
  // `config` = perfil + metas que la APP empuja. La skill lo lee. NO se poda.
  if (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config)) b.config = {};
  return b;
}

function _writeCanonical(bridge) {
  bridge.updated_at = new Date().toISOString();
  DriveApp.getFileById(CANONICAL_ID).setContent(JSON.stringify(bridge, null, 2));
  _trashDuplicates();
}

// Manda a la papelera todo plan-hugo-bridge.json que NO sea el canónico y todos
// los plan-hugo-bridge.upload.json (temporales ya consumidos).
//
// BARRE TODO DRIVE, no solo la carpeta del canónico: un create_file mal dirigido
// puede dejar el duplicado en OTRA carpeta. `getFilesByName` sin carpeta busca en
// todo el Drive del dueño. Devuelve cuántos archivos mandó a la papelera.
function _trashDuplicates() {
  var n = 0;
  var dups = DriveApp.getFilesByName(BRIDGE_TITLE);
  while (dups.hasNext()) { var f = dups.next(); if (f.getId() !== CANONICAL_ID) { f.setTrashed(true); n++; } }
  var ups = DriveApp.getFilesByName(UPLOAD_TITLE);
  while (ups.hasNext()) { ups.next().setTrashed(true); n++; }
  return n;
}

function _daysAgoKey(n) {
  var d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function _prune(bridge) {
  var cutoff = _daysAgoKey(PRUNE_DAYS);
  SECTIONS.forEach(function (s) {
    bridge[s] = bridge[s].filter(function (e) { return !e || !e.date || e.date >= cutoff; });
  });
  if (bridge.snapshots) {
    Object.keys(bridge.snapshots).forEach(function (d) { if (d < cutoff) delete bridge.snapshots[d]; });
  }
}

// Totales del día = suma de `meals` (extras del bridge) con date = day.
function _totals(bridge, day) {
  var t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  bridge.meals.forEach(function (m) {
    if (m && m.date === day) {
      t.kcal += Number(m.kcal) || 0; t.protein += Number(m.protein) || 0;
      t.carbs += Number(m.carbs) || 0; t.fat += Number(m.fat) || 0;
    }
  });
  var wk = 0;
  bridge.workouts.forEach(function (w) { if (w && w.date === day) wk += Number(w.kcal) || 0; });
  return { totals: t, workoutsKcal: wk };
}

// ── Merge puro (sin I/O): aplica un payload sobre un bridge EN MEMORIA ────────
// Centraliza la semántica de merge para que la use tanto `_applyInner` (un payload)
// como `_absorbStrays` (varios archivos sueltos). Devuelve cuántas entradas agregó
// (-1 = reemplazo completo de secciones).
function _mergeInto(bridge, payload, day) {
  if (!payload) return 0;

  // SNAPSHOT: la app empuja totales ya calculados para una fecha.
  if (payload.op === 'snapshot' && payload.date) {
    bridge.snapshots[payload.date] = {
      date: payload.date,
      totals: payload.totals || {},
      targets: payload.targets || {},
      remaining: payload.remaining || {},
      eaten: payload.eaten || [],
      ts: payload.ts || new Date().getTime()
    };
    return 0;
  }

  // CONFIG: la app empuja su perfil + metas. Solo adoptar si es MÁS NUEVO que el
  // que ya tiene el canónico (un archivo suelto del skill puede traer config vieja;
  // no queremos que pise la config buena de la app). La app es la autoridad.
  if (payload.op === 'config' && payload.config) {
    var incoming = payload.config.updatedAt || '';
    var current = (bridge.config && bridge.config.updatedAt) || '';
    if (!current || incoming >= current) {
      bridge.config = payload.config;
      bridge.config.updatedAt = incoming || new Date().toISOString();
    }
    return 0;
  }

  // DELTA add: agrega entradas a una sección, dedup por CONTENIDO. El servidor
  // asigna el id (autoridad) y sella el ts.
  if (payload.op === 'add' && payload.section) {
    var sec = payload.section;
    if (SECTIONS.indexOf(sec) < 0) return 0;
    var entries = payload.entries || (payload.entry ? [payload.entry] : []);
    return _contentUnion(bridge, sec, entries, true);
  }

  // BRIDGE COMPLETO: unión por contenido en cada sección (NO sobrescribe a ciegas, así
  // un archivo suelto no borra entradas que el canónico tenga y él no). Conserva los
  // ids existentes (assignId=false). Snapshots y config se mergean con la misma regla
  // de arriba si vienen.
  if (SECTIONS.some(function (s) { return Array.isArray(payload[s]); })) {
    var added = 0;
    SECTIONS.forEach(function (s) {
      if (Array.isArray(payload[s])) added += _contentUnion(bridge, s, payload[s], false);
    });
    if (payload.snapshots && typeof payload.snapshots === 'object') {
      Object.keys(payload.snapshots).forEach(function (d) {
        var ex = bridge.snapshots[d];
        var inc = payload.snapshots[d];
        // Quédate con el snapshot de ts más alto (el más reciente).
        if (!ex || (inc && (inc.ts || 0) > (ex.ts || 0))) bridge.snapshots[d] = inc;
      });
    }
    if (payload.config && payload.config.updatedAt) {
      _mergeInto(bridge, { op: 'config', config: payload.config });
    }
    return added;
  }

  return 0;
}

// Normalización idéntica a `normalizeName` de app.jsx (minúsculas, trim, espacios
// colapsados; SIN quitar acentos). Debe coincidir carácter a carácter o el dedup
// por contenido diverge entre el servidor y la app.
function _norm(s) {
  return String(s == null ? '' : s).toLowerCase().trim().replace(/\s+/g, ' ');
}

// Firma de contenido por sección (sin ts: la ventana temporal se compara aparte).
function _sig(sec, e) {
  if (!e) return null;
  if (sec === 'meals')    return _norm(e.name) + '|' + _norm(e.mealSlot || 'extra') + '|' + (e.date || '');
  if (sec === 'workouts') return _norm(e.name) + '|' + (e.date || '');
  if (sec === 'weights')  return (e.date || '');
  if (sec === 'checks')   return _norm(e.meal) + '|' + (e.date || '');
  return null;
}

// ts en ms para la ventana. Orden: e.ts (ms) → date+time → id unix-segundos → nowMs.
function _entryTs(e, nowMs) {
  if (!e) return nowMs;
  if (e.ts != null && !isNaN(Number(e.ts)) && Number(e.ts) > 0) return Number(e.ts);
  if (e.date && e.time) {
    var hhmm = String(e.time);
    var t = new Date(e.date + 'T' + (hhmm.length === 5 ? hhmm + ':00' : hhmm));
    if (!isNaN(t.getTime())) return t.getTime();
  }
  if (e.id != null && /^\d{9,11}$/.test(String(e.id))) return Number(e.id) * 1000;
  return nowMs;
}

// Unión por CONTENIDO (reemplaza la unión por id). El servidor es la autoridad del
// id: a cada entrada NUEVA (sin match) le asigna un uuid y le sella el ts. Dedup:
//   · meals/workouts → misma firma de contenido Y |Δts| ≤ WINDOW_MS.
//   · weights        → misma fecha → merge de campos en la existente (no duplica).
//   · checks         → misma (meal|fecha) → idempotente, descarta el repetido.
// `assignId`: true en `op:add` (autoridad del servidor, reasigna siempre); false en
// la unión de un bridge completo / auto-heal (conserva ids existentes; solo asigna
// si faltan) para no churnar ids en cada lectura. Devuelve cuántas entradas agregó.
function _contentUnion(bridge, sec, entries, assignId) {
  if (SECTIONS.indexOf(sec) < 0) return 0;
  var nowMs = new Date().getTime();
  var added = 0;
  entries.forEach(function (e) {
    if (!e) return;
    var sig = _sig(sec, e);
    var ets = _entryTs(e, nowMs);
    var hitIdx = -1;
    for (var i = 0; i < bridge[sec].length; i++) {
      var x = bridge[sec][i];
      if (!x || _sig(sec, x) !== sig) continue;
      if (sec === 'meals' || sec === 'workouts') {
        if (Math.abs(ets - _entryTs(x, nowMs)) > WINDOW_MS) continue;
      }
      hitIdx = i; break;
    }
    if (hitIdx >= 0) {
      if (sec === 'weights') {
        var cur = bridge[sec][hitIdx];
        WEIGHT_MERGE_FIELDS.forEach(function (k) {
          if (e[k] != null && e[k] !== '') cur[k] = e[k];
        });
      }
      return; // dedup: ya existe (o mergeado, en weights)
    }
    if (assignId || e.id == null) e.id = Utilities.getUuid();
    e.ts = ets;
    bridge[sec].push(e);
    added++;
  });
  return added;
}

// Borra de una sección la entrada con ese id (compara como String → sirve para ids
// numéricos legacy y uuid nuevos). Bajo lock. Devuelve { ok, deleted, section, id }.
function _applyDelete(section, id) {
  if (SECTIONS.indexOf(section) < 0) return { ok: false, reason: 'bad-section' };
  if (id == null || id === '') return { ok: false, reason: 'no-id' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, reason: 'busy' }; }
  try {
    var bridge = _readCanonical();
    var before = bridge[section].length;
    var target = String(id);
    bridge[section] = bridge[section].filter(function (e) { return !e || String(e.id) !== target; });
    var deleted = before - bridge[section].length;
    if (deleted > 0) _writeCanonical(bridge);
    return { ok: true, deleted: deleted, section: section, id: id };
  } finally {
    lock.releaseLock();
  }
}

// ── Aplicación bajo lock ─────────────────────────────────────────────────────
// El lock serializa toda mutación del canónico: snapshot, config y commit hacen
// read-modify-write sobre el MISMO archivo; sin lock uno pisa al otro.
function _apply(payload) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, reason: 'busy' }; }
  try {
    var bridge = _readCanonical();
    var day = (payload && payload.today) || _daysAgoKey(0);
    if (!payload) return { ok: false, reason: 'empty-or-bad-payload' };
    var isKnown = payload.op === 'snapshot' || payload.op === 'config' ||
      payload.op === 'add' || SECTIONS.some(function (s) { return Array.isArray(payload[s]); });
    if (!isKnown) return { ok: false, reason: 'empty-or-bad-payload' };

    var added = _mergeInto(bridge, payload, day);
    _prune(bridge);
    _writeCanonical(bridge);

    if (payload.op === 'snapshot') return { ok: true, snapshot: true, today: payload.date };
    if (payload.op === 'config')   return { ok: true, config: true };
    var sum = _totals(bridge, day);
    return { ok: true, added: added, today: day, totals: sum.totals, workoutsKcal: sum.workoutsKcal };
  } finally {
    lock.releaseLock();
  }
}

// ── AUTO-HEAL ────────────────────────────────────────────────────────────────
// Absorbe al canónico cualquier `plan-hugo-bridge.json` suelto (id != canónico) y
// cualquier `plan-hugo-bridge.upload.json`, unión por id, y los manda a la
// papelera. Pensado para correr ANTES de servir una lectura: así, aunque la skill
// se salte el flujo y haga create_file, la app siempre ve datos completos y sin
// duplicados. Barato en el caso feliz: si no hay sueltos, ni toma el lock ni
// escribe. Devuelve cuántos archivos absorbió.
function _absorbStrays() {
  // 1) Chequeo barato y SIN lock: ¿hay algo que absorber?
  var strays = [];
  var it = DriveApp.getFilesByName(BRIDGE_TITLE);
  while (it.hasNext()) { var f = it.next(); if (f.getId() !== CANONICAL_ID) strays.push(f); }
  var up = DriveApp.getFilesByName(UPLOAD_TITLE);
  while (up.hasNext()) strays.push(up.next());
  if (!strays.length) return 0;

  // 2) Hay sueltos → bajo lock: lee canónico, mergea cada suelto, escribe una vez.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return 0; } // ocupado → sirve tal cual, ya se curará en la próxima lectura
  try {
    var bridge = _readCanonical();
    strays.forEach(function (f) {
      try { _mergeInto(bridge, JSON.parse(f.getBlob().getDataAsString())); }
      catch (e) { /* archivo corrupto: igual se manda a la papelera abajo */ }
    });
    _prune(bridge);
    _writeCanonical(bridge); // setContent + _trashDuplicates() (manda los sueltos a la papelera)
    return strays.length;
  } finally {
    lock.releaseLock();
  }
}

function _commitFromUpload(uploadId) {
  var file = null;
  if (uploadId && uploadId !== '1') {
    file = DriveApp.getFileById(uploadId);
  } else {
    var it = DriveApp.getFilesByName(UPLOAD_TITLE);
    while (it.hasNext()) { var f = it.next(); if (!file || f.getLastUpdated() > file.getLastUpdated()) file = f; }
  }
  if (!file) return { ok: false, reason: 'no-upload' };
  return _apply(JSON.parse(file.getBlob().getDataAsString()));
}

// ── ESCRITURA INLINE POR GET (chat por curl/bash, o app) ─────────────────────
// El chat escribe con curl directo al `/exec` (web_fetch bloquea esta URL por no
// venir de un search). Esta rama arma UNA entrada desde parámetros key=value y reusa
// _apply (mismo merge/poda/dedup/totales que doPost).
//   GET ?w=add&section=meals&date=YYYY-MM-DD&name=...&kcal=..&protein=..[&ts=<ms>]
//   section ∈ meals|weights|workouts|checks. El servidor asigna el id y dedup por
//   contenido; manda `ts` (ms) o `time` para afinar la ventana de 5 min.
// Alternativa: ?delta=<json url-encoded> para mandar el objeto/payload entero.
function _entryFromParams(p) {
  var entry = { source: p.source || 'skill-chat' };
  ['date', 'time', 'name', 'mealSlot', 'meal', 'gi', 'notes'].forEach(function (k) {
    if (p[k] != null && p[k] !== '') entry[k] = p[k];
  });
  ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'minutes', 'ts', 'weightKg', 'bodyFatPct',
   'muscleKg', 'visceralFat'].forEach(function (k) {
    if (p[k] != null && p[k] !== '') entry[k] = Number(p[k]);
  });
  // El id del cliente es opcional: en `op:add` el servidor lo reasigna (autoridad).
  // Se conserva solo como pista para derivar el ts si no viene `ts`/`time`.
  if (p.id != null && p.id !== '') entry.id = Number(p.id);
  if (p.satfat != null) entry.sat_fat_warning = (p.satfat === '1' || p.satfat === 'true');
  return entry;
}

// ── LECTURA (la app) + TOTALES + COMMIT/HEAL por GET ─────────────────────────
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.w === 'add' && p.section) {
    return _json(_apply({ op: 'add', section: p.section, today: (p.date || p.today), entries: [_entryFromParams(p)] }));
  }
  if (p.w === 'delete' && p.section && p.id != null) {
    return _json(_applyDelete(p.section, p.id));
  }
  if (p.delta)   return _json(_apply(JSON.parse(p.delta)));
  if (p.commit)  return _json(_commitFromUpload(p.commit));
  if (p.cleanup) return _json({ ok: true, trashed: _trashDuplicates() });
  if (p.heal)    return _json({ ok: true, absorbed: _absorbStrays() });
  if (p.config)  return _json({ ok: true, config: _readCanonical().config || {} });
  if (p.totals) {
    var bR = _readCanonical();
    var snap = bR.snapshots && bR.snapshots[p.totals];
    if (snap) {
      var tt = snap.totals || {};
      return _json({
        source: 'app', today: p.totals, ts: snap.ts || null,
        totals: {
          kcal: Number(tt.kcalNet) || 0, kcalIn: Number(tt.kcalIn) || 0,
          kcalBurned: Number(tt.kcalBurned) || 0, protein: Number(tt.protein) || 0,
          carbs: Number(tt.carbs) || 0, fat: Number(tt.fat) || 0,
          fiber: Number(tt.fiber) || 0, waterMl: Number(tt.waterMl) || 0
        },
        targets: snap.targets || {}, remaining: snap.remaining || {},
        workoutsKcal: Number(tt.kcalBurned) || 0, eaten: snap.eaten || []
      });
    }
    var sum = _totals(bR, p.totals);
    return _json({ source: 'bridge', today: p.totals, totals: sum.totals, workoutsKcal: sum.workoutsKcal });
  }
  // Lectura principal de la app: AUTO-HEAL antes de servir, luego entrega el JSON.
  try { _absorbStrays(); } catch (err) { /* nunca falles la lectura por el heal */ }
  var data = DriveApp.getFileById(CANONICAL_ID).getBlob().getDataAsString();
  return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
}

// ── COMMIT por POST (runtime que sí pueda postear el JSON directo) ───────────
function doPost(e) {
  var content = (e && e.postData) ? e.postData.contents : '';
  if (!content) return _json({ ok: false, reason: 'empty' });
  var payload = JSON.parse(content);
  // Borrado por POST (op:'delete') con su propio lock; no pasa por _apply para no
  // anidar locks.
  if (payload && payload.op === 'delete') return _json(_applyDelete(payload.section, payload.id));
  return _json(_apply(payload));
}

// Opcional: si el runtime de la skill NO pudiera disparar el commit por GET,
// instala un disparador por tiempo (cada 1 min) sobre esta función.
function commitPending() { _commitFromUpload(null); }
