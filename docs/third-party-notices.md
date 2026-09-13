---
topic_id: canontrail-third-party-inventory
stand: "2026-09-13"
status: source-distribution-inventory
truth_level: draft
verification: {state: unverified, evidence: [package.json, package-lock.json, LICENSE.txt]}
read_if_task_touches: [third-party notices, distribution contents]
primary_systems: [release operations]
safe_to_edit: [Recheck against the actual distributed files and locked dependency versions.]
do_not_use_instead: [LICENSE.txt]
---

# Third-party dependency inventory

CanonTrail's own materials use MIT except where another license is stated. Dependencies retain their original terms; this inventory neither replaces their license texts nor relicenses them. The source distribution does not include `node_modules`. The TypeScript build does not bundle dependencies, and no `bundledDependencies` list is configured.

The current lockfile declares four direct and four transitive runtime packages. Their matching license files were inspected in the local installed dependency set during the maintainer content audit:

| Runtime package | Locked version | Relationship | License |
| --- | --- | --- | --- |
| ajv | 8.20.0 | direct | MIT |
| ajv-formats | 3.0.1 | direct | MIT |
| commander | 15.0.0 | direct | MIT |
| yaml | 2.9.0 | direct | ISC |
| fast-deep-equal | 3.1.3 | transitive | MIT |
| fast-uri | 3.1.6 | transitive | BSD-3-Clause |
| json-schema-traverse | 1.0.0 | transitive | MIT |
| require-from-string | 2.0.2 | transitive | MIT |

When redistributing these packages, preserve their actual copyright and permission/license notices. BSD-3-Clause also addresses binary redistribution notices and endorsement. Reference terms: [MIT](https://opensource.org/license/mit), [ISC](https://opensource.org/license/isc), [BSD-3-Clause](https://opensource.org/license/bsd-3-clause).

Including optional platform variants, the lockfile has 134 dependency entries: 93 MIT, 23 Apache-2.0, two BSD-3-Clause, twelve MPL-2.0, three ISC and one 0BSD. The twelve MPL entries are Lightning CSS development tooling and its platform variants, not shipped runtime code in the curated source. Their presence does not itself relicense CanonTrail's separate source. A future redistribution of tooling or binaries must inspect its actual contents and relevant obligations. [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

GSD/Superpowers/provider bridges are CanonTrail integration instructions; referenced upstream tools are not included or relicensed. Do not claim that this metadata inventory establishes every file's legal provenance or that all optional development-platform notices were installed and reviewed. Dependency changes and new distribution formats require an updated inventory. See `docs/release-checklist.md` for publication gates.
