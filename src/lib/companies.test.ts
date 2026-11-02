import { describe, expect, it } from "vitest";

import { companyFingerprint, companyGroups, companyKey, companySpan, companySpellings, inCompanyOrder, moveInCompanies } from "./companies";

const role = (id: string, company: string) => ({ id, company });
const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe("companies", () => {
  it("treats names that differ only in case and spacing as one company", () => {
    expect(companyKey("  Acme   Inc. ")).toBe("acme inc.");
    expect(companyKey("ACME INC.")).toBe("acme inc.");
    expect(companyKey("   ")).toBeNull();
  });

  it("groups each company's roles where its first role is", () => {
    const roles = [role("a1", "Acme"), role("b", "Brightwave"), role("a2", "acme"), role("n1", ""), role("n2", "")];
    expect(companyGroups(roles).map(ids)).toEqual([["a1", "a2"], ["b"], ["n1"], ["n2"]]);
    expect(ids(inCompanyOrder(roles))).toEqual(["a1", "a2", "b", "n1", "n2"]);
  });

  it("moves a role within its company, and a whole company past another", () => {
    const roles = [role("a1", "Acme"), role("a2", "Acme"), role("b", "Brightwave"), role("c", "Cobalt")];
    expect(ids(moveInCompanies(roles, 1, 0))).toEqual(["a2", "a1", "b", "c"]);
    // The last Acme role moved down takes Acme past Brightwave.
    expect(ids(moveInCompanies(roles, 1, 2))).toEqual(["b", "a1", "a2", "c"]);
    // Brightwave moved up goes before all of Acme, not between its roles.
    expect(ids(moveInCompanies(roles, 2, 1))).toEqual(["b", "a1", "a2", "c"]);
    expect(ids(moveInCompanies(roles, 3, 0))).toEqual(["c", "a1", "a2", "b"]);
  });

  it("spans a company's roles from the first start to the last end", () => {
    const junior = { startYear: 2018, startMonth: 3, endYear: 2020, endMonth: 6, current: false };
    const senior = { startYear: 2020, startMonth: 7, endYear: 2023, endMonth: null, current: false };
    expect(companySpan([senior, junior])).toEqual({ startYear: 2018, startMonth: 3, endYear: 2023, endMonth: null, current: false });
    expect(companySpan([{ ...senior, current: true }, junior]).current).toBe(true);
  });

  it("spots spellings of one company, most used first", () => {
    expect(companySpellings(["Acme Inc.", "ACME", "Acme Inc.", "Brightwave", "Brightwave"])).toEqual([
      { fingerprint: companyFingerprint(["Acme Inc.", "ACME"]), names: ["Acme Inc.", "ACME"] },
    ]);
    expect(companySpellings(["Café Nord B.V.", "cafe nord"])[0].names).toEqual(["Café Nord B.V.", "cafe nord"]);
    // Names that already group, and a lone legal form, aren't offered.
    expect(companySpellings(["Acme", "acme ", "Co"])).toEqual([]);
  });

  it("doesn't offer spellings the user kept apart, until another one appears", () => {
    const apart = [companyFingerprint(["Apple Inc", "Apple Ltd"])];
    expect(companySpellings(["Apple Inc", "Apple Ltd"], apart)).toEqual([]);
    expect(companySpellings(["Apple Inc", "Apple Ltd", "APPLE"], apart)).toHaveLength(1);
  });
});
