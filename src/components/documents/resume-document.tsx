import { Fragment, type CSSProperties, type ReactNode } from "react";

import { CitationText } from "@/components/citation";
import { PhotoPosition, PhotoShape, type PaperSize, type ThemeLayout } from "@/generated/prisma/enums";
import { HEADLINE_UNIT } from "@/lib/application-data";
import { cn } from "@/lib/cn";
import { documentLabels } from "@/lib/document-labels";
import { documentLanguage } from "@/lib/document-language";
import type { ProfileData } from "@/lib/profile";
import { resumeContent, type ResumeContent, type ResumeOptions } from "@/lib/resume-content";
import { PHOTO_SHAPES, resolveTheme, type ThemeData } from "@/lib/themes";

import { Contact, ContactLine, DocumentPage, DocumentSection, plainUnit, type UnitRenderer } from "./document-page";
import styles from "./document.module.css";

type ResumeDocumentProps = ResumeOptions & {
  theme: ThemeData;
  profile: ProfileData;
  paper: PaperSize;
  /** Overrides the theme's layout, e.g. a tailored resume in a single column. */
  layout?: ThemeLayout;
  /** The language it's written in (SET-7), for its headings too; without one, it's read from the text and the headings are English. */
  language?: string | null;
  /** Draws each tailored part; the preview's adds editing (E8-3). */
  renderUnit?: UnitRenderer;
  /** Settings → "Privacy consent line", printed at the very end (privacyConsentLine); null leaves it off. */
  privacyConsent?: string | null;
};

/** Enough of a resume's own words to tell its script and direction. */
const sampleText = (content: ResumeContent) =>
  [
    content.name,
    content.headline,
    content.summary,
    ...content.experience.flatMap((section) => section.companies.flatMap((company) => company.roles.flatMap((role) => [role.role, ...role.bullets]))),
    ...content.projects.flatMap((project) => [project.name, ...project.bullets]),
  ].join(" ");

/**
 * A resume (RES-1, RES-6, APP-4), the same markup for the preview and the
 * PDF. The base resume passes the profile alone; a tailored resume also
 * passes its units, which replace the profile's text.
 *
 * Sections without content are left out. Each tailored part is drawn by
 * `renderUnit` with its unit id, for editing it in place (E8-3).
 */
