import type { Metadata } from "next";
import { OperatorAccess } from "./operator-access";

export const metadata: Metadata = {
  title: "Soy operario",
  robots: { index: false, follow: false },
};

/** Operators: access by QR, approved by an admin; then their own queue on this phone. */
export default function OperatorPage() {
  return <OperatorAccess />;
}
