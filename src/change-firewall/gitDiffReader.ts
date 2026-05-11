import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { ChangeFirewallSession, GitDiffHunk, GitDiffSummary } from './changeFirewallTypes';
import { ensureChangeFirewallFolders, relativeArtifact, sessionUri, uniq, writeTextFile } from './changeFirewallStore';

const execFile = promisify(cp.execFile);

export async function readCurrentGitDiff(root: vscode.WorkspaceFolder, session: ChangeFirewallSession): Promise<GitDiffSummary> {
  await ensureChangeFirewallFolders(root, session);
  const rawPatchUri = sessionUri(root, session, 'git-diff.patch');

  const repoCheck = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repoCheck.ok || !repoCheck.stdout.trim().includes('true')) {
    await writeTextFile(rawPatchUri, '');
    return {
      changedFiles: [],
      addedFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      hunks: [],
      symbolsTouched: [],
      possibleBehaviorChanges: ['Workspace nao parece ser um repositorio Git. Cole um patch manual em uma versao futura.'],
      rawPatchPath: relativeArtifact(root, rawPatchUri),
      status: [],
      isGitRepository: false,
      empty: true
    };
  }

  const [unstaged, staged, status] = await Promise.all([
    runGit(root, ['diff', '--no-ext-diff', '--unified=3']),
    runGit(root, ['diff', '--cached', '--no-ext-diff', '--unified=3']),
    runGit(root, ['status', '--short'])
  ]);

  const patch = [unstaged.stdout, staged.stdout].filter((part) => part.trim()).join('\n');
  await writeTextFile(rawPatchUri, patch);
  const statusLines = status.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const summary = parsePatch(patch, statusLines, relativeArtifact(root, rawPatchUri));
  return { ...summary, isGitRepository: true, empty: !patch.trim() && statusLines.length === 0 };
}

function parsePatch(patch: string, status: string[], rawPatchPath: string): Omit<GitDiffSummary, 'isGitRepository' | 'empty'> {
  const changedFiles: string[] = [];
  const addedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const hunks: GitDiffHunk[] = [];
  const symbolsTouched: string[] = [];
  const behaviorSignals: string[] = [];
  let currentFile = '';

  for (const line of patch.split(/\r?\n/)) {
    const diffMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (diffMatch) {
      currentFile = diffMatch[2];
      changedFiles.push(currentFile);
      continue;
    }
    if (line.startsWith('new file mode') && currentFile) addedFiles.push(currentFile);
    if (line.startsWith('deleted file mode') && currentFile) deletedFiles.push(currentFile);

    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (hunk && currentFile) {
      hunks.push({
        file: currentFile,
        oldStart: Number(hunk[1]),
        oldLines: hunk[2] ? Number(hunk[2]) : 1,
        newStart: Number(hunk[3]),
        newLines: hunk[4] ? Number(hunk[4]) : 1,
        header: hunk[5].trim()
      });
      if (hunk[5].trim()) symbolsTouched.push(`${currentFile}: ${hunk[5].trim()}`);
      continue;
    }

    if (/^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)) {
      const symbol = extractSymbol(line.slice(1));
      if (symbol && currentFile) symbolsTouched.push(`${currentFile}: ${symbol}`);
      const signal = detectBehaviorSignal(line.slice(1));
      if (signal) behaviorSignals.push(`${currentFile}: ${signal}`);
    }
  }

  const statusAdded = status.filter((line) => /^A|^\?\?/.test(line)).map(statusPath);
  const statusDeleted = status.filter((line) => /^D|^ D/.test(line)).map(statusPath);
  const statusChanged = status.map(statusPath);

  return {
    changedFiles: uniq([...changedFiles, ...statusChanged]),
    addedFiles: uniq([...addedFiles, ...statusAdded]),
    modifiedFiles: uniq([...changedFiles.filter((file) => !addedFiles.includes(file) && !deletedFiles.includes(file)), ...statusChanged]),
    deletedFiles: uniq([...deletedFiles, ...statusDeleted]),
    hunks,
    symbolsTouched: uniq(symbolsTouched).slice(0, 80),
    possibleBehaviorChanges: uniq(behaviorSignals).slice(0, 80),
    rawPatchPath,
    status
  };
}

function statusPath(line: string): string {
  const value = line.slice(3).trim();
  const rename = value.split(' -> ');
  return rename[rename.length - 1] ?? value;
}

function extractSymbol(line: string): string | undefined {
  const patterns = [
    /\b(?:function|class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/,
    /\b(?:public|private|protected)?\s*(?:static\s+)?[A-Za-z0-9_<>, ?[\]]+\s+([A-Za-z_$][\w$]*)\s*\(/,
    /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\(/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function detectBehaviorSignal(line: string): string | undefined {
  if (/\b(select|insert|update|delete|merge)\b/i.test(line)) return 'SQL alterado';
  if (/\b(commit|rollback|trigger|procedure|package)\b/i.test(line)) return 'PLSQL/transacao alterada';
  if (/\b(auth|permission|role|jwt|token|security|hasRole|PreAuthorize)\b/i.test(line)) return 'permissao/seguranca alterada';
  if (/\b(status|state|enum|workflow)\b/i.test(line)) return 'estado/status alterado';
  if (/\bcalculate|calculo|total|price|amount|saldo|estoque|pedido|fiscal|financeiro\b/i.test(line)) return 'calculo ou dominio critico alterado';
  if (/\bprocess\.env|secret|config|production\b/i.test(line)) return 'configuracao/env alterada';
  if (/\btest\.skip|describe\.skip|it\.skip|\.only\b/i.test(line)) return 'teste desabilitado';
  return undefined;
}

async function runGit(root: vscode.WorkspaceFolder, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFile('git', args, { cwd: root.uri.fsPath, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}
