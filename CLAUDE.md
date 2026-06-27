# CLAUDE.md — Plan Hugo (repositorio)

Guía para asistentes de IA que editen **este código**. App personal de seguimiento
nutricional (PWA, sin backend, sin dependencias instaladas). Esto documenta el
**código y los workflows**, no a la persona — el perfil personal de Hugo vive aparte,
en su `~/.claude/CLAUDE.md` global.

> Idioma: español **chileno neutro** en commits, comentarios y respuestas. Nunca
> español argentino ("vos/tenés/querés").

---

## Arquitectura en una frase

Lógica pura en `src/*.mjs` (sin React) + UI en `app.jsx` (React+JSX) se **compilan
juntas** con esbuild a `app.js` (bundle IIFE minificado). `index.html` es solo el
shell. PWA con Service Worker (`sw.js`).

```
src/*.mjs  ─┐
            ├─ esbuild (build.sh) ─► app.js  ◄── index.html carga esto
app.jsx    ─┘                       (minificado, NO editar a mano)
tailwind.input.css ─ tailwind CLI ─► tailwind.css
```

### Reglas duras de la arquitectura

- **NUNCA edites `app.js` ni `tailwind.css` a mano.** Son artefactos de build.
  Para entender o cambiar algo, mira `src/*.mjs` y `app.jsx`, y recompila.
- **Lógica de negocio → `src/*.mjs`.** Fórmulas, parsing, persistencia, sync,
  merge del bridge. Es código puro (sin React) y por eso testeable directo.
- **UI y orquestación de estado/hooks → `app.jsx`.** Importa de `src/*.mjs`; **no
  duplica fórmulas**. Si te tienta copiar una fórmula a la UI, extráela a `src/`.
- Catálogos que son **config de UI** (p. ej. `RULE_TYPES`, `RULE_CATEGORIES`,
  `COLOR_CLASSES`, `SEGMENT_TONE`) se quedan en `app.jsx`. Los **datos de dominio**
  (campos, rangos, semilla) viven en `src/`.

---

## Mapa de `src/*.mjs` (lógica pura)

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `util.mjs` | base: `uuid`, `normalizeName`, `getDeviceId` | — |
| `dates.mjs` | helpers de fecha (`todayKey`, semanas, deltas) | — |
| `nutrition.mjs` | fórmula nutricional: `DEFAULT_TARGETS`, TMB, `calcTargets`, semáforos | — |
| `metrics.mjs` | clasificación de composición corporal por rangos (`evalMetric`) | — |
| `parsing.mjs` | JSON tolerante de IA, plantillas de rutina, slugs, HeartWatch | — |
| `fields.mjs` | metadatos de campos (peso/salud/entrenamiento) + alias del bridge | — |
| `energy.mjs` | math de peso/tendencia, regresión, `WEEKLY_LOSS` | `dates` |
| `meals.mjs` | núcleo de comidas: totales del día, slots, conteo categorías | `dates`, `nutrition`, `util` |
| `rules.mjs` | reglas personales (cap kcal, conteo semanal por categoría) | `meals` |
| `seed.mjs` | estado semilla (arsenal/bancos/reglas), `buildSeed` | `util` |
| `analytics.mjs` | TDEE adaptativo, balance, tendencias, racha, comparativas | `dates`, `energy`, `meals`, `nutrition` |
| `storage.mjs` | localStorage + espejo IndexedDB + migración de versiones | `util`, `seed` |
| `sync.mjs` | backup a GitHub Gist + bridge (Apps Script). **`mergeBridge` vive acá** | `dates`, `util`, `fields`, … |
| `validate.mjs` | normaliza/valida la frontera del bridge antes de `mergeBridge` | `fields` |

`app.jsx` (~11k líneas): todos los componentes React (vistas `TodayView`,
`WeekView`, `InsightsView`, `RoutineView`; modales de captura/coach/sustitución;
hooks de sync) e importa todo lo de arriba.

### Zonas delicadas (toca con cuidado)

- **`sync.mjs` → `mergeBridge`** concentra los bugs históricos: doble conteo, dedup
  por contenido, ventana de 5 min, fechas, merge de pesos/lifts. Cubierto por
  varios tests `bridge-*`. No cambies sin correr esos tests.
- **`util.mjs` → `normalizeName`** es el dedup de comidas y **debe coincidir** con
  `_norm` del `.gs` (test `coupling.test.mjs`). No quita tildes. Distinto de
  `slugifyExercise` en `parsing.mjs` (ese sí quita tildes; es para videos de rutina).
- **`storage.mjs`**: migración de estado v1→v2→v3 y `recoverFromMirror` (rescate
  desde IndexedDB si localStorage está vacío/corrupto). Clave: `plan-hugo-v3`.

---

## Workflows

### Compilar (probar local)
```sh
./build.sh          # tailwind.css + app.js vía npx (no instala nada)
```
Después sirve por HTTP (el SW y `app.js` no funcionan por `file://`):
```sh
python3 -m http.server 8765   # http://localhost:8765
```

### Tests
```sh
npm test            # = node --test  (nativo, sin dependencias)
```
20 archivos en `tests/*.test.mjs` que importan `src/*.mjs` directo (sin React).
`tests/load-gs.mjs` es un helper que carga `apps-script/bridge-writer.gs` con los
globals de Apps Script stubeados (no despliega nada). Al tocar lógica de `src/`,
**corre los tests**; al tocar el bridge o `normalizeName`, son obligatorios.

