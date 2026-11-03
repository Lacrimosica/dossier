import { z } from "zod";

import { LanguageLevel } from "@/generated/prisma/enums";
import { factTexts, type ProfileData } from "@/lib/profile";
import { changeText, checkProfileChanges, profileChangeSchema, type ProfileChange, type RefusedChange } from "@/lib/profile-changes";

import { sourcesFor, unverifiedFacts } from "../fact-guard";

import type { ChatTurn } from "./refine-chat";
import { BULLET_RULES, localDate, NO_EM_DASHES, PLAIN_WORDING, system, truthfulness, type Task } from "./prompt-parts";
import { profileForReview } from "./review-profile";

export const PROFILE_CHAT_VERSION = "profile-chat@2";

// The profile chat (.scratch/profile-chat): the candidate says what to add to
// their profile, and the model turns it into profile changes. Plain lists
// rather than one union, which small local models and strict JSON-schema
// modes handle best; changesFromAnswer() makes them changes, and
// checkProfileChanges() decides which can apply. Nothing is saved here.
//
// New entries share one object with every section's fields: a list per
// section made a schema Anthropic refuses ("The compiled grammar is too
// large"), as the end-to-end tests' fake model can't tell.

const span = {
  startYear: z.number().int().nullable(),
  startMonth: z.number().int().nullable(),
  endYear: z.number().int().nullable(),
  endMonth: z.number().int().nullable(),
};
const EDIT_FIELDS = [
  "role", "company", "location", "name", "link", "degree", "school", "notes", "provider", "duration", "bullets",
  "startYear", "startMonth", "endYear", "endMonth", "current",
] as const;

export const profileChatAnswerSchema = z.object({
  reply: z.string(),
  /** The reply asks for something missing. */
  question: z.boolean(),
  /** The message isn't about the profile. */
  declined: z.boolean(),
  /** New entries; each takes the fields its section has, and the rest are left empty. */
  entries: z.array(
    z.object({
      section: z.enum(["experience", "projects", "education", "courses"]),
      role: z.string(),
      company: z.string(),
      name: z.string(),
      provider: z.string(),
      degree: z.string(),
      school: z.string(),
      location: z.string(),
      link: z.string(),
      duration: z.string(),
      notes: z.string(),
      bullets: z.array(z.string()),
      skills: z.array(z.string()),
      ...span,
      current: z.boolean(),
    }),
  ),
  edits: z.array(z.object({ section: z.enum(["experience", "projects", "education", "courses"]), id: z.string(), field: z.enum(EDIT_FIELDS), value: z.string() })),
  addBullets: z.array(z.object({ section: z.enum(["experience", "projects"]), id: z.string(), bullets: z.array(z.string()) })),
  skills: z.array(z.string()),
  languages: z.array(z.object({ name: z.string(), level: z.enum(LanguageLevel) })),
  interests: z.array(z.string()),
  facts: z.array(z.string()),
  basics: z.array(z.object({ field: z.enum(["headline", "summary", "city", "country"]), value: z.string() })),
});
export type ProfileChatAnswer = z.infer<typeof profileChatAnswerSchema>;

const INSTRUCTIONS = `You help a job seeker add to their profile in a job search app, and answer as JSON. They tell you about a role, a project, a degree, a course or certificate, a skill, a language, an interest or a fact about themselves, or ask you to correct an entry. You turn what they say into changes; the app shows each one and they decide whether to save it.

- Use only what the candidate tells you in this conversation. Never invent an employer, title, date, number, degree, issuer, skill or result. Copy names, numbers and dates exactly as they gave them.
- When something an entry needs is missing (a role without a company or start date, a certificate without its issuer or date), ask for it in reply, set question to true, and leave that entry out until they answer. Add what's already certain. Don't ask about what's optional (location, link, notes, length).
- Read the profile first. When they talk about an entry that's already there, change it (edits, addBullets) by its id rather than adding it again.
- edits: one item per field to change: section, the entry's id, the field and its new value as text. Years and months are numbers as text ("2024", "6"; months are 1 to 12), current is "true" or "false", bullets are the entry's whole list, one per line. An empty value clears the field.
- addBullets: new points for a role or project, after the ones it has.
- entries: new roles (experience: role, company, location), projects (name, link), degrees (education: degree, school, location, notes) and courses (name, provider, duration, link, notes), with their dates; roles and projects also take bullets and skills. Leave the fields a section doesn't have empty. Years and months are numbers (months 1 to 12), null when unknown; current is true when it's ongoing.
- Certificates, licences, courses, workshops and trainings are courses: provider is who issued it. Degrees and diplomas are education.
- facts: things about the candidate that don't belong in a section, such as when they can start, a driving licence, work permits or what they're looking for, each as a short sentence in their words.
- skills: skills and tools they say they have. A role's or project's skills are also linked to it.
- basics: only the headline, the summary, city or country, and only when they ask to change them.
- Write entries in the language the profile is in, bullets one point each without bullet characters.
- reply: one or two friendly sentences saying what you suggest adding or changing, or your question. Reply in the language they write in.
- If the message has nothing to do with their profile, set declined to true, make no changes, and say briefly what you can help with. Never delete anything: if they ask, tell them they can remove it in the profile themselves.
- Lists you don't need are empty.`;

