import { expect, test } from "@playwright/test";
import { ADMIN, signIn, watchConsole } from "./helpers";

test.describe("consola del coordinador", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("el mando recomienda con qué orden seguir y explica por qué", async ({ page }) => {
    const errors = watchConsole(page);
    await expect(page.getByRole("heading", { level: 1, name: /Buen(os|as) (días|tardes|noches)/ })).toBeVisible();
    await expect(page.getByText("Sigue con", { exact: true })).toBeVisible();
    await expect(page.getByText(/OT-\d{4}/).first()).toBeVisible();
    await page.getByRole("button", { name: /OT-\d{4}/ }).first().click();
    await expect(page.getByText(/Por qué está en el puesto 1/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("registra una OT nueva y genera la tarea del puesto", async ({ page }) => {
    await page.goto("/admin/ordenes?nueva=1");
    const form = page.getByRole("dialog");
    await expect(form.getByRole("heading", { name: /Ingreso de piezas/ })).toBeVisible();
    await form.getByLabel("Nombre del cliente sin registrar").fill("Taller de prueba e2e");
    await form.getByLabel("Trabajo").fill("Buje de prueba e2e");
    await form.getByRole("button", { name: "Agregar paso" }).click();
    await expect(form.getByText("¿Me puedo comprometer?").first()).toBeVisible();
    await form.getByRole("button", { name: "Registrar OT" }).click();
    // The detail opens on the files tab to add photos and drawings.
    await expect(page.getByRole("dialog").getByRole("heading", { name: /OT-\d{4} · Buje de prueba e2e/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Archivos/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /Ruta/ }).click();
    await expect(page.getByText(/Torno · Pinacho/)).toBeVisible();
  });

  test("la cola muestra la carga por máquina y responde ¿me puedo comprometer?", async ({ page }) => {
    await page.goto("/admin/cola");
    await expect(page.getByRole("heading", { level: 1, name: "Cola por máquina" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Carga diaria de CNC¹ Leadwell/ })).toBeVisible();
    const sim = page.locator("#comprometer");
    await sim.getByLabel("Torno").fill("4");
    await expect(sim.getByRole("status")).toContainText(/Sí|No/);
  });

  test("el cotizador calcula en vivo y se puede imprimir", async ({ page }) => {
    await page.goto("/admin/cotizador");
    await page.getByRole("button", { name: /Corona dentada/ }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByText("Total", { exact: true })).toBeVisible();
    const printHref = await editor.getByRole("link", { name: /Imprimir/ }).getAttribute("href");
    await page.goto(printHref!);
    await expect(page.getByText("Cotización", { exact: true })).toBeVisible();
    await expect(page.getByText(/COT-\d{4}/)).toBeVisible();
  });

  test("indicadores, histórico y ajustes cargan", async ({ page }) => {
    await page.goto("/admin/indicadores");
    await expect(page.getByText("Índice de gestión de producción")).toBeVisible();
    await expect(page.getByRole("img", { name: "Cumplimiento mensual" })).toBeVisible();
    await page.goto("/admin/historico");
    await expect(page.getByRole("heading", { level: 1, name: "Histórico de trabajos" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await page.goto("/admin/ajustes");
    await expect(page.getByRole("heading", { name: "IPC mensual (DANE)" })).toBeVisible();
    await expect(page).toHaveTitle("Ajustes · Procesos productivos S.M.I.");
  });

  test("los títulos de pestaña son los de cada pantalla", async ({ page }) => {
    for (const [path, title] of [
      ["/admin/solicitudes", "Pedidos de material"],
      ["/admin/cierres", "Cierres de día"],
      ["/admin/avisos", "Avisos del taller"],
      ["/admin/auditoria", "Auditoría"],
      ["/admin/clientes", "Clientes"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${title} · Procesos productivos S.M.I.`);
    }
  });
});
