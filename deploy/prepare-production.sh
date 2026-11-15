#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ "$(id -u)" -ne 0 ]]; then
  echo 'Execute com sudo: sudo bash deploy/prepare-production.sh' >&2
  exit 1
fi
for program in docker openssl; do
  command -v "$program" >/dev/null || { echo "Instale $program antes de continuar." >&2; exit 1; }
done
docker compose version >/dev/null || { echo 'Instale o plugin Docker Compose.' >&2; exit 1; }

umask 077
if [[ ! -f .env.production ]]; then
  read -r -p 'Domínio HTTPS já apontado para o IP da VM (ex.: seu-nome.duckdns.org): ' domain
  if [[ ! "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ || "$domain" == *..* ]]; then
    echo 'Domínio inválido. Configure o DNS e execute novamente.' >&2
    exit 1
  fi
  read -r -p 'E-mail do administrador: ' owner_email
  if [[ ! "$owner_email" =~ ^[^[:space:]@=]+@[^[:space:]@=]+\.[^[:space:]@=]+$ ]]; then
    echo 'E-mail inválido.' >&2
    exit 1
  fi
  owner_password="$(openssl rand -hex 18)"
  pilot_code="$(openssl rand -hex 12)"
  encryption_key="$(openssl rand -hex 32)"
  cat > .env.production <<EOF
MESA3D_DOMAIN=$domain
PUBLIC_BASE_URL=https://$domain
OWNER_EMAIL=$owner_email
OWNER_PASSWORD=$owner_password
MESA3D_ENCRYPTION_KEY=$encryption_key
PILOT_ACCESS_CODE=$pilot_code
PLAN_MONTHLY_CENTS=0
MESHY_API_KEY=
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_WEBHOOK_SECRET=
MP_OWNER_ACCESS_TOKEN=
EOF
  chmod 600 .env.production
  echo
  echo "Senha inicial do administrador: $owner_password"
  echo "Código de convite do site: $pilot_code"
  echo 'Guarde os dois em um gerenciador de senhas. Não envie .env.production a ninguém.'
  echo 'A senha pode ser alterada no painel depois da primeira entrada.'
fi

mkdir -p runtime-data
chown 1000:1000 runtime-data
chmod 700 runtime-data
docker compose --env-file .env.production config -q
docker compose --env-file .env.production up -d --build
domain="$(sed -n 's/^MESA3D_DOMAIN=//p' .env.production | head -n 1)"
echo
echo "Site: https://$domain"
echo "Administração: https://$domain/acesso.html"
echo 'Confira a saúde com: docker compose --env-file .env.production ps'
echo 'Se o HTTPS ainda não abriu, verifique DNS, portas 80/443 e: docker compose --env-file .env.production logs caddy'
