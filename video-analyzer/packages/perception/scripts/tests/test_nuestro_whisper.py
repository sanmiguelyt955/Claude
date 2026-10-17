"""Tests for our NumPy Whisper. Run: python3 -m unittest discover -s packages/perception/scripts/tests

The end-to-end test downloads openai/whisper-tiny (~150 MB) on first run.
"""
import os
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from nuestro_whisper.audio import N_FRAMES, log_mel_spectrogram, mel_filters, pad_or_trim  # noqa: E402
from nuestro_whisper.decoding import (  # noqa: E402
    TimestampRules,
    beam_search_decode,
    compression_ratio,
    decode_with_fallback,
    greedy_decode,
    sample_decode,
)
from nuestro_whisper.model import gelu, layer_norm  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "..", "test", "fixtures-speech.wav")


class FakeTok:
    """Just the ids TimestampRules needs, laid out like Whisper's vocabulary."""

    eot = 50257
    sot = 50258
    translate = 50358
    transcribe = 50359
    no_timestamps = 50363
    timestamp_begin = 50364
    vocab = 51865


class AudioTest(unittest.TestCase):
    def test_mel_filters_shape_and_area(self):
        f = mel_filters(80)
        self.assertEqual(f.shape, (80, 201))
        self.assertTrue((f >= 0).all())
        # Every filter has some weight (none collapsed to zero width).
        self.assertTrue((f.sum(axis=1) > 0).all())

    def test_log_mel_range_and_padding(self):
        tone = np.sin(2 * np.pi * 440 * np.arange(16000) / 16000).astype(np.float32)
        mel = log_mel_spectrogram(tone)
        self.assertEqual(mel.shape[0], 80)
        self.assertEqual(mel.shape[1], (16000 + 480000) // 160)
        self.assertLessEqual(mel.max() - mel.min(), 2.0 + 1e-6)  # 8 decades / 4
        self.assertEqual(pad_or_trim(mel).shape, (80, N_FRAMES))

    def test_matches_faster_whisper_features_when_available(self):
        try:
            from faster_whisper.feature_extractor import FeatureExtractor
        except ImportError:
            self.skipTest("faster-whisper no instalado")
        rng = np.random.default_rng(0)
        audio = (rng.standard_normal(16000 * 3) * 0.1).astype(np.float32)
        ours = log_mel_spectrogram(audio)
        ref = FeatureExtractor(feature_size=80)(audio, padding=480000)
        n = min(ours.shape[1], ref.shape[1])
        self.assertLess(float(np.abs(ours[:, :n] - ref[:, :n]).max()), 1e-4)


class ModelOpsTest(unittest.TestCase):
    def test_float32_is_preserved(self):
        # NumPy 2 promotes float32 * np.float64 scalar to float64, which made
        # decoding 40x slower; every op must keep float32.
        x = np.linspace(-3, 3, 16, dtype=np.float32).reshape(2, 8)
        self.assertEqual(gelu(x).dtype, np.float32)
        self.assertEqual(layer_norm(x, np.ones(8, np.float32), np.zeros(8, np.float32)).dtype, np.float32)

    def test_gelu_matches_exact_formula(self):
        import math

        xs = np.linspace(-5, 5, 101, dtype=np.float32)
        exact = np.array([0.5 * v * (1 + math.erf(v / math.sqrt(2))) for v in xs.astype(float)])
        self.assertLess(float(np.abs(gelu(xs) - exact).max()), 1e-5)


class TimestampRulesTest(unittest.TestCase):
    def setUp(self):
        self.tok = FakeTok()
        self.rules = TimestampRules(self.tok, suppress=[], begin_suppress=[220, self.tok.eot])
        self.tb = self.tok.timestamp_begin

    def logits(self):
        return np.zeros(self.tok.vocab, dtype=np.float32)

    def test_first_token_is_an_early_timestamp(self):
        out = self.rules.apply(self.logits(), [])
        allowed = np.flatnonzero(np.isfinite(out))
        self.assertTrue((allowed >= self.tb).all())
        self.assertLessEqual(allowed.max(), self.tb + 50)  # max initial timestamp: 1.00 s

    def test_open_timestamp_must_be_closed_or_end(self):
        out = self.rules.apply(self.logits(), [self.tb, 100, self.tb + 10])
        allowed = np.flatnonzero(np.isfinite(out))
        self.assertTrue(all(t >= self.tb or t == self.tok.eot for t in allowed))
        self.assertTrue((allowed[allowed >= self.tb] >= self.tb + 10).all())

    def test_closed_pair_must_be_followed_by_text(self):
        out = self.rules.apply(self.logits(), [self.tb, 100, self.tb + 10, self.tb + 10])
        self.assertTrue(np.isinf(out[self.tb:]).all())

    def test_timestamps_never_go_back(self):
        logits = self.logits()
        logits[self.tb + 3] = 50.0  # the model "wants" an earlier time
        out = self.rules.apply(logits, [self.tb + 20, 100])
        self.assertTrue(np.isinf(out[self.tb : self.tb + 21]).all())

    def test_strong_timestamp_mass_forces_a_timestamp(self):
        logits = self.logits()
        logits[self.tb :] = 5.0  # timestamps jointly far more likely than any word
        out = self.rules.apply(logits, [self.tb, 100])
        self.assertTrue(np.isinf(out[: self.tb]).all())


class PassRules:
    """No timestamp grammar: lets the search tests look at the search alone."""

    def apply(self, logits, generated):
        return logits


class ToyModel:
    """A 'model' whose next-token distribution depends only on the last token.

    After the prompt: A (0.6) or B (0.4). After A the mass is spread thin, the
    best continuation is C (0.3), and after C <|endoftext|> is again only 0.3.
    After B, <|endoftext|> has 0.95. Greedy takes A, C, end: log(0.6*0.3*0.3)
    = -2.92, or -1.46 per token. Beam search keeps B alive and finds
    log(0.4*0.95) = -0.97 per token, the better transcript even after the
    length normalisation that ranks finished beams.
    """

    A, B, C = 10, 11, 12

    def __init__(self, tok):
        self.tok = tok
        self.rows = []

    def _dist(self, last):
        out = np.full(FakeTok.vocab, -np.inf, dtype=np.float32)
        table = {
            self.tok.transcribe: {self.A: 0.6, self.B: 0.4},
            self.A: {self.C: 0.3, self.tok.eot: 0.29, 20: 0.21, 21: 0.2},
            self.B: {self.tok.eot: 0.95, self.C: 0.05},
            self.C: {self.tok.eot: 0.3, 22: 0.25, 23: 0.25, 24: 0.2},
        }.get(last, {self.tok.eot: 1.0})
        for t, prob in table.items():
            out[t] = np.log(prob)
        return out

    def new_cache(self, _features):
        return {"rows": None}

    @staticmethod
    def reorder_cache(cache, source):
        cache["source"] = list(source)

    def decode(self, tokens, cache):
        rows = [tokens] if tokens and not isinstance(tokens[0], list) else tokens
        return np.stack([self._dist(r[-1]) for r in rows])


class BeamSearchTest(unittest.TestCase):
    def setUp(self):
        self.tok = FakeTok()
        self.tok.no_speech = None
        self.model = ToyModel(self.tok)

    def test_beam_search_escapes_the_greedy_trap(self):
        greedy, _, _ = greedy_decode(self.model, self.tok, PassRules(), None, language=50259)
        beam, beam_lp, _ = beam_search_decode(self.model, self.tok, PassRules(), None, language=50259, beam_size=3)
        self.assertEqual(greedy, [ToyModel.A, ToyModel.C])
        self.assertEqual(beam, [ToyModel.B])
        self.assertAlmostEqual(beam_lp * 2, np.log(0.4 * 0.95), places=4)

    def test_beam_size_one_is_greedy(self):
        greedy = greedy_decode(self.model, self.tok, PassRules(), None, language=50259)
        same = beam_search_decode(self.model, self.tok, PassRules(), None, language=50259, beam_size=1)
        self.assertEqual(greedy[0], same[0])


class LoopModel:
    """Gets stuck repeating one word at temperature 0, like Whisper on noise.

    Confident mode, after any token: X 0.5, four other words 0.11 each, and
    <|endoftext|> only 0.06. With beam_size=3 every beam proposes its 4 best
    tokens, so <|endoftext|> never makes the cut: beam search runs to the
    224-token limit and the best beam is "la la la ...", a repetition loop.
    Unsure mode spreads the probability over 300 words, so anything it writes
    has a low log-probability. `no_speech` is the model's belief that the
    window is silent.
    """

    X = 10

    def __init__(self, tok, no_speech=0.1, confident=True):
        self.tok, self.no_speech, self.confident = tok, no_speech, confident

    def _dist(self, last):
        out = np.full(FakeTok.vocab, -np.inf, dtype=np.float32)
        if last == self.tok.sot:
            table = {self.tok.no_speech: self.no_speech, self.tok.eot: 1 - self.no_speech}
        elif self.confident:
            table = {self.X: 0.5, 20: 0.11, 21: 0.11, 22: 0.11, 23: 0.11, self.tok.eot: 0.06}
        else:
            table = {t: 0.9 / 300 for t in range(100, 400)} | {self.tok.eot: 0.1}
        for t, prob in table.items():
            out[t] = np.log(prob)
        return out

    def new_cache(self, _features):
        return {}

    @staticmethod
    def reorder_cache(cache, source):
        pass

    def decode(self, tokens, cache):
        rows = [tokens] if tokens and not isinstance(tokens[0], list) else tokens
        return np.stack([self._dist(r[-1]) for r in rows])


class LoopTok(FakeTok):
    no_speech = 50362

    def decode(self, ids):
        return " ".join("la" if i == LoopModel.X else f"w{i}" for i in ids if i < self.eot)


class TemperatureFallbackTest(unittest.TestCase):
    def setUp(self):
        self.tok = LoopTok()

    def run_fallback(self, model, **kw):
        return decode_with_fallback(model, self.tok, PassRules(), None, 50259, beam_size=3, **kw)

    def test_compression_ratio_flags_repetition(self):
        self.assertGreater(compression_ratio("gracias " * 50), 2.4)
        self.assertLess(compression_ratio("Hola, este es un video de prueba para la aplicación."), 2.4)
        self.assertEqual(compression_ratio(""), 0.0)

    def test_repetition_loop_triggers_a_retry(self):
        model = LoopModel(self.tok)
        stuck, avg_logprob, _ = beam_search_decode(model, self.tok, PassRules(), None, 50259, beam_size=3)
        self.assertEqual(len(stuck), 224)  # the trap is real: beam search never stops
        self.assertGreater(compression_ratio(self.tok.decode(stuck)), 2.4)
        self.assertGreater(avg_logprob, -1.0)  # and it is confident about it
        self.assertGreater(self.run_fallback(model)["temperature"], 0)

    def test_confident_loop_is_retried_even_if_no_speech_is_high(self):
        # Regression: found on noisy audio, where Whisper looped with no_speech
        # 0.69. A confident loop is not silence and must be retried.
        self.assertGreater(self.run_fallback(LoopModel(self.tok, no_speech=0.9))["temperature"], 0)

    def test_unsure_window_walks_the_whole_ladder(self):
        out = self.run_fallback(LoopModel(self.tok, confident=False))
        self.assertEqual(out["temperature"], 1.0)  # every temperature failed: last attempt kept
        self.assertLess(out["avg_logprob"], -1.0)

    def test_silence_is_not_retried(self):
        out = self.run_fallback(LoopModel(self.tok, no_speech=0.9, confident=False))
        self.assertEqual(out["temperature"], 0.0)

    def test_retries_disabled_with_a_single_temperature(self):
        out = self.run_fallback(LoopModel(self.tok), temperatures=(0.0,))
        self.assertEqual(out["temperature"], 0.0)
        self.assertGreater(out["compression_ratio"], 2.4)

    def test_sampling_is_reproducible_with_a_seed(self):
        model = LoopModel(self.tok)
        a = sample_decode(model, self.tok, PassRules(), None, 50259, 0.8, rng=np.random.default_rng(42))
        b = sample_decode(model, self.tok, PassRules(), None, 50259, 0.8, rng=np.random.default_rng(42))
        self.assertEqual(a, b)


class EndToEndTest(unittest.TestCase):
    def test_transcribes_the_fixture(self):
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        from nuestro_whisper import transcribe

        model = os.environ.get("NUESTRO_WHISPER_TEST_MODEL", "tiny")
        for beam_size in (1, 5):
            with self.subTest(beam_size=beam_size):
                out = transcribe(FIXTURE, model=model, language="en", beam_size=beam_size)
                text = " ".join(s["text"] for s in out["segments"]).lower()
                self.assertIn("quick test sentence", text)
                self.assertIn("seen and heard", text)
                first = out["segments"][0]
                self.assertLess(first["start"], 0.5)
                self.assertGreater(first["end"], 2.5)
                self.assertLess(first["end"], 4.5)

    def test_silence_before_and_after_is_skipped(self):
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        from nuestro_whisper import transcribe
        from nuestro_whisper.audio import load_audio

        speech = load_audio(FIXTURE)
        silence = np.zeros(16000 * 40, np.float32)  # 40 s: more than a whole window
        out = transcribe(np.concatenate([silence, speech, silence]), model="tiny", language="en")
        text = " ".join(s["text"] for s in out["segments"]).lower()
        self.assertIn("quick test sentence", text)
        first = out["segments"][0]
        self.assertGreater(first["start"], 39.5)  # times stay absolute after the jump
        self.assertLess(first["start"], 40.5)
        self.assertLess(out["segments"][-1]["end"], 40 + len(speech) / 16000 + 1)

    def test_voiced_frames_ignores_silence_but_not_a_soft_voice(self):
        from nuestro_whisper.transcribe import voiced_frames

        t = np.arange(16000) / 16000
        soft = (0.01 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)  # about -43 dBFS
        audio = np.concatenate([np.zeros(16000, np.float32), soft])
        voiced = voiced_frames(audio)
        self.assertEqual(int(voiced[0]), 100)
        self.assertEqual(len(voiced), 100)

    def test_detects_language(self):
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        from nuestro_whisper import transcribe

        self.assertEqual(transcribe(FIXTURE, model="tiny")["language"], "en")


if __name__ == "__main__":
    unittest.main()
