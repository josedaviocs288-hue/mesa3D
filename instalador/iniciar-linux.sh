#!/usr/bin/env bash
# Inicia o servidor local sem depender do terminal aberto.
set -Eeuo pipefail
cd -- "$(dirname -- "$(readlink -f -- "$0")")/.."
node="$(pwd)/.mesa3d/node/bin/node"
if [[ ! -x "$node" || ! -f .env || ! -d node_modules/express ]]; then
  echo 'Mesa3D nao instalado. Abra Instalar-Mesa3D-Linux.sh primeiro.' >&2
  exit 1
fi
export PATH="$(pwd)/.mesa3d/node/bin:$PATH"
# Carregar libs do OpenMVS empacotadas junto dos binarios, inclusive apos reiniciar.
if [[ -d .mesa3d/openmvs ]]; then
  while IFS= read -r -d '' lib; do
    dir="$(dirname "$lib")"
    case ":${LD_LIBRARY_PATH:-}:" in *":$dir:"*) ;; *) export LD_LIBRARY_PATH="$dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ;; esac
  done < <(find .mesa3d/openmvs -type f -name '*.so*' -print0)
fi
health(){
  "$node" -e 'fetch("http://127.0.0.1:8080/api/health",{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).then(j=>process.exit(j.ok===true?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1
}
mkdir -p data
if ! health; then
  nohup "$node" --env-file=.env server.js >> data/servidor-saida.log 2>> data/servidor-erros.log < /dev/null &
  pid=$!
  for ((i=0; i<50; i++)); do
    if health; then break; fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo 'O servidor parou inesperadamente. Veja data/servidor-erros.log' >&2
      tail -n 15 data/servidor-erros.log >&2 || true
      exit 1
    fi
    sleep 0.4
  done
fi
if ! health; then
  echo 'O servidor nao respondeu na porta 8080. Veja data/servidor-erros.log' >&2
  exit 1
fi
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open 'http://127.0.0.1:8080/acesso.html' >/dev/null 2>&1 || true
  if [[ -f ACESSO-LOCAL.txt && ! -f .mesa3d/credenciais-mostradas ]]; then
    xdg-open "$(pwd)/ACESSO-LOCAL.txt" >/dev/null 2>&1 || true
    touch .mesa3d/credenciais-mostradas
  fi
fi
printf '\nMesa3D aberto: http://127.0.0.1:8080/acesso.html\n'
printf 'Login e senha locais: ACESSO-LOCAL.txt (nao compartilhe).\n'
