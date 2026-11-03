# Privacidad: video-claude / video-nube

- **Qué se procesa:** los videos, audios o enlaces que tú envías al servidor `video-nube`.
- **Dónde:** solo en tu propio servidor (tu Space de Hugging Face, o tu computadora en modo local). Los modelos (Whisper, AST, CLAP, WavLM, Gemma 4 E2B) son de pesos abiertos y corren ahí mismo. **No se envía nada a Gemini, Google AI Studio, OpenAI ni a ninguna API de terceros.**
- **Qué se guarda:** las subidas, descargas, cuadros y transcripciones quedan en la carpeta `datos/` del servidor. En un Space gratuito ese disco es temporal y se borra al reiniciarse.
- **Acceso:** el servidor exige una clave secreta en la URL (`MCP_CLAVE`). Cualquiera que tenga la URL completa puede usarlo, así que no la compartas.
- **Terceros:** el alojamiento corre a cargo de Hugging Face (ver su política de privacidad). Las descargas de enlaces se hacen directamente desde el servidor hacia el sitio indicado.
- Contacto: el propietario del repositorio https://github.com/sanmiguelyt955/claude
