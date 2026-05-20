import * as vscode from 'vscode';
import type { ChangeApprovalPack, ChangeSafetyReport, ChangeTwinResult, GhostPatchResult, LegacyAntibody, RequiredTestItem, TriggeredAntibody } from './changeFirewallTypes';
import { appendChroniclerEvent, changeFirewallUri, confidenceIcon, createSession, ensureChangeFirewallFolders, evidenceRef, openGeneratedFile, readJson, readText, relativeArtifact, sessionUri, uniq, updateChangeFirewallTraceability, writeJsonFile, writeTextFile } from './changeFirewallStore';

interface ApprovalSources {
  report?: ChangeSafetyReport;
  twin?: ChangeTwinResult;
  ghostPatch?: GhostPatchResult;
  antibodies: LegacyAntibody[];
  triggered: TriggeredAntibody[];
  requiredTestsText: string;
  rollbackText: string;
}

export async function generateChangeApprovalPackCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de gerar o pacote de aprovacao.');
    return;
  }
  const pack = await generateChangeApprovalPack(root);
  vscode.window.showInformationMessage(`Change Approval Pack: ${pack.recommendation}.`);
}

export async function openChangeApprovalPackCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openGeneratedFile(root, '.tic-code/change-firewall/latest-change-approval-pack.md');
}

export async function generateChangeApprovalPack(root: vscode.WorkspaceFolder, sessionId?: string): Promise<ChangeApprovalPack> {
  const session = sessionId ? { ...createSession(root), id: sessionId, sessionDir: `.tic-code/change-firewall/sessions/${sessionId}` } : createSession(root);
  await ensureChangeFirewallFolders(root, session);
  const sources = await loadApprovalSources(root, sessionId);
  const report = sources.report;
  const twin = sources.twin;
  const recommendation = decideRecommendation(report, sources.triggered, sources);
  const gaps = buildApprovalGaps(sources);
  const requiredTests = normalizeRequiredTests(report, sources.requiredTestsText);
  const pack: ChangeApprovalPack = {
    id: session.id,
    createdAt: new Date().toISOString(),
    recommendation,
    firewallVerdict: report?.verdict ?? 'GAP',
    riskLevel: report?.riskLevel ?? 'GAP',
    score: report?.score ?? null,
    changedFiles: report?.changedFiles ?? [],
    predictedFiles: twin?.predictedFilesToEdit ?? [],
    impactedModules: twin?.predictedImpactedModules ?? [],
    impactedScreens: [],
    impactedApis: [],
    impactedDatabaseObjects: report?.impactedDatabaseObjects ?? [],
    triggeredAntibodies: sources.triggered.length ? sources.triggered : report?.triggeredAntibodies ?? [],
    requiredTests,
    rollbackPlanPath: report?.rollbackPlanPath ?? '.tic-code/change-firewall/latest-rollback-plan.md',
    pendingQuestions: uniq([...(report?.questions ?? []), ...(twin?.questions ?? [])]),
    approvalCriteria: [
      'Testes obrigatorios/recomendados executados ou justificados.',
      'Riscos criticos mitigados ou aceitos por responsavel.',
      'Lacunas respondidas antes da aprovacao.',
      'Legacy Antibodies criticos validados.',
      'Rollback claro e revisado.'
    ],
    blockingCriteria: [
      'Antibody CRITICAL sem validacao.',
      'SQL/PLSQL critico sem teste ou rollback.',
      'Permissao/autenticacao alterada sem revisao.',
      'Diff toca tabela/objeto critico sem plano de rollback.',
      'Lacuna critica nao respondida.'
    ],
    evidenceRefs: buildApprovalEvidence(sources),
    gaps,
    generatedFiles: []
  };

  const md = renderChangeApprovalPackMd(pack, sources);
  const writes: Array<[vscode.Uri, string | object]> = [
    [changeFirewallUri(root, 'latest-change-approval-pack.md'), md],
    [changeFirewallUri(root, 'latest-change-approval-pack.json'), pack],
    [sessionUri(root, session, 'change-approval-pack.md'), md],
    [sessionUri(root, session, 'change-approval-pack.json'), pack]
  ];
  const generated: string[] = [];
  for (const [uri, content] of writes) {
    if (typeof content === 'string') await writeTextFile(uri, content);
    else await writeJsonFile(uri, content);
    generated.push(relativeArtifact(root, uri));
  }
  const finalPack = { ...pack, generatedFiles: generated };
  await writeJsonFile(changeFirewallUri(root, 'latest-change-approval-pack.json'), finalPack);
  await writeJsonFile(sessionUri(root, session, 'change-approval-pack.json'), finalPack);
  await updateChangeFirewallTraceability(root, [
    `Change Approval Pack ${session.id}: recomendacao ${finalPack.recommendation}, risco ${String(finalPack.riskLevel)}, score ${String(finalPack.score ?? 'N/A')}.`,
    `Arquivos relacionados: ${uniq([...finalPack.changedFiles, ...finalPack.predictedFiles]).join(', ') || 'N/A'}.`
  ]);
  await appendChroniclerEvent(root, `Change Approval Pack gerado: ${finalPack.recommendation}`, generated);
  return finalPack;
}

