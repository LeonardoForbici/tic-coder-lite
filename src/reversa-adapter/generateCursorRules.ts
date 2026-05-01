import type { ProjectSummary } from '../types';
import { baseEngineContext } from './generateAgentsMd';

export function generateCursorRules(summary: ProjectSummary): string {
  return baseEngineContext(
    'Cursor',
    '.cursorrules',
    summary,
    'Apply these project rules when proposing edits or generating code in Cursor.'
  );
}
