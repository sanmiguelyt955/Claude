# SkillSommelier → https://github.com/sanmiguelyt955/SkillSommelier

Busca **skills** (SKILL.md) para cualquier necesidad. Lee cada una antes de recomendarla:
- **Seguridad:** ⛔ peligrosas (mandar claves, ejecutar descargas, código escondido, saltarse permisos o anti-bots) y ⚠️ revisar (telemetría, sudo).
- **Requisitos reales:** solo si el SKILL.md los pide: 💳 clave de paga, 🧱 modelos pesados, 🍎 solo Mac, 🪟 solo Windows. Van aparte, sin perder puntos.
- **Instalaciones falsas:** millones de instalaciones con pocas estrellas, o copias en muchas cuentas.
- **Tus skills primero.**
- **Fuentes:** skills.sh, SkillsMP, GitHub, anthropics/skills, HN, YouTube.
- **Familia:** RepoSommelier ↔ MCPSommelier ↔ SkillSommelier. Si uno no encuentra nada, pregunta a los otros dos.

```bash
cd ~/skillsommelier && python3 skillsommelier.py "hacer videos al ritmo de la música" --where cloud
python3 skillsommelier.py --audit owner/repo/skill
```

## 🧰 kit.py: el kit completo para una meta
Es el mismo archivo en los tres repos. Parte la meta en pasos y en cada uno da solo lo que hace falta (📦 repo, 🔌 conector, 🎓 skill o 🤖 nada). Respeta «gratis» y «para monetizar» (licencias comerciales).
```bash
cd ~/skillsommelier && python3 kit.py "quiero hacer videos animados gratis con IA y publicarlos en YouTube para monetizarlos" --where cloud --inventory /ruta/a/tu/inventory.json
```
