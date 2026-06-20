// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: drumstick-bite;
//
// ─────────────────────────────────────────────────────────────────────────────
//  Plan Hugo · Widget de macros del día (iPhone + Mac)
//
//  Lee el bridge (Apps Script) de "Plan Hugo" y muestra los macros de HOY:
//  Proteína, Carbos, Grasa y Fibra (v/meta + barra), más calorías y agua.
//
//  Solo lectura. No toca la app ni el bridge. Consume el endpoint que ya existe:
//      GET <BRIDGE_URL>?totals=YYYY-MM-DD
//
//  INSTALACIÓN: ver scriptable/README.md. Resumen: pega tu BRIDGE_URL abajo,
//  guarda el script en Scriptable como "Plan Hugo Macros" y añádelo a la
//  pantalla de inicio (tamaño Mediano recomendado).
// ─────────────────────────────────────────────────────────────────────────────

// ── CONFIG ───────────────────────────────────────────────────────────────────
// Pega aquí el bridge URL (el mismo de la app → Ajustes → bridge URL; es el
// /exec del Apps Script). Token desactivado, así que NO necesitas &k=.
const BRIDGE_URL = "PEGA_AQUÍ_TU_BRIDGE_URL";

// Si algún día reactivas el token del bridge, ponlo aquí (si no, déjalo en "").
const BRIDGE_TOKEN = "";

// Metas por defecto (solo se usan si el bridge no devuelve `targets`).
const DEFAULT_TARGETS = {
  kcalMax: 2300, proteinMin: 200, carbsTarget: 178,
  fatTarget: 59, fiberTarget: 30, waterTarget: 3150,
};

// Paleta (replica la card "Macros" de la portada — tokens bento).
const COLORS = {
  bg:     new Color("#1C1C1E"),
  text:   new Color("#FFFFFF"),
  dim:    new Color("#FFFFFF", 0.5),
  track:  new Color("#FFFFFF", 0.12),
  warm:   new Color("#E8915B"), // proteína / grasa
  yellow: new Color("#E8C45B"), // carbos
  lilac:  new Color("#9B8FD6"), // fibra
  water:  new Color("#5BB8E8"), // agua
  ok:     new Color("#7BC67B"), // meta cumplida
};

// ── Fecha local YYYY-MM-DD (zona del dispositivo, para que "hoy" = el de la app) ─
function localDayKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Cache local (último JSON OK) para sobrevivir sin conexión ──────────────────
function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), "plan-hugo-macros-cache.json");
}
function saveCache(obj) {
  try { FileManager.local().writeString(cachePath(), JSON.stringify(obj)); } catch (e) {}
}
function loadCache() {
  try {
    const fm = FileManager.local();
    const p = cachePath();
    if (fm.fileExists(p)) return JSON.parse(fm.readString(p));
  } catch (e) {}
  return null;
}

// ── Fetch de los totales del día ───────────────────────────────────────────────
async function fetchTotals(day) {
  let url = `${BRIDGE_URL}?totals=${day}&t=${Date.now()}`;
  if (BRIDGE_TOKEN) url += `&k=${encodeURIComponent(BRIDGE_TOKEN)}`;
  const req = new Request(url);
  req.timeoutInterval = 12;
  const data = await req.loadJSON(); // sigue el 302 de Apps Script automáticamente
  return data;
}

// ── Barra de progreso (DrawContext → imagen nítida) ────────────────────────────
function barImage(pct, color, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = h / 2;

  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, w, h), r, r);
  ctx.addPath(track);
  ctx.setFillColor(COLORS.track);
  ctx.fillPath();

  const clamped = Math.max(0, Math.min(1, pct));
  if (clamped > 0) {
    const fw = Math.max(h, w * clamped); // mínimo un "punto" redondeado
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, fw, h), r, r);
    ctx.addPath(fill);
    ctx.setFillColor(color);
    ctx.fillPath();
  }
  return ctx.getImage();
}

