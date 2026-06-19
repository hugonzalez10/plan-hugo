// Capa de integración con la IA de Claude (extracción de capturas, estimación de macros/kcal,
// sugerencias) y sus prompts. Sin React/JSX. Extraída de app.jsx en la modularización (Etapa 1).
// Solo depende de parsing.mjs (parseJsonLoose/parser de rutina) y meals.mjs (computeDayTotals,
// para que las sugerencias conozcan lo que va del día). askClaude hace el fetch a la API.
import { todayKey } from './dates.mjs';
import { parseJsonLoose, parseRoutineTemplate, normalizeRoutine } from './parsing.mjs';
import { computeDayTotals } from './meals.mjs';

export const PROMPT_EXTRACT = `Estás analizando UNA O VARIAS capturas de pantalla de una app de báscula inteligente (Speediance Smart Scale principalmente, también Withings, Renpho, similares). Las capturas pueden ser de:
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

export const PROMPT_EXTRACT_WORKOUT = `Estás analizando UNA O VARIAS capturas de pantalla de estadísticas de entrenamiento (Speediance u otra app de fitness).

Si hay varias imágenes, COMBINA toda la información en UN ÚNICO objeto JSON. Si las imágenes muestran períodos distintos, prioriza la sesión/día más reciente.

Extrae el resumen del entrenamiento o período mostrado.

Devuelve SOLO un objeto JSON válido, sin texto adicional, sin markdown.

Usa estos keys cuando estén disponibles (omite los que no aparezcan):
- type ("strength" si es entrenamiento de fuerza con pesos/máquinas; "cardio" si es bici,
  trote, remo, elíptica, caminata u otra actividad aeróbica con distancia/ritmo/potencia/FC)
- activity (SOLO si type es "cardio": nombre corto de la actividad en español, ej. "Bicicleta",
  "Trote", "Remo", "Elíptica", "Caminata")
- kcal (calorías quemadas TOTAL del período mostrado, número. Si la captura muestra "activas" y
  "totales", usa las TOTALES)
- minutes (duración total en minutos, número entero)
- volumeKg (volumen total de peso levantado en kg, número — solo fuerza)
- workouts (cantidad de entrenamientos del período, entero)
- (SOLO cardio) distanceM (distancia total en METROS, número. "21.5 km" → 21500; "21534 m" → 21534)
- (SOLO cardio) avgPowerW (potencia promedio en vatios/watts, número. "173 vatio" → 173)
- (SOLO cardio) avgCadenceRpm (cadencia promedio en rpm, número)
- (SOLO cardio) avgHr (frecuencia cardiaca promedio en lpm/ppm/bpm, número. "138 LPM" → 138)
- date (YYYY-MM-DD si la captura menciona una fecha específica, sino null)
- period (string indicando el alcance temporal):
   - "today" si la captura muestra "Hoy", "Día actual", o stats de una sesión única
   - "session" si es claramente UNA sesión individual con duración corta
   - "7days" si es resumen de "7 días", "última semana"
   - "30days" si es "30 días", "último mes"
   - "month" si es vista mensual
   - "all" si es histórico completo
- exercises (SOLO si la captura lista los movimientos/ejercicios de UNA sesión, no en resúmenes
  agregados): array de objetos, uno por ejercicio EN ORDEN, con:
   - name (nombre del ejercicio tal cual aparece, ej. "Caja de cremallera delantera Squat",
     "Cuerda de tricep cubilete", "Crunch con barra")
   - muscle (grupo muscular principal, en español, normalizado a UNO de:
     "pecho", "espalda", "piernas", "hombros", "brazos", "core", "glúteos", "cardio", "movilidad".
     INFIÉRELO del nombre — Speediance NO lo dice. Pistas: Squat/sentadilla/split/prensa/femoral
     → "piernas"; Crunch/abdominales/plancha/rotación/oblicuo → "core"; tricep/bíceps/curl →
     "brazos"; press banca/pectoral/apertura → "pecho"; remo/dominada/jalón/espalda → "espalda";
     press militar/hombro/elevación lateral → "hombros"; glúteo/hip thrust/puente → "glúteos";
     estiramiento/movilidad/flexor de cadera/calentamiento → "movilidad".)
   - sets (número de series de trabajo, entero) — null si no aparece
   - reps (repeticiones por serie; si ves "12/12" es bilateral izq/der → usa 12; rango → "8-12") —
     null si el ejercicio es por tiempo/duración (movilidad, estiramiento)
   - weightKg (usa el valor "Peso máx" del ejercicio, en kg) — null si es peso corporal o no aparece
   - volumeKg (el "Volumen total" del ejercicio, en kg) — null si no aparece
   - oneRepMaxKg (el valor "1 repetición máx." / 1RM estimado, en kg) — null si no aparece
   - quality (la "Puntuación del movimiento": una letra "A", "B", "C", "D") — null si no aparece

