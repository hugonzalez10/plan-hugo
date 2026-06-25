---
name: food-tracker
description: >
  Registra alimentación, peso, ejercicio y agua diarios del Dr. Hugo González con
  fotos o texto, estima calorías/macros/composición con visión IA, y escribe un
  JSON depurado en Google Drive (plan-hugo-bridge.json) para que la app "Plan
  Hugo" lo consuma directo sin llamar a la API. USAR SIEMPRE que Hugo mande una
  foto de comida, una captura de báscula/composición corporal (peso, % grasa,
  músculo), o una captura de entrenamiento (Apple Fitness, Strava, etc.), o diga
  "comí X", "registra esto", "anota esta comida", "cuántas calorías tiene esto",
  "pésame esto", "registra mi peso", "anota este entrenamiento", "registra este
  ejercicio", "registra X de agua", "agrega X de agua", "añade X litros/lt",
  "suma X de agua", "tomé X vasos", "anota un vaso de agua",
  "me tomé una botella/un litro", o cualquier variación de registro de comida,
  peso, actividad o agua/hidratación. **agregar/añadir/sumar son sinónimos de
  registrar** (ej. "agrega 1.5lt de agua" = registrar 1500 ml de agua); cualquiera
  de esos verbos sobre comida/peso/ejercicio/agua DEBE activar la skill.
  También activar con "cómo voy hoy", "cuánto llevo", "resumen del día".
---

# Food Tracker — Plan Hugo

La skill hace TODO el trabajo con IA. La app solo lee el JSON desde Drive y lo
mergea a su estado local. **Un solo archivo en Drive: `plan-hugo-bridge.json`**
con secciones (`meals`, `weights`, `workouts`, `checks`, `water`, `lifts`).

## Persistencia — registro por `curl`/Bash al Apps Script (LEER ANTES DE GUARDAR)

> **REGLA DURA: para registrar NUNCA uses el conector de Drive (`create_file`,
> `update_file`, `download_file_content`, etc.) ni descargues el bridge completo.
> Se escribe con `curl` directo al Apps Script (`BRIDGE_URL`).**
>
> **NO uses `web_fetch`/`WebFetch` para el bridge:** bloquea la URL del `/exec` por no
> venir de un resultado de búsqueda. Usa **`curl` por Bash** (POST preferido, o GET).
>
> Por qué: el bridge vive en la RAÍZ de un Shared Drive con restricción de IA, así
> que el conector **no puede ni leerlo ni escribirlo** (`canAddChildren:false` +
> "ineligible for generative AI contexts"). La skill manda la entrada nueva por
> `curl` al `/exec`; el Apps Script hace el merge, la poda y la sobrescritura en sitio
> sobre el `FILE_ID` fijo, y devuelve los totales del día ya sumados. El conector de
> Drive queda fuera del camino por completo.
>
> **El SERVIDOR asigna el `id` y deduplica por CONTENIDO** (nombre normalizado +
> `mealSlot` + `date` + ventana de ~5 min), no por el `id` del cliente. Así el mismo
> plato registrado desde la app y desde el chat (o dos veces) NO se duplica aunque
> traiga ids distintos. El `id` que mandes es opcional y el servidor lo ignora/reasigna;
> conviene mandar `time` (o `ts` en ms) para afinar la ventana.
>
> **Ningún `create_file` es necesario ni permitido para registrar.** Si te ves
> tentado a crear un archivo en Drive, estás en el flujo viejo (roto): vuelve a
> este paso y usa `curl`.
>
> Red de seguridad: el Apps Script tiene auto-heal en la lectura, así que cualquier
> `plan-hugo-bridge.json` suelto que quede de un flujo viejo se absorbe y borra solo
> en la próxima lectura de la app. Eso NO es excusa para saltarse el `curl`.

Constantes (no cambiar salvo que se recree el archivo; si cambia el `FILE_ID`,
actualízalo también en `apps-script/bridge-writer.gs`):

| Constante | Valor |
|-----------|-------|
| `FILE_ID` (canónico, lo maneja el Apps Script) | `1YN3F48EZoRWSpOabwDqoXzKrGkTqIa2t` |
| `BRIDGE_URL` (Apps Script `/exec`) | `https://script.google.com/macros/s/AKfycbwcxEoa0nvjhMv6nrdfMcaHKS130PcXV0isbc7ajNj_CMfuBXCR6RhL63LHv-e1zW9W_w/exec` |
| `BRIDGE_TOKEN` (secreto compartido, = `SHARED_TOKEN` del `.gs`) | `db52f16b62e5ada13150edc571c21b24010a582fe0ae18b4` |

> **TOKEN OBLIGATORIO EN CADA LLAMADA.** El Apps Script exige `k=$BRIDGE_TOKEN` en
> TODO GET y POST (lectura, `?totals=`, `?config=1`, `?w=add`, `?w=delete`, POST). Sin
> él responde `{"ok":false,"reason":"unauthorized"}`. Como las URLs ya traen `?`, el
> token va como **`&k=$BRIDGE_TOKEN`** al final de cada query (en la lectura desnuda y
> en POST, como `?k=$BRIDGE_TOKEN`). Debe ser idéntico a `SHARED_TOKEN` en
> `apps-script/bridge-writer.gs`. Define al inicio: `BRIDGE_TOKEN='db52f16b62e5ada13150edc571c21b24010a582fe0ae18b4'`.

(El `PARENT_ID` del Shared Drive y el viejo `plan-hugo-bridge.upload.json` ya NO se
usan: eran del flujo `create_file` + `?commit=` que fallaba en el Shared Drive.)

**Flujo de REGISTRO (rápido) en una línea:** clasificar con visión → armar la
entrada → **`curl` POST (o GET `?w=add`) a `BRIDGE_URL`** → el Apps Script lo aplica
al `FILE_ID`, dedup por contenido, poda lo viejo, barre duplicados y **responde los
totales del día**. Un solo paso, sin tocar Drive.

Forma del `delta` (lo que postea la skill):
```json
{ "op": "add", "section": "meals", "today": "2026-05-30", "entries": [ { ...entrada... } ] }
```
`section` ∈ `meals` | `weights` | `workouts` | `checks` | `water` | `lifts`. `entries` admite una o
varias (p. ej. dos workouts de una foto, o varias series de un mismo ejercicio en `lifts`). El Apps Script asigna el `id` y dedup por
contenido (ventana ~5 min), poda entradas con `date` de más de 10 días y actualiza
`updated_at` solo.

## Metas diarias (para el feedback de comida)

> **METAS CONGELADAS — fuente única.** Estos valores son fijos por decisión de Hugo
> (recomposición con fecha límite), NO se recalculan con Mifflin ni se ajustan a diario:

| Macro | Meta | Límite |
|-------|------|--------|
| Calorías | 2.000 kcal | máx 2.000 |
| Proteína | 190 g | mínimo innegociable |
| Carbohidratos | 200 g | máx 200 |
| Grasas | 67 g | — |
| Fibra | 30 g | mínimo |
| Agua | 3.675 ml | mínimo |
| Creatina | 5 g/día | — |

Proteína 190 g = piso innegociable (~2.1 g/kg de peso objetivo 90 kg): en déficit
marcado preserva masa magra y maximiza pérdida de grasa (Longland 2016). Grasa visceral
→ **prioridad #1**, marcador crítico. Penalizar carbos simples y grasa saturada.

