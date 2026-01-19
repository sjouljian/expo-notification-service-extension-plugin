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

      // Create extension target - no GoogleUtilities needed, it will be inherited
      // Simple, isolated, no use_expo_modules! or use_native_modules!
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

      // Now inject the post_install hook fix to prevent duplicate framework builds
      podfileContent = this.injectPostInstallHook(podfileContent);

      Log.log(`[PodfileManager] Writing updated Podfile to: ${this.podfilePath}`);
      fs.writeFileSync(this.podfilePath, podfileContent, 'utf-8');
      Log.log(`✅ [PodfileManager] Successfully added ${podDependencies.length} pod dependencies to ${NSE_TARGET_NAME} target in Podfile.`);
      Log.log(`[PodfileManager] Added target block:\n${nseTargetBlock}`);
    } catch (error) {
      Log.error(`Failed to modify Podfile: ${error}`);
      throw error;
    }
  }

  /**
   * Injects or updates the post_install hook to fix duplicate framework builds
   * This prevents "Multiple commands produce" errors with GoogleUtilities and other shared frameworks
   */
  private injectPostInstallHook(podfileContent: string): string {
    const fixCode = `
    # Fix for duplicate framework builds when using extension targets with shared dependencies
    # This prevents "Multiple commands produce" errors for GoogleUtilities and other frameworks
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Ensure frameworks are built once and can be distributed to multiple targets
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
      end
    end
    
    # Prevent React Native pods from being linked to the NotificationServiceExtension
    # This fixes "'sharedApplication' is unavailable: not available on iOS (App Extension)" errors
    installer.pods_project.targets.each do |target|
      if target.name == 'Pods-${NSE_TARGET_NAME}'
        target.build_configurations.each do |config|
          config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
        end
      end
    end
    
    # Remove React Native dependencies from the extension target
    extension_target = installer.pods_project.targets.find { |target| target.name == 'Pods-${NSE_TARGET_NAME}' }
    if extension_target
      extension_target.dependencies.delete_if do |dependency|
        dependency_name = dependency.name
        # Remove React Native, Expo, and other app-only dependencies
        dependency_name.start_with?('React') || 
        dependency_name.start_with?('Expo') ||
        dependency_name.start_with?('RN') ||
        ['Yoga', 'DoubleConversion', 'glog', 'Flipper', 'FlipperKit'].include?(dependency_name)
      end
    end`.replace(/\$\{NSE_TARGET_NAME\}/g, NSE_TARGET_NAME);

    // Check if there's already a post_install block
    const postInstallRegex = /post_install\s+do\s+\|([^|]+)\|/;
    const match = podfileContent.match(postInstallRegex);

    if (match) {
      // post_install exists - check if our fix is already there
      if (podfileContent.includes('BUILD_LIBRARY_FOR_DISTRIBUTION')) {
        Log.log('[PodfileManager] BUILD_LIBRARY_FOR_DISTRIBUTION already present in post_install hook.');
        return podfileContent;
      }

      // Find the end of the post_install block and inject our code before it
      const lines = podfileContent.split('\n');
      let postInstallDepth = 0;
      let inPostInstall = false;
      let injectionIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (postInstallRegex.test(line)) {
          inPostInstall = true;
          postInstallDepth = 0;
          continue;
        }

        if (inPostInstall) {
          // Count nested 'do' blocks
          if (line.match(/\bdo\b/)) {
            postInstallDepth++;
          }
          
          // Count 'end' keywords
          if (line.trim() === 'end' || line.trim().startsWith('end ')) {
            if (postInstallDepth > 0) {
              postInstallDepth--;
            } else {
              // This is the 'end' that closes post_install
              injectionIndex = i;
              break;
            }
          }
        }
      }

      if (injectionIndex !== -1) {
        Log.log(`[PodfileManager] Injecting BUILD_LIBRARY_FOR_DISTRIBUTION fix into existing post_install hook at line ${injectionIndex}`);
        lines.splice(injectionIndex, 0, fixCode);
        return lines.join('\n');
      }
    }

    // No post_install found - create one at the end of the file
    Log.log('[PodfileManager] No post_install hook found. Creating new post_install hook with BUILD_LIBRARY_FOR_DISTRIBUTION fix.');
    const newPostInstall = `

post_install do |installer|${fixCode}
end
`;
    
    return podfileContent + newPostInstall;
  }
}

