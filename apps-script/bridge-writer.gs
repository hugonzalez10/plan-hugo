// ─── Plan Hugo · bridge-writer (Apps Script Web App) ─────────────────────────
//
// Resuelve DOS problemas de la skill food-tracker de una sola vez:
//
//  1) DUPLICADOS: el conector de Drive de la skill solo sabe crear archivos (no
//     actualizar ni borrar por fileId), así que cada registro paría un
//     plan-hugo-bridge.json nuevo. Acá el bridge vive en UN fileId fijo
//     (CANONICAL_ID) y SIEMPRE se sobrescribe en sitio; los duplicados se barren.
//
//  2) LENTITUD: antes la skill bajaba TODO el JSON (~11 KB), lo reescribía entero
//     y lo re-subía en cada registro. Ahora la skill solo manda la ENTRADA NUEVA
//     (~300 bytes) y este script hace el merge del lado del servidor: agrega,
//     poda lo viejo (>10 días), guarda y devuelve los totales del día ya sumados.
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
//  GET  /exec                        → lee y devuelve el JSON del canónico (la app)
//  GET  /exec?totals=YYYY-MM-DD      → devuelve solo los totales de ese día (rápido)
//  GET  /exec?commit=<uploadFileId>  → aplica ese upload (delta o bridge) al canónico
//  POST /exec  (body = delta|bridge) → aplica directo (si el runtime puede postear)
//
//  Formato del "delta" (lo que deja la skill en el upload temporal):
//    { "op":"add", "section":"meals", "today":"2026-05-30",
//      "entries":[ { ...una o varias entradas... } ] }
//    section ∈ meals | weights | workouts | checks
//  También acepta un BRIDGE COMPLETO ({meals,weights,...}) → lo sobrescribe tal cual.
//
//  SNAPSHOT (lo empuja la APP por POST, no la skill): el total real del día ya
//  calculado en pantalla, para que el chat responda "cómo voy hoy" con ese número:
//    { "op":"snapshot", "date":"2026-05-30",
//      "totals":{kcalNet,kcalIn,kcalBurned,protein,carbs,fat,fiber,waterMl},
//      "targets":{...}, "remaining":{...}, "eaten":[...] }
//  Se guarda en `snapshots[date]`. GET ?totals=<date> lo devuelve con source:"app".
//
// ── Mantenimiento ────────────────────────────────────────────────────────────
//  Si algún día se recrea el archivo, actualiza CANONICAL_ID aquí Y en
//  food-tracker/SKILL.md (constante FILE_ID). Deben coincidir siempre.

var CANONICAL_ID = '1YN3F48EZoRWSpOabwDqoXzKrGkTqIa2t';
var BRIDGE_TITLE = 'plan-hugo-bridge.json';
var UPLOAD_TITLE = 'plan-hugo-bridge.upload.json';
var PRUNE_DAYS   = 10;
var SECTIONS     = ['meals', 'weights', 'workouts', 'checks'];

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
  // `snapshots` = mapa por fecha con los totales que la APP calcula y empuja
  // (plan fijo marcado + extras − ejercicio). Es la fuente real de "cómo voy hoy".
  if (typeof b.snapshots !== 'object' || b.snapshots === null || Array.isArray(b.snapshots)) b.snapshots = {};
  return b;
}

function _writeCanonical(bridge) {
  bridge.updated_at = new Date().toISOString();
  DriveApp.getFileById(CANONICAL_ID).setContent(JSON.stringify(bridge, null, 2));
  _trashDuplicates();
}

