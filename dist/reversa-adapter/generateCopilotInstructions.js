"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCopilotInstructions = generateCopilotInstructions;
const generateAgentsMd_1 = require("./generateAgentsMd");
function generateCopilotInstructions(summary) {
    return (0, generateAgentsMd_1.baseEngineContext)('GitHub Copilot', '.github/copilot-instructions.md', summary, 'Use these instructions as repository context for suggestions, edits, and chat answers.');
}
//# sourceMappingURL=generateCopilotInstructions.js.map