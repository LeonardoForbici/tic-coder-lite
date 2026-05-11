import * as vscode from 'vscode';
import type { ChangeFirewallSession, ChangeRequest, ChangeTwinResult, DiffImpactResult, GitDiffSummary, LegacyAntibody } from './changeFirewallTypes';
import { appendChroniclerEvent, changeFirewallUri, createSession, ensureChangeFirewallFolders, openGeneratedFile, readJson, relativeArtifact, sessionUri, uniq, writeJsonFile, writeTextFile } from './changeFirewallStore';
import { loadLegacyImmuneContext } from './legacyImmuneSystem';
import { readCurrentGitDiff } from './gitDiffReader';
import { analyzePatchImpact } from './patchImpactAnalyzer';
import { generateLegacyAntibodies } from './legacyAntibodyGenerator';
import { loadLegacyAntibodies, matchLegacyAntibodies } from './legacyAntibodyMatcher';
import { scoreChangeSafety } from './changeSafetyScorer';
import { persistChangeSafetyArtifacts } from './generateChangeSafetyReport';
import { generateGhostPatch } from './generateGhostPatch';
import { evidenceRef } from './changeFirewallStore';
import { generateChangeApprovalPack } from './generateChangeApprovalPack';

interface LatestScreenImpactLike {
  input?: {
    id?: string;
    url?: string;
    screenshotPath?: string;
    changeDescription?: string;
  };
  fileCandidates?: Array<{ file?: string; category?: string; reason?: string }>;
  impactEstimate?: {
    level?: string;
    risks?: string[];
    recommendedFilesToReview?: string[];
    estimatedEffort?: { minHours?: number; maxHours?: number; label?: string; assumptions?: string[] };
  };
  backendFlow?: Array<{ file?: string; type?: string }>;
  databaseImpact?: { sqlFiles?: string[]; tables?: string[]; triggers?: string[]; procedures?: string[]; packages?: string[] };
  questions?: string[];
  gaps?: string[];
}

export async function runChangeTwinCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de simular mudanca.');
    return;
  }

  const latestImpact = await readJson<LatestScreenImpactLike>(root, '.tic-code/impact/latest-screen-impact.json');
  const useImpact = latestImpact
    ? await vscode.window.showQuickPick(['Sim', 'Nao'], { placeHolder: 'Usar ultima analise de Impacto por Imagem/Tela como base?' })
    : undefined;
  const description = useImpact === 'Sim'
    ? latestImpact?.input?.changeDescription ?? ''
    : await vscode.window.showInputBox({ prompt: 'Descreva a mudanca que deseja simular', placeHolder: 'Ex: adicionar validacao de limite antes de salvar pedido' });
  if (!description?.trim()) return;

  const title = await vscode.window.showInputBox({ prompt: 'Titulo curto da mudanca', value: description.slice(0, 80) });
  const session = createSession(root);
  const result = await runChangeTwin(root, session, {
    description,
    title: title || description.slice(0, 80),
    source: useImpact === 'Sim' ? 'impact-by-screen' : 'manual',
    latestImpact: useImpact === 'Sim' ? latestImpact : undefined
  });
  vscode.window.showInformationMessage(`Change Twin gerado: ${result.predictedFilesToEdit.length} arquivo(s) provaveis.`);
  await openGeneratedFile(root, '.tic-code/change-firewall/latest-change-twin.md');
}

