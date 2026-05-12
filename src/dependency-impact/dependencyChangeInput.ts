/**
 * Calcula score e nível de impacto de uma mudança de dependência/runtime.
 * Baseado em findings reais — nada inventado.
 */

import type {
  AffectedFile,
  CompatibilityFinding,
  DependencyApprovalRecommendation,
  DependencyBaseline,
  DependencyChangeRequest,
  DependencyImpactLevel
} from './dependencyImpactTypes';
import type { SourceCodeSignal } from './dependencyCompatibilityRules';

export interface ImpactScoreInput {
  findings: CompatibilityFinding[];
  affectedFiles: AffectedFile[];
  baselines: DependencyBaseline[];
  request: DependencyChangeRequest;
  sourceCodeSignals: SourceCodeSignal[];
}

export interface ImpactScore {
  score: number;
  impactLevel: DependencyImpactLevel;
  approvalRecommendation: DependencyApprovalRecommendation;
  breakingRisks: string[];
  gaps: string[];
}

const SEVERITY_WEIGHT: Record<DependencyImpactLevel, number> = {
  LOW: 5,
  MEDIUM: 15,
  HIGH: 30,
  CRITICAL: 50
};

export function calculateImpactScore(input: ImpactScoreInput): ImpactScore {
  const { findings, affectedFiles, baselines, request, sourceCodeSignals } = input;

  let score = 0;

  // Score from findings
  for (const f of findings) {
    score += SEVERITY_WEIGHT[f.severity] * (f.confidence === 'CONFIRMED' ? 1.0 : f.confidence === 'INFERRED' ? 0.7 : 0.3);
  }

  // Score from affected files
  score += Math.min(affectedFiles.length * 3, 30);

  // Score from source code signals
  score += Math.min(sourceCodeSignals.length * 5, 25);

  // Baseline gaps penalty
  const hasRuntimeGap = baselines.some((b) => b.runtimeVersionConfidence === 'GAP');
  if (hasRuntimeGap) score += 10;

  // No lockfile penalty
  const noLockfiles = baselines.every((b) => b.lockfiles.length === 0);
  if (noLockfiles) score += 5;

  // Cap at 100
  score = Math.min(Math.round(score), 100);

  // Level thresholds
  let impactLevel: DependencyImpactLevel;
  if (score >= 70) impactLevel = 'CRITICAL';
  else if (score >= 40) impactLevel = 'HIGH';
  else if (score >= 15) impactLevel = 'MEDIUM';
  else impactLevel = 'LOW';

  // Override: any CRITICAL finding → at least HIGH
  if (findings.some((f) => f.severity === 'CRITICAL') && impactLevel === 'MEDIUM') {
    impactLevel = 'HIGH';
  }
  if (findings.some((f) => f.severity === 'CRITICAL' && f.confidence === 'CONFIRMED') && impactLevel !== 'CRITICAL') {
    impactLevel = 'CRITICAL';
  }

  // Recommendation
  let approvalRecommendation: DependencyApprovalRecommendation;
  if (impactLevel === 'CRITICAL') {
    approvalRecommendation = 'BLOCK';
  } else if (impactLevel === 'HIGH') {
    approvalRecommendation = 'REVIEW';
  } else if (impactLevel === 'MEDIUM') {
    approvalRecommendation = 'REVIEW';
  } else {
    approvalRecommendation = 'APPROVE';
  }

  // Breaking risks
  const breakingRisks = [
    ...findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').map((f) => f.title),
    ...sourceCodeSignals.length > 0 ? [`${sourceCodeSignals.length} padrão(ões) de código problemático(s) detectado(s)`] : []
  ].slice(0, 10);

  // Gaps
  const gaps: string[] = [];
  if (hasRuntimeGap) {
    gaps.push('🔴 LACUNA: Versão de runtime atual não pôde ser determinada com certeza');
  }
  if (noLockfiles) {
    gaps.push('🔴 LACUNA: Nenhum lockfile encontrado — versões reais de dependências são desconhecidas');
  }
  if (baselines.length === 0) {
    gaps.push('🔴 LACUNA: Nenhuma baseline de dependências detectada — rode Analisar Workspace primeiro');
  }
  for (const f of findings.filter((f) => f.confidence === 'GAP')) {
    gaps.push(`🔴 LACUNA: ${f.title}`);
  }

  // Special: no tests detected
  const hasTestSignals = baselines.some((b) =>
    b.dependencies.some((d) => /junit|jest|pytest|mocha|jasmine|vitest|testing-library/i.test(d.name)) ||
    b.devDependencies.some((d) => /junit|jest|pytest|mocha|jasmine|vitest|testing-library/i.test(d.name))
  );
  if (!hasTestSignals && (request.ecosystem === 'java' || request.ecosystem === 'node')) {
    gaps.push('🔴 LACUNA: Nenhum framework de testes detectado no projeto');
  }

  return { score, impactLevel, approvalRecommendation, breakingRisks, gaps };
}

/**
 * Determina quais arquivos são afetados pela mudança com base em:
 * - build files relevantes (pom.xml, package.json, etc.)
 * - Dockerfile/CI
 * - source code signals
 * - framework config files
 */
export function buildAffectedFiles(
  baselines: DependencyBaseline[],
  sourceCodeSignals: SourceCodeSignal[],
  request: DependencyChangeRequest
): AffectedFile[] {
  const out: AffectedFile[] = [];
  const seen = new Set<string>();

  const add = (file: string, reason: string, confidence: 'CONFIRMED' | 'INFERRED' | 'GAP', evidenceRefs: import('./dependencyImpactTypes').DepEvidenceRef[], action: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    out.push({ file, reason, confidence, evidenceRefs, recommendedAction: action });
  };

  // Build files from evidence
  for (const baseline of baselines) {
    for (const ref of baseline.evidenceRefs) {
      if (ref.filePath && !ref.filePath.startsWith('.tic-code')) {
        add(ref.filePath, `Arquivo de build/manifest com versão ${request.fromName} ${request.fromVersion}`, ref.confidence, [ref], 'Atualizar versão para o target');
      }
    }
    // Docker/CI
    for (const infraRef of baseline.infraRuntime.evidenceRefs) {
      if (infraRef.filePath && !infraRef.filePath.startsWith('.tic-code')) {
        add(infraRef.filePath, 'Arquivo de infra com runtime a atualizar', infraRef.confidence, [infraRef], 'Atualizar imagem/versão de runtime');
      }
    }
  }

  // Source code signals
  for (const signal of sourceCodeSignals.slice(0, 50)) {
    add(signal.file, `Padrão problemático detectado: ${signal.context.slice(0, 60)}`, 'CONFIRMED',
      [{ filePath: signal.file, line: signal.line, matchedText: signal.context.slice(0, 80), confidence: 'CONFIRMED', reason: 'Sinal de código' }],
      'Revisar e atualizar código para compatibilidade com nova versão');
  }

  return out;
}
