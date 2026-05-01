import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';

export type ModuleKind =
  | 'controller'
  | 'service'
  | 'repository'
  | 'entity'
  | 'dto'
  | 'config'
  | 'security'
  | 'unknown';

export interface JavaSpringFile {
  path: string;
  className: string;
  kind: ModuleKind;
  annotations: string[];
  endpoints: string[];
}

export interface JavaSpringDetection {
  detected: boolean;
  annotations: Record<string, number>;
  files: JavaSpringFile[];
  countsByKind: Record<ModuleKind, number>;
}

const SPRING_ANNOTATIONS = [
  'RestController',
  'Controller',
  'Service',
  'Repository',
  'Entity',
  'Component',
  'Configuration',
  'GetMapping',
  'PostMapping',
  'PutMapping',
  'DeleteMapping',
  'RequestMapping'
];

const EMPTY_COUNTS: Record<ModuleKind, number> = {
  controller: 0,
  service: 0,
  repository: 0,
  entity: 0,
  dto: 0,
  config: 0,
  security: 0,
  unknown: 0
};

export async function detectJavaSpring(scan: ScanResult): Promise<JavaSpringDetection> {
  const javaFiles = scan.files.filter((file) => file.extension === '.java');
  const files: JavaSpringFile[] = [];
  const annotations: Record<string, number> = {};
  const countsByKind = { ...EMPTY_COUNTS };

  for (const file of javaFiles) {
    const absolutePath = path.join(scan.rootPath, file.relativePath);
    const content = await readText(absolutePath);
    const foundAnnotations = extractSpringAnnotations(content);
    const kind = classifyJavaFile(file.relativePath, content, foundAnnotations);
    const endpoints = extractEndpointMappings(content);

    for (const annotation of foundAnnotations) {
      annotations[annotation] = (annotations[annotation] ?? 0) + 1;
    }

    countsByKind[kind] += 1;
    files.push({
      path: file.relativePath,
      className: extractClassName(content) ?? path.basename(file.relativePath, '.java'),
      kind,
      annotations: foundAnnotations,
      endpoints
    });
  }

  return {
    detected: files.some((file) => file.annotations.length > 0),
    annotations: sortRecord(annotations),
    files,
    countsByKind
  };
}

function classifyJavaFile(relativePath: string, content: string, annotations: string[]): ModuleKind {
  const lowerPath = relativePath.toLowerCase();
  const className = (extractClassName(content) ?? path.basename(relativePath, '.java')).toLowerCase();

  if (annotations.includes('RestController') || annotations.includes('Controller') || hasAny(annotations, ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'RequestMapping'])) {
    return 'controller';
  }

  if (annotations.includes('Service') || lowerPath.includes('/service/') || className.endsWith('service')) {
    return 'service';
  }

  if (annotations.includes('Repository') || lowerPath.includes('/repository/') || className.endsWith('repository')) {
    return 'repository';
  }

  if (annotations.includes('Entity') || lowerPath.includes('/entity/') || lowerPath.includes('/model/')) {
    return 'entity';
  }

  if (lowerPath.includes('/security/') || className.includes('security') || content.includes('SecurityFilterChain') || content.includes('WebSecurityConfigurerAdapter')) {
    return 'security';
  }

  if (annotations.includes('Configuration') || lowerPath.includes('/config/') || className.endsWith('config') || className.endsWith('configuration')) {
    return 'config';
  }

  if (lowerPath.includes('/dto/') || className.endsWith('dto') || className.endsWith('request') || className.endsWith('response')) {
    return 'dto';
  }

  if (annotations.includes('Component')) {
    return 'service';
  }

  return 'unknown';
}

function extractSpringAnnotations(content: string): string[] {
  return SPRING_ANNOTATIONS.filter((annotation) => new RegExp(`@${annotation}\\b`).test(content));
}

function extractEndpointMappings(content: string): string[] {
  const endpoints = new Set<string>();
  const mappingPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g;
  let match: RegExpExecArray | null;

  while ((match = mappingPattern.exec(content)) !== null) {
    const rawArgs = match[2] ?? '';
    const route = rawArgs.match(/["'`]([^"'`]+)["'`]/)?.[1] ?? '';
    endpoints.add(route ? `${match[1]} ${route}` : match[1]);
  }

  return [...endpoints].sort();
}

function extractClassName(content: string): string | undefined {
  return content.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/)?.[1];
}

function hasAny(values: string[], expected: string[]): boolean {
  return expected.some((value) => values.includes(value));
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1]));
}
