export type EngineId =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'github-copilot'
  | 'gemini-cli'
  | 'aider';

export interface AiEngine {
  id: EngineId;
  name: string;
  entryFile: string;
  entryTemplate: string;
  skillsDir: string;
  universalSkillsDir: string;
  command?: string;
  folderSignals: string[];
  fileSignals: string[];
  detected: boolean;
  detectionReasons: string[];
}

export interface EngineDefinition extends Omit<AiEngine, 'detected' | 'detectionReasons'> {}

export interface EngineExportResult {
  engine: AiEngine;
  targetFile: string;
  action: 'created' | 'overwritten' | 'appended' | 'ignored';
}

export interface CreatedFilesManifest {
  generatedAt: string;
  files: string[];
}
