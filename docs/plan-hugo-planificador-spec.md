# Plan Hugo — Especificación para Claude Code
### Módulo Planificador de Día + Generador IA + Export a Recordatorios + Fix de merge

> Documento autocontenido. Pegar en Claude Code sin contexto previo.
> Autor del brief: sesión de coaching con Hugo, 08/06/2026.

---

## 0. Contexto de arquitectura (leer primero)

- **App**: "Plan Hugo", PWA single-file. React 18 + Tailwind vía CDN, **sin build step**.
- **Config local**: `localStorage` key `plan-hugo-v3`.
- **Persistencia**: Google Apps Script bridge, accedido por GET. La app lee el JSON del bridge y lo mergea a su estado local.
- **BRIDGE_URL**:
  `https://script.google.com/macros/s/AKfycbwcxEoa0nvjhMv6nrdfMcaHKS130PcXV0isbc7ajNj_CMfuBXCR6RhL63LHv-e1zW9W_w/exec`
- **Secciones del bridge hoy**: `meals`, `weights`, `workouts`, `checks`.
- **Deploy (obligatorio en cada cambio)**:
  1. Editar el HTML.
  2. **Bumpear `CACHE_NAME` en `sw.js`** (si no, el service worker sirve la versión cacheada).
  3. Correr `./build.sh`.
- **Acceso al bridge para validar desde terminal**: `curl -sL -G` con `--data-urlencode`. NO usar `web_fetch` (devuelve PERMISSIONS_ERROR). Pasar siempre `date=YYYY-MM-DD` explícito y TZ America/Santiago (el server corre adelantado y mete entradas en el día equivocado).

---

## 1. Targets fijos (ÚNICA fuente de verdad)

Estos valores deben vivir en un solo lugar y alimentar app, planificador, generador y validaciones.

| Métrica | Valor |
|--------|-------|
| Calorías | **2.000 kcal máx** |
| Proteína | **190 g mínimo** (innegociable, ~2,1 g/kg peso objetivo 90 kg) |
| Carbohidratos | 200 g |
| Grasa | 67 g |
| Fibra | 30 g |
| Agua | 3.675 ml |
| TDEE estimado | 2.850 (BMR 1.878 × ~1,5) |

**Reglas de protocolo (validar en el planificador):**
- ≥ **36 g de proteína por toma** (0,4 g/kg peso objetivo; Schoenfeld & Aragon 2018).
- ≥ **4 tomas** al día.
- ≤ **5 h** entre tomas de proteína.
- **Las kcal de ejercicio NO se suman como margen para comer.** El déficit ya vive en el techo de 2.000.
- Objetivo de ritmo de pérdida: 0,5–0,7 %/semana (no déficit calórico fijo).

> ⚠️ El `SKILL.md` del food-tracker tiene metas viejas (2.150 kcal / 172 g proteína / solo 3 secciones). Actualizarlo a estos valores y a las 4 secciones (`meals|weights|workouts|checks`) como parte de este trabajo.

---

## 2. PREREQUISITO — Fix del bug de merge (hacer ANTES de todo lo demás)

### Síntoma
La PWA muestra totales inflados vs el bridge. Caso real 08/06:
- Bridge: kcal 2.108 · P 186,6 · C 228 · G 55,6 · fibra 32,5
- App: kcal 2.059 · **P 279** · **C 296** · G 68 · **fibra 46**
- Gap: +92 g proteína, +68 g carbos.

### Causa raíz (confirmada)
El bridge **no tiene endpoint de delete**. Las correcciones se registran como **entradas con macros negativos** (ej. `ANULA Brownie 1/6` → `kcal:-78, protein:-7.5, carbs:-6`). El bridge netea esos negativos en su agregador (suma algebraica directa). La PWA **no los resta** en su merge: los ignora, los clampa a 0, o suma duplicados de ids ya importados. Las entradas anuladas siguen contando en la app.

Caso 08/06: 3 pares anulados (brownie, gelatina-mousse, jalea griega) = 6 entradas que deberían netear a 0 y no lo hacen en la app.

