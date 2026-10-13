import { expect, test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE, signIn } from "./helpers";

/**
 * Signs in once through the real popup and saves the session: the login rate
 * limit (8 attempts per user and IP in 15 minutes) would otherwise block the
 * coordinator tests, which all use the same demo account.
 */
setup("sesión del coordinador", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().storageState({ path: ADMIN_STATE });
});
