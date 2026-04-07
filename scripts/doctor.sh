#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "ROOT=$ROOT_DIR"

for cmd in node ffmpeg python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "ok: $cmd -> $(command -v "$cmd")"
  else
    echo "missing: $cmd"
  fi
done

if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  echo "ok: .venv/bin/python"
else
  echo "missing: .venv/bin/python"
fi

if [ -x "$ROOT_DIR/.venv/bin/yt-dlp" ]; then
  echo "ok: .venv/bin/yt-dlp"
else
  echo "missing: .venv/bin/yt-dlp"
fi

echo
echo "env hints:"
echo "  OPENAI_API_KEY=${OPENAI_API_KEY:+set}"
echo "  SHORTS_LLM_API_KEY=${SHORTS_LLM_API_KEY:+set}"
echo "  PEXELS_API_KEY=${PEXELS_API_KEY:+set}"
echo "  PIXABAY_API_KEY=${PIXABAY_API_KEY:+set}"
