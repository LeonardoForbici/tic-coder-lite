import * as vscode from 'vscode';
import { renderArchitectureMarkdown } from '../scanner/buildGraph';
import type { GraphEdge, GraphNode, LightweightGraph } from '../scanner/buildGraph';
import { detectProjects } from '../scanner/detectProjects';
import { renderInventoryMarkdown } from '../scanner/detectStack';
import { renderRisksMarkdown } from '../scanner/detectRisks';
import type { RiskReport } from '../scanner/detectRisks';
import type { ProjectSummary } from '../types';
import { generateAgentContextMd } from './generateAgentContextMd';
import { generateConfidenceReportMd } from './generateConfidenceReportMd';
import { generateQuestionsMd } from './generateQuestionsMd';

export interface TicCodeArtifacts {
  scanJson: vscode.Uri;
  modulesJson: vscode.Uri;
  inventoryMd: vscode.Uri;
  graphJson: vscode.Uri;
  architectureMd: vscode.Uri;
  risksJson: vscode.Uri;
  risksMd: vscode.Uri;
  agentContextMd: vscode.Uri;
  confidenceReportMd: vscode.Uri;
  questionsMd: vscode.Uri;
}

export async function writeTicCodeFolder(root: vscode.WorkspaceFolder, summary: ProjectSummary): Promise<TicCodeArtifacts> {
  const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
  const artifacts: TicCodeArtifacts = {
    scanJson: vscode.Uri.joinPath(ticCodeDir, 'scan.json'),
    modulesJson: vscode.Uri.joinPath(ticCodeDir, 'modules.json'),
    inventoryMd: vscode.Uri.joinPath(ticCodeDir, 'inventory.md'),
    graphJson: vscode.Uri.joinPath(ticCodeDir, 'graph.json'),
    architectureMd: vscode.Uri.joinPath(ticCodeDir, 'architecture.md'),
    risksJson: vscode.Uri.joinPath(ticCodeDir, 'risks.json'),
    risksMd: vscode.Uri.joinPath(ticCodeDir, 'risks.md'),
    agentContextMd: vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'),
    confidenceReportMd: vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'),
    questionsMd: vscode.Uri.joinPath(ticCodeDir, 'questions.md')
  };

  await vscode.workspace.fs.createDirectory(ticCodeDir);
  await writeText(artifacts.scanJson, `${JSON.stringify(summary.scan, null, 2)}\n`);
  await writeText(artifacts.modulesJson, `${JSON.stringify(summary.inventory, null, 2)}\n`);
  await writeText(artifacts.inventoryMd, renderInventoryMarkdown(summary.inventory, summary.scan));
  await writeText(artifacts.graphJson, `${JSON.stringify(summary.graph, null, 2)}\n`);
  await writeText(artifacts.architectureMd, renderArchitectureMarkdown(summary.graph, summary.inventory));
  await writeText(artifacts.risksJson, `${JSON.stringify(summary.risks, null, 2)}\n`);
  await writeText(artifacts.risksMd, renderRisksMarkdown(summary.risks));
  await writeText(artifacts.agentContextMd, generateAgentContextMd(summary));
  await writeText(artifacts.confidenceReportMd, generateConfidenceReportMd(summary));
  await writeText(artifacts.questionsMd, generateQuestionsMd(summary));
  await writeProjectArtifacts(root, summary);

  return artifacts;
}

