"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";

import { toast, toastResult } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useJob } from "@/hooks/use-job";
import { cn } from "@/lib/cn";
import type { ProfileChatJobResult } from "@/lib/jobs/profile-chat";
import type { ProfileData } from "@/lib/profile";
import { describeChange, FIELD_LABEL, profileChangeSchema, type ProfileChange, type UndoStep } from "@/lib/profile-changes";

import { applyProfileChat, discardProfileChat, sendProfileChat, undoProfileChat } from "./actions";
import { SECTIONS, sectionHref } from "./sections";

/** A change the AI proposed, as its card shows it. */
type Proposal = {
  key: string;
  change: ProfileChange;
  /** Names and numbers the user didn't say, which the profile doesn't have. */
  unverified: string[];
  /** The user edited it, or ticked "This is right". */
  confirmed: boolean;
  state: "open" | "saving" | "applied" | "dismissed";
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposals: Proposal[];
  /** Why changes the AI wanted were left out. */
  refused: string[];
  versions: Record<string, string>;
};

/**
 * "Add with AI" (.scratch/profile-chat): a side panel where the user says what
 * to add to their profile, and the AI proposes changes as cards. Nothing is
 * saved until a card is applied. The conversation lives here only: closing the
 * panel forgets it, and each answer's job is deleted once it's shown.
 */