### Qué arreglar
1. **Localizar** la función de merge del JSON del bridge (`meals[]`) al estado local, y el cálculo de totales del día.
2. **Dedup por `id`**: el `id` es timestamp Unix, clave única. Confirmar que ids ya importados no se sumen dos veces. Si el merge hace `push` sin chequear id existente → duplica.
3. **Macros negativos**: el sumador debe aceptar valores negativos en `kcal/protein/carbs/fat/fiber`. Buscar y eliminar cualquier `Math.max(0, x)`, `Math.abs()`, o parse que descarte negativos.
4. **Fix esperado** — suma algebraica simple, idéntica al bridge:
   ```js
   const totalProtein = meals
     .filter(m => m.date === hoy)
     .reduce((acc, m) => acc + (Number(m.protein) || 0), 0); // sin clamp, sin abs
   ```
   Y deduplicar por `id` antes de sumar.

### Validación
Tras el fix, la app debe mostrar para 08/06 exactamente: **kcal 2.108 · P 186,6 · C 228 · G 55,6 · fibra 32,5**. Comparar con:
```bash
curl -sL -G "BRIDGE_URL" --data-urlencode "totals=2026-06-08"
```

### Hipótesis extra
Si tras netear bien la app **sigue** sobre el bridge, hay entradas huérfanas en `localStorage` creadas desde la propia app en sesiones viejas que el chat nunca registró. En ese caso dumpear `plan-hugo-v3`, comparar ids contra los del bridge y limpiar el estado local.

---

## 3. Pieza fundacional — Biblioteca de alimentos (`foods`)

Sin esto, el planificador no tiene de dónde tomar alimentos. Es la pieza central; alimenta tanto el planificador manual como el generador IA.

### Nueva sección en el bridge: `foods`
Esquema por alimento:
```json
{
  "id": "unix",
  "name": "string",
  "portionDesc": "1 scoop / 200 g / 1 lata",
  "portionGrams": 0,
  "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0,
  "gi": "bajo|medio|alto",
  "tags": ["proteina","fibra","portable","sin-refrigeracion"]
}
```
- CRUD básico desde la app (crear/editar/borrar alimento).
- Macros se escalan por gramaje al agregar al plan.

### Seed inicial (macros ya consolidados — usar tal cual)

| Alimento | Porción | kcal | P | C | G | Fibra | GI |
|----------|---------|------|---|---|---|-------|-----|
| Yogur griego natural 0% | 200 g | 130 | 20 | 9 | 0 | 0 | bajo |
| Whey ISO 100 (Dymatize) | 1 scoop ~30 g | 120 | 25 | 2 | 1 | 0 | bajo |
| Colún Protein (yogur) | 1 envase | 110 | 18 | 9 | 2 | 0 | bajo |
| Edamame seco/tostado (Skukli low carb) | 30 g | 116 | 13 | 3 | 5 | 7 | bajo |
| Brownie proteico casero (receta 4 porc) | 1 porción (1/4) | 113 | 10 | 12 | 4 | 1 | medio |
| Brownie proteico casero | 1/6 receta | 75 | 7 | 9 | 2 | 1 | medio |
| Jalea/gelatina protein | 1 porción (~10 g P) | 60 | 10 | 3 | 0 | 0 | bajo |
| Atún al agua escurrido | 1 lata (~120 g) | 130 | 27 | 0 | 2 | 0 | bajo |
| Quinoa cocida | 1 taza | 220 | 8 | 39 | 4 | 5 | bajo |
| Pollo pechuga cocido | 150 g | 248 | 46 | 0 | 5 | 0 | bajo |
| Huevo duro | 1 unidad (~50 g) | 78 | 6 | 1 | 5 | 0 | bajo |
| Charqui / jerky | 30 g | 110 | 18 | 3 | 3 | 0 | bajo |
| Quest Bar | 1 barra | 200 | 20 | 22 | 8 | 14 | bajo |
| Loncoleche Protein (leche) | 1 envase | 150 | 15 | 12 | 5 | 0 | bajo |
| Frambuesa congelada | 30 g | 15 | 0 | 4 | 0 | 2 | bajo |
| Chía | 10 g (1 cda) | 50 | 2 | 4 | 3 | 3,5 | bajo |
| Manzana | 1/2 unidad | 52 | 0 | 14 | 0 | 2 | bajo |
| Naranja | 1 unidad | 62 | 1 | 15 | 0 | 3 | bajo |
| Arroz integral cocido | 1/2 taza | 110 | 3 | 23 | 1 | 2 | medio |
| Palta | 1/2 unidad chica | 120 | 2 | 6 | 11 | 5 | bajo |
| Pavo pechuga | 100 g | 135 | 22 | 1 | 4 | 0 | bajo |
| Salmón a la plancha | 180 g | 370 | 40 | 0 | 22 | 0 | bajo |
| Creatina monohidrato (Creapure) | 5 g | 0 | 0 | 0 | 0 | 0 | — |

