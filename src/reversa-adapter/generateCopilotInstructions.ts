import type { ProjectSummary } from '../types';
import { baseEngineContext } from './generateAgentsMd';

export function generateCopilotInstructions(summary: ProjectSummary): string {
  return baseEngineContext(
    'GitHub Copilot',
    '.github/copilot-instructions.md',
    summary,
    'Use these instructions as repository context for suggestions, edits, and chat answers.'
  );
}
