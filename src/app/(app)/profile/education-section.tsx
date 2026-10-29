"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { formatDateRange, type EducationItem, type EntryOrder, type ProfileData } from "@/lib/profile";

import {
  createEducation,
  moveEducationToCourses,
  removeCourse,
  removeEducation,
  reorderEntries,
  restoreEducation,
  saveEducation,
  sortEntriesByDate,
} from "./actions";
import { EntryList } from "./entry-list";
import { MonthYearField } from "./month-year-field";
import { useTrackSave } from "@/components/save-tracker";
import type { UpdateProfile } from "./skills-section";

function EducationForm({
  entry,
  onChange,
  onMove,
  autoFocus,
}: {
  entry: EducationItem;
  onChange: (entry: EducationItem) => void;
  onMove: () => void;
  autoFocus: boolean;
}) {
  const track = useTrackSave();
  const { flush } = useAutosave(entry, (value) => track(saveEducation(value)));
  const set = (change: Partial<EducationItem>) => onChange({ ...entry, ...change });

  return (
    <div className="grid grid-cols-2 gap-[18px]" onBlur={flush}>
      <Input
        className="col-span-2"
        label="Degree"
        placeholder="BSc Computer Science"
        value={entry.degree}
        onChange={(event) => set({ degree: event.target.value })}
        autoFocus={autoFocus}
      />
      <Input
        className="col-span-2"
        label="School"
        placeholder="Springfield University"
        value={entry.school}
        onChange={(event) => set({ school: event.target.value })}
      />
      <MonthYearField
        label="Started"
        value={{ month: entry.startMonth, year: entry.startYear }}
        onChange={({ month, year }) => set({ startMonth: month, startYear: year })}
      />
      <div className="flex flex-col gap-2.5">
        <MonthYearField
          label="Finished"
          value={{ month: entry.endMonth, year: entry.endYear }}
          onChange={({ month, year }) => set({ endMonth: month, endYear: year })}
          disabled={entry.current}
        />
        <Checkbox
          label="Still studying"
          checked={entry.current}
          onChange={(event) => set({ current: event.target.checked })}
        />
      </div>
      <Textarea
        className="col-span-2"
        label="Notes"
        placeholder="Thesis, honours, anything worth mentioning"
        rows={3}
        value={entry.notes}
        onChange={(event) => set({ notes: event.target.value })}
      />
      <p className="col-span-2 flex flex-wrap items-center gap-x-2 text-label text-muted">
        A workshop, short course or certificate rather than a degree?
        <Button variant="text" size="sm" onClick={onMove}>
          Move to courses &amp; certificates
        </Button>
      </p>
    </div>
  );
}

/**
 * Moves an entry to Courses & certificates, for the short courses that went
 * under Education before there was a place for them. Undo puts it back where it was.
 */
function useMoveToCourses(profile: ProfileData, update: UpdateProfile, order: EntryOrder) {
  const track = useTrackSave();
  // For the toast's Undo, which runs after later changes.
  const latest = useRef(profile);
  useEffect(() => {
    latest.current = profile;
  });
  return async (entry: EducationItem, index: number) => {
    // Saves what's typed first, so the course gets it.
    const saved = await track(saveEducation(entry));
    if (!saved.ok) return toast(saved.error);
    const result = await track(moveEducationToCourses({ id: entry.id }));
    if (!result.ok) return toast(result.error);
    const { education, course } = result.data;
    update((current) => ({
      ...current,
      education: current.education.filter((item) => item.id !== education.id),
      courses: order === "manual" ? [course, ...current.courses] : [...current.courses, course],
    }));

    const title = education.degree.trim() || "New entry";
    toast(`Moved “${title}” to Courses & certificates.`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const restored = await track(restoreEducation(education));
          if (!restored.ok) return toast(restored.error);
          const removed = await track(removeCourse({ id: course.id }));
          if (!removed.ok) toast(removed.error);
          const list = latest.current.education.toSpliced(Math.min(index, latest.current.education.length), 0, restored.data);
          update((current) => ({
            ...current,
            education: list,
            courses: current.courses.filter((item) => item.id !== course.id),
          }));
          // Back in its place in an order set by hand, not last.
          if (order === "manual") void track(reorderEntries({ section: "education", ids: list.map((item) => item.id) }));
          toast(`Put back “${title}”.`);
        },
      },
    });
  };
}

/** Education (PRO-7): degrees and longer programmes. Shorter courses have their own section. */
export function EducationSection({ profile, update, order }: { profile: ProfileData; update: UpdateProfile; order: EntryOrder }) {
  const moveToCourses = useMoveToCourses(profile, update, order);
  return (
    <EntryList
      items={profile.education}
      setItems={(change) => update((current) => ({ ...current, education: change(current.education) }))}
      addLabel="Add education"
      ordering={{
        mode: order,
        save: (ids) => reorderEntries({ section: "education", ids }),
        sortByDate: () => sortEntriesByDate({ section: "education" }),
      }}
      summary={(entry) => ({
        title: entry.degree.trim() || "New entry",
        subtitle: entry.school.trim(),
        meta: formatDateRange(entry),
      })}
      create={() => createEducation({})}
      remove={(entry) => removeEducation({ id: entry.id })}
      restore={(entry) => restoreEducation(entry)}
      renderForm={(entry, { onChange, autoFocus }) => (
        <EducationForm
          entry={entry}
          onChange={onChange}
          onMove={() => void moveToCourses(entry, profile.education.findIndex((item) => item.id === entry.id))}
          autoFocus={autoFocus}
        />
      )}
    />
  );
}
