"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Trimmed } from "@/lib/application-data";
import { cn } from "@/lib/cn";
import type { OffResumeItem } from "@/lib/off-resume";

/** "Studio Brik role" or "1 bullet from the Fieldnote role" */
function describe(item: Trimmed[number]): string {
  if (item.kind === "unit") return item.unit.label;
  const count = item.lines.length;
  return `${count} ${count === 1 ? "bullet" : "bullets"} from the ${item.label}`;
}

/** Whether the page limit left it out (E10-10), rather than "Leave out" (#217). */
export const byPageLimit = (item: Trimmed[number]) => item.kind === "bullets" || !item.byHand;

const LINE_HEADINGS = { skills: "Skills", languages: "Languages", interests: "Interests" } as const;
const ACTION = "text-muted underline underline-offset-2 hover:text-ink";

/**
 * Above the tailored resume, what isn't on it. What was left out, each with
 * "Put back": to fit its page limit (E10-10) or by hand (#217). When it's both,
 * the page limit's say so. Then what's in the profile but not on the resume,
 * passed over by tailoring or added since, each with "Add". Skills and the like
 * can be many and are short, so they're small buttons rather than rows. Tailoring
 * can pass over a lot of skills, so they stay closed behind their count until
 * asked for, and the resume stays in view.
 */
export function TrimmedNotice({
  items,
  onPutBack,
  offResume,
  onAdd,
}: {
  items: Trimmed;
  onPutBack: (index: number) => void;
  offResume: OffResumeItem[];
  onAdd: (item: OffResumeItem) => void;
}) {
  const [skillsOpen, setSkillsOpen] = useState(false);
  const allByPageLimit = items.every(byPageLimit);
  const entries = offResume.filter((item) => item.kind === "entry");
  const lines = (Object.keys(LINE_HEADINGS) as (keyof typeof LINE_HEADINGS)[]).flatMap((unitId) => {
    const under = offResume.filter((item) => item.kind === "line" && item.unitId === unitId);
    return under.length > 0 ? [{ unitId, under }] : [];
  });
  return (
    <div role="note" className="flex flex-col gap-3 rounded-card border border-line-card bg-card px-4 py-3 text-meta">
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted">{allByPageLimit ? "Left out to fit the page limit:" : "Left out of this resume:"}</p>
          <ul className="flex flex-col gap-1">
            {items.map((item, index) => (
              <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span data-private className="text-ink">
                  {describe(item)}
                  {!allByPageLimit && byPageLimit(item) && <span className="text-muted"> · to fit the page limit</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Put back the ${describe(item)}`.replace("the 1 bullet", "1 bullet")}
                  onClick={() => onPutBack(index)}
                  className={ACTION}
                >
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {offResume.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted">In your profile, not on this resume:</p>
          {entries.length > 0 && (
            <ul className="flex flex-col gap-1">
              {entries.map((item) => (
                <li key={item.key} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span data-private className="text-ink">{item.name}</span>
                  <button type="button" aria-label={`Add ${item.name} to this resume`} onClick={() => onAdd(item)} className={ACTION}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lines.map(({ unitId, under }) => {
            const chips = under.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-label={`Add ${item.name} to this resume`}
                onClick={() => onAdd(item)}
                className="min-h-6 rounded-full border border-line-card px-2 text-muted hover:text-ink"
              >
                + <span data-private>{item.name}</span>
              </button>
            ));
            if (unitId !== "skills") {
              return (
                <div key={unitId} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-ink">{LINE_HEADINGS[unitId]}</span>
                  {chips}
                </div>
              );
            }
            return (
              <div key={unitId} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-expanded={skillsOpen}
                  onClick={() => setSkillsOpen(!skillsOpen)}
                  className="flex min-h-6 w-fit items-center gap-1 text-ink"
                >
                  <ChevronRight aria-hidden className={cn("size-3.5 text-muted transition-transform", skillsOpen && "rotate-90")} />
                  {LINE_HEADINGS.skills} · {under.length}
                </button>
                {skillsOpen && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
