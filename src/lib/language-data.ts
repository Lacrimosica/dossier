import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { LanguageLevel } from "@/generated/prisma/enums";
import { languageCode, spokenLanguage } from "@/lib/languages";
import { LANGUAGE_LEVELS } from "@/lib/profile";

// Stored languages by code (.scratch/language-codes): finding one, and the
// one-time conversion of languages saved by name before codes.

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The stored language a typed or imported one is: by code, else by name
 * ignoring case among those without one (saved before codes, until the
 * conversion gives them one). Saving it with the code puts that right.
 */
export async function findSpokenLanguage(db: Db, language: { code: string | null; name: string }) {
  if (!language.code) return db.language.findFirst({ where: { code: null, name: language.name } });
  const byCode = await db.language.findUnique({ where: { code: language.code } });
  if (byCode) return byCode;
  // A profile has a handful of languages: their names are quicker to check here than in SQL.
  const unconverted = await db.language.findMany({ where: { code: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  return unconverted.find((row) => languageCode(row.name) === language.code) ?? null;
}

/** Native first, then C2 down to A1: the lower, the better the level. */
export const levelRank = (level: LanguageLevel) => LANGUAGE_LEVELS.findIndex((option) => option.value === level);

/**
 * Gives every language saved by name the code its name has ("Inglese" → `en`,
 * named "English"). Two that turn out to be the same keep the better level, on
 * the one that had the code already, else the first in the profile. Names
 * nobody knows stay as written.
 * Running it again changes nothing. Returns how many rows it changed.
 */
export async function convertLanguages(db: PrismaClient): Promise<number> {
  return db.$transaction(async (tx) => {
    const rows = await tx.language.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
    const kept = new Map(rows.flatMap((row) => (row.code ? [[row.code, row] as const] : [])));
    let changed = 0;
    for (const row of rows) {
      if (row.code) continue;
      const { code, name } = spokenLanguage(row.name);
      if (!code) continue;
      changed++;
      const twin = kept.get(code);
      if (!twin) {
        kept.set(code, await tx.language.update({ where: { id: row.id }, data: { code, name } }));
        continue;
      }
      await tx.language.delete({ where: { id: row.id } });
      if (levelRank(row.level) < levelRank(twin.level)) {
        kept.set(code, await tx.language.update({ where: { id: twin.id }, data: { level: row.level } }));
      }
    }
    return changed;
  });
}
