#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$(readlink -f -- "$0")")"
node="$(pwd)/.mesa3d/node/bin/node"
if [[ ! -x "$node" || ! -f .env ]]; then
  echo 'Instale primeiro usando Instalar-Mesa3D-Linux.sh' >&2
  exit 1
fi
if [[ -d .mesa3d/openmvs ]]; then
  while IFS= read -r -d '' lib; do
    dir="$(dirname "$lib")"
    case ":${LD_LIBRARY_PATH:-}:" in *":$dir:"*) ;; *) export LD_LIBRARY_PATH="$dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ;; esac
  done < <(find .mesa3d/openmvs -type f -name '*.so*' -print0)
fi
exec "$node" --env-file=.env tools/check-local-3d.mjs
