// Definiciones de campos de composición corporal y entrenamiento (metadatos: key/label/unit/
// color, opciones, etiquetas). Datos puros, sin deps. Extraído de app.jsx en la modularización.
// Los comparten la UI de Peso/Salud y mergeBridge (round-trip de los campos por el bridge).

// Campos escalares de un entrenamiento que deben sobrevivir el round-trip por el bridge
// (igual que WEIGHT_FIELDS para composición). Los arrays `exercises`/`hrSeries` y el objeto
// `hrZones` se tratan aparte (no escalares). rpe/trainingLoad/calsPerHour los aporta HeartWatch.
// `maxHr` (FC pico) y `hrZonePct` (string "86/12/1/0/0" = %Z1..Z5) son escalares; ojo:
// `hrZonePct` es STRING (mergeBridge no lo castea a número, ver el round-trip), distinto del
// objeto `hrZones` (minutos por zona de HeartWatch). `mets` (float, intensidad relativa
// kcal/kg/h) lo deriva el import de Takeout y enriquece la sesión existente por w=update.
export const WORKOUT_EXTRA_FIELDS = ['type', 'activity', 'minutes', 'volumeKg', 'distanceM', 'avgPowerW', 'avgCadenceRpm', 'avgHr', 'maxHr', 'rpe', 'hrZonePct', 'trainingLoad', 'calsPerHour', 'mets'];

// — Shape canónico de una comida (MealItem) que viaja por el bridge. Única fuente de verdad
//   para el normalizador (validate.mjs): estos son los campos numéricos esperados.
export const MEAL_NUMERIC_FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

// Nombres equivocados conocidos → campo canónico. Cuando un item del bridge trae el alias y
// NO trae el canónico, el normalizador remapea el valor y emite un warning (para corregir la
// fuente: la skill o el .gs). Evita que `calories`/`fats`/`kg` se pierdan en silencio. La
// causa raíz es que no hay tipado en la frontera; este mapa es la red de seguridad.
export const FIELD_ALIASES = {
  calories: 'kcal',
  cal: 'kcal',
  fats: 'fat',
  grasa: 'fat',
  kg: 'weightKg',
  weight: 'weightKg',
  pesoKg: 'weightKg',
};

// — Tipos conceptuales (JSDoc). No se chequean en build (no hay TS), pero dan autocompletado
//   y aviso en el editor: escribir `m.calories` se marca como propiedad inexistente. Derivados
//   de los shapes verificados contra el código (handoff V4).
/**
 * @typedef {Object} MealItem
 * @property {string} id
 * @property {number} ts          Date.now() del registro
 * @property {string} name
 * @property {number} kcal        ⚠️ es `kcal`, NUNCA `calories`
 * @property {number} protein     gramos
 * @property {number} carbs
 * @property {number} fat          ⚠️ es `fat`, NUNCA `fats`
 * @property {number} fiber
 * @property {('desayuno'|'colacion1'|'almuerzo'|'colacion2'|'cena'|'extra')} mealSlot
 * @property {('photo'|'text'|'manual'|'haiku-estimate'|'barcode'|'substitution'|'skill-chat')} source
 * @property {string} [barcode]
 * @property {string} [date]      "YYYY-MM-DD"; si falta, se deriva del ts
 */
/**
 * @typedef {Object} WeightEntry
 * @property {string} date        "YYYY-MM-DD"
 * @property {(number|null)} weightKg   ⚠️ es `weightKg`, NUNCA `kg` ni `weight`
 * @property {number} [bodyFatPct]
 * @property {number} [muscleKg]
 * @property {number} [score]
 */
/**
 * @typedef {Object} WorkoutItem  En day.exercise[] — ⚠️ NUNCA "workouts" ni "training"
 * @property {string} id
 * @property {number} ts
 * @property {string} name
 * @property {number} [kcal]
 * @property {number} [minutes]
 * @property {string} [type]
 * @property {Array<Object>} [exercises]
 */
