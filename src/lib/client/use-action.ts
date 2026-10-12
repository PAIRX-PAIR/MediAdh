"use client";

import { useCallback, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { useToast } from "@/components/ui/overlay";
import { ApiError } from "./api";

/**
 * Runs a mutation with one shared pattern: busy flag, success toast, error
 * toast with the server's message, then a sync refresh so every view updates.
 */
export function useAction() {
  const toast = useToast();
  const { refresh } = useSync();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string | ((result: T) => string)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const result = await fn();
        if (success) toast(typeof success === "function" ? success(result) : success);
        await refresh();
        return result;
      } catch (error) {
        toast(error instanceof ApiError || error instanceof Error ? error.message : "Ocurrió un error.", "error");
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [refresh, toast],
  );

  return { run, busy, isBusy: (key: string) => busy === key };
}
