import * as vscode from 'vscode';

const CHANNEL_NAME = 'TIC Coder Lite';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel(CHANNEL_NAME);
  return channel;
}

export function showOutputChannel(preserveFocus = true): void {
  getOutputChannel().show(preserveFocus);
}

export function logInfo(message: string): void {
  log('INFO', message);
}

export function logWarn(message: string): void {
  log('WARN', message);
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? ` ${error.message}` : error ? ` ${String(error)}` : '';
  log('ERROR', `${message}${detail}`);
}

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] [${level}] ${message}`);
}
