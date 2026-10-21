"""Tests for scripts/transcribe.py: sentence splitting and the faster-whisper engine."""
import json
import os
import subprocess
import sys
import types
import unittest
from unittest import mock

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))

import transcribe  # noqa: E402
from transcribe import parakeet_words, split_sentences, within  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "..", "test", "fixtures-speech.wav")


def w(start, end, word):
    return {"start": start, "end": end, "word": word}


class EmitTest(unittest.TestCase):
    def test_output_is_utf8_even_when_the_console_code_page_is_not(self):
        # Windows pipes use the ANSI code page (cp1252) unless told otherwise.
        code = "import transcribe; transcribe.emit({'text': 'Sí, la niña dijo 日本'})"
        out = subprocess.run(
            [sys.executable, "-c", code], cwd=os.path.join(HERE, ".."), capture_output=True, check=True,
            env={**os.environ, "PYTHONIOENCODING": "cp1252"},
        )
        self.assertEqual(json.loads(out.stdout.decode("utf-8"))["text"], "Sí, la niña dijo 日本")


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

    def test_a_long_line_is_cut_after_its_last_comma(self):
        # 10 s of speech with a comma at 4.9 s: the line ends on the comma
        # instead of mid-phrase at 7.9 s, and no word is lost.
        words = [w(i * 0.5, i * 0.5 + 0.4, " frase," if i == 9 else " palabra") for i in range(20)]
        out = split_sentences(words)
        self.assertEqual([(s["start"], s["end"]) for s in out], [(0, 4.9), (5.0, 9.9)])
        self.assertTrue(out[0]["text"].endswith("frase,"))
        self.assertEqual(" ".join(s["text"] for s in out).split(), [x["word"].strip() for x in words])

    def test_a_comma_too_early_to_help_keeps_the_hard_cut(self):
        # The words after the comma plus the next one would still pass 8 s.
        words = [w(0, 0.3, " Bueno,"), w(0.4, 4.0, " largo"), w(4.1, 7.9, " otro"), w(8.0, 8.9, " fin")]
        self.assertEqual(split_sentences(words), [
            {"start": 0, "end": 7.9, "text": "Bueno, largo otro"},
            {"start": 8.0, "end": 8.9, "text": "fin"},
        ])

    def test_word_times_never_pass_the_end_of_the_audio(self):
        words = within([w(1.0, 2.0, " uno"), w(2.5, 3.4, " dos"), w(3.1, 3.3, " tres")], 3.0)
        self.assertEqual([(x["start"], x["end"]) for x in words], [(1.0, 2.0), (2.5, 3.0), (3.0, 3.0)])
        # 900.008 s rounded would be 900.01, past the end: capped at 900.0.
        out = split_sentences(within([w(898.56, 900.32, " eficacia...")], 900.008438))
        self.assertEqual((out[-1]["start"], out[-1]["end"]), (898.56, 900.0))


class LanguagePerChunkTest(unittest.TestCase):
    """Without a language every chunk is decoded in its own: English dialogue
    in a Spanish video used to come out translated into Spanish."""

    def run_engine(self, language, batched):
        calls = []

        def recorder(kind):
            def transcribe_(self, audio, **kwargs):
                calls.append((kind, kwargs))
                return [], types.SimpleNamespace(language=language or "es")

            return transcribe_

        # A stand-in faster_whisper that records how it was called.
        fake = types.SimpleNamespace(
            WhisperModel=type("WhisperModel", (), {"__init__": lambda self, *a, **k: None, "transcribe": recorder("plain")}),
            BatchedInferencePipeline=type("BatchedInferencePipeline", (), {"__init__": lambda self, model: None, "transcribe": recorder("batched")}),
        )
        with mock.patch.dict(sys.modules, {"faster_whisper": fake}), mock.patch.dict(os.environ, {"WHISPER_BATCHED": "1" if batched else "0"}):
            transcribe.run_faster_whisper([0.0] * 16000, "tiny", language, 5, "cpu", "int8")
        (kind, kwargs), = calls
        self.assertEqual(kind, "batched" if batched else "plain")
        return kwargs

    def test_no_language_detects_it_per_chunk(self):
        for batched in (True, False):
            with self.subTest(batched=batched):
                kwargs = self.run_engine(None, batched)
                self.assertIsNone(kwargs["language"])
                self.assertTrue(kwargs["multilingual"])

    def test_a_given_language_is_kept_for_the_whole_file(self):
        for batched in (True, False):
            with self.subTest(batched=batched):
                kwargs = self.run_engine("es", batched)
                self.assertEqual(kwargs["language"], "es")
                self.assertFalse(kwargs["multilingual"])


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

    def test_the_language_is_detected_when_not_given(self):
        # The app never gives one: every Parakeet transcript used to say "es".
        try:
            import sherpa_onnx  # noqa: F401
            import faster_whisper  # noqa: F401
        except ImportError:
            self.skipTest("sherpa-onnx o faster-whisper no instalados")
        if os.environ.get("NUESTRO_WHISPER_SKIP_DOWNLOAD"):
            self.skipTest("descarga desactivada")
        out = subprocess.run(
            [sys.executable, os.path.join(HERE, "..", "transcribe.py"), FIXTURE, "--model", "tiny", "--engine", "parakeet"],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(out.stdout)
        self.assertEqual((data["engine"], data["language"]), ("parakeet", "en"))


if __name__ == "__main__":
    unittest.main()
