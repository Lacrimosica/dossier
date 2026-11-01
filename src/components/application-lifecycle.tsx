"use client";

import { Dialog } from "radix-ui";
import { useState, type FormEvent, type RefObject } from "react";

import { deleteApplication, renameApplication, setArchived } from "@/lib/application-actions";

import { toast, toastResult } from "./toast";
import { Button, buttonClassName } from "./ui/button";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Input } from "./ui/input";

/**
 * Archives an application or brings it back (E9-5), with Undo on the
 * toast. Returns whether it worked.
 */
export async function archiveApplication(id: string, archived: boolean): Promise<boolean> {
  const result = await setArchived({ id, archived });
  if (!result.ok) {
    toast(result.error);
    return false;
  }
  if (archived) {
    toast("Archived. It's off your board, and still counts on your dashboard.", {
      action: { label: "Undo", onClick: () => void setArchived({ id, archived: false }).then(toastResult) },
    });
  } else {
    toast("Back on your board.");
  }
  return true;
}

/** "Delete…": asks first, since the application, its documents, chat and notes can't come back. */
export function DeleteApplicationDialog({
  id,
  open,
  onOpenChange,
  onDeleted,
  returnFocusTo,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  /** The menu button it was opened from. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this application?"
      description="Its tailored resume and cover letter, the chat, your notes, its history and its mail from Gmail go with it. This can't be undone. Archive it instead to keep it out of the way."
      confirmLabel="Delete application"
      returnFocusTo={returnFocusTo}
      onConfirm={async () => {
        const result = await deleteApplication({ id });
        if (!result.ok) return toast(result.error);
        toast("Application deleted.");
        onDeleted?.();
      }}
    />
  );
}

/** "Rename…": the application's name, prefilled with the current one. */
export function RenameApplicationDialog({
  id,
  title,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  id: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu button it was opened from. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            if (!returnFocusTo?.current?.isConnected) return;
            event.preventDefault();
            returnFocusTo.current.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-dialog border border-line-popover bg-card p-6 shadow-menu">
          <Dialog.Title className="font-serif text-[22px] leading-tight">Rename this application</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">It shows under this name in your list and on your dashboard.</Dialog.Description>
          {/* Mounted only while open, so it starts from the current name each time. */}
          <RenameForm id={id} title={title} onDone={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RenameForm({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return setError("Give it a name first.");
    if (value.trim() === title.trim()) return onDone();
    setSaving(true);
    const result = await renameApplication({ id, title: value });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    toast("Application renamed.");
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input
        label="Name"
        value={value}
        maxLength={300}
        error={error}
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Dialog.Close className={buttonClassName("secondary", "sm")}>Cancel</Dialog.Close>
        <Button type="submit" size="sm" disabled={saving}>
          Save name
        </Button>
      </div>
    </form>
  );
}
