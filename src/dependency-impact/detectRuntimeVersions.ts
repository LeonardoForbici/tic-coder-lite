/**
 * Detecta versões de runtime em arquivos do workspace.
 * Consolida informações de build files, lockfiles, Dockerfile e CI.
 */

import type { ScanResult } from '../scanner/scanWorkspace';
import type { ScannedFile } from '../scanner/scanFiles';
import type { DepEvidenceRef } from './dependencyImpactTypes';

export interface RuntimeVersionSnapshot {
  javaVersion?: string;
  javaVersionConfidence: 'CONFIRMED' | 'INFERRED' | 'GAP';
  nodeVersion?: string;
  nodeVersionConfidence: 'CONFIRMED' | 'INFERRED' | 'GAP';
  pythonVersion?: string;
  pythonVersionConfidence: 'CONFIRMED' | 'INFERRED' | 'GAP';
  springBootVersion?: string;
  reactVersion?: string;
  nextVersion?: string;
  djangoVersion?: string;
  fastapiVersion?: string;
  dockerBaseImages: string[];
  evidenceRefs: DepEvidenceRef[];
}

/**
 * Retorna os arquivos relevantes para detecção de runtime.
 * Não lê os conteúdos — apenas filtra por nome/extensão.
 */
export function filterRuntimeFiles(scan: ScanResult): ScannedFile[] {
  const relevantPatterns = [
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'gradle.properties',
    'gradle-wrapper.properties',
    'maven-wrapper.properties',
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.nvmrc',
    '.node-version',
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'setup.py',
    'runtime.txt',
    '.python-version',
    'dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    '.gitlab-ci.yml',
    '.gitlab-ci.yaml',
    'Jenkinsfile',
    'nixpacks.toml',
    'railway.toml'
  ];

  return scan.files.filter((f) => {
    const base = f.relativePath.split('/').pop()?.toLowerCase() ?? '';
    const lower = f.relativePath.toLowerCase();
    return (
      relevantPatterns.includes(base) ||
      base.startsWith('dockerfile') ||
      base.startsWith('requirements') ||
      lower.includes('.github/workflows')
    );
  });
}

/**
 * Extrai versão numérica maior de uma string de versão (ex: "1.8" → 8, "17" → 17).
 */
export function normalizeJavaVersion(raw: string): number | undefined {
  if (!raw) return undefined;
  // Handle "1.8" → 8
  const m = raw.match(/^1\.(\d+)$/) ?? raw.match(/^(\d+)/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

/**
 * Extrai versão maior de uma string semver (ex: "^17.0.1" → 17, "~14.18.0" → 14).
 */
export function normalizeMajorVersion(raw: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.replace(/[\^~>=<! ]/g, '').match(/^(\d+)/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}
