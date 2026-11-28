# Combo vidIQ + YTAPI: Nod de n8n

## Resumen de la corrección de minutos

- Momentos de vidIQ con minuto: **33**.
- Ya estaban bien (±3 s): **31**. Corregidos: **2**. A revisar (no aparecen en los subtítulos, normalmente cosas que solo se ven): **0**.
- Mayor diferencia: **3 s**.

| vidIQ | real | diferencia | confianza | estado |
|---|---|---|---|---|
| 0:00 | 0:00 | +0 s | 1.0 | ok |
| 0:16 | 0:16 | +0 s | 1.0 | ok |
| 0:23 | 0:21 | -2 s | 0.84 | ok |
| 0:31 | 0:28 | -3 s | 0.84 | ok |
| 0:41 | 0:40 | -1 s | 1.0 | ok |
| 0:52 | 0:51 | -1 s | 0.85 | ok |
| 1:33 | 1:33 | +0 s | 1.0 | ok |
| 1:42 | 1:40 | -2 s | 1.0 | ok |
| 2:42 | 2:45 | +3 s | 1.0 | ok |
| 2:57 | 2:57 | +0 s | 1.0 | ok |
| 3:47 | 3:45 | -2 s | 1.0 | ok |
| 3:51 | 3:51 | +0 s | 0.77 | ok |
| 4:30 | 4:29 | -1 s | 1.0 | ok |
| 4:38 | 4:36 | -2 s | 1.0 | ok |
| 4:56 | 4:53 | -3 s | 1.0 | ok |
| 5:13 | 5:11 | -2 s | 1.0 | ok |
| 5:31 | 5:30 | -1 s | 1.0 | ok |
| 6:00 | 5:58 | -2 s | 1.0 | ok |
| 6:31 | 6:30 | -1 s | 1.0 | ok |
| 6:52 | 6:54 | +2 s | 1.0 | ok |
| 7:13 | 7:16 | +3 s | 1.0 | ok |
| 7:36 | 7:33 | -3 s | 1.0 | ok |
| 8:06 | 8:07 | +1 s | 1.0 | ok |
| 8:21 | 8:19 | -2 s | 1.0 | ok |
| 9:44 | 9:47 | +3 s | 1.0 | ok |
| 10:48 | 10:50 | +2 s | 1.0 | ok |
| 11:23 | 11:23 | +0 s | 0.89 | ok |
| 12:47 | 12:46 | -1 s | 1.0 | ok |
| 13:48 | 13:49 | +1 s | 1.0 | ok |
| 14:00 | 13:58 | -2 s | 1.0 | ok |
| 14:22 | 14:24 | +2 s | 1.0 | ok |
| 14:45 | 14:45 | +0 s | 1.0 | ok |
| 16:05 | 16:04 | -1 s | 1.0 | ok |

## Conflictos: lo que se ve contra lo que dice el subtítulo

- 0:21: en pantalla **Nod** ↔ el subtítulo oyó «node». Probable error del subtítulo automático: manda lo de pantalla.
- 3:51: en pantalla **Nod** ↔ el subtítulo oyó «no». Probable error del subtítulo automático: manda lo de pantalla.
- 4:36: en pantalla **Composio** ↔ el subtítulo oyó «compose». Probable error del subtítulo automático: manda lo de pantalla.
- 6:30: en pantalla **GPT-6.2** ↔ el subtítulo oyó «gpt». Probable error del subtítulo automático: manda lo de pantalla.
- 6:30: en pantalla **Sol** ↔ el subtítulo oyó «uso». Probable error del subtítulo automático: manda lo de pantalla.
- 8:07: en pantalla **Demó_Nod** ↔ el subtítulo oyó «demo». Probable error del subtítulo automático: manda lo de pantalla.

## Cifras habladas que vidIQ no mencionó

- 20 GB
- 1100 euros
- 30,99 €

## Plan de visión

```
Video de 16:59 · 3059 palabras en subtítulos · capítulos: 9 · picos del mapa: sin mapa
tramo         pal/min  visual  pico  nombre
0:00-0:52         174     0.0     -  El nuevo agente de n8n: Nod
0:52-3:49         182     0.2     -  Qué tiene de especial Nod
3:49-7:36         176     4.1     -  Instalación y configuración desde cero
7:36-9:45         185     2.0     -  Encargo 1: revisar el correo y preparar una respuesta
9:45-10:48        190     3.0     -  Encargo 2: programar la revisión de cada mañana
10:48-13:48       180     4.8     -  Encargo 3: hablar con Nod desde Telegram
13:48-14:22       168     4.2     -  La bóveda de contraseñas (Vault)
14:22-16:05       185     2.5     -  Encargo 4: preparar una reunión con un cliente
16:05-16:59       174     0.0     -  Para quién tiene sentido

RECOMENDACIÓN
- Video de 16:59: vidIQ `vidiq_video_watch` completo (25 créditos); los minutos se corrigen con el SRT.
- Pídele que ponga más atención en los tramos más visuales: 3:49-7:36, 10:48-13:48, 13:48-14:22

PROMPT PARA vidIQ (copiar tal cual):
Watch the whole video. Return at least 25 key moments in order. Each line: [M:SS] then what is VISIBLE on screen (apps, buttons, menus, shown text, files) and then, in double quotes, the EXACT sentence the speaker says at that moment in the original language. Always include the quoted sentence. Also list every on-screen text, name, price, number and URL you can read. Do not invent anything you cannot see or hear.
```