async function loadApprovalSources(root: vscode.WorkspaceFolder, sessionId?: string): Promise<ApprovalSources> {
  const report = await readJson<ChangeSafetyReport>(root, '.tic-code/change-firewall/latest-change-safety-report.json');
  const twin = await readJson<ChangeTwinResult>(root, '.tic-code/change-firewall/latest-change-twin.json');
  const ghostPatch = await readJson<GhostPatchResult>(root, '.tic-code/change-firewall/latest-ghost-patch.json');
  const antibodies = await readJson<LegacyAntibody[]>(root, '.tic-code/change-firewall/antibodies/legacy-antibodies.json') ?? [];
  const activeSession = sessionId ?? report?.id ?? twin?.id;
  const triggered = activeSession
    ? await readJson<TriggeredAntibody[]>(root, `.tic-code/change-firewall/sessions/${activeSession}/triggered-antibodies.json`) ?? []
    : [];
  return {
    report,
    twin,
    ghostPatch,
    antibodies,
    triggered,
    requiredTestsText: await readText(root, '.tic-code/change-firewall/latest-required-tests.md'),
    rollbackText: await readText(root, '.tic-code/change-firewall/latest-rollback-plan.md')
  };
}

function decideRecommendation(report: ChangeSafetyReport | undefined, triggered: TriggeredAntibody[], sources: ApprovalSources): ChangeApprovalPack['recommendation'] {
  if (!report) return 'REVIEW';
  if (report.verdict === 'BLOCK') return 'BLOCK';
  if (triggered.some((item) => item.severity === 'CRITICAL' && item.confidence !== 'GAP')) return 'BLOCK';
  if (report.verdict === 'REVIEW_REQUIRED' || buildApprovalGaps(sources).length > 0) return 'REVIEW';
  return 'APPROVE';
}

function buildApprovalGaps(sources: ApprovalSources): string[] {
  const gaps: string[] = [];
  if (!sources.report) gaps.push('🔴 LACUNA: latest-change-safety-report.json nao existe.');
  if (!sources.twin) gaps.push('🔴 LACUNA: latest-change-twin.json nao existe.');
  if (!sources.ghostPatch) gaps.push('🔴 LACUNA: latest-ghost-patch.json nao existe.');
  if (!sources.antibodies.length) gaps.push('🔴 LACUNA: legacy-antibodies.json nao existe ou esta vazio.');
  if (!sources.requiredTestsText.trim()) gaps.push('🔴 LACUNA: latest-required-tests.md nao existe.');
  if (!sources.rollbackText.trim()) gaps.push('🔴 LACUNA: latest-rollback-plan.md nao existe.');
  gaps.push(...(sources.report?.gaps ?? []));
  gaps.push(...(sources.twin?.gaps ?? []));
  gaps.push(...(sources.ghostPatch?.gaps ?? []));
  return uniq(gaps);
}

function buildApprovalEvidence(sources: ApprovalSources) {
  const refs = [
    evidenceRef({ source: 'git-diff', filePath: '.tic-code/change-firewall/sessions/*/git-diff.patch', confidence: sources.report?.changedFiles.length ? 'CONFIRMED' : 'GAP', reason: sources.report?.changedFiles.length ? 'Relatorio de seguranca contem arquivos alterados do diff.' : 'Diff real nao confirmado no pacote.' }),
    evidenceRef({ source: 'screen-impact', filePath: '.tic-code/impact/latest-screen-impact.json', confidence: sources.twin?.request.source === 'impact-by-screen' ? 'CONFIRMED' : 'GAP', reason: sources.twin?.request.source === 'impact-by-screen' ? 'Change Twin usou impacto por tela.' : 'Impacto por tela nao confirmado no pacote.' }),
    evidenceRef({ source: 'reverse-engineering', filePath: '.tic-code/reverse-engineering/*', confidence: sources.report?.evidenceRefs.some((ref) => ref.source === 'reverse-engineering') ? 'CONFIRMED' : 'GAP', reason: 'Contratos/regras usados quando disponiveis no relatorio.' })
  ];
  return [...refs, ...(sources.report?.evidenceRefs ?? []), ...(sources.twin?.sourcesUsed ?? []), ...(sources.ghostPatch?.items.flatMap((item) => item.evidence) ?? [])];
}

function normalizeRequiredTests(report: ChangeSafetyReport | undefined, markdown: string): RequiredTestItem[] {
  if (report?.requiredTestDetails?.length) return report.requiredTestDetails;
  return markdown.split(/\r?\n/)
    .filter((line) => line.trim().startsWith('- '))
    .map((line) => ({
      name: line.trim().slice(2),
      kind: 'recommended' as const,
      reason: 'Extraido de latest-required-tests.md.',
      confidence: 'INFERRED' as const,
      evidenceRefs: [evidenceRef({ source: 'file', filePath: '.tic-code/change-firewall/latest-required-tests.md', matchedText: line.trim(), confidence: 'INFERRED', reason: 'Teste recomendado registrado em artefato real.' })]
    }));
}

