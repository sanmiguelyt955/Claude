#!/usr/bin/env bash
# Uso: analyze.sh video.mp4  -> resumen técnico + silencios
set -e
V="$1"; [ -f "$V" ] || { echo "Uso: $0 video"; exit 1; }
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of default=nw=1 "$V"
echo "--- silencios (<-30dB, >0.4s) ---"
ffmpeg -hide_banner -nostats -i "$V" -af silencedetect=noise=-30dB:d=0.4 -f null - 2>&1 | grep -E "silence_(start|end)" | head -60 || true
