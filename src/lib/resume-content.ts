import { HEADLINE_UNIT, type Unit } from "@/lib/application-data";
import { ageLabel, ENGLISH_LABELS, languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { publicationHref, publicationLink } from "@/lib/citation";
import { companyGroups, companySpan } from "@/lib/companies";
import { ageOn, formatBirthDate, formatDateRange, formatDuration, resumeCourses, resumePublications, type Basics, type ProfileData } from "@/lib/profile";

// What a resume shows, worked out from the profile (the base resume) or from
// a tailored document's units, so the renderer only has to lay it out.

export type ResumeContent = {
  name: string;
  headline: string;
  /** The profile photo's data URL, or null when the resume has none (#224). */
  photo: string | null;
  /** Email, phone, "City, Country", website, LinkedIn and "Age N" or "Born …", whichever are filled in. */
  contacts: string[];
  summary: string;
  /**
   * Roles under their headings: one per experience group, then "Other
   * experience" for the roles without one (.scratch/experience-groups). A
   * profile without groups has just one, "Experience".
   */
  experience: ExperienceSection[];
  /** Projects (PRO-13), laid out like roles. */
  projects: {
    id: string;
    name: string;
    /** "github.com/jane/tidewater", without "https://". */
    link: string;
    dates: string;
    bullets: string[];
    skills: string[];
  }[];
  /** `location` is where it was, when the resume shows locations; otherwise "". */
  education: { id: string; degree: string; school: string; location: string; dates: string; notes: string }[];
  /** Courses & certificates, after education; only the ones that help, on a tailored resume. */
  courses: {
    id: string;
    name: string;
    provider: string;
    dates: string;
    /** "16 Stunden" for "16 hours" on a German resume; "3 weekend sessions" as typed. */
    duration: string;
    /** "example.com/certificate", without "https://". */
    link: string;
    notes: string;
  }[];
  /** Publications (#218), word for word, in the profile's order. */
  publications: {
    id: string;
    /** As written, with **bold** and *italic*. */
    citation: string;
    /** "doi.org/10.1038/…", without "https://". */
    link: string;
    /** What the link opens, or null when it isn't a web address. */
    href: string | null;
  }[];
  /** "Figma · User research · …" */
  skills: string;
  /** "Dutch: Native · English: Fluent (C2)" */
  languages: string;
  /** "Bouldering · Sourdough baking · …" */
  interests: string;
  references: { id: string; name: string; role: string; contact: string }[];
};

/** Roles under one heading, by company. */
export type ExperienceSection = {
  /** The experience group's id, or null for the roles without one. */
  groupId: string | null;
  /** The group's name as typed, or the document's "Experience" or, after groups, "Other experience" heading. */
  title: string;
  /**
   * Roles by company: a promotion's roles together under the company once,
   * where its latest role would be (companyGroups). Most companies have one.
   */
  companies: {
    company: string;
    /** Where its roles were, when the resume shows locations and they were all in one place; otherwise "". */
    location: string;
    /** From the first role's start to the last one's end. */
    dates: string;
    roles: {
      id: string;
      role: string;
      /** Where this role was, when the resume shows locations and the company's roles were in different places. */
      location: string;
      dates: string;
      bullets: string[];
      /** The skills used in the role (RES-6). */
      skills: string[];
    }[];
  }[];
};

export type ResumeOptions = {
  /** A tailored document's units; they replace the profile's text (APP-4). */
  units?: Unit[];
  /** Settings → "Include references" (SET-9). */
  includeReferences?: boolean;
  /** An application's Photo switch (#224); null or left out follows the profile's "Show on resumes". */
  showPhoto?: boolean | null;
  /** Each role's and degree's location next to its company or school: Settings → "Locations on resumes", or the application's choice. */
  showLocations?: boolean;
  /** A tailored resume's groups in the profile's order, whatever the order of its units. */
  profileGroupOrder?: boolean;
  /** For "Age N"; defaults to now. */
  today?: Date;
};

/** The separator between contact details on one line. */
export const CONTACT_SEPARATOR = "  ·  ";

/** Contact details in the order the resume header lists them. */
export function contactItems(basics: Basics, today = new Date(), labels = ENGLISH_LABELS): string[] {
  const age = basics.birthOnResumes === "age" ? ageOn(basics.dob, today) : null;
  const birthDate = basics.birthOnResumes === "date" ? formatBirthDate(basics.dob, labels.locale) : "";
  return [
    basics.email,
    basics.phone,
    [basics.city, basics.country].map((part) => part.trim()).filter(Boolean).join(", "),
    basics.website,
    basics.linkedin,
    age === null ? "" : ageLabel(age, labels),
    birthDate && labels.born(birthDate),
  ]
    .map((item) => item.trim())
    .filter(Boolean);
}

/** A link as a resume shows it: "https://www.example.com/x/" is "example.com/x". */
export const displayLink = (link: string) =>
  link
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** What the resume shows, with its dates and levels in the words of `labels`. */
export function resumeContent(
  profile: ProfileData,
  { units, includeReferences = false, showPhoto, showLocations = false, profileGroupOrder = false, today = new Date() }: ResumeOptions = {},
  labels: DocumentLabels = ENGLISH_LABELS,
): ResumeContent {
  const { basics } = profile;
  const skillNames = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  const dates = { locale: labels.locale, present: labels.present };

  type Role = ProfileData["experience"][number];
  const namesOf = (skillIds: string[]) => skillIds.flatMap((id) => skillNames.get(id) ?? []);
  /** A role and what the resume says about it: its bullets, and its skills when a tailored resume has its own. */
  type RoleText = { entry: Role; text: string; skills?: string[] };
  const companies = (roles: RoleText[]): ExperienceSection["companies"] =>
    // A career break has no company or place, whatever was typed before it was marked one.
    companyGroups(
      roles.map(({ entry, text, skills }) => ({
        ...entry,
        ...(entry.careerBreak ? { company: "", location: "" } : {}),
        text,
        skills: skills ?? namesOf(entry.skillIds),
      })),
    ).map((group) => {
      // One place for the whole company goes on its line; a move between offices shows on each role.
      const places = [...new Set(group.map((entry) => entry.location.trim()).filter(Boolean))];
      const onePlace = !showLocations ? "" : places.length === 1 ? places[0] : "";
      return {
        company: group[0].company.trim(),
        location: onePlace,
        dates: formatDateRange(companySpan(group), dates),
        roles: group.map((entry) => ({
          id: entry.id,
          role: entry.role.trim() || (entry.careerBreak ? labels.careerBreak : ""),
          location: showLocations && places.length > 1 ? entry.location.trim() : "",
          dates: formatDateRange(entry, dates),
          bullets: lines(entry.text),
          skills: entry.skills,
        })),
      };
    });
  // A role's group, or null without one or when the group is gone.
  const groups = new Map(profile.experienceGroups.map((group) => [group.id, group]));
  const groupOf = (role: Role) => (role.groupId !== null && groups.has(role.groupId) ? role.groupId : null);
  const profileOrder = [...profile.experienceGroups.map((group) => group.id), null];
  /** Roles under their headings, in the order `headings` gives; a heading without roles is left out. */
  const experience = (roles: RoleText[], headings: (string | null)[]): ExperienceSection[] =>
    headings.flatMap((groupId) => {
      const under = roles.filter(({ entry }) => groupOf(entry) === groupId);
      if (under.length === 0) return [];
      // An unnamed group gets the section's heading. Roles left out of the
      // groups aren't more of the same, so they're "Other experience", not
      // "Experience" next to a group of the user's called much the same.
      const title =
        groupId !== null ? groups.get(groupId)!.name.trim() || labels.experience : groups.size > 0 ? labels.otherExperience : labels.experience;
      return [{ groupId, title, companies: companies(under) }];
    });
  const project = (entry: ProfileData["projects"][number], bullets: string, skills = namesOf(entry.skillIds)) => ({
    id: entry.id,
    name: entry.name.trim(),
    link: displayLink(entry.link),
    dates: formatDateRange(entry, dates),
    bullets: lines(bullets),
    skills,
  });
  const publication = (entry: ProfileData["publications"][number], citation: string) => ({
    id: entry.id,
    citation: citation.trim(),
    link: displayLink(publicationLink(entry.link)),
    href: publicationHref(entry.link),
  });
  const education = (entry: ProfileData["education"][number], notes: string) => ({
    id: entry.id,
    degree: entry.degree.trim(),
    school: entry.school.trim(),
    location: showLocations ? entry.location.trim() : "",
    dates: formatDateRange(entry, dates),
    notes: notes.trim(),
  });
  const course = (entry: ProfileData["courses"][number], notes: string) => ({
    id: entry.id,
    name: entry.name.trim(),
    provider: entry.provider.trim(),
    dates: formatDateRange({ ...entry, current: false }, dates),
    duration: formatDuration(entry.duration, dates),
    link: displayLink(entry.link),
    notes: notes.trim(),
  });

  const content: ResumeContent = {
    name: basics.name.trim() || "Your name",
    headline: basics.headline.trim(),
    photo: profile.photo && (showPhoto ?? profile.photo.onResumes) ? profile.photo.src : null,
    contacts: contactItems(basics, today, labels),
    summary: basics.summary.trim(),
    // The groups in the profile's order, then the roles without one.
    experience: experience(
      profile.experience.map((entry) => ({ entry, text: entry.bullets })),
      profileOrder,
    ),
    projects: profile.projects.map((entry) => project(entry, entry.bullets)),
    education: profile.education.map((entry) => education(entry, entry.notes)),
    courses: resumeCourses(profile.courses).map((entry) => course(entry, entry.notes)),
    publications: resumePublications(profile.publications).map((entry) => publication(entry, entry.citation)),
    skills: profile.skills.map((skill) => skill.name).join(" · "),
    languages: languagesLine(profile.languages, labels),
    interests: profile.interests.join(" · "),
    references: includeReferences
      ? profile.references.map((reference) => ({
          id: reference.id,
          name: reference.name.trim(),
          role: [reference.relation, reference.company].map((part) => part.trim()).filter(Boolean).join(", "),
          contact: [reference.email, reference.phone].map((part) => part.trim()).filter(Boolean).join(" · "),
        }))
      : [],
  };

  if (units) {
    // A tailored resume holds exactly what its units hold, in their order (courses aside, below):
    // a role, project, degree, course or publication without a unit was left out on purpose.
    const text = (id: string) => units.find((unit) => unit.id === id)?.text ?? "";
    const withUnit = <T extends { id: string }>(prefix: string, entries: T[]) =>
      units.flatMap((unit) => {
        if (!unit.id.startsWith(prefix)) return [];
        const entry = entries.find(({ id }) => `${prefix}${id}` === unit.id);
        return entry ? [{ entry, text: unit.text, skills: unit.skills }] : [];
      });

    // A version saved before resumes had their own headline shows the profile's.
    const headline = units.find((unit) => unit.id === HEADLINE_UNIT);
    if (headline) content.headline = headline.text.trim();
    content.summary = text("summary").trim();
    content.skills = text("skills").trim();
    content.languages = text("languages").trim();
    content.interests = text("interests").trim();
    // Each heading where its first role is: tailoring and the editor decide the groups' order by the units'.
    // The Group order switch puts them back in the profile's, as the base resume has them.
    const roles = withUnit("experience:", profile.experience);
    content.experience = experience(roles, profileGroupOrder ? profileOrder : [...new Set(roles.map(({ entry }) => groupOf(entry)))]);
    content.projects = withUnit("project:", profile.projects).map(({ entry, text, skills }) => project(entry, text, skills));
    content.education = withUnit("education:", profile.education).map(({ entry, text }) =>
      education(entry, text),
    );
    // Tailoring decides which courses stay and, for page-limit.ts to trim the
    // least relevant first, keeps their units by relevance. The resume itself
    // lists them in the profile's order, so they don't read out of date order.
    content.courses = resumeCourses(profile.courses).flatMap((entry) => {
      const unit = units.find(({ id }) => id === `course:${entry.id}`);
      return unit ? [course(entry, unit.text)] : [];
    });
    content.publications = withUnit("publication:", profile.publications).flatMap(({ entry, text }) =>
      text.trim() ? [publication(entry, text)] : [],
    );
  }

  return content;
}
