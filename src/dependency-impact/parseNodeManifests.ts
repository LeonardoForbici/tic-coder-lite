/**
 * Parsers para manifests Node.js: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml.
 * Usa somente leitura de arquivo — nunca executa npm/yarn/pnpm.
 */

import type { DepEvidenceRef, DependencyEntry } from './dependencyImpactTypes';

export interface NodeManifestInfo {
  nodeVersion?: string;
  npmVersion?: string;
  yarnVersion?: string;
  pnpmVersion?: string;
  packageManager?: string;
  reactVersion?: string;
  reactDomVersion?: string;
  nextVersion?: string;
  viteVersion?: string;
  webpackVersion?: string;
  typescriptVersion?: string;
  eslintVersion?: string;
  babelVersion?: string;
  lockfileType?: 'npm' | 'yarn' | 'pnpm' | 'none';
  hasLockfile: boolean;
  dependencies: DependencyEntry[];
  devDependencies: DependencyEntry[];
  peerDependencies: DependencyEntry[];
  evidenceRefs: DepEvidenceRef[];
}

export function parseNodeManifests(contents: Map<string, string>): NodeManifestInfo {
  const info: NodeManifestInfo = {
    hasLockfile: false,
    dependencies: [],
    devDependencies: [],
    peerDependencies: [],
    evidenceRefs: []
  };

  for (const [file, content] of contents) {
    const base = file.split('/').pop() ?? file;
    if (base === 'package.json') {
      extractPackageJson(file, content, info);
    } else if (base === 'package-lock.json') {
      info.hasLockfile = true;
      info.lockfileType = 'npm';
      info.evidenceRefs.push({ filePath: file, matchedText: 'package-lock.json', confidence: 'CONFIRMED', reason: 'npm lockfile detectado' });
      extractNpmLockVersion(file, content, info);
    } else if (base === 'yarn.lock') {
      info.hasLockfile = true;
      info.lockfileType = 'yarn';
      info.evidenceRefs.push({ filePath: file, matchedText: 'yarn.lock', confidence: 'CONFIRMED', reason: 'yarn lockfile detectado' });
    } else if (base === 'pnpm-lock.yaml') {
      info.hasLockfile = true;
      info.lockfileType = 'pnpm';
      info.evidenceRefs.push({ filePath: file, matchedText: 'pnpm-lock.yaml', confidence: 'CONFIRMED', reason: 'pnpm lockfile detectado' });
    } else if (base === '.nvmrc' || base === '.node-version') {
      const version = content.trim().replace(/^v/, '');
      if (version) {
        info.nodeVersion = info.nodeVersion ?? version;
        info.evidenceRefs.push({ filePath: file, matchedText: version, confidence: 'CONFIRMED', reason: `Node version em ${base}` });
      }
    }
  }

  return info;
}

function extractPackageJson(file: string, content: string, info: NodeManifestInfo): void {
  const ref = (name: string, version: string): DepEvidenceRef => ({
    filePath: file,
    matchedText: `${name}@${version}`,
    confidence: 'CONFIRMED',
    reason: 'Extraído de package.json'
  });

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return;
  }

  // engines.node
  const engines = pkg['engines'] as Record<string, string> | undefined;
  if (engines?.['node']) {
    info.nodeVersion = info.nodeVersion ?? engines['node'];
    info.evidenceRefs.push({ filePath: file, matchedText: `engines.node: ${engines['node']}`, confidence: 'CONFIRMED', reason: 'package.json engines.node' });
  }
  if (engines?.['npm']) {
    info.npmVersion = info.npmVersion ?? engines['npm'];
    info.evidenceRefs.push({ filePath: file, matchedText: `engines.npm: ${engines['npm']}`, confidence: 'CONFIRMED', reason: 'package.json engines.npm' });
  }

  // packageManager field
  const pm = pkg['packageManager'] as string | undefined;
  if (pm) {
    info.packageManager = pm;
    if (pm.startsWith('yarn')) info.yarnVersion = pm.split('@')[1];
    if (pm.startsWith('pnpm')) info.pnpmVersion = pm.split('@')[1];
    if (pm.startsWith('npm')) info.npmVersion = pm.split('@')[1];
    info.evidenceRefs.push({ filePath: file, matchedText: `packageManager: ${pm}`, confidence: 'CONFIRMED', reason: 'package.json packageManager' });
  }

  // Parse dependencies
  const deps = pkg['dependencies'] as Record<string, string> | undefined;
  if (deps) {
    for (const [name, version] of Object.entries(deps)) {
      const entry: DependencyEntry = { name, version, evidenceRefs: [ref(name, version)] };
      info.dependencies.push(entry);
      extractKnownPackage(name, version, file, info);
    }
  }

  const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
  if (devDeps) {
    for (const [name, version] of Object.entries(devDeps)) {
      const entry: DependencyEntry = { name, version, scope: 'dev', evidenceRefs: [ref(name, version)] };
      info.devDependencies.push(entry);
      extractKnownPackage(name, version, file, info);
    }
  }

  const peerDeps = pkg['peerDependencies'] as Record<string, string> | undefined;
  if (peerDeps) {
    for (const [name, version] of Object.entries(peerDeps)) {
      info.peerDependencies.push({ name, version, scope: 'peer', evidenceRefs: [ref(name, version)] });
    }
  }
}

function extractKnownPackage(name: string, version: string, file: string, info: NodeManifestInfo): void {
  const ref = (matchedText: string): DepEvidenceRef => ({ filePath: file, matchedText, confidence: 'CONFIRMED', reason: 'package.json dependency' });
  switch (name) {
    case 'react': info.reactVersion = info.reactVersion ?? version; info.evidenceRefs.push(ref(`react@${version}`)); break;
    case 'react-dom': info.reactDomVersion = info.reactDomVersion ?? version; break;
    case 'next': info.nextVersion = info.nextVersion ?? version; info.evidenceRefs.push(ref(`next@${version}`)); break;
    case 'vite': info.viteVersion = info.viteVersion ?? version; info.evidenceRefs.push(ref(`vite@${version}`)); break;
    case 'webpack': info.webpackVersion = info.webpackVersion ?? version; info.evidenceRefs.push(ref(`webpack@${version}`)); break;
    case 'typescript': info.typescriptVersion = info.typescriptVersion ?? version; info.evidenceRefs.push(ref(`typescript@${version}`)); break;
    case 'eslint': info.eslintVersion = info.eslintVersion ?? version; info.evidenceRefs.push(ref(`eslint@${version}`)); break;
    case '@babel/core':
    case 'babel-core': info.babelVersion = info.babelVersion ?? version; info.evidenceRefs.push(ref(`babel@${version}`)); break;
    default: break;
  }
}

function extractNpmLockVersion(file: string, content: string, info: NodeManifestInfo): void {
  try {
    const lock = JSON.parse(content) as Record<string, unknown>;
    const version = lock['lockfileVersion'];
    if (version !== undefined) {
      info.evidenceRefs.push({ filePath: file, matchedText: `lockfileVersion: ${version}`, confidence: 'CONFIRMED', reason: 'npm lockfile version' });
    }
  } catch {
    // ignore
  }
}
