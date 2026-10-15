import { expect, test } from "@playwright/test";
import { ADMIN, WORKER, signIn, watchConsole } from "./helpers";

test.describe("operario en el celular", () => {
  test("ve su cola en el tablero del taller sin iniciar sesión", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?acceso=1");
    await page.getByRole("dialog").getByRole("link", { name: "Ver tablero de operarios" }).click();
    await expect(page).toHaveURL(/\/tablero\/demo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tablero del taller" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Carlos Pérez \(ficticio\)/ })).toBeVisible();
    await expect(page.getByText("Pinacho").first()).toBeVisible();
    // Read-only and without client data.
    await expect(page.getByText("Agroindustrias del Valle")).toHaveCount(0);
    await page.getByLabel("Operario").selectOption({ label: "Carlos Pérez (ficticio)" });
    await expect(page.getByRole("heading", { name: /Diana Torres/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("un enlace de tablero inválido no muestra nada", async ({ page }) => {
    await page.goto("/tablero/no-existe");
    await expect(page.getByText(/no existe o fue cambiado/)).toBeVisible();
    expect((await page.request.get("/api/tablero/no-existe")).status()).toBe(404);
  });

  test("el operario pide material desde la barra de abajo", async ({ page }) => {
    await page.goto("/operario");
    await page.getByRole("button", { name: "Pedir acceso" }).click();
    await expect(page.getByRole("img", { name: /Código QR/ })).toBeVisible();
    // Sin autorizar no hay barra de pedidos (solo aparece en la cola del operario).
    await expect(page.getByRole("button", { name: "Pedir material" })).toHaveCount(0);
  });

  test("los operarios no inician sesión", async ({ page }) => {
    await signIn(page, WORKER);
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("tablero del taller");
    expect((await page.request.get("/api/admin/kpis")).status()).toBe(401);
  });
});

test.describe("pantallas en el celular", () => {
  test("ninguna pantalla del admin se sale del ancho (sin espacio vacío al deslizar)", async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/admin$/);
    for (const path of ["/admin", "/admin/ordenes", "/admin/cola", "/admin/cotizador", "/admin/finanzas", "/admin/nomina", "/admin/equipo", "/admin/ajustes", "/admin/dispositivos"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scroll, client, culprits } = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const clipped = (e: Element) => {
          for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) {
            const s = getComputedStyle(q);
            if (s.overflowX !== "visible" || s.position === "fixed") return true;
          }
          return false;
        };
        const culprits = [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > cw + 1 && getComputedStyle(e).position !== "fixed" && !clipped(e))
          .slice(0, 4)
          .map((e) => `${e.tagName}.${String((e as HTMLElement).className).slice(0, 80)} «${(e.textContent ?? "").slice(0, 30)}»`);
        return { scroll: document.documentElement.scrollWidth, client: cw, culprits };
      });
      expect(scroll, `${path} se sale del ancho: ${culprits.join(" | ")}`).toBeLessThanOrEqual(client);
    }
  });
});
