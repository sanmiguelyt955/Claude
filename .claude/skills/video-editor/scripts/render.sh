#!/usr/bin/env bash
# Uso: render.sh in.mp4 subs.ass out.mp4 [--aspect 9:16|16:9|1:1] [--overlay ov.webm] [--music m.mp3] [--logo logo.png] [--logo-pos tr|tl|br|bl]
set -e
IN="$1"; ASS="$2"; OUT="$3"; shift 3
ASPECT="9:16"; OV=""; MUSIC=""; LOGO=""; POS="tr"
while [ $# -gt 0 ]; do case "$1" in
  --aspect) ASPECT="$2"; shift 2;; --overlay) OV="$2"; shift 2;;
  --music) MUSIC="$2"; shift 2;; --logo) LOGO="$2"; shift 2;; --logo-pos) POS="$2"; shift 2;;
  *) echo "arg desconocido $1"; exit 1;; esac; done
case "$ASPECT" in 9:16) W=1080;H=1920;; 16:9) W=1920;H=1080;; 1:1) W=1080;H=1080;; esac
case "$POS" in tr) XY="W-w-40:40";; tl) XY="40:40";; br) XY="W-w-40:H-h-40";; bl) XY="40:H-h-40";; esac
mkdir -p "$(dirname "$OUT")"
INPUTS=(-i "$IN"); N=1; V="[0:v]scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,setsar=1[b]"; LAST="[b]"
add() { case "$1" in *.webm) INPUTS+=(-c:v libvpx -i "$1");; *) INPUTS+=(-i "$1");; esac; }  # libvpx conserva el canal alfa del WebM
if [ -n "$OV" ]; then add "$OV"; V="$V;${LAST}[$N:v]overlay=0:0:format=auto[o$N]"; LAST="[o$N]"; N=$((N+1)); fi
if [ -n "$LOGO" ]; then add "$LOGO"; V="$V;[$N:v]scale=-1:$((H/16))[lg];${LAST}[lg]overlay=$XY[o$N]"; LAST="[o$N]"; N=$((N+1)); fi
V="$V;${LAST}ass='$ASS'[v]"
AF="[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[voice]"; AMAP="[voice]"
if [ -n "$MUSIC" ]; then add "$MUSIC"
  AF="$AF;[$N:a]volume=-22dB[mus];[mus][voice]sidechaincompress=threshold=0.05:ratio=8[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0[amix]"; AMAP="[amix]"; fi
ffmpeg -y -v error -stats "${INPUTS[@]}" -filter_complex "$V;$AF" -map "[v]" -map "$AMAP" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "OK -> $OUT"
