"use client";

import { useId, useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { toast } from "@/components/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { companyKey } from "@/lib/companies";

/** What a name is and what has it: `{ field: "provider", one: "course", many: "courses" }`. */
export type SharedNameNoun<K extends string = string> = { field: K; one: string; many: string };

/**
 * A name several entries can share: a role's company, a degree's school, a
 * course's provider. Names that differ only in case and spacing are one name
 * (companyKey). It's saved when the field is left, not autosaved as you type,
 * so the question below comes once, about the finished name: a company's
 * keystrokes also moved its role in and out of the company's box, remounting
 * the form and losing the change. When other entries have the name, this asks
 * whether to change it on all of them.
 */
export function SharedNameField({
  label,
  placeholder,
  hint,
  className,
  value,
  names,
  noun,
  onSave,
}: {
  label: string;
  placeholder: string;
  /** Instead of saying how many others have the name. */
  hint?: string;
  className?: string;
  value: string;
  /** This field's value on every entry of the section, this one included. */
  names: string[];
  noun: SharedNameNoun;
  onSave: (name: string, everywhere: boolean) => void;
}) {
  const listId = useId();
  const [draft, setDraft] = useState(value);
  // A rename from elsewhere shows here ("Use one name", or a failed save put back).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const [asking, setAsking] = useState(false);

  const own = companyKey(value);
  const others = own ? names.filter((name) => companyKey(name) === own).length - 1 : 0;
  const total = others + 1;
  // The other names, each spelling once, offered so the same one gets typed.
  const suggestions = new Map<string, string>();
  for (const name of names) {
    const key = companyKey(name);
    if (key && key !== own && !suggestions.has(key)) suggestions.set(key, name.trim());
  }

  const commit = () => {
    if (draft === value) return;
    if (others > 0) setAsking(true);
    else onSave(draft, false);
  };

  return (
    <>
      <Input
        className={className}
        label={label}
        placeholder={placeholder}
        hint={hint ?? (others > 0 ? `Also on ${others} other ${others === 1 ? noun.one : noun.many}.` : undefined)}
        list={suggestions.size > 0 ? listId : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // Or the same Enter would press the dialog's Cancel, focused as it opens.
          event.preventDefault();
          commit();
        }}
      />
      {suggestions.size > 0 && (
        <datalist id={listId}>
          {[...suggestions.values()].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={draft.trim() ? `Change the ${noun.field} of all ${total} ${noun.many}?` : `Remove the ${noun.field} from all ${total} ${noun.many}?`}
        description={
          draft.trim()
            ? `“${value.trim()}” is the ${noun.field} of ${total} ${noun.many}. Change it to “${draft.trim()}” on all of them, or only on this one.`
            : `“${value.trim()}” is the ${noun.field} of ${total} ${noun.many}. Leave it empty on all of them, or only on this one.`
        }
        tone="primary"
        confirmLabel={`Change all ${total}`}
        onConfirm={() => onSave(draft, true)}
        alternative={{ label: `Only this ${noun.one}`, onSelect: () => onSave(draft, false) }}
        onCancel={() => setDraft(value)}
      />
    </>
  );
}

/**
 * Saves a SharedNameField's name: on the page at once, put back if the save
 * fails. `save` answers with the entries it changed.
 */
export function useSaveSharedName<K extends string, T extends { id: string } & Record<K, string>>({
  noun,
  entries,
  setEntries,
  save,
}: {
  noun: SharedNameNoun<K>;
  entries: T[];
  setEntries: (change: (entries: T[]) => T[]) => void;
  save: (input: { id: string; name: string; everywhere: boolean }) => Promise<ActionResult<string[]>>;
}) {
  const track = useTrackSave();
  return async (entry: T, name: string, everywhere: boolean) => {
    const key = companyKey(entry[noun.field]);
    const changes = (other: T) => other.id === entry.id || (everywhere && key !== null && companyKey(other[noun.field]) === key);
    const before = new Map(entries.filter(changes).map((other) => [other.id, other[noun.field] as string]));
    const setNames = (nameOf: (id: string) => string) =>
      setEntries((current) => current.map((other) => (before.has(other.id) ? { ...other, [noun.field]: nameOf(other.id) } : other)));
    setNames(() => name);
    const result = await track(save({ id: entry.id, name, everywhere }));
    if (!result.ok) {
      setNames((id) => before.get(id)!);
      return toast(result.error);
    }
    if (everywhere) toast(`Changed the ${noun.field} of ${result.data.length} ${noun.many}.`);
  };
}
