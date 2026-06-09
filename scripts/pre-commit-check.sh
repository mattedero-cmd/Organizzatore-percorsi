#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Pre-commit check — Organizzatore Percorsi
# Blocca il commit se una delle regole del CLAUDE.md non è rispettata.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail
ERRORS=()

# ── 1. Leggi versione attuale da app.js ───────────────────────────
APP_VERSION=$(grep -oP 'Versione \K[0-9]+\.[0-9]+' public/app.js | head -1)
if [[ -z "$APP_VERSION" ]]; then
  ERRORS+=("Impossibile leggere la versione da public/app.js")
else
  MAJOR=$(echo "$APP_VERSION" | cut -d. -f1)
  PATCH=$(echo "$APP_VERSION" | cut -d. -f2 | sed 's/^0*//')  # rimuovi zeri iniziali
  PATCH=${PATCH:-0}
fi

# ── 2. CHANGELOG.md contiene la versione corrente ─────────────────
if [[ -n "$APP_VERSION" ]]; then
  if ! grep -q "v${APP_VERSION}" CHANGELOG.md 2>/dev/null; then
    ERRORS+=("CHANGELOG.md non contiene una voce per v${APP_VERSION}")
  fi
fi

# ── 3. service-worker.js e index.html hanno la stessa ?v= ─────────
SW_VER=$(grep -oP '(?<=\?v=)[0-9]+-[0-9]+' public/service-worker.js | head -1)
HTML_VER=$(grep -oP '(?<=\?v=)[0-9]+-[0-9]+' public/index.html | head -1)
if [[ -z "$SW_VER" ]]; then
  ERRORS+=("service-worker.js: impossibile leggere il parametro ?v=")
elif [[ -z "$HTML_VER" ]]; then
  ERRORS+=("index.html: impossibile leggere il parametro ?v=")
elif [[ "$SW_VER" != "$HTML_VER" ]]; then
  ERRORS+=("Versione asset non allineata: service-worker.js=$SW_VER  index.html=$HTML_VER")
fi

# ── 4. Ogni multiplo di 10: sezione Novità aggiornata in app.js ───
if [[ -n "$APP_VERSION" && $((PATCH % 10)) -eq 0 && $PATCH -gt 0 ]]; then
  PADDED=$(printf "%d.%03d" "$MAJOR" "$PATCH")
  if ! grep -q "Novità v${PADDED}\|Novità v${MAJOR}\.0*${PATCH}" public/app.js 2>/dev/null; then
    ERRORS+=("Versione v${APP_VERSION} è un multiplo di 10: aggiorna la sezione 'Novità' in renderMenuInfo() prima di committare")
  fi
fi

# ── 5. Se app.js è staged, anche service-worker.js e index.html lo devono essere ──
STAGED=$(git diff --cached --name-only)
if echo "$STAGED" | grep -q "^public/app\.js$"; then
  if ! echo "$STAGED" | grep -q "^public/service-worker\.js$"; then
    ERRORS+=("public/app.js è staged ma public/service-worker.js non lo è — aggiorna CACHE_NAME e ?v=")
  fi
  if ! echo "$STAGED" | grep -q "^public/index\.html$"; then
    ERRORS+=("public/app.js è staged ma public/index.html non lo è — aggiorna ?v=")
  fi
fi

# ── Risultato ─────────────────────────────────────────────────────
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT FALLITO — regole CLAUDE.md non rispettate   ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  for err in "${ERRORS[@]}"; do
    echo "  ✗  $err"
  done
  echo ""
  exit 1
fi

echo "✓ Pre-commit check OK (v${APP_VERSION}, asset ?v=${SW_VER})"
exit 0
