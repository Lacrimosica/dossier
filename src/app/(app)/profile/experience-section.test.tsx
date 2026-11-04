import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import type { EntryOrder, ExperienceItem, GroupItem, ProfileData } from "@/lib/profile";

import {
  attachNewSkill,
  createExperience,
  createExperienceGroup,
  removeExperience,
  removeExperienceGroup,
  renameExperienceGroup,
  reorderExperienceGroups,
  restoreExperienceGroup,
  setExperienceGroup,
  reorderEntries,
  restoreExperience,
  saveExperience,
  setExperienceCompany,
  setExperienceSkill,
  sortEntriesByDate,
  unifyCompanyName,
  keepCompaniesApart,
} from "./actions";
import { ExperienceSection } from "./experience-section";
import { parseYear } from "./month-year-field";

vi.mock("./actions", () => ({
  attachNewSkill: vi.fn(),
  setExperienceSkill: vi.fn(async () => ({ ok: true, data: null })),
  createExperience: vi.fn(),
  createExperienceGroup: vi.fn(),
  renameExperienceGroup: vi.fn(async () => ({ ok: true, data: null })),
  reorderExperienceGroups: vi.fn(async () => ({ ok: true, data: null })),
  removeExperienceGroup: vi.fn(),
  restoreExperienceGroup: vi.fn(),
  setExperienceGroup: vi.fn(async () => ({ ok: true, data: null })),
  saveExperience: vi.fn(async () => ({ ok: true, data: null })),
  setExperienceCompany: vi.fn(async ({ id }: { id: string }) => ({ ok: true, data: [id] })),
  removeExperience: vi.fn(async () => ({ ok: true, data: null })),
  restoreExperience: vi.fn(),
  reorderEntries: vi.fn(async () => ({ ok: true, data: null })),
  sortEntriesByDate: vi.fn(),
  unifyCompanyName: vi.fn(),
  keepCompaniesApart: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));

const northwind: ExperienceItem = {
  id: "e1",
  role: "Senior Product Designer",
  company: "Northwind Logistics",
  location: "Rotterdam",
  bullets: "Led the redesign",
  startYear: 2021,
  startMonth: 3,
  endYear: null,
  endMonth: null,
  current: true,
  skillIds: ["s1"],
  groupId: null,
  careerBreak: false,
};
const fieldnote: ExperienceItem = { ...northwind, id: "e2", role: "Product Designer", company: "Fieldnote", current: false, startYear: 2018, startMonth: 6, endYear: 2021, endMonth: 2, skillIds: [] };

let latest: ProfileData;
function Harness({
  order = "date",
  experience = [northwind, fieldnote],
  groups = [],
}: {
  order?: EntryOrder;
  experience?: ExperienceItem[];
  groups?: GroupItem[];
}) {
  const [state, setState] = useState<ProfileData>({
    basics: {} as ProfileData["basics"],
    skills: [
      { id: "s1", name: "Design systems" },
      { id: "s2", name: "Figma" },
    ],
    languages: [],
    interests: [],
    experience,
    experienceGroups: groups,
    projects: [],
    education: [],
    courses: [],
    publications: [],
    references: [],
    facts: [],
    photo: null,
  });
  useEffect(() => {
    latest = state;
  });
  return <ExperienceSection order={order} profile={state} update={(change) => setState(change)} />;
}

const header = (name: RegExp | string) => screen.getByRole("button", { name, expanded: false });

describe("ExperienceSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarises closed cards: role, company · location, dates and skills", () => {
    render(<Harness />);
    const card = screen.getByRole("button", { name: /Senior Product Designer/, expanded: false });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(card).toHaveTextContent("Northwind Logistics · Rotterdam");
    expect(card).toHaveTextContent("Mar 2021 – Present");
    expect(card).toHaveTextContent("Design systems");
    expect(screen.getByRole("button", { name: /Product Designer.*Fieldnote/ })).toHaveTextContent("Jun 2018 – Feb 2021");
  });

  it("opens one card at a time", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    expect(screen.getByLabelText("Role")).toHaveValue("Senior Product Designer");
    expect(screen.getByLabelText("Started month")).toHaveValue("3");
    expect(screen.getByLabelText("Started year")).toHaveValue("2021");
    expect(screen.getByLabelText("I still work here")).toBeChecked();
    expect(screen.getByLabelText("Ended year")).toBeDisabled();

    await user.click(header(/Product Designer.*Fieldnote/));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(screen.getByLabelText("Role")).toHaveValue("Product Designer");
  });

  it("lets the location be left empty, e.g. for remote work (.scratch/optional-role-fields)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    const location = screen.getByLabelText("Location");
    expect(location).toHaveAccessibleDescription(/Optional\. Leave it empty for remote work/);
    await user.clear(location);
    await waitFor(() => expect(saveExperience).toHaveBeenLastCalledWith(expect.objectContaining({ location: "" })), { timeout: 2000 });
  });

  it("autosaves edits and keeps a half-typed year out of the saved date", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Product Designer.*Fieldnote/));
    const year = screen.getByLabelText("Started year");
    await user.clear(year);
    await user.type(year, "201");
    await waitFor(() => expect(saveExperience).toHaveBeenLastCalledWith(expect.objectContaining({ id: "e2", startYear: null })), { timeout: 2000 });
    await user.type(year, "7");
    await waitFor(() => expect(saveExperience).toHaveBeenLastCalledWith(expect.objectContaining({ id: "e2", startYear: 2017, startMonth: 6 })), { timeout: 2000 });
  });

  it("adds a blank role and opens it with the cursor in Role", async () => {
    const user = userEvent.setup();
    vi.mocked(createExperience).mockResolvedValue({ ok: true, data: { ...northwind, id: "e3", role: "", company: "", location: "", bullets: "", startYear: null, startMonth: null, current: false, skillIds: [] } });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "+ Add a role" }));
    expect(await screen.findByRole("button", { name: /New role/, expanded: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveFocus();
  });

  it("removes a role at once and puts it back from the toast's Undo", async () => {
    const user = userEvent.setup();
    vi.mocked(restoreExperience).mockResolvedValue({ ok: true, data: northwind });
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeExperience).toHaveBeenCalledWith({ id: "e1" });
    expect(latest.experience.map((entry) => entry.id)).toEqual(["e2"]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Removed “Senior Product Designer”.", expect.anything()));

    const { action } = vi.mocked(toast).mock.calls.at(-1)![1]!;
    await act(async () => action!.onClick());
    expect(restoreExperience).toHaveBeenCalledWith(northwind);
    expect(latest.experience.map((entry) => entry.id)).toEqual(["e1", "e2"]);
  });

  it("shows the empty state", () => {
    function Empty() {
      const [state, setState] = useState<ProfileData>({ basics: {} as ProfileData["basics"], skills: [], languages: [], interests: [], experience: [], experienceGroups: [], projects: [], education: [], courses: [], publications: [], references: [], facts: [], photo: null });
      return <ExperienceSection order="date" profile={state} update={(change) => setState(change)} />;
    }
    render(<Empty />);
    expect(screen.getByText("Nothing here yet. Add your first one below.")).toBeInTheDocument();
  });
});

