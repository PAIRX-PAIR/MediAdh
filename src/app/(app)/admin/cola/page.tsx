import { redirect } from "next/navigation";

/** Ruta anterior: la cola por máquina ahora es «Programación» (y la ocupación, «Máquinas»). Se conserva para los enlaces y marcadores viejos. */
export default function QueuePage() {
  redirect("/admin/programacion");
}
