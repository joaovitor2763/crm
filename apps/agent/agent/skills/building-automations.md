---
description: Use when a user describes a CRM automation, asks for branches, conditions, delays or actions, or wants a workflow draft.
---

# Building CRM automations

Always call `read_automation_catalog` first. It is the source of truth for role,
business-unit, trigger, pipeline and stage IDs. Then call
`draft_automation_workflow` exactly once with the complete editable workflow.

Translate intent into a small tree:

- trigger: the domain event that starts the run;
- condition: an explicit `all`/`any` rule group with Yes and No branches;
- delay: a durable wait in minutes, hours or days;
- action: a governed CRM mutation.

Prefer explicit conditions over guessing. A contact action belongs under a
contact trigger and a deal action under a deal trigger. A `move_deal` stage ID
must come from the catalog. Create a task for human follow-up rather than
pretending the workflow can send an email. `emit_event` is for a deliberate
custom integration event, not arbitrary code.

The draft tool never saves or activates the workflow. Say that plainly: the
user still reviews the nodes, simulation and execution role before saving.
