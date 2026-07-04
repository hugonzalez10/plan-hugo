// Menú semanal de Hugo (docx "Menu_Semanal_Hugo", jun-2026) como datos versionados en
// código + helpers puros para la card "Menú del día" de la portada Hoy. NO es estado
// editable: si el menú cambia, cambia este archivo y se publica (patrón SEED_FOODS).
// Los nombres de variante son la firma de dedup contra el eco del bridge (chatMealSig):
// una vez publicados deben quedar estables — cambiarlos rompe la absorción del eco.
import { extraPlanSlot } from './meals.mjs';

export const MENU_VERSION = 1;

// Macros de referencia del docx. El almuerzo es un rango (575-590); se fija la fila de la
// tabla de cierre (590) para que la proyección reproduzca el cierre documentado (1.822 kcal).
export const WEEKLY_MENU = {
  version: MENU_VERSION,
  appliesTo: 'weekdays', // menú único L–V
  tomas: [
    {
      id: 'desayuno', slot: 'desayuno', time: '06:00', timeEnd: null,
      label: 'Desayuno', emoji: '🥣', condition: null, isSupplement: false,
      note: 'Chía (+ avena) remojando en el griego overnight; frambuesa congelada al armar.',
      variants: [
        {
          id: 'base', isDefault: true,
          name: 'Yogur griego 0% + whey + frambuesas + chía + avena',
          items: ['Yogur griego 0% 150 g', 'Whey 30 g', 'Frambuesas 75 g', 'Chía 10 g', 'Avena 15 g'],
          macros: { kcal: 357, protein: 47, carbs: 30, fat: 8.5, fiber: 9 },
          tags: [],
        },
      ],
    },
    {
      id: 'colacion1', slot: 'colacion1', time: '11:00', timeEnd: null,
      label: 'Colación AM', emoji: '🥜', condition: null, isSupplement: false,
      note: 'Portátil, sin refrigeración. No agregar huevo acá (va en la colación de las 18:00).',
      variants: [
        {
          id: 'base', isDefault: true,
          name: 'Charqui + jalea Colún + edamame seco',
          items: ['Charqui 30 g', 'Jalea Colún 1 unid', 'Edamame seco 20 g'],
          macros: { kcal: 190, protein: 36, carbs: 7, fat: 5, fiber: 5 },
          tags: ['ruta'],
        },
        {
          id: 'sin-jalea',
          name: 'Charqui + edamame seco',
          items: ['Charqui 35 g', 'Edamame seco 25 g'],
          macros: { kcal: 185, protein: 40, carbs: 5, fat: 5, fiber: 5 },
          tags: ['ruta'],
        },
      ],
    },
    {
      id: 'psyllium', slot: null, time: '13:10', timeEnd: null,
      label: 'Psyllium pre-almuerzo', emoji: '💧', condition: null, isSupplement: true,
      note: '15–20 min antes de comer. Shaker seco: mezclar y beber al momento. Siempre 200 ml de agua detrás o constipa. Separar ≥1–2 h de D3/K2 y omega-3.',
      variants: [
        {
          id: 'base', isDefault: true,
          name: 'Psyllium 10 g + agua',
          items: ['Cáscara de psyllium 10 g en 300 ml agua', '200 ml de agua detrás'],
          macros: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 8 },
          tags: [],
        },
      ],
    },
    {
      id: 'almuerzo', slot: 'almuerzo', time: '13:30', timeEnd: '14:00',
      label: 'Almuerzo', emoji: '🍗', condition: null, isSupplement: false,
      note: 'Proteína intercambiable (molida 4% / pavo / pollo). Quinoa preferente sobre camote; evitar papa (IG alto).',
      variants: [
        {
          id: 'base', isDefault: true,
          name: 'Proteína magra + quinoa/camote + fruta + baby carrots',
          items: ['Proteína magra 170–180 g cocida', 'Quinoa o camote 150 g cocido', 'Fruta ~150 g (pera/manzana)', 'Baby carrots'],
          macros: { kcal: 590, protein: 59, carbs: 59, fat: 9, fiber: 10 },
          tags: ['ruta'],
        },
      ],
    },
    {
      id: 'colacion2', slot: 'colacion2', time: '18:00', timeEnd: '18:30',
      label: 'Colación PM', emoji: '🍫', condition: null, isSupplement: false,
      note: 'Quest válida solo a ≥3 h del almuerzo y de la cena.',
      variants: [
        {
          id: 'ruta', isDefault: true,
          name: 'Quest Bar + Loncoleche FullPro',
          items: ['Quest Bar 60 g', 'Loncoleche FullPro 18 g'],
          macros: { kcal: 330, protein: 39, carbs: 22, fat: 12, fiber: 13 },
          tags: ['ruta'],
        },
        {
          id: 'casa',
          name: 'Quest Bar + yogur pote + huevo duro + baby carrots',
          items: ['Quest Bar 60 g', 'Yogur pote 155 g', 'Huevo duro', 'Baby carrots 90 g'],
          macros: { kcal: 382, protein: 37, carbs: 22, fat: 18, fiber: 15 },
          tags: ['casa'],
        },
      ],
    },
    {
      id: 'cena', slot: 'cena', time: '21:00', timeEnd: '21:30',
      label: 'Cena', emoji: '🍽️', condition: null, isSupplement: false,
      note: 'Base bajo IG, mínima cocción. No adelantar horario aunque llegues 21:30. Todas ≤450 kcal, piso P ≥36 g.',
      variants: [
        {
          id: 'op1', isDefault: true,
          name: 'Legumbres + atún + tomate + huevo duro',
          items: ['Lentejas/garbanzos escurridos 135 g', 'Atún en agua 100 g', 'Tomate 100 g', '1 huevo duro'],
          macros: { kcal: 355, protein: 41, carbs: 30, fat: 11, fiber: 10 },
          tags: [],
        },
        {
          id: 'op3',
          name: 'Pescado blanco + verduras + palta',
          items: ['Reineta/merluza 180 g', 'Zapallo italiano', 'Tomate', '½ palta (30 g)'],
          macros: { kcal: 360, protein: 40, carbs: 12, fat: 16, fiber: 6 },
          tags: [],
        },
        {
          id: 'op4',
          name: 'Yogur griego salado + atún + tomate + pepino',
          items: ['Griego 0% 200 g', 'Atún en agua 100 g', 'Tomate', 'Pepino', 'Orégano'],
          macros: { kcal: 300, protein: 48, carbs: 14, fat: 6, fiber: 4 },
          tags: ['cero-cocción'],
        },
        // Respaldos: el docx solo fija kcal/proteína; C/G/F estimados desde los ingredientes.
        {
          id: 'respaldo-tortilla',
          name: 'Tortilla de claras + garbanzos',
          items: ['Tortilla de claras', 'Garbanzos'],
          macros: { kcal: 320, protein: 38, carbs: 28, fat: 6, fiber: 8 },
          tags: ['respaldo'],
        },
        {
          id: 'respaldo-edamame',
          name: 'Bowl edamame + 2 huevos',
          items: ['Edamame', '2 huevos'],
          macros: { kcal: 360, protein: 36, carbs: 12, fat: 16, fiber: 8 },
          tags: ['respaldo'],
        },
        {
          id: 'respaldo-jurel',
          name: 'Jurel en lata + lentejas',
          items: ['Jurel en lata', 'Lentejas'],
          macros: { kcal: 380, protein: 42, carbs: 30, fat: 9, fiber: 9 },
          tags: ['respaldo'],
        },
      ],
    },
    {
      id: 'presueno', slot: null, time: '22:30', timeEnd: null,
      label: 'Pre-sueño', emoji: '🌙', condition: 'strength-day', isSupplement: false,
      note: 'Solo días de FUERZA (post-strength); en días de Z2/cardio puro no va. Alternativa sin caseína: jalea griega ½ porción (~115 kcal · P 18).',
      variants: [
        {
          id: 'base', isDefault: true,
          name: 'Caseína Dymatize 35 g',
          items: ['Caseína Elite Casein 1 scoop ~35 g', '250 ml agua o leche descremada'],
          macros: { kcal: 120, protein: 25, carbs: 3, fat: 1.5, fiber: 0 },
          tags: [],
        },
      ],
    },
  ],
};

