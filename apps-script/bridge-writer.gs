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
//     hace el merge del lado del servidor: agrega, poda lo viejo (retención por
//     sección: weights nunca, el resto 30 días), guarda y devuelve los totales del día.
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
//  GET  /exec?w=update&section=..&date=..(o&id=..)&campo=valor&...
//                                     → MERGE no destructivo sobre la entrada que matchea
//                                       (por id, o por date si no hay id). Solo escribe los
//                                       campos provistos; no borra los demás ni reasigna id.
//                                       Para COMPLETAR/CORREGIR una medición sin duplicarla.
//                                       Responde { ok, updated:1, fields:<n>,... } o
//                                       { ok:false, reason:'not_found' }.
//  GET  /exec?delta=<json url-enc>   → aplica un payload/delta JSON entero por GET.
//  POST /exec  (body = delta|bridge) → escritura por POST (runtimes con curl/Bash).
//                                       Aplica el delta directo al canónico y
//                                       devuelve los totales del día.
//  GET  /exec                        → lee y devuelve el JSON del canónico (la app).
//                                       Antes de servir, AUTO-HEAL: absorbe y borra
//                                       cualquier duplicado/upload suelto.
//  GET  /exec?totals=YYYY-MM-DD      → devuelve solo los totales de ese día (rápido).
//                                       meals[] es la autoridad del log de comida; si
//                                       hay snapshot de la app toma el MAYOR por
//                                       nutriente (nunca muestra de menos, conserva el
//                                       plan fijo del snapshot). Ver el branch p.totals.
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
//  Update :  { "op":"update", "section":"weights", "date":"<date>"(o "id":"<id>"),
//             "fields":{ ...campos a mergear... } }  (también acepta los campos planos
//             en el propio payload si omites el sobre `fields`).
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
//  Se guarda en `snapshots[date]`. GET ?totals=<date> lo devuelve con source:"app"
//  (o "app+meals" si meals[] tenía más que el snapshot y mandó el log del bridge).
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

// ── AUTENTICACIÓN ────────────────────────────────────────────────────────────
// El web app está desplegado como "Cualquier usuario": sin esto, quien tenga la URL
// /exec puede leer, escribir y BORRAR tus datos. SHARED_TOKEN es un secreto compartido
// obligatorio: cada GET/POST debe traer ?k=<token> (Apps Script expone `e.parameter`
// también en POST, así un solo guard cubre lectura y escritura). El mismo valor va en
// la app (Ajustes → Token del bridge) y en la skill food-tracker (constante BRIDGE_TOKEN).
//   · Si SHARED_TOKEN queda en '' (vacío) → auth DESACTIVADA (compat / despliegue gradual).
//   · En cuanto le pongas un valor, se exige en TODA llamada.
// Despliegue sin lockout: pon el token primero en la app y la skill (la app ya manda
// ?k= aunque el .gs aún no lo exija), y recién después fija SHARED_TOKEN aquí y redeploy.
var SHARED_TOKEN = ''; // candado DESACTIVADO (2026-06-05): rompía el registro por chat. La URL /exec ya es secreta.

function _authed(e) {
  if (!SHARED_TOKEN) return true; // auth desactivada mientras el token esté vacío
  var got = (e && e.parameter && e.parameter.k) || '';
  return got === SHARED_TOKEN;
}

