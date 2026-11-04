import { expect, test } from "@playwright/test";

import { resetData, sql } from "./support";

// What's in the profile but not on a tailored resume: what tailoring passed
// over and what was added to the profile since, each with "Add".
let url = "";
test.beforeAll(async () => {
  await resetData();
  const [ledgerly] = await sql<{ id: string }>(`SELECT id FROM "Application" WHERE company = 'Ledgerly' LIMIT 1`);
  url = `/applications/${ledgerly.id}`;
});

test("lists a course tailoring passed over and a skill added since, and adds them", async ({ page }) => {
  await sql(`INSERT INTO "Skill" (id, name, sort) VALUES ('skill-added-later', 'Kubernetes', 999)`);

  await page.goto(url);
  const resume = page.getByRole("article", { name: "Resume" });
  const note = page.getByRole("note");
  await expect(note).toContainText("In your profile, not on this resume:");
  await expect(resume).not.toContainText("UX Writing Workshop");
  await expect(resume).not.toContainText("Kubernetes");

  await note.getByRole("button", { name: "Add UX Writing Workshop to this resume" }).click();
  await expect(resume).toContainText("UX Writing Workshop");
  await note.getByRole("button", { name: "Add Kubernetes to this resume" }).click();
  await expect(resume).toContainText("Kubernetes");
  await expect(note).toHaveCount(0);

  await page.reload();
  await expect(resume).toContainText("UX Writing Workshop");
  await expect(resume).toContainText("Kubernetes");
  await expect(note).toHaveCount(0);
});
