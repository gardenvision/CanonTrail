export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  detail?: string;
  /** Validator-produced drift classification, never trusted from an artifact. */
  context_drift?: { task_id: string; kind: "source-content" | "task-requirements" };
}

export interface ValidationStats {
  markdownDocuments: number;
  structuredArtifacts: number;
  schemas: number;
  errors: number;
  warnings: number;
}

export interface ValidationReport {
  /** Repository receipts are not automatically approved for current use. */
  resume_validation: { purpose: "retained-integrity" | "current-use"; current_use_packet_path: string | null };
  root: string;
  ok: boolean;
  diagnostics: Diagnostic[];
  stats: ValidationStats;
}

export interface CanonTrailConfig {
  version: 1;
  indexPath: string;
  schemaPath: string;
  excludePaths: string[];
  governedPaths: string[];
  requireFrontmatterForAllMarkdown: boolean;
  requireTopicIdForCanonical: boolean;
  allowMissingReferences: string[];
}

export interface GovernedHeader {
  artifact_id?: string;
  artifact_kind?: string;
  topic_id?: string;
  stand: string;
  status: string;
  truth_level: "canonical" | "design-target" | "active-snapshot" | "draft" | "historical";
  verification: {
    state: string;
    evidence: string[];
  };
  read_if_task_touches: string[];
  primary_systems: string[];
  safe_to_edit: string[];
  do_not_use_instead: string[];
  supersedes?: string[];
  [key: string]: unknown;
}

export interface DocumentRecord {
  absolutePath: string;
  path: string;
  source: string;
  body: string;
  header?: GovernedHeader;
  parseError?: string;
}

export interface ContextIndexDocument {
  path: string;
  content_hash: string;
  stand: string;
  status: string;
  truth_level: GovernedHeader["truth_level"];
  verification_state: string;
  read_if_task_touches: string[];
  primary_systems: string[];
  do_not_use_instead: string[];
  artifact_id?: string;
  artifact_kind?: string;
  topic_id?: string;
}

export interface ContextIndex {
  version: 1;
  hash_algorithm: "sha256";
  root_hash: string;
  documents: ContextIndexDocument[];
}
