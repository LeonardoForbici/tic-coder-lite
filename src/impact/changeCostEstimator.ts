import * as vscode from 'vscode';
import { checkOllamaStatus, getLocalAiSettings } from '../local-ai/checkOllamaStatus';
import { OllamaClient } from '../local-ai/ollamaClient';

export async function estimateChangeCostWithLocalAiCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]; if (!root) return;
  const pkgUri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'latest-ai-change-package.md');
  let pkg = '';
  try { pkg = Buffer.from(await vscode.workspace.fs.readFile(pkgUri)).toString('utf8'); }
  catch { vscode.window.showWarningMessage('Pacote de mudança não encontrado. Rode Analisar Impacto primeiro.'); return; }

  const settings = getLocalAiSettings();
  const status = await checkOllamaStatus(settings);
  if (!status.ok) {
    vscode.window.showWarningMessage(`${status.message} Abrindo pacote para IA paga.`);
    const doc = await vscode.workspace.openTextDocument(pkgUri); await vscode.window.showTextDocument(doc);
    return;
  }

  const model = status.fastModelAvailable ? settings.fastModel : settings.qualityModel;
  const client = new OllamaClient({ baseUrl: settings.ollamaUrl, model });
  const prompt = `Faça estimativa de mudança com JSON e markdown. Campos: horas, complexidade, riscos, plano, perguntas.\n\n${pkg}`;
  const response = await client.generate(prompt, { temperature: 0.1, numPredict: 1000 });
  const outMd = `# Estimativa de Custo\n\nModelo: ${model}\n\n${response}\n`;
  const impactDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact');
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(impactDir, 'latest-cost-estimate.md'), Buffer.from(outMd, 'utf8'));
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(impactDir, 'latest-cost-estimate.json'), Buffer.from(JSON.stringify({ model, response, createdAt: new Date().toISOString() }, null, 2), 'utf8'));
}
