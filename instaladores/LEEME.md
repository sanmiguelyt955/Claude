# Instaladores de Proclama

| Archivo | Sistema | SHA-256 |
|---|---|---|
| `Proclama-Setup-0.3.1.exe` | Windows 10 / 11 (64 bits) | `794d8239b51cfce3219848c094f234c445335f7771b0d30d15e97e7e99ba825e` |

Descarga el `.exe`, ejecútalo y sigue los pasos. No pide permisos de administrador.

- Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas** (el instalador no
  está firmado).
- La primera vez, permite el acceso en **redes privadas** cuando lo pregunte el Firewall, para usar el control remoto.
- Después de instalar, las versiones nuevas llegan con el botón **Actualizar** dentro de la app; no hace falta volver a
  descargar el instalador.

Se genera con `node proclama/tools/build-installer.mjs`. Incluye Node.js v22.23.5 (licencia MIT).
