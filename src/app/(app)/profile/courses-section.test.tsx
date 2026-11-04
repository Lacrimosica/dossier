import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseItem, ProfileData } from "@/lib/profile";

import { toast } from "@/components/toast";

import { createCourse, saveCourse, setCourseProvider } from "./actions";
import { CoursesSection } from "./courses-section";

vi.mock("./actions", () => ({
  createCourse: vi.fn(),
  saveCourse: vi.fn(async () => ({ ok: true, data: null })),
  setCourseProvider: vi.fn(async ({ id }: { id: string }) => ({ ok: true, data: [id] })),
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
function Harness({ courses = [bootcamp, workshop] }: { courses?: CourseItem[] }) {
  const [state, setState] = useState<ProfileData>({
    basics: {} as ProfileData["basics"],
    skills: [],
    languages: [],
    interests: [],
    experience: [],
    experienceGroups: [],
    projects: [],
    education: [],
    courses,
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

  describe("a provider on several courses", () => {
    // Years apart, with Le Wagon's in between: they stay on the timeline.
    const second: CourseItem = { ...workshop, id: "c3", name: "Content strategy", provider: "content design london", startYear: 2019 };

    it("says so, keeps the courses in date order, and changes all of them when asked", async () => {
      const user = userEvent.setup();
      vi.mocked(setCourseProvider).mockResolvedValueOnce({ ok: true, data: ["c1", "c3"] });
      render(<Harness courses={[bootcamp, workshop, second]} />);
      expect(screen.queryByRole("group", { name: /courses at/ })).not.toBeInTheDocument();

      await user.click(header(/UX Writing Workshop/));
      expect(screen.getByText("Also on 1 other course.")).toBeInTheDocument();
      const provider = screen.getByLabelText("Provider");
      await user.clear(provider);
      await user.type(provider, "Content Design Ltd{Enter}");
      expect(setCourseProvider).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Change all 2" }));
      expect(setCourseProvider).toHaveBeenCalledWith({ id: "c1", provider: "Content Design Ltd", everywhere: true });
      expect(latest.courses.map((course) => course.provider)).toEqual(["Le Wagon", "Content Design Ltd", "Content Design Ltd"]);
      expect(latest.courses.map((course) => course.id)).toEqual(["c2", "c1", "c3"]);
      expect(toast).toHaveBeenCalledWith("Changed the provider of 2 courses.");
    });

    it("changes only the one course, or nothing on Cancel", async () => {
      const user = userEvent.setup();
      render(<Harness courses={[bootcamp, workshop, second]} />);
      await user.click(header(/UX Writing Workshop/));
      await user.clear(screen.getByLabelText("Provider"));
      await user.type(screen.getByLabelText("Provider"), "Content Design Ltd{Enter}");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(setCourseProvider).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Provider")).toHaveValue("Content Design London");

      await user.clear(screen.getByLabelText("Provider"));
      await user.type(screen.getByLabelText("Provider"), "Content Design Ltd{Enter}");
      await user.click(screen.getByRole("button", { name: "Only this course" }));
      expect(setCourseProvider).toHaveBeenCalledWith({ id: "c1", provider: "Content Design Ltd", everywhere: false });
      expect(latest.courses.find((course) => course.id === "c3")?.provider).toBe("content design london");
    });

    it("saves a provider nobody else has without asking, when the field is left", async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(header(/Data bootcamp/));
      const provider = screen.getByLabelText("Provider");
      await user.clear(provider);
      await user.type(provider, "Le Wagon Berlin");
      expect(setCourseProvider).not.toHaveBeenCalled();
      await user.tab();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(setCourseProvider).toHaveBeenCalledWith({ id: "c2", provider: "Le Wagon Berlin", everywhere: false });
    });
  });

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
