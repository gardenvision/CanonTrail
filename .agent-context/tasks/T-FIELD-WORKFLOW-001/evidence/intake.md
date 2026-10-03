---
topic_id: field-workflow-intake-001
stand: "2026-10-01"
status: reviewed-intake
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [src/context.ts, src/context-inspection.ts, src/cli.ts]
read_if_task_touches: [field workflow improvements]
primary_systems: [task authoring, context compilation]
safe_to_edit: [Keep consumer details private; distinguish reports from reproduced behavior.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Abstract field-feedback intake

The maintainer requested this intake on 2026-10-01. A bounded read-only scan of
58 Markdown report/closure/feedback/route candidates found 34 relevant documents;
selected CanonTrail passages, raw hashes, timestamps and the search scope are
recorded outside the public source tree. No claim of reading every project file,
chat, binary asset or report body is made. Source reports are consumer claims
until neutral reproduction or matching implementation establishes the mechanism.

| Finding | Assessment and action |
|---|---|
| Thousands of dirty paths made handoffs exceed receiving budgets. | Already addressed by the uncommitted compact-inventory work and its separate hardening task. Several consumers explicitly used the older built executable while newer source/docs were visible. Not a newly discovered failure of the corrected writer. |
| Package version and checkout HEAD did not identify the built CLI. | Confirmed conflicting source/runtime observations. Document separate verified runtime and reviewed source identities; do not build shared consumers in place. |
| Repeated manual task/state/change authoring. | Current CLI has no task generator. Add a safe dry-run-first draft scaffold; it must not invent authority or passing checks. |
| Shader/programming sources were unsupported and copied into extra evidence. | Current text allow-list confirms the gap. Add explicit code formats with byte validation. Engine asset/prefab extensions may contain binary data and stay outside this slice. |
| `context excerpt --task` before the first lock fails. | Code requires the lock for a selection comparison. Keep that truthful boundary but point the user to the task-free first excerpt. |
| Global peer drift, open acceptance, missing references and exact-preview staleness. | Reports demonstrate separated task/project results and honestly open review gates. Do not weaken them. Improve authoring order and planned-output guidance instead. |
| Large taskboard/handbook and repeated phase context. | Projects need curated routing, reviewed section selection and compact evidence. No measured provider-token savings or automatic semantic splitting is established. |
| Organic coordinator and shared editor windows. | External workflow ownership remains unchanged; no agent scheduler or lease service is introduced by this task. |

## Evidence boundary

Stable consumer runtime in the observed reports was generally the prior built
revision, with some explicit source-only preview uses. These are not interchangeable.
New regression fixtures must be synthetic and retained in the distribution; the
private report corpus and user-specific paths must not be copied into examples.
Implementation and test outcomes will be recorded separately after execution.

An apparently historical consumer closure report was also compared with its
current task state: that state still said `review`. Its active freshness checks
are therefore not evidence that the historical-lock policy is broken. Report
wording alone must not decide a task's lifecycle classification.

## Separate dependency follow-up

The isolated install exposed one high-severity dependency entry for pinned
`fast-uri` 3.1.6 through Ajv. Three upstream advisories apply to that version:
[authority-port handling](https://github.com/advisories/GHSA-qw65-cvwx-89v3),
[bracketed host parsing](https://github.com/advisories/GHSA-58mr-gqgx-xq4g), and
[host normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).
Upstream [3.1.8](https://github.com/fastify/fast-uri/releases/tag/v3.1.8) covers
the published fixed ranges. This is not a demonstrated exploit in CanonTrail.
No dependency, runtime or package lock was changed in this bounded task;
publication must not portray its dependency audit as clean. A focused dependency
update and its validation remain separate work.
