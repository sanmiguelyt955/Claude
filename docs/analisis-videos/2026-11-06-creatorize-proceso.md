# Creatorize: proceso completo (2 videos de g russ) → especificación para Kubo Studio

Análisis con video-claude (Gemini por link). Solo información pública; Kubo es implementación propia (clean room).

## How To Make Viral 3D Cartoon Shorts Quickly — https://youtu.be/yWM56RB25Ks

Aquí tienes el análisis detallado del video y el proceso de funcionamiento de la aplicación **Creatorize**:

### 1) Resumen
El video es un tutorial publicitario de 60 segundos que demuestra cómo la herramienta **Creatorize** utiliza inteligencia artificial avanzada para automatizar la creación de cortometrajes animados en 3D. El sistema elimina la necesidad de animadores y editores manuales, encargándose de generar personajes, escenarios, sincronización labial y renderizado final a partir de un guion y un archivo de voz.

---

### 2) Paso a paso del flujo de trabajo (MM:SS)

*   **00:10 - Inicio del proyecto:** En el panel principal (*Dashboard*), el usuario hace clic en el botón naranja **"+ New project"**.
*   **00:12 - Configuración de archivos:** Se le asigna un nombre al video ("Why Cashiers Keep Winning The Lottery") y se arrastra un archivo de audio (**voice.wav**).
*   **00:14 - Selección de estilo y motor:**
    *   Se selecciona el estilo **"3D cartoon shorts"** (personajes cabezones con caras expresivas).
    *   Se elige el formato **"Vertical 9:16"**.
    *   Se selecciona **"Blender"** como motor de renderizado (en lugar de Three.js).
*   **00:19 - Calidad y Guion:**
    *   Se ajusta la calidad a **"Ultraedit"**.
    *   Se selecciona la opción **"I have a script"** (Tengo un guion) y se pega el texto en el cuadro de diálogo. Luego se pulsa **"Create"**.
*   **00:21 - Procesamiento de audio:** El usuario hace clic en las opciones **"Clean"** y **"Time"**. La app muestra una consola de comandos donde transcribe el audio y sincroniza cada palabra con una marca de tiempo exacta (**"Every word timed"**).
*   **00:25 - Construcción de escenas (The Build):** Se pulsa el botón **"Build"**. La app utiliza "agentes de Claude" para generar una lista de tomas (*Shots*). En el video se ve cómo se construyen secuencialmente 19 tomas diferentes.
*   **00:36 - Exportación:** El usuario hace clic en **"Export"**. Se configuran los parámetros de salida (1080x1920, 30 fps, H.264).
*   **00:38 - Renderizado final:** El motor Blender renderiza cuadro por cuadro (se muestran hasta 1732 fotogramas) incluyendo los subtítulos automáticos integrados (*burned-in captions*).

---

### 3) Funciones visibles de la app
*   **Gestión de proyectos:** Importación y creación de nuevos proyectos.
*   **Input de audio:** Soporta formatos WAV, MP3, M4A, FLAC, OGG.
*   **Selector de estilos:** Opciones como Pixel Art, MS Paint stick figures, 3D reconstruction, Low poly shorts y 3D cartoon shorts.
*   **Motores de renderizado:** Elección entre **Three.js** (previsualización rápida) o **Blender** (calidad profesional).
*   **IA de Guion:** Capacidad de escribir guiones mediante Claude o pegar uno propio.
*   **Sincronización de voz:** Herramientas para limpiar audio y cronometrar palabras automáticamente para *lip-sync*.
*   **Editor de tomas (Shots):** Lista numerada de escenas con duración y descripción.
*   **Generador de activos:** Creación automática de personajes (ej. "Kyle"), fondos (mansión, yate) y props (tickets de lotería).
*   **Timeline:** Línea de tiempo con capas de video, voz, música y efectos de sonido.
*   **Subtítulos:** Generación de subtítulos dinámicos que cambian palabra por palabra.

---

