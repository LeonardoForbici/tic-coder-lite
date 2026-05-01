"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
class OllamaClient {
    options;
    constructor(options) {
        this.options = options;
    }
    async listModels() {
        const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/tags`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
            throw new Error(`Ollama health check failed with HTTP ${response.status}.`);
        }
        const data = await response.json();
        return data.models ?? [];
    }
    async generate(prompt, options = {}) {
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
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return (data.response ?? '').trim();
    }
}
exports.OllamaClient = OllamaClient;
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
//# sourceMappingURL=ollamaClient.js.map