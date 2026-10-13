import { Suspense } from "react";
import { OrdersScreen } from "./orders-screen";

export const metadata = { title: "Órdenes de trabajo" };

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  );
}
