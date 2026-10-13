import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: "admin.demo", password: "Demo-Taller-2026" };
export const WORKER = { username: "tornero.demo", password: "Tornero-Demo-2026" };
/** Saved session of ADMIN (written by auth.setup.ts). */
export const ADMIN_STATE = "e2e/.auth/admin.json";

/** Signs in through the real access popup (no API shortcut). */
export async function signIn(page: Page, who: { username: string; password: string }) {
  await page.goto("/?acceso=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await dialog.getByLabel("Usuario", { exact: true }).fill(who.username);
  await dialog.getByLabel("Contraseña", { exact: true }).fill(who.password);
  await dialog.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** Collects console errors so a test can assert the page ran clean. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
