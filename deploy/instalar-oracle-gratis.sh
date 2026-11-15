#!/usr/bin/env bash
set -euo pipefail
# Execute este script NA VM Ubuntu Oracle, depois de transferir o projeto.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(id -u)" -ne 0 ]]; then echo 'Execute: sudo bash deploy/instalar-oracle-gratis.sh'; exit 1; fi
if [[ ! -f /etc/os-release ]]; then echo 'Sistema Linux não reconhecido.'; exit 1; fi
. /etc/os-release
if [[ "$ID" != 'ubuntu' ]]; then echo 'Este instalador automatizado foi feito para Ubuntu.'; exit 1; fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
printf '\nAntes de continuar: no painel OCI, abra TCP 80/443 (e SSH 22 apenas para seu IP).\n'
printf 'Aponte seu domínio, por exemplo no DuckDNS, para o IP público desta VM.\n\n'
bash deploy/prepare-production.sh
