import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';

export interface LocalAiSettings {
  enabled: boolean;
  ollamaUrl: string;
  model: string;
}

export interface OllamaStatus {
  ok: boolean;
  enabled: boolean;
  url: string;
  model: string;
  models: string[];
  message: string;
}

export function getLocalAiSettings(): LocalAiSettings {
  const config = vscode.workspace.getConfiguration('ticCoderLite.localAi');
  return {
    enabled: config.get<boolean>('enabled', false),
    ollamaUrl: config.get<string>('ollamaUrl', 'http://localhost:11434'),
    model: config.get<string>('model', 'qwen2.5-coder:1.5b')
  };
}

export async function checkOllamaStatus(settings = getLocalAiSettings()): Promise<OllamaStatus> {
  if (!settings.enabled) {
    return {
      ok: false,
      enabled: false,
      url: settings.ollamaUrl,
      model: settings.model,
      models: [],
      message: 'A IA Local está desativada nas configurações. O Modo Lite continua funcionando normalmente.'
    };
  }

  try {
    const client = new OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.model });
    const models = (await client.listModels()).map((model) => model.name);
    const modelAvailable = models.includes(settings.model);

    return {
      ok: modelAvailable,
      enabled: true,
      url: settings.ollamaUrl,
      model: settings.model,
      models,
      message: modelAvailable
        ? `Ollama está disponível com ${settings.model}.`
        : `Ollama está em execução, mas o modelo ${settings.model} não foi encontrado. O TIC Coder Lite não baixa modelos automaticamente.`
    };
  } catch {
    return {
      ok: false,
      enabled: true,
      url: settings.ollamaUrl,
      model: settings.model,
      models: [],
      message: `Ollama não está acessível em ${settings.ollamaUrl}. Inicie o Ollama localmente ou continue usando o Modo Lite sem IA.`
    };
  }
}
