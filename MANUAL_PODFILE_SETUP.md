# Manual Podfile Setup for Static Frameworks

## Problem: "Multiple commands produce" Error with GoogleUtilities

If you're getting errors like:
```
❌ error: Multiple commands produce '/path/to/GoogleUtilities.framework'
```

This is a **CocoaPods limitation** when using `use_frameworks! :linkage => :static` with multiple targets that share dependencies.

## Solution: Manual Podfile Configuration

### Option 1: Use Script Phases (Recommended)

After running `expo prebuild`, **manually edit** your `ios/Podfile` to add this at the very end:

```ruby
# At the end of your Podfile, AFTER all targets

post_install do |installer|
  # ... your existing post_install code (keep it) ...
  
  # Fix duplicate framework builds for extension targets
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Ensure frameworks are built once and shared
      config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
      
      # For extension targets, don't embed frameworks
      if target.name.include?('NotificationServiceExtension')
        config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
      end
    end
  end
end
```

### Option 2: Change to Dynamic Frameworks

In your main app target, change from:
```ruby
use_frameworks! :linkage => :static
```

To:
```ruby
use_frameworks! :linkage => :dynamic
```

**Note:** This may require changes to your build configuration and could affect app size.

### Option 3: Deduplicate Build Phases (Advanced)

Add this script to your Podfile's `post_install`:

```ruby
post_install do |installer|
  # ... existing post_install code ...
  
  # Remove duplicate framework references
  installer.pods_project.targets.each do |target|
    if target.name == 'Pods-NotificationServiceExtension'
      puts "Configuring #{target.name} to share frameworks with main app"
      
      target.build_configurations.each do |config|
        # Use frameworks from main app
        config.build_settings['FRAMEWORK_SEARCH_PATHS'] ||= ['$(inherited)']
        config.build_settings['FRAMEWORK_SEARCH_PATHS'] << '$(SRCROOT)/../Pods-yelo'
      end
    end
  end
end
```

### Option 4: Simplify to Single Framework Build

The **cleanest solution** that matches your working Podfile:

1. Ensure your Podfile looks like this:

```ruby
require File.join(File.dirname(`node --print "require.resolve('expo/package.json')"`), "scripts/autolinking")
require File.join(File.dirname(`node --print "require.resolve('react-native/package.json')"`), "scripts/react_native_pods")

platform :ios, '15.1'
install! 'cocoapods', :deterministic_uuids => false

prepare_react_native_project!
use_frameworks! :linkage => :static  # ← At workspace level

target 'YourApp' do
  use_expo_modules!
  config = use_native_modules!
  
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
    :app_path => "#{Pod::Config.instance.installation_root}/..",
  )

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
    
    # Prevent code signing for resource bundles
    installer.target_installation_results.pod_target_installation_results
      .each do |pod_name, target_installation_result|
      target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
        resource_bundle_target.build_configurations.each do |config|
          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        end
      end
    end
  end
end

target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
  # GoogleUtilities will be shared from main target
end
```

2. After running `expo prebuild`, **check your Podfile** and ensure:
   - `use_frameworks!` is at the **workspace level** (not inside a target)
   - Extension target has no `use_expo_modules!` or `use_native_modules!`
   - The `post_install` hook includes the resource bundle code signing fix

3. Clean build:
```bash
cd ios
rm -rf Pods Podfile.lock
pod install --repo-update
cd ..
```

## Why This Happens

When using `use_frameworks! :linkage => :static`:
- CocoaPods builds each pod as a **static framework**
- Each target tries to build its own copy of shared dependencies
- Xcode sees multiple commands trying to create the same output
- Build fails with "Multiple commands produce" error

## Prevention

The plugin now automatically:
- ✅ Creates isolated extension target
- ✅ Adds only required pods
- ✅ Sets `APPLICATION_EXTENSION_API_ONLY`
- ✅ Configures proper build settings

But due to CocoaPods limitations, you **must** manually configure the `post_install` hook as shown above to handle static framework deduplication.

## Testing Your Setup

After making Podfile changes:

```bash
cd ios
rm -rf Pods Podfile.lock DerivedData
pod install
cd ..
npx expo run:ios
```

Look for:
- ✅ No "Multiple commands produce" errors
- ✅ Both targets build successfully
- ✅ Extension can use Firebase APIs

## If Still Not Working

1. Try Option 2 (dynamic frameworks)
2. Or consider using Xcode's built-in manual pod configuration
3. Contact Firebase support for CocoaPods + app extensions guidance

This is a known limitation of CocoaPods with static frameworks and multiple targets.

