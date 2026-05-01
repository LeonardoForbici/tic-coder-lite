import * as vscode from 'vscode';
import { openOverviewPanel } from '../webview/overviewPanel';

export async function openOverview(context: vscode.ExtensionContext): Promise<void> {
  await openOverviewPanel(context);
}
