import * as vscode from 'vscode';
import { exportForEngineCommand } from '../reversa-adapter/exportForEngines';

export async function exportAgentsMd(context: vscode.ExtensionContext): Promise<void> {
  await exportForEngineCommand(context, 'codex');
}
