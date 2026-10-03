import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./indexer.js";
import { compareCodeUnits } from "./ordering.js";

export type IntegrationId = "superpowers" | "gsd-core" | "gsd-pi";

export interface CompatibilityArtifact {
  path: string;
  role: "specification" | "plan" | "requirements" | "roadmap" | "state" | "context" | "summary" | "verification" | "acceptance" | "review" | "other";
  authority: "external-operational" | "external-design";
  canonical: false;
}

export interface CompatibilityIntegration {
  id: IntegrationId;
  detected: boolean;
  roots: string[];
  artifacts: CompatibilityArtifact[];
  policy: {
    ownership: "external-tool";
    canontrailWritesSource: false;
    promotionRequiredForCanonicalTruth: true;
  };
}

export interface CompatibilityReport {
  root: string;
  integrations: CompatibilityIntegration[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function roleFor(relativePath: string, integration: IntegrationId): CompatibilityArtifact["role"] {
  const normalized = relativePath.toLowerCase();
  const basename = path.posix.basename(normalized);
  if (integration === "superpowers") {
    if (normalized.includes("/specs/")) return "specification";
    if (normalized.includes("/plans/")) return "plan";
  }
  if (basename === "requirements.md") return "requirements";
  if (basename.includes("roadmap")) return "roadmap";
  if (basename === "state.md") return "state";
  if (basename === "context.md") return "context";
  if (basename.includes("verification")) return "verification";
  if (/(?:^|-)uat\.md$/.test(basename)) return "acceptance";
  if (basename.includes("review")) return "review";
  if (basename.includes("summary")) return "summary";
  if (basename.includes("plan")) return "plan";
  if (basename.includes("spec") || basename === "project.md") return "specification";
  return "other";
}

function supportedArtifact(filePath: string): boolean {
  return /\.(?:md|json|ya?ml)$/i.test(filePath);
}

async function collectArtifacts(
  root: string,
  integration: IntegrationId,
  sourceRoots: string[],
): Promise<CompatibilityArtifact[]> {
  const artifacts: CompatibilityArtifact[] = [];
  const maximum = 5_000;

  async function walk(directory: string): Promise<void> {
    if (artifacts.length >= maximum) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      if (artifacts.length >= maximum) break;
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = normalizePath(path.relative(root, absolutePath));
        if (!supportedArtifact(relativePath)) continue;
        const role = roleFor(relativePath, integration);
        artifacts.push({
          path: relativePath,
          role,
          authority: ["state", "context", "summary", "verification", "acceptance", "review"].includes(role)
            ? "external-operational"
            : "external-design",
          canonical: false,
        });
      }
    }
  }

  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = path.join(root, ...sourceRoot.split("/"));
    if (await exists(absoluteRoot)) await walk(absoluteRoot);
  }
  return artifacts.sort((left, right) => compareCodeUnits(left.path, right.path));
}

async function integration(
  root: string,
  id: IntegrationId,
  roots: string[],
): Promise<CompatibilityIntegration> {
  const detectedRoots: string[] = [];
  for (const sourceRoot of roots) {
    if (await exists(path.join(root, ...sourceRoot.split("/")))) detectedRoots.push(sourceRoot);
  }
  return {
    id,
    detected: detectedRoots.length > 0,
    roots: detectedRoots,
    artifacts: await collectArtifacts(root, id, detectedRoots),
    policy: {
      ownership: "external-tool",
      canontrailWritesSource: false,
      promotionRequiredForCanonicalTruth: true,
    },
  };
}

export async function detectCompatibility(rootInput: string): Promise<CompatibilityReport> {
  const root = path.resolve(rootInput);
  return {
    root,
    integrations: await Promise.all([
      integration(root, "superpowers", ["docs/superpowers/specs", "docs/superpowers/plans"]),
      integration(root, "gsd-core", [".planning"]),
      integration(root, "gsd-pi", [".gsd"]),
    ]),
  };
}

export function formatCompatibilityReport(report: CompatibilityReport): string {
  const lines = [`Compatibility scan: ${report.root}`];
  for (const integrationResult of report.integrations) {
    lines.push(
      `${integrationResult.detected ? "DETECTED" : "ABSENT"} ${integrationResult.id}: ${integrationResult.artifacts.length} artifacts`,
    );
  }
  lines.push("External workflow artifacts remain read-only and non-canonical until explicitly promoted.");
  return lines.join("\n");
}
