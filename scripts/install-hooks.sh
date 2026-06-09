#!/usr/bin/env bash
# Installa gli hook git locali. Da eseguire dopo ogni clone o nuovo container.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

ln -sf "$REPO_ROOT/scripts/pre-commit-check.sh" "$HOOKS_DIR/pre-commit"
echo "✓ Hook pre-commit installato: $HOOKS_DIR/pre-commit"
