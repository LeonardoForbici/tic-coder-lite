"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuestionsMd = generateQuestionsMd;
function generateQuestionsMd(summary) {
    const stackQuestions = summary.inventory.stack
        .filter((signal) => signal.detected)
        .map((signal) => `- ${signal.name} ainda é parte ativa do projeto ou é resíduo legado?`);
    const moduleQuestions = summary.inventory.modules
        .filter((module) => module.files.length > 0)
        .slice(0, 8)
        .map((module) => `- A fronteira do módulo ${module.kind} corresponde à arquitetura pretendida?`);
    const riskQuestions = summary.risks.risks
        .slice(0, 12)
        .map((risk) => `- ${risk.file}${risk.line ? `:${risk.line}` : ''} deve ser tratado como risco obrigatório na próxima alteração? (${risk.title})`);
    const graphQuestions = summary.graph.stats.centralFiles
        .slice(0, 8)
        .map((file) => `- ${file.path} é central de propósito ou suas responsabilidades deveriam ser separadas?`);
    return `# Perguntas do TIC Coder Lite

Gerado em: ${new Date().toISOString()}
Projeto: ${summary.workspaceName}

## Validação de Arquitetura

${[...stackQuestions, ...moduleQuestions].join('\n') || '- A stack e as fronteiras de módulo detectadas estão corretas?'}

## Validação de Riscos

${riskQuestions.join('\n') || '- Nenhum risco determinístico foi encontrado. Existem riscos específicos do projeto que o TIC Coder Lite deveria aprender a detectar?'}

## Validação de Grafo e Impacto

${graphQuestions.join('\n') || '- Quais arquivos são pontos conhecidos de impacto mesmo que o grafo ainda não mostre isso?'}

## Decisões Humanas Necessárias

- Este projeto deve usar apenas Modo Lite, exportações de IA Padrão ou IA Local opcional?
- Quais arquivos de IA Padrão devem ser commitados: AGENTS.md, CLAUDE.md, instruções do Copilot, regras do Cursor ou GEMINI.md?
- A IA Local é permitida neste workspace, e qual modelo pequeno do Ollama deve ser usado?
- Quais fatos gerados devem virar regras de projeto para agentes de IA?
- Quais módulos são seguros para edições automatizadas e quais exigem revisão manual?
- Existem endpoints, migrations, regras de autenticação ou contratos públicos que nunca devem mudar sem aprovação?
- Existem convenções locais invisíveis por nomes de arquivo, imports ou manifests?
`;
}
//# sourceMappingURL=generateQuestionsMd.js.map