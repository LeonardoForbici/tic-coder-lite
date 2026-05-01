import * as path from 'node:path';

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'coverage',
  '.next',
  '.idea',
  '.vscode',
  '.tic-code'
]);

export const SUPPORTED_EXTENSIONS = new Set([
  '.java',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.xml',
  '.yml',
  '.yaml',
  '.sql',
  '.md'
]);

export function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
