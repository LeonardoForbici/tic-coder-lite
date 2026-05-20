/**
 * Comando principal: Analisar Mudança de Dependência/Runtime.
 * ticCoderLite.analyzeDependencyChange
 *
 * Orquestra toda a pipeline de Dependency Change Impact.
 */

import * as vscode from 'vscode';
import { detectDependencyBaseline, renderRuntimeInventoryMd } from './detectDependencyBaseline';
import { scanSourceCodeSignals } from './dependencyImpactAnalyzer';
import { evaluateCompatibilityRules } from './dependencyCompatibilityRules';
import { calculateImpactScore, buildAffectedFiles } from './dependencyChangeInput';
import { generateMigrationSteps, generateRequiredTests } from './dependencyMigrationPlanner';
import { generateDependencyImpactReportMd, generateMigrationPlanMd } from './generateDependencyImpactReport';
import { buildDependencyApprovalPack, generateDependencyApprovalPackMd } from './generateDependencyApprovalPack';
import {
  buildDepImpactAntibodies,
  openDepImpactFile,
  requestFromInput,
  updateDepImpactTraceability,
  writeDepImpactBaseline,
  writeDepImpactResult
} from './dependencyImpactStore';
import type { DependencyEcosystem, DependencyImpactResult } from './dependencyImpactTypes';
import { detectMultipleProjects } from '../scanner/detectProjects';
import { analyzeWorkspace, getLastAnalysis } from '../commands/analyzeProject';

// ─── Quick-access commands ────────────────────────────────────────────────────

export async function openDepImpactReportCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openDepImpactFile(root, '.tic-code/dependency-impact/latest-dependency-impact.md');
}

export async function openDepImpactMigrationPlanCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openDepImpactFile(root, '.tic-code/dependency-impact/latest-migration-plan.md');
}

export async function openDepImpactApprovalPackCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  await openDepImpactFile(root, '.tic-code/dependency-impact/latest-dependency-approval-pack.md');
}

// ─── Main Command ─────────────────────────────────────────────────────────────

export interface DepChangePayload {
  ecosystem?: string;
  fromName?: string;
  fromVersion?: string;
  toVersion?: string;
  projectId?: string;
}

export async function analyzeDependencyChangeCommand(payload?: DepChangePayload, context?: vscode.ExtensionContext): Promise<DependencyImpactResult | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de analisar mudança de dependência.');
    return undefined;
  }

  // Gather input
  const inputData = await gatherInput(payload);
  if (!inputData) return undefined;

  const { ecosystem, fromName, fromVersion, toVersion, projectId } = inputData;

  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'TIC Coder Lite: Analisando mudança de dependência...', cancellable: false },
    async (progress) => {
      progress.report({ message: 'Detectando baseline de dependências...', increment: 10 });

      // Get last scan or trigger warning
      let summary: Awaited<ReturnType<typeof getLastAnalysis>>;
      try {
        summary = context ? getLastAnalysis(context) : undefined;
      } catch {
        summary = undefined;
      }

      if (!summary) {
        const pick = await vscode.window.showWarningMessage(
          'TIC Coder Lite: Nenhuma análise de workspace encontrada. Rode Analisar Workspace primeiro ou clique em Analisar agora.',
          'Analisar agora',
          'Cancelar'
        );
        if (pick !== 'Analisar agora') return undefined;
        summary = await analyzeWorkspace(root);
        if (context) {
          await context.globalState.update('ticCoderLite.lastAnalysis', summary);
        }
        if (!summary) return undefined;
      }

      const projects = detectMultipleProjects(summary.scan, summary.risks);

      // Detect baseline
      const baselines = await detectDependencyBaseline(root, summary.scan, projects);
      const runtimeInventoryMd = renderRuntimeInventoryMd(baselines);
      await writeDepImpactBaseline(root, baselines, runtimeInventoryMd);

      progress.report({ message: 'Escaneando código fonte para sinais de risco...', increment: 20 });

      // Build request
      const request = await requestFromInput(ecosystem, fromVersion, toVersion, fromName, projectId);

      // Scan source code signals
      const sourceCodeSignals = await scanSourceCodeSignals(root, summary.scan, request.ecosystem as DependencyEcosystem);

      progress.report({ message: 'Avaliando regras de compatibilidade...', increment: 20 });

      // Evaluate compatibility
      const ruleCtx = { request, baselines, sourceCodeSignals };
      const { findings, affectedDependencies } = evaluateCompatibilityRules(ruleCtx);

      // Build affected files
      const affectedFiles = buildAffectedFiles(baselines, sourceCodeSignals, request);

      progress.report({ message: 'Calculando score de impacto...', increment: 15 });

      // Calculate score
      const impactScore = calculateImpactScore({ findings, affectedFiles, baselines, request, sourceCodeSignals });

      // Migration plan
      const migrationSteps = generateMigrationSteps(request, baselines, findings, affectedDependencies);
      const requiredTests = generateRequiredTests(request, findings);

      progress.report({ message: 'Gerando relatórios...', increment: 15 });

      const result: DependencyImpactResult = {
        id: request.id,
        request,
        impactLevel: impactScore.impactLevel,
        score: impactScore.score,
        affectedProjects: projects.map((p) => p.id),
        affectedFiles,
        affectedDependencies,
        compatibilityFindings: findings,
        breakingRisks: impactScore.breakingRisks,
        migrationSteps,
        requiredTests,
        approvalRecommendation: impactScore.approvalRecommendation,
        evidenceRefs: baselines.flatMap((b) => b.evidenceRefs).slice(0, 20),
        gaps: impactScore.gaps,
        generatedFiles: [],
        createdAt: new Date().toISOString()
      };

      const reportInput = {
        request, baselines, findings, affectedFiles, affectedDependencies,
        migrationSteps, requiredTests, breakingRisks: impactScore.breakingRisks,
        impactLevel: impactScore.impactLevel, score: impactScore.score,
        approvalRecommendation: impactScore.approvalRecommendation,
        gaps: impactScore.gaps
      };

      const reportMd = generateDependencyImpactReportMd(reportInput);
      const migrationPlanMd = generateMigrationPlanMd(reportInput);
      const approvalPack = buildDependencyApprovalPack(result);
      const approvalPackMd = generateDependencyApprovalPackMd(approvalPack);

      // Write all artifacts
      const files = await writeDepImpactResult(root, result, reportMd, migrationPlanMd, approvalPackMd);
      result.generatedFiles = files;

      progress.report({ message: 'Integrando com AI Change Firewall...', increment: 10 });

      // Integration: antibodies + traceability
      await buildDepImpactAntibodies(root, result);
      await updateDepImpactTraceability(root, result);

      progress.report({ message: 'Concluído!', increment: 10 });

      const levelEmoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }[impactScore.impactLevel] ?? '';
      const msg = `${levelEmoji} Dependency Change Impact: ${impactScore.impactLevel} (${impactScore.score}/100) — ${impactScore.approvalRecommendation}`;

      const choice = await vscode.window.showInformationMessage(
        msg,
        'Abrir Relatório',
        'Abrir Plano de Migração',
        'Abrir Approval Pack'
      );

      if (choice === 'Abrir Relatório') {
        await openDepImpactFile(root, '.tic-code/dependency-impact/latest-dependency-impact.md');
      } else if (choice === 'Abrir Plano de Migração') {
        await openDepImpactFile(root, '.tic-code/dependency-impact/latest-migration-plan.md');
      } else if (choice === 'Abrir Approval Pack') {
        await openDepImpactFile(root, '.tic-code/dependency-impact/latest-dependency-approval-pack.md');
      }

      return result;
    }
  );
}

