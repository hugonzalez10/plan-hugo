# Plan Hugo

App personal de seguimiento nutricional diario. Sin backend, sin dependencias instaladas.

El código de la app vive en **`app.jsx`** (React + JSX). Se compila a **`app.js`** con
esbuild — ya **no** se compila JSX en el navegador con Babel, así que el arranque en el
teléfono es inmediato. `index.html` es solo el shell (HTML + estilos + carga de `app.js`).

## Editar y compilar

1. Edita `app.jsx`.
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
app avisa con un banner y no pisa la copia buena. Sync opcional a GitHub Gist con indicador
de estado en la barra superior (verde = sincronizado, ámbar = pendiente/conflicto, rojo =
error). Cada dispositivo tiene su copia; el respaldo en la nube es la fuente de verdad
compartida.

## Tests

Lógica pura del bridge (dedup por contenido, ventana de 5 min, merge de pesos, suma de
totales, adopción de snapshot/config, auth por token) y el acoplamiento app↔bridge
(`normalizeName` debe coincidir con `_norm` del `.gs`):

```sh
npm test          # = node --test (nativo, sin dependencias)
```

Los tests en `tests/` cargan `apps-script/bridge-writer.gs` con los globals de Apps
Script stubeados — no despliegan nada.

## Stack

React 18 (UMD, versión fija + SRI) + Tailwind vía CDN. App en `app.jsx`, precompilada a
`app.js` con esbuild. PWA con Service Worker (`sw.js`) y `manifest.json`.