// ── Render del widget ──────────────────────────────────────────────────────────
function buildWidget(data, stale, family) {
  const t  = (data && data.totals)  || {};
  const tg = Object.assign({}, DEFAULT_TARGETS, (data && data.targets) || {});

  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 16, 14, 16);

  const compact = family === "small";
  const barW = compact ? 0 : 150; // ancho de barra (medium/large)

  // Header: título + fecha
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("Macros");
  title.font = Font.semiboldSystemFont(15);
  title.textColor = COLORS.text;
  head.addSpacer();
  const df = new DateFormatter();
  df.locale = "es";
  df.setFormat("EEE d MMM");
  const dateTxt = head.addText(df.string(new Date()));
  dateTxt.font = Font.systemFont(11);
  dateTxt.textColor = COLORS.dim;

  w.addSpacer(compact ? 6 : 8);

  // Línea kcal + agua
  const sub = w.addStack();
  sub.centerAlignContent();
  // kcalIn = consumidas (brutas, como la app); cae a kcal si no viniera.
  const kcalEaten = (t.kcalIn != null) ? t.kcalIn : (t.kcal || 0);
  const kcal = sub.addText(`${Math.round(kcalEaten)} / ${Math.round(tg.kcalMax)} kcal`);
  kcal.font = Font.mediumSystemFont(13);
  kcal.textColor = COLORS.text;
  sub.addSpacer();
  const waterL = ((t.waterMl || 0) / 1000).toFixed(1);
  const waterTgtL = (tg.waterTarget / 1000).toFixed(1);
  const water = sub.addText(`💧 ${waterL} / ${waterTgtL} L`);
  water.font = Font.systemFont(12);
  water.textColor = COLORS.dim;

  w.addSpacer(compact ? 8 : 10);

  // Filas de macros
  const rows = [
    { label: "Proteína", v: t.protein, t: tg.proteinMin,   color: COLORS.warm   },
    { label: "Carbos",   v: t.carbs,   t: tg.carbsTarget,  color: COLORS.yellow },
    { label: "Grasa",    v: t.fat,     t: tg.fatTarget,    color: COLORS.warm   },
    { label: "Fibra",    v: t.fiber,   t: tg.fiberTarget,  color: COLORS.lilac  },
  ];

  rows.forEach((r, i) => {
    const v = Math.round(r.v || 0);
    const tgt = Math.round(r.t || 0);
    const pct = tgt > 0 ? v / tgt : 0;
    const done = pct >= 1;

    const row = w.addStack();
    row.centerAlignContent();

    const label = row.addText(r.label);
    label.font = Font.systemFont(13);
    label.textColor = COLORS.text;

    row.addSpacer();

    const val = row.addText(`${v}/${tgt} g`);
    val.font = Font.mediumSystemFont(13);
    val.textColor = done ? COLORS.ok : COLORS.text;

    if (barW > 0) {
      row.addSpacer(10);
      const img = row.addImage(barImage(pct, done ? COLORS.ok : r.color, barW, 8));
      img.imageSize = new Size(barW, 8);
    }

    if (i < rows.length - 1) w.addSpacer(compact ? 5 : 7);
  });

  // Pie discreto si el dato es del cache (sin conexión)
  if (stale) {
    w.addSpacer(6);
    const foot = w.addText("⚠︎ sin conexión · último dato");
    foot.font = Font.systemFont(9);
    foot.textColor = COLORS.dim;
  }

  // Sugerencia de refresco (iOS decide el momento real)
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 16, 14, 16);
  const t1 = w.addText("Plan Hugo · Macros");
  t1.font = Font.semiboldSystemFont(14);
  t1.textColor = COLORS.text;
  w.addSpacer(8);
  const t2 = w.addText(msg);
  t2.font = Font.systemFont(12);
  t2.textColor = COLORS.dim;
  return w;
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  const family = config.widgetFamily || "medium";

  if (!BRIDGE_URL || BRIDGE_URL.startsWith("PEGA_AQUÍ")) {
    return errorWidget("Falta configurar BRIDGE_URL al inicio del script.");
  }

  const day = localDayKey(new Date());
  let data = null, stale = false;
  try {
    data = await fetchTotals(day);
    if (data && data.totals) saveCache({ day, data });
  } catch (e) {
    const cached = loadCache();
    if (cached && cached.day === day && cached.data) {
      data = cached.data;
      stale = true;
    } else {
      return errorWidget("No se pudo leer el bridge.\nRevisa BRIDGE_URL y la conexión.");
    }
  }
  return buildWidget(data, stale, family);
}

const widget = await main();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
