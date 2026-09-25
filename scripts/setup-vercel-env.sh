#!/usr/bin/env bash
# ============================================================
# SABE 2026 — Configura as variáveis de ambiente na Vercel
#
# Uso:
#   npm i -g vercel        (ou: npx vercel ...)
#   vercel login           (abre o navegador; feito pelo script se preciso)
#   bash scripts/setup-vercel-env.sh
#
# O script lê o .env local e grava TODAS as variáveis na Vercel
# (Produção, Prévia e Desenvolvimento), sobrescrevendo as atuais.
# No final dispara um redeploy de produção.
#
# Variáveis que ficam vazias no .env são mantidas no Vercel (não apagadas).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE não encontrado. Copie do .env.example e preencha."
  exit 1
fi

# ---- Login / vínculo -------------------------------------------------------
if ! vercel whoami >/dev/null 2>&1; then
  echo "➡️  Faça login na Vercel (abre o navegador)…"
  vercel login
fi

# ---- Lê as variáveis do .env ----------------------------------------------
declare -A VARS
while IFS='=' read -r key value; do
  case "$key" in
    ''|'#'*) continue ;;
    *) VARS["$key"]="${value//\"/}" ;;
  esac
done < <(grep -E '^[A-Z_]+=' "$ENV_FILE")

if [ ${#VARS[@]} -eq 0 ]; then
  echo "❌ Nenhuma variável encontrada no $ENV_FILE."
  exit 1
fi

ENVIRONMENTS=("production" "preview" "development")

echo "📦 Enviando ${#VARS[@]} variáveis para: ${ENVIRONMENTS[*]}"
echo

for name in "${!VARS[@]}"; do
  value="${VARS[$name]}"
  if [ -z "$value" ] || [ "$value" = "troque-por-um-segredo-forte" ] || [ "$value" = "troque-por-outro-segredo" ]; then
    echo "⏭️  $name — vazio/placeholder no .env; deixando como está na Vercel."
    continue
  fi
  for env in "${ENVIRONMENTS[@]}"; do
    echo "  → $name [$env]"
    vercel env add "$name" --value "$value" "$env" --force --yes >/dev/null 2>&1 \
      || vercel env add "$name" "$value" "$env" --force --yes >/dev/null 2>&1 \
      || echo "    ⚠️  falhou ($name/$env) — veja a saída acima"
  done
done

echo
echo "✅ Variáveis atualizadas na Vercel."
echo "🚀 Disparando redeploy de produção…"
vercel --prod --yes

echo
echo "Pronto! Confira em: https://sabe2026.vercel.app/api/versao"
echo "Esperado: {\"ok\":true,\"versao\":\"2026-09-25-...\"}"