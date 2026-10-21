import { Suspense } from "react";
import { SuppliesScreen } from "./supplies-screen";

export const metadata = { title: "Insumos requeridos" };

export default function SuppliesPage() {
  return (
    <Suspense>
      <SuppliesScreen />
    </Suspense>
  );
}
