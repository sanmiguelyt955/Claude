# Codificadores de audio y video en REA Studio

## Video
| Codificador | Códec | Tipo | Origen |
|---|---|---|---|
| x264 | H.264 | software | OBS |
| NVENC (H.264, HEVC, AV1) | | GPU NVIDIA | OBS |
| QSV (H.264, HEVC, AV1) | | GPU Intel | OBS |
| AMF (H.264, HEVC, AV1) | | GPU AMD | OBS |
| VAAPI (H.264, HEVC, AV1) | | GPU Linux | OBS |
| VideoToolbox | H.264, HEVC | macOS | OBS |
| OpenH264 | H.264 | software | OBS |
| SVT-AV1 y AOM AV1 | AV1 | software | OBS |
| **x265** (`ffmpeg_x265`) | HEVC | software (CBR/VBR/CRF, presets ultrafast…medium) | **REA Studio** |
| **VP9** (`ffmpeg_vp9`) | VP9 | software (CBR/VBR/CRF, velocidad 0–8) | **REA Studio** |

## Audio
AAC (FFmpeg), Opus, FLAC, ALAC, PCM 16/24/32 bits, y los nuevos de REA Studio:
**MP3** (`ffmpeg_mp3`, libmp3lame), **AC3 / Dolby Digital** (`ffmpeg_ac3`) y **Vorbis** (`ffmpeg_vorbis`, libvorbis).

## Notas
- Código nuevo: `base/plugins/obs-ffmpeg/obs-ffmpeg-extra-video.c` y el final de `obs-ffmpeg-audio-encoders.c`; registro en `obs-ffmpeg.c`.
- Un codificador solo aparece si tu FFmpeg incluye la librería (libx265, libvpx, libmp3lame, libvorbis).
- Para más (por ejemplo ProRes o DNxHD para edición) se añaden con el mismo patrón en `obs-ffmpeg-extra-video.c`.
- Verificado: las opciones usadas (x265 CBR/CRF, VP9 CBR/CRF, MP3, AC3, Vorbis) funcionan con FFmpeg 6.1, y el archivo de video nuevo compila. No se ha compilado el plugin completo (OBS 33 pide FFmpeg 7.1) ni probado dentro de OBS.
