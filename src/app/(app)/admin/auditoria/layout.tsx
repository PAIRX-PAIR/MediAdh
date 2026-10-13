import type { ReactNode } from "react";
import { requireOwner } from "@/lib/server/owner-gate";

export const metadata = { title: "Auditoría" };

export default async function Layout({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
