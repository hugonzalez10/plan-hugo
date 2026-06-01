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

## Persistencia — delta por POST al Apps Script (LEER ANTES DE GUARDAR)

> **REGLA DURA: para registrar NUNCA uses el conector de Drive (`create_file`,
> `update_file`, etc.) ni descargues el bridge completo. Se escribe SOLO por un
> POST con `curl` al Apps Script.**
>
> Por qué: el bridge vive en la RAÍZ de un Shared Drive (`canAddChildren: false`),
> así que `create_file` ahí **falla** —y cuando funcionaba, paría duplicados porque
> el conector solo sabe crear, no sobrescribir—. La skill ahora manda la entrada
> nueva (un "delta" de ~300 bytes) **por POST directo al `/exec`**; el Apps Script
> hace el merge, la poda y la sobrescritura en sitio sobre el `FILE_ID` fijo, y
> devuelve los totales del día ya sumados. El conector de Drive queda fuera del
> camino de escritura por completo.
>
> **Ningún `create_file` es necesario ni permitido para registrar.** Si te ves
> tentado a crear un archivo en Drive, estás en el flujo viejo (roto): vuelve a
> este paso y usa el POST.
>
> Red de seguridad: el Apps Script tiene auto-heal en la lectura, así que cualquier
> `plan-hugo-bridge.json` suelto que quede de un flujo viejo se absorbe y borra solo
> en la próxima lectura de la app. Eso NO es excusa para saltarse el POST.

Constantes (no cambiar salvo que se recree el archivo; si cambia el `FILE_ID`,
actualízalo también en `apps-script/bridge-writer.gs`):

| Constante | Valor |
|-----------|-------|
| `FILE_ID` (canónico, lo maneja el Apps Script) | `1YN3F48EZoRWSpOabwDqoXzKrGkTqIa2t` |
| `BRIDGE_URL` (Apps Script `/exec`) | `https://script.google.com/macros/s/AKfycbwcxEoa0nvjhMv6nrdfMcaHKS130PcXV0isbc7ajNj_CMfuBXCR6RhL63LHv-e1zW9W_w/exec` |

(El `PARENT_ID` del Shared Drive y el viejo `plan-hugo-bridge.upload.json` ya NO se
usan: eran del flujo `create_file` + `?commit=` que fallaba en el Shared Drive.)

**Flujo de REGISTRO (rápido) en una línea:** clasificar con visión → armar el
`delta` con la entrada nueva → **POST del delta a `BRIDGE_URL` con `curl`** → el
Apps Script lo aplica al `FILE_ID`, poda lo viejo, barre duplicados y **responde los
totales del día**. Un solo paso, sin tocar Drive.

Forma del `delta` (lo que va dentro del temporal):
```json
{ "op": "add", "section": "meals", "today": "2026-05-30", "entries": [ { ...entrada... } ] }
```
`section` ∈ `meals` | `weights` | `workouts` | `checks`. `entries` admite una o
varias (p. ej. dos workouts de una foto). El Apps Script dedup por `id`, poda
entradas con `date` de más de 10 días y actualiza `updated_at` solo.

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
| Calorías | 2.150 kcal | máx 2.300 |
| Proteína | 172 g | mínimo innegociable |
| Carbohidratos | 200 g | máx 220 |
| Grasas | 60 g | máx 65 |

Grasa visceral índice 15 → marcador crítico. Penalizar carbos simples y grasa saturada.

---

## Paso 0 — Clasificar la entrada

Antes de procesar, decide qué es:

- **Comida** → plato, alimento, etiqueta nutricional, o texto tipo "comí…".
  Aquí hay un sub-paso OBLIGATORIO (ver abajo): ¿es del **PLAN FIJO** o es un **EXTRA**?
- **Peso / composición** → captura de báscula o app de composición corporal
  (Withings, Speediance, etc.): peso, % grasa, músculo, IMC, etc. → sección `weights`.
- **Ejercicio** → captura de entrenamiento (Apple Fitness, Strava, anillos):
  duración, kcal, FC. → sección `workouts`. **Si una sola foto trae varios
  entrenamientos (p.ej. bici + fuerza), registra UNA entrada por cada uno.**

Si hay ambigüedad, pregunta en una línea.

### Sub-paso 0.b — Comida: ¿PLAN FIJO o EXTRA? (anti-duplicado)