export async function runChangeTwin(
  root: vscode.WorkspaceFolder,
  session: ChangeFirewallSession,
  input: { title: string; description: string; source: ChangeRequest['source']; latestImpact?: LatestScreenImpactLike }
): Promise<ChangeTwinResult> {
  await ensureChangeFirewallFolders(root, session);
  const immune = await loadLegacyImmuneContext(root);
  const request: ChangeRequest = {
    id: session.id,
    title: input.title,
    description: input.description,
    source: input.source,
    relatedScreenImpactId: input.latestImpact?.input?.id,
    screenshotPath: input.latestImpact?.input?.screenshotPath,
    url: input.latestImpact?.input?.url,
    createdAt: session.createdAt
  };

  const candidateFiles = input.latestImpact?.fileCandidates?.map((item) => item.file ?? '').filter(Boolean) ?? [];
  const reviewFiles = input.latestImpact?.impactEstimate?.recommendedFilesToReview ?? [];
  const backendFiles = input.latestImpact?.backendFlow?.map((item) => item.file ?? '').filter(Boolean) ?? [];
  const dbFiles = input.latestImpact?.databaseImpact?.sqlFiles ?? [];
  const predictedFilesToEdit = uniq([...candidateFiles, ...immune.filesToEdit]).slice(0, 30);
  const predictedFilesToReview = uniq([...reviewFiles, ...backendFiles, ...dbFiles, ...immune.criticalFiles]).slice(0, 40);
  const predictedImpactedModules = uniq([
    ...predictedFilesToEdit.map(moduleFromPath),
    ...predictedFilesToReview.map(moduleFromPath),
    ...immune.criticalModules
  ]).slice(0, 20);
  const predictedRisks = uniq([
    ...(input.latestImpact?.impactEstimate?.risks ?? []),
    ...immune.riskAreas.slice(0, 10),
    ...immune.gaps.slice(0, 6).map((gap) => `LACUNA: ${gap}`)
  ]);
  const predictedTests = buildTwinTests(predictedImpactedModules, input.latestImpact);
  const generatedFiles = buildTwinGeneratedFiles(session);
  const editEvidence = predictedFilesToEdit.map((file) => ({
    value: file,
    confidence: 'CONFIRMED' as const,
    evidenceRefs: [evidenceRef({ source: input.latestImpact ? 'screen-impact' : 'reverse-engineering', filePath: file, confidence: 'CONFIRMED', reason: input.latestImpact ? 'Arquivo veio de latest-screen-impact/latest-files-to-edit.' : 'Arquivo veio de artefato real do Legacy Immune System.' })]
  }));
  const reviewEvidence = predictedFilesToReview.map((file) => ({
    value: file,
    confidence: 'INFERRED' as const,
    evidenceRefs: [evidenceRef({ source: 'risk', filePath: file, confidence: 'INFERRED', reason: 'Arquivo indicado para revisao por risco, grafo, backend flow ou banco.' })]
  }));
  const moduleEvidence = predictedImpactedModules.map((moduleName) => ({
    value: moduleName,
    confidence: predictedFilesToEdit.length || predictedFilesToReview.length ? 'INFERRED' as const : 'GAP' as const,
    evidenceRefs: [evidenceRef({ source: 'graph', matchedText: moduleName, confidence: predictedFilesToEdit.length || predictedFilesToReview.length ? 'INFERRED' : 'GAP', reason: 'Modulo derivado de arquivo real candidato/revisao.' })]
  }));
  const riskEvidence = predictedRisks.map((risk) => ({
    value: risk,
    confidence: risk.startsWith('LACUNA') ? 'GAP' as const : 'CONFIRMED' as const,
    evidenceRefs: [evidenceRef({ source: risk.startsWith('LACUNA') ? 'reverse-engineering' : 'risk', matchedText: risk, confidence: risk.startsWith('LACUNA') ? 'GAP' : 'CONFIRMED', reason: 'Risco/lacuna vindo de artefato real de impacto, riscos ou engenharia reversa.' })]
  }));
  const testEvidence = predictedTests.map((test) => ({
    value: test,
    confidence: 'INFERRED' as const,
    evidenceRefs: [evidenceRef({ source: input.latestImpact ? 'screen-impact' : 'manual-input', matchedText: test, confidence: 'INFERRED', reason: 'Teste recomendado a partir de modulo/risco real; nao e teste existente confirmado.' })]
  }));
  const result: ChangeTwinResult = {
    id: session.id,
    request,
    predictedFilesToEdit,
    predictedFilesToReview,
    predictedImpactedModules,
    predictedTests,
    predictedRisks,
    predictedFilesToEditEvidence: editEvidence,
    predictedFilesToReviewEvidence: reviewEvidence,
    predictedImpactedModulesEvidence: moduleEvidence,
    predictedTestsEvidence: testEvidence,
    predictedRisksEvidence: riskEvidence,
    sourcesUsed: buildTwinSources(input.latestImpact, immune),
    gaps: buildTwinGaps(input.latestImpact, predictedFilesToEdit, immune),
    questions: uniq([...(input.latestImpact?.questions ?? []), ...immune.gaps.slice(0, 8)]),
    predictedEffort: {
      level: normalizeRisk(input.latestImpact?.impactEstimate?.level),
      label: input.latestImpact?.impactEstimate?.estimatedEffort?.label ?? effortLabel(predictedFilesToEdit.length, predictedRisks.length),
      minHours: input.latestImpact?.impactEstimate?.estimatedEffort?.minHours ?? Math.max(1, Math.ceil(predictedFilesToEdit.length / 3)),
      maxHours: input.latestImpact?.impactEstimate?.estimatedEffort?.maxHours ?? Math.max(2, predictedFilesToEdit.length + predictedRisks.length),
      assumptions: input.latestImpact?.impactEstimate?.estimatedEffort?.assumptions ?? ['Estimativa local baseada em arquivos candidatos, riscos e lacunas disponiveis.']
    },
    implementationPlan: buildImplementationPlan(predictedFilesToEdit, predictedFilesToReview),
    safePrompt: buildSafePrompt(request, predictedFilesToEdit, predictedFilesToReview, predictedRisks),
    confidenceSummary: [
      input.latestImpact ? 'CONFIRMED: Change Twin baseado em latest-screen-impact.json.' : 'INFERRED: Change Twin baseado em descricao manual.',
      immune.contracts.length ? `CONFIRMED: ${immune.contracts.length} contrato(s) carregado(s).` : 'GAP: contratos operacionais ausentes.',
      immune.rules.length ? `CONFIRMED: ${immune.rules.length} regra(s) carregada(s).` : 'GAP: business-rules.md ausente.',
      immune.traceabilityLinks.length ? `CONFIRMED: ${immune.traceabilityLinks.length} link(s) de rastreabilidade carregado(s).` : 'GAP: traceability incompleta.'
    ],
    generatedFiles
  };

  await writeJsonFile(sessionUri(root, session, 'change-input.json'), request);
  await writeJsonFile(changeFirewallUri(root, 'latest-change-twin.json'), result);
  await writeJsonFile(sessionUri(root, session, 'change-twin.json'), result);
  await writeTextFile(changeFirewallUri(root, 'latest-change-twin.md'), renderChangeTwinMd(result));
  await writeTextFile(sessionUri(root, session, 'change-twin.md'), renderChangeTwinMd(result));
  const antibodies = await loadLegacyAntibodies(root);
  const signals = [
    request.description,
    request.url ?? '',
    ...(input.latestImpact?.questions ?? []),
    ...predictedImpactedModules,
    ...predictedRisks
  ];
  const ghostPatch = await generateGhostPatch(root, session, { request, candidateFiles: predictedFilesToEdit, signals, antibodies });
  result.generatedFiles = uniq([...result.generatedFiles, ...ghostPatch.generatedFiles]);
  await writeJsonFile(changeFirewallUri(root, 'latest-change-twin.json'), result);
  await writeJsonFile(sessionUri(root, session, 'change-twin.json'), result);
  await appendChroniclerEvent(root, `Change Twin executado: ${request.title}`, generatedFiles);
  return result;
}

export async function runChangeFirewallOnGitDiffCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de validar diff.');
    return;
  }
  const session = createSession(root);
  const result = await runChangeFirewallOnGitDiff(root, session);
  if (!result.diff.isGitRepository) {
    vscode.window.showWarningMessage('AI Change Firewall: esta pasta nao parece ser um repositorio Git. Nenhum diff foi validado.');
    return;
  }
  vscode.window.showInformationMessage(`AI Change Firewall: ${result.report.verdict} / ${result.report.riskLevel} (score ${result.report.score}).`);
  await openGeneratedFile(root, '.tic-code/change-firewall/latest-change-safety-report.md');
}

export async function runChangeFirewallOnGitDiff(root: vscode.WorkspaceFolder, session: ChangeFirewallSession): Promise<{
  diff: GitDiffSummary;
  impact: DiffImpactResult;
  report: Awaited<ReturnType<typeof persistChangeSafetyArtifacts>>['report'];
}> {
  await ensureChangeFirewallFolders(root, session);
  const immune = await loadLegacyImmuneContext(root);
  const diff = await readCurrentGitDiff(root, session);
  const request: ChangeRequest = {
    id: session.id,
    title: 'Validacao do diff atual',
    description: 'AI Change Firewall executado sobre git diff/status local.',
    source: 'git-diff',
    createdAt: session.createdAt
  };
  await writeJsonFile(sessionUri(root, session, 'change-input.json'), request);

  const impact = await analyzePatchImpact(root, session, diff, immune);
  let antibodies: LegacyAntibody[] = await loadLegacyAntibodies(root);
  if (!antibodies.length) {
    antibodies = await generateLegacyAntibodies(root, immune);
  }
  const triggered = await matchLegacyAntibodies(root, session, antibodies, diff, impact);
  const baseGenerated = [
    relativeArtifact(root, sessionUri(root, session, 'change-input.json')),
    diff.rawPatchPath,
    relativeArtifact(root, sessionUri(root, session, 'diff-impact.json')),
    relativeArtifact(root, sessionUri(root, session, 'triggered-antibodies.json'))
  ];
  const report = scoreChangeSafety(session.id, diff, impact, triggered, {
    rollbackPlanPath: '.tic-code/change-firewall/latest-rollback-plan.md',
    aiReviewPromptPath: '.tic-code/change-firewall/latest-ai-review-prompt.md',
    generatedFiles: baseGenerated
  });
  const persisted = await persistChangeSafetyArtifacts(root, session, diff, impact, report);
  await generateChangeApprovalPack(root, session.id);
  return { diff, impact, report: persisted.report };
}

