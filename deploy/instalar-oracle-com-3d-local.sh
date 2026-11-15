#!/usr/bin/env bash
# Mesa3D 8.3.1: hospedagem nativa Ubuntu 24.04 + processamento 3D por CPU.
set -Eeuo pipefail
trap 'echo "ERRO na linha $LINENO. Confira a saída acima; nenhum sucesso foi presumido." >&2' ERR
cd "$(dirname "${BASH_SOURCE[0]}")/.."
SOURCE_DIR="$(pwd)"
[[ "$(id -u)" == 0 ]] || { echo 'Execute com sudo.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == 'ubuntu' && "$VERSION_ID" == '24.04' ]] || { echo 'Requer Ubuntu 24.04 na VM.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y software-properties-common ca-certificates curl git build-essential cmake ninja-build pkg-config \
  libopencv-dev libceres-dev libcgal-dev libboost-all-dev libeigen3-dev libpng-dev libjpeg-dev \
  libtiff-dev libglfw3-dev libglew-dev libatlas-base-dev libsqlite3-dev libfreeimage-dev \
  libgflags-dev libgoogle-glog-dev libtbb-dev libxi-dev libxrandr-dev libxxf86vm-dev \
  colmap caddy openssl rsync
# Node 24 oficial (runtime node:sqlite do projeto).
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
[[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ]] || { echo 'Node 24+ não disponível.' >&2; exit 1; }
# Compilação OpenMVS: sem GPU, CPU ARM64/AMD64, dependências locais.
if ! command -v InterfaceCOLMAP >/dev/null 2>&1 || ! command -v TextureMesh >/dev/null 2>&1; then
  mkdir -p /opt/mesa3d-build
  if [[ ! -d /opt/mesa3d-build/openMVS/.git ]]; then
    git clone --depth 1 https://github.com/cdcseacave/openMVS.git /opt/mesa3d-build/openMVS
  fi
  cmake -S /opt/mesa3d-build/openMVS -B /opt/mesa3d-build/openMVS/build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr/local \
    -DOpenMVS_USE_CUDA=OFF -DOpenMVS_USE_OPENGL=OFF -DOpenMVS_BUILD_TESTS=OFF
  cmake --build /opt/mesa3d-build/openMVS/build --parallel 2
  cmake --install /opt/mesa3d-build/openMVS/build
  ldconfig
fi
# OpenMVS pode instalar em /usr/local/bin ou /usr/local/bin/OpenMVS.
BIN_FOLDER=''
for candidate in /usr/local/bin /usr/local/bin/OpenMVS /opt/mesa3d-build/openMVS/build/bin; do
  if [[ -x "$candidate/InterfaceCOLMAP" && -x "$candidate/TextureMesh" ]]; then BIN_FOLDER="$candidate"; break; fi
done
[[ -n "$BIN_FOLDER" ]] || { echo 'OpenMVS não foi localizado. Consulte o log da compilação.' >&2; exit 1; }
for app in InterfaceCOLMAP DensifyPointCloud ReconstructMesh TextureMesh; do
  [[ -x "$BIN_FOLDER/$app" ]] || { echo "Falta $app em $BIN_FOLDER" >&2; exit 1; }
done
if ! id mesa3d >/dev/null 2>&1; then useradd --system --home-dir /var/lib/mesa3d --shell /usr/sbin/nologin mesa3d; fi
install -d -o mesa3d -g mesa3d -m 0700 /var/lib/mesa3d
install -d -m 0755 /opt/mesa3d
rsync -a --delete --exclude='.env' --exclude='.env.production' --exclude='runtime-data/' --exclude='data/' --exclude='node_modules/' "$SOURCE_DIR/" /opt/mesa3d/
cd /opt/mesa3d
npm ci --omit=dev
if [[ ! -f /etc/mesa3d.env ]]; then
  read -r -p 'Domínio apontando para esta VM (ex.: mesa3d.duckdns.org): ' domain
  [[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]] || { echo 'Domínio inválido.' >&2; exit 1; }
  read -r -p 'E-mail de administrador: ' owner_email
  [[ "$owner_email" =~ ^[^[:space:]@=]+@[^[:space:]@=]+\.[^[:space:]@=]+$ ]] || { echo 'E-mail inválido.' >&2; exit 1; }
  owner_password="$(openssl rand -hex 18)"
  pilot_code="$(openssl rand -hex 12)"
  encryption_key="$(openssl rand -hex 32)"
  umask 077
  cat > /etc/mesa3d.env <<CONFIG
HOST=127.0.0.1
PORT=8080
NODE_ENV=production
MESA3D_DATA_DIR=/var/lib/mesa3d
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
MESA3D_3D_BIN_DIR=$BIN_FOLDER
MESA3D_3D_THREADS=2
OMP_NUM_THREADS=2
CONFIG
  chmod 600 /etc/mesa3d.env
  printf '\nSENHA ADMIN: %s\nCONVITE: %s\nGUARDE EM LOCAL SEGURO.\n' "$owner_password" "$pilot_code"
fi
# A variável MESA3D_3D_BIN_DIR aponta somente para binários OpenMVS; colmap usa PATH.
cat > /etc/systemd/system/mesa3d.service <<'SERVICE'
[Unit]
Description=Mesa3D Atelier com fotogrametria por CPU
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=mesa3d
Group=mesa3d
WorkingDirectory=/opt/mesa3d
EnvironmentFile=/etc/mesa3d.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StateDirectory=mesa3d
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/mesa3d
[Install]
WantedBy=multi-user.target
SERVICE
DOMAIN="$(sed -n 's/^PUBLIC_BASE_URL=https:\/\///p' /etc/mesa3d.env | head -n 1)"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8080
}
CADDY
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now mesa3d caddy
systemctl restart mesa3d caddy
sleep 3
systemctl is-active --quiet mesa3d || { journalctl -u mesa3d -n 60 --no-pager; exit 1; }
echo "Site: https://$DOMAIN"
echo "Verifique o motor: cd /opt/mesa3d && node --input-type=module -e 'import {nativeStatus} from \"./local-3d.js\"; console.log(nativeStatus())'"
echo 'Acesse /laboratorio-3d.html e confirme status Pronto antes de enviar fotos.'
