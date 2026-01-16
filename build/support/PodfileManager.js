"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PodfileManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Log_1 = require("./Log");
const iosConstants_1 = require("./iosConstants");
class PodfileManager {
    constructor(iosPath) {
        this.podfilePath = path.join(iosPath, 'Podfile');
    }
    /**
     * Adds pod dependencies to the NotificationServiceExtension target in the Podfile
     * @param podDependencies Array of pod dependency strings (e.g., ["Firebase/Messaging"])
     */
    async addPodDependencies(podDependencies) {
        Log_1.Log.log(`[PodfileManager] Called with podDependencies: ${JSON.stringify(podDependencies)}`);
        if (!podDependencies || podDependencies.length === 0) {
            Log_1.Log.log('[PodfileManager] No pod dependencies specified for NotificationServiceExtension target.');
            return;
        }
        Log_1.Log.log(`[PodfileManager] Looking for Podfile at: ${this.podfilePath}`);
        if (!fs.existsSync(this.podfilePath)) {
            Log_1.Log.error(`[PodfileManager] Podfile not found at ${this.podfilePath}`);
            return;
        }
        Log_1.Log.log(`[PodfileManager] Podfile found! Reading contents...`);
        try {
            let podfileContent = fs.readFileSync(this.podfilePath, 'utf-8');
            // Check if NSE target already exists in Podfile
            const nseTargetRegex = new RegExp(`target\\s+['"]${iosConstants_1.NSE_TARGET_NAME}['"]`, 'i');
            if (nseTargetRegex.test(podfileContent)) {
                Log_1.Log.log(`[PodfileManager] ${iosConstants_1.NSE_TARGET_NAME} target already exists in Podfile. Skipping pod dependency injection.`);
                return;
            }
            Log_1.Log.log(`[PodfileManager] NSE target not found in Podfile. Adding it now...`);
            // Create the NSE target block with pod dependencies
            const podLines = podDependencies.map(dep => {
                // Normalize the dependency format
                const trimmed = dep.trim();
                if (trimmed.startsWith('pod ')) {
                    return `  ${trimmed}`;
                }
                // Handle both quoted and unquoted formats
                if (trimmed.includes("'") || trimmed.includes('"')) {
                    return `  pod ${trimmed}`;
                }
                return `  pod '${trimmed}'`;
            }).join('\n');
            // Check if main target uses use_frameworks
            const usesFrameworks = podfileContent.includes('use_frameworks!');
            const frameworksLine = usesFrameworks ? '  use_frameworks! :linkage => :static\n' : '';
            // Extension target should NOT use use_native_modules! or inherit React Native dependencies
            const nseTargetBlock = `
# NotificationServiceExtension target - isolated from main app dependencies
# This target should only include the minimal pods needed for the extension
target '${iosConstants_1.NSE_TARGET_NAME}' do
${frameworksLine}${podLines}
end
`;
            // Find the best insertion point - after the main app target's 'end'
            const lines = podfileContent.split('\n');
            let insertIndex = -1;
            let targetDepth = 0;
            let blockDepth = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                // Track when we enter a target block
                if (line.match(/^target\s+/)) {
                    targetDepth = 1;
                    blockDepth = 0;
                    continue;
                }
                // If we're in a target, track all do/end pairs
                if (targetDepth > 0) {
                    // Count 'do' keywords (for blocks like post_install do)
                    if (line.includes(' do') || line.endsWith(' do') || line === 'do') {
                        blockDepth++;
                    }
                    // Count 'end' keywords
                    if (line === 'end' || line.startsWith('end ')) {
                        if (blockDepth > 0) {
                            // This 'end' closes a nested block (like post_install)
                            blockDepth--;
                        }
                        else {
                            // This 'end' closes the target itself
                            insertIndex = i + 1;
                            targetDepth = 0;
                        }
                    }
                }
            }
            if (insertIndex === -1) {
                // If we can't find a good insertion point, append to the end
                Log_1.Log.log('[PodfileManager] Could not find main target block, appending NSE target to end of Podfile.');
                podfileContent += '\n' + nseTargetBlock;
            }
            else {
                // Insert the NSE target block after the main target
                Log_1.Log.log(`[PodfileManager] Inserting NSE target at line ${insertIndex}`);
                lines.splice(insertIndex, 0, nseTargetBlock);
                podfileContent = lines.join('\n');
            }
            Log_1.Log.log(`[PodfileManager] Writing updated Podfile to: ${this.podfilePath}`);
            // Note: We don't add a post_install hook here because:
            // 1. The main app target usually already has one
            // 2. The extension target is isolated and only includes specified pods
            // 3. APPLICATION_EXTENSION_API_ONLY is set in Xcode build settings
            Log_1.Log.log('[PodfileManager] Extension target configured without React Native dependencies');
            fs.writeFileSync(this.podfilePath, podfileContent, 'utf-8');
            Log_1.Log.log(`✅ [PodfileManager] Successfully added ${podDependencies.length} pod dependencies to ${iosConstants_1.NSE_TARGET_NAME} target in Podfile.`);
            Log_1.Log.log(`[PodfileManager] Added target block:\n${nseTargetBlock}`);
        }
        catch (error) {
            Log_1.Log.error(`Failed to modify Podfile: ${error}`);
            throw error;
        }
    }
}
exports.PodfileManager = PodfileManager;
