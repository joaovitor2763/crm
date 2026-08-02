<h1 align="center">Sales Ontology</h1>

<p align="center">
  <strong>An open-source, agentic-first CRM.</strong><br>
  A durable research agent is the product. The database is just where it writes things down.
</p>

<p align="center">
  Inspired by <a href="https://github.com/trycompai/crm">Comp AI's original open-source CRM</a>.
</p>

<p align="center">
  <a href="#the-agent"><strong>The agent</strong></a> ·
  <a href="#the-stack"><strong>Stack</strong></a> ·
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#configuration"><strong>Configuration</strong></a> ·
  <a href="#deploying"><strong>Deploying</strong></a> ·
  <a href="./CONTRIBUTING.md"><strong>Contributing</strong></a>
</p>

<p align="center">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-blue.svg">
  <img alt="Built with eve" src="https://img.shields.io/badge/agent-eve-black.svg">
  <img alt="Built with Bun" src="https://img.shields.io/badge/runtime-Bun-black.svg">
  <img alt="Postgres" src="https://img.shields.io/badge/database-Postgres-336791.svg">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/overview-dark.png">
    <img alt="The CRM overview: closed-won and open pipeline, pipeline by stage, deals in progress and overdue tasks" src="./docs/images/overview.png">
  </picture>
</p>

---

## What this is

Most CRMs are a database with a form in front of it. The AI ones bolt a chat box onto
the side of that form. Both leave the actual work — finding out what is true, and
writing it down — to a human who has better things to do.

This is built the other way round. **The agent is not a feature of the CRM; the CRM is
where the agent keeps its notes.** It runs on its own deployment, on its own schedule,
against its own work queue. It decides what to look at next, books its own follow-ups,
spends a research budget, and stops when the budget runs out. Nothing about it is
request-response: close the browser and it keeps going.

The API deliberately has no intelligence in it at all. NestJS reports that *something
happened* — a thread was ingested, a company was created, an attendee is unknown — by
writing a row to a queue. The agent leases that row and decides what it means. A Nest
service that calls an enrichment API is treated as a bug, and
[`docs/api.md`](./docs/api.md) explains the outage that made that a rule.

The rule the agent itself never breaks: **nothing about a person is guessed.** No tool
accepts a confidence score, because a model asked to grade its own certainty will, and
it will be wrong in the direction that makes it look useful. Tools report what they
*observed* — `crm.signature-block`, `github.account-identity` — and a ledger prices the
evidence. Strong evidence writes to the record. Weak evidence becomes a suggestion a
human settles. A confidently wrong fact about a customer is worse than a blank field,
because nobody can tell it is wrong.

It is single-tenant and internal by design. Google and `ALLOWED_SIGN_IN` decide
who may enter; one role per user plus business units and teams decide what each
person may see or change. See [SECURITY.md](./SECURITY.md) before you point it at
real customer data.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./docs/images/deals-dark.png">
        <img alt="Deals list with stage, amount, owner and close date" src="./docs/images/deals.png">
      </picture>
      <p align="center"><sub><b>Deals</b> — filters, sort and page live in the URL, so a view is a link.</sub></p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./docs/images/contacts-dark.png">
        <img alt="Contacts list with title, email, company and owner" src="./docs/images/contacts.png">
      </picture>
      <p align="center"><sub><b>Contacts</b> — most of these were created by the mailbox sync, not typed.</sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./docs/images/companies-dark.png">
        <img alt="Companies list with domain, industry, open pipeline and owner" src="./docs/images/companies.png">
      </picture>
      <p align="center"><sub><b>Companies</b> — logo, industry and location arrive on their own.</sub></p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./docs/images/overview-dark.png">
        <img alt="Overview dashboard" src="./docs/images/overview.png">
      </picture>
      <p align="center"><sub><b>Overview</b> — yours or the whole team's, toggled in the URL.</sub></p>
    </td>
  </tr>
</table>

## CRM surface

- Deals can be viewed as a sortable table or as a drag-and-drop Kanban. Moving
  a card writes a stage-change activity; Lost and Unqualified require a reason.
