# «El robo de la Mona Lisa» (collage animado, 98 s, 9:16)

Historia real (1911): Vincenzo Peruggia, que había trabajado en el Louvre poniendo cristales a los cuadros, entró un
lunes con el museo cerrado vestido con la bata blanca de los obreros, descolgó la Mona Lisa, le quitó el marco en una
escalera de servicio y la escondió bajo la bata; un fontanero le abrió la puerta cerrada. Nadie notó la falta en más
de un día (los guardias creyeron que estaba con los fotógrafos). El Louvre cerró una semana; miles de personas fueron a
ver el hueco vacío; arrestaron al poeta Guillaume Apollinaire e interrogaron a Pablo Picasso. El cuadro estuvo dos
años en un baúl en París (la policía llegó a hablar con Peruggia). En diciembre de 1913 intentó venderlo en Florencia
al marchante Alfredo Geri; el director de los Uffizi comprobó el sello del Louvre en el reverso y llamaron a la
policía. Peruggia dijo que quería devolverla a Italia. El robo la volvió el cuadro más famoso del mundo.

- `narracion.txt`: guion de la voz (una línea = una escena). `voz_alvaro.mp3`: Cloudflare `@cf/deepgram/aura-2-es`, voz `alvaro`.
- `imagenes.json`: prompts de las 28 capas (FLUX vía Worker `imagenes-flux`; ~3300 neuronas de la cuota gratis).
- `monalisa.json`: guion del collage (26 escenas, `animo` y `sfx` por escena, titulares y flashes).
- Render: `python3 .claude/skills/video-claude/scripts/motion.py collage proyectos/monalisa/monalisa.json --nombre monalisa --voz proyectos/monalisa/voz_alvaro.mp3 --banda`
- Personas reales (Peruggia, Picasso) no aparecen con cara: el obrero va de espaldas y Picasso se representa con una paleta.
