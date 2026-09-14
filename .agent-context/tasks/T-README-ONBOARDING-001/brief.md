---
topic_id: task-readme-onboarding-001
stand: "2026-09-14"
status: completed
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence: [.agent-context/tasks/T-README-ONBOARDING-001/evidence/local-checks.json, .agent-context/tasks/T-README-ONBOARDING-001/evidence/hosted-checks.json]
read_if_task_touches: [README onboarding redesign]
primary_systems: [public onboarding]
safe_to_edit: [Record verified outcomes and keep publication separate from local preparation.]
do_not_use_instead: [README.md, VISION.md]
---

# Clear first use and a visual explanation

## Authorized outcome

The maintainer requested a more attractive GitHub introduction, a simple explanatory diagram, easier first use, and a copyable prompt for an agent of the reader's choice. Work from the clean public source, not private development history.

## Approach and boundaries

- README remains the concise landing page and first-use owner. Move detailed everyday command/reference material into a linked usage guide without weakening safety or resume ordering.
- A repository-native, accessible diagram shows project knowledge, a task-sized selection, agent work, and evidence-backed continuation. It must not imply that the CLI runs the agent or automatically understands the project.
- Build from the published source Alpha; keep tool and target separate. The agent prompt handles setup, existing installations and validated resume distinctly.
- Preserve runtime, schemas, dependency metadata, existing examples, historical task records, release tag/assets and private history. No npm publication, real-project adoption or migrations.
- Medium risk: reversible public documentation/presentation changes, not a changed runtime or release contract. Local self-review plus rendered inspection and CLI probes are required; independent review is not claimed.

## Presentation decision after inspecting GitHub

GitHub renders the governed YAML header as a large table before the title. Keep root README as the sole authored source, and generate `.github/README.md` without frontmatter and with correctly rebased relative links. Only this generated projection is excluded from governed discovery; the source and every other rule remain governed. GitHub documents that `.github/README.md` takes precedence on the repository landing page. A deterministic generator and regression check prevent silent projection drift; this is not a second documentation owner. Detailed usage remains separately owned by `docs/usage.md`. Runtime/source contracts and package dependencies do not change.

## Acceptance and verification plan

1. A reader can identify the purpose, what their agent does, and Alpha limits without reading a command manual.
2. The diagram is legible at desktop and mobile sizes, has an accessible text alternative, and contains no remote scripts/fonts.
3. A copyable prompt uses exact tool/target placeholders, does not repeat init on an adopted project, stops on conflicts, and establishes receiving context before resumed work.
4. Build/help and isolated adoption probes confirm the shown commands. Relative links and preserved advanced guidance are checked; repository validation and named completion must pass.

## Verified outcome and publication boundary

Started from public commit `a9d71ec91e127c6cec0b1f1a42130e275f82ab84` on `codex/readme-onboarding`; clean worktree confirmed before task creation. Landing page, generated projection, responsive diagrams and relocated usage guide are implemented. Desktop/light/dark and 390/320-pixel local renders have no page overflow; text bounds fit and the diagrams were visually inspected. Isolated CLI adoption, preservation, conflict and local-link probes pass. The three new projection tests pass. Local limitations remain explicit: five existing 15-second audit timeouts in the initial focused run (9 pass, 1 skip overall), and a full-suite harness stopped at 600 seconds. No test assertion or deadline was weakened.

Commit `d61422b7254e85789810f5098b31dba85ecda494` then passed the full hosted test/build/validation chain on Windows and macOS with Node 24, and Linux with Node 24 and 20.19, including the aggregate check. GitHub's actual preferred README, anchor targets, responsive picture and raw diagram/projection bytes were checked at that exact revision. The receipts distinguish author visual review, isolated CLI probes and hosted execution. They do not claim an independent agent review or measured token savings.

All acceptance cases are closed by these results. Final closure metadata and the small path-copy clarification must still pass their own exact-commit hosted checks before updating `main`; the earlier CI receipt must not be reused as evidence that a later revision ran. Refresh only this task's context and retain all historical locks. No user project, private history, npm publication or old release tag is in scope.