> **Qué pasa con `config` / `?totals=` `targets`.** Para el feedback puedes leer
> `BRIDGE_URL?config=1&k=$BRIDGE_TOKEN` → `config.targets:{ kcalMax, proteinMin,
> carbsTarget, fatTarget, fiberTarget, waterTarget }`, pero **la tabla congelada manda
> sobre `config`**, no al revés. La app aún calcula su meta con Mifflin-St Jeor, así que
> `config` puede devolver números viejos (p. ej. 2.092 kcal / 200 g): si `config.targets`
> **difiere** de la tabla congelada, **usa la tabla congelada** y avísale a Hugo en una
> línea ("⚠️ el perfil de la app dice X, las metas congeladas son Y — conviene
> actualizar el perfil para que cuadren"). El objetivo es UNA sola verdad: cuando el
> perfil de la app se actualice a los valores congelados, `config` y la tabla coincidirán
> y desaparece el aviso. Los `targets` que vienen en el snapshot de `?totals=` se usan
> solo si **coinciden** con los congelados; si no, congelados.

### Distribución proteica intradía (Schoenfeld & Aragon 2018)

No basta el total: la proteína debe repartirse para maximizar síntesis muscular.

- **≥4 tomas proteicas al día**, cada una con **≥36 g** (0.4 g/kg/comida).
- **Sin brechas >5 h** entre tomas proteicas (idealmente 4-5 h).
- Al cerrar el día (o en "cómo voy hoy"), revisa las comidas con su `time` y proteína:
  si hay **<4 tomas de ≥36 g** o una **brecha >5 h** entre tomas, marca
  **"⚠️ Distribución subóptima"** AUNQUE el total diario de 200 g se cumpla, e indica
  la corrección concreta (adelantar/agregar una toma proteica).
- **En días de entrenamiento**, sugiere una **toma proteica pre-sueño de ~30-40 g**
  (caseína o proteína lenta) — Res 2013. Detecta entrenamiento por la sección
  `workouts` del día.

---

## Paso 0 — Clasificar la entrada

Antes de procesar, decide qué es:

- **Comida** → plato, alimento, etiqueta nutricional, o texto tipo "comí…".
  Toda comida se registra como una entrada en `meals` (ver Paso 3). **Asigna siempre
  el `mealSlot` correcto según la hora** (ver tabla): la app muestra cada comida
  DENTRO de su sección (Desayuno/Almuerzo/Colación/Cena/Antojo) con sus macros tal
  como los estimaste. Reserva `mealSlot: "extra"` solo para comida fuera de plan o no
  clasificable por hora.
- **Peso / composición** → captura de báscula o app de composición corporal
  (Withings, Speediance, etc.): peso, % grasa, músculo, IMC, etc. → sección `weights`.
- **Ejercicio** → captura de entrenamiento. → sección `workouts`.
  **AUTORIDAD DE KCAL = Apple Watch.** Cuando la misma sesión aparece en varios
  dispositivos (Apple Watch + Speediance + Concept2), las kcal NO se suman: es la misma
  actividad medida en paralelo. Registra UNA vez con las kcal del Watch (si hay "activas"
  y "totales" en el Watch, usa las TOTALES); descarta las kcal de Speediance/Concept2 para
  esa sesión. Solo registra entradas separadas cuando son actividades realmente distintas
  y NO solapadas en el tiempo (p. ej. bloque de fuerza en la mañana + bici de cierre
  después): ahí sí van dos workouts, cada uno con su dato de Watch.
  **Bloques DENTRO de la sesión de fuerza van fusionados, no como workout aparte:** remo
  aeróbico de calentamiento, caminatas de descanso entre series, "X55 / movimiento libre".
  Su quema ya está contenida en las kcal del Watch del bloque de fuerza.
  **Antes de escribir, resuelve los solapamientos con Hugo** (qué dato de kcal usar, si un
  bloque es parte de la fuerza o sesión aparte) y **verifica el bridge**
  (`?totals=` o GET `section=workouts&date=`) para no duplicar.
- **Agua / hidratación** → "registra X de agua", "tomé X vasos/botellas", "X ml de
  agua", "me tomé un litro", "anota un vaso de agua" → sección `water`. Convierte a
  **ml**: vaso ≈ 250 ml, botella ≈ 500 ml, litro/jarro = 1000 ml. Si la cantidad es
  ambigua, pregunta en una línea cuántos ml/vasos.

Si hay ambigüedad, pregunta en una línea.

> **Dedup automático.** Registra siempre la comida como entrada en `meals` (Paso 3)
> con el `mealSlot` correcto por hora (ver tabla más abajo). El servidor dedup por
> contenido (nombre + `mealSlot` + `date` + ventana de ~5 min), así que registrar el
> mismo plato dos veces, o que Hugo lo registre también en la app, NO lo duplica. El
> `mealSlot` ubica la comida en su sección del plan en la app.

---

## Paso 1 — Extraer datos con visión IA

### Comida
```
Eres nutricionista experto. Analiza esta comida. Responde SOLO JSON sin markdown ni backticks:
{
  "name": "nombre del plato",
  "kcal": número entero,
  "protein": gramos (número),
  "carbs": gramos (número),
  "fat": gramos (número),
  "fiber": gramos (número),
  "gi": "bajo|medio|alto",
  "sat_fat_warning": true|false,
  "notes": "observación clínica en 1 línea"
}
```
Con texto: inferir macros desde la descripción.

### Peso / composición

Speediance reparte los datos en **varias pantallas** (Componentes clave, Control del
peso, Grasa, Músculo, Componente, Análisis de segmentos, Circunferencia). Si Hugo manda
varias capturas, **combínalas en UN solo objeto**. Extrae **TODAS** las claves legibles
— no te limites a peso/grasa/músculo/visceral; la app guarda los ~30 parámetros.

```
Lee esta(s) captura(s) de báscula/composición corporal. Si hay varias, combina todo en
UN objeto. Responde SOLO JSON sin markdown. Incluye TODAS las claves legibles (omite las
que no aparezcan), valores numéricos sin unidades:
{
  "weightKg": número, "bodyFatPct": número, "score": número,
  "fatKg": número, "subcutaneousFatKg": número, "muscleKg": número,
  "skeletalMuscleKg": número, "fatFreeMassKg": número, "waterKg": número,
  "proteinKg": número, "boneKg": número,
  "musclePct": número, "waterPct": número, "proteinPct": número,
  "bmi": número, "ffmi": número, "metabolicAge": número, "visceralFat": número,
  "basalMetabolismKcal": número, "waistHipRatio": número, "referenceWeightKg": número,
  "bodyType": "Bajo peso|Normal|Sobrepeso|Obesidad",
  "neckCm": número, "chestCm": número, "waistCm": número, "hipCm": número,
  "bicepCm": número, "thighCm": número,
  "fatSegUpperL": "Bajo|Bien|Alto|Muy alto", "fatSegUpperR": "...", "fatSegTorso": "...",
  "fatSegLowerL": "...", "fatSegLowerR": "...",
  "muscleSegUpperL": "...", "muscleSegUpperR": "...", "muscleSegTorso": "...",
  "muscleSegLowerL": "...", "muscleSegLowerR": "...",
  "time": "HH:MM"
}
```

### Ejercicio
```
Lee esta captura de entrenamiento (Speediance u otra app). Si hay varios entrenamientos,
devuelve un array con uno por entrenamiento. Responde SOLO JSON sin markdown.

Cada entrenamiento, con los keys que apliquen (omite los que no aparezcan):
- name (nombre corto del entrenamiento)
- type ("strength" si es fuerza con pesos/máquinas; "cardio" si es bici/trote/remo/elíptica/caminata)
- kcal (calorías quemadas TOTALES, número. Si hay "activas" y "totales", usa las TOTALES)
- minutes (duración total en minutos, número entero)
- volumeKg (volumen total levantado en kg — solo fuerza)
- avgHr (FC promedio lpm/bpm), maxHr (FC máxima lpm/bpm) — donde aparezcan (fuerza o cardio)
- rpe (esfuerzo percibido 1-10, número) — si aparece o lo dijo Hugo
- hrZonePct (STRING "%Z1/%Z2/%Z3/%Z4/%Z5", ej. "86/12/1/0/0" = % del tiempo en cada zona de FC) —
  solo si la captura muestra la distribución porcentual por zona. NO lo confundas con minutos por zona.
- (SOLO cardio) activity (ej. "Bicicleta", "Trote"), distanceM (metros: "21.5 km"→21500),
  avgPowerW (vatios), avgCadenceRpm (rpm)
- lifts (SOLO si Hugo registra series ancla de fuerza set a set, p.ej. "sentadilla 3x5 @100kg" o una
  captura con el detalle por serie de un ejercicio ancla): array, UN objeto POR SERIE, con:
   - exercise (nombre del ejercicio ancla: "Sentadilla", "Peso muerto rumano", …)
   - setNumber (nº de serie: 1, 2, 3…), weightKg (decimal), reps (entero)
   - rpe (1-10) — null si no aparece
   - isPR (true si es récord personal, opcional), bilateralFlag (true si "fuerza bilateral desigual", opcional)
- exercises (SOLO si la captura lista los movimientos de UNA sesión de fuerza, no en resúmenes
  agregados): array EN ORDEN, un objeto por ejercicio con:
   - name (nombre tal cual aparece)
   - muscle (grupo principal en español, normalizado a UNO de: "pecho", "espalda", "piernas",
     "hombros", "brazos", "core", "glúteos", "cardio", "movilidad". INFIÉRELO del nombre:
     Squat/sentadilla/prensa/femoral→"piernas"; Crunch/abdominal/plancha/oblicuo→"core";
     tricep/bíceps/curl→"brazos"; press banca/pectoral/apertura→"pecho";
     remo/dominada/jalón→"espalda"; press militar/elevación lateral→"hombros";
     glúteo/hip thrust/puente→"glúteos"; estiramiento/movilidad/calentamiento→"movilidad")
   - sets (series de trabajo, entero) — null si no aparece
   - reps (reps por serie; "12/12" bilateral→12; rango→"8-12") — null si es por tiempo
   - weightKg (el "Peso máx" del ejercicio) — null si peso corporal o no aparece
   - volumeKg (el "Volumen total" del ejercicio) — null si no aparece
   - oneRepMaxKg (1RM estimado) — null si no aparece
   - quality (la "Puntuación del movimiento": "A"/"B"/"C"/"D") — null si no aparece

Reglas: valores numéricos sin unidades; null si no aparece (no inventes); "30.3K kg"→30300;
ejercicios de solo "Duración" (00:00:30) son "movilidad" (reps/weightKg null); si es CARDIO no
devuelvas "exercises" ni "volumeKg"; si solo ves totales (sin desglose por ejercicio), omite "exercises".

Ejemplo fuerza: { "name":"Pesas", "type":"strength", "kcal":297, "minutes":32, "volumeKg":8462,
  "avgHr":128, "maxHr":162, "rpe":8, "hrZonePct":"40/45/12/3/0",
  "exercises":[{"name":"Squat delantera","muscle":"piernas","sets":3,"reps":13,"weightKg":25,"volumeKg":1668,"oneRepMaxKg":33,"quality":"B"}],
  "lifts":[{"exercise":"Sentadilla","setNumber":1,"weightKg":100,"reps":5,"rpe":8,"isPR":true},
           {"exercise":"Sentadilla","setNumber":2,"weightKg":100,"reps":5,"rpe":8.5}] }
Ejemplo cardio: { "name":"Bicicleta", "type":"cardio", "activity":"Bicicleta", "kcal":629, "minutes":45,
  "distanceM":21534, "avgPowerW":173, "avgCadenceRpm":58, "avgHr":138, "maxHr":171, "hrZonePct":"10/35/40/13/2" }
```

---

## Paso 2 — NO bajes el bridge para registrar

Para registrar comida/peso/ejercicio **no leas el archivo**: el merge lo hace el
Apps Script. Salta directo al Paso 3 (armar el delta). Esto es lo que hace rápido
el registro.

Solo necesitas leer en dos casos puntuales (siempre por `curl` al `BRIDGE_URL`, nunca
por el conector de Drive ni por `web_fetch`):
- **"cómo voy" / "cómo voy hoy" / "resumen del día":** NO respondas con texto/tabla —
  **renderiza el dashboard HTML inline** (bloques A-E). Trae toda la data con el gatherer
  de la sección "Comando: cómo voy hoy → DASHBOARD HTML INTERACTIVO" más abajo (un solo
  `curl`-loop al `BRIDGE_URL`; el bridge hoy no exige token). La respuesta de `?totals=`
  trae `source:"app"` con el número real, o `source:"bridge"` si la app no sincronizó hoy.
- **Inspección manual:** `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` (el doGet ya devuelve el JSON del
  bridge vía auto-heal). No uses `download_file_content`/`read_file_content` del
  conector.

---

## Paso 3 — Armar la entrada de la sección correcta

Reglas comunes para TODA entrada:
- **`id`: NO lo mandes** (o mándalo y será ignorado). El servidor asigna el id y
  deduplica por contenido. Lo que importa para la ventana de dedup es el tiempo:
  manda `time` (`HH:MM`) o `ts` (ms).
- `date`: `YYYY-MM-DD` del registro (o de la captura si la muestra).
- `source`: `"skill-chat"`.
- `mealSlot` (solo comida): la toma del plan a la que pertenece. **Prefiere la toma que
  Hugo nombra** ("mi colación de la mañana", "el almuerzo", "la cena"); si no la nombra,
  dedúcela por la hora (ver tabla). La app usa las 5 tomas
  `desayuno|colacion1|almuerzo|colacion2|cena` (más `extra`) y muestra la comida dentro de
  esa sección. Puedes mandar `colacion` a secas: la app y el bridge la parten en
  `colacion1` (mañana) o `colacion2` (tarde) por la hora. Toda comida entra como entrada de
  `meals`; usa `extra` solo si es claramente fuera de plan.

**Comida** → push a `meals`:
```json
{
  "date": "2026-05-28", "time": "17:10", "mealSlot": "extra",
  "name": "Empanada de pino", "kcal": 290, "protein": 12,
  "carbs": 32, "fat": 13, "fiber": 2, "gi": "alto", "sat_fat_warning": true,
  "notes": "Carbo simple + grasa saturada", "source": "skill-chat"
}
```

**Peso** → push a `weights`. Empuja **TODAS** las claves que leíste en la(s) captura(s),
no solo estas cuatro — la app guarda los ~30 parámetros y el semáforo/evolución usan
grasa subcutánea, agua, proteína, IMC, FFMI, cintura-cadera, segmentos, etc. (ejemplo con
muchos campos; incluye solo los que de verdad aparezcan):
```json
{
  "date": "2026-05-28", "time": "07:00",
  "weightKg": 105.4, "bodyFatPct": 33.0, "fatKg": 34.8, "subcutaneousFatKg": 24.8,
  "muscleKg": 65.9, "skeletalMuscleKg": 40.6, "fatFreeMassKg": 70.7, "ffmi": 21.7,
  "waterKg": 51.8, "proteinKg": 14.1, "boneKg": 4.7, "visceralFat": 14,
  "bmi": 32.5, "basalMetabolismKcal": 1896, "waistHipRatio": 0.93,
  "referenceWeightKg": 71, "bodyType": "Obesidad",
  "source": "skill-chat"
}
```

**Ejercicio** → push a `workouts` (una entrada por entrenamiento). **Incluye TODOS los campos
que extrajiste** (`type`, `volumeKg`, `avgHr`, `maxHr`, `rpe`, `hrZonePct`, `exercises[]` en fuerza;
`distanceM`/`avgPowerW`/`avgCadenceRpm` en cardio): la app los necesita para el desglose por músculo,
la intensidad y la progresión de la pestaña Ejercicios. El servidor los preserva y, si una versión
simple ya estaba registrada, la versión con desglose la mejora. `hrZonePct` es STRING ("86/12/1/0/0").
```json
{ "date": "2026-05-28", "time": "07:30", "name": "Bicicleta fija", "type": "cardio", "activity": "Bicicleta",
  "kcal": 307, "minutes": 20, "distanceM": 9800, "avgPowerW": 165, "avgHr": 132, "maxHr": 168, "rpe": 6,
  "hrZonePct": "10/35/40/13/2", "source": "skill-chat" },
{ "date": "2026-05-28", "time": "08:05", "name": "Pesas", "type": "strength", "kcal": 319, "minutes": 35,
  "volumeKg": 8462, "avgHr": 124, "maxHr": 158, "rpe": 8, "source": "skill-chat",
  "exercises": [ { "name": "Squat delantera", "muscle": "piernas", "sets": 3, "reps": 13, "weightKg": 25, "volumeKg": 1668, "oneRepMaxKg": 33, "quality": "B" } ] }
```
> ⚠️ `exercises[]` es un array → **solo viaja por el POST del delta** (Paso 4.a), no por la URL `?w=add` (Paso 4.b).
> Para entrenamientos de fuerza con desglose usa siempre el POST del delta.

**Series de fuerza (lifts)** → push a `lifts` (UNA entrada POR SERIE de ejercicio ancla), cuando Hugo
registra el detalle set a set ("sentadilla 3x5 @100kg, la última fue PR"). El servidor deduplica por
`exercise`+`date`+`setNumber` (re-registrar una serie la corrige, no la duplica). Es independiente del
desglose `exercises[]` del workout: `lifts` es la progresión fina de los movimientos ancla.
```json
{ "section": "lifts", "entries": [
  { "date": "2026-05-28", "time": "08:10", "exercise": "Sentadilla", "setNumber": 1, "weightKg": 100, "reps": 5, "rpe": 8, "source": "skill-chat" },
  { "date": "2026-05-28", "time": "08:13", "exercise": "Sentadilla", "setNumber": 2, "weightKg": 100, "reps": 5, "rpe": 8.5 },
  { "date": "2026-05-28", "time": "08:16", "exercise": "Sentadilla", "setNumber": 3, "weightKg": 102.5, "reps": 5, "rpe": 9, "isPR": true } ] }
```
> Por la URL `?w=add` (Paso 4.b) registra UNA serie a la vez:
> `?w=add&section=lifts&date=2026-05-28&exercise=Sentadilla&setNumber=1&weightKg=100&reps=5&rpe=8&isPR=true`
> (codifica las barras de `hrZonePct` como `%2F` si lo mandas por URL). Para varias series de una, usa el POST del delta.

**Agua** → push a `water` (campo `ml`). Es **append-only**: el servidor SUMA cada
registro al agua del día (no dedup), así que registrar dos vasos seguidos suma los dos.
Convierte vasos/botellas a ml en el Paso 0 antes de armar la entrada.
```json
{ "date": "2026-05-28", "time": "17:10", "ml": 500, "source": "skill-chat" }
```

---

## Paso 4 — Registrar con `curl`/Bash al Apps Script (sin tocar Drive)

Registra por **Bash con `curl`** al `BRIDGE_URL`. **NO uses `web_fetch`** (bloquea la
URL del bridge por no venir de un search) ni el conector de Drive.

**Método preferido — POST del delta (una llamada, admite varias entradas):**
```bash
curl -sL --data '{"op":"add","section":"meals","today":"2026-05-30","entries":[
  {"date":"2026-05-30","time":"20:48","mealSlot":"extra","name":"Empanada de pino",
   "kcal":290,"protein":12,"carbs":32,"fat":13,"fiber":2,"gi":"alto",
   "sat_fat_warning":true,"source":"skill-chat"}
]}' "$BRIDGE_URL?k=$BRIDGE_TOKEN"
```
- **`--data` SIN `-X POST`** (el `/exec` responde con un 302 a
  `script.googleusercontent.com`; con `-X POST` reintenta el POST y da 405).
- **`-L` obligatorio** para seguir ese redirect y leer la respuesta.
- `section` ∈ `meals|weights|workouts|checks|water`. `entries` admite varias (p. ej. dos
  workouts de una foto). El servidor asigna el `id` y dedup por contenido.

**Alternativa — GET inline (`?w=add`, una entrada por llamada):**
```bash
curl -sL "$BRIDGE_URL?w=add&section=meals&date=2026-05-30&time=20:48\
&name=Empanada%20de%20pino&kcal=290&protein=12&carbs=32&fat=13&fiber=2\
&gi=alto&satfat=1&mealSlot=extra&notes=Carbo%20simple&k=$BRIDGE_TOKEN"
```
- **Percent-encodea** valores con espacios o acentos (`espacio→%20`, `é→%C3%A9`).
  Si un valor trae `&`, omítelo o cámbialo por `y` para no romper la URL.
- Campos por sección:
  - `meals`: `name,kcal,protein,carbs,fat,fiber,gi,satfat(0/1),mealSlot,time,notes`
  - `weights` (manda TODAS las legibles, no solo estas): `weightKg,bodyFatPct,fatKg,subcutaneousFatKg,muscleKg,skeletalMuscleKg,fatFreeMassKg,ffmi,waterKg,proteinKg,boneKg,visceralFat,bmi,basalMetabolismKcal,waistHipRatio,referenceWeightKg,bodyType,waistCm,hipCm,time` (el POST del delta es mejor que el GET para tantos campos)
  - `workouts`: cardio → `name,type,activity,kcal,minutes,distanceM,avgPowerW,avgCadenceRpm,avgHr,time`; fuerza → `name,type,kcal,minutes,volumeKg,time`. **El desglose `exercises[]` NO cabe por GET (es un array): para fuerza con desglose usa el POST del delta.** Una llamada por entrenamiento.
  - `water`: `ml` (+ `date`, opcional `time`). **Append-only: cada registro SUMA** al
    agua del día — nunca reemplaza ni se colapsa. Ej. "tomé 500 ml" → `?w=add&section=water&date=2026-06-05&ml=500&source=skill-chat`. El `waterMl` del día sale en la respuesta y en `?totals=`.
- También puedes mandar el delta entero por GET: `BRIDGE_URL?delta=<json url-encoded>&k=$BRIDGE_TOKEN`.

Cualquiera de los dos responde con los totales del día ya sumados:
```json
{ "ok": true, "added": 1, "today": "2026-05-30",
  "totals": { "kcal": 1234, "protein": 89, "carbs": 102, "fat": 45 },
  "workoutsKcal": 565 }
```
Usa esos `totals` para el Paso 5 (no los recalcules).
- Si la respuesta **no** trae `ok`/`totals` (p. ej. te devuelve el JSON completo del
  bridge), el endpoint no está desplegado: avísale a Hugo que **redespliegue el Apps
  Script** (`apps-script/bridge-writer.gs`). NO caigas a `create_file`.
- Si responde `{ "ok": false, ... }` o falla la red, reintenta la misma llamada una vez.
- `added: 0` no es error: significa que el servidor lo dedupó por contenido (ya estaba
  registrado, p. ej. Hugo lo ingresó en la app). Igual usa los `totals` devueltos.

> **Por qué así:** el bridge vive en la raíz de un Shared Drive con restricción de IA;
> el conector de Drive no puede leerlo ni escribirlo (`canAddChildren:false` +
> "ineligible for generative AI contexts"). `curl` al Apps Script saca al conector del
> camino: el merge, el dedup por contenido, la sobrescritura en sitio sobre el `FILE_ID`,
> la poda y la limpieza pasan server-side. Ver `apps-script/bridge-writer.gs`.

---

## Paso 4.b — Borrar un registro errado (limpiar desde el chat)

Si registraste algo mal (o Hugo pide borrarlo), elimínalo por `id`:
```bash
curl -sL "$BRIDGE_URL?w=delete&section=meals&id=<id>&k=$BRIDGE_TOKEN"
# → { "ok": true, "deleted": 1, "section": "meals", "id": "<id>" }
```
`section` ∈ `meals|weights|workouts|checks|water`. Para saber el `id`, lee primero el JSON
completo (`curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"`) y ubica la entrada por nombre/fecha. `deleted: 0`
significa que no había ninguna con ese id.

> **NUNCA corrijas con entradas de valor NEGATIVO.** Para anular/ajustar una comida o
> entrenamiento mal registrado, BORRA el id errado con `?w=delete` y re-registra el bueno.
> Registrar un `-305 kcal` para "netear" un duplicado deja las DOS entradas en el historial
> y rompe la conciliación con la app. El bridge además rechaza en el origen toda entrada
> `op:add` con algún nutriente negativo (ver `_hasNegativeNutrient` en el `.gs`), así que el
> neteo por negativo ni siquiera se aplica: la única vía de corrección es delete + re-add.
>
> **Antes de registrar una comida, LEE las `meals` del día** (`?totals=` o el JSON) y no
> re-registres lo que ya está. El dedup server-side solo colapsa si el nombre + `mealSlot` +
> fecha coinciden dentro de ~5 min; un mismo plato con nombre distinto y sin `mealSlot` SÍ se
> duplica (fue lo que pasó). Por eso el `mealSlot` correcto es obligatorio, no opcional: es lo
> que además deja a la app suprimir el doble conteo plan↔chat.

---

## Paso 5 — Responder en chat (resumen + feedback)

### Comida
```
✅ [nombre comida] registrado
~[kcal] kcal | P:[x]g | C:[x]g | G:[x]g

📊 HOY: [totals.kcal]/[meta kcal] kcal
   Proteína: [totals.protein]/[meta proteína]g  ████░░░░░░ 45%
   Restante: [meta kcal − totals.kcal] kcal

[alerta si corresponde]
```
Barra de 10 bloques. Los totales vienen **directos en la respuesta del registro**
(`totals.kcal`, `totals.protein`, …) — NO los recalcules ni vuelvas a bajar el
bridge. Si por alguna razón la respuesta no trajo `totals`, recién ahí
`curl -sL "$BRIDGE_URL?totals=<hoy>&k=$BRIDGE_TOKEN"`.

### Peso
```
⚖️ Peso registrado: [weightKg] kg[, % grasa X, músculo Y]
[comentario breve vs marcador de grasa visceral si aplica]
```

### Ejercicio
```
🔥 Registrado: [name] — [kcal] kcal, [minutes] min
[si hay varios: una línea por cada uno + total quemado del día]
```

### Agua
```
💧 Agua: +[ml registrados] ml → [waterMl total]/[meta waterTarget] ml hoy
```
Usa el `waterMl` que devuelve la respuesta del registro (o `?totals=`); no recalcules.

---

## Comando: "cómo voy hoy" → DASHBOARD HTML INTERACTIVO

> **Esta es la única respuesta correcta a "cómo voy".** Reemplaza la vieja tabla
> markdown (Consumido/Meta/Queda) + párrafo. Cuando Hugo diga **"cómo voy"**, **"cómo
> voy hoy"**, **"cuánto llevo"**, **"resumen del día"** o equivalente, **renderiza un
> dashboard HTML interactivo inline** (la herramienta de visualización inline, **NO un
> archivo**, NO `create_file`) con datos REALES del bridge, en bloques **A → B → C → D
> → E** en ese orden. El resto de la skill (registro de comida/peso/workouts/agua) NO
> cambia.

### Paso D1 — Traer TODA la data en una sola llamada

Corre este gatherer por Bash. Hace los curls al `BRIDGE_URL` (POR `curl`, nunca
`web_fetch` ni el conector de Drive) y emite **un solo JSON consolidado** que vas a
incrustar en el HTML. El bridge hoy **no exige token** (rama `token-desactivado`); por
eso las llamadas van sin `&k=`. Usa el campo `totals` del server tal cual, **NO
recalcules**.

```bash
python3 - <<'PY'
import subprocess, json, datetime
URL='https://script.google.com/macros/s/AKfycbwcxEoa0nvjhMv6nrdfMcaHKS130PcXV0isbc7ajNj_CMfuBXCR6RhL63LHv-e1zW9W_w/exec'
def get(params=None):
    cmd=['curl','-sL','-G',URL]
    for k,v in (params or {}).items(): cmd+=['--data-urlencode',f'{k}={v}']
    try: return json.loads(subprocess.run(cmd,capture_output=True,text=True,timeout=30).stdout)
    except Exception: return {}
now=datetime.datetime.now(); today=now.strftime('%Y-%m-%d')
full=get(); tot=get({'totals':today}); cfg=get({'config':'1'}).get('config',{})
def daystr(i): return (now-datetime.timedelta(days=i)).strftime('%Y-%m-%d')
meals=[m for m in full.get('meals',[]) if m.get('date')==today]
trend=[]
for i in range(6,-1,-1):
    d=daystr(i); t=get({'totals':d})
    trend.append({'date':d,'totals':t.get('totals',{}),'targets':t.get('targets',{})})
out={
 'now':now.strftime('%H:%M'),'today':today,'source':tot.get('source'),
 'totals':tot.get('totals',{}),'targets':tot.get('targets',{}),'remaining':tot.get('remaining',{}),
 'eaten':tot.get('eaten',[]),'workoutsKcal':tot.get('workoutsKcal'),
 'config':{'weightKg':cfg.get('weightKg'),'goal':cfg.get('goal')},
 'mealsToday':[{'time':m.get('time'),'mealSlot':m.get('mealSlot'),'name':m.get('name'),
               'protein':m.get('protein'),'kcal':m.get('kcal')} for m in meals],
 'workoutsRecent':[{'date':w.get('date'),'name':w.get('name'),'kcal':w.get('kcal'),'minutes':w.get('minutes')}
                   for w in full.get('workouts',[]) if w.get('date')>=daystr(3)],
 'weights':[{'date':w.get('date'),'weightKg':w.get('weightKg')} for w in full.get('weights',[])[-14:]],
 'trend':trend,
}
print(json.dumps(out,ensure_ascii=False))
PY
```

El objeto resultante trae todo lo que necesitan los 5 bloques. Notas de la data real
(no asumir limpia):
- **`source`**: `"app"`/`"app+meals"` = el número real de la app (kcal **brutas
  comidas**, NO neto de ejercicio: las kcal de entreno nunca se restan del presupuesto —
  el déficit ya vive en la meta congelada de 2.000 kcal); `"bridge"` = la app no
  sincronizó hoy → es parcial, avísale a Hugo en el texto del chat ("abre la app un
  segundo para el total completo"). Renderiza el dashboard igual con lo que haya.
- **`targets` cambia por día.** En el Bloque E usa los `targets` que devuelve CADA día
  en `trend[].targets` (no los de hoy para todos). Si un día no trae `targets`, usa los
  de hoy como respaldo.
- **`mealsToday[].time` suele venir `null`** (las comidas registradas por la app no
  guardan hora). Para el Bloque D, si falta `time`, **infiere desde `mealSlot`**:
  desayuno→08:00, colacion1→11:00, almuerzo→13:30, colacion2→18:00, cena→20:30, extra→hora
  actual. Menciona en el texto del chat que las horas sin registro son aproximadas.
- **Limpia `mealsToday` antes del Bloque D:** descarta entradas de prueba/basura (p. ej.
  `name` tipo `TEST_…`) y **colapsa duplicados exactos** (mismo `name` + `protein`) — el
  bridge a veces deja la misma comida dos veces. El % y los totales de los Bloques A/C
  vienen del server (`totals`), que ya está reconciliado: NO los recalcules desde
  `mealsToday`.

### Paso D2 — Renderizar el dashboard inline

Genera un documento HTML inline (mobile ~380px). Incrusta los números reales del JSON
del Paso D1 (redondea todo número mostrado). Restricciones heredadas del sistema de
visualización inline, **obligatorias**:

- Máx 2 columnas. **Sin emojis. Sin gradientes ni sombras. Sentence case.**
- Sin `localStorage`. Sin `position:fixed`. Colores por **CSS variables** salvo los hex
  de las series del gráfico (Bloque E) y de las barras (Bloque C).
- **El texto explicativo va FUERA del widget** (en tu respuesta de chat), no dentro del
  HTML. El widget muestra cifras y visuales; el "por qué" y la recomendación larga van
  en el chat.

#### Bloque A — 3 anillos (kcal in, proteína, agua)
Tres anillos de progreso (% sobre meta), lado a lado. Bajo cada uno: valor absoluto +
etiqueta en sentence case.
- **Kcal in**: `totals.kcalIn / targets.kcalMax`. (Usa `kcalIn`, el bruto comido, NO el
  neto `kcal`.)
- **Proteína**: `totals.protein / targets.proteinMin`. **Puede pasar 100%** (no la
  topes; muestra p. ej. 126%).
- **Agua**: `totals.waterMl / targets.waterTarget`.

#### Bloque B — recomendación viva (tarjeta de estado + pregunta de entrenamiento)
Tarjeta con una recomendación CONCISA (el "por qué" detallado va en el chat). Evalúa la
lógica EN ESTE ORDEN con `now` (hora actual del Paso D1):
1. **`protein < proteinMin`** → EMPUJAR proteína. Di cuántos g faltan
   (`proteinMin − protein`) y sugiere un formato concreto del historial de Hugo: whey,
   yogurt Colun/griego, charqui, mousse proteica, barra Quest. **Nunca** nueces/almendras.
2. **`protein ≥ proteinMin` Y `kcalIn < kcalMax` Y `hora < 21:00`** → hay margen; si hay
   un hueco proteico abierto (ver Bloque D) sugiere una toma; si no, "vas bien".
3. **`protein ≥ proteinMin` Y (`kcalIn ≥ kcalMax−150` O `hora ≥ 21:00`)** → "no
   necesitas comer más". Cierra con agua si `waterMl < waterTarget`.
- **Regla transversal:** nunca recomendar restringir más. El riesgo primario de Hugo es
  **subingesta diurna** (patrón salteo de día + atracón de noche), no sobreingesta.

**Pregunta de entrenamiento — SOLO de noche (`hora ≥ 20:00`):**
- Antes de las 20:00 **no la muestres**; la recomendación de comida usa el default
  conservador (sin excepción pre-sueño).
- A las ≥20:00 muestra dos botones vía **`sendPrompt`**: "Entreno mañana" /
  "Descanso mañana".
- Mientras Hugo no responda: recomendación de comida **sin** excepción pre-sueño (no
  empujar comida nocturna).
- (La recomendación según la respuesta se entrega en el Bloque B-bis, en el turno
  siguiente cuando Hugo toque un botón.)

#### Bloque C — barras de macros (carbos, grasas, fibra)
Tres barras valor/meta + progreso:
- Carbos `totals.carbs / targets.carbsTarget` — **#7F77DD** (morado).
- Grasas `totals.fat / targets.fatTarget` — **#D85A30** (naranja).
- Fibra `totals.fiber / targets.fiberTarget` — **#1D9E75** (teal).

#### Bloque D — timeline proteico del día
Strip horizontal (eje horas, p. ej. 06:00→24:00). Un punto por cada comida de
`mealsToday` con `protein > 0`, posicionado por su `time` (o el inferido del `mealSlot`,
ver Paso D1). Sobre/junto al punto, los g de proteína.
- **Marca EN ROJO** todo hueco **> 5 h** (umbral FIJO) entre dos tomas proteicas
  consecutivas, y el hueco entre la última toma y `now` si ya supera 5 h.
- Si **dos tomas caen en la misma hora** (típico cuando varias se infieren del mismo
  `mealSlot`), súmalas en un punto (g totales) o sepáralas ~30 min para que las etiquetas
  no se encimen.
- Respaldo: Schoenfeld & Aragon 2018 (≥4 tomas, máx 4-5 h entre ingestas).

#### Bloque E — tendencia 7 días (% de meta), interactiva con Chart.js
Gráfico de líneas con **Chart.js desde cdnjs** (UMD global, p. ej.
`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`). Datos del
array `trend` del Paso D1 (**NO hardcodear**). Cada punto = **% de la serie contra su
meta de ESE día** (`trend[i].totals.X / trend[i].targets.Y * 100`):
- Kcal: `kcalIn / kcalMax` — **#E24B4A**
- Proteína: `protein / proteinMin` — **#1D9E75**
- Carbos: `carbs / carbsTarget` — **#7F77DD**
- Grasas: `fat / fatTarget` — **#BA7517**
- Fibra: `fiber / fiberTarget` — **#0F6E56**
- Peso: de `weights[]` (el peso de cada fecha; interpola/omite días sin pesaje) como **%
  vs objetivo 90 kg** → **#444441**, **línea punteada**.

Reglas del gráfico (ya validadas con Hugo):
- **Leyenda = botones TOGGLE de selección MÚLTIPLE acumulativa** (no exclusiva): cada
  toque muestra/oculta SU serie sin afectar las demás. Activas con fondo relleno,
  apagadas atenuadas.
- **Línea horizontal de meta 100% EN ROJO `#E24B4A`, gruesa (2px), punteada**, dibujada
  SOBRE la grilla con un **plugin `afterDraw`**, con etiqueta **"meta 100%"** a la derecha.
- Canvas con **`role="img"` + `aria-label`** descriptivo. Redondea todo número.

> **Lo que NO va aquí** (es otra pantalla, el check-in semanal del lunes): visceral +
> cintura con tendencia, y proyección al objetivo 90 kg (tasa real 0.5-0.7%/sem → fecha
> estimada). NO lo metas en el dashboard diario.

### Bloque B-bis — recomendación según la respuesta de entrenamiento (turno siguiente)
Cuando Hugo responda **"Entreno mañana"** o **"Descanso mañana"** (botón del Bloque B u
hora ≥20:00), entrega SIEMPRE una recomendación (entrene o no), en el texto del chat,
usando `workoutsRecent` para no repetir estímulo:

- **Comida pre-sueño:** si **ENTRENA** mañana → permite UNA toma proteica pre-sueño
  (~30-40 g sólida/caseína/yogurt), Res 2013. Si **DESCANSA** → mantén "no comer más",
  cierra con agua si falta.
- **Si ENTRENA — qué entrenar** con los implementos de Hugo y su carga reciente
  (`workoutsRecent`; no repetir el mismo estímulo dos días seguidos):
  - Implementos: Speediance Monster (fuerza + remo), trotadora interior Speediance,
    bici estática, trote exterior.
  - Principios: **remo = mayor quema + bajo impacto** (preferido); **bici estática = zona
    2 principal** (30-40 min); **trote DEPRIORIZADO** al peso ~105 kg (preferir trotadora
    interior sobre trote exterior). **Palanca principal = extender DURACIÓN del cardio,
    no agregar días.** Para cardio prolongado sugiere **combos mixtos** que repartan
    impacto (p. ej. 20 min trotadora + 20 min remo, o bici z2 + remo). Si el último
    workout fue fuerza → sugiere cardio; si fue cardio → fuerza o combo.
- **Si DESCANSA — igual da algo útil:** recuperación (cerrar `waterTarget`; toma proteica
  pre-sueño opcional para no abrir hueco >5 h de noche). Si hay días acumulados sin
  cardio en `workoutsRecent`, nótalo suave, sin presionar. Mensaje de fondo: el descanso
  es parte del plan; el objetivo de mañana es **no subingerir de día**, no entrenar a la
  fuerza.

### Respaldo si no hay render inline disponible
Si el entorno no puede renderizar HTML inline, cae a un resumen de texto compacto con los
mismos números (`totals` vs `targets`, `remaining`, distribución proteica) — pero el
camino normal y preferido es el dashboard.

---

## Recetar comida — "qué como" / "qué me falta" / "qué ceno"

Cuando Hugo pregunta **qué comer** (no registrar): "qué como ahora", "qué ceno", "qué me
falta", "qué colación llevo", "dame algo de mi arsenal", o cuando en "cómo voy" quede
proteína/kcal por cerrar y haga sentido proponer. Esto **prescribe**, no registra.

Lógica:
1. Trae los totales del día (`?totals=`) y, con las metas congeladas, calcula lo que
   **falta**: `kcalFalta = 2000 − kcalIn`, `protFalta = 190 − protein`, idem carbos/grasa/fibra.
2. Mira la hora (`now`) y la toma que toca (tabla de slots) o la que Hugo nombre.
3. Propón **2-3 opciones del arsenal** que cierren el hueco, priorizando EN ESTE ORDEN:
   - **Proteína primero** si `protFalta > 20 g` (piso innegociable de 190 g).
   - **Caber sin pasar 2000**, dejando preferible **200-400 kcal de colchón** (no rellenar
     al ras: el riesgo de Hugo es subingerir de día y atracar de noche, no pasarse).
   - **No repetir** lo que ya comió hoy ni la toma anterior.
   - Toma correcta: colaciones → preferir `portable`/`sin-refrigeración`.
   - Reglas de la semana: **máx 3 dulces/sem, máx 1 delivery/sem, sin extras pasando 2000**.
4. Cada opción: **nombre + (kcal / P) + 1 línea de por qué cuadra**. Tuteo chileno, sin relleno.
5. Si ya cerró proteína y queda poco margen y es tarde (`≥21:00`): no empujes comida —
   sugiere agua si falta y listo.

**Restricciones DURAS (nunca las rompas):**
- **JAMÁS nueces / almendras / frutos secos.**
- **Yogur griego siempre mezclado** (berries / whey / chía), nunca "solo".
- No repetir el mismo alimento en el día.
- El ejercicio **NO abre margen** para comer más.

### Arsenal de referencia (staples de Hugo)

> Snapshot del banco (fuente viva = pestaña **Banco** de la app / `src/seed.mjs`). Macros por
> porción: **kcal · P · C · G** (g). Úsalo para componer; si Hugo nombra algo que no está, estímalo.

**Colaciones / proteína portable** (desayuno, colacion1, colacion2):
| Alimento | kcal | P | C | G |
|----------|------|---|---|---|
| ISO 100 whey (1 scoop) | 110 | 25 | 2 | 1 |
| Yogur griego 0% 200g + frambuesa + whey + chía | 250 | 35 | 20 | 5 |
| Charqui 40g | 130 | 25 | 2 | 3 |
| Colún Protein (botella) | 160 | 18 | 18 | 2 |
| Loncoleche/Yogurt Protein Colún | 100-160 | 11-18 | 12-20 | 1-3 |
| Atún en lata solo / + 4 galletas de arroz | 120 / 280 | 26 / 25 | 0 / 30 | 1 / 6 |
| 2 huevos duros (+ 1 yogurt Colún) | 180 / 270 | 13 / 24 | 1 / 10 | 12 / 14 |
| 100g pavo en láminas + 1 fruta | 230 | 22 | 22 | 4 |
| Quesillo/Requesón 100-150g + galletas/fruta | 185-190 | 14-20 | 18-20 | 4-6 |
| Avena 60g + scoop proteína | 350 | 32 | 42 | 6 |
| Batido proteína + leche descremada + plátano | 280 | 32 | 30 | 4 |
| 4 claras revueltas + champiñón | 95 | 15 | 2 | 2 |
| Quest Bar | 200 | 21 | 22 | 8 |

**Almuerzos / cenas (recetas completas):**
| Plato | Ocasión | kcal | P | C | G |
|-------|---------|------|---|---|---|
| Pollo 150g + arroz integral + ensalada | almuerzo | 505 | 43 | 48 | 12 |
| Posta 120g + puré de coliflor + verduras | almuerzo | 330 | 36 | 18 | 13 |
| Lentejas guisadas + carne molida magra | almuerzo | 380 | 36 | 42 | 9 |
| Salmón 150g + quinoa + brócoli | cena | 550 | 43 | 40 | 22 |
| Merluza 180g al horno + papas + ensalada | cena | 320 | 37 | 30 | 6 |
| Pavo molido 140g + zapallo italiano + arroz | cena | 420 | 36 | 45 | 8 |
| (proteína sola: pollo/salmón/posta/atún 2 latas) | cena | 240-280 | 32-52 | 0 | 2-16 |

**Postres (almuerzo/cena, ojo regla de 3 dulces/sem):**
| Postre | kcal | P | C | G |
|--------|------|---|---|---|
| Jalea protein / Brownie proteico casero | 60 / 118 | 10 / 11 | 4 / 8 | 0 / 5 |
| Fruta (manzana/pera/plátano/uvas/berries) | 65-105 | 0-2 | 15-27 | 0-1 |
| Yogurt Colún light / Gelatina light | 70 / 10 | 6 / 1 | 9 / 0 | 1 / 0 |
| Chocolate amargo 70% (20g) | 120 | 1 | 9 | 8 |
| Helado bajo cal (1 bola) | 90 | 3 | 14 | 2 |

---

## Check-in semanal (lunes) — tasa de pérdida + pacing a la meta + recomposición

El criterio de progreso ya **no es el déficit calórico fijo** sino la **tasa de pérdida
semanal** expresada como % del peso corporal/semana (Garthe 2011), **leída contra la
meta-fecha** y **vigilando que no se pierda músculo** (esto es recomposición, no solo
adelgazar).

> **META CENTRAL (constante del proyecto):** llegar a **90.0 kg el 27-nov-2026**,
> bajando grasa visceral de índice 15 → **<10** y preservando masa muscular esquelética
> (base ~40 kg). Peso de partida de referencia ~102–105 kg, grasa corporal 33.5% → 22–24%.

En el check-in del lunes (o si Hugo pregunta "cómo voy esta semana", "cómo viene el peso"):

1. Lee los pesos: `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` → sección `weights`.
2. Calcula el **peso promedio de esta semana vs el de la semana anterior** (promedia los
   registros de cada semana lunes-domingo para suavizar el ruido diario).
3. Exprésalo como **Δ% = (pesoPrevProm − pesoActProm) / pesoPrevProm × 100** (positivo = pérdida).

### A — Tasa semanal (Garthe)

| Tasa | Lectura | Acción |
|------|---------|--------|
| **0.5-0.7 %/sem** (~0.55-0.75 kg) | Ritmo óptimo: preserva/aumenta masa magra | Mantener |
| **>0.8 %/sem** | ⚠️ Pérdida demasiado rápida, riesgo de masa magra | Sugerir **subir ~100-150 kcal** |
| **<0.4 %/sem por 2 semanas** | Pérdida estancada | Sugerir **extender la duración del cardio** (NO agregar días ni recortar más calorías) |

Base: Garthe 2011 — 0.7 %/sem preserva/aumenta LBM; 1.4 %/sem la deja plana con igual
pérdida de grasa. **Ignora el TDEE dinámico si hay <14 días de data.**

### B — Pacing a la meta-fecha (¿llegas a 90 kg el 27-nov-2026?)

No basta con "bajas a buen ritmo": hay que saber si ese ritmo **alcanza para la fecha**.
Deriva hoy con `TZ=America/Santiago date +%F` y calcula:

- **`semanasRestantes`** = días entre hoy y 2026-11-27, ÷ 7.
- **`kgFaltantes`** = pesoActProm − 90.0.
- **`ritmoRequerido` (kg/sem)** = `kgFaltantes / semanasRestantes`; pásalo a %/sem
  dividiendo por pesoActProm × 100.
- **`ETAproyectada`** = hoy + (`kgFaltantes / ritmoRealKgSem`) semanas, usando el ritmo
  real de las últimas ~3-4 semanas (no el de una sola, muy ruidoso).

Lectura:
- Si **`ritmoReal ≥ ritmoRequerido`** → "vas en fecha o adelantado" (di la ETA). Si además
  el ritmo real supera 0.8 %/sem, prioriza la regla de Garthe (bajar ritmo) sobre apurar:
  **no se sacrifica músculo por llegar antes**.
- Si **`ritmoReal < ritmoRequerido`** pero dentro de la banda 0.5-0.7 % → "vas bien de
  salud pero **apretado de fecha**"; la palanca es **extender duración del cardio (Día 3
  Z2 primero)**, NO recortar más kcal (las metas están congeladas).
- Si **`ritmoReal` te deja ETA después del 27-nov** → dilo sin adornos, con cuántas
  semanas de atraso, y la corrección concreta.

> Referencia (recalcula siempre con datos reales): de ~103 → 90 kg en ~22 semanas ≈
> **0.59 kg/sem (~0.57 %/sem)** — cae justo en la banda Garthe, o sea el plan llega
> *ajustado*, sin colchón. Cualquier semana <0.4 % hay que recuperarla con cardio, no
> con hambre.

### C — Lente de recomposición (que el peso que baja sea grasa, no músculo)

Bajar peso "perfecto" perdiendo músculo es un fracaso de recomposición. Con la sección
`weights` (campos `skeletalMuscleKg`, `fatFreeMassKg`, `ffmi`, `bodyFatPct`):

- **Masa muscular esquelética** (base ~40 kg): compara el último valor vs el de hace
  ~2-4 semanas. Si **baja > ~0.5 kg sostenido mientras bajas peso → 🔴 bandera roja**,
  aunque la tasa de peso sea "óptima": señal de que falta proteína/estímulo de fuerza, no
  de que sobra comida. Acción: revisar adherencia a proteína (190 g y distribución) y a
  los anclas de fuerza — **nunca** recortar kcal como respuesta.
- **FFMI / masa libre de grasa**: debe mantenerse o subir levemente. Si cae junto al peso,
  refuerza el diagnóstico de pérdida de magra.
- **% grasa**: en recomposición correcta **baja más rápido que el peso** (pierdes grasa,
  retienes magra). Si el peso baja pero el % grasa no se mueve, es señal de pérdida de
  magra → mismo aviso.

La **grasa visceral sigue siendo la prioridad #1**; su tendencia detallada va en el
**check de composición cada 4 días** (sección siguiente), no aquí.

---

## Check de composición completa (cada 4 días) — grasa visceral al frente

Distinto del check-in semanal de peso: cada **4 días** Hugo hace un escaneo Speediance
completo (no solo peso). Aquí el foco es la **trayectoria de composición**, con la
**grasa visceral como marcador #1** (índice 15 → objetivo **<10**).

**Cuándo:** cuando Hugo mande una captura de composición completa (varias pantallas
Speediance), o pida "check de composición", "cómo va la composición", "cómo va la
visceral", o hayan pasado ~4 días desde el último escaneo completo (si lo notas, ofrécelo
en una línea: "van 4 días, ¿hacemos el check de composición?").

