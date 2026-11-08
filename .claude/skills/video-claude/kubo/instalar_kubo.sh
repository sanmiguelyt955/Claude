#!/usr/bin/env bash
# Instala Kubo Studio en cualquier computadora Linux (sin permisos de administrador) y revisa que todo funcione.
#   curl -fsSL https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/.claude/skills/video-claude/kubo/instalar_kubo.sh | bash
# Al final imprime INSTALACION: OK o la pieza que falta (y cómo arreglarla).
set -u
RAMA="${KUBO_RAMA:-claude/video-editing-skill-6wybxb}"
BASE="https://raw.githubusercontent.com/sanmiguelyt955/claude/$RAMA"
DEST="${KUBO_DEST:-$HOME/kubo-studio}"
SK="$DEST/.claude/skills/video-claude"
mkdir -p "$SK/kubo" "$SK/scripts" "$DEST/proyectos/kubo/prueba_astro"
falta=()

echo "1/5 Bajando el código de Kubo Studio…"
for f in kubo/kubo.py kubo/blender_escena.py kubo/caras.py scripts/sonido.py scripts/voz.py; do
  curl -fsSL "$BASE/.claude/skills/video-claude/$f" -o "$SK/$f" || falta+=("no se pudo bajar $f")
done
for f in plan.json guion.txt palabras.json; do
  curl -fsSL "$BASE/proyectos/kubo/prueba_astro/$f" -o "$DEST/proyectos/kubo/prueba_astro/$f" || falta+=("no se pudo bajar prueba_astro/$f")
done

echo "2/5 Blender 4.2 portátil…"
BL="${KUBO_BLENDER:-$HOME/blender-4.2.3-linux-x64/blender}"
if [ ! -x "$BL" ]; then
  curl -fL --progress-bar https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz -o "$HOME/blender.tar.xz" \
    && tar -xJf "$HOME/blender.tar.xz" -C "$HOME" && rm -f "$HOME/blender.tar.xz" \
    || falta+=("no se pudo bajar o descomprimir Blender (~350 MB)")
  BL="$HOME/blender-4.2.3-linux-x64/blender"
fi

echo "3/5 Python: numpy, soundfile, Pillow…"
for m in numpy soundfile PIL; do
  python3 -c "import $m" 2>/dev/null || { p=$m; [ "$m" = PIL ] && p=Pillow; pip install --user -q "$p" 2>/dev/null \
    || python3 -m pip install --user -q "$p" 2>/dev/null || falta+=("falta el módulo de Python $p (pip install --user $p)"); }
done

echo "4/5 ffmpeg con subtítulos (libass)…"
command -v ffmpeg >/dev/null || falta+=("falta ffmpeg")
ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " || falta+=("ffmpeg no tiene libass (los subtítulos no se quemarán)")

echo "5/5 Blender sin pantalla (OpenGL por software)…"
if [ -x "$BL" ]; then
  out=$("$BL" -b --factory-startup --python-expr "
import bpy
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.render.resolution_x=64; sc.render.resolution_y=64
bpy.ops.mesh.primitive_cube_add(); bpy.ops.object.camera_add(location=(0,-6,0),rotation=(1.5708,0,0)); sc.camera=bpy.context.active_object
sc.render.filepath='/tmp/kubo_prueba.png'; bpy.ops.render.render(write_still=True); print('KUBO_GL_OK')" 2>&1)
  echo "$out" | grep -q KUBO_GL_OK || falta+=("Blender no puede dibujar sin pantalla: falta OpenGL por software (libEGL/Mesa). Último error: $(echo "$out" | grep -iE 'error|abort|egl' | tail -1)")
fi

echo
echo "Blender: $BL"
echo "Carpeta: $DEST"
if [ ${#falta[@]} -eq 0 ]; then
  echo "INSTALACION: OK"
  echo "Prueba:  export KUBO_BLENDER=$BL && cd $SK/kubo && python3 kubo.py revisar prueba_astro && python3 kubo.py render prueba_astro --calidad borrador && python3 kubo.py exportar prueba_astro"
  echo "Video:   $DEST/datos/kubo/prueba_astro/prueba_astro.mp4"
else
  echo "INSTALACION: FALTA ALGO"
  for x in "${falta[@]}"; do echo " - $x"; done
fi
