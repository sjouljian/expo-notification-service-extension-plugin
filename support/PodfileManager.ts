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
    if (!podDependencies || podDependencies.length === 0) {
      Log.log('No pod dependencies specified for NotificationServiceExtension target.');
      return;
    }

    if (!fs.existsSync(this.podfilePath)) {
      Log.error(`Podfile not found at ${this.podfilePath}`);
      return;
    }

    try {
      let podfileContent = fs.readFileSync(this.podfilePath, 'utf-8');

      // Check if NSE target already exists in Podfile
      const nseTargetRegex = new RegExp(`target\\s+['"]${NSE_TARGET_NAME}['"]`, 'i');
      
      if (nseTargetRegex.test(podfileContent)) {
        Log.log(`${NSE_TARGET_NAME} target already exists in Podfile. Skipping pod dependency injection.`);
        return;
      }

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

      const nseTargetBlock = `
target '${NSE_TARGET_NAME}' do
${podLines}
end
`;

      // Find the best insertion point - after the main app target's 'end'
      const lines = podfileContent.split('\n');
      let insertIndex = -1;
      let targetDepth = 0;
      let inTarget = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Track when we enter a target block
        if (line.match(/^target\s+/)) {
          inTarget = true;
          targetDepth++;
        }
        
        // Track when we exit a target block
        if (line === 'end' && inTarget) {
          targetDepth--;
          if (targetDepth === 0) {
            insertIndex = i + 1;
            inTarget = false;
          }
        }
      }

      if (insertIndex === -1) {
        // If we can't find a good insertion point, append to the end
        Log.log('Could not find main target block, appending NSE target to end of Podfile.');
        podfileContent += '\n' + nseTargetBlock;
      } else {
        // Insert the NSE target block after the main target
        lines.splice(insertIndex, 0, nseTargetBlock);
        podfileContent = lines.join('\n');
      }

      fs.writeFileSync(this.podfilePath, podfileContent, 'utf-8');
      Log.log(`✅ Successfully added ${podDependencies.length} pod dependencies to ${NSE_TARGET_NAME} target in Podfile.`);
    } catch (error) {
      Log.error(`Failed to modify Podfile: ${error}`);
      throw error;
    }
  }
}

