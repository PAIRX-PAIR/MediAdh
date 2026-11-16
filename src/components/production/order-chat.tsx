"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useSync } from "@/components/providers/sync-provider";
import { formatDateTime } from "@/lib/domain/labels";
import type { ChatMessage } from "@/lib/domain/schema";

/** Chat de la OT: el taller comenta la orden entre todos los que la atienden. Los mensajes llegan con la orden. */
export function OrderChat({ orderId, messages }: { orderId: string; messages: ChatMessage[] }) {
  const { data } = useSync();
  const { run, isBusy } = useAction();
  const [text, setText] = useState("");
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const ok = await run("chat", () => api.orders.chat(orderId, body));
    if (ok) setText("");
  };

  return (
    <section aria-label="Chat de la orden" className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <EmptyState title="Sin mensajes todavía" body="Escribe aquí lo que deba saber quien atiende esta orden." />
      ) : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {messages.map((m) => {
            const mine = m.authorId === data.me.id;
            return (
              <li key={m.id} className={cn("flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5", mine ? "ml-auto border-glow/40 bg-navy-700/50" : "border-line bg-night/50")}>
                <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                  <strong className="text-ink-soft">{m.authorName}</strong>
                  <time dateTime={m.at}>{formatDateTime(m.at)}</time>
                </span>
                <p className="whitespace-pre-wrap text-sm text-ink">{m.text}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Escribir en el chat de la orden"
          rows={2}
          maxLength={1000}
          placeholder="Escribe un mensaje para el taller…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button onClick={() => void send()} loading={isBusy("chat")} disabled={!text.trim()} icon={<Send className="size-4" />}>
          Enviar
        </Button>
      </div>
    </section>
  );
}
