"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { findLanguages, languageCode } from "@/lib/languages";

/** What the picker hands over: a language from the list, or a name as written (code null). */
export type PickedLanguage = { code: string | null; name: string };

/**
 * The language field on the Languages card (.scratch/language-codes): a
 * combobox over every language, found by its name in English, in another
 * language or in itself ("Ingl" finds English). A name the list doesn't know
 * can still be added as written. Enter with the list closed adds what's chosen.
 */
export function LanguagePicker({
  value,
  onChange,
  onSubmit,
  className,
}: {
  value: PickedLanguage;
  onChange: (value: PickedLanguage) => void;
  onSubmit: () => void;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const typed = value.name.trim();
  const matches = value.code ? [] : findLanguages(typed, 6);
  // Offered last, unless the name is one the list knows.
  const asWritten = typed && !value.code && !languageCode(typed);
  const options = [...matches.map((match) => ({ ...match, key: match.code })), ...(asWritten ? [{ key: "", code: null, name: typed, native: "" }] : [])];
  const shown = open && options.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  function pick(index: number) {
    const option = options[index];
    if (!option) return;
    onChange({ code: option.code, name: option.name });
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (shown) pick(Math.min(active, options.length - 1));
      else onSubmit();
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        role="combobox"
        aria-label="Language"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? optionId(Math.min(active, options.length - 1)) : undefined}
        autoComplete="off"
        placeholder="Language, e.g. French or Français"
        value={value.name}
        onChange={(event) => {
          onChange({ code: null, name: event.target.value });
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Languages"
        hidden={!shown}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-control border border-line bg-card py-1 shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={option.key || "as-written"}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // Keeps focus in the field, so the list doesn't close before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(index)}
            onMouseEnter={() => setActive(index)}
            className={cn("flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm", index === active && "bg-hover")}
          >
            {option.code ? (
              <>
                <span>{option.name}</span>
                {option.native !== option.name && (
                  <span lang={option.code} className="text-muted">
                    {option.native}
                  </span>
                )}
              </>
            ) : (
              <span>Add “{option.name}” as written</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
