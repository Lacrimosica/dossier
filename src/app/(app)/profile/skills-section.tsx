"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RemovableChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LanguageLevel } from "@/generated/prisma/enums";
import { LANGUAGE_LEVELS, languageLevelLabel, sameName, type ProfileData } from "@/lib/profile";

import { spokenLanguage } from "@/lib/languages";

import { addLanguage, addSkill, removeLanguage, removeSkill, saveInterests, setLanguageLevel } from "./actions";
import { LanguagePicker, type PickedLanguage } from "./language-picker";
import { useTrackSave } from "@/components/save-tracker";

export type UpdateProfile = (change: (profile: ProfileData) => ProfileData) => void;

/** A card in the Skills & languages section: title, "{n} added", content. */
export function ChipCard({
  title,
  count,
  optional = false,
  children,
}: {
  title: string;
  count: number;
  /** Doesn't count towards Profile strength (#216). */
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 px-7 py-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lead font-medium">
          {title}
          {optional && <span className="font-normal text-muted"> (optional)</span>}
        </h3>
        <span className="text-meta text-muted">{count} added</span>
      </div>
      {children}
    </Card>
  );
}

/** Skills (PRO-3): Enter adds one, × removes it everywhere. */
function SkillsCard({ profile, update }: { profile: ProfileData; update: UpdateProfile }) {
  const track = useTrackSave();
  const [draft, setDraft] = useState("");

  const roleCount = (skillId: string) =>
    profile.experience.filter((entry) => entry.skillIds.includes(skillId)).length;

  async function add() {
    const name = draft.trim();
    if (!name) return;
    const existing = profile.skills.find((skill) => sameName(skill.name, name));
    if (existing) {
      setDraft("");
      toast(`“${existing.name}” is already in your skills.`);
      return;
    }
    setDraft("");
    const result = await track(addSkill({ name }));
    if (!result.ok) {
      setDraft(name);
      toast(result.error);
      return;
    }
    const { skill } = result.data;
    update((current) =>
      current.skills.some((entry) => entry.id === skill.id)
        ? current
        : { ...current, skills: [...current.skills, skill] },
    );
  }

  async function remove(id: string) {
    const before = profile;
    // Removing a skill detaches it from every role too (PRO-3).
    update((current) => ({
      ...current,
      skills: current.skills.filter((skill) => skill.id !== id),
      experience: current.experience.map((entry) => ({
        ...entry,
        skillIds: entry.skillIds.filter((skillId) => skillId !== id),
      })),
    }));
    const result = await track(removeSkill({ id }));
    if (!result.ok) {
      update(() => before);
      toast(result.error);
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void add();
  };

  return (
    <ChipCard title="Skills" count={profile.skills.length}>
      {profile.skills.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Your skills">
          {profile.skills.map((skill) => {
            const roles = roleCount(skill.id);
            return (
              <li key={skill.id}>
                <RemovableChip
                  meta={roles > 0 ? `${roles} ${roles === 1 ? "role" : "roles"}` : undefined}
                  removeLabel={`Remove ${skill.name}`}
                  onRemove={() => void remove(skill.id)}
                >
                  {skill.name}
                </RemovableChip>
              </li>
            );
          })}
        </ul>
      )}
      <Input
        aria-label="Add a skill"
        placeholder="e.g. Accessibility"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="done"
      />
    </ChipCard>
  );
}