describe("year field", () => {
  it("only counts four-digit plausible years", () => {
    expect(parseYear("2021")).toBe(2021);
    expect(parseYear(" 2021 ")).toBe(2021);
    expect(parseYear("202")).toBeNull();
    expect(parseYear("21")).toBeNull();
    expect(parseYear("1850")).toBeNull();
    expect(parseYear("abcd")).toBeNull();
  });

  it("asks for a four-digit year once you leave a half-typed one", async () => {
    render(<Harness />);
    fireEvent.click(header(/Product Designer.*Fieldnote/));
    const year = screen.getByLabelText("Started year");
    fireEvent.change(year, { target: { value: "20" } });
    expect(year).not.toHaveAccessibleDescription();
    fireEvent.blur(year);
    expect(year).toHaveAccessibleDescription("Enter a four-digit year, like 2021.");
    expect(year).toBeInvalid();
  });
});

describe("skills used in a role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows every profile skill as a toggle, with how many are attached", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    const group = screen.getByRole("group", { name: "Skills you used here" });
    expect(group).toHaveTextContent("1 of 2 attached");
    expect(screen.getByRole("button", { name: "Design systems", pressed: true })).toHaveTextContent("✓ Design systems");
    expect(screen.getByRole("button", { name: "Figma", pressed: false })).toBeInTheDocument();
  });

  it("attaches and detaches a skill right away, without autosaving the role", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    await user.click(screen.getByRole("button", { name: "Figma" }));
    expect(setExperienceSkill).toHaveBeenCalledWith({ experienceId: "e1", skillId: "s2", attached: true });
    expect(latest.experience[0].skillIds).toEqual(["s1", "s2"]);
    expect(screen.getByRole("group", { name: "Skills you used here" })).toHaveTextContent("2 of 2 attached");

    await user.click(screen.getByRole("button", { name: "Design systems" }));
    expect(setExperienceSkill).toHaveBeenLastCalledWith({ experienceId: "e1", skillId: "s1", attached: false });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(saveExperience).not.toHaveBeenCalled();
  });

  it("adds a new skill to the profile and attaches it in one step", async () => {
    const user = userEvent.setup();
    vi.mocked(attachNewSkill).mockResolvedValue({ ok: true, data: { added: true, skill: { id: "s3", name: "Accessibility" } } });
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    await user.type(screen.getByLabelText("Add a new skill to this role"), "Accessibility{Enter}");
    expect(attachNewSkill).toHaveBeenCalledWith({ experienceId: "e1", name: "Accessibility" });
    await waitFor(() => expect(latest.skills.map((skill) => skill.name)).toContain("Accessibility"));
    expect(latest.experience[0].skillIds).toEqual(["s1", "s3"]);
  });

  it("attaches an existing skill when its name is typed in another case", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Senior Product Designer/));
    await user.type(screen.getByLabelText("Add a new skill to this role"), "figma{Enter}");
    expect(attachNewSkill).not.toHaveBeenCalled();
    expect(setExperienceSkill).toHaveBeenCalledWith({ experienceId: "e1", skillId: "s2", attached: true });
  });
});

