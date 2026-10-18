---
topic_id: file-preflight-worked-example
stand: "2026-10-18"
status: draft
truth_level: draft
verification: {state: unverified, evidence: [examples/file-preflight/subject.md, docs/file-preflight.md]}
read_if_task_touches: [file preflight worked example]
primary_systems: [file preflight]
safe_to_edit: [Keep the example executable and non-approving.]
do_not_use_instead: [docs/file-preflight.md]
---

# File preflight example

From the built CanonTrail source checkout:

```sh
node dist/cli.js check examples/file-preflight/subject.md . --json
```

`report.json` records that synthetic file's result with only `root` normalized to
`.` for portability. It is an illustrative report, not an operational receipt.
The draft remains unverified. Change or remove its `verification` header mapping
in a disposable copy: preflight must fail with the missing field named, without
writing an index or touching other tasks. Repository validation still fails for
unrelated defects even if this one file passes.