> **REGLA ANTI-DUPLICADO (OBLIGATORIA):**
> ANTES de agregar cualquier comida al bridge, verifica si ese ítem ya existe
> en el PLAN FIJO del día (desayuno/almuerzo/colación/antojo).
> - Si Hugo dice 'tomé/comí [algo que ya está en el plan fijo]' → NO crear meal
>   ni extra nuevo. Indicarle que lo marque en la app (Marcar todo / el check
>   del ítem).
> - Usar los valores nutricionales del PLAN FIJO para ese ítem, no recalcular
>   unos distintos.
> - Solo agregar a meals/extras la comida que sea GENUINAMENTE fuera del plan
>   del día.
> En caso de duda sobre si un ítem ya está en el plan, preguntar en una línea
> antes de escribir el bridge.

El **PLAN FIJO** de la app tiene estas secciones (con `mealId` exacto entre paréntesis):

| Sección | `mealId` | Ítems fijos del plan |
|---------|----------|----------------------|
| Desayuno | `desayuno` | 2 huevos duros · Yogurt Colun Protein Plus · Café |
| Almuerzo | `almuerzo` | 1 taza arroz · 1 taza proteína animal · Fruta · Yogurt + 30g granola |
| Colación | `colacion` | snack elegido en la app (banco) |
| Cena | `cena` | proteína elegida en la app (banco) |
| Antojo nocturno | `antojo` | Not Squares Peanut Butter (extensible) |

Cómo decidir:

1. **¿La frase de Hugo coincide con una sección o ítem del plan fijo de arriba?**
   Ej: "tomé el desayuno", "comí el almuerzo", "ya almorcé", "me comí el antojo",
   "comí los huevos del desayuno".
   → **Es PLAN FIJO.** Ir a la opción A del Paso 3 (marcar, **nunca** duplicar).
2. **¿Es comida que NO está en el plan de hoy?** (algo que se comió de más, fuera
   del plan: un completo, una empanada, otra colación no planificada, etc.)
   → **Es EXTRA.** Ir a la opción B del Paso 3 (agregar a `meals` como hasta hoy).
3. **¿Duda?** Pregunta en una línea: "¿Eso es el almuerzo del plan o algo extra?"
   antes de escribir nada en el bridge.

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

Solo necesitas leer en dos casos puntuales (siempre por GET al `BRIDGE_URL`, nunca
por el conector de Drive):
- **"cómo voy hoy" / "resumen del día":** GET `BRIDGE_URL?totals=YYYY-MM-DD` (ver
  detalle en la sección "Comando: cómo voy hoy" más abajo — la respuesta trae
  `source:"app"` con el número real, o `source:"bridge"` si la app no sincronizó
  hoy). Para el detalle de comidas, GET `BRIDGE_URL` (el JSON completo).
- **Inspección manual:** GET `BRIDGE_URL` (el doGet ya devuelve el JSON del bridge
  vía auto-heal). No uses `download_file_content`/`read_file_content` del conector.

Cualquiera de estos GET sirve con `WebFetch` o con `curl -sL "$BRIDGE_URL?..."`.

`checks` es la sección para **marcar secciones del plan fijo sin duplicar** (ver
opción A del Paso 3); es retrocompatible (la app la ignora si no está).

---

## Paso 3 — Agregar entrada(s) a la sección correcta

> **RECORDATORIO ANTI-DUPLICADO (OBLIGATORIO, repetido a propósito):**
> ANTES de agregar cualquier comida al bridge, verifica si ese ítem ya existe
> en el PLAN FIJO del día (desayuno/almuerzo/colación/antojo).
> - Si Hugo dice 'tomé/comí [algo que ya está en el plan fijo]' → NO crear meal
>   ni extra nuevo. Indicarle que lo marque en la app (Marcar todo / el check
>   del ítem).
> - Usar los valores nutricionales del PLAN FIJO para ese ítem, no recalcular
>   unos distintos.
> - Solo agregar a meals/extras la comida que sea GENUINAMENTE fuera del plan
>   del día.
> En caso de duda sobre si un ítem ya está en el plan, preguntar en una línea
> antes de escribir el bridge.

Reglas comunes para TODA entrada:
- `id`: timestamp Unix en segundos al registrar (`floor(now/1000)`). Si registras
  varias entradas de una sola foto, usa ids consecutivos distintos (id, id+1, …).
  El `id` es la clave de deduplicación: la app ignora ids ya importados.
- `date`: `YYYY-MM-DD` del registro (o de la captura si la muestra).
- `source`: `"skill-chat"`.

### Comida — opción A: ítem del PLAN FIJO (marcar, NUNCA duplicar)

Si en el Paso 0.b clasificaste la comida como **PLAN FIJO**, NO la agregues a
`meals`. Tienes dos formas, en orden de preferencia:

