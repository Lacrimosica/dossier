import { HEADLINE_UNIT, type Unit } from "@/lib/application-data";
import { ageLabel, ENGLISH_LABELS, languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { publicationHref, publicationLink } from "@/lib/citation";
import { companyGroups, companySpan } from "@/lib/companies";
import { ageOn, formatBirthDate, formatDateRange, resumeCourses, resumePublications, type Basics, type ProfileData } from "@/lib/profile";

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
   * Roles by company: a promotion's roles together under the company once,
   * where its latest role would be (companyGroups). Most companies have one.
   */
  experience: {
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
  education: { id: string; degree: string; school: string; dates: string; notes: string }[];
  /** Courses & certificates, after education; only the ones that help, on a tailored resume. */
  courses: {
    id: string;
    name: string;
    provider: string;
    dates: string;
    /** "3 weekend sessions", as typed. */
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
  references: { id: string; name: string; role: string; contact: string }[];
};

export type ResumeOptions = {
  /** A tailored document's units; they replace the profile's text (APP-4). */
  units?: Unit[];
  /** Settings → "Include references" (SET-9). */
  includeReferences?: boolean;
  /** An application's Photo switch (#224); null or left out follows the profile's "Show on resumes". */
  showPhoto?: boolean | null;
  /** Each role's location next to its company: Settings → "Work locations on resumes", or the application's choice. */
  showLocations?: boolean;
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
  { units, includeReferences = false, showPhoto, showLocations = false, today = new Date() }: ResumeOptions = {},
  labels: DocumentLabels = ENGLISH_LABELS,
): ResumeContent {
  const { basics } = profile;
  const skillNames = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  const dates = { locale: labels.locale, present: labels.present };

  type Role = ProfileData["experience"][number];
  const experience = (roles: { entry: Role; text: string }[]): ResumeContent["experience"] =>
    companyGroups(roles.map(({ entry, text }) => ({ ...entry, text }))).map((group) => {
      // One place for the whole company goes on its line; a move between offices shows on each role.
      const places = [...new Set(group.map((entry) => entry.location.trim()).filter(Boolean))];
      const onePlace = !showLocations ? "" : places.length === 1 ? places[0] : "";
      return {
        company: group[0].company.trim(),
        location: onePlace,
        dates: formatDateRange(companySpan(group), dates),
        roles: group.map((entry) => ({
          id: entry.id,
          role: entry.role.trim(),
          location: showLocations && places.length > 1 ? entry.location.trim() : "",
          dates: formatDateRange(entry, dates),
          bullets: lines(entry.text),
          skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
        })),
      };
    });
  const project = (entry: ProfileData["projects"][number], bullets: string) => ({
    id: entry.id,
    name: entry.name.trim(),
    link: displayLink(entry.link),
    dates: formatDateRange(entry, dates),
    bullets: lines(bullets),
    skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
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
    dates: formatDateRange(entry, dates),
    notes: notes.trim(),
  });
  const course = (entry: ProfileData["courses"][number], notes: string) => ({
    id: entry.id,
    name: entry.name.trim(),
    provider: entry.provider.trim(),
    dates: formatDateRange({ ...entry, current: false }, dates),
    duration: entry.duration.trim(),
    link: displayLink(entry.link),
    notes: notes.trim(),
  });

  const content: ResumeContent = {
    name: basics.name.trim() || "Your name",
    headline: basics.headline.trim(),
    photo: profile.photo && (showPhoto ?? profile.photo.onResumes) ? profile.photo.src : null,
    contacts: contactItems(basics, today, labels),
    summary: basics.summary.trim(),
    experience: experience(profile.experience.map((entry) => ({ entry, text: entry.bullets }))),
    projects: profile.projects.map((entry) => project(entry, entry.bullets)),
    education: profile.education.map((entry) => education(entry, entry.notes)),
    courses: resumeCourses(profile.courses).map((entry) => course(entry, entry.notes)),
    publications: resumePublications(profile.publications).map((entry) => publication(entry, entry.citation)),
    skills: profile.skills.map((skill) => skill.name).join(" · "),
    languages: languagesLine(profile.languages, labels),
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
    // A tailored resume holds exactly what its units hold, in their order:
    // a role, project, degree, course or publication without a unit was left out on purpose.
    const text = (id: string) => units.find((unit) => unit.id === id)?.text ?? "";
    const withUnit = <T extends { id: string }>(prefix: string, entries: T[]) =>
      units.flatMap((unit) => {
        if (!unit.id.startsWith(prefix)) return [];
        const entry = entries.find(({ id }) => `${prefix}${id}` === unit.id);
        return entry ? [{ entry, text: unit.text }] : [];
      });

    // A version saved before resumes had their own headline shows the profile's.
    const headline = units.find((unit) => unit.id === HEADLINE_UNIT);
    if (headline) content.headline = headline.text.trim();
    content.summary = text("summary").trim();
    content.skills = text("skills").trim();
    content.languages = text("languages").trim();
    content.experience = experience(withUnit("experience:", profile.experience));
    content.projects = withUnit("project:", profile.projects).map(({ entry, text }) => project(entry, text));
    content.education = withUnit("education:", profile.education).map(({ entry, text }) =>
      education(entry, text),
    );
    content.courses = withUnit("course:", resumeCourses(profile.courses)).map(({ entry, text }) => course(entry, text));
    content.publications = withUnit("publication:", profile.publications).flatMap(({ entry, text }) =>
      text.trim() ? [publication(entry, text)] : [],
    );
  }

  return content;
}
