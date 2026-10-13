# App en el celular: APK de Android e iPhone

La app es una PWA. En Android se distribuye además como **APK** (Trusted Web Activity con Bubblewrap): abre la misma web a pantalla completa, sin barra de direcciones, con su ícono y notificaciones. No hay que publicar nada en Play Store.

## 1. Crear la llave de firma (una sola vez)

Necesitas Java (JDK 17 o superior). En una terminal:

```bash
keytool -genkeypair -v -keystore android.keystore -alias smi -keyalg RSA -keysize 2048 -validity 10000
```

Guarda **el archivo y las dos contraseñas** en un lugar seguro (gestor de contraseñas). Si se pierden, no se pueden publicar actualizaciones del APK con la misma firma. **Nunca** subas `android.keystore` al repositorio.

Obtén la huella SHA-256 (es pública, no es un secreto):

```bash
keytool -list -v -keystore android.keystore -alias smi
```

Copia la línea `SHA256: AA:BB:…` (32 pares).

## 2. Configurar GitHub y Vercel

En GitHub → repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | el keystore en base64 (`base64 -w0 android.keystore` en Linux/Git Bash) |
| `ANDROID_KEYSTORE_PASSWORD` | contraseña del keystore |
| `ANDROID_KEY_PASSWORD` | contraseña de la llave |

En Vercel → proyecto → **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `ANDROID_PACKAGE_ID` | `co.smi.procesos` (o el que definas en `android/twa-manifest.json`) |
| `ANDROID_CERT_SHA256` | la huella `AA:BB:…` del paso 1 |

Después de desplegar, `https://TU-DOMINIO/.well-known/assetlinks.json` debe mostrar el paquete y la huella. Sin eso, el APK abre con barra de navegador.

## 3. Generar el APK

GitHub → **Actions → APK Android → Run workflow**. Escribe el dominio (ej. `smi-procesos.vercel.app`), la versión visible y un número de versión que siempre suba (1, 2, 3…). Al terminar, descarga el artefacto: trae `app-release-signed.apk` (para instalar directo) y `app-release-bundle.aab` (por si algún día se publica en Play Store).

## 4. Instalar en los celulares

**Android (APK):**
1. Envía el archivo `app-release-signed.apk` por WhatsApp o un enlace.
2. Ábrelo. Android pedirá permitir «Instalar apps desconocidas» para WhatsApp o el navegador: actívalo solo para esta instalación.
3. Abre «S.M.I.», inicia sesión y en Perfil toca «Activar avisos».

**Android (sin APK):** en Chrome abre el dominio, menú ⋮ → «Instalar app».

**iPhone:** en Safari abre el dominio → botón Compartir → «Agregar a pantalla de inicio». Abre la app desde el ícono y activa los avisos en Perfil (en iPhone los avisos solo funcionan así, desde iOS 16.4).

## 5. Actualizaciones

Los cambios de la web se ven al instante en el APK (es la misma app). Solo hay que generar un APK nuevo si cambias el nombre, el ícono, el dominio o los colores del inicio.
