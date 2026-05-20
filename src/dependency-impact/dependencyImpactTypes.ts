/**
 * Tipos centrais da feature Dependency Change Impact.
 * Todos os dados são extraídos do workspace real — nunca inventados.
 */

export type DependencyEcosystem = 'java' | 'node' | 'python' | 'database' | 'infra' | 'unknown';
export type DependencyChangeType = 'runtime' | 'framework' | 'dependency' | 'build-tool' | 'plugin';
export type DependencyImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DependencyConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';
export type DependencyApprovalRecommendation = 'APPROVE' | 'REVIEW' | 'BLOCK';

export type CompatibilityCategory =
  | 'language-runtime'
  | 'framework'
  | 'dependency'
  | 'plugin'
  | 'build-tool'
  | 'source-code'
  | 'infra'
  | 'test'
  | 'database';

// ─── Evidence ────────────────────────────────────────────────────────────────

export interface DepEvidenceRef {
  filePath: string;
  line?: number;
  matchedText?: string;
  confidence: DependencyConfidence;
  reason: string;
}

// ─── Baseline ────────────────────────────────────────────────────────────────

export interface DependencyEntry {
  name: string;
  version: string;
  scope?: string; // 'compile' | 'test' | 'provided' | 'runtime' | 'dev' | 'peer'
  evidenceRefs: DepEvidenceRef[];
}

export interface DependencyBaseline {
  projectId: string;
  projectKind: string;
  projectRoot: string;
  language: string;
  runtimeVersion: string;
  runtimeVersionConfidence: DependencyConfidence;
  frameworkVersions: Record<string, string>;
  packageManagers: string[];
  buildTools: string[];
  dependencies: DependencyEntry[];
  devDependencies: DependencyEntry[];
  plugins: DependencyEntry[];
  lockfiles: string[];
  infraRuntime: InfraRuntimeInfo;
  evidenceRefs: DepEvidenceRef[];
  detectedAt: string;
}

export interface InfraRuntimeInfo {
  dockerBaseImages: string[];
  ciJavaVersion?: string;
  ciNodeVersion?: string;
  ciPythonVersion?: string;
  nvmrcVersion?: string;
  pythonVersionFile?: string;
  evidenceRefs: DepEvidenceRef[];
}

// ─── Change Request ───────────────────────────────────────────────────────────

export interface DependencyChangeRequest {
  id: string;
  projectId?: string;
  ecosystem: DependencyEcosystem;
  changeType: DependencyChangeType;
  fromName: string;
  fromVersion: string;
  toName: string;
  toVersion: string;
  description: string;
  createdAt: string;
}

// ─── Finding ─────────────────────────────────────────────────────────────────

export interface CompatibilityFinding {
  category: CompatibilityCategory;
  title: string;
  description: string;
  severity: DependencyImpactLevel;
  confidence: DependencyConfidence;
  evidenceRefs: DepEvidenceRef[];
  recommendedAction: string;
}

export interface AffectedFile {
  file: string;
  reason: string;
  confidence: DependencyConfidence;
  evidenceRefs: DepEvidenceRef[];
  recommendedAction: string;
}

export interface AffectedDependency {
  name: string;
  currentVersion: string;
  issue: string;
  severity: DependencyImpactLevel;
  confidence: DependencyConfidence;
  evidenceRefs: DepEvidenceRef[];
  action: string;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface DependencyImpactResult {
  id: string;
  request: DependencyChangeRequest;
  impactLevel: DependencyImpactLevel;
  score: number; // 0–100
  affectedProjects: string[];
  affectedFiles: AffectedFile[];
  affectedDependencies: AffectedDependency[];
  compatibilityFindings: CompatibilityFinding[];
  breakingRisks: string[];
  migrationSteps: string[];
  requiredTests: string[];
  approvalRecommendation: DependencyApprovalRecommendation;
  evidenceRefs: DepEvidenceRef[];
  gaps: string[];
  generatedFiles: string[];
  createdAt: string;
}

// ─── Approval Pack ────────────────────────────────────────────────────────────

export interface DependencyApprovalPack {
  id: string;
  createdAt: string;
  request: DependencyChangeRequest;
  impactLevel: DependencyImpactLevel;
  approvalRecommendation: DependencyApprovalRecommendation;
  executiveSummary: string;
  risks: string[];
  criticalFiles: string[];
  criticalDependencies: AffectedDependency[];
  migrationPlan: string[];
  requiredTests: string[];
  rollbackPlan: string[];
  approvalCriteria: string[];
  blockingCriteria: string[];
  gaps: string[];
  generatedFiles: string[];
}
