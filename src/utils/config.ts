import * as vscode from 'vscode';

export type SafeWriteMode = 'ask' | 'append' | 'ignore';

export interface ScanConfig {
  maxFiles: number;
  maxFileSizeKb: number;
  include: string[];
  exclude: string[];
}

export interface TicCoderLiteConfig {
  scan: ScanConfig;
  output: {
    openAfterScan: boolean;
  };
  exports: {
    safeWriteMode: SafeWriteMode;
  };
  localAi: {
    enabled: boolean;
    ollamaUrl: string;
    model: string;
  };
}

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/.tic-code/**'
];

export function getTicCoderLiteConfig(): TicCoderLiteConfig {
  const config = vscode.workspace.getConfiguration('ticCoderLite');

  return {
    scan: {
      maxFiles: readPositiveNumber(config, 'scan.maxFiles', 10000),
      maxFileSizeKb: readPositiveNumber(config, 'scan.maxFileSizeKb', 512),
      include: readStringArray(config, 'scan.include', ['**/*']),
      exclude: readStringArray(config, 'scan.exclude', DEFAULT_EXCLUDE)
    },
    output: {
      openAfterScan: config.get<boolean>('output.openAfterScan', false)
    },
    exports: {
      safeWriteMode: readSafeWriteMode(config.get<string>('exports.safeWriteMode', 'ask'))
    },
    localAi: {
      enabled: config.get<boolean>('localAi.enabled', false),
      ollamaUrl: config.get<string>('localAi.ollamaUrl', 'http://localhost:11434'),
      model: config.get<string>('localAi.model', 'qwen2.5-coder:1.5b')
    }
  };
}

function readPositiveNumber(config: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = config.get<number>(key, fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readStringArray(config: vscode.WorkspaceConfiguration, key: string, fallback: string[]): string[] {
  const value = config.get<unknown>(key, fallback);
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

function readSafeWriteMode(value: string): SafeWriteMode {
  return value === 'append' || value === 'ignore' ? value : 'ask';
}
