import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateAgentsMd(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'codex',
    targetFile: 'AGENTS.md',
    engineInstruction: 'Leia este arquivo antes de planejar ou editar.',
    compact: false
  }, extensionUri);
}

