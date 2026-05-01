import * as vscode from 'vscode';
import { renderArchitectureMarkdown } from '../scanner/buildGraph';
import { renderInventoryMarkdown } from '../scanner/detectStack';
import { renderRisksMarkdown } from '../scanner/detectRisks';
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

  return artifacts;
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}
