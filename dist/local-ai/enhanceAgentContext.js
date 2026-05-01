"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhanceAgentContext = enhanceAgentContext;
exports.enhanceQuestions = enhanceQuestions;
async function enhanceAgentContext(client, input) {
    return client.generate(`Você está melhorando um arquivo de contexto local-first para agente de código.
Não invente fatos. Marque itens incertos como LACUNA. Mantenha o texto conciso e operacional. Responda em português do Brasil.

Projeto: ${input.projectName}

Contexto do agente:
${clip(input.agentContext, 6000)}

Riscos:
${clip(input.risksMarkdown, 3000)}

Arquitetura:
${clip(input.architectureMarkdown, 4000)}

Confiança:
${clip(input.confidenceReport, 3000)}

Retorne Markdown com:
1. Resumo melhorado do projeto
2. Orientações para edições mais seguras
3. Principais riscos explicados
4. Lacunas e necessidades de validação humana
`, { temperature: 0.2, numPredict: 1400 });
}
async function enhanceQuestions(client, input) {
    return client.generate(`Gere perguntas de validação humana para este projeto.
Use apenas o contexto fornecido. Foque em edições arriscadas, fronteiras de arquitetura, endpoints, dados, segurança e desconhecidos. Responda em português do Brasil.

Projeto: ${input.projectName}

Contexto:
${clip(input.agentContext, 5000)}

Riscos:
${clip(input.risksMarkdown, 3000)}

Arquitetura:
${clip(input.architectureMarkdown, 3500)}

Retorne Markdown agrupado por Arquitetura, Risco, Dados, Segurança e Instruções para Agentes.
`, { temperature: 0.25, numPredict: 1200 });
}
function clip(value, maxLength) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncado]` : value;
}
//# sourceMappingURL=enhanceAgentContext.js.map