import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { writeCoverLetter } from "@/lib/ai/tasks";
import { framedLetter } from "@/lib/application-create";
import { extractedOf, matchSchema, unitsSchema } from "@/lib/application-data";
import { saveVersion } from "@/lib/document-versions";
import { prisma } from "@/lib/prisma";
import { loadFactTexts, loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { defineJob } from "./runner";

/** The key of an application's cover letter writing, to find it again after a reload. */
export const letterJobKey = (applicationId: string) => `letter:${applicationId}`;

/**
 * Writes a cover letter for an application created without one (New
 * application lets the user skip it). It's written from the tailored resume
 * as it is now, refined or edited since, so the letter builds on it, and is
 * saved in the resume's theme with a version of its own. One written
 * meanwhile, from another tab, stays and is what it returns.
 */
export const writeLetterJob = defineJob({
  type: "write-letter",
  input: z.object({ applicationId: z.string().min(1) }),
  result: z.object({ units: unitsSchema }),
  async run({ applicationId }, { step, signal }) {
    await step("Writing your cover letter");
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { documents: true } });
    const existing = application.documents.find((document) => document.kind === DocumentKind.COVER_LETTER);
    if (existing) return { units: unitsSchema.parse(existing.units) };
    const resume = application.documents.find((document) => document.kind === DocumentKind.RESUME);
    const resumeUnits = unitsSchema.safeParse(resume?.units);
    const match = matchSchema.safeParse(application.match);

    const [provider, options, profile, facts, settings] = await Promise.all([
      getAiProvider(),
      loadTaskOptions(),
      loadProfile(),
      loadFactTexts(applicationId),
      loadSettings(),
    ]);
    const language = application.language || options.language;
    const { data, promptVersion } = await writeCoverLetter(
      provider,
      {
        profile,
        extracted: extractedOf(application),
        match: match.success ? match.data : null,
        tone: application.tone,
        facts,
        posting: application.postingText,
        resume: resumeUnits.success ? resumeUnits.data : undefined,
      },
      // In the language of the resume it goes with.
      { ...options, language, signal },
    );
    const units = framedLetter(data, { profile, settings, company: application.company, location: application.location, language: language ?? "English" });

    try {
      await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            applicationId,
            kind: DocumentKind.COVER_LETTER,
            units,
            // Matching the resume, as the Theme menu keeps them (#226).
            themeId: resume?.themeId ?? settings.baseThemeId,
            writtenWith: promptVersion,
          },
        });
        await saveVersion(tx, document.id, units, { cause: VersionCause.WRITTEN });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const written = await prisma.document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId, kind: DocumentKind.COVER_LETTER } } });
      return { units: unitsSchema.parse(written.units) };
    }
    return { units };
  },
});

export type WriteLetterResult = z.infer<typeof writeLetterJob.result>;