function renderChangeTwinMd(result: ChangeTwinResult): string {
  return `# Change Twin

## Mudanca simulada

- Titulo: ${result.request.title}
- Fonte: ${result.request.source}
- URL: ${result.request.url ?? 'N/A'}
- Screenshot: ${result.request.screenshotPath ?? 'N/A'}
- Descricao: ${result.request.description}

## Arquivos provaveis para editar

${result.predictedFilesToEditEvidence.map((item) => `- ${item.value} (${item.confidence})`).join('\n') || '- 🔴 LACUNA: nenhum arquivo real relacionado encontrado.'}

## Arquivos para revisar

${result.predictedFilesToReviewEvidence.map((item) => `- ${item.value} (${item.confidence})`).join('\n') || '- 🔴 LACUNA: nenhum arquivo real para revisao encontrado.'}

## Modulos impactados

${result.predictedImpactedModulesEvidence.map((item) => `- ${item.value} (${item.confidence})`).join('\n') || '- 🔴 LACUNA'}

## Testes sugeridos

${result.predictedTestsEvidence.map((test) => `- ${test.value} (${test.confidence})`).join('\n') || '- 🔴 LACUNA: sem base para recomendar teste.'}

## Riscos previstos

${result.predictedRisksEvidence.map((risk) => `- ${risk.value} (${risk.confidence})`).join('\n') || '- 🔴 LACUNA: sem riscos confirmados.'}

## Fontes usadas

${result.sourcesUsed.map((ref) => `- ${ref.confidence}: ${ref.filePath ?? ref.source} - ${ref.reason}`).join('\n') || '- 🔴 LACUNA'}

## Lacunas

${result.gaps.map((gap) => `- ${gap}`).join('\n') || '- Nenhuma lacuna registrada.'}

## Perguntas

${result.questions.map((question) => `- ${question}`).join('\n') || '- N/A'}

## Esforco estimado

- Nivel: ${result.predictedEffort.level}
- Janela: ${result.predictedEffort.minHours}h-${result.predictedEffort.maxHours}h
- Rotulo: ${result.predictedEffort.label}

## Plano de implementacao

${result.implementationPlan.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Prompt seguro de implementacao

${result.safePrompt}

## Confianca

${result.confidenceSummary.map((line) => `- ${line}`).join('\n')}
`;
}

function buildTwinSources(impact: LatestScreenImpactLike | undefined, immune: Awaited<ReturnType<typeof loadLegacyImmuneContext>>): ReturnType<typeof evidenceRef>[] {
  const refs = [];
  if (impact) refs.push(evidenceRef({ source: 'screen-impact', filePath: '.tic-code/impact/latest-screen-impact.json', confidence: 'CONFIRMED', reason: 'Change Twin usou analise de impacto por tela existente.' }));
  if (immune.graphFiles.length) refs.push(evidenceRef({ source: 'graph', filePath: '.tic-code/graph.json', confidence: 'CONFIRMED', reason: 'Arquivos do grafo carregados.' }));
  if (immune.rules.length) refs.push(evidenceRef({ source: 'reverse-engineering', filePath: '.tic-code/reverse-engineering/business-rules.md', confidence: 'CONFIRMED', reason: 'Regras carregadas.' }));
  if (immune.contracts.length) refs.push(evidenceRef({ source: 'reverse-engineering', filePath: '.tic-code/reverse-engineering/operational-contracts.md', confidence: 'CONFIRMED', reason: 'Contratos carregados.' }));
  if (immune.databaseObjects.length) refs.push(evidenceRef({ source: 'database-analysis', filePath: '.tic-code/reverse-engineering/database-analysis.md', confidence: 'CONFIRMED', reason: 'Objetos de banco carregados.' }));
  return refs;
}

