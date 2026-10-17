# Nuestro Whisper

Implementación propia de Whisper (OpenAI) en NumPy, sin PyTorch ni
CTranslate2. Vive en `packages/perception/scripts/nuestro_whisper/` y es el
motor por defecto de la etapa "escuchar" del pipeline.

## Qué es nuestro y qué no

| Parte | Origen |
|---|---|
| Espectrograma log-mel (STFT, filtros mel Slaney, normalización) | Nuestro |
| Lector de pesos `.safetensors` | Nuestro |
| Transformer: convoluciones, atención, MLP, LayerNorm, GELU | Nuestro |
| Detokenizador BPE a nivel de bytes | Nuestro |
| Búsqueda greedy con reglas de marcas de tiempo | Nuestro |
| Ventanas de 30 s con avance ("seek"), detección de idioma y de silencio | Nuestro |
| **Pesos entrenados** | `openai/whisper-*` en Hugging Face |

Entrenar un modelo de voz desde cero requiere cientos de miles de horas de
audio etiquetado y GPUs; por eso se reutilizan los pesos públicos.

## Cómo funciona Whisper (lo que aprendimos)

1. **Audio → log-mel.** 16 kHz mono; ventana Hann de 25 ms (400 muestras),
   salto de 10 ms (160); 80 filtros mel en escala Slaney; `log10`, recorte a
   8 décadas bajo el máximo y escala `(x + 4) / 4`. 30 s = 3000 cuadros.
2. **Encoder.** Dos convoluciones 1-D (la segunda con paso 2: 3000 → 1500
   posiciones), posiciones aprendidas y bloques pre-LayerNorm de
   autoatención + MLP con GELU.
3. **Decoder.** Embedding de tokens + posiciones; cada bloque tiene
   autoatención causal, atención cruzada sobre el audio y MLP. La salida usa
   la misma matriz del embedding (pesos atados).
4. **Prompt.** `<|startoftranscript|> <|es|> <|transcribe|>`. Las claves y
   valores de la atención cruzada se calculan una sola vez por ventana.
5. **Marcas de tiempo como tokens.** 1501 tokens `<|0.00|>`…`<|30.00|>`
   (pasos de 20 ms). La gramática se impone al decodificar: empieza con una
   marca (≤ 1 s), las marcas van en pares y nunca retroceden, y si la masa de
   probabilidad de "alguna marca" supera a la mejor palabra, se fuerza una.
6. **Audio largo.** La siguiente ventana empieza donde terminó el último
   segmento completo, así una frase cortada en el borde se vuelve a leer.
7. **Silencio.** Si `<|nocaptions|>`/`<|nospeech|>` supera 0.6 y la confianza
   media es baja, la ventana se descarta (evita alucinaciones).

## Verificación

Contra faster-whisper (CTranslate2) con los mismos pesos y búsqueda greedy:

- **Filtros mel:** diferencia máxima 1.9e-9 respecto a la matriz oficial.
- **Espectrograma:** idéntico bit a bit (diferencia máxima 0.0).
- **59 s de voz en español con `tiny`:** 17 de 18 segmentos idénticos en texto
  y marcas de tiempo, incluido el cruce de ventana en 28.92 s. El último
  difiere por un empate numérico ("Muchas" −1.499 vs "¡" −1.586 de log-prob),
  no por las reglas.
- **Detección de idioma:** español detectado correctamente.
- **Con `small`:** misma frase de prueba sin los errores de `tiny`
  ("mochila", "la abrimos", "cabe").

## Rendimiento (CPU, 4 núcleos)

| Modelo | 59 s de audio |
|---|---|
| tiny | ~4 s |
| small | ~26 s |

faster-whisper sigue siendo más rápido en CPU (kernels optimizados, int8).
Para usarlo: `WHISPER_ENGINE=faster-whisper` y `pip install faster-whisper`.

## Uso

```bash
# Desde el pipeline (por defecto):
WHISPER_MODEL=small npx tsx packages/perception/src/cli.ts video.mp4 ./salida

# Directo en Python:
python3 packages/perception/scripts/transcribe.py audio.wav --model small --language es

# Pruebas:
npm run test:whisper
```

Dependencias: `pip install -r packages/perception/scripts/requirements.txt`
(solo `numpy` y `huggingface_hub`).

## Pendiente

- Búsqueda por haz (beam search) y respaldo por temperatura cuando el texto
  se repite: mejoran la precisión con audio difícil.
- Diarización (quién habla): Whisper no la hace; hace falta otro modelo.