describe("reordering roles (E4-9)", () => {
  const titles = () => latest.experience.map((entry) => entry.role);

  it("moves a role with its arrows, saves the order and says so", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/^Newest first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move “Senior Product Designer” up" })).toHaveAttribute("aria-disabled", "true");

    const down = screen.getByRole("button", { name: "Move “Senior Product Designer” down" });
    await user.click(down);
    expect(titles()).toEqual(["Product Designer", "Senior Product Designer"]);
    expect(reorderEntries).toHaveBeenLastCalledWith({ section: "experience", ids: ["e2", "e1"] });
    expect(screen.getByText("“Senior Product Designer” moved to position 2 of 2.")).toHaveAttribute("role", "status");
    expect(screen.getByText("In your own order.")).toBeInTheDocument();
    // Focus stays on the button, now at the end and marked unavailable.
    expect(down).toHaveFocus();
    expect(down).toHaveAttribute("aria-disabled", "true");
  });

  it("goes back to date order", async () => {
    const user = userEvent.setup();
    vi.mocked(sortEntriesByDate).mockResolvedValueOnce({ ok: true, data: ["e1", "e2"] });
    render(<Harness order="manual" />);
    await user.click(screen.getByRole("button", { name: "Move “Senior Product Designer” down" }));
    await user.click(screen.getByRole("button", { name: "Sort by date" }));
    expect(sortEntriesByDate).toHaveBeenCalledWith({ section: "experience" });
    expect(titles()).toEqual(["Senior Product Designer", "Product Designer"]);
    expect(screen.getByText(/^Newest first/)).toBeInTheDocument();
  });

  it("puts a new role first in an order set by hand", async () => {
    const user = userEvent.setup();
    vi.mocked(createExperience).mockResolvedValueOnce({ ok: true, data: { ...fieldnote, id: "e3", role: "", company: "", startYear: null } });
    render(<Harness order="manual" />);
    await user.click(screen.getByRole("button", { name: "+ Add a role" }));
    expect(latest.experience.map((entry) => entry.id)).toEqual(["e3", "e1", "e2"]);
  });

  it("puts things back when the order can't be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(reorderEntries).mockResolvedValueOnce({ ok: false, error: "The list changed in the meantime. Reload the page and try again." });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Move “Product Designer” up" }));
    expect(titles()).toEqual(["Senior Product Designer", "Product Designer"]);
    expect(toast).toHaveBeenCalledWith("The list changed in the meantime. Reload the page and try again.");
  });
});

