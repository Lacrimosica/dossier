# CLAUDE.md

Dossier is a self-hosted, single-user job search app: one profile, AI-tailored resumes and cover letters per posting, and application tracking (draft → offer). Next.js 16 (App Router, React 19) + Prisma 7 + PostgreSQL 18, Tailwind 4, zod 4, Yarn 4. AGPL-3.0.

**Read [DEVELOPMENT.md](DEVELOPMENT.md) before non-trivial work.** It's the authoritative guide (setup, mutations, auth, AI, job search, agent, tests, image). This file is a quick map plus the rules that are easy to miss.

## Commands — everything runs in Docker, never on the host

```bash
docker compose up                      # app on :3000, hot reload (runs prisma generate + migrate deploy + seed on start)
docker/bin/yarn <cmd>                  # yarn inside the app container (host has no node_modules)
docker/bin/yarn lint
docker/bin/yarn typecheck              # next typegen && tsc
docker/bin/yarn test                   # vitest (unit + component + *.db.test.ts)
docker/bin/yarn vitest run <path>      # single file
docker/bin/yarn build && docker/bin/yarn test:e2e   # Playwright against a production build
docker/bin/yarn prisma migrate dev --name <name> && docker compose restart app   # restart regenerates the client
```

`compose.override.yml` (untracked, local only) pins `app` to `linux/amd64`. Don't commit it.

## Layout

- `src/app/(app)/<screen>/` — signed-in screens: `page.tsx` (server), `*-screen.tsx` (client), `actions.ts` (Server Actions), `loading.tsx`/`error.tsx`. Screens: dashboard, applications (+`[id]`), new, jobs, agent, startups, inbox, profile (+import), resume (themes), settings.
- `src/app/api/` — route handlers only for files, uploads, streams, MCP/OAuth (`api/mcp`, `api/oauth`), Google callback, health.
- `src/app/print/` — pages headless Chromium renders to PDF (`src/lib/pdf`). `src/app/dev/` — dev-only galleries.
- `src/lib/` — all domain logic. Key areas:
  - `action.ts` / `route.ts` — the **only** ways to write mutations / route handlers.
  - `ai/` — providers (`providers/`), prompts (`tasks/`, each exports a `*_VERSION` to bump when the prompt changes), `fact-guard.ts`.
  - `jobs/` — background job runner (`defineJob`, `startJob`); every job module must be imported in `jobs/definitions.ts`.
  - `job-search/` — posting sources (JSearch, Adzuna, Arbeitsagentur). "Job" = background task, "posting" = job ad.
  - `agent/` — daily job agent. `startups/` — HN/YC startup discovery. `google/` — Gmail/Calendar. `connector/` — Claude MCP connector tools.
  - `application-data.ts` — zod schemas for JSON columns. `status-actions.ts` — the only place to change application status.
  - `settings.ts` / `settings-data.ts` — key-value `Setting` table with zod-typed settings.
  - `env.ts` — validated env; use `env`, never `process.env`. `secrets.ts` — encrypted API keys.
- `src/components/` — shared components; `ui/` holds Radix-based primitives (button, select, dialog…). Use these, and `cn()` from `@/lib/cn`.
- `src/generated/prisma` — generated client (gitignored). Import enums from `@/generated/prisma/enums`.
- `prisma/` — schema, migrations, seed (`--demo` loads Jane Doe sample data).
- `e2e/` — Playwright specs plus fakes for AI (`fake-ai.mts`), job sources and Google. New AI tasks need a fake answer there.
- `site/` — static marketing site for dossier.aien.me.

## Conventions

- Path alias `@/*` → `src/*`. Server-only modules start with `import "server-only";`.
- Mutations: `action(zodSchema, handler)` in `"use server"` files; throw `ActionError("…")` for user-facing errors; client calls `toastResult(await myAction(…))`.
- Route handlers: wrap in `route()` (session, same-origin, no-store).
- Pages/layouts call `verifySession()`; `src/proxy.ts` is only an optimistic check.
- User-facing copy is plain, friendly, full sentences (see existing toasts/errors and `src/lib/messages.ts`).
- Comments explain *why*, in prose, often citing an issue (`#221`) or PRD id (`E6-5`, `SET-6`). Match that style and density.
- Privacy is a feature: jobs hold personal data only until retention sweeps; never log personal data; AI never sends anything for the user; strict mode means no invented facts.
- Tests sit next to code: `*.test.ts` (node), `*.test.tsx` (jsdom + Testing Library), `*.db.test.ts` (real Postgres `dossier_test`, `resetDatabase()` from `src/test/db.ts`). Coverage thresholds in `vitest.config.mts` ratchet — don't lower them.
- Accessibility is enforced: `e2e/accessibility.spec.ts` runs axe (WCAG 2.2 AA) on every screen.
- When behaviour changes, update DEVELOPMENT.md / README.md as well. Data export/import (`data-export.ts`, `data-import.ts`) must include any new model.
- Commits: short imperative subject; releases are "Dossier X.Y.Z" commits that bump `package.json`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