/** Only the last turns go along, newest kept first, within what a local model can take. */
const MAX_TURNS = 20;
const MAX_TURN_CHARACTERS = 12_000;

/** The conversation as it's sent: the last turns, within MAX_TURN_CHARACTERS, the newest always. */
export function recentTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let length = 0;
  for (const turn of turns.slice(-MAX_TURNS).toReversed()) {
    length += turn.text.length;
    if (kept.length > 0 && length > MAX_TURN_CHARACTERS) break;
    kept.unshift({ role: turn.role, text: turn.text.slice(0, MAX_TURN_CHARACTERS) });
  }
  return kept;
}

/** The profile as the chat needs it: every entry with its id and raw dates, without contact details, references or the photo. */
export function profileForChat(profile: ProfileData): string {
  const { basics } = profile;
  return JSON.stringify(
    {
      headline: basics.headline,
      summary: basics.summary,
      city: basics.city,
      country: basics.country,
      factsAboutMe: factTexts(profile.facts),
      languages: profile.languages.map(({ name, level }) => ({ name, level })),
      interests: profile.interests,
      ...JSON.parse(profileForReview(profile, [])),
    },
    null,
    2,
  );
}

/** The answer's lists as changes; one the schema can't take (a year that's not a number) is left out. */
export function changesFromAnswer(answer: ProfileChatAnswer): ProfileChange[] {
  const lines = (value: string) => value.split("\n");
  // An added entry's schema keeps its section's fields and drops the others.
  const raw: unknown[] = answer.entries.map(({ section, ...entry }) => ({ kind: "add", section, entry }));
  // One edit per entry, from its fields.
  const edits = new Map<string, { kind: "edit"; section: string; id: string; entry: Record<string, unknown> }>();
  for (const { section, id, field, value } of answer.edits) {
    const key = `${section}:${id}`;
    const edit = edits.get(key) ?? { kind: "edit" as const, section, id, entry: {} };
    const trimmed = value.trim();
    edit.entry[field] =
      field === "bullets"
        ? lines(trimmed)
        : field === "current"
          ? trimmed === "true"
          : field.endsWith("Year") || field.endsWith("Month")
            ? trimmed === "" ? null : Number(trimmed)
            : trimmed;
    edits.set(key, edit);
  }
  raw.push(...edits.values());
  raw.push(...answer.addBullets.map((entry) => ({ kind: "addBullets", ...entry })));
  if (answer.skills.length > 0) raw.push({ kind: "addSkills", names: answer.skills });
  if (answer.languages.length > 0) raw.push({ kind: "addLanguages", languages: answer.languages });
  if (answer.interests.length > 0) raw.push({ kind: "addInterests", names: answer.interests });
  if (answer.facts.length > 0) raw.push({ kind: "addFacts", texts: answer.facts });
  if (answer.basics.length > 0) raw.push({ kind: "setBasics", basics: Object.fromEntries(answer.basics.map(({ field, value }) => [field, value])) });
  return raw.flatMap((change) => {
    const parsed = profileChangeSchema.safeParse(change);
    return parsed.success ? [parsed.data] : [];
  });
}

export type ProfileChatInput = {
  /** The conversation, oldest first, ending with the candidate's new message. */
  turns: ChatTurn[];
  profile: ProfileData;
  today?: Date;
};

/** A proposed change, with the names and numbers in it the candidate didn't say and the profile doesn't have. */
export type ProposedChange = { change: ProfileChange; unverified: string[] };

export type ProfileChatResult = { reply: string; question: boolean; declined: boolean; changes: ProposedChange[]; refused: RefusedChange[] };

/** The reply and the checked changes for the candidate's latest message. */
export const profileChat: Task<ProfileChatInput, ProfileChatResult> = async (provider, { turns, profile, today = new Date() }, options) => {
  const recent = recentTurns(turns);
  const answer = await provider.complete({
    system: system(INSTRUCTIONS, BULLET_RULES, truthfulness(true), PLAIN_WORDING, NO_EM_DASHES),
    messages: [
      { role: "user", content: [`Today is ${localDate(today)}.`, `The candidate's profile:\n${profileForChat(profile)}`].join("\n\n") },
      { role: "assistant", content: "Understood. What would you like to add?" },
      ...recent.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
    schema: profileChatAnswerSchema,
    schemaName: "profile_chat",
    // Structuring what they said, not writing: stay close to their words.
    creativity: "FAITHFUL",
    signal: options.signal,
  });

  const { changes, refused } = answer.declined ? { changes: [], refused: [] } : checkProfileChanges(profile, changesFromAnswer(answer));
  // What the candidate said backs the changes, as does what the profile already says.
  const sources = sourcesFor(profile, null, turns.filter((turn) => turn.role === "user").map((turn) => turn.text).join("\n"));
  return {
    data: {
      reply: answer.reply.trim(),
      question: answer.question,
      declined: answer.declined,
      changes: changes.map((change) => ({ change, unverified: unverifiedFacts(changeText(change), sources) })),
      refused,
    },
    promptVersion: PROFILE_CHAT_VERSION,
  };
};
