#!/usr/bin/env bash
# deploy.sh — un solo comando para publicar Plan Hugo sin drift.
#
# Encadena, abortando ante el primer fallo:
#   tests → compilar (app.jsx→app.js) → bump CACHE_NAME → validar → commit → push.
#
# Uso:
#   ./deploy.sh [descripción]              build + commit + push de la rama actual
#   ./deploy.sh [descripción] --publish    además mergea a main y publica (GitHub Pages)
#   ./deploy.sh --publish [descripción]    (el orden de los argumentos da igual)
#
# La <descripción> es el sufijo del CACHE_NAME (plan-hugo-v<N>-<desc>). Si no se pasa,
# se deriva del nombre de la rama. GitHub Pages sirve desde `main`, por eso publicar de
# verdad (lo que ves en el iPhone) exige llegar a `main`: eso solo ocurre con --publish.
set -euo pipefail
cd "$(dirname "$0")"

GS_FILE="apps-script/bridge-writer.gs"
SKILL_FILE="skills/food-tracker/SKILL.md"

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---- args ----
PUBLISH=0
DESC=""
for arg in "$@"; do
  if [ "$arg" = "--publish" ]; then PUBLISH=1; else DESC="$arg"; fi
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ -n "$DESC" ] || DESC="$BRANCH"
# Saneo: sin prefijos feat/fix/…, solo [a-z0-9-], para que sea seguro en sed y en el cache key.
DESC="$(printf '%s' "$DESC" | sed -E 's#^(feat|fix|chore|docs|refactor|test)/##' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
[ -n "$DESC" ] || DESC="deploy"

# ---- 1. gate de tests ----
say "Tests (node --test)"
node --test
ok "Tests OK"

# ---- 2. compilar ----
say "Compilando app.jsx → app.js"
./build.sh
ok "Build OK"

# ---- 3. bump CACHE_NAME ----
say "Bumpeando CACHE_NAME en sw.js"
CUR="$(grep -oE "CACHE_NAME = '[^']+'" sw.js | head -1 | sed -E "s/CACHE_NAME = '([^']+)'/\1/")"
[ -n "$CUR" ] || die "No encontré CACHE_NAME en sw.js"
CUR_N="$(printf '%s' "$CUR" | sed -E 's/^plan-hugo-v([0-9]+)-.*/\1/')"
printf '%s' "$CUR_N" | grep -qE '^[0-9]+$' || die "No pude parsear el número de versión de '$CUR'"
NEW="plan-hugo-v$((CUR_N + 1))-${DESC}"
sed -i '' -E "s/const CACHE_NAME = '[^']+';/const CACHE_NAME = '${NEW}';/" sw.js
ok "CACHE_NAME: $CUR → $NEW"

# ---- 4. validaciones ----
say "Validando"
BYTES="$(wc -c < app.js | tr -d ' ')"
[ "$BYTES" -ge 100000 ] || die "app.js pesa ${BYTES} bytes (< 100 KB): ¿build vacío o roto?"
ok "app.js = ${BYTES} bytes"
if git diff --quiet HEAD -- sw.js; then
  die "sw.js no cambió respecto al último commit: el bump de CACHE_NAME no surtió efecto."
fi
ok "CACHE_NAME cambió vs HEAD"

# 4c. el .gs NO se despliega solo (no hay clasp): avisar fuerte si cambió.
if ! git diff --quiet HEAD -- "$GS_FILE"; then
  warn "═══════════════════════════════════════════════════════════════════"
  warn "  $GS_FILE CAMBIÓ — el bridge NO se despliega solo."
  warn "  Redeploy manual en el editor de Apps Script:"
  warn "    1. Abre el proyecto (en la app: Ajustes → URL del Apps Script)."
  warn "    2. Reemplaza TODO el contenido de Code.gs por este archivo."
  warn "    3. Implementar → Administrar implementaciones → editar la existente"
  warn "       → Versión nueva → Implementar.  (misma implementación = misma URL)"
  warn "═══════════════════════════════════════════════════════════════════"
fi

# 4d. CANONICAL_ID (.gs) debe seguir presente en el SKILL.md (FILE_ID). Si no, drift.
CID="$(grep -oE "CANONICAL_ID = '[^']+'" "$GS_FILE" | head -1 | sed -E "s/.*'([^']+)'/\1/")"
if [ -n "$CID" ] && ! grep -q "$CID" "$SKILL_FILE"; then
  warn "CANONICAL_ID ($CID) del .gs no aparece en $SKILL_FILE — ¿FILE_ID desincronizado?"
fi

# ---- 5. commit (en la rama actual) ----
say "Commit en rama '$BRANCH'"
git add app.jsx app.js sw.js index.html manifest.json
git commit -m "deploy: $NEW" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
ok "Commit creado"

# ---- 6. push / publicar ----
say "Push de la rama '$BRANCH'"
git push -u origin "$BRANCH"
ok "Rama '$BRANCH' empujada"

if [ "$PUBLISH" -eq 1 ]; then
  if [ "$BRANCH" = "main" ]; then
    ok "Ya estás en main — GitHub Pages publicará este push en ~1-2 min."
  else
    say "Publicando a main (GitHub Pages)"
    git checkout main
    git pull --ff-only origin main
    git merge --no-ff "$BRANCH" -m "deploy: merge $BRANCH → main ($NEW)"
    git push origin main
    git checkout "$BRANCH"
    ok "main actualizado. GitHub Pages servirá $NEW en ~1-2 min."
  fi
else
  if [ "$BRANCH" != "main" ]; then
    printf '\n\033[1;36mPara publicar a producción (GitHub Pages sirve desde main):\033[0m\n'
    printf '  ./deploy.sh %s --publish\n' "$DESC"
    printf '  (o a mano: git checkout main && git merge --no-ff %s && git push origin main && git checkout %s)\n\n' "$BRANCH" "$BRANCH"
  fi
fi
ok "Listo. CACHE_NAME = $NEW"
