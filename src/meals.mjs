// Núcleo del modelo de comidas, puro (sin React/JSX): totales del día, inferencia de slot,
// conteo de categorías. Extraído de app.jsx en la modularización (Etapa 1). Es la capa que
// estaba entrelazada con casi todo, por eso se mueve completa de una. Depende solo de
// dates.mjs (getRuleWeekKeys) y nutrition.mjs (DEFAULT_TARGETS). esbuild lo reinjecta en el
// bundle; los tests del dominio (double-count, week-slots, slot-by-time, bridge-merge) lo importan.
import { getRuleWeekKeys } from './dates.mjs';
import { DEFAULT_TARGETS } from './nutrition.mjs';
import { normalizeName } from './util.mjs';

// Desayuno y almuerzo ya no traen ítems predeterminados: Hugo registra la comida real por
// chat (extras con su mealSlot), que se muestra dentro de cada sección. Se conservan como
// slots (para el bucketing, el nudge y el "no comí"), pero sin ítems no suman kcal fantasma.
export const FIXED_MEALS = [
  { id: 'desayuno', label: 'Desayuno', time: '08:00', emoji: '🍳', items: [] },
  { id: 'almuerzo', label: 'Almuerzo', time: '13:30', emoji: '🍚', items: [] },
];

export function mealItemsFor(meal, customAntojoItems) {
  if (meal?.id === 'antojo' && Array.isArray(customAntojoItems) && customAntojoItems.length) {
    return [...(meal.items || []), ...customAntojoItems];
  }
  return meal?.items || [];
}

// Devuelve { [itemId]: bool } para una comida. Si no hay eatenItems aún para ese día/meal,
// hace fallback al booleano legacy day.eaten[mealId] (true → todos tickeados; false → ninguno).
export function getMealItemTicks(day, meal, customAntojoItems) {
  const items = mealItemsFor(meal, customAntojoItems);
  const stored = day?.eatenItems?.[meal.id];
  if (stored && typeof stored === 'object') {
    const out = {};
    for (const it of items) out[it.id] = !!stored[it.id];
    return out;
  }
  const legacyAll = !!(day?.eaten || {})[meal.id];
  const out = {};
  for (const it of items) out[it.id] = legacyAll;
  return out;
}

export function sumField(items, field) {
  return items.reduce((s, x) => s + (Number(x?.[field]) || 0), 0);
}

// Slots del plan diario en orden cronológico. Dos colaciones: colacion1 (mañana, 11:00) y
// colacion2 (tarde, 18:00). El 'colacion' a secas del bridge/skill es un PARAGUAS que se
// resuelve a colacion1/colacion2 por la hora del registro (ver resolveColacion).
export const PLAN_SLOTS = new Set(['desayuno', 'almuerzo', 'colacion1', 'colacion2', 'cena']);

// Prefijos con que la skill nombra un reemplazo de comida del plan ("Desayuno - ...",
// "Colacion 1 - ...", "Cena - ..."). Para registros viejos del chat SIN mealSlot,
// inferimos el slot por ese prefijo. DEBE coincidir con SLOT_NAME_RE_GS de bridge-writer.gs.
export const SLOT_NAME_RE = {
  desayuno: /^desayuno\b/i,
  almuerzo: /^almuerzo\b/i,
  colacion1: /^colaci[oó]n\s*1\b/i,
  colacion2: /^colaci[oó]n\s*2\b/i,
  cena: /^cena\b/i,
};

// Colación 1 (mañana) vs 2 (tarde) según la hora del registro; corte a las 15:00. Sin ts
// usable, default a colación 2 (la tarde concentra más colaciones registradas por chat).
export function resolveColacion(x) {
  if (x?.ts != null) {
    const d = new Date(x.ts);
    if (!isNaN(d)) return (d.getHours() * 60 + d.getMinutes()) < 15 * 60 ? 'colacion1' : 'colacion2';
  }
  return 'colacion2';
}

// Slot del plan según la hora del registro. La colación AM (11:00) cae ANTES del almuerzo;
// lo de muy tarde se pliega a cena. Inferencia de último recurso para comidas del chat sin
// mealSlot; las colaciones explícitas las resuelve resolveColacion/SLOT_NAME_RE.
export function slotByTime(d) {
  if (!d || isNaN(d)) return null;
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins < 10 * 60 + 30) return 'desayuno';
  if (mins < 12 * 60 + 30) return 'colacion1';
  if (mins < 15 * 60 + 30) return 'almuerzo';
  if (mins < 19 * 60 + 30) return 'colacion2';
  return 'cena';
}

