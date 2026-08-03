# Sales Ontology quality plan

This document is the regression contract for the product. It turns the main
user journeys into repeatable checks and records what “good” means before a
change ships.

## Goal

Keep the Sales Ontology fast, understandable and safe across desktop and
mobile. A user should be able to find a record, decide what needs attention,
take the next action and recover from a mistake without learning the data
model first.

## Personas

- **Sales representative:** works deals, contacts and tasks, mostly from a
  laptop and phone.
- **Revenue leader:** reviews pipeline health, dashboards and team activity.
- **Revenue operations administrator:** configures fields, pipelines,
  automations, AI, access and governance.

## Critical stories and acceptance checks

| ID | Story and flow | Acceptance |
| --- | --- | --- |
| QA-AUTH-01 | Sign in, sign out and open a protected route | Inputs have visible labels and autocomplete; invalid credentials explain the failure; protected routes redirect safely. |
| QA-NAV-01 | Move between primary routes on desktop and mobile | Current location is visible; desktop navigation can collapse; mobile bottom navigation never covers the last actionable content. |
| QA-OV-01 | Review revenue and work requiring attention | Scope, date range and aggregation controls update the view; overdue and open tasks are distinct; charts never overflow their cards. |
| QA-REC-01 | Search, filter, sort and page companies or contacts, then open a record | Shareable filters survive refresh; large collections paginate; row actions have accessible names; the record sheet works without horizontal page overflow. |
| QA-DEAL-01 | Filter deals, switch table/Kanban, move a stage and create or complete a task | Filters are discoverable and reversible; mobile Kanban shows one readable stage at a time; task creation is visible before typing; overdue state is explicit. |
| QA-DASH-01 | Browse mine/public dashboards, create one, add/reorder/resize a widget, then archive it | Dashboard and widget lifecycle actions are discoverable; destructive actions require confirmation; the grid becomes one column on mobile. |
| QA-AUTO-01 | Create a rule or webhook and choose its events | Event names come from a searchable catalog; an empty result explains itself; selected events and draft state are obvious; secrets are shown once. |
| QA-STUDIO-01 | Configure a pipeline, field or relation | Lists are read-first; editing is explicit and cancelable; long option sets are searchable; stages can be reordered without ambiguous buttons. |
| QA-USERS-01 | Find a user, inspect access, edit it and move between pages | The default view is read-only and compact; only one user is edited at a time; every control has a label; ten users or fewer render per page. |
| QA-SET-01 | Navigate settings and set currency, AI provider/model and credentials | Sections are grouped and collapsible on desktop, compact on mobile; secrets are never echoed after storage; unavailable integrations remove only their capability. |
| QA-RESP-01 | Exercise each route at 390, 768 and 1440 CSS pixels | No global horizontal overflow; dialogs and sheets remain operable; touch targets and fixed navigation respect safe-area padding. |
| QA-A11Y-01 | Complete primary flows with keyboard and an accessibility tree | Focus is visible; dialogs trap and restore focus; controls have names; status is not communicated by color alone. |

## Release procedure

1. Run focused package checks while changing a flow.
2. Exercise the relevant story at desktop and mobile widths against local API
   and seeded data.
3. Run app type, lint and test gates, then the repository-wide gates for a
   cross-cutting release.
4. Review the diff for accessibility, accidental secrets, customer data,
   destructive behavior and unnecessary client work.
5. Deploy, repeat the smoke journeys in production and record any exceptions
   in the handoff.

## Baseline found on 2026-08-03

- All primary authenticated routes loaded at 1440×900 and 390×844 without a
  framework error overlay or global horizontal overflow.
- User management rendered every user as an always-open form, produced many
  unnamed controls and had no pagination.
- The activity composer hid its submit action until text existed, making task
  creation difficult to discover.
- Automation search could leave a blank bordered area that looked broken.
- Dashboards supported creation and widget removal but exposed no workspace
  archive action.
- Email sign-in contained a personal default value and placeholder-only fields.

These findings are regression cases, not one-time visual observations.
