import { Suspense } from "react";
import { ClientsScreen } from "./clients-screen";

export const metadata = { title: "Clientes" };

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsScreen />
    </Suspense>
  );
}
