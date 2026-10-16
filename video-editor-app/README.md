# Editor de video

Editor de video web con estilo inspirado en el uso público de CapCut. Código propio, sin frameworks ni
dependencias de npm: Node.js + FFmpeg en el servidor, HTML/CSS/JS en el navegador.

Funciona en computadora y en celular (se puede instalar como app desde el navegador).

## Requisitos
- Node.js 18+
- FFmpeg y FFprobe en el PATH

## Uso
```bash
npm start            # http://localhost:3000  (PORT=... para cambiar el puerto)
npm test             # 12 pruebas: motor de exportación, modelo y servidor (requiere ffmpeg)
```

## Cómo se usa
1. **Sube** tus archivos (videos, fotos PNG/JPG, audios).
2. **Toca +** para ponerlos en la línea de tiempo, o usa **+ Pista** para crear pistas nuevas.
3. **Edita**: arrastra clips para moverlos, arrastra sus bordes para recortarlos, usa **Cortar aquí** (tecla S).
4. **Ajusta** el clip seleccionado en el panel *Ajustes del clip*.
5. **Guarda** el proyecto y **Exporta video** para descargar el MP4.

Atajos: `Espacio` reproducir · `S` cortar · `Supr` quitar · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer/rehacer · `Ctrl+D` duplicar · `Ctrl+S` guardar · `←` `→` mover el cursor.

## Funciones
**Línea de tiempo**
- Pistas de video, foto, audio, texto y formas; varias pistas de cada tipo.
- Mover, recortar, cortar, duplicar, silenciar pistas, zoom y deshacer/rehacer.

**Clips**
- Velocidad de 0.1× a 100× (con el audio ajustado al tono).
- Volumen, fundidos de entrada y salida, silenciar.
- Filtros de color: cálido, frío, blanco y negro, vintage, vívido, dramático; además brillo, contraste y saturación.
- Posición, tamaño y transparencia para clips superpuestos.
- Quitar un color (croma) de un clip, por ejemplo fondo verde.
- Transiciones de entrada: fundido y deslizar en cuatro direcciones.

**Texto y formas**
- Texto con tamaño, color, fondo y posición.
- Formas (rectángulos) con color y transparencia.

**Proyecto**
- Formatos 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 y 4:5 (Instagram).
- Guardar y abrir proyectos en el servidor; borrador automático en el navegador.
- Exportación a MP4 H.264 + AAC.

## Uso en el celular
- La interfaz se adapta a pantallas pequeñas: el video arriba, la línea de tiempo se desplaza con el dedo y los ajustes aparecen debajo.
- Para instalarla: en Android/Chrome, menú ⋮ → *Instalar app*; en iPhone/Safari, Compartir → *Añadir a pantalla de inicio*.
- **Importante:** el celular necesita entrar a la app por una dirección pública con **HTTPS** (o localhost). Para usarla en el celular hay que desplegar el servidor en un hosting (por ejemplo Render, Fly.io o un VPS con Node y FFmpeg). Hoy solo corre en `localhost`.

## Estructura
- `server.js`: HTTP sin frameworks: subida, streaming con rangos, proyectos y exportación.
- `lib/model.js`: modelo del proyecto (valida y limita valores). Lo usan el servidor y el navegador.
- `lib/export.js`: construye el filtrado de FFmpeg (función pura, probada con FFmpeg real).
- `public/`: interfaz (`index.html`, `style.css`, `app.js`), vista previa (`preview.js`), app instalable (`manifest.webmanifest`, `sw.js`).
- `test/`: pruebas del motor, del modelo y del servidor.
- `data/`: medios, proyectos y exportaciones (ignorado por git).

## Limitaciones (lo que no está incluido)
- **Subtítulos automáticos, texto a voz, quitar fondo con IA, estabilización y máscaras:** necesitan modelos de IA o librerías (por ejemplo Whisper o vidstab) que no están instalados. No se simulan.
- **Keyframes (animación por fotogramas):** no implementados todavía.
- **Biblioteca de efectos, plantillas, música y stickers de terceros:** son contenido licenciado; esta app solo usa los archivos que subes.
- **Vista previa aproximada:** los filtros, el croma y las transiciones se ven simplificados en pantalla. La exportación es la referencia.
- **Exportación síncrona:** un proyecto largo puede tardar varios minutos y depende del tiempo de espera del servidor.

## Siguientes pasos sugeridos
1. Despliegue con HTTPS para usarla desde el celular.
2. Keyframes para posición, tamaño y opacidad.
3. Arrastrar medios desde la biblioteca directamente a la línea de tiempo.
4. Exportación en segundo plano con barra de progreso.
