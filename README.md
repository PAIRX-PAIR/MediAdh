# SMI Taller · Centro de mando

App web (PWA + APK Android) para un taller industrial: tareas por puesto, barra de tareas en vivo, solicitudes de material con
ventana emergente para los admins, cierre de día, contratos que liberan el puesto al vencer, registro con aprobación del admin
y avisos push. Next.js 16 en Vercel, con un **repositorio privado de GitHub como base de datos**.

> Estado: núcleo (datos, seguridad, API) terminado y probado. La interfaz está en construcción.
> Ver **[docs/CONTINUAR.md](docs/CONTINUAR.md)** para el estado exacto y cómo seguir.

## Arrancar en local

```bash
git checkout claude/smi-information-6393uk
npm install
cp .env.example .env.local      # DATA_BACKEND=file usa .data/ en tu equipo
npm run dev                     # http://localhost:3000
npm run check                   # typecheck + lint + tests
```

## Stack

Next.js 16.4 (App Router, `proxy.ts`) · React 19.2 · TypeScript 5.9 · Tailwind 4 · Motion 14 · React Three Fiber 9 + drei 10 ·
zod 4 · jose 6 · web-push · Vitest · Playwright.