export function ProfileChat({
  profile,
  aiReady,
  strict,
  onProfileChange,
}: {
  profile: ProfileData;
  aiReady: boolean;
  /** "Never invent experience": a change with words the user didn't say needs their say-so first. */
  strict: boolean;
  /** The profile as saved after applying or undoing. */
  onProfileChange: (profile: ProfileData) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    // Not modal: the toast's Undo and the profile beside it stay usable, and only Close or Escape close it.
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger className={buttonClassName("secondary")}>Add with AI</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-line-popover bg-paper shadow-menu"
        >
          {/* Mounted only while open, so closing forgets the conversation. */}
          {open && <ChatPanel profile={profile} aiReady={aiReady} strict={strict} onProfileChange={onProfileChange} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const SUGGESTIONS = [
  "I got a certificate: …",
  "Add a role I forgot: …",
  "A fact about me: I can start in …",
];

function ChatPanel({ profile, aiReady, strict, onProfileChange }: { profile: ProfileData; aiReady: boolean; strict: boolean; onProfileChange: (profile: ProfileData) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const nextId = useRef(1);
  /** Answers already shown: a job's last update can arrive twice (stream, then poll). */
  const shown = useRef(new Set<string>());
  const input = useRef<HTMLTextAreaElement>(null);
  const newId = () => String(nextId.current++);

  const answer = (job: { status: string; error: string | null; result: ProfileChatJobResult | null }, id: string) => {
    if ((job.status !== "DONE" && job.status !== "FAILED") || shown.current.has(id)) return;
    shown.current.add(id);
    setJobId(null);
    void discardProfileChat({ jobId: id });
    const result = job.status === "DONE" ? job.result : null;
    setMessages((current) => [
      ...current,
      result
        ? {
            id: newId(),
            role: "assistant",
            text: result.reply,
            proposals: result.changes.map(({ change, unverified }) => ({ key: newId(), change, unverified, confirmed: false, state: "open" })),
            refused: result.refused.map(({ reason }) => reason),
            versions: result.versions,
          }
        : { id: newId(), role: "assistant", text: job.error ?? "Something went wrong. Try again.", proposals: [], refused: [], versions: {} },
    ]);
  };
  useJob<ProfileChatJobResult>(jobId, 0, (job) => jobId && answer(job, jobId));

  const send = async (text: string) => {
    if (!text.trim() || jobId || !aiReady) return;
    const sent: Message = { id: newId(), role: "user", text: text.trim(), proposals: [], refused: [], versions: {} };
    const turns = [...messages, sent].map(({ role, text }) => ({ role, text }));
    setDraft("");
    const result = toastResult(await sendProfileChat({ turns }));
    if (!result.ok) {
      setDraft(text);
      return;
    }
    setMessages((current) => [...current, sent]);
    setJobId(result.data.jobId);
  };

  /** Everything the user wrote, which backs what the changes say. */
  const words = () => messages.filter((message) => message.role === "user").map((message) => message.text).join("\n");

  const update = (keys: string[], patch: Partial<Proposal>) =>
    setMessages((current) =>
      current.map((message) => ({ ...message, proposals: message.proposals.map((proposal) => (keys.includes(proposal.key) ? { ...proposal, ...patch } : proposal)) })),
    );

  const apply = async (message: Message, proposals: Proposal[]) => {
    const keys = proposals.map((proposal) => proposal.key);
    update(keys, { state: "saving" });
    const result = toastResult(
      await applyProfileChat({ changes: proposals.map(({ change, confirmed }) => ({ change, confirmed })), versions: message.versions, words: words() }),
    );
    if (!result.ok) {
      update(keys, { state: "open" });
      return;
    }
    onProfileChange(result.data.profile);
    update(keys, { state: result.data.applied > 0 ? "applied" : "open" });
    if (result.data.applied > 0) {
      toast(result.data.message, { action: { label: "Undo", onClick: () => void undo(keys, result.data.undo) } });
    } else {
      toast(result.data.message);
    }
  };

  const undo = async (keys: string[], steps: UndoStep[]) => {
    const result = toastResult(await undoProfileChat({ undo: steps }));
    if (!result.ok) return;
    onProfileChange(result.data.profile);
    update(keys, { state: "open" });
    toast(result.data.message);
  };

  const thinking = jobId !== null;
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <Dialog.Title className="font-serif text-[22px] leading-tight">Add with AI</Dialog.Title>
          <Dialog.Description className="text-meta leading-[1.45] text-pretty text-muted">
            Tell me about a role, a certificate, a skill or something about you. I&apos;ll suggest changes, and nothing is saved until you add them. This chat
            is forgotten when you close it.
          </Dialog.Description>
        </div>
        <Dialog.Close className={buttonClassName("text", "sm")} aria-label="Close">
          ×
        </Dialog.Close>
      </div>

      {/* column-reverse keeps the newest message in view. Focusable, so it scrolls from the keyboard too (E11-3). */}
      <div role="log" aria-label="Conversation" tabIndex={0} className="flex min-h-0 flex-1 flex-col-reverse overflow-auto px-6">
        <div className="flex flex-col gap-3.5 pt-4 pb-4">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
              <div
                data-private
                className={cn(
                  "max-w-[92%] rounded-card border px-3.5 py-[11px] text-[13.5px] leading-[1.55] text-pretty whitespace-pre-wrap",
                  message.role === "user" ? "border-primary bg-primary text-on-primary" : "border-line-card bg-card",
                )}
              >
                {message.text}
              </div>
              {message.refused.length > 0 && (
                <ul className="flex flex-col gap-1 pl-1 text-label text-muted">
                  {message.refused.map((reason, index) => (
                    <li key={index}>Left out: {reason}</li>
                  ))}
                </ul>
              )}
              {message.proposals.map((proposal) => (
                <ChangeCard
                  key={proposal.key}
                  profile={profile}
                  proposal={proposal}
                  strict={strict}
                  onApply={() => void apply(message, [proposal])}
                  onDismiss={() => update([proposal.key], { state: "dismissed" })}
                  onConfirm={(confirmed) => update([proposal.key], { confirmed })}
                  onEdit={(change) => update([proposal.key], { change, confirmed: true, unverified: [] })}
                />
              ))}
              {applicable(message, strict).length > 1 && (
                <Button size="sm" variant="secondary" onClick={() => void apply(message, applicable(message, strict))}>
                  Add all {applicable(message, strict).length}
                </Button>
              )}
            </div>
          ))}
          {thinking && <p className="pl-1 text-meta text-muted">Thinking…</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line px-6 pt-3.5 pb-6">
        {!aiReady ? (
          <p className="text-meta text-muted">
            This needs an AI provider.{" "}
            <Link href="/settings?section=ai" className="font-medium text-ink underline underline-offset-2">
              Choose one in Settings
            </Link>
          </p>
        ) : (
          messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion.replace(" …", " "));
                    input.current?.focus();
                  }}
                  className="rounded-full border border-line-field bg-card px-[11px] py-1.5 text-label hover:border-line-strong"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )
        )}
        <div className="flex flex-col gap-2 rounded-card border border-line-input bg-input px-3 py-2.5 focus-within:border-primary">
          <textarea
            ref={input}
            aria-label="Tell me what to add"
            rows={3}
            value={draft}
            placeholder="e.g. “I got my AWS Solutions Architect certificate from Amazon in March 2025”"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter starts a new line; not while an input method is composing.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
            className="w-full resize-none bg-transparent text-sm leading-normal text-ink outline-none placeholder:text-muted"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Enter to send</span>
            <Button size="sm" aria-disabled={thinking || !aiReady || !draft.trim() || undefined} onClick={() => void send(draft)}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** The cards "Add all" applies: the open ones that need no say-so. */
