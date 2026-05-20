import * as vscode from 'vscode';
import type { ChangeFirewallRunResult, ChangeFirewallSession, ChangeSafetyReport, DiffImpactResult, GitDiffSummary } from './changeFirewallTypes';
import { appendChroniclerEvent, changeFirewallUri, ensureChangeFirewallFolders, openGeneratedFile, relativeArtifact, sessionUri, updateChangeFirewallTraceability, writeJsonFile, writeTextFile } from './changeFirewallStore';
import { renderAiReviewPromptMd } from './generateAiReviewPrompt';
import { renderGhostPrSummaryMd } from './generateGhostPrSummary';
import { detectExistingTests, renderRequiredTestsMd } from './generateRequiredTests';
import { renderRollbackPlanMd } from './generateRollbackPlan';

export async function persistChangeSafetyArtifacts(
  root: vscode.WorkspaceFolder,
  session: ChangeFirewallSession,
  diff: GitDiffSummary,
  impact: DiffImpactResult,
  report: ChangeSafetyReport
): Promise<ChangeFirewallRunResult> {
  await ensureChangeFirewallFolders(root, session);
  const existingTests = await detectExistingTests(root, diff.changedFiles);
  const enrichedReport: ChangeSafetyReport = {
    ...report,
    requiredTestDetails: [...existingTests, ...report.requiredTestDetails],
    requiredTests: [...existingTests.map((item) => item.name), ...report.requiredTests]
  };
  const reportMd = renderChangeSafetyReportMd(enrichedReport, diff, impact);
  const rollbackMd = renderRollbackPlanMd(diff, enrichedReport);
  const testsMd = renderRequiredTestsMd(enrichedReport);
  const aiPromptMd = renderAiReviewPromptMd(enrichedReport, diff, impact);
  const ghostPrMd = renderGhostPrSummaryMd(enrichedReport, diff, impact);

  const writes: Array<[vscode.Uri, string | object]> = [
    [changeFirewallUri(root, 'latest-change-safety-report.md'), reportMd],
    [changeFirewallUri(root, 'latest-change-safety-report.json'), enrichedReport],
    [changeFirewallUri(root, 'latest-rollback-plan.md'), rollbackMd],
    [changeFirewallUri(root, 'latest-required-tests.md'), testsMd],
    [changeFirewallUri(root, 'latest-ai-review-prompt.md'), aiPromptMd],
    [changeFirewallUri(root, 'latest-ghost-pr-summary.md'), ghostPrMd],
    [sessionUri(root, session, 'change-safety-report.md'), reportMd],
    [sessionUri(root, session, 'change-safety-report.json'), enrichedReport],
    [sessionUri(root, session, 'rollback-plan.md'), rollbackMd],
    [sessionUri(root, session, 'required-tests.md'), testsMd],
    [sessionUri(root, session, 'ai-review-prompt.md'), aiPromptMd],
    [sessionUri(root, session, 'ghost-pr-summary.md'), ghostPrMd]
  ];

  const generatedFiles: string[] = [];
  for (const [uri, content] of writes) {
    if (typeof content === 'string') {
      await writeTextFile(uri, content);
    } else {
      await writeJsonFile(uri, content);
    }
    generatedFiles.push(relativeArtifact(root, uri));
  }

  const fullReport = { ...enrichedReport, generatedFiles: [...enrichedReport.generatedFiles, ...generatedFiles] };
  await writeJsonFile(changeFirewallUri(root, 'latest-change-safety-report.json'), fullReport);
  await writeJsonFile(sessionUri(root, session, 'change-safety-report.json'), fullReport);

  await updateChangeFirewallTraceability(root, [
    `Sessao ${session.id}: verdict ${enrichedReport.verdict}, risco ${enrichedReport.riskLevel}, score ${enrichedReport.score}.`,
    `Arquivos alterados: ${diff.changedFiles.join(', ') || 'N/A'}.`,
    `Antibodies acionados: ${enrichedReport.triggeredAntibodies.map((item) => item.antibodyId).join(', ') || 'nenhum'}.`
  ]);
  await appendChroniclerEvent(root, `AI Change Firewall validou diff: ${enrichedReport.verdict}/${enrichedReport.riskLevel}`, generatedFiles);

  return {
    session,
    diff,
    impact,
    report: fullReport,
    triggeredAntibodies: enrichedReport.triggeredAntibodies,
    generatedFiles: fullReport.generatedFiles
  };
}

