---
name: food-tracker
description: >
  Registra alimentación, peso y ejercicio diarios del Dr. Hugo González con
  fotos o texto, estima calorías/macros/composición con visión IA, y escribe un
  JSON depurado en Google Drive (plan-hugo-bridge.json) para que la app "Plan
  Hugo" lo consuma directo sin llamar a la API. USAR SIEMPRE que Hugo mande una
  foto de comida, una captura de báscula/composición corporal (peso, % grasa,
  músculo), o una captura de entrenamiento (Apple Fitness, Strava, etc.), o diga
  "comí X", "registra esto", "anota esta comida", "cuántas calorías tiene esto",
  "pésame esto", "registra mi peso", "anota este entrenamiento", "registra este
  ejercicio", o cualquier variación de registro de comida, peso o actividad.
  También activar con "cómo voy hoy", "cuánto llevo", "resumen del día".
---

# Food Tracker — Plan Hugo

La skill hace TODO el trabajo con IA. La app solo lee el JSON desde Drive y lo
mergea a su estado local. **Un solo archivo en Drive: `plan-hugo-bridge.json`**
con cuatro secciones (`meals`, `weights`, `workouts`, `checks`).

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
`section` ∈ `meals` | `weights` | `workouts` | `checks`. `entries` admite una o
varias (p. ej. dos workouts de una foto). El Apps Script asigna el `id` y dedup por
contenido (ventana ~5 min), poda entradas con `date` de más de 10 días y actualiza
`updated_at` solo.

## Metas diarias (para el feedback de comida)

> **La meta diaria es PROGRAMABLE, no la hardcodees.** La app calcula la meta con
> Mifflin-St Jeor (TMB × factor de actividad − déficit) desde el perfil de Hugo y la
> empuja al bridge. Para el feedback, **lee la meta real**: GET `BRIDGE_URL?config=1`
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
| Proteína | 189 g | mínimo innegociable |
| Carbohidratos | 209 g | máx 220 |
| Grasas | 70 g | — |
| Fibra | 30 g | mínimo |
| Agua | 3.675 ml | mínimo |

Grasa visceral índice 15 → marcador crítico. Penalizar carbos simples y grasa saturada.

---

## Paso 0 — Clasificar la entrada

Antes de procesar, decide qué es:

- **Comida** → plato, alimento, etiqueta nutricional, o texto tipo "comí…".
  Toda comida se registra como una entrada en `meals` (ver Paso 3). Hugo NO tiene un
  plan de comidas fijo, solo metas de macros: no intentes mapear el alimento a un
  "plan del día".
- **Peso / composición** → captura de báscula o app de composición corporal
  (Withings, Speediance, etc.): peso, % grasa, músculo, IMC, etc. → sección `weights`.
- **Ejercicio** → captura de entrenamiento (Apple Fitness, Strava, anillos):
  duración, kcal, FC. → sección `workouts`. **Si una sola foto trae varios
  entrenamientos (p.ej. bici + fuerza), registra UNA entrada por cada uno.**

Si hay ambigüedad, pregunta en una línea.

> **Dedup automático (ya no clasificas "plan fijo vs extra").** Hugo no tiene un plan
> de comidas definido, solo metas de macros. Registra siempre la comida como entrada
> en `meals` (Paso 3). El servidor dedup por contenido (nombre + `mealSlot` + `date` +
> ventana de ~5 min), así que registrar el mismo plato dos veces, o que Hugo lo
> registre también en la app, NO lo duplica. El `mealSlot` es solo una etiqueta de
> horario (ver tabla más abajo).

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
```
Lee esta captura de báscula/composición corporal. Responde SOLO JSON sin markdown.
Incluye solo las claves legibles, valores numéricos sin unidades:
{
  "weightKg": número, "bodyFatPct": número, "muscleKg": número,
  "skeletalMuscleKg": número, "fatFreeMassKg": número, "boneKg": número,
  "musclePct": número, "waterPct": número, "proteinPct": número,
  "bmi": número, "ffmi": número, "metabolicAge": número, "visceralFat": número,
  "basalMetabolismKcal": número, "waistCm": número, "time": "HH:MM"
}
```

