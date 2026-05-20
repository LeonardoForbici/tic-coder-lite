export type ChangeRequestSource = 'manual' | 'impact-by-screen' | 'git-diff' | 'patch' | 'ai-generated';
export type ChangeVerdict = 'SAFE' | 'REVIEW_REQUIRED' | 'BLOCK';
export type ChangeRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EvidenceConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';
export type EvidenceSource =
  | 'scan'
  | 'graph'
  | 'risk'
  | 'file'
  | 'git-diff'
  | 'screen-impact'
  | 'reverse-engineering'
  | 'database-analysis'
  | 'plsql-analysis'
  | 'design-system'
  | 'tracer'
  | 'visor'
  | 'manual-input';
export type AntibodyCategory =
  | 'business-rule'
  | 'permission'
  | 'database'
  | 'plsql'
  | 'api-contract'
  | 'frontend-screen'
  | 'design-system'
  | 'integration'
  | 'security'
  | 'data-integrity';

export interface EvidenceRef {
  source: EvidenceSource;
  filePath?: string;
  line?: number;
  symbol?: string;
  matchedText?: string;
  confidence: EvidenceConfidence;
  reason: string;
}

export interface EvidencedString {
  value: string;
  evidenceRefs: EvidenceRef[];
  confidence: EvidenceConfidence;
}

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  source: ChangeRequestSource;
  relatedScreenImpactId?: string;
  screenshotPath?: string;
  url?: string;
  createdAt: string;
}

export interface ChangeTwinResult {
  id: string;
  request: ChangeRequest;
  predictedFilesToEdit: string[];
  predictedFilesToReview: string[];
  predictedImpactedModules: string[];
  predictedTests: string[];
  predictedRisks: string[];
  predictedFilesToEditEvidence: EvidencedString[];
  predictedFilesToReviewEvidence: EvidencedString[];
  predictedImpactedModulesEvidence: EvidencedString[];
  predictedTestsEvidence: EvidencedString[];
  predictedRisksEvidence: EvidencedString[];
  sourcesUsed: EvidenceRef[];
  gaps: string[];
  questions: string[];
  predictedEffort: {
    level: ChangeRiskLevel;
    label: string;
    minHours: number;
    maxHours: number;
    assumptions: string[];
  };
  implementationPlan: string[];
  safePrompt: string;
  confidenceSummary: string[];
  generatedFiles: string[];
}

export interface GitDiffHunk {
  file: string;
  oldStart?: number;
  oldLines?: number;
  newStart?: number;
  newLines?: number;
  header: string;
}

export interface GitDiffSummary {
  changedFiles: string[];
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  hunks: GitDiffHunk[];
  symbolsTouched: string[];
  possibleBehaviorChanges: string[];
  rawPatchPath: string;
  status: string[];
  isGitRepository: boolean;
  empty: boolean;
}

export interface DiffImpactResult {
  impactedModules: string[];
  impactedContracts: string[];
  impactedBusinessRules: string[];
  impactedPermissions: string[];
  impactedDatabaseObjects: string[];
  impactedScreens: string[];
  impactedApis: string[];
  impactedTests: string[];
  confidenceSummary: string[];
  sensitiveChanges: string[];
  evidenceRefs: EvidenceRef[];
  gaps: string[];
}

export interface LegacyAntibody {
  id: string;
  name: string;
  category: AntibodyCategory;
  severity: ChangeRiskLevel;
  rule: string;
  evidenceFiles: string[];
  evidenceRefs: EvidenceRef[];
  riskIfViolated: string;
  validationSteps: string[];
  detectionSignals: string[];
  relatedModules: string[];
  relatedTables: string[];
  relatedEndpoints: string[];
  relatedScreens: string[];
  confidence: EvidenceConfidence;
  createdAt: string;
}

export interface TriggeredAntibody {
  antibodyId: string;
  name: string;
  severity: ChangeRiskLevel;
  matchedFiles: string[];
  matchedSignals: string[];
  reason: string;
  evidenceRefs: EvidenceRef[];
  recommendation: string;
  confidence: EvidenceConfidence;
}

export interface ChangeSafetyReport {
  id: string;
  verdict: ChangeVerdict;
  riskLevel: ChangeRiskLevel;
  score: number;
  reasons: string[];
  changedFiles: string[];
  triggeredAntibodies: TriggeredAntibody[];
  impactedContracts: string[];
  impactedRules: string[];
  impactedDatabaseObjects: string[];
  requiredTests: string[];
  requiredTestDetails: RequiredTestItem[];
  rollbackPlanPath: string;
  aiReviewPromptPath: string;
  questions: string[];
  evidenceRefs: EvidenceRef[];
  gaps: string[];
  decisionReasons: string[];
  approvalActions: string[];
  generatedFiles: string[];
}

export interface RequiredTestItem {
  name: string;
  kind: 'existing' | 'recommended' | 'manual';
  filePath?: string;
  relatedFile?: string;
  relatedRisk?: string;
  reason: string;
  confidence: EvidenceConfidence;
  evidenceRefs: EvidenceRef[];
}

export interface GhostPatchItem {
  file: string;
  realFileExists: boolean;
  matchedLines: Array<{ line: number; text: string }>;
  evidence: EvidenceRef[];
  confidence: EvidenceConfidence;
  pseudoDiff?: string;
  recommendation?: string;
  risks: string[];
  relatedAntibodies: string[];
}

export interface GhostPatchResult {
  id: string;
  createdAt: string;
  request: ChangeRequest;
  items: GhostPatchItem[];
  gaps: string[];
  generatedFiles: string[];
}

export interface ChangeApprovalPack {
  id: string;
  createdAt: string;
  recommendation: 'APPROVE' | 'REVIEW' | 'BLOCK';
  firewallVerdict: ChangeVerdict | 'GAP';
  riskLevel: ChangeRiskLevel | 'GAP';
  score: number | null;
  changedFiles: string[];
  predictedFiles: string[];
  impactedModules: string[];
  impactedScreens: string[];
  impactedApis: string[];
  impactedDatabaseObjects: string[];
  triggeredAntibodies: TriggeredAntibody[];
  requiredTests: RequiredTestItem[];
  rollbackPlanPath: string;
  pendingQuestions: string[];
  approvalCriteria: string[];
  blockingCriteria: string[];
  evidenceRefs: EvidenceRef[];
  gaps: string[];
  generatedFiles: string[];
}

export interface LegacyImmuneContext {
  rules: string[];
  contracts: string[];
  permissions: string[];
  databaseObjects: string[];
  criticalModules: string[];
  criticalFiles: string[];
  gaps: string[];
  riskAreas: string[];
  traceabilityLinks: Array<{ source: string; target: string; reason: string }>;
  graphFiles: string[];
  screenFiles: string[];
  filesToEdit: string[];
  rawDocuments: Record<string, string>;
}

export interface ChangeFirewallSession {
  id: string;
  createdAt: string;
  baseDir: string;
  sessionDir: string;
}

export interface ChangeFirewallRunResult {
  session: ChangeFirewallSession;
  diff: GitDiffSummary;
  impact: DiffImpactResult;
  report: ChangeSafetyReport;
  triggeredAntibodies: TriggeredAntibody[];
  generatedFiles: string[];
}
