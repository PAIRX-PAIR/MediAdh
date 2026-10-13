import type { ReactNode } from "react";
import { requireOwner } from "@/lib/server/owner-gate";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
