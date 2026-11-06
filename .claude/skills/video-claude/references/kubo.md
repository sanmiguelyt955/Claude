# Kubo Studio: animaciones 3D virales con Blender (estilo cabezón)

App propia (clean room, inspirada en lo que hacen públicamente Creatorize y canales como Capybluh, sin su código ni sus
personajes). Todo gratis y en la nube: Blender 4.2 sin interfaz + Python. Carpeta: `kubo/`.

## Flujo
```
python3 kubo/kubo.py nuevo NOMBRE --guion "texto" [--voz-nombre Puck --estilo-voz "…"] [--voz mi_audio.mp3] | --sin-voz
python3 kubo/kubo.py plan NOMBRE        # borrador automático; CLAUDE lo dirige editando proyectos/kubo/NOMBRE/plan.json
python3 kubo/kubo.py revisar NOMBRE     # 1 cuadro por toma → datos/kubo/NOMBRE/control.jpg (5-10 s). Míralo SIEMPRE.
python3 kubo/kubo.py render NOMBRE --calidad borrador|normal|final [--tomas 3-4]
python3 kubo/kubo.py exportar NOMBRE [--musica caricatura|pulso|…|ninguna] [--densidad pocos|medios|muchos] [--lufs -18]
```
Voz: Gemini TTS (gratis; Puck = niño/divertido, Charon = grave) o Aura de respaldo. Whisper da el tiempo de cada
palabra y se corrige contra el guion (acentos, «la estufa»). Idioma: el del guion (inglés por defecto para alcance
mundial; el modo `--sin-voz` sirve para todos los idiomas).

Tiempos medidos (4 CPU, sin GPU): `normal` (720p, animado en dos) ≈ 7 s de render por segundo de video;
`final` (1080p, 24 cuadros/s, antialias 16) ≈ 30 s por segundo de video. Exportar ≈ 15 s.

## Cómo funciona el conector de Blender (`kubo/blender_escena.py`)
1. `kubo.py` calcula los cuadros exactos de cada toma (sin acumular error con la voz) y escribe `_plan.json`.
2. Lanza `blender -b --factory-startup -P blender_escena.py -- _plan.json carpeta caras --calidad …`.
3. Por cada toma el script de Blender (bpy): borra la escena → arma el **escenario** con figuras básicas → los
   **objetos** → los **personajes** (cubos con bisel + contorno de tinta por casco invertido) → pega las **caras 2D**
   (PNG con transparencia de `caras.py`, una por expresión × boca abierta/cerrada × parpadeo) → **anima** cada cuadro con
   keyframes (pose de la acción, transición elástica, gesticulación al hablar, boca según las palabras, parpadeo,
   antena con resorte, sombra de contacto) → **cámara** con su movimiento → render Workbench a PNG.
4. `exportar` une los PNG con ffmpeg, quema los subtítulos ASS (libass), mezcla voz + música + efectos y sale el MP4
   (H.264, yuv420p, faststart, -18 LUFS: se oye bien en iPhone).