- Pipelines and their ordered stages are managed in Settings, including stage
  outcome semantics (`open`, `won`, `lost`, and `unqualified`) and a default
  pipeline for new deals.
- Companies, contacts, and deals are archived rather than deleted, so their
  commercial history remains available. Contacts also carry first-touch UTM
  attribution.
- The product catalogue stores SKU, name, price, and currency. Products added
  to a deal are snapshotted so later catalogue edits do not rewrite history.
- Marketing forms and events are managed in Settings. Form conversions, event
  attendance, SMS, and WhatsApp messages can be logged on any CRM timeline.
- Contacts progress from Lead to MQL per business unit, while the contact keeps
  a consolidated global lifecycle and marketing score for the business.
- Custom fields support typed values, select options, indexing, field-level
  permissions and API/agent exposure. Roles combine with hierarchical business
  units and teams for record visibility.
- Durable automations react to domain events and signed webhooks deliver the
  same outbox externally. Scoped API keys power `/api/v1` and `/mcp` for agents.

## The agent

[`apps/agent`](./apps/agent) is its own deployment, built on
[**eve**](https://eve.dev) — Vercel's filesystem-first framework for durable agents.
A tool is a file, a skill is a markdown file, a schedule is a file, and the runtime
handles the durable part: sessions that survive a redeploy, work that resumes where it
stopped.

| | |
| --- | --- |
| **18 authored tools** | `read_crm_history`, `search_crm`, `identify_contact`, `research_person`, `enrich_company`, `record_fact`, `schedule_recheck`… |
| **4 skills** | `evidence.md`, `identity-matching.md`, `data-boundaries.md`, `writing-a-brief.md` — prose the agent reads, versioned like code |
| **1 schedule** | `dispatch.ts`, which decides nothing. It leases what is due and starts a session per row. |
| **A sandbox** | `bash`, `grep`, `glob` and a `/workspace`, with **`deny-all` egress** |

**It runs itself.** `lib/tasks.ts` is the work queue: `claimDue` leases rows with
`FOR UPDATE SKIP LOCKED`, so two dispatchers take disjoint work and a run that dies
frees its row when the lease expires. Anything that looks like "every N minutes, the
oldest ten contacts" belongs in a task's `dueAt`, not in a cron expression. When the
agent wants another look at somebody it calls `schedule_recheck` and says why — and
the reason is shown to the rep, because an agent that cannot say why it will be back
in fourteen days does not have a reason, it has a default.

**Every outside source is optional, and it is designed to run with none of them.**
With no API keys at all it still works: `read_crm_history` reads your own threads,
meetings and signature blocks, which is free and is the best evidence there is — no
data vendor can sell you a reply from the person's own address. Each key opens one
more place to look. It is told at the start of every session which ones this install
has, so it plans around what it actually has rather than discovering the gaps one
failed call at a time, and it prints the list at startup:

```
[agent] on   LinkedIn (RAPIDAPI_KEY)
[agent] off  Web research (PERPLEXITY_API_KEY)
[agent] off  Company brand data (CONTEXT_DEV_API_KEY)
```

**The sandbox has no network and no database.** Turning it on is what gives the model
a shell — the difference between a tool-caller and something that can keep a dossier,
diff this month's profile against last month's, and grep a thread for a signature
block. `deny-all` egress costs nothing, because `web_fetch` runs in the app runtime
and `web_search` at the model provider. What it removes is the only path by which a
customer's email body could leave through a shell command. The other half of that rule
is an absence: **the sandbox is never given `DATABASE_URL`.** A shell with credentials
and egress is exfiltration-shaped even in an internal tool; a shell with neither is a
text processor.

**You can talk to it, and watch it work.** Every contact, company and deal has an
**Agent** tab — the steps as it takes them, the leads it throws away and why, and its
questions answered in place when it cannot decide between two people. Conversations
are durable and survive a reload; the record travels in a signed token rather than
being bolted onto the front of your message. Set `AGENT_BRIDGE_SECRET` to the same
value in both processes to turn it on. Without it the tab reports that it is not
configured, and the agent carries on running its own schedule.

[`docs/agent.md`](./docs/agent.md) is the full write-up.

## The stack

A [Turborepo](https://turborepo.dev) monorepo on [Bun](https://bun.com), deployed on
[Vercel](https://vercel.com).

| | |
| --- | --- |
| **Agent** | [eve](https://eve.dev) — durable sessions, tools, skills, schedules, sandboxes |
| **Model** | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) — no provider SDK, and OIDC on Vercel means no key to manage |
| **Sandbox** | [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) in production, Docker or microsandbox locally |
| **Front end** | [Next.js](https://nextjs.org) App Router · [shadcn/ui](https://ui.shadcn.com) · [nuqs](https://nuqs.dev) for URL state |
| **API** | [NestJS](https://nestjs.com) with [nestjs-trpc](https://nestjs-trpc.io) — HTTP, auth, tRPC, Google sync |
| **Data** | [Prisma](https://prisma.io) · Postgres ([Neon](https://neon.tech)) · optional Redis ([Upstash](https://upstash.com)) |
| **Auth** | [Better Auth](https://better-auth.com), Google-only, one allow-list |
| **Files** | [Vercel Blob](https://vercel.com/docs/vercel-blob) — mirrors profile pictures so they survive the source going away |
| **Tooling** | [Biome](https://biomejs.dev) · TypeScript everywhere |

The app talks to the API over **tRPC**, and the router type is generated from the
NestJS routers — so the front end is type-safe from the Prisma row to the table cell.
List state (filters, sort, page) lives in the URL, so copying the address bar
reproduces the view.

### Layout

| Path | |
| --- | --- |
| `apps/agent` | The research agent — tools, skills, schedules, sandbox |
| `apps/app` | Next.js front end · :3000 |
| `apps/api` | NestJS API — HTTP, auth, tRPC, Google sync · :3001 |
| `packages/db` | Prisma schema, migrations, shared Postgres client |
| `packages/auth` | Better Auth config and the sign-in allow-list |
| `packages/ui` | shadcn/ui components, the Tailwind theme |
| `packages/env` | Finds and loads the root `.env` |

### Three rules the codebase holds to

Written up where the work happens, not in a style guide:

- **Intelligence never lives in the API** ([docs/api.md](./docs/api.md)). Nest reports
  that something happened; the agent decides what it means. Two copies of an identity
  matcher once drifted until one matched every employer on earth.
- **`packages/ui` is the only source of UI** ([docs/design.md](./docs/design.md)). No
  overriding styles at the call site.
- **There are no organizations.** Single tenant, deliberately. Business units,
  teams and roles are internal governance partitions, not tenant plumbing.

## Quick start

You need [Bun](https://bun.com) and Docker.

```sh
git clone https://github.com/joaovitor2763/crm.git && cd crm
bun install

docker compose up -d          # Postgres on :5432
cp .env.example .env          # then fill in the four values below

bun run db:deploy             # apply migrations
bun run db:seed               # optional: a believable pipeline to look at
bun run dev
```

The app is on [localhost:3000](http://localhost:3000), the API on
[localhost:3001](http://localhost:3001).

### The four values

Open `.env` and set these. Everything else in the file is optional and commented out.

| Variable                                   | What to put in it                                                    |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | `openssl rand -base64 32`                                             |
| `ALLOWED_SIGN_IN`                          | Your email domain, e.g. `acme.com`. Or one address, e.g. `you@gmail.com`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`| A Google OAuth client — 2 minutes, below.                             |

`DATABASE_URL` already matches the `docker compose` Postgres, so leave it alone unless
you brought your own.

<details>
<summary><strong>Getting the Google OAuth client</strong></summary>

1. [Google Cloud console](https://console.cloud.google.com/apis/credentials) → **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
2. Under **Authorised redirect URIs**, add `http://localhost:3001/api/auth/callback/google`.
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and the [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) for the project.
4. Copy the client ID and secret into `.env`.

Google sign-in is the only way in, so the API will not start without these. If your
account is on a Google Workspace domain, set the consent screen to **Internal** and
nobody outside your org can even reach the prompt.

</details>

`ALLOWED_SIGN_IN` is the admission gate — an unset value means nobody can sign
in, which is the safe direction to fail. Roles and memberships are assigned in
Settings after admission. It takes whole domains, individual addresses, or a mix:

```sh
ALLOWED_SIGN_IN="acme.com"                       # everyone at your company
ALLOWED_SIGN_IN="acme.com,contractor@gmail.com"  # …plus one outsider
ALLOWED_SIGN_IN="you@gmail.com"                  # a one-person install
```

## Configuration

**There is one `.env`, at the root of the repo**, read by all three processes. Real
environment variables always win, so on a hosting platform you configure it there and
the file is purely a local convenience.

Beyond the four required values, everything is optional and the app runs without any
of it. [`.env.example`](./.env.example) is the full list with a note on each; the
short version:

| | |
| --- | --- |
| `API_URL` / `APP_URL` | Where the two halves are served. Only needed off localhost. |
| `PERPLEXITY_API_KEY` | Lets the agent search the open web, with citations. |
| `RAPIDAPI_KEY` | Lets the agent read LinkedIn profiles for identity. |
| `CONTEXT_DEV_API_KEY` | Company logo, industry and socials from a domain. |
| `AGENT_BRIDGE_SECRET` | Lets a rep talk to the agent from a contact's **Agent** tab. |
| `REDIS_URL` | A shared cache. Without it, per-instance and in-memory. |
| `CRON_SECRET` | Guards the Gmail/Calendar sync route. Required to use it. |
| `WEBHOOK_SIGNING_SECRET` | Derives per-endpoint webhook secrets. Required only for webhooks. |

## Tasks

| Command | |
| --- | --- |
| `bun run dev` | Everything, in watch mode |
| `bun run build` | Build all apps and packages |
| `bun run test` | Run the test suite |
| `bun run check-types` | `tsc --noEmit` everywhere |
| `bun run lint` / `format` | [Biome](https://biomejs.dev) |
| `bun run db:migrate` | Create and apply a migration |
| `bun run db:seed` | Top up the demo pipeline (idempotent) |
| `bun run db:studio` | Prisma Studio |
| `bun run --filter=api trpc:generate` | Regenerate the `AppRouter` type |
| `bun run --filter=api dev:session` | Print a session cookie for a local user |

Scope any of them with a Turborepo filter: `bun run dev --filter=api`.

Because Google is the only door, there is no way to get a session from a terminal —
`dev:session` writes the rows Better Auth would have written and prints the cookie it
would have set. It refuses to run with `NODE_ENV=production`.

## Deploying

Three deployments and a Postgres: the Next.js app, the NestJS API, and the agent.

Additive, backwards-compatible migrations can be applied before the new
processes without a maintenance window. Destructive migrations still require an
expand/contract release or a maintenance window. Run `bun run db:deploy` once
for the target database, then deploy all three services from the same commit.
They are independent, and the only thing they must agree on is `DATABASE_URL` and
`BETTER_AUTH_SECRET` — the API mints the session cookie and the app verifies it, so a
mismatch is a redirect loop rather than an error.

Set `API_URL` and `APP_URL` to the real origins, and if the two are on different
subdomains of one parent, set `AUTH_COOKIE_DOMAIN` to the parent so one cookie covers
both. Add `http://your-api-host/api/auth/callback/google` to the OAuth client's
redirect URIs. Set `CRON_SECRET` and point a scheduler at
`POST /internal/sync/google` to keep the mailbox sync running.

`apps/api/src/generated/server.ts` is committed and `build` must never regenerate it —
the generator needs a newer GLIBC than most build images have. Regenerate locally and
commit it with the router change that caused it.

## Contributing

We'd rather have a paragraph you wrote than a pull request an agent wrote. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

Security issues go through [SECURITY.md](./SECURITY.md), privately, not a public
issue.

## Licence

[MIT](./LICENSE).
