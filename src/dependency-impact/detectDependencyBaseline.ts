/**
 * Detecta e consolida a baseline de dependências/runtime de todos os projetos do workspace.
 * Gera baseline.json e runtime-inventory.md em .tic-code/dependency-impact/.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ScanResult } from '../scanner/scanWorkspace';
import type { DetectedProject } from '../types';
import type { DependencyBaseline } from './dependencyImpactTypes';
import { filterRuntimeFiles } from './detectRuntimeVersions';
import { parseJavaBuildInfo } from './parseJavaBuildFiles';
import { parseNodeManifests } from './parseNodeManifests';
import { parsePythonManifests } from './parsePythonManifests';
import { parseInfraRuntimeFiles } from './parseInfraRuntimeFiles';

export async function detectDependencyBaseline(
  root: vscode.WorkspaceFolder,
  scan: ScanResult,
  projects: DetectedProject[]
): Promise<DependencyBaseline[]> {
  const runtimeFiles = filterRuntimeFiles(scan);
  const contents = await readFileContents(root, runtimeFiles.map((f) => f.relativePath));

  const baselines: DependencyBaseline[] = [];
  const infraInfo = parseInfraRuntimeFiles(contents);

  if (projects.length === 0) {
    // Single-project workspace
    baselines.push(await buildBaseline('workspace', 'unknown', '.', scan, contents, infraInfo));
  } else {
    for (const project of projects) {
      const projectContents = filterContentsByDir(contents, project.relativePath);
      baselines.push(await buildBaseline(project.id, project.kind, project.relativePath, scan, projectContents, infraInfo));
    }
  }

  return baselines;
}

async function buildBaseline(
  projectId: string,
  projectKind: string,
  projectRoot: string,
  _scan: ScanResult,
  contents: Map<string, string>,
  infraInfo: ReturnType<typeof parseInfraRuntimeFiles>
): Promise<DependencyBaseline> {
  const javaInfo = parseJavaBuildInfo(contents);
  const nodeInfo = parseNodeManifests(contents);
  const pythonInfo = parsePythonManifests(contents);

  // Determine primary language
  const hasJava = javaInfo.dependencies.length > 0 || !!javaInfo.runtimeVersion || !!javaInfo.springBootVersion;
  const hasNode = nodeInfo.dependencies.length > 0 || nodeInfo.devDependencies.length > 0 || !!nodeInfo.reactVersion;
  const hasPython = pythonInfo.dependencies.length > 0 || !!pythonInfo.pythonVersion;

  let language = 'unknown';
  let runtimeVersion = 'unknown';
  let runtimeVersionConfidence: 'CONFIRMED' | 'INFERRED' | 'GAP' = 'GAP';
  const packageManagers: string[] = [];
  const buildTools: string[] = [];
  const frameworkVersions: Record<string, string> = {};

  if (hasJava) {
    language = 'java';
    runtimeVersion = javaInfo.runtimeVersion ?? infraInfo.ciJavaVersion ?? 'unknown';
    runtimeVersionConfidence = javaInfo.runtimeVersion ? 'CONFIRMED' : (infraInfo.ciJavaVersion ? 'INFERRED' : 'GAP');
    if (javaInfo.mavenWrapperVersion !== undefined || contents.has('pom.xml') || [...contents.keys()].some((k) => k.endsWith('pom.xml'))) {
      buildTools.push('Maven');
      packageManagers.push('Maven');
    }
    if (javaInfo.gradleWrapperVersion !== undefined || [...contents.keys()].some((k) => k.endsWith('build.gradle') || k.endsWith('build.gradle.kts'))) {
      buildTools.push('Gradle');
      packageManagers.push('Gradle');
    }
    if (javaInfo.springBootVersion) frameworkVersions['spring-boot'] = javaInfo.springBootVersion;
    if (javaInfo.mavenWrapperVersion) frameworkVersions['maven'] = javaInfo.mavenWrapperVersion;
    if (javaInfo.gradleWrapperVersion) frameworkVersions['gradle'] = javaInfo.gradleWrapperVersion;
  } else if (hasNode) {
    language = 'node';
    runtimeVersion = nodeInfo.nodeVersion ?? infraInfo.ciNodeVersion ?? 'unknown';
    runtimeVersionConfidence = nodeInfo.nodeVersion ? 'CONFIRMED' : (infraInfo.ciNodeVersion ? 'INFERRED' : 'GAP');
    if (nodeInfo.lockfileType === 'npm' || [...contents.keys()].some((k) => k.endsWith('package.json'))) {
      packageManagers.push('npm');
      buildTools.push('npm');
    }
    if (nodeInfo.lockfileType === 'yarn') { packageManagers.push('yarn'); buildTools.push('yarn'); }
    if (nodeInfo.lockfileType === 'pnpm') { packageManagers.push('pnpm'); buildTools.push('pnpm'); }
    if (nodeInfo.reactVersion) frameworkVersions['react'] = nodeInfo.reactVersion;
    if (nodeInfo.nextVersion) frameworkVersions['next'] = nodeInfo.nextVersion;
    if (nodeInfo.viteVersion) frameworkVersions['vite'] = nodeInfo.viteVersion;
    if (nodeInfo.webpackVersion) frameworkVersions['webpack'] = nodeInfo.webpackVersion;
    if (nodeInfo.typescriptVersion) frameworkVersions['typescript'] = nodeInfo.typescriptVersion;
  } else if (hasPython) {
    language = 'python';
    runtimeVersion = pythonInfo.pythonVersion ?? infraInfo.ciPythonVersion ?? 'unknown';
    runtimeVersionConfidence = pythonInfo.pythonVersion ? 'CONFIRMED' : (infraInfo.ciPythonVersion ? 'INFERRED' : 'GAP');
    if (pythonInfo.hasPoetry) { packageManagers.push('poetry'); buildTools.push('poetry'); }
    if (pythonInfo.hasPipenv) { packageManagers.push('pipenv'); buildTools.push('pipenv'); }
    if (pythonInfo.hasRequirementsTxt) { packageManagers.push('pip'); }
    if (pythonInfo.djangoVersion) frameworkVersions['django'] = pythonInfo.djangoVersion;
    if (pythonInfo.fastapiVersion) frameworkVersions['fastapi'] = pythonInfo.fastapiVersion;
    if (pythonInfo.flaskVersion) frameworkVersions['flask'] = pythonInfo.flaskVersion;
  }

  const lockfiles: string[] = [];
  for (const key of contents.keys()) {
    const base = key.split('/').pop() ?? key;
    if (base === 'package-lock.json' || base === 'yarn.lock' || base === 'pnpm-lock.yaml' || base === 'poetry.lock' || base === 'Pipfile.lock') {
      lockfiles.push(key);
    }
  }

  const evidenceRefs = [
    ...javaInfo.evidenceRefs,
    ...nodeInfo.evidenceRefs,
    ...pythonInfo.evidenceRefs,
    ...infraInfo.evidenceRefs
  ];

  return {
    projectId,
    projectKind,
    projectRoot,
    language,
    runtimeVersion,
    runtimeVersionConfidence,
    frameworkVersions,
    packageManagers,
    buildTools,
    dependencies: [...javaInfo.dependencies, ...nodeInfo.dependencies, ...pythonInfo.dependencies],
    devDependencies: [...nodeInfo.devDependencies, ...pythonInfo.devDependencies],
    plugins: javaInfo.plugins,
    lockfiles,
    infraRuntime: infraInfo,
    evidenceRefs,
    detectedAt: new Date().toISOString()
  };
}

async function readFileContents(root: vscode.WorkspaceFolder, relativePaths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.allSettled(
    relativePaths.map(async (rel) => {
      try {
        const uri = vscode.Uri.joinPath(root.uri, ...rel.split('/'));
        const bytes = await vscode.workspace.fs.readFile(uri);
        map.set(rel, Buffer.from(bytes).toString('utf8'));
      } catch {
        // skip unreadable files
      }
    })
  );
  return map;
}

function filterContentsByDir(contents: Map<string, string>, dir: string): Map<string, string> {
  if (dir === '.' || dir === '') return contents;
  const result = new Map<string, string>();
  for (const [key, val] of contents) {
    if (key.startsWith(`${dir}/`) || key === dir) {
      result.set(key, val);
    }
  }
  // Also include infra files at root
  for (const [key, val] of contents) {
    const base = key.split('/').pop()?.toLowerCase() ?? '';
    if (
      base === 'dockerfile' || base.startsWith('dockerfile.') ||
      base.includes('docker-compose') ||
      base === 'jenkinsfile' ||
      base === '.gitlab-ci.yml' ||
      base === '.gitlab-ci.yaml' ||
      key.toLowerCase().includes('.github/workflows')
    ) {
      result.set(key, val);
    }
  }
  return result;
}

export function renderRuntimeInventoryMd(baselines: DependencyBaseline[]): string {
  const lines: string[] = [
    '# Runtime Inventory',
    '',
    `> Gerado em: ${new Date().toISOString()}`,
    ''
  ];

  for (const b of baselines) {
    lines.push(`## Projeto: ${b.projectId}`);
    lines.push('');
    lines.push(`- **Linguagem**: ${b.language}`);
    lines.push(`- **Runtime detectado**: \`${b.runtimeVersion}\` (${iconFor(b.runtimeVersionConfidence)})`);
    if (Object.keys(b.frameworkVersions).length > 0) {
      lines.push('- **Frameworks**:');
      for (const [k, v] of Object.entries(b.frameworkVersions)) {
        lines.push(`  - ${k}: \`${v}\``);
      }
    }
    if (b.packageManagers.length > 0) lines.push(`- **Package managers**: ${b.packageManagers.join(', ')}`);
    if (b.buildTools.length > 0) lines.push(`- **Build tools**: ${b.buildTools.join(', ')}`);
    if (b.lockfiles.length > 0) lines.push(`- **Lockfiles**: ${b.lockfiles.join(', ')}`);
    if (b.infraRuntime.dockerBaseImages.length > 0) {
      lines.push('- **Docker base images**:');
      for (const img of b.infraRuntime.dockerBaseImages) {
        lines.push(`  - \`${img}\``);
      }
    }
    if (b.infraRuntime.ciJavaVersion) lines.push(`- **CI Java version**: \`${b.infraRuntime.ciJavaVersion}\``);
    if (b.infraRuntime.ciNodeVersion) lines.push(`- **CI Node version**: \`${b.infraRuntime.ciNodeVersion}\``);
    if (b.infraRuntime.ciPythonVersion) lines.push(`- **CI Python version**: \`${b.infraRuntime.ciPythonVersion}\``);
    lines.push(`- **Dependências**: ${b.dependencies.length + b.devDependencies.length}`);
    lines.push('');
  }

  lines.push('## Evidências');
  lines.push('');
  for (const b of baselines) {
    for (const ref of b.evidenceRefs.slice(0, 20)) {
      lines.push(`- ${iconFor(ref.confidence)} \`${ref.filePath}\` — ${ref.matchedText ?? ''}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function iconFor(c: string): string {
  if (c === 'CONFIRMED') return '🟢';
  if (c === 'INFERRED') return '🟡';
  return '🔴';
}

// Re-export path util used by store
export { path };
