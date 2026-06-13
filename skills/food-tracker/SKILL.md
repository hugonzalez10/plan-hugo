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
  ejercicio", "registra X de agua", "tomé X vasos", "anota un vaso de agua",
  "me tomé una botella/un litro", o cualquier variación de registro de comida,
  peso, actividad o agua/hidratación.
  También activar con "cómo voy hoy", "cuánto llevo", "resumen del día".
---

# Food Tracker — Plan Hugo

La skill hace TODO el trabajo con IA. La app solo lee el JSON desde Drive y lo
mergea a su estado local. **Un solo archivo en Drive: `plan-hugo-bridge.json`**
con cinco secciones (`meals`, `weights`, `workouts`, `checks`, `water`).

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
`section` ∈ `meals` | `weights` | `workouts` | `checks` | `water`. `entries` admite una o
varias (p. ej. dos workouts de una foto). El Apps Script asigna el `id` y dedup por
contenido (ventana ~5 min), poda entradas con `date` de más de 10 días y actualiza
`updated_at` solo.

## Metas diarias (para el feedback de comida)

> **La meta diaria es PROGRAMABLE, no la hardcodees.** La app calcula la meta con
> Mifflin-St Jeor (TMB × factor de actividad − déficit) desde el perfil de Hugo y la
> empuja al bridge. Para el feedback, **lee la meta real**: GET `BRIDGE_URL?config=1&k=$BRIDGE_TOKEN`
> → `{ ok, config:{ kcalTarget, kcalDeficit, goal, weightKg, …, targets:{ kcalMax,
> proteinMin, carbsTarget, fatTarget, fiberTarget, waterTarget, bmr, tdee } } }`.
> Usa `config.targets` para los objetivos (`kcalMax` = meta de calorías,
> `proteinMin`, etc.). El comando "cómo voy hoy" (`?totals=`) ya trae `targets`
> propios cuando hay snapshot del día — esos mandan.

Si el bridge aún no tiene `config` (perfil sin sincronizar), usa estos valores de
respaldo:

| Macro | Meta | Límite |
|-------|------|--------|
| Calorías | 2.092 kcal | máx 2.092 |
| Proteína | 200 g | mínimo innegociable |
| Carbohidratos | 209 g | máx 220 |
| Grasas | 70 g | — |
| Fibra | 30 g | mínimo |
| Agua | 3.675 ml | mínimo |
| Creatina | 5 g/día | — |

Proteína 200 g = piso innegociable (~2.2-2.4 g/kg de peso objetivo 90 kg): en déficit
marcado preserva masa magra y maximiza pérdida de grasa (Longland 2016). Grasa visceral
índice 15 → **prioridad #1**, marcador crítico. Penalizar carbos simples y grasa saturada.

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
- **Ejercicio** → captura de entrenamiento (Apple Fitness, Strava, anillos):
  duración, kcal, FC. → sección `workouts`. **Si una sola foto trae varios
  entrenamientos (p.ej. bici + fuerza), registra UNA entrada por cada uno.**
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
- (SOLO cardio) activity (ej. "Bicicleta", "Trote"), distanceM (metros: "21.5 km"→21500),
  avgPowerW (vatios), avgCadenceRpm (rpm), avgHr (lpm/bpm)
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
  "exercises":[{"name":"Squat delantera","muscle":"piernas","sets":3,"reps":13,"weightKg":25,"volumeKg":1668,"oneRepMaxKg":33,"quality":"B"}] }
