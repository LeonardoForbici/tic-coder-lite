/**
 * projectGraph.ts
 *
 * Constrói o Grafo Multi-Projeto (project-graph.json) com nós enriquecidos
 * e arestas cross-project com confidence/evidence.
 * Mantém compatibilidade com graph.json existente.
 */
import type { LightweightGraph, GraphNode } from './buildGraph';
import type { FrontendApiIndex } from './frontendApiIndex';
import type { BackendEndpointIndex } from './backendEndpointIndex';
import type { BackendDatabaseIndex } from './backendDatabaseIndex';
import type { CrossProjectLinksResult } from './crossProjectLinks';
import type { DetectedProject } from '../types';

export type ProjectGraphConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export interface ProjectGraphNode {
  id: string;
  label: string;
  path: string;
  type: string;
  module: string;
  language: string;
  riskLevel?: string;
  origin: string;
  /** Multi-project fields */
  projectId: string;
  projectName: string;
  projectKind: string;
  projectRoot: string;
  visibleByDefault: boolean;
}

export interface ProjectGraphEdge {
  from: string;
  to: string;
  type: string;
  sourcePath: string;
  targetPath: string;
  /** Multi-project fields */
  confidence: ProjectGraphConfidence;
  evidence: string[];
  crossProject: boolean;
  sourceProjectId?: string;
  targetProjectId?: string;
}

export interface ProjectGraphStats {
  projectCount: number;
  frontendProjects: number;
  backendProjects: number;
  databaseProjects: number;
  mobileProjects: number;
  crossProjectLinkCount: number;
  confirmedLinks: number;
  inferredLinks: number;
  gaps: number;
  totalNodes: number;
  totalEdges: number;
}

export interface ProjectGraph {
  version: string;
  generatedAt: string;
  projects: DetectedProject[];
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  crossProjectLinks: CrossProjectLinksResult['links'];
  stats: ProjectGraphStats;
}

export function buildProjectGraph(
  baseGraph: LightweightGraph,
  projects: DetectedProject[],
  _frontendIndexes: FrontendApiIndex[],
  _backendIndexes: BackendEndpointIndex[],
  _backendDbIndexes: BackendDatabaseIndex[],
  crossLinks: CrossProjectLinksResult
): ProjectGraph {
  // Build project-root-to-project map
  const projectByRoot = new Map<string, DetectedProject>();
  for (const p of projects) {
    projectByRoot.set(p.relativePath, p);
  }

  // Enrich existing graph nodes with project metadata
  const nodes: ProjectGraphNode[] = baseGraph.nodes.map((node) => {
    const project = findProjectForNode(node, projects);
    return {
      id: node.id,
      label: node.label,
      path: node.path,
      type: node.type,
      module: node.module,
      language: node.language,
      riskLevel: node.riskLevel,
      origin: node.origin,
      projectId: project?.id ?? 'workspace',
      projectName: project?.name ?? 'Workspace',
      projectKind: project?.kind ?? 'unknown',
      projectRoot: project?.relativePath ?? '.',
      visibleByDefault: node.visibleByDefault
    };
  });

  // Enrich existing edges with confidence/evidence/crossProject
  const edges: ProjectGraphEdge[] = baseGraph.edges.map((edge) => {
    const fromNode = nodes.find((n) => n.id === edge.from);
    const toNode = nodes.find((n) => n.id === edge.to);
    const crossProject = Boolean(
      fromNode && toNode && fromNode.projectId !== toNode.projectId
    );
    return {
      from: edge.from,
      to: edge.to,
      type: edge.type,
      sourcePath: edge.sourcePath,
      targetPath: edge.targetPath,
      confidence: 'CONFIRMED',
      evidence: [],
      crossProject,
      sourceProjectId: fromNode?.projectId,
      targetProjectId: toNode?.projectId
    };
  });

  // Add cross-project edges from frontend → backend
  for (const link of crossLinks.links.filter((l) => l.type === 'FRONTEND_CALLS_BACKEND')) {
    edges.push({
      from: `${link.fromProjectId}:${link.fromFile}`,
      to: `${link.toProjectId}:${link.toFile ?? 'unknown'}`,
      type: 'FRONTEND_CALLS_BACKEND',
      sourcePath: link.fromFile,
      targetPath: link.toFile ?? '',
      confidence: link.confidence,
      evidence: link.evidence,
      crossProject: true,
      sourceProjectId: link.fromProjectId,
      targetProjectId: link.toProjectId
    });
  }

  // Add virtual nodes for cross-project edges that don't have base nodes
  const existingNodeIds = new Set(nodes.map((n) => n.id));
  for (const link of crossLinks.links) {
    const fromId = `${link.fromProjectId}:${link.fromFile}`;
    const toId = `${link.toProjectId}:${link.toFile ?? 'unknown'}`;

    if (!existingNodeIds.has(fromId) && link.fromFile) {
      nodes.push(buildVirtualNode(fromId, link.fromFile, link.fromProjectId, projects));
      existingNodeIds.add(fromId);
    }
    if (!existingNodeIds.has(toId) && link.toFile) {
      nodes.push(buildVirtualNode(toId, link.toFile, link.toProjectId, projects));
      existingNodeIds.add(toId);
    }
  }

  const confirmed = edges.filter((e) => e.confidence === 'CONFIRMED').length;
  const inferred = edges.filter((e) => e.confidence === 'INFERRED').length;
  const gaps = crossLinks.gaps.length;

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    projects,
    nodes,
    edges,
    crossProjectLinks: crossLinks.links,
    stats: {
      projectCount: projects.length,
      frontendProjects: projects.filter((p) => p.kind === 'frontend').length,
      backendProjects: projects.filter((p) => p.kind === 'backend').length,
      databaseProjects: projects.filter((p) => p.kind === 'database').length,
      mobileProjects: projects.filter((p) => p.kind === 'mobile').length,
      crossProjectLinkCount: crossLinks.stats.totalLinks,
      confirmedLinks: confirmed,
      inferredLinks: inferred,
      gaps,
      totalNodes: nodes.length,
      totalEdges: edges.length
    }
  };
}

