"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { archiveApplication, DeleteApplicationDialog, RenameApplicationDialog } from "@/components/application-lifecycle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The application's "⋯" menu (E9-5): Rename, Archive or Unarchive, and Delete. */
export function ApplicationMenu({ id, title, archived }: { id: string; title: string; archived: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={trigger}
          aria-label="More actions"
          className="grid size-10 place-items-center rounded-control border border-line-control text-muted hover:border-line-strong hover:text-ink data-[state=open]:border-primary data-[state=open]:text-ink"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ⋯
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[180px]">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void archiveApplication(id, !archived)}>{archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-danger data-highlighted:text-error-strong">
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameApplicationDialog id={id} title={title} open={renaming} onOpenChange={setRenaming} returnFocusTo={trigger} />
      <DeleteApplicationDialog id={id} open={deleting} onOpenChange={setDeleting} onDeleted={() => router.push("/applications")} returnFocusTo={trigger} />
    </>
  );
}
