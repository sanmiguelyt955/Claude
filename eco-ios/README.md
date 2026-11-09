# Eco para iPhone

Eco empaquetada como app nativa de iPhone con [Capacitor](https://capacitorjs.com). Lleva dentro la
interfaz de `eco-player/public`, así que **En mi dispositivo** funciona igual que en la web y sin internet:
importas tus canciones desde la app Archivos y suenan en modo avión, con la pantalla bloqueada y desde
los controles de la pantalla de bloqueo.

La pestaña **SoundCloud** necesita el servidor de Eco (inicio de sesión y streaming). La app no lo
incluye: si la variable `ECO_SERVER_URL` del repositorio apunta a tu servidor publicado, la pestaña
muestra un botón que lo abre en Safari.

## Descargar la .ipa

Cada cambio en `eco-player/public` o en `eco-ios` compila la app en GitHub Actions
(`.github/workflows/eco-ios.yml`) y deja `Eco.ipa` en la release
[`eco-ios-latest`](../../../releases/tag/eco-ios-latest).

La .ipa va **sin firmar**: Apple no deja instalar apps sin una firma ligada a tu Apple ID.

## Instalarla en el iPhone

Con **AltStore** (<https://altstore.io>) o **Sideloadly** (<https://sideloadly.io>), que firman la app con tu
Apple ID:

1. Instala AltServer o Sideloadly en tu ordenador (Windows o Mac) y conecta el iPhone por cable.
2. Abre `Eco.ipa` con Sideloadly, o desde AltStore en el iPhone (**Mis apps → +**), e inicia sesión con tu Apple ID.
3. En el iPhone ve a **Ajustes → General → VPN y gestión de dispositivos**, toca tu Apple ID y pulsa **Confiar**.
4. En iOS 16 o posterior activa **Ajustes → Privacidad y seguridad → Modo desarrollador** y reinicia.

Con un Apple ID gratuito la firma caduca a los **7 días**: AltStore la renueva solo si el ordenador está
encendido en la misma wifi, o vuelves a instalarla. Con una cuenta de Apple Developer (99 USD/año) dura un año.
Tus canciones siguen en la app al renovar la firma; se borran si la desinstalas.

## Compilar en local (Mac con Xcode 16)

```bash
cd eco-ios
npm ci
ECO_SERVER_URL=https://tu-eco.onrender.com npm run copy   # la URL es opcional
open ios/App/App.xcodeproj                                 # firma con tu equipo y ejecuta
```

`npm run copy` regenera `www/` desde `eco-player/public` (sin modificarlo) y añade `native/`: ajustes de la
app como el aviso de la pestaña SoundCloud y ocultar «Elegir carpeta», que iOS no permite.