// La sección del plan que un extra REEMPLAZA, o null si es un extra genuino (suma aparte).
// Prefiere mealSlot (lo que etiqueta la skill); el 'colacion' paraguas → 1/2 por hora; cae al
// nombre y luego al ts solo para skill-chat. Cuando devuelve un slot, computeDayTotals
// suprime el plan/banco de esa sección.
export function extraPlanSlot(x) {
  const ms = x?.mealSlot;
  if (ms === 'colacion') return resolveColacion(x);   // paraguas de la skill → colacion1/2 por hora
  // 'antojo' ya no es sección (lo de muy tarde se pliega a cena). Registros viejos/skills
  // desincronizadas aún pueden mandarlo: resuélvelo por la hora en vez de mandarlo a Extras.
  if (ms === 'antojo') return (x?.ts != null && slotByTime(new Date(x.ts))) || 'cena';
  if (PLAN_SLOTS.has(ms)) return ms;                  // desayuno/almuerzo/colacion1/colacion2/cena directos
  if (x?.source === 'skill-chat' && x?.name) {
    for (const slot of PLAN_SLOTS) if (SLOT_NAME_RE[slot].test(x.name)) return slot;
    if (/^colaci[oó]n/i.test(x.name)) return resolveColacion(x); // "Colación - ..." sin número
  }
  // Último recurso para comidas viejas del chat sin mealSlot: inferir por la hora del ts.
  if (x?.source === 'skill-chat' && ms == null && x?.ts != null) {
    const s = slotByTime(new Date(x.ts));
    if (s) return s;
  }
  return null;
}

// Cubeta de despliegue de un extra. Las comidas con slot de una sección del plan se muestran
// DENTRO de esa sección con "📝 Registrado"; el resto cae en 'extra' → lista "Extras del día".
export function extraSlotBucket(x) {
  return extraPlanSlot(x) || 'extra';
}

// ¿Un item de un slot dado cuenta como 'dulce'?
export function isItemDulce(item, slot) {
  if (!item) return false;
  // Postres del dessertBank: siempre cuentan como dulce
  if (slot === 'dessert') return true;
  // Snacks con category='dulce'
  if (slot === 'snack' && item.category === 'dulce') return true;
  // Extras con tag 'dulce'
  if (slot === 'extra' && Array.isArray(item.tags) && item.tags.includes('dulce')) return true;
  return false;
}

// Cuenta items en la semana de refDate que matcheen una categoría
export function countCategoryInWeek(state, category, refDate = new Date()) {
  const weekKeys = getRuleWeekKeys(refDate);
  const days = state?.days || {};
  const snackBank = state?.snackBank || [];
  const dessertBank = state?.dessertBank || [];
  let count = 0;

  for (const k of weekKeys) {
    const day = days[k];
    if (!day) continue;
    const e = day.eaten || {};

    if (category === 'dulce') {
      // Colaciones dulces (ambas tomas)
      for (const [idKey, eatKey] of [['snackId1', 'colacion1'], ['snackId2', 'colacion2']]) {
        if (day[idKey] && e[eatKey]) {
          const snack = snackBank.find((s) => s.id === day[idKey]);
          if (isItemDulce(snack, 'snack')) count++;
        }
      }
      // Postres almuerzo + cena (todos los postres cuentan)
      if (day.dessertAlmuerzoId && e.dessertAlmuerzo) count++;
      if (day.dessertCenaId && e.dessertCena) count++;
      // Extras con tag dulce
      for (const x of (day.extras || [])) {
        if (isItemDulce(x, 'extra')) count++;
      }
    } else {
      // delivery / alcohol: extras con tag
      for (const x of (day.extras || [])) {
        if (Array.isArray(x.tags) && x.tags.includes(category)) count++;
      }
    }
  }

  return count;
}

