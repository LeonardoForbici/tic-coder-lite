/**
 * backendEndpointIndex.ts
 *
 * Detecta endpoints Spring/Java em arquivos backend.
 * Análise estática 100% local — nenhuma execução ou conexão externa.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';
import type { DetectedProject } from '../types';

export type Confidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export interface BackendEndpoint {
  projectId: string;
  controllerFile: string;
  controllerClass?: string;
  controllerMethod?: string;
  httpMethod: string;
  basePath: string;
  path: string;
  fullPath: string;
  line: number;
  confidence: Confidence;
  evidence: string[];
}

export interface BackendEndpointIndex {
  generatedAt: string;
  projectId: string;
  endpoints: BackendEndpoint[];
  gaps: string[];
  stats: {
    total: number;
    confirmed: number;
    inferred: number;
    byMethod: Record<string, number>;
  };
}

// Spring mapping annotations
const MAPPING_PATTERNS = [
  { annotation: 'GetMapping', method: 'GET' },
  { annotation: 'PostMapping', method: 'POST' },
  { annotation: 'PutMapping', method: 'PUT' },
  { annotation: 'DeleteMapping', method: 'DELETE' },
  { annotation: 'PatchMapping', method: 'PATCH' },
  { annotation: 'RequestMapping', method: 'ANY' }
];

export async function buildBackendEndpointIndex(
  scan: ScanResult,
  projects: DetectedProject[]
): Promise<BackendEndpointIndex[]> {
  const backendProjects = projects.filter((p) => p.kind === 'backend');

  const projectsToScan = backendProjects.length > 0 ? backendProjects : [
    { id: 'workspace', relativePath: '.', kind: 'backend' } as DetectedProject
  ];

  const results: BackendEndpointIndex[] = [];

  for (const project of projectsToScan) {
    const endpoints: BackendEndpoint[] = [];
    const gaps: string[] = [];

    const javaFiles = scan.files.filter((f) => {
      if (f.extension !== '.java') return false;
      if (project.relativePath === '.') return true;
      return f.relativePath.startsWith(project.relativePath);
    });

    if (javaFiles.length === 0) {
      gaps.push(`GAP: nenhum arquivo .java encontrado no projeto ${project.id}.`);
    }

    for (const file of javaFiles) {
      const absolutePath = path.join(scan.rootPath, file.relativePath);
      const content = await readSafe(absolutePath);
      if (!content) continue;

      const isController =
        /@(RestController|Controller)\b/.test(content) ||
        /@RequestMapping\b/.test(content);

      if (!isController) continue;

      const fileEndpoints = extractEndpoints(file.relativePath, content, project.id);
      endpoints.push(...fileEndpoints);
    }

    const confirmed = endpoints.filter((e) => e.confidence === 'CONFIRMED').length;
    const inferred = endpoints.filter((e) => e.confidence === 'INFERRED').length;
    const byMethod: Record<string, number> = {};
    for (const ep of endpoints) {
      byMethod[ep.httpMethod] = (byMethod[ep.httpMethod] ?? 0) + 1;
    }

    results.push({
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      endpoints,
      gaps,
      stats: { total: endpoints.length, confirmed, inferred, byMethod }
    });
  }

  return results;
}

function extractEndpoints(filePath: string, content: string, projectId: string): BackendEndpoint[] {
  const endpoints: BackendEndpoint[] = [];
  const lines = content.split('\n');

  // Extract class-level @RequestMapping
  const classBaseMatch = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["'`]([^"'`]+)["'`]/);
  const classBase = classBaseMatch?.[1] ?? '';
  const controllerClass = extractJavaClassName(content);

  for (const { annotation, method } of MAPPING_PATTERNS) {
    const pattern = new RegExp(
      `@${annotation}\\s*(?:\\(([^)]*?)\\))?\\s*(?:public|protected|private)?\\s+\\w[\\w<>\\[\\],\\s]*\\s+(\\w+)\\s*\\(`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const args = match[1] ?? '';
      const methodName = match[2];
      const lineNumber = getLineNumber(content, match.index);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';

      // Extract path from annotation args
      const pathMatch = args.match(/(?:value\s*=\s*)?["'`]([^"'`]*)["'`]/);
      const endpointPath = pathMatch?.[1] ?? '';

      // Determine actual HTTP method for @RequestMapping
      let httpMethod = method;
      if (method === 'ANY') {
        const methodMatch = args.match(/method\s*=\s*RequestMethod\.(\w+)/);
        httpMethod = methodMatch?.[1] ?? 'ANY';
      }

      const fullPath = joinPaths(classBase, endpointPath);

      // Skip class-level @RequestMapping (will be used as base only)
      if (annotation === 'RequestMapping' && methodName === undefined) continue;

      endpoints.push({
        projectId,
        controllerFile: filePath,
        controllerClass,
        controllerMethod: methodName,
        httpMethod,
        basePath: classBase,
        path: endpointPath,
        fullPath,
        line: lineNumber,
        confidence: fullPath ? 'CONFIRMED' : 'INFERRED',
        evidence: [lineText.slice(0, 120)]
      });
    }
  }

  return endpoints;
}

function extractJavaClassName(content: string): string | undefined {
  return content.match(/\b(?:class|interface)\s+([A-Za-z_$][\w$]*)/)?.[1];
}

function joinPaths(base: string, segment: string): string {
  if (!base && !segment) return '/';
  if (!base) return segment.startsWith('/') ? segment : `/${segment}`;
  if (!segment) return base;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const s = segment.startsWith('/') ? segment : `/${segment}`;
  return `${b}${s}`;
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

async function readSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
