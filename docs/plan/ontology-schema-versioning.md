# Ontology schema versioning

Fields remains the runtime source of the CRM ontology. The ontology journal
does not copy records or replace those tables: it stores immutable, reviewable
snapshots of object definitions, custom fields and options, relations, field
permissions, and Fields role policies.

Each schema definition has numbered `DRAFT`, `PUBLISHED`, and `ARCHIVED`
versions. A draft starts from the current published snapshot (or the runtime
schema when no version exists). Validation protects references, cardinality,
stable IDs/keys, option rules, and duplicate policy entries. A draft can be
previewed before publication; publishing archives the previous version and
marks exactly one version published in the same transaction. A partial unique
index is the database guard for that invariant.

The `ontology.*` tRPC procedures are authenticated and restricted to global
administrators. `publish` requires `confirmed: true`. Draft and publication
actions write an `AuditEvent` and a `DomainEvent` outbox row, so existing
automation/webhook delivery can observe the governance change without coupling
the Fields service to a transport.
