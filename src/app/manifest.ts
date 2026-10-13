import type { MetadataRoute } from "next";

/**
 * Installable app. It opens on /inicio (which sends each person to their own
 * board), never on the landing page, so phones never download the 3D hero.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_TALLER_NAME?.trim() || "Procesos productivos S.M.I.";
  return {
    id: "/inicio",
    name,
    short_name: "S.M.I.",
    description: "Órdenes de trabajo, tareas por puesto, pedidos de material y avisos del taller.",
    lang: "es-CO",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#030812",
    theme_color: "#030812",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mis tareas", short_name: "Tareas", url: "/tareas", icons: [{ src: "/icons/96", sizes: "96x96", type: "image/png" }] },
      { name: "Pedir material", short_name: "Pedir", url: "/solicitudes?nueva=1", icons: [{ src: "/icons/96", sizes: "96x96", type: "image/png" }] },
      { name: "Órdenes de trabajo", short_name: "Órdenes", url: "/admin/ordenes", icons: [{ src: "/icons/96", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
