#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SKILL_DIR="$CODEX_HOME/skills/shorts-recomposer"

mkdir -p "$SKILL_DIR"

cat > "$SKILL_DIR/SKILL.md" <<EOF
---
name: shorts-recomposer
description: Use when turning a long-form video or YouTube link into short-form clips for Korean Shorts/TikTok/Reels. This skill uses the local shorts-keyword-agents project, prefers transcript-driven recomposition over raw clipping, and standardizes the workflow for download, transcription, hook/setup/body/payoff restructuring, and vertical render output.
---

# Shorts Recomposer

Project root:

- $ROOT_DIR

Primary scripts:

- $ROOT_DIR/split-longform-into-shorts.mjs
- $ROOT_DIR/render-hybrid-source-shorts.mjs
- $ROOT_DIR/generate-shorts.mjs

Transcription helper:

- $ROOT_DIR/transcribe_faster_whisper.py

## Default workflow

1. Prefer transcript-driven recomposition over raw clipping.
2. For local-only work, use \`--strategy recompose\`.
3. For stronger semantic restructuring, export the GPT packet and pass it to GPT manually.
4. Inspect:
   - \`selected.json\`
   - \`report.md\`
   - \`transcript.json\`
   - produced \`shorts/short-*.mp4\`

## Standard commands

YouTube long-form:

\`\`\`bash
cd "$ROOT_DIR"
node split-longform-into-shorts.mjs \\
  --youtube "https://www.youtube.com/watch?v=VIDEO_ID" \\
  --count 4 \\
  --min-duration 24 \\
  --max-duration 42 \\
  --target-duration 32 \\
  --template vibrant \\
  --asr-model small \\
  --strategy recompose
\`\`\`

Hybrid render from manual GPT response:

\`\`\`bash
cd "$ROOT_DIR"
node render-hybrid-source-shorts.mjs \\
  --video "/path/to/video.mp4" \\
  --packet-json "/path/to/gpt-hybrid-script-packet.json" \\
  --hybrid-script-json "/path/to/gpt-hybrid-script-response.json" \\
  --tts-provider edge
\`\`\`

Keyword-only short generation:

\`\`\`bash
cd "$ROOT_DIR"
node generate-shorts.mjs --keyword "불면증" --mock
\`\`\`
EOF

echo "Installed skill to: $SKILL_DIR/SKILL.md"
