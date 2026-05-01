"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhanceWithLocalAi = enhanceWithLocalAi;
const vscode = __importStar(require("vscode"));
const checkOllamaStatus_1 = require("../local-ai/checkOllamaStatus");
const enhanceAgentContext_1 = require("../local-ai/enhanceAgentContext");
const enhanceModuleSummary_1 = require("../local-ai/enhanceModuleSummary");
const ollamaClient_1 = require("../local-ai/ollamaClient");
const analyzeProject_1 = require("./analyzeProject");
async function enhanceWithLocalAi() {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de usar o Modo IA Local.');
        return;
    }
    const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
    const scanUri = vscode.Uri.joinPath(ticCodeDir, 'scan.json');
    if (!await exists(scanUri)) {
        vscode.window.showInformationMessage('Execute a análise do Modo Lite antes de usar o Modo IA Local.');
        return;
    }
    const settings = (0, checkOllamaStatus_1.getLocalAiSettings)();
    const status = await (0, checkOllamaStatus_1.checkOllamaStatus)(settings);
    if (!status.ok) {
        vscode.window.showInformationMessage(status.message);
        return;
    }
    const client = new ollamaClient_1.OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.model });
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TIC Coder Lite: melhorando com ${settings.model}`,
        cancellable: false
    }, async (progress) => {
        const projectName = root.name;
        progress.report({ message: 'Lendo arquivos de contexto .tic-code' });
        const agentContext = await readText(vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'));
        const risksMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.md'));
        const architectureMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'architecture.md'));
        const confidenceReport = await readText(vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'));
        const modulesJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'modules.json'));
        const graphJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'graph.json'));
        const risksJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.json'));
        progress.report({ message: 'Melhorando contexto para IA' });
        const agentContextAi = await (0, enhanceAgentContext_1.enhanceAgentContext)(client, {
            projectName,
            agentContext,
            risksMarkdown,
            architectureMarkdown,
            confidenceReport
        });
        progress.report({ message: 'Gerando perguntas de validação humana' });
        const questionsAi = await (0, enhanceAgentContext_1.enhanceQuestions)(client, {
            projectName,
            agentContext,
            risksMarkdown,
            architectureMarkdown,
            confidenceReport
        });
        progress.report({ message: 'Resumindo módulos' });
        const moduleSummariesAi = await (0, enhanceModuleSummary_1.enhanceModuleSummary)(client, {
            projectName,
            modulesJson,
            graphJson,
            risksJson
        });
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'agent-context.ai.md'), Buffer.from(agentContextAi, 'utf8'));
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'questions.ai.md'), Buffer.from(questionsAi, 'utf8'));
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'module-summaries.ai.md'), Buffer.from(moduleSummariesAi, 'utf8'));
    });
    vscode.window.showInformationMessage('Modo IA Local gerou melhorias opcionais com Ollama em .tic-code.');
}
async function exists(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(uri) {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=enhanceWithLocalAi.js.map