**Cómo:**
1. Registra el peso/composición como siempre (Paso 3 → `weights`, **todas** las claves
   legibles).
2. Lee el histórico: `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` → `weights`, y toma los
   escaneos con `visceralFat` presente (los completos).
3. Reporta cada marcador **con su tendencia vs el escaneo anterior, vs basal y vs target**:

| Marcador | Basal | Objetivo | Qué mostrar |
|----------|-------|----------|-------------|
| **Grasa visceral (índice)** | 15 | **<10** | valor actual + Δ vs anterior + cuánto falta a <10. **Es el #1, va primero, siempre.** |
| % grasa corporal | 33.5% | 22–24% | valor + Δ + tramo restante |
| Masa muscular esquelética | ~40 kg | preservar/subir | valor + Δ; si baja → 🔴 (ver lente de recomposición) |
| Cintura (waistCm) | — | ↓ sostenido | valor + Δ; proxy directo de visceral |
| Peso | ~102–105 | 90.0 | valor + Δ; cruza con el pacing del check-in semanal |
| FFMI | — | mantener/↑ | valor + Δ |

4. **Lectura honesta, sin consuelo:**
   - Si la **visceral baja** → refuérzalo, es la métrica que más importa.
   - Si la visceral **se estanca o sube** mientras el peso baja → 🔴 prioridad: revisar
     carbos simples / grasa saturada / alcohol y, sobre todo, **el cardio Zona 2 (Día 3)**,
     que es la palanca #1 contra visceral. NO recortar kcal (congeladas).
   - Si **peso baja pero músculo también** → bandera de recomposición (mismo criterio que
     la sección anterior).
