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

// — Delta foodsVersion 2: base curada de "los que más usa" de Hugo (planilla jun-2026). Se mergea
//   aparte (como el arsenal) para llegar a instalaciones ya en v1 SIN resucitar lo borrado; además
//   se spreadea dentro de SEED_FOODS para que las instalaciones nuevas lo traigan de fábrica.
//   Distinguidos por nombre de los genéricos previos (p. ej. "Pavo molido cocido" ≠ pechuga magra;
//   garbanzos de lata escurridos ≠ cocidos de grano).
export const FOODS_V2 = [
  { name: 'Pavo pechuga magra cocida', per100: { kcal: 135, protein: 30, carbs: 0, fat: 1, fiber: 0 }, defaultPortionG: 180 },
  { name: 'Garbanzos cocidos escurridos (lata)', per100: { kcal: 122, protein: 6.7, carbs: 20, fat: 2.2, fiber: 6 }, defaultPortionG: 135 },
  { name: 'Charqui (jerky) seco', per100: { kcal: 350, protein: 53, carbs: 10, fat: 10, fiber: 0 }, defaultPortionG: 30, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Edamame seco Skukli', per100: { kcal: 384, protein: 42, carbs: 20, fat: 15, fiber: 24.7 }, defaultPortionG: 20, tags: ['portable', 'sin-refrigeración'] },
  { name: 'ISO 100 Dymatize (polvo)', per100: { kcal: 333, protein: 76, carbs: 6, fat: 1.5, fiber: 0 }, defaultPortionG: 33, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Frambuesa', per100: { kcal: 53, protein: 1.2, carbs: 12, fat: 0.7, fiber: 6.5 }, defaultPortionG: 75 },
  { name: 'Kiwi', per100: { kcal: 56, protein: 1.1, carbs: 14, fat: 0.5, fiber: 3 }, defaultPortionG: 75, tags: ['portable'] },
];

// — Biblioteca de alimentos integrales (state.foods, Fase C). Macros POR 100 g de fuente dura
//   (USDA / tabla de composición chilena); pesos cocidos donde aplica (carnes, cereales, legumbres
//   = porción que Hugo realmente sirve). Cierra el punto débil de la IA en comida casera/integral:
//   en vez de adivinar el plato, se elige el alimento y se escala por gramos. defaultPortionG = la
//   porción típica. Respeta restricciones: sin nueces. El merge foodsVersion los carga una sola vez
//   sin resucitar lo que Hugo borre (ver migrateState). Cada item: { name, per100, defaultPortionG, tags? }.
export const SEED_FOODS = [
  // Proteínas animales (cocidas / porción comestible)
  { name: 'Pechuga de pollo cocida', per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, defaultPortionG: 150 },
  { name: 'Muslo de pollo cocido', per100: { kcal: 209, protein: 26, carbs: 0, fat: 11, fiber: 0 }, defaultPortionG: 150 },
  { name: 'Posta / filete vacuno magro cocido', per100: { kcal: 217, protein: 30, carbs: 0, fat: 10, fiber: 0 }, defaultPortionG: 130 },
  { name: 'Carne molida 5% grasa cocida', per100: { kcal: 164, protein: 26, carbs: 0, fat: 6, fiber: 0 }, defaultPortionG: 130 },
  { name: 'Lomo de cerdo cocido', per100: { kcal: 175, protein: 28, carbs: 0, fat: 6, fiber: 0 }, defaultPortionG: 130 },
  { name: 'Pavo molido cocido', per100: { kcal: 203, protein: 27, carbs: 0, fat: 10, fiber: 0 }, defaultPortionG: 140 },
  { name: 'Salmón cocido', per100: { kcal: 208, protein: 22, carbs: 0, fat: 13, fiber: 0 }, defaultPortionG: 150 },
  { name: 'Merluza cocida', per100: { kcal: 90, protein: 18, carbs: 0, fat: 1.5, fiber: 0 }, defaultPortionG: 180 },
  { name: 'Reineta cocida', per100: { kcal: 110, protein: 23, carbs: 0, fat: 2, fiber: 0 }, defaultPortionG: 180 },
  { name: 'Atún en agua escurrido', per100: { kcal: 116, protein: 26, carbs: 0, fat: 1, fiber: 0 }, defaultPortionG: 120, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Huevo entero', per100: { kcal: 143, protein: 13, carbs: 1.1, fat: 9.5, fiber: 0 }, defaultPortionG: 100 },
  { name: 'Clara de huevo', per100: { kcal: 52, protein: 11, carbs: 0.7, fat: 0.2, fiber: 0 }, defaultPortionG: 120 },
  // Lácteos
  { name: 'Yogur griego natural 0%', per100: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0 }, defaultPortionG: 170 },
  { name: 'Yogur natural', per100: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0 }, defaultPortionG: 125 },
  { name: 'Quesillo (queso fresco)', per100: { kcal: 98, protein: 11, carbs: 3, fat: 4, fiber: 0 }, defaultPortionG: 80 },
  { name: 'Leche descremada', per100: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1, fiber: 0 }, defaultPortionG: 200 },
  { name: 'Queso gauda', per100: { kcal: 356, protein: 25, carbs: 2, fat: 27, fiber: 0 }, defaultPortionG: 30 },
  // Cereales y panes (cocidos / tal como se sirven)
  { name: 'Arroz blanco cocido', per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 }, defaultPortionG: 150 },
  { name: 'Arroz integral cocido', per100: { kcal: 123, protein: 2.7, carbs: 25.6, fat: 1, fiber: 1.6 }, defaultPortionG: 150 },
  { name: 'Quinoa cocida', per100: { kcal: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8 }, defaultPortionG: 150 },
  { name: 'Avena en hojuelas (cruda)', per100: { kcal: 389, protein: 17, carbs: 66, fat: 7, fiber: 10 }, defaultPortionG: 60 },
  { name: 'Fideos cocidos', per100: { kcal: 158, protein: 6, carbs: 31, fat: 0.9, fiber: 1.8 }, defaultPortionG: 180 },
  { name: 'Pan integral', per100: { kcal: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7 }, defaultPortionG: 60 },
  { name: 'Pan blanco (marraqueta / hallulla)', per100: { kcal: 270, protein: 9, carbs: 53, fat: 1.5, fiber: 2.5 }, defaultPortionG: 100 },
  { name: 'Papa cocida', per100: { kcal: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8 }, defaultPortionG: 200 },
  { name: 'Camote cocido', per100: { kcal: 90, protein: 2, carbs: 21, fat: 0.1, fiber: 3.3 }, defaultPortionG: 150 },
  // Legumbres (cocidas)
  { name: 'Lentejas cocidas', per100: { kcal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9 }, defaultPortionG: 200 },
  { name: 'Garbanzos cocidos', per100: { kcal: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 }, defaultPortionG: 180 },
  { name: 'Porotos cocidos', per100: { kcal: 127, protein: 8.7, carbs: 23, fat: 0.5, fiber: 6.4 }, defaultPortionG: 200 },
  { name: 'Choclo', per100: { kcal: 96, protein: 3.4, carbs: 21, fat: 1.5, fiber: 2.4 }, defaultPortionG: 150 },
  // Grasas y semillas
  { name: 'Palta', per100: { kcal: 160, protein: 2, carbs: 9, fat: 15, fiber: 7 }, defaultPortionG: 50 },
  { name: 'Aceite de oliva', per100: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 }, defaultPortionG: 10 },
  { name: 'Almendras', per100: { kcal: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5 }, defaultPortionG: 30, tags: ['portable', 'sin-refrigeración'] },
  { name: 'Mantequilla de maní', per100: { kcal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6 }, defaultPortionG: 20 },
  { name: 'Chía', per100: { kcal: 486, protein: 17, carbs: 42, fat: 31, fiber: 34 }, defaultPortionG: 15 },
  // Verduras
  { name: 'Brócoli', per100: { kcal: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6 }, defaultPortionG: 150 },
  { name: 'Tomate', per100: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 }, defaultPortionG: 120 },
  { name: 'Lechuga', per100: { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3 }, defaultPortionG: 80 },
  { name: 'Zanahoria', per100: { kcal: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8 }, defaultPortionG: 80 },
  { name: 'Zapallo italiano', per100: { kcal: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1 }, defaultPortionG: 150 },
  { name: 'Espinaca', per100: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 }, defaultPortionG: 80 },
  { name: 'Champiñón', per100: { kcal: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1 }, defaultPortionG: 100 },
  // Frutas
  { name: 'Manzana', per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 }, defaultPortionG: 180, tags: ['portable'] },
  { name: 'Plátano', per100: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 }, defaultPortionG: 120, tags: ['portable'] },
  { name: 'Naranja', per100: { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4 }, defaultPortionG: 150, tags: ['portable'] },
  { name: 'Frutilla', per100: { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2 }, defaultPortionG: 150 },
  { name: 'Arándano', per100: { kcal: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4 }, defaultPortionG: 100 },
  { name: 'Pera', per100: { kcal: 57, protein: 0.4, carbs: 15, fat: 0.1, fiber: 3.1 }, defaultPortionG: 180, tags: ['portable'] },
  { name: 'Uva', per100: { kcal: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9 }, defaultPortionG: 120 },
  // Base curada de Hugo (planilla jun-2026); ver FOODS_V2.
  ...FOODS_V2,
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
    foods: SEED_FOODS.map((f) => ({
      ...f, id: uuid(), key: normalizeName(f.name), source: 'seed', builtin: true, usageCount: 0, lastUsedAt: null,
    })),
    routine: null,
    exercise_videos: {},
    arsenalVersion: 3,
    foodsVersion: 2,
    bridge: { lastSyncAt: null, importedIds: [], pushedIds: [], removedBridgeIds: [] },
    aiCache: { coach: {}, weekly: {}, patterns: null, lastSubstitution: null, health: null },
  };
}