/**
 * @typedef {Object} HealthDay  Solo contexto: NUNCA toca kcal
 * @property {number} [steps]
 * @property {number} [restingHr]
 * @property {number} [vo2max]
 */
/**
 * @typedef {Object} Day
 * @property {string} date
 * @property {MealItem[]} meals
 * @property {MealItem[]} extras   ⚠️ lo registrado por IA/foto/chat cae acá, NO en meals
 * @property {WorkoutItem[]} exercise
 * @property {Object<string,boolean>} [eaten]
 * @property {{ml:number, log?:Array, bridgeMl?:number}} [water]
 * @property {HealthDay} [health]
 */
/**
 * @typedef {Object} BridgePayload  Lo que devuelve fetchBridge / consume mergeBridge
 * @property {MealItem[]} meals
 * @property {WeightEntry[]} weights
 * @property {WorkoutItem[]} workouts
 * @property {Array<Object>} checks
 * @property {Array<{id:string, ml:number, ts?:number, date?:string, source?:string, deviceId?:string}>} water
 * @property {HealthDay[]} health
 */

// Métricas diarias de salud (Apple Health vía Shortcut + recuperación de HeartWatch vía importador
// CSV). Una fila por día en day.health. SOLO CONTEXTO: nunca restan de las kcal (el TDEE adaptativo
// ya captura el gasto). Mantener key/orden en sync con HEALTH_MERGE_FIELDS del bridge .gs y con el
// loop de mergeBridge. `source` marca de dónde viene cada métrica (Health o HeartWatch).
//   goodUp: si subir es bueno (para flechas de tendencia). hr=frecuencia cardíaca (bajar es mejor).
export const HEALTH_FIELDS = [
  { key: 'steps',            label: 'Pasos',           unit: '',    icon: '👟', goodUp: true,  source: 'health' },
  { key: 'activeEnergyKcal', label: 'Energía activa',  unit: 'kcal',icon: '🔥', goodUp: true,  source: 'health' },
  { key: 'sleepHours',       label: 'Sueño',           unit: 'h',   icon: '😴', goodUp: true,  source: 'health' },
  { key: 'restingHr',        label: 'FC reposo',       unit: 'lpm', icon: '❤️', goodUp: false, source: 'health' },
  { key: 'vo2max',           label: 'VO₂máx',          unit: '',    icon: '🫁', goodUp: true,  source: 'health' },
  { key: 'hrvSleep',         label: 'HRV (sueño)',     unit: 'ms',  icon: '🫀', goodUp: true,  source: 'heartwatch' },
  { key: 'hrvWake',          label: 'HRV (vigilia)',   unit: 'ms',  icon: '🫀', goodUp: true,  source: 'heartwatch' },
  { key: 'sleepingHr',       label: 'FC durmiendo',    unit: 'lpm', icon: '🌙', goodUp: false, source: 'heartwatch' },
  { key: 'sedentaryHr',      label: 'FC sedentaria',   unit: 'lpm', icon: '🪑', goodUp: false, source: 'heartwatch' },
  { key: 'spo2Daily',        label: 'SpO₂',            unit: '%',   icon: '🩸', goodUp: true,  source: 'heartwatch' },
  { key: 'spo2Sleep',        label: 'SpO₂ durmiendo',  unit: '%',   icon: '🩸', goodUp: true,  source: 'heartwatch' },
  { key: 'recovery2min',     label: 'Recuperación 2′', unit: 'lpm', icon: '📉', goodUp: true,  source: 'heartwatch' },
];

// Solo las claves numéricas que se round-trippean por el bridge (sin healthTs, que es metadato).
export const HEALTH_MERGE_FIELDS = HEALTH_FIELDS.map((f) => f.key);

// Cota fisiológica del sueño diario. >14h no es real: es el doble conteo del Shortcut de
// Apple Health (muestras "In Bed" + etapas "Asleep" solapadas, o iPhone+Watch sumados),
// misma clase de bug que pasos (~1.8×) y energía activa (1.68×).
export const MAX_PLAUSIBLE_SLEEP_H = 14;

