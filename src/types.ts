import type { LightweightGraph } from './scanner/buildGraph';
import type { ArchitectureInventory } from './scanner/detectStack';
import type { RiskReport } from './scanner/detectRisks';
import type { ScanResult } from './scanner/scanWorkspace';

export type LanguageStats = Record<string, number>;

export interface AgentEngine {
  id: string;
  name: string;
  entryFile: string;
  detected: boolean;
}

export interface ProjectSummary {
  workspaceName: string;
  rootPath: string;
  generatedAt: string;
  totalFiles: number;
  totalLines: number;
  languages: LanguageStats;
  topDirectories: Array<{ name: string; files: number }>;
  packageManagers: string[];
  detectedAgentEngines: AgentEngine[];
  keyFiles: string[];
  scan: ScanResult;
  inventory: ArchitectureInventory;
  graph: LightweightGraph;
  risks: RiskReport;
}

export interface AgentContext {
  summary: ProjectSummary;
  markdown: string;
}

export interface SidebarState {
  lastAnalysis?: ProjectSummary;
}
