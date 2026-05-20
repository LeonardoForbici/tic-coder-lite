/**
 * Store de Dependency Change Impact.
 * Gerencia leitura/escrita de artefatos em .tic-code/dependency-impact/.
 */

import * as vscode from 'vscode';
import { getTicCodeUri, readJsonIfExists } from '../utils/workspace';
import type { DependencyBaseline, DependencyChangeRequest, DependencyImpactResult } from './dependencyImpactTypes';

export const DEP_IMPACT_BASE = 'dependency-impact';

export function depImpactUri(root: vscode.WorkspaceFolder, ...parts: string[]): vscode.Uri {
  return getTicCodeUri(root, DEP_IMPACT_BASE, ...parts);
}

export function depImpactSessionUri(root: vscode.WorkspaceFolder, sessionId: string, ...parts: string[]): vscode.Uri {
  return getTicCodeUri(root, DEP_IMPACT_BASE, 'sessions', sessionId, ...parts);
}

export async function ensureDepImpactFolders(root: vscode.WorkspaceFolder, sessionId?: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(depImpactUri(root));
  await vscode.workspace.fs.createDirectory(depImpactUri(root, 'sessions'));
  if (sessionId) {
    await vscode.workspace.fs.createDirectory(depImpactSessionUri(root, sessionId));
  }
}

export async function writeTextFile(uri: vscode.Uri, content: string): Promise<void> {
  const text = content.endsWith('\n') ? content : `${content}\n`;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}

export async function writeJsonFile(uri: vscode.Uri, value: unknown): Promise<void> {
  await writeTextFile(uri, JSON.stringify(value, null, 2));
}

export function createDepImpactSessionId(): string {
  return `dep-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function readLatestDepImpactResult(root: vscode.WorkspaceFolder): Promise<DependencyImpactResult | null> {
  const uri = depImpactUri(root, 'latest-dependency-impact.json');
  const result = await readJsonIfExists<DependencyImpactResult>(uri);
  return result ?? null;
}

export async function readDepImpactBaseline(root: vscode.WorkspaceFolder): Promise<DependencyBaseline[] | null> {
  const uri = depImpactUri(root, 'baseline.json');
  const result = await readJsonIfExists<DependencyBaseline[]>(uri);
  return result ?? null;
}

export async function writeDepImpactResult(
  root: vscode.WorkspaceFolder,
  result: DependencyImpactResult,
  reportMd: string,
  migrationPlanMd: string,
  approvalPackMd: string
): Promise<string[]> {
  const sessionId = result.id;
  await ensureDepImpactFolders(root, sessionId);

  const files: string[] = [];

  // Session files
  const writes: Array<[vscode.Uri, unknown]> = [
    [depImpactSessionUri(root, sessionId, 'dependency-change-input.json'), result.request],
    [depImpactSessionUri(root, sessionId, 'dependency-impact.json'), result],
    [depImpactSessionUri(root, sessionId, 'dependency-impact.md'), reportMd],
    [depImpactSessionUri(root, sessionId, 'migration-plan.md'), migrationPlanMd],
    [depImpactSessionUri(root, sessionId, 'dependency-approval-pack.md'), approvalPackMd],
    // Latest
    [depImpactUri(root, 'latest-dependency-impact.json'), result],
    [depImpactUri(root, 'latest-dependency-impact.md'), reportMd],
    [depImpactUri(root, 'latest-migration-plan.md'), migrationPlanMd],
    [depImpactUri(root, 'latest-dependency-approval-pack.md'), approvalPackMd]
  ];

  for (const [uri, content] of writes) {
    if (typeof content === 'string') {
      await writeTextFile(uri, content);
    } else {
      await writeJsonFile(uri, content);
    }
    files.push(uri.fsPath.replace(/\\/g, '/'));
  }

  return files;
}

export async function writeDepImpactBaseline(
  root: vscode.WorkspaceFolder,
  baselines: DependencyBaseline[],
  runtimeInventoryMd: string
): Promise<void> {
  await ensureDepImpactFolders(root);
  await writeJsonFile(depImpactUri(root, 'baseline.json'), baselines);
  await writeTextFile(depImpactUri(root, 'runtime-inventory.md'), runtimeInventoryMd);
}

export async function updateDepImpactTraceability(root: vscode.WorkspaceFolder, result: DependencyImpactResult): Promise<void> {
  const traceDir = getTicCodeUri(root, 'reverse-engineering', 'traceability');
  await vscode.workspace.fs.createDirectory(traceDir);
  const uri = vscode.Uri.joinPath(traceDir, 'dependency-impact.md');

  let existing = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    existing = Buffer.from(bytes).toString('utf8');
  } catch {
    existing = '# Dependency Impact Traceability\n';
  }

  const newLine = `\n## ${new Date().toISOString()} — ${result.request.fromName} ${result.request.fromVersion} → ${result.request.toVersion}\n\n- Impacto: ${result.impactLevel}\n- Recomendação: ${result.approvalRecommendation}\n- Score: ${result.score}/100\n- Findings: ${result.compatibilityFindings.length}\n- Arquivos afetados: ${result.affectedFiles.length}\n`;

  await writeTextFile(uri, existing.trimEnd() + newLine);
}

export async function openDepImpactFile(root: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  const uri = vscode.Uri.joinPath(root.uri, ...parts);
  try {
    await vscode.workspace.fs.stat(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(`Arquivo ainda não gerado: ${relativePath}`);
  }
}

export async function buildDepImpactAntibodies(
  root: vscode.WorkspaceFolder,
  result: DependencyImpactResult
): Promise<void> {
  // Integration with Legacy Antibodies: create dependency-specific antibodies
  const antibodiesDir = getTicCodeUri(root, 'change-firewall', 'antibodies');
  try {
    await vscode.workspace.fs.createDirectory(antibodiesDir);
  } catch { /* ok */ }

  const antibodiesUri = vscode.Uri.joinPath(antibodiesDir, 'dependency-antibodies.json');
  const antibodies = result.compatibilityFindings
    .filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH')
    .map((f, i) => ({
      id: `AB-DEP-${String(i + 1).padStart(3, '0')}`,
      name: f.title,
      category: 'dependency-change',
      severity: f.severity,
      rule: f.description,
      evidenceFiles: f.evidenceRefs.map((r) => r.filePath),
      evidenceRefs: f.evidenceRefs,
      riskIfViolated: `Mudança sem correção pode causar falha de build ou runtime: ${f.title}`,
      detectionSignals: [],
      validationSteps: [f.recommendedAction],
      createdAt: result.createdAt,
      confidence: f.confidence
    }));

  if (antibodies.length > 0) {
    await writeJsonFile(antibodiesUri, antibodies);
  }
}

export async function requestFromInput(
  ecosystem: string,
  fromVersion: string,
  toVersion: string,
  fromName?: string,
  projectId?: string
): Promise<DependencyChangeRequest> {
  const id = createDepImpactSessionId();
  const ecosystems = ['java', 'node', 'python', 'database', 'infra', 'unknown'] as const;
  const ecoParsed = ecosystems.includes(ecosystem as never) ? ecosystem as DependencyChangeRequest['ecosystem'] : 'unknown';
  return {
    id,
    projectId,
    ecosystem: ecoParsed,
    changeType: 'runtime',
    fromName: fromName ?? ecoParsed,
    fromVersion,
    toName: fromName ?? ecoParsed,
    toVersion,
    description: `Migração ${fromName ?? ecoParsed} de ${fromVersion} para ${toVersion}`,
    createdAt: new Date().toISOString()
  };
}