### 4) Herramientas externas mencionadas
*   **Claude (Anthropic):** Utiliza la suscripción de "Claude Code" para que agentes de IA escriban el código y construyan las escenas.
*   **Blender:** El software de código abierto utilizado como motor de renderizado 3D principal.
*   **Parakeet:** Se observa en los logs de la consola para la transcripción y temporización del audio.
*   **H.264 / GPU:** Para la codificación final del video.

---

### 5) Resultado final
El video producido es un corto de animación 3D de estética "cartoon" (caricatura) con las siguientes características:
*   **Personajes:** Modelos 3D estilizados con expresiones faciales que cambian según el diálogo.
*   **Cinematografía:** 19 tomas con diferentes ángulos de cámara y escenarios variados (una tienda, una oficina de premios, un yate, una mansión).
*   **Edición:** Transiciones rápidas y coherentes con la narrativa.
*   **Post-producción:** Subtítulos coloridos y dinámicos que aparecen en el centro de la pantalla sincronizados con la voz.

---

### 6) Precio o planes mencionados
*   El video indica que la herramienta corre sobre la suscripción de **Claude Code (Planes Pro o Max)** que el usuario ya posea.
*   Menciona una métrica de consumo: crear un corto como el del ejemplo utiliza aproximadamente el **1% o 2% del límite semanal** de dicha suscripción de Claude.
*   No se menciona un precio específico en dinero para Creatorize, solo el enlace en la biografía para obtener acceso.

## Opus 5.5 + Creatorize = ULTRA Viral 3D Cartoon Shorts! (Like RicksClips3000) — https://youtu.be/cFBai0twzOA

Este video es un tutorial y demostración de **Creatorize**, una herramienta diseñada para automatizar la creación de animaciones 3D cortas (estilo *YouTube Shorts* o *TikTok*) utilizando Inteligencia Artificial, específicamente integrada con modelos de lenguaje como Claude de Anthropic y motores de renderizado como Blender.

A continuación, el desglose detallado para entender cómo construir o replicar una herramienta similar:

---

### 1. Resumen
Creatorize permite convertir un archivo de audio (voz en off) en una animación 3D completa. La app utiliza IA para "entender" el guion, diseñar el guion gráfico (storyboard), crear los personajes y escenarios, animar los movimientos de cámara y sincronizar los labios, todo bajo un estilo visual de "caricatura 3D viral". Se diferencia de otras herramientas por ejecutarse localmente usando la suscripción de Claude del usuario, lo que reduce costos de API externos.

---

### 2. Paso a paso del flujo de trabajo

*   **Configuración Inicial (04:00 - 04:38):**
    *   **Pantalla:** Panel de *Settings > Media*.
    *   **Acción:** Se conecta con **Google Flow** para la generación de imágenes (texturas y detalles de escenas) usando créditos gratuitos de Google.
    *   **Versión:** Se asegura de usar la v0.19.0 que permite renderizado en **Blender**.

*   **Creación del Proyecto (04:39 - 05:12):**
    *   **Pantalla:** Ventana *New Project*.
    *   **Datos de entrada:**
        *   **Nombre:** "An Unstoppable Spear vs an Unbreakable Shield".
        *   **Audio:** Se sube un archivo MP3 (en el video usan el audio de un canal famoso como referencia).
        *   **Estilo:** Selecciona "3D cartoon shorts".
        *   **Motor (Engine):** Elige **Blender** (ofrece mayor calidad que Three.js).
        *   **Calidad:** "Ultraedit" (máximo detalle).
        *   **Modelo de IA:** Opus 3.5 (Claude).
        *   **Esfuerzo:** "High".

*   **Procesamiento de Audio (05:13 - 05:25):**
    *   **Pantalla:** *Pipeline* de la app.
    *   **Botón:** *Clean and time*.
    *   **Acción:** La app realiza una transcripción local y una alineación temporal de las palabras (*words timed*) para saber exactamente qué ocurre en cada segundo del audio. **Tiempo:** Pocos segundos.