var CANONICAL_ID = '1YN3F48EZoRWSpOabwDqoXzKrGkTqIa2t';
var BRIDGE_TITLE = 'plan-hugo-bridge.json';
var UPLOAD_TITLE = 'plan-hugo-bridge.upload.json';
// Retención por sección, en días. 0 (o ausente) = NO podar nunca.
//   · weights → 0: el historial de peso/composición es la serie de tendencia (lo que da
//     las pendientes de pérdida); es livianísimo (~1 fila/día, ~30 números) y perderlo nos
//     obligó a reconstruir a mano. Nunca se poda.
//   · meals/workouts/checks/water → 30: crecen rápido (varias entradas/día) y la app no
//     necesita el log viejo; 30 días cubre cualquier "cómo voy" + colchón.
//   · energy → 0: serie compacta {date, kcalIn, trendWeightKg} (~3 números/día) que el TDEE
//     adaptativo de la app necesita para reconstruir el gasto. Como meals se poda a 30 días,
//     sin esto el historial de ingesta para estimar gasto se perdería entre dispositivos.
//     Nunca se poda; mergea por fecha (no duplica).
var RETENTION    = { weights: 0, meals: 30, workouts: 30, checks: 30, water: 30, energy: 0 };
var SNAPSHOT_RETENTION_DAYS = 30; // los snapshots por fecha siguen la misma ventana que meals
var SECTIONS     = ['meals', 'weights', 'workouts', 'checks', 'water', 'energy'];
// Campos de la sección `energy` que se mergean por fecha (latest gana). Mantener en sync con
// buildEnergySeries() de app.jsx.
var ENERGY_MERGE_FIELDS = ['kcalIn', 'trendWeightKg'];
var WINDOW_MS    = 5 * 60 * 1000; // ventana de dedup por contenido (meals/workouts)
// Campos de composición que se mergean sobre la medición del día (no duplica peso).
// Lista COMPLETA alineada con WEIGHT_FIELDS + STRING_FIELDS + SEGMENT_FIELDS de app.jsx:
// si llega una segunda captura del mismo día (otra pantalla de Speediance), conserva
// todos sus campos. Mantener en sync con la app o se pierden datos en el merge.
var WEIGHT_MERGE_FIELDS = [
  'weightKg', 'bodyFatPct', 'score',
  'fatKg', 'subcutaneousFatKg', 'muscleKg', 'skeletalMuscleKg', 'fatFreeMassKg',
  'waterKg', 'proteinKg', 'boneKg',
  'musclePct', 'waterPct', 'proteinPct',
  'bmi', 'ffmi', 'metabolicAge', 'visceralFat', 'basalMetabolismKcal',
  'waistHipRatio', 'referenceWeightKg', 'bodyType',
  'heightCm', 'neckCm', 'chestCm', 'waistCm', 'hipCm', 'bicepCm', 'armCm',
  'forearmCm', 'thighCm', 'calfCm',
  'fatSegUpperL', 'fatSegUpperR', 'fatSegTorso', 'fatSegLowerL', 'fatSegLowerR',
  'muscleSegUpperL', 'muscleSegUpperR', 'muscleSegTorso', 'muscleSegLowerL', 'muscleSegLowerR',
  'time', 'note', 'rawExtracted'];

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
  SECTIONS.forEach(function (s) {
    var days = RETENTION[s];
    if (!days || days <= 0) return; // 0 / ausente = no podar (weights)
    var cutoff = _daysAgoKey(days);
    bridge[s] = bridge[s].filter(function (e) { return !e || !e.date || e.date >= cutoff; });
  });
  if (bridge.snapshots) {
    var snapCutoff = _daysAgoKey(SNAPSHOT_RETENTION_DAYS);
    Object.keys(bridge.snapshots).forEach(function (d) { if (d < snapCutoff) delete bridge.snapshots[d]; });
  }
}

// Totales del día = suma de `meals` (extras del bridge) con date = day.
function _totals(bridge, day) {
  var t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  bridge.meals.forEach(function (m) {
    if (m && m.date === day) {
      t.kcal += Number(m.kcal) || 0; t.protein += Number(m.protein) || 0;
      t.carbs += Number(m.carbs) || 0; t.fat += Number(m.fat) || 0;
      t.fiber += Number(m.fiber) || 0;
    }
  });
  var wk = 0;
  bridge.workouts.forEach(function (w) { if (w && w.date === day) wk += Number(w.kcal) || 0; });
  var waterMl = 0;
  (bridge.water || []).forEach(function (w) { if (w && w.date === day) waterMl += Number(w.ml) || 0; });
  return { totals: t, workoutsKcal: wk, waterMl: waterMl };
}

