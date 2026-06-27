// Biblioteca de alimentos reusables (state.foods). A diferencia de los bancos (snack/protein/
// dessert), que son TEMPLATES del plan, y de los extras (registros puntuales e inmutables en
// day.extras[]), un Food guarda macros POR 100g y se ESCALA por gramos al registrar, produciendo
// un MealItem normal. Es la capa que faltaba: el concepto de "alimento" separado del "registro".
//
// Tres fuentes pueblan el mismo store: el usuario (manual/promoted), la semilla curada
// (SEED_FOODS, source:'seed') y OpenFoodFacts por nombre/código (source:'off'). Lógica pura, sin
// React: solo depende de util.mjs. Se testea como el resto de src/*.mjs.
//
// @typedef {Object} Food
// @property {string} id
// @property {string} name
// @property {string} key                    normalizeName(name) — para dedup/lookup
// @property {{kcal,protein,carbs,fat,fiber}} per100   fuente de verdad (por 100 g)
// @property {number} defaultPortionG         porción sugerida (g)
// @property {string} [barcode]
// @property {string} [brand]
// @property {string[]} [tags]
// @property {('manual'|'off'|'promoted'|'seed')} source
// @property {boolean} [builtin]
// @property {number} [usageCount]
// @property {(number|null)} [lastUsedAt]
import { uuid, normalizeName } from './util.mjs';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Macros escalados al registrar: kcal/proteína/carbos/grasa enteros, fibra 1 decimal (mismo
// redondeo que usa searchOpenFoodFacts en app.jsx, para que un alimento OFF y su versión por
// gramos cuadren).
function roundScaled(m) {
  return {
    kcal: Math.round(num(m.kcal)),
    protein: Math.round(num(m.protein)),
    carbs: Math.round(num(m.carbs)),
    fat: Math.round(num(m.fat)),
    fiber: Number(num(m.fiber).toFixed(1)),
  };
}

// per100 limpio (sin forzar enteros: el redondeo se aplica recién al escalar, no a la fuente).
function cleanPer100(p) {
  const o = p || {};
  return { kcal: num(o.kcal), protein: num(o.protein), carbs: num(o.carbs), fat: num(o.fat), fiber: num(o.fiber) };
}

// "Yogur griego (170g)" → "Yogur griego". Quita un sufijo de porción "(123g)" al final, que
// foodToMealItem agrega al nombre del registro (así promover un extra no acumula porciones).
export function stripPortionSuffix(name) {
  return String(name || '').replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*g\s*\)\s*$/i, '').trim();
}

// "150g", "150 g", "1.5g" → 150 / 1.5. Devuelve null si no hay gramos parseables.
export function parseGrams(str) {
  if (str == null) return null;
  const m = String(str).match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!m) return null;
  const g = Number(m[1].replace(',', '.'));
  return Number.isFinite(g) && g > 0 ? g : null;
}

// Normaliza/completa un Food (asigna id + key, coacciona campos). Idempotente: conserva id si ya
// viene. La marca builtin/source/usageCount se preservan.
export function makeFood(food) {
  const name = String(food?.name || '').trim();
  const f = {
    id: food?.id || uuid(),
    name,
    key: normalizeName(name),
    per100: cleanPer100(food?.per100),
    defaultPortionG: num(food?.defaultPortionG) > 0 ? num(food.defaultPortionG) : 100,
    source: food?.source || 'manual',
    usageCount: num(food?.usageCount),
    lastUsedAt: food?.lastUsedAt ?? null,
  };
  if (food?.barcode) f.barcode = String(food.barcode);
  if (food?.brand) f.brand = String(food.brand);
  if (Array.isArray(food?.tags) && food.tags.length) f.tags = food.tags.slice();
  if (food?.builtin) f.builtin = true;
  return f;
}

// Escala un alimento a `grams` gramos → macros redondeados listos para sumar al día.
export function scaleFoodToPortion(food, grams) {
  const per100 = cleanPer100(food?.per100);
  const g = num(grams) > 0 ? num(grams) : (num(food?.defaultPortionG) > 0 ? num(food.defaultPortionG) : 100);
  const factor = g / 100;
  return roundScaled({
    kcal: per100.kcal * factor,
    protein: per100.protein * factor,
    carbs: per100.carbs * factor,
    fat: per100.fat * factor,
    fiber: per100.fiber * factor,
  });
}

// Food + gramos → MealItem (shape de day.extras[]) SIN id/ts: el caller los estampa frescos en
// cada registro (igual que quickLogExtra), nunca reusar. Guarda per100/portion/foodId para poder
// re-escalar o re-promover después.
export function foodToMealItem(food, grams, mealSlot) {
  const g = num(grams) > 0 ? num(grams) : (num(food?.defaultPortionG) > 0 ? num(food.defaultPortionG) : 100);
  const macros = scaleFoodToPortion(food, g);
  const portion = `${g}g`;
  const base = stripPortionSuffix(food?.name) || food?.name || 'Alimento';
  const item = {
    name: `${base} (${portion})`,
    ...macros,
    source: 'food',
    portion,
    per100: cleanPer100(food?.per100),
  };
  if (mealSlot) item.mealSlot = mealSlot;
  if (food?.id) item.foodId = food.id;
  if (food?.barcode) item.barcode = food.barcode;
  if (Array.isArray(food?.tags) && food.tags.length) item.tags = food.tags.slice();
  return item;
}

