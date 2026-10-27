"""Who speaks each transcript segment: diarize.py audio.wav segments.json

segments.json is [{"start": s, "end": s}, ...]; prints a JSON list with
"Hablante N" (or null) per segment. See nuestras_voces/diarize.py.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from nuestras_voces import diarize_segments  # noqa: E402
from nuestro_whisper.audio import load_audio  # noqa: E402


def main() -> None:
    wav, segments_path = sys.argv[1], sys.argv[2]
    with open(segments_path, encoding="utf-8") as f:
        segments = json.load(f)
    json.dump(diarize_segments(load_audio(wav), segments), sys.stdout)


if __name__ == "__main__":
    main()
