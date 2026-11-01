"use client";

import { useId } from "react";

import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Tone } from "@/generated/prisma/enums";
import { TONES } from "@/lib/tones";

const TONE_OPTIONS = Object.values(Tone).map((tone) => ({ value: tone, label: TONES[tone].label }));

/**
 * "Tailoring" (E7-5, NEW-6): whether to write a cover letter, its tone, and
 * a note for the AI. Not every job asks for a letter, and skipping it saves
 * a call to the AI.
 */
export function TailoringCard({
  coverLetter,
  tone,
  note,
  onCoverLetter,
  onTone,
  onNote,
}: {
  coverLetter: boolean;
  tone: Tone;
  note: string;
  onCoverLetter: (coverLetter: boolean) => void;
  onTone: (tone: Tone) => void;
  onNote: (note: string) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <Card className="flex flex-col gap-5 py-6">
      <h2 className="text-[15px] font-medium">Tailoring</h2>
      <Toggle
        label="Write a cover letter"
        description={coverLetter ? "Written with your tailored resume." : "Only the tailored resume is written. Turn this on if the job asks for a letter."}
        checked={coverLetter}
        onCheckedChange={onCoverLetter}
      />
      {coverLetter && (
        <div className="flex flex-col gap-[9px]">
          <span id={labelId} className="text-label text-muted">
            Cover letter tone
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SegmentedControl
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              options={TONE_OPTIONS}
              value={tone}
              onValueChange={onTone}
            />
            <span id={descriptionId} className="text-meta text-muted">
              {TONES[tone].description}
            </span>
          </div>
        </div>
      )}
      <Textarea
        label="Anything I should know?"
        hint="Kept with the application as a fact for the AI. Change it later on its Job posting tab."
        rows={3}
        placeholder="e.g. I'm relocating to Amsterdam in January. Or: lean on my research work."
        value={note}
        onChange={(event) => onNote(event.target.value)}
      />
    </Card>
  );
}
