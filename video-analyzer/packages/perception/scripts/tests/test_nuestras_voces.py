"""Tests for nuestras_voces (who speaks when)."""
import os
import sys
import tempfile
import unittest
import urllib.request

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from nuestras_voces.diarize import _windows, merge_alike, spectral_cluster  # noqa: E402
from nuestras_voces import fbank  # noqa: E402
from nuestras_voces.fbank import kaldi_fbank  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "..", "..", "test", "fixtures-speech.wav")
# pyannote-audio's tutorial sample: 30 s, two people on the phone, with the
# true turns in sample.rttm (MIT, github.com/pyannote/pyannote-audio).
SAMPLE = "https://raw.githubusercontent.com/pyannote/pyannote-audio/main/tutorials/assets/sample"


def _voices(n_per: int, k: int, seed: int = 0, spread: float = 0.15) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    centers = rng.normal(size=(k, 256))
    x = np.concatenate([c + spread * np.linalg.norm(c) / 16 * rng.normal(size=(n_per, 256)) for c in centers])
    x /= np.linalg.norm(x, axis=1, keepdims=True)
    return x.astype(np.float32), np.repeat(np.arange(k), n_per)


class FbankTest(unittest.TestCase):
    def test_shape_and_frames(self):
        f = kaldi_fbank(np.zeros(16000, np.float32) + 0.01 * np.sin(np.arange(16000)))
        self.assertEqual(f.shape, (98, 80))  # 1 + (16000 - 400) // 160
        self.assertEqual(kaldi_fbank(np.zeros(100, np.float32)).shape, (0, 80))

    def test_blocks_give_the_same_numbers(self):
        audio = (0.1 * np.random.default_rng(1).normal(size=16000 * 3)).astype(np.float32)
        whole = kaldi_fbank(audio)
        saved = fbank.BLOCK
        try:
            fbank.BLOCK = 7
            np.testing.assert_array_equal(kaldi_fbank(audio), whole)
        finally:
            fbank.BLOCK = saved

    def test_matches_kaldi_when_available(self):
        try:
            import kaldi_native_fbank as knf
        except ImportError:
            self.skipTest("kaldi-native-fbank no instalado")
        from nuestro_whisper.audio import load_audio

        audio = load_audio(FIXTURE)
        opts = knf.FbankOptions()
        opts.frame_opts.dither = 0
        opts.frame_opts.window_type = "hamming"
        opts.mel_opts.num_bins = 80
        online = knf.OnlineFbank(opts)
        online.accept_waveform(16000, (audio * 32768).tolist())
        online.input_finished()
        ref = np.stack([online.get_frame(i) for i in range(online.num_frames_ready)])
        self.assertLess(float(np.abs(ref - kaldi_fbank(audio)).max()), 1e-3)


class ClusterTest(unittest.TestCase):
    def test_windows_cover_the_span(self):
        self.assertEqual(_windows(0, 100), [(0, 100)])
        self.assertEqual(_windows(0, 300), [(0, 150), (75, 225), (150, 300)])
        self.assertEqual(_windows(0, 320)[-1], (170, 320))  # the last one ends on the segment end

    def test_finds_the_number_of_voices(self):
        for k in (1, 2, 3):
            with self.subTest(k=k):
                x, truth = _voices(20, k)
                labels = merge_alike(x, spectral_cluster(x), 0.7)
                self.assertEqual(len(set(labels.tolist())), k)
                for g in range(k):  # every true voice lands in one group
                    self.assertEqual(len(set(labels[truth == g].tolist())), 1)

    def test_a_lone_window_joins_its_closest_voice(self):
        x, _ = _voices(10, 2)
        labels = np.array([0] * 10 + [1] * 9 + [2])
        merged = merge_alike(x, labels, 0.99)
        self.assertEqual(len(set(merged.tolist())), 2)
        self.assertEqual(merged[-1], merged[10])


def _phone_call(test: unittest.TestCase) -> tuple[np.ndarray, list[dict]]:
    """pyannote's sample as (audio, true turns). It is downloaded into a
    folder that is removed right away, so no run leaves files behind."""
    from nuestro_whisper.audio import load_audio

    with tempfile.TemporaryDirectory() as tmp:
        try:
            for ext in ("wav", "rttm"):
                urllib.request.urlretrieve(f"{SAMPLE}.{ext}", os.path.join(tmp, f"sample.{ext}"))
        except OSError as err:
            test.skipTest(f"sin red: {err}")
        turns = []
        with open(os.path.join(tmp, "sample.rttm"), encoding="utf-8") as f:
            for line in f:
                p = line.split()
                turns.append({"start": float(p[3]), "end": float(p[3]) + float(p[4]), "who": p[7]})
        return load_audio(os.path.join(tmp, "sample.wav")), turns


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")

    def assertOneLabelPerVoice(self, turns, got, voices):
        # Same person, same label; different people, different labels.
        mapping = {}
        for t, label in zip(turns, got):
            mapping.setdefault(t["who"], set()).add(label)
        self.assertEqual(len(mapping), voices)
        self.assertTrue(all(len(v) == 1 for v in mapping.values()), mapping)
        self.assertEqual(len(set.union(*mapping.values())), voices, mapping)

    def test_one_voice_is_one_speaker(self):
        from nuestras_voces import diarize_segments
        from nuestro_whisper.audio import load_audio

        audio = load_audio(FIXTURE)
        half = len(audio) / 16000 / 2
        self.assertEqual(set(diarize_segments(audio, [{"start": 0, "end": half}, {"start": half, "end": 2 * half}])), {"Hablante 1"})

    def test_two_people_on_the_phone(self):
        from nuestras_voces import diarize_segments

        audio, turns = _phone_call(self)
        self.assertOneLabelPerVoice(turns, diarize_segments(audio, turns), 2)

    def test_three_voices_over_almost_three_minutes(self):
        # Long enough for over 100 windows, where linking each window to 20 %
        # of the others tied a voice with fewer windows to the rest (hence
        # MAX_NEIGHBOURS): the phone call five times, each after a different
        # gap and with a little noise, and a third voice (the speech fixture)
        # after every call. Without the cap this came out as 2 or 4 voices
        # for 27 of 28 noise draws and gaps tried; with it, 3 every time.
        from nuestras_voces import diarize_segments
        from nuestro_whisper.audio import load_audio

        call, call_turns = _phone_call(self)
        third = load_audio(FIXTURE)
        rng = np.random.default_rng(0)
        parts, turns, t = [], [], 0.0
        for k in range(5):
            gap = np.zeros(int(16000 * 0.333 * (k + 1)), np.float32)
            t += len(gap) / 16000
            parts += [gap, call + 0.003 * rng.standard_normal(len(call)).astype(np.float32)]
            turns += [{**x, "start": t + x["start"], "end": t + x["end"]} for x in call_turns]
            t += len(call) / 16000
            parts.append(third + 0.003 * rng.standard_normal(len(third)).astype(np.float32))
            turns.append({"start": t, "end": t + len(third) / 16000, "who": "tercera"})
            t += len(third) / 16000
        audio = np.concatenate(parts)
        self.assertGreater(len(audio) / 16000, 160)
        self.assertOneLabelPerVoice(turns, diarize_segments(audio, turns), 3)


if __name__ == "__main__":
    unittest.main()
