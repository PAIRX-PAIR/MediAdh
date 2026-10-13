import { expect, test } from "@playwright/test";
import { WORKER, signIn, watchConsole } from "./helpers";

test.describe("operario en el celular", () => {
  test("ve su panel, empieza una tarea y pide material", async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, WORKER);
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hola, Carlos" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Barra de tareas" })).toBeVisible();
    await page.getByRole("button", { name: "Marcar entrada" }).click();
    await expect(page.getByRole("button", { name: /Marcar salida \(entraste a las \d{2}:\d{2}\)/ })).toBeVisible();

    await page.getByRole("navigation", { name: "Barra de tareas" }).getByRole("link", { name: /Tareas/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mis tareas" })).toBeVisible();
    await page.getByRole("link", { name: /Roscar bujes M24/ }).click();
    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "Empezar" }).click();
    await expect(detail.getByText("En proceso").first()).toBeVisible();
    await detail.getByRole("button", { name: "Una pieza más" }).click();
    await expect(detail.getByText(/^1\/12$/)).toBeVisible();

    await page.goto("/solicitudes?nueva=1");
    const form = page.getByRole("dialog");
    await form.getByRole("button", { name: "Herramienta" }).click();
    await form.getByLabel("Qué exactamente").fill("Inserto e2e");
    await form.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page.getByText("Herramienta: Inserto e2e")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("no puede entrar a la consola del administrador", async ({ page }) => {
    await signIn(page, WORKER);
    await expect(page).toHaveURL(/\/panel$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/panel$/);
    expect((await page.request.get("/api/admin/kpis")).status()).toBe(403);
  });
});
