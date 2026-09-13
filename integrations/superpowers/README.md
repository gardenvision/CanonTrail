---
topic_id: superpowers-skill-installation
stand: "2026-08-29"
status: supported-adapter
truth_level: design-target
verification:
  state: internally-reviewed
  evidence:
    - integrations/superpowers/.claude-plugin/plugin.json
    - integrations/superpowers/skills/canontrail-feature-lifecycle/SKILL.md
    - docs/integrations.md
read_if_task_touches:
  - install CanonTrail with Superpowers
  - Superpowers skill support
primary_systems:
  - Superpowers compatibility
safe_to_edit:
  - Keep provider installation instructions thin and optional.
do_not_use_instead:
  - docs/integrations.md
---

# CanonTrail skill for Superpowers

The `canontrail-feature-lifecycle` skill composes with Superpowers without replacing or editing any Superpowers core skill.

For Claude Code, install `integrations/superpowers/` as a local plugin beside Superpowers. For runtimes that discover standard Agent Skills, copy or link only `skills/canontrail-feature-lifecycle/` into that runtime's documented skill directory.

The target project must already be initialized with CanonTrail and expose either the `canontrail` executable or one exact repository-documented `CANONTRAIL_HOME` invocation. `AGENTS.md` remains the always-on project policy; this skill supplies lifecycle timing and judgment.
