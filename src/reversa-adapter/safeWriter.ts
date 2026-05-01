import * as vscode from 'vscode';
import * as path from 'node:path';
import { getTicCoderLiteConfig } from '../utils/config';
import type { CreatedFilesManifest } from './engineTypes';

// Conceptually adapted from Reversa's safe installer writer by Sandeco (MIT License).
// This writer never deletes project files and records only files newly created by TIC Coder Lite.
export type ExistingFileStrategy = 'overwrite' | 'append' | 'ignore';

export interface SafeWriteResult {
  action: 'created' | 'overwritten' | 'appended' | 'ignored';
  uri: vscode.Uri;
}

const CREATED_FILES_PATH = ['.tic-code', 'created-files.json'];

export class SafeWriter {
  constructor(private readonly root: vscode.WorkspaceFolder) {}

  async writeFile(relativePath: string, content: string): Promise<SafeWriteResult> {
    const target = vscode.Uri.joinPath(this.root.uri, ...toPathParts(relativePath));
    const existed = await this.exists(target);

    if (!existed) {
      await this.ensureParentDirectory(target);
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
      await this.registerCreatedFile(relativePath);
      return { action: 'created', uri: target };
    }

    const strategy = await this.resolveExistingFileStrategy(relativePath);
    if (strategy === 'ignore') {
      return { action: 'ignored', uri: target };
    }

    if (strategy === 'overwrite') {
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
      return { action: 'overwritten', uri: target };
    }

    const existing = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
    const next = mergeTicCoderLiteSection(existing, content);
    await vscode.workspace.fs.writeFile(target, Buffer.from(next, 'utf8'));
    return { action: 'appended', uri: target };
  }

  async registerCreatedFile(relativePath: string): Promise<void> {
    const manifestUri = vscode.Uri.joinPath(this.root.uri, ...CREATED_FILES_PATH);
    await this.ensureParentDirectory(manifestUri);

    const manifest = await this.readManifest(manifestUri);
    const normalized = normalizeRelativePath(relativePath);
    if (!manifest.files.includes(normalized)) {
      manifest.files.push(normalized);
      manifest.files.sort();
    }
    manifest.generatedAt = new Date().toISOString();

    await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  }

  private async resolveExistingFileStrategy(relativePath: string): Promise<ExistingFileStrategy> {
    const configured = getTicCoderLiteConfig().exports.safeWriteMode;
    if (configured === 'append' || configured === 'ignore') {
      return configured;
    }

    const overwrite = 'Overwrite';
    const append = 'Append TIC Coder Lite section';
    const ignore = 'Ignore';
    const answer = await vscode.window.showWarningMessage(
      `${relativePath} already exists. How should TIC Coder Lite export this engine context?`,
      { modal: true },
      append,
      ignore,
      overwrite
    );

    if (answer === overwrite) {
      return 'overwrite';
    }

    if (answer === append) {
      return 'append';
    }

    return 'ignore';
  }

  private async ensureParentDirectory(uri: vscode.Uri): Promise<void> {
    const parent = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(parent);
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async readManifest(uri: vscode.Uri): Promise<CreatedFilesManifest> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as CreatedFilesManifest;
      return {
        generatedAt: parsed.generatedAt ?? new Date().toISOString(),
        files: Array.isArray(parsed.files) ? parsed.files : []
      };
    } catch {
      return { generatedAt: new Date().toISOString(), files: [] };
    }
  }
}

const START_MARKER = '<!-- TIC_CODER_LITE_START -->';
const END_MARKER = '<!-- TIC_CODER_LITE_END -->';

function mergeTicCoderLiteSection(existing: string, content: string): string {
  const block = `${START_MARKER}\n${content.trim()}\n${END_MARKER}`;
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);

  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + END_MARKER.length)}`.trimEnd() + '\n';
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

function toPathParts(relativePath: string): string[] {
  return normalizeRelativePath(relativePath).split('/').filter(Boolean);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}
