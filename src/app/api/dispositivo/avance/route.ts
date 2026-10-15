import { json, readJson } from "@/lib/server/http";
import { deviceProgressInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { deviceReportProgress, deviceTasks } from "@/lib/server/services/devices";

/** Open tasks of this phone's operator, and minutes left in the shift (for the end-of-shift check-in). */
export const GET = route({ access: "public" }, async () => json(await deviceTasks()));

/** Saves the check-in answers (estado, piezas, horas, motivo de bloqueo). */
export const POST = route({ access: "public" }, async ({ req }) => {
  const input = await readJson(req, deviceProgressInput);
  return json(await deviceReportProgress(input.updates));
});
