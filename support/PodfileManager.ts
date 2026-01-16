import * as fs from 'fs';
import * as path from 'path';
import { Log } from './Log';
import { NSE_TARGET_NAME } from './iosConstants';

export class PodfileManager {
  private podfilePath: string;

  constructor(iosPath: string) {
    this.podfilePath = path.join(iosPath, 'Podfile');
  }

  /**
   * Adds pod dependencies to the NotificationServiceExtension target in the Podfile
   * @param podDependencies Array of pod dependency strings (e.g., ["Firebase/Messaging"])
   */
  async addPodDependencies(podDependencies?: string[]): Promise<void> {
    Log.log(`[PodfileManager] Called with podDependencies: ${JSON.stringify(podDependencies)}`);
    
    if (!podDependencies || podDependencies.length === 0) {
      Log.log('[PodfileManager] No pod dependencies specified for NotificationServiceExtension target.');
      return;
    }

    Log.log(`[PodfileManager] Looking for Podfile at: ${this.podfilePath}`);
    
    if (!fs.existsSync(this.podfilePath)) {
      Log.error(`[PodfileManager] Podfile not found at ${this.podfilePath}`);
      return;
    }
    
    Log.log(`[PodfileManager] Podfile found! Reading contents...`);

    try {
      let podfileContent = fs.readFileSync(this.podfilePath, 'utf-8');

      // Check if NSE target already exists in Podfile
      const nseTargetRegex = new RegExp(`target\\s+['"]${NSE_TARGET_NAME}['"]`, 'i');
      
      if (nseTargetRegex.test(podfileContent)) {
        Log.log(`[PodfileManager] ${NSE_TARGET_NAME} target already exists in Podfile. Skipping pod dependency injection.`);
        return;
      }
      
      Log.log(`[PodfileManager] NSE target not found in Podfile. Adding it now...`);

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

      // Extension target needs special configuration to avoid duplicate framework builds
      // When using static frameworks, we must either:
      // 1. Make extension a nested target (inherits all pods)
      // 2. Use :linkage => :dynamic
      // 3. Configure build settings to share frameworks
      // We'll use approach #3 - standalone target with only required pods
      const nseTargetBlock = `
target '${NSE_TARGET_NAME}' do
${podLines}
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
            } else {
              // This 'end' closes the target itself
              insertIndex = i + 1;
              targetDepth = 0;
            }
          }
        }
      }

      if (insertIndex === -1) {
        // If we can't find a good insertion point, append to the end
        Log.log('[PodfileManager] Could not find main target block, appending NSE target to end of Podfile.');
        podfileContent += '\n' + nseTargetBlock;
      } else {
        // Insert the NSE target block after the main target
        Log.log(`[PodfileManager] Inserting NSE target at line ${insertIndex}`);
        lines.splice(insertIndex, 0, nseTargetBlock);
        podfileContent = lines.join('\n');
      }

      Log.log(`[PodfileManager] Writing updated Podfile to: ${this.podfilePath}`);
      fs.writeFileSync(this.podfilePath, podfileContent, 'utf-8');
      Log.log(`✅ [PodfileManager] Successfully added ${podDependencies.length} pod dependencies to ${NSE_TARGET_NAME} target in Podfile.`);
      Log.log(`[PodfileManager] Added target block:\n${nseTargetBlock}`);

      // Add post_install hook to fix duplicate framework builds
      // This modifies the file again to inject into existing post_install
      this.addPostInstallHook();
    } catch (error) {
      Log.error(`Failed to modify Podfile: ${error}`);
      throw error;
    }
  }

  /**
   * Adds code to the existing post_install hook to fix duplicate framework builds
   * This prevents "Multiple commands produce" errors with static frameworks
   */
  private addPostInstallHook(): void {
    Log.log('[PodfileManager] Adding post_install hook to fix duplicate framework builds');

    // Read the Podfile again (it was just written)
    const podfileContent = fs.readFileSync(this.podfilePath, 'utf-8');

    const postInstallFix = `
    # Fix duplicate framework builds and remove React Native from extension (added by expo-notification-service-extension-plugin)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Build frameworks once and share them across targets
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
        
        # Exclude React Native and app-only dependencies from NotificationServiceExtension
        if target.name.include?('NotificationServiceExtension') || target.name.include?('Pods-NotificationServiceExtension')
          config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
        end
      end
    end
    
    # Remove React Native pods from extension target dependencies
    installer.pods_project.targets.each do |target|
      if target.name == 'Pods-NotificationServiceExtension'
        target.dependencies.delete_if do |dependency|
          dependency.name.start_with?('React') || 
          dependency.name.start_with?('RN') || 
          dependency.name.include?('react-native') ||
          dependency.name == 'rn-fetch-blob' ||
          dependency.name.start_with?('Yoga') ||
          dependency.name.start_with?('FBReact')
        end
      end
    end`;

    // Check if there's already a post_install block
    const postInstallRegex = /post_install\s+do\s+\|installer\|/;
    
    if (postInstallRegex.test(podfileContent)) {
      Log.log('[PodfileManager] Found existing post_install block, injecting framework fix');
      
      // Find the end of the post_install block and inject before the last 'end'
      const lines = podfileContent.split('\n');
      let postInstallStart = -1;
      let postInstallEnd = -1;
      let depth = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (postInstallRegex.test(line)) {
          postInstallStart = i;
          depth = 1;
          continue;
        }
        
        if (postInstallStart !== -1 && depth > 0) {
          // Count do/end pairs
          if (line.includes(' do') || line.endsWith(' do') || line.trim() === 'do') {
            depth++;
          }
          if (line.trim() === 'end' || line.trim().startsWith('end ')) {
            depth--;
            if (depth === 0) {
              postInstallEnd = i;
              break;
            }
          }
        }
      }
      
      if (postInstallEnd !== -1) {
        // Check if our fix is already there
        const postInstallContent = lines.slice(postInstallStart, postInstallEnd).join('\n');
        if (postInstallContent.includes('BUILD_LIBRARY_FOR_DISTRIBUTION')) {
          Log.log('[PodfileManager] Framework fix already present in post_install');
          return;
        }
        
        // Insert before the closing 'end' of post_install
        lines.splice(postInstallEnd, 0, postInstallFix);
        const newContent = lines.join('\n');
        fs.writeFileSync(this.podfilePath, newContent, 'utf-8');
        Log.log('[PodfileManager] ✅ Injected framework fix into existing post_install');
      } else {
        Log.log('[PodfileManager] ⚠️ Could not find end of post_install block');
      }
    } else {
      Log.log('[PodfileManager] No existing post_install found, plugin post_install will be added at end');
      // This shouldn't happen in Expo projects, but handle it anyway
      const newPostInstall = `
post_install do |installer|
  ${postInstallFix}
end
`;
      fs.appendFileSync(this.podfilePath, newPostInstall, 'utf-8');
      Log.log('[PodfileManager] ✅ Added new post_install block with framework fix');
    }
  }
}

