# Revenue Architecture core

The commercial entity exposed as **Conta** is technically named `RevenueAccount`.
The existing Prisma `Account` model is Better Auth's OAuth credential record and
must remain separate; the two models are not interchangeable.

`RevenueAccount` is optional. The singleton `RevenueAccountConfig` controls the
feature and stores relation policies for contacts, companies and deals. Each
policy declares `ONE_TO_ONE`, `ONE_TO_MANY` or `MANY_TO_MANY` cardinality and
whether attach/detach is allowed. All records retain the normal CRM
business-unit, team and owner scope.

Custom attributes live in `customValues` and use the existing Fields object
definition (`revenue-accounts`) so scalar and list types, field permissions and
indexed projections follow the same rules as contacts, companies and deals.

Every write receives an `operationId`. Attribute history, lineage events and
merge rows can therefore reconstruct one multi-record action. Merge preview is
read-only; execution requires explicit policies for conflicting fields and
keeps the source row, relations and history as an archived lineage record.

The tRPC surface is under `revenueAccounts`: configuration, list, byId, create,
update, archive, associate, detach, history, mergeCandidates, mergePreview and
merge.

## Dashboard definitions

Dashboard definitions are versioned, provider-neutral records. Their typed
specification covers metric and population, governed filters, time range and
grain, groupings, comparison, visualization options and grid layout. Drafts can
be edited, publishing archives the previous published version, and archived
versions remain available for audit.

The `dashboard` router exposes CRUD, duplicate, version, publish, archive,
standard templates and a render operation. Rendering delegates to the existing
authorized analytics service and emits JSON-only Chart.js/ChartCDN data. The
standard templates cover conversion rate/time, stage rate/time, channel, owner,
UTM, deal-attribute and macro-bowtie views.

Public REST and MCP dashboard mutations use the same credential-scoped service;
publishing requires explicit confirmation. Conversion-rate definitions render a
real created/won/rate time series at the selected grain, while stage-time
definitions chart elapsed `avgDays` rows. Requested comparison modes remain
visible as unsupported metadata until a comparison window is materialized.
