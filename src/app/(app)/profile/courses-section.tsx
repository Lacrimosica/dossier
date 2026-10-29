"use client";

import { useTrackSave } from "@/components/save-tracker";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { formatDateRange, type CourseItem, type EntryOrder, type ProfileData } from "@/lib/profile";

import { createCourse, removeCourse, reorderEntries, restoreCourse, saveCourse, sortEntriesByDate } from "./actions";
import { EntryList } from "./entry-list";
import { MonthYearField } from "./month-year-field";
import type { UpdateProfile } from "./skills-section";

const optional = <span className="font-normal text-muted">(optional)</span>;

/** "Mar 2025 · 3 weekend sessions": a course's dates and length, for its card. */
export const courseMeta = (entry: CourseItem) =>
  [formatDateRange({ ...entry, current: false }), entry.duration.trim()].filter(Boolean).join(" · ");

/** The fields of an open course, autosaved as you type. */
function CourseForm({
  entry,
  onChange,
  autoFocus,
}: {
  entry: CourseItem;
  onChange: (entry: CourseItem) => void;
  autoFocus: boolean;
}) {
  const track = useTrackSave();
  const { flush } = useAutosave(entry, (value) => track(saveCourse(value)));
  const set = (change: Partial<CourseItem>) => onChange({ ...entry, ...change });

  return (
    <div className="grid grid-cols-2 gap-[18px]" onBlur={flush}>
      <Input
        className="col-span-2"
        label="Course or certificate"
        placeholder="UX Writing Workshop"
        value={entry.name}
        onChange={(event) => set({ name: event.target.value })}
        autoFocus={autoFocus}
      />
      <Input
        className="col-span-2"
        label="Provider"
        placeholder="Who ran it: a school, studio, trainer or platform"
        value={entry.provider}
        onChange={(event) => set({ provider: event.target.value })}
      />
      <MonthYearField
        label="When"
        value={{ month: entry.startMonth, year: entry.startYear }}
        onChange={({ month, year }) => set({ startMonth: month, startYear: year })}
      />
      <MonthYearField
        label="Until"
        value={{ month: entry.endMonth, year: entry.endYear }}
        onChange={({ month, year }) => set({ endMonth: month, endYear: year })}
      />
      <Input
        label={<>Length {optional}</>}
        placeholder="3 weekend sessions"
        value={entry.duration}
        onChange={(event) => set({ duration: event.target.value })}
      />
      <Input
        label={<>Link {optional}</>}
        placeholder="The certificate or the course's page"
        value={entry.link}
        onChange={(event) => set({ link: event.target.value })}
      />
      <Textarea
        className="col-span-2"
        label="Notes"
        placeholder="What it covered, what you made, a grade"
        rows={3}
        value={entry.notes}
        onChange={(event) => set({ notes: event.target.value })}
      />
      <Checkbox
        className="col-span-2"
        label="Show on resumes"
        hint="Off keeps it in your profile, but leaves it off every resume and out of what the AI reads."
        checked={entry.onResumes}
        onChange={(event) => set({ onResumes: event.target.checked })}
      />
    </div>
  );
}

/**
 * Courses & certificates: workshops, short courses and certificates, apart
 * from degrees. Tailored resumes keep only the ones that help with the job.
 */
export function CoursesSection({ profile, update, order }: { profile: ProfileData; update: UpdateProfile; order: EntryOrder }) {
  return (
    <EntryList
      items={profile.courses}
      setItems={(change) => update((current) => ({ ...current, courses: change(current.courses) }))}
      addLabel="Add a course or certificate"
      ordering={{
        mode: order,
        save: (ids) => reorderEntries({ section: "course", ids }),
        sortByDate: () => sortEntriesByDate({ section: "course" }),
      }}
      summary={(entry) => ({
        title: entry.name.trim() || "New course",
        subtitle: entry.provider.trim(),
        meta: [courseMeta(entry), entry.onResumes ? "" : "Not on resumes"].filter(Boolean).join(" · ") || undefined,
      })}
      create={() => createCourse({})}
      remove={(entry) => removeCourse({ id: entry.id })}
      restore={(entry) => restoreCourse(entry)}
      renderForm={(entry, { onChange, autoFocus }) => <CourseForm entry={entry} onChange={onChange} autoFocus={autoFocus} />}
    />
  );
}
