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

## Schema gap for persistence

The current `Pipeline` and `PipelineStage` models contain no funnel-type,
role-policy or handover-rule storage. The API therefore deliberately does not
pretend that blueprint input was saved and does not use an in-memory registry.
The `describe` response marks these policies as `configured: false` and lists
the gap.

The follow-up ontology migration should add, at minimum:

1. a versioned funnel type on `Pipeline` (`full_bowtie` or `side_bowtie`);
2. a stage policy (allowed roles, responsible role and optional transition
   allow-list) keyed by `PipelineStage`;
3. explicit, auditable handover rules keyed by source/target stage and role;
4. immutable policy snapshots or a lineage link so reports can explain which
   rules were active when a deal moved.

Until then, existing `PipelineStageType` plus `STAGE_CHANGE` activities remain
the source of truth for outcome topology and historical transitions.