function timeToMins(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// El menú es único de lunes a viernes; sábado/domingo la card no aparece.
export function menuAppliesToDate(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const d = new Date(`${dateKey}T12:00:00`); // mediodía local: inmune a saltos de TZ/DST
  if (isNaN(d)) return false;
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

// ¿Hay entreno de fuerza registrado hoy? Decide si el pre-sueño va o queda atenuado.
export function hasStrengthWorkout(day) {
  return (day?.exercise || []).some((e) => e?.type === 'strength');
}

// Tomas que CUENTAN para el día (para la proyección): filtra las condicionales no cumplidas.
// La UI igual renderiza el pre-sueño atenuado en días sin fuerza — usa WEEKLY_MENU.tomas.
export function menuTomasForDay({ hasStrength } = {}) {
  return WEEKLY_MENU.tomas.filter((t) => !t.condition || (t.condition === 'strength-day' && hasStrength));
}

export function defaultVariant(toma) {
  const vs = toma?.variants || [];
  return vs.find((v) => v.isDefault) || vs[0] || null;
}

// La toma "vigente" a esta hora: la primera cuya ventana (time..timeEnd, +60 min de gracia)
// no pasó todavía; si ya pasaron todas, la última. Ignora suplementos (psyllium no es toma).
export function activeMenuToma(tomas, now = new Date()) {
  const candidates = (tomas || []).filter((t) => !t.isSupplement && t.slot);
  if (!candidates.length) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const t of candidates) {
    const end = timeToMins(t.timeEnd) ?? timeToMins(t.time);
    if (end != null && nowMins < end + 60) return t;
  }
  return candidates[candidates.length - 1];
}

// Registros existentes del día que cubren una toma sin slot (psyllium/pre-sueño): por
// menuTomaId (registrados desde la card) o por nombre (registrados por chat).
const NO_SLOT_NAME_RE = {
  psyllium: /psyllium|psilio/i,
  presueno: /case[ií]na/i,
};

// Estado de una toma del menú cruzando lo YA registrado en el día (chat, foto, quicklog,
// banco o la propia card). Es la protección principal contra el doble conteo chat↔app:
// una toma cubierta no ofrece el botón "Comí esto".
export function tomaCoverage(day, toma) {
  const allExtras = day?.extras || [];
  if (!toma?.slot) {
    const re = NO_SLOT_NAME_RE[toma?.id];
    const extras = allExtras.filter((x) => x?.menuTomaId === toma?.id || (re && re.test(x?.name || '')));
    return { status: extras.length ? 'cubierta' : 'pendiente', extras, viaBank: false };
  }
  const extras = allExtras.filter((x) => extraPlanSlot(x) === toma.slot);
  const e = day?.eaten || {};
  let viaBank = false;
  if (toma.slot === 'colacion1') viaBank = !!(day?.snackId1 && e.colacion1);
  else if (toma.slot === 'colacion2') viaBank = !!(day?.snackId2 && e.colacion2);
  else if (toma.slot === 'cena') viaBank = !!(day?.proteinId && e.cena);
  else viaBank = !!e[toma.slot]; // desayuno/almuerzo: tick legacy del slot fijo
  if (extras.length || viaBank) return { status: 'cubierta', extras, viaBank };
  if ((day?.skipped || []).includes(toma.slot)) return { status: 'omitida', extras, viaBank };
  return { status: 'pendiente', extras, viaBank };
}

// Extra registrable a partir de una variante. mealSlot exacto (colacion1/colacion2 directos,
// soportados por extraPlanSlot y el bridge); psyllium/pre-sueño van al bucket 'extra'.
// menuTomaId es campo local (pushPayload no lo manda al bridge) para reconocer cobertura
// de las tomas sin slot.
export function menuExtraFromVariant(toma, variant, { id, ts }) {
  const m = variant?.macros || {};
  return {
    id, ts,
    name: variant?.name || toma?.label || 'Menú',
    kcal: Number(m.kcal) || 0,
    protein: Number(m.protein) || 0,
    carbs: Number(m.carbs) || 0,
    fat: Number(m.fat) || 0,
    fiber: Number(m.fiber) || 0,
    mealSlot: toma?.slot || 'extra',
    source: 'menu',
    menuTomaId: toma?.id || null,
  };
}

// Proyección de cierre del día según variantes elegidas (default donde no se eligió).
// Excluye suplementos para reproducir la tabla de cierre del docx (el psyllium "no cuenta
// como toma"; su fibra suma al registrarse).
export function projectedMenuTotals(tomas, chosen = {}) {
  const tot = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const t of tomas || []) {
    if (t.isSupplement) continue;
    const v = (t.variants || []).find((x) => x.id === chosen[t.id]) || defaultVariant(t);
    if (!v) continue;
    for (const k of Object.keys(tot)) tot[k] += Number(v.macros?.[k]) || 0;
  }
  return tot;
}

// ≥2 registros contando en la toma y al menos uno vino de la card → probable doble registro
// chat↔app (marcó en la app y después mandó la foto por chat). La UI muestra un aviso; la
// decisión de quitar uno es del humano (podría ser repetición legítima).
export function slotDoubleLogWarning(day, toma) {
  const cov = tomaCoverage(day, toma);
  const count = cov.extras.length + (cov.viaBank ? 1 : 0);
  return count >= 2 && cov.extras.some((x) => x?.source === 'menu');
}
