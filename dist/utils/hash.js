"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha1 = sha1;
const node_crypto_1 = require("node:crypto");
function sha1(value) {
    return (0, node_crypto_1.createHash)('sha1').update(value).digest('hex');
}
//# sourceMappingURL=hash.js.map