- **A1 (preferida) — escribir en `checks`:** push una marca a la sección `checks`
  del bridge. La app marca esa sección fija como comida (usa sus valores del plan,
  no recalcula) y NO la duplica. Una entrada por sección:
  ```json
  { "id": 1748441400, "date": "2026-05-28", "meal": "desayuno", "source": "skill-chat" }
  ```
  `meal` debe ser uno de: `desayuno|almuerzo|colacion|cena|antojo`
  (también acepta `dessertAlmuerzo|dessertCena`). El `id` se deduplica como todo
  lo demás: se aplica una sola vez, así que si Hugo lo destilda en la app no se
  vuelve a marcar solo. **No** uses esto para colación/cena si Hugo aún no eligió
  el ítem en la app (no hay valores que marcar) — en ese caso usa A2.
- **A2 — solo indicar:** si dudas del `mealId` correcto, no escribas nada y
  responde: "Eso ya está en tu plan fijo — márcalo en la app (Marcar todo o el
  check del ítem)."

### Comida — opción B: EXTRA real (fuera del plan)

Solo si en el Paso 0.b clasificaste la comida como **EXTRA** → push a `meals`
(la app la suma a "EXTRAS DEL DÍA", aparte del plan fijo):
```json
{
  "id": 1748441400, "date": "2026-05-28", "time": "17:10", "mealSlot": "extra",
  "name": "Empanada de pino", "kcal": 290, "protein": 12,
  "carbs": 32, "fat": 13, "fiber": 2, "gi": "alto", "sat_fat_warning": true,
  "notes": "Fuera del plan; carbo simple + grasa saturada", "source": "skill-chat"
}
```
`mealSlot` según la hora (ver tabla). La app usa: `desayuno|almuerzo|colacion|cena|antojo|extra`.
(El `mealSlot` es solo una etiqueta de horario: toda comida del bridge entra como
EXTRA en la app, nunca reemplaza ni marca una sección del plan fijo.)

### Mini-ejemplos (plan fijo vs extra real)

- **Ítem del PLAN FIJO** — Hugo: "tomé el desayuno" → es la sección fija `desayuno`.
  **NO** crear meal. Opción A1: push a `checks`
  `{ "id": 1748460000, "date": "2026-05-28", "meal": "desayuno", "source": "skill-chat" }`,
  o A2: "Eso ya está en tu plan — márcalo en la app." Responder con los valores del
  plan (huevos+yogurt+café), no recalcular.
- **Extra real** — Hugo: "me comí una empanada en la tarde" → no está en el plan.
  Push a `meals` como el ejemplo de arriba (`mealSlot: "extra"`).
- **Caso de duda** — Hugo: "comí pollo con arroz" (el almuerzo del plan ES arroz +
  proteína animal). Preguntar: "¿Eso es tu almuerzo del plan o algo aparte?" antes
  de escribir el bridge.

**Peso** → push a `weights` (solo las claves legibles + id/date/time/source):
```json
{
  "id": 1748441401, "date": "2026-05-28", "time": "07:00",
  "weightKg": 78.2, "bodyFatPct": 18.0, "muscleKg": 60.1, "visceralFat": 15,
  "source": "skill-chat"
}
```

**Ejercicio** → push a `workouts` (una entrada por entrenamiento):
```json
{ "id": 1748441402, "date": "2026-05-28", "name": "Bicicleta fija", "kcal": 307, "minutes": 20, "source": "skill-chat" },
{ "id": 1748441403, "date": "2026-05-28", "name": "Entrenamiento de fuerza", "kcal": 319, "minutes": 35, "source": "skill-chat" }
```

---

## Paso 4 — POST del delta al Apps Script (UN solo paso, sin tocar Drive)

Arma el **delta** con la(s) entrada(s) del Paso 3 y mándalo por POST al `/exec` con
`Bash` + `curl`. Una sola tool call:

```bash
curl -sL --max-time 30 \
  -H "Content-Type: application/json" \
  --data '{"op":"add","section":"meals","today":"2026-05-30","entries":[{"id":1780179200,"date":"2026-05-30","time":"20:48","mealSlot":"extra","name":"Empanada de pino","kcal":290,"protein":12,"carbs":32,"fat":13,"fiber":2,"gi":"alto","sat_fat_warning":true,"notes":"...","source":"skill-chat"}]}' \
  "https://script.google.com/macros/s/AKfycbwcxEoa0nvjhMv6nrdfMcaHKS130PcXV0isbc7ajNj_CMfuBXCR6RhL63LHv-e1zW9W_w/exec"
```

