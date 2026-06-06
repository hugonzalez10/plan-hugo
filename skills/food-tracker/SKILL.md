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
- **"cómo voy hoy" / "resumen del día":** `curl -sL "$BRIDGE_URL?totals=YYYY-MM-DD&k=$BRIDGE_TOKEN"`
  (ver detalle en la sección "Comando: cómo voy hoy" más abajo — la respuesta trae
  `source:"app"` con el número real, o `source:"bridge"` si la app no sincronizó
  hoy). Para el detalle de comidas, `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` (el JSON completo).
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
- `mealSlot` (solo comida): sección del plan según la hora (ver tabla). La app usa
  `desayuno|almuerzo|colacion|cena|antojo|extra` y muestra la comida dentro de esa
  sección. Toda comida entra como entrada de `meals`; usa `extra` solo si no calza
  por hora o es claramente fuera de plan.

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

**Ejercicio** → push a `workouts` (una entrada por entrenamiento):
```json
{ "date": "2026-05-28", "time": "07:30", "name": "Bicicleta fija", "kcal": 307, "minutes": 20, "source": "skill-chat" },
{ "date": "2026-05-28", "time": "08:05", "name": "Entrenamiento de fuerza", "kcal": 319, "minutes": 35, "source": "skill-chat" }
```

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
  - `workouts`: `name,kcal,minutes,time` (una llamada por entrenamiento)
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

## Comando: "cómo voy hoy"

`curl -sL "$BRIDGE_URL?totals=<hoy>&k=$BRIDGE_TOKEN"`. La respuesta trae un campo **`source`** que
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

Si Hugo pide el **detalle** de qué comió, `curl -sL "$BRIDGE_URL?k=$BRIDGE_TOKEN"` (el JSON completo)
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
| 19:00–21:29 | cena |
| 21:30 en adelante | antojo |

(La app despliega cada `mealSlot` del plan —desayuno/almuerzo/colacion/cena/antojo—
DENTRO de su sección, con "📝 Registrado" y los macros que estimaste. Solo lo que no
calza por hora o es fuera de plan va a `extra` → "EXTRAS DEL DÍA".)

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
