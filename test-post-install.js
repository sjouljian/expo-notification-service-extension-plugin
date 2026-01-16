// Test script to verify post_install injection works
const fs = require('fs');
const path = require('path');

// Simulate a typical Expo-generated Podfile with post_install
const samplePodfile = `require_relative '../node_modules/react-native/scripts/react_native_pods'

platform :ios, '13.0'

target 'yelo' do
  use_frameworks! :linkage => :static
  use_native_modules!
  
  pod 'Firebase/Core'
  pod 'Firebase/Messaging'
  
  post_install do |installer|
    react_native_post_install(installer)
    
    # Existing code signing fix
    installer.target_installation_results.pod_target_installation_results
      .each do |pod_name, target_installation_result|
      target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
        resource_bundle_target.build_configurations.each do |config|
          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        end
      end
    end
  end
end`;

// Write test Podfile
const testDir = path.join(__dirname, 'test-ios-postinstall');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testPodfilePath = path.join(testDir, 'Podfile');
fs.writeFileSync(testPodfilePath, samplePodfile);

console.log('✅ Created test Podfile with existing post_install at:', testPodfilePath);

// Now test the PodfileManager
const { PodfileManager } = require('./build/support/PodfileManager');

async function test() {
  try {
    console.log('\n🧪 Testing PodfileManager with post_install injection...\n');
    
    const manager = new PodfileManager(testDir);
    await manager.addPodDependencies(['Firebase/Messaging']);
    
    console.log('\n📄 Modified Podfile contents:\n');
    const modifiedContent = fs.readFileSync(testPodfilePath, 'utf-8');
    console.log(modifiedContent);
    
    // Check if modifications were successful
    const checks = {
      'NotificationServiceExtension target': modifiedContent.includes("target 'NotificationServiceExtension'"),
      'Firebase/Messaging pod': modifiedContent.includes("pod 'Firebase/Messaging'"),
      'BUILD_LIBRARY_FOR_DISTRIBUTION fix': modifiedContent.includes("BUILD_LIBRARY_FOR_DISTRIBUTION"),
      'Fix is inside post_install': modifiedContent.match(/post_install.*BUILD_LIBRARY_FOR_DISTRIBUTION.*end/s)
    };
    
    console.log('\n✅ Verification Results:\n');
    for (const [check, passed] of Object.entries(checks)) {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    }
    
    if (Object.values(checks).every(v => v)) {
      console.log('\n🎉 All checks passed! Post-install injection working correctly!');
    } else {
      console.log('\n❌ Some checks failed!');
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
  } finally {
    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log('\n🧹 Cleaned up test directory');
    } catch (e) {}
  }
}

test();

