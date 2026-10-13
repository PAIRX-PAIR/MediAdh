import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { payrollReport } from "@/lib/server/services/payroll";

export const GET = route({ access: "admin" }, async ({ req, principal }) =>
  json(await payrollReport(principal, req.nextUrl.searchParams.get("quincena"))),
);
