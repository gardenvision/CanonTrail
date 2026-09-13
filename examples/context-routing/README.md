---
topic_id: coherent-routing-example
stand: "2026-09-06"
status: current
truth_level: active-snapshot
verification:
  state: internally-reviewed
  evidence:
    - test/context-routing-precision.test.ts
read_if_task_touches:
  - coherent context routing
primary_systems:
  - context compiler
safe_to_edit:
  - Keep this example aligned with the executable routing tests.
do_not_use_instead:
  - ARTIFACT_PROTOCOL.md
---

# Coherent routing signals

This is a synthetic billing example, not an observation from a deployed billing product. For the task "Inspect InvoiceTotalsCalculator subtotal and roundLineAmount", compare these metadata signals:

| Metadata | Routing result | Reason |
|---|---|---|
| primary_systems: InvoiceTotalsCalculator | Strong | Complete multi-term name in the task. |
| primary_systems: InvoiceTotalsExporter | Weak | Invoice and totals are shared, but this is a different system. |
| read_if_task_touches: invoice totals rounding | Strong | At least two distinct task terms match within one topic trigger. |
| Separate entries: invoice layout; network totals | Weak | Isolated matches from different topics are not combined. |
| primary_systems: storage, for a storage task | Weak | The existing one-term threshold still applies. |

The complete name is matched at lexical-unit boundaries: InvoiceTotalsCalculatorProxy does not silently become InvoiceTotalsCalculator. Variants with the same normalized word sequence, including natural words and snake_case, remain recognizable. Existing ASCII CamelCase splitting is retained; word boundaries lost in a flattened all-lowercase/all-uppercase identifier are not reconstructed. A task sentence cannot be joined to the next acceptance criterion to manufacture a name.

Strong canonical sources are required. All design-target sources and weak canonical sources are optional unless an explicit requirement or evidence citation independently requires them. Multiple documents may legitimately declare the same complete system; this algorithm does not infer which one is the sole owner.

A generous budget still loads optional candidates. To require a small but indispensable source, use required_context_sources; for one-run expansion use --include. A too-small budget fails before replacing the accepted lock. Declared references, source hashes, omissions and historical locks retain their existing contracts.

The matcher does not understand natural-language negation: "do not change InvoiceTotalsCalculator" still mentions that complete system. Nor does it infer synonyms, dependencies, or whether the metadata itself is substantively correct. These limits are reasons to keep explicit required context and evidence-backed task review, not claims of automatic semantic retrieval.
