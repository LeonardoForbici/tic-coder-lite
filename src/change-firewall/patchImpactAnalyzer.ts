import * as vscode from 'vscode';
import type { ChangeFirewallSession, DiffImpactResult, EvidenceRef, GitDiffSummary, LegacyImmuneContext } from './changeFirewallTypes';
import { evidenceRef, relativeArtifact, sessionUri, uniq, writeJsonFile } from './changeFirewallStore';

export async function analyzePatchImpact(
  root: vscode.WorkspaceFolder,
  session: ChangeFirewallSession,
  diff: GitDiffSummary,
  immune: LegacyImmuneContext
): Promise<DiffImpactResult> {
  const changed = diff.changedFiles;
  const impactedModules = uniq(changed.map(moduleFromPath));
  const sensitiveChanges = uniq([
    ...changed.flatMap(classifySensitiveFile),
    ...diff.possibleBehaviorChanges
  ]);
  const evidenceRefs: EvidenceRef[] = [
    ...changed.map((file) => evidenceRef({ source: 'git-diff', filePath: file, confidence: 'CONFIRMED', reason: 'Arquivo alterado no diff real.' })),
    ...diff.symbolsTouched.map((symbol) => evidenceRef({ source: 'git-diff', symbol, confidence: 'CONFIRMED', reason: 'Simbolo/titulo de hunk extraido do diff.' })),
    ...sensitiveChanges.map((signal) => evidenceRef({ source: 'git-diff', matchedText: signal, confidence: signal.includes(':') ? 'CONFIRMED' : 'INFERRED', reason: 'Sinal sensivel detectado por caminho, hunk ou conteudo do diff.' }))
  ];

  const result: DiffImpactResult = {
    impactedModules,
    impactedContracts: matchByFilesOrTerms(immune.contracts, changed, diff.symbolsTouched),
    impactedBusinessRules: matchByFilesOrTerms(immune.rules, changed, diff.symbolsTouched),
    impactedPermissions: matchByFilesOrTerms(immune.permissions, changed, diff.symbolsTouched),
    impactedDatabaseObjects: matchDatabaseObjects(immune.databaseObjects, changed, diff.possibleBehaviorChanges),
    impactedScreens: uniq(immune.screenFiles.filter((file) => changed.some((changedFile) => sameOrRelated(file, changedFile)))),
    impactedApis: inferApis(changed, diff.symbolsTouched, immune.contracts),
    impactedTests: inferImpactedTests(changed),
    confidenceSummary: buildConfidence(diff, immune),
    sensitiveChanges,
    evidenceRefs,
    gaps: buildGaps(diff, immune)
  };

  const uri = sessionUri(root, session, 'diff-impact.json');
  await writeJsonFile(uri, result);
  void relativeArtifact(root, uri);
  return result;
}

function buildGaps(diff: GitDiffSummary, immune: LegacyImmuneContext): string[] {
  const gaps: string[] = [];
  if (!diff.isGitRepository) gaps.push('🔴 LACUNA: Git diff real nao disponivel.');
  if (!immune.graphFiles.length) gaps.push('🔴 LACUNA: graph.json nao disponivel ou vazio.');
  if (!immune.contracts.length) gaps.push('🔴 LACUNA: contratos operacionais/API nao carregados.');
  if (!immune.rules.length) gaps.push('🔴 LACUNA: business-rules.md ausente ou vazio.');
  if (!immune.databaseObjects.length) gaps.push('🔴 LACUNA: database/plsql analysis sem objetos detectados.');
  return gaps;
}

function matchByFilesOrTerms(items: string[], files: string[], symbols: string[]): string[] {
  const haystack = [...files, ...symbols].join(' ').toLowerCase();
  return uniq(items.filter((item) => {
    const lower = item.toLowerCase();
    const terms = lower.split(/[^a-z0-9_./-]+/i).filter((term) => term.length >= 4).slice(0, 8);
    return terms.some((term) => haystack.includes(term));
  }).slice(0, 30));
}

