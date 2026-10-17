"""Greedy decoding with Whisper's timestamp rules.

Whisper writes its own timestamps: the transcript of a window looks like
<|0.00|> text <|2.40|><|2.40|> more text <|5.10|>. The rules below keep that
grammar valid while decoding greedily: timestamps come in pairs, never go
backwards, the first token is a timestamp, and when the model puts more
probability on "some timestamp" than on any single text token, a timestamp
is forced.
"""
import zlib

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
    first = model.decode([tok.sot], cache)[0]
    no_speech = float(np.exp(_log_softmax(first)[tok.no_speech])) if tok.no_speech is not None else 0.0
    logits = model.decode([language, tok.transcribe], cache)[0]

    generated: list[int] = []
    total_logprob = 0.0
    for _ in range(SAMPLE_LEN):
        filtered = rules.apply(logits, generated)
        nxt = int(np.argmax(filtered))
        total_logprob += float(_log_softmax(filtered)[nxt])
        if nxt == tok.eot:
            break
        generated.append(nxt)
        logits = model.decode([nxt], cache)[0]
    return generated, total_logprob / max(len(generated) + 1, 1), no_speech


def detect_language(model, tok: Tokenizer, audio_features: np.ndarray) -> str:
    """Most likely language after <|startoftranscript|>, among language tokens only."""
    logits = model.decode([tok.sot], model.new_cache(audio_features))[0]
    codes = list(tok.languages)
    ids = np.array([tok.languages[c] for c in codes])
    return codes[int(np.argmax(logits[ids]))]


def beam_search_decode(
    model,
    tok: Tokenizer,
    rules: TimestampRules,
    audio_features: np.ndarray,
    language: int,
    beam_size: int = 5,
    patience: float = 1.0,
):
    """Beam search, as in OpenAI's BeamSearchDecoder.

    Keeps the `beam_size` best partial transcripts. At each step every beam
    proposes its `beam_size + 1` best next tokens (after the timestamp rules);
    the best proposals overall become the new beams, and proposals that end
    with <|endoftext|> are set aside as finished. Decoding stops once
    `beam_size * patience` transcripts have finished. The winner is the
    finished transcript with the best log-probability per token, so longer
    transcripts are not penalised just for having more tokens.

    All beams run through the decoder as one batch; when beams branch, the
    self-attention cache is reordered so each row keeps its own history.
    Returns (tokens, mean logprob, no-speech prob) like greedy_decode.
    """
    if beam_size <= 1:
        return greedy_decode(model, tok, rules, audio_features, language)

    cache = model.new_cache(audio_features)
    first = model.decode([tok.sot], cache)[0]
    no_speech = float(np.exp(_log_softmax(first)[tok.no_speech])) if tok.no_speech is not None else 0.0
    logits = model.decode([language, tok.transcribe], cache)  # (1, vocab): one beam to start

    beams: list[tuple[list[int], float]] = [([], 0.0)]
    finished: dict[tuple[int, ...], float] = {}
    max_finished = max(1, round(beam_size * patience))

    for _ in range(SAMPLE_LEN):
        candidates: dict[tuple[int, ...], tuple[float, int]] = {}
        for row, (seq, score) in enumerate(beams):
            logprobs = _log_softmax(rules.apply(logits[row], seq))
            top = np.argpartition(-logprobs, beam_size)[: beam_size + 1]
            for token in top:
                lp = float(logprobs[token])
                if np.isfinite(lp):
                    key = (*seq, int(token))
                    if key not in candidates or candidates[key][0] < score + lp:
                        candidates[key] = (score + lp, row)

        next_beams: list[tuple[list[int], float]] = []
        source: list[int] = []
        newly_finished: dict[tuple[int, ...], float] = {}
        for key, (score, row) in sorted(candidates.items(), key=lambda kv: kv[1][0], reverse=True):
            if key[-1] == tok.eot:
                newly_finished[key[:-1]] = score
            else:
                next_beams.append((list(key), score))
                source.append(row)
                if len(next_beams) == beam_size:
                    break

        for key in sorted(newly_finished, key=newly_finished.get, reverse=True):
            if len(finished) >= max_finished:
                break
            finished.setdefault(key, newly_finished[key])

        if len(finished) >= max_finished or not next_beams:
            break
        model.reorder_cache(cache, source)
        beams = next_beams
        logits = model.decode([[seq[-1]] for seq, _ in beams], cache)

    if len(finished) < max_finished:  # ran out of length: unfinished beams compete too
        for seq, score in beams:
            finished.setdefault(tuple(seq), score)

    best, best_score = max(finished.items(), key=lambda kv: kv[1] / max(len(kv[0]), 1))
    return list(best), best_score / (len(best) + 1), no_speech