function buildTwinGaps(impact: LatestScreenImpactLike | undefined, files: string[], immune: Awaited<ReturnType<typeof loadLegacyImmuneContext>>): string[] {
  const gaps: string[] = [];
  if (!impact) gaps.push('🔴 LACUNA: latest-screen-impact.json nao usado; resultado depende de entrada manual.');
  if (!files.length) gaps.push('🔴 LACUNA: nenhum arquivo candidato real encontrado.');
  if (!immune.graphFiles.length) gaps.push('🔴 LACUNA: graph.json/context graph indisponivel.');
  if (!immune.rules.length) gaps.push('🔴 LACUNA: business-rules.md ausente ou vazio.');
  return gaps;
}

function buildTwinGeneratedFiles(session: ChangeFirewallSession): string[] {
  return [
    '.tic-code/change-firewall/latest-change-twin.md',
    '.tic-code/change-firewall/latest-change-twin.json',
    `${session.sessionDir}/change-input.json`,
    `${session.sessionDir}/change-twin.md`,
    `${session.sessionDir}/change-twin.json`
  ];
}

function buildTwinTests(modules: string[], impact?: LatestScreenImpactLike): string[] {
  const text = modules.join(' ').toLowerCase();
  const tests: string[] = [];
  if (/frontend|design-system/.test(text)) tests.push('Validar visualmente a tela e estados responsivos/dark-light.');
  if (/api/.test(text)) tests.push('Testar endpoint/API chamada pela tela.');
  if (/service/.test(text)) tests.push('Testar regra no service/BO com cenario principal e limite.');
  if (/database|repository/.test(text) || impact?.databaseImpact) tests.push('Validar SQL/PLSQL e dados criticos afetados.');
  if (/security/.test(text)) tests.push('Validar permissao com admin, usuario comum e sem permissao.');
  return uniq([...tests, ...(impact?.questions ?? []).map((question) => `Responder antes de testar: ${question}`)]);
}

function buildImplementationPlan(editFiles: string[], reviewFiles: string[]): string[] {
  return [
    'Ler contratos operacionais, regras, permissoes e rastreabilidade antes de editar.',
    editFiles.length ? `Editar somente arquivos candidatos quando confirmado: ${editFiles.slice(0, 8).join(', ')}.` : 'Confirmar arquivos alvo antes de editar.',
    reviewFiles.length ? `Revisar arquivos relacionados antes de aceitar: ${reviewFiles.slice(0, 8).join(', ')}.` : 'Revisar grafo/riscos para descobrir arquivos relacionados.',
    'Adicionar ou atualizar testes focados no impacto previsto.',
    'Rodar AI Change Firewall no diff final antes de aceitar a mudanca.'
  ];
}

function buildSafePrompt(request: ChangeRequest, editFiles: string[], reviewFiles: string[], risks: string[]): string {
  return `Implemente a mudanca "${request.title}" preservando comportamento legado.

Descricao: ${request.description}

Regras:
- Nao invente regra de negocio.
- Trate lacunas como LACUNA e peca validacao humana.
- Leia contratos, business-rules, permissions, database/plsql analysis e traceability antes de alterar comportamento.
- Edite somente arquivos necessarios.
- Nao envie codigo/diff para fora.

Arquivos candidatos para editar: ${editFiles.join(', ') || 'N/A'}
Arquivos para revisar: ${reviewFiles.join(', ') || 'N/A'}
Riscos previstos: ${risks.join(' | ') || 'N/A'}`;
}

function normalizeRisk(value?: string): ChangeTwinResult['predictedEffort']['level'] {
  if (value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value;
  return 'MEDIUM';
}

function effortLabel(fileCount: number, riskCount: number): string {
  if (fileCount >= 8 || riskCount >= 8) return 'alto';
  if (fileCount >= 3 || riskCount >= 3) return 'medio';
  return 'baixo';
}

function moduleFromPath(file: string): string {
  const lower = file.toLowerCase();
  if (/auth|security|permission/.test(lower)) return 'security';
  if (/sql|plsql|database|migration|repository|dao/.test(lower)) return 'database';
  if (/controller|api|route/.test(lower)) return 'api';
  if (/service|bo|usecase/.test(lower)) return 'service';
  if (/theme|token|design-system/.test(lower)) return 'design-system';
  if (/component|screen|page|view|webview/.test(lower)) return 'frontend';
  return file.split('/')[0] || 'root';
}
