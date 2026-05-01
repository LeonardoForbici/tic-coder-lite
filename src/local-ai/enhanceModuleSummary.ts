import type { OllamaClient } from './ollamaClient';

export interface ModuleSummaryInput {
  projectName: string;
  modulesJson: string;
  graphJson: string;
  risksJson: string;
}

export async function enhanceModuleSummary(client: OllamaClient, input: ModuleSummaryInput): Promise<string> {
  return client.generate(`Resuma os módulos do projeto para um agente de código.
Use apenas o JSON fornecido. Não invente módulos. Marque incertezas como LACUNA. Responda em português do Brasil.

Projeto: ${input.projectName}

modules.json:
${clip(input.modulesJson, 5000)}

graph.json:
${clip(input.graphJson, 6000)}

risks.json:
${clip(input.risksJson, 4000)}

Retorne Markdown com:
- Lista de módulos
- Responsabilidades inferidas pelos arquivos
- Dependências entre módulos
- Pontos de risco
- Ordem de leitura recomendada por módulo
`, { temperature: 0.2, numPredict: 1500 });
}

function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncado]` : value;
}
