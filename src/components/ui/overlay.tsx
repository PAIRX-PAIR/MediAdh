"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, cn } from "./primitives";

/**
 * Accessible modal built on the native <dialog>: focus trap, Escape to close
 * and an inert background come from the browser. Renders as a bottom sheet on
 * phones and a centred card on larger screens.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none overflow-visible bg-transparent p-0 text-ink backdrop:bg-abyss/75 backdrop:backdrop-blur-sm",
        "fixed inset-x-0 bottom-0 top-auto w-full sm:inset-0 sm:m-auto sm:h-fit",
        { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size],
      )}
    >
      {open && (
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="hud-panel hud-corners safe-bottom flex max-h-[92dvh] flex-col rounded-b-none sm:rounded-b-[var(--radius-hud)]"
        >
          <header className="flex items-start gap-3 border-b border-line px-5 pb-3 pt-5">
            <div className="min-w-0 flex-1">
              <h2 id="modal-title" className="font-display text-xl font-semibold text-ink">
                {title}
              </h2>
              {description && <div className="mt-1 text-sm text-muted">{description}</div>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="-mr-1 inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>}
        </motion.div>
      )}
    </dialog>
  );
}

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ toast: (message: string, kind?: ToastKind) => void } | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return value.toast;
}

/** Short confirmations of the user's own actions (not notifications). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { id, kind, message }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 safe-top">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              role={t.kind === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-panel backdrop-blur",
                t.kind === "success" && "border-done/40 bg-[#062417]/90 text-done",
                t.kind === "error" && "border-blocked/50 bg-[#2a0b10]/90 text-[#ffb3b8]",
                t.kind === "info" && "border-glow/40 bg-navy-900/90 text-glow-soft",
              )}
            >
              {t.kind === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : t.kind === "error" ? <AlertTriangle className="size-5 shrink-0" /> : <Info className="size-5 shrink-0" />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Promise-based confirmation for destructive actions. */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    body?: string;
    confirmLabel: string;
    danger: boolean;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setState({ title: opts.title, body: opts.body, confirmLabel: opts.confirmLabel ?? "Confirmar", danger: opts.danger ?? false, resolve }),
      ),
    [],
  );

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const dialog = (
    <Modal
      open={state !== null}
      onClose={() => close(false)}
      title={state?.title ?? ""}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {state?.confirmLabel}
          </Button>
        </>
      }
    >
      {state?.body && <p className="text-sm text-ink-soft">{state.body}</p>}
    </Modal>
  );

  return { confirm, dialog };
}
