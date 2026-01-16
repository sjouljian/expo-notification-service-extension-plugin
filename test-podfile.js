// Test script to verify PodfileManager works correctly
const fs = require('fs');
const path = require('path');

// Simulate a typical Expo-generated Podfile
const samplePodfile = `require_relative '../node_modules/react-native/scripts/react_native_pods'
require_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'

platform :ios, '13.0'
install! 'cocoapods', :deterministic_uuids => false

target 'yelo' do
  use_frameworks! :linkage => :static
  
  config = use_native_modules!
  
  # Flags change depending on the env values.
  flags = get_default_flags()
  
  use_react_native!(
    :path => config[:reactNativePath],
    # to enable hermes on iOS, change \`false\` to \`true\` and then install pods
    :hermes_enabled => flags[:hermes_enabled],
    :fabric_enabled => flags[:fabric_enabled],
    # An absolute path to your application root.
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )
  
  pod 'Firebase/Core'
  pod 'Firebase/Messaging'
  
  post_install do |installer|
    react_native_post_install(installer)
  end
end`;

// Write test Podfile
const testDir = path.join(__dirname, 'test-ios');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testPodfilePath = path.join(testDir, 'Podfile');
fs.writeFileSync(testPodfilePath, samplePodfile);

console.log('✅ Created test Podfile at:', testPodfilePath);

// Now test the PodfileManager
const { PodfileManager } = require('./build/support/PodfileManager');
const { Log } = require('./build/support/Log');

async function test() {
  try {
    console.log('\n🧪 Testing PodfileManager...\n');
    
    const manager = new PodfileManager(testDir);
    await manager.addPodDependencies(['Firebase/Messaging']);
    
    console.log('\n📄 Modified Podfile contents:\n');
    const modifiedContent = fs.readFileSync(testPodfilePath, 'utf-8');
    console.log(modifiedContent);
    
    // Check if NotificationServiceExtension target was added
    if (modifiedContent.includes("target 'NotificationServiceExtension'")) {
      console.log('\n✅ SUCCESS: NotificationServiceExtension target was added!');
    } else {
      console.log('\n❌ FAIL: NotificationServiceExtension target was NOT added!');
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
  }
}

test();