`today` = fecha local de hoy (`YYYY-MM-DD`). `section` ∈ `meals|weights|workouts|checks`.
`entries` puede traer varias (p. ej. 2 workouts de una foto, ids consecutivos).

> **CRÍTICO sobre el `curl` (no lo cambies):**
> - **NUNCA uses `-X POST`.** El `/exec` responde un 302 a `script.googleusercontent.com`;
>   con `-X POST` curl reintenta POST en el redirect y Google contesta **405**. Con
>   `--data ... -L` (sin `-X`) curl postea en el primer hop y baja a GET en el
>   redirect → trae el JSON con los totales. Es la única combinación que funciona.
> - **`-L` es obligatorio** (hay que seguir ese redirect).
> - El `Content-Type` puede ser `application/json` o `text/plain`, da igual: el
>   `doPost` lee el body crudo.

El Apps Script lee el delta del body, lo **mergea al `FILE_ID`** (dedup por `id`),
poda lo de >10 días, sobrescribe el canónico en sitio, barre duplicados y responde:
```json
{ "ok": true, "added": 1, "today": "2026-05-30",
  "totals": { "kcal": 1234, "protein": 89, "carbs": 102, "fat": 45 },
  "workoutsKcal": 565 }
```
Usa esos `totals` para el resumen del Paso 5 (no los recalcules).
- Si responde `{ "ok": false, ... }` o la red falla, reintenta el mismo POST una vez.
- Si falla dos veces, dilo en el chat y para. **NUNCA** caigas a `create_file` —
  en el Shared Drive falla y/o deja duplicados. Como salvaguarda extra puedes hacer
  GET `BRIDGE_URL?heal=1` y reintentar el POST.

> **Por qué así:** el bridge vive en la raíz de un Shared Drive, donde el conector
> de Drive no puede crear ni sobrescribir (`canAddChildren: false`), y de todos
> modos solo sabe `create_file` (id nuevo → duplicados). El POST directo al Apps
> Script saca al conector del camino: el merge, la sobrescritura en sitio sobre el
> `FILE_ID` fijo, la poda y la limpieza de duplicados pasan server-side. La skill
> manda ~300 bytes → registro rápido, sin duplicados y a prueba de Shared Drive.
> Ver `apps-script/bridge-writer.gs` (función `doPost`) en el repo de la app.

(Compat: si mandas un **bridge completo** `{meals,weights,...}` en el body, el Apps
Script lo absorbe igual por unión. Pero para registrar usa el delta.)

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
Barra de 10 bloques. Los totales vienen **directos en la respuesta del commit**
(`totals.kcal`, `totals.protein`, …) — NO los recalcules ni vuelvas a bajar el
bridge. Si por alguna razón el commit no trajo `totals`, recién ahí
GET `BRIDGE_URL?totals=<hoy>`.

### Comida del PLAN FIJO (marcada, no nueva)
Cuando fue un ítem del plan fijo (opción A), NO digas "registrado" como comida
nueva. Usa los valores del plan, no los recalcules:
```
✅ [Sección] del plan marcado como comido
~[kcal del plan] kcal | P:[x]g | C:[x]g | G:[x]g  (valores del plan)

[Si usaste A1] Lo marqué en la app vía sync.
[Si usaste A2] Márcalo en la app (Marcar todo o el check del ítem).
```

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

GET `BRIDGE_URL?totals=<hoy>`. La respuesta trae un campo **`source`** que decide
cómo responder:

- **`source:"app"`** → es el número REAL que ve Hugo en la app (plan fijo marcado +
  extras del chat − ejercicio). Úsalo tal cual, NO sumes nada más. Trae:
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
  hay extras registrados por el chat (parcial, NO incluye el plan fijo). Trae
  `{ totals:{kcal,protein,carbs,fat}, workoutsKcal }`. Muéstralo, pero **avísale a
  Hugo** que es parcial: "Esto es solo lo que registré por el chat; abre la app un
  segundo para que sincronice el total completo del día".

Si Hugo pide el **detalle** de qué comió, GET `BRIDGE_URL` (el JSON completo) y
lista las comidas de hoy.

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
- `kcal > 2300` → "🔴 Techo calórico superado"
- `hora > 20:00 y protein < 80%` → "Cierra el día con proteína: yogur griego, claras, whey"
- `sat_fat_warning: true` → recordar grasa visceral índice 15
- `gi: "alto"` → mencionar impacto en insulinoresistencia visceral

---

## Reglas de feedback

- Nunca dar consuelo. Dar corrección concreta.
- Si se pasó en calorías: indicar qué omitir en la próxima comida.
- Si falta proteína: indicar fuente concreta (no genérico).
