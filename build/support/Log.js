"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
class Log {
    static log(str) {
        console.log(`\texpo-notification-service-extension-plugin: ${str}`);
    }
    static error(str) {
        console.error(`\texpo-notification-service-extension-plugin: ${str}`);
    }
}
exports.Log = Log;
