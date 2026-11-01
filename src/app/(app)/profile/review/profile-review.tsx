"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { toastResult } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { AiProvider } from "@/generated/prisma/enums";
import { useJob } from "@/hooks/use-job";
import { providerOption } from "@/lib/ai/provider-options";
import { retry } from "@/lib/jobs/actions";
import type { ReviewProfileResult } from "@/lib/jobs/review-profile";
import { formatDateRange, type ProfileData } from "@/lib/profile";
import { buildFixes, fixFingerprint, REVIEW_PROFILE_STEPS, type ProfileFix, type ReviewEntry, type ReviewSection } from "@/lib/profile-review";

import { JobProgress, jobStep } from "../../new/job-progress";
import { applyProfileReview, discardProfileReview, startProfileReview } from "../actions";

const SECTION_LABELS: Record<ReviewSection, string> = {
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  courses: "Courses & certificates",
};

/**
 * "Review my profile" (.scratch/profile-review): the AI looks for the same
 * entry entered twice and for entries that contradict themselves, and each
 * fix it finds is shown before and after, built from the profile itself.
 * Nothing changes until the user applies; what they leave unticked isn't
 * proposed again.
 */
export function ProfileReview({
  aiReady,
  provider,
  initialJobId,
  profile,
  skipped,
}: {
  aiReady: boolean;
  provider: AiProvider;
  initialJobId: string | null;
  profile: ProfileData;
  /** Fingerprints of fixes turned down before (reviewSkipped). */
  skipped: string[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(initialJobId);
  const [revision, setRevision] = useState(0);
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const job = useJob<ReviewProfileResult>(jobId, revision);

  const fixes = useMemo(() => (job?.status === "DONE" && job.result ? buildFixes(profile, job.result.answer, skipped) : null), [job, profile, skipped]);
  const phase = !jobId ? "start" : fixes ? "results" : "reviewing";

  // E11-3: each phase replaces the last one's controls, so focus goes to its heading.
  const area = useRef<HTMLDivElement>(null);
  const shownPhase = useRef(phase);
  useEffect(() => {
    if (shownPhase.current === phase) return;
    shownPhase.current = phase;
    area.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus();
  }, [phase]);

  // Nothing to fix: the review has nothing left worth keeping.
  useEffect(() => {
    if (jobId && fixes?.length === 0) void discardProfileReview({ jobId });
  }, [jobId, fixes]);

  const follow = (id: string | null) => {
    setJobId(id);
    setUnticked(new Set());
    router.replace(id ? `/profile/review?job=${id}` : "/profile/review");
  };

  async function start() {
    setStarting(true);
    const result = toastResult(await startProfileReview({}));
    setStarting(false);
    if (result.ok) follow(result.data.jobId);
  }

  async function settle(apply: string[] | null) {
    if (!jobId) return;
    setApplying(true);
    const result = toastResult(apply ? await applyProfileReview({ jobId, apply }) : await discardProfileReview({ jobId }));
    setApplying(false);
    if (result.ok) router.push("/profile");
  }

  const chosen = (fixes ?? []).map(fixFingerprint).filter((fingerprint) => !unticked.has(fingerprint));
  const toggle = (fingerprint: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Review your profile"
        description="The AI looks for roles, projects, degrees, courses and skills you've entered twice, and for dates that don't add up. Nothing changes until you've seen each fix and applied it."
        actions={
          <Link href="/profile" className={buttonClassName("secondary")}>
            Back to your profile
          </Link>
        }
      />
      <div ref={area} className="flex max-w-[816px] flex-col gap-6 px-10 pb-20">
        {phase === "start" && (
          <Card className="flex flex-col items-start gap-5">
            {!aiReady && (
              <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning">
                No AI provider is set up yet, so nothing can review your profile.{" "}
                <Link href="/settings?section=ai" className="font-medium text-warning underline underline-offset-2">
                  Choose one in Settings → AI provider
                </Link>
              </p>
            )}
            {aiReady && !providerOption(provider).local && (
              <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning">
                Your roles, projects, education, courses and skills are sent to {providerOption(provider).vendor ?? "your AI server"} to review.
                Your contact details and references aren&apos;t.
              </p>
            )}
            <p className="text-sm text-muted">
              Fixes only ever use what your profile already says: merging two entries keeps every point and skill from both, and a date can
              only be corrected to one the entry already has.
            </p>
            <Button aria-disabled={!aiReady || starting || undefined} onClick={() => void (aiReady && !starting ? start() : undefined)}>
              {starting ? "Starting…" : "Review my profile →"}
            </Button>
          </Card>
        )}

        {phase === "reviewing" && (
          <JobProgress
            title="Reviewing your profile…"
            steps={REVIEW_PROFILE_STEPS}
            current={jobStep(REVIEW_PROFILE_STEPS, job)}
            error={job?.status === "FAILED" ? job.error : null}
            onRetry={() => void retry({ id: jobId! }).then((result) => toastResult(result).ok && setRevision((count) => count + 1))}
            onBack={() => {
              if (jobId) void discardProfileReview({ jobId });
              router.push("/profile");
            }}
            backLabel="← Back to your profile"
          />
        )}

        {phase === "results" && fixes?.length === 0 && (
          <Card className="flex flex-col items-start gap-4">
            <h2 tabIndex={-1} className="font-serif text-section">
              Nothing to fix
            </h2>
            <p className="text-sm text-muted">Your profile looks consistent: no entries twice, and no dates that contradict each other.</p>
            <Link href="/profile" className={buttonClassName("secondary")}>
              Back to your profile
            </Link>
          </Card>
        )}

        {phase === "results" && fixes && fixes.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <h2 tabIndex={-1} className="font-serif text-section">
                {fixes.length === 1 ? "1 thing to fix" : `${fixes.length} things to fix`}
              </h2>
              <p className="text-meta text-muted">Untick any you don&apos;t want. They won&apos;t be suggested again.</p>
            </div>
            <ul className="flex flex-col gap-4">
              {fixes.map((fix) => {
                const fingerprint = fixFingerprint(fix);
                return (
                  <li key={fingerprint}>
                    <FixCard fix={fix} profile={profile} checked={!unticked.has(fingerprint)} onCheckedChange={(on) => toggle(fingerprint, on)} />
                  </li>
                );
              })}
            </ul>
            <Card className="flex flex-wrap items-center gap-3">
              <Button aria-disabled={applying || undefined} onClick={() => void (applying ? undefined : settle(chosen))}>
                {chosen.length === 0 ? "Apply none" : chosen.length === 1 ? "Apply 1 fix" : `Apply ${chosen.length} fixes`}
              </Button>
              <Button variant="text" aria-disabled={applying || undefined} onClick={() => void (applying ? undefined : settle(null))}>
                Discard all
              </Button>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function fixTitle(fix: ProfileFix): string {
  switch (fix.kind) {
    case "merge":
      return `Merge ${fix.ids.length} entries in ${SECTION_LABELS[fix.section]}`;
    case "edit":
      return `Correct an entry in ${SECTION_LABELS[fix.section]}`;
    case "delete":
      return `Delete an entry in ${SECTION_LABELS[fix.section]}`;
    case "mergeSkills":
      return `Merge ${fix.ids.length} skills`;
  }
}

/** One fix: what the AI saw, the profile now and as it will be, and whether to apply it. */
function FixCard({ fix, profile, checked, onCheckedChange }: { fix: ProfileFix; profile: ProfileData; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const title = fixTitle(fix);
  const skillNames = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  const find = (section: ReviewSection, id: string) => (profile[section] as readonly ReviewEntry[]).find((entry) => entry.id === id)!;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-medium">{title}</h3>
        <p className="text-sm">{fix.reason}</p>
      </div>

      {fix.kind === "mergeSkills" ? (
        <p className="text-sm">
          {fix.ids.map((id) => skillNames.get(id)).join(", ")} → <strong className="font-medium">{skillNames.get(fix.keep)}</strong>
          <span className="text-muted">, on every role and project that had any of them</span>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Side label="Now">
            {(fix.kind === "merge" ? fix.ids : [fix.id]).map((id) => (
              <EntrySummary key={id} section={fix.section} entry={find(fix.section, id)} skillNames={skillNames} />
            ))}
          </Side>
          <Side label="After">
            {fix.kind === "delete" ? (
              <p className="text-sm text-muted">Deleted.</p>
            ) : (
              <EntrySummary section={fix.section} entry={fix.after} skillNames={skillNames} />
            )}
          </Side>
        </div>
      )}

      <Checkbox
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        label={
          <>
            Apply this fix<span className="sr-only">: {title}</span>
          </>
        }
      />
    </Card>
  );
}

function Side({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line p-4">
      <p className="text-label text-muted">{label}</p>
      {children}
    </div>
  );
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/** An entry's title and meta line, as the import preview shows them. */
function heading(section: ReviewSection, entry: ReviewEntry): [string, string] {
  const dates = formatDateRange({ current: false, ...entry });
  switch (section) {
    case "experience": {
      const { role, company, location } = entry as ProfileData["experience"][number];
      return [join(role, company), join(location, dates)];
    }
    case "projects": {
      const { name, link } = entry as ProfileData["projects"][number];
      return [name, join(link, dates)];
    }
    case "education": {
      const { degree, school } = entry as ProfileData["education"][number];
      return [join(degree, school), dates];
    }
    case "courses": {
      const { name, provider, duration, link } = entry as ProfileData["courses"][number];
      return [join(name, provider), join(dates, duration, link)];
    }
  }
}

/** An entry summed up: title, dates and the rest, with its points. */
function EntrySummary({ section, entry, skillNames }: { section: ReviewSection; entry: ReviewEntry; skillNames: Map<string, string> }) {
  const [title, meta] = heading(section, entry);
  const bullets = "bullets" in entry ? entry.bullets.split("\n").filter((line) => line.trim()) : [];
  const notes = "notes" in entry ? entry.notes.trim() : "";
  const skills = "skillIds" in entry ? entry.skillIds.flatMap((id) => skillNames.get(id) ?? []) : [];

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{title || <span className="text-muted">(no title)</span>}</p>
      {meta && <p className="text-meta text-muted tabular-nums">{meta}</p>}
      {bullets.length > 0 && (
        <ul className="list-disc pl-5">
          {bullets.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {notes && <p className="whitespace-pre-line">{notes}</p>}
      {skills.length > 0 && <p className="text-muted">Skills: {skills.join(" · ")}</p>}
    </div>
  );
}
