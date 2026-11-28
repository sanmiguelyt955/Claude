# Prueba del combo vidIQ + YTAPI: video «El nuevo AGENTE IA de n8n es GRATIS…» (riHQvfhwWAQ)

Canal: Migue Baena IA · 16:57 · 29,312 vistas · subtítulos en es/en/pt/ar.

## Qué hicimos y cuánto costó

| Paso | Herramienta | Créditos |
|---|---|---|
| Información (duración, idiomas) | YTAPI `get_video_info` | 0 |
| Subtítulos con tiempos (SRT, español) | YTAPI `get_transcript` | 1 |
| Capítulos y descripción | YTAPI `get_video_details` | 1 |
| Mapa de calor | YTAPI `get_video_heatmap` | 0 (el video no tiene gráfica; el error no cobra) |
| Ver el video (imagen + audio) | vidIQ `video_watch`, cuenta Mejoresreposdegithub777 (115 → 90 créditos) | 25 |
| Corregir minutos y plan | `corregir_tiempos.py` y `ytapi_plan.py` (locales) | 0 |
| **Total** | | **27 (2 de YTAPI + 25 de vidIQ)** |

## Resultado de la corrección de minutos

- vidIQ dio 33 momentos, cada uno con el minuto, lo que se ve y la frase hablada entre comillas.
- Al buscar la frase en el SRT: **31 coincidían a ±3 s y 2 se movieron 3 s** (2:42 → 2:45 y 7:13 → 7:16). Las diferencias nunca pasaron de 6 s. Tabla completa: `2026-11-28-nod/tabla_correccion.txt`.
- Conclusión: en un video de 17 minutos vidIQ sí acierta los minutos; el combo sirve para fijar el segundo exacto, no para rescatar el video. El valor grande está en videos largos, donde vidIQ llegó a equivocarse por más de 40 minutos.

## Qué aporta cada uno (en este video)

- **vidIQ acertó en lo que YTAPI se equivoca** (el subtítulo automático oye mal):
  - «Composio» (en pantalla) frente a «Compose AI» (subtítulo);
  - «DEMO_NOD» frente a «demo not»;
  - «Nod» frente a «Node/Note/Not»;
  - el texto de los prompts que se escriben en pantalla;
  - el título «Meet Nod», los botones y los nombres de menús.
- **YTAPI acertó en lo que vidIQ omitió:**
  - las cifras habladas: 1100 € (antes 900), factura de 450 € (acordado 350 €), Sony 30,99 € y 34,94 € con envío;
  - los requisitos de Windows (11 de 64 bits, 20 GB libres, WSL 2);
  - los capítulos oficiales de la descripción.
- **Conflicto sin resolver:** el modelo elegido en 6:31. El subtítulo dice «GPT-4o» y vidIQ leyó en pantalla «GPT-6.2 Sol». Para decidir hace falta ver ese cuadro.
- vidIQ no devolvió nada después del 16:05 (el cierre), aunque sí cubrió el resto.

## De qué trata el video (Nod, el agente de n8n)

Instala Nod en Windows (app gratis, código abierto, `github.com/n8n-io/nod`, corre en el propio ordenador y se elige el modelo), conecta Gmail y ChatGPT, y hace 4 encargos: revisar correos y preparar un borrador, programar la revisión de lunes a viernes a las 8:30, hablar con él por Telegram (comparar auriculares en un Excel) y preparar una reunión con un cliente. También muestra Vault, la bóveda de contraseñas que no se las entrega al modelo.
Advertencias del autor: el ordenador tiene que seguir encendido y sin suspender, «gratis» no significa costo cero si se usa un modelo por API, y hay que revisar lo que genera.
