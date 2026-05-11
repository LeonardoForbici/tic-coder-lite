import type { ChangeRiskLevel, ChangeSafetyReport, ChangeVerdict, DiffImpactResult, GitDiffSummary, TriggeredAntibody } from './changeFirewallTypes';
import { buildRequiredTestDetails } from './generateRequiredTests';
import { evidenceRef, uniq } from './changeFirewallStore';

export function scoreChangeSafety(
  id: string,
  diff: GitDiffSummary,
  impact: DiffImpactResult,
  triggeredAntibodies: TriggeredAntibody[],
  paths: { rollbackPlanPath: string; aiReviewPromptPath: string; generatedFiles: string[] }
): ChangeSafetyReport {
  let score = 10;
  const reasons: string[] = [];
  const text = `${diff.changedFiles.join(' ')} ${impact.sensitiveChanges.join(' ')} ${diff.possibleBehaviorChanges.join(' ')}`.toLowerCase();

  addRisk(/component|screen|page|view/.test(text), 10, 'Frontend/tela afetada.');
  addRisk(/shared component|shared|common|ui/.test(text), 20, 'Componente compartilhado ou UI comum afetado.');
  addRisk(/controller|endpoint|api/.test(text), 25, 'Endpoint/API afetado.');
  addRisk(/service|bo|domain|usecase/.test(text), 35, 'Service/BO/regra de dominio afetado.');
  addRisk(/repository|dao/.test(text), 40, 'Repository/DAO afetado.');
  addRisk(/sql|database|migration/.test(text) || impact.impactedDatabaseObjects.length > 0, 55, 'SQL/DB afetado.');
  addRisk(/plsql|trigger|procedure|package|commit|rollback/.test(text), 70, 'PLSQL trigger/procedure/package/transacao afetado.');
  addRisk(/auth|security|permission|role|profile|user|jwt|token/.test(text), 80, 'Autenticacao, seguranca ou permissao afetada.');
  addRisk(/financeiro|fiscal|estoque|pedido|status|calculo|calculate|amount|price|saldo/.test(text), 55, 'Dominio critico ou calculo/status afetado.');
  addRisk(/config|env|production|secret/.test(text), 35, 'Configuracao/env/producao afetada.');
  addRisk(diff.deletedFiles.some((file) => /test|spec/i.test(file)), 35, 'Teste removido no diff.');
  addRisk(!diff.changedFiles.some((file) => /test|spec/i.test(file)), 10, 'Mudanca sem arquivo de teste no diff.');

  const gapCount = impact.confidenceSummary.filter((line) => /GAP|LACUNA/i.test(line)).length;
  addRisk(gapCount >= 3, 25, `Muitas lacunas de contexto (${gapCount}).`);

  for (const antibody of triggeredAntibodies) {
    const weight = antibody.severity === 'CRITICAL' ? 90 : antibody.severity === 'HIGH' ? 45 : antibody.severity === 'MEDIUM' ? 20 : 8;
    addRisk(true, weight, `Legacy Antibody acionado: ${antibody.severity} ${antibody.name}.`);
  }

  score = Math.min(100, score);
  const riskLevel = riskFromScore(score, triggeredAntibodies);
  const verdict = verdictFromRisk(riskLevel, triggeredAntibodies);
  const requiredTestDetails = buildRequiredTestDetails(diff, impact, triggeredAntibodies);
  const requiredTests = requiredTestDetails.map((item) => item.name);
  const questions = buildQuestions(diff, impact, triggeredAntibodies);

  return {
    id,
    verdict,
    riskLevel,
    score,
    reasons: uniq(reasons),
    changedFiles: diff.changedFiles,
    triggeredAntibodies,
    impactedContracts: impact.impactedContracts,
    impactedRules: impact.impactedBusinessRules,
    impactedDatabaseObjects: impact.impactedDatabaseObjects,
    requiredTests,
    requiredTestDetails,
    rollbackPlanPath: paths.rollbackPlanPath,
    aiReviewPromptPath: paths.aiReviewPromptPath,
    questions,
    evidenceRefs: [
      ...impact.evidenceRefs,
      ...triggeredAntibodies.flatMap((item) => item.evidenceRefs),
      evidenceRef({ source: 'git-diff', confidence: diff.isGitRepository ? 'CONFIRMED' : 'GAP', reason: diff.isGitRepository ? 'Diff lido localmente via git.' : 'Git diff indisponivel.' })
    ],
    gaps: uniq([...impact.gaps, ...impact.confidenceSummary.filter((line) => /GAP|LACUNA/i.test(line))]),
    decisionReasons: uniq(reasons),
    approvalActions: buildApprovalActions(requiredTests, triggeredAntibodies, impact),
    generatedFiles: paths.generatedFiles
  };

  function addRisk(condition: boolean, weight: number, reason: string): void {
    if (!condition) return;
    score += weight;
    reasons.push(reason);
  }
}

function buildApprovalActions(requiredTests: string[], triggered: TriggeredAntibody[], impact: DiffImpactResult): string[] {
  const actions = ['Revisar diff real e arquivos alterados antes de aprovar.'];
  if (requiredTests.length) actions.push('Executar ou justificar testes obrigatorios/recomendados.');
  if (triggered.length) actions.push('Validar Legacy Antibodies acionados com evidencia humana.');
  if (impact.gaps.length) actions.push('Responder lacunas antes de tratar o veredito como definitivo.');
  if (impact.impactedDatabaseObjects.length) actions.push('Validar rollback e dados de banco/PLSQL impactados.');
  return uniq(actions);
}

function riskFromScore(score: number, triggered: TriggeredAntibody[]): ChangeRiskLevel {
  if (triggered.some((item) => item.severity === 'CRITICAL')) return 'CRITICAL';
  if (score >= 85) return 'CRITICAL';
  if (score >= 60 || triggered.some((item) => item.severity === 'HIGH')) return 'HIGH';
  if (score >= 30 || triggered.some((item) => item.severity === 'MEDIUM')) return 'MEDIUM';
  return 'LOW';
}

function verdictFromRisk(risk: ChangeRiskLevel, triggered: TriggeredAntibody[]): ChangeVerdict {
  if (risk === 'CRITICAL' || triggered.some((item) => item.severity === 'CRITICAL' && item.confidence !== 'GAP')) return 'BLOCK';
  if (risk === 'MEDIUM' || risk === 'HIGH' || triggered.length > 0) return 'REVIEW_REQUIRED';
  return 'SAFE';
}

function buildQuestions(diff: GitDiffSummary, impact: DiffImpactResult, triggered: TriggeredAntibody[]): string[] {
  const questions: string[] = [];
  if (!diff.isGitRepository) questions.push('Este workspace deve ser validado como patch manual fora do Git?');
  if (impact.impactedContracts.length) questions.push('Os contratos afetados foram comparados com consumidores existentes?');
  if (impact.impactedBusinessRules.length) questions.push('As regras de negocio impactadas foram confirmadas com responsavel humano?');
  if (impact.impactedDatabaseObjects.length) questions.push('Ha plano de rollback e massa de teste para objetos de banco afetados?');
  if (triggered.length) questions.push('Todos os Legacy Antibodies acionados foram revisados e justificados?');
  if (!diff.changedFiles.some((file) => /test|spec/i.test(file))) questions.push('Qual evidencia cobre a ausencia de teste automatizado no diff?');
  return uniq(questions);
}
