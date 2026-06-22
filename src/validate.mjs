// Validación/normalización de la frontera del bridge. Función PURA, sin React ni HTTP.
// Razón de ser: la app no tiene tipado, así que un item del bridge con un campo mal nombrado
// (`calories` en vez de `kcal`, `kg` en vez de `weightKg`) o con basura (`kcal: "abc"`) entraba
// a mergeBridge y se coaccionaba a 0 EN SILENCIO. Acá se remapean los alias conocidos (con
// warning para arreglar la fuente) y se descartan los items irrecuperables, contándolos para
// que la UI muestre un ⚠️. Idempotente: no muta la entrada.
import { MEAL_NUMERIC_FIELDS, FIELD_ALIASES } from './fields.mjs';

// Valor presente pero ausente "de verdad" (null / '' / undefined) → tratamos como no provisto.
function isAbsent(v) { return v == null || v === ''; }

// Aplica los alias conocidos: si el item trae el nombre equivocado y NO el canónico, copia el
// valor al canónico y registra un warning. Devuelve una copia (no muta el original).
function applyAliases(item, label, warnings) {
  const out = { ...item };
  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    if (Object.prototype.hasOwnProperty.call(out, alias) && isAbsent(out[canonical]) && !isAbsent(out[alias])) {
      out[canonical] = out[alias];
      warnings.push(`${label}: campo '${alias}' remapeado a '${canonical}' (corrige la fuente: usa '${canonical}')`);
    }
  }
  return out;
}

// Coacciona los campos numéricos esperados. Un campo PRESENTE pero no numérico (`"abc"`) es un
// error: se reporta. Devuelve { item, badFields } con los campos inválidos detectados.
function coerceNumeric(item, fields, label, warnings) {
  const out = { ...item };
  const badFields = [];
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(out, f) || isAbsent(out[f])) continue; // ausente: ok, lo maneja el merge
    const n = Number(out[f]);
    if (!Number.isFinite(n)) { badFields.push(f); warnings.push(`${label}: campo '${f}' inválido (${JSON.stringify(out[f])}) — ignorado`); delete out[f]; }
    else out[f] = n;
  }
  return { item: out, badFields };
}

const isLocatable = (it) => (typeof it.date === 'string' && it.date) || it.ts != null;

// Normaliza un payload del bridge. Recibe lo que devuelve fetchBridge (o un fixture de test).
// Devuelve { payload, dropped, warnings } — payload conserva los singletons (energy/routine/
// exercise_videos) intactos para que mergeBridge siga funcionando.
export function normalizeBridgePayload(bridge) {
  const b = bridge || {};
  const warnings = [];
  const dropped = { meals: 0, weights: 0, workouts: 0, water: 0, health: 0, checks: 0, lifts: 0 };

  const meals = (Array.isArray(b.meals) ? b.meals : []).flatMap((raw, i) => {
    if (raw == null) { dropped.meals++; return []; }
    const label = `meal ${raw.id ?? `#${i}`}`;
    let m = applyAliases(raw, label, warnings);
    if (isAbsent(m.id)) { warnings.push(`${label}: sin id — descartado`); dropped.meals++; return []; }
    if (!isLocatable(m)) { warnings.push(`${label}: sin date ni ts ubicable — descartado`); dropped.meals++; return []; }
    const { item, badFields } = coerceNumeric(m, MEAL_NUMERIC_FIELDS, label, warnings);
    // kcal es el campo cabecera: si vino presente pero inválido, la comida no es confiable → descartar
    // (en vez de contarla como 0 kcal mudo, el bug que esta capa existe para matar).
    if (badFields.includes('kcal')) { dropped.meals++; return []; }
    return [item];
  });

  const weights = (Array.isArray(b.weights) ? b.weights : []).flatMap((raw, i) => {
    if (raw == null) { dropped.weights++; return []; }
    const label = `weight ${raw.id ?? `#${i}`}`;
    const m = applyAliases(raw, label, warnings);
    if (isAbsent(m.id)) { warnings.push(`${label}: sin id — descartado`); dropped.weights++; return []; }
    const { item, badFields } = coerceNumeric(m, ['weightKg'], label, warnings);
    if (badFields.includes('weightKg')) { dropped.weights++; return []; } // peso ilegible = sin medición real
    return [item];
  });

  const workouts = (Array.isArray(b.workouts) ? b.workouts : []).flatMap((raw, i) => {
    if (raw == null) { dropped.workouts++; return []; }
    const label = `workout ${raw.id ?? `#${i}`}`;
    if (isAbsent(raw.id)) { warnings.push(`${label}: sin id — descartado`); dropped.workouts++; return []; }
    if (!isLocatable(raw)) { warnings.push(`${label}: sin date ni ts — descartado`); dropped.workouts++; return []; }
    return [{ ...raw }];
  });

  const water = (Array.isArray(b.water) ? b.water : []).flatMap((raw, i) => {
    if (raw == null) { dropped.water++; return []; }
    const label = `water ${raw.id ?? `#${i}`}`;
    if (isAbsent(raw.id)) { warnings.push(`${label}: sin id — descartado`); dropped.water++; return []; }
    return [{ ...raw }];
  });

  const health = (Array.isArray(b.health) ? b.health : []).flatMap((raw, i) => {
    if (raw == null) { dropped.health++; return []; }
    // Health no tiene id (overwrite por fecha). Solo necesita fecha ubicable; healthDateKey en
    // sync.mjs ya tolera dd-MM-yy y deriva del ts, así que acá basta con date o ts presentes.
    if (!isLocatable(raw)) { dropped.health++; return []; }
    return [{ ...raw }];
  });

  const checks = (Array.isArray(b.checks) ? b.checks : []).flatMap((raw, i) => {
    if (raw == null) { dropped.checks++; return []; }
    if (isAbsent(raw.id)) { dropped.checks++; return []; }
    return [{ ...raw }];
  });

  // lifts (serie de fuerza): como workouts, exige id + fecha/ts ubicable; el detalle de la serie
  // (weightKg/reps/rpe) lo normaliza el merge. Sin id no se puede deduplicar/borrar; sin fecha no
  // se puede ubicar en un día.
  const lifts = (Array.isArray(b.lifts) ? b.lifts : []).flatMap((raw, i) => {
    if (raw == null) { dropped.lifts++; return []; }
    const label = `lift ${raw.id ?? `#${i}`}`;
    if (isAbsent(raw.id)) { warnings.push(`${label}: sin id — descartado`); dropped.lifts++; return []; }
    if (!isLocatable(raw)) { warnings.push(`${label}: sin date ni ts — descartado`); dropped.lifts++; return []; }
    return [{ ...raw }];
  });

  const payload = { ...b, meals, weights, workouts, water, health, checks, lifts };
  return { payload, dropped, warnings };
}

// True si el payload tuvo algún descarte (para que la UI decida mostrar el ⚠️).
export function hasDrops(dropped) {
  return !!dropped && Object.values(dropped).some((n) => n > 0);
}