5. Cierra con **una** acción concreta para los próximos 4 días (no una lista).

> La visceral y la cintura con tendencia, y la proyección a 90 kg, **viven acá** (y en el
> check-in semanal), **no** en el dashboard diario "cómo voy hoy" — ese es solo del día.

---

## Categoría de comida según hora

Misma regla que `slotByTime()` en la app (`app.jsx`) y `_slotByTime()` en el `.gs`, para
que chat, bridge y app coincidan siempre:

| Hora | mealSlot |
|------|----------|
| antes de 10:30 | desayuno |
| 10:30–12:29 | colacion1 |
| 12:30–15:29 | almuerzo |
| 15:30–19:29 | colacion2 |
| 19:30 en adelante | cena |

Ya **no existe** `antojo` como sección: lo de muy tarde se pliega a la cena. **Si Hugo
nombra la toma, esa manda sobre el reloj** (una colación que comió a las 12:40 sigue
siendo `colacion1` si él la llama "colación de la mañana").

(La app despliega cada `mealSlot` del plan —desayuno/colacion1/almuerzo/colacion2/cena—
DENTRO de su sección, con "📝 Registrado" y los macros que estimaste. Solo lo claramente
fuera de plan va a `extra` → "EXTRAS DEL DÍA".)

---

## Alertas automáticas (comida)