// ─── Input Gathering ──────────────────────────────────────────────────────────

interface GatheredInput {
  ecosystem: string;
  fromName: string;
  fromVersion: string;
  toVersion: string;
  projectId?: string;
}

async function gatherInput(payload?: DepChangePayload): Promise<GatheredInput | undefined> {
  if (payload?.ecosystem && payload.fromVersion && payload.toVersion) {
    return {
      ecosystem: payload.ecosystem,
      fromName: payload.fromName ?? payload.ecosystem,
      fromVersion: payload.fromVersion,
      toVersion: payload.toVersion,
      projectId: payload.projectId
    };
  }

  // Interactive input
  const ecosystemPick = await vscode.window.showQuickPick(
    [
      { label: 'Java', description: 'Java, Spring Boot, Maven, Gradle', value: 'java' },
      { label: 'Node / React', description: 'Node.js, npm, React, Next.js, Vite', value: 'node' },
      { label: 'Python', description: 'Python, pip, poetry, Django, FastAPI', value: 'python' },
      { label: 'Infra', description: 'Docker, CI/CD, GitHub Actions, Kubernetes', value: 'infra' },
      { label: 'Outro', description: 'Outro ecossistema', value: 'unknown' }
    ],
    {
      placeHolder: 'Selecione o ecossistema da dependência/runtime'
    }
  );
  if (!ecosystemPick) return undefined;

  const ecosystem = ecosystemPick.value;

  const examples = getExamplesForEcosystem(ecosystem);
  const changeInput = await vscode.window.showInputBox({
    prompt: 'Qual mudança deseja analisar?',
    placeHolder: examples,
    value: examples.split('  ')[0]
  });
  if (!changeInput) return undefined;

  const parsed = parseChangeInput(ecosystem, changeInput.trim());
  if (!parsed) {
    vscode.window.showWarningMessage(`Não foi possível interpretar: "${changeInput}". Exemplo: "Java 8 para Java 25"`);
    return undefined;
  }

  return { ...parsed, ecosystem };
}

function getExamplesForEcosystem(ecosystem: string): string {
  switch (ecosystem) {
    case 'java': return 'Java 8 para Java 25  ou  Spring Boot 2.7.0 para 3.2.0';
    case 'node': return 'Node 14 para Node 22  ou  React 17 para React 19';
    case 'python': return 'Python 3.8 para 3.13  ou  Django 3.2 para 5.0';
    case 'infra': return 'Docker openjdk:8 para eclipse-temurin:21  ou  Node 14 para Node 22 no CI';
    default: return 'nome_lib versão_atual para versão_nova';
  }
}

function parseChangeInput(ecosystem: string, input: string): Omit<GatheredInput, 'ecosystem'> | undefined {
  // Patterns like "Java 8 para 25", "Java 8 → 25", "Java 8 to 25", "Spring Boot 2.7.0 para 3.2.0"
  const m = input.match(/^([\w\s.]+?)\s+([\d.x\-\w]+)\s+(?:para|to|→|->)\s+(?:\1\s+)?([\d.x\-\w]+)$/i)
    ?? input.match(/^([\w\s.]+?)\s+([\d.x\-\w]+)\s+(?:para|to|→|->)\s+([\d.x\-\w]+)$/i);

  if (m) {
    const fromName = m[1].trim();
    const fromVersion = m[2].trim();
    const toVersion = m[3].trim();
    void ecosystem;
    return { fromName, fromVersion, toVersion };
  }

  // Fallback: ask separately
  return undefined;
}
