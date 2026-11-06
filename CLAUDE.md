# Instrucciones permanentes

## Guardar todo en GitHub

- Al terminar el trabajo de cada conversación (Claude Code o Claude Cowork), sube todo a este repositorio (`sanmiguelyt955/claude`): código, mods, documentos, notas y resultados.
- Objetivo: no perder nunca información. Nada debe quedar solo en el contenedor de la sesión, porque se borra al terminar.
- Haz commit con un mensaje claro y push a la rama designada de la sesión. No crees Pull Request salvo que el usuario lo pida.
- Si algo no cabe en el repo (secretos, claves, tokens), no lo subas: avisa al usuario.
- El usuario habla español: responde en español.

## Cuando el usuario manda un video o un link de video

1. Analízalo (skill `video-claude`).
2. Recomienda TODAS las mejoras que se te ocurran para las skills, apps, conectores y herramientas que ya tenemos (repo, Workers, MCP, etc.).
3. Pregunta siempre, adaptado al caso: «¿Quisieras que yo tuviera la capacidad de hacer lo que se hizo en ese video? Lo haríamos así: [pasos], con estas herramientas gratuitas: [lista], y funcionaría así: [cómo se usaría]. ¿Lo hago tal cual está en el video o hacemos la tuya propia y la vamos modificando?». Detalla lo que harías si dice que sí, y no lo construyas hasta que responda.

## Videos de YouTube / Shorts: solo con el link, sin descargar

- No descargues videos desde la nube. Míralos con acceso por link: datos públicos (título, portada, cuadros públicos), transcripción (Firecrawl) o el conector Gemini Video (Google ve el link directamente).

## Cuando no puedas hacer algo

- Di siempre POR QUÉ no se puede y da las diferentes maneras de solucionarlo (con sus pros y contras).