function renderChangeApprovalPackMd(pack: ChangeApprovalPack, sources: ApprovalSources): string {
  const verdict = pack.recommendation === 'APPROVE' ? '✅ APROVAR' : pack.recommendation === 'BLOCK' ? '❌ BLOQUEAR' : '⚠️ REVISAR';
  return `# Change Approval Pack

## 1. Resumo Executivo

- Titulo da mudanca: ${sources.twin?.request.title ?? '🔴 LACUNA'}
- Origem da mudanca: ${sources.twin?.request.source ?? '🔴 LACUNA'}
- Data: ${pack.createdAt}
- Status do pacote: gerado
- Parecer recomendado: ${verdict}

## 2. Veredito do AI Change Firewall

- Veredito: ${pack.firewallVerdict}
- Risco: ${pack.riskLevel}
- Score: ${pack.score ?? '🔴 LACUNA'}
- Motivos: ${(sources.report?.reasons ?? []).join(' | ') || '🔴 LACUNA'}

## 3. Escopo da Mudanca

- Arquivos alterados no diff: ${pack.changedFiles.join(', ') || '🔴 LACUNA'}
- Arquivos previstos pelo Change Twin: ${pack.predictedFiles.join(', ') || '🔴 LACUNA'}
- Arquivos para revisar: ${sources.twin?.predictedFilesToReview.join(', ') || '🔴 LACUNA'}
- Modulos afetados: ${pack.impactedModules.join(', ') || '🔴 LACUNA'}
- Telas afetadas: ${pack.impactedScreens.join(', ') || '🔴 LACUNA'}
- Endpoints afetados: ${pack.impactedApis.join(', ') || '🔴 LACUNA'}
- Banco/SQL/PLSQL afetado: ${pack.impactedDatabaseObjects.join(', ') || '🔴 LACUNA'}

## 4. Evidencias

${pack.evidenceRefs.map((ref) => `- ${confidenceIcon(ref.confidence)} | ${ref.source} | ${ref.filePath ?? ref.symbol ?? ref.matchedText ?? 'N/A'} | ${ref.reason}`).join('\n') || '- 🔴 LACUNA'}

## 5. Legacy Antibodies Acionados

${pack.triggeredAntibodies.map((item) => `- ${item.name} (${item.severity}) - ${item.reason} | evidencia: ${item.evidenceRefs.map((ref) => ref.filePath ?? ref.matchedText ?? ref.reason).join(' | ') || 'N/A'} | validar: ${item.recommendation}`).join('\n') || '- Nenhum acionado.'}

## 6. Riscos

| Risco | Severidade | Evidencia | Impacto | Mitigacao |
| --- | --- | --- | --- | --- |
${(sources.report?.reasons ?? pack.gaps).map((risk) => `| ${risk} | ${pack.riskLevel} | ${pack.evidenceRefs[0]?.filePath ?? '🔴 LACUNA'} | Revisar impacto antes de aprovar | Executar testes e responder lacunas |`).join('\n') || '| 🔴 LACUNA | N/A | N/A | N/A | N/A |'}

## 7. Testes Obrigatorios

### Testes existentes para rodar
${pack.requiredTests.filter((test) => test.kind === 'existing').map((test) => `- ${test.filePath ?? test.name}`).join('\n') || '- 🔴 LACUNA: nenhum teste existente confirmado.'}

### Testes recomendados para criar
${pack.requiredTests.filter((test) => test.kind === 'recommended').map((test) => `- ${test.name} | motivo: ${test.reason}`).join('\n') || '- N/A'}

### Testes manuais obrigatorios
${pack.requiredTests.filter((test) => test.kind === 'manual').map((test) => `- ${test.name} | motivo: ${test.reason}`).join('\n') || '- N/A'}

## 8. Plano de Rollback

- Arquivos impactados: ${uniq([...pack.changedFiles, ...pack.predictedFiles]).join(', ') || '🔴 LACUNA'}
- Plano: ${pack.rollbackPlanPath}
- Comandos sugeridos: ver rollback plan. Nao executado automaticamente.
- Riscos do rollback: ${sources.rollbackText.includes('Riscos') ? 'descritos em latest-rollback-plan.md' : '🔴 LACUNA'}

## 9. Perguntas Pendentes

${pack.pendingQuestions.map((question) => `- ${question}`).join('\n') || '- N/A'}

## 10. Criterios de Aprovacao

${pack.approvalCriteria.map((item) => `- ${item}`).join('\n')}

## 11. Criterios de Bloqueio

${pack.blockingCriteria.map((item) => `- ${item}`).join('\n')}

## 12. Decisao Recomendada

${pack.recommendation === 'APPROVE' ? 'APROVAR' : pack.recommendation === 'BLOCK' ? 'BLOQUEAR' : 'REVISAR ANTES DE APROVAR'}

Justificativa: ${pack.gaps.length ? 'existem lacunas/evidencias pendentes que impedem aprovacao automatica.' : 'a decisao deriva dos artefatos reais disponiveis do firewall.'}

## Lacunas

${pack.gaps.map((gap) => `- ${gap}`).join('\n') || '- Nenhuma lacuna registrada.'}
`;
}
