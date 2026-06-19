// Datos semilla del estado inicial (arsenal de Hugo + bancos + reglas) y buildSeed. Sin
// React/JSX. Extraído de app.jsx en la modularización (Etapa 1, sub-etapa 3). Depende solo de
// util.mjs (uuid/normalizeName). buildSeed arma el estado de un usuario nuevo; migrateState
// (storage, futuro) reusa estos arrays para mergear el arsenal en instalaciones existentes.
import { uuid, normalizeName } from './util.mjs';

// — Arsenal de Hugo (arsenalVersion 2). Se define aparte para poder mergearlo en
//   instalaciones existentes SIN resucitar builtins viejos que el usuario haya borrado
//   (la migración v2 mergea solo este delta, no el SEED completo). Además se spreadea
//   dentro de los SEED_* de abajo para que las instalaciones nuevas lo traigan de fábrica.
//   Notas respetadas: el yogur griego va SIEMPRE mezclado (no se agrega "solo"); los
//   bastones de zanahoria, la chía suelta y la creatina no son "tomas" → no entran al banco.
export const ARSENAL_V2_SNACKS = [
  { name: 'ISO 100 whey (1 scoop)', kcal: 110, protein: 25, carbs: 2, fat: 1, fiber: 0, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Colún Protein (botella)', kcal: 160, protein: 18, carbs: 18, fat: 2, fiber: 0, tags: ['portable'] },
  { name: 'Yogurt protein Colún', kcal: 100, protein: 11, carbs: 12, fat: 1, fiber: 0, tags: ['portable'] },
  { name: 'Yogur griego 0% 200g + frambuesa + whey + chía', kcal: 250, protein: 35, carbs: 20, fat: 5, fiber: 6, tags: ['portable'] },
  { name: 'Charqui 40g', kcal: 130, protein: 25, carbs: 2, fat: 3, fiber: 0, category: 'salado', tags: ['portable', 'sin-refrigeración'] },
  { name: 'Loncoleche Protein', kcal: 160, protein: 15, carbs: 20, fat: 3, fiber: 0, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Edamame seco Skukli 40g', kcal: 154, protein: 17, carbs: 13, fat: 6, fiber: 10, category: 'salado', tags: ['portable', 'sin-refrigeración'] },
  { name: 'Quest Bar', kcal: 200, protein: 21, carbs: 22, fat: 8, fiber: 14, tags: ['portable', 'sin-refrigeración'] },
];

export const ARSENAL_V2_PROTEINS = [
  { name: 'Atún en lata en agua (2 latas)', kcal: 240, protein: 52, carbs: 0, fat: 2, fiber: 0 },
];

export const ARSENAL_V2_DESSERTS = [
  { name: 'Jalea protein', kcal: 60, protein: 10, carbs: 4, fat: 0, fiber: 0 },
  { name: 'Brownie proteico casero (1 porción)', kcal: 118, protein: 11, carbs: 8, fat: 5, fiber: 1 },
  { name: 'Pera', kcal: 90, protein: 1, carbs: 24, fat: 0, fiber: 5 },
  { name: 'Plátano', kcal: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 },
  { name: 'Uvas (1 taza)', kcal: 100, protein: 1, carbs: 27, fat: 0, fiber: 1 },
  { name: 'Frambuesa congelada (1 taza)', kcal: 65, protein: 2, carbs: 15, fat: 1, fiber: 8 },
];

export const SEED_SNACKS = [
  { name: '2 huevos duros', kcal: 180, protein: 13, carbs: 1, fat: 12, fiber: 0, category: 'salado', tags: ['portable'] },
  { name: '2 huevos duros + 1 yogurt Colun', kcal: 270, protein: 24, carbs: 10, fat: 14, fiber: 0, category: 'salado', tags: ['portable'] },
  { name: 'Atún en lata + 4 galletas de arroz', kcal: 280, protein: 25, carbs: 30, fat: 6, fiber: 1, category: 'salado', tags: ['portable', 'sin-refrigeración'] },
  { name: '100g pavo en láminas + 1 fruta', kcal: 230, protein: 22, carbs: 22, fat: 4, fiber: 3, category: 'salado', tags: ['portable'] },
  { name: 'Quesillo 100g + galletas de arroz', kcal: 190, protein: 14, carbs: 20, fat: 6, fiber: 1, category: 'salado', tags: ['portable'] },
  { name: 'Yogurt Colun Protein + Not Squares', kcal: 276, protein: 17, carbs: 28, fat: 9, fiber: 3, category: 'dulce', tags: ['portable'] },
  { name: '1 lata atún solo', kcal: 120, protein: 26, carbs: 0, fat: 1, fiber: 0, category: 'salado', tags: ['portable', 'sin-refrigeración'] },
  // — Arsenal desayunos/colaciones (alimentan desayuno + colaciones) —
  { name: 'Avena 60g + scoop proteína', kcal: 350, protein: 32, carbs: 42, fat: 6, fiber: 6, category: 'dulce' },
  { name: 'Pan integral 2 reb + palta + huevo', kcal: 300, protein: 14, carbs: 26, fat: 16, fiber: 6, category: 'salado', tags: ['portable'] },
  { name: 'Yogur griego natural 170g + chía + berries', kcal: 200, protein: 19, carbs: 18, fat: 6, fiber: 8, category: 'dulce', tags: ['portable'] },
  { name: '4 claras revueltas + champiñón', kcal: 95, protein: 15, carbs: 2, fat: 2, fiber: 2, category: 'salado' },
  { name: 'Requesón 150g + fruta', kcal: 185, protein: 20, carbs: 18, fat: 4, fiber: 3, category: 'salado', tags: ['portable'] },
  { name: 'Batido proteína + leche descremada + plátano', kcal: 280, protein: 32, carbs: 30, fat: 4, fiber: 3, category: 'dulce', tags: ['portable'] },
  ...ARSENAL_V2_SNACKS,
];

// Mapa nombre→tags derivado de los literales: única fuente de verdad para retro-rellenar las
// etiquetas (portable / sin-refrigeración) en snacks builtin ya guardados que nacieron sin
// tags (el merge solo agrega items nuevos, no actualiza los existentes). Ver migración v3.
export const SNACK_TAGS = Object.fromEntries(
  SEED_SNACKS.filter((s) => Array.isArray(s.tags) && s.tags.length).map((s) => [normalizeName(s.name), s.tags])
);

export const SEED_PROTEINS = [
  { name: 'Salmón 150g', kcal: 280, protein: 35, carbs: 0, fat: 16, fiber: 0 },
  { name: 'Pollo 150g', kcal: 250, protein: 38, carbs: 0, fat: 10, fiber: 0 },
  { name: 'Filete vacuno 120g', kcal: 240, protein: 32, carbs: 0, fat: 12, fiber: 0 },
  { name: 'Libre (sábado)', kcal: 450, protein: 25, carbs: 40, fat: 22, fiber: 3 },
  ...ARSENAL_V2_PROTEINS,
];

export const SEED_DESSERTS = [
  { name: 'Fruta (1 unidad)', kcal: 80, protein: 1, carbs: 20, fat: 0, fiber: 3 },
  { name: 'Yogurt Colun light 125g', kcal: 70, protein: 6, carbs: 9, fat: 1, fiber: 0 },
  { name: 'Helado bajo cal 1 bola', kcal: 90, protein: 3, carbs: 14, fat: 2, fiber: 0 },
  { name: 'Chocolate amargo 70% (20g)', kcal: 120, protein: 1, carbs: 9, fat: 8, fiber: 2 },
  { name: 'Gelatina light', kcal: 10, protein: 1, carbs: 0, fat: 0, fiber: 0 },
  { name: 'Manzana con cáscara', kcal: 80, protein: 0, carbs: 21, fat: 0, fiber: 4 },
  ...ARSENAL_V2_DESSERTS,
];

// Platos completos (proteína + guarnición + verdura) para almuerzo/cena: evitan que la
// toma quede "pelada". Se cargan al recipeBank. totals = macros del plato armado.
export const SEED_RECIPES = [
  { name: 'Pollo 150g + arroz integral + ensalada', occasion: 'almuerzo', totals: { kcal: 505, protein: 43, carbs: 48, fat: 12, fiber: 7 } },
  { name: 'Salmón 150g + quinoa + brócoli',          occasion: 'cena',     totals: { kcal: 550, protein: 43, carbs: 40, fat: 22, fiber: 10 } },
  { name: 'Posta 120g + puré de coliflor + verduras', occasion: 'almuerzo', totals: { kcal: 330, protein: 36, carbs: 18, fat: 13, fiber: 8 } },
  { name: 'Merluza 180g al horno + papas + ensalada', occasion: 'cena',    totals: { kcal: 320, protein: 37, carbs: 30, fat: 6, fiber: 6 } },
  { name: 'Lentejas guisadas + carne molida magra',  occasion: 'almuerzo', totals: { kcal: 380, protein: 36, carbs: 42, fat: 9, fiber: 15 } },
  { name: 'Pavo molido 140g + zapallo italiano + arroz', occasion: 'cena', totals: { kcal: 420, protein: 36, carbs: 45, fat: 8, fiber: 5 } },
];

export const SEED_RULES = [
  {
    id: 'rule-kcap-2000',
    name: 'Sin extras pasando 2.000 kcal',
    enabled: true,
    type: 'kcal_cap_extras',
    config: { kcalCap: 2000 },
  },
  {
    id: 'rule-dulces-3',
    name: 'Máximo 3 dulces por semana',
    enabled: true,
    type: 'count_per_week',
    config: { category: 'dulce', max: 3 },
  },
  {
    id: 'rule-delivery-1',
    name: 'Máximo 1 delivery por semana',
    enabled: true,
    type: 'count_per_week',
    config: { category: 'delivery', max: 1 },
  },
];

export function buildSeed() {
  return {
    version: 3,
    theme: null,
    userProfile: null,
    snackBank: SEED_SNACKS.map((s) => ({ ...s, id: uuid(), builtin: true })),
    proteinBank: SEED_PROTEINS.map((p) => ({ ...p, id: uuid(), builtin: true })),
    dessertBank: SEED_DESSERTS.map((d) => ({ ...d, id: uuid(), builtin: true })),
    rules: SEED_RULES.map((r) => ({ ...r })),
    days: {},
    settings: {
      anthropicApiKey: null,
      saveImages: false,
      bridgeUrl: null,
      bridgeToken: null,
      notifications: { enabled: false, colacion1: '11:00', almuerzo: '13:30', colacion2: '18:00', agua: '16:00', cena: '20:30' },
    },
    weights: [],
    recipeBank: SEED_RECIPES.map((r) => ({ ...r, id: uuid(), builtin: true, createdAt: null })),
    favorites: [],
    routine: null,
    exercise_videos: {},
    arsenalVersion: 3,
    bridge: { lastSyncAt: null, importedIds: [], pushedIds: [], removedBridgeIds: [] },
    aiCache: { coach: {}, weekly: {}, patterns: null, lastSubstitution: null, health: null },
  };
}
