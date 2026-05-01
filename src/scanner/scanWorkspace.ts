import * as path from 'node:path';
import * as vscode from 'vscode';
import { getTicCoderLiteConfig, ScanConfig } from '../utils/config';
import { readJsonIfExists } from '../utils/workspace';
import type { RiskSummary } from './detectRisks';
import { scanFiles, ScannedFile, ScanLogger } from './scanFiles';

export interface ScanTotals {
  files: number;
  lines: number;
  size: number;
}

export interface ScanResult {
  projectName: string;
  rootPath: string;
  scannedAt: string;
  files: ScannedFile[];
  totals: ScanTotals;
  riskSummary?: RiskSummary;
  limits?: {
    maxFiles: number;
    maxFileSizeKb: number;
  };
  incremental?: {
    reusedFiles: number;
  };
}

export interface ScanWorkspaceOptions {
  config?: ScanConfig;
  token?: vscode.CancellationToken;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  logger?: ScanLogger;
}

export async function scanWorkspace(workspaceFolder?: vscode.WorkspaceFolder, options: ScanWorkspaceOptions = {}): Promise<ScanResult | undefined> {
  const root = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    return undefined;
  }

  const rootPath = path.resolve(root.uri.fsPath);
  const config = options.config ?? getTicCoderLiteConfig().scan;
  const previousScan = await readJsonIfExists<ScanResult>(vscode.Uri.joinPath(root.uri, '.tic-code', 'scan.json'));
  const previousFiles = new Map((previousScan?.files ?? []).map((file) => [file.relativePath, file]));
  const files = await scanFiles(rootPath, {
    config,
    token: options.token,
    previousFiles,
    logger: options.logger,
    onProgress: (scanProgress) => {
      options.progress?.report({
        message: `Scanning ${scanProgress.filesScanned}/${config.maxFiles} files`,
        increment: 0
      });
      options.logger?.info(`Scan progress: ${scanProgress.filesScanned} scanned, ${scanProgress.filesSkipped} skipped, current=${scanProgress.currentPath ?? 'n/a'}`);
    }
  });
  const reusedFiles = files.filter((file) => file.cached).length;

  return {
    projectName: root.name,
    rootPath,
    scannedAt: new Date().toISOString(),
    files,
    totals: {
      files: files.length,
      lines: files.reduce((total, file) => total + file.lines, 0),
      size: files.reduce((total, file) => total + file.size, 0)
    },
    limits: {
      maxFiles: config.maxFiles,
      maxFileSizeKb: config.maxFileSizeKb
    },
    incremental: {
      reusedFiles
    }
  };
}
