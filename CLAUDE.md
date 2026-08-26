# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

TAIME is a strategic-technology-intelligence platform (the SME-accessible equivalent of Gartner/Forrester/McKinsey). It has two independent projects living in one repo:

1. **Root (`/`)** — the data pipeline: standalone `ts-node` CLI scripts that collect signals, cluster them, and generate bilingual (PT-BR + EN) intelligence reports into Supabase.
2. **`taime-web/`** — the Next.js 16 App Router frontend + API + cron jobs that serve those reports, the daily Radar, the newsletter, and the Executive Advisor chat.

They are **separate npm packages** with **separate `tsconfig.json`, `package.json`, and env-var conventions** — do not assume a change in one applies to the other.

## Authoritative documentation

- **`TAIME_MASTER_DOC.md`** — the single source of truth for product, pipeline, framework, DB schema, plans, and Advisor. Read it before any non-trivial change. Sections are numbered; it is far more detailed than this file.
- **`LOG.md`** — chronological dev journal (8000+ lines, newest at top). Records decisions, experiments (including rejected ones), and rationale. Check it to understand *why* something is the way it is before changing it.

## Commands

### Pipeline (run from repo root)

Scripts are invoked directly with `ts-node` and configured through **environment variables**, not CLI flags. `PERIOD` (a `YYYY-MM-DD` period start) is the key one.

```bash
# Single report, full pipeline for one period:
PERIOD=2026-05-01 npx ts-node collect-signals.ts
PERIOD=2026-05-01 npx ts-node filter-signals.ts
PERIOD=2026-05-01 npx ts-node analyze-signals.ts
PERIOD=2026-05-01 npx ts-node generate-report.ts
PERIOD=2026-05-01 npx ts-node validate-report.ts

# npm aliases exist for three of these:
npm run collect   # collect-signals.ts
npm run analyze   # analyze-signals.ts
npm run report    # generate-report.ts

# Historical batch (writes/reads batch-progress.json):
npx ts-node generate-periods.ts 2025-01-01 2025-12-01   # builds batch-periods.json
npx ts-node batch-pipeline.ts
npx ts-node batch-pipeline.ts --resume                   # resume if interrupted

# Daily radar:
npx ts-node collect-radar.ts
```

Common pipeline env flags: `PERIOD`, `NO_AUTO_PUBLISH=1` (leave reports as `pending_review`, `published_at=null` — always use for tests/experiments), `COLLECT_MODE` (`full` default; `hybrid` was tested and **rejected**, see LOG.md), `ONLY_RANKS`, `REPORT_ID`.

