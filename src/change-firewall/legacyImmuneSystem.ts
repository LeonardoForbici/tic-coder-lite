import * as vscode from 'vscode';
import type { LegacyImmuneContext } from './changeFirewallTypes';
import { asArray, readJson, readText, toStringValue, uniq } from './changeFirewallStore';

const DOCUMENTS = [
  '.tic-code/reverse-engineering/operational-contracts.md',
  '.tic-code/reverse-engineering/business-rules.md',
  '.tic-code/reverse-engineering/state-machines.md',
  '.tic-code/reverse-engineering/permissions.md',
  '.tic-code/reverse-engineering/api-contracts.md',
  '.tic-code/reverse-engineering/data-dictionary.md',
  '.tic-code/reverse-engineering/database-analysis.md',
  '.tic-code/reverse-engineering/plsql-analysis.md',
  '.tic-code/reverse-engineering/confidence-report.md',
  '.tic-code/reverse-engineering/gaps.md',
  '.tic-code/reverse-engineering/questions.md',
  '.tic-code/reverse-engineering/traceability/code-spec-matrix.md',
  '.tic-code/reverse-engineering/traceability/spec-impact-matrix.md',
  '.tic-code/reverse-engineering/traceability/risk-impact-matrix.md',
  '.tic-code/reverse-engineering/design-system/tokens.md',
  '.tic-code/reverse-engineering/design-system/components.md',
  '.tic-code/reverse-engineering/design-system/themes.md'
];

export async function loadLegacyImmuneContext(root: vscode.WorkspaceFolder): Promise<LegacyImmuneContext> {
  const rawDocuments: Record<string, string> = {};
  for (const doc of DOCUMENTS) {
    const content = await readText(root, doc);
    if (content.trim()) {
      rawDocuments[doc] = content;
    }
  }

  const graph = await readJson<Record<string, unknown>>(root, '.tic-code/reversa/context/graph.json')
    ?? await readJson<Record<string, unknown>>(root, '.tic-code/graph.json');
  const risks = await readJson<Record<string, unknown>>(root, '.tic-code/reversa/context/risks.json')
    ?? await readJson<Record<string, unknown>>(root, '.tic-code/risks.json');
  const screenImpact = await readJson<Record<string, unknown>>(root, '.tic-code/impact/latest-screen-impact.json');
  const filesToEdit = await readJson<unknown[]>(root, '.tic-code/impact/latest-files-to-edit.json');

  const riskItems = extractRiskItems(risks);
  const graphFiles = extractGraphFiles(graph);
  const criticalFiles = uniq([
    ...riskItems.filter((risk) => /critical|high/i.test(risk.level)).map((risk) => risk.file),
    ...extractCriticalGraphFiles(graph)
  ]);

  return {
    rules: extractBullets(rawDocuments['.tic-code/reverse-engineering/business-rules.md']),
    contracts: extractBullets(rawDocuments['.tic-code/reverse-engineering/operational-contracts.md'])
      .concat(extractBullets(rawDocuments['.tic-code/reverse-engineering/api-contracts.md'])),
    permissions: extractBullets(rawDocuments['.tic-code/reverse-engineering/permissions.md']),
    databaseObjects: uniq([
      ...extractDatabaseTerms(rawDocuments['.tic-code/reverse-engineering/database-analysis.md']),
      ...extractDatabaseTerms(rawDocuments['.tic-code/reverse-engineering/plsql-analysis.md']),
      ...extractDatabaseTerms(rawDocuments['.tic-code/reverse-engineering/data-dictionary.md'])
    ]),
    criticalModules: uniq([
      ...riskItems.filter((risk) => /critical|high/i.test(risk.level)).map((risk) => moduleFromPath(risk.file)),
      ...extractCriticalGraphModules(graph)
    ]),
    criticalFiles,
    gaps: extractBullets(rawDocuments['.tic-code/reverse-engineering/gaps.md']).concat(
      extractBullets(rawDocuments['.tic-code/reverse-engineering/questions.md']).filter((line) => /lacuna|gap|confirmar|qual/i.test(line))
    ),
    riskAreas: uniq(riskItems.map((risk) => `${risk.level.toUpperCase()}: ${risk.title} (${risk.file})`)),
    traceabilityLinks: extractTraceabilityLinks(rawDocuments),
    graphFiles,
    screenFiles: extractScreenFiles(screenImpact),
    filesToEdit: extractFilesToEdit(filesToEdit),
    rawDocuments
  };
}