### Ejercicio
```
Lee esta captura de entrenamiento. Si hay varios entrenamientos, devuelve un array.
Responde SOLO JSON sin markdown:
[ { "name": "tipo de entrenamiento", "kcal": kcal totales (número), "minutes": duración en minutos (número) } ]
```

---

## Paso 2 — NO bajes el bridge para registrar

Para registrar comida/peso/ejercicio **no leas el archivo**: el merge lo hace el
Apps Script. Salta directo al Paso 3 (armar el delta). Esto es lo que hace rápido
el registro.

Solo necesitas leer en dos casos puntuales (siempre por `curl` al `BRIDGE_URL`, nunca
por el conector de Drive ni por `web_fetch`):
- **"cómo voy hoy" / "resumen del día":** `curl -sL "$BRIDGE_URL?totals=YYYY-MM-DD"`
  (ver detalle en la sección "Comando: cómo voy hoy" más abajo — la respuesta trae
  `source:"app"` con el número real, o `source:"bridge"` si la app no sincronizó
  hoy). Para el detalle de comidas, `curl -sL "$BRIDGE_URL"` (el JSON completo).
- **Inspección manual:** `curl -sL "$BRIDGE_URL"` (el doGet ya devuelve el JSON del
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
- `mealSlot` (solo comida): etiqueta de horario según la hora (ver tabla). La app
  usa `desayuno|almuerzo|colacion|cena|antojo|extra`. Toda comida entra como entrada
  de `meals`.

**Comida** → push a `meals`:
```json
{
  "date": "2026-05-28", "time": "17:10", "mealSlot": "extra",
  "name": "Empanada de pino", "kcal": 290, "protein": 12,
  "carbs": 32, "fat": 13, "fiber": 2, "gi": "alto", "sat_fat_warning": true,
  "notes": "Carbo simple + grasa saturada", "source": "skill-chat"
}
```

**Peso** → push a `weights` (solo las claves legibles + date/time/source):
```json
{
  "date": "2026-05-28", "time": "07:00",
  "weightKg": 78.2, "bodyFatPct": 18.0, "muscleKg": 60.1, "visceralFat": 15,
  "source": "skill-chat"
}
```

**Ejercicio** → push a `workouts` (una entrada por entrenamiento):
```json
{ "date": "2026-05-28", "time": "07:30", "name": "Bicicleta fija", "kcal": 307, "minutes": 20, "source": "skill-chat" },
{ "date": "2026-05-28", "time": "08:05", "name": "Entrenamiento de fuerza", "kcal": 319, "minutes": 35, "source": "skill-chat" }
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
]}' "$BRIDGE_URL"
```
- **`--data` SIN `-X POST`** (el `/exec` responde con un 302 a
  `script.googleusercontent.com`; con `-X POST` reintenta el POST y da 405).
- **`-L` obligatorio** para seguir ese redirect y leer la respuesta.
- `section` ∈ `meals|weights|workouts|checks`. `entries` admite varias (p. ej. dos
  workouts de una foto). El servidor asigna el `id` y dedup por contenido.

**Alternativa — GET inline (`?w=add`, una entrada por llamada):**
```bash
curl -sL "$BRIDGE_URL?w=add&section=meals&date=2026-05-30&time=20:48\
&name=Empanada%20de%20pino&kcal=290&protein=12&carbs=32&fat=13&fiber=2\
&gi=alto&satfat=1&mealSlot=extra&notes=Carbo%20simple"
```
- **Percent-encodea** valores con espacios o acentos (`espacio→%20`, `é→%C3%A9`).
  Si un valor trae `&`, omítelo o cámbialo por `y` para no romper la URL.
- Campos por sección:
  - `meals`: `name,kcal,protein,carbs,fat,fiber,gi,satfat(0/1),mealSlot,time,notes`
  - `weights`: `weightKg,bodyFatPct,muscleKg,visceralFat,time`
  - `workouts`: `name,kcal,minutes,time` (una llamada por entrenamiento)
- También puedes mandar el delta entero por GET: `BRIDGE_URL?delta=<json url-encoded>`.

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
curl -sL "$BRIDGE_URL?w=delete&section=meals&id=<id>"
# → { "ok": true, "deleted": 1, "section": "meals", "id": "<id>" }
```
`section` ∈ `meals|weights|workouts|checks`. Para saber el `id`, lee primero el JSON
completo (`curl -sL "$BRIDGE_URL"`) y ubica la entrada por nombre/fecha. `deleted: 0`
significa que no había ninguna con ese id.

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
`curl -sL "$BRIDGE_URL?totals=<hoy>"`.

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

---

## Comando: "cómo voy hoy"

`curl -sL "$BRIDGE_URL?totals=<hoy>"`. La respuesta trae un campo **`source`** que
decide cómo responder:

- **`source:"app"`** → es el número REAL que ve Hugo en la app (todo lo del día
  − ejercicio). Úsalo tal cual, NO sumes nada más. Trae:
  - `totals.kcal` = kcal **neto** del día (ya descontó el ejercicio).
    También `totals.kcalIn` (comido bruto), `totals.kcalBurned`, `protein`,
    `carbs`, `fat`, `fiber`, `waterMl`.
  - `targets` = metas del día (`kcalMax`, `proteinMin`, `carbsTarget`,
    `fatTarget`, `fiberTarget`, `waterTarget`). Úsalas para el "restante" y el %.
  - `remaining` = lo que falta para cada meta (`kcal`, `protein`, …). Negativo =
    se pasó.
  - `eaten` / `extras` = nombres de extras del día (si quieres mencionarlos).
  Arma el resumen con `totals` vs `targets` y `remaining`. Ese es el mismo número
  de la pantalla.

- **`source:"bridge"`** → la app **no se ha abierto/sincronizado hoy**, así que solo
  hay lo registrado por el chat (parcial). Trae `{ totals:{kcal,protein,carbs,fat},
  workoutsKcal }`. Muéstralo, pero **avísale a Hugo** que es parcial: "Esto es solo lo
  que registré por el chat; abre la app un segundo para que sincronice el total
  completo del día".

Si Hugo pide el **detalle** de qué comió, `curl -sL "$BRIDGE_URL"` (el JSON completo)
y lista las comidas de hoy.

---

## Categoría de comida según hora

Misma regla que `autoDetectOccasion()` en la app (`app.jsx`), para que chat y app
coincidan siempre:

| Hora | mealSlot |
|------|----------|
| antes de 11:00 | desayuno |
| 11:00–14:59 | almuerzo |
| 15:00–18:59 | colacion |
| 19:00 en adelante | cena |

(El `mealSlot` es solo una etiqueta de horario del EXTRA; no hay franja "extra"
por hora. La app solo despliega colación/cena dentro de su sección; el resto cae
en "EXTRAS DEL DÍA".)

---

## Alertas automáticas (comida)

- `protein < 50% meta` → "⚠️ Proteína crítica — necesitas Xg más"
- `kcal > 2092` → "🔴 Techo calórico superado"
- `hora > 20:00 y protein < 80%` → "Cierra el día con proteína: yogur griego, claras, whey"
- `sat_fat_warning: true` → recordar grasa visceral índice 15
- `gi: "alto"` → mencionar impacto en insulinoresistencia visceral

---

## Reglas de feedback

- Nunca dar consuelo. Dar corrección concreta.
- Si se pasó en calorías: indicar qué omitir en la próxima comida.
- Si falta proteína: indicar fuente concreta (no genérico).