Reglas:
- Valores numéricos sin unidades.
- null si no aparece. No inventes.
- Si ves "30.3K kg" interpreta como 30300.
- Si ves "4491 kcal" como total, eso es kcal=4491.
- Si "Peso máx" muestra dos valores (ej. "18.0 / 18.0", una por brazo) usa uno (18).
- Los ejercicios de solo "Duración" (00:00:30) son movilidad/estiramiento: muscle "movilidad",
  reps null, weightKg null.
- Si NO ves un desglose por ejercicio (solo totales), omite "exercises".
- Si es CARDIO (bici, trote, remo…), NO devuelvas "exercises" ni "volumeKg"; usa los keys de cardio.
- Si varias capturas mezclan dos apps (ej. Apple Fitness + la app de la bici), combina en UNA
  sola sesión tomando el valor más completo de cada métrica.

Ejemplo fuerza: {"type":"strength","kcal":297,"minutes":32,"volumeKg":8462,"period":"today","exercises":[{"name":"Caja de cremallera delantera Squat","muscle":"piernas","sets":3,"reps":13,"weightKg":25,"volumeKg":1668,"oneRepMaxKg":33,"quality":"B"},{"name":"Cuerda de tricep cubilete","muscle":"brazos","sets":3,"reps":15,"weightKg":60,"volumeKg":1141,"oneRepMaxKg":96,"quality":"A"}]}
Ejemplo cardio: {"type":"cardio","activity":"Bicicleta","kcal":629,"minutes":45,"period":"today","distanceM":21534,"avgPowerW":173,"avgCadenceRpm":58,"avgHr":138}`;

export const PROMPT_EXTRACT_MEAL = `Eres un nutricionista experto. Estás analizando una FOTO de un plato de comida y/o una DESCRIPCIÓN en texto natural de lo que comió alguien.

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

export const MODEL_DEFAULT = 'claude-sonnet-4-6';
export const MODEL_CHEAP = 'claude-haiku-4-5';

export async function extractFromAttachments(attachments, apiKey, prompt, opts = {}) {
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

export async function extractMetricsFromImage(attachments, apiKey) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  return extractFromAttachments(list, apiKey, PROMPT_EXTRACT);
}

export async function extractWorkoutFromImage(attachments, apiKey) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  // MODEL_DEFAULT (mejor visión para tablas de Speediance) y más tokens para el desglose
  // ejercicio-por-ejercicio.
  return extractFromAttachments(list, apiKey, PROMPT_EXTRACT_WORKOUT, { model: MODEL_DEFAULT, maxTokens: 1500 });
}

// ───────────────── Parser de rutina (.docx → JSON) ─────────────────
// Dos caminos que convergen en normalizeRoutine: IA (Claude sobre texto libre) con fallback a
// un parser determinista del formato fijo Speediance. Los videos NO se tocan acá; se re-vinculan
// por slug en la vista (exercise_videos persiste entre renovaciones).

