import type { ProjectSummary } from '../types';
import { baseEngineContext } from './generateAgentsMd';

export function generateClaudeMd(summary: ProjectSummary): string {
  return baseEngineContext(
    'Claude Code',
    'CLAUDE.md',
    summary,
    'When the user asks you to modify this project, inspect the TIC Coder Lite context files first.'
  );
}
