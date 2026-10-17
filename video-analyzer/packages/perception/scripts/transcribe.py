"""Speech-to-text engine for @cva/perception.

Prints JSON on stdout: {"language": str, "segments": [{"start", "end", "text"}]}.
Engine: faster-whisper (CTranslate2 build of OpenAI's Whisper weights).
"""
import argparse
import json
import sys

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default=None)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(args.wav, language=args.language, vad_filter=True)
    out = {
        "language": info.language,
        "segments": [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
        ],
    }
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    sys.exit(main())
