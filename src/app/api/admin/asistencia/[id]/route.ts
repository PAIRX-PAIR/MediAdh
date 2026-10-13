import { json, readJson } from "@/lib/server/http";
import { attendancePatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { deleteAttendance, updateAttendance } from "@/lib/server/services/payroll";

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, attendancePatchInput);
  const entry = await updateAttendance(principal, params.id!, patch);
  return json({ entry });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteAttendance(principal, params.id!);
  return json({ ok: true });
});
