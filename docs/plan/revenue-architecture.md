# Revenue Architecture

## Outcome

The CRM is a small, governed revenue operating system rather than a fixed set
of sales screens. A company can adapt the vocabulary and operating rules of its
revenue motion from a bounded ontology without turning the product into an
untyped database.

The product remains single-tenant. Business units and teams are governance
partitions inside the one installation, not organizations or tenant IDs.

## Ontology

The ontology is made of six explicit concepts:

| Concept | Responsibility |
| --- | --- |
| Element | A record with stable identity, lifecycle, ownership and audit metadata. |
| Class | The definition of an element type, including its human and agent vocabulary. |
| Attribute | A typed value on a class, with indexing, permissions and agent/API policies. |
| Relation | A typed edge between elements, with direction, inverse name and cardinality. |
| Policy | A rule governing visibility, mutation, transition, aggregation or automation. |
| Schema | A versioned, publishable set of compatible class, attribute, relation and policy definitions. |

System classes are Contact, Company, Deal, Revenue Account, Activity, Pipeline,
Pipeline Stage and Product. Custom classes extend the graph through the same
definition and permission model. The authentication `Account` remains a Better
Auth implementation detail; the commercial entity is named `RevenueAccount` in
code and “Conta” in the product.

Definitions use stable keys. Labels, descriptions and plural names are
presentation metadata and can change without breaking API consumers or
historical events. Material definition changes create a new schema version.
Draft definitions do not affect live records until published.

## Attributes

An attribute declares both its base type and its cardinality:

- scalar: text, number, currency, boolean, date, datetime, option, user and
  relation reference;
- list: text list, number list, option list, user list and relation-reference
  list.

Lists are ordered and deduplicated by their normalized value unless the
definition explicitly declares order meaningful. Clearing a value is different
from never having observed it. Default values apply only when a record is
created; they do not rewrite existing records when a definition changes.

Each mutation appends an attribute-history event containing the record, field
key, previous value, next value, actor, source, reason, timestamp and operation
identifier. The current JSON value is the fast read model; history is the
authoritative explanation of how it became current. Indexed projections remain
sparse and rebuildable from current values.

## Relations and Revenue Accounts

Revenue Accounts are optional per installation and can represent a buying
group, customer portfolio, household, franchise group or another commercial
aggregation. Enabling the class does not force existing companies, contacts or
deals into an account.

The supported graph includes, but is not limited to:

- Revenue Account to many Deals;
- Revenue Account to many Contacts;
- Revenue Account to many Companies;
- Contact to many Deals;
- Company to many Contacts and Deals.

Relation definitions choose one-to-one, one-to-many, many-to-one or
many-to-many cardinality and can require a primary edge. Relation writes are
validated transactionally in both directions. Records keep stable IDs when a
relation changes, and every create/delete/primary-change appends a lineage
event.

Account construction policies may be manual, rule-assisted or agent-assisted.
Rules can match normalized domains, identifiers or selected attributes. An
agent may propose an account or association with evidence and confidence, but
ambiguous identity changes require human approval.

## Lineage, duplicates and merge

Lineage is append-only and records record creation, attribute changes, relation
changes, lifecycle transitions, imports, attribution, automation decisions and
merges. Events share an operation ID so one user action can be reconstructed
across several records.

Duplicate handling has four steps:

1. Detection produces candidates, scores and evidence without changing data.
2. Preview selects a survivor and shows every field, relation and identity
   conflict.
3. A merge policy decides each conflict: keep survivor, use duplicate, keep the
   newest/oldest non-empty value, union a list, or provide an explicit value.
4. Execution moves or deduplicates relations, preserves every historical event,
   records aliases from retired IDs to the survivor and archives the duplicate.

Merge is transactional and idempotent. API reads of a retired ID resolve to the
survivor while exposing that resolution. Unmerge is not promised; lineage and
the preview make the operation auditable, and a future restorative workflow can
replay the recorded operation.

## Attribution and repeated conversion

Contact, Company, Deal and Revenue Account can expose governed attribution
attributes. The event stream distinguishes:

- first touch/source: immutable first known acquisition;
- current touch/source: the source relevant to the current conversion;
- first conversion: the first qualified conversion for the element;
- current conversion: the conversion that opened or influenced the active deal;
- conversion history: every subsequent entrance into a pipeline, including
  channel, campaign, UTM values, form/event, timestamp and linked deal.

Derived counters such as pipeline-entry count are projections of conversion
events, not values incremented independently. This keeps analytics explainable
after merges and attribution corrections.

## Pipelines and handover

A pipeline declares its revenue-motion type:

