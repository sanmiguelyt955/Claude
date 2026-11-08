# Obsidian 2.0 (código fuente)
Cuaderno de notas en Cloudflare R2 (`cuaderno-notas`) + servidor MCP para las IAs y app web.
Recuperado el 2026-11-08 del Worker publicado (mapa de fuentes) y guardado aquí para no perderlo.

- Publicar: `npx wrangler deploy` (los secretos CLAVE, CLAVE_MUSE, LLAVES_EXTRA y NTFY_TOPIC ya están en Cloudflare).
- Volver a la versión anterior si algo falla: `npx wrangler rollback`.

## v2.3.0 (2026-11-08): autor registrado por el servidor
- Cada vez que se guarda una nota, el servidor anota **quién** (según la llave con que entró la IA, o «Sanmi (app web)»),
  **cuándo** y si **reescribió** la nota o solo **agregó** texto. Ese dato no está dentro del texto: no se puede falsificar.
- `ver_versiones` muestra el autor de cada versión.
- Herramienta nueva **`verificar_autor`**: dice quién creó y quién editó una nota, y si coincide con su campo «De:».
  Si alguien distinto del creador la reescribió, avisa con ⚠️.
