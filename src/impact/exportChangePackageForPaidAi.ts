import * as path from 'path';
import * as vscode from 'vscode';
import { readLatestImageIndexEntry } from './visualIndexBuilder';

export async function exportChangePackageForPaidAiCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;

  const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'latest-ai-change-package.md');
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch {
    vscode.window.showWarningMessage('Pacote ainda não gerado. Rode Analisar Impacto por Imagem/Tela.');
    return;
  }

  const entry = await readLatestImageIndexEntry(root);
  if (entry?.screenshotPath) {
    const relativePath = path.relative(root.uri.fsPath, entry.screenshotPath).replace(/\\/g, '/');
    const action = await vscode.window.showInformationMessage(
      `Pacote exportado. Para IA paga com visão, anexe também a imagem: ${relativePath}`,
      'Abrir pasta da imagem',
      'Abrir imagem',
      'Abrir pacote IA'
    );
    if (action === 'Abrir pasta da imagem') {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(entry.screenshotPath));
    } else if (action === 'Abrir imagem') {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(entry.screenshotPath));
    } else if (action === 'Abrir pacote IA') {
      await vscode.commands.executeCommand('ticCoderLite.openAiChangePackage');
    }
  }
}

export async function openLatestImpactScreenshotCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;

  const entry = await readLatestImageIndexEntry(root);
  if (!entry?.screenshotPath) {
    vscode.window.showWarningMessage('Nenhuma screenshot de impacto importada ainda.');
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(entry.screenshotPath));
}