function matchDatabaseObjects(objects: string[], files: string[], signals: string[]): string[] {
  const haystack = [...files, ...signals].join(' ').toUpperCase();
  return uniq(objects.filter((objectName) => haystack.includes(objectName.toUpperCase())).slice(0, 50));
}

function inferApis(files: string[], symbols: string[], contracts: string[]): string[] {
  const apiFiles = files.filter((file) => /controller|route|api|endpoint|handler/i.test(file));
  const contractMatches = matchByFilesOrTerms(contracts, files, symbols).filter((item) => /GET|POST|PUT|PATCH|DELETE|endpoint|rota|api/i.test(item));
  return uniq([...apiFiles, ...contractMatches]).slice(0, 30);
}

function inferImpactedTests(files: string[]): string[] {
  const tests = files.filter((file) => /test|spec|__tests__|\.feature/i.test(file));
  const suggested = files
    .filter((file) => !/test|spec|__tests__/i.test(file))
    .map((file) => {
      const noExt = file.replace(/\.[^.]+$/, '');
      return `${noExt}.spec`;
    });
  return uniq([...tests, ...suggested]).slice(0, 30);
}

function buildConfidence(diff: GitDiffSummary, immune: LegacyImmuneContext): string[] {
  const lines: string[] = [];
  lines.push(diff.isGitRepository ? 'CONFIRMED: diff lido localmente via git.' : 'GAP: workspace nao e repositorio Git.');
  lines.push(immune.rules.length ? `CONFIRMED: ${immune.rules.length} regra(s) de negocio carregada(s).` : 'GAP: business-rules.md ausente ou vazio.');
  lines.push(immune.contracts.length ? `CONFIRMED: ${immune.contracts.length} contrato(s) carregado(s).` : 'GAP: contratos operacionais/API ausentes ou vazios.');
  lines.push(immune.permissions.length ? `CONFIRMED: ${immune.permissions.length} permissao(oes) carregada(s).` : 'GAP: permissions.md ausente ou vazio.');
  lines.push(immune.databaseObjects.length ? `CONFIRMED: ${immune.databaseObjects.length} objeto(s) de banco extraido(s).` : 'GAP: analise de banco/PLSQL ausente ou vazia.');
  return lines;
}

function classifySensitiveFile(file: string): string[] {
  const lower = file.toLowerCase();
  const signals: string[] = [];
  if (/controller|route|api|endpoint|handler/.test(lower)) signals.push('controller endpoint');
  if (/service|bo|usecase|domain/.test(lower)) signals.push('service/BO/domain');
  if (/repository|dao|mapper/.test(lower)) signals.push('repository/DAO');
  if (/sql|plsql|migration|database|trigger|procedure|package|\.pkb|\.pks|\.trg/.test(lower)) signals.push('SQL/PLSQL');
  if (/auth|security|permission|role|profile|user/.test(lower)) signals.push('permission/security');
  if (/dto|schema|validation|validator/.test(lower)) signals.push('DTO validation');
  if (/enum|status|state|workflow/.test(lower)) signals.push('enum/status');
  if (/theme|token|design-system|variables|colors/.test(lower)) signals.push('theme token/design system');
  if (/component|shared|common|ui/.test(lower)) signals.push('shared component');
  if (/test|spec/.test(lower)) signals.push('tests touched');
  if (/config|env|settings|production|docker|workflow/.test(lower)) signals.push('config/env');
  return signals;
}

function moduleFromPath(file: string): string {
  const signals = classifySensitiveFile(file);
  if (signals.includes('SQL/PLSQL')) return 'database';
  if (signals.includes('permission/security')) return 'security';
  if (signals.includes('controller endpoint')) return 'api';
  if (signals.includes('service/BO/domain')) return 'service';
  if (signals.includes('repository/DAO')) return 'repository';
  if (signals.includes('theme token/design system')) return 'design-system';
  if (signals.includes('shared component')) return 'frontend';
  return file.split('/')[0] || 'root';
}

function sameOrRelated(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.endsWith(right) || right.endsWith(left);
}
