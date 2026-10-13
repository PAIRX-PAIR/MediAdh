import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Runs scripts/cargar-equipo.ts with the app's aliases (npm run equipo:cargar). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["scripts/cargar-equipo.ts"], testTimeout: 120000 },
});
