import { describe, expect, it } from "vitest";
import type { Order } from "./schema";
import { guideOrder, nextStep, orderSteps } from "./process";

const invoice = (over: Partial<Order["invoice"]> = {}): Order["invoice"] => ({ pending: false, number: null, invoicedAt: null, none: false, ...over });
const order = (id: string, status: Order["status"], over: Partial<Order> = {}) =>
  ({ id, folio: `OT-${id}`, title: `Trabajo ${id}`, clientName: "Cliente", status, due: null, invoice: invoice(), ...over }) as Pick<Order, "id" | "folio" | "title" | "clientName" | "status" | "due" | "invoice">;

describe("guía «Tu siguiente paso»", () => {
  it("recorre la orden: recibida → en máquina → terminada → entregada → factura", () => {
    const keyAt = (status: Order["status"], inv = invoice()) => nextStep(orderSteps({ status, invoice: inv }))?.key ?? null;
    expect(keyAt("recibida")).toBe("maquina");
    expect(keyAt("en_proceso")).toBe("terminada");
    expect(keyAt("terminada")).toBe("entregada");
    expect(keyAt("entregada")).toBe("factura");
    expect(keyAt("cerrada", invoice({ pending: true }))).toBe("factura");
  });

  it("la factura o «sin factura» cierran el proceso", () => {
    expect(nextStep(orderSteps({ status: "cerrada", invoice: invoice({ invoicedAt: "2026-11-02T10:00:00.000Z", number: "FE-1" }) }))).toBeNull();
    expect(nextStep(orderSteps({ status: "cerrada", invoice: invoice({ none: true }) }))).toBeNull();
    // Marcado «sin factura» desde antes de entregar: falta entregar, pero la factura ya no cuenta como pendiente.
    const steps = orderSteps({ status: "terminada", invoice: invoice({ none: true }) });
    expect(steps.find((s) => s.key === "factura")!.done).toBe(true);
    expect(nextStep(steps)?.key).toBe("entregada");
  });

  it("guía el trabajo que sigue en la cola; si no hay, lo listo para entregar y luego lo que falta facturar", () => {
    const a = order("1", "en_proceso");
    const ready = order("2", "terminada", { due: { date: "2026-11-05", time: "10:00" } });
    const readyLater = order("3", "entregada", { due: { date: "2026-11-09", time: "10:00" } });
    const toInvoice = order("4", "cerrada", { invoice: invoice({ pending: true }) });
    expect(guideOrder([toInvoice, readyLater, ready, a], "1")?.id).toBe("1");
    expect(guideOrder([toInvoice, readyLater, ready], null)?.id).toBe("2");
    expect(guideOrder([toInvoice], null)?.id).toBe("4");
    expect(guideOrder([order("5", "cerrada"), order("6", "cancelada")], null)).toBeNull();
  });
});
