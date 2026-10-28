# Eco

App web instalable (PWA) con dos partes:

- **En mi dispositivo**: importas tus archivos de audio (MP3, M4A, WAV, FLAC, OGG…) y quedan guardados
  dentro del navegador. Funciona **sin internet ni datos**: biblioteca, búsqueda, listas, aleatorio,
  repetir y controles en la pantalla de bloqueo. Lee título, artista, álbum y carátula de las etiquetas
  ID3; si no hay, usa el nombre del archivo (`Artista - Título.mp3`).
- **SoundCloud**: inicias sesión con la **API oficial** (OAuth 2.1 + PKCE) y escuchas en streaming tus
  Me gusta, tus listas, las listas que te gustan y tus pistas. Cada pista enlaza a su página en SoundCloud.

### Por qué SoundCloud no se guarda sin conexión

Las [condiciones de uso de la API de SoundCloud](https://developers.soundcloud.com/docs/api/terms-of-use)
prohíben que una app ofrezca escucha sin conexión, incluidas las descargas temporales, aunque el artista
haya permitido descargar la pista. Solo permiten caché durante la sesión. Por eso Eco no guarda nada de
SoundCloud: el servidor reenvía el audio sin almacenarlo y el service worker excluye esas rutas.

Para escuchar sin datos, importa en **En mi dispositivo** archivos que ya tengas, por ejemplo los
originales de las pistas que tú subes.

## Puesta en marcha

1. Registra una app en <https://soundcloud.com/you/apps> (SoundCloud permite una por persona).
2. Como Redirect URI pon `PUBLIC_URL/auth/callback`, por ejemplo `http://localhost:8787/auth/callback`.
3. Arranca el servidor (Node 18 o superior, sin dependencias):

   ```bash
   cd eco-player
   SC_CLIENT_ID=... SC_CLIENT_SECRET=... PUBLIC_URL=http://localhost:8787 npm start
   ```

4. Abre `PUBLIC_URL` en el navegador.

Sin credenciales, la parte **En mi dispositivo** funciona igual y la pestaña SoundCloud avisa de que falta configurarlas.

### En el móvil

Los service workers exigen HTTPS (salvo en `localhost`), así que para el móvil publica Eco con HTTPS.
El `render.yaml` de la raíz del repo incluye el servicio `eco-player`. En Render define `SC_CLIENT_ID`,
`SC_CLIENT_SECRET` y `PUBLIC_URL` (la URL `https://…onrender.com` que te asigne), y añade esa
`PUBLIC_URL/auth/callback` como Redirect URI en SoundCloud.

Después abre la URL en el móvil e instálala: **Añadir a pantalla de inicio** en Safari (iOS) o
**Instalar app** en Chrome (Android). Importa tus canciones desde **En mi dispositivo → Añadir**. A partir de
ahí la app abre y suena en modo avión.

Las canciones viven en el almacenamiento de ese navegador y de ese dispositivo. Si borras los datos del sitio
o desinstalas la app, se borran también; guarda siempre tus archivos originales.

## Variables de entorno

| Variable | Uso |
|---|---|
| `SC_CLIENT_ID`, `SC_CLIENT_SECRET` | Credenciales de tu app de SoundCloud |
| `PUBLIC_URL` | URL pública de Eco; la Redirect URI es `PUBLIC_URL/auth/callback` |
| `PORT` | Puerto (por defecto 8787) |
| `DATA_DIR` | Carpeta de las sesiones (por defecto `./data`, permisos 600) |

Los tokens se quedan en el servidor: el navegador solo recibe una cookie `HttpOnly`. Los refresh tokens de
SoundCloud son de un solo uso, así que el servidor guarda el nuevo en cada renovación. Al pulsar
**Desconectar** se cierra la sesión en SoundCloud y se borran los tokens.

## Pruebas

`npm test` arranca un SoundCloud falso (`test/mock-soundcloud.js`) y prueba todo en Chromium con
Playwright: importación y etiquetas, listas, inicio de sesión con PKCE, paginación, streaming HLS,
renovación de tokens, rechazo de hosts no permitidos, modo sin conexión, cierre de sesión y borrado.
Necesita `ffmpeg` y `playwright`.

Eco no está afiliada a SoundCloud ni respaldada por SoundCloud.
