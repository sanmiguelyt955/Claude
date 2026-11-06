# «El hombre que vendió la Torre Eiffel» (collage animado, 31 s, 9:16)

Historia real: Victor Lustig, 1925. Se hizo pasar por funcionario del gobierno francés, citó a seis chatarreros en el Hôtel de Crillon, uno (André Poisson) le pagó, Lustig huyó, la víctima no lo denunció por vergüenza, y Lustig volvió para intentarlo otra vez.

- Capas: generadas con `imagenes-flux` (fondos 9:16 FLUX.2 klein + elementos sobre verde FLUX.1 schnell), ~1550 neuronas de la cuota gratis.
- Persona real: de espaldas, sin inventar su cara.
- Música: suspenso sintetizado (tic-tac, latido, golpes en los cortes, crescendo antes del giro).
- Volver a renderizar: `python3 .claude/skills/video-claude/scripts/motion.py collage proyectos/eiffel/eiffel.json --musica <musica.wav>`

## Versión con voz (25,4 s)

- Narración: Cloudflare Workers AI `@cf/deepgram/aura-2-es`, voz `alvaro` (gratis dentro de la cuota diaria). Archivo: `voz_alvaro.mp3`.
- Música hecha a la medida de las escenas: `python3 musica.py musica_voz.wav 4.29 2.72 2.8 2.88 3.5 3.0 3.7 2.52 --giro 7`.
- Render: `motion.py collage eiffel.json --nombre eiffel --voz voz_alvaro.mp3 --musica musica_voz.wav`.
- Salida para celular: H.264 yuv420p (rango tv), máx. 6 Mbps, faststart y -14 LUFS (`para_movil` en motion.py).