*   **Construcción de Escenas (05:26 - 06:55):**
    *   **Pantalla:** Panel *Build scenes*.
    *   **Prompt/Dirección:** Se pueden escribir instrucciones opcionales para Claude (ej: "mantener colores cálidos"). En el video lo dejan en blanco para mostrar la capacidad autónoma.
    *   **Configuración:** Calidad "Ultraedit" y tiempo "Unlimited".
    *   **Generación:** Claude escribe el guion gráfico, define los "props" (objetos 3D), personajes y posiciones.

*   **Renderizado y Finalización (07:13 - 07:22):**
    *   **Pantalla:** Proceso de renderizado visible en el panel derecho.
    *   **Tiempo transcurrido:** Según el cronómetro mostrado, el proceso total de renderizado para 1 minuto de video en calidad máxima fue de **3 horas, 18 minutos y 49 segundos**.

*   **Revisión y Edición (08:27 - 08:55):**
    *   **Pantalla:** *Editor*.
    *   **Opciones:** Permite alternar entre vista "Solid" (para ver movimientos rápidos sin procesar) y vista "Look" (renderizado final con texturas y luces).

---

### 3. Funciones visibles de la app
*   **Gestión de Proyectos:** Biblioteca de videos generados y en curso.
*   **Control de IA (Claude):** Panel lateral que muestra la "conversación" con la IA y el uso de tokens (172M de tokens usados, con 170M cacheados para ahorrar).
*   **Pipeline de producción:** Pasos secuenciales (Script -> Voiceover -> Audio cleaned -> Scenes built -> Render).
*   **Selección de Estilos:** Pixel art, dibujos a mano, caricatura 3D, etc.
*   **Configuración de Cámara:** Movimientos de paneo y zoom automáticos.
*   **Lip-sync:** Sincronización automática de boca con el audio.
*   **Exportación:** Soporte para 1080p y 4K (en el plan premium).
*   **Conexión API:** Integración directa con YouTube para aprender de las métricas de retención.

---

### 4. Herramientas externas que utiliza
*   **Claude (Anthropic):** Es el cerebro que interpreta el audio y dicta las instrucciones de animación. Requiere una suscripción "Claude Code".
*   **Blender:** Motor de renderizado externo que la app controla para generar las imágenes finales.
*   **Google Flow:** Para la generación de activos visuales y texturas.
*   **DaVinci Resolve:** (Mencionado externamente) El usuario lo usa al final para comparar y revisar el video profesionalmente.

---

### 5. Resultado final: ¿Cómo se ve el video?
El video producido (09:07 - 09:45) muestra:
*   Personajes estilo "stickman" con caras expresivas y cuerpos 3D.
*   Escenarios detallados con iluminación ambiental (estilo atardecer o interiores de madera).
*   Movimientos de cámara cinemáticos que siguen la acción.
*   Subtítulos dinámicos integrados.
*   Consistencia visual: los personajes no cambian de diseño entre escenas.

---

### 6. Precios y Planes (12:27 - 13:59)
*   **Standard ($67/mes):** Acceso a todos los estilos, exportación vertical 9:16, hasta 12 exportaciones por mes. No incluye calidad "Ultraedit".
*   **Premium ($97/mes):** Todo lo anterior más calidad "Ultraedit", estilos y personajes personalizados, exportación 4K, más de 30 idiomas, conexión con YouTube API y **exportaciones ilimitadas**.

*Nota: El autor menciona que el precio real podría ser de $300/mes si se sumara el costo de la suscripción de Claude necesaria.*

## Cómo lo cubre Kubo Studio

| Creatorize | Kubo |
|---|---|
| New project: nombre, audio o guion, estilo, 9:16, motor |  (voz Gemini TTS o tu audio) |
| Clean + Time (Parakeet) | Whisper con tiempos por palabra + corrección contra el guion |
| Build con agentes de Claude (lista de tomas) |  + Claude dirige  (sin costo extra: es esta misma sesión) |
| Vista Solid / Look |  (hoja de control en segundos) |
| Render Blender (GPU) |  Workbench en CPU (normal 720p / final 1080p) |
| Timeline: imagen, voz, efectos, ambiente, música | : voz + música por ánimo + efectos pegados al movimiento + stems |
| Subtítulos quemados | ASS virales (clave en amarillo, pop, punch-in de cámara) |