// Nombres de las `meals` de un día (el log real de comida del bridge), para
// listar "qué comiste" en `?totals=` aunque la app no las tenga en su snapshot.
function _mealNames(bridge, day) {
  var names = [];
  bridge.meals.forEach(function (m) {
    if (m && m.date === day && m.name) names.push(m.name);
  });
  return names;
}

// ── Reconciliación de totales del día (PURA, sin I/O) ────────────────────────
// Combina el log de comida del bridge (meals[]/workouts[], `meal`) con el snapshot
// que empuja la app (`snap`). DOS regímenes según el marcador `snap.planScope`:
//
//  · 'plan-only' (PARTICIÓN ADITIVA, el camino nuevo): el snapshot trae SOLO la porción
//    del plan (fijos + banco) + agua, que NO viaja a meals[]. Los extras y el ejercicio
//    SÍ están en meals[]/workouts[]. Como los conjuntos son disjuntos, SE SUMAN. Esto
//    refleja correcciones hacia abajo: borrar un extra encoge meals[]; destildar un fijo
//    encoge el snapshot → el total baja. (El viejo Math.max nunca bajaba: un trinquete.)
//
//  · sin marcador (LEGACY): snapshots viejos en vuelo traían el total COMPLETO (incl.
//    extras), que se solapa con meals[]. Para no doblar ni romper, se reconcilia con el
//    MAYOR por nutriente, como antes. Se autolimpia: la app reescribe el snapshot del día
//    marcado en cuanto se abre, así que este branch solo cubre la ventana de migración.
//
// `meal` = { totals:{kcal,protein,carbs,fat,fiber}, workoutsKcal }; `mealNames` = string[].
function _reconcile(day, snap, meal, mealNames) {
  var mt = meal.totals;
  var names = mealNames || [];
  var bridgeWater = Number(meal.waterMl) || 0; // agua registrada por chat (section water)
  if (!snap) {
    return {
      source: 'bridge', today: day,
      totals: { kcal: mt.kcal, protein: mt.protein, carbs: mt.carbs, fat: mt.fat, fiber: mt.fiber, waterMl: bridgeWater },
      workoutsKcal: meal.workoutsKcal, eaten: names
    };
  }
  var tt = snap.totals || {};
  var targets = snap.targets || {};
  var num = function (v) { return Number(v) || 0; };
  var kcalIn, kcalBurned, protein, carbs, fat, fiber, source, recompute;
  var waterMl = num(tt.waterMl) + bridgeWater; // agua de la app (snapshot) + agua del chat

  if (snap.planScope === 'plan-only') {
    // ADITIVO: plan (snapshot) + log (meals[]/workouts[]).
    kcalIn = num(tt.kcalIn) + mt.kcal;
    kcalBurned = meal.workoutsKcal + num(tt.kcalBurned);
    protein = num(tt.protein) + mt.protein;
    carbs = num(tt.carbs) + mt.carbs;
    fat = num(tt.fat) + mt.fat;
    fiber = num(tt.fiber) + mt.fiber;
    source = 'app+meals';
    recompute = true; // remaining siempre contra metas (el snapshot.remaining era del total viejo)
  } else {
    // LEGACY: MAYOR por nutriente (no doblar el solape).
    kcalIn = Math.max(num(tt.kcalIn), mt.kcal);
    kcalBurned = Math.max(num(tt.kcalBurned), meal.workoutsKcal);
    protein = Math.max(num(tt.protein), mt.protein);
    carbs = Math.max(num(tt.carbs), mt.carbs);
    fat = Math.max(num(tt.fat), mt.fat);
    fiber = Math.max(num(tt.fiber), mt.fiber);
    var usedMeals = kcalIn > num(tt.kcalIn) || protein > num(tt.protein);
    source = usedMeals ? 'app+meals' : 'app';
    recompute = usedMeals;
  }

  var kcalNet = kcalIn - kcalBurned;
  var remaining = recompute ? {
    kcal: num(targets.kcalMax) - kcalNet,
    protein: num(targets.proteinMin) - protein,
    carbs: num(targets.carbsTarget) - carbs,
    fat: num(targets.fatTarget) - fat,
    fiber: num(targets.fiberTarget) - fiber,
    water: num(targets.waterTarget) - waterMl
  } : (snap.remaining || {});

  var eaten = (snap.eaten || []).slice();
  names.forEach(function (n) { if (eaten.indexOf(n) < 0) eaten.push(n); });

  return {
    source: source, today: day, ts: snap.ts || null,
    totals: {
      kcal: kcalNet, kcalIn: kcalIn, kcalBurned: kcalBurned,
      protein: protein, carbs: carbs, fat: fat, fiber: fiber, waterMl: waterMl
    },
    targets: targets, remaining: remaining,
    workoutsKcal: kcalBurned, eaten: eaten
  };
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
      // planScope:'plan-only' → la app mandó SOLO la porción del plan (fijos+banco)+agua;
      // ?totals= la SUMA con meals[]/workouts[] (partición aditiva). Ausente = legacy
      // (totales completos), se reconcilia con Math.max para no romper datos en vuelo.
      planScope: payload.planScope || null,
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
    // Rechaza "correcciones" con valores NEGATIVOS: en este modelo una comida o un
    // entrenamiento nunca aporta kcal/macros negativos. Netear con una entrada negativa
    // ensucia el ledger (queda el +duplicado Y el -corrección, ambos en el historial) y es
    // lo que rompió el día (duplicados + negativas). La forma correcta de corregir es
    // ?w=delete del id errado y re-registrar el bueno. Se descartan en el ORIGEN (solo
    // op:add, escrituras nuevas) para que el antipatrón sea imposible; la unión de un
    // bridge completo / auto-heal NO filtra, así que las negativas históricas no se tocan.
    if (sec === 'meals' || sec === 'workouts') {
      entries = entries.filter(function (e) { return !_hasNegativeNutrient(e); });
    }
    // Estampa la fecha del día en el ORIGEN si la entrada no la trae. Sin esto, un add
    // sin `date` (p.ej. una escritura de la skill que olvidó el campo) entraba SIN fecha:
    // ?totals la ignoraba (filtra por date) pero la app la importaba a `m.date || hoy`,
    // así que reaparecía como "extra de hoy" cada día y _prune nunca la caducaba
    // (entradas sin date son inmortales). La fecha resuelta de op:add es `day`.
    if (day) entries.forEach(function (e) { if (e && !e.date) e.date = day; });
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

// ¿La entrada trae algún nutriente NEGATIVO? Una comida/entrenamiento legítimo nunca lo
// hace; un negativo es el antipatrón de "corrección por neteo" que ensucia el ledger. Se
// usa para rechazarlos en op:add (ver _mergeInto). Corregir = ?w=delete + re-registrar.
function _hasNegativeNutrient(e) {
  if (!e) return false;
  return ['kcal', 'protein', 'carbs', 'fat', 'fiber'].some(function (k) {
    return Number(e[k]) < 0;
  });
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
  if (sec === 'energy')   return (e.date || '');
  if (sec === 'checks')   return _norm(e.meal) + '|' + (e.date || '');
  return null;
}

// Slots del plan + prefijos con que la skill nombra un reemplazo de comida ("Desayuno -
// ...", "Colacion 1 - ...", "Cena - ..."). DEBE coincidir con SLOT_NAME_RE de app.jsx.
var PLAN_SLOTS_GS = ['desayuno', 'almuerzo', 'colacion1', 'colacion2', 'cena'];
var SLOT_NAME_RE_GS = {
  desayuno: /^desayuno\b/i,
  almuerzo: /^almuerzo\b/i,
  colacion1: /^colaci[oó]n\s*1\b/i,
  colacion2: /^colaci[oó]n\s*2\b/i,
  cena: /^cena\b/i,
};
// Colación 1 (mañana) vs 2 (tarde) según la hora; corte 15:00. Espejo de resolveColacion() de app.jsx.
function _resolveColacion(m) {
  var mins = null;
  if (m && m.time) { var t = /^(\d{1,2}):(\d{2})/.exec(m.time); if (t) mins = (+t[1]) * 60 + (+t[2]); }
  if (mins == null && m && m.ts != null) { var d = new Date(Number(m.ts)); mins = d.getHours() * 60 + d.getMinutes(); }
  if (mins != null && mins < 15 * 60) return 'colacion1';
  return 'colacion2';
}
// La sección del plan que un meal REEMPLAZA, o null si es un extra genuino. Prefiere
// mealSlot ('colacion' a secas → 1/2 por hora); cae al nombre solo para skill-chat. Espejo
// de extraPlanSlot() de app.jsx.
function _mealSlot(m) {
  if (!m) return null;
  if (m.mealSlot === 'colacion') return _resolveColacion(m);
  if (PLAN_SLOTS_GS.indexOf(m.mealSlot) >= 0) return m.mealSlot;
  if (m.source === 'skill-chat' && m.name) {
    for (var i = 0; i < PLAN_SLOTS_GS.length; i++) {
      var slot = PLAN_SLOTS_GS[i];
      if (SLOT_NAME_RE_GS[slot].test(m.name)) return slot;
    }
    if (/^colaci[oó]n/i.test(m.name)) return _resolveColacion(m); // "Colación - ..." sin número
  }
  return null;
}
// Slot del plan según la hora del registro (time "HH:MM" o, si falta, el ts). Espejo de
// slotByTime() de app.jsx; la tabla DEBE coincidir con la de la skill (food-tracker). La
// colación AM (11:00) cae ANTES del almuerzo. Usa la zona horaria del script
// (appsscript.json → America/Santiago).
function _slotByTime(time, ts) {
  var mins = null;
  var m = time && /^(\d{1,2}):(\d{2})/.exec(time);
  if (m) mins = (+m[1]) * 60 + (+m[2]);
  else if (ts != null) { var d = new Date(Number(ts)); mins = d.getHours() * 60 + d.getMinutes(); }
  if (mins == null) return null;
  if (mins < 10 * 60 + 30) return 'desayuno';
  if (mins < 12 * 60 + 30) return 'colacion1';
  if (mins < 15 * 60 + 30) return 'almuerzo';
  if (mins < 19 * 60 + 30) return 'colacion2';
  return 'cena';
}
// ¿Ese día ya tiene un registro real de comida para la sección del check? Si sí, el
// check es redundante: el extra es la comida y marcar además el plan sumaría kcal
// fantasma en la app. Se descarta en el origen. Ver computeDayTotals/mergeBridge.
function _checkRedundant(bridge, check) {
  if (!check || !check.meal) return false;
  var date = check.date || '';
  for (var i = 0; i < bridge.meals.length; i++) {
    var m = bridge.meals[i];
    if (!m || (m.date || '') !== date) continue;
    if (_mealSlot(m) === check.meal) return true;
  }
  return false;
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
    // sig == null (p.ej. water) → sin firma de contenido = SIEMPRE nueva: append-only,
    // cada registro de agua SUMA y nunca se colapsa con otro del mismo día.
    if (sig != null) for (var i = 0; i < bridge[sec].length; i++) {
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
      } else if (sec === 'energy') {
        // Misma fecha → actualiza kcalIn/trendWeightKg (latest gana). El día se recalcula en
        // la app a medida que registra, así que el último valor del día es el bueno.
        var curE = bridge[sec][hitIdx];
        ENERGY_MERGE_FIELDS.forEach(function (k) {
          if (e[k] != null && e[k] !== '') curE[k] = e[k];
        });
      }
      return; // dedup: ya existe (o mergeado, en weights/energy)
    }
    // Anti-doble-conteo: un check de una sección que ese día YA tiene comida registrada
    // es redundante (el extra es la comida; el check sumaría el plan fijo fantasma). Como
    // SECTIONS procesa meals antes que checks, el meal ya está cuando llega el check.
    if (sec === 'checks' && _checkRedundant(bridge, e)) return;
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

// ── UPDATE no destructivo (PURO, sin I/O) ────────────────────────────────────
// Busca UNA entrada de `section` por id (o, si no, por date) y le hace merge de los
// campos provistos: solo escribe los que vienen con valor (no null/''), nunca borra los
// demás. No reescribe el id. Necesario para COMPLETAR/CORREGIR mediciones (p.ej. una
// captura parcial del 04/06 a la que después le llega el detalle) sin duplicar la fila
// —que es lo que pasaba con op:add (solo agrega)— ni perder los campos ya guardados.
// `sel` = { id?, date? }. Devuelve { ok, updated, section, id, date } o { ok:false, reason }.
function _updateInto(bridge, section, sel, fields) {
  if (SECTIONS.indexOf(section) < 0) return { ok: false, reason: 'bad-section' };
  if (!fields || typeof fields !== 'object') return { ok: false, reason: 'no-fields' };
  sel = sel || {};
  var arr = bridge[section];
  var idx = -1;
  if (sel.id != null && sel.id !== '') {
    var target = String(sel.id);
    for (var i = 0; i < arr.length; i++) { if (arr[i] && String(arr[i].id) === target) { idx = i; break; } }
  }
  if (idx < 0 && sel.date) {
    for (var j = 0; j < arr.length; j++) { if (arr[j] && arr[j].date === sel.date) { idx = j; break; } }
  }
  if (idx < 0) return { ok: false, reason: 'not_found' };
  var entry = arr[idx];
  var n = 0;
  Object.keys(fields).forEach(function (k) {
    if (k === 'id') return; // el id es autoridad del servidor, no se reescribe por update
    var v = fields[k];
    if (v != null && v !== '') { entry[k] = v; n++; }
  });
  return { ok: true, updated: 1, fields: n, section: section, id: entry.id, date: entry.date };
}

// Wrapper bajo lock de _updateInto: read-modify-write del canónico. Solo escribe si
// efectivamente actualizó algo. No pasa por _apply (evita anidar locks, como _applyDelete).
function _applyUpdate(section, sel, fields) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, reason: 'busy' }; }
  try {
    var bridge = _readCanonical();
    var res = _updateInto(bridge, section, sel, fields);
    if (res.ok) _writeCanonical(bridge);
    return res;
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
    return { ok: true, added: added, today: day, totals: sum.totals, workoutsKcal: sum.workoutsKcal, waterMl: sum.waterMl };
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
  ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'minutes', 'ts', 'ml',
   'weightKg', 'bodyFatPct', 'score', 'fatKg', 'subcutaneousFatKg', 'muscleKg',
   'skeletalMuscleKg', 'fatFreeMassKg', 'waterKg', 'proteinKg', 'boneKg',
   'musclePct', 'waterPct', 'proteinPct', 'bmi', 'ffmi', 'metabolicAge', 'visceralFat',
   'basalMetabolismKcal', 'waistHipRatio', 'referenceWeightKg',
   'heightCm', 'neckCm', 'chestCm', 'waistCm', 'hipCm', 'bicepCm', 'armCm',
   'forearmCm', 'thighCm', 'calfCm'].forEach(function (k) {
    if (p[k] != null && p[k] !== '') entry[k] = Number(p[k]);
  });
  // Strings de composición (tipo de cuerpo + segmentales) pasan tal cual.
  ['bodyType', 'fatSegUpperL', 'fatSegUpperR', 'fatSegTorso', 'fatSegLowerL', 'fatSegLowerR',
   'muscleSegUpperL', 'muscleSegUpperR', 'muscleSegTorso', 'muscleSegLowerL', 'muscleSegLowerR']
  .forEach(function (k) {
    if (p[k] != null && p[k] !== '') entry[k] = p[k];
  });
  // El id del cliente es opcional: en `op:add` el servidor lo reasigna (autoridad).
  // Se conserva solo como pista para derivar el ts si no viene `ts`/`time`.
  if (p.id != null && p.id !== '') entry.id = Number(p.id);
  if (p.satfat != null) entry.sat_fat_warning = (p.satfat === '1' || p.satfat === 'true');
  // Relleno de mealSlot cuando la skill no lo mandó: nombre → hora. Solo si está AUSENTE,
  // para no pisar un 'extra' explícito (comida fuera de plan). Así no cae todo a 'extra'.
  if (p.section === 'meals' && entry.mealSlot == null) {
    var inferred = _mealSlot(entry) || _slotByTime(entry.time, entry.ts);
    if (inferred) entry.mealSlot = inferred;
  }
  return entry;
}

