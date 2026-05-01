"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClaudeMd = generateClaudeMd;
const generateAgentsMd_1 = require("./generateAgentsMd");
function generateClaudeMd(summary) {
    return (0, generateAgentsMd_1.baseEngineContext)('Claude Code', 'CLAUDE.md', summary, 'When the user asks you to modify this project, inspect the TIC Coder Lite context files first.');
}
//# sourceMappingURL=generateClaudeMd.js.map