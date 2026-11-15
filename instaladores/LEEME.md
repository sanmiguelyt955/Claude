# Instalador de Proclama para Windows

## Descarga directa

**[⬇ Proclama-Setup-0.4.0.exe](https://github.com/sanmiguelyt955/Claude/raw/claude/easyworship-holyrics-app-ewit4p/instaladores/Proclama-Setup-0.4.0.exe)** (25 MB, sin ZIP)

Cuando la versión esté en `main`, el enlace de descarga directa será:
https://github.com/sanmiguelyt955/Claude/raw/main/instaladores/Proclama-Setup-0.4.0.exe

| Archivo | Sistema | SHA-256 |
|---|---|---|
| `Proclama-Setup-0.4.0.exe` | Windows 10 / 11 (64 bits) | `6c33fba6b4f11f812ca19be7baf4d98c732ea848b533679a69ae1d2fc1374179` |

Descárgalo, ejecútalo y sigue los pasos. No pide permisos de administrador.

- Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas** (el instalador no está firmado).
- La primera vez, permite el acceso en **redes privadas** cuando lo pregunte el Firewall, para usar el control remoto.
- Después de instalar, las versiones nuevas llegan con el botón **Actualizar** dentro de la app.

Para Linux no hay instalador .exe: usa `bash proclama/tools/install-linux.sh`.

Se genera con `node proclama/tools/build-installer.mjs`. Incluye Node.js v22.23.5 (licencia MIT).