- `protein < 50% de 190 g` → "⚠️ Proteína crítica — necesitas Xg más"
- `kcal > 2000` → "🔴 Techo calórico superado"
- `hora > 20:00 y protein < 80% de 190 g` → "Cierra el día con proteína: yogur griego, claras, whey"
- **Distribución:** `<4 tomas de ≥36 g` o `brecha >5 h entre tomas` → "⚠️ Distribución
  subóptima — reparte la proteína en ≥4 tomas de ≥36 g" (aunque el total se cumpla).
- **Día con `workouts`:** si no hay toma proteica después de las 21:00 → "Suma una toma
  pre-sueño de 30-40 g (caseína/proteína lenta)".
- `sat_fat_warning: true` → recordar grasa visceral (prioridad #1)
- `gi: "alto"` → mencionar impacto en insulinoresistencia visceral

---

## Reglas de feedback

- Nunca dar consuelo. Dar corrección concreta.
- Si se pasó en calorías: indicar qué omitir en la próxima comida.
- Si falta proteína: indicar fuente concreta (no genérico).

---

## Análisis y scoring de entrenamientos (Speediance)

Cuando Hugo sube capturas de un entreno y pide analizar/evaluar (no solo registrar):

> **Principios del Pilar 2 (corrigen los errores de junio 2026, aplícalos al evaluar):**
> - **Progresión, no variedad.** El objetivo es subir carga/reps en los **ejercicios
>   ancla**, no cambiar de ejercicios cada semana. Rotar movimientos sin progresar = error.
> - **Sesiones de fuerza de 45–55 min** (ni exprés ni eternas).
> - **Tren inferior prioritario** (piernas/glúteos venían sub-trabajados).
> - **Día 3 (Cardio Zona 2 puro) es intocable**: es la palanca #1 contra grasa visceral.
>   Saltarlo es el desvío más caro de la semana.
> - 5 días/semana con progresión doble sistemática.

1. **Lee `Rutina_Speediance_Hugo.docx` en `/mnt/project/` PRIMERO** e identifica qué día
   de la rutina corresponde según la fecha (Día 1 Pierna / Día 2 Empuje / Día 3 Cardio Z2 /
   Día 4 Tracción / Día 5 Pierna-Full).
2. **Nunca pre-califiques** antes de confirmar los detalles reales de la sesión con Hugo.
3. **Nota numérica 0-10** por sesión y por día completo, con feedback crítico honesto, sin
   consuelo. Evalúa contra la rutina del proyecto:
   - **Progresión doble en los anclas (lo que más pesa en la nota):** compara las cargas
     de los ejercicios ancla vs la(s) sesión(es) previa(s) del mismo día (usa `lifts` y/o
     `workouts.exercises[]` del historial: `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"`). Subir
     carga manteniendo reps, o subir reps a igual carga = **bien**; mismas cargas semana a
     semana = **estancado, bájale la nota**; cambiar de ejercicio en vez de progresar =
     **error de "variedad sobre progresión", señálalo explícito**. Marca `isPR` en los
     `lifts` de los anclas cuando corresponda.
   - **Tren inferior:** verifica que piernas/glúteos reciban su volumen; si la sesión
     debía ser de pierna y quedó corta o liviana, márcalo (es el grupo que venía flojo).
   - **Duración 45–55 min:** marca como desvío si la fuerza quedó muy por debajo (<40) o
     muy por encima (>60).
   - Marca **desvíos** de las cargas/series del archivo y **problemas de ejecución**.
4. **Adherencia semanal (al cerrar la semana o si lo piden):** revisa los `workouts` de los
   últimos 7 días y verifica **5 sesiones** y, sobre todo, **que el Día 3 (Cardio Z2) se
   haya hecho** — si falta, es el aviso #1. Aporta el **volumen por grupo muscular** (suma
   `exercises[].volumeKg` por `muscle`) y avisa si **piernas/glúteos** quedaron bajo cuota
   frente a tren superior.
