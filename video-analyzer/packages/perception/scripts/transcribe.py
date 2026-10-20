"""Speech-to-text engine for @cva/perception.

Prints JSON on stdout: {"language": str, "segments": [{"start", "end", "text"}]}.

Engines (--engine or WHISPER_ENGINE):
  auto            faster-whisper when it is installed, else propio (default)
  propio          our NumPy implementation of Whisper (scripts/nuestro_whisper)
  faster-whisper  the CTranslate2 build, needs `pip install faster-whisper`
  parakeet        NVIDIA Parakeet TDT 0.6B v3 (int8 ONNX) through sherpa-onnx;
                  25 European languages. Opt-in only: on 15 min of a Spanish
                  documentary (4 CPU cores, 19 Oct 2026) it took 82 s against
                  127 s for batched Whisper small, but it cannot be told the
                  language and switched 7 of 162 sentences to English
                  ("is possible that along the comamos pizzas") and invented
                  an English line over the opening music; Whisper got them right.
propio and faster-whisper run the same openai/whisper-* weights. On 15 minutes of speech (4 CPU
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


def split_sentences(words: list[dict], max_seconds: float = 8.0, pause: float = 0.8) -> list[dict]:
    """Words ({"start", "end", "word"}) regrouped into sentence-sized segments.

    Batched faster-whisper returns one segment per ~30 s chunk, too coarse for
    the timeline, the player jumps and the speaker labels. A segment ends at
    sentence punctuation, at a pause longer than `pause`, or once it runs
    past `max_seconds` (8 s: the protocol V6.5 limit for one transcript line,
    so a long line cannot hide the words it skipped)."""
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
        # On the card there is room for the best model: large-v3-turbo in
        # int8_float16 fits a 4 GB laptop GPU and transcribes better than
        # small does on the CPU. WHISPER_GPU_MODEL= (empty) keeps `model`.
        gpu_model = os.environ.get("WHISPER_GPU_MODEL", "large-v3-turbo") or model
        try:
            out = run_faster_whisper(wav, gpu_model, language, beam_size, "cuda", compute_type or "int8_float16")
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
            # 4, not 8: on 4 CPU cores batch 4 was ~12% faster on 15 min of
            # English and 10 min of Spanish (REA-measured, 18 Oct 2026).
            batch_size=int(os.environ.get("WHISPER_BATCH_SIZE", "4")),
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


PARAKEET_REPO = "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"


def run_parakeet(wav: str, language: str) -> dict:
    """Parakeet on the CPU: the voiced stretches (Silero VAD, the one
    faster-whisper ships) decoded in batches, word times from its tokens."""
    import sherpa_onnx
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    from huggingface_hub import snapshot_download
    from nuestro_whisper.audio import load_audio

    d = snapshot_download(PARAKEET_REPO, allow_patterns=["*.int8.onnx", "tokens.txt"])
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=os.path.join(d, "encoder.int8.onnx"),
        decoder=os.path.join(d, "decoder.int8.onnx"),
        joiner=os.path.join(d, "joiner.int8.onnx"),
        tokens=os.path.join(d, "tokens.txt"),
        model_type="nemo_transducer",
        num_threads=os.cpu_count() or 4,
    )
    audio = load_audio(wav)
    chunks = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=500, max_speech_duration_s=25, speech_pad_ms=200))
    words: list[dict] = []
    # One stretch at a time: on 4 CPU cores batches of 4 took 100 s for 15 min
    # of Spanish against 75 s one by one (REA-measured, 19 Oct 2026).
    batch = int(os.environ.get("PARAKEET_BATCH_SIZE", "1"))
    for i in range(0, len(chunks), batch):
        group = chunks[i : i + batch]
        streams = []
        for c in group:
            s = rec.create_stream()
            s.accept_waveform(16000, audio[c["start"] : c["end"]])
            streams.append(s)
        rec.decode_streams(streams)
        for c, s in zip(group, streams):
            r = s.result
            words += parakeet_words(c["start"] / 16000, r.tokens, r.timestamps, r.durations)
    return {"language": language, "segments": split_sentences(words)}


def parakeet_words(offset: float, tokens: list[str], starts: list[float], durations: list[float]) -> list[dict]:
    """Parakeet tokens of one stretch (times relative to it) as words with
    absolute times. A token opening with a space starts a word; the rest
    (word pieces, punctuation) belong to the word before it."""
    words: list[dict] = []
    for tok, ts, dur in zip(tokens, starts, durations):
        if tok.startswith(" ") or not words:
            words.append({"start": offset + ts, "end": offset + ts + dur, "word": tok if tok.startswith(" ") else " " + tok})
        else:
            words[-1]["word"] += tok
            words[-1]["end"] = offset + ts + dur
    return words


def has_faster_whisper() -> bool:
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False
    return True


def emit(out: dict) -> None:
    """The JSON as UTF-8 bytes. On Windows a piped stdout uses the ANSI code
    page (cp1252): Node then read "niña" as "ni\ufffda", and any character
    outside it (Japanese, Russian...) made the whole transcription fail."""
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default=None)
    parser.add_argument("--engine", default=os.environ.get("WHISPER_ENGINE") or "auto", choices=["auto", "propio", "faster-whisper", "parakeet"])
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
    language = args.language
    if engine == "auto":
        engine = "faster-whisper" if has_faster_whisper() else "propio"
    if engine == "parakeet":
        try:
            out = {**run_parakeet(args.wav, language or "es"), "device": "cpu", "engine": "parakeet"}
            emit(out)
            return
        except Exception as err:  # model download, sherpa-onnx missing...
            print(f"Parakeet falló ({str(err)[:200]}); transcribiendo con Whisper", file=sys.stderr)
            engine = "faster-whisper" if has_faster_whisper() else "propio"
    if engine == "propio":
        out = run_propio(args.wav, args.model, args.language, args.beam_size, not args.no_fallback)
    else:
        out = run_faster_whisper_on(args.wav, args.model, language, args.beam_size, args.device, args.compute_type)
    emit(out)


if __name__ == "__main__":
    sys.exit(main())
