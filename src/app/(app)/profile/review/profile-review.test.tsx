import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action";
import { useJob } from "@/hooks/use-job";
import { demoProfile } from "@/lib/demo-profile";
import type { ProfileData } from "@/lib/profile";
import type { ReviewAnswer } from "@/lib/profile-review";

import { applyProfileReview, discardProfileReview, startProfileReview } from "../actions";

import { ProfileReview } from "./profile-review";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null }));
vi.mock("@/hooks/use-job", () => ({ useJob: vi.fn(() => null) }));
vi.mock("@/lib/jobs/actions", () => ({ retry: vi.fn() }));
vi.mock("../actions", () => ({
  startProfileReview: vi.fn(async () => ({ ok: true, data: { jobId: "job-1" } })),
  applyProfileReview: vi.fn(async () => ({ ok: true, data: null })),
  discardProfileReview: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/components/toast", () => {
  const toast = vi.fn();
  return {
    toast,
    toastResult: <T,>(result: ActionResult<T>) => {
      if (!result.ok) toast(result.error);
      return result;
    },
  };
});

const role = { location: "", startYear: 2021, startMonth: 3, endYear: null, endMonth: null, current: true, skillIds: [] };
const profile: ProfileData = {
  ...demoProfile(),
  experience: [
    { ...role, id: "a", role: "Sr. Engineer", company: "Acme Inc.", bullets: "Led payments" },
    { ...role, id: "b", role: "Senior Engineer", company: "ACME", location: "Berlin", bullets: "Hired four" },
  ],
  projects: [],
  education: [],
  courses: [],
  skills: [
    { id: "js", name: "JS" },
    { id: "javascript", name: "JavaScript" },
  ],
};
const answer: ReviewAnswer = {
  merges: [{ section: "experience", ids: ["a", "b"], keep: "a", bullets: null, reason: "Both are your role at Acme, entered twice." }],
  edits: [],
  deletions: [],
  skillMerges: [{ ids: ["js", "javascript"], keep: "javascript", reason: "The same skill." }],
};
const done = (result: ReviewAnswer) =>
  ({ id: "job-1", type: "review-profile", status: "DONE", step: null, error: null, result: { answer: result, versions: {}, reviewedWith: "review-profile@1" } }) as const;
const page = (props: Partial<Parameters<typeof ProfileReview>[0]> = {}) => (
  <ProfileReview aiReady provider="LOCAL" initialJobId="job-1" profile={profile} skipped={[]} {...props} />
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useJob).mockReturnValue(null);
});

describe("ProfileReview", () => {
  it("needs a provider, says where a hosted one sends the profile, and starts a review", async () => {
    const { unmount } = render(page({ aiReady: false, initialJobId: null }));
    expect(screen.getByRole("note")).toHaveTextContent("No AI provider is set up yet");
    expect(screen.getByRole("button", { name: "Review my profile →" })).toHaveAttribute("aria-disabled", "true");
    unmount();

    render(page({ provider: "ANTHROPIC", initialJobId: null }));
    expect(screen.getByRole("note")).toHaveTextContent("sent to Anthropic to review. Your contact details and references aren't.");
    await userEvent.click(screen.getByRole("button", { name: "Review my profile →" }));
    expect(startProfileReview).toHaveBeenCalledWith({});
    expect(router.replace).toHaveBeenCalledWith("/profile/review?job=job-1");
  });

  it("shows progress while the review runs", () => {
    vi.mocked(useJob).mockReturnValue({ id: "job-1", type: "review-profile", status: "RUNNING", step: "Looking for mistakes", error: null, result: null });
    render(page());
    expect(screen.getByRole("heading", { name: "Reviewing your profile…" })).toBeInTheDocument();
  });

  it("shows each fix with its reason, before and after, built from the profile", () => {
    vi.mocked(useJob).mockReturnValue(done(answer));
    render(page());
    expect(screen.getByRole("heading", { name: "2 things to fix" })).toBeInTheDocument();

    const merge = screen.getByRole("heading", { name: "Merge 2 entries in Experience" }).closest("li")!;
    expect(within(merge).getByText("Both are your role at Acme, entered twice.")).toBeInTheDocument();
    // Now: both roles. After: a's title, b's location, and both points.
    expect(within(merge).getAllByText("Sr. Engineer · Acme Inc.")).toHaveLength(2);
    expect(within(merge).getAllByText(/^Berlin · /)).toHaveLength(2);
    expect(within(merge).getAllByText("Hired four")).toHaveLength(2);
    expect(within(merge).getAllByText("Led payments")).toHaveLength(2);

    const skills = screen.getByRole("heading", { name: "Merge 2 skills" }).closest("li")!;
    expect(skills).toHaveTextContent("JS, JavaScript → JavaScript");
  });

  it("applies the ticked fixes and goes back to the profile", async () => {
    vi.mocked(useJob).mockReturnValue(done(answer));
    render(page());
    await userEvent.click(screen.getByRole("checkbox", { name: "Apply this fix: Merge 2 skills" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply 1 fix" }));
    expect(applyProfileReview).toHaveBeenCalledWith({ jobId: "job-1", apply: ["merge:experience:a,b"] });
    expect(router.push).toHaveBeenCalledWith("/profile");
  });

  it("discards all, leaving the profile as it is", async () => {
    vi.mocked(useJob).mockReturnValue(done(answer));
    render(page());
    await userEvent.click(screen.getByRole("button", { name: "Discard all" }));
    expect(discardProfileReview).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(applyProfileReview).not.toHaveBeenCalled();
  });

  it("says when there's nothing to fix, leaving out fixes skipped before, and lets the review go", () => {
    vi.mocked(useJob).mockReturnValue(done(answer));
    render(page({ skipped: ["merge:experience:a,b", "mergeSkills:skills:javascript,js"] }));
    expect(screen.getByRole("heading", { name: "Nothing to fix" })).toBeInTheDocument();
    expect(discardProfileReview).toHaveBeenCalledWith({ jobId: "job-1" });
  });
});
