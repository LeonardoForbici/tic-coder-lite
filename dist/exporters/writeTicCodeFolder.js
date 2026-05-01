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
exports.writeTicCodeFolder = writeTicCodeFolder;
const vscode = __importStar(require("vscode"));
const buildGraph_1 = require("../scanner/buildGraph");
const detectStack_1 = require("../scanner/detectStack");
const detectRisks_1 = require("../scanner/detectRisks");
const generateAgentContextMd_1 = require("./generateAgentContextMd");
const generateConfidenceReportMd_1 = require("./generateConfidenceReportMd");
const generateQuestionsMd_1 = require("./generateQuestionsMd");
async function writeTicCodeFolder(root, summary) {
    const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
    const artifacts = {
        scanJson: vscode.Uri.joinPath(ticCodeDir, 'scan.json'),
        modulesJson: vscode.Uri.joinPath(ticCodeDir, 'modules.json'),
        inventoryMd: vscode.Uri.joinPath(ticCodeDir, 'inventory.md'),
        graphJson: vscode.Uri.joinPath(ticCodeDir, 'graph.json'),
        architectureMd: vscode.Uri.joinPath(ticCodeDir, 'architecture.md'),
        risksJson: vscode.Uri.joinPath(ticCodeDir, 'risks.json'),
        risksMd: vscode.Uri.joinPath(ticCodeDir, 'risks.md'),
        agentContextMd: vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'),
        confidenceReportMd: vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'),
        questionsMd: vscode.Uri.joinPath(ticCodeDir, 'questions.md')
    };
    await vscode.workspace.fs.createDirectory(ticCodeDir);
    await writeText(artifacts.scanJson, `${JSON.stringify(summary.scan, null, 2)}\n`);
    await writeText(artifacts.modulesJson, `${JSON.stringify(summary.inventory, null, 2)}\n`);
    await writeText(artifacts.inventoryMd, (0, detectStack_1.renderInventoryMarkdown)(summary.inventory, summary.scan));
    await writeText(artifacts.graphJson, `${JSON.stringify(summary.graph, null, 2)}\n`);
    await writeText(artifacts.architectureMd, (0, buildGraph_1.renderArchitectureMarkdown)(summary.graph, summary.inventory));
    await writeText(artifacts.risksJson, `${JSON.stringify(summary.risks, null, 2)}\n`);
    await writeText(artifacts.risksMd, (0, detectRisks_1.renderRisksMarkdown)(summary.risks));
    await writeText(artifacts.agentContextMd, (0, generateAgentContextMd_1.generateAgentContextMd)(summary));
    await writeText(artifacts.confidenceReportMd, (0, generateConfidenceReportMd_1.generateConfidenceReportMd)(summary));
    await writeText(artifacts.questionsMd, (0, generateQuestionsMd_1.generateQuestionsMd)(summary));
    return artifacts;
}
async function writeText(uri, content) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}
//# sourceMappingURL=writeTicCodeFolder.js.map