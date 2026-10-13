import { expect, test } from "@playwright/test";
import { WORKER, signIn, watchConsole } from "./helpers";

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

  test("los operarios no inician sesión", async ({ page }) => {
    await signIn(page, WORKER);
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("tablero del taller");
    expect((await page.request.get("/api/admin/kpis")).status()).toBe(401);
  });
});
