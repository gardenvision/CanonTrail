---
topic_id: validation-memory-hosted-platform-verification
stand: "2026-10-09"
status: current
truth_level: active-snapshot
verification:
  state: reviewed
  evidence: [src/validator.ts, test/validation-memory.test.ts]
read_if_task_touches: [validation memory, retained continuity history, platform verification]
primary_systems: [repository validation, platform compatibility]
safe_to_edit: [Bind execution claims to actual commits and retain capability skips.]
do_not_use_instead: [ARTIFACT_PROTOCOL.md]
---

# Exact implementation platform receipt

Implementation commit: `8570c44df6ece76bd78d1f1abbdf7717d1a9014e`.
Parent: `1567677c19eee656ea6878631014b54e1226b5ca`. All runs below completed
successfully. The implementation source, regression test and built validator
still equal the independent review's SHA-256 identities.

- [Pull-request matrix and strict aggregate](https://github.com/gardenvision/CanonTrail/actions/runs/37987385992).
- [Pull-request completion gate](https://github.com/gardenvision/CanonTrail/actions/runs/37987386183).
- [Push matrix and strict aggregate](https://github.com/gardenvision/CanonTrail/actions/runs/37987342199).

Both matrices produced these measured full-suite results. Each host ran and
passed all seven new validation-memory cases; none of those seven was skipped.

| Host | Actual Node | Passed | Skipped | Failed | Total |
| --- | --- | ---: | ---: | ---: | ---: |
| Windows x64 | 24.21.0 | 1,022 | 5 | 0 | 1,027 |
| Linux x64 | 24.21.0 | 1,020 | 7 | 0 | 1,027 |
| Linux x64, declared Node floor | 20.19.6 | 1,020 | 7 | 0 | 1,027 |
| macOS arm64 | 24.20.0 | 1,020 | 7 | 0 | 1,027 |

The skipped case names and capability JSON reports are retained with downloaded
raw evidence. Skips are not passes. Windows reported case-insensitive,
Unicode-form-sensitive paths and available short names; Linux reported
case-sensitive, Unicode-form-sensitive paths; macOS reported case-insensitive,
Unicode-form-insensitive paths with NFC preserved. File/directory links were
available on all observed hosts; POSIX mode bits were not applicable on Windows.
These observations do not establish support for every filesystem or OS setup.

The consolidated receipt SHA-256 is
`bd5ea128e8260020cbc0a7861b114a1c1b4fd86f655413329c9f94ddc5f00b40`.
It includes a manifest of 25 locally retained raw run/report files outside the
distributable tree. GitHub's artifact metadata digests are not claimed as locally
recomputed ZIP hashes. The receipt records actual source revision and jobs, not
an approval inferred from self-hashes or a source-map entry wrapper alone.

This closes the technical platform gate for the exact implementation. A later
metadata-only closure still requires its own CI before protected merge; the
merged main revision requires its own observed checks. Those future runs are
not asserted in this source snapshot. No consumer files or schemas have been
changed, no shared runtime has been replaced, and no tag/npm release or canonical
promotion follows from these measurements.
