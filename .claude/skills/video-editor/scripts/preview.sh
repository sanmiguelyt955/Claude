#!/usr/bin/env bash
# Contact sheet 4x3 para revisar el resultado visualmente. Uso: preview.sh video.mp4 [out.jpg]
V="$1"; O="${2:-${V%.*}_sheet.jpg}"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
ffmpeg -y -v error -i "$V" -vf "fps=12/$D,scale=360:-2,tile=4x3" -frames:v 1 "$O" && echo "$O"