// Campos tipados para w=update por GET: reusa el casteo de _entryFromParams pero quita
// las claves de control (w/section/source) y la selección (id/today). `date` se conserva
// porque para weights ES la entrada a actualizar (no se reescribe a sí misma: _updateInto
// solo asigna si trae valor, y si selecciona por date, asignar la misma date es no-op).
function _fieldsFromParams(p) {
  var entry = _entryFromParams(p);
  delete entry.source; // _entryFromParams inyecta 'skill-chat' por defecto; un update no toca source salvo que venga explícito
  if (p.source == null || p.source === '') {} else entry.source = p.source;
  delete entry.id;
  delete entry.today;
  return entry;
}

// ── LECTURA (la app) + TOTALES + COMMIT/HEAL por GET ─────────────────────────
function doGet(e) {
  if (!_authed(e)) return _json({ ok: false, reason: 'unauthorized' });
  var p = (e && e.parameter) || {};
  if (p.w === 'add' && p.section) {
    return _json(_apply({ op: 'add', section: p.section, today: (p.date || p.today), entries: [_entryFromParams(p)] }));
  }
  if (p.w === 'delete' && p.section && p.id != null) {
    return _json(_applyDelete(p.section, p.id));
  }
  if (p.w === 'update' && p.section && (p.id != null || p.date)) {
    return _json(_applyUpdate(p.section, { id: p.id, date: p.date }, _fieldsFromParams(p)));
  }
  if (p.delta)   return _json(_apply(JSON.parse(p.delta)));
  if (p.commit)  return _json(_commitFromUpload(p.commit));
  if (p.cleanup) return _json({ ok: true, trashed: _trashDuplicates() });
  if (p.heal)    return _json({ ok: true, absorbed: _absorbStrays() });
  if (p.config)  return _json({ ok: true, config: _readCanonical().config || {} });
  if (p.totals) {
    var bR = _readCanonical();
    var day = p.totals;
    var snap = bR.snapshots && bR.snapshots[day];
    var meal = _totals(bR, day);     // autoridad del log de comida: suma de meals[]
    return _json(_reconcile(day, snap, meal, _mealNames(bR, day)));
  }
  // Lectura principal de la app: AUTO-HEAL antes de servir, luego entrega el JSON.
  try { _absorbStrays(); } catch (err) { /* nunca falles la lectura por el heal */ }
  var data = DriveApp.getFileById(CANONICAL_ID).getBlob().getDataAsString();
  return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
}

