"""Byte-level BPE detokenizer for Whisper's vocabulary, plus special tokens.

We only ever need to turn generated ids back into text (the prompt is made
of special tokens), so this implements the decoding half of GPT-2-style BPE:
every token is a string of "printable" characters that stand for raw bytes.
"""
import json
import os
import re


def _bytes_to_unicode() -> dict:
    """GPT-2's reversible map from the 256 byte values to printable chars."""
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip(bs, map(chr, cs)))


class Tokenizer:
    def __init__(self, directory: str):
        with open(os.path.join(directory, "vocab.json"), encoding="utf-8") as f:
            vocab = json.load(f)
        with open(os.path.join(directory, "added_tokens.json"), encoding="utf-8") as f:
            added = json.load(f)
        # <|endoftext|> lives in vocab.json; the other specials in added_tokens.json.
        ids = {**vocab, **added}
        self.id_to_token = {i: t for t, i in ids.items()}
        self.byte_decoder = {c: b for b, c in _bytes_to_unicode().items()}

        self.eot = ids["<|endoftext|>"]
        self.sot = ids["<|startoftranscript|>"]
        self.transcribe = ids["<|transcribe|>"]
        self.translate = ids["<|translate|>"]
        self.no_timestamps = ids["<|notimestamps|>"]
        self.timestamp_begin = ids["<|0.00|>"]
        # "No speech" token: <|nospeech|> in newer checkpoints, <|nocaptions|> in older.
        self.no_speech = ids.get("<|nospeech|>", ids.get("<|nocaptions|>"))
        # Language tokens sit between <|startoftranscript|> and <|translate|>.
        self.languages = {
            t[2:-2]: i for t, i in ids.items() if self.sot < i < self.translate and re.fullmatch(r"<\|[a-z]{2,3}\|>", t)
        }

    def language_token(self, code: str) -> int:
        if code not in self.languages:
            raise ValueError(f"Idioma no soportado por Whisper: {code}")
        return self.languages[code]

    def decode(self, ids) -> str:
        """Text for the given ids, skipping special and timestamp tokens."""
        text = "".join(self.id_to_token[i] for i in ids if i < self.eot)
        return bytearray(self.byte_decoder[c] for c in text).decode("utf-8", errors="replace")

    def timestamp_seconds(self, token: int) -> float:
        return (token - self.timestamp_begin) * 0.02
