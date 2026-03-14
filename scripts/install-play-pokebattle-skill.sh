#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/skills/play-pokebattle"
CODEX_HOME_DIR="${CODEX_HOME:-${HOME}/.codex}"
TARGET_DIR="${CODEX_HOME_DIR}/skills/play-pokebattle"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source skill directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

mkdir -p "${CODEX_HOME_DIR}/skills"
rm -rf "${TARGET_DIR}"
cp -R "${SOURCE_DIR}" "${TARGET_DIR}"

echo "Installed play-pokebattle skill to: ${TARGET_DIR}"
echo 'Invoke from Codex as: $play-pokebattle'
echo 'Or join an existing room as: $play-pokebattle <ROOM_ID>'
