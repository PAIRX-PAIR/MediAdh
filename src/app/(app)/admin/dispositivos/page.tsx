import { Suspense } from "react";
import { DevicesScreen } from "./devices-screen";

export const metadata = { title: "Accesos QR" };

export default function DevicesPage() {
  return (
    <Suspense>
      <DevicesScreen />
    </Suspense>
  );
}
