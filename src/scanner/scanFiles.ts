import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanConfig } from '../utils/config';
import { countLines, isProbablyBinary, matchesAnyPattern, normalizeRelativePath, yieldToEventLoop } from '../utils/fileUtils';
import { isSupportedFile, shouldIgnoreDirectory } from './ignoreRules';

export interface ScannedFile {
  relativePath: string;
  extension: string;
  size: number;
  lines: number;
  mtimeMs?: number;
  cached?: boolean;
}

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
}

export interface ScanProgress {
  filesSeen: number;
  filesScanned: number;
  filesSkipped: number;
  currentPath?: string;
}

export interface ScanLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface ScanFilesOptions {
  config?: ScanConfig;
  token?: CancellationLike;
  previousFiles?: Map<string, ScannedFile>;
  onProgress?: (progress: ScanProgress) => void;
  logger?: ScanLogger;
}

const DEFAULT_CONFIG: ScanConfig = {
  maxFiles: 10000,
  maxFileSizeKb: 512,
  include: ['**/*'],
  exclude: []
};

export async function scanFiles(rootPath: string, options: ScanFilesOptions = {}): Promise<ScannedFile[]> {
  const root = path.resolve(rootPath);
  const files: ScannedFile[] = [];
  const stats = { filesSeen: 0, filesScanned: 0, filesSkipped: 0, fileLimitReported: false };
  const config = options.config ?? DEFAULT_CONFIG;

  await walkDirectory(root, root, files, stats, { ...options, config });
  options.onProgress?.({ filesSeen: stats.filesSeen, filesScanned: stats.filesScanned, filesSkipped: stats.filesSkipped });

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  files: ScannedFile[],
  stats: { filesSeen: number; filesScanned: number; filesSkipped: number; fileLimitReported: boolean },
  options: Required<Pick<ScanFilesOptions, 'config'>> & ScanFilesOptions
): Promise<void> {
  throwIfCancelled(options.token);

  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    options.logger?.warn(`Cannot read directory: ${normalizeRelativePath(path.relative(rootPath, currentPath)) || '.'}`);
    options.logger?.error('Directory read failed.', error);
    return;
  }

  for (const entry of entries) {
    throwIfCancelled(options.token);

    if (entry.isDirectory()) {
      const directoryPath = path.join(currentPath, entry.name);
      const relativeDirectory = normalizeRelativePath(path.relative(rootPath, directoryPath));
      if (shouldIgnoreDirectory(entry.name) || matchesAnyPattern(`${relativeDirectory}/`, options.config.exclude)) {
        continue;
      }

      await walkDirectory(rootPath, directoryPath, files, stats, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootPath, absolutePath));
    if (!isSupportedFile(absolutePath) || !matchesAnyPattern(relativePath, options.config.include) || matchesAnyPattern(relativePath, options.config.exclude)) {
      continue;
    }

    stats.filesSeen += 1;
    if (files.length >= options.config.maxFiles) {
      stats.filesSkipped += 1;
      if (!stats.fileLimitReported) {
        stats.fileLimitReported = true;
        options.logger?.warn(`Scan file limit reached at ${options.config.maxFiles} files. Remaining files will be skipped.`);
      }
      continue;
    }

    const scanned = await scanFile(absolutePath, relativePath, options, stats);
    if (scanned) {
      files.push(scanned);
      stats.filesScanned += 1;
    }

    if ((stats.filesSeen + stats.filesSkipped) % 50 === 0) {
      options.onProgress?.({ ...stats, currentPath: relativePath });
      await yieldToEventLoop();
    }
  }
}

async function scanFile(
  absolutePath: string,
  relativePath: string,
  options: Required<Pick<ScanFilesOptions, 'config'>> & ScanFilesOptions,
  scanStats: { filesSkipped: number }
): Promise<ScannedFile | undefined> {
  let stats: import('node:fs').Stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    scanStats.filesSkipped += 1;
    options.logger?.error(`Cannot stat file: ${relativePath}`, error);
    return undefined;
  }

  const maxBytes = options.config.maxFileSizeKb * 1024;
  if (stats.size > maxBytes) {
    scanStats.filesSkipped += 1;
    options.logger?.warn(`Skipped large file (${Math.ceil(stats.size / 1024)} KB): ${relativePath}`);
    return undefined;
  }

  const cached = options.previousFiles?.get(relativePath);
  if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return { ...cached, cached: true };
  }

  const sample = await readSample(absolutePath);
  if (sample && isProbablyBinary(sample)) {
    scanStats.filesSkipped += 1;
    options.logger?.warn(`Skipped binary-like file: ${relativePath}`);
    return undefined;
  }

  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    scanStats.filesSkipped += 1;
    options.logger?.error(`Cannot read file: ${relativePath}`, error);
    return undefined;
  }

  return {
    relativePath,
    extension: path.extname(absolutePath).toLowerCase(),
    size: stats.size,
    lines: countLines(content),
    mtimeMs: stats.mtimeMs
  };
}

async function readSample(absolutePath: string): Promise<Buffer | undefined> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(absolutePath, 'r');
    const buffer = Buffer.alloc(4096);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

function throwIfCancelled(token?: CancellationLike): void {
  if (token?.isCancellationRequested) {
    throw new Error('TIC_CODER_LITE_CANCELLED');
  }
}
