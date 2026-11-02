import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import type { ActionResult } from "@/lib/action";
import { demoProfile } from "@/lib/demo-profile";
import type { ProfileChatJobResult } from "@/lib/jobs/profile-chat";
import type { ProfileData } from "@/lib/profile";

import { applyProfileChat, discardProfileChat, sendProfileChat, undoProfileChat } from "./actions";
import { ProfileChat } from "./profile-chat";

// The job's answer arrives as soon as the panel follows it.
const fake = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/hooks/use-job", async () => {
  const { useEffect } = await import("react");
  return {
    useJob: vi.fn((id: string | null, _revision: number, onChange?: (job: unknown) => void) => {
      useEffect(() => {
        if (id) onChange?.({ id, type: "profile-chat", status: "DONE", step: null, error: null, result: fake.result });
      }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    }),
  };
});
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("./actions", () => ({
  sendProfileChat: vi.fn(async () => ({ ok: true, data: { jobId: "job-1" } })),
  discardProfileChat: vi.fn(async () => ({ ok: true, data: null })),
  applyProfileChat: vi.fn(),
  undoProfileChat: vi.fn(),
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

const profile: ProfileData = { ...demoProfile(), courses: [] };
const course = { kind: "add" as const, section: "courses" as const, entry: { name: "AWS Solutions Architect", provider: "Globex", duration: "", link: "", notes: "", startYear: 2025, startMonth: 3, endYear: null, endMonth: null } };
const answer = (fields: Partial<ProfileChatJobResult> = {}): ProfileChatJobResult => ({
  reply: "Here's your certificate.",
  question: false,
  declined: false,
  changes: [{ change: course, unverified: [] }, { change: { kind: "addSkills", names: ["AWS"] }, unverified: [] }],
  refused: [],
  versions: {},
  ...fields,
});
const saved = { ...profile, courses: [{ id: "c", ...course.entry, onResumes: true }] };

beforeEach(() => {
  vi.clearAllMocks();
  fake.result = answer();
  vi.mocked(applyProfileChat).mockResolvedValue({ ok: true, data: { profile: saved, undo: [{ kind: "removeEntry", section: "courses", id: "c", version: "v" }], applied: 1, message: "Saved to your profile." } });
  vi.mocked(undoProfileChat).mockResolvedValue({ ok: true, data: { profile, message: "Undone." } });
});

async function ask(props: Partial<Parameters<typeof ProfileChat>[0]> = {}) {
  const onProfileChange = vi.fn();
  render(<ProfileChat profile={profile} aiReady strict={false} onProfileChange={onProfileChange} {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Add with AI" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Tell me what to add" }), "I got my AWS cert in March 2025{Enter}");
  return onProfileChange;
}

describe("ProfileChat (.scratch/profile-chat)", () => {
  it("sends the message, shows the answer's changes and deletes its job", async () => {
    await ask();
    expect(sendProfileChat).toHaveBeenCalledWith({ turns: [{ role: "user", text: "I got my AWS cert in March 2025" }] });
    expect(await screen.findByText("Here's your certificate.")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Add a course or certificate: AWS Solutions Architect · Globex" });
    expect(card).toHaveTextContent("Mar 2025");
    expect(screen.getByRole("region", { name: "Add a skill: AWS" })).toBeInTheDocument();
    expect(discardProfileChat).toHaveBeenCalledWith({ jobId: "job-1" });
  });

  it("adds one change, links to it, and undoes it from the toast", async () => {
    const onProfileChange = await ask();
    const card = await screen.findByRole("region", { name: /Add a course/ });
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    expect(applyProfileChat).toHaveBeenCalledWith({ changes: [{ change: course, confirmed: false }], versions: {}, words: "I got my AWS cert in March 2025" });
    expect(onProfileChange).toHaveBeenCalledWith(saved);
    expect(within(card).getByRole("link", { name: "See it in Courses & certificates" })).toHaveAttribute("href", "/profile?section=courses");

    const [, options] = vi.mocked(toast).mock.calls.at(-1)!;
    expect(options?.action?.label).toBe("Undo");
    options!.action!.onClick();
    await vi.waitFor(() => expect(undoProfileChat).toHaveBeenCalled());
    expect(await within(card).findByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("adds them all at once", async () => {
    await ask();
    await userEvent.click(await screen.findByRole("button", { name: "Add all 2" }));
    expect(vi.mocked(applyProfileChat).mock.calls[0][0].changes).toHaveLength(2);
  });

  it("dismisses a change", async () => {
    await ask();
    const card = await screen.findByRole("region", { name: /Add a skill/ });
    await userEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(card).toHaveTextContent("Dismissed.");
  });

  it("edits a change before adding it, which confirms it", async () => {
    fake.result = answer({ changes: [{ change: course, unverified: ["Globex"] }] });
    await ask({ strict: true });
    const card = await screen.findByRole("region", { name: /Add a course/ });
    await userEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const provider = within(card).getByRole("textbox", { name: "Provided by" });
    await userEvent.clear(provider);
    await userEvent.type(provider, "Amazon");
    await userEvent.click(within(card).getByRole("button", { name: "Done" }));
    expect(within(card).queryByText(/Check this/)).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    expect(applyProfileChat).toHaveBeenCalledWith(expect.objectContaining({ changes: [{ change: { ...course, entry: { ...course.entry, provider: "Amazon" } }, confirmed: true }] }));
  });

  it("in strict mode, holds back words the user didn't say until they say so", async () => {
    fake.result = answer({ changes: [{ change: course, unverified: ["Globex"] }] });
    await ask({ strict: true });
    const card = await screen.findByRole("region", { name: /Add a course/ });
    expect(card).toHaveTextContent("Check this: you didn't mention Globex.");
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    expect(applyProfileChat).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Check the marked words first, or edit the change.");
    await userEvent.click(within(card).getByRole("checkbox", { name: "This is right" }));
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    expect(applyProfileChat).toHaveBeenCalledWith(expect.objectContaining({ changes: [{ change: course, confirmed: true }] }));
  });

  it("says why changes were left out", async () => {
    fake.result = answer({ changes: [], refused: [{ change: course, reason: "It ends before it starts." }] });
    await ask();
    expect(await screen.findByText("Left out: It ends before it starts.")).toBeInTheDocument();
  });

  it("forgets the chat when closed", async () => {
    await ask();
    await screen.findByText("Here's your certificate.");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    expect(screen.queryByText("Here's your certificate.")).not.toBeInTheDocument();
  });

  it("points to Settings without an AI provider", async () => {
    render(<ProfileChat profile={profile} aiReady={false} strict={false} onProfileChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    expect(screen.getByRole("link", { name: "Choose one in Settings" })).toHaveAttribute("href", "/settings?section=ai");
    await userEvent.type(screen.getByRole("textbox", { name: "Tell me what to add" }), "Hi{Enter}");
    expect(sendProfileChat).not.toHaveBeenCalled();
  });
});
