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
