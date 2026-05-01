import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';

export interface TypeScriptProjectDetection {
  detected: boolean;
  packageManager: string | undefined;
  frameworks: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  sourceFiles: {
    total: number;
    components: string[];
    pages: string[];
    services: string[];
    configs: string[];
  };
}

export async function detectTypeScriptProject(scan: ScanResult): Promise<TypeScriptProjectDetection> {
  const packageJson = await readPackageJson(path.join(scan.rootPath, 'package.json'));
  const dependencies = packageJson ? readDependencyBlock(packageJson.dependencies) : {};
  const devDependencies = packageJson ? readDependencyBlock(packageJson.devDependencies) : {};
  const allDependencies = { ...dependencies, ...devDependencies };
  const sourceFiles = scan.files.filter((file) => ['.ts', '.tsx', '.js', '.jsx'].includes(file.extension));

  return {
    detected: Boolean(packageJson) || sourceFiles.length > 0,
    packageManager: detectPackageManager(scan),
    frameworks: detectFrameworks(scan, allDependencies),
    dependencies,
    devDependencies,
    sourceFiles: {
      total: sourceFiles.length,
      components: findByConvention(sourceFiles, (file) => /(^|\/)[A-Z][^/]*\.(tsx|jsx)$/.test(file.relativePath) || /\.component\.ts$/.test(file.relativePath)),
      pages: findByConvention(sourceFiles, (file) => file.relativePath.includes('/pages/') || file.relativePath.includes('/app/') || /(^|\/)page\.(tsx|jsx|ts|js)$/.test(file.relativePath)),
      services: findByConvention(sourceFiles, (file) => /\.service\.(ts|js)$/.test(file.relativePath) || file.relativePath.includes('/services/')),
      configs: findByConvention(sourceFiles, (file) => file.relativePath.includes('config') || /^vite\.config\.(ts|js)$/.test(file.relativePath) || /^next\.config\.(ts|js)$/.test(file.relativePath))
    }
  };
}

function detectFrameworks(scan: ScanResult, dependencies: Record<string, string>): string[] {
  const frameworks = new Set<string>();
  const paths = new Set(scan.files.map((file) => file.relativePath));

  if (dependencies.react || dependencies['react-dom']) {
    frameworks.add('React');
  }

  if (dependencies['@angular/core'] || hasBasename(paths, ['angular.json'])) {
    frameworks.add('Angular');
  }

  if (dependencies.next || hasBasename(paths, ['next.config.js', 'next.config.ts'])) {
    frameworks.add('Next.js');
  }

  if (dependencies.vite || hasBasename(paths, ['vite.config.ts', 'vite.config.js'])) {
    frameworks.add('Vite');
  }

  if (paths.has('package.json')) {
    frameworks.add('Node.js');
  }

  return [...frameworks].sort();
}

function detectPackageManager(scan: ScanResult): string | undefined {
  const paths = new Set(scan.files.map((file) => file.relativePath));

  if (hasBasename(paths, ['pnpm-lock.yaml'])) {
    return 'pnpm';
  }

  if (hasBasename(paths, ['yarn.lock'])) {
    return 'Yarn';
  }

  if (hasBasename(paths, ['bun.lockb'])) {
    return 'Bun';
  }

  if (hasBasename(paths, ['package-lock.json'])) {
    return 'npm';
  }

  return paths.has('package.json') ? 'npm or compatible' : undefined;
}

function hasBasename(paths: Set<string>, basenames: string[]): boolean {
  const expected = new Set(basenames.map((name) => name.toLowerCase()));
  return [...paths].some((file) => expected.has(path.basename(file).toLowerCase()));
}

function findByConvention(files: Array<{ relativePath: string }>, predicate: (file: { relativePath: string }) => boolean): string[] {
  return files
    .filter(predicate)
    .map((file) => file.relativePath)
    .sort()
    .slice(0, 40);
}

async function readPackageJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readDependencyBlock(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort((a, b) => a[0].localeCompare(b[0]));

  return Object.fromEntries(entries);
}
