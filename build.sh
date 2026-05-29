#!/usr/bin/env bash
# Compila app.jsx → app.js (sin Babel en el navegador).
# Requiere Node/npx; esbuild se descarga al vuelo, no se instala nada.
set -euo pipefail
cd "$(dirname "$0")"
npx --yes esbuild@0.24.0 app.jsx \
  --bundle --minify --format=iife --jsx=transform \
  --outfile=app.js
echo "OK → app.js ($(wc -c < app.js) bytes)"