export const PROMPT_PARSE_ROUTINE = `Eres un parser de rutinas de gimnasio. Recibes el texto plano de un documento con una rutina semanal. Extrae los días y, por cada día, sus ejercicios.

Devuelve SOLO JSON válido, sin markdown ni backticks, con este esquema exacto:
{
  "title": "título corto de la rutina (o 'Rutina')",
  "days": [
    {
      "label": "Día N — Título (ej. 'Día 1 — Pierna')",
      "durationMin": número entero o null,
      "warmup": "texto del calentamiento general del día, o null",
      "ramp": "el párrafo completo de 'Rampa de aproximación' del día (regla general), o null",
      "cardioClose": "texto del 'Cardio de cierre' del día, o null",
      "note": "para días de cardio puro SIN tabla de ejercicios, el cuerpo del día (ej. 'Sin fuerza este día. Remo o bicicleta 50 min…'); si no aplica, null",
      "exercises": [
        {
          "name": "nombre del ejercicio sin el símbolo de ancla",
          "anchor": true si el ejercicio trae el símbolo ⚓ o la palabra 'ancla', si no false,
          "pesoInicio": "peso inicial tal cual aparece (ej. '70 kg') o null",
          "seriesReps": "series y reps tal cual (ej. '4×8' o '4 series × 8 reps') o null",
          "descanso": "descanso tal cual (ej. '2-3 min') o null",
          "ramp": "la aproximación específica de ESTE ejercicio si el párrafo de rampa la detalla (ej. 'barra ~20 kg ×8 → 30×5 → 45×3 → 60×2 → trabajo 75 kg'); si dice 'sin rampa' o no se menciona, null",
          "notas": "notas del ejercicio o null"
        }
      ]
    }
  ]
}

Reglas:
- Respeta el orden de días y ejercicios del documento.
- No inventes ejercicios, pesos ni rampas: copia textual del documento; si un campo no aparece, usa null.
- anchor=true SOLO si hay ⚓ o la palabra 'ancla' junto al ejercicio.
- La rampa por ejercicio (campo "ramp" dentro de exercises) sale de descomponer el párrafo "Rampa de aproximación" del día: asígnala al ejercicio que nombra. Los accesorios marcados "sin rampa" → ramp null.`;

// Camino IA: manda el texto a Claude y parsea con parseJsonLoose (tolera fences/truncado).
export async function parseRoutineWithClaude(rawText, apiKey) {
  const prompt = `${PROMPT_PARSE_ROUTINE}\n\nTexto del documento:\n"""\n${(rawText || '').slice(0, 24000)}\n"""`;
  const text = await askClaude(prompt, apiKey, 4000, MODEL_DEFAULT);
  const json = parseJsonLoose(text);
  if (!json || !Array.isArray(json.days)) throw new Error('La IA no devolvió una rutina válida');
  return json;
}

// Orquestador: IA preferente (si hay API key), siempre con fallback a template.
export async function parseRoutineDocx(rawText, apiKey) {
  if (apiKey) {
    try {
      const j = await parseRoutineWithClaude(rawText, apiKey);
      if (j && Array.isArray(j.days) && j.days.length) {
        return { routine: normalizeRoutine(j), source: 'ai' };
      }
    } catch (e) {
      console.warn('Parseo IA de rutina falló, uso template:', e);
    }
  }
  return { routine: normalizeRoutine(parseRoutineTemplate(rawText)), source: 'template' };
}

export const PROMPT_ESTIMATE_EXTRA = `Eres un nutricionista chileno. Estima los macros de un alimento individual o pequeño combo (un snack, una bebida, una galleta — no un plato completo).

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

export const PROMPT_ESTIMATE_EXERCISE = `Eres entrenador deportivo. Estima kcal quemadas en una sesión de ejercicio basándote en el tipo, duración (si se menciona) y peso del usuario.

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

export async function estimateExerciseKcal({ description, weightKg, apiKey }) {
  const promptParts = [PROMPT_ESTIMATE_EXERCISE];
  if (weightKg) promptParts.push(`\n\nPeso del usuario: ${weightKg} kg`);
  promptParts.push(`\n\nDescripción del usuario: "${(description || '').trim()}"`);
  return extractFromAttachments([], apiKey, promptParts.join(''), {
    model: MODEL_CHEAP,
    maxTokens: 300,
  });
}

export async function estimateExtraMacros({ name = '', attachments = [], apiKey }) {
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

export async function suggestForSlot({ slot, state, targets, apiKey, recents = [] }) {
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

export const PROMPT_RECIPE = `Eres un nutricionista chileno asesorando a Hugo, médico geriatra de 36 años en plan de pérdida de peso. Hugo te muestra ingredientes disponibles (foto de despensa/refrigerador o lista en texto) y te pide una receta concreta para una ocasión específica del día.

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

export async function suggestRecipeFromIngredients({ attachments = [], ingredientsText = '', notes = '', occasion, state, targets, apiKey }) {
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

export async function extractMealFromInputs({ attachments = [], freeText = '', apiKey }) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  const promptParts = [PROMPT_EXTRACT_MEAL];
  if (freeText && freeText.trim()) {
    promptParts.push(`\n\nDescripción del usuario:\n"""${freeText.trim()}"""`);
  }
  const finalPrompt = promptParts.join('');
  return extractFromAttachments(list, apiKey, finalPrompt);
}

export async function askClaude(prompt, apiKey, maxTokens = 1024, model = MODEL_DEFAULT) {
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