function extractBullets(content?: string): string[] {
  if (!content) return [];
  return uniq(content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]|\|/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, '').slice(0, 240)));
}

function extractDatabaseTerms(content?: string): string[] {
  if (!content) return [];
  const terms = new Set<string>();
  const patterns = [
    /\b(?:table|tabela|view|trigger|procedure|function|package)\s+([A-Z_][A-Z0-9_$#.]*)/gi,
    /\b([A-Z][A-Z0-9_$#]{2,})\b/g
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] && !['SELECT', 'UPDATE', 'DELETE', 'INSERT', 'WHERE', 'FROM'].includes(match[1].toUpperCase())) {
        terms.add(match[1]);
      }
    }
  }
  return [...terms].slice(0, 120);
}

function extractRiskItems(risks: Record<string, unknown> | undefined): Array<{ level: string; title: string; file: string }> {
  const values = asArray(risks?.risks);
  return values.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      level: toStringValue(record.level),
      title: toStringValue(record.title),
      file: toStringValue(record.file)
    };
  }).filter((item) => item.file);
}

function extractGraphFiles(graph: Record<string, unknown> | undefined): string[] {
  return uniq(asArray(graph?.nodes).map((node) => toStringValue((node as Record<string, unknown>).path)).filter(Boolean));
}

function extractCriticalGraphFiles(graph: Record<string, unknown> | undefined): string[] {
  return uniq(asArray(graph?.nodes)
    .filter((node) => /high|critical/i.test(toStringValue((node as Record<string, unknown>).riskLevel)))
    .map((node) => toStringValue((node as Record<string, unknown>).path))
    .filter(Boolean));
}

function extractCriticalGraphModules(graph: Record<string, unknown> | undefined): string[] {
  return uniq(asArray(graph?.nodes)
    .filter((node) => /high|critical/i.test(toStringValue((node as Record<string, unknown>).riskLevel)))
    .map((node) => toStringValue((node as Record<string, unknown>).module))
    .filter(Boolean));
}

function extractScreenFiles(screenImpact: Record<string, unknown> | undefined): string[] {
  const candidates = asArray(screenImpact?.fileCandidates).map((item) => toStringValue((item as Record<string, unknown>).file));
  const frontend = asArray(screenImpact?.frontendMatches).map((item) => toStringValue((item as Record<string, unknown>).file));
  return uniq([...candidates, ...frontend].filter(Boolean));
}

function extractFilesToEdit(filesToEdit: unknown[] | undefined): string[] {
  return uniq((filesToEdit ?? []).map((item) => toStringValue((item as Record<string, unknown>).file)).filter(Boolean));
}

function extractTraceabilityLinks(rawDocuments: Record<string, string>): Array<{ source: string; target: string; reason: string }> {
  const text = [
    rawDocuments['.tic-code/reverse-engineering/traceability/code-spec-matrix.md'],
    rawDocuments['.tic-code/reverse-engineering/traceability/spec-impact-matrix.md'],
    rawDocuments['.tic-code/reverse-engineering/traceability/risk-impact-matrix.md']
  ].filter(Boolean).join('\n');
  return text.split(/\r?\n/)
    .filter((line) => line.includes('|') && !line.includes('---'))
    .slice(0, 80)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      return { source: parts[0] ?? 'N/A', target: parts[1] ?? 'N/A', reason: parts.slice(2).join(' | ') };
    });
}

function moduleFromPath(file: string): string {
  const lower = file.toLowerCase();
  if (/controller|route|api/.test(lower)) return 'api';
  if (/service|bo|usecase/.test(lower)) return 'service';
  if (/repository|dao/.test(lower)) return 'repository';
  if (/sql|plsql|database|migration|trigger|procedure|package/.test(lower)) return 'database';
  if (/auth|security|permission|role/.test(lower)) return 'security';
  if (/component|screen|page|view|webview/.test(lower)) return 'frontend';
  return file.split('/')[0] || 'root';
}
