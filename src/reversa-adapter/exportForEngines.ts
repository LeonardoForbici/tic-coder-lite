import * as vscode from 'vscode';
import { analyzeWorkspace, getLastAnalysis, getWorkspaceRoot } from '../commands/analyzeProject';
import { writeTicCodeFolder } from '../exporters/writeTicCodeFolder';
import type { ProjectSummary } from '../types';
import { detectEngineById, detectEngines } from './detectEngines';
import type { AiEngine, EngineExportResult, EngineId } from './engineTypes';
import { generateAgentsMd } from './generateAgentsMd';
import { generateClaudeMd } from './generateClaudeMd';
import { generateCopilotInstructions } from './generateCopilotInstructions';
import { generateCursorRules } from './generateCursorRules';
import { generateGeminiMd } from './generateGeminiMd';
import { SafeWriter } from './safeWriter';

export async function detectAiEnginesCommand(): Promise<AiEngine[] | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de detectar engines de IA.');
    return undefined;
  }

  const engines = await detectEngines(root.uri.fsPath);
  const detected = engines.filter((engine) => engine.detected);
  const message = detected.length
    ? `IA Padrão detectou engines: ${detected.map((engine) => engine.name).join(', ')}.`
    : 'IA Padrão não encontrou engines suportadas por comando, pasta ou arquivo de entrada.';
  vscode.window.showInformationMessage(message);
  return engines;
}

export async function exportForEngineCommand(context: vscode.ExtensionContext, engineId: EngineId): Promise<EngineExportResult | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de exportar contexto para IA.');
    return undefined;
  }

  const summary = getLastAnalysis(context) ?? await analyzeWorkspace(root);
  await writeTicCodeFolder(root, summary);

  const engine = await detectEngineById(root.uri.fsPath, engineId);
  if (!engine) {
    vscode.window.showErrorMessage(`Exportação de engine não suportada pelo TIC Coder Lite: ${engineId}`);
    return undefined;
  }

  const result = await exportForEngine(root, summary, engine);
  await context.globalState.update('ticCoderLite.lastAnalysis', summary);
  vscode.commands.executeCommand('ticCoderLite.refreshSidebar');
  vscode.window.showInformationMessage(`IA Padrão: ${engine.name} ${translateAction(result.action)} ${result.targetFile}.`);
  return result;
}

function translateAction(action: string): string {
  return {
    created: 'criou',
    updated: 'atualizou',
    skipped: 'ignorou',
    appended: 'acrescentou em',
    overwritten: 'sobrescreveu'
  }[action] ?? action;
}

export async function exportForEngine(root: vscode.WorkspaceFolder, summary: ProjectSummary, engine: AiEngine): Promise<EngineExportResult> {
  const writer = new SafeWriter(root);
  const content = generateEngineContent(engine.id, summary);
  const result = await writer.writeFile(engine.entryFile, content);

  return {
    engine,
    targetFile: engine.entryFile,
    action: result.action
  };
}

function generateEngineContent(engineId: EngineId, summary: ProjectSummary): string {
  switch (engineId) {
    case 'claude-code':
      return generateClaudeMd(summary);
    case 'codex':
      return generateAgentsMd(summary);
    case 'cursor':
      return generateCursorRules(summary);
    case 'github-copilot':
      return generateCopilotInstructions(summary);
    case 'gemini-cli':
      return generateGeminiMd(summary);
    case 'aider':
      return generateAgentsMd(summary).replace('Context For Codex', 'Context For Aider').replace('AGENTS.md', 'CONVENTIONS.md');
  }
}