// Promueve un registro existente (extra/reciente/favorito/resultado OFF) a Food reusable.
// Deriva per100 en orden de confianza:
//   1. per100 ya guardado (raw de OFF con claves *Per100, o ya limpio {kcal,...})
//   2. macros del item ÷ (gramos de la porción / 100)
//   3. fallback: trata los macros como una porción de 100 g (el usuario puede corregir)
export function mealItemToFood(extra) {
  if (!extra) return null;
  const name = stripPortionSuffix(extra.name) || String(extra.name || '').trim() || 'Alimento';
  const raw = extra.per100;
  let per100 = null;
  let defaultPortionG = 100;

  if (raw && raw.kcalPer100 != null) {
    per100 = { kcal: num(raw.kcalPer100), protein: num(raw.protPer100), carbs: num(raw.carbsPer100), fat: num(raw.fatPer100), fiber: num(raw.fiberPer100) };
    if (num(raw.servingG) > 0) defaultPortionG = num(raw.servingG);
  } else if (raw && raw.kcal != null) {
    per100 = cleanPer100(raw);
  }

  if (!per100) {
    const grams = parseGrams(extra.portion) || parseGrams(extra.name);
    if (grams) {
      const f = 100 / grams;
      per100 = { kcal: num(extra.kcal) * f, protein: num(extra.protein) * f, carbs: num(extra.carbs) * f, fat: num(extra.fat) * f, fiber: num(extra.fiber) * f };
      defaultPortionG = grams;
    } else {
      per100 = cleanPer100(extra);
      defaultPortionG = 100;
    }
  }

  return makeFood({
    name,
    per100,
    defaultPortionG,
    barcode: extra.barcode || undefined,
    tags: Array.isArray(extra.tags) && extra.tags.length ? extra.tags : undefined,
    source: 'promoted',
  });
}

// Resultado de searchOpenFoodFacts (con .raw por 100g) → Food. Devuelve null si no hay datos.
export function foodFromOFF(off) {
  if (!off) return null;
  const raw = off.raw || {};
  return makeFood({
    name: off.name,
    per100: { kcal: num(raw.kcalPer100), protein: num(raw.protPer100), carbs: num(raw.carbsPer100), fat: num(raw.fatPer100), fiber: num(raw.fiberPer100) },
    defaultPortionG: num(raw.servingG) > 0 ? num(raw.servingG) : 100,
    barcode: off.barcode || undefined,
    brand: off.brand || undefined,
    source: 'off',
  });
}

// Inserta o actualiza un alimento, dedup por barcode (si ambos lo tienen) o por key normalizado.
// Conserva el id y el usageCount del existente al actualizar. Devuelve un array NUEVO (inmutable).
export function upsertFood(foods, food) {
  const list = Array.isArray(foods) ? foods.slice() : [];
  const f = makeFood(food);
  const idx = list.findIndex((x) => (f.barcode && x.barcode && x.barcode === f.barcode) || x.key === f.key);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...f, id: list[idx].id, usageCount: num(list[idx].usageCount), builtin: list[idx].builtin || f.builtin };
  } else {
    list.push(f);
  }
  return list;
}

// Bump de uso (lo más usado/reciente sube en el buscador). ts opcional para tests deterministas.
export function markFoodUsed(foods, id, ts) {
  const list = Array.isArray(foods) ? foods : [];
  return list.map((f) => (f.id === id ? { ...f, usageCount: num(f.usageCount) + 1, lastUsedAt: ts ?? f.lastUsedAt ?? null } : f));
}

// Ranking sin query: más usados primero, luego alfabético.
function byDefault(a, b) {
  const u = num(b.usageCount) - num(a.usageCount);
  if (u !== 0) return u;
  return (a.key || '').localeCompare(b.key || '');
}

// Búsqueda por nombre (exacto > prefijo > substring > todos los tokens). Empata desempate con
// usageCount. Sin query devuelve la lista ordenada por uso. Limita a `limit`.
export function searchFoods(foods, query, limit = 20) {
  const list = Array.isArray(foods) ? foods : [];
  const q = normalizeName(query || '');
  if (!q) return list.slice().sort(byDefault).slice(0, limit);
  const toks = q.split(' ').filter(Boolean);
  const scored = [];
  for (const f of list) {
    const name = f.key || normalizeName(f.name);
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 30;
    else if (toks.length > 1 && toks.every((t) => name.includes(t))) score = 20;
    if (score > 0) scored.push({ f, score: score + Math.min(10, num(f.usageCount)) });
  }
  scored.sort((a, b) => b.score - a.score || byDefault(a.f, b.f));
  return scored.slice(0, limit).map((s) => s.f);
}
