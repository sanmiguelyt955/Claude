"""Speech-to-text engine for @cva/perception.

Prints JSON on stdout: {"language": str, "segments": [{"start", "end", "text"}]}.

Engines (--engine or WHISPER_ENGINE):
  propio          our NumPy implementation of Whisper (scripts/nuestro_whisper)
  faster-whisper  the CTranslate2 build, faster on CPU, needs `pip install faster-whisper`
Both run the same openai/whisper-* weights.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def run_propio(wav: str, model: str, language: str | None, beam_size: int, fallback: bool) -> dict:
    from nuestro_whisper import transcribe
    from nuestro_whisper.decoding import TEMPERATURES

    temperatures = TEMPERATURES if fallback else (0.0,)
    return transcribe(wav, model=model, language=language, beam_size=beam_size, temperatures=temperatures)


def run_faster_whisper(wav: str, model: str, language: str | None, beam_size: int, device: str, compute_type: str) -> dict:
    from faster_whisper import WhisperModel

    fw = WhisperModel(model, device=device, compute_type=compute_type)
    # Silero VAD only drops silences over 2 s by default (faster-whisper
    # README); 0.5 s also skips the pauses between sentences.
    segments, info = fw.transcribe(
        wav, language=language, beam_size=beam_size, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    return {
        "language": info.language,
        "segments": [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default=None)
    parser.add_argument("--engine", default=os.environ.get("WHISPER_ENGINE", "propio"), choices=["propio", "faster-whisper"])
    parser.add_argument("--beam-size", type=int, default=int(os.environ.get("WHISPER_BEAM_SIZE", "5")))
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        default=os.environ.get("WHISPER_TEMPERATURE_FALLBACK", "1") == "0",
        help="no reintentar a mayor temperatura las ventanas repetitivas o con baja confianza",
    )
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    if args.engine == "propio":
        out = run_propio(args.wav, args.model, args.language, args.beam_size, not args.no_fallback)
    else:
        out = run_faster_whisper(args.wav, args.model, args.language, args.beam_size, args.device, args.compute_type)
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    sys.exit(main())
