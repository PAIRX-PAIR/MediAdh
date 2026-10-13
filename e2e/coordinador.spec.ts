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

  test("la nómina liquida la quincena con horas extra y el horario tiene 42 h", async ({ page }) => {
    await page.goto("/admin/nomina");
    await expect(page.getByText("Neto a pagar").first()).toBeVisible();
    await page.getByRole("button", { name: "Horas y sueldo" }).first().click();
    const detail = page.getByRole("dialog");
    await expect(detail.getByText("Básico (15 días)")).toBeVisible();
    await expect(detail.getByText(/Extra diurna · /).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/admin/ajustes#horario");
    await expect(page.getByText(/Total semanal:\s*42 h/)).toBeVisible();
  });

  test("los títulos de pestaña son los de cada pantalla", async ({ page }) => {
    for (const [path, title] of [
      ["/admin/solicitudes", "Pedidos de material"],
      ["/admin/cierres", "Cierres de día"],
      ["/admin/avisos", "Avisos del taller"],
      ["/admin/auditoria", "Auditoría"],
      ["/admin/clientes", "Clientes"],
      ["/admin/nomina", "Nómina"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${title} · Procesos productivos S.M.I.`);
    }
  });
});

test("un operario pide acceso con QR y el coordinador lo autoriza", async ({ browser, page }) => {
  // The operator's phone (no session).
  const phoneContext = await browser.newContext();
  const phone = await phoneContext.newPage();
  await phone.goto("/");
  await phone.getByRole("link", { name: "Soy operario" }).click();
  await phone.getByRole("button", { name: "Pedir acceso" }).click();
  const qr = phone.getByRole("img", { name: /Código QR para autorizar este celular/ });
  await expect(qr).toBeVisible();
  const code = ((await qr.getAttribute("alt")) ?? "").split(": ")[1]!.replace("-", "");
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // The coordinator opens the link inside the QR and approves it.
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/dispositivos?codigo=${code}`);
  await expect(page.getByLabel("Código del celular")).toHaveValue(`${code.slice(0, 4)}-${code.slice(4)}`);
  await page.getByLabel("¿Quién es el operario?").selectOption({ label: "Carlos Pérez (ficticio) · Tornero" });
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(page.getByText("Con acceso").first()).toBeVisible();

  // The phone moves on by itself to the operator's own queue.
  await expect(phone.getByRole("heading", { level: 1, name: "Mi trabajo · Carlos Pérez (ficticio)" })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText("Pinacho").first()).toBeVisible();
  await expect(phone.getByRole("heading", { name: /Diana Torres/ })).toHaveCount(0);
  await phoneContext.close();
});
