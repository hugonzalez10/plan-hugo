#!/usr/bin/env bash
# Compila app.jsx → app.js y genera tailwind.css (ambos precompilados, sin nada en runtime).
# Requiere Node/npx; esbuild y tailwindcss se descargan al vuelo, no se instala nada.
set -euo pipefail
cd "$(dirname "$0")"
# CSS: Tailwind prebuildeado (reemplaza el Play CDN cdn.tailwindcss.com). Escanea app.jsx + index.html.
npx --yes tailwindcss@3.4.17 -c tailwind.config.js -i tailwind.input.css -o tailwind.css --minify
echo "OK → tailwind.css ($(wc -c < tailwind.css) bytes)"
npx --yes esbuild@0.24.0 app.jsx \
  --bundle --minify --format=iife --jsx=transform \
  --outfile=app.js
echo "OK → app.js ($(wc -c < app.js) bytes)"
