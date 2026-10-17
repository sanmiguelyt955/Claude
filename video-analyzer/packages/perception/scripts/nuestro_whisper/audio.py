"""Audio front end: 16 kHz mono PCM -> 80-bin log-mel spectrogram.

Matches Whisper's own feature extractor: 25 ms Hann window (n_fft=400),
10 ms hop (160), Slaney-scale mel filters, log10 with an 8-decade dynamic
range clamp, then scaled to roughly [-1, 1].
"""
import subprocess

import numpy as np

SAMPLE_RATE = 16000
N_FFT = 400
HOP_LENGTH = 160
CHUNK_SECONDS = 30
N_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE  # 480000 samples per window
N_FRAMES = N_SAMPLES // HOP_LENGTH  # 3000 mel frames per window


def load_audio(path: str, ffmpeg: str = "ffmpeg") -> np.ndarray:
    """Decode any audio/video file to float32 mono 16 kHz in [-1, 1]."""
    cmd = [ffmpeg, "-nostdin", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def _hz_to_mel(f: np.ndarray) -> np.ndarray:
    # Slaney scale: linear below 1 kHz, logarithmic above.
    f = np.asarray(f, dtype=np.float64)
    f_sp = 200.0 / 3
    mels = f / f_sp
    min_log_hz = 1000.0
    min_log_mel = min_log_hz / f_sp
    logstep = np.log(6.4) / 27.0
    return np.where(f >= min_log_hz, min_log_mel + np.log(np.maximum(f, 1e-10) / min_log_hz) / logstep, mels)


def _mel_to_hz(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float64)
    f_sp = 200.0 / 3
    freqs = f_sp * m
    min_log_hz = 1000.0
    min_log_mel = min_log_hz / f_sp
    logstep = np.log(6.4) / 27.0
    return np.where(m >= min_log_mel, min_log_hz * np.exp(logstep * (m - min_log_mel)), freqs)


def mel_filters(n_mels: int = 80) -> np.ndarray:
    """Triangular Slaney-normalized mel filterbank, shape (n_mels, n_fft // 2 + 1)."""
    fft_freqs = np.linspace(0, SAMPLE_RATE / 2, N_FFT // 2 + 1)
    mel_pts = _mel_to_hz(np.linspace(_hz_to_mel(0.0), _hz_to_mel(SAMPLE_RATE / 2), n_mels + 2))
    fdiff = np.diff(mel_pts)
    ramps = mel_pts[:, None] - fft_freqs[None, :]
    lower = -ramps[:-2] / fdiff[:-1, None]
    upper = ramps[2:] / fdiff[1:, None]
    weights = np.maximum(0.0, np.minimum(lower, upper))
    # Slaney normalization: each filter has the same area.
    weights *= (2.0 / (mel_pts[2:] - mel_pts[:-2]))[:, None]
    return weights.astype(np.float32)


def log_mel_spectrogram(audio: np.ndarray, n_mels: int = 80, padding: int = N_SAMPLES) -> np.ndarray:
    """Log-mel spectrogram (n_mels, frames). `padding` zeros are appended so
    the last 30 s window is always complete, as Whisper does."""
    if padding:
        audio = np.concatenate([audio, np.zeros(padding, dtype=np.float32)])
    # Centered STFT with reflect padding, periodic Hann window.
    pad = N_FFT // 2
    padded = np.pad(audio, (pad, pad), mode="reflect")
    n_frames = 1 + (len(padded) - N_FFT) // HOP_LENGTH
    idx = np.arange(N_FFT)[None, :] + HOP_LENGTH * np.arange(n_frames)[:, None]
    window = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)
    spectrum = np.fft.rfft(padded[idx] * window, axis=-1)
    power = (np.abs(spectrum[:-1]) ** 2).astype(np.float32)  # Whisper drops the last frame
    mel = mel_filters(n_mels) @ power.T
    log_spec = np.log10(np.maximum(mel, 1e-10))
    log_spec = np.maximum(log_spec, log_spec.max() - 8.0)
    return ((log_spec + 4.0) / 4.0).astype(np.float32)


def pad_or_trim(mel: np.ndarray, length: int = N_FRAMES) -> np.ndarray:
    if mel.shape[-1] > length:
        return mel[:, :length]
    if mel.shape[-1] < length:
        return np.pad(mel, ((0, 0), (0, length - mel.shape[-1])))
    return mel
