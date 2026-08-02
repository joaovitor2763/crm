# Revenue architecture analytics slice

This slice adds the API contract for revenue analytics while keeping the
existing CRM schema unchanged.

## API surface

- `dashboard.analytics` returns a bounded, authorization-scoped result with:
  - stage reach and conversion funnel;
  - average/median time to terminal outcome;
  - conversion rate and elapsed time between stage transitions;
  - breakdowns by channel, seller, UTM source/medium/campaign/term/content and
    a selected `Deal.customValues` attribute;
  - first-touch attribution from contact UTM fields and current conversion
    attribution from `FORM_CONVERSION`/`EVENT_ATTENDANCE` activity metadata,
    including repeated pipeline-entry count/timestamps.
- Every view includes a JSON-only ChartCDN/Chart.js-compatible `chart` payload
  (`type`, `labels`, `datasets`, serializable options). No callbacks or class
  instances cross tRPC.
- `pipelines.describe` exposes the topology inferred from existing stage outcome
  types. `pipelines.validateBlueprint` and `pipelines.validateTransition`
  validate a proposed role/handover blueprint without writing it.

The analytics service selects pipelines and deals through the caller's
`AccessControlService` predicates, then applies the activity predicate again to
stage/conversion events. Contact attribution is filtered through the contact
predicate, and a deal-attribute cut first resolves the readable field schema;
only that one authorized key is projected from `customValues`. The pure builder
in `apps/api/src/dashboard/analytics.ts` is deterministic and reusable by
exports, jobs and CLI consumers.

## Persisted revenue motion

The pipeline persistence migration adds four wire-level funnel types:
`full_bowtie`, `left_side`, `right_side` and `custom` (the old
`side_bowtie` input remains a compatibility alias for `left_side`). Each stage
stores a stable key, semantic phase, allowed role keys, accountable role,
optional default role and an allow-list of next stages.

Publishing a blueprint creates a new `PipelineBlueprintVersion` and copies its
handover rules into `PipelineHandoverRule`. Handover rows carry source/target
roles, acceptance, SLA minutes and assignment strategy. The current version is
selected by `Pipeline.blueprintVersion`; snapshots are never updated in place.
Existing pipelines are backfilled with an empty policy snapshot, so their
legacy transitions remain permissive until a blueprint is published. Once a
pipeline has deals, outcome-type changes remain blocked while policy edits
publish a successor version, preserving the configuration used by historical
stage-change activities.