function LevelOptions() {
  return LANGUAGE_LEVELS.map(({ value, label }) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

/** Languages with a CEFR-style level (PRO-4). */
function LanguagesCard({ profile, update }: { profile: ProfileData; update: UpdateProfile }) {
  const track = useTrackSave();
  const [picked, setPicked] = useState<PickedLanguage>({ code: null, name: "" });
  const [level, setLevel] = useState<LanguageLevel>(LanguageLevel.B1);

  async function add() {
    const trimmed = picked.name.trim();
    if (!trimmed) return;
    // A typed name the list knows is that language: "Inglese" is the English already there (.scratch/language-codes).
    const spoken = picked.code ? picked : spokenLanguage(trimmed);
    const existing = profile.languages.find((language) =>
      spoken.code ? language.code === spoken.code : !language.code && sameName(language.name, spoken.name),
    );
    setPicked({ code: null, name: "" });
    if (existing) {
      // Adding a language that's already there updates its level (PRO-4).
      update((current) => ({
        ...current,
        languages: current.languages.map((language) =>
          language.id === existing.id ? { ...language, level } : language,
        ),
      }));
      toast(`Updated ${existing.name} to ${languageLevelLabel(level)}.`);
    }
    const result = await track(addLanguage({ name: spoken.name, code: spoken.code, level }));
    if (!result.ok) {
      setPicked(picked);
      toast(result.error);
      return;
    }
    const { language } = result.data;
    update((current) =>
      current.languages.some((entry) => entry.id === language.id)
        ? current
        : { ...current, languages: [...current.languages, language] },
    );
  }

  async function changeLevel(id: string, next: LanguageLevel) {
    const before = profile;
    update((current) => ({
      ...current,
      languages: current.languages.map((language) => (language.id === id ? { ...language, level: next } : language)),
    }));
    const result = await track(setLanguageLevel({ id, level: next }));
    if (!result.ok) {
      update(() => before);
      toast(result.error);
    }
  }

  async function remove(id: string) {
    const before = profile;
    update((current) => ({ ...current, languages: current.languages.filter((language) => language.id !== id) }));
    const result = await track(removeLanguage({ id }));
    if (!result.ok) {
      update(() => before);
      toast(result.error);
    }
  }

  return (
    <ChipCard title="Languages" count={profile.languages.length} optional>
      {profile.languages.length > 0 && (
        <ul className="flex flex-col border-t border-line" aria-label="Your languages">
          {profile.languages.map((language) => (
            <li key={language.id} className="flex items-center gap-3 border-b border-line py-2.5">
              <span data-private className="min-w-0 flex-1 text-field">{language.name}</span>
              <Select
                aria-label={`${language.name} level`}
                selectClassName="w-auto text-sm"
                value={language.level}
                onChange={(event) => void changeLevel(language.id, event.target.value as LanguageLevel)}
              >
                <LevelOptions />
              </Select>
              <button
                type="button"
                aria-label={`Remove ${language.name}`}
                onClick={() => void remove(language.id)}
                className="rounded-control px-1.5 py-1 text-base leading-none text-muted hover:text-ink"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <LanguagePicker className="min-w-0 flex-[1_1_180px]" value={picked} onChange={setPicked} onSubmit={() => void add()} />
        <Select
          className="flex-[0_1_220px]"
          aria-label="Level"
          selectClassName="text-sm"
          value={level}
          onChange={(event) => setLevel(event.target.value as LanguageLevel)}
        >
          <LevelOptions />
        </Select>
        <Button variant="secondary" className="bg-input" onClick={() => void add()}>
          Add
        </Button>
      </div>
    </ChipCard>
  );
}

/** Hobbies and interests: Enter adds one, × removes it. The list saves as a whole. */
function InterestsCard({ profile, update }: { profile: ProfileData; update: UpdateProfile }) {
  const track = useTrackSave();
  const [draft, setDraft] = useState("");

  async function save(interests: string[], restoreDraft = "") {
    const before = profile;
    update((current) => ({ ...current, interests }));
    const result = await track(saveInterests({ interests }));
    if (!result.ok) {
      update(() => before);
      setDraft(restoreDraft);
      toast(result.error);
    }
  }

  function add() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    const existing = profile.interests.find((interest) => sameName(interest, name));
    if (existing) {
      toast(`“${existing}” is already in your interests.`);
      return;
    }
    void save([...profile.interests, name], name);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };

  return (
    <ChipCard title="Interests" count={profile.interests.length} optional>
      {profile.interests.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Your interests">
          {profile.interests.map((interest) => (
            <li key={interest}>
              <RemovableChip
                removeLabel={`Remove ${interest}`}
                onRemove={() => void save(profile.interests.filter((item) => item !== interest))}
              >
                {interest}
              </RemovableChip>
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label="Add an interest"
        placeholder="e.g. Bouldering"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="done"
      />
    </ChipCard>
  );
}

/** The Skills & languages section. */
export function SkillsSection({ profile, update }: { profile: ProfileData; update: UpdateProfile }) {
  return (
    <div className="flex flex-col gap-4">
      <SkillsCard profile={profile} update={update} />
      <LanguagesCard profile={profile} update={update} />
      <InterestsCard profile={profile} update={update} />
    </div>
  );
}
