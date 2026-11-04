"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { companyGroups, companyKey, companySpellings, moveInCompanies, type CompanySpellings } from "@/lib/companies";
import { formatDateRange, type EntryOrder, type ExperienceItem, type GroupItem, type ProfileData } from "@/lib/profile";

import {
  attachNewSkill,
  createExperience,
  createExperienceGroup,
  keepCompaniesApart,
  removeExperience,
  removeExperienceGroup,
  renameExperienceGroup,
  reorderEntries,
  reorderExperienceGroups,
  restoreExperience,
  restoreExperienceGroup,
  saveExperience,
  setExperienceCompany,
  setExperienceGroup,
  setExperienceSkill,
  sortEntriesByDate,
  unifyCompanyName,
} from "./actions";
import { MoveButton } from "./entry-card";
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
  sameCompany,
  onCompanyChange,
  groups,
  onGroupChange,
}: {
  entry: ExperienceItem;
  onChange: (entry: ExperienceItem) => void;
  autoFocus: boolean;
  /** The companies of the other roles, offered while typing so a promotion gets the same name. */
  companies: string[];
  /** How many other roles have this role's company: changing it asks whether to change theirs too. */
  sameCompany: number;
  /** Saves at once, apart from the autosaved fields: on this role, or on every role at its company. */
  onCompanyChange: (company: string, everywhere: boolean) => void;
  /** The experience groups; the Group field shows only when there are some. */
  groups: GroupItem[];
  /** Saves at once, apart from the autosaved fields: the role moves to that group's list. */
  onGroupChange: (groupId: string | null) => void;
}) {
  const companyList = useId();
  const track = useTrackSave();
  // Autosave the text and dates only; skill links save on their own when toggled.
  const { id, role, location, bullets, startYear, startMonth, endYear, endMonth, current, careerBreak } = entry;
  const fields = useMemo(
    () => ({ id, role, location, bullets, startYear, startMonth, endYear, endMonth, current, careerBreak }),
    [id, role, location, bullets, startYear, startMonth, endYear, endMonth, current, careerBreak],
  );
  const { flush } = useAutosave(fields, (value) => track(saveExperience(value)));
  const set = (change: Partial<ExperienceItem>) => onChange({ ...entry, ...change });

  // The company is saved when the field is left, not as you type: a keystroke
  // that moved the role into or out of its company's box remounted this form,
  // and the autosave lost it. A rename from elsewhere ("Use one name") shows here.
  const [companyDraft, setCompanyDraft] = useState(entry.company);
  const [shownCompany, setShownCompany] = useState(entry.company);
  if (entry.company !== shownCompany) {
    setShownCompany(entry.company);
    setCompanyDraft(entry.company);
  }
  const [asking, setAsking] = useState(false);
  const commitCompany = () => {
    if (companyDraft === entry.company) return;
    if (sameCompany > 0) setAsking(true);
    else onCompanyChange(companyDraft, false);
  };
  const roleCount = sameCompany + 1;

  return (
    <div className="grid grid-cols-2 gap-[18px]" onBlur={flush}>
      <Checkbox
        className="col-span-2"
        label="This is a career break"
        checked={careerBreak}
        onChange={(event) => set({ careerBreak: event.target.checked })}
      />
      <Input
        className="col-span-2"
        label={careerBreak ? "Title" : "Role"}
        placeholder={careerBreak ? "Career break" : "Product Designer"}
        hint={careerBreak ? "Left empty, resumes say “Career break” in their own language." : undefined}
        value={entry.role}
        onChange={(event) => set({ role: event.target.value })}
        autoFocus={autoFocus}
      />
      {/* A break has no company or place; what was typed before stays, unused, if it's switched back. */}
      {!careerBreak && (
        <>
          <Input
            label="Company"
            placeholder="Acme Inc."
            hint={companies.length > 0 ? "Roles with the same company name show together." : undefined}
            list={companies.length > 0 ? companyList : undefined}
            value={companyDraft}
            onChange={(event) => setCompanyDraft(event.target.value)}
            onBlur={commitCompany}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Or the same Enter would press the dialog's Cancel, focused as it opens.
              event.preventDefault();
              commitCompany();
            }}
          />
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title={companyDraft.trim() ? `Change the company of all ${roleCount} roles?` : `Remove the company from all ${roleCount} roles?`}
            description={
              companyDraft.trim()
                ? `“${entry.company.trim()}” is the company of ${roleCount} roles. Change it to “${companyDraft.trim()}” on all of them, and they’ll still show together, on your resume too.`
                : `“${entry.company.trim()}” is the company of ${roleCount} roles. Leave it empty on all of them, or only on this one.`
            }
            tone="primary"
            confirmLabel={`Change all ${roleCount}`}
            onConfirm={() => onCompanyChange(companyDraft, true)}
            alternative={{ label: "Only this role", onSelect: () => onCompanyChange(companyDraft, false) }}
            onCancel={() => setCompanyDraft(entry.company)}
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
            hint="Optional. Leave it empty for remote work, or type “Remote” to show it on your resume."
            value={entry.location}
            onChange={(event) => set({ location: event.target.value })}
          />
        </>
      )}
      {groups.length > 0 && (
        <Select
          className="col-span-2"
          label="Group"
          hint={
            careerBreak
              ? "Put it in the group whose timeline it interrupts: it sits there by date, where the gap would be."
              : "Each group has its own heading on your resumes."
          }
          value={groups.some((group) => group.id === entry.groupId) ? entry.groupId! : ""}
          onChange={(event) => onGroupChange(event.target.value || null)}
        >
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {groupTitle(group)}
            </option>
          ))}
        </Select>
      )}
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
          label={careerBreak ? "It’s still going on" : "I still work here"}
          checked={entry.current}
          onChange={(event) => set({ current: event.target.checked })}
        />
      </div>
      <Textarea
        className="col-span-2"
        label={careerBreak ? "What you did in this time" : "What you did"}
        placeholder={careerBreak ? "The reason, if you want to give it, and what you learned. One point per line." : "One point per line. Rough is fine."}
        rows={4}
        value={entry.bullets}
        onChange={(event) => set({ bullets: event.target.value })}
      />
    </div>
  );
}

