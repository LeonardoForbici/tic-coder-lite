import type { ProjectSummary } from '../types';
import { baseEngineContext } from './generateAgentsMd';

export function generateGeminiMd(summary: ProjectSummary): string {
  return baseEngineContext(
    'Gemini CLI',
    'GEMINI.md',
    summary,
    'Use this local context before answering or modifying files through Gemini CLI.'
  );
}
