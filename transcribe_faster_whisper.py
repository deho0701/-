#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: transcribe_faster_whisper.py <input_media> <output_json> [model]", file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = Path(sys.argv[2]).expanduser().resolve()
    model_name = sys.argv[3] if len(sys.argv) > 3 else "small"

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(input_path),
        vad_filter=True,
        beam_size=5,
        word_timestamps=False
    )

    data = {
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "segments": [
            {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip()
            }
            for segment in segments
            if segment.text and segment.text.strip()
        ]
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
