export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
}

export interface OllamaGenerateOptions {
  temperature?: number;
  numPredict?: number;
}

export interface OllamaModel {
  name: string;
}

export class OllamaClient {
  constructor(private readonly options: OllamaClientOptions) {}

  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Ollama health check failed with HTTP ${response.status}.`);
    }

    const data = await response.json() as { models?: OllamaModel[] };
    return data.models ?? [];
  }

  async generate(prompt: string, options: OllamaGenerateOptions = {}): Promise<string> {
    const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.numPredict ?? 1200
        }
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      throw new Error(`Ollama generation failed with HTTP ${response.status}.`);
    }

    const data = await response.json() as { response?: string; error?: string };
    if (data.error) {
      throw new Error(data.error);
    }

    return (data.response ?? '').trim();
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
