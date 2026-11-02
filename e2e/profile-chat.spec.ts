import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resetData, sql } from "./support";

// Adding to the profile by chat (.scratch/profile-chat) with the fake AI
// server, which proposes a course when told about a certificate.
test.beforeEach(resetData);

test("adds a certificate from the chat, and undoes it", async ({ page }) => {
  await page.goto("/profile?section=courses");
  await page.getByRole("button", { name: "Add with AI" }).click();
  const panel = page.getByRole("dialog", { name: "Add with AI" });
  await panel.getByRole("textbox", { name: "Tell me what to add" }).fill("I got my AWS Solutions Architect certificate from Amazon in March 2025");
  await panel.getByRole("textbox", { name: "Tell me what to add" }).press("Enter");

  const card = panel.getByRole("region", { name: "Add a course or certificate: AWS Solutions Architect · Amazon" });
  await expect(card).toContainText("Mar 2025");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);

  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.getByRole("link", { name: "See it in Courses & certificates" })).toBeVisible();
  await expect(page.getByText("Saved to your profile.")).toBeVisible();
  expect(await sql(`SELECT 1 FROM "Course" WHERE name = 'AWS Solutions Architect' AND provider = 'Amazon' AND "startYear" = 2025`)).toHaveLength(1);
  // The answer's job is gone once shown: the conversation isn't kept.
  expect(await sql(`SELECT 1 FROM "Job" WHERE type = 'profile-chat'`)).toHaveLength(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Undone.")).toBeVisible();
  expect(await sql(`SELECT 1 FROM "Course" WHERE name = 'AWS Solutions Architect'`)).toHaveLength(0);

  // Closing forgets the chat, and the section shows the course once it's added.
  await card.getByRole("button", { name: "Add" }).click();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("AWS Solutions Architect").first()).toBeVisible();
  await page.getByRole("button", { name: "Add with AI" }).click();
  await expect(page.getByRole("dialog", { name: "Add with AI" }).getByText("Here's your certificate.")).toHaveCount(0);
});

test("asks when something it needs is missing", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Add with AI" }).click();
  const panel = page.getByRole("dialog", { name: "Add with AI" });
  await panel.getByRole("textbox", { name: "Tell me what to add" }).fill("Add my job at the food bank, not sure when");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText("When did you start there?")).toBeVisible();
  await expect(panel.getByRole("region")).toHaveCount(0);
});
