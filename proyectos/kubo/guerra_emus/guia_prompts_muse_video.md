# Guía de prompts para Muse Video (aprendida de la prueba del 2026-11-09)

## Qué salió en la prueba (4 clips de 10 s, 720x1280, 24 fps, con audio)
| Clip | Muse | Costo de cuota | Bien | Mal |
|---|---|---|---|---|
| A dispersión | Cosmo | 8 puntos | Trigal, luz, la dispersión se entiende | Emús de colores (azul, morado, turquesa), abren alas como si volaran |
| B vigía | Sanmisito | 9 puntos | Emú negro, cara de alarma muy buena (5–10 s) | Prismáticos se pierden (3.5–4.5 s), el cuerpo gira raro (1.5–3.5 s), cámara no fija |
| C camión | Orión | 3 puntos | Emús negros sin abrir alas (se corrigió con el prompt) | Un emú «montado» en el camión al inicio; el encuadre se abre de golpe |
| C camión (repetido) | Astro | 9 puntos | Emús oscuros, camión bien | Cambio de ángulo a media toma |
Solo el clip B lo revisó Claude cuadro por cuadro; lo demás es lo que reportó cada Muse viendo 3 cuadros.

## Reglas que salen de ahí
1. **El estilo real del modelo es «pintura digital con volumen»**, no «personajes planos». Pedir planos no funcionó en ninguno de los 4. Se pide el estilo que sí da, para que todos combinen.
2. **Una sola acción por clip.** El clip B falló justo donde había dos acciones seguidas (vigilar y luego voltear).
3. **Nada de objetos en la mano o en la cara** que tengan que durar (prismáticos, cascos): se deforman o desaparecen. Esos gags los pone Claude en la edición.
4. **Decir siempre color y anatomía:** «emús de plumas negras y café oscuro, cuello azul grisáceo, no vuelan, alas pegadas al cuerpo».
5. **Cámara:** escribir «cámara completamente fija, sin cortes, sin cambio de ángulo, un solo plano» al principio y al final del prompt.
6. **Describir el primer cuadro** (qué hay y dónde) antes de la acción: evita sorpresas como el emú en el camión.
7. **Imagen de referencia:** usar el mismo emú en todas las cuentas (ver abajo). Falta probar si Muse Video la respeta.
8. **Apartar antes de generar:** escribir «tomo el clip X» en el recado antes de gastar cuota, para no repetir (el C se hizo dos veces).
9. **Pedir 10 s pero planear usar 3–5 s:** en la edición se corta el mejor tramo.
10. El audio del clip no se usa: el episodio lleva la voz de Kubo, música y sonidos propios.

## Frase de estilo v2 (copiar tal cual al inicio)
«Animación estilo película familiar, pintura digital con volumen suave, colores cálidos saturados, luz de atardecer naranja y dorada, cielo morado con nubes, trigal dorado del oeste de Australia. Emús de plumas negras y café oscuro con cuello azul grisáceo, no vuelan, alas pegadas al cuerpo. Cámara completamente fija, un solo plano, sin cortes. Sin texto, sin letras, sin marcas, sin personas, sin armas. Video vertical 9:16, 10 segundos.»

## Imágenes de referencia del emú (cuadros del clip B)
- Cuerpo: https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/proyectos/kubo/guerra_emus/clips_prueba/emu_ref_cuerpo.png
- Cara: https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/proyectos/kubo/guerra_emus/clips_prueba/emu_ref_cara.png

## Cómo se usan los clips en el episodio
Como «cortes de película» a pantalla completa de 3–5 s, con Kubo narrando encima (voz) y apareciendo en una esquina o entre cortes. No se mezcla Kubo dentro del clip.
