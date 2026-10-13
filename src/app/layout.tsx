import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_TALLER_NAME?.trim() || "Procesos productivos S.M.I.";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · Centro de mando del taller`, template: `%s · ${APP_NAME}` },
  description: "Tareas, solicitudes de material, cierres de día y avisos del taller en tiempo real.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icons/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#030812",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The Android keyboard shrinks the layout like iOS does, so bottom bars stay visible.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which the nonce-based CSP requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es-CO" data-nonce={nonce ? "" : undefined}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