5. **Alertas del Speediance** ("Fuerza bilateral desigual", "Mantenga su nivel máximo"):
   trátalas como banderas a vigilar, pero **descártalas si Hugo las explica por armado mal
   configurado del ejercicio** (no es asimetría real).
6. **"Tasa de finalización" del Speediance** puede venir inflada o baja por ejercicios mal
   configurados (p. ej. fila alterna con rondas de más). Confía en lo que Hugo confirma
   sobre la completitud real, no en el % de la app.
7. **Cardio de cierre en días de fuerza:** márcalo como desvío si la FC supera Z2 cómodo.
   Debe ser enfriamiento real (~120-125 bpm), no Z2 alto rozando 135+. (Esto es el cardio
   de cierre, NO reemplaza el Día 3 de Z2 puro.)
8. Al cerrar, **recuerda siempre que las kcal de entreno NO se suman como margen comible**:
   el déficit ya vive en la meta congelada de 2.000 kcal.

**Registro tras el análisis:** máximo un workout de fuerza + un workout de cardio de cierre
(con la regla de dedup de kcal del Paso 0), más los `lifts` ancla con `isPR` cuando aplique.
Deriva la fecha con `TZ=America/Santiago date +%F`. El POST devuelve HTML "Page Not Found"
aunque el write sea exitoso — verifica con un GET posterior, nunca reintentes por ese error
(causa duplicados).