function applicable(message: Message, strict: boolean): Proposal[] {
  return message.proposals.filter((proposal) => proposal.state === "open" && !needsSaySo(proposal, strict));
}

const needsSaySo = (proposal: Proposal, strict: boolean) => strict && proposal.unverified.length > 0 && !proposal.confirmed;

/** One proposed change: what it adds or changes, and Add, Edit and Dismiss. */
function ChangeCard({
  profile,
  proposal,
  strict,
  onApply,
  onDismiss,
  onConfirm,
  onEdit,
}: {
  profile: ProfileData;
  proposal: Proposal;
  strict: boolean;
  onApply: () => void;
  onDismiss: () => void;
  onConfirm: (confirmed: boolean) => void;
  onEdit: (change: ProfileChange) => void;
}) {
  const [editing, setEditing] = useState(false);
  const view = describeChange(profile, proposal.change);
  const done = proposal.state === "applied" || proposal.state === "dismissed";
  const locked = needsSaySo(proposal, strict);
  const label = [view.action, view.title].filter(Boolean).join(": ");

  return (
    <section aria-label={label} className={cn("flex w-[92%] flex-col gap-2 rounded-card border border-line-card bg-card px-3.5 py-3", done && "opacity-70")}>
      <p className="text-label text-muted">{view.action}</p>
      {view.title && <p data-private className="text-sm font-medium text-pretty">{view.title}</p>}
      {view.details.length > 0 && (
        <ul data-private className="flex flex-col gap-0.5 text-meta text-pretty">
          {view.details.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {proposal.unverified.length > 0 && !proposal.confirmed && proposal.state === "open" && (
        <div className="flex flex-col gap-1.5 rounded-control bg-track px-2.5 py-2">
          <p className="text-label">
            Check this: you didn&apos;t mention <strong>{proposal.unverified.join(", ")}</strong>.
          </p>
          {strict && <Checkbox label="This is right" checked={proposal.confirmed} onChange={(event) => onConfirm(event.target.checked)} />}
        </div>
      )}

      {editing ? (
        <ChangeEditor
          change={proposal.change}
          onCancel={() => setEditing(false)}
          onSave={(change) => {
            onEdit(change);
            setEditing(false);
          }}
        />
      ) : proposal.state === "applied" ? (
        <p className="text-label text-muted">
          Added.{" "}
          <Link href={sectionHref(view.section)} className="font-medium text-ink underline underline-offset-2">
            See it in {SECTIONS.find((entry) => entry.id === view.section)?.label}
          </Link>
        </p>
      ) : proposal.state === "dismissed" ? (
        <p className="text-label text-muted">Dismissed.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            aria-disabled={locked || proposal.state === "saving" || undefined}
            onClick={() => {
              if (locked) toast("Check the marked words first, or edit the change.");
              else if (proposal.state === "open") onApply();
            }}
          >
            {proposal.state === "saving" ? "Adding…" : "Add"}
          </Button>
          {editable(proposal.change) && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button size="sm" variant="text" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </section>
  );
}

/** The part of a change the user can edit, as plain fields; null for languages, which are picked in the profile. */
function editable(change: ProfileChange): Record<string, unknown> | null {
  switch (change.kind) {
    case "add":
    case "edit":
      return change.entry;
    case "addBullets":
      return { bullets: change.bullets };
    case "addSkills":
    case "addInterests":
      return { names: change.names };
    case "addFacts":
      return { texts: change.texts };
    case "setBasics":
      return change.basics;
    case "addLanguages":
      return null;
  }
}

/** The change with edited fields, or null when they don't make a change. */
function withFields(change: ProfileChange, fields: Record<string, unknown>): ProfileChange | null {
  const next =
    change.kind === "add" || change.kind === "edit"
      ? { ...change, entry: fields }
      : change.kind === "addBullets"
        ? { ...change, bullets: fields.bullets }
        : change.kind === "addSkills" || change.kind === "addInterests"
          ? { ...change, names: fields.names }
          : change.kind === "addFacts"
            ? { ...change, texts: fields.texts }
            : change.kind === "setBasics"
              ? { ...change, basics: fields }
              : change;
  const parsed = profileChangeSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

const LONG_FIELDS = new Set(["notes", "summary"]);
/** Lists edited one item per line. */
const LINE_LISTS = new Set(["bullets", "texts"]);

/** Edits a change's fields in place: text, one item per line for lists, numbers for dates. */
function ChangeEditor({ change, onCancel, onSave }: { change: ProfileChange; onCancel: () => void; onSave: (change: ProfileChange) => void }) {
  const [fields, setFields] = useState<Record<string, unknown>>(() => editable(change) ?? {});
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: unknown) => setFields((current) => ({ ...current, [key]: value }));
  const control = "w-full rounded-control border border-line-input bg-input px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary";

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        const next = withFields(change, fields);
        if (!next) {
          setError("Something in there doesn't fit. Years need four digits and months go from 1 to 12.");
          return;
        }
        onSave(next);
      }}
    >
      {Object.entries(fields).map(([key, value]) => {
        const label = FIELD_LABEL[key] ?? key;
        if (typeof value === "boolean") {
          return <Checkbox key={key} label={label} checked={value} onChange={(event) => set(key, event.target.checked)} />;
        }
        return (
          <label key={key} className="flex flex-col gap-1 text-label text-muted">
            {label}
            {Array.isArray(value) ? (
              <textarea
                rows={Math.min(6, Math.max(2, value.length + 1))}
                value={(value as string[]).join(LINE_LISTS.has(key) ? "\n" : ", ")}
                onChange={(event) =>
                  set(key, LINE_LISTS.has(key) ? event.target.value.split("\n") : event.target.value.split(",").map((item) => item.trimStart()))
                }
                className={cn(control, "resize-y")}
              />
            ) : typeof value === "number" || value === null || key.endsWith("Year") || key.endsWith("Month") ? (
              <input
                type="number"
                inputMode="numeric"
                value={value === null ? "" : String(value)}
                onChange={(event) => set(key, event.target.value === "" ? null : Number(event.target.value))}
                className={control}
              />
            ) : LONG_FIELDS.has(key) ? (
              <textarea rows={3} value={String(value ?? "")} onChange={(event) => set(key, event.target.value)} className={cn(control, "resize-y")} />
            ) : (
              <input value={String(value ?? "")} onChange={(event) => set(key, event.target.value)} className={control} />
            )}
          </label>
        );
      })}
      {error && (
        <p role="alert" className="text-label text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Done
        </Button>
        <Button size="sm" variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
