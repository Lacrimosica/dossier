import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetData, sql } from "./support";

// Privacy mode: personal details blur on screen, stay blurred after a reload,
// and never reach print.
test.beforeAll(resetData);

const filterOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).filter);
const toggle = (page: Page) => page.getByRole("switch", { name: "Privacy mode" });

test("blurs the name and survives a reload", async ({ page }) => {
  await page.goto("/");
  const name = page.getByRole("complementary").getByText("Jane Doe", { exact: true });
  expect(await filterOf(name)).toBe("none");

  await toggle(page).click();
  await expect(toggle(page)).toBeChecked();
  await page.mouse.move(600, 400);
  expect(await filterOf(name)).toContain("blur");

  await page.reload();
  await expect(toggle(page)).toBeChecked();
  expect(await filterOf(name)).toContain("blur");

  await toggle(page).click();
  await page.mouse.move(600, 400);
  expect(await filterOf(name)).toBe("none");
});

test("lets a line be peeked at, and a document through a lens", async ({ page }) => {
  const [{ id, role }] = await sql<{ id: string; role: string }>(`SELECT a.id, a.role FROM "Application" a JOIN "Document" d ON d."applicationId" = a.id WHERE a.role <> '' AND d.kind = 'RESUME' ORDER BY a."createdAt" LIMIT 1`);
  await page.goto("/applications?view=table");
  await toggle(page).click();

  const roleText = page.getByRole("link", { name: role }).first().locator("[data-private]");
  await page.mouse.move(600, 5);
  expect(await filterOf(roleText)).toContain("blur");
  await roleText.hover();
  expect(await filterOf(roleText)).toBe("none");

  // The tab names no role, and a document is blurred but for a lens at the mouse.
  await page.goto(`/applications/${id}?tab=resume`);
  await expect(page).toHaveTitle("Application · Dossier");
  const preview = page.locator("[data-private-lens]:visible").first();
  await expect(preview).toBeVisible();
  const glass = preview.locator("[data-lens-glass]");
  await expect(glass).toHaveCSS("backdrop-filter", /blur/);
  const lens = () => glass.evaluate((element) => element.style.getPropertyValue("--lens-x"));
  expect(await lens()).toBe("");

  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await expect.poll(lens).not.toBe("");
  await page.mouse.move(600, 5);
  await expect.poll(lens).toBe("");
});

test("blurs filled-in fields until they're in use, and never in print", async ({ page }) => {
  await page.goto("/profile");
  await toggle(page).click();
  const field = page.getByLabel("Full name");
  await page.mouse.move(600, 5);
  expect(await filterOf(field)).toContain("blur");
  await field.focus();
  expect(await filterOf(field)).toBe("none");

  await field.blur();
  await page.emulateMedia({ media: "print" });
  expect(await filterOf(field)).toBe("none");
});
