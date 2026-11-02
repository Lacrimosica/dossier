import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";

import sample from "../../../../prisma/seed/prototype-sample.json";
import { createProvider } from "../index";
import { LmStudioProvider } from "../providers/lmstudio";
import { LocalProvider } from "../providers/local";
import { MistralProvider } from "../providers/mistral";
import { liveLmStudio, liveMistral, savedAiConfig } from "../test-live";

import { extractPosting, matchRequirements, tailorResume, writeCoverLetter, type TaskOptions } from "./index";

// The whole chain against a real model, skipped unless asked for:
//
//   AI_LIVE=ollama docker/bin/yarn vitest run src/lib/ai/tasks/tasks.live.test.ts
//   AI_LIVE=mistral docker/bin/yarn vitest run src/lib/ai/tasks/tasks.live.test.ts
//   AI_LIVE=lmstudio docker/bin/yarn vitest run src/lib/ai/tasks/tasks.live.test.ts
//   AI_LIVE=saved docker/bin/yarn vitest run src/lib/ai/tasks/tasks.live.test.ts
//
// (Mistral's key and LM Studio's model as in providers.live.test.ts; "saved" is
// whatever Settings → AI provider has, any provider.)
//
// It prints what the model wrote, to judge the prompts by, not only their shape.

const live = new Set((process.env.AI_LIVE ?? "").split(","));
const mistral = live.has("mistral") ? await liveMistral() : null;
const lmStudio = live.has("lmstudio") ? await liveLmStudio() : null;
const saved = live.has("saved") ? createProvider({ ...(await savedAiConfig()), timeoutMs: 600_000 }) : null;
const provider = saved
  ? saved
  : mistral
  ? new MistralProvider("https://api.mistral.ai/v1", mistral.key, mistral.model, 600_000)
  : lmStudio
    ? new LmStudioProvider(lmStudio.url, lmStudio.key, lmStudio.model, 600_000)
    : new LocalProvider(process.env.OLLAMA_URL ?? "http://ollama:11434", process.env.OLLAMA_MODEL ?? "qwen2.5:3b", 600_000);
const options: TaskOptions = { creativity: "BALANCED", strict: true, language: null };

describe.runIf(live.has("ollama") || saved !== null || mistral !== null || lmStudio !== null)("live: the application chain", { timeout: 900_000 }, () => {
  it("extracts, matches, tailors and writes the Ledgerly application", async () => {
    const profile = demoProfile();
    const started = Date.now();
    const time = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;

    const { data: extracted } = await extractPosting(provider, { posting: sample.ledgerly.posting }, options);
    console.log(`extracted (${time()}):`, JSON.stringify(extracted, null, 2));
    expect(extracted.company).toMatch(/ledgerly/i);
    expect(extracted.requirements.length).toBeGreaterThanOrEqual(4);

    const { data: match } = await matchRequirements(provider, { requirements: extracted.requirements, profile }, options);
    console.log(`match (${time()}):`, match.items.map((item) => `${item.result.padEnd(7)} ${item.requirement}: ${item.note}`).join("\n"));
    expect(match.items).toHaveLength(extracted.requirements.length);

    const { data: resume } = await tailorResume(provider, { profile, extracted, match, facts: [], posting: sample.ledgerly.posting }, options);
    console.log(`resume (${time()}):`, resume.map((unit) => `[${unit.id}] ${unit.text}${unit.unverified ? `  ⚑ ${unit.unverified.join(", ")}` : ""}`).join("\n"));
    expect(resume.find((unit) => unit.id === "summary")?.text.length).toBeGreaterThan(20);

    const { data: letter } = await writeCoverLetter(provider, { profile, extracted, match, tone: "WARM", facts: [], posting: sample.ledgerly.posting }, options);
    console.log(`letter (${time()}):`, letter.map((unit) => `[${unit.id}] ${unit.text}${unit.unverified ? `  ⚑ ${unit.unverified.join(", ")}` : ""}`).join("\n\n"));
    expect(letter.at(-1)).toMatchObject({ id: "sign-off", text: "Warm regards," });
    expect(letter.length).toBeGreaterThanOrEqual(3);
  });

  // The failures prompt rules miss most (arXiv 2608.26171), counted rather than only printed, to
  // compare prompt versions and providers by (.scratch/resume-tailoring).
  it("keeps out what the posting baits for, keeps qualifiers and keeps each tool in its role", async () => {
    const demo = demoProfile();
    const profile = {
      ...demo,
      experience: demo.experience.map((entry) =>
        entry.id === "e2" ? { ...entry, bullets: `${entry.bullets}\nHelped the engineers move the app to offline-first sync` } : entry,
      ),
    };
    const traps = ["Kubernetes", "Terraform", "Salesforce"];
    const posting = `${sample.ledgerly.posting}\n- Hands-on with Kubernetes and Terraform\n- Experience with Salesforce`;

    const { data: extracted } = await extractPosting(provider, { posting }, options);
    const { data: match } = await matchRequirements(provider, { requirements: extracted.requirements, profile }, options);
    const { data: resume } = await tailorResume(provider, { profile, extracted, match, facts: [], posting }, options);
    console.log("resume:", resume.map((unit) => `[${unit.id}] ${unit.text}${unit.unverified ? `  ⚑ ${unit.unverified.join(", ")}` : ""}`).join("\n"));

    const claims = resume.filter((unit) => !["skills", "languages"].includes(unit.id));
    const baited = traps.flatMap((tool) => claims.filter((unit) => unit.text.includes(tool)).map((unit) => ({ tool, unit })));
    const unflagged = baited.filter(({ tool, unit }) => !unit.unverified?.includes(tool));
    const fieldnote = resume.find((unit) => unit.id === "experience:e2")?.text ?? "";
    const qualifierKept = /\b(helped|contributed|with the engineers|alongside)\b/i.test(fieldnote);
    // Skills linked to one role only, named in another.
    const names = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
    const moved = profile.experience.flatMap((entry) =>
      entry.skillIds
        .filter((id) => profile.experience.filter((other) => other.skillIds.includes(id)).length === 1)
        .flatMap((id) => {
          const name = names.get(id)!;
          return resume
            .filter((unit) => unit.id.startsWith("experience:") && unit.id !== `experience:${entry.id}` && unit.text.toLowerCase().includes(name.toLowerCase()))
            .map((unit) => `${name} in ${unit.id}`);
        }),
    );
    console.log(
      `baited claims: ${baited.length} (unflagged: ${unflagged.length})`,
      `\nqualifier kept on Fieldnote: ${qualifierKept}`,
      `\nskills moved to another role: ${moved.length}${moved.length ? ` (${moved.join(", ")})` : ""}`,
    );
    // The guard is the safety net: whatever got in is marked.
    expect(unflagged).toEqual([]);
  });
});