// Sanea un valor de sueño en horas: devuelve el número si es plausible, o null si es basura
// (no numérico, ≤0, o >MAX_PLAUSIBLE_SLEEP_H → muestra corrupta que se descarta). Punto único
// de la regla, reusado por el merge del bridge, la migración de storage y el import HeartWatch.
export function sanitizeSleepHours(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PLAUSIBLE_SLEEP_H) return null;
  return n;
}

export const WEIGHT_FIELDS = [
  // Principales
  { key: 'weightKg',           label: 'Peso',              unit: 'kg',   step: '0.1', cat: 'main' },
  { key: 'bodyFatPct',         label: '% grasa corporal',  unit: '%',    step: '0.1', cat: 'main' },
  { key: 'score',              label: 'Puntuación general',unit: '',     step: '1',   cat: 'main' },
  // Masa (kg)
  { key: 'fatKg',              label: 'Grasa',             unit: 'kg',   step: '0.1', cat: 'mass' },
  { key: 'muscleKg',           label: 'Masa muscular',     unit: 'kg',   step: '0.1', cat: 'mass' },
  { key: 'skeletalMuscleKg',   label: 'Músculo esquelético',unit: 'kg',  step: '0.1', cat: 'mass' },
  { key: 'fatFreeMassKg',      label: 'Masa libre de grasa',unit: 'kg',  step: '0.1', cat: 'mass' },
  { key: 'subcutaneousFatKg',  label: 'Grasa subcutánea',  unit: 'kg',   step: '0.1', cat: 'mass' },
  { key: 'waterKg',            label: 'Agua corporal',     unit: 'kg',   step: '0.1', cat: 'mass' },
  { key: 'proteinKg',          label: 'Masa proteica',     unit: 'kg',   step: '0.1', cat: 'mass' },
  { key: 'boneKg',             label: 'Masa ósea',         unit: 'kg',   step: '0.1', cat: 'mass' },
  // Porcentajes
  { key: 'musclePct',          label: '% músculo',         unit: '%',    step: '0.1', cat: 'pct' },
  { key: 'waterPct',           label: '% agua',            unit: '%',    step: '0.1', cat: 'pct' },
  { key: 'proteinPct',         label: '% proteína',        unit: '%',    step: '0.1', cat: 'pct' },
  // Índices
  { key: 'bmi',                label: 'BMI / IMC',         unit: '',     step: '0.1', cat: 'idx' },
  { key: 'ffmi',               label: 'FFMI',              unit: '',     step: '0.1', cat: 'idx' },
  { key: 'metabolicAge',       label: 'Edad metabólica',   unit: 'años', step: '1',   cat: 'idx' },
  { key: 'visceralFat',        label: 'Grasa visceral',    unit: '',     step: '0.1', cat: 'idx' },
  { key: 'basalMetabolismKcal',label: 'Metabolismo basal', unit: 'kcal', step: '1',   cat: 'idx' },
  { key: 'waistHipRatio',      label: 'Relación cintura-cadera', unit: '', step: '0.01', cat: 'idx' },
  { key: 'referenceWeightKg',  label: 'Peso de referencia',unit: 'kg',   step: '0.1', cat: 'idx' },
  // Estática
  { key: 'heightCm',           label: 'Altura',            unit: 'cm',   step: '0.1', cat: 'static' },
  // Circunferencias
  { key: 'neckCm',             label: 'Cuello',            unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'chestCm',            label: 'Pecho',             unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'waistCm',            label: 'Cintura',           unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'hipCm',              label: 'Cadera',            unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'bicepCm',            label: 'Bíceps',            unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'armCm',              label: 'Brazo superior',    unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'forearmCm',          label: 'Antebrazo',         unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'thighCm',            label: 'Muslo',             unit: 'cm',   step: '0.1', cat: 'circ' },
  { key: 'calfCm',             label: 'Pantorrilla',       unit: 'cm',   step: '0.1', cat: 'circ' },
];