> Restricción dietética: **no consume nueces**. El generador NUNCA debe proponerlas.

### Recetas compuestas (guardar como sub-objeto del alimento o sección aparte `recipes`)
- **Mousse proteica de cacao (1 porción)**: 200 g yogur griego 0% + 30 g whey + 10 g cacao + endulzante + 30 ml leche/agua → ~290 kcal · P 50 · C 18 · G 5.
- **Brownie proteico (receta ~4 porciones)**: 2 plátanos + 1 huevo + 30 g whey + 15 g cacao + 50 ml leche descremada + 10 g chips chocolate → mezcla total ~450 kcal · P 40. Air-fryer u horno 180 °C, 15 min.

---

## 4. Planificador manual

- UI de 5 slots con sus horas: **desayuno 08:30 · colación 1 11:00 · almuerzo 14:00 · colación 2 18:00 · cena 21:00** (horas editables).
- Agregar alimentos desde la biblioteca `foods` con cantidad ajustable (escala macros por gramaje).
- **Suma en vivo** por slot y total del día contra los targets de la sección 1, con barras de progreso.
- **Validaciones visuales**:
  - Slot < 36 g proteína → **ámbar** ("toma bajo umbral de estímulo").
  - Total > 2.000 kcal → **rojo**.
  - Total proteína < 190 g → **rojo**.
  - Brecha > 5 h entre tomas con proteína → **aviso**.
  - Fibra < 30 g al cierre → nota (déficit estructural conocido).
- El menú del día se guarda en nueva sección del bridge `plans`:
  ```json
  { "date": "YYYY-MM-DD", "slots": [ { "slot": "desayuno", "time": "08:30", "items": [ { "foodId": "...", "grams": 200 } ] } ] }
  ```

---

## 5. Generador IA ("Armar día")

- Botón que llama a la **API de Claude desde la app** (patrón soportado: `fetch` a `https://api.anthropic.com/v1/messages`, modelo Sonnet, **sin API key en el cliente** — el entorno la inyecta). `max_tokens: 1000`.
- **Input del prompt**: targets (sección 1), biblioteca `foods` disponible, items que el usuario ya fijó (ej. almuerzo y cena), preferencias (no repetir alimentos en el mismo día, **no nueces**, priorizar portables sin refrigeración para colaciones por turnos/visitas).
- **Output**: JSON estricto (sin markdown, sin backticks) que completa los slots usando SOLO alimentos de la biblioteca:
  ```
  Eres coach nutricional. Devuelve SOLO JSON sin markdown:
  { "slots": [ { "slot": "...", "time": "...", "items": [ { "foodId": "...", "grams": 0 } ] } ],
    "notes": "1 línea" }
  ```
- El resultado **popula el planificador, editable antes de guardar**. NO se auto-registra.
- **Generador de recetas**: para un alimento compuesto, devuelve ingredientes + pasos + macros. Mismo patrón JSON.
- Parseo seguro: quitar fences ```json``` antes de `JSON.parse`, try/catch, y validar que cada `foodId` exista en la biblioteca (descartar inventados).

---

## 6. Sync y registro

- **Guardar plan** → sección `plans` del bridge.
- **"Marcar como comido" por slot**:
  - Si es comida del plan fijo → `section=checks&meal=<slot>` SIN macros (el plan ya los tiene).
  - Si es extra fuera del plan → `section=meals` con macros completos.
  - Deduplicar por `id` (timestamp Unix).
- Patrón de escritura:
  ```bash
  curl -sL -G "BRIDGE_URL" \
    --data-urlencode "w=add" \
    --data-urlencode "section=meals" \
    --data-urlencode "id=$(date +%s)" \
    --data-urlencode "date=2026-06-09" \
    --data-urlencode "name=..." \
    --data-urlencode "kcal=..." --data-urlencode "protein=..." \
    --data-urlencode "carbs=..." --data-urlencode "fat=..." \
    --data-urlencode "fiber=..." --data-urlencode "mealSlot=..." \
    --data-urlencode "source=skill-chat"
  ```
  Confirmar SIEMPRE `ok:true, added:1` en la respuesta antes de dar por registrada una entrada.

