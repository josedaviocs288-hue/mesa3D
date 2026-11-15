#!/usr/bin/env bash
# Mesa3D v8.3 - Um clique para instalar no Linux Mint/Ubuntu 64 bits.
set -Eeuo pipefail
cd -- "$(dirname -- "$(readlink -f -- "$0")")"
mkdir -p data
if ! command -v python3 >/dev/null 2>&1; then
  echo 'ERRO: Python3 nao encontrado. Instale o Python 3.' >&2
  exit 1
fi
if ! python3 instalador/instalar-linux.py 2>&1 | tee data/instalacao-linux.log; then
  echo -e '\nA instalacao falhou. Leia data/instalacao-linux.log e GUIA-LINUX.md.' >&2
  if [[ -t 0 ]]; then read -r -p 'Pressione Enter para fechar...' _ || true; fi
  exit 1
fi