def sample_decode(
    model,
    tok: Tokenizer,
    rules: TimestampRules,
    audio_features: np.ndarray,
    language: int,
    temperature: float,
    best_of: int = 5,
    rng: np.random.Generator | None = None,
):
    """Draws `best_of` transcripts at `temperature` and keeps the best one.

    Sampling uses the Gumbel-max trick (argmax of logits / T plus Gumbel
    noise), which draws from softmax(logits / T) for all candidates at once.
    Like Whisper, candidates are ranked by their log-probability under the
    model itself (not the tempered one), per token.
    """
    rng = rng or np.random.default_rng(0)
    cache = model.new_cache(audio_features)
    first = model.decode([tok.sot], cache)[0]
    no_speech = float(np.exp(_log_softmax(first)[tok.no_speech])) if tok.no_speech is not None else 0.0
    logits = model.decode([language, tok.transcribe], cache)
    model.reorder_cache(cache, [0] * best_of)
    logits = np.repeat(logits, best_of, axis=0)

    seqs: list[list[int]] = [[] for _ in range(best_of)]
    scores = [0.0] * best_of
    active = list(range(best_of))  # candidate index of each cache row
    for _ in range(SAMPLE_LEN):
        filtered = np.stack([rules.apply(logits[row], seqs[c]) for row, c in enumerate(active)])
        gumbel = -np.log(-np.log(rng.uniform(1e-12, 1.0, size=filtered.shape)))
        picks = np.argmax(filtered / temperature + gumbel, axis=-1)

        keep_rows, keep = [], []
        for row, c in enumerate(active):
            token = int(picks[row])
            scores[c] += float(_log_softmax(filtered[row])[token])
            if token == tok.eot:
                continue
            seqs[c].append(token)
            keep_rows.append(row)
            keep.append(c)
        if not keep:
            break
        model.reorder_cache(cache, keep_rows)
        active = keep
        logits = model.decode([[seqs[c][-1]] for c in active], cache)

    best = max(range(best_of), key=lambda c: scores[c] / max(len(seqs[c]), 1))
    return seqs[best], scores[best] / (len(seqs[best]) + 1), no_speech


def compression_ratio(text: str) -> float:
    """How much zlib shrinks the text. Repetition loops ("gracias gracias
    gracias...") compress very well, so a high ratio flags a stuck decoder."""
    data = text.encode("utf-8")
    return len(data) / len(zlib.compress(data)) if data else 0.0


# Whisper's defaults for when a window must be decoded again.
TEMPERATURES = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
COMPRESSION_RATIO_THRESHOLD = 2.4
LOGPROB_THRESHOLD = -1.0
NO_SPEECH_THRESHOLD = 0.6


def decode_with_fallback(
    model,
    tok: Tokenizer,
    rules: TimestampRules,
    audio_features: np.ndarray,
    language: int,
    beam_size: int = 5,
    best_of: int = 5,
    temperatures=TEMPERATURES,
    rng: np.random.Generator | None = None,
) -> dict:
    """Decodes a window, retrying at higher temperatures when the result looks
    broken: too repetitive (compression ratio above 2.4) or too unsure (mean
    log-probability below -1). Temperature 0 uses beam search; higher ones
    sample `best_of` candidates. A window that looks like silence (high
    no-speech probability and low confidence) is not retried. If every
    temperature fails, the last attempt is returned, as Whisper does."""
    rng = rng or np.random.default_rng(0)
    result = None
    for temperature in temperatures:
        if temperature == 0:
            tokens, avg_logprob, no_speech = beam_search_decode(model, tok, rules, audio_features, language, beam_size)
        else:
            tokens, avg_logprob, no_speech = sample_decode(
                model, tok, rules, audio_features, language, temperature, best_of, rng
            )
        ratio = compression_ratio(tok.decode(tokens))
        result = {
            "tokens": tokens,
            "avg_logprob": avg_logprob,
            "no_speech_prob": no_speech,
            "compression_ratio": ratio,
            "temperature": temperature,
        }
        needs_fallback = ratio > COMPRESSION_RATIO_THRESHOLD or avg_logprob < LOGPROB_THRESHOLD
        # Silence (the model expects no speech AND is unsure of what it wrote):
        # a higher temperature cannot help. A confident repetition loop is not
        # silence, even when no_speech is high, and must be retried.
        if no_speech > NO_SPEECH_THRESHOLD and avg_logprob < LOGPROB_THRESHOLD:
            needs_fallback = False
        if not needs_fallback:
            break
    return result
