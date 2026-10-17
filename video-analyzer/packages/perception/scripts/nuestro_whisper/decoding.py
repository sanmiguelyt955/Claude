"""Greedy decoding with Whisper's timestamp rules.

Whisper writes its own timestamps: the transcript of a window looks like
<|0.00|> text <|2.40|><|2.40|> more text <|5.10|>. The rules below keep that
grammar valid while decoding greedily: timestamps come in pairs, never go
backwards, the first token is a timestamp, and when the model puts more
probability on "some timestamp" than on any single text token, a timestamp
is forced.
"""
import numpy as np

from .tokenizer import Tokenizer

MAX_INITIAL_TIMESTAMP = 1.0  # seconds: the first segment must start within 1 s
SAMPLE_LEN = 224  # max generated tokens per 30 s window (half the context)


def _log_softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max()
    return x - np.log(np.exp(x).sum())


def _logsumexp(x: np.ndarray) -> float:
    m = x.max()
    if not np.isfinite(m):
        return float(m)  # every entry suppressed
    return float(m + np.log(np.exp(x - m).sum()))


class TimestampRules:
    def __init__(self, tok: Tokenizer, suppress: list[int], begin_suppress: list[int]):
        self.tok = tok
        self.suppress = np.array(sorted(set(suppress) | {tok.no_timestamps, tok.sot, tok.translate, tok.transcribe}), dtype=np.int64)
        self.begin_suppress = np.array(begin_suppress, dtype=np.int64)
        self.max_initial = tok.timestamp_begin + round(MAX_INITIAL_TIMESTAMP / 0.02)

    def apply(self, logits: np.ndarray, generated: list[int]) -> np.ndarray:
        tok = self.tok
        tb = tok.timestamp_begin
        logits = logits.copy()
        logits[self.suppress] = -np.inf
        if not generated:
            logits[self.begin_suppress] = -np.inf

        last_ts = len(generated) >= 1 and generated[-1] >= tb
        penultimate_ts = len(generated) < 2 or generated[-2] >= tb
        if last_ts:
            if penultimate_ts:
                logits[tb:] = -np.inf  # a closed pair: text (or the end) must follow
            else:
                logits[: tok.eot] = -np.inf  # an open timestamp: close it or end

        stamps = [t for t in generated if t >= tb]
        if stamps:
            # Never go back in time; after a closing timestamp, strictly forward.
            floor = stamps[-1] if (last_ts and not penultimate_ts) else stamps[-1] + 1
            logits[tb:floor] = -np.inf

        if not generated:
            logits[:tb] = -np.inf  # the transcript opens with a timestamp
            logits[self.max_initial + 1 :] = -np.inf

        logprobs = _log_softmax(logits)
        if _logsumexp(logprobs[tb:]) > logprobs[:tb].max():
            logits[:tb] = -np.inf
        return logits


def greedy_decode(model, tok: Tokenizer, rules: TimestampRules, audio_features: np.ndarray, language: int):
    """Decodes one window. Returns (generated tokens, mean logprob, no-speech prob)."""
    cache = model.new_cache(audio_features)
    first = model.decode([tok.sot], cache)
    no_speech = float(np.exp(_log_softmax(first)[tok.no_speech])) if tok.no_speech is not None else 0.0
    logits = model.decode([language, tok.transcribe], cache)

    generated: list[int] = []
    total_logprob = 0.0
    for _ in range(SAMPLE_LEN):
        filtered = rules.apply(logits, generated)
        nxt = int(np.argmax(filtered))
        total_logprob += float(_log_softmax(filtered)[nxt])
        if nxt == tok.eot:
            break
        generated.append(nxt)
        logits = model.decode([nxt], cache)
    return generated, total_logprob / max(len(generated) + 1, 1), no_speech


def detect_language(model, tok: Tokenizer, audio_features: np.ndarray) -> str:
    """Most likely language after <|startoftranscript|>, among language tokens only."""
    logits = model.decode([tok.sot], model.new_cache(audio_features))
    codes = list(tok.languages)
    ids = np.array([tok.languages[c] for c in codes])
    return codes[int(np.argmax(logits[ids]))]
