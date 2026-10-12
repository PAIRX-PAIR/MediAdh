import { Suspense } from "react";
import { ArchiveScreen } from "./archive-screen";

export const metadata = { title: "Histórico de trabajos" };

export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveScreen />
    </Suspense>
  );
}
