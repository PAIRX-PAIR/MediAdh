# Despliegue en Vercel

Orden recomendado. Los pasos marcados **(tú)** requieren tu cuenta y no se pueden automatizar desde el código.

## 1. Repositorio privado de datos (tú)

1. GitHub → New repository → `smi-taller-data`, **Private**, con README (no puede estar vacío).
2. Token fine-grained: Settings → Developer settings → Fine-grained tokens → acceso **solo** a `smi-taller-data`, permiso **Contents: Read and write**, expiración ≤ 1 año (pon recordatorio para renovarlo).

## 2. Proyecto en Vercel (tú)

Importa `PAIRX-PAIR/MediAdh` en Vercel (framework Next.js, Node 24). Variables de entorno (Production):

| Variable | Valor |
|---|---|
| `DATA_BACKEND` | `github` |
| `GITHUB_DATA_REPO` | `pairx-pair/smi-taller-data` |
| `GITHUB_DATA_TOKEN` | el token del paso 1 |
| `SESSION_SECRET` | 48+ caracteres aleatorios (`openssl rand -base64 48`) |
| `CRON_SECRET` | 32+ caracteres aleatorios |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npm run vapid` (una sola vez; no rotarlas) |
| `VAPID_SUBJECT` | `mailto:` con un correo real del taller |
| `APP_URL` | `https://tu-dominio` |
| `ADMIN_BOOTSTRAP_USERNAME` | `judago` |
| `ADMIN_BOOTSTRAP_NAME` | nombre visible |
| `ADMIN_BOOTSTRAP_PASSWORD_HASH` | el hash de `.env.local` **sin** las barras `\` (en Vercel va tal cual: `scrypt$131072$8$1$...`) |
| `ANDROID_PACKAGE_ID`, `ANDROID_CERT_SHA256` | ver `docs/APK.md` (cuando generes el APK) |

`SETUP_KEY` ya no hace falta si usas el administrador declarado. Si prefieres `/setup`, defínela, crea el admin y bórrala.

## 3. Cron de recordatorios

`vercel.json` programa `/api/cron/recordatorios` una vez al día (plan Hobby). Además, la app revisa recordatorios y cierres cada pocos minutos mientras alguien la usa.

## 4. Firewall (tú)

Vercel → Firewall → regla de límite de tasa para `/api/auth/` (por ejemplo 10 peticiones por minuto por IP). Protege el inicio de sesión y el registro antes de que lleguen a la base de datos.

## 5. Primer ingreso

Entra con `judago`. La app crea la cuenta, pide aceptar la política de datos y queda lista. Luego **borra** las tres variables `ADMIN_BOOTSTRAP_*` en Vercel y vuelve a desplegar. En Ajustes completa: datos legales de la empresa, tarifas por hora, calendario y la tabla del IPC.

## 6. Verificación

- `https://tu-dominio/api/public` responde JSON.
- `https://tu-dominio/manifest.webmanifest` y `/icons/512` cargan.
- En Perfil → «Activar avisos» → «Enviar prueba» llega una notificación.
- El repo `smi-taller-data` recibe commits al crear una OT.
