import * as vscode from 'vscode';
import type { ChangeSafetyReport, DiffImpactResult, GitDiffSummary, RequiredTestItem, TriggeredAntibody } from './changeFirewallTypes';
import { evidenceRef, readJson, uniq } from './changeFirewallStore';

export function buildRequiredTestDetails(diff: GitDiffSummary, impact: DiffImpactResult, triggered: TriggeredAntibody[]): RequiredTestItem[] {
  const tests: string[] = [];
  const files = diff.changedFiles.join(' ').toLowerCase();
  const sensitive = impact.sensitiveChanges.join(' ').toLowerCase();

  if (/component|screen|page|view|theme|token|design/.test(files + sensitive)) {
    tests.push('Visual: validar screenshot da tela afetada e estados principais.');
    tests.push('Visual: validar dark/light mode quando houver tema ou token global.');
    tests.push('Frontend: testar componente isolado e fluxo da tela.');
  }
  if (/api|controller|route|frontend/.test(files + sensitive)) {
    tests.push('Frontend: validar chamada de API com mock de sucesso e erro.');
    tests.push('Backend: testar endpoint afetado com contrato esperado.');
  }
  if (/service|bo|domain|validation|dto|enum|status/.test(files + sensitive)) {
    tests.push('Backend: testar service/regra de dominio nos cenarios principal e limite.');
    tests.push('Backend: validar DTO, schema ou enum/status afetado.');
  }
  if (/repository|dao|sql|database|migration/.test(files + sensitive) || impact.impactedDatabaseObjects.length) {
    tests.push('Database: validar query, filtros, ordenacao e operacoes de escrita em dados representativos.');
    tests.push('Database: revisar migration/script e validar rollback sem executar automaticamente.');
  }
  if (/plsql|trigger|procedure|package|commit|rollback/.test(files + sensitive)) {
    tests.push('PLSQL: testar trigger/procedure/package com cenarios de sucesso, erro e rollback.');
  }
  if (/auth|security|permission|role|profile|user/.test(files + sensitive) || triggered.some((item) => item.name.toLowerCase().includes('permiss'))) {
    tests.push('Permissions: validar admin, usuario comum, usuario sem permissao e perfil especifico.');
  }
  if (diff.deletedFiles.some((file) => /test|spec/i.test(file))) {
    tests.push('Tests: justificar teste removido e adicionar cobertura equivalente.');
  }
  if (!tests.length) {
    tests.push('Regressao: executar teste focado nos arquivos alterados e validar fluxo manual minimo.');
  }
  return uniq(tests).map((test) => ({
    name: test,
    kind: test.startsWith('Visual:') || test.startsWith('Permissions:') ? 'manual' : 'recommended',
    relatedFile: diff.changedFiles[0],
    relatedRisk: impact.sensitiveChanges[0] ?? triggered[0]?.name,
    reason: 'Recomendado por sinal real no diff, arquivo alterado ou antibody acionado.',
    confidence: 'INFERRED',
    evidenceRefs: [
      ...diff.changedFiles.slice(0, 3).map((file) => evidenceRef({ source: 'git-diff', filePath: file, confidence: 'CONFIRMED', reason: 'Arquivo alterado no diff que motivou teste.' })),
      ...triggered.slice(0, 3).flatMap((item) => item.evidenceRefs)
    ]
  }));
}

export function renderRequiredTestsMd(report: Pick<ChangeSafetyReport, 'id' | 'requiredTests' | 'requiredTestDetails' | 'changedFiles'>): string {
  const existing = report.requiredTestDetails.filter((item) => item.kind === 'existing');
  const recommended = report.requiredTestDetails.filter((item) => item.kind === 'recommended');
  const manual = report.requiredTestDetails.filter((item) => item.kind === 'manual');
  return `# Required Tests - AI Change Firewall

Sessao: ${report.id}

## Arquivos alterados

${report.changedFiles.map((file) => `- ${file}`).join('\n') || '- N/A'}

## Testes existentes detectados

${existing.map((test) => `- ${test.filePath ?? test.name} - ${test.reason}`).join('\n') || '- 🔴 LACUNA: nenhum arquivo de teste real detectado neste artefato.'}

## Testes recomendados

${recommended.map((test) => `- ${test.name} | motivo: ${test.reason} | confiança: ${test.confidence}`).join('\n') || '- N/A'}

## Testes manuais obrigatorios

${manual.map((test) => `- ${test.name} | motivo: ${test.reason} | confiança: ${test.confidence}`).join('\n') || '- N/A'}
`;
}

export async function detectExistingTests(root: vscode.WorkspaceFolder, changedFiles: string[]): Promise<RequiredTestItem[]> {
  const scan = await readJson<{ files?: Array<{ relativePath?: string }> }>(root, '.tic-code/scan.json');
  const files = (scan?.files ?? []).map((file) => file.relativePath ?? '').filter(Boolean);
  const testFiles = files.filter((file) => isTestFile(file));
  const changedRoots = changedFiles.map((file) => file.replace(/\.[^.]+$/, '').split('/').pop()?.toLowerCase() ?? '').filter(Boolean);
  const related = testFiles.filter((file) => {
    const lower = file.toLowerCase();
    return changedRoots.some((rootName) => rootName.length >= 3 && lower.includes(rootName));
  });
  return uniq(related.length ? related : testFiles.slice(0, 20)).map((file) => ({
    name: `Rodar teste existente: ${file}`,
    kind: 'existing',
    filePath: file,
    reason: related.includes(file) ? 'Teste existente relacionado por nome ao arquivo alterado.' : 'Teste existente detectado no workspace.',
    confidence: related.includes(file) ? 'INFERRED' : 'CONFIRMED',
    evidenceRefs: [evidenceRef({ source: 'scan', filePath: file, confidence: 'CONFIRMED', reason: 'Arquivo de teste real encontrado em .tic-code/scan.json.' })]
  }));
}

function isTestFile(file: string): boolean {
  return /(^|\/)(tests?|__tests__)(\/|$)|(\.test|\.spec)\.(ts|tsx|js|jsx)$|Test\.java$|IT\.java$|\.feature$/i.test(file);
}
