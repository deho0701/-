#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[1/4] checking required system commands"
missing=0
for cmd in node "$PYTHON_BIN" ffmpeg; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing: $cmd"
    missing=1
  fi
done

if ! command -v mpv >/dev/null 2>&1; then
  echo "optional missing: mpv"
fi

if [ "$missing" -ne 0 ]; then
  echo
  echo "Install required system packages first."
  echo "Ubuntu/Debian:"
  echo "  sudo apt update && sudo apt install -y nodejs npm python3 python3-venv ffmpeg mpv"
  echo "macOS (Homebrew):"
  echo "  brew install node python ffmpeg mpv"
  exit 1
fi

echo "[2/4] creating virtualenv"
"$PYTHON_BIN" -m venv .venv

echo "[3/4] installing python packages"
./.venv/bin/python -m pip install --upgrade pip wheel
./.venv/bin/python -m pip install -r requirements.txt

echo "[4/4] verifying local tools"
./.venv/bin/python -c "import faster_whisper, edge_tts; print('python deps ok')"
./.venv/bin/yt-dlp --version >/dev/null
node --version
ffmpeg -version | head -n 1

cat <<'EOF'

Bootstrap complete.

Useful commands:
  source .venv/bin/activate
  npm run check
  ./scripts/install_codex_skill.sh

Example:
  node split-longform-into-shorts.mjs --youtube "https://www.youtube.com/watch?v=VIDEO_ID"
EOF
