import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AiEngine, EngineDefinition } from './engineTypes';

// Conceptually adapted from Reversa's installer detector by Sandeco (MIT License).
// TIC Coder Lite keeps only lightweight engine detection and writes context to .tic-code.
const execFileAsync = promisify(execFile);

export const ENGINE_DEFINITIONS: EngineDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    entryFile: 'CLAUDE.md',
    entryTemplate: 'CLAUDE.md',
    skillsDir: '.claude/skills',
    universalSkillsDir: '.agents/skills',
    command: 'claude',
    folderSignals: ['.claude'],
    fileSignals: ['CLAUDE.md']
  },
  {
    id: 'codex',
    name: 'Codex',
    entryFile: 'AGENTS.md',
    entryTemplate: 'AGENTS.md',
    skillsDir: '.agents/skills',
    universalSkillsDir: '.agents/skills',
    command: 'codex',
    folderSignals: [],
    fileSignals: ['AGENTS.md']
  },
  {
    id: 'cursor',
    name: 'Cursor',
    entryFile: '.cursorrules',
    entryTemplate: 'cursorrules',
    skillsDir: '.agents/skills',
    universalSkillsDir: '.agents/skills',
    folderSignals: ['.cursor'],
    fileSignals: ['.cursorrules']
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    entryFile: '.github/copilot-instructions.md',
    entryTemplate: 'copilot-instructions',
    skillsDir: '.agents/skills',
    universalSkillsDir: '.agents/skills',
    folderSignals: ['.github'],
    fileSignals: ['.github/copilot-instructions.md']
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    entryFile: 'GEMINI.md',
    entryTemplate: 'GEMINI.md',
    skillsDir: '.agents/skills',
    universalSkillsDir: '.agents/skills',
    command: 'gemini',
    folderSignals: [],
    fileSignals: ['GEMINI.md']
  },
  {
    id: 'aider',
    name: 'Aider',
    entryFile: 'CONVENTIONS.md',
    entryTemplate: 'CONVENTIONS.md',
    skillsDir: '.agents/skills',
    universalSkillsDir: '.agents/skills',
    command: 'aider',
    folderSignals: [],
    fileSignals: ['CONVENTIONS.md', '.aider.conf.yml']
  }
];

export async function detectEngines(projectRoot: string): Promise<AiEngine[]> {
  return Promise.all(ENGINE_DEFINITIONS.map((engine) => detectEngine(projectRoot, engine)));
}

export async function detectEngineById(projectRoot: string, id: AiEngine['id']): Promise<AiEngine | undefined> {
  const definition = ENGINE_DEFINITIONS.find((engine) => engine.id === id);
  return definition ? detectEngine(projectRoot, definition) : undefined;
}

async function detectEngine(projectRoot: string, definition: EngineDefinition): Promise<AiEngine> {
  const reasons: string[] = [];

  for (const folder of definition.folderSignals) {
    if (await exists(path.join(projectRoot, folder))) {
      reasons.push(`folder:${folder}`);
    }
  }

  for (const file of definition.fileSignals) {
    if (await exists(path.join(projectRoot, file))) {
      reasons.push(`file:${file}`);
    }
  }

  if (definition.command && await commandExists(definition.command)) {
    reasons.push(`command:${definition.command}`);
  }

  return {
    ...definition,
    detected: reasons.length > 0,
    detectionReasons: reasons
  };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
    await execFileAsync(lookup, [command], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}
