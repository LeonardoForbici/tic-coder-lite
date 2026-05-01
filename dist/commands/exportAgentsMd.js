"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportAgentsMd = exportAgentsMd;
const exportForEngines_1 = require("../reversa-adapter/exportForEngines");
async function exportAgentsMd(context) {
    await (0, exportForEngines_1.exportForEngineCommand)(context, 'codex');
}
//# sourceMappingURL=exportAgentsMd.js.map