export function renderChangeSafetyReportMd(report: ChangeSafetyReport, diff: GitDiffSummary, impact: DiffImpactResult): string {
  return `# AI Change Firewall Report

## Veredito

${verdictLabel(report.verdict)}

## Risco

${report.riskLevel} (score ${report.score})

## Resumo da mudanca

- Git repo: ${diff.isGitRepository ? 'sim' : 'nao'}
- Patch vazio: ${diff.empty ? 'sim' : 'nao'}
- Arquivos alterados: ${report.changedFiles.length}
- Sinais sensiveis: ${impact.sensitiveChanges.join(' | ') || 'N/A'}

## Arquivos alterados

${report.changedFiles.map((file) => `- ${file}`).join('\n') || '- N/A'}

## Contratos afetados

${report.impactedContracts.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Regras impactadas

${report.impactedRules.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Legacy Antibodies acionados

${report.triggeredAntibodies.map((item) => `- ${item.severity} ${item.name}: ${item.reason}`).join('\n') || '- Nenhum'}

## Banco / SQL / PL/SQL impactado

${report.impactedDatabaseObjects.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Telas impactadas

${impact.impactedScreens.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Testes obrigatorios

${report.requiredTests.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Plano de rollback

${report.rollbackPlanPath}

## Perguntas antes de aceitar

${report.questions.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Prompt de revisao para IA

${report.aiReviewPromptPath}

## Confianca

${impact.confidenceSummary.map((item) => `- ${item}`).join('\n') || '- N/A'}

## Evidencias usadas

${renderEvidenceUsage(report, diff, impact)}

## Lacunas que impedem confianca total

${report.gaps.map((gap) => `- ${gap}`).join('\n') || '- Nenhuma lacuna registrada.'}

## Por que o firewall decidiu isso?

${report.decisionReasons.map((reason) => `- ${reason}`).join('\n') || '- N/A'}

## O que fazer antes de aprovar?

${report.approvalActions.map((action) => `- ${action}`).join('\n') || '- Revisar diff e executar testes aplicaveis.'}
`;
}

function renderEvidenceUsage(report: ChangeSafetyReport, diff: GitDiffSummary, impact: DiffImpactResult): string {
  const hasSource = (source: string) => report.evidenceRefs.some((ref) => ref.source === source) || impact.evidenceRefs.some((ref) => ref.source === source);
  return [
    `- Git diff usado: ${diff.isGitRepository ? '🟢 sim' : '🔴 nao'}`,
    `- graph.json usado: ${hasSource('graph') ? '🟢 sim' : '🔴 nao confirmado'}`,
    `- latest-screen-impact usado: ${hasSource('screen-impact') ? '🟢 sim' : '🔴 nao confirmado'}`,
    `- antibodies usados: ${report.triggeredAntibodies.length ? '🟢 sim' : '🔴 nenhum acionado'}`,
    `- contracts usados: ${report.impactedContracts.length ? '🟢 sim' : '🔴 nao confirmado'}`,
    `- database analysis usado: ${hasSource('database-analysis') || report.impactedDatabaseObjects.length ? '🟢 sim' : '🔴 nao confirmado'}`,
    `- PL/SQL analysis usado: ${hasSource('plsql-analysis') ? '🟢 sim' : '🔴 nao confirmado'}`
  ].join('\n');
}

export async function openChangeFirewallReportCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openGeneratedFile(root, '.tic-code/change-firewall/latest-change-safety-report.md');
}

export async function openLegacyAntibodiesCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openGeneratedFile(root, '.tic-code/change-firewall/antibodies/legacy-antibodies.md');
}

export async function exportAiReviewPromptCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openGeneratedFile(root, '.tic-code/change-firewall/latest-ai-review-prompt.md');
}

function verdictLabel(verdict: ChangeSafetyReport['verdict']): string {
  if (verdict === 'SAFE') return 'SAFE';
  if (verdict === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  return 'BLOCK';
}
