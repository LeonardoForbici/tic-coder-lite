"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCursorRules = generateCursorRules;
const generateAgentsMd_1 = require("./generateAgentsMd");
function generateCursorRules(summary) {
    return (0, generateAgentsMd_1.baseEngineContext)('Cursor', '.cursorrules', summary, 'Apply these project rules when proposing edits or generating code in Cursor.');
}
//# sourceMappingURL=generateCursorRules.js.map