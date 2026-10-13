import { Suspense } from "react";
import { QuotesScreen } from "./quotes-screen";

export const metadata = { title: "Cotizador" };

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesScreen />
    </Suspense>
  );
}
