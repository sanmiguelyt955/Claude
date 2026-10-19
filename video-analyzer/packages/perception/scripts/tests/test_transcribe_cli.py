"""Tests for scripts/transcribe.py: sentence splitting and the faster-whisper engine."""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))

from transcribe import parakeet_words, split_sentences  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "..", "test", "fixtures-speech.wav")


def w(start, end, word):
    return {"start": start, "end": end, "word": word}


class SplitSentencesTest(unittest.TestCase):
    def test_ends_at_punctuation_and_pauses(self):
        words = [w(0, 0.4, " Hola"), w(0.4, 0.8, " mundo."), w(0.9, 1.2, " Sigo"), w(1.2, 1.5, " aquí"), w(3.0, 3.4, " después")]
        self.assertEqual(split_sentences(words), [
            {"start": 0, "end": 0.8, "text": "Hola mundo."},
            {"start": 0.9, "end": 1.5, "text": "Sigo aquí"},
            {"start": 3.0, "end": 3.4, "text": "después"},
        ])

    def test_long_run_on_speech_is_cut(self):
        words = [w(i * 0.5, i * 0.5 + 0.4, " palabra") for i in range(70)]  # 35 s with no stop
        out = split_sentences(words, max_seconds=15)
        self.assertGreaterEqual(len(out), 3)
        self.assertTrue(all(s["end"] - s["start"] <= 15 for s in out))

    def test_nothing_in_nothing_out(self):
        self.assertEqual(split_sentences([]), [])


class FasterWhisperEngineTest(unittest.TestCase):
    def test_batched_engine_gives_sentences_with_times(self):
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            self.skipTest("faster-whisper no instalado")
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        out = subprocess.run(
            [sys.executable, os.path.join(HERE, "..", "transcribe.py"), FIXTURE, "--model", "tiny", "--language", "en", "--engine", "faster-whisper"],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(out.stdout)
        text = " ".join(s["text"] for s in data["segments"]).lower()
        self.assertIn("quick test sentence", text)
        self.assertLess(data["segments"][0]["start"], 1.0)
        self.assertTrue(all(s["end"] >= s["start"] for s in data["segments"]))


class ParakeetEngineTest(unittest.TestCase):
    def test_tokens_become_words_with_absolute_times(self):
        words = parakeet_words(10.0, [" No", " preg", "unt", "es", ",", " qué"], [0.0, 0.24, 0.48, 0.64, 0.8, 0.88], [0.24, 0.24, 0.16, 0.16, 0.08, 0.16])
        self.assertEqual([x["word"] for x in words], [" No", " preguntes,", " qué"])
        self.assertAlmostEqual(words[1]["start"], 10.24)
        self.assertAlmostEqual(words[1]["end"], 10.88)

    def test_speech_through_the_cli(self):
        try:
            import sherpa_onnx  # noqa: F401
            import faster_whisper  # noqa: F401
        except ImportError:
            self.skipTest("sherpa-onnx o faster-whisper no instalados")
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        out = subprocess.run(
            [sys.executable, os.path.join(HERE, "..", "transcribe.py"), FIXTURE, "--language", "en", "--engine", "parakeet"],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(out.stdout)
        self.assertEqual(data["engine"], "parakeet")
        self.assertIn("quick test sentence", " ".join(s["text"] for s in data["segments"]).lower())
        self.assertTrue(all(s["end"] >= s["start"] for s in data["segments"]))


if __name__ == "__main__":
    unittest.main()
