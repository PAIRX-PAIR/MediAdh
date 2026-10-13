import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

test.describe("páginas públicas", () => {
  test("la landing carga con su título y abre la ventana de acceso", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page).toHaveTitle("Procesos productivos S.M.I.");
    await expect(page.getByRole("heading", { level: 1, name: /Procesos productivos/ })).toBeVisible();
    // Story titles keep their spaces (words are animated one by one).
    await expect(page.getByRole("heading", { level: 3, name: "Cada pieza entra con folio, fotos y estado" })).toBeAttached();
    await page.getByRole("link", { name: "Iniciar sesión" }).first().click();
    await expect(page).toHaveURL(/acceso=1/);
    await expect(page.getByRole("dialog").getByRole("tab", { name: "Crear cuenta" })).toBeVisible();
    await page.getByRole("dialog").getByRole("tab", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("dialog").getByLabel("Nombre completo")).toBeVisible();
    expect(errors.filter((e) => !/favicon|webgl/i.test(e))).toEqual([]);
  });

  test("con movimiento reducido no se descarga la escena 3D", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const scripts: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await expect(page.locator("canvas")).toHaveCount(0);
    await context.close();
  });

  test("las páginas legales cargan", async ({ page }) => {
    for (const [path, title] of [
      ["/legal", "Todo lo legal, en claro."],
      ["/legal/datos", "Política de tratamiento de datos personales."],
      ["/legal/terminos", "Términos de uso."],
      ["/legal/cookies", "Cookies y almacenamiento."],
      ["/legal/aviso", "Aviso legal."],
      ["/legal/pqr", "Peticiones, quejas y reclamos."],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    }
  });

  test("la app es instalable (manifiesto, íconos y service worker)", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ start_url: "/inicio", display: "standalone", short_name: "S.M.I." });
    expect((await request.get("/icons/512")).headers()["content-type"]).toContain("image/png");
    expect((await request.get("/sw.js")).ok()).toBe(true);
    expect(await (await request.get("/.well-known/assetlinks.json")).json()).toEqual([]);
  });
});

test.describe("seguridad", () => {
  test("las rutas privadas piden iniciar sesión", async ({ page }) => {
    await page.goto("/admin/ordenes");
    await expect(page).toHaveURL(/\/\?acceso=1&volver=%2Fadmin%2Fordenes/);
  });

  test("la API rechaza peticiones sin sesión y de otro origen", async ({ request }) => {
    expect((await request.get("/api/sync")).status()).toBe(401);
    const crossSite = await request.post("/api/tasks", {
      data: { title: "x", positionId: null },
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    });
    expect(crossSite.status()).toBe(403);
    const formPost = await request.post("/api/auth/login", {
      form: { username: "admin.demo", password: "x" },
      headers: { Origin: "http://localhost:3200" },
    });
    expect(formPost.status()).toBe(415);
  });

  test("las cabeceras de seguridad están presentes", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
