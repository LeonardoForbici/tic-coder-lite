import * as vscode from 'vscode';

export function getWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getTicCodeUri(root: vscode.WorkspaceFolder, ...parts: string[]): vscode.Uri {
  return vscode.Uri.joinPath(root.uri, '.tic-code', ...parts);
}

export async function readJsonIfExists<T>(uri: vscode.Uri): Promise<T | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

export async function readTextIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch {
    return undefined;
  }
}