const roleTitle = (entry: ExperienceItem) => entry.role.trim() || (entry.careerBreak ? "Career break" : "New role");
const groupTitle = (group: GroupItem) => group.name.trim() || "Untitled group";

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

/** How many other roles have this role's company, case and spacing aside. */
const sameCompanyCount = (experience: ExperienceItem[], entry: ExperienceItem) => {
  const own = companyKey(entry.company);
  return own ? experience.filter((role) => role.id !== entry.id && companyKey(role.company) === own).length : 0;
};

/**
 * Work experience (PRO-5): one card open at a time, autosaved, with Undo on
 * Remove. Roles at the same company show and move together, and spellings
 * that look like one company are offered to be made one name. Roles can be
 * split into named groups, each with its own heading on resumes
 * (.scratch/experience-groups): each group is a list of its own, and the
 * roles without one follow them.
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
  // One order for the whole section, whichever group's list changes it.
  const [mode, setMode] = useState(order);
  const [addingGroup, setAddingGroup] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const groups = profile.experienceGroups;
  const skillNames = (entry: ExperienceItem) =>
    profile.skills.filter((skill) => entry.skillIds.includes(skill.id)).map((skill) => skill.name);
  const spellings = companySpellings(
    profile.experience.map((role) => role.company),
    keptApart,
  );

  const blocks: (string | null)[] = [...groups.map((group) => group.id), null];
  const roles = (groupId: string | null) => profile.experience.filter((role) => groupOf(groups, role) === groupId);

  /** One block's roles changed: the others keep theirs. */
  const updateBlock = (groupId: string | null, change: (roles: ExperienceItem[]) => ExperienceItem[]) =>
    update((current) => {
      const inBlock = (role: ExperienceItem) => groupOf(current.experienceGroups, role) === groupId;
      return { ...current, experience: [...current.experience.filter((role) => !inBlock(role)), ...change(current.experience.filter(inBlock))] };
    });

  /** Every role's id in the order shown, with one block's in its new order: what reorderEntries saves. */
  const orderWith = (groupId: string | null, ids: string[]) =>
    blocks.flatMap((block) => (block === groupId ? ids : roles(block).map((role) => role.id)));

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

  /** Saves a role's company, and with `everywhere` the company of every role at the same one. */
  async function changeCompany(entry: ExperienceItem, company: string, everywhere: boolean) {
    const key = companyKey(entry.company);
    const renamed = (role: ExperienceItem) => role.id === entry.id || (everywhere && key !== null && companyKey(role.company) === key);
    const before = new Map(profile.experience.filter(renamed).map((role) => [role.id, role.company]));
    const setCompanies = (name: (id: string) => string) =>
      update((current) => ({
        ...current,
        experience: current.experience.map((role) => (before.has(role.id) ? { ...role, company: name(role.id) } : role)),
      }));
    setCompanies(() => company);
    const result = await track(setExperienceCompany({ id: entry.id, company, everywhere }));
    if (!result.ok) {
      setCompanies((id) => before.get(id)!);
      return toast(result.error);
    }
    if (everywhere) toast(`Changed the company of ${result.data.length} roles.`);
  }

  async function keepApart(fingerprint: string) {
    setKeptApart((current) => [...current, fingerprint]);
    const result = await track(keepCompaniesApart({ fingerprint }));
    if (!result.ok) {
      setKeptApart((current) => current.filter((entry) => entry !== fingerprint));
      toast(result.error);
    }
  }

  /** Sets these roles' group in the list. */
  const regroup = (ids: Set<string>, groupId: string | null) => (role: ExperienceItem) => (ids.has(role.id) ? { ...role, groupId } : role);

  async function moveToGroup(entry: ExperienceItem, groupId: string | null) {
    const ids = new Set([entry.id]);
    update((current) => ({ ...current, experience: current.experience.map(regroup(ids, groupId)) }));
    const result = await track(setExperienceGroup({ id: entry.id, groupId }));
    if (!result.ok) {
      update((current) => ({ ...current, experience: current.experience.map(regroup(ids, entry.groupId)) }));
      return toast(result.error);
    }
    const group = groups.find(({ id }) => id === groupId);
    toast(group ? `Moved “${roleTitle(entry)}” to “${groupTitle(group)}”.` : `“${roleTitle(entry)}” is no longer in a group.`);
  }

  async function addGroup() {
    setAddingGroup(true);
    const result = await track(createExperienceGroup({ name: "" }));
    setAddingGroup(false);
    if (!result.ok) return toast(result.error);
    update((current) => ({ ...current, experienceGroups: [...current.experienceGroups, result.data] }));
    setCreatedGroupId(result.data.id);
  }

  async function moveGroup(from: number, to: number) {
    if (to < 0 || to >= groups.length) return;
    const before = groups;
    const next = groups.toSpliced(from, 1).toSpliced(to, 0, groups[from]);
    update((current) => ({ ...current, experienceGroups: next }));
    const result = await track(reorderExperienceGroups({ ids: next.map((group) => group.id) }));
    if (!result.ok) {
      update((current) => ({ ...current, experienceGroups: before }));
      toast(result.error);
    }
  }

  async function removeGroup(group: GroupItem) {
    const index = groups.findIndex(({ id }) => id === group.id);
    const inGroup = new Set(roles(group.id).map((role) => role.id));
    update((current) => ({
      ...current,
      experienceGroups: current.experienceGroups.filter(({ id }) => id !== group.id),
      experience: current.experience.map(regroup(inGroup, null)),
    }));
    const result = await track(removeExperienceGroup({ id: group.id }));
    if (!result.ok) {
      update((current) => ({
        ...current,
        experienceGroups: current.experienceGroups.toSpliced(index, 0, group),
        experience: current.experience.map(regroup(inGroup, group.id)),
      }));
      return toast(result.error);
    }
    toast(`Removed the group “${groupTitle(group)}”. Its roles are still in your profile.`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const restored = await track(restoreExperienceGroup({ id: group.id, name: group.name, roleIds: result.data, index }));
          if (!restored.ok) return toast(restored.error);
          update((current) => ({
            ...current,
            experienceGroups: current.experienceGroups.toSpliced(Math.min(index, current.experienceGroups.length), 0, restored.data.group),
            experience: current.experience.map(regroup(new Set(restored.data.roleIds), group.id)),
          }));
          toast(`Put back the group “${groupTitle(group)}”.`);
        },
      },
    });
  }

  const list = (groupId: string | null) => (
    <EntryList
      items={roles(groupId)}
      setItems={(change) => updateBlock(groupId, change)}
      addLabel="Add a role"
      ordering={{
        mode,
        save: (ids) => reorderEntries({ section: "experience", ids: orderWith(groupId, ids) }),
        sortByDate: () => sortEntriesByDate({ section: "experience" }),
        onModeChange: setMode,
      }}
      grouping={byCompany}
      summary={(entry) => ({
        title: roleTitle(entry),
        subtitle: entry.careerBreak ? "A break, not counted as experience" : [entry.company, entry.location].filter((part) => part.trim()).join(" · "),
        meta: formatDateRange(entry),
        footnote: skillNames(entry).join(" · ") || undefined,
      })}
      create={() => createExperience({ groupId })}
      remove={(entry) => removeExperience({ id: entry.id })}
      restore={(entry) => restoreExperience(entry)}
      renderForm={(entry, { onChange, autoFocus }) => (
        <>
          <ExperienceForm
            entry={entry}
            onChange={onChange}
            autoFocus={autoFocus}
            companies={otherCompanies(profile.experience, entry)}
            sameCompany={sameCompanyCount(profile.experience, entry)}
            onCompanyChange={(company, everywhere) => void changeCompany(entry, company, everywhere)}
            groups={groups}
            onGroupChange={(groupId) => void moveToGroup(entry, groupId)}
          />
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
  );

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
      {groups.length === 0 ? (
        list(null)
      ) : (
        <>
          {groups.map((group, index) => (
            <GroupBlock
              key={group.id}
              group={group}
              first={index === 0}
              last={index === groups.length - 1}
              autoFocus={createdGroupId === group.id}
              onRename={(name) =>
                update((current) => ({
                  ...current,
                  experienceGroups: current.experienceGroups.map((item) => (item.id === group.id ? { ...item, name } : item)),
                }))
              }
              onMoveUp={() => void moveGroup(index, index - 1)}
              onMoveDown={() => void moveGroup(index, index + 1)}
              onRemove={() => void removeGroup(group)}
            >
              {list(group.id)}
            </GroupBlock>
          ))}
          {roles(null).length > 0 && (
            <section aria-labelledby={ungroupedHeading} className="flex flex-col gap-3 rounded-card border border-line p-3">
              <div className="flex flex-col gap-0.5 px-1">
                <h3 id={ungroupedHeading} className="text-sm font-medium">
                  Not in a group
                </h3>
                <p className="text-meta text-muted">These go under “Other experience” on your resumes, after your groups. A group of their own gives them a heading you choose.</p>
              </div>
              {list(null)}
            </section>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="secondary" size="sm" onClick={() => void addGroup()} disabled={addingGroup}>
          Add a group
        </Button>
        {groups.length === 0 && (
          <span className="text-meta text-muted">
            Split your roles into groups, like non-profit and tech, and each group gets its own heading on your resumes.
          </span>
        )}
      </div>
    </div>
  );
}

const ungroupedHeading = "experience-not-in-a-group";

/** The role's group, or null when it has none or its group is gone (removed in another tab). */
const groupOf = (groups: GroupItem[], role: ExperienceItem) =>
  groups.some((group) => group.id === role.groupId) ? role.groupId : null;

/** A group's name (autosaved), its place among the groups and Remove, above its roles. */
function GroupBlock({
  group,
  first,
  last,
  autoFocus,
  onRename,
  onMoveUp,
  onMoveDown,
  onRemove,
  children,
}: {
  group: GroupItem;
  first: boolean;
  last: boolean;
  autoFocus: boolean;
  onRename: (name: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const track = useTrackSave();
  const { id, name } = group;
  const fields = useMemo(() => ({ id, name }), [id, name]);
  const { flush } = useAutosave(fields, (value) => track(renameExperienceGroup(value)));
  const title = groupTitle(group);
  return (
    <section aria-label={`Group: ${title}`} className="flex flex-col gap-3 rounded-card border border-line p-3">
      <div className="flex items-end gap-2 px-1">
        <Input
          className="min-w-0 flex-1"
          label="Group name"
          hint="The heading these roles go under on your resumes."
          placeholder="Non-profit experience"
          value={group.name}
          onChange={(event) => onRename(event.target.value)}
          onBlur={flush}
          autoFocus={autoFocus}
        />
        <span className="flex flex-none items-center gap-0.5 pb-2.5">
          <MoveButton label={`Move the group “${title}” up`} disabled={first} onClick={onMoveUp}>
            ↑
          </MoveButton>
          <MoveButton label={`Move the group “${title}” down`} disabled={last} onClick={onMoveDown}>
            ↓
          </MoveButton>
        </span>
        <Button variant="danger-text" size="sm" className="ms-2 mb-2" onClick={onRemove}>
          Remove group
        </Button>
      </div>
      {children}
    </section>
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
