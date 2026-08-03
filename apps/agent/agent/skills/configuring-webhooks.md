---
description: Use when a user asks which webhook events to subscribe to, what an event type is called, or how to wire an outside system to CRM changes.
---

# Configuring webhooks

Webhooks live in Settings → Automations. An endpoint has a name, an HTTPS URL,
a set of `eventTypes`, and an optional business unit that scopes which records
it hears about. The API accepts **any** event type string on an endpoint — the
catalog below is what the platform emits today, not a limit on what can be
subscribed.

## The catalog, as of this writing

The authoritative list is `AUTOMATION_EVENT_CATALOG` in
`apps/api/src/automations/automation-events.ts` — trust it over this file when
they disagree.

- `lead.submitted` — a lead arrives through the public ingestion API.
- `company.created`
- `contact.created`
- `contact.became_mql`
- `contact.lifecycle_changed`
- `deal.created`
- `deal.stage_changed`
- `revenue-conversion.recorded` — a governed conversion is attributed.
- `revenue-account.created` / `revenue-account.updated` /
  `revenue-account.archived` / `revenue-account.merged`
- `revenue-account.relation.attached` / `revenue-account.relation.detached`

## Mapping what the user wants to event types

Users describe outcomes, not event names. Translate:

- "quando entrar um lead" → `lead.submitted`
- "quando alguém virar MQL" → `contact.became_mql`
- "mudança de estágio no funil de vida" → `contact.lifecycle_changed`
- "quando registrar receita/conversão" → `revenue-conversion.recorded`
- "qualquer coisa sobre revenue accounts" → the four `revenue-account.*`
  events, plus the two `revenue-account.relation.*` ones if links matter.

If what they want is **not emitted yet**, say so plainly. The subscription can
be created now with a forward-looking name — the convention is `entity.action`
in lowercase with underscores — but do not imply an event fires today unless it
is in the authoritative catalog.

## What to hand back

A ready-to-paste configuration, not prose: the endpoint name, the exact
`eventTypes` list, and which business unit (or Global) it should scope to.
Remind them the URL must be HTTPS and that the receiving side should be
idempotent — the same event can be delivered more than once.
