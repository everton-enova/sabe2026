#!/usr/bin/env bash
set -euo pipefail

# Auto-commit e push com mensagem baseada em timestamp ou argumento
MSG="${1:-"auto: $(date '+%Y-%m-%d %H:%M:%S')"}"

if [ -z "$(git status --porcelain)" ]; then
  echo "Nada para commitar."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push origin "$(git branch --show-current)"
echo "✅ Commit e push realizados: $MSG"
