"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#14336a] px-5 font-semibold text-white hover:bg-[#1c4690]"
    >
      <Printer className="size-4" aria-hidden /> Imprimir o guardar PDF
    </button>
  );
}
