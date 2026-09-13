---
topic_id: gsd-capability-installation
stand: "2026-08-29"
status: supported-adapter
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - integrations/gsd/canontrail/capability.json
    - docs/integrations.md
read_if_task_touches:
  - install CanonTrail with GSD
  - GSD capability support
primary_systems:
  - GSD compatibility
safe_to_edit:
  - Keep the tested GSD engine range and installation command current.
do_not_use_instead:
  - docs/integrations.md
---

# CanonTrail capability for GSD

This optional GSD capability adds two instruction steps:

- `plan:pre` prepares one bounded CanonTrail task context;
- `verify:post` closes evidence and runs the CanonTrail completion gate.

It does not modify `.planning/`, run GSD, execute application tests, or promote canonical documentation.

From the CanonTrail checkout, install the capability into the target project with current GSD:

```text
gsd capability install <CANONTRAIL_HOME>/integrations/gsd/canontrail --scope project
```

Review GSD's executable/instruction-surface consent summary before accepting it. The supported manifest range is GSD `>=1.11.0 <2.0.0`; an unsupported version must fail closed rather than silently guessing hook behavior.

The target project must already have CanonTrail initialized and make the `canontrail` executable available, or document an exact `CANONTRAIL_HOME` invocation in its repository instructions.
