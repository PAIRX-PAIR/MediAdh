"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function RetryButton() {
  return (
    <Button size="lg" icon={<RefreshCcw className="size-5" />} onClick={() => window.location.reload()}>
      Reintentar
    </Button>
  );
}