export function computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojoItems) {
  const T = targets || DEFAULT_TARGETS;
  const dBank = dessertBank || [];
  const customAntojo = customAntojoItems || [];
  const e = day?.eaten || {};
  const extras = day?.extras || [];

  // Secciones del plan que YA tienen un registro real del chat (skill-chat). Cuando
  // existe, ese extra ES la comida de la sección, así que se suprime el plan/banco de
  // esa sección para no doble-contar: un check de "desayuno" del bridge + el yogur
  // registrado por chat sumaban el desayuno fijo fantasma (325 kcal / 24 g P). El log del
  // chat manda sobre el plan sugerido. Ver extraPlanSlot y el handler de checks en mergeBridge.
  const loggedSlots = new Set();
  for (const x of extras) { const s = extraPlanSlot(x); if (s) loggedSlots.add(s); }

  const eatenFixedItems = [];
  for (const meal of FIXED_MEALS) {
    if (loggedSlots.has(meal.id)) continue;
    const items = mealItemsFor(meal, customAntojo);
    const ticks = getMealItemTicks(day, meal, customAntojo);
    for (const item of items) {
      if (ticks[item.id]) eatenFixedItems.push(item);
    }
  }

  const snack1 = day?.snackId1 ? snackBank.find((s) => s.id === day.snackId1) : null;
  const snack2 = day?.snackId2 ? snackBank.find((s) => s.id === day.snackId2) : null;
  const dinner = day?.proteinId ? proteinBank.find((p) => p.id === day.proteinId) : null;
  const dessertA = day?.dessertAlmuerzoId ? dBank.find((d) => d.id === day.dessertAlmuerzoId) : null;
  const dessertC = day?.dessertCenaId ? dBank.find((d) => d.id === day.dessertCenaId) : null;
  const snack1Eaten = snack1 && e.colacion1 && !loggedSlots.has('colacion1') ? [snack1] : [];
  const snack2Eaten = snack2 && e.colacion2 && !loggedSlots.has('colacion2') ? [snack2] : [];
  const dinnerEaten = dinner && e.cena && !loggedSlots.has('cena') ? [dinner] : [];
  const dessertAEaten = dessertA && e.dessertAlmuerzo ? [dessertA] : [];
  const dessertCEaten = dessertC && e.dessertCena ? [dessertC] : [];

  // Comidas del chat (extras) que caen en cada colación / cena, por mealSlot, nombre u hora
  // (ver extraPlanSlot). La vista semanal antes solo miraba el banco (snack/dinner) y por eso
  // ignoraba las colaciones/cenas registradas por chat; estos campos hacen que la semana, los
  // días completos, los colores y el promedio las cuenten.
  const colacion1Extras = extras.filter((x) => extraPlanSlot(x) === 'colacion1');
  const colacion2Extras = extras.filter((x) => extraPlanSlot(x) === 'colacion2');
  const cenaExtras = extras.filter((x) => extraPlanSlot(x) === 'cena');
  const hasSnack1 = !!snack1 || colacion1Extras.length > 0;
  const hasSnack2 = !!snack2 || colacion2Extras.length > 0;
  const hasDinner = !!dinner || cenaExtras.length > 0;
  const snack1Label = snack1 ? snack1.name : (colacion1Extras.length ? colacion1Extras.map((x) => x.name).join(' + ') : null);
  const snack2Label = snack2 ? snack2.name : (colacion2Extras.length ? colacion2Extras.map((x) => x.name).join(' + ') : null);
  const snackLabel = [snack1Label, snack2Label].filter(Boolean).join(' · ') || null;
  const dinnerLabel = dinner ? dinner.name : (cenaExtras.length ? cenaExtras.map((x) => x.name).join(' + ') : null);

  const exercise = day?.exercise || [];
  // Porción del PLAN (fijos + banco): lo que NO se empuja a meals[] del bridge. Los extras
  // y el ejercicio sí van a meals[]/workouts[], así que el snapshot debe llevar solo esto
  // para que el bridge sume sin solape (partición aditiva, no Math.max). Ver snapPayload.
  const planEaten = [...eatenFixedItems, ...snack1Eaten, ...snack2Eaten, ...dinnerEaten, ...dessertAEaten, ...dessertCEaten];
  const allEaten = [...planEaten, ...extras];

  const kcalIn = sumField(allEaten, 'kcal');
  const protein = sumField(allEaten, 'protein');
  const carbs = sumField(allEaten, 'carbs');
  const fat = sumField(allEaten, 'fat');
  const fiber = sumField(allEaten, 'fiber');
  const kcalBurned = sumField(exercise, 'kcal');
  const kcalNet = kcalIn - kcalBurned;
  // Agua total para MOSTRAR = la que Hugo marca en la app (water.ml) + la registrada por
  // chat e importada del bridge (water.bridgeMl). El snapshot empuja SOLO water.ml (ver
  // snapPayload) para que el bridge no doble-cuente el water[] del servidor en ?totals.
  const waterMl = (Number(day?.water?.ml) || 0) + (Number(day?.water?.bridgeMl) || 0);

  // Plan-only (sin extras ni ejercicio): la porción autoritativa del snapshot.
  const planIn = sumField(planEaten, 'kcal');
  const planProtein = sumField(planEaten, 'protein');
  const planCarbs = sumField(planEaten, 'carbs');
  const planFat = sumField(planEaten, 'fat');
  const planFiber = sumField(planEaten, 'fiber');

  return {
    // `kcal` es la cifra que toda la app muestra y compara contra la meta: BRUTO (lo comido),
    // NO neto. El TDEE adaptativo ya incorpora la actividad (se calibra desde kcalIn vs peso),
    // así que restar el ejercicio aquí lo contaría dos veces e inflaría el déficit. El ejercicio
    // (kcalBurned) se muestra aparte como dato informativo. kcalNet queda disponible por compat.
    kcal: kcalIn, kcalIn, kcalBurned, kcalNet,
    planIn, planProtein, planCarbs, planFat, planFiber,
    kcalRemaining: T.kcalMax - kcalIn,
    protein, proteinRemaining: T.proteinMin - protein,
    carbs, carbsRemaining: T.carbsTarget - carbs,
    fat, fatRemaining: T.fatTarget - fat,
    fiber, fiberRemaining: T.fiberTarget - fiber,
    waterMl, waterRemaining: T.waterTarget - waterMl,
    hasSnack1, hasSnack2, snack1Label, snack2Label, hasDinner, snackLabel, dinnerLabel,
    // compat: agregado de ambas colaciones para consumidores que aún miran "snack" (semana, racha)
    hasSnack: hasSnack1 || hasSnack2,
    hasDessertA: !!dessertA, hasDessertC: !!dessertC,
    eatenAny: !!(eatenFixedItems.length || e.colacion1 || e.colacion2 || e.cena || e.dessertAlmuerzo || e.dessertCena || extras.length || exercise.length || (Array.isArray(day?.skipped) && day.skipped.length)),
    snack1, snack2, dinner, dessertA, dessertC, extras, exercise,
  };
}

