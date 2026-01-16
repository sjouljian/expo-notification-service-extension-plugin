"use strict";
/**
 * Expo config plugin for copying NSE to XCode
 */
Object.defineProperty(exports, "__esModule", { value: true });
const withServiceExtensionIos_1 = require("./withServiceExtensionIos");
const helpers_1 = require("../support/helpers");
const withServiceExtension = (config, props) => {
    // if props are undefined, throw error
    if (!props) {
        throw new Error('You are trying to use the Expo NSE plugin without any props. Property "mode" is required. Please see https://github.com/nikwebr/expo-notification-service-extension-plugin for more info.');
    }
    (0, helpers_1.validatePluginProps)(props);
    config = (0, withServiceExtensionIos_1.withServiceExtensionIos)(config, props);
    return config;
};
exports.default = withServiceExtension;
