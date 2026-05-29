# Plan Hugo

App personal de seguimiento nutricional diario. Sin backend, sin dependencias instaladas.

El código de la app vive en **`app.jsx`** (React + JSX). Se compila a **`app.js`** con
esbuild — ya **no** se compila JSX en el navegador con Babel, así que el arranque en el
teléfono es inmediato. `index.html` es solo el shell (HTML + estilos + carga de `app.js`).

## Editar y compilar

1. Edita `app.jsx`.
2. Recompila:

   ```sh
   ./build.sh
   ```

   (descarga esbuild al vuelo vía `npx`, no instala nada). Genera `app.js`.
3. Recarga la app. Recuerda subir la versión del cache en `sw.js` (`CACHE_NAME`) si publicas,
   para forzar el refresco del Service Worker.

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

## Stack

React 18 (UMD, versión fija + SRI) + Tailwind vía CDN. App en `app.jsx`, precompilada a
`app.js` con esbuild. PWA con Service Worker (`sw.js`) y `manifest.json`.