describe("roles at one company", () => {
  beforeEach(() => vi.clearAllMocks());

  // Promoted at Northwind; the earlier role's dates put Fieldnote between the two.
  const junior: ExperienceItem = { ...northwind, id: "e3", role: "Product Designer II", company: "northwind logistics", current: false, startYear: 2016, endYear: 2018, endMonth: 5 };

  it("shows them together, with the company once, and moves them as one", async () => {
    const user = userEvent.setup();
    render(<Harness experience={[northwind, fieldnote, junior]} />);
    const group = screen.getByRole("group", { name: "2 roles at Northwind Logistics" });
    expect(group).toHaveTextContent(/Senior Product Designer.*Product Designer II/);
    expect(screen.getAllByRole("button", { expanded: false }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Senior Product Designer"),
      expect.stringContaining("Product Designer II"),
      expect.stringContaining("Fieldnote"),
    ]);

    // Down from the company's last role takes the whole company past Fieldnote.
    await user.click(screen.getByRole("button", { name: "Move “Product Designer II” down" }));
    expect(reorderEntries).toHaveBeenLastCalledWith({ section: "experience", ids: ["e2", "e1", "e3"] });
  });

  it("offers a company's names as you type another role's", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(header(/Product Designer.*Fieldnote/));
    const company = screen.getByLabelText("Company");
    const options = [...document.getElementById(company.getAttribute("list")!)!.querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(["Northwind Logistics"]);
  });

  it("offers to give spellings of one company one name", async () => {
    const user = userEvent.setup();
    const shouting = { ...junior, company: "NORTHWIND LOGISTICS B.V." };
    vi.mocked(unifyCompanyName).mockResolvedValueOnce({ ok: true, data: ["e3"] });
    render(<Harness experience={[northwind, fieldnote, shouting]} />);
    expect(screen.getByRole("note")).toHaveTextContent("“Northwind Logistics” and “NORTHWIND LOGISTICS B.V.” look like the same company.");

    await user.click(screen.getByRole("button", { name: "Use “Northwind Logistics”" }));
    expect(unifyCompanyName).toHaveBeenCalledWith({ names: ["Northwind Logistics", "NORTHWIND LOGISTICS B.V."], to: "Northwind Logistics" });
    expect(latest.experience.find((role) => role.id === "e3")?.company).toBe("Northwind Logistics");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "2 roles at Northwind Logistics" })).toBeInTheDocument();
  });

  it("saves a role's company when the field is left, even when it leaves its company's box", async () => {
    const user = userEvent.setup();
    render(<Harness experience={[northwind, fieldnote]} />);
    await user.click(header(/Product Designer.*Fieldnote/));
    const company = screen.getByLabelText("Company");
    await user.clear(company);
    await user.type(company, "Northwind Logistics");
    expect(setExperienceCompany).not.toHaveBeenCalled();
    await user.tab();
    expect(setExperienceCompany).toHaveBeenCalledWith({ id: "e2", company: "Northwind Logistics", everywhere: false });
    expect(screen.getByRole("group", { name: "2 roles at Northwind Logistics" })).toBeInTheDocument();
    expect(latest.experience.find((role) => role.id === "e2")?.company).toBe("Northwind Logistics");
  });

  it("asks before changing a company that other roles have, and changes it on all of them", async () => {
    const user = userEvent.setup();
    vi.mocked(setExperienceCompany).mockResolvedValueOnce({ ok: true, data: ["e1", "e3"] });
    render(<Harness experience={[northwind, fieldnote, junior]} />);
    await user.click(header(/Product Designer II/));
    const company = screen.getByLabelText("Company");
    await user.clear(company);
    await user.type(company, "Northwind Group{Enter}");

    const dialog = screen.getByRole("alertdialog", { name: "Change the company of all 2 roles?" });
    expect(dialog).toHaveTextContent("Change it to “Northwind Group” on all of them");
    expect(setExperienceCompany).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Change all 2" }));

    expect(setExperienceCompany).toHaveBeenCalledWith({ id: "e3", company: "Northwind Group", everywhere: true });
    expect(latest.experience.map((role) => role.company)).toEqual(["Northwind Group", "Fieldnote", "Northwind Group"]);
    expect(screen.getByRole("group", { name: "2 roles at Northwind Group" })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Changed the company of 2 roles.");
  });

  it("changes only the one role, or nothing on Cancel", async () => {
    const user = userEvent.setup();
    render(<Harness experience={[northwind, fieldnote, junior]} />);
    await user.click(header(/Product Designer II/));
    const company = screen.getByLabelText("Company");
    await user.clear(company);
    await user.type(company, "Northwind Group{Enter}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setExperienceCompany).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Company")).toHaveValue("northwind logistics");

    await user.clear(screen.getByLabelText("Company"));
    await user.type(screen.getByLabelText("Company"), "Northwind Group{Enter}");
    await user.click(screen.getByRole("button", { name: "Only this role" }));
    expect(setExperienceCompany).toHaveBeenCalledWith({ id: "e3", company: "Northwind Group", everywhere: false });
    expect(latest.experience.map((role) => role.company)).toEqual(["Northwind Logistics", "Fieldnote", "Northwind Group"]);
  });

  it("stops offering when they're different companies", async () => {
    const user = userEvent.setup();
    render(<Harness experience={[northwind, { ...fieldnote, company: "Northwind Logistics Ltd" }]} />);
    await user.click(screen.getByRole("button", { name: "They’re different companies" }));
    expect(keepCompaniesApart).toHaveBeenCalledWith({ fingerprint: "northwind logistics\nnorthwind logistics ltd" });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("ExperienceSection with groups (.scratch/experience-groups)", () => {
  beforeEach(() => vi.clearAllMocks());

  const tech: GroupItem = { id: "g-tech", name: "Tech" };
  const nonprofit: GroupItem = { id: "g-np", name: "Esperienze nel terzo settore" };
  const volunteer: ExperienceItem = { ...fieldnote, id: "e3", role: "Volunteer coordinator", company: "Caritas", startYear: 2016, endYear: 2017 };
  const grouped = () => (
    <Harness
      groups={[nonprofit, tech]}
      experience={[{ ...northwind, groupId: tech.id }, { ...fieldnote, groupId: tech.id }, { ...volunteer, groupId: nonprofit.id }]}
    />
  );
  const region = (name: string) => screen.getByRole("region", { name });

  it("offers groups without showing a Group field until there is one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/each group gets its own heading on your resumes/)).toBeInTheDocument();
    await user.click(header(/Senior Product Designer/));
    expect(screen.queryByLabelText("Group")).not.toBeInTheDocument();
  });

  it("shows each group's roles under it, and the roles without one after them", () => {
    render(
      <Harness groups={[nonprofit, tech]} experience={[{ ...northwind, groupId: tech.id }, { ...fieldnote, groupId: "removed" }, { ...volunteer, groupId: nonprofit.id }]} />,
    );
    const regions = screen.getAllByRole("region").map((element) => element.getAttribute("aria-label") ?? element.textContent?.slice(0, 14));
    expect(regions).toEqual(["Group: Esperienze nel terzo settore", "Group: Tech", "Not in a group"]);
    expect(region("Group: Tech")).toHaveTextContent("Senior Product Designer");
    expect(region("Group: Esperienze nel terzo settore")).toHaveTextContent("Volunteer coordinator");
    // A role whose group is gone counts as having none.
    expect(screen.getByRole("region", { name: "Not in a group" })).toHaveTextContent("Fieldnote");
  });

  it("adds a role to the group it's added under", async () => {
    const user = userEvent.setup();
    vi.mocked(createExperience).mockResolvedValue({ ok: true, data: { ...northwind, id: "e4", role: "", groupId: nonprofit.id } });
    render(grouped());
    await user.click(within(region("Group: Esperienze nel terzo settore")).getByRole("button", { name: "+ Add a role" }));
    expect(createExperience).toHaveBeenCalledWith({ groupId: nonprofit.id });
    expect(await within(region("Group: Esperienze nel terzo settore")).findByRole("button", { name: /New role/, expanded: true })).toBeInTheDocument();
  });

  it("moves a role to another group from its Group field", async () => {
    const user = userEvent.setup();
    render(grouped());
    await user.click(header(/Volunteer coordinator/));
    await user.selectOptions(screen.getByLabelText("Group"), "Tech");
    expect(setExperienceGroup).toHaveBeenCalledWith({ id: "e3", groupId: tech.id });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Moved “Volunteer coordinator” to “Tech”."));
    expect(region("Group: Tech")).toHaveTextContent("Volunteer coordinator");
    expect(latest.experience.find((role) => role.id === "e3")?.groupId).toBe(tech.id);
  });

  it("turns a role into a career break: no company or place, and a hint about where it goes", async () => {
    const user = userEvent.setup();
    render(grouped());
    await user.click(header(/Volunteer coordinator/));
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    await user.click(screen.getByLabelText("This is a career break"));

    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Volunteer coordinator");
    expect(screen.getByText(/the group whose timeline it interrupts/)).toBeInTheDocument();
    await waitFor(() => expect(saveExperience).toHaveBeenLastCalledWith(expect.objectContaining({ id: "e3", careerBreak: true })), { timeout: 2000 });

    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: /^Career break/, expanded: false })).toHaveTextContent("A break, not counted as experience");
  });

  it("adds a group with its name field focused, and autosaves the name", async () => {
    const user = userEvent.setup();
    vi.mocked(createExperienceGroup).mockResolvedValue({ ok: true, data: { id: "g-new", name: "" } });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add a group" }));
    const name = await screen.findByLabelText("Group name");
    expect(name).toHaveFocus();
    // The roles it had are now without a group, until one is picked.
    expect(region("Not in a group")).toHaveTextContent("Senior Product Designer");

    await user.type(name, "Volunteering");
    await waitFor(() => expect(renameExperienceGroup).toHaveBeenLastCalledWith({ id: "g-new", name: "Volunteering" }), { timeout: 2000 });
    expect(latest.experienceGroups).toEqual([{ id: "g-new", name: "Volunteering" }]);
  });

  it("reorders groups, and saves a reorder within a group as the whole section's order", async () => {
    const user = userEvent.setup();
    render(grouped());
    await user.click(screen.getByRole("button", { name: "Move the group “Esperienze nel terzo settore” down" }));
    expect(reorderExperienceGroups).toHaveBeenCalledWith({ ids: [tech.id, nonprofit.id] });
    expect(latest.experienceGroups.map((group) => group.id)).toEqual([tech.id, nonprofit.id]);

    await user.click(screen.getByRole("button", { name: "Move “Product Designer” up" }));
    expect(reorderEntries).toHaveBeenLastCalledWith({ section: "experience", ids: ["e2", "e1", "e3"] });
  });

  it("removes a group but keeps its roles, and Undo puts it back with them", async () => {
    const user = userEvent.setup();
    vi.mocked(removeExperienceGroup).mockResolvedValue({ ok: true, data: ["e3"] });
    vi.mocked(restoreExperienceGroup).mockResolvedValue({ ok: true, data: { group: nonprofit, roleIds: ["e3"] } });
    render(grouped());
    await user.click(within(region("Group: Esperienze nel terzo settore")).getByRole("button", { name: "Remove group" }));

    expect(removeExperienceGroup).toHaveBeenCalledWith({ id: nonprofit.id });
    expect(region("Not in a group")).toHaveTextContent("Volunteer coordinator");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Removed the group “Esperienze nel terzo settore”. Its roles are still in your profile.", expect.anything()),
    );

    const { action } = vi.mocked(toast).mock.calls.at(-1)![1]!;
    await act(async () => action!.onClick());
    expect(restoreExperienceGroup).toHaveBeenCalledWith({ id: nonprofit.id, name: nonprofit.name, roleIds: ["e3"], index: 0 });
    expect(latest.experienceGroups.map((group) => group.id)).toEqual([nonprofit.id, tech.id]);
    expect(region("Group: Esperienze nel terzo settore")).toHaveTextContent("Volunteer coordinator");
  });
});