- `BOWTIE_FULL`: acquisition through sale and post-sale expansion/retention;
- `BOWTIE_LEFT`: acquisition and new-business stages only;
- `BOWTIE_RIGHT`: onboarding, adoption, retention and expansion only;
- `CUSTOM`: a governed stage sequence assembled from the same primitives.

Each stage declares its semantic phase, allowed roles, accountable role and
optional default owner rule. A transition can require fields, activities,
approvals or a handover. Handover rules define the source role, destination
role, assignment strategy, service-level target and whether acceptance is
required. SDR to Closer and Closer to Account Manager are presets, not hardcoded
special cases.

Stage and role history is append-only. A pipeline version is immutable after it
has live deals; edits publish a successor and define how open deals migrate.

## Dashboards

A visualization definition contains a metric, population, filters, time grain,
grouping, comparison, display type and presentation options. Definitions are
provider-neutral. A ChartCDN adapter turns the validated definition and query
result into a rendering payload; ChartCDN syntax never becomes the ontology or
query API.

Standard views include:

- conversion rate and elapsed time from entry to outcome;
- rate and elapsed time between every pair of adjacent stages;
- funnel or bowtie flow by pipeline version;
- breakdown by source/channel, owner, role, team, business unit, UTM values,
  product and governed Deal attributes;
- repeated conversion and pipeline-entry frequency by contact/account;
- cohort and time-series views with explicit timezone and date semantics.

Every tile exposes its metric definition and drill-down population. Agents use
the same definition contract to create, explain and revise dashboards.

## Human and agent experience

Revenue Architecture Studio is the dedicated environment for classes,
attributes, relations, pipelines, products, policies, schema versions and
dashboard definitions. It separates draft design, impact preview and publish.
Human language explains consequences before low-level configuration fields.

Agent tools use stable keys and typed payloads. Read/write policy is enforced by
the same API services used by humans; an agent does not receive a privileged
database path. Proposals include evidence, confidence and expected impact.
Destructive or ambiguous changes require approval.

## Integration surface

tRPC remains the authenticated application API. Credential-authenticated REST,
Streamable HTTP MCP, CLI commands and webhooks expose the same service-layer
operations and idempotency semantics for supported public workflows. Webhook
events include schema version, operation ID, actor, element aliases and enough
lineage context for a consumer to reconcile a merge.

The first public surface covers account/association upsert, conversion events,
deal transitions, merge preview/execution and dashboard-definition export.

## Implemented architecture

`RevenueAccount` is the optional commercial Conta. It remains distinct from the
Better Auth `Account` credential model. `RevenueAccountConfig` governs whether
the capability is enabled and the contact, company and deal cardinalities.
Native values and Fields-backed scalar/list attributes share the same history,
permission and indexed-projection rules.

The current service surfaces are:

- `revenueAccounts` tRPC plus credential REST/MCP for configuration, records,
  relations, history, duplicate suggestions, merge preview and approved merge;
- versioned pipeline blueprints with full/left/right bowtie and custom motion,
  semantic stages, role responsibility, transition and handover rules;
- append-only attribution events and projections for Contact, Company, Deal and
  Revenue Account, combined with existing Activity and LeadSubmission history;
- authorized revenue analytics and versioned dashboard definitions with
  standard templates and provider-neutral Chart.js/ChartCDN rendering payloads;
- the `ontology` journal for immutable draft/published/archived snapshots,
  deterministic checksums and impact previews around the live Fields schema;
- Revenue Architecture Studio and governed Eve tools for human and agent use;
- public CLI/MCP/API operations and durable DomainEvent webhooks with stable
  operation identifiers.

The ontology journal is an immutable contract and audit layer. Publishing a
snapshot does not create a second record store: the existing Fields tables stay
the runtime schema and their APIs remain the bounded customization surface.

## Delivery checkpoints

1. **Foundation:** versioned definitions, Revenue Account graph, scalar/list
   attributes, lineage and merge with migrations, API and tests.
2. **Revenue motion:** pipeline types, semantic stages, role ownership,
   handovers, transition policies and version history.
3. **Intelligence:** attribution/conversion events, projections, standard
   metrics and provider-neutral dashboard definitions with ChartCDN adapter.
4. **Studio:** dedicated architecture workspace, impact previews, guided merge,
   account graph and dashboard builder.
5. **Agent and integrations:** Eve tools, approvals, REST/MCP/CLI/webhooks and
   idempotent external workflows.
6. **Release:** data migration, full repository gates, accessibility and browser
   checks, preview smoke, production migration, deploy and production smoke.

Each checkpoint must keep existing CRM flows usable, keep authorization at the
service boundary, record lineage for state changes and ship with focused tests.
