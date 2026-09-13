---
topic_id: usage-constraints-worked-example
stand: "2026-09-06"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence:
    - test/usage-references.test.ts
read_if_task_touches:
  - usage constraint syntax
primary_systems:
  - metadata validation
safe_to_edit:
  - Keep examples aligned with protocol section 3.1 and regression cases.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
  - "`ARTIFACT_PROTOCOL.md`"
  - "`legacy/Example.md` illustrates a narrative mention, not declared verification."
---

# Usage constraints: text is not evidence

The first two header entries declare the same existing repository-root-relative file, once bare and once code-formatted. The third is preserved explanation. It does not assert that legacy/Example.md exists and is not used as implementation evidence.

To require an explained file to exist, write two entries: a standalone path and its separate descriptive sentence. A directory reference ends in a slash; bare known-extension filenames and directories may include spaces. For a standalone filename containing square brackets, put the complete path in one single-backtick span. Narrative Markdown links are preserved text, not parsed dependencies in this field.

verification.evidence and supersedes keep their existing validation behavior. Passing usage-guidance validation does not establish semantic correctness, implementation verification or canonical promotion.
