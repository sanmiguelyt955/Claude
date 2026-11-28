# Kokoro (ONNX) en español y portugués: prueba del 28 nov 2026

- Instalación: `python3 -m venv v && v/bin/pip install kokoro-onnx soundfile` (192 MB en total).
- Modelo: `kokoro-v1.0.int8.onnx` (92 MB) y `voices-v1.0.bin` (28 MB), de https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0. No se suben al repo.
- Voces: es `ef_dora`, `em_alex`, `em_santa`; pt-br `pf_dora`, `pm_alex`, `pm_santa`.
- Velocidad: 3.6 s de audio en 0.9 s, solo con CPU.
- Licencia: Apache 2.0, apta para uso comercial.
- Falta que Sanmi escuche `es.wav` y `pt.wav` y diga si le gusta la voz.
