import { Suspense } from "react";
import { MyRequests } from "./my-requests";

export const metadata = { title: "Pedir material" };

export default function RequestsPage() {
  return (
    <Suspense>
      <MyRequests />
    </Suspense>
  );
}
