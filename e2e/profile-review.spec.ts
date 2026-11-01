import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resetData, sql } from "./support";

// Reviewing the profile (.scratch/profile-review) with the fake AI server,
// which merges roles at the same company and skills with the same name.
test.beforeEach(resetData);

test("merges a role and a skill entered twice", async ({ page }) => {
  // The demo's Northwind role and "HTML & CSS", again, as a second import might word them.
  await sql(
    `INSERT INTO "Experience" (id, role, company, "startYear", "startMonth", current, bullets, sort, "updatedAt")
     VALUES ('e2e-twin', 'Sr. Product Designer', 'Northwind Logistics Inc.', 2021, 3, true, 'Ran weekly interviews with dispatchers', 99, now())`,
  );
  await sql(`INSERT INTO "Skill" (id, name, sort) VALUES ('e2e-skill', 'HTML/CSS', 99)`);
  await sql(`INSERT INTO "ExperienceSkill" ("experienceId", "skillId") VALUES ('e2e-twin', 'e2e-skill')`);

  await page.goto("/profile");
  await page.getByRole("link", { name: "Review my profile" }).click();
  await expect(page).toHaveURL("/profile/review");
  await page.getByRole("button", { name: "Review my profile →" }).click();
  await expect(page.getByRole("heading", { name: "2 things to fix" })).toBeVisible();
  await expect(page.getByText("Both are your role at Northwind Logistics, entered twice.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Merge 2 skills" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);

  await page.getByRole("button", { name: "Apply 2 fixes" }).click();
  await expect(page).toHaveURL("/profile");
  await expect(page.getByText("Applied 2 fixes.")).toBeVisible();

  // One Northwind role left, holding both roles' points and the merged skill.
  await page.goto("/profile?section=experience");
  await expect(page.getByRole("button", { name: /Northwind Logistics/, expanded: false })).toHaveCount(1);
  const [role] = await sql<{ id: string; bullets: string }>(`SELECT id, bullets FROM "Experience" WHERE company ILIKE 'Northwind%'`);
  expect(role.bullets).toContain("Led the redesign of the carrier portal");
  expect(role.bullets).toContain("Ran weekly interviews with dispatchers");
  const skills = await sql<{ name: string }>(`SELECT name FROM "Skill" WHERE name IN ('HTML & CSS', 'HTML/CSS')`);
  expect(skills).toEqual([{ name: "HTML & CSS" }]);
  const links = await sql(`SELECT 1 FROM "ExperienceSkill" es JOIN "Skill" s ON s.id = es."skillId" WHERE es."experienceId" = $1 AND s.name = 'HTML & CSS'`, [role.id]);
  expect(links).toHaveLength(1);

  // Nothing left to fix the second time.
  await page.goto("/profile/review");
  await page.getByRole("button", { name: "Review my profile →" }).click();
  await expect(page.getByRole("heading", { name: "Nothing to fix" })).toBeVisible();
});