---

## 7. Export a Recordatorios (.ics)

Botón "Exportar a Recordatorios": toma el plan del día y genera un `.ics` descargable. Al abrirlo en iPhone, iOS ofrece añadirlo a Recordatorios/Calendario.

### Detalles técnicos críticos (no obvios)
1. **Usar `VTODO`** (no VEVENT) con `DUE` + `VALARM DISPLAY` — Recordatorios lo consume mejor. (Alternativa de máxima compatibilidad: VEVENT con alarma → entra a Calendario.)
2. **Timezone explícito**: `DUE;TZID=America/Santiago:YYYYMMDDTHHMMSS`. Sin esto las horas bailan. Incluir el bloque `VTIMEZONE` de America/Santiago en el VCALENDAR.
3. **UID único por item**: `id-slot-fecha@planhugo` para que reimportar el día no duplique.
4. **SUMMARY** = nombre de la comida. **DESCRIPTION** = macros (`~305 kcal | P 52 | C 22 | G 4 | fibra 5,5`).
5. **Entrega del archivo en iOS Safari**: el `<a download>` puro a veces falla. Patrón confiable: `Blob` + `URL.createObjectURL` abierto en nueva pestaña, o botón "Compartir" que dispare la hoja de share. **Probar en iPhone real, no solo desktop.**
6. **MIME**: `text/calendar;charset=utf-8`.

### Plantilla de VTODO
```
BEGIN:VTODO
UID:1733700000-desayuno-20260609@planhugo
DTSTAMP:20260608T223000Z
DUE;TZID=America/Santiago:20260609T083000
SUMMARY:Desayuno — yogur griego 0% 200g + scoop ISO 100 + frambuesa + chía
DESCRIPTION:~305 kcal | P 52 | C 22 | G 4 | fibra 5,5
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:RELATED=START;PT0M
DESCRIPTION:Hora de comer
END:VALARM
END:VTODO
```
Envolver los 5 VTODO en `BEGIN:VCALENDAR / VERSION:2.0 / PRODID:-//PlanHugo//ES / VTIMEZONE... / END:VCALENDAR`.

### Validación
Generar el .ics, abrir en iPhone, confirmar los 5 items en Recordatorios con hora correcta (Santiago) y macros en la nota. Reimportar → no duplica (UID).

---

## 8. Orden de implementación recomendado

1. **Fix del bug de merge** (sección 2) — sin esto todo hereda el doble conteo.
2. **Biblioteca de alimentos** `foods` + seed (sección 3).
3. **Planificador manual** + validaciones + sección `plans` (sección 4).
4. **Sync / marcar como comido** (sección 6).
5. **Export .ics** (sección 7).
6. **Generador IA** (sección 5) — al final, es lo más frágil.
7. **Actualizar `SKILL.md`** del food-tracker a las metas frozen (sección 1).

Cada etapa deja algo usable. Recordar el ritual de deploy (bump `CACHE_NAME` → `./build.sh`) en cada cambio.

---

## Apéndice — Pauta de referencia (la que armamos para el 09/06)

| Hora | Slot | Comida | kcal | P | C | G | Fibra |
|------|------|--------|------|---|---|---|-------|
| 08:30 | Desayuno | Yogur griego 0% 200g + ISO 100 + frambuesa 30g + chía 10g | 305 | 52 | 22 | 4 | 5,5 |
| 11:00 | Colación 1 | Colún Protein + 2 huevos duros | 280 | 31 | 11 | 16 | 0 |
| 14:00 | Almuerzo | Quinoa + pollo + 1/2 manzana + naranja | 520 | 42 | 62 | 10 | — |
| 18:00 | Colación 2 | Edamame 30g + jalea protein 10g + 1/6 brownie | 190 | 30 | 21 | 7 | 7 |
| 21:00 | Cena | 1½ lata atún + verduras + 1/2 taza arroz integral | 400 | 46 | 35 | 6 | — |
| | **Total** | | **~1.700** | **~201** | **~151** | **~43** | **~25** |

Sirve como caso de prueba del planificador: cargada en la biblioteca, debe reproducir estos totales.
