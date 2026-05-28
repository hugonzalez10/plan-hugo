# Plan Hugo

App personal de seguimiento nutricional diario. **Un solo archivo**, sin backend, sin build, sin dependencias instaladas.

## Cómo abrirla

**Local (Mac) — más simple:**
- Doble-click en `index.html` en Finder, o `open index.html` desde Terminal.
- Funciona offline una vez cargado en el navegador (los CDN de React/Tailwind/Babel quedan en caché del browser).

**Desde iPhone:**
1. Subir `index.html` a cualquier hosting estático (GitHub Pages, Netlify drop, Vercel) o servirlo local con `python3 -m http.server 8080`.
2. Abrir la URL en Safari del iPhone.
3. Compartir → "Agregar a inicio" para instalarla como app.

## Persistencia

Los datos se guardan en `localStorage` del navegador (clave `plan-hugo-v1`):
- Cada dispositivo y cada navegador tiene su propia copia.
- Si borras los datos de sitio en Safari, pierdes el historial.
- No hay sincronización entre Mac e iPhone (por ahora).

## Stack

React 18 + Tailwind via CDN, JSX compilado en runtime por Babel standalone. Todo el código (React app + estilos + CDN imports) en un único `index.html` ~750 líneas.
