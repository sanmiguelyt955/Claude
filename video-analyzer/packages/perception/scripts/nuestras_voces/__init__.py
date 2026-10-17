"""Nuestras voces: who speaks when, on CPU, with NumPy and one ONNX model.

The speaker-embedding network is WeSpeaker's ResNet34 (VoxCeleb2, CC-BY-4.0),
run with onnxruntime; the Kaldi filterbank it expects, the windowing and the
clustering are written here.
"""
from .diarize import diarize_segments  # noqa: F401
from .fbank import kaldi_fbank  # noqa: F401
