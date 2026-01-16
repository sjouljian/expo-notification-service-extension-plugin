"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FileManager_1 = require("./FileManager");
const iosConstants_1 = require("./iosConstants");
// project `ios/OneSignalNotificationServiceExtension` directory
const entitlementsFileName = `NotificationServiceExtension.entitlements`;
const plistFileName = `NotificationServiceExtension-Info.plist`;
class NseUpdaterManager {
    constructor(iosPath) {
        this.nsePath = '';
        this.nsePath = `${iosPath}/${iosConstants_1.NSE_TARGET_NAME}`;
    }
    async updateNSEEntitlements(filtering) {
        const entitlementsFilePath = `${this.nsePath}/${entitlementsFileName}`;
        let entitlementsFile = await FileManager_1.FileManager.readFile(entitlementsFilePath);
        // App Groups are no longer used - entitlements file is now minimal
        if (filtering) {
            const filteringKey = `  <key>com.apple.developer.usernotifications.filtering</key>\n  <true/>`;
            entitlementsFile = entitlementsFile.replace('</dict>', `${filteringKey}\n</dict>`);
        }
        await FileManager_1.FileManager.writeFile(entitlementsFilePath, entitlementsFile);
    }
    async updateNSEBundleVersion(version) {
        const plistFilePath = `${this.nsePath}/${plistFileName}`;
        let plistFile = await FileManager_1.FileManager.readFile(plistFilePath);
        plistFile = plistFile.replace(iosConstants_1.BUNDLE_VERSION_TEMPLATE_REGEX, version);
        await FileManager_1.FileManager.writeFile(plistFilePath, plistFile);
    }
    async updateNSEBundleShortVersion(version) {
        const plistFilePath = `${this.nsePath}/${plistFileName}`;
        let plistFile = await FileManager_1.FileManager.readFile(plistFilePath);
        plistFile = plistFile.replace(iosConstants_1.BUNDLE_SHORT_VERSION_TEMPLATE_REGEX, version);
        await FileManager_1.FileManager.writeFile(plistFilePath, plistFile);
    }
}
exports.default = NseUpdaterManager;
