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
exports.getOutputChannel = getOutputChannel;
exports.showOutputChannel = showOutputChannel;
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
const vscode = __importStar(require("vscode"));
const CHANNEL_NAME = 'TIC Coder Lite';
let channel;
function getOutputChannel() {
    channel ??= vscode.window.createOutputChannel(CHANNEL_NAME);
    return channel;
}
function showOutputChannel(preserveFocus = true) {
    getOutputChannel().show(preserveFocus);
}
function logInfo(message) {
    log('INFO', message);
}
function logWarn(message) {
    log('WARN', message);
}
function logError(message, error) {
    const detail = error instanceof Error ? ` ${error.message}` : error ? ` ${String(error)}` : '';
    log('ERROR', `${message}${detail}`);
}
function log(level, message) {
    getOutputChannel().appendLine(`[${new Date().toISOString()}] [${level}] ${message}`);
}
//# sourceMappingURL=outputChannel.js.map