### Publicar — usa `deploy.sh`, no pasos sueltos
```sh
./deploy.sh "descripcion-corta"             # test → build → bump CACHE_NAME → commit → push (rama actual)
./deploy.sh "descripcion-corta" --publish   # además abre/mergea PR a main → GitHub Pages publica
```
`deploy.sh` evita el drift clásico (compilar y olvidar subir `CACHE_NAME`, dejando
al SW sirviendo la versión vieja). En orden: corre tests (aborta si fallan),
compila, **auto-bumpea `CACHE_NAME`** en `sw.js` (`plan-hugo-v<N>-<desc>`), valida
que `app.js` no salió vacío y que la versión cambió, commitea y empuja. GitHub
Pages sirve desde `main`, así que lo que ves en el iPhone solo cambia con
`--publish` (requiere `gh` autenticado).

> Si editas a mano sin `deploy.sh`, **acuérdate de bumpear `CACHE_NAME` en `sw.js`**
> o el Service Worker seguirá sirviendo el bundle viejo.

### Avisos de deploy (no automáticos)
- Si cambia `apps-script/bridge-writer.gs`: **redeploy manual** en el editor de
  Apps Script (no hay clasp). Misma implementación = misma URL.
- Si el `CANONICAL_ID` del `.gs` ya no aparece en `skills/food-tracker/SKILL.md`
  (`FILE_ID`), hay desincronización del bridge.

---

## Stack y convenciones

- **React 18** (UMD vía unpkg, versión fija + SRI). **Tailwind precompilado** con
  el CLI a `tailwind.css` (ya no usa el Play CDN). Config en `tailwind.config.js`;
  el `content` escanea `index.html` + `app.jsx` (la **fuente**, no `app.js`).
- Sin paquetes instalados: esbuild y tailwind se bajan al vuelo con `npx`.
- `.gitignore` ignora `.claude/` y `.DS_Store`.
- Commits: mensaje claro en español chileno. `deploy.sh` ya añade el trailer
  `Co-Authored-By`. No pongas el id del modelo en commits/PRs/código.
- Rama de trabajo actual: `claude/claude-md-docs-82myt6`. Publicar a producción
  pasa por un PR a `main`.

---

## Persistencia y sync (resumen)

- **localStorage** (`plan-hugo-v3`) + copia rotatoria (`plan-hugo-v3-bak`) con
  escritura verificada (si falla, banner y no pisa la copia buena).
- **Espejo IndexedDB** (`storage.mjs`): cada guardado se replica; rescate al
  arrancar si localStorage está vacío/corrupto.
- **Sync opcional a GitHub Gist** con indicador en la barra (verde/ámbar/rojo). El
  respaldo en la nube es la fuente de verdad compartida entre dispositivos.

---

## El "bridge" chat↔app (contexto)

La comida/peso/ejercicio/agua se registran por **chat** (skill `food-tracker`), no a
mano en la app. La skill manda la entrada nueva por `curl` POST al **Apps Script**
(`apps-script/bridge-writer.gs`), que hace el merge/poda/sobrescritura en sitio
sobre un `FILE_ID` fijo en Drive (`plan-hugo-bridge.json`) y devuelve los totales
del día. La app **lee** ese JSON y lo mergea a su estado local con `mergeBridge`.

Piezas relacionadas en el repo:
- `apps-script/bridge-writer.gs` — el Web App (merge server-side + auto-heal de
  archivos sueltos). **Redeploy manual.**
- `skills/food-tracker/SKILL.md` — **copia de respaldo** de la skill (la viva la
  carga Claude Desktop desde el plugin gestionado y un sync puede pisarla; ver
  `skills/README.md` para reaplicarla).
- `scriptable/` — widget de iPhone **solo lectura** que consume
  `GET <BRIDGE_URL>?totals=YYYY-MM-DD`.
- `docs/` — specs de diseño (`plan-hugo-planificador-spec.md`,
  `plan-hugo-metodo-menu.md`).

---

## Dominio (por qué el código hace lo que hace)

Reglas de negocio que el código implementa — útiles para no "corregir" algo que es
intencional:

- **Targets diarios congelados:** ~2000 kcal · proteína 190 g mín · carbos 200 g ·
  grasa 67 g · fibra 30 g · agua ~3675 ml. Son pisos/techos, no sugerencias.
- **Jerarquía:** el **piso de proteína manda sobre el techo de kcal**. Diferencias
  ≤10–15 kcal son ruido de estimación.
- Las **kcal de ejercicio NUNCA** se suman como margen para comer: el déficit ya
  vive en los targets. (Por eso `analytics`/UI no las añaden al presupuesto.)
- Adherencia se mide por **tasa de pérdida 0.5–0.7 %/sem** (Garthe 2011), no por un
  déficit kcal fijo — de ahí `WEEKLY_LOSS` en `energy.mjs` y el TDEE adaptativo.
- **Una sola registración calórica por sesión** de entrenamiento (autoridad: Apple
  Watch); el dedup del bridge existe para no duplicar.
- Bridge: **verificar el write con GET** antes de confirmar (el Apps Script puede
  devolver HTML "Page Not Found" aunque el write tenga éxito → reintentar duplica).

---

*Para el detalle narrado de cada módulo y del flujo de publicación, ver `README.md`.*
