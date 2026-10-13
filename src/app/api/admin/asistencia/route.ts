import { json, readJson } from "@/lib/server/http";
import { attendanceInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createAttendance } from "@/lib/server/services/payroll";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, attendanceInput);
  const entry = await createAttendance(principal, input);
  return json({ entry }, { status: 201 });
});