// ── COMMIT por POST (runtime que sí pueda postear el JSON directo) ───────────
function doPost(e) {
  if (!_authed(e)) return _json({ ok: false, reason: 'unauthorized' });
  var content = (e && e.postData) ? e.postData.contents : '';
  if (!content) return _json({ ok: false, reason: 'empty' });
  var payload = JSON.parse(content);
  // Borrado por POST (op:'delete') con su propio lock; no pasa por _apply para no
  // anidar locks.
  if (payload && payload.op === 'delete') return _json(_applyDelete(payload.section, payload.id));
  // Update por POST (op:'update'): selección por id|date + campos. Acepta los campos en
  // `payload.fields` o, si no viene ese sobre, toma los del propio payload (quitando
  // op/section/id/date), para tolerar el shape plano { op,section,date, ...campos }.
  if (payload && payload.op === 'update' && payload.section) {
    var fields = payload.fields;
    if (!fields) {
      fields = {};
      Object.keys(payload).forEach(function (k) {
        if (['op', 'section', 'id', 'date', 'fields'].indexOf(k) < 0) fields[k] = payload[k];
      });
    }
    return _json(_applyUpdate(payload.section, { id: payload.id, date: payload.date }, fields));
  }
  return _json(_apply(payload));
}

// Opcional: si el runtime de la skill NO pudiera disparar el commit por GET,
// instala un disparador por tiempo (cada 1 min) sobre esta función.
function commitPending() { _commitFromUpload(null); }
