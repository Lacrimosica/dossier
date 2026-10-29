import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseItem, ProfileData } from "@/lib/profile";

import { createCourse, saveCourse } from "./actions";
import { CoursesSection } from "./courses-section";

vi.mock("./actions", () => ({
  createCourse: vi.fn(),
  saveCourse: vi.fn(async () => ({ ok: true, data: null })),
  removeCourse: vi.fn(async () => ({ ok: true, data: null })),
  restoreCourse: vi.fn(),
  reorderEntries: vi.fn(async () => ({ ok: true, data: null })),
  sortEntriesByDate: vi.fn(),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));

const workshop: CourseItem = {
  id: "c1",
  name: "UX Writing Workshop",
  provider: "Content Design London",
  duration: "3 weekend sessions",
  link: "",
  notes: "",
  onResumes: true,
  startYear: 2021,
  startMonth: 10,
  endYear: null,
  endMonth: null,
};
const bootcamp: CourseItem = {
  ...workshop,
  id: "c2",
  name: "Data bootcamp",
  provider: "Le Wagon",
  duration: "",
  startYear: 2024,
  startMonth: 2,
  endYear: 2024,
  endMonth: 3,
  onResumes: false,
};

let latest: ProfileData;
function Harness() {
  const [state, setState] = useState<ProfileData>({
    basics: {} as ProfileData["basics"],
    skills: [],
    languages: [],
    experience: [],
    projects: [],
    education: [],
    courses: [bootcamp, workshop],
    publications: [],
    references: [],
    facts: [],
    photo: null,
  });
  useEffect(() => {
    latest = state;
  });
  return <CoursesSection profile={state} update={(change) => setState(change)} order="date" />;
}

const header = (name: RegExp | string, expanded = false) => screen.getByRole("button", { name, expanded });

describe("CoursesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarises closed cards: name, provider, a single month or a range, the length, and whether it's on resumes", () => {
    render(<Harness />);
    expect(header(/UX Writing Workshop/)).toHaveTextContent("Content Design London");
    expect(header(/UX Writing Workshop/)).toHaveTextContent("Oct 2021 · 3 weekend sessions");
    expect(header(/Data bootcamp/)).toHaveTextContent("Feb 2024 – Mar 2024 · Not on resumes");
    expect(screen.getByText("Newest first. Drag an entry or use its arrows to set your own order.")).toBeInTheDocument();
  });

  it("edits the fields and autosaves them, with no 'Present' for a course", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/UX Writing Workshop/));
    expect(screen.getByLabelText("Course or certificate")).toHaveValue("UX Writing Workshop");
    expect(screen.getByLabelText("Provider")).toHaveValue("Content Design London");
    expect(screen.getByLabelText("When year")).toHaveValue("2021");
    expect(screen.getByLabelText("Until year")).toHaveValue("");
    expect(screen.queryByRole("checkbox", { name: /Still/ })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Length/));
    await user.type(screen.getByLabelText(/^Length/), "16 hours");
    await user.type(screen.getByLabelText(/^Link/), "example.com/cert");
    await user.click(screen.getByRole("checkbox", { name: "Show on resumes" }));
    await waitFor(
      () => expect(saveCourse).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1", duration: "16 hours", link: "example.com/cert", onResumes: false })),
      { timeout: 2000 },
    );
    expect(header(/UX Writing Workshop/, true)).toHaveTextContent("Oct 2021 · 16 hours · Not on resumes");
  });

  it("adds a course and opens it", async () => {
    const user = userEvent.setup();
    vi.mocked(createCourse).mockResolvedValue({ ok: true, data: { ...workshop, id: "c3", name: "", provider: "", duration: "", startYear: null, startMonth: null } });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "+ Add a course or certificate" }));
    expect(screen.getByLabelText("Course or certificate")).toHaveFocus();
    expect(latest.courses.map((entry) => entry.id)).toEqual(["c2", "c1", "c3"]);
  });
});
