import { Suspense } from "react";
import { FinanceScreen } from "./finance-screen";

export const metadata = { title: "Ganancias del mes" };

export default function FinancePage() {
  return (
    <Suspense>
      <FinanceScreen />
    </Suspense>
  );
}
