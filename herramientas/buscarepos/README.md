# buscarepos — el buscador inteligente de repos de GitHub

Dile lo que quieres hacer, en español, y te da **los mejores repos para eso, del mejor al peor, adaptados a ti**.

```bash
python3 buscarepos.py "hacer videos 3D animados con código para shorts"
python3 buscarepos.py "transcribir audio en español" --cpu --gratis --comercial
python3 buscarepos.py --veredicto owner/repo bueno "lo usamos y funcionó"     # le enseñas
```

## Qué lo hace distinto
1. **Entiende tu necesidad**: Gemini la convierte en 6-8 búsquedas cortas de GitHub con los nombres de herramientas reales.
2. **Tira la basura**: archivados, forks, listas «awesome», sin código, muertos (>18 meses) y juguetes.
3. **Lee los README** de los 25 mejores: ¿se instala fácil?, ¿tiene demo?, ¿pide GPU?, ¿pide una API de pago?, ¿tiene pruebas?, ¿está hecho para agentes?
4. **Te conoce**: `datos/perfil.json` (tu equipo, tus reglas y lo que ya tienes). Un juez (Gemini) califica 0-10 qué tanto sirve cada repo **para ti**, y baja la nota si no cabe en tu equipo, si cuesta dinero o si repite lo que ya tienes.
5. **Aprende**: tus veredictos (`bueno` / `malo`) suben o bajan ese repo en búsquedas futuras; cada búsqueda queda en `datos/indice.json`.
6. **Te dice la verdad de la licencia**: marca lo que no deja ganar dinero, lo copyleft y lo que no tiene licencia.
7. **Tres recomendaciones**: el mejor, el mejor gratis sin GPU y la promesa nueva (repos recientes o en tendencia).

Puntos (0-100) = relevancia 35 + juez 15 + popularidad 15 + actividad 15 + salud 10 + licencia 10 + tus veredictos.
Niveles: **Usar ya** (≥70), **Adaptar** (55-69), **Estudiar** (<55).

## Requisitos
Python 3.9+ (solo biblioteca estándar) y `gh` con sesión iniciada (búsqueda de GitHub, ~30 búsquedas/min).
Opcional: `GEMINI_API_KEY` (sin ella usa un diccionario de sinónimos y no hay juez).

## Seguridad
Solo **lee** datos públicos (búsqueda de GitHub y README). No clona, no instala y no corre nada de lo que encuentra.
Revisa siempre el código de un repo antes de usarlo.