async function writeProjectArtifacts(root: vscode.WorkspaceFolder, summary: ProjectSummary): Promise<void> {
  const projects = detectProjects(summary.scan, summary.risks);
  const databaseProject = projects.find((project) => project.kind === 'database');
  if (!databaseProject) {
    return;
  }

  const projectDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'projects', 'database');
  await vscode.workspace.fs.createDirectory(projectDir);
  const databaseFiles = new Set(summary.inventory.plsql.files);
  const databaseNodeIds = new Set(
    summary.graph.nodes
      .filter((node) => node.module === 'database' || databaseFiles.has(node.path) || node.type.startsWith('plsql_'))
      .map((node) => node.id)
  );
  const graph: LightweightGraph = {
    ...summary.graph,
    nodes: summary.graph.nodes.filter((node) => databaseNodeIds.has(node.id)),
    edges: summary.graph.edges.filter((edge) => databaseNodeIds.has(edge.from) && databaseNodeIds.has(edge.to)),
    stats: buildGraphStats(
      summary.graph.nodes.filter((node) => databaseNodeIds.has(node.id)),
      summary.graph.edges.filter((edge) => databaseNodeIds.has(edge.from) && databaseNodeIds.has(edge.to))
    )
  };
  const risks: RiskReport = {
    ...summary.risks,
    risks: summary.risks.risks.filter((risk) => risk.category === 'plsql' || databaseFiles.has(risk.file)),
    summary: summarizeRisks(summary.risks.risks.filter((risk) => risk.category === 'plsql' || databaseFiles.has(risk.file)))
  };
  const scan = {
    ...summary.scan,
    files: summary.scan.files.filter((file) => databaseFiles.has(file.relativePath)),
    totals: {
      files: databaseFiles.size,
      lines: summary.scan.files.filter((file) => databaseFiles.has(file.relativePath)).reduce((total, file) => total + file.lines, 0),
      size: summary.scan.files.filter((file) => databaseFiles.has(file.relativePath)).reduce((total, file) => total + file.size, 0)
    }
  };

  await writeText(vscode.Uri.joinPath(projectDir, 'scan.json'), `${JSON.stringify(scan, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(projectDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(projectDir, 'risks.json'), `${JSON.stringify(risks, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(projectDir, 'agent-context.md'), generateDatabaseContext(summary));
}

function buildGraphStats(nodes: GraphNode[], edges: GraphEdge[]): LightweightGraph['stats'] {
  const modules: Record<string, number> = {};
  const degree = new Map<string, number>();
  for (const node of nodes) {
    modules[node.module] = (modules[node.module] ?? 0) + 1;
  }
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    internalEdges: edges.filter((edge) => edge.type === 'IMPORTS').length,
    externalEdges: edges.filter((edge) => edge.type !== 'IMPORTS').length,
    modules,
    centralFiles: [...degree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([filePath, value]) => ({ path: filePath, degree: value }))
  };
}

function summarizeRisks(risks: RiskReport['risks']): RiskReport['summary'] {
  return {
    total: risks.length,
    low: risks.filter((risk) => risk.level === 'low').length,
    medium: risks.filter((risk) => risk.level === 'medium').length,
    high: risks.filter((risk) => risk.level === 'high').length,
    critical: risks.filter((risk) => risk.level === 'critical').length
  };
}

function generateDatabaseContext(summary: ProjectSummary): string {
  const plsql = summary.inventory.plsql;
  const packages = plsql.entities.filter((entity) => entity.kind === 'package' || entity.kind === 'package_body').slice(0, 30);
  const routines = plsql.entities.filter((entity) => entity.kind === 'procedure' || entity.kind === 'function').slice(0, 30);
  const triggers = plsql.entities.filter((entity) => entity.kind === 'trigger').slice(0, 30);
  const plsqlRisks = summary.risks.risks.filter((risk) => risk.category === 'plsql').slice(0, 30);

  return `# Contexto Database / PL/SQL

Projeto: ${summary.workspaceName}
Arquivos PL/SQL: ${plsql.files.length}
Packages: ${plsql.counts.package}
Package bodies: ${plsql.counts.package_body}
Procedures: ${plsql.counts.procedure}
Functions: ${plsql.counts.function}
Triggers: ${plsql.counts.trigger}
Tabelas referenciadas: ${plsql.tableReferences.length}

## Packages Detectados

${packages.map((entity) => `- ${entity.name} (${entity.kind}) em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum package detectado.'}

## Procedures e Functions Criticas

${routines.map((entity) => `- ${entity.name} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhuma procedure/function detectada.'}

## Triggers

${triggers.map((entity) => `- ${entity.name}${entity.targetTable ? ` ON ${entity.targetTable}` : ''} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum trigger detectado.'}

## Tabelas Mais Referenciadas

${plsql.tableReferences.slice(0, 20).map((table) => `- ${table.name}: ${table.reads} leitura(s), ${table.writes} escrita(s)`).join('\n') || '- Nenhuma tabela referenciada.'}

## Riscos PL/SQL

${plsqlRisks.map((risk) => `- ${risk.level.toUpperCase()}: ${risk.title} (${risk.file}${risk.line ? `:${risk.line}` : ''})`).join('\n') || '- Nenhum risco PL/SQL detectado.'}

## Aviso para IA

- Regras criticas podem estar escondidas no banco, especialmente em packages, triggers e procedures.
- Nao assuma que a aplicacao e a unica fonte de regra de negocio.
- Nao altere transacoes, COMMIT, ROLLBACK, triggers ou SQL dinamico sem validacao humana.
- Leia primeiro packages, triggers, tabelas mais referenciadas e riscos transacionais.
`;
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}
