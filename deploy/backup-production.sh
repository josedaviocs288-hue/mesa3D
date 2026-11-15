#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
target="${1:-$project_dir/backups}"
mkdir -p "$target"
chmod 700 "$target"
stamp="$(date -u +%Y%m%d-%H%M%S)"
if [[ ! -f runtime-data/mesa3d.sqlite ]]; then
  echo 'Banco não encontrado em runtime-data/mesa3d.sqlite.' >&2
  exit 1
fi
python3 - "$project_dir/runtime-data/mesa3d.sqlite" "$target/mesa3d-$stamp.sqlite" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as destination:
    source.backup(destination)
PY
if [[ -d runtime-data/uploads ]]; then
  tar -czf "$target/uploads-$stamp.tar.gz" -C runtime-data uploads
fi
chmod 600 "$target/mesa3d-$stamp.sqlite" "$target/uploads-$stamp.tar.gz" 2>/dev/null || true
echo "Backup local criado em $target. Copie os arquivos para fora da VM e guarde a chave MESA3D_ENCRYPTION_KEY separadamente."
