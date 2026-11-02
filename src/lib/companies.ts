import type { DateSpan } from "@/lib/profile";

// Roles at the same company, grouped by the company's name rather than a
// table of employers: a promotion is two roles with one company name. The
// resume prints them under the company once, and the profile editor shows
// and moves them together. Names that differ only in case or spacing group
// as typed; names that differ more ("ACME" and "Acme Inc.") are offered to
// the user to make one, never merged on their own.

/** What makes two company names the same company: case and spacing aside. Null for no company. */
export function companyKey(name: string): string | null {
  const key = name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return key || null;
}

/**
 * Entries in groups of the same company, each group where its first entry
 * was, in the order given. An entry without a company is a group of its own.
 */
export function companyGroups<T extends { company: string }>(entries: readonly T[]): T[][] {
  const groups: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const entry of entries) {
    const key = companyKey(entry.company);
    const group = key ? byKey.get(key) : undefined;
    if (group) {
      group.push(entry);
      continue;
    }
    const next = [entry];
    groups.push(next);
    if (key) byKey.set(key, next);
  }
  return groups;
}

/** The entries with each company's together: companyGroups(), flat. */
export const inCompanyOrder = <T extends { company: string }>(entries: readonly T[]): T[] => companyGroups(entries).flat();

/**
 * Moves the entry at `from` to `to` in a list in company order. Within its
 * group it moves alone; past the group's edge, the whole group moves past
 * the neighbouring group, so a drag or an arrow never splits a company.
 */
export function moveInCompanies<T extends { company: string }>(entries: readonly T[], from: number, to: number): T[] {
  const groups = companyGroups(entries);
  const groupAt = (index: number) => {
    let start = 0;
    for (const [position, group] of groups.entries()) {
      if (index < start + group.length) return { position, offset: index - start };
      start += group.length;
    }
    return { position: groups.length - 1, offset: 0 };
  };
  const source = groupAt(from);
  const target = groupAt(to);
  if (source.position === target.position) {
    const group = groups[source.position];
    const [moved] = group.splice(source.offset, 1);
    group.splice(target.offset, 0, moved);
  } else {
    const [moved] = groups.splice(source.position, 1);
    groups.splice(target.position, 0, moved);
  }
  return groups.flat();
}

const monthIndex = (year: number | null, month: number | null) => (year === null ? null : year * 12 + (month ?? 1) - 1);

/** The dates a group of roles covers: the earliest start to the latest end, or Present. */
export function companySpan(entries: readonly DateSpan[]): DateSpan {
  const earliest = entries
    .filter((entry) => entry.startYear !== null)
    .toSorted((a, b) => monthIndex(a.startYear, a.startMonth)! - monthIndex(b.startYear, b.startMonth)!)[0];
  const latest = entries
    .filter((entry) => entry.endYear !== null)
    .toSorted((a, b) => monthIndex(b.endYear, b.endMonth)! - monthIndex(a.endYear, a.endMonth)!)[0];
  return {
    startYear: earliest?.startYear ?? null,
    startMonth: earliest?.startMonth ?? null,
    endYear: latest?.endYear ?? null,
    endMonth: latest?.endMonth ?? null,
    current: entries.some((entry) => entry.current),
  };
}

/** Legal forms that don't make a company another one: "Acme Inc." is "Acme". */
const LEGAL_FORMS = new Set([
  "inc", "incorporated", "llc", "llp", "ltd", "limited", "plc", "corp", "corporation", "co", "company",
  "gmbh", "ag", "kg", "ug", "se", "bv", "nv", "sa", "sas", "sarl", "srl", "spa", "sl", "oy", "ab", "as", "aps", "pty",
]);

/** A name with case, accents, punctuation and legal form taken away, for spotting spellings of one company. */
function looseCompanyKey(name: string): string | null {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    // "B.V." and "S.p.A." are one word once their dots go.
    .replace(/(?<=\p{L})\.(?=\p{L})/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_FORMS.has(words.at(-1)!)) words.pop();
  return words.join(" ") || null;
}

/** Which spellings a suggestion is about, so turning it down holds until another spelling appears. */
export const companyFingerprint = (names: readonly string[]) =>
  [...new Set(names.flatMap((name) => companyKey(name) ?? []))].sort().join("\n");

/** Spellings that look like one company, as the profile editor offers to make them one name. */
export type CompanySpellings = {
  /** For companiesKeptApart. */
  fingerprint: string;
  /** Each spelling as typed, the most used first. */
  names: string[];
};

/**
 * Company names that are probably one company spelled differently: the same
 * once case, accents, punctuation and legal form are set aside, but not
 * already grouping together. Spellings the user kept apart aren't offered.
 */
export function companySpellings(companies: readonly string[], keptApart: readonly string[] = []): CompanySpellings[] {
  const clusters = new Map<string, Map<string, { name: string; count: number }>>();
  for (const name of companies) {
    const key = companyKey(name);
    const loose = looseCompanyKey(name);
    if (!key || !loose) continue;
    const spellings = clusters.get(loose) ?? new Map<string, { name: string; count: number }>();
    clusters.set(loose, spellings);
    const spelling = spellings.get(key);
    if (spelling) spelling.count += 1;
    else spellings.set(key, { name: name.trim().replace(/\s+/g, " "), count: 1 });
  }
  return [...clusters.values()]
    .filter((spellings) => spellings.size > 1)
    .map((spellings) => {
      const names = [...spellings.values()].toSorted((a, b) => b.count - a.count).map((spelling) => spelling.name);
      return { fingerprint: companyFingerprint(names), names };
    })
    .filter(({ fingerprint }) => !keptApart.includes(fingerprint));
}
