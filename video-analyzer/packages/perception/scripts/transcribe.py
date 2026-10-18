"""Speech-to-text engine for @cva/perception.

Prints JSON on stdout: {"language": str, "segments": [{"start", "end", "text"}]}.

Engines (--engine or WHISPER_ENGINE):
  auto            faster-whisper when it is installed, else propio (default)
  propio          our NumPy implementation of Whisper (scripts/nuestro_whisper)
  faster-whisper  the CTranslate2 build, needs `pip install faster-whisper`
Both run the same openai/whisper-* weights. On 15 minutes of speech (4 CPU
cores, model small) propio took about 14 min, faster-whisper 5 min, and
faster-whisper batched 1.6 min with the same words recognised.

faster-whisper runs on an NVIDIA graphics card when there is one (--device
auto, the default): float16 on the card, int8 on the CPU otherwise. On
Windows the CUDA libraries come from the nvidia-cublas-cu12 and
nvidia-cudnn-cu12 pip packages, which the launcher installs when it finds
nvidia-smi. Any failure on the card falls back to the CPU.
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


def split_sentences(words: list[dict], max_seconds: float = 15.0, pause: float = 0.8) -> list[dict]:
    """Words ({"start", "end", "word"}) regrouped into sentence-sized segments.

    Batched faster-whisper returns one segment per ~30 s chunk, too coarse for
    the timeline, the player jumps and the speaker labels. A segment ends at
    sentence punctuation, at a pause longer than `pause`, or once it runs
    past `max_seconds`."""
    out: list[dict] = []
    current: list[dict] = []

    def close() -> None:
        text = "".join(w["word"] for w in current).strip()
        if text:
            out.append({"start": round(current[0]["start"], 2), "end": round(current[-1]["end"], 2), "text": text})
        current.clear()

    for w in words:
        if current and (w["start"] - current[-1]["end"] > pause or w["end"] - current[0]["start"] > max_seconds):
            close()
        current.append(w)
        if w["word"].strip().endswith((".", "?", "!", "…", "。")):
            close()
    if current:
        close()
    return out


def add_cuda_dll_dirs() -> None:
    """Windows: make the pip-installed cuBLAS/cuDNN DLLs findable by CTranslate2."""
    if os.name != "nt":
        return
    try:
        import nvidia  # namespace package of nvidia-cublas-cu12 / nvidia-cudnn-cu12
    except ImportError:
        return
    for root in getattr(nvidia, "__path__", []):
        for lib in ("cublas", "cudnn", "cuda_nvrtc", "cuda_runtime"):
            bin_dir = os.path.join(root, lib, "bin")
            if os.path.isdir(bin_dir):
                os.add_dll_directory(bin_dir)
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


def pick_device(device: str) -> str:
    """auto -> cuda when CTranslate2 sees an NVIDIA card, else cpu."""
    if device != "auto":
        return device
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def run_faster_whisper_on(wav: str, model: str, language: str | None, beam_size: int, device: str, compute_type: str | None) -> dict:
    """faster-whisper on `device` (auto/cuda/cpu); a failure on the card retries on the CPU."""
    chosen = pick_device(device)
    if chosen == "cuda":
        add_cuda_dll_dirs()
        try:
            out = run_faster_whisper(wav, model, language, beam_size, "cuda", compute_type or "float16")
            return {**out, "device": "cuda"}
        except Exception as err:  # missing CUDA libraries, out of memory...
            print(f"la gráfica falló ({str(err)[:200]}); transcribiendo en el procesador", file=sys.stderr)
    out = run_faster_whisper(wav, model, language, beam_size, "cpu", compute_type if chosen == "cpu" and compute_type else "int8")
    return {**out, "device": "cpu"}


def run_faster_whisper(wav: str, model: str, language: str | None, beam_size: int, device: str, compute_type: str) -> dict:
    from faster_whisper import BatchedInferencePipeline, WhisperModel
    from nuestro_whisper.audio import load_audio

    fw = WhisperModel(model, device=device, compute_type=compute_type)
    # The audio goes in already decoded (our FFmpeg loader, 16 kHz float32):
    # faster-whisper's own decoder needs a matching PyAV, and an older PyAV
    # already installed breaks it ("unexpected keyword 'metadata_errors'").
    audio = load_audio(wav)
    if os.environ.get("WHISPER_BATCHED", "1") != "0":
        # Batched: the voiced chunks are decoded several at a time (VAD is
        # built in), about 3x faster again on CPU.
        pipeline = BatchedInferencePipeline(model=fw)
        segments, info = pipeline.transcribe(
            audio, language=language, beam_size=beam_size, word_timestamps=True,
            batch_size=int(os.environ.get("WHISPER_BATCH_SIZE", "8")),
        )
    else:
        # Silero VAD only drops silences over 2 s by default (faster-whisper
        # README); 0.5 s also skips the pauses between sentences.
        segments, info = fw.transcribe(
            audio, language=language, beam_size=beam_size, vad_filter=True, word_timestamps=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
    words = [{"start": w.start, "end": w.end, "word": w.word} for s in segments for w in (s.words or [])]
    return {"language": info.language, "segments": split_sentences(words)}


def has_faster_whisper() -> bool:
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default=None)
    parser.add_argument("--engine", default=os.environ.get("WHISPER_ENGINE") or "auto", choices=["auto", "propio", "faster-whisper"])
    parser.add_argument("--beam-size", type=int, default=int(os.environ.get("WHISPER_BEAM_SIZE", "5")))
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        default=os.environ.get("WHISPER_TEMPERATURE_FALLBACK", "1") == "0",
        help="no reintentar a mayor temperatura las ventanas repetitivas o con baja confianza",
    )
    parser.add_argument("--device", default=os.environ.get("WHISPER_DEVICE") or "auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--compute-type", default=os.environ.get("WHISPER_COMPUTE_TYPE") or None, help="float16 en la gráfica e int8 en el procesador si se omite")
    args = parser.parse_args()

    engine = args.engine
    if engine == "auto":
        engine = "faster-whisper" if has_faster_whisper() else "propio"
    if engine == "propio":
        out = run_propio(args.wav, args.model, args.language, args.beam_size, not args.no_fallback)
    else:
        out = run_faster_whisper_on(args.wav, args.model, args.language, args.beam_size, args.device, args.compute_type)
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    sys.exit(main())
