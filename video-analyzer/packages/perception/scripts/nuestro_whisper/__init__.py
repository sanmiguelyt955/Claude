"""Nuestro Whisper: OpenAI's Whisper re-implemented from its published
architecture in plain NumPy (no PyTorch, no CTranslate2).

What is ours: audio front end (log-mel), transformer encoder/decoder,
byte-level BPE decoding, timestamp-constrained greedy search and the
30-second windowing loop. What is not: the trained weights, which come from
the openai/whisper-* checkpoints on Hugging Face (training an ASR model from
scratch needs ~680k hours of labelled audio).
"""
from .transcribe import transcribe

__all__ = ["transcribe"]