// Manda a la papelera todo plan-hugo-bridge.json que NO sea el canónico y todos
// los plan-hugo-bridge.upload.json (temporales ya consumidos).
function _trashDuplicates() {
  var folder = _bridgeFolder();
  if (!folder) return;
  var dups = folder.getFilesByName(BRIDGE_TITLE);
  while (dups.hasNext()) { var f = dups.next(); if (f.getId() !== CANONICAL_ID) f.setTrashed(true); }
  var ups = folder.getFilesByName(UPLOAD_TITLE);
  while (ups.hasNext()) ups.next().setTrashed(true);
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
// (Igual criterio que la skill: el plan fijo marcado lo suma la app, no el bridge.)
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

// Aplica un delta (merge incremental) o un bridge completo (sobrescritura).
function _apply(payload) {
  var bridge = _readCanonical();
  var day = (payload && payload.today) || _daysAgoKey(0);
  var added = 0;

  // SNAPSHOT: la app empuja sus totales ya calculados para una fecha. No toca
  // meals/weights/etc.; solo guarda/reemplaza el snapshot de ese día.
  if (payload && payload.op === 'snapshot' && payload.date) {
    bridge.snapshots[payload.date] = {
      date: payload.date,
      totals: payload.totals || {},
      targets: payload.targets || {},
      remaining: payload.remaining || {},
      eaten: payload.eaten || [],
      ts: payload.ts || new Date().getTime()
    };
    _prune(bridge);
    _writeCanonical(bridge);
    return { ok: true, snapshot: true, today: payload.date };
  }

  if (payload && payload.op === 'add' && payload.section) {
    var sec = payload.section;
    if (SECTIONS.indexOf(sec) < 0) return { ok: false, reason: 'bad-section' };
    var entries = payload.entries || (payload.entry ? [payload.entry] : []);
    var seen = {};
    bridge[sec].forEach(function (e) { if (e && e.id != null) seen[e.id] = true; });
    entries.forEach(function (e) {
      if (!e) return;
      if (e.id != null && seen[e.id]) return; // dedup por id
      bridge[sec].push(e);
      if (e.id != null) seen[e.id] = true;
      added++;
    });
  } else if (payload && SECTIONS.some(function (s) { return Array.isArray(payload[s]); })) {
    // Bridge completo → sobrescritura directa (compat con el flujo viejo).
    SECTIONS.forEach(function (s) { if (Array.isArray(payload[s])) bridge[s] = payload[s]; });
    added = -1; // marca "reemplazo completo"
  } else {
    return { ok: false, reason: 'empty-or-bad-payload' };
  }

  _prune(bridge);
  _writeCanonical(bridge);
  var sum = _totals(bridge, day);
  return { ok: true, added: added, today: day, totals: sum.totals, workoutsKcal: sum.workoutsKcal };
}

function _commitFromUpload(uploadId) {
  var file = null;
  if (uploadId && uploadId !== '1') {
    file = DriveApp.getFileById(uploadId);
  } else {
    var folder = _bridgeFolder();
    var it = folder ? folder.getFilesByName(UPLOAD_TITLE) : DriveApp.getFilesByName(UPLOAD_TITLE);
    while (it.hasNext()) { var f = it.next(); if (!file || f.getLastUpdated() > file.getLastUpdated()) file = f; }
  }
  if (!file) return { ok: false, reason: 'no-upload' };
  return _apply(JSON.parse(file.getBlob().getDataAsString()));
}

// LECTURA (la app) + TOTALES + COMMIT por GET (la skill, que solo hace GET).
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.commit) return _json(_commitFromUpload(p.commit));
  if (p.totals) {
    var bR = _readCanonical();
    var snap = bR.snapshots && bR.snapshots[p.totals];
    if (snap) {
      // Número REAL de la app: plan fijo marcado + extras − ejercicio.
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
    // Sin snapshot (la app no se ha abierto hoy): solo extras del chat (parcial).
    var sum = _totals(bR, p.totals);
    return _json({ source: 'bridge', today: p.totals, totals: sum.totals, workoutsKcal: sum.workoutsKcal });
  }
  var data = DriveApp.getFileById(CANONICAL_ID).getBlob().getDataAsString();
  return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
}

// COMMIT por POST (para un runtime que sí pueda postear el JSON directo).
function doPost(e) {
  var content = (e && e.postData) ? e.postData.contents : '';
  if (!content) return _json({ ok: false, reason: 'empty' });
  return _json(_apply(JSON.parse(content)));
}

// Opcional (cinturón y tirantes): si el runtime de la skill NO pudiera disparar el
// commit por GET, instala un disparador por tiempo (cada 1 min) sobre esta función.
function commitPending() { _commitFromUpload(null); }