### Web app (run from `taime-web/`)

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
```

### Tests

There is **no test framework**. Unit tests are `taime-web/lib/*.test.ts`, run with Node's native TypeScript strip (Node 24), and exit non-zero on failure:

```bash
cd taime-web && node lib/period-intent.test.ts     # or question-intent, telemetry-agg, trajectory-select
```

## Architecture

### Pipeline flow

```
Serper API (110 sources) → signals → filter → signal_clusters → reports + report_trends → validation → published
   collect-signals.ts      filter-signals   analyze-signals      generate-report        validate-report
```

- **collect-signals.ts** — Serper (Google Search wrapper), 110 sources / 16 categories, broad year-less queries.
- **filter-signals.ts** — de-noise/relevance filter before clustering.
- **analyze-signals.ts** — LLM clustering (Claude Sonnet), 4–12 clusters, min ~8 signals/cluster.
- **generate-report.ts** — bilingual PT+EN generation. Auto-splits into 2 reports when >7 clusters. Assigns each trend a `category` (1 of 14 broad labels) and a stable `theme_slug` (kebab-case, reused across cycles to track a theme over time). **PT is canonical; EN inherits the numeric scores** (dual enforcement keeps `taime_score` + 5 dimensions identical PT=EN).
- **validate-report.ts** — LLM-as-judge + deterministic checks (grounding, temporal boundary, source attribution, PT=EN scores, no em-dash, no monetary sizing). Clean reports auto-publish; flagged ones go to `pending_review` for human curation in `/admin/reports`.

**LLM calls are raw `fetch` to `https://api.anthropic.com/v1/messages`** (no `@anthropic-ai` SDK). Every call is wrapped in `logLlmCall(...)` (telemetry to the `llm_calls` table). Model constants live at the top of each script (`claude-sonnet-4-6` for pipeline/advisor, `claude-haiku-4-5` for radar).

### Web app

Next.js 16 App Router in `taime-web/`. Supabase for data/auth (`lib/supabase-server.ts`, `lib/supabase-browser.ts`, `@supabase/ssr`), Resend for email, Tailwind (theme color `taime-600` = `#2563EB`), custom cookie-based i18n (`taime-locale`, PT/EN) via `lib/i18n` + `lib/useLocale.ts`. Path alias `@/*` maps to the `taime-web` root.

- **Cron jobs** are declared in `taime-web/vercel.json` and implemented under `app/api/cron/` (radar, radar-briefing, newsletter-weekly, advisor-alerts). They are protected by `CRON_SECRET`.
- **Newsletter** logic is in `lib/newsletter/` (`send-weekly.ts`, `shared.ts` / `deliverNewsletter()`); weekly editorial email is generated as structured JSON, not free text.
- **Plan gating** is centralized in `lib/plan.ts` (`getUserPlan`, `hasAdvisorAccess`, message limits). Server-side gate lives in the advisor chat route (403); the UI mirrors it. Plans: `free` / `essential` / `strategic` (null ⇒ treat as free). Stripe is not yet integrated — the gate reads the `subscriptions` table.
- **Executive Advisor** (`app/api/advisor/*`, `app/dashboard/advisor/`) — Claude Sonnet chat with company profile + last 20 messages + last 3 reports as context; history in `advisory_memory`.

### Database

**Supabase / PostgreSQL** (project ref `udcyimlxjjzlozmfvufb`). Migrations are **loose `.sql` files at the repo root** (`add-*.sql`, `schema.sql`, `migration-*.sql`) applied **manually** — there is no migration runner. When adding a table/column, add a matching `.sql` file and note it in `TAIME_MASTER_DOC.md` §7. Key tables: `sources`, `signals`, `signal_clusters`, `reports`, `report_trends`, `radar_signals`, `radar_briefings`, `users`, `subscriptions`, `advisor_profiles`, `advisory_memory`, `reading_progress`, `saved_reports`, `newsletter_subscribers` / `newsletter_sends` / `newsletter_send_recipients`, `llm_calls`.

Reports allow **multiple per period**: `UNIQUE (period, report_number)`, no standalone unique on `period`.

Score-dimension gotcha: the `report_trends.score_dimensions` column is **legacy and empty (`{}`)** — the real dimensions live nested inside `taime_framework_pt_br` / `taime_framework_en`. See `TAIME_MASTER_DOC.md` §3 for how to audit scores.

### Environment variables

The two projects use **different names for the Supabase URL/key**:

- **Pipeline (root):** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY` (loaded via `dotenv/config` from `.env`). See `.env.example`.
- **Web app:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`.

## Inviolable editorial rules (when touching generation/validation)

`generate-report.ts` and `validate-report.ts` encode hard content rules. Breaking these breaks the product's core promise. Full detail in `TAIME_MASTER_DOC.md` §4; the essentials:

- **Anti-hallucination**: every stated fact must be traceable to a collected signal. The LLM interprets evidence, it does not write journalism.
- **Source confidentiality**: never name research firms (Gartner, McKinsey, …) as *sources* — refer to them by category ("global research institutes"). A company may appear as the *subject* of a fact, never as the *source*.
- **Temporal boundary**: for any period, use only information available up to `period_end_date` — no hindsight, in every field.
- **PT = EN score parity**: `taime_score` + 5 dimensions must be numerically identical across languages (enforced twice).
- **No em-dash** (U+2014) in generated text — `stripEmDash` removes it deterministically before persisting (hyphens/compound words untouched).
- **No monetary values**, **no size/segment targeting** (write "organizations"/"leaders", never "SMEs").
- **Human is the final gate**: a validation-flagged report is never auto-published.

## Operational rules (hard constraints)

- **NEVER use an em-dash (U+2014)** on any added line, in code or text. Use ":", ".", or a new sentence. This applies to source, comments, docs, and generated content alike.
- **Two `package.json` files is correct and intentional**: root = the TS pipeline, `taime-web/` = the Next.js app (Vercel project root is `taime-web`). NEVER consolidate them.
- **`NO_AUTO_PUBLISH=1` always** when running the pipeline. Publishing is a human action via the admin panel, never automatic.
- **Generation model by era**: historical periods use `claude-opus-4-8`; the present period uses Sonnet. After generating a present-period report, revert the model back to Opus.
- **Build must be clean before every commit**: `tsc` / `next build` with 0 errors. Commit and push directly to `main`.
- **SQL migrations**: generate the `.sql` and validate it against `schema.sql`, but NEVER apply it. Applying migrations is a manual step the user performs.
- **i18n parity is mandatory**: every UI string must exist in both PT and EN. Portuguese is always **PT-BR**, never European Portuguese.
- **Shadow periods (days 08 and 23) are a lab**: NEVER `UPDATE` or `DELETE` against a real period while working in a shadow one.
- **Telemetry via `llm_calls` is fire-and-forget**: it must never sit on the critical path (do not block or fail a request/generation on a telemetry write).

## Working in this repo

- The repo root is cluttered with **one-off, throwaway artifacts**: `probe-*.ts`, `check-*.ts`, `cleanup-*.ts`, `regen-*.ts`, `analyze-2024-*.ts`, `*.log`, `*.json.bak`, shadow/reanalysis scripts. These are ad-hoc investigation tools, not part of the pipeline — don't treat them as reference implementations or maintain them.
- The reusable pipeline is the small set named in the flow above plus `period-utils.ts`, `content-extract.ts`, `date-check.ts`, `embeddings-shared.ts`, `llm-telemetry.ts`.
- Much of the codebase documentation and code comments are in **Portuguese**; match the surrounding language when editing.