// Campos string (no numéricos): tipo de cuerpo + análisis segmental categórico
export const BODY_TYPE_OPTIONS = ['Bajo peso', 'Normal', 'Sobrepeso', 'Obesidad'];
export const SEGMENT_OPTIONS = ['Bajo', 'Bien', 'Alto', 'Muy alto'];
export const SEGMENT_FIELDS = [
  // Grasa segmental
  { key: 'fatSegUpperL', label: 'Brazo sup. izq.', group: 'fat' },
  { key: 'fatSegUpperR', label: 'Brazo sup. der.', group: 'fat' },
  { key: 'fatSegTorso',  label: 'Torso',           group: 'fat' },
  { key: 'fatSegLowerL', label: 'Pierna inf. izq.',group: 'fat' },
  { key: 'fatSegLowerR', label: 'Pierna inf. der.',group: 'fat' },
  // Músculo segmental
  { key: 'muscleSegUpperL', label: 'Brazo sup. izq.', group: 'muscle' },
  { key: 'muscleSegUpperR', label: 'Brazo sup. der.', group: 'muscle' },
  { key: 'muscleSegTorso',  label: 'Torso',           group: 'muscle' },
  { key: 'muscleSegLowerL', label: 'Pierna inf. izq.',group: 'muscle' },
  { key: 'muscleSegLowerR', label: 'Pierna inf. der.',group: 'muscle' },
];
export const STRING_FIELDS = [
  { key: 'bodyType', label: 'Tipo de cuerpo', options: BODY_TYPE_OPTIONS, cat: 'idx' },
];

export const WEIGHT_CAT_LABELS = {
  main: 'Composición', mass: 'Masa (kg)', pct: 'Porcentajes', idx: 'Índices', static: 'Estática', circ: 'Circunferencias',
};

export const CHART_METRICS = [
  { key: 'weightKg',           label: 'Peso',           unit: 'kg', color: '#10b981' },
  { key: 'bodyFatPct',         label: '% Grasa',        unit: '%',  color: '#f43f5e' },
  { key: 'fatKg',              label: 'Grasa',          unit: 'kg', color: '#ef4444' },
  { key: 'muscleKg',           label: 'Músculo',        unit: 'kg', color: '#3b82f6' },
  { key: 'skeletalMuscleKg',   label: 'M. esquelético', unit: 'kg', color: '#06b6d4' },
  { key: 'fatFreeMassKg',      label: 'Masa libre',     unit: 'kg', color: '#22c55e' },
  { key: 'subcutaneousFatKg',  label: 'G. subcutánea',  unit: 'kg', color: '#fb923c' },
  { key: 'waterKg',            label: 'Agua',           unit: 'kg', color: '#0ea5e9' },
  { key: 'proteinKg',          label: 'Proteína',       unit: 'kg', color: '#84cc16' },
  { key: 'boneKg',             label: 'Hueso',          unit: 'kg', color: '#a3a3a3' },
  { key: 'waistCm',            label: 'Cintura',        unit: 'cm', color: '#8b5cf6' },
  { key: 'hipCm',              label: 'Cadera',         unit: 'cm', color: '#c084fc' },
  { key: 'chestCm',            label: 'Pecho',          unit: 'cm', color: '#e879f9' },
  { key: 'neckCm',             label: 'Cuello',         unit: 'cm', color: '#f472b6' },
  { key: 'bicepCm',            label: 'Bíceps',         unit: 'cm', color: '#ec4899' },
  { key: 'thighCm',            label: 'Muslo',          unit: 'cm', color: '#d946ef' },
  { key: 'bmi',                label: 'IMC',            unit: '',   color: '#a855f7' },
  { key: 'ffmi',               label: 'FFMI',           unit: '',   color: '#7c3aed' },
  { key: 'visceralFat',        label: 'G. visceral',    unit: '',   color: '#dc2626' },
  { key: 'waistHipRatio',      label: 'Cintura/Cadera', unit: '',   color: '#9333ea' },
  { key: 'basalMetabolismKcal',label: 'TMB',            unit: 'kcal', color: '#f59e0b' },
  { key: 'score',              label: 'Score',          unit: '',   color: '#eab308' },
];
