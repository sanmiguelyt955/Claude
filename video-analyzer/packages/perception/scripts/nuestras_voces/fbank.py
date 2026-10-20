"""Kaldi-compatible log mel filterbank, the input WeSpeaker models were trained on.

Same settings as `torchaudio.compliance.kaldi.fbank` with the arguments
WeSpeaker passes (read in wespeaker/cli/speaker.py): 80 bins, 25 ms frames
every 10 ms, Hamming window, no dither, on int16-scaled samples. The rest are
Kaldi's defaults: DC offset removed per frame, 0.97 pre-emphasis, FFT padded
to 512, power spectrum, mel bins between 20 Hz and Nyquist.
"""
import numpy as np

SAMPLE_RATE = 16000
FRAME_LENGTH = 400  # 25 ms
FRAME_SHIFT = 160  # 10 ms
N_FFT = 512
LOW_FREQ = 20.0
PREEMPH = 0.97


def _mel(f):
    return 1127.0 * np.log(1.0 + np.asarray(f, np.float64) / 700.0)


def _mel_banks(n_mels: int) -> np.ndarray:
    """Kaldi's triangular filters, built in mel space, over the 256 FFT bins below Nyquist."""
    high = SAMPLE_RATE / 2
    mel_low, mel_high = _mel(LOW_FREQ), _mel(high)
    delta = (mel_high - mel_low) / (n_mels + 1)
    centers = mel_low + delta * np.arange(n_mels + 2)
    bin_mel = _mel(np.arange(N_FFT // 2) * SAMPLE_RATE / N_FFT)
    left, center, right = centers[:-2, None], centers[1:-1, None], centers[2:, None]
    up = (bin_mel - left) / (center - left)
    down = (right - bin_mel) / (right - center)
    return np.maximum(0.0, np.minimum(up, down))  # (n_mels, 256)


_BANKS: dict = {}


# Frames per block: framing the whole file at once took 5 GB of RAM for an
# hour of audio; blocks give the same numbers in a fraction of it.
BLOCK = 6000


def kaldi_fbank(audio: np.ndarray, n_mels: int = 80) -> np.ndarray:
    """(frames, n_mels) log filterbank of 16 kHz float audio in [-1, 1]."""
    if len(audio) < FRAME_LENGTH:
        return np.zeros((0, n_mels), np.float32)
    n = 1 + (len(audio) - FRAME_LENGTH) // FRAME_SHIFT
    return np.concatenate([_fbank_block(audio, i, min(i + BLOCK, n), n_mels) for i in range(0, n, BLOCK)])


def _fbank_block(audio: np.ndarray, first: int, last: int, n_mels: int) -> np.ndarray:
    """Frames first..last-1 of kaldi_fbank."""
    # WeSpeaker loads int16 without normalising
    wave = np.asarray(audio[first * FRAME_SHIFT : (last - 1) * FRAME_SHIFT + FRAME_LENGTH], np.float64) * 32768.0
    idx = np.arange(FRAME_LENGTH)[None, :] + FRAME_SHIFT * np.arange(last - first)[:, None]
    frames = wave[idx]
    frames = frames - frames.mean(axis=1, keepdims=True)
    frames = np.concatenate([frames[:, :1] * (1 - PREEMPH), frames[:, 1:] - PREEMPH * frames[:, :-1]], axis=1)
    frames = frames * np.hamming(FRAME_LENGTH)
    power = np.abs(np.fft.rfft(frames, n=N_FFT)) ** 2
    if n_mels not in _BANKS:
        _BANKS[n_mels] = _mel_banks(n_mels)
    mel = power[:, : N_FFT // 2] @ _BANKS[n_mels].T
    return np.log(np.maximum(mel, np.finfo(np.float32).eps)).astype(np.float32)
