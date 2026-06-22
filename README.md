# Plan Hugo

App personal de seguimiento nutricional diario. Sin backend, sin dependencias instaladas.

La arquitectura está separada en dos capas:

- **`src/*.mjs`** (14 módulos, ~3.400 líneas): toda la **lógica de negocio pura**, sin
  React — nutrición y metas (`nutrition.mjs`), TDEE adaptativo y análisis de tendencia
  (`analytics.mjs`), regresión de peso (`energy.mjs`), comidas y totales (`meals.mjs`),
  persistencia (`storage.mjs`), sync (`sync.mjs`), parsing (`parsing.mjs`), etc. Es código
  testeable sin levantar la UI (ver [Tests](#tests)).
- **`app.jsx`** (React + JSX): la **capa de UI**. Importa de `src/*.mjs` y orquesta el
  estado y las vistas; no duplica fórmulas.

Ambas capas se compilan juntas a **`app.js`** con esbuild (`--bundle`, IIFE) — ya **no** se
compila JSX en el navegador con Babel, así que el arranque en el teléfono es inmediato.
`app.js` es el **bundle minificado**: para entender o editar el proyecto, mira `src/*.mjs`
y `app.jsx`, nunca `app.js`. `index.html` es solo el shell (HTML + estilos + carga de
`app.js`).

## Editar y compilar

1. Edita `app.jsx` (UI) o `src/*.mjs` (lógica), según corresponda.
2. Recompila para probar en local:

   ```sh
   ./build.sh
   ```

   (descarga esbuild al vuelo vía `npx`, no instala nada). Genera `app.js`. Recarga la app.

## Publicar

Un solo comando hace todo y evita el drift clásico (compilar pero olvidar subir
`CACHE_NAME`, con lo que el Service Worker sigue sirviendo la versión vieja):

```sh
./deploy.sh "descripcion-corta"            # test → build → bump CACHE_NAME → commit → push (rama actual)
./deploy.sh "descripcion-corta" --publish  # además abre y mergea un PR a main → GitHub Pages publica
```

`deploy.sh` en orden: corre `node --test` (si algo falla, **aborta** sin tocar nada),
compila, **auto-bumpea** `CACHE_NAME` en `sw.js` (incrementa `plan-hugo-v<N>-…`; el sufijo
sale del argumento o del nombre de la rama), valida que `app.js` no salió vacío y que la
versión cambió, commitea y empuja. GitHub Pages sirve desde `main`, así que publicar de
verdad (lo que ves en el iPhone) exige `--publish`, que abre (o reusa) un PR de la rama a
`main` con `gh` y lo mergea — requiere [GitHub CLI](https://cli.github.com/) autenticado.

Avisos que imprime (no bloquean): si cambió `apps-script/bridge-writer.gs` recuerda el
**redeploy manual** en Apps Script (no hay clasp), y si el `CANONICAL_ID` del `.gs` ya no
aparece en `skills/food-tracker/SKILL.md` (`FILE_ID`) avisa de la desincronización.

## Cómo abrirla

**Local (Mac):**
- `python3 -m http.server 8765` y abre `http://localhost:8765`.
  (No uses doble-click `file://`: `app.js` y el Service Worker necesitan servirse por http.)
- Funciona offline una vez cargada (el SW cachea `index.html`, `app.js` y los CDN).

**Desde iPhone:**
1. Sube los archivos a un hosting estático (GitHub Pages, Netlify drop, Vercel) — incluyendo
   `app.js` ya compilado.
2. Abre la URL en Safari → Compartir → "Agregar a inicio" para instalarla como PWA.

## Persistencia y respaldo

Datos en `localStorage` (clave `plan-hugo-v3`), con copia de respaldo rotatoria
(`plan-hugo-v3-bak`) y escritura verificada: si un guardado falla (p. ej. sin espacio), la
app avisa con un banner y no pisa la copia buena. Además hay un **espejo en IndexedDB**
(`src/storage.mjs`): cada guardado se replica ahí, y si `localStorage` aparece vacío o
corrupto al arrancar, `recoverFromMirror` rescata el estado desde IndexedDB. La migración
de versiones del estado (v1→v2→v3) también vive en `storage.mjs`. Sync opcional a GitHub
Gist con indicador de estado en la barra superior (verde = sincronizado, ámbar =
pendiente/conflicto, rojo = error). Cada dispositivo tiene su copia; el respaldo en la nube
es la fuente de verdad compartida.

## Tests

16 archivos de test sobre la lógica pura de `src/*.mjs` y del bridge, importando las
funciones directo (sin React):

- **Nutrición y energía:** TDEE adaptativo (`adaptive-tdee`), `calcTargets`, regresión y
  tendencia de peso (`trend-weight`, `evolution`), totales de comidas y slots por hora
  (`slot-by-time`, `week-slots`), series de energía (`bridge-energy`).
- **Persistencia:** rescate desde el espejo IndexedDB (`idb-recovery`).
- **Bridge:** dedup por contenido, ventana de 5 min, merge de pesos, suma de totales,
  adopción de snapshot/config, doble conteo (`bridge`, `bridge-merge`, `reconcile`,
  `double-count`), parsing de salud (`bridge-health`, `heartwatch-parse`) y el acoplamiento
  app↔bridge (`normalizeName` debe coincidir con `_norm` del `.gs`).

```sh
npm test          # = node --test (nativo, sin dependencias)
```

Los tests de bridge cargan `apps-script/bridge-writer.gs` con los globals de Apps Script
stubeados — no despliegan nada.

## Stack

React 18 (UMD, versión fija + SRI) + Tailwind **precompilado** a `tailwind.css` con el CLI
de Tailwind (ya **no** usa el Play CDN dinámico). Lógica en `src/*.mjs` + UI en `app.jsx`,
ambas precompiladas a `app.js` con esbuild. PWA con Service Worker (`sw.js`) y
`manifest.json`.
