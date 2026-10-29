import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileData } from "@/lib/profile";

import { toast } from "@/components/toast";

import { createReference, moveEducationToCourses, removeCourse, restoreEducation, saveEducation, saveReference } from "./actions";
import { EducationSection } from "./education-section";
import { ReferencesSection } from "./references-section";

vi.mock("./actions", () => ({
  createEducation: vi.fn(),
  saveEducation: vi.fn(async () => ({ ok: true, data: null })),
  removeEducation: vi.fn(async () => ({ ok: true, data: null })),
  restoreEducation: vi.fn(),
  moveEducationToCourses: vi.fn(),
  removeCourse: vi.fn(async () => ({ ok: true, data: null })),
  reorderEntries: vi.fn(async () => ({ ok: true, data: null })),
  sortEntriesByDate: vi.fn(),
  createReference: vi.fn(),
  saveReference: vi.fn(async () => ({ ok: true, data: null })),
  removeReference: vi.fn(async () => ({ ok: true, data: null })),
  restoreReference: vi.fn(),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));

const profile: ProfileData = {
  basics: {} as ProfileData["basics"],
  skills: [],
  languages: [],
  experience: [],
  projects: [],
  education: [
    { id: "d1", degree: "MSc Design for Interaction", school: "TU Delft", notes: "", startYear: 2013, startMonth: null, endYear: 2015, endMonth: null, current: false },
  ],
  courses: [],
  publications: [],
  references: [
    { id: "r1", name: "John Doe", relation: "Former manager", company: "Northwind Logistics", email: "john.doe@example.com", phone: "" },
  ],
  facts: [],
  photo: null,
};

let latest: ProfileData;
function Harness({ section }: { section: "education" | "references" }) {
  const [state, setState] = useState(profile);
  useEffect(() => {
    latest = state;
  });
  const update = (change: (profile: typeof state) => typeof state) => setState(change);
  return section === "education" ? (
    <EducationSection profile={state} update={update} order="date" />
  ) : (
    <ReferencesSection profile={state} update={update} />
  );
}

describe("Education", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarises an entry: degree, school and dates", () => {
    render(<Harness section="education" />);
    const card = screen.getByRole("button", { name: /MSc Design for Interaction/ });
    expect(card).toHaveTextContent("TU Delft");
    expect(card).toHaveTextContent("2013 – 2015");
    expect(screen.getByRole("button", { name: "+ Add education" })).toBeInTheDocument();
  });

  it("edits the fields, with 'Still studying' in place of the end date", async () => {
    const user = userEvent.setup();
    render(<Harness section="education" />);
    await user.click(screen.getByRole("button", { name: /MSc Design/ }));
    expect(screen.getByLabelText("Degree")).toHaveValue("MSc Design for Interaction");
    expect(screen.getByLabelText("School")).toHaveValue("TU Delft");
    expect(screen.getByLabelText("Notes")).toHaveAttribute("placeholder", "Thesis, honours, anything worth mentioning");

    await user.click(screen.getByLabelText("Still studying"));
    expect(screen.getByLabelText("Finished year")).toBeDisabled();
    await waitFor(() => expect(saveEducation).toHaveBeenCalledWith(expect.objectContaining({ id: "d1", current: true })), { timeout: 2000 });
    expect(screen.getByRole("button", { name: /MSc Design/, expanded: true })).toHaveTextContent("2013 – Present");
  });
});

describe("Moving an entry to Courses & certificates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves what's typed, moves it, and puts it back with Undo", async () => {
    const user = userEvent.setup();
    const degree = profile.education[0];
    const course = { id: "c1", name: degree.degree, provider: degree.school, duration: "", link: "", notes: "", onResumes: true, startYear: 2013, startMonth: null, endYear: 2015, endMonth: null };
    vi.mocked(moveEducationToCourses).mockResolvedValue({ ok: true, data: { education: degree, course } });
    vi.mocked(restoreEducation).mockResolvedValue({ ok: true, data: degree });
    render(<Harness section="education" />);
    await user.click(screen.getByRole("button", { name: /MSc Design/ }));
    await user.click(screen.getByRole("button", { name: "Move to courses & certificates" }));

    expect(saveEducation).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
    expect(moveEducationToCourses).toHaveBeenCalledWith({ id: "d1" });
    await waitFor(() => expect(latest.education).toEqual([]));
    expect(latest.courses).toEqual([course]);
    expect(toast).toHaveBeenCalledWith("Moved “MSc Design for Interaction” to Courses & certificates.", { action: expect.objectContaining({ label: "Undo" }) });

    const [, options] = vi.mocked(toast).mock.calls.at(-1)!;
    await options!.action!.onClick();
    expect(restoreEducation).toHaveBeenCalledWith(degree);
    expect(removeCourse).toHaveBeenCalledWith({ id: "c1" });
    await waitFor(() => expect(latest.education).toEqual([degree]));
    expect(latest.courses).toEqual([]);
  });
});

describe("References", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarises a reference: name, relation · company and email", () => {
    render(<Harness section="references" />);
    const card = screen.getByRole("button", { name: /John Doe/ });
    expect(card).toHaveTextContent("Former manager · Northwind Logistics");
    expect(card).toHaveTextContent("john.doe@example.com");
  });

  it("adds a reference and saves what you type", async () => {
    const user = userEvent.setup();
    vi.mocked(createReference).mockResolvedValue({ ok: true, data: { id: "r2", name: "", relation: "", company: "", email: "", phone: "" } });
    render(<Harness section="references" />);
    await user.click(screen.getByRole("button", { name: "+ Add a reference" }));
    expect(await screen.findByRole("button", { name: /New reference/, expanded: true })).toBeInTheDocument();
    for (const label of ["Name", "How you know them", "Company", "Email", "Phone"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.type(screen.getByLabelText("Name"), "Jane Doe");
    await waitFor(() => expect(saveReference).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r2", name: "Jane Doe" })), { timeout: 2000 });
  });
});
