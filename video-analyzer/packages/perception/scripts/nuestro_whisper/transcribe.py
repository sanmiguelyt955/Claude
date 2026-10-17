"""Long-form transcription: slide a 30 s window over the audio.

After decoding a window, the next window starts where the last complete
segment ended (Whisper's "seek"), so a sentence cut at the window border is
decoded again from its start instead of being lost.
"""
import json
import os

import numpy as np

from .audio import HOP_LENGTH, N_FRAMES, SAMPLE_RATE, load_audio, log_mel_spectrogram, pad_or_trim
from .decoding import (
    LOGPROB_THRESHOLD,
    NO_SPEECH_THRESHOLD,
    TEMPERATURES,
    TimestampRules,
    decode_with_fallback,
    detect_language,
)
from .model import Whisper
from .tokenizer import Tokenizer
from .weights import model_dir, read_safetensors

SECONDS_PER_FRAME = HOP_LENGTH / SAMPLE_RATE  # 0.01 s per mel frame
INPUT_STRIDE = 2  # conv2 halves the frames: one timestamp step (0.02 s) = 2 mel frames

_loaded: dict = {}


def load_model(name: str):
    if name not in _loaded:
        directory = model_dir(name)
        with open(os.path.join(directory, "config.json"), encoding="utf-8") as f:
            config = json.load(f)
        model = Whisper(read_safetensors(os.path.join(directory, "model.safetensors")), config)
        tok = Tokenizer(directory)
        rules = TimestampRules(tok, config.get("suppress_tokens") or [], config.get("begin_suppress_tokens") or [220, tok.eot])
        _loaded[name] = (model, tok, rules, config)
    return _loaded[name]


def _segments(tokens: list[int], tok: Tokenizer, offset: float):
    """Splits a window's tokens on timestamp pairs. Returns (segments, consumed
    frames or None when the whole window was consumed)."""
    tb = tok.timestamp_begin
    is_ts = [t >= tb for t in tokens]
    single_ending = len(is_ts) >= 2 and not is_ts[-2] and is_ts[-1]
    pair_ends = [i + 1 for i in range(len(tokens) - 1) if is_ts[i] and is_ts[i + 1]]

    segments = []
    if pair_ends:
        bounds = pair_ends + ([len(tokens)] if single_ending else [])
        start = 0
        for end in bounds:
            piece = tokens[start:end]
            start = end
            stamps = [t for t in piece if t >= tb]
            text = tok.decode(piece).strip()
            if len(stamps) >= 2 and text:
                segments.append({
                    "start": round(offset + tok.timestamp_seconds(stamps[0]), 2),
                    "end": round(offset + tok.timestamp_seconds(stamps[-1]), 2),
                    "text": text,
                })
        if single_ending:
            return segments, None
        last_stamp = tokens[pair_ends[-1] - 1] - tb
        return segments, last_stamp * INPUT_STRIDE

    # No complete pair: one segment for the whole window.
    stamps = [t for t in tokens if t >= tb]
    text = tok.decode(tokens).strip()
    if text:
        end = tok.timestamp_seconds(stamps[-1]) if len(stamps) >= 1 and stamps[-1] != (stamps[0] if len(stamps) == 1 else None) else None
        start = tok.timestamp_seconds(stamps[0]) if stamps else 0.0
        segments.append({"start": round(offset + start, 2), "end": round(offset + (end if end and end > start else start), 2), "text": text})
    return segments, None


def transcribe(
    path_or_audio,
    model: str = "tiny",
    language: str | None = None,
    beam_size: int = 5,
    temperatures=TEMPERATURES,
    best_of: int = 5,
    seed: int = 0,
) -> dict:
    """Returns {"language": code, "segments": [{"start", "end", "text", "temperature"}]}.

    beam_size=5 is Whisper's usual setting; 1 is plain greedy decoding
    (faster, slightly less accurate on hard audio). `temperatures` is the
    retry ladder for windows that come out repetitive or unsure; pass (0.0,)
    to disable retries. `seed` makes the sampled retries reproducible."""
    rng = np.random.default_rng(seed)
    whisper, tok, rules, _ = load_model(model)
    audio = load_audio(path_or_audio) if isinstance(path_or_audio, str) else np.asarray(path_or_audio, np.float32)
    mel = log_mel_spectrogram(audio)
    content_frames = len(audio) // HOP_LENGTH

    segments: list[dict] = []
    seek = 0
    lang_code = language
    while seek < content_frames:
        window_frames = min(N_FRAMES, content_frames - seek)
        features = whisper.encode(pad_or_trim(mel[:, seek : seek + N_FRAMES]))
        if lang_code is None:
            lang_code = detect_language(whisper, tok, features)
        decoded = decode_with_fallback(
            whisper, tok, rules, features, tok.language_token(lang_code),
            beam_size=beam_size, best_of=best_of, temperatures=temperatures, rng=rng,
        )
        tokens, avg_logprob, no_speech = decoded["tokens"], decoded["avg_logprob"], decoded["no_speech_prob"]

        offset = seek * SECONDS_PER_FRAME
        if no_speech > NO_SPEECH_THRESHOLD and avg_logprob < LOGPROB_THRESHOLD:
            seek += window_frames  # silence: nothing to keep in this window
            continue

        found, consumed = _segments(tokens, tok, offset)
        window_end = offset + window_frames * SECONDS_PER_FRAME
        for s in found:
            s["temperature"] = decoded["temperature"]
            s["end"] = min(s["end"], round(window_end, 2))
            if s["end"] < s["start"]:
                s["end"] = s["start"]
        segments.extend(found)
        seek += consumed if consumed else window_frames

    return {"language": lang_code or "en", "segments": segments}
