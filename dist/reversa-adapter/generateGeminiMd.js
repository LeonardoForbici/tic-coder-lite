"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGeminiMd = generateGeminiMd;
const generateAgentsMd_1 = require("./generateAgentsMd");
function generateGeminiMd(summary) {
    return (0, generateAgentsMd_1.baseEngineContext)('Gemini CLI', 'GEMINI.md', summary, 'Use this local context before answering or modifying files through Gemini CLI.');
}
//# sourceMappingURL=generateGeminiMd.js.map