function findProjectForNode(node: GraphNode, projects: DetectedProject[]): DetectedProject | undefined {
  if (node.origin !== 'internal') return undefined;
  const nodePath = node.path.toLowerCase();
  // Find the project whose relativePath is a prefix of this node's path
  let bestMatch: DetectedProject | undefined;
  let bestMatchLen = 0;
  for (const project of projects) {
    const rel = project.relativePath.toLowerCase();
    if (rel === '.' || rel === '') continue;
    if (nodePath.startsWith(rel) && rel.length > bestMatchLen) {
      bestMatch = project;
      bestMatchLen = rel.length;
    }
  }
  return bestMatch;
}

function buildVirtualNode(
  id: string,
  filePath: string,
  projectId: string,
  projects: DetectedProject[]
): ProjectGraphNode {
  const project = projects.find((p) => p.id === projectId);
  const ext = filePath.split('.').pop() ?? '';
  const language = inferLanguage(ext);
  const label = filePath.split('/').pop() ?? filePath;

  return {
    id,
    label,
    path: filePath,
    type: inferType(filePath),
    module: projectId,
    language,
    origin: 'internal',
    projectId: project?.id ?? projectId,
    projectName: project?.name ?? projectId,
    projectKind: project?.kind ?? 'unknown',
    projectRoot: project?.relativePath ?? '.',
    visibleByDefault: true
  };
}

function inferLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    java: 'Java', kt: 'Kotlin', sql: 'SQL', py: 'Python'
  };
  return map[ext] ?? ext;
}

function inferType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('controller.java')) return 'controller';
  if (lower.endsWith('service.java') || lower.endsWith('serviceimpl.java')) return 'service';
  if (lower.endsWith('repository.java') || lower.endsWith('dao.java')) return 'repository';
  if (/page|screen|view/.test(lower) && (lower.endsWith('.tsx') || lower.endsWith('.jsx'))) return 'frontend_page';
  if (/service|client/.test(lower) && (lower.endsWith('.ts') || lower.endsWith('.js'))) return 'api_client';
  if (lower.endsWith('.sql')) return 'sql';
  return 'file';
}
