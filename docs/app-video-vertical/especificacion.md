# Especificación: app de vídeos verticales a partir de clips

Documento de producto de nuestra propia app. Se basa solo en las funciones
que la web pública de otra app describe. No usa código, binarios, diseño ni
textos de esa app; todo se implementará desde cero.

## Objetivo

De un conjunto de clips, generar muchos vídeos verticales distintos entre sí,
listos para subir a redes.

## Funciones (resumen público)

| # | Función | Descripción |
|---|---------|-------------|
| 1 | Combinar clips en serie | Ordenar clips por rol (apertura, demostración, cierre) y generar combinaciones sin repetir. |
| 2 | Música a tiempo | Detectar el momento fuerte de una canción y alinear con la aparición del producto. |
| 3 | Analizar vídeos virales | Dado un vídeo, detectar cambios de plano y extraer los textos superpuestos. |
| 4 | Separar voz y música | Separar la voz del fondo musical en un clip (modelo de IA). |
| 5 | Envío al móvil por WiFi | Mostrar un código QR para recibir los vídeos en el teléfono en la misma red. |
| 6 | Trabajar con un asistente | Pedir a un asistente de IA que prepare los vídeos. |
| 7 | Exportación | Hasta 4K, sin marca de agua ni metadatos. |
| 8 | Procesado local | Todo se procesa en el ordenador del usuario; los clips no salen de él. |
| 9 | Aviso de versiones | La app avisa cuando hay una versión nueva. |

## Requisitos no funcionales

- Mac y Windows.
- Procesado local por defecto (privacidad).
- Sin cuenta ni suscripción en la primera versión.
- Textos y diseño propios.

## Decisiones pendientes

1. **Stack**: escritorio (Electron o Tauri), web o Python con interfaz local.
2. **Motor de vídeo**: FFmpeg para cortes, concatenación y exportación.
3. **Modelos de IA** para la función 4 (separación de voz) y para la 3 (texto en pantalla): elegir uno local.
4. **Primer hito**: función 1 (combinar clips en serie) con exportación 1080x1920.

## Fuera de alcance (primera versión)

- Cuentas de usuario, pagos y sincronización en la nube.
- Publicación automática en redes.
