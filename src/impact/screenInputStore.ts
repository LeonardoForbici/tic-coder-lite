import * as vscode from 'vscode';
import { ScreenImpactInput } from './impactTypes';

export function getScreenDir(root: vscode.WorkspaceFolder, screenId: string): vscode.Uri {
  return vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'screens', screenId);
}

export async function writeScreenInput(root: vscode.WorkspaceFolder, input: ScreenImpactInput): Promise<vscode.Uri> {
  const dir = getScreenDir(root, input.id);
  await vscode.workspace.fs.createDirectory(dir);
  const uri = vscode.Uri.joinPath(dir, 'screen-input.json');
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(input, null, 2), 'utf8'));
  return uri;
}

export async function writeLatestScreenInput(root: vscode.WorkspaceFolder, input: ScreenImpactInput): Promise<void> {
  const latest = {
    screenId: input.id,
    screenshotPath: input.screenshotPath,
    screenshotFileName: input.screenshotFileName,
    createdAt: input.createdAt
  };
  const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'latest-screen-input.json');
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root.uri, '.tic-code', 'impact'));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(latest, null, 2), 'utf8'));
}