// Devuelve kcal-in (no neto) del día desde sus eaten + extras
export function currentDayKcalIn(state, dateKey, targets) {
  const day = state?.days?.[dateKey] || {};
  const t = computeDayTotals(day, state?.snackBank || [], state?.proteinBank || [], targets, state?.dessertBank || [], state?.antojoCustomItems || []);
  return t.kcalIn;
}

// Firma de contenido de una comida: slot|nombre|kcal. El servidor del bridge asigna el id y
// dedup por contenido, así que el mismo plato desde la app y desde el chat trae ids distintos
// que un dedup por id no cacharía. Esta firma colapsa esos duplicados dentro de la ventana.
export function chatMealSig(slot, name, kcal) {
  return `${slot || 'extra'}|${normalizeName(name)}|${Math.round(Number(kcal) || 0)}`;
}

// Ventana de dedup por contenido (debe coincidir con WINDOW_MS del Apps Script). Dos entradas
// con la misma firma se consideran la MISMA si caen dentro de la ventana; más allá, repeticiones
// legítimas (p.ej. dos cafés en el día). Si a alguna le falta ts (datos legacy) se cae al match
// por mismo día (conservador: colapsa, como antes).
export const DEDUP_WINDOW_MS = 5 * 60 * 1000;
export function sameWindow(tsA, tsB) {
  if (tsA == null || tsB == null) return true;
  return Math.abs(Number(tsA) - Number(tsB)) <= DEDUP_WINDOW_MS;
}

// Colapsa extras duplicados dentro de un mismo día. Por id, y por contenido+ventana SOLO para
// comidas del chat (source 'skill-chat'): el chat puede re-registrar el mismo plato. Los extras
// de la app se dedupean solo por id, para no subcontar repeticiones legítimas que el usuario
// ingresó a mano.
export function dedupeDayExtras(extras) {
  const seen = new Set();
  const sigSeen = [];
  const out = [];
  for (const x of extras) {
    if (x && x.id != null) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
    }
    if (x && x.source === 'skill-chat') {
      const sig = chatMealSig(x.mealSlot, x.name, x.kcal);
      if (sigSeen.some((s) => s.sig === sig && sameWindow(s.ts, x.ts))) continue;
      sigSeen.push({ sig, ts: x.ts });
    }
    out.push(x);
  }
  return out;
}
