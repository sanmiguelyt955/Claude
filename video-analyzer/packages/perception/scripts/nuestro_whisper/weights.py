"""Checkpoint loading: our own safetensors reader plus the download.

safetensors is a simple format: an 8-byte little-endian header size, a JSON
header mapping each tensor to its dtype/shape/byte range, then raw bytes.
Reading it ourselves keeps the engine free of torch/safetensors packages.
"""
import json
import os
import struct

import numpy as np

_DTYPES = {"F32": np.float32, "F16": np.float16}

# Names accepted for WHISPER_MODEL, mapped to their Hugging Face repos.
MODEL_REPOS = {
    "tiny": "openai/whisper-tiny",
    "base": "openai/whisper-base",
    "small": "openai/whisper-small",
    "medium": "openai/whisper-medium",
    "large-v3": "openai/whisper-large-v3",
    "large-v3-turbo": "openai/whisper-large-v3-turbo",
}
FILES = ["model.safetensors", "config.json", "vocab.json", "added_tokens.json"]


def read_safetensors(path: str) -> dict:
    """Memory-maps the file and returns float32 arrays keyed by tensor name."""
    with open(path, "rb") as f:
        header_size = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(header_size))
    data = np.memmap(path, dtype=np.uint8, mode="r", offset=8 + header_size)
    tensors = {}
    for name, info in header.items():
        if name == "__metadata__":
            continue
        dtype = _DTYPES.get(info["dtype"])
        if dtype is None:
            raise ValueError(f"dtype no soportado en {name}: {info['dtype']}")
        start, end = info["data_offsets"]
        arr = np.frombuffer(data[start:end], dtype=dtype).reshape(info["shape"])
        tensors[name] = arr.astype(np.float32)
    return tensors


def model_dir(model: str) -> str:
    """A local folder with the checkpoint files: either `model` itself, or
    the Hugging Face repo for that size, downloaded once into the HF cache."""
    if os.path.isdir(model):
        return model
    repo = MODEL_REPOS.get(model, model)
    from huggingface_hub import snapshot_download  # only needed to fetch

    return snapshot_download(repo, allow_patterns=FILES)
