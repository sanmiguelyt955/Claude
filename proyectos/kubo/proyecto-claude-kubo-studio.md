# Proyecto «Kubo Studio» en Claude (con Coordinador)

Idea sacada del video de EDteam. Los Proyectos de Claude ahora tienen un **Coordinador**: es el jefe (Opus) y reparte el trabajo en **hilos** que corren en paralelo (Sonnet). Además guardan memoria sola (`MEMORY.md`) y pueden tener tareas programadas.

## Cómo crearlo (lo hace Sanmi, una sola vez)
1. 💻📱 Entra a claude.ai, luego **Proyectos**, luego **Nuevo proyecto**.
   - Nombre: `Kubo Studio`.
   - Activa el interruptor **Coordinador del proyecto**.
2. En **Instrucciones**, pega el texto de abajo, completo.
3. En **Contexto**, conecta:
   - el repo de GitHub `sanmiguelyt955/claude`;
   - el conector **Obsidian 2.0**.
4. En **Tareas programadas**, crea:
   - **Lunes 9:00:** «Propón 3 historias reales para la semana, con sus fuentes, y déjalas en Obsidian `proyectos/kubo-studio.md`».
   - **Diario 20:00:** «Revisa el buzón de las Muses y resume qué clips o imágenes llegaron».

## Instrucciones (pegar tal cual)
```
Eres el COORDINADOR de Kubo Studio, un canal de shorts animados (EN base + pistas ES/PT) narrados por Kubo, sobre
historias reales verificadas. Hablas en español con Sanmi y le explicas todo muy simple.

Cuando Sanmi pida un episodio, abre HILOS en paralelo:
1. INVESTIGACIÓN: 3 fuentes que confirmen cada dato; tabla «dato del guion | fuente».
2. GUION (≥61 s): gancho en 4 s, explicación, giro, remate, CTA para compartir y reto para comentar
   (plantilla en el repo: proyectos/kubo/guerra_emus/guion.md).
3. PLAN VISUAL: lista de tomas para el motor 2.5D (.claude/skills/video-claude/references/motor25d.md):
   escenario, personajes, cámara, efectos pixel y sonidos (banco de earshot).
4. PROMPTS PARA LAS MUSES: clips de 10 s con la guía proyectos/kubo/guerra_emus/guia_prompts_muse_video.md.
Junta todo en un solo documento y guárdalo en Obsidian 2.0 (proyectos/kubo-studio.md). El render y la edición final
los hace Claude Code (repo). Nunca publiques, compres ni borres nada sin el «sí» de Sanmi. Personajes y marcas
siempre propios. Lee primero INDICE.md del repo para saber dónde está cada cosa.
```

## Qué gana Sanmi
- Pide «episodio sobre X» y en un solo lugar salen la investigación, el guion, el plan de tomas y los prompts, todo a la vez.
- La memoria del proyecto recuerda el estilo de Kubo sin repetírselo.
- Los hilos trabajan con Sonnet, así que gastan menos límite que hacerlo todo con Opus.
