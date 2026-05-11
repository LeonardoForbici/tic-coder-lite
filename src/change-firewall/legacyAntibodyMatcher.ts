import * as vscode from 'vscode';
import type { ChangeFirewallSession, DiffImpactResult, GitDiffSummary, LegacyAntibody, TriggeredAntibody } from './changeFirewallTypes';
import { evidenceRef, readJson, sessionUri, uniq, writeJsonFile } from './changeFirewallStore';

export async function loadLegacyAntibodies(root: vscode.WorkspaceFolder): Promise<LegacyAntibody[]> {
  return (await readJson<LegacyAntibody[]>(root, '.tic-code/change-firewall/antibodies/legacy-antibodies.json')) ?? [];
}

export async function matchLegacyAntibodies(
  root: vscode.WorkspaceFolder,
  session: ChangeFirewallSession,
  antibodies: LegacyAntibody[],
  diff: GitDiffSummary,
  impact: DiffImpactResult
): Promise<TriggeredAntibody[]> {
  const changedFiles = diff.changedFiles;
  const haystack = [
    ...changedFiles,
    ...diff.symbolsTouched,
    ...diff.possibleBehaviorChanges,
    ...impact.sensitiveChanges,
    ...impact.impactedDatabaseObjects,
    ...impact.impactedApis,
    ...impact.impactedModules
  ].join(' ').toLowerCase();

  const triggered = antibodies.map((antibody) => {
    const matchedFiles = uniq([
      ...changedFiles.filter((file) => antibody.evidenceFiles.some((evidence) => sameOrRelated(file, evidence))),
      ...changedFiles.filter((file) => antibody.relatedModules.some((module) => file.toLowerCase().includes(module.toLowerCase())))
    ]);
    const matchedSignals = uniq([
      ...antibody.detectionSignals.filter((signal) => haystack.includes(signal.toLowerCase())),
      ...antibody.relatedTables.filter((table) => haystack.includes(table.toLowerCase())),
      ...antibody.relatedEndpoints.filter((endpoint) => haystack.includes(endpoint.toLowerCase())),
      ...antibody.relatedScreens.filter((screen) => haystack.includes(screen.toLowerCase()))
    ]);
    if (!matchedFiles.length) return undefined;
    if (!matchedSignals.length && !antibody.evidenceRefs.some((ref) => ref.filePath && matchedFiles.some((file) => sameOrRelated(file, ref.filePath ?? '')))) {
      return undefined;
    }
    const confidence = matchedFiles.length && matchedSignals.length ? 'CONFIRMED' : antibody.confidence === 'CONFIRMED' ? 'INFERRED' : antibody.confidence;
    const evidenceRefs = [
      ...antibody.evidenceRefs.filter((ref) => !ref.filePath || matchedFiles.some((file) => sameOrRelated(file, ref.filePath ?? ''))),
      ...matchedFiles.map((file) => evidenceRef({ source: 'git-diff', filePath: file, confidence, reason: `Arquivo alterado no diff acionou ${antibody.id}.` }))
    ];
    return {
      antibodyId: antibody.id,
      name: antibody.name,
      severity: antibody.severity,
      matchedFiles,
      matchedSignals,
      reason: buildReason(antibody, matchedFiles, matchedSignals),
      evidenceRefs,
      recommendation: recommendationFor(antibody),
      confidence
    } satisfies TriggeredAntibody;
  }).filter((item): item is TriggeredAntibody => Boolean(item));

  await writeJsonFile(sessionUri(root, session, 'triggered-antibodies.json'), triggered);
  return triggered;
}

function sameOrRelated(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.endsWith(b) || b.endsWith(a) || a.includes(b) || b.includes(a);
}

function buildReason(antibody: LegacyAntibody, files: string[], signals: string[]): string {
  const parts = [];
  if (files.length) parts.push(`arquivo(s) batem com evidencias: ${files.slice(0, 5).join(', ')}`);
  if (signals.length) parts.push(`sinais detectados: ${signals.slice(0, 8).join(', ')}`);
  return `${antibody.rule} Match: ${parts.join(' | ')}`;
}

function recommendationFor(antibody: LegacyAntibody): string {
  if (antibody.severity === 'CRITICAL') return 'Bloquear merge ate revisao humana, testes obrigatorios e rollback documentado.';
  if (antibody.severity === 'HIGH') return 'Exigir revisao obrigatoria com evidencia de testes e rastreabilidade.';
  return 'Revisar impacto e anexar testes recomendados antes de aceitar.';
}
