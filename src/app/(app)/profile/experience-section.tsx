"use client";

import { useId, useMemo, useState } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { companyGroups, companyKey, companySpellings, moveInCompanies, type CompanySpellings } from "@/lib/companies";
import { formatDateRange, type EntryOrder, type ExperienceItem, type ProfileData } from "@/lib/profile";

import {
  attachNewSkill,
  createExperience,
  keepCompaniesApart,
  removeExperience,
  reorderEntries,
  restoreExperience,
  saveExperience,
  setExperienceSkill,
  sortEntriesByDate,
  unifyCompanyName,
} from "./actions";
import { EntryList, type Grouping } from "./entry-list";
import { MonthYearField } from "./month-year-field";
import { useTrackSave } from "@/components/save-tracker";
import type { UpdateProfile } from "./skills-section";
import { SkillsUsed } from "./skills-used";

/** The fields of an open role, autosaved as you type. */
function ExperienceForm({
  entry,
  onChange,
  autoFocus,
  companies,
}: {
  entry: ExperienceItem;
  onChange: (entry: ExperienceItem) => void;
  autoFocus: boolean;
  /** The companies of the other roles, offered while typing so a promotion gets the same name. */
  companies: string[];
}) {
  const companyList = useId();
  const track = useTrackSave();
  // Autosave the text and dates only; skill links save on their own when toggled.
  const { id, role, company, location, bullets, startYear, startMonth, endYear, endMonth, current } = entry;
  const fields = useMemo(
    () => ({ id, role, company, location, bullets, startYear, startMonth, endYear, endMonth, current }),
    [id, role, company, location, bullets, startYear, startMonth, endYear, endMonth, current],
  );
  const { flush } = useAutosave(fields, (value) => track(saveExperience(value)));
  const set = (change: Partial<ExperienceItem>) => onChange({ ...entry, ...change });

  return (
    <div className="grid grid-cols-2 gap-[18px]" onBlur={flush}>
      <Input
        className="col-span-2"
        label="Role"
        placeholder="Product Designer"
        value={entry.role}
        onChange={(event) => set({ role: event.target.value })}
        autoFocus={autoFocus}
      />
      <Input
        label="Company"
        placeholder="Acme Inc."
        hint={companies.length > 0 ? "Roles with the same company name show together." : undefined}
        list={companies.length > 0 ? companyList : undefined}
        value={entry.company}
        onChange={(event) => set({ company: event.target.value })}
      />
      {companies.length > 0 && (
        <datalist id={companyList}>
          {companies.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      <Input
        label="Location"
        placeholder="Berlin, Germany"
        value={entry.location}
        onChange={(event) => set({ location: event.target.value })}
      />
      <MonthYearField
        label="Started"
        value={{ month: entry.startMonth, year: entry.startYear }}
        onChange={({ month, year }) => set({ startMonth: month, startYear: year })}
      />
      <div className="flex flex-col gap-2.5">
        <MonthYearField
          label="Ended"
          value={{ month: entry.endMonth, year: entry.endYear }}
          onChange={({ month, year }) => set({ endMonth: month, endYear: year })}
          disabled={entry.current}
        />
        <Checkbox
          label="I still work here"
          checked={entry.current}
          onChange={(event) => set({ current: event.target.checked })}
        />
      </div>
      <Textarea
        className="col-span-2"
        label="What you did"
        placeholder="One point per line. Rough is fine."
        rows={4}
        value={entry.bullets}
        onChange={(event) => set({ bullets: event.target.value })}
      />
    </div>
  );
}

const roleTitle = (entry: ExperienceItem) => entry.role.trim() || "New role";

/** A promotion's roles together, as the resume prints them (companyGroups). */
const byCompany: Grouping<ExperienceItem> = {
  groups: companyGroups,
  move: moveInCompanies,
  label: (group) => `${group.length} roles at ${group[0].company.trim()}`,
};

/** The companies other than this role's, each spelling once, for the Company field's suggestions. */
const otherCompanies = (experience: ExperienceItem[], entry: ExperienceItem) => {
  const own = companyKey(entry.company);
  const names = new Map<string, string>();
  for (const role of experience) {
    const key = companyKey(role.company);
    if (key && key !== own && !names.has(key)) names.set(key, role.company.trim());
  }
  return [...names.values()];
};

/**
 * Work experience (PRO-5): one card open at a time, autosaved, with Undo on
 * Remove. Roles at the same company show and move together, and spellings
 * that look like one company are offered to be made one name.
 */
export function ExperienceSection({
  profile,
  update,
  order,
  keptApart: keptApartAtLoad = [],
}: {
  profile: ProfileData;
  update: UpdateProfile;
  order: EntryOrder;
  /** Settings → companiesKeptApart. */
  keptApart?: string[];
}) {
  const track = useTrackSave();
  const [keptApart, setKeptApart] = useState(keptApartAtLoad);
  const skillNames = (entry: ExperienceItem) =>
    profile.skills.filter((skill) => entry.skillIds.includes(skill.id)).map((skill) => skill.name);
  const spellings = companySpellings(
    profile.experience.map((role) => role.company),
    keptApart,
  );

  async function unify(names: string[], to: string) {
    const result = await track(unifyCompanyName({ names, to }));
    if (!result.ok) return toast(result.error);
    const renamed = new Set(result.data);
    update((current) => ({
      ...current,
      experience: current.experience.map((role) => (renamed.has(role.id) ? { ...role, company: to } : role)),
    }));
    toast(`Renamed to “${to}”. Those roles now show together.`);
  }

  async function keepApart(fingerprint: string) {
    setKeptApart((current) => [...current, fingerprint]);
    const result = await track(keepCompaniesApart({ fingerprint }));
    if (!result.ok) {
      setKeptApart((current) => current.filter((entry) => entry !== fingerprint));
      toast(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {spellings.map((suggestion) => (
        <SameCompany
          key={suggestion.fingerprint}
          suggestion={suggestion}
          onUnify={(to) => void unify(suggestion.names, to)}
          onKeepApart={() => void keepApart(suggestion.fingerprint)}
        />
      ))}
    <EntryList
      items={profile.experience}
      setItems={(change) => update((current) => ({ ...current, experience: change(current.experience) }))}
      addLabel="Add a role"
      ordering={{
        mode: order,
        save: (ids) => reorderEntries({ section: "experience", ids }),
        sortByDate: () => sortEntriesByDate({ section: "experience" }),
      }}
      grouping={byCompany}
      summary={(entry) => ({
        title: roleTitle(entry),
        subtitle: [entry.company, entry.location].filter((part) => part.trim()).join(" · "),
        meta: formatDateRange(entry),
        footnote: skillNames(entry).join(" · ") || undefined,
      })}
      create={() => createExperience({})}
      remove={(entry) => removeExperience({ id: entry.id })}
      restore={(entry) => restoreExperience(entry)}
      renderForm={(entry, { onChange, autoFocus }) => (
        <>
          <ExperienceForm entry={entry} onChange={onChange} autoFocus={autoFocus} companies={otherCompanies(profile.experience, entry)} />
          <SkillsUsed
            entry={entry}
            noun="role"
            skills={profile.skills}
            update={update}
            setLinks={(change) =>
              update((current) => ({
                ...current,
                experience: current.experience.map((item) => (item.id === entry.id ? { ...item, skillIds: change(item.skillIds) } : item)),
              }))
            }
            attach={(skillId, attached) => setExperienceSkill({ experienceId: entry.id, skillId, attached })}
            attachNew={(name) => attachNewSkill({ experienceId: entry.id, name })}
          />
        </>
      )}
    />
    </div>
  );
}

/** "ACME and Acme Inc. look like one company": pick the name to keep, or say they're different. */
function SameCompany({
  suggestion,
  onUnify,
  onKeepApart,
}: {
  suggestion: CompanySpellings;
  onUnify: (to: string) => void;
  onKeepApart: () => void;
}) {
  const quoted = suggestion.names.map((name) => `“${name}”`);
  const listed = quoted.length === 2 ? quoted.join(" and ") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
  return (
    <div role="note" className="flex flex-col gap-2.5 rounded-card border border-line-card bg-card px-4 py-3 text-meta">
      <p className="text-ink">
        {listed} look like the same company. Give them one name and their roles will show together, on your resume too.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {suggestion.names.map((name) => (
          <Button key={name} variant="secondary" size="sm" onClick={() => onUnify(name)}>
            Use “{name}”
          </Button>
        ))}
        <Button variant="text" size="sm" className="ms-2" onClick={onKeepApart}>
          They’re different companies
        </Button>
      </div>
    </div>
  );
}
