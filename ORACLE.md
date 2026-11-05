# video-nube 24/7 gratis en Oracle Cloud (desde el celular)

Un servidor Oracle «Always Free» (2 CPU ARM y 12 GB de RAM, gratis para siempre) que da servicio a la vez a **Claude Code y Cowork**.
No hace falta terminal: un script de inicio lo instala todo solo, con HTTPS incluido. Tiempo: unos 15 min tuyos + 20-30 min de instalación automática.

## 1. Crear la cuenta (una vez)
1. Entra en https://signup.cloud.oracle.com.
2. **Home region:** elige la más cercana (p. ej. *Mexico Central (Querétaro)*, *US East (Ashburn)* o *Brazil East (São Paulo)*). **No se puede cambiar después.**
3. Introduce la tarjeta. Solo se usa para verificar tu identidad: no cobran mientras uses los recursos «Always Free».
4. Recomendado: en **Billing → Upgrade and Manage Payment**, pasa la cuenta a **Pay As You Go**. Sigue sin costar nada dentro de lo gratuito, y evita que Oracle recupere servidores gratuitos que pasen mucho tiempo inactivos.

## 2. Preparar el script
1. Abre en GitHub el archivo **`dist/oracle-video-nube.sh`** → botón **Raw** → selecciona todo → **Copiar**.
2. Ten pensada tu clave secreta, con letras, números y guiones (p. ej. `vn-8f3k2p9q7x4m`). Irá dentro de la URL; no la compartas.

## 3. Crear el servidor
Menú ☰ → **Compute** → **Instances** → **Create instance**:
| Campo | Valor |
|---|---|
| Name | `video-nube` |
| Image | **Change image** → **Canonical Ubuntu** → **24.04** (no la *Minimal*) |
| Shape | **Change shape** → **Ampere** → **VM.Standard.A1.Flex** → **2 OCPUs** y **12 GB** de memoria |
| Networking | deja *Create new virtual cloud network* y *Assign a public IPv4 address* |
| Add SSH keys | **No SSH keys** (deja más espacio para el script) |
| Show advanced options → **Management** → Initialization script | **Paste cloud-init script** → pega el script y **cambia `CAMBIA-ESTA-CLAVE` por tu clave** en la 3.ª línea |

Pulsa **Create**. Si sale *Out of capacity*, prueba otro *Availability domain* o vuelve a intentarlo más tarde: es habitual en las regiones con mucha demanda.

## 4. Abrir el acceso HTTPS (obligatorio)
En la página de la instancia: **Primary VNIC** → enlace de la **Subnet** → **Security Lists** → **Default Security List** → **Add Ingress Rules**:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: `TCP`
- Destination Port Range: `80,443`

**Add Ingress Rules.**

## 5. Tu URL
1. Copia la **Public IP address** de la instancia, p. ej. `150.136.10.20`.
2. Cambia los puntos por guiones y añade `.sslip.io` → `150-136-10-20.sslip.io`.
3. Pasados 20-30 min, abre `https://150-136-10-20.sslip.io/` en el celular. Debe mostrar `{"servicio":"video-nube","estado":"ok",…}`.
4. Tu URL de conector:
   ```
   https://150-136-10-20.sslip.io/<tu-clave>/mcp
   ```
   La primera vez, el servidor descarga unos 12 GB de modelos en segundo plano: las primeras herramientas pueden tardar unos minutos más.

## 6. Conectarlo
- **Cowork / claude.ai:** Configuración → **Conectores** → **Añadir conector personalizado** → pega la URL → nombre `video-nube`. Sube también las skills `dist/ver-video.zip` y `dist/video-editor.zip` en Configuración → **Capacidades / Skills**.
- **Claude Code (web y app):**
  ```
  /plugin marketplace add https://github.com/sanmiguelyt955/claude.git#claude/video-editing-skill-6wybxb
  /plugin install video-claude@sanmiguel
  ```
  Después añade la variable `VIDEO_NUBE_URL` con tu URL en el entorno de la nube (menú del entorno → **Edit** → variables de entorno). En las sesiones de este repo también funciona sin servidor, dentro de la propia sesión.

## Si algo falla
- **La URL no responde tras 30 min:** revisa el paso 4 (puertos 80 y 443).
- **Ver cómo va la instalación (o por qué falló):** abre `https://150-136-10-20.sslip.io/<tu-clave>/instalacion.txt`, con tu IP con guiones. Se actualiza cada 15 s. Al final debe decir `INSTALACION TERMINADA`. Si ves un error, cópiame las últimas líneas (sin la clave).
- **Actualizar el código más adelante:** te generaré un script nuevo. Lo más sencillo es crear otra instancia con él y borrar la anterior. Se puede volver a crear gratis cuantas veces quieras.
