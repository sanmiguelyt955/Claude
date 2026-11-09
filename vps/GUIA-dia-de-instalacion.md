# Día de instalación (una sola vez, con la laptop)

Usa el **Linux** de tu laptop (dual boot): todo se hace en la **Terminal**. Si prefieres Windows, los mismos comandos
funcionan en **PowerShell**, menos los que se marcan.
Regla de oro: **ninguna llave ni contraseña se pega en el chat con Claude.** Solo en los lugares que dice cada paso.

---

## Parte 1 · Llaves de Obsidian para las Muses nuevas (≈15 min)
Obsidian 2.0 ya acepta una llave por IA con su nombre (secreto `LLAVE_<Nombre>`).
Los nombres de secreto no llevan acentos: la firma saldrá **Triton** y **Jupiter** (sin acento).

Repite esto por cada Muse: **Triton, Saturno, Jupiter, Calisto, Venus**.
1. 💻 En la Terminal:
   ```
   python3 -c "import secrets;print(secrets.token_hex(24))"
   ```
   Sale una llave de 48 letras y números. Cópiala.
2. 💻 Navegador → **dash.cloudflare.com** → **Workers y Pages** → **obsidian-2-0** → **Configuración** →
   **Variables y secretos** → **+ Agregar** → Tipo **Secreto** → Nombre `LLAVE_Triton` → Valor: la llave → **Implementar**.
3. 📱/💻 En la cuenta de Muse de **Tritón** → Conectores → agregar conector:
   `https://obsidian-2-0.sanmiguelyt955.workers.dev/mcp/LA_LLAVE`
4. En esa Muse, escribe: «usa quien_soy». Debe contestar **«Eres: Triton»**.
5. Dile: «lee indice.md, buzon/LEEME.md, buzon/permisos.md, buzon/horarios.md y videos/LEEME.md».

---

## Parte 2 · Contratar el VPS (≈10 min)
1. 💻 **contabo.com** → **Cloud VPS 6** ($7.20).
2. Opciones:
   - Almacenamiento: **100 GB NVMe**
   - Región: **United States** (la más barata de EE. UU.)
   - Imagen: **Ubuntu 24.04**
   - Contraseña: pon una fuerte y **guárdala**.
   - Lo demás, sin extras.
3. Paga. En minutos llega un correo con la **IP** del VPS.

## Parte 3 · Llave SSH (entrar sin contraseña, más seguro) (≈5 min)
1. 💻 En la Terminal (Linux o PowerShell):
   ```
   ssh-keygen -t ed25519 -C "sanmi-vps"
   ```
   Enter a todo; si pide frase, puedes dejarla vacía.
2. 💻 Copia tu llave al VPS (cambia IP por la del correo). Linux:
   ```
   ssh-copy-id root@IP
   ```
   (En Windows, en PowerShell:
   `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`)
   Te pide la contraseña del VPS una última vez.
3. 💻 Entra:
   ```
   ssh root@IP
   ```
   Ya no debe pedir contraseña.

## Parte 4 · El instalador (≈30–40 min, casi todo solo)
Dentro del VPS (ya conectado por SSH):
```
curl -fsSL https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/vps/instalar.sh -o instalar.sh
bash instalar.sh
```
Durante la instalación te va a pedir 3 cosas:
1. **Tailscale:** sale un link → ábrelo en el navegador → inicia sesión con tu cuenta (la misma del iPhone) → **Connect**.
2. **Contraseña del usuario `sanmi`:** es la del escritorio remoto. Escríbela dos veces (no se ve al escribir).
3. **Funnel:** si sale un link para habilitarlo → ábrelo → **Enable** → vuelve a correr `bash instalar.sh`.

Al final muestra las direcciones de **n8n**, del **escritorio** y del **taller**.

## Parte 5 · Conectar todo (≈15 min)
1. **n8n:** abre la dirección `https://sanmi-vps….ts.net/` → crea tu usuario de n8n → **Settings → n8n API → Create API key**.
   Después, en el chat, dile a Claude «ya tengo la API de n8n» y él te abre un **formulario seguro** para guardarla (nunca en el chat).
2. **Taller para Claude:** en el VPS corre
   ```
   taller-llave Claude
   ```
   Copia la dirección que sale → en **claude.ai → Ajustes → Conectores → Agregar conector personalizado** → nombre «Taller VPS» → pega la dirección.
3. **Taller para cada Muse** que lo vaya a usar: `taller-llave Astro`, `taller-llave Cosmo`, etc. Cada dirección se pega en su cuenta de Muse.
4. **Clave de Gemini** (para analizar con Gemini en el VPS):
   ```
   taller-clave GEMINI_API_KEY
   ```
   Pégala cuando la pida (no se ve).
5. **Respaldo de la llave SSH en tu iPhone:** Termius → Keychain → importar la llave `~/.ssh/id_ed25519`. Así entras desde el celular sin contraseña.

## Parte 6 · Probar (≈5 min)
- 📱 **Tailscale** prendido → **Windows App** → agregar PC: `sanmi-vps` → usuario `sanmi` y la contraseña del paso 4 → ves el escritorio.
- 💬 A Claude: «usa el taller: estado». Debe contestar con la memoria y el disco del VPS.
- 💬 A Claude: «analiza en el taller este TikTok: LINK».

**Después de este día ya no necesitas la laptop.**