export function ResumeDocument({ theme, profile, paper, layout, language, renderUnit = plainUnit, privacyConsent, ...options }: ResumeDocumentProps) {
  const resolved = resolveTheme(theme, layout);
  const labels = documentLabels(language);
  const content = resumeContent(profile, options, labels);
  const { lang, dir } = documentLanguage(language, sampleText(content));
  const { shape, position } = resolved.photo;
  const heads = { timeline: resolved.timeline, stacked: resolved.stacked };
  const photo = (size: "header" | "sidebar", className?: string) =>
    content.photo && <ResumePhoto key="photo" src={content.photo} name={content.name} shape={shape} size={size} className={className} />;

  const sidebar = [
    position === PhotoPosition.SIDEBAR && photo("sidebar"),
    resolved.split && content.contacts.length > 0 && (
      <DocumentSection key="contact" title={labels.contact}>
        <ul className={styles.contactList}>
          {content.contacts.map((item, index) => (
            <li key={index}>
              <Contact>{item}</Contact>
            </li>
          ))}
        </ul>
      </DocumentSection>
    ),
    content.skills && (
      <DocumentSection key="skills" title={labels.skills}>
        {renderUnit({ id: "skills", children: <p>{content.skills}</p> })}
      </DocumentSection>
    ),
    content.languages && (
      <DocumentSection key="languages" title={labels.languages}>
        {renderUnit({ id: "languages", children: <p>{content.languages}</p> })}
      </DocumentSection>
    ),
    content.interests && (
      <DocumentSection key="interests" title={labels.interests}>
        {renderUnit({ id: "interests", children: <p>{content.interests}</p> })}
      </DocumentSection>
    ),
  ].filter(Boolean);

  const main = [
    content.summary && (
      <DocumentSection key="summary" title={labels.profile}>
        {renderUnit({ id: "summary", children: <p className={styles.summary}>{content.summary}</p> })}
      </DocumentSection>
    ),
    // A heading per experience group, then "Experience" for the roles without one (.scratch/experience-groups).
    ...content.experience.map((section) => (
      <DocumentSection key={section.groupId === null ? "experience" : `experience-group:${section.groupId}`} title={section.title}>
        {section.companies.map((company) => {
          const role = (entry: (typeof company.roles)[number], className: string, organisation: string, place: string, nested = false) =>
            renderUnit({
              id: `experience:${entry.id}`,
              className,
              head: <EntryHead title={entry.role} organisation={organisation} place={place} dates={entry.dates} nested={nested} {...heads} />,
              children: (
                <>
                  {entry.bullets.length > 0 && (
                    <ul className={styles.bullets}>
                      {entry.bullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {entry.skills.length > 0 && (
                    <p className={styles.entrySkills}>
                      <span className={styles.accent}>{`${labels.skills} · `}</span>
                      {entry.skills.join(", ")}
                    </p>
                  )}
                </>
              ),
            });
          if (company.roles.length === 1) {
            const [only] = company.roles;
            return <Fragment key={only.id}>{role(only, styles.entry, company.company, company.location)}</Fragment>;
          }
          // A promotion: the company once, with its whole span, then each role (companyGroups).
          return (
            <div key={company.roles[0].id} className={styles.entry}>
              <EntryHead title={company.company} place={company.location} dates={company.dates} {...heads} />
              {company.roles.map((entry) => (
                <Fragment key={entry.id}>{role(entry, styles.companyRole, "", entry.location, true)}</Fragment>
              ))}
            </div>
          );
        })}
      </DocumentSection>
    )),
    content.projects.length > 0 && (
      <DocumentSection key="projects" title={labels.projects}>
        {content.projects.map((project) => (
          <Fragment key={project.id}>
            {renderUnit({
              id: `project:${project.id}`,
              className: styles.entry,
              head: (
                <EntryHead
                  title={project.name}
                  at={project.link && <Contact>{project.link}</Contact>}
                  dates={project.dates}
                  {...heads}
                />
              ),
              children: (
                <>
                  {project.bullets.length > 0 && (
                    <ul className={styles.bullets}>
                      {project.bullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {project.skills.length > 0 && (
                    <p className={styles.entrySkills}>
                      <span className={styles.accent}>{`${labels.skills} · `}</span>
                      {project.skills.join(", ")}
                    </p>
                  )}
                </>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    content.education.length > 0 && (
      <DocumentSection key="education" title={labels.education}>
        {content.education.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `education:${entry.id}`,
              className: styles.entry,
              head: <EntryHead title={entry.degree} organisation={entry.school} dates={entry.dates} {...heads} />,
              children: entry.notes && <p className={styles.muted}>{entry.notes}</p>,
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    content.courses.length > 0 && (
      <DocumentSection key="courses" title={labels.courses}>
        {content.courses.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `course:${entry.id}`,
              // A course is a line or two, not a role: the duration joins the
              // title line, notes and link share one small line, and courses
              // sit as close as publications do.
              className: styles.course,
              head: (
                <EntryHead
                  title={entry.name}
                  at={
                    (entry.provider || entry.duration) && (
                      <>
                        {entry.provider}
                        {entry.provider && entry.duration && " · "}
                        {entry.duration && <span className={styles.nowrap}>{entry.duration}</span>}
                      </>
                    )
                  }
                  dates={entry.dates}
                  {...heads}
                />
              ),
              children: (entry.notes || entry.link) && (
                <p className={styles.courseDetails}>
                  {entry.notes}
                  {entry.notes && entry.link && " · "}
                  {entry.link && <Contact>{entry.link}</Contact>}
                </p>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    content.publications.length > 0 && (
      <DocumentSection key="publications" title={labels.publications}>
        {content.publications.map((entry) => (
          <Fragment key={entry.id}>
            {renderUnit({
              id: `publication:${entry.id}`,
              className: styles.publication,
              children: (
                <p>
                  <CitationText text={entry.citation} />
                  {entry.link && (
                    <>
                      {" "}
                      {entry.href ? (
                        <a href={entry.href} target="_blank" rel="noreferrer" className={styles.link}>
                          <Contact>{entry.link}</Contact>
                        </a>
                      ) : (
                        <span className={styles.link}>
                          <Contact>{entry.link}</Contact>
                        </span>
                      )}
                    </>
                  )}
                </p>
              ),
            })}
          </Fragment>
        ))}
      </DocumentSection>
    ),
    content.references.length > 0 && (
      <DocumentSection key="references" title={labels.references}>
        <div className={styles.references}>
          {content.references.map((reference) => (
            <div key={reference.id}>
              <p className={styles.entryTitle}>{reference.name}</p>
              {reference.role && <p className={styles.muted}>{reference.role}</p>}
              {reference.contact && <p>{reference.contact}</p>}
            </div>
          ))}
        </div>
      </DocumentSection>
    ),
  ].filter(Boolean);

  // Reading order matches what you see: the sidebar comes first in sidebar
  // layouts (and keeps its column even when empty) unless it's at the end of
  // the line, and its sections follow the main ones in a single column.
  const columns = !resolved.split
    ? [main, sidebar].filter((sections) => sections.length > 0)
    : resolved.sidebarEnd
      ? [main, sidebar]
      : [sidebar, main];
  // A tinted sidebar is drawn as a panel, unless there's nothing in it.
  const panel = resolved.tintedSidebar && sidebar.length > 0 ? sidebar : null;

  const title = (
    <>
      <h1 className={styles.name}>{content.name}</h1>
      {/* A bold header goes straight from the name to the contacts, as the resumes it comes from do. */}
      {content.headline && !resolved.boldHeader && renderUnit({ id: HEADLINE_UNIT, children: <p className={styles.headline}>{content.headline}</p> })}
      {!resolved.split && content.contacts.length > 0 && <ContactLine items={content.contacts} separator={resolved.contactSeparator} />}
    </>
  );
  // A photo beside the name puts the name, headline and contacts in a block of their own.
  const beside = content.photo && (position === PhotoPosition.HEADER_START || position === PhotoPosition.HEADER_END);

  return (
    <DocumentPage theme={resolved} paper={paper} lang={lang} dir={dir} label="Resume">
      <header className={cn(styles.header, beside && styles.headerWithPhoto)}>
        {position === PhotoPosition.ABOVE_NAME && photo("header", styles.photoAbove)}
        {position === PhotoPosition.HEADER_START && photo("header")}
        {beside ? <div className={styles.headerText}>{title}</div> : title}
        {position === PhotoPosition.HEADER_END && photo("header")}
      </header>
      <div className={styles.columns}>
        {columns.map((sections, index) => (
          <div key={index} className={cn(styles.column, sections === panel && styles.sidebarPanel)}>
            {sections}
          </div>
        ))}
      </div>
      {privacyConsent && <p className={styles.privacyConsent}>{privacyConsent}</p>}
    </DocumentPage>
  );
}

const SHAPE_CLASSES: Record<PhotoShape, string | undefined> = {
  [PhotoShape.CIRCLE]: styles.photoCircle,
  [PhotoShape.ROUNDED]: styles.photoRounded,
  [PhotoShape.SQUARE]: undefined,
  [PhotoShape.PORTRAIT]: undefined,
};

/** The profile photo (#224) in the theme's shape, at its size in the header or the sidebar. */
function ResumePhoto({ src, name, shape, size, className }: { src: string; name: string; shape: PhotoShape; size: "header" | "sidebar"; className?: string }) {
  const { width, height } = PHOTO_SHAPES[shape][size];
  return (
    // A data URL drawn as it is, in the preview and in the PDF: there's nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={cn(styles.photo, SHAPE_CLASSES[shape], className)}
      style={{ "--photo-width": width, "--photo-height": height } as CSSProperties}
    />
  );
}

/** "Sep 2015 – May 2018" that, in a narrow column, only wraps after the dash. */
const breakAfterDash = (dates: string) =>
  dates
    .split(" – ")
    .map((part) => part.replaceAll(" ", " "))
    .join(" – ");

/**
 * "Senior Product Designer, Northwind Logistics · Rotterdam" with the dates
 * at the end of the line, or before it in a timeline column (the dates come
 * first then, so they float into the column next to the title). `at` is what
 * follows the title, e.g. a project's link; `organisation` is a company or
 * school, which a stacked head leads with.
 *
 * Stacked, the organisation (or else the title) and the dates make the first
 * line, and the title (or `at`) and the place a second one in italics. A role
 * under its company after a promotion is that second line alone, its dates
 * after its title.
 */
function EntryHead({
  title,
  organisation,
  at = organisation,
  place,
  dates,
  timeline,
  stacked,
  nested = false,
}: {
  title: string;
  organisation?: string;
  at?: ReactNode;
  place?: string;
  dates: string;
  timeline: boolean;
  stacked: boolean;
  nested?: boolean;
}) {
  if (stacked) {
    const placeSpan = place && <span className={styles.place}>{place}</span>;
    if (nested) {
      return (
        <div className={styles.entryHead}>
          <p className={styles.entrySubtitle}>
            {title}
            {dates && ` | ${dates}`}
          </p>
          {placeSpan}
        </div>
      );
    }
    const second = organisation ? title : at;
    return (
      <div className={styles.entryHead}>
        <p className={styles.entryTitle}>{organisation || title}</p>
        {/* Always there, empty or not, so the second line starts in the first column. */}
        <span className={styles.dates}>{dates}</span>
        {(second || placeSpan) && <p className={styles.entrySubtitle}>{second}</p>}
        {placeSpan}
      </div>
    );
  }
  const datesSpan = dates && <span className={styles.dates}>{timeline ? breakAfterDash(dates) : dates}</span>;
  const where = at && place ? <>{at}{" · "}{place}</> : at || place;
  return (
    <div className={styles.entryHead}>
      {timeline && datesSpan}
      <p>
        <span className={styles.entryTitle}>{title}</span>
        {where && (
          <>
            {title && ", "}
            {where}
          </>
        )}
      </p>
      {!timeline && datesSpan}
    </div>
  );
}