Ejemplo cardio: { "name":"Bicicleta", "type":"cardio", "activity":"Bicicleta", "kcal":629, "minutes":45,
  "distanceM":21534, "avgPowerW":173, "avgCadenceRpm":58, "avgHr":138 }
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
que extrajiste** (`type`, `volumeKg`, `exercises[]` en fuerza; `distanceM`/`avgPowerW`/`avgCadenceRpm`/`avgHr`
en cardio): la app los necesita para el desglose por músculo y la progresión de la pestaña Ejercicios.
El servidor los preserva y, si una versión simple ya estaba registrada, la versión con desglose la mejora.
```json
{ "date": "2026-05-28", "time": "07:30", "name": "Bicicleta fija", "type": "cardio", "activity": "Bicicleta",
  "kcal": 307, "minutes": 20, "distanceM": 9800, "avgPowerW": 165, "avgHr": 132, "source": "skill-chat" },
{ "date": "2026-05-28", "time": "08:05", "name": "Pesas", "type": "strength", "kcal": 319, "minutes": 35,
  "volumeKg": 8462, "source": "skill-chat",
  "exercises": [ { "name": "Squat delantera", "muscle": "piernas", "sets": 3, "reps": 13, "weightKg": 25, "volumeKg": 1668, "oneRepMaxKg": 33, "quality": "B" } ] }
```
> ⚠️ `exercises[]` es un array → **solo viaja por el POST del delta** (Paso 4.a), no por la URL `?w=add` (Paso 4.b).
> Para entrenamientos de fuerza con desglose usa siempre el POST del delta.

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
- **`source`**: `"app"`/`"app+meals"` = el número real de la app (kcal ya neto de
  ejercicio); `"bridge"` = la app no sincronizó hoy → es parcial, avísale a Hugo en el
  texto del chat ("abre la app un segundo para el total completo"). Renderiza el
  dashboard igual con lo que haya.
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

## Check-in semanal (lunes) — tasa de pérdida, NO déficit fijo

El criterio de progreso ya **no es el déficit calórico fijo** sino la **tasa de pérdida
semanal** expresada como % del peso corporal/semana (Garthe 2011).

En el check-in del lunes (o si Hugo pregunta "cómo voy esta semana", "cómo viene el peso"):

1. Lee los pesos: `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` → sección `weights`.
2. Calcula el **peso promedio de esta semana vs el de la semana anterior** (promedia los
   registros de cada semana lunes-domingo para suavizar el ruido diario).
3. Exprésalo como **Δ% = (pesoPrevProm − pesoActProm) / pesoPrevProm × 100** (positivo = pérdida).

| Tasa | Lectura | Acción |
|------|---------|--------|
| **0.5-0.7 %/sem** (~0.55-0.75 kg) | Ritmo óptimo: preserva/aumenta masa magra | Mantener |
| **>0.8 %/sem** | ⚠️ Pérdida demasiado rápida, riesgo de masa magra | Sugerir **subir ~100-150 kcal** |
| **<0.4 %/sem por 2 semanas** | Pérdida estancada | Sugerir **extender la duración del cardio** (NO agregar días ni recortar más calorías) |

Base: Garthe 2011 — 0.7 %/sem preserva/aumenta LBM; 1.4 %/sem la deja plana con igual
pérdida de grasa. **Ignora el TDEE dinámico si hay <14 días de data.** La grasa visceral
sigue siendo la **prioridad #1**.

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

- `protein < 50% de 200 g` → "⚠️ Proteína crítica — necesitas Xg más"
- `kcal > 2092` → "🔴 Techo calórico superado"
- `hora > 20:00 y protein < 80% de 200 g` → "Cierra el día con proteína: yogur griego, claras, whey"
- **Distribución:** `<4 tomas de ≥36 g` o `brecha >5 h entre tomas` → "⚠️ Distribución
  subóptima — reparte la proteína en ≥4 tomas de ≥36 g" (aunque el total se cumpla).
- **Día con `workouts`:** si no hay toma proteica después de las 21:00 → "Suma una toma
  pre-sueño de 30-40 g (caseína/proteína lenta)".
- `sat_fat_warning: true` → recordar grasa visceral índice 15 (prioridad #1)
- `gi: "alto"` → mencionar impacto en insulinoresistencia visceral

---

## Reglas de feedback

- Nunca dar consuelo. Dar corrección concreta.
- Si se pasó en calorías: indicar qué omitir en la próxima comida.
- Si falta proteína: indicar fuente concreta (no genérico).
