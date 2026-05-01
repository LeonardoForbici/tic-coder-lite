import * as vscode from 'vscode';
import { checkOllamaStatus, getLocalAiSettings } from '../local-ai/checkOllamaStatus';
import { enhanceAgentContext, enhanceQuestions } from '../local-ai/enhanceAgentContext';
import { enhanceModuleSummary } from '../local-ai/enhanceModuleSummary';
import { OllamaClient } from '../local-ai/ollamaClient';
import { getWorkspaceRoot } from './analyzeProject';

export async function enhanceWithLocalAi(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de usar o Modo IA Local.');
    return;
  }

  const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
  const scanUri = vscode.Uri.joinPath(ticCodeDir, 'scan.json');
  if (!await exists(scanUri)) {
    vscode.window.showInformationMessage('Execute a análise do Modo Lite antes de usar o Modo IA Local.');
    return;
  }

  const settings = getLocalAiSettings();
  const status = await checkOllamaStatus(settings);
  if (!status.ok) {
    vscode.window.showInformationMessage(status.message);
    return;
  }

  const client = new OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.model });

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `TIC Coder Lite: melhorando com ${settings.model}`,
      cancellable: false
    },
    async (progress) => {
      const projectName = root.name;
      progress.report({ message: 'Lendo arquivos de contexto .tic-code' });

      const agentContext = await readText(vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'));
      const risksMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.md'));
      const architectureMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'architecture.md'));
      const confidenceReport = await readText(vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'));
      const modulesJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'modules.json'));
      const graphJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'graph.json'));
      const risksJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.json'));

      progress.report({ message: 'Melhorando contexto para IA' });
      const agentContextAi = await enhanceAgentContext(client, {
        projectName,
        agentContext,
        risksMarkdown,
        architectureMarkdown,
        confidenceReport
      });

      progress.report({ message: 'Gerando perguntas de validação humana' });
      const questionsAi = await enhanceQuestions(client, {
        projectName,
        agentContext,
        risksMarkdown,
        architectureMarkdown,
        confidenceReport
      });

      progress.report({ message: 'Resumindo módulos' });
      const moduleSummariesAi = await enhanceModuleSummary(client, {
        projectName,
        modulesJson,
        graphJson,
        risksJson
      });

      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'agent-context.ai.md'), Buffer.from(agentContextAi, 'utf8'));
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'questions.ai.md'), Buffer.from(questionsAi, 'utf8'));
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'module-summaries.ai.md'), Buffer.from(moduleSummariesAi, 'utf8'));
    }
  );

  vscode.window.showInformationMessage('Modo IA Local gerou melhorias opcionais com Ollama em .tic-code.');
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}