## Formato del plan
```json
{"formato": "9:16", "musica": "caricatura", "firma": true, "sfx_auto": true,
 "personajes": {"kubo": {"piel": "#3dd6c6", "ropa": "#ff8c1a", "pantalon": "#24304a", "antena": true}},
 "tomas": [{
   "rango": [0, 10],              // palabras de la voz que cubre (→ duración, subtítulos, boca). Sin voz: "dur": 2.0
   "clave": "cook",               // palabra en amarillo + «punch-in» de cámara (golpe_clave: false lo quita)
   "escenario": "cocina", "cielo": "#ffd166",
   "camara": "medio+empuje",      // cerca|medio|lejos|plano_general|detalle + empuje|alejar|orbita|paneo|picado|contrapicado|lateral|temblor|golpe
   "objetivo": "papa",            // a quién mira la cámara (si no, al grupo)
   "cabecera": "WHEN I'M WITH DAD",   // texto arriba: SOLO si el formato lo pide
   "barra": {"opciones": ["1s", "10s", "1m"], "activa": 1},   // barra de opciones: SOLO en formatos de escalera
   "animo": "alegre",             // alegre|caos|misterio|panico|giro|final… (la música cambia con el ánimo)
   "sfx": [{"tipo": "vine_boom", "en": "clave"}],
   "actores": [{"id": "kubo", "pos": [1, -0.4], "mira": -20,
                "caras": [[0, "sospecha"], [1.5, "miedo"]],            // cambian en el tiempo (con «pop»)
                "gestos": [[0, "quieto"], [1.5, "sorpresa"], [2.2, "miedo"]],  // acciones encadenadas, transición elástica
                "habla": true, "salto_en": 0.3, "hasta": [2, 0]}],
   "props": [{"tipo": "fogata", "pos": [-0.6, 2], "z": 1.25, "escala": 1.3, "giro": 90, "color": "#ff7f11"}]}]}
```
- **Escenarios**: cuarto, cocina, parque, calle, escuela, tienda, noche, estudio (fondo liso de color).
- **Objetos**: mesa, silla, cama, arbol, caja_regalo, fogata, tele, puerta, coche, sofa, bici, dinero, nube, bloque,
  castillo, columpio, malvavisco, libro, humo, estufa.
- **Caras**: normal, feliz, risa, triste, enojado, sorpresa, miedo, extasis, malvado, sospecha, grito, dormido, mareado,
  ko, enamorado, pensando.
- **Acciones**: quieto, agitar, senalar, pensar, comer, celebrar, bailar, saltar, sorpresa, temblar/miedo, susto (se le
  sale la cabeza), golpe (reacción a impacto), zapatear (enojo), caminar, correr (con «hasta»), volar, caer.
- **Personajes**: piel, ropa, mangas, pantalon, altura, cabeza (cubo|esfera), pelo, gorra, gorro_chef, orejas, antena.

## El personaje de la marca: Kubo
Cubo turquesa con sudadera naranja y **antena con foco que cambia de color con la emoción** (amarillo feliz, rojo
enojo, azul triste, blanco miedo, verde idea, morado sospecha). Gag fijo: **se le sale la cabeza del susto**. Por qué se
recuerda: silueta única (cubo + antena), color propio (no amarillo, para no parecerse a avatares de juegos), un rasgo
que cuenta la emoción sin idioma y un gag repetible que la audiencia espera.

## Sonido con intención (marketing y psicología)
- **Firma sonora** «bip-bip-DING» (el foco que se prende) al inicio y al final: reconocimiento de marca por el oído
  (efecto de mera exposición) y cierre que invita a repetir (loop).
- **Tema del canal**: la música `caricatura` (Fa mayor, 128 BPM) repite las mismas 3 notas de la firma cada 2 compases:
  el canal suena igual en todos los videos → al oírlo en el feed, el cerebro lo reconoce antes de verlo.
- **Efectos pegados al movimiento** (`sfx_auto`): cada salto suena al despegar, el susto con grito + boing al salir la
  cabeza, la caída al tocar el piso, comer, pisotones… La coherencia imagen-sonido hace que se sienta «bien hecho».
- Ánimo `caos` (más rápido) en el clímax; `alegre` para la presentación y el remate.

## Reglas de dirección (lo que hace bueno un video)
1. Gancho en 0-2 s: acción o cara fuerte desde el primer cuadro, nunca un personaje quieto.
2. Una toma por idea (1-3 s). Corta en cada frase; el clímax hacia el 70 %.
3. Cada toma tiene movimiento: `gestos` encadenados, `caras` que cambian, cámara que se mueve.
4. Revisar con `revisar` antes de renderizar; render `normal` para probar y `final` para publicar.
5. Textos en pantalla (`cabecera`, `barra`) solo cuando el formato los necesita.
