import * as vscode from 'vscode';
import { getTicCodeUri, readJsonIfExists, readTextIfExists } from '../utils/workspace';
import type { EvidenceConfidence, EvidenceRef, EvidenceSource, ChangeFirewallSession } from './changeFirewallTypes';

export function createSession(root: vscode.WorkspaceFolder): ChangeFirewallSession {
  void root;
  const id = `cf-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
  const baseDir = '.tic-code/change-firewall';
  return {
    id,
    createdAt: new Date().toISOString(),
    baseDir,
    sessionDir: `${baseDir}/sessions/${id}`
  };
}

export function changeFirewallUri(root: vscode.WorkspaceFolder, ...parts: string[]): vscode.Uri {
  return getTicCodeUri(root, 'change-firewall', ...parts);
}

export function sessionUri(root: vscode.WorkspaceFolder, session: ChangeFirewallSession, ...parts: string[]): vscode.Uri {
  return getTicCodeUri(root, 'change-firewall', 'sessions', session.id, ...parts);
}

export async function ensureChangeFirewallFolders(root: vscode.WorkspaceFolder, session?: ChangeFirewallSession): Promise<void> {
  await vscode.workspace.fs.createDirectory(changeFirewallUri(root));
  await vscode.workspace.fs.createDirectory(changeFirewallUri(root, 'antibodies'));
  await vscode.workspace.fs.createDirectory(changeFirewallUri(root, 'sessions'));
  if (session) {
    await vscode.workspace.fs.createDirectory(sessionUri(root, session));
  }
}

export async function writeTextFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content.endsWith('\n') ? content : `${content}\n`, 'utf8'));
}

export async function writeJsonFile(uri: vscode.Uri, value: unknown): Promise<void> {
  await writeTextFile(uri, JSON.stringify(value, null, 2));
}

export async function readText(root: vscode.WorkspaceFolder, relativePath: string): Promise<string> {
  const uri = vscode.Uri.joinPath(root.uri, ...relativePath.split('/').filter(Boolean));
  return (await readTextIfExists(uri)) ?? '';
}

export async function readJson<T>(root: vscode.WorkspaceFolder, relativePath: string): Promise<T | undefined> {
  const uri = vscode.Uri.joinPath(root.uri, ...relativePath.split('/').filter(Boolean));
  return readJsonIfExists<T>(uri);
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export function relativeArtifact(root: vscode.WorkspaceFolder, uri: vscode.Uri): string {
  const rootPath = root.uri.fsPath.replace(/\\/g, '/');
  const filePath = uri.fsPath.replace(/\\/g, '/');
  return filePath.startsWith(rootPath) ? filePath.slice(rootPath.length + 1) : filePath;
}

export async function openGeneratedFile(root: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
  const uri = vscode.Uri.joinPath(root.uri, ...relativePath.split('/').filter(Boolean));
  try {
    await vscode.workspace.fs.stat(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(`Arquivo ainda nao gerado: ${relativePath}`);
  }
}

export async function appendChroniclerEvent(root: vscode.WorkspaceFolder, event: string, files: string[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const historyUri = getTicCodeUri(root, 'reversa', 'chronicler', 'history.json');
  const sessionUriPath = getTicCodeUri(root, 'reversa', 'chronicler', 'session.md');
  const changelogUri = getTicCodeUri(root, 'reverse-engineering', 'changelog.md');
  await vscode.workspace.fs.createDirectory(getTicCodeUri(root, 'reversa', 'chronicler'));
  await vscode.workspace.fs.createDirectory(getTicCodeUri(root, 'reverse-engineering'));

  const raw = await readJsonIfExists<unknown>(historyUri);
  const history: Array<Record<string, unknown>> = Array.isArray(raw) ? raw : [];
  history.push({ timestamp, source: 'ai-change-firewall', event, files });
  await writeJsonFile(historyUri, history);

  const sessionText = (await readTextIfExists(sessionUriPath)) ?? '# Chronicler Session\n';
  await writeTextFile(sessionUriPath, `${sessionText.trimEnd()}\n\n- ${timestamp} - ${event}\n`);

  const changelog = (await readTextIfExists(changelogUri)) ?? '# Changelog de Engenharia Reversa\n';
  await writeTextFile(changelogUri, `${changelog.trimEnd()}\n\n## ${timestamp} - AI Change Firewall\n\n- ${event}\n- Arquivos: ${files.join(', ') || 'N/A'}\n`);
}

export async function updateChangeFirewallTraceability(root: vscode.WorkspaceFolder, lines: string[]): Promise<void> {
  const traceDir = getTicCodeUri(root, 'reverse-engineering', 'traceability');
  await vscode.workspace.fs.createDirectory(traceDir);
  const uri = vscode.Uri.joinPath(traceDir, 'change-firewall.md');
  const content = `# Traceability - AI Change Firewall

Gerado em: ${new Date().toISOString()}

${lines.map((line) => `- ${line}`).join('\n') || '- Nenhuma execucao registrada.'}
`;
  await writeTextFile(uri, content);
}

export function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

export function evidenceRef(input: {
  source: EvidenceSource;
  filePath?: string;
  line?: number;
  symbol?: string;
  matchedText?: string;
  confidence: EvidenceConfidence;
  reason: string;
}): EvidenceRef {
  return input;
}

export function confidenceIcon(confidence: EvidenceConfidence): string {
  if (confidence === 'CONFIRMED') return '🟢 CONFIRMADO';
  if (confidence === 'INFERRED') return '🟡 INFERIDO';
  return '🔴 LACUNA';
}

export async function fileExists(root: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> {
  const uri = vscode.Uri.joinPath(root.uri, ...relativePath.split('/').filter(Boolean));
  return exists(uri);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
