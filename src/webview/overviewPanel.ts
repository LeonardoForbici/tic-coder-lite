import * as vscode from 'vscode';
import { analyzeWorkspace, getLastAnalysis, getWorkspaceRoot } from '../commands/analyzeProject';
import { writeTicCodeFolder } from '../exporters/writeTicCodeFolder';
import { detectEngines } from '../reversa-adapter/detectEngines';
import type { ProjectSummary } from '../types';
import { renderOverviewHtml } from './overviewHtml';

export async function openOverviewPanel(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de abrir o TIC Coder Lite.');
    return;
  }

  let summary = getLastAnalysis(context);
  if (!summary) {
    const analyzeLabel = 'Analisar Projeto';
    const action = await vscode.window.showInformationMessage('Ainda não há análise do Modo Lite. O Modo Lite funciona sem IA, banco, Docker ou servidor.', analyzeLabel);
    if (action !== analyzeLabel) {
      return;
    }
    summary = await analyzeWorkspace(root);
    await writeTicCodeFolder(root, summary);
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
  }

  const panel = vscode.window.createWebviewPanel(
    'ticCoderLiteOverview',
    'TIC Coder Lite',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  await render(panel, context, root, summary);

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'analyzeProject':
        await vscode.commands.executeCommand('ticCoderLite.analyzeProject');
        summary = getLastAnalysis(context) ?? await analyzeWorkspace(root);
        await render(panel, context, root, summary);
        break;
      case 'exportForCodex':
        await vscode.commands.executeCommand('ticCoderLite.exportForCodex');
        break;
      case 'exportForClaude':
        await vscode.commands.executeCommand('ticCoderLite.exportForClaude');
        break;
      case 'exportForCopilot':
        await vscode.commands.executeCommand('ticCoderLite.exportForCopilot');
        break;
      case 'exportForCursor':
        await vscode.commands.executeCommand('ticCoderLite.exportForCursor');
        break;
      case 'exportForGemini':
        await vscode.commands.executeCommand('ticCoderLite.exportForGemini');
        break;
      case 'enhanceLocalAi':
        await vscode.commands.executeCommand('ticCoderLite.enhanceWithLocalAi');
        break;
      case 'setupBeginner':
        await applyBeginnerSetup();
        vscode.window.showInformationMessage('TIC Coder Lite: padrão recomendado aplicado. Você já pode usar Analisar Projeto.');
        break;
      case 'detectEngines':
        await vscode.commands.executeCommand('ticCoderLite.detectAiEngines');
        break;
      case 'enableLocalAi':
        await setLocalAiEnabled(true);
        vscode.window.showInformationMessage('TIC Coder Lite: IA Local ligada. Use Ollama com um modelo pequeno, como qwen2.5-coder:1.5b.');
        break;
      case 'disableLocalAi':
        await setLocalAiEnabled(false);
        vscode.window.showInformationMessage('TIC Coder Lite: IA Local desligada. O Modo Lite continua funcionando normalmente.');
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tic.tic-coder-lite');
        break;
    }
  });
}

async function applyBeginnerSetup(): Promise<void> {
  const config = vscode.workspace.getConfiguration('ticCoderLite');
  const target = vscode.ConfigurationTarget.Workspace;
  await config.update('localAi.enabled', false, target);
  await config.update('scan.maxFiles', 10000, target);
  await config.update('scan.maxFileSizeKb', 512, target);
  await config.update('output.openAfterScan', false, target);
  await config.update('exports.safeWriteMode', 'ask', target);
}

async function setLocalAiEnabled(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('ticCoderLite');
  await config.update('localAi.enabled', enabled, vscode.ConfigurationTarget.Workspace);
  if (enabled) {
    await config.update('localAi.model', 'qwen2.5-coder:1.5b', vscode.ConfigurationTarget.Workspace);
    await config.update('localAi.ollamaUrl', 'http://localhost:11434', vscode.ConfigurationTarget.Workspace);
  }
}

async function render(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, root: vscode.WorkspaceFolder, summary: ProjectSummary): Promise<void> {
  const engines = await detectEngines(root.uri.fsPath);
  const agentContextPreview = await readTextIfExists(vscode.Uri.joinPath(root.uri, '.tic-code', 'agent-context.md'));
  panel.webview.html = renderOverviewHtml({
    summary,
    engines,
    agentContextPreview: agentContextPreview.slice(0, 2600),
    nonce: getNonce()
  });
  await context.globalState.update('ticCoderLite.lastAnalysis', summary);
}

async function readTextIfExists(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
