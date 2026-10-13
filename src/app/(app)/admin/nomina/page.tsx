import { Suspense } from "react";
import { PayrollScreen } from "./payroll-screen";

export const metadata = { title: "Nómina" };

export default function PayrollPage() {
  return (
    <Suspense>
      <PayrollScreen />
    </Suspense>
  );
}
