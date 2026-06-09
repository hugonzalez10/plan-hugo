const { useState, useEffect, useMemo, useCallback } = React;

const STORAGE_KEY = 'plan-hugo-v3';
const BACKUP_STORAGE_KEY = 'plan-hugo-v3-bak';
const LEGACY_STORAGE_KEYS = ['plan-hugo-v2', 'plan-hugo-v1'];

const FIXED_MEALS = [
  { id: 'desayuno', label: 'Desayuno', time: '08:00', emoji: '🍳',
    items: [
      { id: 'huevos', label: '2 huevos duros',            kcal: 140, protein: 12, carbs: 1,  fat: 10, fiber: 0 },
      { id: 'yogurt', label: 'Yogurt Colun Protein Plus', kcal: 180, protein: 12, carbs: 21, fat: 5,  fiber: 1 },
      { id: 'cafe',   label: 'Café',                      kcal: 5,   protein: 0,  carbs: 0,  fat: 0,  fiber: 0 },
    ] },
  { id: 'almuerzo', label: 'Almuerzo', time: '13:30', emoji: '🍚',
    items: [
      { id: 'arroz',          label: '1 taza arroz',                 kcal: 205, protein: 4,  carbs: 45, fat: 0,  fiber: 1 },
      { id: 'proteina',       label: '1 taza proteína animal',       kcal: 275, protein: 40, carbs: 0,  fat: 12, fiber: 0 },
      { id: 'fruta',          label: 'Fruta',                        kcal: 80,  protein: 1,  carbs: 21, fat: 0,  fiber: 3 },
      { id: 'yogurt-granola', label: 'Yogurt + 30g granola',         kcal: 170, protein: 4,  carbs: 29, fat: 4,  fiber: 4 },
    ] },
  { id: 'antojo', label: 'Antojo nocturno', time: '22:00', emoji: '🍫', extensible: true,
    items: [
      { id: 'not-squares', label: 'Not Squares Peanut Butter', kcal: 138, protein: 6, carbs: 14, fat: 7, fiber: 2 },
    ] },
];

function mealItemsFor(meal, customAntojoItems) {
  if (meal?.id === 'antojo' && Array.isArray(customAntojoItems) && customAntojoItems.length) {
    return [...(meal.items || []), ...customAntojoItems];
  }
  return meal?.items || [];
}

function mealTotals(meal, customAntojoItems) {
  const items = mealItemsFor(meal, customAntojoItems);
  return {
    kcal:    items.reduce((s, x) => s + (Number(x.kcal)    || 0), 0),
    protein: items.reduce((s, x) => s + (Number(x.protein) || 0), 0),
    carbs:   items.reduce((s, x) => s + (Number(x.carbs)   || 0), 0),
    fat:     items.reduce((s, x) => s + (Number(x.fat)     || 0), 0),
    fiber:   items.reduce((s, x) => s + (Number(x.fiber)   || 0), 0),
  };
}

// Devuelve { [itemId]: bool } para una comida. Si no hay eatenItems aún para ese día/meal,
// hace fallback al booleano legacy day.eaten[mealId] (true → todos tickeados; false → ninguno).
function getMealItemTicks(day, meal, customAntojoItems) {
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

const FOOD_EMOJIS = [
  ['huevo', '🥚'], ['yogurt', '🥛'], ['yogur', '🥛'], ['leche', '🥛'],
  ['café', '☕'], ['cafe', '☕'], ['té', '🍵'],
  ['atún', '🐟'], ['atun', '🐟'], ['salmón', '🐟'], ['salmon', '🐟'], ['pescado', '🐟'],
  ['pollo', '🍗'], ['pavo', '🦃'],
  ['vacuno', '🥩'], ['filete', '🥩'], ['carne', '🥩'], ['lomo', '🥩'],
  ['quesillo', '🧀'], ['queso', '🧀'],
  ['not squares', '🍫'], ['barra', '🍫'], ['chocolate', '🍫'],
  ['arroz', '🍚'], ['pasta', '🍝'], ['fideo', '🍝'],
  ['galleta', '🍪'], ['pan', '🍞'], ['tostada', '🍞'],
  ['palta', '🥑'], ['ensalada', '🥗'], ['tomate', '🍅'],
  ['manzana', '🍎'], ['plátano', '🍌'], ['platano', '🍌'], ['naranja', '🍊'], ['fruta', '🍎'],
  ['shake', '🥤'], ['batido', '🥤'], ['whey', '🥤'], ['proteína', '🥤'], ['proteina', '🥤'],
  ['libre', '🎉'], ['cerveza', '🍺'], ['vino', '🍷'],
  ['papas', '🥔'], ['papa', '🥔'],
];

const EXERCISE_EMOJIS = [
  ['gym', '🏋️'], ['pesas', '🏋️'], ['fuerza', '🏋️'], ['musculación', '🏋️'], ['crossfit', '🏋️'],
  ['trote', '🏃'], ['correr', '🏃'], ['running', '🏃'], ['cinta', '🏃'],
  ['camina', '🚶'], ['caminata', '🚶'],
  ['bici', '🚴'], ['ciclismo', '🚴'], ['spinning', '🚴'],
  ['nada', '🏊'], ['piscina', '🏊'], ['natación', '🏊'],
  ['yoga', '🧘'], ['meditación', '🧘'], ['pilates', '🤸'],
  ['fútbol', '⚽'], ['futbol', '⚽'], ['tenis', '🎾'], ['pádel', '🎾'], ['paddle', '🎾'],
  ['escalada', '🧗'], ['boxeo', '🥊'],
];

function emojiFor(name, map, fallback) {
  const n = (name || '').toLowerCase();
  for (const [kw, emoji] of map) if (n.includes(kw)) return emoji;
  return fallback;
}
function emojiForFood(name) { return emojiFor(name, FOOD_EMOJIS, '🍽️'); }
function emojiForExercise(name) { return emojiFor(name, EXERCISE_EMOJIS, '💪'); }

const WEIGHT_FIELDS = [
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
const BODY_TYPE_OPTIONS = ['Bajo peso', 'Normal', 'Sobrepeso', 'Obesidad'];
const SEGMENT_OPTIONS = ['Bajo', 'Bien', 'Alto', 'Muy alto'];
const SEGMENT_FIELDS = [
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
const STRING_FIELDS = [
  { key: 'bodyType', label: 'Tipo de cuerpo', options: BODY_TYPE_OPTIONS, cat: 'idx' },
];

const WEIGHT_CAT_LABELS = {
  main: 'Composición', mass: 'Masa (kg)', pct: 'Porcentajes', idx: 'Índices', static: 'Estática', circ: 'Circunferencias',
};

const CHART_METRICS = [
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

const PROMPT_EXTRACT = `Estás analizando UNA O VARIAS capturas de pantalla de una app de báscula inteligente (Speediance Smart Scale principalmente, también Withings, Renpho, similares). Las capturas pueden ser de:
- Componentes clave (peso, % grasa, músculo, hueso, tendencia)
- Control del peso (IMC, TMB, tipo de cuerpo, peso de referencia, relación cintura-cadera)
- Grasa (grasa total, subcutánea, visceral)
- Músculo (masa muscular, músculo esquelético, masa libre de grasa, FFMI)
- Componente (agua corporal, masa proteica)
- Análisis de segmentos (grasa/músculo por zona corporal)
- Circunferencia (cuello, bíceps, pecho, cintura, cadera, muslo)

Si hay varias imágenes, COMBINA toda la información en UN ÚNICO objeto JSON. No devuelvas un array.

Extrae TODAS las métricas visibles. Devuelve SOLO un objeto JSON válido, sin texto adicional, sin markdown, sin comentarios.

Usa exactamente estos keys cuando el campo esté presente (omite el key si no aparece, o usa null):

PRINCIPALES:
- weightKg (Peso en kg)
- bodyFatPct (Tasa de grasa corporal en %)
- score (Puntuación general 0-100, si aparece)

MASA (en kg):
- fatKg (Grasa total en kg)
- subcutaneousFatKg (Grasa subcutánea en kg)
- muscleKg (Masa muscular total en kg)
- skeletalMuscleKg (Músculo esquelético en kg)
- fatFreeMassKg (Masa libre de grasa en kg)
- waterKg (Agua corporal en kg)
- proteinKg (Masa proteica en kg)
- boneKg (Hueso / Masa ósea en kg)

PORCENTAJES (si la app los muestra como %):
- musclePct, waterPct, proteinPct

ÍNDICES:
- bmi (IMC en kg/m²)
- ffmi (FFMI en kg/m²)
- metabolicAge (edad metabólica en años entero)
- visceralFat (Índice de grasa visceral, número entero o decimal)
- basalMetabolismKcal (Tasa metabólica basal en kcal)
- waistHipRatio (Relación cintura-cadera, decimal ej 0.96)
- referenceWeightKg (Peso de referencia en kg)
- bodyType (Tipo de cuerpo, string: "Bajo peso" | "Normal" | "Sobrepeso" | "Obesidad")

ESTÁTICA:
- heightCm (Altura en cm)

FECHA DE LA MEDICIÓN (si aparece visible en la captura, ej. encabezado, lista de historial, detalle de medición):
- measurementDate (Fecha de la medición en formato "YYYY-MM-DD". NO uses la hora del status bar del teléfono; busca la fecha asociada a esta medición específica, ej. "19 may", "19/05/2026", "Hace 7 días" → calcula la fecha). Omite el key si no aparece ninguna fecha clara asociada a la medición.

CIRCUNFERENCIAS (en cm):
- neckCm (Cuello)
- chestCm (Pecho)
- waistCm (Cintura)
- hipCm (Cadera)
- bicepCm (Bíceps)
- armCm (Brazo superior, si aparece distinto a bíceps)
- forearmCm (Antebrazo)
- thighCm (Muslo)
- calfCm (Pantorrilla)

ANÁLISIS SEGMENTAL (strings categóricos: "Bajo" | "Bien" | "Alto" | "Muy alto"):
Grasa por zona:
- fatSegUpperL (brazo/zona superior izquierda)
- fatSegUpperR (brazo/zona superior derecha)
- fatSegTorso (torso/tronco)
- fatSegLowerL (pierna/zona inferior izquierda)
- fatSegLowerR (pierna/zona inferior derecha)
Músculo por zona:
- muscleSegUpperL, muscleSegUpperR, muscleSegTorso, muscleSegLowerL, muscleSegLowerR

Reglas CRÍTICAS:
- Si la imagen está borrosa, vacía, oscura, o NO es una pantalla de báscula inteligente, devuelve {} vacío. NO inventes valores.
- NUNCA copies los valores del ejemplo de formato de abajo. Son SOLO referencia de estructura JSON.
- Solo devuelve los keys que VES CLARAMENTE en la imagen. Omite los demás.
- Valores numéricos sin unidades (ej. el peso va como 80.0, no "80.0 kg"; el porcentaje va como 25.0, no "25.0 %").
- bodyType y segmentales son strings exactos: "Bajo", "Bien", "Alto", "Muy alto", "Obesidad", etc.
- Si la pantalla "Análisis de segmentos" muestra una silueta con tarjetas a cada lado, mapea izquierda/derecha visual.
- Si un campo aparece pero el valor no es legible o muestra "--", usa null o omite el key.
- Para measurementDate: solo inclúyelo si hay una fecha CLARAMENTE asociada a la medición. La hora del status bar (ej. "22:53") no es fecha. Si solo ves una hora sin fecha, omite measurementDate. NO uses fechas del ejemplo.

Ejemplo SOLO de formato JSON (los valores son ilustrativos — NO los copies):
{"weightKg":80.0,"bodyFatPct":25.0,"muscleKg":50.0,"bmi":24.0,"measurementDate":"2025-01-15"}`;

const PROMPT_EXTRACT_WORKOUT = `Estás analizando UNA O VARIAS capturas de pantalla de estadísticas de entrenamiento (Speediance u otra app de fitness).

Si hay varias imágenes, COMBINA toda la información en UN ÚNICO objeto JSON. Si las imágenes muestran períodos distintos, prioriza la sesión/día más reciente.

Extrae el resumen del entrenamiento o período mostrado.

Devuelve SOLO un objeto JSON válido, sin texto adicional, sin markdown.

Usa estos keys cuando estén disponibles (omite los que no aparezcan):
- kcal (calorías quemadas TOTAL del período mostrado, número)
- minutes (duración total en minutos, número entero)
- volumeKg (volumen total de peso levantado en kg, número)
- workouts (cantidad de entrenamientos del período, entero)
- date (YYYY-MM-DD si la captura menciona una fecha específica, sino null)
- period (string indicando el alcance temporal):
   - "today" si la captura muestra "Hoy", "Día actual", o stats de una sesión única
   - "session" si es claramente UNA sesión individual con duración corta
   - "7days" si es resumen de "7 días", "última semana"
   - "30days" si es "30 días", "último mes"
   - "month" si es vista mensual
   - "all" si es histórico completo

Reglas:
- Valores numéricos sin unidades.
- null si no aparece. No inventes.
- Si ves "30.3K kg" interpreta como 30300.
- Si ves "4491 kcal" como total, eso es kcal=4491.

Ejemplo: {"kcal":3676,"minutes":371,"volumeKg":30300,"period":"today"}`;

const PROMPT_EXTRACT_MEAL = `Eres un nutricionista experto. Estás analizando una FOTO de un plato de comida y/o una DESCRIPCIÓN en texto natural de lo que comió alguien.

Tu trabajo: identificar los alimentos, estimar porciones REALISTAS para una persona adulta, y devolver los macros estimados.

Si recibes foto + texto, combina la información (la foto manda en cantidades visibles, el texto puede aclarar porciones o ingredientes que no se ven).

Sé CONSERVADOR con las porciones. Si no estás seguro, marca confidence "baja" y explica brevemente en notes.

Devuelve SOLO un objeto JSON válido, sin texto adicional, sin markdown, sin comentarios. Solo JSON.

Forma exacta:
{
  "items": [
    {
      "name": "nombre del alimento (corto, ej. 'Huevos revueltos')",
      "portion": "porción descrita (ej. '2 unidades', '150g', '1 taza')",
      "kcal": número,
      "protein": número (gramos),
      "carbs": número (gramos),
      "fat": número (gramos),
      "fiber": número (gramos)
    }
  ],
  "total": {
    "kcal": suma de items,
    "protein": suma de items,
    "carbs": suma de items,
    "fat": suma de items,
    "fiber": suma de items
  },
  "confidence": "alta" | "media" | "baja",
  "notes": "comentario breve si confidence baja, o '' si todo OK"
}

Reglas:
- Valores numéricos sin unidades, sin strings.
- Redondea a enteros (excepto fiber que puede tener 1 decimal).
- Si no ves bien la foto, devuelve confidence "baja" pero igual da tu mejor estimación.
- No inventes alimentos que no estén ni en la foto ni en el texto.
- Si solo hay texto sin foto, igual estima conservador.

Ejemplo de respuesta:
{"items":[{"name":"Huevos revueltos","portion":"2 unidades","kcal":180,"protein":13,"carbs":1,"fat":13,"fiber":0},{"name":"Palta","portion":"medio fruto","kcal":120,"protein":1,"carbs":6,"fat":11,"fiber":5}],"total":{"kcal":300,"protein":14,"carbs":7,"fat":24,"fiber":5},"confidence":"alta","notes":""}`;

const MODEL_DEFAULT = 'claude-sonnet-4-6';
const MODEL_CHEAP = 'claude-haiku-4-5';

async function extractFromAttachments(attachments, apiKey, prompt, opts = {}) {
  const content = [];
  for (const a of attachments) {
    if (a.kind === 'image') {
      const [meta, b64] = a.dataUrl.split(',');
      const mediaType = meta.match(/data:(.+);base64/)[1];
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } });
    } else if (a.kind === 'pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.b64 } });
    } else if (a.kind === 'text') {
      content.push({ type: 'text', text: `Archivo adjunto "${a.name}":\n\n${a.text}` });
    }
  }
  content.push({ type: 'text', text: prompt });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model || MODEL_DEFAULT,
      max_tokens: opts.maxTokens || 2048,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let msg = `Error ${resp.status}`;
    try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const text = (data.content?.[0]?.text || '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No se pudo parsear la respuesta de Claude');
  return JSON.parse(match[0]);
}

async function extractMetricsFromImage(attachments, apiKey) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  return extractFromAttachments(list, apiKey, PROMPT_EXTRACT);
}

async function extractWorkoutFromImage(attachments, apiKey) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  return extractFromAttachments(list, apiKey, PROMPT_EXTRACT_WORKOUT, { model: MODEL_CHEAP, maxTokens: 800 });
}

const PROMPT_ESTIMATE_EXTRA = `Eres un nutricionista chileno. Estima los macros de un alimento individual o pequeño combo (un snack, una bebida, una galleta — no un plato completo).

Si recibes solo texto, infiere porción razonable (mediana). Si hay foto del producto/empaque, usa la tabla nutricional si es legible; si solo se ve el alimento, estima porción visible.

Devuelve SOLO JSON, sin markdown:
{
  "name": "nombre normalizado y corto",
  "portion": "porción estimada (ej. '1 taza', '30g', '1 unidad')",
  "kcal": número entero,
  "protein": número entero (gramos),
  "carbs": número entero,
  "fat": número entero,
  "fiber": número con 1 decimal,
  "confidence": "alta|media|baja"
}

Reglas:
- Conservador con porciones
- Si no estás seguro, usa confidence "baja"
- Productos chilenos comunes (Soprole, Colun, Carozzi, Costa, Watt's, Not Squares, etc) los conoces`;

const PROMPT_ESTIMATE_EXERCISE = `Eres entrenador deportivo. Estima kcal quemadas en una sesión de ejercicio basándote en el tipo, duración (si se menciona) y peso del usuario.

Devuelve SOLO JSON, sin markdown:
{
  "name": "nombre normalizado y corto (ej. 'Trote 30 min', 'Pesas 1h', 'Yoga')",
  "minutes": número o null,
  "kcal": número entero (kcal quemadas estimadas),
  "confidence": "alta|media|baja"
}

Reglas:
- Conservador (no sobreestimar)
- Si solo dice "gym 1h" o "pesas" sin más, asume sesión moderada
- Usa MET típicos para deportes comunes (trote, ciclismo, fútbol, etc.)
- Si no hay duración, asume 45-60 min para deporte
- Si no estás seguro, confidence "baja"`;

async function estimateExerciseKcal({ description, weightKg, apiKey }) {
  const promptParts = [PROMPT_ESTIMATE_EXERCISE];
  if (weightKg) promptParts.push(`\n\nPeso del usuario: ${weightKg} kg`);
  promptParts.push(`\n\nDescripción del usuario: "${(description || '').trim()}"`);
  return extractFromAttachments([], apiKey, promptParts.join(''), {
    model: MODEL_CHEAP,
    maxTokens: 300,
  });
}

async function estimateExtraMacros({ name = '', attachments = [], apiKey }) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  const promptParts = [PROMPT_ESTIMATE_EXTRA];
  if (name && name.trim()) {
    promptParts.push(`\n\nAlimento descrito por el usuario: "${name.trim()}"`);
  }
  const result = await extractFromAttachments(list, apiKey, promptParts.join(''), {
    model: MODEL_CHEAP,
    maxTokens: 400,
  });
  return result;
}

async function suggestForSlot({ slot, state, targets, apiKey, recents = [] }) {
  if (!apiKey) throw new Error('Falta API key');
  if (!slot || !['snack', 'dinner', 'dessert_almuerzo', 'dessert_cena'].includes(slot)) {
    throw new Error('Slot inválido');
  }
  // Banco según slot
  let bank, slotLabel, kcalRange;
  if (slot === 'snack') {
    bank = state.snackBank || [];
    slotLabel = 'colación';
    kcalRange = '150-300';
  } else if (slot === 'dinner') {
    bank = state.proteinBank || [];
    slotLabel = 'cena (proteína principal con guarnición)';
    kcalRange = '250-450';
  } else {
    bank = state.dessertBank || [];
    slotLabel = slot === 'dessert_almuerzo' ? 'postre del almuerzo' : 'postre de la cena';
    kcalRange = '60-180';
  }
  if (bank.length === 0) throw new Error('Banco vacío para este slot');

  // Contexto del día
  const today = todayKey();
  const day = state.days?.[today] || {};
  const totals = computeDayTotals(day, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
  const T = targets || DEFAULT_TARGETS;
  const kcalRemaining = Math.max(0, Math.round(T.kcalMax - totals.kcalIn));
  const proteinRemaining = Math.max(0, Math.round(T.proteinMin - totals.protein));
  const carbsRemaining = Math.max(0, Math.round(T.carbsTarget - totals.carbs));
  const fatRemaining = Math.max(0, Math.round(T.fatTarget - totals.fat));

  // Estado de reglas semanales relevantes
  const ruleStatus = getRulesStatus(state, today, targets);
  const rulesText = ruleStatus.length
    ? ruleStatus.map(r => `- ${r.rule.name}: ${r.current}/${r.max} ${r.tone === 'red' ? '(LÍMITE)' : r.tone === 'amber' ? '(cerca)' : '(ok)'}`).join('\n')
    : 'Sin reglas activas';

  // Items del banco con su ID
  const bankText = bank.map(it => (
    `- id:${it.id} | ${it.name} | ${it.kcal} kcal · P ${it.protein}g · C ${it.carbs || 0}g · G ${it.fat || 0}g · F ${Number(it.fiber || 0).toFixed(0)}g${it.category ? ' · ' + it.category : ''}`
  )).join('\n');

  // Recientes
  const recentsText = (recents || []).slice(0, 5).map(r => `- ${r.name} (${r.count}x en últimos días)`).join('\n') || 'Sin recientes';

  const prompt = `Eres nutricionista clínico chileno asesorando a Hugo, un médico geriatra de 36 años en plan de pérdida de peso. Sugiere ${slot === 'snack' ? '2-3' : '2-3'} opciones de ${slotLabel} del banco que mejor calcen con su estado actual.

ESTADO DEL DÍA HOY (${today}):
- Kcal restantes hasta máximo del día: ${kcalRemaining} kcal
- Proteína faltante para meta: ${proteinRemaining} g
- Carbos restantes: ${carbsRemaining} g
- Grasas restantes: ${fatRemaining} g

REGLAS PERSONALES (esta semana):
${rulesText}

BANCO DISPONIBLE (${slotLabel}, ${kcalRange} kcal típico):
${bankText}

ITEMS COMIDOS RECIENTEMENTE:
${recentsText}

Criterios para sugerir (en orden de prioridad):
1. NO romper reglas que estén en LÍMITE o cerca (especialmente dulces si "dulces" está en límite).
2. Priorizar items con proteína si proteinRemaining > 20g.
3. Caber en kcalRemaining (idealmente <50% del restante para no agotarlo).
4. Variar respecto a recientes (evitar repetir lo del día anterior).
5. Si todas las opciones rompen reglas, sugerir igual pero advertirlo en la razón.

Devuelve SOLO JSON, sin texto adicional, sin markdown:
{
  "recommendations": [
    {
      "id": "<id exacto del banco>",
      "reason": "razón clínica corta en 1 frase (max 80 chars) en chileno tuteo"
    }
  ]
}

Máximo 3 items, mínimo 1.`;

  const text = await askClaude(prompt, apiKey, 600, MODEL_CHEAP);
  const parsed = parseJsonLoose(text);
  const recs = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
  // Validar y resolver IDs
  const out = [];
  for (const r of recs) {
    const item = bank.find((it) => it.id === r.id);
    if (item) out.push({ item, reason: String(r.reason || '').slice(0, 200) });
  }
  return out;
}

const PROMPT_RECIPE = `Eres un nutricionista chileno asesorando a Hugo, médico geriatra de 36 años en plan de pérdida de peso. Hugo te muestra ingredientes disponibles (foto de despensa/refrigerador o lista en texto) y te pide una receta concreta para una ocasión específica del día.

Tu trabajo: proponer UNA sola receta realista, rica y que calce con el estado actual del día. Habla en chileno tuteo, sin emojis dentro del JSON, breve.

REGLAS PARA LA RECETA:
1. Prioriza ingredientes que Hugo ya tiene (los detectados en foto o listados). Marca esos con "optional": false.
2. Puedes sugerir 1-3 agregados típicos chilenos (sal, limón, aceite oliva, cebollín, cilantro, etc.) — márcalos con "optional": true.
3. Macros totales deben caber en kcalRemaining del día. Idealmente ≤80% del restante.
4. Respeta reglas que estén en LÍMITE (rojo). Si la regla "dulces" está en límite, no propongas postres dulces.
5. Si la ocasión es "snack", mantén la receta ≤300 kcal.
6. Si la ocasión es "cena" y ya es tarde (>20:00), evita carbos pesados; favorece proteína + verdura.
7. Pasos máximo 6, cortos, realistas para alguien con poco tiempo.
8. Si proteinRemaining > 30g, prioriza receta proteica.

Devuelve SOLO JSON, sin markdown, sin texto extra:
{
  "name": "nombre corto y atractivo",
  "occasion": "desayuno|almuerzo|cena|snack",
  "prepMinutes": número entero,
  "confidence": "alta|media|baja",
  "ingredients": [
    { "name": "...", "portion": "ej. '150g', '1 taza', '2 unidades'", "optional": false }
  ],
  "steps": ["paso 1...", "paso 2..."],
  "totals": { "kcal": n, "protein": n, "carbs": n, "fat": n, "fiber": n },
  "why": "frase corta (max 140 chars) explicando por qué esta receta calza con el día (kcal restantes, proteína, regla relevante)"
}

Confidence:
- "alta" si los ingredientes son claros (foto nítida o lista explícita) y la receta es estándar
- "media" si infieres porciones o algunos ingredientes
- "baja" si la foto es ambigua o falta info`;

async function suggestRecipeFromIngredients({ attachments = [], ingredientsText = '', notes = '', occasion, state, targets, apiKey }) {
  if (!apiKey) throw new Error('Falta API key');
  const list = Array.isArray(attachments) ? attachments : [attachments];

  const slotLabel = ({
    desayuno: 'desayuno',
    almuerzo: 'almuerzo',
    cena: 'cena',
    snack: 'snack / colación',
  })[occasion] || 'comida';

  const today = todayKey();
  const day = state?.days?.[today] || {};
  const totals = computeDayTotals(
    day,
    state?.snackBank || [],
    state?.proteinBank || [],
    targets,
    state?.dessertBank || [],
    state?.antojoCustomItems || []
  );
  const T = targets || DEFAULT_TARGETS;
  const kcalRemaining = Math.max(0, Math.round(T.kcalMax - totals.kcalIn));
  const proteinRemaining = Math.max(0, Math.round(T.proteinMin - totals.protein));
  const carbsRemaining = Math.max(0, Math.round(T.carbsTarget - totals.carbs));
  const fatRemaining = Math.max(0, Math.round(T.fatTarget - totals.fat));

  const ruleStatus = getRulesStatus(state, today, targets);
  const rulesText = ruleStatus.length
    ? ruleStatus.map(r => `- ${r.rule.name}: ${r.current}/${r.max} ${r.tone === 'red' ? '(LÍMITE)' : r.tone === 'amber' ? '(cerca)' : '(ok)'}`).join('\n')
    : 'Sin reglas activas';

  const hour = new Date().getHours();
  const ingClean = (ingredientsText || '').trim();
  const notesClean = (notes || '').trim();

  const contextPrompt = `${PROMPT_RECIPE}

OCASIÓN: ${slotLabel}
HORA ACTUAL: ${hour}:00

ESTADO DEL DÍA HOY (${today}):
- Kcal restantes hasta máximo del día: ${kcalRemaining} kcal
- Proteína faltante para meta: ${proteinRemaining} g
- Carbos restantes: ${carbsRemaining} g
- Grasas restantes: ${fatRemaining} g

REGLAS PERSONALES (esta semana):
${rulesText}

${ingClean ? `INGREDIENTES DISPONIBLES (texto del usuario):\n${ingClean}\n` : ''}${notesClean ? `\nNOTAS DEL USUARIO:\n"""${notesClean}"""\n` : ''}${list.length ? '\nAdemás revisa las imágenes adjuntas para detectar ingredientes visibles.' : ''}`;

  return extractFromAttachments(list, apiKey, contextPrompt, { model: MODEL_DEFAULT, maxTokens: 1600 });
}

async function extractMealFromInputs({ attachments = [], freeText = '', apiKey }) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  const promptParts = [PROMPT_EXTRACT_MEAL];
  if (freeText && freeText.trim()) {
    promptParts.push(`\n\nDescripción del usuario:\n"""${freeText.trim()}"""`);
  }
  const finalPrompt = promptParts.join('');
  return extractFromAttachments(list, apiKey, finalPrompt);
}

async function askClaude(prompt, apiKey, maxTokens = 1024, model = MODEL_DEFAULT) {
  if (!apiKey) throw new Error('Falta API key');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    let msg = `Error ${resp.status}`;
    try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await resp.json();
  return (data.content?.[0]?.text || '').trim();
}

// ---------- Sync via GitHub Gist privado ----------

const GIST_FILENAME = 'plan-hugo.json';
const GIST_DESCRIPTION = 'Plan Hugo · backup privado (no compartir)';

// Construye headers para GitHub API con PAT
function gistHeaders(pat) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${pat}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

// Sanea state para subir: elimina sourceImage (imágenes pesadas) y NUNCA sube
// credenciales/endpoints. Los gists "secretos" de GitHub son públicos por URL y
// los escanea el detector de secretos: subir la API key revoca la cuenta.
function sanitizeStateForUpload(state) {
  const next = JSON.parse(JSON.stringify(state || {}));
  if (Array.isArray(next.weights)) {
    next.weights = next.weights.map((w) => {
      const { sourceImage, ...rest } = w || {};
      return rest;
    });
  }
  if (next.settings && typeof next.settings === 'object') {
    delete next.settings.anthropicApiKey;
    delete next.settings.githubPAT;
    delete next.settings.bridgeUrl;
  }
  return next;
}

async function gistCreate(pat, state) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  const payload = {
    public: false,
    description: GIST_DESCRIPTION,
    files: { [GIST_FILENAME]: { content: JSON.stringify(sanitizeStateForUpload(state), null, 2) } },
  };
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: gistHeaders(pat),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist create falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  return { id: data.id, updatedAt: data.updated_at, htmlUrl: data.html_url };
}

async function gistPush(pat, gistId, state) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  if (!gistId) throw new Error('Falta gistId — conecta primero');
  const payload = {
    files: { [GIST_FILENAME]: { content: JSON.stringify(sanitizeStateForUpload(state), null, 2) } },
  };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(pat),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist push falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  return { updatedAt: data.updated_at };
}

async function gistPull(pat, gistId) {
  if (!pat) throw new Error('Falta PAT de GitHub');
  if (!gistId) throw new Error('Falta gistId');
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers: gistHeaders(pat),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub Gist pull falló (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  const fileObj = data.files?.[GIST_FILENAME];
  if (!fileObj) throw new Error(`El gist no contiene ${GIST_FILENAME}`);
  // Si el archivo es muy grande GitHub usa raw_url y trunca content. Resolver:
  let content = fileObj.content;
  if (fileObj.truncated && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url);
    if (!rawRes.ok) throw new Error('No se pudo descargar el contenido completo del gist');
    content = await rawRes.text();
  }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) { throw new Error('El gist contiene JSON inválido'); }
  return { state: parsed, updatedAt: data.updated_at };
}

// Firma estable de los datos sincronizables (excluye credenciales, caches y sourceImage).
function syncSig(state) {
  if (!state) return 0;
  const weights = Array.isArray(state.weights)
    ? state.weights.map(({ sourceImage, ...rest }) => rest) : [];
  const slice = {
    userProfile: state.userProfile ?? null,
    snackBank: state.snackBank ?? [], proteinBank: state.proteinBank ?? [],
    dessertBank: state.dessertBank ?? [], rules: state.rules ?? [],
    recipeBank: state.recipeBank ?? [], days: state.days ?? {},
    weights, theme: state.theme ?? null,
  };
  const s = JSON.stringify(slice);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0; }
  return h;
}

// Preserva credenciales/sync locales al aplicar un estado remoto bajado del gist.
function applyRemoteState(prev, remote, updatedAt) {
  const merged = { ...remote };
  merged.settings = {
    ...(remote.settings || {}),
    githubPAT: prev.settings?.githubPAT ?? null,
    syncGistId: prev.settings?.syncGistId ?? null,
    anthropicApiKey: prev.settings?.anthropicApiKey ?? null,
    bridgeUrl: prev.settings?.bridgeUrl ?? null,
    bridgeToken: prev.settings?.bridgeToken ?? null,
    autoSync: prev.settings?.autoSync ?? true,
    lastRemoteUpdatedAt: updatedAt,
    lastSyncAt: new Date().toISOString(),
  };
  merged.bridge = prev.bridge || merged.bridge;
  merged.settings.lastPushedSig = syncSig(merged);
  return merged;
}

// Auto-sync con el Gist, a prueba de fallos:
//  - SUBE solo (debounced) cuando hay cambios locales y la nube NO avanzó (si avanzó, no pisa).
//  - BAJA solo al abrir/volver SOLO si el equipo está limpio (sin cambios sin subir) y la nube es más nueva.
//  - Ante cualquier conflicto o error: no toca nada (quedan los botones manuales).
function useGistAutoSync(state, setState) {
  const s = state.settings || {};
  const pat = s.githubPAT, gistId = s.syncGistId;
  const enabled = (s.autoSync ?? true) && !!pat && !!gistId;
  const dataSig = syncSig(state);
  const lastPushedSig = s.lastPushedSig ?? null;
  const lastRemoteUpdatedAt = s.lastRemoteUpdatedAt ?? null;
  const busyRef = React.useRef(false);
  // Estado interno crudo: lo fijan los efectos. 'conflict'/'error' son "pegajosos"
  // hasta el próximo intento exitoso.
  const [raw, setRaw] = useState('idle');

  // SUBIR (debounced) cuando el equipo está "sucio"
  useEffect(() => {
    if (!enabled) return;
    // Sin base aún (recién conectado, sin subir/bajar manual) → NO auto-subir: evita pisar la nube buena con datos vacíos.
    if (lastPushedSig == null || dataSig === lastPushedSig) return;
    const t = setTimeout(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setRaw('syncing');
      try {
        const meta = await gistPull(pat, gistId);
        const cloudAdvanced = lastRemoteUpdatedAt && new Date(meta.updatedAt) > new Date(lastRemoteUpdatedAt);
        if (cloudAdvanced) { setRaw('conflict'); return; } // la nube cambió en otro equipo → no pisar; avisar para pull manual
        const { updatedAt } = await gistPush(pat, gistId, state);
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt, lastSyncAt: new Date().toISOString() },
        }));
        setRaw('ok');
      } catch (e) { console.warn('Auto-sync (subir) falló', e); setRaw('error'); }
      finally { busyRef.current = false; }
    }, 2500);
    return () => clearTimeout(t);
  }, [enabled, dataSig, lastPushedSig, lastRemoteUpdatedAt, pat, gistId]);

  // BAJAR al abrir / volver a primer plano (solo si limpio + nube más nueva)
  useEffect(() => {
    if (!enabled) return;
    const run = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const { state: remote, updatedAt } = await gistPull(pat, gistId);
        if (!remote || typeof remote !== 'object') return;
        setState((prev) => {
          const clean = prev.settings?.lastPushedSig != null && syncSig(prev) === prev.settings.lastPushedSig;
          const cloudNewer = !prev.settings?.lastRemoteUpdatedAt || new Date(updatedAt) > new Date(prev.settings.lastRemoteUpdatedAt);
          if (!(clean && cloudNewer)) return prev; // sucio o sin novedad → no tocar
          return applyRemoteState(prev, remote, updatedAt);
        });
        setRaw('ok');
      } catch (e) { console.warn('Auto-sync (bajar) falló', e); setRaw('error'); }
      finally { busyRef.current = false; }
    };
    run();
    const onVis = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, pat, gistId]);

  // Estado visible derivado para el indicador de la barra superior.
  const dirty = lastPushedSig != null && dataSig !== lastPushedSig;
  let status = 'off';
  if (enabled) {
    if (raw === 'syncing') status = 'syncing';
    else if (raw === 'conflict') status = 'conflict';
    else if (raw === 'error') status = 'error';
    else if (dirty) status = 'pending';
    else status = lastPushedSig != null ? 'ok' : 'idle';
  }
  return { status, lastSyncAt: s.lastSyncAt ?? null };
}

function parseJsonLoose(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

let _zxingPromise = null;
function loadZXing() {
  if (_zxingPromise) return _zxingPromise;
  if (typeof window !== 'undefined' && window.ZXing) {
    _zxingPromise = Promise.resolve(window.ZXing);
    return _zxingPromise;
  }
  _zxingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
    script.onload = () => {
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error('ZXing no cargó'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar la librería de escaneo'));
    document.head.appendChild(script);
  });
  return _zxingPromise;
}

async function searchOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity,quantity,image_front_small_url`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('No se pudo consultar OpenFoodFacts');
  const data = await resp.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments || {};
  const kcalPer100 = Number(n['energy-kcal_100g']) || (Number(n['energy_100g']) ? Math.round(Number(n['energy_100g']) / 4.184) : null);
  if (kcalPer100 == null) return null;

  const protPer100 = Number(n.proteins_100g) || 0;
  const carbsPer100 = Number(n.carbohydrates_100g) || 0;
  const fatPer100 = Number(n.fat_100g) || 0;
  const fiberPer100 = Number(n.fiber_100g) || 0;

  // Porción: usar serving_quantity si existe, si no serving_size string, si no 100g
  let servingG = Number(p.serving_quantity) || null;
  if (!servingG && p.serving_size) {
    const m = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*g/i);
    if (m) servingG = Number(m[1]);
  }
  if (!servingG) servingG = 100;
  const factor = servingG / 100;

  const brand = p.brands ? `${p.brands.split(',')[0].trim()} ` : '';
  const namePart = p.product_name || `Producto ${barcode}`;
  const portionLabel = servingG === 100 ? '100g' : `${servingG}g`;

  return {
    name: `${brand}${namePart}`.trim(),
    portion: portionLabel,
    kcal: Math.round(kcalPer100 * factor),
    protein: Math.round(protPer100 * factor),
    carbs: Math.round(carbsPer100 * factor),
    fat: Math.round(fatPer100 * factor),
    fiber: Number((fiberPer100 * factor).toFixed(1)),
    barcode,
    imageUrl: p.image_front_small_url || null,
    raw: { kcalPer100, protPer100, carbsPer100, fatPer100, fiberPer100, servingG },
  };
}

function hashSig(obj) {
  const str = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

async function fileToAttachment(file) {
  if (file.type.startsWith('image/')) {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, 1280, 0.85);
    return { kind: 'image', dataUrl: compressed, name: file.name };
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const dataUrl = await fileToDataUrl(file);
    const b64 = dataUrl.split(',')[1];
    return { kind: 'pdf', b64, name: file.name };
  }
  // CSV, JSON, TXT, XML — leer como texto
  const text = await file.text();
  return { kind: 'text', text, name: file.name };
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageDataUrl(dataUrl, maxDim = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const SCHEDULE_BY_DOW = { 0: null, 1: '16:45', 2: '17:30', 3: '17:00', 4: '17:30', 5: '16:30', 6: '16:00' };
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const DEFAULT_TARGETS = { kcalMin: 2200, kcalMax: 2400, kcalRed: 2500, proteinMin: 160, proteinYellow: 140, carbsTarget: 240, fatTarget: 75, fiberTarget: 30, waterTarget: 3000 };

// Piso innegociable de proteína diaria en déficit (goal 'lose'): 200 g (~2.2-2.4 g/kg de
// peso objetivo 90 kg). Preserva masa magra y maximiza pérdida de grasa (Longland 2016).
const PROTEIN_FLOOR_LOSE = 200;
// Distribución proteica intradía (Schoenfeld & Aragon 2018): ≥4 tomas, ≥36 g por toma
// (0.4 g/kg/comida), sin brechas >5 h entre tomas proteicas.
const PROTEIN_DIST = { minTomas: 4, minPerToma: 36, maxGapHours: 5 };
// Tasa de pérdida semanal objetivo como % del peso corporal/sem (Garthe 2011): 0.5-0.7%
// preserva/aumenta LBM. >0.8% = demasiado rápido (riesgo masa magra). <0.4% = lento.
const WEEKLY_LOSS = { minPct: 0.5, maxPct: 0.7, fastPct: 0.8, slowPct: 0.4 };

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ACTIVITY_LABELS = {
  sedentary: { label: 'Sedentario', hint: 'Trabajo de escritorio, sin ejercicio' },
  light: { label: 'Liviano', hint: 'Ejercicio ligero 1-3 días/sem' },
  moderate: { label: 'Moderado', hint: 'Ejercicio 3-5 días/sem' },
  active: { label: 'Activo', hint: 'Ejercicio 6-7 días/sem' },
  very_active: { label: 'Muy activo', hint: 'Ejercicio intenso o 2x/día' },
};

function calcMifflinStJeor({ sex, weightKg, heightCm, age }) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'F' ? base - 161 : base + 5;
}

function calcTargets(profile) {
  if (!profile) return DEFAULT_TARGETS;
  const bmr = calcMifflinStJeor(profile);
  const factor = ACTIVITY_FACTORS[profile.activityLevel] ?? 1.55;
  const tdee = bmr != null ? bmr * factor : null;
  let kcalTarget;
  if (profile.kcalTarget != null) {
    kcalTarget = profile.kcalTarget;
  } else if (tdee != null) {
    const deficit = Number.isFinite(profile.kcalDeficit) ? profile.kcalDeficit : 400;
    if (profile.goal === 'lose') kcalTarget = Math.round(tdee - deficit);
    else if (profile.goal === 'gain') kcalTarget = Math.round(tdee + 300);
    else kcalTarget = Math.round(tdee);
  } else {
    kcalTarget = 2300;
  }
  // Proteína: en déficit calórico marcado el piso es INNEGOCIABLE (200 g/día, ~2.2-2.4
  // g/kg de peso objetivo 90 kg) para preservar masa magra y maximizar pérdida de grasa
  // (Longland 2016). El piso pisa incluso un proteinTarget manual más bajo.
  const proteinPerKg = profile.goal === 'gain' ? 2.0 : 1.8;
  let proteinTarget = profile.proteinTarget != null
    ? profile.proteinTarget
    : Math.round((profile.weightKg || 80) * proteinPerKg);
  if (profile.goal === 'lose') proteinTarget = Math.max(proteinTarget, PROTEIN_FLOOR_LOSE);
  const carbsTarget = profile.carbsTarget != null
    ? profile.carbsTarget
    : Math.round((kcalTarget * 0.40) / 4);
  const fatTarget = profile.fatTarget != null
    ? profile.fatTarget
    : Math.round((kcalTarget * 0.30) / 9);
  const fiberTarget = profile.fiberTarget != null ? profile.fiberTarget : 30;
  const waterTarget = profile.waterTarget != null
    ? profile.waterTarget
    : Math.round((profile.weightKg || 80) * 35);
  return {
    kcalMin: Math.round(kcalTarget * 0.92),
    kcalMax: kcalTarget,
    kcalRed: Math.round(kcalTarget * 1.08),
    proteinMin: proteinTarget,
    proteinYellow: Math.round(proteinTarget * 0.87),
    carbsTarget, fatTarget, fiberTarget, waterTarget,
    bmr: bmr != null ? Math.round(bmr) : null,
    tdee: tdee != null ? Math.round(tdee) : null,
  };
}

const KCAL_PER_KG_FAT = 7700;
const MAX_IMAGES = 10;

const SEED_SNACKS = [
  { name: '2 huevos duros', kcal: 180, protein: 13, carbs: 1, fat: 12, fiber: 0, category: 'salado' },
  { name: '2 huevos duros + 1 yogurt Colun', kcal: 270, protein: 24, carbs: 10, fat: 14, fiber: 0, category: 'salado' },
  { name: 'Atún en lata + 4 galletas de arroz', kcal: 280, protein: 25, carbs: 30, fat: 6, fiber: 1, category: 'salado' },
  { name: '100g pavo en láminas + 1 fruta', kcal: 230, protein: 22, carbs: 22, fat: 4, fiber: 3, category: 'salado' },
  { name: 'Quesillo 100g + galletas de arroz', kcal: 190, protein: 14, carbs: 20, fat: 6, fiber: 1, category: 'salado' },
  { name: 'Yogurt Colun Protein + Not Squares', kcal: 276, protein: 17, carbs: 28, fat: 9, fiber: 3, category: 'dulce' },
  { name: '1 lata atún solo', kcal: 120, protein: 26, carbs: 0, fat: 1, fiber: 0, category: 'salado' },
];

const SEED_PROTEINS = [
  { name: 'Salmón 150g', kcal: 280, protein: 35, carbs: 0, fat: 16, fiber: 0 },
  { name: 'Pollo 150g', kcal: 250, protein: 38, carbs: 0, fat: 10, fiber: 0 },
  { name: 'Filete vacuno 120g', kcal: 240, protein: 32, carbs: 0, fat: 12, fiber: 0 },
  { name: 'Libre (sábado)', kcal: 450, protein: 25, carbs: 40, fat: 22, fiber: 3 },
];

const SEED_DESSERTS = [
  { name: 'Fruta (1 unidad)', kcal: 80, protein: 1, carbs: 20, fat: 0, fiber: 3 },
  { name: 'Yogurt Colun light 125g', kcal: 70, protein: 6, carbs: 9, fat: 1, fiber: 0 },
  { name: 'Helado bajo cal 1 bola', kcal: 90, protein: 3, carbs: 14, fat: 2, fiber: 0 },
  { name: 'Chocolate amargo 70% (20g)', kcal: 120, protein: 1, carbs: 9, fat: 8, fiber: 2 },
];

// Tipos de regla soportados. config es específica por tipo.
const RULE_TYPES = {
  kcal_cap_extras: {
    label: 'Bloquear extras pasando kcal',
    defaultName: 'Sin extras pasando X kcal/día',
    paramLabel: 'kcal límite',
    paramKey: 'kcalCap',
    paramDefault: 2000,
    paramStep: 50,
    icon: '🚫',
  },
  count_per_week: {
    label: 'Máximo X por semana',
    defaultName: 'Máximo X por semana',
    paramLabel: 'máximo por semana',
    paramKey: 'max',
    paramDefault: 1,
    paramStep: 1,
    icon: '🔢',
  },
};

// Categorías que cuentan: 'dulce' (snacks dulces + postres + extras tag) | 'delivery' (extras tag) | 'alcohol' (extras tag)
const RULE_CATEGORIES = ['dulce', 'delivery', 'alcohol'];

const SEED_RULES = [
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

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(key, days) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

function formatDateLabel(key, todayK) {
  if (key === todayK) return 'Hoy';
  if (key === shiftDate(todayK, -1)) return 'Ayer';
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

function getWeekKeys(reference = new Date()) {
  const d = new Date(reference);
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const keys = [];
  for (let i = 0; i < 6; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    keys.push(todayKey(x));
  }
  return keys;
}

function buildSeed() {
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
      notifications: { enabled: false, almuerzo: '13:30', agua: '16:00', cena: '20:30' },
    },
    weights: [],
    recipeBank: [],
    bridge: { lastSyncAt: null, importedIds: [], pushedIds: [], removedBridgeIds: [] },
    aiCache: { coach: {}, weekly: {}, patterns: null, lastSubstitution: null },
  };
}

// Firma de contenido de una comida: slot|nombre|kcal. El servidor del bridge asigna el id y
// dedup por contenido, así que el mismo plato desde la app y desde el chat trae ids distintos
// que un dedup por id no cacharía. Esta firma colapsa esos duplicados dentro de la ventana.
function chatMealSig(slot, name, kcal) {
  return `${slot || 'extra'}|${normalizeName(name)}|${Math.round(Number(kcal) || 0)}`;
}

// Ventana de dedup por contenido (debe coincidir con WINDOW_MS del Apps Script). Dos entradas
// con la misma firma se consideran la MISMA si caen dentro de la ventana; más allá, repeticiones
// legítimas (p.ej. dos cafés en el día). Si a alguna le falta ts (datos legacy) se cae al match
// por mismo día (conservador: colapsa, como antes).
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
function sameWindow(tsA, tsB) {
  if (tsA == null || tsB == null) return true;
  return Math.abs(Number(tsA) - Number(tsB)) <= DEDUP_WINDOW_MS;
}

// Colapsa extras duplicados dentro de un mismo día. Por id, y por contenido+ventana SOLO para
// comidas del chat (source 'skill-chat'): el chat puede re-registrar el mismo plato. Los extras
// de la app se dedupean solo por id, para no subcontar repeticiones legítimas que el usuario
// ingresó a mano.
function dedupeDayExtras(extras) {
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

function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.snackBank) || !Array.isArray(parsed.proteinBank)) return null;
  const next = { ...parsed };
  next.version = 3;
  if (next.userProfile === undefined) next.userProfile = null;
  if (next.userProfile && typeof next.userProfile === 'object') {
    // Migración de esquema viejo→nuevo: perfiles guardados por versiones previas
    // usaban otros nombres de campo, lo que dejaba a calcMifflinStJeor con valores
    // undefined y la meta caía al fallback plano (2300). Mapear a los nombres que
    // calcTargets espera (solo si el campo nuevo aún no existe).
    const up = next.userProfile;
    if (up.weightKg == null && up.weight != null) up.weightKg = Number(up.weight) || null;
    if (up.heightCm == null && up.height != null) up.heightCm = Number(up.height) || null;
    if (up.activityLevel == null && up.activity != null) up.activityLevel = up.activity;
    if (up.sex === 'male' || up.sex === 'M') up.sex = 'M';
    else if (up.sex === 'female' || up.sex === 'F') up.sex = 'F';
    if (up.goal === 'cut') up.goal = 'lose';
    else if (up.goal === 'bulk') up.goal = 'gain';
    else if (up.goal === 'maintain' || up.goal === 'maintenance') up.goal = 'maintain';
    delete up.weight; delete up.height; delete up.activity;
    if (!Number.isFinite(next.userProfile.kcalDeficit)) {
      next.userProfile.kcalDeficit = next.userProfile.goal === 'lose' ? 400 : null;
    }
    if (next.userProfile.lastAdjustmentDate === undefined) {
      next.userProfile.lastAdjustmentDate = null;
    }
  }
  next.days = next.days || {};
  next.settings = next.settings || {};
  next.settings = {
    anthropicApiKey: next.settings.anthropicApiKey ?? null,
    saveImages: next.settings.saveImages ?? false,
    notifications: next.settings.notifications || { enabled: false, almuerzo: '13:30', agua: '16:00', cena: '20:30' },
    githubPAT: next.settings.githubPAT ?? null,
    syncGistId: next.settings.syncGistId ?? null,
    lastSyncAt: next.settings.lastSyncAt ?? null,
    bridgeUrl: next.settings.bridgeUrl ?? null,
    bridgeToken: next.settings.bridgeToken ?? null,
    autoSync: next.settings.autoSync ?? true,
    lastPushedSig: next.settings.lastPushedSig ?? null,
    lastRemoteUpdatedAt: next.settings.lastRemoteUpdatedAt ?? null,
  };
  next.weights = Array.isArray(next.weights) ? next.weights : [];
  next.recipeBank = Array.isArray(next.recipeBank) ? next.recipeBank : [];
  next.bridge = (next.bridge && Array.isArray(next.bridge.importedIds))
    ? next.bridge
    : { lastSyncAt: next.bridge?.lastSyncAt || null, importedIds: [] };
  // Sets auxiliares del sync (pueden faltar en estados viejos):
  //  · pushedIds       → ya empujados app→bridge (no reenviar).
  //  · removedBridgeIds → borrados a propósito en la app; el merge NO los reimporta
  //    aunque sigan en el bridge (vive 10 días). Sin esto, volver importedIds "blando"
  //    resucitaría lo borrado. Ver mergeBridge.
  if (!Array.isArray(next.bridge.pushedIds)) next.bridge.pushedIds = [];
  if (!Array.isArray(next.bridge.removedBridgeIds)) next.bridge.removedBridgeIds = [];
  next.snackBank = next.snackBank.map((s) => ({
    carbs: 0, fat: 0, fiber: 0, ...s,
  }));
  next.proteinBank = next.proteinBank.map((p) => ({
    carbs: 0, fat: 0, fiber: 0, ...p,
  }));
  next.dessertBank = Array.isArray(next.dessertBank) && next.dessertBank.length
    ? next.dessertBank.map((d) => ({ carbs: 0, fat: 0, fiber: 0, ...d }))
    : SEED_DESSERTS.map((d) => ({ ...d, id: uuid(), builtin: true }));
  next.rules = Array.isArray(next.rules) && next.rules.length
    ? next.rules
    : SEED_RULES.map((r) => ({ ...r }));
  const migratedDays = {};
  for (const [k, v] of Object.entries(next.days)) {
    if (!v) continue;
    const cleanExtras = Array.isArray(v.extras)
      ? dedupeDayExtras(v.extras).map((x) => ({ carbs: 0, fat: 0, fiber: 0, ...x }))
      : [];
    // Si ya hay comida registrada de colación/cena, el slot está cumplido aunque
    // se haya importado antes de existir la detección automática.
    const eaten = { ...(v.eaten || {}) };
    for (const slot of ['colacion', 'cena']) {
      if (cleanExtras.some((x) => x.mealSlot === slot)) eaten[slot] = true;
    }
    migratedDays[k] = {
      ...v,
      water: v.water || { ml: 0 },
      extras: cleanExtras,
      eaten,
      nudgesDismissed: Array.isArray(v.nudgesDismissed) ? v.nudgesDismissed : [],
      skipped: Array.isArray(v.skipped) ? v.skipped : [],
      dessertAlmuerzoId: v.dessertAlmuerzoId ?? null,
      dessertCenaId: v.dessertCenaId ?? null,
      notes: v.notes && typeof v.notes === 'object' ? v.notes : null,
    };
  }
  next.days = migratedDays;
  next.aiCache = next.aiCache || { coach: {}, weekly: {}, patterns: null, lastSubstitution: null };
  next.aiCache.coach = next.aiCache.coach || {};
  next.aiCache.weekly = next.aiCache.weekly || {};
  return next;
}

// Intenta leer + parsear + migrar UNA fuente, aislada en su propio try.
// Si la fuente está corrupta, devuelve null sin tumbar a las demás.
function tryLoadFrom(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { return null; }
  if (!raw) return null;
  try {
    const migrated = migrateState(JSON.parse(raw));
    return migrated || null;
  } catch (e) {
    console.warn(`localStorage "${key}" corrupto, lo salto`, e);
    return null;
  }
}

// Recuperación por capas: actual → backup → legacy → seed.
// Una sola fuente corrupta ya no vacía el historial; si TODO falla pero había
// datos, marca corruptionDetected para que la app ofrezca restaurar desde Gist.
function loadState() {
  const current = tryLoadFrom(STORAGE_KEY);
  if (current) return current;

  const backup = tryLoadFrom(BACKUP_STORAGE_KEY);
  if (backup) {
    console.warn('Recuperado desde backup local');
    return backup;
  }

  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    const legacy = tryLoadFrom(legacyKey);
    if (legacy) return legacy;
  }

  // ¿Había algo escrito (aunque ilegible)? Entonces es corrupción, no primer arranque.
  let hadData = false;
  try {
    hadData = !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(BACKUP_STORAGE_KEY)
      || LEGACY_STORAGE_KEYS.some((k) => localStorage.getItem(k)));
  } catch {}
  const seed = buildSeed();
  if (hadData) seed.__corruptionDetected = true;
  return seed;
}

// Escritura verificada con backup rotatorio.
// Antes de pisar la copia buena, la respalda; tras escribir, relee y verifica.
// Devuelve 'ok' | 'failed' en vez de tragarse el error en silencio.
function saveState(state) {
  let json;
  try { json = JSON.stringify(state); }
  catch (e) { console.warn('No se pudo serializar el estado', e); return 'failed'; }

  // Respaldar la copia buena previa (best-effort; no aborta el guardado).
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) localStorage.setItem(BACKUP_STORAGE_KEY, prev);
  } catch {}

  try {
    localStorage.setItem(STORAGE_KEY, json);
    // Verificación: releer y confirmar que quedó completo.
    if (localStorage.getItem(STORAGE_KEY) !== json) throw new Error('verificación de escritura falló');
    return 'ok';
  } catch (e) {
    console.warn('No se pudo guardar localStorage', e);
    // Restaurar la copia buena para no dejar el estado a medio escribir.
    try {
      const bak = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (bak) localStorage.setItem(STORAGE_KEY, bak);
    } catch {}
    return 'failed';
  }
}

// ─── Puente chat → app: lee el JSON que la skill deja en Drive vía Apps Script ───
// Adjunta el token compartido (?k=) a una URL del bridge. El Apps Script lo exige en
// CADA llamada (GET y POST) para que no cualquiera con la URL lea/escriba/borre datos.
// El token vive en settings.bridgeToken, aparte de la URL.
function withBridgeToken(url, token) {
  if (!url || !token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'k=' + encodeURIComponent(token);
}

async function fetchBridge(url, token) {
  const tokenized = withBridgeToken(url, token);
  const sep = tokenized.includes('?') ? '&' : '?';
  const resp = await fetch(tokenized + sep + 't=' + Date.now(), { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data && data.ok === false && data.reason === 'unauthorized') {
    throw new Error('Token del bridge inválido (revisa Ajustes → Token del bridge).');
  }
  return {
    meals: Array.isArray(data.meals) ? data.meals : [],
    weights: Array.isArray(data.weights) ? data.weights : [],
    workouts: Array.isArray(data.workouts) ? data.workouts : [],
    checks: Array.isArray(data.checks) ? data.checks : [],
    water: Array.isArray(data.water) ? data.water : [],
  };
}

// Propaga un borrado al bridge (fire-and-forget, mismo patrón no-cors/text-plain que el resto
// de escrituras de la app). El `.gs` soporta op:'delete' en doPost. Idempotente: si la entrada
// ya no está, devuelve deleted:0; por eso repetir el POST es inocuo. Sin esto, un ítem borrado
// en la app reaparecería en el próximo sync (sigue en el bridge ~10 días) ahora que mergeBridge
// reimporta lo ausente. El freno local complementario es state.bridge.removedBridgeIds.
function postBridgeDelete(settings, section, id) {
  const url = settings?.bridgeUrl;
  if (!url || id == null) return;
  try {
    fetch(withBridgeToken(url, settings?.bridgeToken), {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ op: 'delete', section, id }),
    }).catch(() => {});
  } catch (e) { /* fire-and-forget */ }
}

// Merge idempotente: ignora ids ya importados (state.bridge.importedIds). Función pura.
// Día al que pertenece una entrada del bridge. Si trae `date` explícita, manda. Si no, se
// deriva del `ts` (epoch ms) — NO de "hoy": antes, una comida/agua sin `date` caía en
// todayKey() y se volcaba en el día actual cada sync, inflando el progreso de hoy. Solo si
// tampoco hay `ts` (ni fecha) se usa hoy como último recurso.
function bridgeDateKey(entry) {
  if (entry && entry.date) return entry.date;
  if (entry && entry.ts != null) {
    const d = new Date(Number(entry.ts));
    if (!Number.isNaN(d.getTime())) return todayKey(d);
  }
  return todayKey();
}

function mergeBridge(state, bridge) {
  const num = (v) => Number(v) || 0;
  const importedIds = new Set((state.bridge?.importedIds) || []);
  // Borrados a propósito en la app: el bridge los conserva hasta 10 días, pero NO debemos
  // reimportarlos. `importedIds` ya no basta como freno (ahora es solo optimización: un dato
  // del bridge ausente localmente se reimporta aunque su id figure en importedIds), así que
  // la intención de borrado vive aquí. Ver pushDelete / handlers de borrado.
  const removedBridgeIds = new Set((state.bridge?.removedBridgeIds) || []);
  const days = { ...(state.days || {}) };
  const weights = Array.isArray(state.weights) ? [...state.weights] : [];
  const added = { meals: 0, weights: 0, workouts: 0, checks: 0, water: 0 };

  const ensureDay = (dk) => {
    const base = days[dk] || { eaten: {}, snackId: null, proteinId: null, water: { ml: 0 }, skipped: [], nudgesDismissed: [], dessertAlmuerzoId: null, dessertCenaId: null, notes: null };
    days[dk] = { ...base, extras: [...(base.extras || [])], exercise: [...(base.exercise || [])] };
    return days[dk];
  };

  // Slots que, al venir del bridge, marcan la sección como cumplida. Solo colación/cena:
  // no tienen ítems fijos con kcal, así que marcar `eaten` no duplica calorías (las kcal
  // vienen del extra). Marcar desayuno/almuerzo/antojo sí dispararía el fallback legacy de
  // getMealItemTicks y sumaría kcal fantasma, por eso se excluyen.
  const BRIDGE_SLOT_DETECT = new Set(['colacion', 'cena']);
  for (const m of bridge.meals) {
    if (m.id == null || removedBridgeIds.has(m.id)) continue;
    const slot = m.mealSlot || 'extra';
    const d = ensureDay(bridgeDateKey(m));
    // NO se corta por importedIds: si el dato está en el bridge pero falta localmente (estado
    // perdido), se reimporta. El freno real es la presencia local (por id o por contenido) y
    // removedBridgeIds (borrados deliberados, ya filtrados arriba).
    if (d.extras.some((x) => x.id === m.id)) { importedIds.add(m.id); continue; }
    // Dedup por contenido+ventana contra CUALQUIER extra ya presente ese día (no solo del chat):
    // así también se absorbe el eco del propio empuje app→bridge, que vuelve con id de servidor
    // distinto. Lo damos por importado.
    const sig = chatMealSig(slot, m.name, m.kcal);
    if (d.extras.some((x) => chatMealSig(x.mealSlot, x.name, x.kcal) === sig && sameWindow(x.ts, m.ts))) {
      importedIds.add(m.id); continue;
    }
    d.extras.push({
      id: m.id, ts: m.ts != null ? m.ts : Date.now(), name: m.name || 'Comida',
      kcal: num(m.kcal), protein: num(m.protein),
      carbs: num(m.carbs), fat: num(m.fat), fiber: num(m.fiber),
      mealSlot: slot, source: 'skill-chat',
    });
    if (BRIDGE_SLOT_DETECT.has(slot)) d.eaten = { ...(d.eaten || {}), [slot]: true };
    importedIds.add(m.id); added.meals++;
  }

  // Reconciliación: poda extras del chat que el bridge ya no tiene. Cada extra con
  // source 'skill-chat' nació de un meal del bridge y conserva su id de servidor. Si ese id
  // desapareció de bridge.meals (anulado, borrado vía ?w=delete, o re-dedupeado/movido de
  // fecha en el servidor), el extra local quedó HUÉRFANO. Sin esto el merge solo AGREGA y
  // nunca quita, así que una corrección del chat (p.ej. anular una comida de fecha errónea)
  // neteaba en el bridge pero seguía inflando el total local —el bug de divergencia app↔bridge.
  // Solo se reconcilian días que el bridge cubre (≥1 meal): si bridge.meals viene vacío o el
  // día ya se podó por antigüedad (PRUNE_DAYS), no se toca nada (a prueba de fallos de fetch).
  // Los extras de la app (manual/photo/repeat/...) llevan otro source y uuid local: intactos.
  const bridgeMealIds = new Set();
  const bridgeMealDates = new Set();
  for (const m of bridge.meals) {
    if (m == null || m.id == null) continue;
    bridgeMealDates.add(bridgeDateKey(m));
    if (!removedBridgeIds.has(m.id)) bridgeMealIds.add(m.id);
  }
  for (const dk of bridgeMealDates) {
    const d = days[dk];
    if (!d || !Array.isArray(d.extras)) continue;
    const kept = d.extras.filter((x) => x?.source !== 'skill-chat' || bridgeMealIds.has(x.id));
    if (kept.length !== d.extras.length) days[dk] = { ...d, extras: kept };
  }

  for (const w of bridge.workouts) {
    if (w.id == null || removedBridgeIds.has(w.id)) continue;
    const d = ensureDay(bridgeDateKey(w));
    // No se corta por importedIds (ver meals): reimporta si falta localmente.
    if (d.exercise.some((x) => x.id === w.id)) { importedIds.add(w.id); continue; }
    // Dedup por contenido+ventana (nombre normalizado dentro del día): absorbe el eco del
    // empuje app→bridge, que vuelve con id de servidor distinto.
    const wname = normalizeName(w.name);
    if (d.exercise.some((x) => normalizeName(x.name) === wname && sameWindow(x.ts, w.ts))) {
      importedIds.add(w.id); continue;
    }
    const ex = { id: w.id, ts: w.ts != null ? w.ts : Date.now(), name: w.name || 'Entrenamiento', kcal: num(w.kcal) };
    if (w.minutes != null) ex.minutes = num(w.minutes);
    d.exercise.push(ex);
    importedIds.add(w.id); added.workouts++;
  }

  for (const wt of bridge.weights) {
    if (wt.id == null || removedBridgeIds.has(wt.id)) continue;
    const date = bridgeDateKey(wt);
    const idx = weights.findIndex((x) => x.date === date);
    if (idx >= 0) {
      // Ya hay medición local de ese día (dedup por fecha). Enriquecer campos UNA sola vez:
      // si re-corriéramos el merge en cada sync, la nota se duplicaría (`nota · nota · …`).
      // Por eso aquí sí se usa importedIds como freno del enriquecimiento; el id queda marcado
      // y nunca se re-agrega.
      if (!importedIds.has(wt.id)) {
        const merged = { ...weights[idx] };
        for (const wf of WEIGHT_FIELDS) {
          if (wt[wf.key] != null) merged[wf.key] = wt[wf.key];
        }
        for (const sf of STRING_FIELDS) {
          if (wt[sf.key] != null) merged[sf.key] = wt[sf.key];
        }
        for (const seg of SEGMENT_FIELDS) {
          if (wt[seg.key] != null) merged[seg.key] = wt[seg.key];
        }
        if (wt.note) merged.note = merged.note ? `${merged.note} · ${wt.note}` : wt.note;
        if (wt.rawExtracted) merged.rawExtracted = { ...(merged.rawExtracted || {}), ...wt.rawExtracted };
        if (wt.time && !merged.time) merged.time = wt.time;
        weights[idx] = merged;
        added.weights++;
      }
      importedIds.add(wt.id);
      continue;
    }
    // No hay medición local de ese día → agregar. Reimporta aunque el id ya esté en importedIds
    // (el dato se perdió del estado local); el freno de borrado es removedBridgeIds (arriba).
    const out = { id: wt.id, date, time: wt.time || null, note: wt.note || '', rawExtracted: wt.rawExtracted || {}, sourceImage: null };
    for (const wf of WEIGHT_FIELDS) out[wf.key] = wt[wf.key] != null ? wt[wf.key] : null;
    for (const sf of STRING_FIELDS) out[sf.key] = wt[sf.key] != null ? wt[sf.key] : null;
    for (const seg of SEGMENT_FIELDS) out[seg.key] = wt[seg.key] != null ? wt[seg.key] : null;
    weights.push(out);
    importedIds.add(wt.id); added.weights++;
  }

  // Agua registrada por chat (section `water`, append-only, cada entrada es un `ml`).
  // Se acumula en `day.water.bridgeMl` — SEPARADO de `day.water.ml` (el agua que Hugo
  // marca en la app) — para que el snapshot siga empujando solo SU agua y el bridge no
  // la doble-cuente en ?totals (que ya suma el water[] del servidor). importedIds es
  // freno DURO aquí (a diferencia de meals): el agua es una suma corriente, reimportar
  // un id ausente la inflaría. El bridge solo lo escribe el chat, así que no hay eco propio.
  if (Array.isArray(bridge.water)) {
    for (const wd of bridge.water) {
      if (wd == null || wd.id == null || removedBridgeIds.has(wd.id) || importedIds.has(wd.id)) continue;
      const d = ensureDay(bridgeDateKey(wd));
      const cur = d.water || { ml: 0 };
      d.water = { ...cur, bridgeMl: (Number(cur.bridgeMl) || 0) + (Number(wd.ml) || 0) };
      importedIds.add(wd.id); added.water++;
    }
  }

  // Marca secciones FIJAS del plan como comidas (sin duplicar). Backward-compatible:
  // los bridges antiguos no traen `checks`. Cada check se aplica una sola vez (id en
  // importedIds), para no re-marcar si Hugo lo destilda manualmente en la app.
  if (Array.isArray(bridge.checks)) {
    const FIXED_MEAL_SLOTS = new Set(['desayuno', 'almuerzo', 'colacion', 'cena', 'antojo', 'dessertAlmuerzo', 'dessertCena']);
    for (const c of bridge.checks) {
      if (c == null || c.id == null || importedIds.has(c.id)) continue;
      if (!FIXED_MEAL_SLOTS.has(c.meal)) continue;
      const d = ensureDay(bridgeDateKey(c));
      // Si esa sección ya tiene un registro real del chat, NO marcar el fijo como comido:
      // el extra es la comida y marcar el plan sumaría kcal fantasma (ver computeDayTotals).
      const alreadyLogged = (d.extras || []).some((x) => extraPlanSlot(x) === c.meal);
      if (!alreadyLogged) d.eaten = { ...(d.eaten || {}), [c.meal]: true };
      importedIds.add(c.id); added.checks++;
    }
  }

  const nextState = {
    ...state, days, weights,
    bridge: {
      ...(state.bridge || {}),
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true, lastSyncError: null, lastSyncAdded: added,
      importedIds: [...importedIds],
    },
  };
  return { state: nextState, added };
}

// Orquesta fetch + merge + persistencia. Devuelve resumen para la UI.
async function runBridgeSync(state, setState) {
  const url = state.settings?.bridgeUrl;
  if (!url) return { ok: false, reason: 'no-url' };
  const token = state.settings?.bridgeToken;
  let bridge;
  try { bridge = await fetchBridge(url, token); }
  catch (e) {
    console.warn('Bridge sync falló', e);
    // Registrar el fallo en el estado para que el indicador del header lo muestre (antes se
    // tragaba en silencio y un sync roto era indistinguible de uno OK).
    setState((prev) => ({
      ...prev,
      bridge: {
        ...(prev.bridge || {}),
        lastSyncAttemptAt: new Date().toISOString(),
        lastSyncOk: false, lastSyncError: e.message || 'fetch',
      },
    }));
    return { ok: false, reason: 'fetch', error: e.message };
  }
  let added = { meals: 0, weights: 0, workouts: 0 };
  setState((prev) => {
    const res = mergeBridge(prev, bridge);
    added = res.added;
    return res.state;
  });
  return { ok: true, added };
}

function sumField(items, field) {
  return items.reduce((s, x) => s + (Number(x?.[field]) || 0), 0);
}

function computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojoItems) {
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

  const snack = day?.snackId ? snackBank.find((s) => s.id === day.snackId) : null;
  const dinner = day?.proteinId ? proteinBank.find((p) => p.id === day.proteinId) : null;
  const dessertA = day?.dessertAlmuerzoId ? dBank.find((d) => d.id === day.dessertAlmuerzoId) : null;
  const dessertC = day?.dessertCenaId ? dBank.find((d) => d.id === day.dessertCenaId) : null;
  const snackEaten = snack && e.colacion && !loggedSlots.has('colacion') ? [snack] : [];
  const dinnerEaten = dinner && e.cena && !loggedSlots.has('cena') ? [dinner] : [];
  const dessertAEaten = dessertA && e.dessertAlmuerzo ? [dessertA] : [];
  const dessertCEaten = dessertC && e.dessertCena ? [dessertC] : [];

  const exercise = day?.exercise || [];
  // Porción del PLAN (fijos + banco): lo que NO se empuja a meals[] del bridge. Los extras
  // y el ejercicio sí van a meals[]/workouts[], así que el snapshot debe llevar solo esto
  // para que el bridge sume sin solape (partición aditiva, no Math.max). Ver snapPayload.
  const planEaten = [...eatenFixedItems, ...snackEaten, ...dinnerEaten, ...dessertAEaten, ...dessertCEaten];
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
    kcal: kcalNet, kcalIn, kcalBurned, kcalNet,
    planIn, planProtein, planCarbs, planFat, planFiber,
    kcalRemaining: T.kcalMax - kcalNet,
    protein, proteinRemaining: T.proteinMin - protein,
    carbs, carbsRemaining: T.carbsTarget - carbs,
    fat, fatRemaining: T.fatTarget - fat,
    fiber, fiberRemaining: T.fiberTarget - fiber,
    waterMl, waterRemaining: T.waterTarget - waterMl,
    hasSnack: !!snack, hasDinner: !!dinner,
    hasDessertA: !!dessertA, hasDessertC: !!dessertC,
    eatenAny: !!(eatenFixedItems.length || e.colacion || e.cena || e.dessertAlmuerzo || e.dessertCena || extras.length || exercise.length || (Array.isArray(day?.skipped) && day.skipped.length)),
    snack, dinner, dessertA, dessertC, extras, exercise,
  };
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Cubeta de despliegue de un extra según su mealSlot. Las comidas con slot de una
// sección del plan (desayuno/almuerzo/colacion/cena/antojo) se muestran DENTRO de esa
// sección con "📝 Registrado"; el resto (mealSlot ausente o desconocido) cae en 'extra'
// → lista "Extras del día".
const PLAN_SLOTS = new Set(['desayuno', 'almuerzo', 'colacion', 'cena', 'antojo']);
function extraSlotBucket(x) {
  const s = x?.mealSlot;
  return PLAN_SLOTS.has(s) ? s : 'extra';
}

// Prefijos con que la skill nombra un reemplazo de comida del plan ("Desayuno - ...",
// "Colacion 1 - ...", "Cena - ..."). Para registros viejos del chat SIN mealSlot,
// inferimos el slot por ese prefijo. DEBE coincidir con SLOT_NAME_RE_GS de bridge-writer.gs.
const SLOT_NAME_RE = {
  desayuno: /^desayuno\b/i,
  almuerzo: /^almuerzo\b/i,
  colacion: /^colaci[oó]n/i,
  cena: /^cena\b/i,
  antojo: /^antojo\b/i,
};
// La sección del plan que un extra REEMPLAZA, o null si es un extra genuino (suma aparte).
// Prefiere mealSlot (lo que ahora etiqueta la skill); cae al nombre solo para skill-chat.
// Cuando devuelve un slot, computeDayTotals suprime el plan/banco de esa sección.
function extraPlanSlot(x) {
  if (PLAN_SLOTS.has(x?.mealSlot)) return x.mealSlot;
  if (x?.source === 'skill-chat' && x?.name) {
    for (const slot of PLAN_SLOTS) if (SLOT_NAME_RE[slot].test(x.name)) return slot;
  }
  return null;
}

// ---------- Reglas personales ----------

// Devuelve [ISO_date_keys] de la semana (lunes a domingo) que contiene refDate
function getRuleWeekKeys(refDate = new Date()) {
  const d = (typeof refDate === 'string') ? new Date(refDate + 'T12:00:00') : new Date(refDate);
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    keys.push(todayKey(x));
  }
  return keys;
}

// Peso promedio de una semana (lunes-domingo que contiene refDate). null si no hay datos.
function weekAvgWeight(weights, refDate) {
  const keys = new Set(getRuleWeekKeys(refDate));
  const vals = (weights || []).filter((w) => w && w.weightKg != null && keys.has(w.date)).map((w) => Number(w.weightKg));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// Tasa de pérdida semanal: compara el peso promedio de la semana que contiene `refDateKey`
// (cualquier fecha YYYY-MM-DD de esa semana) con el de la semana anterior y la expresa como
// % del peso corporal/semana (Garthe 2011).
// Devuelve { deltaKg, pctPerWeek, curr, prev, status } o null si falta una de las semanas.
// status: 'fast' (>0.8%, riesgo masa magra) | 'ok' (0.5-0.7%) | 'slow' (<0.4%) | 'mid'.
function computeWeeklyLossRate(weights, refDateKey) {
  const ref = refDateKey ? new Date(refDateKey + 'T12:00:00') : new Date();
  const curr = weekAvgWeight(weights, ref);
  const prevRef = new Date(ref);
  prevRef.setDate(prevRef.getDate() - 7);
  const prev = weekAvgWeight(weights, prevRef);
  if (curr == null || prev == null || prev === 0) return null;
  const deltaKg = curr - prev; // negativo = bajó
  const pctPerWeek = (-deltaKg / prev) * 100; // positivo = pérdida
  let status = 'mid';
  if (pctPerWeek > WEEKLY_LOSS.fastPct) status = 'fast';
  else if (pctPerWeek >= WEEKLY_LOSS.minPct && pctPerWeek <= WEEKLY_LOSS.maxPct) status = 'ok';
  else if (pctPerWeek < WEEKLY_LOSS.slowPct) status = 'slow';
  return { deltaKg, pctPerWeek, curr, prev, status };
}

// ¿Un item de un slot dado cuenta como 'dulce'?
function isItemDulce(item, slot) {
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
function countCategoryInWeek(state, category, refDate = new Date()) {
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
      // Colación dulce
      if (day.snackId && e.colacion) {
        const snack = snackBank.find((s) => s.id === day.snackId);
        if (isItemDulce(snack, 'snack')) count++;
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

// Devuelve kcal-in (no neto) del día desde sus eaten + extras
function currentDayKcalIn(state, dateKey, targets) {
  const day = state?.days?.[dateKey] || {};
  const t = computeDayTotals(day, state?.snackBank || [], state?.proteinBank || [], targets, state?.dessertBank || [], state?.antojoCustomItems || []);
  return t.kcalIn;
}

// Evalúa una regla en un contexto: { action: 'add_extra' | 'add_dulce' | 'add_delivery', state, dateKey, targets, prospectiveKcal }
// Retorna { violated: bool, message: string }
function evaluateRule(rule, ctx) {
  if (!rule?.enabled) return { violated: false };
  const { state, dateKey, targets, action, prospectiveKcal = 0 } = ctx;

  if (rule.type === 'kcal_cap_extras') {
    // Solo aplica a acciones que suman kcal por encima del cap
    if (action !== 'add_extra' && action !== 'add_dulce' && action !== 'add_delivery') return { violated: false };
    const cap = Number(rule.config?.kcalCap) || 2000;
    const current = currentDayKcalIn(state, dateKey, targets);
    const after = current + Number(prospectiveKcal || 0);
    if (after > cap && current >= cap) {
      return { violated: true, message: `Ya llevas ${Math.round(current)} kcal hoy (cap ${cap}). Sumar este extra te dejaría en ${Math.round(after)} kcal.` };
    }
    if (after > cap) {
      return { violated: true, message: `Esto te llevaría a ${Math.round(after)} kcal (cap ${cap}). Llevas ${Math.round(current)} hoy.` };
    }
    return { violated: false };
  }

  if (rule.type === 'count_per_week') {
    const cat = rule.config?.category;
    const max = Number(rule.config?.max) || 1;
    // Solo si la acción corresponde a esa categoría
    if (cat === 'dulce' && action !== 'add_dulce') return { violated: false };
    if (cat === 'delivery' && action !== 'add_delivery') return { violated: false };
    if (cat === 'alcohol' && action !== 'add_alcohol') return { violated: false };
    const count = countCategoryInWeek(state, cat, dateKey);
    // Cuento ANTES de agregar: si ya estoy en max, este sería el (max+1)-ésimo
    if (count >= max) {
      return { violated: true, message: `Ya llevas ${count}/${max} ${cat}${count === 1 ? '' : 's'} esta semana.` };
    }
    return { violated: false };
  }

  return { violated: false };
}

// Estado de cada regla para mostrar como chip (sin acción): { rule, current, max, tone }
function getRulesStatus(state, dateKey, targets) {
  const rules = state?.rules || [];
  const out = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type === 'kcal_cap_extras') {
      const cap = Number(rule.config?.kcalCap) || 2000;
      const current = Math.round(currentDayKcalIn(state, dateKey, targets));
      const tone = current >= cap ? 'red' : current >= cap * 0.9 ? 'amber' : 'green';
      out.push({ rule, current, max: cap, label: 'kcal hoy', tone, unit: 'kcal' });
    } else if (rule.type === 'count_per_week') {
      const cat = rule.config?.category;
      const max = Number(rule.config?.max) || 1;
      const current = countCategoryInWeek(state, cat, dateKey);
      const tone = current >= max ? 'red' : current >= max - 0.001 ? 'amber' : 'green';
      const label = cat === 'dulce' ? 'dulces' : cat === 'delivery' ? 'delivery' : cat === 'alcohol' ? 'alcohol' : cat;
      out.push({ rule, current, max, label, tone, unit: 'sem' });
    }
  }
  return out;
}

// Evalúa todas las reglas para una acción; devuelve array de violaciones
function evaluateAllRules(state, action, ctx) {
  const rules = state?.rules || [];
  const violations = [];
  for (const rule of rules) {
    const res = evaluateRule(rule, { ...ctx, state, action });
    if (res.violated) violations.push({ rule, message: res.message });
  }
  return violations;
}

// ---------- Lista de compras ----------

// Categoría heurística por palabras clave en el nombre. Devuelve la primera que matchee.
const SHOPPING_CATEGORIES = [
  { key: 'lacteo',   label: '🥛 Lácteos',          keywords: ['yogurt','yogur','quesillo','queso','leche','colun','protein plus','natural'] },
  { key: 'proteina', label: '🥩 Proteínas',         keywords: ['huevo','huevos','pollo','pavo','salmón','salmon','atún','atun','vacuno','carne','filete','pescado','jamón','jamon'] },
  { key: 'fruta',    label: '🍎 Frutas',            keywords: ['fruta','manzana','plátano','platano','pera','naranja','kiwi','frutilla','arándano','arandano','palta','aguacate'] },
  { key: 'verdura',  label: '🥦 Verduras',          keywords: ['ensalada','verdura','lechuga','tomate','pepino','zanahoria','espinaca','rúcula','rucula','brócoli','brocoli','coliflor','pimentón','pimenton'] },
  { key: 'carbo',    label: '🌾 Carbohidratos',     keywords: ['arroz','pan','pasta','papa','quinoa','quínoa','avena','tostada','galleta de arroz','galletas de arroz'] },
  { key: 'snack',    label: '🍫 Snacks y dulces',   keywords: ['chocolate','helado','not squares','protein bar','barra','galleta','dulce','postre'] },
  { key: 'bebida',   label: '🥤 Bebidas',           keywords: ['café','cafe','té','te','agua','infusión','infusion','jugo','leche vegetal'] },
  { key: 'otro',     label: '🛒 Otros',             keywords: [] },
];

function categorizeShoppingItem(name) {
  const norm = (name || '').toLowerCase();
  for (const cat of SHOPPING_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (norm.includes(kw)) return cat.key;
    }
  }
  return 'otro';
}

// Genera lista de compras: items usados en últimos N días, agrupados por categoría
function generateShoppingList(state, options = {}) {
  const { windowDays = 7, refDate = todayKey() } = options;
  const days = state?.days || {};
  const snackBank = state?.snackBank || [];
  const proteinBank = state?.proteinBank || [];
  const dessertBank = state?.dessertBank || [];

  // Calcula fecha de inicio
  const start = (() => {
    const d = new Date(refDate + 'T12:00:00');
    d.setDate(d.getDate() - windowDays + 1);
    return todayKey(d);
  })();

  // Recolectar items con frecuencia
  const usage = new Map(); // normalizedName → { name, count, kcal, protein, source }

  const addUsage = (item, source) => {
    if (!item || !item.name) return;
    const norm = normalizeName(item.name);
    const existing = usage.get(norm);
    if (existing) {
      existing.count += 1;
    } else {
      usage.set(norm, {
        name: item.name,
        count: 1,
        kcal: item.kcal || 0,
        protein: item.protein || 0,
        source,
      });
    }
  };

  for (const [k, day] of Object.entries(days)) {
    if (!day || k < start || k > refDate) continue;
    const e = day.eaten || {};
    // Snacks
    if (day.snackId && e.colacion) {
      const it = snackBank.find((s) => s.id === day.snackId);
      if (it) addUsage(it, 'colacion');
    }
    // Proteínas cena
    if (day.proteinId && e.cena) {
      const it = proteinBank.find((p) => p.id === day.proteinId);
      if (it) addUsage(it, 'cena');
    }
    // Postres
    if (day.dessertAlmuerzoId && e.dessertAlmuerzo) {
      const it = dessertBank.find((d) => d.id === day.dessertAlmuerzoId);
      if (it) addUsage(it, 'postre');
    }
    if (day.dessertCenaId && e.dessertCena) {
      const it = dessertBank.find((d) => d.id === day.dessertCenaId);
      if (it) addUsage(it, 'postre');
    }
    // Extras (todos, no requieren eaten flag — ya están en el día)
    for (const x of (day.extras || [])) {
      addUsage(x, 'extra');
    }
  }

  // Ingredientes de las recetas guardadas. Prioriza las favoritas (⭐); si no hay ninguna
  // marcada, toma todas. Cada ingrediente se funde por nombre con lo del historial (mismo
  // Map), así "Pollo" de una receta y "pollo" comido no se duplican.
  if (options.includeRecipes) {
    const recipes = state?.recipeBank || [];
    const favs = recipes.filter((r) => r.favorite);
    const src = favs.length ? favs : recipes;
    for (const r of src) {
      for (const ing of (r.ingredients || [])) {
        if (ing && ing.name) addUsage({ name: ing.name, kcal: 0, protein: 0 }, 'receta');
      }
    }
  }

  // Agrupar por categoría
  const byCat = {};
  for (const cat of SHOPPING_CATEGORIES) byCat[cat.key] = [];
  for (const u of usage.values()) {
    const cat = categorizeShoppingItem(u.name);
    byCat[cat].push(u);
  }
  // Ordenar cada categoría por frecuencia desc
  for (const cat of Object.keys(byCat)) {
    byCat[cat].sort((a, b) => b.count - a.count);
  }

  // Construir array final solo con categorías que tienen items
  const result = SHOPPING_CATEGORIES
    .filter((cat) => byCat[cat.key].length > 0)
    .map((cat) => ({ key: cat.key, label: cat.label, items: byCat[cat.key] }));

  return { groups: result, windowDays, start, end: refDate, totalItems: usage.size };
}

// ---------- Ajuste automático del plan ----------

// Diferencia en días enteros entre dos date keys YYYY-MM-DD
function daysBetween(aKey, bKey) {
  const a = new Date(aKey + 'T12:00:00');
  const b = new Date(bKey + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

// Computa sugerencia de ajuste según la TASA DE PÉRDIDA SEMANAL (% del peso corporal/sem),
// NO según un déficit fijo esperado (Garthe 2011). Objetivo 0.5-0.7 %/sem.
// - >0.8 %/sem → pérdida demasiado rápida (riesgo masa magra) → subir ~100-150 kcal.
// - <0.4 %/sem (con ≥14 días de data ≈ 2 semanas) → extender duración del cardio,
//   NO recortar más calorías ni agregar días.
// - 0.4-0.8 %/sem → sin banner.
function computePlanAdjustment(state, refDate = todayKey(), options = {}) {
  const {
    minDays = 14,         // ignora la evaluación dinámica con <14 días de data
    windowDays = 28,      // mirar hasta los últimos 28 días
    stepKcal = 125,       // ~100-150 kcal por ajuste
    cooldownDays = 14,    // mínimo entre ajustes
    minDeficit = 100,
  } = options;

  const profile = state?.userProfile;
  if (!profile) return null;
  if (profile.goal !== 'lose') return null;

  // Cooldown
  if (profile.lastAdjustmentDate) {
    const elapsed = daysBetween(profile.lastAdjustmentDate, refDate);
    if (elapsed < cooldownDays) return null;
  }

  const weights = (state.weights || [])
    .filter((w) => w && w.weightKg != null && w.date)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (weights.length < 2) return null;

  // Tomar pesos dentro de la ventana de los últimos windowDays
  const windowStart = (() => {
    const d = new Date(refDate + 'T12:00:00');
    d.setDate(d.getDate() - windowDays);
    return todayKey(d);
  })();
  const inWindow = weights.filter((w) => w.date >= windowStart && w.date <= refDate);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < minDays) return null;       // <14 días: no evaluar (ignora TDEE dinámico)
  if (!first.weightKg) return null;

  const realDeltaKg = Number((last.weightKg - first.weightKg).toFixed(2));
  const weeklyKg = (realDeltaKg / days) * 7;              // negativo = pérdida
  const pctPerWeek = (-weeklyKg / first.weightKg) * 100;  // positivo = pérdida
  const currentDeficit = Number.isFinite(profile.kcalDeficit) ? profile.kcalDeficit : 400;

  if (pctPerWeek > WEEKLY_LOSS.fastPct) {
    // Demasiado rápido → riesgo de masa magra → comer ~100-150 kcal MÁS (bajar déficit).
    const suggestedDeficit = Math.max(minDeficit, currentDeficit - stepKcal);
    if (suggestedDeficit === currentDeficit) return null; // ya en el piso
    return {
      kind: 'too_fast',
      decision: 'decrease_deficit',
      pctPerWeek: Number(pctPerWeek.toFixed(2)),
      weeklyKg: Number(weeklyKg.toFixed(2)),
      days, currentDeficit, suggestedDeficit,
      delta: suggestedDeficit - currentDeficit,
      message: `En ${days} días vas a ${pctPerWeek.toFixed(2)} %/sem (${Math.abs(weeklyKg).toFixed(2)} kg/sem). Sobre 0,8 %/sem hay riesgo de perder masa magra.`,
    };
  }

  if (pctPerWeek < WEEKLY_LOSS.slowPct) {
    // Lento (≥2 sem) → extender la DURACIÓN del cardio. NO recortar calorías ni sumar días.
    const verb = pctPerWeek >= 0 ? 'bajando' : 'subiendo';
    return {
      kind: 'too_slow',
      decision: 'extend_cardio',
      pctPerWeek: Number(pctPerWeek.toFixed(2)),
      weeklyKg: Number(weeklyKg.toFixed(2)),
      days, currentDeficit,
      message: `En ${days} días vas ${verb} ${Math.abs(pctPerWeek).toFixed(2)} %/sem (objetivo 0,5-0,7 %). Extiende la duración del cardio; no recortes más calorías ni agregues días.`,
    };
  }

  return null; // 0.4-0.8 %/sem (incluye el óptimo 0.5-0.7): sin banner
}

// Formatea la lista como texto plano para compartir
function formatShoppingListText(list, refDate = todayKey()) {
  const lines = [];
  lines.push(`🛒 Lista de compras · semana ${refDate}`);
  lines.push(`(basada en lo que comiste los últimos ${list.windowDays} días)`);
  lines.push('');
  for (const g of list.groups) {
    lines.push(g.label);
    for (const it of g.items) {
      const qty = it.count > 1 ? ` ×${it.count}` : '';
      lines.push(`  ☐ ${it.name}${qty}`);
    }
    lines.push('');
  }
  if (list.totalItems === 0) {
    lines.push('Sin items registrados en el período. Marca tus comidas durante la semana y vuelve a generar.');
  }
  return lines.join('\n');
}

function computeRecents(days, limit = 10, windowDays = 21) {
  const now = Date.now();
  const cutoff = now - windowDays * 86400000;
  const buckets = new Map();
  for (const [dateKey, day] of Object.entries(days || {})) {
    if (!day?.extras?.length) continue;
    const ts = new Date(dateKey + 'T12:00:00').getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const ageDays = Math.max(0, (now - ts) / 86400000);
    const recencyWeight = Math.exp(-ageDays / 10);
    for (const item of day.extras) {
      const norm = normalizeName(item.name);
      if (!norm) continue;
      const existing = buckets.get(norm);
      if (existing) {
        existing.count += 1;
        existing.score += recencyWeight;
        if (ts > existing.lastTs) {
          existing.lastTs = ts;
          existing.sample = item;
        }
      } else {
        buckets.set(norm, { norm, count: 1, score: recencyWeight, lastTs: ts, sample: item });
      }
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((b) => ({
      name: b.sample.name,
      kcal: Number(b.sample.kcal) || 0,
      protein: Number(b.sample.protein) || 0,
      carbs: Number(b.sample.carbs) || 0,
      fat: Number(b.sample.fat) || 0,
      fiber: Number(b.sample.fiber) || 0,
      count: b.count,
    }));
}

function dayMetsTarget(totals, targets) {
  if (!totals || !totals.eatenAny) return false;
  const T = targets || DEFAULT_TARGETS;
  return (
    totals.kcal >= T.kcalMin &&
    totals.kcal <= T.kcalRed &&
    totals.protein >= T.proteinYellow
  );
}

function computeStreak(days, snackBank, proteinBank, targets, refDate, dessertBank, customAntojoItems) {
  const today = refDate || todayKey();
  let current = 0;
  let best = 0;
  let run = 0;
  let lastBrokenDate = null;

  // Buscar hasta 365 días atrás
  const allKeys = Object.keys(days || {}).filter((k) => k <= today).sort();
  if (allKeys.length === 0) {
    return { current: 0, best: 0, lastBrokenDate: null, todayMet: false };
  }
  const earliest = allKeys[0];

  // Best ever: iterar desde el día más antiguo hasta hoy
  let cursor = earliest;
  while (cursor <= today) {
    const totals = computeDayTotals(days[cursor], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (dayMetsTarget(totals, targets)) {
      run++;
      if (run > best) best = run;
    } else {
      if (run > 0) lastBrokenDate = cursor;
      run = 0;
    }
    cursor = shiftDate(cursor, 1);
  }

  // Current: contar hacia atrás desde hoy
  cursor = today;
  while (cursor >= earliest) {
    const totals = computeDayTotals(days[cursor], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (dayMetsTarget(totals, targets)) {
      current++;
      cursor = shiftDate(cursor, -1);
    } else {
      break;
    }
  }

  const todayTotals = computeDayTotals(days[today], snackBank, proteinBank, targets, dessertBank, customAntojoItems);
  return {
    current,
    best,
    lastBrokenDate,
    todayMet: dayMetsTarget(todayTotals, targets),
    todayHasData: !!todayTotals.eatenAny,
  };
}

function computeComparison(state, dateKey, targets) {
  const days = state.days || {};
  const weights = state.weights || [];
  const snackBank = state.snackBank || [];
  const proteinBank = state.proteinBank || [];
  const dessertBank = state.dessertBank || [];
  const customAntojo = state.antojoCustomItems || [];

  const current = days[dateKey];
  if (!current) return null;
  const cT = computeDayTotals(current, snackBank, proteinBank, targets, dessertBank, customAntojo);
  if (!cT.eatenAny) return null;

  const buildEntry = (offsetDays) => {
    const k = shiftDate(dateKey, -offsetDays);
    const day = days[k];
    if (!day) return null;
    const t = computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojo);
    if (!t.eatenAny) return null;
    const weight = weights.find((w) => w.date === k && w.weightKg != null);
    return {
      dateKey: k,
      kcalDelta: Math.round(cT.kcal - t.kcal),
      proteinDelta: Math.round(cT.protein - t.protein),
      kcal: Math.round(cT.kcal),
      prevKcal: Math.round(t.kcal),
      protein: Math.round(cT.protein),
      prevProtein: Math.round(t.protein),
      weight: weight?.weightKg ?? null,
    };
  };

  const weekAgo = buildEntry(7);
  const monthAgo = buildEntry(28);
  if (!weekAgo && !monthAgo) return null;

  // Delta de peso: comparar último peso ≤ dateKey con último peso ≤ shiftDate(-7) y ≤ shiftDate(-28)
  const lastWeightOnOrBefore = (k) => {
    const ws = weights.filter((w) => w.weightKg != null && (w.date || '') <= k)
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return ws.length ? ws[ws.length - 1].weightKg : null;
  };
  const currentWeight = lastWeightOnOrBefore(dateKey);
  const weekAgoWeight = lastWeightOnOrBefore(shiftDate(dateKey, -7));
  const monthAgoWeight = lastWeightOnOrBefore(shiftDate(dateKey, -28));

  return {
    weekAgo: weekAgo ? {
      ...weekAgo,
      kgDelta: (currentWeight != null && weekAgoWeight != null)
        ? Number((currentWeight - weekAgoWeight).toFixed(1))
        : null,
    } : null,
    monthAgo: monthAgo ? {
      ...monthAgo,
      kgDelta: (currentWeight != null && monthAgoWeight != null)
        ? Number((currentWeight - monthAgoWeight).toFixed(1))
        : null,
    } : null,
  };
}

function computeTrendAnalysis(weights, days, snackBank, proteinBank, targets, dessertBank, customAntojoItems) {
  const sorted = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const d1 = new Date(prev.date + 'T12:00:00');
  const d2 = new Date(last.date + 'T12:00:00');
  const diasReal = Math.round((d2 - d1) / 86400000);
  if (diasReal < 1) return null;

  const deltaKg = Number((last.weightKg - prev.weightKg).toFixed(2));

  let kcalSum = 0, daysCount = 0;
  for (let i = 0; i < diasReal; i++) {
    const d = new Date(d1); d.setDate(d.getDate() + i);
    const k = todayKey(d);
    const day = days[k];
    if (!day) continue;
    const totals = computeDayTotals(day, snackBank, proteinBank, targets, dessertBank, customAntojoItems);
    if (totals.eatenAny) { kcalSum += totals.kcalNet; daysCount++; }
  }

  const promedioKcal = daysCount > 0 ? Math.round(kcalSum / daysCount) : null;
  const balanceDiario = (deltaKg * KCAL_PER_KG_FAT) / diasReal;
  const tdeeEstimado = promedioKcal != null ? Math.round(promedioKcal - balanceDiario) : null;
  const deficitDiario = (promedioKcal != null && tdeeEstimado != null) ? tdeeEstimado - promedioKcal : null;

  return { last, prev, diasReal, deltaKg, promedioKcal, balanceDiario, tdeeEstimado, deficitDiario, daysCount };
}

// Métricas de composición para el análisis de evolución de largo plazo.
// `better: 'down'` → bajar es mejor (en déficit); `'up'` → subir es mejor (músculo).
// `eps` = cambio mínimo (en unidades de la métrica) para contar como movimiento;
// por debajo se considera 'estable'. Un umbral relativo único no sirve porque las
// bases difieren mucho (105 kg de peso vs 14 de visceral).
const EVOLUTION_METRICS = [
  { key: 'weightKg',         label: 'Peso',            unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'bodyFatPct',       label: '% grasa',         unit: '%',  better: 'down', decimals: 1, eps: 0.2 },
  { key: 'fatKg',            label: 'Grasa',           unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'muscleKg',         label: 'Masa muscular',   unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'skeletalMuscleKg', label: 'Músculo esq.',    unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'visceralFat',      label: 'Grasa visceral',  unit: '',   better: 'down', decimals: 1, eps: 0.5 },
  { key: 'subcutaneousFatKg',label: 'Grasa subcutánea',unit: 'kg', better: 'down', decimals: 1, eps: 0.2 },
  { key: 'waistCm',          label: 'Cintura',         unit: 'cm', better: 'down', decimals: 1, eps: 0.5 },
  { key: 'hipCm',            label: 'Cadera',          unit: 'cm', better: 'down', decimals: 1, eps: 0.5 },
  { key: 'waistHipRatio',    label: 'Cintura-cadera',  unit: '',   better: 'down', decimals: 2, eps: 0.02 },
  { key: 'bmi',              label: 'IMC',             unit: '',   better: 'down', decimals: 1, eps: 0.15 },
  { key: 'fatFreeMassKg',    label: 'Masa libre grasa',unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'proteinKg',        label: 'Masa proteica',   unit: 'kg', better: 'up',   decimals: 1, eps: 0.2 },
  { key: 'ffmi',             label: 'FFMI',            unit: '',   better: 'up',   decimals: 1, eps: 0.15 },
];

// Analiza la trayectoria completa (primer pesaje → último) de cada métrica de
// composición. `goal` invierte la dirección deseada para objetivos de subir masa.
function computeEvolution(weights, goal) {
  const sorted = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const gain = goal === 'gain';
  const metrics = [];
  for (const m of EVOLUTION_METRICS) {
    const pts = sorted.filter((w) => w[m.key] != null);
    if (pts.length < 2) continue;
    const first = Number(pts[0][m.key]);
    const last = Number(pts[pts.length - 1][m.key]);
    const delta = Number((last - first).toFixed(2));
    const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
    const d1 = new Date(pts[0].date + 'T12:00:00');
    const d2 = new Date(pts[pts.length - 1].date + 'T12:00:00');
    const days = Math.max(1, Math.round((d2 - d1) / 86400000));
    const weekly = Number(((delta / days) * 7).toFixed(2));

    // Dirección deseada: en 'gain' se invierte salvo el músculo, que siempre sube.
    let better = m.better;
    if (gain && m.key !== 'muscleKg' && m.key !== 'skeletalMuscleKg') {
      better = m.better === 'down' ? 'up' : 'down';
    }

    // Zona muerta: cambio menor al eps de la métrica se considera estable.
    let status;
    if (Math.abs(delta) < (m.eps || 0.2)) status = 'estable';
    else if (better === 'down') status = delta < 0 ? 'mejora' : 'empeora';
    else status = delta > 0 ? 'mejora' : 'empeora';

    metrics.push({ ...m, first, last, delta, pct, days, weekly, better, status });
  }
  if (metrics.length === 0) return null;

  const firstW = sorted[0];
  const lastW = sorted[sorted.length - 1];
  const spanDays = Math.max(1, Math.round(
    (new Date(lastW.date + 'T12:00:00') - new Date(firstW.date + 'T12:00:00')) / 86400000));

  // Recomposición: baja grasa (peso o %grasa o grasa kg) sin perder músculo.
  const fatDown = metrics.some((x) => (x.key === 'fatKg' || x.key === 'bodyFatPct' || x.key === 'weightKg') && x.delta < 0);
  const muscle = metrics.find((x) => x.key === 'muscleKg' || x.key === 'skeletalMuscleKg');
  const muscleKept = muscle && muscle.delta >= -0.2;
  const recomp = fatDown && muscleKept;

  return { metrics, count: sorted.length, firstDate: firstW.date, lastDate: lastW.date, spanDays, recomp };
}

function interpretTrend(data, targets) {
  if (!data) return null;
  const T = targets || DEFAULT_TARGETS;
  const { deltaKg, daysCount, tdeeEstimado } = data;
  if (daysCount < 3) {
    return { icon: 'ℹ️', tone: 'amber', text: 'Pocos días registrados — el promedio puede no ser representativo.' };
  }
  if (deltaKg > 0.3) {
    return { icon: '⚠️', tone: 'red', text: 'Subiste peso. Revisa si registraste todas las comidas o si necesitas más déficit.' };
  }
  if (tdeeEstimado != null && tdeeEstimado < T.kcalMin) {
    return { icon: '⚠️', tone: 'amber', text: 'Tu déficit estimado es alto — riesgo de catabolismo muscular.' };
  }
  if (tdeeEstimado != null && tdeeEstimado > T.kcalMax + 500) {
    return { icon: 'ℹ️', tone: 'amber', text: 'Podrías subir kcal sin perder déficit.' };
  }
  if (deltaKg <= 0) {
    return { icon: '✅', tone: 'green', text: 'Vas en línea con tu objetivo de bajar grasa.' };
  }
  return { icon: 'ℹ️', tone: 'amber', text: 'Resultado mixto — sigue trackeando.' };
}

function colorForKcal(kcal, targets) {
  const T = targets || DEFAULT_TARGETS;
  if (kcal > T.kcalRed) return 'red';
  if (kcal > T.kcalMax) return 'amber';
  if (kcal < T.kcalMin) return 'amber';
  return 'green';
}

function colorForProtein(g, targets) {
  const T = targets || DEFAULT_TARGETS;
  if (g >= T.proteinMin) return 'green';
  if (g >= T.proteinYellow) return 'amber';
  return 'red';
}

function colorForMacro(value, target, tolerance = 0.15) {
  if (!target) return 'amber';
  const lower = target * (1 - tolerance);
  const upper = target * (1 + tolerance);
  if (value < lower) return 'amber';
  if (value > upper) return 'red';
  return 'green';
}

function colorForFiber(g, target) {
  if (!target) return 'amber';
  if (g >= target) return 'green';
  if (g >= target * 0.7) return 'amber';
  return 'red';
}

const COLOR_CLASSES = {
  green: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30', dot: 'bg-emerald-500' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/30', dot: 'bg-amber-500' },
  red: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100 dark:bg-rose-900/30', dot: 'bg-rose-500' },
};

function showLocalNotification(title, body, tag) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // Si hay Service Worker activo, usarlo (mejor en mobile)
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'show-notification', title, body, tag,
      });
    } else {
      new Notification(title, { body, tag });
    }
  } catch (e) {
    console.warn('Notification error:', e?.message);
  }
}

function useNotificationScheduler(notifSettings) {
  useEffect(() => {
    if (!notifSettings?.enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const STORAGE_FIRED = 'plan-hugo-notif-fired';
    const loadFired = () => {
      try { return JSON.parse(localStorage.getItem(STORAGE_FIRED) || '{}'); } catch { return {}; }
    };
    const saveFired = (obj) => {
      try { localStorage.setItem(STORAGE_FIRED, JSON.stringify(obj)); } catch {}
    };

    const slots = [
      { key: 'almuerzo', label: 'Almuerzo', body: '¿Ya almorzaste? Recuerda marcar tu comida.', time: notifSettings.almuerzo },
      { key: 'agua',     label: 'Agua',     body: 'Recordatorio de hidratación: revisa tu meta de agua.', time: notifSettings.agua },
      { key: 'cena',     label: 'Cena',     body: 'Recordatorio de cena: marca tu cena al terminar.', time: notifSettings.cena },
    ];

    const tick = () => {
      const now = new Date();
      const today = todayKey(now);
      const fired = loadFired();
      const todayFired = fired[today] || {};
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      let changed = false;
      for (const s of slots) {
        if (!s.time) continue;
        if (hhmm >= s.time && !todayFired[s.key]) {
          showLocalNotification('Plan Hugo · ' + s.label, s.body, 'plan-hugo-' + s.key);
          todayFired[s.key] = true;
          changed = true;
        }
      }
      if (changed) {
        // Limpiar entradas de >2 días para no acumular
        const cutoff = shiftDate(today, -2);
        const cleaned = Object.fromEntries(Object.entries({ ...fired, [today]: todayFired }).filter(([k]) => k >= cutoff));
        saveFired(cleaned);
      }
    };

    tick();
    const id = setInterval(tick, 60000); // 1 min
    return () => clearInterval(id);
  }, [notifSettings?.enabled, notifSettings?.almuerzo, notifSettings?.agua, notifSettings?.cena]);
}

function usePersistentState() {
  const [state, setState] = useState(() => loadState());
  // null = guardado OK; string = mensaje de error visible para el usuario.
  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    const result = saveState(state);
    setSaveError(result === 'ok' ? null : 'No se pudo guardar en este dispositivo — probablemente falta espacio. Libera datos del sitio o exporta un respaldo antes de seguir.');
  }, [state]);
  return [state, setState, saveError];
}

function ProgressBar({ value, max, color, label, unit, target }) {
  const cls = COLOR_CLASSES[color];
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-sm font-semibold ${cls.text}`}>
          {Math.round(value)}{unit} <span className="text-gray-400 dark:text-gray-500 font-normal">/ {target}{unit}</span>
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${cls.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MacroChip({ label, value, target, color, unit }) {
  const cls = COLOR_CLASSES[color];
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0;
  return (
    <div className="rounded-xl px-2 py-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`text-[10px] font-semibold ${cls.text}`}>{pct}%</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-sm font-bold ${cls.text}`}>{Math.round(value)}</span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">/ {Math.round(target)}{unit}</span>
      </div>
      <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${cls.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WaterRing({ ml, targetMl }) {
  const pctRaw = targetMl > 0 ? (ml / targetMl) * 100 : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const pctLabel = Math.round(pctRaw);
  const R = 18, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <div className="rounded-xl px-2 py-1.5 bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/40 flex items-center gap-2">
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
        <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" className="text-sky-200 dark:text-sky-900" strokeWidth="3" />
        <circle cx="22" cy="22" r={R} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`} transform="rotate(-90 22 22)" />
        <text x="22" y="26" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300" fontSize="11" fontWeight="700">{pctLabel}%</text>
      </svg>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-300">💧 Agua</div>
        <div className="text-sm font-bold text-sky-900 dark:text-sky-100">{ml}<span className="text-[10px] font-normal"> / {targetMl} ml</span></div>
      </div>
    </div>
  );
}

function BentoTodayHero({ totals, targets, streak, onStreakClick, weightSeries, state }) {
  const T = targets || DEFAULT_TARGETS;
  const kcalEaten = Math.round(totals.kcal);
  const kcalTarget = T.kcalMax;
  const kcalBurned = Math.round(totals.kcalBurned);
  const kcalRemaining = Math.round(totals.kcalRemaining);
  const kcalPct = Math.min(100, kcalTarget > 0 ? (kcalEaten / kcalTarget) * 100 : 0);
  const C = 2 * Math.PI * 70;

  const macros = [
    { label: 'Proteína', v: Math.round(totals.protein), t: T.proteinMin,   color: 'var(--bento-warm)'   },
    { label: 'Carbos',   v: Math.round(totals.carbs),   t: T.carbsTarget,  color: 'var(--bento-yellow)' },
    { label: 'Grasa',    v: Math.round(totals.fat),     t: T.fatTarget,    color: 'var(--bento-warm)'   },
    { label: 'Fibra',    v: Math.round(totals.fiber),   t: T.fiberTarget,  color: 'var(--bento-lilac)'  },
  ];

  const ws = (weightSeries || []).slice().filter((w) => w.weightKg != null)
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || ''))).slice(-7);
  const lastWeight = ws.length ? ws[ws.length - 1] : null;
  const firstWeight = ws.length > 1 ? ws[0] : null;
  const deltaKg = lastWeight && firstWeight ? Math.round((lastWeight.weightKg - firstWeight.weightKg) * 10) / 10 : null;

  let path = '', pts = [];
  if (ws.length >= 2) {
    const wsVals = ws.map((w) => w.weightKg);
    const wMin = Math.min(...wsVals) - 0.2, wMax = Math.max(...wsVals) + 0.2;
    pts = ws.map((w, i) => [(i / (ws.length - 1)) * 100, 30 - ((w.weightKg - wMin) / (wMax - wMin || 1)) * 30]);
    path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  }

  const days = state?.days || {};
  const chips = [];
  const todayK = todayKey();
  for (let i = 6; i >= 0; i--) {
    const k = shiftDate(todayK, -i);
    const day = days[k];
    const tot = computeDayTotals(day, state?.snackBank, state?.proteinBank, targets, state?.dessertBank, state?.antojoCustomItems || []);
    let met = null;
    if (tot.eatenAny) {
      const kcalC = colorForKcal(tot.kcal, T);
      const protC = colorForProtein(tot.protein, T);
      met = (kcalC === 'red' || protC === 'red') ? false : (kcalC === 'green' && protC === 'green') ? true : null;
    }
    const dow = new Date(k + 'T12:00:00').getDay();
    chips.push({ k, label: ['D','L','M','M','J','V','S'][dow], met, isToday: i === 0 });
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {/* Energía */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Energía · hoy</span>
          <span className="bento-label">objetivo {kcalTarget}</span>
        </div>
        <div className="flex items-center gap-4">
          <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
            <svg width="140" height="140" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="70" fill="none" stroke="var(--bento-surface)" strokeWidth="14" />
              <circle cx="80" cy="80" r="70" fill="none"
                stroke={kcalRemaining < 0 ? 'var(--bento-warm)' : 'var(--bento-ink)'}
                strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${(kcalPct/100)*C} ${C}`} transform="rotate(-90 80 80)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {kcalRemaining >= 0 ? kcalRemaining : Math.abs(kcalRemaining)}
              </div>
              <div className="bento-label" style={{ marginTop: 4, fontSize: 10 }}>{kcalRemaining >= 0 ? 'kcal restantes' : 'kcal sobre'}</div>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="bento-label">Comido</div>
              <div className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{kcalEaten} <span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}>kcal</span></div>
            </div>
            {kcalBurned > 0 && (
              <div>
                <div className="bento-label">Quemado</div>
                <div className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--bento-pos)' }}>−{kcalBurned} <span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}>kcal</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Macros */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="mb-3"><span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Macros</span></div>
        <div className="space-y-2.5">
          {macros.map((m) => {
            const pct = Math.min(100, m.t > 0 ? (m.v / m.t) * 100 : 0);
            return (
              <div key={m.label}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-medium" style={{ color: 'var(--bento-muted)' }}>{m.label}</span>
                  <span className="text-xs bento-mono" style={{ color: 'var(--bento-ink)', fontVariantNumeric: 'tabular-nums' }}>{m.v}<span style={{ color: 'var(--bento-faint)' }}>/{m.t}g</span></span>
                </div>
                <div style={{ height: 4, background: 'var(--bento-surface)', borderRadius: 99, marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: m.color, borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peso */}
      <div className="bento-card" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Peso</span>
          {deltaKg != null && (
            <span className="bento-mono text-xs" style={{ color: deltaKg < 0 ? 'var(--bento-pos)' : deltaKg > 0 ? 'var(--bento-warm)' : 'var(--bento-faint)' }}>{deltaKg > 0 ? '+' : ''}{deltaKg} kg / 7d</span>
          )}
        </div>
        {lastWeight ? (
          <>
            <div className="text-3xl font-bold" style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{lastWeight.weightKg}<span className="text-xs font-normal" style={{ color: 'var(--bento-faint)' }}> kg</span></div>
            {path && (
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 56, marginTop: 12 }}>
                <path d={path + ` L100,30 L0,30 Z`} fill="var(--bento-pos)" opacity="0.13" />
                <path d={path} fill="none" stroke="var(--bento-pos)" strokeWidth="0.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {pts.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 1.4 : 0.8} fill={i === pts.length - 1 ? 'var(--bento-pos)' : 'var(--bento-card)'} stroke="var(--bento-pos)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            )}
          </>
        ) : (
          <div className="text-sm py-3" style={{ color: 'var(--bento-faint)' }}>Sin mediciones aún.</div>
        )}
      </div>

      {/* Día / racha */}
      <div className="bento-card" style={{ minWidth: 0, cursor: streak ? 'pointer' : 'default' }} onClick={() => streak && onStreakClick && onStreakClick()}>
        <div className="mb-3"><span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>Día</span></div>
        <div className="flex gap-1.5 mb-3">
          {chips.map((c, i) => (
            <div key={i} style={{
              flex: 1, height: 32, borderRadius: 6,
              background: c.isToday ? 'var(--bento-ink)' : c.met === true ? 'var(--bento-ink)' : c.met === false ? 'var(--bento-warm)' : 'var(--bento-surface)',
              opacity: c.met === null && !c.isToday ? 0.55 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
              color: (c.isToday || c.met !== null) ? 'var(--bento-on-ink)' : 'var(--bento-faint)',
            }}>{c.label}</div>
          ))}
        </div>
        <div className="bento-label">Racha · mejor {streak?.best || 0}</div>
        {streak && (
          <div className="mt-1 text-2xl font-bold" style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{streak.current || 0} <span className="text-sm font-normal" style={{ color: 'var(--bento-faint)' }}>días</span></div>
        )}
      </div>
    </div>
  );
}

function ProgressPanel({ totals, targets, streak, onStreakClick }) {
  const T = targets || DEFAULT_TARGETS;
  const kcalColor = colorForKcal(totals.kcal, T);
  const proteinColor = colorForProtein(totals.protein, T);
  const carbsColor = colorForMacro(totals.carbs, T.carbsTarget);
  const fatColor = colorForMacro(totals.fat, T.fatTarget);
  const fiberColor = colorForFiber(totals.fiber, T.fiberTarget);
  const kcalRemaining = Math.round(totals.kcalRemaining);
  const proteinRemaining = Math.round(totals.proteinRemaining);

  return (
    <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 safe-top">
      {streak && (streak.current > 0 || streak.best > 0) && (
        <div className="mb-2 flex items-center justify-end">
          <StreakChip streak={streak} onClick={onStreakClick} />
        </div>
      )}
      <ProgressBar value={totals.kcal} max={T.kcalRed} color={kcalColor} label="Calorías" unit=" kcal" target={T.kcalMax} />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2 ${kcalRemaining >= 0 ? COLOR_CLASSES[kcalColor].bg : COLOR_CLASSES.red.bg}`}>
          <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">
            {kcalRemaining >= 0 ? 'Quedan' : 'Te pasaste'}
          </div>
          <div className={`text-lg font-bold ${kcalRemaining >= 0 ? COLOR_CLASSES[kcalColor].text : COLOR_CLASSES.red.text}`}>
            {Math.abs(kcalRemaining)} <span className="text-xs font-normal">kcal</span>
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2 ${proteinRemaining <= 0 ? COLOR_CLASSES.green.bg : COLOR_CLASSES[proteinColor].bg}`}>
          <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">
            {proteinRemaining <= 0 ? 'Meta proteína' : 'Faltan prot'}
          </div>
          <div className={`text-lg font-bold ${proteinRemaining <= 0 ? COLOR_CLASSES.green.text : COLOR_CLASSES[proteinColor].text}`}>
            {proteinRemaining <= 0 ? '✓' : <>{proteinRemaining}<span className="text-xs font-normal">g</span></>}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <MacroChip label="Prot" value={totals.protein} target={T.proteinMin} color={proteinColor} unit="g" />
        <MacroChip label="Carb" value={totals.carbs} target={T.carbsTarget} color={carbsColor} unit="g" />
        <MacroChip label="Grasa" value={totals.fat} target={T.fatTarget} color={fatColor} unit="g" />
        <MacroChip label="Fibra" value={totals.fiber} target={T.fiberTarget} color={fiberColor} unit="g" />
      </div>

      <div className="mt-2">
        <WaterRing ml={Math.round(totals.waterMl)} targetMl={T.waterTarget} />
      </div>

      {totals.kcalBurned > 0 && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
          <span>🔥</span>
          <span><span className="font-semibold text-gray-900 dark:text-gray-100">{Math.round(totals.kcalBurned)}</span> kcal quemadas hoy</span>
        </div>
      )}

      {totals.eatenAny && (kcalColor === 'red' || proteinColor === 'red') && (
        <div className="mt-2 flex flex-wrap gap-2">
          {kcalColor === 'red' && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              ⚠️ Sobre meta de kcal
            </span>
          )}
          {proteinColor === 'red' && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              ⚠️ Proteína baja
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function OnboardingModal({ state, setState, onClose, editing = false }) {
  const lastWeight = (state.weights || [])
    .filter((w) => w.weightKg != null)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .pop();
  const lastHeight = (state.weights || [])
    .filter((w) => w.heightCm != null)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .pop();
  const seed = state.userProfile || {};

  const [age, setAge] = useState(seed.age != null ? String(seed.age) : '');
  const [sex, setSex] = useState(seed.sex || 'M');
  const [heightCm, setHeightCm] = useState(
    seed.heightCm != null ? String(seed.heightCm) : (lastHeight?.heightCm != null ? String(lastHeight.heightCm) : '')
  );
  const [weightKg, setWeightKg] = useState(
    seed.weightKg != null ? String(seed.weightKg) : (lastWeight?.weightKg != null ? String(lastWeight.weightKg) : '')
  );
  const [activityLevel, setActivityLevel] = useState(seed.activityLevel || 'moderate');
  const [goal, setGoal] = useState(seed.goal || 'lose');
  const [override, setOverride] = useState(false);
  const [kcalManual, setKcalManual] = useState(seed.kcalTarget != null ? String(seed.kcalTarget) : '');
  const [proteinManual, setProteinManual] = useState(seed.proteinTarget != null ? String(seed.proteinTarget) : '');

  const profileDraft = useMemo(() => ({
    age: Number(age) || null,
    sex,
    heightCm: Number(heightCm) || null,
    weightKg: Number(weightKg) || null,
    activityLevel,
    goal,
    kcalTarget: override && kcalManual !== '' ? Number(kcalManual) : null,
    proteinTarget: override && proteinManual !== '' ? Number(proteinManual) : null,
    kcalDeficit: Number.isFinite(seed.kcalDeficit) ? seed.kcalDeficit : 400,
    lastAdjustmentDate: seed.lastAdjustmentDate || null,
  }), [age, sex, heightCm, weightKg, activityLevel, goal, override, kcalManual, proteinManual, seed.kcalDeficit, seed.lastAdjustmentDate]);

  const targets = useMemo(() => calcTargets(profileDraft), [profileDraft]);

  const canSave = profileDraft.age && profileDraft.heightCm && profileDraft.weightKg;

  const save = () => {
    if (!canSave) return;
    setState((prev) => ({
      ...prev,
      userProfile: {
        ...profileDraft,
        onboardedAt: prev.userProfile?.onboardedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
    onClose && onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? '⚙️ Mi perfil' : '👋 Configura tu plan'}</h2>
          {editing && onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
          )}
        </div>
        {!editing && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Calculamos tu meta de calorías y macros con Mifflin-St Jeor. Lo puedes editar después en Ajustes.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Edad</span>
            <input type="number" inputMode="numeric" min="10" max="100" value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sexo</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['M', 'F'].map((s) => (
                <button type="button" key={s} onClick={() => setSex(s)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium ${
                    sex === s ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{s === 'M' ? '♂ Hombre' : '♀ Mujer'}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Altura (cm)</span>
            <input type="number" inputMode="decimal" step="0.1" value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Peso actual (kg)</span>
            <input type="number" inputMode="decimal" step="0.1" value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nivel de actividad</div>
          <div className="space-y-1.5">
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
              <button type="button" key={k} onClick={() => setActivityLevel(k)}
                className={`w-full text-left px-3 py-2 rounded-xl border-2 ${
                  activityLevel === k ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>
                <div className="text-sm font-semibold">{v.label}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">{v.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Objetivo</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'lose', label: 'Bajar', sub: '−400 kcal' },
              { id: 'maintain', label: 'Mantener', sub: '±0' },
              { id: 'gain', label: 'Subir', sub: '+300 kcal' },
            ].map((g) => (
              <button type="button" key={g.id} onClick={() => setGoal(g.id)}
                className={`py-2.5 rounded-xl border-2 ${
                  goal === g.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>
                <div className="text-sm font-semibold">{g.label}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{g.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {canSave && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Tus metas calculadas</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">TMB (Mifflin-St Jeor)</div>
                <div className="font-bold">{targets.bmr || '—'} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">TDEE</div>
                <div className="font-bold">{targets.tdee || '—'} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Meta diaria</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">{targets.kcalMax} <span className="text-[10px] font-normal">kcal</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Proteína</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">{targets.proteinMin}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Carbos</div>
                <div className="font-bold">{targets.carbsTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Grasas</div>
                <div className="font-bold">{targets.fatTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Fibra</div>
                <div className="font-bold">{targets.fiberTarget}<span className="text-[10px] font-normal">g</span></div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Agua</div>
                <div className="font-bold text-sky-700 dark:text-sky-300">{targets.waterTarget}<span className="text-[10px] font-normal">ml</span></div>
              </div>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-emerald-500" />
          <div>
            <div className="text-sm font-medium">Sobrescribir kcal/proteína manualmente</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Útil si tu nutricionista te dio un número distinto.</div>
          </div>
        </label>
        {override && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">kcal/día</span>
              <input type="number" inputMode="numeric" value={kcalManual} onChange={(e) => setKcalManual(e.target.value)}
                placeholder={String(targets.kcalMax)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g)</span>
              <input type="number" inputMode="numeric" value={proteinManual} onChange={(e) => setProteinManual(e.target.value)}
                placeholder={String(targets.proteinMin)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {editing && onClose && (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          )}
          <button onClick={save} disabled={!canSave}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
            {editing ? 'Guardar cambios' : 'Comenzar ✨'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MealCard({ meal, day, skipped, onToggleItem, onMarkAll, onSkipToggle, onAddItem, onRemoveItem, customAntojoItems, fixed = true, targets }) {
  const T = targets || DEFAULT_TARGETS;
  const customItems = meal.id === 'antojo' ? (customAntojoItems || []) : [];
  const items = mealItemsFor(meal, customItems);
  const ticks = getMealItemTicks(day, meal, customItems);
  const tickedItems = items.filter((it) => ticks[it.id]);
  const totalMeal = mealTotals(meal, customItems);
  const totalEaten = {
    kcal:    tickedItems.reduce((s, x) => s + (Number(x.kcal)    || 0), 0),
    protein: tickedItems.reduce((s, x) => s + (Number(x.protein) || 0), 0),
  };
  const allTicked  = items.length > 0 && tickedItems.length === items.length;
  const anyTicked  = tickedItems.length > 0;

  const kcalPct = T.kcalMax > 0 ? Math.round((totalMeal.kcal / T.kcalMax) * 100) : 0;
  const protPct = T.proteinMin > 0 ? Math.round((totalMeal.protein / T.proteinMin) * 100) : 0;

  const borderClass = skipped
    ? 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/40 opacity-70'
    : allTicked
    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
    : anyTicked
    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900';

  const labelTone = skipped
    ? 'text-gray-500 dark:text-gray-400 line-through'
    : allTicked
    ? 'text-emerald-700 dark:text-emerald-300'
    : anyTicked
    ? 'text-amber-700 dark:text-amber-300'
    : 'text-gray-500 dark:text-gray-400';

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  const resetForm = () => setForm({ label: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  const submitForm = () => {
    if (!form.label.trim()) return;
    onAddItem && onAddItem({
      label: form.label.trim(),
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      fiber: Number(form.fiber) || 0,
    });
    resetForm();
    setAdding(false);
  };

  return (
    <div className={`w-full rounded-2xl border-2 overflow-hidden transition-all ${borderClass}`}>
      <div className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl shrink-0">{skipped ? '🚫' : (meal.emoji || '🍽️')}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>{meal.label}</span>
              {fixed && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">FIJA</span>}
              {meal.time && <span className="text-xs text-gray-500 dark:text-gray-400">{meal.time}</span>}
              {skipped && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300">SALTADA</span>}
              {!skipped && anyTicked && !allTicked && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">PARCIAL</span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{Math.round(totalEaten.kcal)}</span>
              <span className="opacity-70"> / {Math.round(totalMeal.kcal)}</span> kcal
              <span className="text-[10px] opacity-70"> ({kcalPct}% día max)</span>
              {' · '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">{Math.round(totalEaten.protein)}</span>
              <span className="opacity-70"> / {Math.round(totalMeal.protein)}</span>g prot
              <span className="text-[10px] opacity-70"> ({protPct}%)</span>
            </div>
          </div>
        </div>
      </div>

      <ul className={`px-4 pb-2 space-y-1.5 ${skipped ? 'opacity-50' : ''}`}>
        {items.map((it) => {
          const isOn = !!ticks[it.id];
          const isCustom = !!it.custom;
          return (
            <li key={it.id} className="flex items-center gap-3">
              <button type="button" onClick={() => !skipped && onToggleItem && onToggleItem(it.id)} disabled={skipped}
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors disabled:cursor-not-allowed ${
                  isOn
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}>
                {isOn && <span className="text-xs font-bold">✓</span>}
              </button>
              <button type="button" onClick={() => !skipped && onToggleItem && onToggleItem(it.id)} disabled={skipped}
                className="flex-1 min-w-0 text-left disabled:cursor-not-allowed">
                <div className={`text-sm leading-snug ${isOn ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'} ${skipped ? 'line-through' : ''}`}>
                  {it.label}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{it.kcal}</span> kcal · <span className="font-semibold text-gray-700 dark:text-gray-300">{it.protein}</span>g prot
                </div>
              </button>
              {isCustom && onRemoveItem && !skipped && (
                <button type="button" onClick={() => onRemoveItem(it.id)} title="Quitar ítem custom"
                  className="shrink-0 w-6 h-6 rounded text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">🗑️</button>
              )}
            </li>
          );
        })}
      </ul>

      {meal.extensible && !skipped && onAddItem && (
        <div className="px-4 pb-2">
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)}
              className="w-full py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
              + Agregar ítem
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2.5 space-y-2">
              <input type="text" placeholder="Nombre del ítem" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  ['kcal', 'kcal'],
                  ['protein', 'P'],
                  ['carbs', 'C'],
                  ['fat', 'G'],
                  ['fiber', 'Fib'],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="block text-[10px] text-gray-500 dark:text-gray-400 text-center">{label}</span>
                    <input type="number" inputMode="numeric" step="0.1" value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full px-1.5 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-center" />
                  </label>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={submitForm} disabled={!form.label.trim()}
                  className="flex-1 py-1.5 rounded bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700">
                  Guardar
                </button>
                <button type="button" onClick={() => { resetForm(); setAdding(false); }}
                  className="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex border-t-2 border-gray-100 dark:border-gray-800">
        {!skipped && onMarkAll && items.length > 0 && (
          <button type="button" onClick={() => onMarkAll(!allTicked)}
            className="flex-1 px-3 py-1.5 text-[11px] font-semibold bg-white/50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border-r border-gray-100 dark:border-gray-800">
            {allTicked ? '↺ Desmarcar todo' : '✅ Marcar todo'}
          </button>
        )}
        {onSkipToggle && (
          <button type="button" onClick={onSkipToggle}
            className={`flex-1 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              skipped
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                : 'bg-white/50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>
            {skipped ? '↩️ Deshacer "no comí"' : '🚫 No comí'}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectableCard({ item, selected, eaten, onClick, onToggleEaten, showCategory, targets }) {
  const emoji = emojiForFood(item.name);
  const T = targets || DEFAULT_TARGETS;
  const kcalPct = T.kcalMax > 0 ? Math.round((item.kcal / T.kcalMax) * 100) : 0;
  const protPct = T.proteinMin > 0 ? Math.round((item.protein / T.proteinMin) * 100) : 0;
  const baseBorder = selected
    ? (eaten ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
             : 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10')
    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700';
  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${baseBorder}`}>
      <button type="button" onClick={onClick}
        className="w-full text-left p-3.5 active:scale-[0.98] transition-transform">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0 leading-none mt-0.5">{emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm leading-snug">{item.name}</div>
              {selected && (
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</span>
              )}
            </div>
            {showCategory && item.category && (
              <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wide">{item.category}</span>
            )}
            <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
              <span className="text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{item.kcal}</span> kcal <span className="text-[10px] opacity-70">({kcalPct}%)</span></span>
              <span className="text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{item.protein}g</span> prot <span className="text-[10px] opacity-70">({protPct}%)</span></span>
            </div>
          </div>
        </div>
      </button>
      {selected && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onToggleEaten && onToggleEaten(); }}
          className={`w-full px-3 py-2 text-xs font-semibold border-t-2 transition-colors ${
            eaten
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
          }`}>
          {eaten ? '✓ Comido' : 'Marcar como comido'}
        </button>
      )}
    </div>
  );
}

function SectionHeader({ title, hint }) {
  return (
    <div className="px-1 pt-2 pb-1.5">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function DessertSection({ meal, dessertBank, day, eaten, onSelect, onToggleEaten, targets, onSuggest }) {
  const selectedId = meal === 'almuerzo' ? day.dessertAlmuerzoId : day.dessertCenaId;
  const eatenKey = meal === 'almuerzo' ? 'dessertAlmuerzo' : 'dessertCena';
  const [expanded, setExpanded] = useState(!!selectedId);

  useEffect(() => {
    if (selectedId) setExpanded(true);
  }, [selectedId]);

  const items = dessertBank || [];
  if (!items.length) return null;

  return (
    <div className="ml-2 pl-3 border-l-2 border-pink-200 dark:border-pink-900/40">
      <div className="flex items-center justify-between py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          🍰 Postre (opcional) <span className="text-[10px] ml-1">{expanded ? '▼' : '▶'}</span>
        </button>
        {onSuggest && expanded && (
          <button type="button" onClick={onSuggest}
            className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
            🤔 sugerir
          </button>
        )}
      </div>
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
          {items.map((d) => (
            <SelectableCard
              key={d.id}
              item={d}
              selected={selectedId === d.id}
              eaten={selectedId === d.id && !!eaten[eatenKey]}
              onClick={() => onSelect(meal, d.id)}
              onToggleEaten={() => onToggleEaten(meal)}
              targets={targets}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAddForm({ title, fields, initial, onSave, onCancel }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields) v[f.name] = initial?.[f.name] ?? (f.type === 'number' ? '' : '');
    return v;
  });

  const submit = (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          if (f.optional) { out[f.name] = 0; continue; }
          return;
        }
        out[f.name] = n;
      } else {
        const s = String(raw).trim();
        if (!s && !f.optional) return;
        out[f.name] = s;
      }
    }
    onSave({ ...(initial || {}), ...out });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {f.label}{f.optional && <span className="text-gray-400 dark:text-gray-500"> (opcional)</span>}
            </span>
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              min={f.type === 'number' ? '0' : undefined}
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              placeholder={f.placeholder}
              autoFocus={f.name === fields[0].name}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// Modal para editar una comida YA registrada. Trae un multiplicador de porción que
// escala todos los macros desde un snapshot base (½ / ×1 / ×1.5 / ×2), o se editan a mano.
function LoggedItemModal({ initial, onSave, onCancel }) {
  const baseRef = React.useRef({
    kcal: Number(initial?.kcal) || 0,
    protein: Number(initial?.protein) || 0,
    carbs: Number(initial?.carbs) || 0,
    fat: Number(initial?.fat) || 0,
    fiber: Number(initial?.fiber) || 0,
  });
  const [name, setName] = useState(initial?.name || '');
  const [vals, setVals] = useState({ ...baseRef.current });
  const [mult, setMult] = useState(1);

  const applyMult = (f) => {
    const b = baseRef.current;
    setMult(f);
    setVals({
      kcal: Math.round(b.kcal * f),
      protein: Math.round(b.protein * f),
      carbs: Math.round(b.carbs * f),
      fat: Math.round(b.fat * f),
      fiber: Math.round(b.fiber * f),
    });
  };
  const setField = (k, raw) => { setMult(null); setVals((v) => ({ ...v, [k]: raw })); };

  const submit = (e) => {
    e.preventDefault();
    const nm = name.trim();
    const kcal = Number(vals.kcal);
    if (!nm || !Number.isFinite(kcal) || kcal < 0) return;
    onSave({
      name: nm,
      kcal: Math.round(kcal),
      protein: Math.max(0, Math.round(Number(vals.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(vals.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(vals.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(vals.fiber) || 0)),
    });
  };

  const MACROS = [
    { k: 'kcal', label: 'Calorías' },
    { k: 'protein', label: 'Proteína (g)' },
    { k: 'carbs', label: 'Carbos (g)' },
    { k: 'fat', label: 'Grasa (g)' },
    { k: 'fiber', label: 'Fibra (g)' },
  ];
  const PORTIONS = [0.5, 1, 1.5, 2];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Editar comida</h2>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción</span>
          <div className="mt-1 flex gap-2">
            {PORTIONS.map((f) => (
              <button key={f} type="button" onClick={() => applyMult(f)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${mult === f ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400'}`}>
                {f === 0.5 ? '½' : f === 1 ? '×1' : '×' + f}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((m) => (
            <label key={m.k} className={m.k === 'kcal' ? 'col-span-2 block' : 'block'}>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{m.label}</span>
              <input type="number" inputMode="numeric" min="0" value={vals[m.k]}
                onChange={(e) => setField(m.k, e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// Modal para repetir las comidas registradas de un día anterior. Un tap copia todos los
// extras de ese día a hoy (ids/ts nuevos, source 'repeat').
function RepeatDayModal({ days, todayKeyStr, onAdd, onCancel }) {
  const prior = useMemo(() => (
    Object.entries(days || {})
      .filter(([k, d]) => k !== todayKeyStr && Array.isArray(d?.extras) && d.extras.length > 0)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([k, d]) => ({
        key: k,
        items: d.extras,
        kcal: d.extras.reduce((s, e) => s + (Number(e.kcal) || 0), 0),
      }))
  ), [days, todayKeyStr]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Repetir un día</h2>
        {prior.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay días anteriores con comidas registradas.</p>
        ) : prior.map((d) => (
          <button key={d.key} onClick={() => onAdd(d.items)}
            className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-emerald-400 active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{formatDateLabel(d.key, todayKeyStr)}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{d.items.length} {d.items.length === 1 ? 'ítem' : 'ítems'} · {Math.round(d.kcal)} kcal</span>
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{d.items.map((e) => e.name).join(', ')}</div>
          </button>
        ))}
        <button onClick={onCancel} className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cerrar</button>
      </div>
    </div>
  );
}

function DayItemList({ title, icon, items, onAdd, onRemove, onEdit, addLabel, emptyHint, renderMeta, iconForItem, headerExtra, totalLabel }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
        </div>
        {totalLabel ? (
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{totalLabel}</span>
        ) : items.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>
        )}
      </div>
      {headerExtra && (
        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">{headerExtra}</div>
      )}
      {items.length === 0 ? (
        <div className="px-4 pb-3 text-sm text-gray-500 dark:text-gray-400 italic">{emptyHint}</div>
      ) : (
        <div className={headerExtra ? '' : 'border-t border-gray-100 dark:border-gray-800'}>
          {items.map((item, i) => (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 && !headerExtra ? '' : 'border-t border-gray-100 dark:border-gray-800'}`}>
              {iconForItem && <span className="text-xl shrink-0 leading-none">{iconForItem(item)}</span>}
              {onEdit ? (
                <button type="button" onClick={() => onEdit(item)} className="flex-1 min-w-0 text-left">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{renderMeta(item)}</div>
                </button>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{renderMeta(item)}</div>
                </div>
              )}
              <button onClick={() => onRemove(item.id)} aria-label="Borrar"
                className="shrink-0 w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-base hover:bg-rose-100 dark:hover:bg-rose-900/50">✕</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onAdd} className="w-full py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border-t border-gray-100 dark:border-gray-800">
        + {addLabel}
      </button>
    </div>
  );
}

function BarcodeScannerModal({ onCancel, onDetected }) {
  const videoRef = React.useRef(null);
  const readerRef = React.useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | searching | not_found | error
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastBarcode, setLastBarcode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let reader = null;

    const start = async () => {
      try {
        const ZXing = await loadZXing();
        if (cancelled) return;
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.QR_CODE,
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        reader = new ZXing.BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        setStatus('scanning');
        await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          async (result, err) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (text === lastBarcode) return;
              setLastBarcode(text);
              setStatus('searching');
              try {
                const product = await searchOpenFoodFacts(text);
                if (cancelled) return;
                if (product) {
                  reader.reset();
                  onDetected(product);
                } else {
                  setStatus('not_found');
                  setError(`Código ${text} no está en OpenFoodFacts. Ingresa el producto manualmente o intenta otro.`);
                  // Permitir reintentar
                  setTimeout(() => { if (!cancelled) { setStatus('scanning'); setLastBarcode(null); } }, 3000);
                }
              } catch (e) {
                if (!cancelled) {
                  setStatus('scanning');
                  setError(e.message || 'Error consultando OpenFoodFacts');
                  setLastBarcode(null);
                }
              }
            }
          }
        );
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e?.message || 'No se pudo acceder a la cámara');
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      try { reader?.reset(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryManual = async () => {
    if (!manualBarcode.trim()) return;
    setStatus('searching'); setError(null);
    try {
      const product = await searchOpenFoodFacts(manualBarcode.trim());
      if (product) {
        try { readerRef.current?.reset(); } catch {}
        onDetected(product);
      } else {
        setStatus('not_found');
        setError(`Código ${manualBarcode.trim()} no está en OpenFoodFacts.`);
      }
    } catch (e) {
      setStatus('not_found');
      setError(e.message || 'Error consultando OpenFoodFacts');
    }
  };

  const close = () => {
    try { readerRef.current?.reset(); } catch {}
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Escanear código</h2>
          <button onClick={close} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {(status === 'starting' || status === 'searching') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
              {status === 'starting' ? 'Iniciando cámara…' : 'Buscando en OpenFoodFacts…'}
            </div>
          )}
          {status === 'scanning' && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          )}
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
          {status === 'scanning' && 'Apunta la cámara al código de barras del producto'}
          {status === 'searching' && 'Buscando datos nutricionales…'}
          {status === 'not_found' && lastBarcode && `Detectado: ${lastBarcode}`}
          {status === 'error' && 'No se pudo abrir la cámara'}
        </p>

        {error && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
            ⚠️ {error}
          </p>
        )}

        <div className="border-t border-gray-200 dark:border-gray-800 pt-3 space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">O ingresa el código manualmente:</div>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Ej. 7802950002543"
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono" />
            <button onClick={tryManual} disabled={!manualBarcode.trim() || status === 'searching'}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300">
              Buscar
            </button>
          </div>
        </div>

        <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Datos de <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" className="underline">OpenFoodFacts</a> (gratis, libre). No siempre tiene todos los productos chilenos.
        </p>
      </div>
    </div>
  );
}

function AddExtraModal({ apiKey, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [portion, setPortion] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null); // { confidence }
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [fromBarcode, setFromBarcode] = useState(null); // {barcode, name}
  const [tags, setTags] = useState([]); // ['dulce', 'delivery', 'alcohol']

  const toggleTag = (tag) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const applyProductData = (product) => {
    setShowScanner(false);
    setName(String(product.name || ''));
    setPortion(String(product.portion || ''));
    setKcal(String(Math.round(Number(product.kcal) || 0)));
    setProtein(String(Math.round(Number(product.protein) || 0)));
    setCarbs(String(Math.round(Number(product.carbs) || 0)));
    setFat(String(Math.round(Number(product.fat) || 0)));
    setFiber(String(Number(product.fiber || 0).toFixed(1)));
    setEstimated(null);
    setFromBarcode({ barcode: product.barcode, name: product.name });
    setError(null);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const newAtt = await Promise.all(files.slice(0, room).map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const canEstimate = (name.trim().length > 0 || attachments.length > 0);

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe el nombre o sube una foto.'); return; }
    setEstimating(true); setError(null);
    try {
      const data = await estimateExtraMacros({ name, attachments, apiKey });
      if (data?.name && !name.trim()) setName(String(data.name));
      if (data?.portion) setPortion(String(data.portion));
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      if (data?.protein != null) setProtein(String(Math.round(Number(data.protein) || 0)));
      if (data?.carbs != null) setCarbs(String(Math.round(Number(data.carbs) || 0)));
      if (data?.fat != null) setFat(String(Math.round(Number(data.fat) || 0)));
      if (data?.fiber != null) setFiber(String(Number(data.fiber).toFixed(1)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k < 0) {
      setError('Necesitas nombre y kcal.');
      return;
    }
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const finalName = portion ? `${name.trim()} (${portion})` : name.trim();
    onSave({
      name: finalName,
      kcal: k,
      protein: num(protein),
      carbs: num(carbs),
      fat: num(fat),
      fiber: num(fiber),
      tags: tags.length ? tags.slice() : undefined,
      source: estimated ? 'haiku-estimate' : 'manual',
    });
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Agregar extra</h2>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder='Ej. Café latte, galleta'
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        </label>

        {/* Adjuntos */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a, i) => (
              <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="block py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-medium text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
            <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
            📷 Foto
          </label>
          <button type="button" onClick={() => setShowScanner(true)}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            📊 Código de barras
          </button>
          <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
            className="py-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-xs hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
            {estimating ? 'Estimando…' : '✨ Estimar'}
          </button>
        </div>
        {fromBarcode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <span>📊</span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              Datos de OpenFoodFacts · código {fromBarcode.barcode}
            </span>
          </div>
        )}
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para estimar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Estimación con confianza {estimated.confidence} (Haiku) · Edita si necesitas
            </span>
          </div>
        )}

        {portion && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción estimada</span>
            <input type="text" value={portion} onChange={(e) => setPortion(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        )}

        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1.5">Etiquetas (opcional, cuentan para reglas)</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { tag: 'dulce', label: '🍰 Dulce' },
              { tag: 'delivery', label: '🍱 Delivery' },
              { tag: 'alcohol', label: '🍷 Alcohol' },
            ].map((t) => (
              <button type="button" key={t.tag} onClick={() => toggleTag(t.tag)}
                className={`py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                  tags.includes(t.tag)
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías</span>
          <input type="number" inputMode="numeric" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={protein} onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Carbos (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={carbs} onChange={(e) => setCarbs(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Grasas (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="numeric" min="0" value={fat} onChange={(e) => setFat(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fibra (g) <span className="text-gray-400">(opt)</span></span>
            <input type="number" inputMode="decimal" step="0.1" min="0" value={fiber} onChange={(e) => setFiber(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
      {showScanner && (
        <BarcodeScannerModal
          onCancel={() => setShowScanner(false)}
          onDetected={applyProductData} />
      )}
    </div>
  );
}

// Lista compacta de alimentos registrados (vía WhatsApp/bridge o captura) asignados a un slot
// del plan (colación/cena), para mostrarlos DENTRO de su sección en vez de en "Extras del día".
function SlotLoggedItems({ items, onRemove, onEdit }) {
  if (!items || items.length === 0) return null;
  const meta = (item) => (
    <>
      <span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal
      {item.protein > 0 && <> · P <span className="font-semibold text-gray-700 dark:text-gray-300">{item.protein}g</span></>}
      {item.carbs > 0 && <> · C {Math.round(item.carbs)}g</>}
      {item.fat > 0 && <> · G {Math.round(item.fat)}g</>}
      {item.fiber > 0 && <> · F {Number(item.fiber).toFixed(0)}g</>}
    </>
  );
  return (
    <div className="mt-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">📝 Registrado</div>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xl shrink-0 leading-none">{emojiForFood(item.name)}</span>
          {onEdit ? (
            <button type="button" onClick={() => onEdit(item)} className="flex-1 min-w-0 text-left">
              <div className="font-medium text-sm truncate">{item.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{meta(item)}</div>
            </button>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{item.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{meta(item)}</div>
            </div>
          )}
          <button onClick={() => onRemove(item.id)} aria-label="Borrar"
            className="shrink-0 w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-base hover:bg-rose-100 dark:hover:bg-rose-900/50">✕</button>
        </div>
      ))}
    </div>
  );
}

function ExtrasSection({ day, onUpdate, apiKey, tryWithRules, onRemoveExtra, onEditExtra }) {
  const [adding, setAdding] = useState(false);
  const allItems = day.extras || [];
  // Solo la cubeta 'extra' se lista aquí; colación/cena se muestran dentro de sus secciones.
  const items = allItems.filter((e) => extraSlotBucket(e) === 'extra');

  const handleSave = (item) => {
    const tagSet = new Set(item.tags || []);
    // Determinar qué acciones aplica
    const actions = ['add_extra'];
    if (tagSet.has('dulce')) actions.push('add_dulce');
    if (tagSet.has('delivery')) actions.push('add_delivery');
    if (tagSet.has('alcohol')) actions.push('add_alcohol');

    const doSave = () => {
      onUpdate({ extras: [...allItems, { ...item, id: uuid(), ts: Date.now() }] });
      setAdding(false);
    };

    if (tryWithRules) {
      tryWithRules(actions, { prospectiveKcal: item.kcal || 0 }, doSave);
    } else {
      doSave();
    }
  };
  const handleRemove = onRemoveExtra || ((id) => { onUpdate({ extras: allItems.filter((e) => e.id !== id) }); });

  return (
    <>
      <DayItemList title="Extras del día" icon="🍪" items={items}
        iconForItem={(item) => emojiForFood(item.name)}
        onAdd={() => setAdding(true)} onRemove={handleRemove} onEdit={onEditExtra}
        addLabel="Agregar extra" emptyHint="Sin extras hoy"
        renderMeta={(item) => (
          <>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal
            {item.protein > 0 && <> · P <span className="font-semibold text-gray-700 dark:text-gray-300">{item.protein}g</span></>}
            {item.carbs > 0 && <> · C {Math.round(item.carbs)}g</>}
            {item.fat > 0 && <> · G {Math.round(item.fat)}g</>}
            {item.fiber > 0 && <> · F {Number(item.fiber).toFixed(0)}g</>}
          </>
        )}
      />
      {adding && (
        <AddExtraModal apiKey={apiKey}
          onCancel={() => setAdding(false)} onSave={handleSave}
        />
      )}
    </>
  );
}

const MEAL_SLOTS = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍚' },
  { id: 'colacion', label: 'Colación', emoji: '🥪' },
  { id: 'cena', label: 'Cena', emoji: '🍽️' },
  { id: 'antojo', label: 'Antojo', emoji: '🍫' },
  { id: 'extra', label: 'Extra', emoji: '➕' },
];

function MealPhotoModal({ state, setState, dateKey, onClose }) {
  const [attachments, setAttachments] = useState([]);
  const [freeText, setFreeText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [slot, setSlot] = useState('extra');
  const apiKey = state.settings?.anthropicApiKey;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} imágenes.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos.`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0 && !freeText.trim()) {
      setError('Sube una foto o describe lo que comiste.');
      return;
    }
    setProcessing(true); setError(null);
    try {
      const data = await extractMealFromInputs({ attachments, freeText, apiKey });
      const items = Array.isArray(data?.items) ? data.items : [];
      setExtracted({
        ...data,
        items: items.map((it) => ({
          id: uuid(),
          name: String(it.name || 'Sin nombre'),
          portion: String(it.portion || ''),
          kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
          protein: Math.max(0, Math.round(Number(it.protein) || 0)),
          carbs: Math.max(0, Math.round(Number(it.carbs) || 0)),
          fat: Math.max(0, Math.round(Number(it.fat) || 0)),
          fiber: Math.max(0, Number(it.fiber) || 0),
        })),
      });
    } catch (err) {
      setError(err.message || 'Error procesando');
    } finally {
      setProcessing(false);
    }
  };

  const updateItem = (id, patch) => {
    setExtracted((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  };

  const removeItem = (id) => {
    setExtracted((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  };

  const totals = useMemo(() => {
    const items = extracted?.items || [];
    return {
      kcal: items.reduce((s, x) => s + (Number(x.kcal) || 0), 0),
      protein: items.reduce((s, x) => s + (Number(x.protein) || 0), 0),
      carbs: items.reduce((s, x) => s + (Number(x.carbs) || 0), 0),
      fat: items.reduce((s, x) => s + (Number(x.fat) || 0), 0),
      fiber: items.reduce((s, x) => s + (Number(x.fiber) || 0), 0),
    };
  }, [extracted]);

  const confirm = () => {
    if (!extracted?.items?.length) return;
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      const day = { ...(days[dateKey] || {}) };
      const extras = Array.isArray(day.extras) ? [...day.extras] : [];
      for (const it of extracted.items) {
        const namePieces = [it.name];
        if (it.portion) namePieces.push(`(${it.portion})`);
        extras.push({
          id: uuid(),
          ts: Date.now(),
          name: namePieces.join(' '),
          kcal: it.kcal, protein: it.protein,
          carbs: it.carbs, fat: it.fat, fiber: it.fiber,
          mealSlot: slot,
          source: attachments.length ? 'photo' : 'text',
        });
      }
      day.extras = extras;
      if (slot !== 'extra') {
        day.eaten = { ...(day.eaten || {}), [slot]: true };
      }
      days[dateKey] = day;
      return { ...prev, days };
    });
    onClose();
  };

  const confidenceColor = extracted?.confidence === 'alta' ? 'green' : extracted?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📷 Foto / Voz / Texto</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {!extracted && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
              ))}
              {attachments.length < MAX_IMAGES && (
                <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
                  <span className="text-gray-400">📸</span>
                </label>
              )}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Describe lo que comiste (opcional — puedes dictar 🎤)
              </span>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
                placeholder='Ej. "Dos huevos revueltos con palta y café con leche"'
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </label>

            <button onClick={handleProcess} disabled={processing || !apiKey || (attachments.length === 0 && !freeText.trim())}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
              {processing ? 'Estimando macros…' : 'Estimar macros con Claude ✨'}
            </button>
            {!apiKey && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </>
        )}

        {extracted && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
              <span className="text-base">{extracted.confidence === 'alta' ? '✅' : extracted.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
              <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
                Confianza {extracted.confidence}{extracted.notes ? ` · ${extracted.notes}` : ''}
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Alimentos detectados</div>
              <div className="space-y-2">
                {extracted.items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xl shrink-0">{emojiForFood(it.name)}</span>
                      <div className="flex-1 min-w-0">
                        <input type="text" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })}
                          className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none" />
                        <input type="text" value={it.portion} onChange={(e) => updateItem(it.id, { portion: e.target.value })}
                          placeholder="porción"
                          className="w-full text-[11px] text-gray-500 dark:text-gray-400 bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none mt-0.5" />
                      </div>
                      <button onClick={() => removeItem(it.id)} className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 text-xs shrink-0">✕</button>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {[
                        ['kcal', 'kcal'],
                        ['protein', 'P'],
                        ['carbs', 'C'],
                        ['fat', 'G'],
                        ['fiber', 'F'],
                      ].map(([field, label]) => (
                        <label key={field} className="block">
                          <span className="text-[9px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{label}</span>
                          <input type="number" inputMode="decimal" step={field === 'fiber' ? '0.1' : '1'} min="0"
                            value={it[field]}
                            onChange={(e) => updateItem(it.id, { [field]: Number(e.target.value) || 0 })}
                            className="mt-0.5 w-full px-1.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-xs grid grid-cols-5 gap-1.5">
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">kcal</div><div className="font-bold">{totals.kcal}</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">P</div><div className="font-bold">{totals.protein}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">C</div><div className="font-bold">{totals.carbs}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">G</div><div className="font-bold">{totals.fat}g</div></div>
              <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">F</div><div className="font-bold">{Number(totals.fiber).toFixed(1)}g</div></div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Asignar a</div>
              <div className="grid grid-cols-3 gap-1.5">
                {MEAL_SLOTS.map((s) => (
                  <button key={s.id} onClick={() => setSlot(s.id)}
                    className={`py-2 rounded-xl border-2 text-xs font-semibold ${
                      slot === s.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                    }`}>
                    <span className="mr-1">{s.emoji}</span>{s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setExtracted(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">
                ← Volver
              </button>
              <button onClick={confirm} disabled={!extracted.items.length}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300">
                Agregar al día
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function CoachModal({ state, setState, dateKey, targets, onClose, onOpenSubstitution }) {
  const day = state.days[dateKey] || {};
  const totals = useMemo(
    () => computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []),
    [day, state.snackBank, state.proteinBank, targets, state.dessertBank]
  );
  const T = targets || DEFAULT_TARGETS;
  const apiKey = state.settings?.anthropicApiKey;

  const sig = hashSig({
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    fiber: totals.fiber,
    water: totals.waterMl,
    burned: totals.kcalBurned,
    dateKey,
    hour: new Date().getHours(),
  });

  const cache = state.aiCache?.coach?.[dateKey];
  const cached = cache?.sig === sig ? cache.response : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const now = new Date();
      const hora = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      const eaten = day.eaten || {};
      const slotsPendientes = [];
      if (!eaten.desayuno) slotsPendientes.push('desayuno');
      if (!eaten.almuerzo) slotsPendientes.push('almuerzo');
      if (!eaten.colacion) slotsPendientes.push('colación');
      if (!eaten.cena) slotsPendientes.push('cena');

      const prompt = `Eres el coach nutricional de Hugo (geriatra chileno, hombre). Sé directo, conciso, sin alarmismo. USA TUTEO CHILENO (tú, tienes, puedes). NO uses voseo argentino (vos, tenés, podés). Nada de "che", "dale".

ESTADO AHORA:
- Hora local: ${hora}
- Calorías: ${Math.round(totals.kcal)} / ${T.kcalMax} kcal (meta diaria)
- Proteína: ${Math.round(totals.protein)} / ${T.proteinMin} g
- Carbos: ${Math.round(totals.carbs)} / ${T.carbsTarget} g
- Grasas: ${Math.round(totals.fat)} / ${T.fatTarget} g
- Fibra: ${Math.round(totals.fiber)} / ${T.fiberTarget} g
- Agua: ${totals.waterMl} / ${T.waterTarget} ml
- Ejercicio quemado hoy: ${Math.round(totals.kcalBurned)} kcal
- Comidas sin marcar todavía: ${slotsPendientes.length ? slotsPendientes.join(', ') : 'ninguna'}

Devuelve SOLO JSON, sin markdown, así:
{
  "headline": "1 línea con titular accionable (máx 80 chars)",
  "suggestion": "2-3 líneas concretas: qué hacer ahora dado el estado",
  "microActions": [
    { "label": "etiqueta corta", "kind": "water250|water500|substitution|none" }
  ]
}

Reglas:
- microActions: máximo 2, tappables. Usa kind="water250" o "water500" si conviene tomar agua, "substitution" si sugieres pedir opciones de comida, "none" si solo es texto.
- headline corto, suggestion concreta (no genérica)
- Conservador, sin pánico, sin culpar`;

      const text = await askClaude(prompt, apiKey, 600, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed) {
        setError('No se pudo parsear la respuesta del coach.');
        return;
      }
      const resp = {
        headline: String(parsed.headline || ''),
        suggestion: String(parsed.suggestion || ''),
        microActions: Array.isArray(parsed.microActions) ? parsed.microActions.slice(0, 2) : [],
      };
      setResponse(resp);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          coach: {
            ...(prev.aiCache?.coach || {}),
            [dateKey]: { sig, response: resp, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar al coach');
    } finally {
      setLoading(false);
    }
  };

  // Si no hay respuesta y hay API key, generar de una al abrir el modal
  useEffect(() => {
    if (!response && apiKey && !loading) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMicroAction = (action) => {
    if (action.kind === 'water250' || action.kind === 'water500') {
      const ml = action.kind === 'water500' ? 500 : 250;
      setState((prev) => {
        const days = { ...(prev.days || {}) };
        const d = { ...(days[dateKey] || {}) };
        d.water = { ...(d.water || {}), ml: (Number(d.water?.ml) || 0) + ml };
        days[dateKey] = d;
        return { ...prev, days };
      });
    } else if (action.kind === 'substitution') {
      onClose();
      onOpenSubstitution && onOpenSubstitution();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">💬 Coach del día</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {loading && (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Pensando…
          </div>
        )}

        {!apiKey && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
            ⚠️ Configura tu API key en ⚙️ Ajustes primero.
          </p>
        )}

        {response && !loading && (
          <div className="space-y-3">
            {response.headline && (
              <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3">
                <p className="text-sm font-bold text-sky-900 dark:text-sky-100">{response.headline}</p>
              </div>
            )}
            {response.suggestion && (
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{response.suggestion}</p>
            )}
            {response.microActions && response.microActions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {response.microActions.map((a, i) => (
                  <button key={i} onClick={() => handleMicroAction(a)}
                    className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Cacheado por estado del día</span>
              <button onClick={generate} disabled={loading}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                Regenerar
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function SubstitutionModal({ state, setState, dateKey, targets, onClose }) {
  const day = state.days[dateKey] || {};
  const totals = useMemo(
    () => computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []),
    [day, state.snackBank, state.proteinBank, targets, state.dessertBank]
  );
  const T = targets || DEFAULT_TARGETS;
  const apiKey = state.settings?.anthropicApiKey;

  const [kcalBudget, setKcalBudget] = useState(Math.max(0, Math.round(totals.kcalRemaining)));
  const [proteinBudget, setProteinBudget] = useState(Math.max(0, Math.round(totals.proteinRemaining)));
  const [tipo, setTipo] = useState('cualquiera');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(state.aiCache?.lastSubstitution?.response?.options || null);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const banco = [
        ...state.snackBank.map((s) => ({ name: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat, fiber: s.fiber, tipo: 'colación' })),
        ...state.proteinBank.map((p) => ({ name: p.name, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, tipo: 'cena/proteína' })),
      ];
      const now = new Date();
      const hora = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      const prompt = `Eres un nutricionista chileno. Dame OPCIONES realistas de alimentos para una persona adulta (Hugo, hombre chileno, geriatra de UC CHRISTUS).

CONTEXTO ahora:
- Hora local: ${hora}
- Le quedan ${kcalBudget} kcal y ${proteinBudget}g proteína para llegar a meta
- Tipo de comida buscada: ${tipo}

Su BANCO favorito (priorízalo si encaja):
${JSON.stringify(banco, null, 2)}

Devuelve SOLO JSON, sin markdown, con esta forma:
{
  "options": [
    {
      "name": "...",
      "portion": "...",
      "kcal": n,
      "protein": n,
      "carbs": n,
      "fat": n,
      "fiber": n,
      "rationale": "1 frase corta de por qué encaja"
    }
  ]
}

Reglas:
- 4 a 6 opciones
- Realistas para Chile (lácteos Colun, proteínas comunes, frutas locales)
- Si su banco tiene algo que encaja, inclúyelo con su nombre exacto
- Usa TUTEO chileno (tú, tienes), no voseo
- Sé conservador con porciones`;

      const text = await askClaude(prompt, apiKey, 1200, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed?.options?.length) {
        setError('No se pudo parsear la respuesta. Reintenta.');
        return;
      }
      const opts = parsed.options.map((o) => ({
        id: uuid(),
        name: String(o.name || ''),
        portion: String(o.portion || ''),
        kcal: Math.max(0, Math.round(Number(o.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(o.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(o.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(o.fat) || 0)),
        fiber: Math.max(0, Number(o.fiber) || 0),
        rationale: String(o.rationale || ''),
      }));
      setOptions(opts);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          lastSubstitution: {
            request: { kcalBudget, proteinBudget, tipo },
            response: { options: opts, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const addAsExtra = (opt) => {
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      const d = { ...(days[dateKey] || {}) };
      const extras = Array.isArray(d.extras) ? [...d.extras] : [];
      const nameWithPortion = opt.portion ? `${opt.name} (${opt.portion})` : opt.name;
      extras.push({
        id: uuid(),
        name: nameWithPortion,
        kcal: opt.kcal, protein: opt.protein,
        carbs: opt.carbs, fat: opt.fat, fiber: opt.fiber,
        source: 'substitution',
      });
      d.extras = extras;
      days[dateKey] = d;
      return { ...prev, days };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🔄 ¿Qué puedo comer ahora?</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Margen kcal</span>
            <input type="number" inputMode="numeric" value={kcalBudget}
              onChange={(e) => setKcalBudget(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Margen proteína (g)</span>
            <input type="number" inputMode="numeric" value={proteinBudget}
              onChange={(e) => setProteinBudget(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tipo</div>
          <div className="grid grid-cols-3 gap-1.5">
            {['cualquiera', 'liviano', 'sustancioso', 'dulce', 'salado'].map((t) => (
              <button key={t} onClick={() => setTipo(t)}
                className={`py-2 rounded-xl border-2 text-xs font-semibold capitalize ${
                  tipo === t ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !apiKey}
          className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          {loading ? 'Pensando…' : (options ? 'Generar de nuevo' : 'Generar opciones ✨')}
        </button>
        {!apiKey && (
          <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
        )}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        {options && options.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Opciones</div>
            {options.map((o) => (
              <div key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-xl shrink-0">{emojiForFood(o.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{o.name}</div>
                    {o.portion && <div className="text-xs text-gray-500 dark:text-gray-400">{o.portion}</div>}
                    <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">{o.kcal}</span> kcal · P {o.protein}g · C {o.carbs}g · G {o.fat}g · F {Number(o.fiber).toFixed(0)}g
                    </div>
                    {o.rationale && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">{o.rationale}</p>}
                  </div>
                  <button onClick={() => { addAsExtra(o); onClose(); }}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                    Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const NOTE_FIELDS = [
  { key: 'energy', label: 'Energía', emoji: '⚡', low: 'Cansado', high: 'Lleno' },
  { key: 'hunger', label: 'Hambre', emoji: '🍴', low: 'Sin hambre', high: 'Muy hambriento' },
  { key: 'sleep', label: 'Sueño', emoji: '😴', low: 'Mal', high: 'Excelente' },
  { key: 'mood', label: 'Ánimo', emoji: '😊', low: 'Bajo', high: 'Alto' },
];

function DailyNotesCard({ day, onUpdate }) {
  const notes = day?.notes || null;
  const hasNotes = notes && NOTE_FIELDS.some((f) => notes[f.key] != null);
  const [expanded, setExpanded] = useState(hasNotes);
  const [comment, setComment] = useState(notes?.comment || '');

  useEffect(() => {
    setComment(notes?.comment || '');
  }, [notes?.comment]);

  const setField = (key, value) => {
    const next = { ...(notes || {}), [key]: value };
    onUpdate({ notes: next });
  };
  const commitComment = (v) => {
    const trimmed = v.slice(0, 200);
    setComment(trimmed);
    const next = { ...(notes || {}), comment: trimmed };
    onUpdate({ notes: next });
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📓</span>
          <div className="text-left">
            <div className="text-sm font-semibold">Notas del día</div>
            {hasNotes && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {NOTE_FIELDS.filter((f) => notes[f.key] != null).map((f) => `${f.emoji} ${notes[f.key]}`).join(' · ')}
                {notes.comment ? ` · "${notes.comment.slice(0, 30)}${notes.comment.length > 30 ? '…' : ''}"` : ''}
              </div>
            )}
            {!hasNotes && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Cómo te sentiste hoy (energía, sueño, hambre, ánimo)</div>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-800">
          {NOTE_FIELDS.map((f) => {
            const val = notes?.[f.key];
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.emoji} {f.label}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{val ? `${val} / 5` : '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n}
                      onClick={() => setField(f.key, val === n ? null : n)}
                      className={`flex-1 h-7 rounded-md text-xs font-semibold transition-colors ${
                        val != null && n <= val
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-0.5">
                  <span>{f.low}</span>
                  <span>{f.high}</span>
                </div>
              </div>
            );
          })}
          <label className="block pt-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">💬 Comentario (opcional)</span>
            <input type="text" value={comment}
              onChange={(e) => commitComment(e.target.value)}
              placeholder="Ej. mucho estrés en CSCA, salí a caminar..."
              maxLength={200}
              className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <span className="text-[10px] text-gray-400 mt-0.5 block">{comment.length}/200</span>
          </label>
        </div>
      )}
    </div>
  );
}

function WaterTracker({ day, onUpdate, target }) {
  const ml = Number(day?.water?.ml) || 0;            // agua que Hugo marca en la app (editable con +/-)
  const bridgeMl = Number(day?.water?.bridgeMl) || 0; // agua registrada por chat (section water[])
  const totalMl = ml + bridgeMl;                      // lo que se MUESTRA y cuenta para la meta
  const targetMl = target || 3000;
  const adjust = (delta) => onUpdate({ water: { ...(day?.water || {}), ml: Math.max(0, ml + delta) } });
  const pct = Math.max(0, Math.min(100, Math.round((totalMl / targetMl) * 100)));
  const reached = totalMl >= targetMl;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💧</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Agua</h3>
          <span className={`text-[11px] font-bold ${reached ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'}`}>
            {pct}%
          </span>
          {bridgeMl > 0 && (
            <span className="text-[10px] text-sky-500 dark:text-sky-400" title="Registrada por chat">💬 {bridgeMl} ml</span>
          )}
        </div>
        <span className={`text-xs font-semibold ${reached ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
          {totalMl} / {targetMl} ml
        </span>
      </div>
      <div className="px-4">
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-3">
        <button onClick={() => adjust(250)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+250</button>
        <button onClick={() => adjust(500)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+500</button>
        <button onClick={() => adjust(750)} className="py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200">+750</button>
        <button onClick={() => adjust(-250)} disabled={ml <= 0}
          className="py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:bg-gray-200 disabled:opacity-40">−250</button>
      </div>
    </div>
  );
}

function WorkoutCaptureModal({ apiKey, onClose, onSave }) {
  const [attachments, setAttachments] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null); setExtracted(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos (máximo ${MAX_IMAGES}).`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0) return;
    setProcessing(true); setError(null);
    try {
      const data = await extractWorkoutFromImage(attachments, apiKey);
      setExtracted(data);
    } catch (err) {
      setError(err.message || 'Error procesando archivos');
    } finally {
      setProcessing(false);
    }
  };

  const isAggregate = extracted?.period && ['7days', '30days', 'month', 'all'].includes(extracted.period);
  const periodLabel = {
    today: 'Hoy', session: 'Sesión', '7days': 'Últimos 7 días', '30days': 'Últimos 30 días', month: 'Mes', all: 'Histórico',
  }[extracted?.period] || extracted?.period;

  const confirm = () => {
    if (!extracted || isAggregate || !extracted.kcal) return;
    const minutesNote = extracted.minutes ? ` · ${extracted.minutes} min` : '';
    onSave({ id: uuid(), name: 'Entrenamiento Speediance' + minutesNote, kcal: Number(extracted.kcal) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📸 Importar entrenamiento</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {attachments.length === 0 ? (
          <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-500">
            <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
            <div className="text-4xl mb-2">📎</div>
            <div className="text-sm font-medium">Subir capturas, PDFs o exportaciones</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Foto · PDF · CSV · JSON · TXT — hasta {MAX_IMAGES} archivos</div>
          </label>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <AttachmentPreview key={i} attachment={a} onRemove={!extracted ? () => removeAttachment(i) : null} />
              ))}
              {!extracted && attachments.length < MAX_IMAGES && (
                <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                  <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                  +
                </label>
              )}
            </div>
            {!extracted && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{attachments.length} / {MAX_IMAGES} archivos</p>
            )}
            {!extracted && (
              <button onClick={handleProcess} disabled={processing || !apiKey}
                className="w-full py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
                {processing ? 'Procesando…' : `Procesar ${attachments.length} archivo${attachments.length === 1 ? '' : 's'} con Claude ✨`}
              </button>
            )}
            {!apiKey && !extracted && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </div>
        )}

        {extracted && (
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Período detectado</span>
                <span className="font-semibold">{periodLabel}</span>
              </div>
              {extracted.kcal != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">🔥 Calorías</span>
                  <span className="text-lg font-bold">{extracted.kcal} <span className="text-xs font-normal">kcal</span></span>
                </div>
              )}
              {extracted.minutes != null && (
                <div className="flex items-center justify-between text-sm">
                  <span>⏱️ Duración</span>
                  <span className="font-semibold">{extracted.minutes} min</span>
                </div>
              )}
              {extracted.volumeKg != null && (
                <div className="flex items-center justify-between text-sm">
                  <span>🏋️ Volumen</span>
                  <span className="font-semibold">{extracted.volumeKg} kg</span>
                </div>
              )}
            </div>

            {isAggregate ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ Esta captura es un resumen de varios días ({periodLabel}). No se puede importar como ejercicio de hoy. Súbeme la captura del día específico o la sesión individual.
              </div>
            ) : (
              <button onClick={confirm}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
                Agregar como ejercicio de hoy
              </button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function AddExerciseModal({ apiKey, userWeightKg, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [kcal, setKcal] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null);
  const [error, setError] = useState(null);

  const canEstimate = name.trim().length > 0;

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe la actividad primero.'); return; }
    setEstimating(true); setError(null);
    try {
      const desc = minutes ? `${name.trim()} (${minutes} min)` : name.trim();
      const data = await estimateExerciseKcal({ description: desc, weightKg: userWeightKg, apiKey });
      if (data?.name) setName(String(data.name));
      if (data?.minutes != null) setMinutes(String(Math.round(Number(data.minutes) || 0)));
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k <= 0) {
      setError('Necesitas nombre y kcal > 0.');
      return;
    }
    const finalName = minutes && Number(minutes) > 0 ? `${name.trim()} · ${Number(minutes)} min` : name.trim();
    onSave({
      name: finalName,
      kcal: k,
      source: estimated ? 'haiku-estimate' : 'manual',
    });
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Agregar entrenamiento</h2>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Actividad</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Trote, Pesas, Yoga, Fútbol"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Duración (min) <span className="text-gray-400">(opcional)</span></span>
          <input type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            placeholder="Ej. 30, 60"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
          className="w-full py-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
          {estimating ? 'Estimando…' : '✨ Estimar kcal con Claude'}
        </button>
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para estimar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {!userWeightKg && apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ℹ️ Para estimación más precisa, completa tu peso en el perfil de Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Estimación con confianza {estimated.confidence} · Edita si necesitas
            </span>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías quemadas</span>
          <input type="number" inputMode="numeric" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function ExerciseSection({ day, onUpdate, apiKey, userWeightKg }) {
  const [adding, setAdding] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [quickKcal, setQuickKcal] = useState('');
  const items = day.exercise || [];
  const totalBurned = items.reduce((s, x) => s + (Number(x.kcal) || 0), 0);

  const handleQuickAdd = () => {
    const n = Number(quickKcal);
    if (!Number.isFinite(n) || n <= 0) return;
    onUpdate({ exercise: [...items, { id: uuid(), ts: Date.now(), name: 'Entrenamiento', kcal: n }] });
    setQuickKcal('');
  };
  const handleSave = (item) => { onUpdate({ exercise: [...items, { ...item, id: uuid(), ts: Date.now() }] }); setAdding(false); };
  const handleRemove = (id) => { onUpdate({ exercise: items.filter((e) => e.id !== id) }); };
  const handleCaptureSave = (item) => {
    onUpdate({ exercise: [...items, { ...item, id: item.id ?? uuid(), ts: item.ts ?? Date.now() }] });
    setCapturing(false);
  };

  const headerExtra = (
    <div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Total rápido del día (pega lo que te marca tu app)</div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number" inputMode="numeric" min="0"
            value={quickKcal} onChange={(e) => setQuickKcal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
            placeholder="0"
            className="w-full px-3 py-2.5 pr-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">kcal</span>
        </div>
        <button type="button" onClick={() => setCapturing(true)}
          className="w-12 h-[42px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg active:scale-95"
          aria-label="Subir captura">📸</button>
        <button type="button" onClick={handleQuickAdd}
          disabled={!quickKcal || Number(quickKcal) <= 0}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          Agregar
        </button>
      </div>
    </div>
  );

  return (
    <>
      <DayItemList title="Ejercicio" icon="🔥" items={items}
        iconForItem={(item) => emojiForExercise(item.name)}
        onAdd={() => setAdding(true)} onRemove={handleRemove}
        addLabel="Agregar con detalle (o estimar con IA)"
        emptyHint="Sin entrenamientos aún"
        totalLabel={totalBurned > 0 ? `🔥 ${totalBurned} kcal` : null}
        headerExtra={headerExtra}
        renderMeta={(item) => (<><span className="font-semibold text-gray-700 dark:text-gray-300">{item.kcal}</span> kcal quemadas</>)}
      />
      {adding && (
        <AddExerciseModal apiKey={apiKey} userWeightKg={userWeightKg}
          onCancel={() => setAdding(false)} onSave={handleSave} />
      )}
      {capturing && (
        <WorkoutCaptureModal apiKey={apiKey}
          onClose={() => setCapturing(false)}
          onSave={handleCaptureSave} />
      )}
    </>
  );
}

function StreakChip({ streak, onClick }) {
  if (!streak) return null;
  const { current, best, todayMet, todayHasData, lastBrokenDate } = streak;
  if (current === 0 && best === 0) return null;

  if (current > 0) {
    return (
      <button onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-semibold active:scale-95">
        <span>🔥</span>
        <span>{current} día{current === 1 ? '' : 's'} seguido{current === 1 ? '' : 's'}</span>
        {best > current && <span className="text-[10px] font-normal opacity-70">· récord {best}</span>}
      </button>
    );
  }

  // current === 0: si recientemente se rompió, mostrar mensaje suave
  if (best > 0 && lastBrokenDate) {
    return (
      <button onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">
        <span>💫</span>
        <span>Mejor racha: {best} días</span>
      </button>
    );
  }

  return null;
}

function StreakModal({ streak, onClose }) {
  if (!streak) return null;
  const { current, best, lastBrokenDate, todayMet } = streak;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><span>🔥</span>Tu racha</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-orange-50 dark:bg-orange-900/30 p-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-orange-700 dark:text-orange-300">Hoy</div>
            <div className="text-2xl font-bold text-orange-800 dark:text-orange-200">{current}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{current === 1 ? 'día' : 'días'} seguidos</div>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300">Récord</div>
            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{best}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{best === 1 ? 'día' : 'días'} históricos</div>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-sm text-gray-700 dark:text-gray-300">
          {current === 0 && best > 0 && lastBrokenDate && (
            <p>Tu última racha de <span className="font-semibold">{best} días</span> terminó el {lastBrokenDate}. Hoy es nuevo día — vamos.</p>
          )}
          {current > 0 && todayMet && (
            <p>Vas <span className="font-semibold">{current} {current === 1 ? 'día' : 'días'} seguidos</span> cumpliendo kcal en rango y proteína sobre meta. Sigue así.</p>
          )}
          {current === 0 && best === 0 && (
            <p>Aún no tienes racha registrada. Un día cumple cuando tus calorías caen en rango y tu proteína supera el umbral.</p>
          )}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          Un día cumple si: kcal entre {streak.kcalMin || '?'} y {streak.kcalRed || '?'} · proteína ≥ {streak.proteinYellow || '?'}g
        </p>
      </div>
    </div>
  );
}

function HabitNudge({ day, totals, targets, isToday, onUpdate }) {
  if (!isToday) return null;
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const timeMin = hour * 60 + minutes;
  const eaten = day?.eaten || {};
  const dismissed = day?.nudgesDismissed || [];
  const skippedSet = new Set(day?.skipped || []);

  const T = targets || DEFAULT_TARGETS;
  const candidates = [];

  if (timeMin >= 14 * 60 && !eaten.almuerzo && !skippedSet.has('almuerzo')) {
    candidates.push({
      id: 'almuerzo-pendiente',
      icon: '🍚',
      text: 'Aún no marcaste el almuerzo de hoy.',
      action: 'Marcar como comido',
      onAction: () => onUpdate({ eaten: { ...eaten, almuerzo: true } }),
    });
  }
  if (timeMin >= 16 * 60 && totals.waterMl < T.waterTarget * 0.4) {
    candidates.push({
      id: 'agua-baja',
      icon: '💧',
      text: `Vas ${totals.waterMl} de ${T.waterTarget} ml de agua. Hidrátate.`,
      action: '+500 ml',
      onAction: () => onUpdate({ water: { ...(day?.water || {}), ml: (day?.water?.ml || 0) + 500 } }),
    });
  }
  if (timeMin >= 20 * 60 && totals.proteinRemaining > 40 && !skippedSet.has('cena')) {
    candidates.push({
      id: 'proteina-baja',
      icon: '🥩',
      text: `Te faltan ${Math.round(totals.proteinRemaining)}g de proteína para meta.`,
      action: null,
    });
  }
  if (timeMin >= 22 * 60 && !eaten.cena && !skippedSet.has('cena')) {
    candidates.push({
      id: 'cena-pendiente',
      icon: '🍽️',
      text: 'No marcaste cena. ¿Cenaste ya o la saltaste?',
      action: 'No cené hoy',
      onAction: () => onUpdate({ skipped: [...(day?.skipped || []), 'cena'] }),
    });
  }

  const active = candidates.find((c) => !dismissed.includes(c.id));
  if (!active) return null;

  const dismiss = () => onUpdate({ nudgesDismissed: [...dismissed, active.id] });

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-start gap-3">
      <span className="text-2xl shrink-0">{active.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-900 dark:text-amber-100">{active.text}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {active.action && active.onAction && (
            <button onClick={() => { active.onAction(); dismiss(); }}
              className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">
              {active.action}
            </button>
          )}
          <button onClick={dismiss}
            className="px-3 py-1 rounded-full bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-medium">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({ comparison }) {
  if (!comparison || (!comparison.weekAgo && !comparison.monthAgo)) return null;

  const renderDelta = (delta, unit = '', invertColors = false) => {
    if (delta == null) return null;
    const positive = delta > 0;
    const negative = delta < 0;
    const greenWhenNegative = invertColors; // para kcal: subir = "rojo"; bajar = "verde"
    const tone = positive
      ? (greenWhenNegative ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')
      : negative
      ? (greenWhenNegative ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
      : 'text-gray-500 dark:text-gray-400';
    return (
      <span className={`text-xs font-semibold ${tone}`}>
        {positive ? '↑' : negative ? '↓' : '='}{Math.abs(delta)}{unit}
      </span>
    );
  };

  const block = (label, entry) => {
    if (!entry) return null;
    return (
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">kcal {renderDelta(entry.kcalDelta, ' kcal', true)}</span>
          <span className="text-gray-600 dark:text-gray-400">prot {renderDelta(entry.proteinDelta, 'g')}</span>
          {entry.kgDelta != null && (
            <span className="text-gray-600 dark:text-gray-400">peso {renderDelta(entry.kgDelta, ' kg', true)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Comparación</h3>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {block('Vs. hace 7 días', comparison.weekAgo)}
        {block('Vs. hace 28 días', comparison.monthAgo)}
      </div>
    </div>
  );
}

function RecentsRow({ recents, onPick }) {
  if (!recents.length) return null;
  return (
    <div>
      <SectionHeader title="Recientes" hint="Tap para agregarlo como extra del día" />
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {recents.map((r, i) => (
            <button key={i} onClick={() => onPick(r)}
              className="shrink-0 px-3 py-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-emerald-400 active:scale-[0.97]">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{emojiForFood(r.name)}</span>
                <span className="text-xs font-medium max-w-[140px] truncate">{r.name}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                {r.kcal} kcal · {r.protein}g P · ×{r.count}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TodayView({ state, setState, dateKey, setDateKey, targets, onAddMealCapture, onAddSubstitution, onCoach }) {
  const todayReal = todayKey();
  const today = dateKey;
  const isToday = dateKey === todayReal;
  const dateObj = new Date(today + 'T12:00:00');
  const dow = dateObj.getDay();
  const dayName = DAY_NAMES[dow];
  const snackTime = SCHEDULE_BY_DOW[dow];
  const day = state.days[today] || {};
  const eaten = day.eaten || {};
  const dateInputRef = React.useRef(null);

  const updateDay = useCallback((patch) => {
    setState((prev) => {
      const prevDay = prev.days[today] || {};
      // Detectar extras/ejercicio que el patch ELIMINA, para (1) avisarle al bridge y (2)
      // anotarlos en removedBridgeIds, así mergeBridge no los reimporta. POST idempotente.
      const removed = [];
      if (Array.isArray(patch.extras)) {
        const keep = new Set(patch.extras.map((e) => e && e.id));
        for (const e of (prevDay.extras || [])) if (e && e.id != null && !keep.has(e.id)) removed.push(['meals', e.id]);
      }
      if (Array.isArray(patch.exercise)) {
        const keep = new Set(patch.exercise.map((e) => e && e.id));
        for (const e of (prevDay.exercise || [])) if (e && e.id != null && !keep.has(e.id)) removed.push(['workouts', e.id]);
      }
      let bridge = prev.bridge;
      if (removed.length) {
        for (const [section, id] of removed) postBridgeDelete(prev.settings, section, id);
        const rb = new Set([...(prev.bridge?.removedBridgeIds || []), ...removed.map((r) => r[1])]);
        bridge = { ...(prev.bridge || {}), removedBridgeIds: [...rb] };
      }
      return { ...prev, bridge, days: { ...prev.days, [today]: { ...prevDay, ...patch } } };
    });
  }, [setState, today]);

  // Alimentos registrados (bridge/captura) asignados a una sección del plan, para mostrarlos
  // dentro de su sección con "📝 Registrado". Quitar uno lo borra de day.extras.
  const dayExtras = day.extras || [];
  const desayunoExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'desayuno');
  const almuerzoExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'almuerzo');
  const colacionExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'colacion');
  const cenaExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'cena');
  const antojoExtras = dayExtras.filter((x) => extraSlotBucket(x) === 'antojo');
  const removeSlotExtra = (slot, id) => {
    const target = dayExtras.find((e) => e.id === id);
    const nextExtras = dayExtras.filter((e) => e.id !== id);
    const patch = { extras: nextExtras };
    // Solo colación/cena marcan el slot como cumplido vía eaten; al quedar vacío y sin pick
    // de banco, se vuelve a marcar pendiente. Desayuno/almuerzo/antojo no tocan eaten.
    if (slot === 'colacion' || slot === 'cena') {
      const stillHasSlot = nextExtras.some((e) => extraSlotBucket(e) === slot);
      const bankPick = slot === 'colacion' ? day.snackId : day.proteinId;
      if (!stillHasSlot && !bankPick) patch.eaten = { ...(day.eaten || {}), [slot]: false };
    }
    updateDay(patch);
    if (target) setUndoItem({ ...target });
  };

  // Edita una comida ya registrada en su sitio (mismo slot/source, nuevos macros/nombre).
  const editExtra = (id, patch) => {
    const cur = day.extras || [];
    updateDay({ extras: cur.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  // Restaura el último extra borrado (id nuevo). Reinstaura el eaten de colación/cena.
  const restoreUndo = () => {
    if (!undoItem) return;
    const { id, ...rest } = undoItem;
    const slot = extraSlotBucket(rest);
    const cur = day.extras || [];
    const patch = { extras: [...cur, { ...rest, id: uuid() }] };
    if (slot === 'colacion' || slot === 'cena') patch.eaten = { ...(day.eaten || {}), [slot]: true };
    updateDay(patch);
    setUndoItem(null);
  };

  // Copia todos los extras de un día anterior a hoy (ids/ts nuevos).
  const repeatItems = (items) => {
    const cloned = (items || []).map((e) => ({ ...e, id: uuid(), ts: Date.now(), source: 'repeat' }));
    if (!cloned.length) return;
    updateDay({ extras: [...(day.extras || []), ...cloned] });
  };

  // Enforcement de reglas: acumula violaciones, muestra modal único si hay
  const [pendingViolation, setPendingViolation] = useState(null);
  const [suggestSlot, setSuggestSlot] = useState(null); // 'snack' | 'dinner' | 'dessert_almuerzo' | 'dessert_cena' | null

  const handleSuggestionSelected = (item) => {
    const slot = suggestSlot;
    setSuggestSlot(null);
    if (!slot || !item?.id) return;
    if (slot === 'snack') selectSnack(item.id);
    else if (slot === 'dinner') selectDinner(item.id);
    else if (slot === 'dessert_almuerzo') selectDessert('almuerzo', item.id);
    else if (slot === 'dessert_cena') selectDessert('cena', item.id);
  };
  const tryWithRules = useCallback((actions, ctxExtra, doAction) => {
    const actionList = Array.isArray(actions) ? actions : [actions];
    const allViolations = [];
    const seen = new Set();
    for (const action of actionList) {
      const vs = evaluateAllRules(state, action, { dateKey: today, targets, ...ctxExtra });
      for (const v of vs) {
        if (!seen.has(v.rule.id)) {
          seen.add(v.rule.id);
          allViolations.push(v);
        }
      }
    }
    if (allViolations.length === 0) { doAction(); return; }
    setPendingViolation({ violations: allViolations, onConfirm: doAction });
  }, [state, today, targets]);

  const toggleEaten = (key) => {
    const cur = day.eaten || {};
    updateDay({ eaten: { ...cur, [key]: !cur[key] } });
  };

  // Tickea un ítem individual de una comida fija. Mantiene day.eaten[mealId] como sombra
  // (true sólo si todos los ítems quedaron tickeados).
  const toggleMealItem = (mealId, itemId) => {
    const meal = FIXED_MEALS.find((m) => m.id === mealId);
    if (!meal) return;
    const customAntojo = state.antojoCustomItems || [];
    const items = mealItemsFor(meal, customAntojo);
    const currentTicks = getMealItemTicks(day, meal, customAntojo);
    const nextTicks = { ...currentTicks, [itemId]: !currentTicks[itemId] };
    const allItems = { ...(day.eatenItems || {}) };
    allItems[mealId] = nextTicks;
    const allTicked = items.length > 0 && items.every((it) => nextTicks[it.id]);
    const newEaten = { ...(day.eaten || {}), [mealId]: allTicked };
    // Tickear un item deshace el "saltado" del meal
    const newSkipped = (day.skipped || []).filter((s) => s !== mealId);
    updateDay({ eatenItems: allItems, eaten: newEaten, skipped: newSkipped });
  };

  // "Marcar todo" / "Desmarcar todo" para un meal fijo
  const markAllMealItems = (mealId, value) => {
    const meal = FIXED_MEALS.find((m) => m.id === mealId);
    if (!meal) return;
    const customAntojo = state.antojoCustomItems || [];
    const items = mealItemsFor(meal, customAntojo);
    const nextTicks = {};
    for (const it of items) nextTicks[it.id] = !!value;
    const allItems = { ...(day.eatenItems || {}), [mealId]: nextTicks };
    const newEaten = { ...(day.eaten || {}), [mealId]: !!value };
    const newSkipped = value
      ? (day.skipped || []).filter((s) => s !== mealId)
      : (day.skipped || []);
    updateDay({ eatenItems: allItems, eaten: newEaten, skipped: newSkipped });
  };

  // Agrega un ítem custom al antojo (persiste en state, disponible todos los días)
  const addAntojoItem = ({ label, kcal, protein, carbs, fat, fiber }) => {
    setState((prev) => {
      const list = Array.isArray(prev.antojoCustomItems) ? [...prev.antojoCustomItems] : [];
      list.push({
        id: 'custom-' + uuid(),
        label: String(label || '').trim() || 'Ítem',
        kcal:    Number(kcal)    || 0,
        protein: Number(protein) || 0,
        carbs:   Number(carbs)   || 0,
        fat:     Number(fat)     || 0,
        fiber:   Number(fiber)   || 0,
        custom: true,
      });
      return { ...prev, antojoCustomItems: list };
    });
  };

  // Elimina un ítem custom del antojo (también limpia ticks históricos sobre ese id)
  const removeAntojoItem = (itemId) => {
    setState((prev) => {
      const list = (prev.antojoCustomItems || []).filter((it) => it.id !== itemId);
      const days = { ...(prev.days || {}) };
      for (const k of Object.keys(days)) {
        const d = days[k];
        if (d?.eatenItems?.antojo && Object.prototype.hasOwnProperty.call(d.eatenItems.antojo, itemId)) {
          const antojoTicks = { ...d.eatenItems.antojo };
          delete antojoTicks[itemId];
          days[k] = { ...d, eatenItems: { ...d.eatenItems, antojo: antojoTicks } };
        }
      }
      return { ...prev, antojoCustomItems: list, days };
    });
  };

  const selectSnack = (id) => {
    const same = day.snackId === id;
    const cur = day.eaten || {};
    const skippedNow = (day.skipped || []).filter((s) => s !== 'colacion');
    const doSelect = () => updateDay({ snackId: same ? null : id, eaten: { ...cur, colacion: false }, skipped: skippedNow });
    if (same) { doSelect(); return; }
    const snack = (state.snackBank || []).find((s) => s.id === id);
    if (isItemDulce(snack, 'snack')) {
      tryWithRules(['add_dulce'], {}, doSelect);
    } else {
      doSelect();
    }
  };

  const selectDinner = (id) => {
    const same = day.proteinId === id;
    const cur = day.eaten || {};
    const skippedNow = (day.skipped || []).filter((s) => s !== 'cena');
    updateDay({ proteinId: same ? null : id, eaten: { ...cur, cena: false }, skipped: skippedNow });
  };

  const selectDessert = (meal, id) => {
    const field = meal === 'almuerzo' ? 'dessertAlmuerzoId' : 'dessertCenaId';
    const eatenKey = meal === 'almuerzo' ? 'dessertAlmuerzo' : 'dessertCena';
    const same = day[field] === id;
    const cur = day.eaten || {};
    const doSelect = () => updateDay({ [field]: same ? null : id, eaten: { ...cur, [eatenKey]: false } });
    if (same) { doSelect(); return; }
    // Postres siempre cuentan como dulce
    tryWithRules(['add_dulce'], {}, doSelect);
  };

  const toggleDessertEaten = (meal) => {
    const eatenKey = meal === 'almuerzo' ? 'dessertAlmuerzo' : 'dessertCena';
    const cur = day.eaten || {};
    updateDay({ eaten: { ...cur, [eatenKey]: !cur[eatenKey] } });
  };

  const skippedSet = new Set(day.skipped || []);

  const toggleSkipped = (slot) => {
    const list = Array.isArray(day.skipped) ? [...day.skipped] : [];
    const cur = day.eaten || {};
    const newEaten = { ...cur };
    let newSkipped;
    if (list.includes(slot)) {
      newSkipped = list.filter((s) => s !== slot);
    } else {
      newSkipped = [...list, slot];
      // Si se salta, deshacer "comido"
      newEaten[slot] = false;
    }
    const patch = { skipped: newSkipped, eaten: newEaten };
    // Si se salta colación/cena, también limpiar selección del banco
    if (slot === 'colacion' && !list.includes(slot)) patch.snackId = null;
    if (slot === 'cena' && !list.includes(slot)) patch.proteinId = null;
    // Si se salta un meal fijo (desayuno/almuerzo/antojo), limpiar sus ticks de ítems
    if (!list.includes(slot) && FIXED_MEALS.some((m) => m.id === slot)) {
      const items = { ...(day.eatenItems || {}) };
      items[slot] = {};
      patch.eatenItems = items;
    }
    updateDay(patch);
  };

  const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);
  const desayuno = FIXED_MEALS[0];
  const almuerzo = FIXED_MEALS[1];
  const antojo = FIXED_MEALS[2];

  const recents = useMemo(
    () => computeRecents(state.days || {}, 10),
    [state.days]
  );

  const streak = useMemo(
    () => {
      const base = computeStreak(state.days || {}, state.snackBank, state.proteinBank, targets, today, state.dessertBank, state.antojoCustomItems || []);
      return {
        ...base,
        kcalMin: targets?.kcalMin,
        kcalRed: targets?.kcalRed,
        proteinYellow: targets?.proteinYellow,
      };
    },
    [state.days, state.snackBank, state.proteinBank, targets, today]
  );

  const comparison = useMemo(
    () => computeComparison(state, today, targets),
    [state, today, targets]
  );

  const [showStreakModal, setShowStreakModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // extra en edición | null
  const [showRepeat, setShowRepeat] = useState(false);
  const [undoItem, setUndoItem] = useState(null); // último extra borrado, para deshacer

  // El toast de "deshacer" se autodescarta a los 6s.
  useEffect(() => {
    if (!undoItem) return;
    const t = setTimeout(() => setUndoItem(null), 6000);
    return () => clearTimeout(t);
  }, [undoItem]);

  const addRecent = (r) => {
    const cur = day.extras || [];
    updateDay({
      extras: [...cur, {
        id: uuid(),
        ts: Date.now(),
        name: r.name,
        kcal: r.kcal, protein: r.protein,
        carbs: r.carbs, fat: r.fat, fiber: r.fiber,
        source: 'recents',
      }],
    });
  };

  return (
    <>
      <BentoTodayHero totals={totals} targets={targets} streak={streak} onStreakClick={() => setShowStreakModal(true)} weightSeries={state.weights} state={state} />
      {showStreakModal && <StreakModal streak={streak} onClose={() => setShowStreakModal(false)} />}
      {pendingViolation && (
        <RuleViolationModal
          violations={pendingViolation.violations}
          onConfirm={() => { pendingViolation.onConfirm(); setPendingViolation(null); }}
          onCancel={() => setPendingViolation(null)}
        />
      )}
      {suggestSlot && (
        <SuggestSlotModal
          slot={suggestSlot}
          state={state}
          targets={targets}
          onSelect={handleSuggestionSelected}
          onClose={() => setSuggestSlot(null)}
        />
      )}
      {editTarget && (
        <LoggedItemModal initial={editTarget}
          onCancel={() => setEditTarget(null)}
          onSave={(patch) => { editExtra(editTarget.id, patch); setEditTarget(null); }} />
      )}
      {showRepeat && (
        <RepeatDayModal days={state.days} todayKeyStr={today}
          onCancel={() => setShowRepeat(false)}
          onAdd={(items) => { repeatItems(items); setShowRepeat(false); }} />
      )}
      {undoItem && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-900 dark:bg-gray-800 text-white shadow-xl border border-gray-700 max-w-md w-full">
            <span className="text-sm flex-1 truncate">Borraste «{undoItem.name}»</span>
            <button onClick={restoreUndo} className="shrink-0 text-sm font-bold text-emerald-400 hover:text-emerald-300">Deshacer</button>
            <button onClick={() => setUndoItem(null)} aria-label="Cerrar" className="shrink-0 text-gray-400 hover:text-white">✕</button>
          </div>
        </div>
      )}
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <button onClick={() => setDateKey(shiftDate(today, -1))}
            className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-lg active:scale-95"
            aria-label="Día anterior">◀</button>
          <button onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
            className="flex-1 text-center font-semibold text-sm py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {formatDateLabel(today, todayReal)}
          </button>
          <input ref={dateInputRef} type="date" value={today} max={todayReal}
            onChange={(e) => e.target.value && setDateKey(e.target.value)}
            className="absolute opacity-0 w-0 h-0 pointer-events-none" />
          <button onClick={() => setDateKey(shiftDate(today, 1))}
            disabled={today >= todayReal}
            className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            aria-label="Día siguiente">▶</button>
          {!isToday && (
            <button onClick={() => setDateKey(todayReal)}
              className="px-3 h-10 rounded-full bg-emerald-500 text-white font-semibold text-xs">Hoy</button>
          )}
        </div>
        {!isToday && (
          <div className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
            📅 Viendo día pasado · editable
          </div>
        )}
        <div className="px-1">
          <h1 className="text-2xl font-bold tracking-tight">{dayName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {dateObj.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
            {snackTime && <span> · Colación {snackTime}</span>}
            {!snackTime && <span> · Día libre</span>}
          </p>
          {isToday && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tap en cada comida para marcarla como comida ✓</p>
          )}
        </div>

        <HabitNudge day={day} totals={totals} targets={targets} isToday={isToday} onUpdate={updateDay} />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onAddMealCapture}
            className="py-3 rounded-2xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 flex items-center justify-center gap-1.5 shadow-sm">
            <span className="text-base">📷</span>
            <span>Foto · Voz · Texto</span>
          </button>
          <button onClick={onAddSubstitution}
            className="py-3 rounded-2xl bg-white dark:bg-gray-900 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-center gap-1.5">
            <span className="text-base">🔄</span>
            <span>¿Qué puedo comer?</span>
          </button>
        </div>

        {onCoach && (
          <button onClick={onCoach}
            className="w-full py-2.5 rounded-2xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 flex items-center justify-center gap-2">
            <span>💬</span>
            <span>Pregunta al coach</span>
          </button>
        )}

        <RecentsRow recents={recents} onPick={addRecent} />

        <button onClick={() => setShowRepeat(true)}
          className="w-full py-2.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:border-emerald-400 flex items-center justify-center gap-2">
          <span>🔁</span>
          <span>Repetir un día</span>
        </button>

        <ComparisonCard comparison={comparison} />

        <RuleChips state={state} dateKey={today} targets={targets} />

        <WaterTracker day={day} onUpdate={updateDay} target={targets?.waterTarget || 3000} />

        <div>
          <MealCard meal={desayuno} day={day} skipped={skippedSet.has('desayuno')}
            onToggleItem={(itemId) => toggleMealItem('desayuno', itemId)}
            onMarkAll={(value) => markAllMealItems('desayuno', value)}
            onSkipToggle={() => toggleSkipped('desayuno')} targets={targets} />
          <SlotLoggedItems items={desayunoExtras} onRemove={(id) => removeSlotExtra('desayuno', id)} onEdit={setEditTarget} />
        </div>
        <div>
          <MealCard meal={almuerzo} day={day} skipped={skippedSet.has('almuerzo')}
            onToggleItem={(itemId) => toggleMealItem('almuerzo', itemId)}
            onMarkAll={(value) => markAllMealItems('almuerzo', value)}
            onSkipToggle={() => toggleSkipped('almuerzo')} targets={targets} />
          <SlotLoggedItems items={almuerzoExtras} onRemove={(id) => removeSlotExtra('almuerzo', id)} onEdit={setEditTarget} />
        </div>
        <DessertSection meal="almuerzo" dessertBank={state.dessertBank} day={day} eaten={eaten}
          onSelect={selectDessert} onToggleEaten={toggleDessertEaten} targets={targets}
          onSuggest={() => setSuggestSlot('dessert_almuerzo')} />
        <div>
          <div className="flex items-end justify-between mb-1">
            <SectionHeader title={`Colación${snackTime ? ` · ${snackTime}` : ''}`} hint={skippedSet.has('colacion') ? '🚫 Hoy no tomé colación' : 'Selecciona del banco, luego marca cuando la comas'} />
            <div className="flex items-center gap-1.5">
              {!skippedSet.has('colacion') && (
                <button onClick={() => setSuggestSlot('snack')}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
                  🤔 ¿Qué como?
                </button>
              )}
              <button onClick={() => toggleSkipped('colacion')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                skippedSet.has('colacion')
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {skippedSet.has('colacion') ? '↩️ Deshacer' : '🚫 No comí'}
            </button>
            </div>
          </div>
          {!skippedSet.has('colacion') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {state.snackBank.map((s) => (
                <SelectableCard key={s.id} item={s}
                  selected={day.snackId === s.id}
                  eaten={day.snackId === s.id && !!eaten.colacion}
                  onClick={() => selectSnack(s.id)}
                  onToggleEaten={() => toggleEaten('colacion')}
                  showCategory targets={targets} />
              ))}
            </div>
          )}
          {!skippedSet.has('colacion') && (
            <SlotLoggedItems items={colacionExtras} onRemove={(id) => removeSlotExtra('colacion', id)} onEdit={setEditTarget} />
          )}
        </div>
        <div>
          <div className="flex items-end justify-between mb-1">
            <SectionHeader title="Cena" hint={skippedSet.has('cena') ? '🚫 Hoy no cené' : 'Proteína + ensalada/verduras (sin arroz)'} />
            <div className="flex items-center gap-1.5">
              {!skippedSet.has('cena') && (
                <button onClick={() => setSuggestSlot('dinner')}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
                  🤔 ¿Qué como?
                </button>
              )}
              <button onClick={() => toggleSkipped('cena')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                skippedSet.has('cena')
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {skippedSet.has('cena') ? '↩️ Deshacer' : '🚫 No comí'}
            </button>
            </div>
          </div>
          {!skippedSet.has('cena') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {state.proteinBank.map((p) => (
                <SelectableCard key={p.id} item={p}
                  selected={day.proteinId === p.id}
                  eaten={day.proteinId === p.id && !!eaten.cena}
                  onClick={() => selectDinner(p.id)}
                  onToggleEaten={() => toggleEaten('cena')}
                  targets={targets} />
              ))}
            </div>
          )}
          {!skippedSet.has('cena') && (
            <SlotLoggedItems items={cenaExtras} onRemove={(id) => removeSlotExtra('cena', id)} onEdit={setEditTarget} />
          )}
          {!skippedSet.has('cena') && (
            <DessertSection meal="cena" dessertBank={state.dessertBank} day={day} eaten={eaten}
              onSelect={selectDessert} onToggleEaten={toggleDessertEaten} targets={targets}
              onSuggest={() => setSuggestSlot('dessert_cena')} />
          )}
        </div>
        <div>
          <MealCard meal={antojo} day={day} skipped={skippedSet.has('antojo')}
            customAntojoItems={state.antojoCustomItems || []}
            onToggleItem={(itemId) => toggleMealItem('antojo', itemId)}
            onMarkAll={(value) => markAllMealItems('antojo', value)}
            onSkipToggle={() => toggleSkipped('antojo')}
            onAddItem={addAntojoItem}
            onRemoveItem={removeAntojoItem}
            targets={targets} />
          <SlotLoggedItems items={antojoExtras} onRemove={(id) => removeSlotExtra('antojo', id)} onEdit={setEditTarget} />
        </div>
        <ExtrasSection day={day} onUpdate={updateDay} apiKey={state.settings?.anthropicApiKey} tryWithRules={tryWithRules}
          onRemoveExtra={(id) => removeSlotExtra('extra', id)} onEditExtra={setEditTarget} />
        <ExerciseSection day={day} onUpdate={updateDay} apiKey={state.settings?.anthropicApiKey} userWeightKg={state.userProfile?.weightKg} />
        <DailyNotesCard day={day} onUpdate={updateDay} />
      </div>
    </>
  );
}

function WeeklyAnalysisCard({ state, setState, weekKey, rows, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const cached = state.aiCache?.weekly?.[weekKey];
  const weekRefKey = rows[0]?.key;
  const lossSig = useMemo(() => {
    const lr = computeWeeklyLossRate(state.weights || [], weekRefKey);
    return lr ? lr.pctPerWeek.toFixed(2) : 'na';
  }, [state.weights, weekRefKey]);
  const sig = useMemo(() => hashSig({
    rows: rows.map((r) => ({
      k: r.key,
      kcal: Math.round(r.totals.kcal),
      p: Math.round(r.totals.protein),
      c: Math.round(r.totals.carbs),
      f: Math.round(r.totals.fat),
      fi: Math.round(r.totals.fiber),
      w: Math.round(r.totals.waterMl),
      burn: Math.round(r.totals.kcalBurned),
      eaten: !!r.totals.eatenAny,
    })),
    loss: lossSig,
  }), [rows, lossSig]);
  const isStale = cached && cached.sig !== sig;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);

  const hasData = rows.some((r) => r.totals.eatenAny);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!hasData) { setError('Aún no hay datos suficientes en la semana.'); return; }
    setLoading(true); setError(null);
    try {
      const T = targets || DEFAULT_TARGETS;
      const weights = (state.weights || []).filter((w) => w.weightKg != null && rows.some((r) => r.key === w.date));
      const compactRows = rows.map((r) => ({
        fecha: r.key,
        dia: r.label,
        kcal: Math.round(r.totals.kcal),
        proteina: Math.round(r.totals.protein),
        carbos: Math.round(r.totals.carbs),
        grasas: Math.round(r.totals.fat),
        fibra: Math.round(r.totals.fiber),
        agua_ml: Math.round(r.totals.waterMl),
        ejercicio_kcal: Math.round(r.totals.kcalBurned),
        registrado: r.totals.eatenAny,
      }));

      const lossRate = computeWeeklyLossRate(state.weights || [], weekRefKey);
      const lossLine = lossRate
        ? `TASA DE PÉRDIDA SEMANAL (peso prom. esta semana ${lossRate.curr.toFixed(1)} kg vs semana anterior ${lossRate.prev.toFixed(1)} kg): ${lossRate.deltaKg <= 0 ? '−' : '+'}${Math.abs(lossRate.deltaKg).toFixed(2)} kg = ${lossRate.pctPerWeek.toFixed(2)} %/sem.`
        : 'TASA DE PÉRDIDA SEMANAL: sin datos de peso en ambas semanas para calcularla.';

      const prompt = `Eres el coach nutricional de Hugo (geriatra chileno). Analiza su SEMANA de lunes a sábado. Sé directo, sin alarmismo. USA TUTEO CHILENO (tú, tienes). NO uses voseo argentino.

METAS DIARIAS:
- Calorías: ${T.kcalMin}-${T.kcalMax} kcal (rojo sobre ${T.kcalRed})
- Proteína: ≥ ${T.proteinMin} g (piso innegociable en déficit)
- Carbos: ${T.carbsTarget} g · Grasas: ${T.fatTarget} g · Fibra: ${T.fiberTarget} g
- Agua: ${T.waterTarget} ml
- Distribución proteica: ≥${PROTEIN_DIST.minTomas} tomas/día de ≥${PROTEIN_DIST.minPerToma} g c/u, sin brechas >${PROTEIN_DIST.maxGapHours} h. En días de entrenamiento, toma pre-sueño de 30-40 g (caseína/proteína lenta).

PROGRESO POR TASA DE PÉRDIDA SEMANAL (no por déficit fijo). Rango objetivo: ${WEEKLY_LOSS.minPct}-${WEEKLY_LOSS.maxPct} %/sem (~0.55-0.75 kg/sem):
- >${WEEKLY_LOSS.fastPct} %/sem → "pérdida demasiado rápida, riesgo de masa magra": sugiere SUBIR ~100-150 kcal.
- <${WEEKLY_LOSS.slowPct} %/sem por 2 semanas → sugiere EXTENDER la duración del cardio (NO agregar días ni recortar más calorías).
${lossLine}

SEMANA:
${JSON.stringify(compactRows, null, 2)}

${weights.length ? `PESOS DE LA SEMANA: ${JSON.stringify(weights.map(w => ({ fecha: w.date, kg: w.weightKg })))}` : 'Sin mediciones de peso esta semana.'}

Devuelve un análisis en PROSA (texto corrido, no JSON), de 3 a 4 párrafos:
1. Cumplimiento general (kcal, proteína ≥${T.proteinMin} g, agua) — qué se cumplió, qué no.
2. Patrones de la semana: día(s) que se desviaron, día(s) que cumpliste mejor.
3. Tasa de pérdida semanal: ubícala en el rango ${WEEKLY_LOSS.minPct}-${WEEKLY_LOSS.maxPct} %/sem y aplica la recomendación correspondiente (subir kcal si >${WEEKLY_LOSS.fastPct} %, extender cardio si lenta). Grasa visceral es la prioridad #1.
4. 1-2 recomendaciones concretas para la próxima semana.

Tono: conversado, cercano, sin culpa. Máximo ~250 palabras totales. No uses listas ni viñetas, prosa fluida.`;

      const text = await askClaude(prompt, apiKey, 1024, MODEL_CHEAP);
      setResponse(text);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          weekly: {
            ...(prev.aiCache?.weekly || {}),
            [weekKey]: { sig, response: text, generatedAt: new Date().toISOString() },
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><span>✨</span>Análisis de la semana</h3>
        {(response || cached) && (
          <button onClick={generate} disabled={loading}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {loading ? 'Generando…' : (isStale ? 'Actualizar' : 'Regenerar')}
          </button>
        )}
      </div>
      {!response && !cached && !loading && (
        <button onClick={generate} disabled={!hasData || !apiKey}
          className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          Generar análisis con Claude
        </button>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400 italic">Pensando…</div>}
      {!apiKey && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
          ⚠️ Configura tu API key en ⚙️ Ajustes primero.
        </p>
      )}
      {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      {(response || cached?.response) && !loading && (
        <div className="space-y-2">
          {isStale && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
              ⚠️ Los datos cambiaron desde que se generó. Considera actualizar.
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
            {response || cached.response}
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Generado {cached?.generatedAt ? new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'recién'}
          </p>
        </div>
      )}
    </div>
  );
}

function getISOWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function WeekView({ state, setState, onSelectDay, targets }) {
  const weekKeys = useMemo(() => getWeekKeys(), []);
  const weekKey = useMemo(() => getISOWeekKey(), []);
  const rows = weekKeys.map((key) => {
    const day = state.days[key];
    const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);
    const d = new Date(key + 'T12:00:00');
    return { key, label: DAY_SHORT[d.getDay()], dateStr: `${d.getDate()}/${d.getMonth() + 1}`, day, totals, isToday: key === todayKey() };
  });

  const completedRows = rows.filter((r) => r.totals.hasSnack && r.totals.hasDinner);
  const avgKcal = completedRows.length ? Math.round(completedRows.reduce((s, r) => s + r.totals.kcal, 0) / completedRows.length) : 0;
  const avgProtein = completedRows.length ? Math.round(completedRows.reduce((s, r) => s + r.totals.protein, 0) / completedRows.length) : 0;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Esta semana</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Lunes a sábado</p>
      </div>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {rows.map((r, i) => {
          const kcalColor = r.totals.hasSnack && r.totals.hasDinner ? colorForKcal(r.totals.kcal, targets) : null;
          const proteinColor = r.totals.hasSnack && r.totals.hasDinner ? colorForProtein(r.totals.protein, targets) : null;
          const worst = kcalColor === 'red' || proteinColor === 'red' ? 'red'
            : kcalColor === 'amber' || proteinColor === 'amber' ? 'amber'
            : kcalColor ? 'green' : null;
          return (
            <button key={r.key} onClick={() => onSelectDay && onSelectDay(r.key)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 active:bg-gray-100 dark:active:bg-gray-800 ${i !== rows.length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : ''} ${r.isToday ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`}>
              <div className="w-14 shrink-0">
                <div className={`font-semibold text-sm ${r.isToday ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{r.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{r.dateStr}</div>
              </div>
              <div className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-400 truncate">
                {r.totals.snack ? r.totals.snack.name : <span className="italic">— sin colación</span>}
                <br />
                {r.totals.dinner ? r.totals.dinner.name : <span className="italic">— sin cena</span>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{Math.round(r.totals.kcal)} kcal</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{Math.round(r.totals.protein)}g prot</div>
              </div>
              <div className="w-3 shrink-0 flex justify-end">
                {worst && <div className={`w-2.5 h-2.5 rounded-full ${COLOR_CLASSES[worst].dot}`} />}
              </div>
            </button>
          );
        })}
      </div>
      <WeeklyAnalysisCard state={state} setState={setState} weekKey={weekKey} rows={rows} targets={targets} />

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold mb-2">Promedio semanal</h3>
        {completedRows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay días completos esta semana.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Calorías</div>
              <div className={`text-xl font-bold ${COLOR_CLASSES[colorForKcal(avgKcal, targets)].text}`}>{avgKcal} kcal</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Proteína</div>
              <div className={`text-xl font-bold ${COLOR_CLASSES[colorForProtein(avgProtein, targets)].text}`}>{avgProtein}g</div>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Basado en {completedRows.length} día{completedRows.length === 1 ? '' : 's'} con colación y cena.
        </p>
      </div>
    </div>
  );
}

function InsightsView({ state, setState, targets }) {
  const apiKey = state.settings?.anthropicApiKey;
  const cached = state.aiCache?.patterns;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(cached?.response || null);

  const series = useMemo(() => {
    const today = todayKey();
    const start = shiftDate(today, -27);
    const out = [];
    let cursor = start;
    while (cursor <= today) {
      const day = state.days[cursor];
      const totals = computeDayTotals(day, state.snackBank, state.proteinBank, targets, state.dessertBank, state.antojoCustomItems || []);
      const dow = new Date(cursor + 'T12:00:00').getDay();
      const weight = (state.weights || []).find((w) => w.date === cursor && w.weightKg != null);
      out.push({
        fecha: cursor,
        dow,
        dia: DAY_SHORT[dow],
        kcal: Math.round(totals.kcal),
        proteina: Math.round(totals.protein),
        carbos: Math.round(totals.carbs),
        grasas: Math.round(totals.fat),
        fibra: Math.round(totals.fiber),
        agua_ml: Math.round(totals.waterMl),
        ejercicio_kcal: Math.round(totals.kcalBurned),
        registrado: totals.eatenAny,
        peso_kg: weight?.weightKg ?? null,
      });
      cursor = shiftDate(cursor, 1);
    }
    return out;
  }, [state.days, state.snackBank, state.proteinBank, state.weights, targets]);

  const sig = useMemo(() => hashSig(series), [series]);
  const isStale = cached && cached.sig !== sig;
  const cacheAgeMs = cached ? (Date.now() - new Date(cached.generatedAt).getTime()) : Infinity;
  const cacheOlderThan7Days = cacheAgeMs > 7 * 86400000;

  const recordedCount = series.filter((s) => s.registrado).length;

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (recordedCount < 7) { setError(`Necesitas al menos 7 días con registro. Tienes ${recordedCount}.`); return; }
    setLoading(true); setError(null);
    try {
      const T = targets || DEFAULT_TARGETS;
      const prompt = `Eres analista de datos nutricionales de Hugo (geriatra chileno). Busca patrones interesantes en sus últimas 4 semanas. USA TUTEO CHILENO. Sé concreto, usa números reales del dataset.

METAS:
- kcal: ${T.kcalMin}-${T.kcalMax} · proteína ≥ ${T.proteinMin}g · agua ${T.waterTarget} ml

DATOS (28 días, dow 0=domingo, 6=sábado):
${JSON.stringify(series, null, 2)}

Devuelve SOLO JSON, sin markdown:
{
  "insights": [
    {
      "title": "1 línea con el patrón",
      "evidence": "datos concretos que respaldan (con números)",
      "suggestion": "qué hacer con eso"
    }
  ],
  "confidence": "alta|media|baja"
}

Reglas:
- 2 a 4 insights, los MÁS interesantes (no obvios)
- Cada insight: título corto (máx 70 chars), evidencia con números reales del dataset, sugerencia accionable
- Buscar: patrones por día de semana, correlación con ejercicio, cumplimiento de agua/proteína, tendencias de peso
- Si los datos son escasos, devuelve menos insights con confidence baja
- No inventes datos. Si no hay patrón claro, dilo`;

      const text = await askClaude(prompt, apiKey, 1500);
      const parsed = parseJsonLoose(text);
      if (!parsed?.insights) {
        setError('No se pudo parsear la respuesta.');
        return;
      }
      setResponse(parsed);
      setState((prev) => ({
        ...prev,
        aiCache: {
          ...(prev.aiCache || {}),
          patterns: { sig, response: parsed, generatedAt: new Date().toISOString() },
        },
      }));
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = response?.confidence === 'alta' ? 'green' : response?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><span>🧠</span>Insights</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Patrones de las últimas 4 semanas</p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Días con registro:</span>
          <span className="font-semibold">{recordedCount} / 28</span>
        </div>
        {!apiKey && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
            ⚠️ Configura tu API key en ⚙️ Ajustes primero.
          </p>
        )}
        <button onClick={generate} disabled={loading || !apiKey || recordedCount < 7}
          className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
          {loading ? 'Buscando patrones…' : (response ? (isStale || cacheOlderThan7Days ? 'Actualizar análisis' : 'Regenerar') : 'Detectar patrones con Claude ✨')}
        </button>
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>

      {response && (
        <>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span className="text-base">{response.confidence === 'alta' ? '✅' : response.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Confianza {response.confidence}{isStale && ' · datos cambiaron'}
            </span>
          </div>

          {response.insights.map((ins, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
              <h3 className="text-sm font-bold">{ins.title}</h3>
              {ins.evidence && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-500 dark:text-gray-500">Evidencia</span>
                  <br />
                  {ins.evidence}
                </p>
              )}
              {ins.suggestion && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg">
                  💡 {ins.suggestion}
                </p>
              )}
            </div>
          ))}

          {cached?.generatedAt && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
              Generado {new Date(cached.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BankItemForm({ initial, kind, apiKey, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [kcal, setKcal] = useState(initial?.kcal ?? '');
  const [protein, setProtein] = useState(initial?.protein ?? '');
  const [carbs, setCarbs] = useState(initial?.carbs ?? '');
  const [fat, setFat] = useState(initial?.fat ?? '');
  const [fiber, setFiber] = useState(initial?.fiber ?? '');
  const [category, setCategory] = useState(initial?.category || 'salado');
  const [gi, setGi] = useState(initial?.gi || 'bajo');
  const [tags, setTags] = useState(Array.isArray(initial?.tags) ? initial.tags : []);
  const [portionGrams, setPortionGrams] = useState(initial?.portionGrams ?? '');
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(null);
  const [error, setError] = useState(null);

  const toggleTag = (t) => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  const canEstimate = name.trim().length > 0;

  const handleEstimate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canEstimate) { setError('Escribe el nombre primero.'); return; }
    setEstimating(true); setError(null);
    try {
      const data = await estimateExtraMacros({ name, attachments: [], apiKey });
      if (data?.kcal != null) setKcal(String(Math.round(Number(data.kcal) || 0)));
      if (data?.protein != null) setProtein(String(Math.round(Number(data.protein) || 0)));
      if (data?.carbs != null) setCarbs(String(Math.round(Number(data.carbs) || 0)));
      if (data?.fat != null) setFat(String(Math.round(Number(data.fat) || 0)));
      if (data?.fiber != null) setFiber(String(Number(data.fiber).toFixed(1)));
      setEstimated({ confidence: data?.confidence || 'media' });
    } catch (err) {
      setError(err.message || 'Error al estimar');
    } finally {
      setEstimating(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const k = Number(kcal);
    const p = Number(protein);
    if (!name.trim() || !Number.isFinite(k) || k < 0 || !Number.isFinite(p) || p < 0) return;
    const numOrZero = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const item = {
      ...(initial || {}),
      name: name.trim(),
      kcal: k, protein: p,
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
      fiber: numOrZero(fiber),
      gi,
      tags,
    };
    const pg = Number(portionGrams);
    if (Number.isFinite(pg) && pg > 0) item.portionGrams = pg;
    if (kind === 'snack') item.category = category;
    onSave(item);
  };

  const confidenceColor = estimated?.confidence === 'alta' ? 'green' : estimated?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial ? 'Editar' : 'Agregar'} {kind === 'snack' ? 'colación' : kind === 'dessert' ? 'postre' : 'proteína de cena'}</h2>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Ej. Shake whey 30g" autoFocus />
        </label>

        <button type="button" onClick={handleEstimate} disabled={estimating || !apiKey || !canEstimate}
          className="w-full py-2 rounded-xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold text-sm hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50">
          {estimating ? 'Estimando…' : '✨ Completar con Claude'}
        </button>
        {!apiKey && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ Para auto-completar necesitas configurar tu API key en ⚙️ Ajustes.
          </p>
        )}
        {estimated && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[confidenceColor].bg}`}>
            <span>{estimated.confidence === 'alta' ? '✅' : estimated.confidence === 'media' ? 'ℹ️' : '⚠️'}</span>
            <span className={`text-xs ${COLOR_CLASSES[confidenceColor].text}`}>
              Confianza {estimated.confidence} · Edita si necesitas
            </span>
          </div>
        )}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías (kcal)</span>
            <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g)</span>
            <input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Carbos (g)</span>
            <input type="number" inputMode="decimal" step="1" value={carbs} onChange={(e) => setCarbs(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Grasas (g)</span>
            <input type="number" inputMode="decimal" step="1" value={fat} onChange={(e) => setFat(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fibra (g)</span>
            <input type="number" inputMode="decimal" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Índice glicémico</span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {['bajo', 'medio', 'alto'].map((g) => (
                <button type="button" key={g} onClick={() => setGi(g)}
                  className={`py-1.5 rounded-lg border-2 text-[11px] font-semibold capitalize ${
                    gi === g ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{g}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Porción (g) — opcional</span>
            <input type="number" inputMode="numeric" value={portionGrams} onChange={(e) => setPortionGrams(e.target.value)}
              placeholder="p.ej. 150"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" min="0" />
          </label>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Etiquetas</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {['proteína', 'fibra', 'portable', 'sin-refrigeración', 'dulce'].map((t) => (
              <button type="button" key={t} onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  tags.includes(t) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}>{t}</button>
            ))}
          </div>
        </div>
        {kind === 'snack' && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Categoría</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['salado', 'dulce'].map((c) => (
                <button type="button" key={c} onClick={() => setCategory(c)}
                  className={`py-2 rounded-xl border-2 text-sm font-medium capitalize ${
                    category === c ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>{c}</button>
              ))}
            </div>
          </label>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function BankList({ items, kind, onAdd, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {items.length === 0 ? (
        <div className="p-4 text-sm text-gray-500 dark:text-gray-400 italic">Sin opciones todavía.</div>
      ) : (
        items.map((item, i) => (
          <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${i !== items.length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {item.kcal} kcal · P {item.protein}g
                {(item.carbs || item.fat || item.fiber) ? <> · C {Math.round(item.carbs || 0)} · G {Math.round(item.fat || 0)} · F {Number(item.fiber || 0).toFixed(0)}</> : null}
                {kind === 'snack' && item.category && ` · ${item.category}`}
                {item.gi && item.gi !== 'bajo' ? ` · GI ${item.gi}` : null}
                {item.portionGrams ? ` · ${item.portionGrams}g` : null}
              </div>
              {Array.isArray(item.tags) && item.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => onEdit(item)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">Editar</button>
            {!item.builtin && (
              <button onClick={() => { if (confirm(`¿Eliminar "${item.name}"?`)) onDelete(item.id); }}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200">Borrar</button>
            )}
          </div>
        ))
      )}
      <button onClick={onAdd} className="w-full py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border-t border-gray-200 dark:border-gray-800">
        + Agregar {kind === 'snack' ? 'colación' : kind === 'dessert' ? 'postre' : 'proteína'}
      </button>
    </div>
  );
}

function cleanupRefs(days, field, id) {
  const out = {};
  for (const [k, v] of Object.entries(days)) {
    if (v && v[field] === id) {
      const { [field]: _, ...rest } = v;
      out[k] = rest;
    } else { out[k] = v; }
  }
  return out;
}

function SuggestBankModal({ kind, state, setState, onClose }) {
  const apiKey = state.settings?.anthropicApiKey;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  const existing = kind === 'snack' ? state.snackBank : kind === 'dessert' ? (state.dessertBank || []) : state.proteinBank;
  const existingNames = existing.map((i) => i.name);

  const generate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    setLoading(true); setError(null);
    try {
      const tipo = kind === 'snack'
        ? 'colaciones (snacks salados o dulces)'
        : kind === 'dessert'
        ? 'postres en porción controlada (mezcla saludables y algún indulgente moderado)'
        : 'opciones de cena (proteína principal con guarnición simple)';
      const prompt = `Eres nutricionista chileno. Genera 5 ideas de ${tipo} para Hugo (geriatra chileno, hombre adulto en plan de pérdida de grasa). Que sean realistas para el contexto chileno (lácteos Colun, atún, salmón, palta, pollo, etc.).

Ya tiene estas opciones (no las repitas):
${existingNames.map(n => `- ${n}`).join('\n')}

Devuelve SOLO JSON, sin markdown:
{
  "items": [
    {
      "name": "nombre corto y específico (ej. 'Quínoa con palta y huevo' o '120g pavo + queso fresco')",
      "kcal": número,
      "protein": número (g),
      "carbs": número,
      "fat": número,
      "fiber": número con 1 decimal${kind === 'snack' ? ',\n      "category": "salado" o "dulce"' : ''}
    }
  ]
}

Reglas:
- 5 opciones, variedad de macros (algunas altas en P, otras balanceadas)
- ${kind === 'snack' ? 'kcal 150-300 por colación' : kind === 'dessert' ? 'kcal 60-180 por postre (porción individual)' : 'kcal 250-450 para cena (porción individual)'}
- Productos reales encontrables en supermercado chileno
- Nombres autoexplicativos (no necesita instrucciones)`;

      const text = await askClaude(prompt, apiKey, 1000, MODEL_CHEAP);
      const parsed = parseJsonLoose(text);
      if (!parsed?.items?.length) {
        setError('No se pudo parsear la respuesta.');
        return;
      }
      const items = parsed.items.map((it) => ({
        id: uuid(),
        name: String(it.name || '').trim(),
        kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(it.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(it.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(it.fat) || 0)),
        fiber: Math.max(0, Number(it.fiber) || 0),
        ...(kind === 'snack' ? { category: (it.category === 'dulce' ? 'dulce' : 'salado') } : {}),
        selected: true,
      }));
      setSuggestions(items);
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id) => {
    setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const confirmAdd = () => {
    const toAdd = suggestions.filter((s) => s.selected).map(({ selected, ...rest }) => ({ ...rest, builtin: false }));
    if (toAdd.length === 0) { onClose(); return; }
    setState((prev) => {
      if (kind === 'snack') return { ...prev, snackBank: [...prev.snackBank, ...toAdd] };
      if (kind === 'dessert') return { ...prev, dessertBank: [...(prev.dessertBank || []), ...toAdd] };
      return { ...prev, proteinBank: [...prev.proteinBank, ...toAdd] };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">✨ Sugerir {kind === 'snack' ? 'colaciones' : kind === 'dessert' ? 'postres' : 'cenas'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        {!suggestions && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Claude generará 5 ideas nuevas (sin repetir las que ya tienes) y podrás elegir cuáles agregar.
            </p>
            <button onClick={generate} disabled={loading || !apiKey}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300">
              {loading ? 'Generando ideas…' : 'Generar 5 ideas ✨'}
            </button>
            {!apiKey && (
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
            )}
          </>
        )}

        {suggestions && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Selecciona cuáles agregar ({suggestions.filter(s => s.selected).length}/{suggestions.length})
            </div>
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => toggleSelected(s.id)}
                className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                  s.selected
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                }`}>
                <div className="flex items-start gap-2">
                  <span className="text-xl shrink-0">{emojiForFood(s.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">{s.kcal}</span> kcal · P {s.protein}g · C {s.carbs}g · G {s.fat}g · F {Number(s.fiber).toFixed(0)}g
                      {s.category && <> · {s.category}</>}
                    </div>
                  </div>
                  <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                    s.selected
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {s.selected && '✓'}
                  </div>
                </div>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <button onClick={generate} disabled={loading}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium">
                {loading ? 'Generando…' : '🔄 Otras 5'}
              </button>
              <button onClick={confirmAdd}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
                Agregar {suggestions.filter(s => s.selected).length}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
      </div>
    </div>
  );
}

function BankView({ state, setState }) {
  const [editing, setEditing] = useState(null);
  const [suggesting, setSuggesting] = useState(null);
  const [showShopping, setShowShopping] = useState(false);

  const upsertSnack = (item) => {
    setState((prev) => {
      const exists = item.id && prev.snackBank.some((s) => s.id === item.id);
      const next = exists ? prev.snackBank.map((s) => (s.id === item.id ? { ...s, ...item } : s))
                          : [...prev.snackBank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, snackBank: next };
    });
    setEditing(null);
  };

  const upsertProtein = (item) => {
    setState((prev) => {
      const exists = item.id && prev.proteinBank.some((p) => p.id === item.id);
      const next = exists ? prev.proteinBank.map((p) => (p.id === item.id ? { ...p, ...item } : p))
                          : [...prev.proteinBank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, proteinBank: next };
    });
    setEditing(null);
  };

  const upsertDessert = (item) => {
    setState((prev) => {
      const bank = prev.dessertBank || [];
      const exists = item.id && bank.some((d) => d.id === item.id);
      const next = exists ? bank.map((d) => (d.id === item.id ? { ...d, ...item } : d))
                          : [...bank, { ...item, id: uuid(), builtin: false }];
      return { ...prev, dessertBank: next };
    });
    setEditing(null);
  };

  const deleteSnack = (id) => {
    setState((prev) => ({ ...prev, snackBank: prev.snackBank.filter((s) => s.id !== id), days: cleanupRefs(prev.days, 'snackId', id) }));
  };
  const deleteProtein = (id) => {
    setState((prev) => ({ ...prev, proteinBank: prev.proteinBank.filter((p) => p.id !== id), days: cleanupRefs(prev.days, 'proteinId', id) }));
  };
  const deleteDessert = (id) => {
    setState((prev) => {
      const bank = (prev.dessertBank || []).filter((d) => d.id !== id);
      const cleaned1 = cleanupRefs(prev.days, 'dessertAlmuerzoId', id);
      const cleaned2 = cleanupRefs(cleaned1, 'dessertCenaId', id);
      return { ...prev, dessertBank: bank, days: cleaned2 };
    });
  };

  return (
    <div className="px-4 py-4 space-y-5">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Banco</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Edita colaciones, proteínas de cena y postres</p>
      </div>

      <button onClick={() => setShowShopping(true)}
        className="w-full flex items-center gap-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
        <span className="text-2xl shrink-0">🛒</span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Generar lista de compras</div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">Basada en lo que comiste esta semana · compartible por WhatsApp</div>
        </div>
        <span className="shrink-0 text-emerald-700 dark:text-emerald-300 font-bold">→</span>
      </button>

      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Colaciones" />
          <button onClick={() => setSuggesting('snack')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.snackBank} kind="snack"
          onAdd={() => setEditing({ kind: 'snack', item: null })}
          onEdit={(item) => setEditing({ kind: 'snack', item })}
          onDelete={deleteSnack} />
      </div>
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Proteínas de cena" />
          <button onClick={() => setSuggesting('protein')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.proteinBank} kind="protein"
          onAdd={() => setEditing({ kind: 'protein', item: null })}
          onEdit={(item) => setEditing({ kind: 'protein', item })}
          onDelete={deleteProtein} />
      </div>
      <div>
        <div className="flex items-end justify-between mb-1">
          <SectionHeader title="Postres" hint="Opcional, para almuerzo o cena" />
          <button onClick={() => setSuggesting('dessert')}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50">
            ✨ Sugerir más
          </button>
        </div>
        <BankList items={state.dessertBank || []} kind="dessert"
          onAdd={() => setEditing({ kind: 'dessert', item: null })}
          onEdit={(item) => setEditing({ kind: 'dessert', item })}
          onDelete={deleteDessert} />
      </div>
      {editing && (
        <BankItemForm kind={editing.kind} initial={editing.item}
          apiKey={state.settings?.anthropicApiKey}
          onCancel={() => setEditing(null)}
          onSave={editing.kind === 'snack' ? upsertSnack : editing.kind === 'dessert' ? upsertDessert : upsertProtein} />
      )}
      {suggesting && (
        <SuggestBankModal kind={suggesting} state={state} setState={setState}
          onClose={() => setSuggesting(null)} />
      )}
      {showShopping && (
        <ShoppingListModal state={state} onClose={() => setShowShopping(false)} />
      )}
    </div>
  );
}

function AttachmentPreview({ attachment, onRemove }) {
  const a = attachment;
  return (
    <div className="relative h-24 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {a.kind === 'image' ? (
        <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/60 p-1.5 text-center">
          <span className="text-2xl">{a.kind === 'pdf' ? '📄' : '📋'}</span>
          <span className="text-[10px] mt-0.5 text-gray-600 dark:text-gray-400 line-clamp-2 break-all">{a.name}</span>
        </div>
      )}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center shadow-md">✕</button>
      )}
    </div>
  );
}

function RulesEditor({ rules, onChange }) {
  const list = Array.isArray(rules) ? rules : [];

  const updateRule = (id, patch) => {
    onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateConfig = (id, configPatch) => {
    onChange(list.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...configPatch } } : r)));
  };
  const removeRule = (id) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    onChange(list.filter((r) => r.id !== id));
  };
  const addRule = (type) => {
    const id = 'rule-' + Math.random().toString(36).slice(2, 8);
    let newRule;
    if (type === 'kcal_cap_extras') {
      newRule = { id, name: 'Sin extras pasando 2.000 kcal', enabled: true, type, config: { kcalCap: 2000 } };
    } else {
      // count_per_week — pedimos categoría
      const cat = prompt('Categoría (dulce / delivery / alcohol):', 'dulce');
      if (!cat || !RULE_CATEGORIES.includes(cat.trim().toLowerCase())) return;
      const category = cat.trim().toLowerCase();
      newRule = { id, name: `Máximo 1 ${category} por semana`, enabled: true, type: 'count_per_week', config: { category, max: 1 } };
    }
    onChange([...list, newRule]);
  };

  return (
    <div className="space-y-2">
      {list.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin reglas configuradas.</p>
      ) : (
        list.map((rule) => {
          const meta = RULE_TYPES[rule.type] || {};
          const paramKey = meta.paramKey;
          const paramVal = rule.config?.[paramKey];
          return (
            <div key={rule.id} className={`rounded-xl border ${rule.enabled ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'} bg-white dark:bg-gray-900 p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{meta.icon || '⚙️'}</span>
                <input type="text" value={rule.name}
                  onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                  className="flex-1 text-sm font-semibold bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none" />
                <label className="inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={!!rule.enabled}
                    onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    className="sr-only peer" />
                  <span className="relative w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></span>
                </label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{meta.paramLabel || 'valor'}:</span>
                <input type="number" step={meta.paramStep || 1} value={paramVal ?? ''}
                  onChange={(e) => updateConfig(rule.id, { [paramKey]: Number(e.target.value) || 0 })}
                  className="w-24 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {rule.config?.category && (
                  <span className="text-gray-500 dark:text-gray-400">· {rule.config.category}</span>
                )}
                <button type="button" onClick={() => removeRule(rule.id)}
                  className="ml-auto text-[11px] px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200">Borrar</button>
              </div>
            </div>
          );
        })
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={() => addRule('kcal_cap_extras')}
          className="py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          + Cap kcal/día
        </button>
        <button type="button" onClick={() => addRule('count_per_week')}
          className="py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          + Máximo por semana
        </button>
      </div>
    </div>
  );
}

function SyncSection({ state, setState }) {
  const initialPAT = state.settings?.githubPAT || '';
  const [pat, setPat] = useState(initialPAT);
  const [showPat, setShowPat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const gistId = state.settings?.syncGistId;
  const lastSync = state.settings?.lastSyncAt;
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [existingGistId, setExistingGistId] = useState('');

  const savePAT = (newPAT) => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), githubPAT: newPAT || null } }));
  };
  const saveGistId = (id) => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), syncGistId: id || null, lastSyncAt: new Date().toISOString() } }));
  };
  const updateLastSync = () => {
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), lastSyncAt: new Date().toISOString() } }));
  };

  const handleCreate = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Pega tu Personal Access Token primero.'); return; }
    setLoading(true);
    try {
      savePAT(pat.trim());
      const { id, updatedAt, htmlUrl } = await gistCreate(pat.trim(), state);
      saveGistId(id);
      setState((prev) => ({ ...prev, settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt } }));
      setInfo(`Gist creado ✓ — abre ${htmlUrl} para copiar el ID y usarlo en otro dispositivo.`);
    } catch (err) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectExisting = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Pega tu Personal Access Token primero.'); return; }
    const id = existingGistId.trim();
    if (!id) { setError('Pega el Gist ID que quieres conectar.'); return; }
    setLoading(true);
    try {
      savePAT(pat.trim());
      // Validar que el gist exista descargándolo
      await gistPull(pat.trim(), id);
      saveGistId(id);
      setExistingGistId('');
      setInfo('Gist conectado ✓ — usa "📥 Bajar y reemplazar" para traer los datos.');
    } catch (err) {
      setError(err.message || 'No se pudo conectar al gist');
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Falta PAT'); return; }
    if (!gistId) { setError('Conecta primero (crea el gist).'); return; }
    setLoading(true);
    try {
      const { updatedAt } = await gistPush(pat.trim(), gistId, state);
      setState((prev) => ({ ...prev, settings: { ...prev.settings, lastPushedSig: syncSig(prev), lastRemoteUpdatedAt: updatedAt, lastSyncAt: new Date().toISOString() } }));
      setInfo('Backup subido a GitHub ✓');
    } catch (err) {
      setError(err.message || 'Error al subir');
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    setError(null); setInfo(null);
    if (!pat.trim()) { setError('Falta PAT'); return; }
    if (!gistId) { setError('Conecta primero.'); return; }
    setLoading(true);
    try {
      const { state: remoteState, updatedAt } = await gistPull(pat.trim(), gistId);
      if (!remoteState || typeof remoteState !== 'object') throw new Error('Backup remoto inválido');
      // Reemplazar local con remoto, preservando credenciales/endpoint locales y fijando la base del auto-sync.
      setState((prev) => applyRemoteState(prev, remoteState, updatedAt));
      setInfo('Backup restaurado desde GitHub ✓');
      setConfirmRestore(false);
    } catch (err) {
      setError(err.message || 'Error al bajar');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    if (!confirm('¿Desconectar el gist? (no se borra el gist en GitHub, solo el link local)')) return;
    setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), syncGistId: null, lastSyncAt: null } }));
    setInfo('Desconectado.');
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Backup privado vía GitHub Gist. Tu PAT necesita scope <span className="font-mono">gist</span> (crea uno en github.com → Settings → Developer settings → Personal access tokens).
      </p>

      <label className="block">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">GitHub Personal Access Token</span>
        <div className="mt-1 flex gap-2">
          <input
            type={showPat ? 'text' : 'password'}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_..."
            autoComplete="off"
            spellCheck={false}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
          />
          <button type="button" onClick={() => setShowPat((v) => !v)}
            className="px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-xs">👁️</button>
        </div>
      </label>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 dark:text-gray-400">Estado:</span>
          <span className={`font-semibold ${gistId ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {gistId ? '✓ Conectado' : '○ Sin conectar'}
          </span>
        </div>
        {gistId && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">Gist ID:</span>
              <button type="button"
                onClick={() => { navigator.clipboard.writeText(gistId).then(() => { setInfo('Gist ID copiado al portapapeles ✓'); setTimeout(() => setInfo(null), 2500); }).catch(() => {}); }}
                className="font-mono text-[10px] text-gray-700 dark:text-gray-300 truncate ml-2 hover:text-emerald-600 dark:hover:text-emerald-400">
                {gistId} 📋
              </button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">tap para copiar · úsalo en otro dispositivo</p>
          </div>
        )}
        {lastSync && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">Última sync:</span>
            <span className="text-gray-700 dark:text-gray-300">{new Date(lastSync).toLocaleString('es-CL')}</span>
          </div>
        )}
        {gistId && (
          <label className="flex items-center justify-between text-[11px] pt-1 cursor-pointer">
            <span className="text-gray-600 dark:text-gray-300 font-medium">⚡ Sincronizar automático</span>
            <input type="checkbox"
              checked={state.settings?.autoSync ?? true}
              onChange={(e) => setState((prev) => ({ ...prev, settings: { ...(prev.settings || {}), autoSync: e.target.checked } }))}
              className="w-4 h-4 accent-emerald-500" />
          </label>
        )}
        {gistId && (state.settings?.autoSync ?? true) && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Sube solo al editar; baja solo al abrir si el otro equipo tiene algo más nuevo (y este no tiene cambios sin subir).</p>
        )}
      </div>

      {!gistId && (
        <div className="space-y-3">
          <button type="button" onClick={handleCreate} disabled={loading || !pat.trim()}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-sm">
            {loading ? 'Creando…' : '➕ Crear gist privado nuevo'}
          </button>
          <div className="relative flex items-center text-[10px] text-gray-400 dark:text-gray-500 gap-2">
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></span>
            <span>o si ya tienes uno en otro dispositivo</span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></span>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Gist ID existente</span>
            <input type="text" value={existingGistId}
              onChange={(e) => setExistingGistId(e.target.value)}
              placeholder="ej. 7a8b9c0d1e2f..."
              spellCheck={false}
              autoComplete="off"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono" />
          </label>
          <button type="button" onClick={handleConnectExisting} disabled={loading || !pat.trim() || !existingGistId.trim()}
            className="w-full py-2.5 rounded-xl border-2 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 text-sm">
            {loading ? 'Conectando…' : '🔗 Conectar a gist existente'}
          </button>
        </div>
      )}

      {gistId && !confirmRestore && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handlePush} disabled={loading}
            className="py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-sm">
            {loading ? '…' : '📤 Subir ahora'}
          </button>
          <button type="button" onClick={() => setConfirmRestore(true)} disabled={loading}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            📥 Bajar y reemplazar
          </button>
        </div>
      )}

      {gistId && confirmRestore && (
        <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            ⚠️ Esto reemplazará TODO tu state local con el backup remoto. ¿Continuar?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmRestore(false)}
              className="py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-xs">Cancelar</button>
            <button type="button" onClick={handlePull} disabled={loading}
              className="py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50">
              {loading ? 'Bajando…' : 'Sí, reemplazar'}
            </button>
          </div>
        </div>
      )}

      {gistId && (
        <button type="button" onClick={disconnect}
          className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400">
          🔓 Desconectar gist
        </button>
      )}

      {info && <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg">{info}</p>}
      {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
    </div>
  );
}

function BridgeSyncSection({ state, setState }) {
  const [url, setUrl] = useState(state.settings?.bridgeUrl || '');
  const [token, setToken] = useState(state.settings?.bridgeToken || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', msg }

  const saveUrl = (val) => setState((prev) => ({
    ...prev, settings: { ...(prev.settings || {}), bridgeUrl: val.trim() || null },
  }));
  const saveToken = (val) => setState((prev) => ({
    ...prev, settings: { ...(prev.settings || {}), bridgeToken: val.trim() || null },
  }));

  const doSync = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setStatus({ type: 'err', msg: 'Pega la URL del Apps Script primero.' }); return; }
    saveUrl(trimmed);
    const tok = token.trim();
    saveToken(tok);
    setBusy(true); setStatus(null);
    const res = await runBridgeSync({ settings: { bridgeUrl: trimmed, bridgeToken: tok } }, setState);
    setBusy(false);
    if (!res.ok) {
      setStatus({ type: 'err', msg: res.reason === 'fetch' ? ('No se pudo leer Drive: ' + (res.error || '')) : 'Configura la URL.' });
    } else {
      const a = res.added; const n = a.meals + a.weights + a.workouts + (a.checks || 0);
      const checksMsg = a.checks ? ` · ${a.checks} marcada(s) del plan` : '';
      setStatus({ type: 'ok', msg: n === 0 ? 'Al día, nada nuevo.' : `Importado: ${a.meals} comida(s) · ${a.weights} peso(s) · ${a.workouts} entrenamiento(s)${checksMsg}.` });
    }
  };

  const last = state.bridge?.lastSyncAt;
  const lastLabel = last ? new Date(last).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        Lee lo que registras por el chat de Claude (foto de comida, peso o entrenamiento). La app revisa al abrir; aquí puedes forzarlo.
      </p>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={(e) => saveUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off"
          className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs" />
        <button type="button" onClick={doSync} disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 whitespace-nowrap">
          {busy ? '…' : 'Sincronizar'}
        </button>
      </div>
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onBlur={(e) => saveToken(e.target.value)}
        placeholder="Token del bridge (mismo que SHARED_TOKEN del Apps Script)" autoComplete="off"
        className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs" />
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        Secreto compartido obligatorio: sin él, cualquiera con la URL puede leer o borrar tus datos. Debe ser idéntico al de <code className="bento-mono">SHARED_TOKEN</code> en el Apps Script.
      </p>
      {status && (
        <p className={`text-[11px] mt-1.5 ${status.type === 'err' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {status.type === 'ok' ? '✓ ' : '⚠️ '}{status.msg}
        </p>
      )}
      {lastLabel && !status && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Último: {lastLabel}</p>
      )}
    </div>
  );
}

function SettingsModal({ state, setState, onClose }) {
  const [key, setKey] = useState(state.settings?.anthropicApiKey || '');
  const [saveImages, setSaveImages] = useState(!!state.settings?.saveImages);
  const [show, setShow] = useState(false);
  const [bulkWeights, setBulkWeights] = useState(false);
  const [bulkWorkouts, setBulkWorkouts] = useState(false);
  const [editProfile, setEditProfile] = useState(false);

  const initialNotif = state.settings?.notifications || { enabled: false, almuerzo: '13:30', agua: '16:00', cena: '20:30' };
  const [notifEnabled, setNotifEnabled] = useState(!!initialNotif.enabled);
  const [notifAlmuerzo, setNotifAlmuerzo] = useState(initialNotif.almuerzo || '13:30');
  const [notifAgua, setNotifAgua] = useState(initialNotif.agua || '16:00');
  const [notifCena, setNotifCena] = useState(initialNotif.cena || '20:30');
  const [notifPermStatus, setNotifPermStatus] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [rulesDraft, setRulesDraft] = useState(() => (state.rules || []).map((r) => ({ ...r, config: { ...r.config } })));
  const [kcalDeficitDraft, setKcalDeficitDraft] = useState(() => {
    const v = state.userProfile?.kcalDeficit;
    return Number.isFinite(v) ? v : 400;
  });
  const previewTargets = useMemo(() => {
    if (!state.userProfile) return null;
    const draftProfile = { ...state.userProfile, kcalDeficit: kcalDeficitDraft, kcalTarget: null };
    return calcTargets(draftProfile);
  }, [state.userProfile, kcalDeficitDraft]);

  const existing = state.settings?.anthropicApiKey;
  const profile = state.userProfile;

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Tu navegador no soporta notificaciones.');
      return false;
    }
    if (Notification.permission === 'granted') {
      setNotifPermStatus('granted');
      return true;
    }
    if (Notification.permission === 'denied') {
      alert('Las notificaciones están bloqueadas en este navegador. Habilítalas desde la configuración del sitio.');
      setNotifPermStatus('denied');
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermStatus(result);
      return result === 'granted';
    } catch (e) {
      return false;
    }
  };

  const toggleNotifEnabled = async (v) => {
    if (v) {
      const granted = await requestNotifPermission();
      if (!granted) return;
    }
    setNotifEnabled(v);
  };

  const testNotification = () => {
    showLocalNotification('Plan Hugo · Prueba', 'Las notificaciones funcionan.', 'plan-hugo-test');
  };

  const save = () => {
    const profileChanged = state.userProfile && state.userProfile.kcalDeficit !== kcalDeficitDraft;
    setState((prev) => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        anthropicApiKey: key.trim() || null,
        saveImages,
        notifications: { enabled: notifEnabled, almuerzo: notifAlmuerzo, agua: notifAgua, cena: notifCena },
      },
      rules: rulesDraft,
      userProfile: prev.userProfile
        ? { ...prev.userProfile, kcalDeficit: kcalDeficitDraft, ...(profileChanged ? { updatedAt: new Date().toISOString() } : {}) }
        : prev.userProfile,
    }));
    onClose();
  };

  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(sanitizeStateForUpload(state), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-hugo-backup-${todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar: ' + e.message);
    }
  };

  const resetAll = () => {
    if (!confirm('¿Borrar TODOS los datos? Esto incluye historial de comidas, pesos, banco y onboarding. No se puede deshacer.')) return;
    if (!confirm('Confirma una vez más: ¿realmente quieres resetear todo?')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
    } catch {}
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">⚙️ Ajustes</h2>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Mi perfil & metas</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {profile
                  ? `${profile.age}a · ${profile.sex === 'F' ? '♀' : '♂'} · ${profile.heightCm}cm · ${profile.weightKg}kg · ${ACTIVITY_LABELS[profile.activityLevel]?.label || profile.activityLevel}`
                  : 'Sin configurar — usando targets default'}
              </div>
            </div>
            <button type="button" onClick={() => setEditProfile(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
              {profile ? 'Editar' : 'Configurar'}
            </button>
          </div>
          {profile && (() => {
            const t = calcTargets(profile);
            return (
              <div className="grid grid-cols-4 gap-1 text-center pt-1">
                <div><div className="text-[9px] uppercase text-gray-500">kcal</div><div className="text-xs font-bold">{t.kcalMax}</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">P</div><div className="text-xs font-bold">{t.proteinMin}g</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">C</div><div className="text-xs font-bold">{t.carbsTarget}g</div></div>
                <div><div className="text-[9px] uppercase text-gray-500">G</div><div className="text-xs font-bold">{t.fatTarget}g</div></div>
              </div>
            );
          })()}
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Anthropic API Key</span>
          <div className="mt-1 flex gap-2">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
            />
            <button type="button" onClick={() => setShow((s) => !s)}
              className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm">
              {show ? '🙈' : '👁️'}
            </button>
          </div>
          {existing && !show && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Guardada · termina en {existing.slice(-4)}</p>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
            Solo se guarda en este dispositivo. Se envía únicamente a api.anthropic.com.
          </p>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={saveImages} onChange={(e) => setSaveImages(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-emerald-500" />
          <div>
            <div className="text-sm font-medium">Guardar imágenes de mediciones</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Conserva la captura original (comprimida) en localStorage. Default: apagado.</div>
          </div>
        </label>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Recordatorios</div>
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={notifEnabled} onChange={(e) => toggleNotifEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500" />
            <div className="flex-1">
              <div className="text-sm font-medium">Notificaciones del navegador</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Permiso: <span className="font-semibold">{notifPermStatus}</span>
              </div>
              {notifPermStatus !== 'granted' && notifEnabled && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                  En iOS solo funciona si instalas la app desde Safari → Compartir → Agregar a inicio (iOS 16.4+).
                </p>
              )}
            </div>
          </label>
          {notifEnabled && notifPermStatus === 'granted' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🍚 Almuerzo</span>
                  <input type="time" value={notifAlmuerzo} onChange={(e) => setNotifAlmuerzo(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">💧 Agua</span>
                  <input type="time" value={notifAgua} onChange={(e) => setNotifAgua(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">🍽️ Cena</span>
                  <input type="time" value={notifCena} onChange={(e) => setNotifCena(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" />
                </label>
              </div>
              <button type="button" onClick={testNotification}
                className="mt-2 w-full py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                Enviar notificación de prueba
              </button>
            </>
          )}
        </div>

        {profile && profile.goal === 'lose' && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">📉 Déficit calórico diario</div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Cuánto comes por debajo de tu TDEE. El banner de ajuste automático también lo modifica cada ~2 semanas.</p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
              <div className="flex items-center justify-center gap-3">
                <button type="button"
                  onClick={() => setKcalDeficitDraft((v) => Math.max(0, v - 50))}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  −
                </button>
                <div className="text-center">
                  <input type="number" inputMode="numeric" step="50" min="0" max="1000"
                    value={kcalDeficitDraft}
                    onChange={(e) => setKcalDeficitDraft(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                    className="w-24 text-center text-2xl font-bold bg-transparent border-0 focus:outline-none" />
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">kcal/día</div>
                </div>
                <button type="button"
                  onClick={() => setKcalDeficitDraft((v) => Math.min(1000, v + 50))}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  +
                </button>
              </div>
              {previewTargets && previewTargets.tdee != null && (
                <div className="text-center text-[11px] text-gray-600 dark:text-gray-400">
                  TDEE: <span className="font-semibold">{previewTargets.tdee}</span> kcal · Meta diaria: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{previewTargets.kcalMax}</span> kcal
                </div>
              )}
              <div className="grid grid-cols-5 gap-1 text-[10px]">
                {[200, 400, 500, 600, 750].map((v) => (
                  <button type="button" key={v}
                    onClick={() => setKcalDeficitDraft(v)}
                    className={`py-1 rounded-lg font-semibold ${kcalDeficitDraft === v ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">📐 Reglas personales</div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">La app te alerta cuando vas a romper alguna. Edita el nombre haciendo click.</p>
          <RulesEditor rules={rulesDraft} onChange={setRulesDraft} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">☁️ Sync entre dispositivos</div>
          <SyncSection state={state} setState={setState} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">📲 Sincronizar desde el chat</div>
          <BridgeSyncSection state={state} setState={setState} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Importar histórico</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setBulkWeights(true)}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              ⚖️ Pesos
            </button>
            <button type="button" onClick={() => setBulkWorkouts(true)}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              🔥 Entrenamientos
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 mt-3">Datos</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={exportJson}
              className="py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-left hover:bg-gray-50 dark:hover:bg-gray-800">
              📤 Exportar JSON
            </button>
            <button type="button" onClick={resetAll}
              className="py-2.5 px-3 rounded-xl border border-rose-300 dark:border-rose-700 text-sm font-medium text-left text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20">
              🗑️ Resetear todo
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button type="button" onClick={save}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
        </div>
      </div>

      {editProfile && <OnboardingModal state={state} setState={setState} onClose={() => setEditProfile(false)} editing />}
      {bulkWeights && <BulkWeightsModal state={state} setState={setState} onClose={() => setBulkWeights(false)} />}
      {bulkWorkouts && <BulkWorkoutsModal state={state} setState={setState} onClose={() => setBulkWorkouts(false)} />}
    </div>
  );
}

function computeSMA(points, windowDays = 7) {
  if (!points.length) return [];
  const out = [];
  const windowMs = windowDays * 86400000;
  for (let i = 0; i < points.length; i++) {
    const t = points[i].x;
    const cutoff = t - windowMs;
    let sum = 0, count = 0;
    for (let j = i; j >= 0; j--) {
      if (points[j].x < cutoff) break;
      sum += points[j].y;
      count++;
    }
    out.push({ x: t, y: count > 0 ? sum / count : points[i].y });
  }
  return out;
}

const SMA_METRICS = new Set([
  'weightKg', 'bodyFatPct', 'fatKg', 'muscleKg', 'skeletalMuscleKg',
  'fatFreeMassKg', 'subcutaneousFatKg', 'waterKg', 'proteinKg',
  'waistCm', 'hipCm', 'chestCm', 'neckCm', 'bicepCm', 'thighCm',
  'bmi', 'ffmi', 'waistHipRatio',
]);

function WeightChart({ weights, metric }) {
  const m = CHART_METRICS.find((x) => x.key === metric) || CHART_METRICS[0];
  // Mide el ancho real del contenedor para que el viewBox sea 1:1 con los píxeles:
  // sin esto (preserveAspectRatio none) el SVG se estira y deforma puntos y trazos.
  const wrapRef = React.useRef(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = weights
    .filter((w) => w[m.key] != null)
    .map((w) => ({ x: new Date(w.date + 'T' + (w.time || '12:00')).getTime(), y: Number(w[m.key]) }))
    .sort((a, b) => a.x - b.x);

  if (points.length === 0) {
    return (
      <div ref={wrapRef} className="h-48 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 italic">
        Sin datos de {m.label.toLowerCase()} aún
      </div>
    );
  }

  const useSMA = SMA_METRICS.has(m.key) && points.length >= 3;
  const sma = useSMA ? computeSMA(points, 7) : [];

  const H = 224, padL = 38, padR = 16, padT = 22, padB = 26;
  const xs = points.map((p) => p.x);
  const allY = useSMA ? [...points.map((p) => p.y), ...sma.map((p) => p.y)] : points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...allY), maxY = Math.max(...allY);
  const spanY = maxY - minY || 1;
  minY -= spanY * 0.12; maxY += spanY * 0.12;
  const spanX = maxX - minX || 1;

  const sx = (x) => padL + ((x - minX) / spanX) * (W - padL - padR);
  const sy = (y) => H - padB - ((y - minY) / (maxY - minY || 1)) * (H - padT - padB);
  const baseY = H - padB;

  // Línea principal: la media móvil cuando aplica, si no la serie cruda.
  const mainPts = useSMA ? sma : points;
  const linePath = mainPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const areaPath = mainPts.length
    ? `${linePath} L ${sx(mainPts[mainPts.length - 1].x).toFixed(1)} ${baseY.toFixed(1)} L ${sx(mainPts[0].x).toFixed(1)} ${baseY.toFixed(1)} Z`
    : '';
  const rawPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');

  const spansMultipleYears = points.length > 1
    && new Date(points[0].x).getFullYear() !== new Date(points[points.length - 1].x).getFullYear();

  const fmtDate = (ts, withYear = false) => {
    const d = new Date(ts);
    const base = `${d.getDate()}/${d.getMonth() + 1}`;
    return withYear ? `${base}/${String(d.getFullYear()).slice(-2)}` : base;
  };
  const dec = spanY < 5 ? 1 : 0;
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);

  const last = points[points.length - 1];
  const lastX = sx(last.x), lastY = sy(last.y);
  const lastLabel = `${last.y.toFixed(dec)}${m.unit ? ' ' + m.unit : ''}`;
  const labelAnchor = lastX > W - 60 ? 'end' : 'middle';
  const labelY = Math.max(padT - 6, lastY - 14);
  const gradId = `wchart-grad-${m.key}`;

  return (
    <div ref={wrapRef} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: H }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={m.color} stopOpacity="0.28" />
            <stop offset="92%" stopColor={m.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke="currentColor"
              className="text-gray-200/70 dark:text-gray-700/50" strokeWidth="1"
              strokeDasharray={i === 0 ? '0' : '3 5'} strokeLinecap="round" />
            <text x={padL - 8} y={sy(v) + 3.5} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" fontSize="10.5">
              {v.toFixed(dec)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}

        {/* Serie cruda tenue detrás de la media móvil */}
        {useSMA && (
          <path d={rawPath} fill="none" stroke={m.color} strokeWidth="1.5" strokeOpacity="0.22" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Línea principal */}
        <path d={linePath} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => {
          const skipLabel = points.length > 6 && i % Math.ceil(points.length / 6) !== 0 && i !== points.length - 1;
          const anchor = spansMultipleYears
            ? (i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle'))
            : 'middle';
          return !skipLabel && (
            <text key={`x${i}`} x={sx(p.x)} y={H - 7} textAnchor={anchor} className="fill-gray-400 dark:fill-gray-500" fontSize="10.5">
              {fmtDate(p.x, spansMultipleYears)}
            </text>
          );
        })}

        {/* Puntos crudos discretos (cuando hay media móvil) */}
        {useSMA && points.map((p, i) => (
          <circle key={`pt${i}`} cx={sx(p.x)} cy={sy(p.y)} r="2.5" fill={m.color} fillOpacity="0.35">
            <title>{`${fmtDate(p.x, true)}: ${p.y.toFixed(1)}${m.unit ? ' ' + m.unit : ''}`}</title>
          </circle>
        ))}
        {!useSMA && points.map((p, i) => (
          <circle key={`pt${i}`} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="currentColor"
            className="text-white dark:text-gray-900" stroke={m.color} strokeWidth="2.5">
            <title>{`${fmtDate(p.x, true)}: ${p.y.toFixed(1)}${m.unit ? ' ' + m.unit : ''}`}</title>
          </circle>
        ))}

        {/* Último punto destacado + valor actual */}
        <circle cx={lastX} cy={lastY} r="9" fill={m.color} fillOpacity="0.16" />
        <circle cx={lastX} cy={lastY} r="4.5" fill={m.color} stroke="currentColor" className="text-white dark:text-gray-900" strokeWidth="2" />
        <text x={lastX} y={labelY} textAnchor={labelAnchor} fontSize="12.5" fontWeight="700" fill={m.color}>
          {lastLabel}
          <title>{`${fmtDate(last.x, true)}: ${lastLabel}`}</title>
        </text>
      </svg>

      {useSMA && (
        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 px-1 mt-1.5">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: m.color, opacity: 0.3 }}></span>
            valores crudos
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3.5 h-1 rounded-full" style={{ background: m.color }}></span>
            media móvil 7d
          </span>
        </div>
      )}
    </div>
  );
}

function WeightEntryModal({ state, setState, editing, initialMode, onClose }) {
  const [mode, setMode] = useState(editing ? 'manual' : (initialMode || 'upload'));
  const [attachments, setAttachments] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState(() => {
    const f = { date: todayKey(), time: '' };
    for (const wf of WEIGHT_FIELDS) f[wf.key] = '';
    for (const sf of STRING_FIELDS) f[sf.key] = '';
    for (const seg of SEGMENT_FIELDS) f[seg.key] = '';
    if (editing) {
      f.date = editing.date || todayKey();
      f.time = editing.time || '';
      for (const wf of WEIGHT_FIELDS) f[wf.key] = editing[wf.key] != null ? String(editing[wf.key]) : '';
      for (const sf of STRING_FIELDS) f[sf.key] = editing[sf.key] || '';
      for (const seg of SEGMENT_FIELDS) f[seg.key] = editing[seg.key] || '';
    }
    return f;
  });
  const [note, setNote] = useState(editing?.note || '');
  const [extraFields, setExtraFields] = useState(editing?.rawExtracted && Object.keys(editing.rawExtracted).filter(k => !WEIGHT_FIELDS.find(wf => wf.key === k) && !STRING_FIELDS.find(sf => sf.key === k) && !SEGMENT_FIELDS.find(seg => seg.key === k)) || []);
  const [mergePrompt, setMergePrompt] = useState(false);
  // Secciones colapsables: por defecto colapsadas si no hay datos
  const hasDataInCat = (cat) => {
    if (cat === 'seg') return SEGMENT_FIELDS.some(seg => editing?.[seg.key]);
    return WEIGHT_FIELDS.filter(wf => wf.cat === cat).some(wf => editing?.[wf.key] != null)
      || STRING_FIELDS.filter(sf => sf.cat === cat).some(sf => editing?.[sf.key]);
  };
  const [openSections, setOpenSections] = useState(() => ({
    main: true, // siempre abierta
    mass: editing ? hasDataInCat('mass') : true,
    pct: editing ? hasDataInCat('pct') : false,
    idx: editing ? hasDataInCat('idx') : false,
    static: editing ? hasDataInCat('static') : false,
    circ: editing ? hasDataInCat('circ') : false,
    seg: editing ? hasDataInCat('seg') : false,
  }));
  const toggleSection = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const apiKey = state.settings?.anthropicApiKey;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} archivos.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos (máximo ${MAX_IMAGES}).`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleProcess = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (attachments.length === 0) return;
    setProcessing(true); setError(null);
    try {
      const extracted = await extractMetricsFromImage(attachments, apiKey);
      const next = { ...fields };
      if (typeof extracted.measurementDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.measurementDate)) {
        next.date = extracted.measurementDate;
      }
      for (const wf of WEIGHT_FIELDS) {
        if (extracted[wf.key] != null) next[wf.key] = String(extracted[wf.key]);
      }
      for (const sf of STRING_FIELDS) {
        if (extracted[sf.key] != null) next[sf.key] = String(extracted[sf.key]);
      }
      for (const seg of SEGMENT_FIELDS) {
        if (extracted[seg.key] != null) next[seg.key] = String(extracted[seg.key]);
      }
      setFields(next);
      const knownKeys = new Set([
        ...WEIGHT_FIELDS.map(wf => wf.key),
        ...STRING_FIELDS.map(sf => sf.key),
        ...SEGMENT_FIELDS.map(seg => seg.key),
        'measurementDate',
      ]);
      const extras = Object.keys(extracted).filter((k) => !knownKeys.has(k) && extracted[k] != null);
      if (extras.length) {
        setExtraFields(extras.map((k) => ({ key: k, value: extracted[k] })));
      }
      // Auto-expand sections that received data
      setOpenSections((s) => ({
        ...s,
        mass: s.mass || WEIGHT_FIELDS.filter(wf => wf.cat === 'mass').some(wf => extracted[wf.key] != null),
        pct: s.pct || WEIGHT_FIELDS.filter(wf => wf.cat === 'pct').some(wf => extracted[wf.key] != null),
        idx: s.idx || WEIGHT_FIELDS.filter(wf => wf.cat === 'idx').some(wf => extracted[wf.key] != null) || STRING_FIELDS.some(sf => extracted[sf.key] != null),
        static: s.static || WEIGHT_FIELDS.filter(wf => wf.cat === 'static').some(wf => extracted[wf.key] != null),
        circ: s.circ || WEIGHT_FIELDS.filter(wf => wf.cat === 'circ').some(wf => extracted[wf.key] != null),
        seg: s.seg || SEGMENT_FIELDS.some(seg => extracted[seg.key] != null),
      }));
      setMode('manual');
    } catch (err) {
      setError(err.message || 'Error procesando archivos');
    } finally {
      setProcessing(false);
    }
  };

  const buildPayload = () => {
    const out = { id: editing?.id || uuid(), date: fields.date, time: fields.time || null, note: note.trim() };
    for (const wf of WEIGHT_FIELDS) {
      const v = String(fields[wf.key] || '').trim();
      out[wf.key] = v === '' ? null : Number(v);
    }
    for (const sf of STRING_FIELDS) {
      const v = String(fields[sf.key] || '').trim();
      out[sf.key] = v === '' ? null : v;
    }
    for (const seg of SEGMENT_FIELDS) {
      const v = String(fields[seg.key] || '').trim();
      out[seg.key] = v === '' ? null : v;
    }
    if (extraFields.length) {
      out.rawExtracted = {};
      for (const ef of extraFields) {
        if (ef.key && ef.value !== '' && ef.value != null) {
          out.rawExtracted[ef.key] = typeof ef.value === 'number' ? ef.value : (isNaN(Number(ef.value)) ? ef.value : Number(ef.value));
        }
      }
    }
    if (state.settings?.saveImages && attachments.length) {
      const firstImage = attachments.find((a) => a.kind === 'image');
      if (firstImage) out.sourceImage = firstImage.dataUrl;
    }
    return out;
  };

  const sameDayExisting = !editing
    ? (state.weights || []).find((w) => w.date === fields.date)
    : null;

  const doSave = (mergeWithId = null) => {
    const out = buildPayload();
    setState((prev) => {
      const list = prev.weights || [];
      let next;
      if (editing) {
        next = list.map((w) => (w.id === editing.id ? { ...w, ...out } : w));
      } else if (mergeWithId) {
        next = list.map((w) => {
          if (w.id !== mergeWithId) return w;
          const merged = { ...w };
          for (const wf of WEIGHT_FIELDS) {
            if (out[wf.key] != null) merged[wf.key] = out[wf.key];
          }
          for (const sf of STRING_FIELDS) {
            if (out[sf.key] != null) merged[sf.key] = out[sf.key];
          }
          for (const seg of SEGMENT_FIELDS) {
            if (out[seg.key] != null) merged[seg.key] = out[seg.key];
          }
          if (out.note) merged.note = w.note ? `${w.note} · ${out.note}` : out.note;
          if (out.rawExtracted) merged.rawExtracted = { ...(w.rawExtracted || {}), ...out.rawExtracted };
          if (out.time && !w.time) merged.time = out.time;
          if (out.sourceImage && !w.sourceImage) merged.sourceImage = out.sourceImage;
          return merged;
        });
      } else {
        next = [...list, out];
      }
      return { ...prev, weights: next };
    });
    onClose();
  };

  const save = () => {
    if (sameDayExisting) {
      setMergePrompt(true);
      return;
    }
    doSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? 'Editar medición' : 'Nueva medición'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm">✕</button>
        </div>

        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('upload')}
              className={`py-2 rounded-xl text-sm font-medium border-2 ${mode === 'upload' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              📸 Captura
            </button>
            <button onClick={() => setMode('manual')}
              className={`py-2 rounded-xl text-sm font-medium border-2 ${mode === 'manual' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              ✏️ Manual
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fecha</span>
            <input type="date" value={fields.date}
              onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Hora (opcional)</span>
            <input type="time" value={fields.time}
              onChange={(e) => setFields((f) => ({ ...f, time: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>
        {mode === 'upload' && !editing && fields.date === todayKey() && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 -mt-2">
            ⚠️ Si la medición es de otro día, cambia la fecha antes de procesar.
          </p>
        )}

        {mode === 'upload' && !editing && (
          <div className="space-y-3">
            {attachments.length === 0 ? (
              <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-500">
                <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                <div className="text-4xl mb-2">📎</div>
                <div className="text-sm font-medium">Subir capturas, PDFs o exportaciones</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Foto · PDF · CSV · JSON · TXT — hasta {MAX_IMAGES} archivos</div>
              </label>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {attachments.map((a, i) => (
                    <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
                  ))}
                  {attachments.length < MAX_IMAGES && (
                    <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                      <input type="file" accept="image/*,application/pdf,.pdf,.csv,.json,.txt,.xml" multiple onChange={handleFiles} className="hidden" />
                      +
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{attachments.length} / {MAX_IMAGES} archivos · Claude los procesará juntos y combinará los campos.</p>
                <button onClick={handleProcess} disabled={processing || !apiKey}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
                  {processing ? 'Procesando…' : 'Procesar con Claude ✨'}
                </button>
                {!apiKey && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Configura tu API key en ⚙️ Ajustes primero.</p>
                )}
              </div>
            )}
            {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
          </div>
        )}

        {(mode === 'manual' || editing) && (
          <div className="space-y-3">
            {Object.entries(WEIGHT_CAT_LABELS).map(([catKey, catLabel]) => {
              const fieldsInCat = WEIGHT_FIELDS.filter((wf) => wf.cat === catKey);
              const stringFieldsInCat = STRING_FIELDS.filter((sf) => sf.cat === catKey);
              if (fieldsInCat.length === 0 && stringFieldsInCat.length === 0) return null;
              const isOpen = openSections[catKey];
              const filledCount = fieldsInCat.filter(wf => fields[wf.key] !== '').length
                + stringFieldsInCat.filter(sf => fields[sf.key] !== '').length;
              return (
                <div key={catKey} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <button type="button" onClick={() => toggleSection(catKey)}
                    className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">{catLabel}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {filledCount > 0 && <span className="mr-2 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">{filledCount}</span>}
                      {isOpen ? '▼' : '▶'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-3 grid grid-cols-2 gap-3">
                      {fieldsInCat.map((wf) => (
                        <label key={wf.key} className="block">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{wf.label}{wf.unit && ` (${wf.unit})`}</span>
                          <input type="number" inputMode="decimal" step={wf.step} value={fields[wf.key]}
                            onChange={(e) => setFields((f) => ({ ...f, [wf.key]: e.target.value }))}
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                        </label>
                      ))}
                      {stringFieldsInCat.map((sf) => (
                        <label key={sf.key} className="block col-span-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{sf.label}</span>
                          <select value={fields[sf.key]}
                            onChange={(e) => setFields((f) => ({ ...f, [sf.key]: e.target.value }))}
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="">— Sin especificar —</option>
                            {sf.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Análisis segmental */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button type="button" onClick={() => toggleSection('seg')}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/60">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Análisis segmental</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {(() => {
                    const n = SEGMENT_FIELDS.filter(sf => fields[sf.key] !== '').length;
                    return n > 0 ? <span className="mr-2 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">{n}</span> : null;
                  })()}
                  {openSections.seg ? '▼' : '▶'}
                </span>
              </button>
              {openSections.seg && (
                <div className="p-3 space-y-3">
                  {['fat', 'muscle'].map((grp) => (
                    <div key={grp}>
                      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        {grp === 'fat' ? 'Grasa por zona' : 'Músculo por zona'}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {SEGMENT_FIELDS.filter(sf => sf.group === grp).map((seg) => (
                          <label key={seg.key} className="block">
                            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{seg.label}</span>
                            <select value={fields[seg.key]}
                              onChange={(e) => setFields((f) => ({ ...f, [seg.key]: e.target.value }))}
                              className="mt-0.5 w-full px-2 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                              <option value="">—</option>
                              {SEGMENT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {extraFields.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Campos extra detectados</div>
                <div className="space-y-1.5">
                  {extraFields.map((ef, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-gray-700 dark:text-gray-300">{ef.key}</span>
                      <span className="font-semibold">{String(ef.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nota (opcional)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. en ayunas, post-entreno"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          </div>
        )}

        {(mode === 'manual' || editing) && (
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar</button>
          </div>
        )}
      </div>

      {mergePrompt && sameDayExisting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <h3 className="text-base font-bold">Ya hay una medición del {fields.date}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">¿Quieres agregar estos datos a la medición existente o crear una nueva?</p>
            <div className="space-y-2">
              <button onClick={() => doSave(sameDayExisting.id)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
                Mergear con existente
              </button>
              <button onClick={() => doSave()}
                className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">
                Crear nueva medición
              </button>
              <button onClick={() => setMergePrompt(false)}
                className="w-full py-2 text-sm text-gray-500 dark:text-gray-400">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "+1.2", "−0.4", "0.0" — usa el signo menos tipográfico como en TrendAnalysis.
function fmtDelta(v, decimals = 1) {
  const s = Math.abs(v).toFixed(decimals);
  if (v > 0) return `+${s}`;
  if (v < 0) return `−${s}`;
  return s;
}

function shortDate(key) {
  // "2026-05-27" → "27/5"
  const [, mm, dd] = (key || '').split('-');
  return dd && mm ? `${Number(dd)}/${Number(mm)}` : key;
}

function EvolutionAnalysis({ state }) {
  const ev = computeEvolution(state.weights || [], state.userProfile?.goal);
  const total = (state.weights || []).filter((w) => w.weightKg != null).length;

  if (!ev) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📈</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tu evolución</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Necesitas al menos <span className="font-semibold">2 pesajes</span> para ver tu evolución.
          {total === 1 && ' Te falta 1 medición más.'}
          {total === 0 && ' Agrega tu primer pesaje arriba.'}
        </p>
      </div>
    );
  }

  const mantener = ev.metrics.filter((m) => m.status === 'mejora');
  const mejorar = ev.metrics.filter((m) => m.status === 'empeora');
  const toneFor = (status) => status === 'mejora' ? COLOR_CLASSES.green.text
    : status === 'empeora' ? COLOR_CLASSES.red.text : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tu evolución</h3>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          desde {shortDate(ev.firstDate)} · {ev.spanDays} {ev.spanDays === 1 ? 'día' : 'días'} · {ev.count} pesajes
        </span>
      </div>

      {/* Cambio total por métrica */}
      <div className="grid grid-cols-2 gap-3">
        {ev.metrics.map((m) => (
          <div key={m.key}>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{m.label}</div>
            <div className={`text-lg font-bold ${toneFor(m.status)}`}>
              {fmtDelta(m.delta, m.decimals)}<span className="text-xs font-normal ml-0.5">{m.unit}</span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">
              {m.first.toFixed(m.decimals)} → {m.last.toFixed(m.decimals)}{m.unit ? ` ${m.unit}` : ''}
            </div>
          </div>
        ))}
      </div>

      {ev.recomp && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <span className="text-base">💪</span>
          <p className={`text-xs ${COLOR_CLASSES.green.text}`}>
            <span className="font-semibold">Recomposición:</span> estás bajando grasa sin perder músculo. Justo lo que buscas.
          </p>
        </div>
      )}

      {/* Qué mantener */}
      {mantener.length > 0 && (
        <div className={`px-3 py-2.5 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${COLOR_CLASSES.green.text}`}>✅ Qué mantener</div>
          <ul className={`space-y-1 text-xs ${COLOR_CLASSES.green.text}`}>
            {mantener.map((m) => (
              <li key={m.key}>
                <span className="font-semibold">{m.label}</span>{' '}
                {m.better === 'down' ? 'bajando' : 'subiendo'} {Math.abs(m.weekly).toFixed(m.decimals)}{m.unit ? ` ${m.unit}` : ''}/sem — sigue así.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Qué mejorar */}
      {mejorar.length > 0 ? (
        <div className={`px-3 py-2.5 rounded-xl ${COLOR_CLASSES.amber.bg}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${COLOR_CLASSES.amber.text}`}>⚠️ Qué mejorar</div>
          <ul className={`space-y-1 text-xs ${COLOR_CLASSES.amber.text}`}>
            {mejorar.map((m) => (
              <li key={m.key}>
                <span className="font-semibold">{m.label}</span>{' '}
                {m.better === 'down'
                  ? `subió ${Math.abs(m.delta).toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''} — apunta a bajarla.`
                  : `bajó ${Math.abs(m.delta).toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''} — cuídala con proteína y fuerza.`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES.green.bg}`}>
          <span className="text-base">🎯</span>
          <p className={`text-xs ${COLOR_CLASSES.green.text}`}>Nada que corregir: todas tus métricas van en la dirección correcta.</p>
        </div>
      )}
    </div>
  );
}

function TrendAnalysis({ state, targets }) {
  const data = computeTrendAnalysis(state.weights || [], state.days || {}, state.snackBank || [], state.proteinBank || [], targets, state.dessertBank || [], state.antojoCustomItems || []);
  const total = (state.weights || []).filter((w) => w.weightKg != null).length;

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis de tendencia</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Necesitas al menos <span className="font-semibold">2 pesajes</span> para ver análisis.
          {total === 1 && ' Te falta 1 medición más.'}
          {total === 0 && ' Agrega tu primer pesaje arriba.'}
        </p>
      </div>
    );
  }

  const i = interpretTrend(data, targets);
  const tone = i.tone;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis de tendencia</h3>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">Últimos {data.diasReal} {data.diasReal === 1 ? 'día' : 'días'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Cambio de peso</div>
          <div className={`text-lg font-bold ${data.deltaKg < 0 ? COLOR_CLASSES.green.text : data.deltaKg > 0 ? COLOR_CLASSES.red.text : ''}`}>
            {data.deltaKg > 0 ? '+' : ''}{data.deltaKg.toFixed(1)}<span className="text-xs font-normal ml-0.5">kg</span>
          </div>
        </div>
        {data.promedioKcal != null && (
          <div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Promedio diario</div>
            <div className="text-lg font-bold">{data.promedioKcal}<span className="text-xs font-normal ml-0.5">kcal</span></div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{data.daysCount} de {data.diasReal} días</div>
          </div>
        )}
      </div>

      {data.tdeeEstimado != null && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">TDEE estimado real</div>
            <div className="text-lg font-bold">~{data.tdeeEstimado}<span className="text-xs font-normal ml-0.5">kcal</span></div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Déficit / superávit</div>
            <div className={`text-lg font-bold ${data.deficitDiario > 0 ? COLOR_CLASSES.green.text : data.deficitDiario < 0 ? COLOR_CLASSES.red.text : ''}`}>
              {data.deficitDiario > 0 ? '−' : data.deficitDiario < 0 ? '+' : ''}{Math.abs(data.deficitDiario)}<span className="text-xs font-normal ml-0.5">kcal/día</span>
            </div>
          </div>
        </div>
      )}

      {data.promedioKcal == null && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
          Sin días con comidas registradas entre las dos mediciones. No puedo calcular tu TDEE estimado.
        </p>
      )}

      <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${COLOR_CLASSES[tone].bg}`}>
        <span className="text-base">{i.icon}</span>
        <p className={`text-xs ${COLOR_CLASSES[tone].text}`}>{i.text}</p>
      </div>
    </div>
  );
}

const SEGMENT_TONE = {
  'Bajo':       { bg: 'bg-sky-100 dark:bg-sky-900/30',     text: 'text-sky-700 dark:text-sky-300' },
  'Bien':       { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'Alto':       { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  'Muy alto':   { bg: 'bg-rose-100 dark:bg-rose-900/30',   text: 'text-rose-700 dark:text-rose-300' },
};

// Rangos de referencia (adulto; por defecto hombre, como Hugo) para clasificar cada
// métrica tipo "semáforo" igual que Speediance (Bajo/Bien/Alto/Muy alto → SEGMENT_TONE).
// Cada `bands` es una lista ordenada [maxExclusivo, label]; el último label aplica al
// resto. Solo incluimos métricas con un estándar clínico claro y útil; las que no
// tienen rango absoluto significativo (kg de grasa/músculo, peso) no llevan semáforo.
// Umbrales de referencia general — ajustables si tu báscula usa otra escala.
const REFERENCE_RANGES = {
  bodyFatPct:    { M: [[8, 'Bajo'], [20, 'Bien'], [25, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[15, 'Bajo'], [28, 'Bien'], [33, 'Alto'], [Infinity, 'Muy alto']] },
  visceralFat:   { both: [[10, 'Bien'], [15, 'Alto'], [Infinity, 'Muy alto']] },
  bmi:           { both: [[18.5, 'Bajo'], [25, 'Bien'], [30, 'Alto'], [Infinity, 'Muy alto']] },
  waistHipRatio: { M: [[0.90, 'Bien'], [1.0, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[0.80, 'Bien'], [0.85, 'Alto'], [Infinity, 'Muy alto']] },
  ffmi:          { M: [[18, 'Bajo'], [22, 'Bien'], [25, 'Alto'], [Infinity, 'Muy alto']],
                   F: [[15, 'Bajo'], [19, 'Bien'], [22, 'Alto'], [Infinity, 'Muy alto']] },
  waterPct:      { M: [[50, 'Bajo'], [65, 'Bien'], [Infinity, 'Alto']],
                   F: [[45, 'Bajo'], [60, 'Bien'], [Infinity, 'Alto']] },
  proteinPct:    { both: [[16, 'Bajo'], [20, 'Bien'], [Infinity, 'Alto']] },
  musclePct:     { M: [[40, 'Bajo'], [55, 'Bien'], [Infinity, 'Alto']],
                   F: [[35, 'Bajo'], [50, 'Bien'], [Infinity, 'Alto']] },
};

// Devuelve el label de estado ('Bajo'|'Bien'|'Alto'|'Muy alto') para una métrica, o
// null si no hay rango definido o el valor no es numérico.
function evalMetric(key, value, profile) {
  const def = REFERENCE_RANGES[key];
  if (!def || value == null || value === '') return null;
  const n = Number(value);
  if (!isFinite(n)) return null;
  const sex = profile?.sex === 'F' ? 'F' : 'M';
  const bands = def.both || def[sex];
  if (!bands) return null;
  for (const [max, label] of bands) {
    if (n < max) return label;
  }
  return bands[bands.length - 1][1];
}

function MetricStatusChip({ statusLabel }) {
  if (!statusLabel) return null;
  const tone = SEGMENT_TONE[statusLabel] || SEGMENT_TONE['Bien'];
  return <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold align-middle ${tone.bg} ${tone.text}`}>{statusLabel}</span>;
}

function NotesHistory({ state }) {
  const today = todayKey();
  const days = state?.days || {};
  // Recolectar últimos 14 días con notas
  const entries = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    const day = days[k];
    if (day?.notes) {
      const notes = day.notes;
      const hasAny = NOTE_FIELDS.some((f) => notes[f.key] != null) || notes.comment;
      if (hasAny) entries.push({ date: k, notes });
    }
  }
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">📓</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notas recientes</h3>
        <span className="ml-auto text-[10px] text-gray-400">últimos 14 días</span>
      </div>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.date} className="flex items-start gap-2 text-xs py-1 border-t border-gray-100 dark:border-gray-800 first:border-0">
            <div className="w-14 shrink-0 text-gray-500 dark:text-gray-400 font-mono">{e.date.slice(5)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {NOTE_FIELDS.filter((f) => e.notes[f.key] != null).map((f) => (
                  <span key={f.key} className="text-gray-700 dark:text-gray-300">
                    {f.emoji} <span className="font-semibold">{e.notes[f.key]}</span>
                  </span>
                ))}
              </div>
              {e.notes.comment && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-0.5 truncate">"{e.notes.comment}"</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanAdjustmentBanner({ state, setState }) {
  const adjustment = useMemo(() => computePlanAdjustment(state), [state]);
  if (!adjustment) return null;

  const stampAdjustment = (newDeficit, newLastAdjustmentDate) => {
    setState((prev) => ({
      ...prev,
      userProfile: {
        ...(prev.userProfile || {}),
        ...(newDeficit != null ? { kcalDeficit: newDeficit } : {}),
        lastAdjustmentDate: newLastAdjustmentDate,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const onPostpone7 = () => {
    // Mantener todo, marcar lastAdjustmentDate como hace 7 días → vuelve a evaluar en 7 días
    const d = new Date(); d.setDate(d.getDate() - 7);
    stampAdjustment(null, todayKey(d));
  };
  const onDismiss = () => stampAdjustment(null, todayKey());

  // CASO LENTO (<0.4 %/sem por ≥2 sem): extender duración del cardio. No tocar calorías.
  if (adjustment.kind === 'too_slow') {
    const onAck = () => stampAdjustment(null, todayKey());
    return (
      <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">🐢</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Pérdida lenta — extiende el cardio</h3>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">{adjustment.message}</p>
          </div>
        </div>
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Alarga la <strong>duración</strong> de tus sesiones de cardio. No agregues días ni recortes más calorías: la meta calórica (máx 2.092 kcal) se mantiene.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onAck}
            className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
            ✓ Entendido
          </button>
          <button onClick={onPostpone7}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            ⏰ 7 días
          </button>
        </div>
      </div>
    );
  }

  // CASO RÁPIDO (>0.8 %/sem): riesgo de masa magra → subir ~100-150 kcal (bajar déficit).
  const onApply = () => stampAdjustment(adjustment.suggestedDeficit, todayKey());
  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚠️</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Pérdida demasiado rápida</h3>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">{adjustment.message}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Déficit actual</div>
          <div className="text-lg font-bold text-gray-700 dark:text-gray-200">{adjustment.currentDeficit} <span className="text-xs font-normal">kcal/día</span></div>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">Sugerencia ↑</div>
          <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{adjustment.suggestedDeficit} <span className="text-xs font-normal">kcal/día</span></div>
        </div>
      </div>

      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        Esto se traduce en comer ~{Math.abs(adjustment.delta)} kcal más por día para preservar masa magra. La meta diaria se recalcula automáticamente.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onApply}
          className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
          ✓ Aplicar
        </button>
        <button onClick={onPostpone7}
          className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          ⏰ 7 días
        </button>
        <button onClick={onDismiss}
          className="py-2.5 rounded-xl text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          No ahora
        </button>
      </div>
    </div>
  );
}

function WeighInNudge({ weights, onAction }) {
  const last = (weights || []).filter((w) => w.weightKg != null)
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const today = todayKey();
  let daysSince = 999;
  if (last?.date) {
    const ms = new Date(today + 'T12:00:00') - new Date(last.date + 'T12:00:00');
    daysSince = Math.max(0, Math.round(ms / 86400000));
  }
  if (daysSince < 3) return null;

  const isFirst = !last;
  return (
    <button onClick={onAction}
      className="w-full text-left rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-3.5 flex items-center gap-3 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
      <span className="text-2xl shrink-0">📸</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {isFirst ? 'Empieza tu primer pesaje' : `Toca pesaje Speediance (${daysSince} días sin medir)`}
        </div>
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
          Cada ~3-4 días. Saca 4-5 capturas de la app y Claude las procesa.
        </div>
      </div>
      <span className="shrink-0 text-emerald-700 dark:text-emerald-300 font-bold text-lg">→</span>
    </button>
  );
}

function RuleChips({ state, dateKey, targets }) {
  const statuses = useMemo(
    () => getRulesStatus(state, dateKey, targets),
    [state, dateKey, targets]
  );
  if (!statuses.length) return null;
  const toneClasses = {
    green: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    red: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
      {statuses.map((s) => (
        <div key={s.rule.id} title={s.rule.name}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${toneClasses[s.tone] || toneClasses.green}`}>
          <span>{s.rule.type === 'kcal_cap_extras' ? '🚫' : s.label === 'dulces' ? '🍰' : s.label === 'delivery' ? '🍱' : s.label === 'alcohol' ? '🍷' : '🔢'}</span>
          <span>{s.label}</span>
          <span className="opacity-80">{s.current}/{s.max}</span>
        </div>
      ))}
    </div>
  );
}

function ShoppingListModal({ state, onClose }) {
  const [windowDays, setWindowDays] = useState(7);
  const [includeRecipes, setIncludeRecipes] = useState(true);
  const list = useMemo(
    () => generateShoppingList(state, { windowDays, includeRecipes }),
    [state, windowDays, includeRecipes]
  );
  const anyFav = (state.recipeBank || []).some((r) => r.favorite);
  const hasRecipes = (state.recipeBank || []).length > 0;
  const [checked, setChecked] = useState({}); // normalizedName → bool
  const [copied, setCopied] = useState(false);

  const toggleItem = (norm) => {
    setChecked((prev) => ({ ...prev, [norm]: !prev[norm] }));
  };

  const text = useMemo(() => formatShoppingListText(list), [list]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🛒 Lista de compras</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          De lo que comiste los últimos <span className="font-semibold">{windowDays}</span> días
          {includeRecipes && hasRecipes ? <> + ingredientes de tus recetas {anyFav ? 'favoritas ⭐' : ''}</> : null}.
        </p>

        <div className="flex gap-1 text-[11px]">
          {[7, 14, 21].map((d) => (
            <button key={d} onClick={() => setWindowDays(d)}
              className={`flex-1 py-1.5 rounded-lg font-semibold ${
                windowDays === d
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
              {d} días
            </button>
          ))}
        </div>

        {hasRecipes && (
          <button onClick={() => setIncludeRecipes((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-left">
            <span className="text-xs text-gray-700 dark:text-gray-300">📒 Incluir ingredientes de mis recetas {anyFav ? 'favoritas' : ''}</span>
            <span className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${includeRecipes ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${includeRecipes ? 'left-[1.125rem]' : 'left-0.5'}`} />
            </span>
          </button>
        )}

        {list.groups.length === 0 ? (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 text-center">
            <div className="text-3xl mb-2">🛒</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Sin items en los últimos {windowDays} días.</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Marca tus comidas durante la semana y vuelve.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.groups.map((g) => (
              <div key={g.key}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">{g.label}</div>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const norm = normalizeName(it.name);
                    const isChecked = !!checked[norm];
                    return (
                      <button key={norm} onClick={() => toggleItem(norm)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition-colors ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-gray-400 dark:text-gray-500 line-through'
                            : 'bg-gray-50 dark:bg-gray-800/60 text-gray-800 dark:text-gray-200'
                        }`}>
                        <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isChecked ? '✓' : ''}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{it.name}</span>
                        {it.count > 1 && (
                          <span className="shrink-0 text-[10px] font-semibold text-gray-500 dark:text-gray-400">×{it.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={copyText}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            {copied ? '✅ Copiado' : '📋 Copiar texto'}
          </button>
          <button onClick={shareWhatsApp}
            className="py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600">
            📲 WhatsApp
          </button>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Ver texto plano</summary>
          <pre className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono">{text}</pre>
        </details>
      </div>
    </div>
  );
}

function SuggestSlotModal({ slot, state, targets, onSelect, onClose }) {
  const apiKey = state.settings?.anthropicApiKey;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const recents = useMemo(
    () => computeRecents(state.days || {}, 5),
    [state.days]
  );

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const recs = await suggestForSlot({ slot, state, targets, apiKey, recents });
      if (recs.length === 0) {
        setError('Claude no devolvió sugerencias válidas. Prueba refrescar.');
      }
      setSuggestions(recs);
    } catch (err) {
      setError(err.message || 'Error al consultar Claude');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiKey) fetchSuggestions();
    else {
      setError('Configura tu API key en ⚙️ Ajustes primero.');
      setLoading(false);
    }
  }, []);

  const slotTitle = slot === 'snack' ? 'colación'
    : slot === 'dinner' ? 'cena'
    : slot === 'dessert_almuerzo' ? 'postre del almuerzo'
    : 'postre de la cena';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🤔 ¿Qué como de {slotTitle}?</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Claude (Haiku) revisa tus macros restantes, reglas activas y recientes.
        </p>

        {loading && (
          <div className="rounded-xl bg-sky-50 dark:bg-sky-900/30 p-6 text-center">
            <div className="text-2xl mb-2 animate-pulse">🤔</div>
            <p className="text-sm text-sky-700 dark:text-sky-300">Pensando…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/30 p-3 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onSelect(s.item)}
                className="w-full text-left rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 hover:border-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{emojiForFood(s.item.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.item.name}</div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                      <span className="font-semibold">{s.item.kcal}</span> kcal · P {s.item.protein}g
                      {s.item.carbs ? ` · C ${s.item.carbs}g` : ''}
                      {s.item.fat ? ` · G ${s.item.fat}g` : ''}
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 italic">
                      💡 {s.reason}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={fetchSuggestions} disabled={loading || !apiKey}
            className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            🔄 Otras opciones
          </button>
          <button onClick={onClose}
            className="py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleViolationModal({ violations, onConfirm, onCancel }) {
  if (!violations || violations.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl">⚠️</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold">
              {violations.length === 1 ? 'Esto rompe una regla' : `Esto rompe ${violations.length} reglas`}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tus reglas personales (edita en ⚙️ Ajustes)</p>
          </div>
        </div>
        <div className="space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 p-3">
              <div className="text-sm font-semibold text-rose-800 dark:text-rose-200">{v.rule.name}</div>
              <div className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{v.message}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-sm">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 text-sm">Seguir igual</button>
        </div>
      </div>
    </div>
  );
}

function SegmentChip({ value }) {
  if (!value) return <span className="text-[10px] text-gray-400">—</span>;
  const tone = SEGMENT_TONE[value] || SEGMENT_TONE['Bien'];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone.bg} ${tone.text}`}>{value}</span>;
}

function SegmentAnalysis({ weight }) {
  if (!weight) return null;
  const hasAny = SEGMENT_FIELDS.some((seg) => weight[seg.key]);
  if (!hasAny) return null;

  const renderGroup = (group, title, emoji) => {
    const fields = SEGMENT_FIELDS.filter((sf) => sf.group === group);
    const hasData = fields.some((f) => weight[f.key]);
    if (!hasData) return null;
    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
          {emoji} {title}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {fields.map((seg) => (
            <div key={seg.key} className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{seg.label}</span>
              <SegmentChip value={weight[seg.key]} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🫁</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Análisis segmental</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderGroup('fat', 'Grasa por zona', '🍔')}
        {renderGroup('muscle', 'Músculo por zona', '💪')}
      </div>
    </div>
  );
}

function WeightView({ state, setState, targets }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [metric, setMetric] = useState('weightKg');
  const weights = (state.weights || []).slice().sort((a, b) => {
    const ka = (a.date || '') + 'T' + (a.time || '00:00');
    const kb = (b.date || '') + 'T' + (b.time || '00:00');
    return kb.localeCompare(ka);
  });
  const last = weights[0];

  const remove = (id) => {
    if (!confirm('¿Eliminar esta medición?')) return;
    setState((prev) => {
      // Propagar el borrado al bridge y anotarlo, para que mergeBridge no lo reimporte.
      postBridgeDelete(prev.settings, 'weights', id);
      const rb = new Set([...(prev.bridge?.removedBridgeIds || []), id]);
      return {
        ...prev,
        weights: (prev.weights || []).filter((w) => w.id !== id),
        bridge: { ...(prev.bridge || {}), removedBridgeIds: [...rb] },
      };
    });
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">⚖️ Peso & composición</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Sube la captura de tu Speediance o ingresa manual</p>
      </div>

      <WeighInNudge weights={weights} onAction={() => setAdding(true)} />

      {last ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Última medición</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{last.date}{last.time ? ` · ${last.time}` : ''}</span>
          </div>
          {last.bodyType && (
            <div className="mb-3 inline-block px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-[11px] font-semibold uppercase tracking-wide">
              {last.bodyType}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {WEIGHT_FIELDS.filter((wf) => last[wf.key] != null).map((wf) => {
              const status = evalMetric(wf.key, last[wf.key], state.userProfile);
              return (
                <div key={wf.key}>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">{wf.label}</div>
                  <div className="text-base font-bold flex items-center gap-1.5">
                    <span>{last[wf.key]}<span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-0.5">{wf.unit}</span></span>
                    <MetricStatusChip statusLabel={status} />
                  </div>
                </div>
              );
            })}
          </div>
          {last.note && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic">{last.note}</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center">
          <div className="text-3xl mb-2">⚖️</div>
          <div className="text-sm font-medium">Sin mediciones aún</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Agrega tu primera medición para empezar a ver la tendencia</div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto -mx-1 px-1">
          {CHART_METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${metric === m.key ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <WeightChart weights={weights} metric={metric} />
      </div>

      <EvolutionAnalysis state={state} />

      <SegmentAnalysis weight={last} />

      <TrendAnalysis state={state} targets={targets} />

      <PlanAdjustmentBanner state={state} setState={setState} />

      <NotesHistory state={state} />

      {weights.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-4 pt-3.5 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Historial</h3>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800">
            {weights.map((w, i) => (
              <div key={w.id} className={`flex items-center gap-3 px-4 py-2.5 ${i !== weights.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                <div className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">{w.date.slice(5)}{w.time ? ` ${w.time}` : ''}</div>
                <div className="flex-1 min-w-0 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {w.weightKg != null && <span><span className="font-semibold">{Number(w.weightKg).toFixed(1)}</span> kg</span>}
                  {w.bodyFatPct != null && <span><span className="font-semibold">{Number(w.bodyFatPct).toFixed(1)}</span>% grasa</span>}
                  {w.skeletalMuscleKg != null && <span><span className="font-semibold">{Number(w.skeletalMuscleKg).toFixed(1)}</span> kg m.esq.</span>}
                  {w.bmi != null && <span><span className="font-semibold">{Number(w.bmi).toFixed(1)}</span> IMC</span>}
                  {w.waistCm != null && <span><span className="font-semibold">{Number(w.waistCm).toFixed(1)}</span> cintura</span>}
                  {w.visceralFat != null && <span><span className="font-semibold">{Number(w.visceralFat).toFixed(1)}</span> visc.</span>}
                </div>
                <button onClick={() => setEditing(w)} className="text-xs font-medium px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800">Editar</button>
                <button onClick={() => remove(w.id)} aria-label="Borrar"
                  className="shrink-0 w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setAdding(true)}
        className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
        + Nueva medición
      </button>

      {(adding || editing) && (
        <WeightEntryModal state={state} setState={setState} editing={editing}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

const IDEA_OCCASIONS = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍚' },
  { id: 'colacion', label: 'Snack', emoji: '🥪' },
  { id: 'cena', label: 'Cena', emoji: '🍽️' },
];

function autoDetectOccasion() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'colacion';
  return 'cena';
}

function occasionToPromptKey(id) {
  return id === 'colacion' ? 'snack' : id;
}

// Formulario manual de receta (crear/editar) — NO usa IA ni API key. Espejo del patrón de
// BankItemForm para los macros, más listas editables de ingredientes y pasos. onSave recibe
// el objeto receta (con id+createdAt si venía de `initial`, para que IdeaView decida
// crear vs actualizar).
function RecipeForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [occasion, setOccasion] = useState(initial?.occasion === 'snack' ? 'colacion' : (initial?.occasion || autoDetectOccasion()));
  const [prepMinutes, setPrepMinutes] = useState(initial?.prepMinutes ?? '');
  const [ingredients, setIngredients] = useState(
    (initial?.ingredients?.length ? initial.ingredients : [{ name: '', portion: '' }]).map((it) => ({ name: it.name || '', portion: it.portion || '' }))
  );
  const [steps, setSteps] = useState(initial?.steps?.length ? [...initial.steps] : ['']);
  const [kcal, setKcal] = useState(initial?.totals?.kcal ?? '');
  const [protein, setProtein] = useState(initial?.totals?.protein ?? '');
  const [carbs, setCarbs] = useState(initial?.totals?.carbs ?? '');
  const [fat, setFat] = useState(initial?.totals?.fat ?? '');
  const [fiber, setFiber] = useState(initial?.totals?.fiber ?? '');
  const [error, setError] = useState(null);

  const setIng = (i, field, val) => setIngredients((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const addIng = () => setIngredients((prev) => [...prev, { name: '', portion: '' }]);
  const rmIng = (i) => setIngredients((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const setStep = (i, val) => setSteps((prev) => prev.map((s, idx) => idx === i ? val : s));
  const addStep = () => setSteps((prev) => [...prev, '']);
  const rmStep = (i) => setSteps((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Escribe el nombre de la receta.'); return; }
    const k = Number(kcal);
    if (!Number.isFinite(k) || k < 0) { setError('Las calorías deben ser un número ≥ 0.'); return; }
    const numOrZero = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
    const recipe = {
      ...(initial || {}),
      name: name.trim(),
      occasion: occasionToPromptKey(occasion),
      prepMinutes: Math.max(0, Math.round(Number(prepMinutes) || 0)),
      confidence: 'alta',
      ingredients: ingredients
        .map((it) => ({ name: (it.name || '').trim(), portion: (it.portion || '').trim(), optional: false }))
        .filter((it) => it.name),
      steps: steps.map((s) => (s || '').trim()).filter(Boolean),
      totals: { kcal: Math.round(k), protein: numOrZero(protein), carbs: numOrZero(carbs), fat: numOrZero(fat), fiber: numOrZero(fiber) },
      why: initial?.why || '',
      source: 'manual',
    };
    onSave(recipe);
  };

  const inputCls = 'mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 my-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial ? 'Editar receta' : 'Nueva receta a mano'}</h2>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className={inputCls} placeholder="Ej. Bowl de pollo y quinoa" autoFocus />
        </label>

        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Ocasión</span>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {IDEA_OCCASIONS.map((o) => (
              <button type="button" key={o.id} onClick={() => setOccasion(o.id)}
                className={`py-2 rounded-xl border-2 text-[11px] font-semibold ${
                  occasion === o.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}>
                <div className="text-base">{o.emoji}</div>
                <div>{o.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Ingredientes</span>
            <button type="button" onClick={addIng} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">+ Agregar</button>
          </div>
          <div className="space-y-1.5">
            {ingredients.map((it, i) => (
              <div key={i} className="flex gap-1.5">
                <input type="text" value={it.name} onChange={(e) => setIng(i, 'name', e.target.value)}
                  className="flex-1 px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ingrediente" />
                <input type="text" value={it.portion} onChange={(e) => setIng(i, 'portion', e.target.value)}
                  className="w-24 px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Porción" />
                <button type="button" onClick={() => rmIng(i)} className="px-2 text-gray-400 hover:text-rose-500" aria-label="Quitar">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Pasos (opcional)</span>
            <button type="button" onClick={addStep} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">+ Agregar</button>
          </div>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="shrink-0 w-5 h-9 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">{i + 1}.</span>
                <input type="text" value={s} onChange={(e) => setStep(i, e.target.value)}
                  className="flex-1 px-2.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder={`Paso ${i + 1}`} />
                <button type="button" onClick={() => rmStep(i)} className="px-2 py-2 text-gray-400 hover:text-rose-500" aria-label="Quitar">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Calorías (kcal)</span>
            <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={inputCls} min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proteína (g)</span>
            <input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} min="0" />
          </label>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Carbos</span>
            <input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Grasas</span>
            <input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fibra</span>
            <input type="number" inputMode="decimal" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)} className={inputCls} min="0" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Min</span>
            <input type="number" inputMode="numeric" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} className={inputCls} min="0" />
          </label>
        </div>

        {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={onCancel} className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-sm">Cancelar</button>
          <button type="submit" className="py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600">💾 Guardar</button>
        </div>
      </form>
    </div>
  );
}

function IdeaView({ state, setState, targets }) {
  const [mode, setMode] = useState('new');
  const [attachments, setAttachments] = useState([]);
  const [ingredientsText, setIngredientsText] = useState('');
  const [notes, setNotes] = useState('');
  const [occasion, setOccasion] = useState(() => autoDetectOccasion());
  const [processing, setProcessing] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);

  const apiKey = state.settings?.anthropicApiKey;
  const recipeBank = state.recipeBank || [];
  // Favoritas primero, luego por fecha de creación (más nueva arriba).
  const sortedRecipes = [...recipeBank].sort((a, b) =>
    (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
    (new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  );

  const openCreateManual = () => { setFormInitial(null); setFormOpen(true); };
  const openEditRecipe = (r) => { setFormInitial(r); setFormOpen(true); };

  const handleSaveManual = (data) => {
    setState((prev) => {
      const bank = prev.recipeBank || [];
      if (data.id && bank.some((r) => r.id === data.id)) {
        return { ...prev, recipeBank: bank.map((r) => r.id === data.id ? { ...r, ...data } : r) };
      }
      const entry = { ...data, id: uuid(), createdAt: new Date().toISOString() };
      return { ...prev, recipeBank: [entry, ...bank] };
    });
    setFormOpen(false); setFormInitial(null);
    setMode('saved');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleToggleFavorite = (id) => {
    setState((prev) => ({
      ...prev,
      recipeBank: (prev.recipeBank || []).map((r) => r.id === id ? { ...r, favorite: !r.favorite } : r),
    }));
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) { setError(`Máximo ${MAX_IMAGES} imágenes.`); e.target.value = ''; return; }
    const toProcess = files.slice(0, room);
    if (files.length > room) setError(`Se ignoraron ${files.length - room} archivos.`);
    const newAtt = await Promise.all(toProcess.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...newAtt]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const canSubmit = !processing && !!apiKey && (attachments.length > 0 || ingredientsText.trim() || notes.trim());

  const handleGenerate = async () => {
    if (!apiKey) { setError('Configura tu API key en ⚙️ Ajustes primero.'); return; }
    if (!canSubmit) return;
    setProcessing(true); setError(null);
    try {
      const data = await suggestRecipeFromIngredients({
        attachments,
        ingredientsText,
        notes,
        occasion: occasionToPromptKey(occasion),
        state, targets, apiKey,
      });
      const ingredients = Array.isArray(data?.ingredients) ? data.ingredients : [];
      const steps = Array.isArray(data?.steps) ? data.steps : [];
      const t = data?.totals || {};
      setRecipe({
        name: String(data?.name || 'Receta sin nombre'),
        occasion: String(data?.occasion || occasionToPromptKey(occasion)),
        prepMinutes: Math.max(0, Math.round(Number(data?.prepMinutes) || 0)),
        confidence: data?.confidence || 'media',
        ingredients: ingredients.map((it) => ({
          name: String(it?.name || ''),
          portion: String(it?.portion || ''),
          optional: !!it?.optional,
        })),
        steps: steps.map((s) => String(s)),
        totals: {
          kcal: Math.max(0, Math.round(Number(t.kcal) || 0)),
          protein: Math.max(0, Math.round(Number(t.protein) || 0)),
          carbs: Math.max(0, Math.round(Number(t.carbs) || 0)),
          fat: Math.max(0, Math.round(Number(t.fat) || 0)),
          fiber: Math.max(0, Number(t.fiber) || 0),
        },
        why: String(data?.why || ''),
      });
    } catch (err) {
      setError(err.message || 'Error generando receta');
    } finally {
      setProcessing(false);
    }
  };

  const handleAnotherIdea = () => {
    setRecipe(null);
    handleGenerate();
  };

  const handleBack = () => {
    setRecipe(null);
    setError(null);
  };

  const handleResetAll = () => {
    setRecipe(null);
    setAttachments([]);
    setIngredientsText('');
    setNotes('');
    setError(null);
  };

  const handleSaveRecipe = (r) => {
    if (!r) return;
    const entry = {
      id: uuid(),
      name: r.name,
      occasion: r.occasion,
      prepMinutes: r.prepMinutes,
      confidence: r.confidence,
      ingredients: r.ingredients,
      steps: r.steps,
      totals: r.totals,
      why: r.why,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, recipeBank: [entry, ...(prev.recipeBank || [])] }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleDeleteRecipe = (id) => {
    if (!confirm('¿Eliminar esta receta del libro?')) return;
    setState((prev) => ({ ...prev, recipeBank: (prev.recipeBank || []).filter((r) => r.id !== id) }));
  };

  const handleAddToDay = (r, slotId) => {
    if (!r) return;
    const targetSlot = slotId || (r.occasion === 'snack' ? 'colacion' : r.occasion) || occasion;
    const today = todayKey();
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      const day = { ...(days[today] || {}) };
      const extras = Array.isArray(day.extras) ? [...day.extras] : [];
      extras.push({
        id: uuid(),
        name: `${r.name} (receta)`,
        kcal: r.totals.kcal,
        protein: r.totals.protein,
        carbs: r.totals.carbs,
        fat: r.totals.fat,
        fiber: r.totals.fiber,
        mealSlot: targetSlot,
        source: 'recipe',
      });
      day.extras = extras;
      if (targetSlot && targetSlot !== 'extra') {
        day.eaten = { ...(day.eaten || {}), [targetSlot]: true };
      }
      days[today] = day;
      return { ...prev, days };
    });
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1800);
  };

  const confidenceColor = recipe?.confidence === 'alta' ? 'green' : recipe?.confidence === 'media' ? 'amber' : 'red';

  return (
    <div className="px-4 pt-14 pb-6 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span>✨</span>
          <span>Idea</span>
        </h1>
        <div className="flex rounded-full bg-gray-100 dark:bg-gray-800 p-1 text-xs">
          <button onClick={() => setMode('new')}
            className={`px-3 py-1.5 rounded-full font-semibold ${mode === 'new' ? 'bg-white dark:bg-gray-900 shadow text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>
            Nueva
          </button>
          <button onClick={() => setMode('saved')}
            className={`px-3 py-1.5 rounded-full font-semibold ${mode === 'saved' ? 'bg-white dark:bg-gray-900 shadow text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>
            Mis recetas ({recipeBank.length})
          </button>
        </div>
      </div>

      {mode === 'new' && !recipe && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Sube una foto de lo que tienes (despensa, refrigerador, ingredientes) o describe lo que está disponible. Claude propone una receta ajustada a tu día.
          </p>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Ocasión</div>
            <div className="grid grid-cols-4 gap-1.5">
              {IDEA_OCCASIONS.map((o) => (
                <button key={o.id} onClick={() => setOccasion(o.id)}
                  className={`py-2 rounded-xl border-2 text-[11px] font-semibold ${
                    occasion === o.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'
                  }`}>
                  <div className="text-base">{o.emoji}</div>
                  <div>{o.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Foto (opcional)</div>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <AttachmentPreview key={i} attachment={a} onRemove={() => removeAttachment(i)} />
              ))}
              {attachments.length < MAX_IMAGES && (
                <label className="block h-24 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500 text-2xl">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
                  <span className="text-gray-400">📸</span>
                </label>
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">¿Qué ingredientes tienes? (opcional)</span>
            <textarea value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)}
              rows={3}
              placeholder='Ej. "pollo, arroz, palta, tomate, huevos"'
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notas para Claude (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder='Ej. "rápido, alta en proteína, sin gluten"'
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y" />
          </label>

          <button onClick={handleGenerate} disabled={!canSubmit}
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500">
            {processing ? 'Pensando una receta…' : 'Generar receta con Claude ✨'}
          </button>

          {!apiKey && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
              ⚠️ La generación con IA necesita tu API key en ⚙️ Ajustes. Igual puedes crear recetas a mano.
            </p>
          )}

          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" /> o <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          <button onClick={openCreateManual}
            className="w-full py-3 rounded-xl border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            ✍️ Crear receta a mano (sin IA)
          </button>

          {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
        </>
      )}

      {mode === 'new' && recipe && (
        <div className="space-y-4">
          <div className={`rounded-2xl border border-gray-200 dark:border-gray-800 p-4 ${COLOR_CLASSES[confidenceColor].bg}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold leading-tight">{recipe.name}</h2>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {(IDEA_OCCASIONS.find(o => o.id === (recipe.occasion === 'snack' ? 'colacion' : recipe.occasion))?.label) || recipe.occasion}
                  {recipe.prepMinutes > 0 ? ` · ${recipe.prepMinutes} min` : ''}
                </div>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-white/70 dark:bg-gray-900/40 ${COLOR_CLASSES[confidenceColor].text}`}>
                {recipe.confidence}
              </span>
            </div>
            {recipe.why && (
              <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                <span className="font-semibold">Por qué te calza hoy:</span> {recipe.why}
              </p>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Ingredientes</div>
            <ul className="space-y-1">
              {recipe.ingredients.map((it, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="text-xs shrink-0 w-5">{it.optional ? '➕' : '✅'}</span>
                  <span className="font-medium">{it.name}</span>
                  {it.portion && <span className="text-gray-500 dark:text-gray-400 text-xs">— {it.portion}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Pasos</div>
            <ol className="space-y-1.5">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-xs grid grid-cols-5 gap-1.5">
            <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">kcal</div><div className="font-bold">{recipe.totals.kcal}</div></div>
            <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">P</div><div className="font-bold">{recipe.totals.protein}g</div></div>
            <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">C</div><div className="font-bold">{recipe.totals.carbs}g</div></div>
            <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">G</div><div className="font-bold">{recipe.totals.fat}g</div></div>
            <div><div className="text-gray-500 dark:text-gray-400 text-[10px]">F</div><div className="font-bold">{Number(recipe.totals.fiber).toFixed(1)}g</div></div>
          </div>

          {(savedFlash || addedFlash) && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg text-center">
              {savedFlash && '💾 Guardada en Mis recetas'}
              {addedFlash && '➕ Agregada al día de hoy'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleBack}
              className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-sm">
              ← Volver
            </button>
            <button onClick={handleAnotherIdea} disabled={processing || !canSubmit}
              className="py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-sm disabled:opacity-50">
              {processing ? 'Pensando…' : '🔁 Otra idea'}
            </button>
            <button onClick={() => handleSaveRecipe(recipe)}
              className="py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600">
              💾 Guardar receta
            </button>
            <button onClick={() => handleAddToDay(recipe)}
              className="py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600">
              ➕ Agregar al día
            </button>
          </div>

          <button onClick={handleResetAll}
            className="w-full py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            Empezar de cero
          </button>

          {error && <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2 rounded-lg">{error}</p>}
        </div>
      )}

      {mode === 'saved' && (
        <div className="space-y-3">
          <button onClick={openCreateManual}
            className="w-full py-3 rounded-xl border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            ✍️ Crear receta a mano
          </button>
          {(savedFlash || addedFlash) && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg text-center">
              {savedFlash ? '💾 Guardada en Mis recetas' : '➕ Agregada al día de hoy'}
            </div>
          )}
          {recipeBank.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-2">📒</div>
              <p>Aún no guardas recetas.</p>
              <p className="text-xs mt-1">Créala a mano arriba o genérala con IA en "Nueva".</p>
            </div>
          )}
          {sortedRecipes.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-3 py-3 flex items-center gap-2">
                  <button onClick={() => handleToggleFavorite(r.id)}
                    className={`shrink-0 text-lg leading-none ${r.favorite ? 'opacity-100' : 'opacity-30 grayscale'}`}
                    aria-label={r.favorite ? 'Quitar de favoritas' : 'Marcar favorita'}>⭐</button>
                  <button onClick={() => setExpandedId(expanded ? null : r.id)}
                    className="min-w-0 flex-1 text-left">
                    <div className="font-semibold text-sm truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {(IDEA_OCCASIONS.find(o => o.id === (r.occasion === 'snack' ? 'colacion' : r.occasion))?.label) || r.occasion}
                      {' · '}{r.totals?.kcal || 0} kcal · P{r.totals?.protein || 0}g
                      {r.prepMinutes > 0 ? ` · ${r.prepMinutes} min` : ''}
                    </div>
                  </button>
                  <button onClick={() => handleAddToDay(r)}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-500 text-white font-semibold text-xs hover:bg-emerald-600"
                    aria-label="Registrar al día de hoy">➕ Hoy</button>
                  <button onClick={() => setExpandedId(expanded ? null : r.id)}
                    className="shrink-0 text-gray-400 text-sm w-4">{expanded ? '▾' : '▸'}</button>
                </div>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                    {r.why && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 italic">{r.why}</p>
                    )}
                    {(r.ingredients || []).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Ingredientes</div>
                        <ul className="space-y-0.5">
                          {(r.ingredients || []).map((it, i) => (
                            <li key={i} className="flex items-baseline gap-2 text-xs">
                              <span className="shrink-0 w-4">{it.optional ? '➕' : '✅'}</span>
                              <span>{it.name}{it.portion ? ` — ${it.portion}` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(r.steps || []).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Pasos</div>
                        <ol className="space-y-1">
                          {(r.steps || []).map((s, i) => (
                            <li key={i} className="flex gap-1.5 text-xs">
                              <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">{i + 1}.</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button onClick={() => handleAddToDay(r)}
                        className="py-2 rounded-xl bg-emerald-500 text-white font-semibold text-xs hover:bg-emerald-600">
                        ➕ Hoy
                      </button>
                      <button onClick={() => openEditRecipe(r)}
                        className="py-2 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold text-xs">
                        ✏️ Editar
                      </button>
                      <button onClick={() => handleDeleteRecipe(r.id)}
                        className="py-2 rounded-xl border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-300 font-semibold text-xs">
                        🗑️ Borrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <RecipeForm initial={formInitial}
          onSave={handleSaveManual}
          onCancel={() => { setFormOpen(false); setFormInitial(null); }} />
      )}
    </div>
  );
}

// Picker de items para el planificador semanal. Fuentes: recetas y bancos (NO las comidas
// fijas: esas ya se aplican solas cada día, ofrecerlas aquí confunde). onPick(item) recibe
// { name, kcal, protein, carbs, fat, fiber, mealSlot? }.
function PlanPickerModal({ state, onPick, onClose, slotLabel }) {
  const [q, setQ] = useState('');
  const recipes = (state.recipeBank || []).map((r) => ({
    name: r.name, kcal: r.totals?.kcal || 0, protein: r.totals?.protein || 0,
    carbs: r.totals?.carbs || 0, fat: r.totals?.fat || 0, fiber: r.totals?.fiber || 0,
    mealSlot: r.occasion === 'snack' ? 'colacion' : r.occasion,
  }));
  const bankItems = (bank) => (bank || []).map((x) => ({
    name: x.name, kcal: x.kcal || 0, protein: x.protein || 0,
    carbs: x.carbs || 0, fat: x.fat || 0, fiber: x.fiber || 0,
  }));
  const groups = [
    { title: '📒 Recetas', items: recipes },
    { title: '🍗 Proteínas', items: bankItems(state.proteinBank) },
    { title: '🥪 Snacks', items: bankItems(state.snackBank) },
    { title: '🍫 Postres', items: bankItems(state.dessertBank) },
  ];
  const norm = (s) => (s || '').toLowerCase();
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !q.trim() || norm(it.name).includes(norm(q))) }))
    .filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 my-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Agregar{slotLabel ? ` · ${slotLabel}` : ' al plan'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Cerrar">✕</button>
        </div>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
          className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
        <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
          {filtered.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Nada que mostrar.</p>}
          {filtered.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5 py-0.5">{g.title}</div>
              <div className="space-y-1">
                {g.items.map((it, i) => (
                  <button key={i} onClick={() => onPick(it)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left">
                    <span className="text-sm font-medium truncate">{it.name}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{Math.round(it.kcal)} kcal · P{Math.round(it.protein)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Las 5 tomas del método (anclar fijo → repartir en tomas). Cada toma tiene hora canónica
// para detectar brechas >5h, y `eat` = el mealSlot real de la app al pasar a comido.
const PLAN_TOMAS = [
  { id: 'desayuno',  label: 'Desayuno',   time: '08:30', eat: 'desayuno' },
  { id: 'colacion1', label: 'Colación AM', time: '11:00', eat: 'colacion' },
  { id: 'almuerzo',  label: 'Almuerzo',    time: '14:00', eat: 'almuerzo' },
  { id: 'colacion2', label: 'Colación PM', time: '18:00', eat: 'colacion' },
  { id: 'cena',      label: 'Cena',        time: '21:00', eat: 'cena' },
];
const MIN_PROTEIN_TOMA = 36; // g — umbral de estímulo MPS por toma (Schoenfeld & Aragon 2018)
const MAX_GAP_HOURS = 5;     // h — máximo entre tomas con proteína

function hhmmToMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

// Analiza un día planificado contra el método: totales, desglose por toma con badge ≥36g,
// brecha temporal >5h, y restante hacia las metas (la "brújula" del armado). Función pura.
function analyzePlannedDay(planned, targets) {
  const T = targets || DEFAULT_TARGETS;
  const items = Array.isArray(planned) ? planned : [];
  const slotIds = new Set(PLAN_TOMAS.map((s) => s.id));
  const slotOf = (x) => (x && slotIds.has(x.planSlot)) ? x.planSlot : 'otros';
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);

  const totals = {
    kcal: sum(items, 'kcal'), protein: sum(items, 'protein'),
    carbs: sum(items, 'carbs'), fat: sum(items, 'fat'), fiber: sum(items, 'fiber'),
  };
  const bySlot = PLAN_TOMAS.map((s) => {
    const its = items.filter((x) => slotOf(x) === s.id);
    const protein = sum(its, 'protein');
    return { ...s, items: its, protein, kcal: sum(its, 'kcal'),
      hasItems: its.length > 0, lowProtein: its.length > 0 && protein < MIN_PROTEIN_TOMA };
  });
  const otros = items.filter((x) => slotOf(x) === 'otros');

  // Brecha: primera distancia >5h entre tomas consecutivas que tienen proteína.
  const active = bySlot.filter((s) => s.hasItems && s.protein > 0);
  let gapWarn = null;
  for (let i = 1; i < active.length; i++) {
    const dh = (hhmmToMin(active[i].time) - hhmmToMin(active[i - 1].time)) / 60;
    if (dh > MAX_GAP_HOURS) { gapWarn = { from: active[i - 1].label, to: active[i].label, hours: dh }; break; }
  }

  const fiberColor = !items.length ? null
    : totals.fiber >= T.fiberTarget ? 'green'
    : totals.fiber >= T.fiberTarget * 0.8 ? 'amber' : 'red';

  return {
    totals, bySlot, otros, gapWarn,
    remainingProtein: Math.max(0, Math.round((T.proteinMin || 0) - totals.protein)),
    remainingKcal: Math.round((T.kcalMax || 0) - totals.kcal),
    kcalColor: items.length ? colorForKcal(totals.kcal, T) : null,
    proteinColor: items.length ? colorForProtein(totals.protein, T) : null,
    fiberColor,
    hasItems: items.length > 0,
  };
}

// VTIMEZONE de America/Santiago. iOS usa el TZID (nombre IANA) contra su propia base; este
// bloque es fallback para otros parsers. Reglas actuales de Chile continental.
const VTIMEZONE_SANTIAGO = [
  'BEGIN:VTIMEZONE', 'TZID:America/Santiago',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0300', 'TZNAME:-03',
  'DTSTART:19700906T000000', 'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=1SA', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0400', 'TZNAME:-04',
  'DTSTART:19700405T000000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SA', 'END:STANDARD',
  'END:VTIMEZONE',
];

function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Genera un .ics con un VTODO por toma planificada (DUE a su hora, TZID Santiago, alarma a la
// hora, macros en la nota, UID único por toma+día para no duplicar al reimportar).
function buildDayICS(dateKey, planned, targets, nowIso) {
  const a = analyzePlannedDay(planned, targets);
  const tomas = a.bySlot.filter((s) => s.hasItems);
  if (!tomas.length) return null;
  const ymd = String(dateKey).replace(/-/g, '');
  const dtstamp = String(nowIso || '1970-01-01T00:00:00Z').replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace(/Z?$/, 'Z');
  const sum = (arr, k) => arr.reduce((acc, x) => acc + (Number(x[k]) || 0), 0);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PlanHugo//ES', 'CALSCALE:GREGORIAN', ...VTIMEZONE_SANTIAGO];
  for (const t of tomas) {
    const hhmmss = t.time.replace(':', '') + '00';
    const names = t.items.map((i) => i.name).join(' + ');
    const macros = `~${Math.round(t.kcal)} kcal | P ${Math.round(t.protein)} | C ${Math.round(sum(t.items, 'carbs'))} | G ${Math.round(sum(t.items, 'fat'))} | fibra ${Math.round(sum(t.items, 'fiber'))}`;
    lines.push(
      'BEGIN:VTODO',
      `UID:${ymd}-${t.id}@planhugo`,
      `DTSTAMP:${dtstamp}`,
      `DUE;TZID=America/Santiago:${ymd}T${hhmmss}`,
      `SUMMARY:${icsEscape(`${t.label} — ${names}`)}`,
      `DESCRIPTION:${icsEscape(macros)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:RELATED=START;PT0M', 'DESCRIPTION:Hora de comer', 'END:VALARM',
      'END:VTODO',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Entrega el .ics: hoja de compartir si hay (mejor en iPhone), si no descarga directa.
async function exportDayICS(dateKey, planned, targets) {
  const ics = buildDayICS(dateKey, planned, targets, new Date().toISOString());
  if (!ics) return;
  const filename = `plan-${dateKey}.ics`;
  try {
    const file = new File([ics], filename, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `Plan ${dateKey}` });
      return;
    }
  } catch (e) { /* cancelado o no soportado → descarga */ }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = filename;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function PlanWeekView({ state, setState, targets }) {
  const weekKeys = useMemo(() => getWeekKeys(), []);
  const [picking, setPicking] = useState(null); // dateKey al que se está agregando
  const [flash, setFlash] = useState(null);
  const days = state.days || {};

  const dotColor = (c) => c === 'red' ? 'bg-rose-500' : c === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  const txtColor = (c) => c === 'red' ? 'text-rose-600 dark:text-rose-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';

  const addPlanned = (dk, slot, item) => {
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      const planned = Array.isArray(d.plannedMeals) ? [...d.plannedMeals] : [];
      planned.push({
        id: uuid(), name: item.name,
        kcal: Number(item.kcal) || 0, protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0, fat: Number(item.fat) || 0, fiber: Number(item.fiber) || 0,
        planSlot: slot,
      });
      d.plannedMeals = planned;
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
  };

  const removePlanned = (dk, id) => {
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      d.plannedMeals = (d.plannedMeals || []).filter((x) => x.id !== id);
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
  };

  // Convierte un planificado en comida real (extra) del día y lo saca del plan. El planSlot
  // del método (colacion1/colacion2/…) se mapea al mealSlot real de la app.
  const eatPlanned = (dk, item) => {
    const slotDef = PLAN_TOMAS.find((s) => s.id === item.planSlot);
    const eatSlot = slotDef ? slotDef.eat : 'extra';
    setState((prev) => {
      const d = { ...((prev.days || {})[dk] || {}) };
      const extras = Array.isArray(d.extras) ? [...d.extras] : [];
      extras.push({
        id: uuid(), ts: Date.now(), name: item.name,
        kcal: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber,
        mealSlot: eatSlot, source: 'plan',
      });
      d.extras = extras;
      d.plannedMeals = (d.plannedMeals || []).filter((x) => x.id !== item.id);
      if (eatSlot !== 'extra') d.eaten = { ...(d.eaten || {}), [eatSlot]: true };
      return { ...prev, days: { ...(prev.days || {}), [dk]: d } };
    });
    setFlash(dk); setTimeout(() => setFlash(null), 1500);
  };

  const ItemRow = ({ dk, x }) => (
    <li className="flex items-center gap-2 px-1 py-1">
      <span className="flex-1 min-w-0">
        <span className="text-sm truncate block">{x.name}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{Math.round(x.kcal)} kcal · P{Math.round(x.protein)}</span>
      </span>
      <button onClick={() => eatPlanned(dk, x)}
        className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">✓ Comí</button>
      <button onClick={() => removePlanned(dk, x.id)}
        className="shrink-0 text-gray-400 hover:text-rose-500 px-1" aria-label="Quitar del plan">✕</button>
    </li>
  );

  return (
    <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">Planificar la semana</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Reparte la proteína en tomas (≥{MIN_PROTEIN_TOMA}g c/u, sin brechas &gt;{MAX_GAP_HOURS}h). Lo planificado no cuenta hasta que marcas “Comí”.</p>
      </div>
      {weekKeys.map((dk) => {
        const day = days[dk] || {};
        const planned = day.plannedMeals || [];
        const a = analyzePlannedDay(planned, targets);
        const dd = new Date(dk + 'T12:00:00');
        const isToday = dk === todayKey();
        return (
          <div key={dk} className={`rounded-2xl border bg-white dark:bg-gray-900 overflow-hidden ${isToday ? 'border-emerald-400 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-800'}`}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className={`font-semibold text-sm ${isToday ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{DAY_SHORT[dd.getDay()]} {dd.getDate()}/{dd.getMonth() + 1}{isToday ? ' · hoy' : ''}</div>
              {a.hasItems && (
                <div className="text-[11px] flex items-center gap-2">
                  <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dotColor(a.kcalColor)}`} /><span className={txtColor(a.kcalColor)}>{Math.round(a.totals.kcal)}</span><span className="text-gray-400">/{targets.kcalMax}</span></span>
                  <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dotColor(a.proteinColor)}`} /><span className={txtColor(a.proteinColor)}>{Math.round(a.totals.protein)}</span><span className="text-gray-400">/{targets.proteinMin}g</span></span>
                </div>
              )}
            </div>

            <div className="px-2 pb-2 divide-y divide-gray-100 dark:divide-gray-800">
              {a.bySlot.map((s) => (
                <div key={s.id} className="py-1.5">
                  <div className="flex items-center justify-between gap-2 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{s.label}</span>
                      <span className="text-[10px] text-gray-400">{s.time}</span>
                      {s.hasItems && (
                        <span className={`text-[10px] font-semibold ${s.lowProtein ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                          title={`Umbral de estímulo ${MIN_PROTEIN_TOMA}g por toma`}>
                          {Math.round(s.protein)}g P {s.lowProtein ? '⚠︎' : '✓'}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setPicking({ dk, slot: s.id })}
                      className="shrink-0 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">+</button>
                  </div>
                  {s.items.length > 0 && <ul className="mt-0.5">{s.items.map((x) => <ItemRow key={x.id} dk={dk} x={x} />)}</ul>}
                </div>
              ))}
              {a.otros.length > 0 && (
                <div className="py-1.5">
                  <div className="px-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">Otros</div>
                  <ul className="mt-0.5">{a.otros.map((x) => <ItemRow key={x.id} dk={dk} x={x} />)}</ul>
                </div>
              )}
            </div>

            {a.hasItems && (
              <div className="px-4 pb-3 space-y-1.5">
                {a.gapWarn && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-lg">
                    ⏱️ {Math.round(a.gapWarn.hours)} h entre {a.gapWarn.from} y {a.gapWarn.to} — mete una toma con proteína en medio.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  {a.remainingProtein > 0
                    ? <span className="text-amber-600 dark:text-amber-400">Faltan <b>{a.remainingProtein}g</b> de proteína</span>
                    : <span className="text-emerald-600 dark:text-emerald-400">Proteína cubierta ✓</span>}
                  <span className="text-gray-400">·</span>
                  <span className={txtColor(a.kcalColor)}>{a.remainingKcal >= 0 ? `${a.remainingKcal} kcal de margen` : `${-a.remainingKcal} kcal sobre el techo`}</span>
                  <span className="text-gray-400">·</span>
                  <span className={txtColor(a.fiberColor)}>Fibra {Math.round(a.totals.fiber)}/{targets.fiberTarget}</span>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">El ejercicio no abre margen: el techo de kcal es fijo.</p>
                <button onClick={() => exportDayICS(dk, planned, targets)}
                  className="w-full mt-1 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">
                  📅 Exportar a Recordatorios
                </button>
              </div>
            )}
            {flash === dk && <div className="mx-4 mb-3 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-1.5 rounded-lg text-center">✓ Pasado a comido</div>}
          </div>
        );
      })}
      {picking && (
        <PlanPickerModal state={state}
          slotLabel={(PLAN_TOMAS.find((s) => s.id === picking.slot) || {}).label}
          onPick={(it) => { addPlanned(picking.dk, picking.slot, it); }}
          onClose={() => setPicking(null)} />
      )}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'today', label: 'Hoy', icon: '🍽️' },
    { id: 'week', label: 'Semana', icon: '📅' },
    { id: 'plan', label: 'Plan', icon: '📋' },
    { id: 'idea', label: 'Idea', icon: '✨' },
    { id: 'insights', label: 'Insights', icon: '🧠' },
    { id: 'weight', label: 'Peso', icon: '⚖️' },
    { id: 'bank', label: 'Banco', icon: '📚' },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 safe-bottom">
      <div className="flex">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2 ${tab === t.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="text-xl">{t.icon}</span>
            <span className="text-[11px] font-medium mt-0.5">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function BulkWeightsModal({ state, setState, onClose }) {
  const [rows, setRows] = useState([{ id: uuid(), date: todayKey(), weightKg: '', bodyFatPct: '', muscleKg: '', waistCm: '' }]);

  const addRow = () => {
    const lastDate = rows[rows.length - 1]?.date || todayKey();
    setRows((r) => [...r, { id: uuid(), date: shiftDate(lastDate, -1), weightKg: '', bodyFatPct: '', muscleKg: '', waistCm: '' }]);
  };
  const removeRow = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id, field, value) => setRows((r) => r.map((x) => x.id === id ? { ...x, [field]: value } : x));

  const save = () => {
    const valid = rows.filter((r) => r.date && (r.weightKg !== '' || r.bodyFatPct !== '' || r.muscleKg !== '' || r.waistCm !== ''));
    if (valid.length === 0) { onClose(); return; }
    const newWeights = valid.map((r) => ({
      id: uuid(),
      date: r.date,
      time: null,
      weightKg: r.weightKg !== '' ? Number(r.weightKg) : null,
      bodyFatPct: r.bodyFatPct !== '' ? Number(r.bodyFatPct) : null,
      muscleKg: r.muscleKg !== '' ? Number(r.muscleKg) : null,
      waistCm: r.waistCm !== '' ? Number(r.waistCm) : null,
      note: 'Importado en lote',
    }));
    setState((prev) => ({ ...prev, weights: [...(prev.weights || []), ...newWeights] }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Importar histórico de peso</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-[110px_70px_60px_70px_70px_28px] gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <div>Fecha</div>
            <div>Peso kg</div>
            <div>% Grasa</div>
            <div>Músc. kg</div>
            <div>Cint. cm</div>
            <div></div>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[110px_70px_60px_70px_70px_28px] gap-1.5 items-center">
                <input type="date" value={r.date} onChange={(e) => updateRow(r.id, 'date', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.weightKg} onChange={(e) => updateRow(r.id, 'weightKg', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.bodyFatPct} onChange={(e) => updateRow(r.id, 'bodyFatPct', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.muscleKg} onChange={(e) => updateRow(r.id, 'muscleKg', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="decimal" step="0.1" value={r.waistCm} onChange={(e) => updateRow(r.id, 'waistCm', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <button onClick={() => removeRow(r.id)}
                  className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-sm">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow}
            className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            + Agregar fila
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar {rows.length} fila{rows.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

function BulkWorkoutsModal({ state, setState, onClose }) {
  const [rows, setRows] = useState([{ id: uuid(), date: todayKey(), name: 'Entrenamiento', kcal: '', minutes: '' }]);

  const addRow = () => {
    const lastDate = rows[rows.length - 1]?.date || todayKey();
    setRows((r) => [...r, { id: uuid(), date: shiftDate(lastDate, -1), name: 'Entrenamiento', kcal: '', minutes: '' }]);
  };
  const removeRow = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id, field, value) => setRows((r) => r.map((x) => x.id === id ? { ...x, [field]: value } : x));

  const save = () => {
    const valid = rows.filter((r) => r.date && r.kcal !== '' && Number(r.kcal) > 0);
    if (valid.length === 0) { onClose(); return; }
    setState((prev) => {
      const days = { ...(prev.days || {}) };
      for (const r of valid) {
        const day = days[r.date] || {};
        const existing = day.exercise || [];
        const minLabel = r.minutes && Number(r.minutes) > 0 ? ` · ${Number(r.minutes)} min` : '';
        const name = (r.name?.trim() || 'Entrenamiento') + minLabel;
        days[r.date] = { ...day, exercise: [...existing, { id: uuid(), ts: Date.now(), name, kcal: Number(r.kcal) }] };
      }
      return { ...prev, days };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">📊 Importar histórico de entrenamientos</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-[110px_1fr_70px_70px_28px] gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <div>Fecha</div>
            <div>Nombre</div>
            <div>Kcal</div>
            <div>Min</div>
            <div></div>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[110px_1fr_70px_70px_28px] gap-1.5 items-center">
                <input type="date" value={r.date} onChange={(e) => updateRow(r.id, 'date', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="text" value={r.name} onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                  placeholder="Entrenamiento"
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="numeric" value={r.kcal} onChange={(e) => updateRow(r.id, 'kcal', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => updateRow(r.id, 'minutes', e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <button onClick={() => removeRow(r.id)}
                  className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-sm">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow}
            className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
            + Agregar fila
          </button>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Si la fecha ya tiene entrenamientos registrados, se agregan a los existentes (no los reemplazan).
          </p>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium">Cancelar</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600">Guardar {rows.length} fila{rows.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

function TopButtons({ theme, setTheme, onOpenSettings }) {
  const isDark = theme === 'dark';
  return (
    <div className="fixed top-3 right-3 z-40 flex gap-2">
      <button onClick={onOpenSettings}
        className="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-lg"
        aria-label="Ajustes">⚙️</button>
      <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-lg"
        aria-label="Cambiar tema">{isDark ? '☀️' : '🌙'}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BENTO SHELL — top bar, mobile tab bar, ⌘K command palette
// ═══════════════════════════════════════════════════════════════

const BENTO_TABS = [
  { id: 'today',    label: 'Hoy',      short: 'Hoy',  icon: '🍽️' },
  { id: 'week',     label: 'Semana',   short: 'Sem',  icon: '📅' },
  { id: 'plan',     label: 'Plan',     short: 'Plan', icon: '📋' },
  { id: 'idea',     label: 'Idea',     short: 'Idea', icon: '✨' },
  { id: 'insights', label: 'Insights', short: 'Stats',icon: '🧠' },
  { id: 'weight',   label: 'Peso',     short: 'Peso', icon: '⚖️' },
  { id: 'bank',     label: 'Banco',    short: 'Banco',icon: '📚' },
];

function BentoLogo() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: 'var(--bento-ink)', color: 'var(--bento-on-ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em', flexShrink: 0,
    }}>PH</div>
  );
}

const SYNC_UI = {
  ok:       { color: '#22c55e', label: 'Sincronizado' },
  pending:  { color: '#f59e0b', label: 'Cambios sin sincronizar' },
  syncing:  { color: '#3b82f6', label: 'Sincronizando…' },
  conflict: { color: '#f59e0b', label: 'Conflicto: baja de la nube en Ajustes' },
  error:    { color: '#ef4444', label: 'Error de sincronización' },
  idle:     { color: '#9ca3af', label: 'Sin sincronizar aún' },
};

function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'hace segundos';
  if (secs < 3600) return `hace ${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)} h`;
  return `hace ${Math.floor(secs / 86400)} d`;
}

function SyncIndicator({ sync, onClick, size = 36 }) {
  if (!sync || sync.status === 'off') return null;
  const ui = SYNC_UI[sync.status] || SYNC_UI.idle;
  const ago = timeAgo(sync.lastSyncAt);
  const title = ago ? `${ui.label} · ${ago}` : ui.label;
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: size, height: size, borderRadius: 10, cursor: 'pointer',
      border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: '50%', background: ui.color,
        boxShadow: `0 0 0 3px ${ui.color}22`,
        animation: sync.status === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none',
      }} />
    </button>
  );
}

// Estado del sync del BRIDGE (chat↔app), distinto del Gist (backup en la nube). Deriva de
// state.bridge, que runBridgeSync/mergeBridge actualizan (lastSyncOk/Error/At/Added).
function bridgeSyncStatus(state) {
  if (!state?.settings?.bridgeUrl) return null; // sin bridge configurado → no se muestra
  const b = state.bridge || {};
  if (b.lastSyncOk === false) {
    return { color: '#ef4444', label: 'Error de sync (bridge)', detail: b.lastSyncError || null, at: b.lastSyncAttemptAt || b.lastSyncAt || null };
  }
  if (b.lastSyncAt) {
    const a = b.lastSyncAdded || {};
    const n = (a.meals || 0) + (a.weights || 0) + (a.workouts || 0);
    return { color: '#22c55e', label: n > 0 ? `Bridge: +${n} ítem(s)` : 'Bridge sincronizado', detail: null, at: b.lastSyncAt };
  }
  return { color: '#9ca3af', label: 'Bridge: sin sincronizar aún', detail: null, at: null };
}

function BridgeSyncIndicator({ status, syncing, onSync, size = 36 }) {
  if (!status) return null;
  const ago = timeAgo(status.at);
  const title = `${status.label}${ago ? ' · ' + ago : ''}${status.detail ? ' · ' + status.detail : ''} — toca para sincronizar ahora`;
  const color = syncing ? '#3b82f6' : status.color;
  return (
    <button onClick={onSync} title={title} aria-label={title} style={{
      width: size, height: size, borderRadius: 10, cursor: 'pointer',
      border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <span style={{ fontSize: 12, lineHeight: 1, filter: 'grayscale(1)', opacity: 0.65 }}>🔗</span>
      <span style={{
        position: 'absolute', top: 6, right: 6,
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: `0 0 0 2px var(--bento-card), 0 0 0 4px ${color}22`,
        animation: syncing ? 'pulse 1s ease-in-out infinite' : 'none',
      }} />
    </button>
  );
}

function BentoTopBar({ activeTab, onTabChange, onCmdK, onAddMeal, onOpenSettings, theme, onToggleTheme, dateLabel, sync, bridgeSync, onBridgeSync, bridgeSyncing }) {
  const isDark = theme === 'dark';
  return (
    <div className="bento-topbar-desktop" style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'var(--bento-bg)', borderBottom: '1px solid var(--bento-hairline)',
      padding: '14px 22px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <BentoLogo />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--bento-ink)' }}>Plan Hugo</div>
          <div style={{ fontSize: 12, color: 'var(--bento-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
        {BENTO_TABS.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} style={{
            padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
            background: activeTab === t.id ? 'var(--bento-ink)' : 'transparent',
            color: activeTab === t.id ? 'var(--bento-on-ink)' : 'var(--bento-muted)',
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BridgeSyncIndicator status={bridgeSync} syncing={bridgeSyncing} onSync={onBridgeSync} />
        <SyncIndicator sync={sync} onClick={onOpenSettings} />
        <button onClick={onCmdK} style={{
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
          fontSize: 12, color: 'var(--bento-muted)', fontWeight: 500,
          fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        }}>⌘K</button>
        <button onClick={onToggleTheme} title="Tema" style={{
          width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }}>{isDark ? '☀️' : '🌙'}</button>
        <button onClick={onOpenSettings} title="Ajustes" style={{
          width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }}>⚙️</button>
        <button onClick={onAddMeal} style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          border: 'none', background: 'var(--bento-ink)', color: 'var(--bento-on-ink)',
          fontSize: 13, fontWeight: 500,
        }}>+ Comida</button>
      </div>
    </div>
  );
}

function BentoMobileTopBar({ activeTab, onCmdK, onOpenSettings, theme, onToggleTheme, dateLabel, sync, bridgeSync, onBridgeSync, bridgeSyncing }) {
  const tab = BENTO_TABS.find((t) => t.id === activeTab);
  const isDark = theme === 'dark';
  return (
    <div className="bento-topbar-mobile" style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'var(--bento-bg)', borderBottom: '1px solid var(--bento-hairline)',
      padding: 'calc(env(safe-area-inset-top) + 10px) 14px 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <BentoLogo />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--bento-ink)' }}>{tab?.label || 'Plan Hugo'}</div>
          <div style={{ fontSize: 10, color: 'var(--bento-faint)' }}>{dateLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <BridgeSyncIndicator status={bridgeSync} syncing={bridgeSyncing} onSync={onBridgeSync} />
        <SyncIndicator sync={sync} onClick={onOpenSettings} />
        <button onClick={onCmdK} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)',
          fontSize: 14, color: 'var(--bento-muted)', fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        }}>⌘K</button>
        <button onClick={onToggleTheme} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 15,
        }} aria-label="Tema">{isDark ? '☀️' : '🌙'}</button>
        <button onClick={onOpenSettings} style={{
          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--bento-hairline)', background: 'var(--bento-card)', fontSize: 16,
        }} aria-label="Ajustes">⚙️</button>
      </div>
    </div>
  );
}

function BentoMobileTabBar({ activeTab, onTabChange }) {
  return (
    <nav className="bento-mobile-tabbar safe-bottom" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'var(--bento-card)', borderTop: '1px solid var(--bento-hairline)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {BENTO_TABS.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer',
            color: activeTab === t.id ? 'var(--bento-ink)' : 'var(--bento-faint)',
            fontWeight: activeTab === t.id ? 600 : 400,
          }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ fontSize: 10 }}>{t.short}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function CmdKPalette({ open, onClose, onAction }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const items = useMemo(() => {
    const navs = BENTO_TABS.map((t, i) => ({
      id: 'nav:' + t.id, kind: 'Navegar', label: 'Ir a · ' + t.label, hint: '#' + (i + 1), kbd: String(i + 1),
      action: () => onAction({ type: 'nav', tab: t.id }),
    }));
    const acts = [
      { id: 'act:meal',  kind: 'Acción', label: 'Agregar comida',         hint: 'foto · voz · texto', action: () => onAction({ type: 'meal' }) },
      { id: 'act:sub',   kind: 'Acción', label: '¿Qué puedo comer?',      hint: 'sustituciones',      action: () => onAction({ type: 'sub' }) },
      { id: 'act:coach', kind: 'Acción', label: 'Pregúntale al coach',    hint: 'análisis del día',   action: () => onAction({ type: 'coach' }) },
      { id: 'act:water', kind: 'Acción', label: 'Agregar 250 ml de agua', hint: '+1 vaso',            action: () => onAction({ type: 'water', ml: 250 }) },
      { id: 'act:weight',kind: 'Acción', label: 'Nueva medición de peso', hint: 'captura báscula',    action: () => onAction({ type: 'nav', tab: 'weight' }) },
      { id: 'act:settings',kind:'Acción',label: 'Ajustes',                hint: 'API key, reglas…',   action: () => onAction({ type: 'settings' }) },
    ];
    const themes = [
      { id: 'th:auto',  kind: 'Tema', label: 'Tema · sistema', action: () => onAction({ type: 'theme', value: null   }) },
      { id: 'th:light', kind: 'Tema', label: 'Tema · claro',   action: () => onAction({ type: 'theme', value: 'light'}) },
      { id: 'th:dark',  kind: 'Tema', label: 'Tema · oscuro',  action: () => onAction({ type: 'theme', value: 'dark' }) },
    ];
    return [...navs, ...acts, ...themes];
  }, [onAction]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const qq = q.toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(qq) || it.kind.toLowerCase().includes(qq) || (it.hint || '').toLowerCase().includes(qq));
  }, [q, items]);

  useEffect(() => { setIdx(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape')         { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter')     { e.preventDefault(); const it = filtered[idx]; if (it) { it.action(); onClose(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, idx, onClose]);

  if (!open) return null;

  const groups = [];
  let lastKind = null;
  filtered.forEach((it, i) => {
    if (it.kind !== lastKind) { groups.push({ kind: it.kind, items: [] }); lastKind = it.kind; }
    groups[groups.length - 1].items.push({ ...it, _i: i });
  });

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" placeholder="Buscar pantalla, acción o tema…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--bento-faint)', fontSize: 13 }}>Sin resultados</div>
          )}
          {groups.map((g) => (
            <div key={g.kind}>
              <div className="cmdk-section">{g.kind}</div>
              {g.items.map((it) => (
                <div key={it.id} className="cmdk-item" data-active={it._i === idx}
                  onMouseEnter={() => setIdx(it._i)} onClick={() => { it.action(); onClose(); }}>
                  <span style={{ fontWeight: 500 }}>{it.label}</span>
                  {it.hint && <span style={{ color: 'var(--bento-faint)', fontSize: 11 }}>· {it.hint}</span>}
                  {it.kbd && <span className="cmdk-meta">{it.kbd}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--bento-hairline)',
          display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--bento-faint)',
          fontFamily: 'ui-monospace, JetBrains Mono, monospace' }}>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>↵</kbd> ejecutar</span>
          <span><kbd>esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, setState, saveError] = usePersistentState();
  const sync = useGistAutoSync(state, setState);
  const corruptionDetected = !!state.__corruptionDetected;
  const dismissCorruption = useCallback(() => setState((prev) => { const n = { ...prev }; delete n.__corruptionDetected; return n; }), [setState]);
  const [tab, setTab] = useState(() => {
    const h = (location.hash || '').replace(/^#?\/?/, '').toLowerCase();
    const hit = BENTO_TABS.find((t) => t.id === h);
    return hit ? hit.id : 'today';
  });
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showSettings, setShowSettings] = useState(false);
  const [showMealCapture, setShowMealCapture] = useState(false);
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  useEffect(() => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = state.theme || (sysDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', effective === 'dark');
  }, [state.theme]);

  const setTheme = useCallback((t) => setState((prev) => ({ ...prev, theme: t })), [setState]);
  const effectiveTheme = state.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');

  const targets = useMemo(() => calcTargets(state.userProfile), [state.userProfile]);
  const needsOnboarding = !state.userProfile;

  // Scheduler de notificaciones (hook que vive mientras la app esté abierta)
  useNotificationScheduler(state.settings?.notifications);

  // Auto-sync del puente chat→app: al montar, al volver a primer plano, y cada 30s mientras
  // la app está visible. El polling es lo que hace que los datos del OTRO dispositivo aparezcan
  // sin tener que reabrir la app (antes solo sincronizaba en mount/visibilitychange).
  const bridgeUrl = state.settings?.bridgeUrl;
  const bridgeToken = state.settings?.bridgeToken;
  const bridgePost = bridgeUrl ? withBridgeToken(bridgeUrl, bridgeToken) : null;
  useEffect(() => {
    if (!bridgeUrl) return;
    const sync = () => { runBridgeSync({ settings: { bridgeUrl, bridgeToken } }, setState).catch(() => {}); };
    sync();
    const onVis = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVis);
    // Poll cada 30s, pero solo con la pestaña visible (no gastar red/batería en segundo plano).
    const poll = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 30000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(poll); };
  }, [bridgeUrl, bridgeToken, setState]);

  // Sync manual del bridge (al tocar el indicador 🔗 del header). `bridgeSyncing` solo pulsa
  // el punto en este disparo manual, no en el poll de 30s (evita parpadeo constante).
  const [bridgeSyncing, setBridgeSyncing] = useState(false);
  const bridgeSyncUi = bridgeSyncStatus(state);
  const manualBridgeSync = useCallback(async () => {
    if (!bridgeUrl) return;
    setBridgeSyncing(true);
    try { await runBridgeSync({ settings: { bridgeUrl, bridgeToken } }, setState); }
    finally { setBridgeSyncing(false); }
  }, [bridgeUrl, bridgeToken, setState]);

  // Empuje app→bridge: manda al bridge el total REAL del día (lo que la app
  // calcula: plan fijo marcado + extras − ejercicio) para que el chat pueda
  // responder "cómo voy hoy" con el mismo número que se ve en pantalla.
  const snapDayKey = todayKey();
  const snapPayload = useMemo(() => {
    const t = computeDayTotals(
      (state.days || {})[snapDayKey], state.snackBank || [], state.proteinBank || [],
      targets, state.dessertBank || [], state.antojoCustomItems || []);
    return {
      op: 'snapshot', date: snapDayKey, ts: Date.now(),
      // planScope:'plan-only' marca la PARTICIÓN ADITIVA: `totals` lleva SOLO la porción
      // del plan (fijos + banco) + agua, que no viaja a meals[]. El bridge SUMA esto con
      // meals[]/workouts[] (no Math.max). Los snapshots sin este marcador son legacy
      // (totales completos) y el bridge los trata con la regla vieja para no romper datos
      // en vuelo. Subir el marcador si la semántica vuelve a cambiar.
      planScope: 'plan-only',
      totals: {
        kcalIn: t.planIn, kcalBurned: 0, kcalNet: t.planIn,
        protein: t.planProtein, carbs: t.planCarbs, fat: t.planFat, fiber: t.planFiber,
        // SOLO el agua propia de la app (water.ml). El agua del chat vive en water[] del
        // bridge y se suma en ?totals allá; si la empujáramos aquí (t.waterMl la incluye)
        // se doble-contaría. Ver computeDayTotals y mergeBridge (water.bridgeMl).
        waterMl: Number((state.days || {})[snapDayKey]?.water?.ml) || 0,
      },
      targets: {
        kcalMax: targets.kcalMax, proteinMin: targets.proteinMin, carbsTarget: targets.carbsTarget,
        fatTarget: targets.fatTarget, fiberTarget: targets.fiberTarget, waterTarget: targets.waterTarget,
      },
      remaining: {
        kcal: t.kcalRemaining, protein: t.proteinRemaining, carbs: t.carbsRemaining,
        fat: t.fatRemaining, fiber: t.fiberRemaining, water: t.waterRemaining,
      },
      extras: (t.extras || []).map((x) => x?.name).filter(Boolean),
    };
  }, [state.days, state.snackBank, state.proteinBank, state.dessertBank, state.antojoCustomItems, targets, snapDayKey]);
  // El `ts` cambia en cada render; para no empujar de más, comparamos solo lo sustantivo.
  const snapBody = useMemo(() => {
    const { ts, ...rest } = snapPayload; void ts; return JSON.stringify(rest);
  }, [snapPayload]);
  useEffect(() => {
    if (!bridgeUrl) return;
    const id = setTimeout(() => {
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...JSON.parse(snapBody), ts: Date.now() }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [bridgePost, snapBody]);

  // Empuje app→bridge: manda el perfil + metas calculadas (meta diaria, déficit,
  // TMB/TDEE, antropometría) para que la skill food-tracker NO hardcodee ~2.150 y
  // lea la meta real. Se guarda en `config` del bridge (GET ?config=1 lo devuelve).
  const configBody = useMemo(() => {
    const p = state.userProfile;
    if (!p) return null;
    return JSON.stringify({
      op: 'config',
      config: {
        goal: p.goal ?? null, sex: p.sex ?? null, age: p.age ?? null,
        heightCm: p.heightCm ?? null, weightKg: p.weightKg ?? null,
        activityLevel: p.activityLevel ?? null,
        kcalTarget: p.kcalTarget ?? null, kcalDeficit: p.kcalDeficit ?? null,
        targets: {
          kcalMax: targets.kcalMax, kcalMin: targets.kcalMin, proteinMin: targets.proteinMin,
          carbsTarget: targets.carbsTarget, fatTarget: targets.fatTarget,
          fiberTarget: targets.fiberTarget, waterTarget: targets.waterTarget,
          bmr: targets.bmr ?? null, tdee: targets.tdee ?? null,
        },
      },
    });
  }, [state.userProfile, targets]);
  // configBody no lleva timestamp: el efecto solo dispara cuando el perfil/metas
  // cambian de verdad, no en cada render. Debounce 1800ms (escalonado del snapshot).
  useEffect(() => {
    if (!bridgeUrl || !configBody) return;
    const id = setTimeout(() => {
      const payload = JSON.parse(configBody);
      payload.config.updatedAt = new Date().toISOString();
      fetch(bridgePost, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 1800);
    return () => clearTimeout(id);
  }, [bridgePost, configBody]);

  // Empuje app→bridge de entradas creadas en la app (extras, ejercicios, pesos) para que el
  // chat y el bridge las vean (bidireccional). El servidor reasigna el id y dedup por contenido,
  // así que reenviar es inocuo. NO se reenvía lo que vino del bridge (id en importedIds) ni lo ya
  // enviado (id en pushedIds). Mismo patrón POST no-cors/text-plain que snapshot/config.
  const pushPayload = useMemo(() => {
    const imported = new Set(state.bridge?.importedIds || []);
    const pushed = new Set(state.bridge?.pushedIds || []);
    const cutoff = shiftDate(todayKey(), -10);
    const numv = (v) => Number(v) || 0;
    const out = [];
    const days = state.days || {};
    for (const dk of Object.keys(days)) {
      if (dk < cutoff) continue;
      const d = days[dk] || {};
      for (const x of (d.extras || [])) {
        if (!x || x.id == null || imported.has(x.id) || pushed.has(x.id)) continue;
        out.push({ localId: x.id, section: 'meals', date: dk, entry: {
          name: x.name, kcal: numv(x.kcal), protein: numv(x.protein), carbs: numv(x.carbs),
          fat: numv(x.fat), fiber: numv(x.fiber), mealSlot: x.mealSlot || 'extra',
          date: dk, ts: x.ts != null ? x.ts : null, source: 'app',
        } });
      }
      for (const ex of (d.exercise || [])) {
        if (!ex || ex.id == null || imported.has(ex.id) || pushed.has(ex.id)) continue;
        const entry = { name: ex.name, kcal: numv(ex.kcal), date: dk, ts: ex.ts != null ? ex.ts : null, source: 'app' };
        if (ex.minutes != null) entry.minutes = numv(ex.minutes);
        out.push({ localId: ex.id, section: 'workouts', date: dk, entry });
      }
    }
    for (const wt of (state.weights || [])) {
      if (!wt || wt.id == null) continue;
      const wdate = wt.date || '';
      if (wdate < cutoff || imported.has(wt.id) || pushed.has(wt.id)) continue;
      const entry = { date: wdate, source: 'app', ts: wt.ts != null ? wt.ts : null };
      for (const wf of WEIGHT_FIELDS) if (wt[wf.key] != null) entry[wf.key] = wt[wf.key];
      if (wt.time) entry.time = wt.time;
      out.push({ localId: wt.id, section: 'weights', date: wdate, entry });
    }
    return out;
  }, [state.days, state.weights, state.bridge]);
  const pushBody = useMemo(() => JSON.stringify(pushPayload), [pushPayload]);
  useEffect(() => {
    if (!bridgeUrl) return;
    let items;
    try { items = JSON.parse(pushBody); } catch (e) { items = []; }
    if (!items.length) return;
    const id = setTimeout(async () => {
      const pushedNow = [];
      for (const it of items) {
        try {
          await fetch(bridgePost, {
            method: 'POST', mode: 'no-cors', keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              op: 'add', section: it.section, today: it.date,
              entries: [{ ...it.entry, ts: it.entry.ts != null ? it.entry.ts : Date.now() }],
            }),
          });
          pushedNow.push(it.localId);
        } catch (e) { /* red caída: queda sin marcar y se reintenta en el próximo cambio */ }
      }
      if (pushedNow.length) {
        setState((prev) => ({
          ...prev,
          bridge: { ...(prev.bridge || {}), pushedIds: [...new Set([...(prev.bridge?.pushedIds || []), ...pushedNow])] },
        }));
      }
    }, 2200);
    return () => clearTimeout(id);
  }, [bridgePost, pushBody, setState]);

  // Persist tab en hash + shortcuts
  useEffect(() => { history.replaceState(null, '', '#/' + tab); }, [tab]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen((v) => !v); return; }
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (!inField && /^[1-6]$/.test(e.key)) {
        const t = BENTO_TABS[Number(e.key) - 1];
        if (t) setTab(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSelectDay = (key) => { setSelectedDate(key); setTab('today'); };

  const dateLabel = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [selectedDate]);

  const handleCmdkAction = useCallback((action) => {
    if (action.type === 'nav') setTab(action.tab);
    else if (action.type === 'meal') setShowMealCapture(true);
    else if (action.type === 'sub') setShowSubstitution(true);
    else if (action.type === 'coach') setShowCoach(true);
    else if (action.type === 'settings') setShowSettings(true);
    else if (action.type === 'theme') setTheme(action.value);
    else if (action.type === 'water') {
      setState((prev) => {
        const days = { ...(prev.days || {}) };
        const d = { ...(days[selectedDate] || {}) };
        d.water = { ...(d.water || {}), ml: (Number(d.water?.ml) || 0) + action.ml };
        days[selectedDate] = d;
        return { ...prev, days };
      });
    }
  }, [setTheme, setState, selectedDate]);

  return (
    <div className="bento-app min-h-screen pb-24" style={{ background: 'var(--bento-bg)', color: 'var(--bento-ink)' }}>
      <BentoTopBar activeTab={tab} onTabChange={setTab} onCmdK={() => setCmdkOpen(true)}
        onAddMeal={() => setShowMealCapture(true)} onOpenSettings={() => setShowSettings(true)}
        theme={effectiveTheme} onToggleTheme={toggleTheme} dateLabel={dateLabel} sync={sync}
        bridgeSync={bridgeSyncUi} onBridgeSync={manualBridgeSync} bridgeSyncing={bridgeSyncing} />
      <BentoMobileTopBar activeTab={tab} onCmdK={() => setCmdkOpen(true)}
        onOpenSettings={() => setShowSettings(true)} theme={effectiveTheme} onToggleTheme={toggleTheme} dateLabel={dateLabel} sync={sync}
        bridgeSync={bridgeSyncUi} onBridgeSync={manualBridgeSync} bridgeSyncing={bridgeSyncing} />

      {saveError && (
        <div className="mx-3 mt-2 rounded-xl px-3 py-2 text-sm font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
          ⚠️ {saveError}
        </div>
      )}
      {corruptionDetected && (
        <div className="mx-3 mt-2 rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800 flex items-start gap-2 justify-between">
          <span>⚠️ Los datos locales estaban dañados y se recuperó una copia anterior (o se partió de cero). {state.settings?.syncGistId ? 'Revisa Ajustes y haz "Bajar de la nube" para restaurar tu respaldo.' : 'Si tienes respaldo en la nube, conéctalo en Ajustes.'}</span>
          <button onClick={dismissCorruption} className="shrink-0 text-amber-700 dark:text-amber-300 underline">Entendido</button>
        </div>
      )}

      <div key={tab} className="screen-enter">
        {tab === 'today' && (
          <TodayView state={state} setState={setState} dateKey={selectedDate} setDateKey={setSelectedDate}
            targets={targets}
            onAddMealCapture={() => setShowMealCapture(true)}
            onAddSubstitution={() => setShowSubstitution(true)}
            onCoach={() => setShowCoach(true)} />
        )}
        {tab === 'week' && <WeekView state={state} setState={setState} onSelectDay={handleSelectDay} targets={targets} />}
        {tab === 'plan' && <PlanWeekView state={state} setState={setState} targets={targets} />}
        {tab === 'idea' && <IdeaView state={state} setState={setState} targets={targets} />}
        {tab === 'insights' && <InsightsView state={state} setState={setState} targets={targets} />}
        {tab === 'weight' && <WeightView state={state} setState={setState} targets={targets} />}
        {tab === 'bank' && <BankView state={state} setState={setState} />}
      </div>

      <BentoMobileTabBar activeTab={tab} onTabChange={setTab} />
      <CmdKPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onAction={handleCmdkAction} />

      {needsOnboarding && (
        <OnboardingModal state={state} setState={setState} onClose={() => {}} />
      )}
      {showMealCapture && (
        <MealPhotoModal state={state} setState={setState} dateKey={selectedDate}
          onClose={() => setShowMealCapture(false)} />
      )}
      {showSubstitution && (
        <SubstitutionModal state={state} setState={setState} dateKey={selectedDate} targets={targets}
          onClose={() => setShowSubstitution(false)} />
      )}
      {showCoach && (
        <CoachModal state={state} setState={setState} dateKey={selectedDate} targets={targets}
          onClose={() => setShowCoach(false)}
          onOpenSubstitution={() => setShowSubstitution(true)} />
      )}
      {showSettings && <SettingsModal state={state} setState={setState} onClose={() => setShowSettings(false)} />}

      {/* Hint de teclado (solo desktop) */}
      <div className="bento-topbar-desktop" style={{
        position: 'fixed', bottom: 14, left: 14, zIndex: 25,
        background: 'var(--bento-card)', color: 'var(--bento-muted)',
        padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bento-hairline)',
        fontSize: 11, fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)', display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span><kbd>⌘K</kbd> palette</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><kbd>1</kbd>–<kbd>6</kbd> tabs</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// PWA: registrar Service Worker (solo desde http/https, no desde file://)
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('SW registration failed:', e?.message);
    });
  });
}
