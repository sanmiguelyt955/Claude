# Motor 2.5D (Kubo Studio): personajes 2D en un mundo 3D, con efectos pixel y sonido hecho con código

Nuestro equivalente propio de claude-animated-shorts + pixelfx + earshot, sin Remotion (pesa 1.3 GB) ni GPU.

```bash
bash .claude/skills/video-claude/scripts/instalar_repos.sh          # una vez por sesión (earshot, pixelfx)
cd /tmp/claude-0/motor && npm i three@0.170.0                       # three.js para el motor
node .claude/skills/video-claude/motor25d/motor25d.mjs planes/emus_prueba.json salida.mp4 --control   # 1 de 4 cuadros
node .claude/skills/video-claude/motor25d/motor25d.mjs planes/emus_prueba.json salida.mp4             # final
```
Velocidad medida (CPU, 540x960): 6 s de video = 180 cuadros en ~68 s.

## Qué hace
- **Mundo 3D** (three.js en Chromium sin pantalla): cielo con degradado, niebla del color del horizonte, sol con sombras
  suaves, materiales de dos tonos, **tinta** (contorno negro por casco invertido), suelo pintado en canvas, colinas, rocas,
  cercas (con tablas rotas), espigas.
- **Personajes 2D dibujados con código** (`personajes.js`): tarjetas que miran a la cámara, con sombra real y sombra de
  contacto; caras (normal / alarma / serio), parpadeo, picotear, correr. Diseños propios (emú, granjero).
- **Cámara**: llaves con smootherstep, cortes secos (`"corte": true`), sacudidas en impactos (`sacudidas`).
- **Efectos pixel** (`fx`): cualquiera de los 244 de pixelfx (MIT) como tarjeta en el mundo 3D.
- **Sonido** (`sonidos`): cualquiera de los 252 sonidos del banco de earshot (MIT), colocados en su segundo y mezclados.
- **Revisión con oídos**: `earshot timeline salida.mp4 --video salida.mp4` dice si cada golpe cae en el corte (±ms).

## Plan (JSON)
`ancho, alto, fps, duracion, luz{...}, mundo{...}, elenco[{tipo, alto, pos[x,y,z], estados[{t, accion, cara}], ruta[{t,pos}], espejo}],
camara[{t, pos, mira, fov, corte}], sacudidas[t], fx[{t, id, pos, alto, veces}], sonidos[{t, id, vol, dur}]`

## Pendiente (siguientes versiones)
Más personajes (Kubo en tarjeta), caminata con pasos, desenfoque de lente, voz con tiempos por palabra para que cada
reacción caiga 0-3 cuadros antes de su palabra, música propia, plantillas de estilos propios.
