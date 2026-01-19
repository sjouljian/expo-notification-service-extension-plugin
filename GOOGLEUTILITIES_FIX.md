# GoogleUtilities "Multiple commands produce" Error - Complete Fix

## The Error

```
❌ error: Multiple commands produce '.../GoogleUtilities.framework'
❌ error: Multiple commands produce '.../GoogleUtilities_Privacy.bundle'
```

## Root Cause

When using `use_frameworks! :linkage => :static` with multiple targets that share Firebase dependencies:

1. Main app target builds GoogleUtilities
2. Extension target also tries to build GoogleUtilities
3. Xcode sees duplicate build commands → error

## The Plugin's Automatic Fix

The plugin now applies **multiple strategies** to prevent this:

### 1. `inherit! :search_paths` in Extension Target

```ruby
target 'NotificationServiceExtension' do
  inherit! :search_paths  # ← Prevents building separate frameworks
  pod 'Firebase/Messaging'
end
```

This tells the extension to **use** frameworks built by the main target, not build its own.

### 2. `BUILD_LIBRARY_FOR_DISTRIBUTION = 'YES'`

Applied to all pod targets - allows frameworks to be shared across targets.

### 3. `SKIP_INSTALL = 'YES'` for Google Pods

Tells Xcode not to install Google frameworks separately for each target.

### 4. Additional Build Settings

- `COMBINE_HIDPI_IMAGES = 'NO'` - Prevents resource bundle conflicts
- `ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = 'NO'` - Extension shouldn't embed libraries

## Solution

```bash
# 1. Clean everything
rm -rf ios/Pods ios/Podfile.lock ios/build

# 2. Rebuild
npx expo prebuild --clean

# 3. Install pods with verbose output
cd ios
pod install --verbose
cd ..

# 4. Build
npx expo run:ios
```

## Verify Your Podfile

After `expo prebuild`, your `ios/Podfile` should look like:

```ruby
require File.join(File.dirname(`node --print "require.resolve('expo/package.json')"`), "scripts/autolinking")

platform :ios, '15.1'
use_frameworks! :linkage => :static  # ← At workspace level is OK

target 'YourApp' do
  use_expo_modules!
  use_native_modules!
  # ... React Native and Firebase
  
  post_install do |installer|
    # ... existing post_install code ...
    
    # Plugin adds these fixes automatically:
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
        config.build_settings['COMBINE_HIDPI_IMAGES'] = 'NO'
      end
    end
    
    # Configure extension
    installer.pods_project.targets.each do |target|
      if target.name == 'Pods-NotificationServiceExtension'
        target.build_configurations.each do |config|
          config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
          config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
        end
      end
    end
    
    # Prevent duplicate Google framework builds
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.pod_targets.select { |p| p.pod_name.start_with?('Google') }.each do |pod_target|
        pod_target.build_configurations.each do |config|
          config.build_settings['SKIP_INSTALL'] = 'YES'
        end
      end
    end
  end
end

# Extension target - separate and isolated
target 'NotificationServiceExtension' do
  inherit! :search_paths  # ← KEY: Don't build separate frameworks
  pod 'Firebase/Messaging'
end
```

## Manual Fix (If Automatic Doesn't Work)

If you still see the error after the automatic fix:

### Option 1: Change to Dynamic Frameworks

In your `ios/Podfile`, change:

```ruby
use_frameworks! :linkage => :static
```

To:

```ruby
use_frameworks! :linkage => :dynamic
```

Then:
```bash
cd ios
pod install
cd ..
```

### Option 2: Don't Use `use_frameworks!` for Extension

Make sure the extension target does NOT have its own `use_frameworks!` call:

```ruby
# WRONG ❌
target 'NotificationServiceExtension' do
  use_frameworks! :linkage => :static  # ← Remove this!
  pod 'Firebase/Messaging'
end

# RIGHT ✅
target 'NotificationServiceExtension' do
  inherit! :search_paths
  pod 'Firebase/Messaging'
end
```

### Option 3: Use Abstract Target Pattern

```ruby
abstract_target 'Common' do
  platform :ios, '15.1'
  use_frameworks! :linkage => :static
  
  target 'YourApp' do
    use_expo_modules!
    use_native_modules!
  end
  
  target 'NotificationServiceExtension' do
    inherit! :search_paths
    pod 'Firebase/Messaging'
  end
end
```

## Check if Fix is Applied

During `pod install`, you should see:

```
Configuring NotificationServiceExtension as App Extension...
```

And in the Pods project build settings:
- `BUILD_LIBRARY_FOR_DISTRIBUTION` = YES (all targets)
- `SKIP_INSTALL` = YES (Google pods)
- `ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES` = NO (extension target)

## Still Not Working?

1. **Check for nested targets** - Extension must NOT be inside main target
2. **Clear DerivedData**:
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```
3. **Clean build folder** in Xcode: Product → Clean Build Folder (Cmd+Shift+K)
4. **Delete and reinstall pods**:
   ```bash
   cd ios
   rm -rf Pods Podfile.lock
   pod deintegrate
   pod install
   cd ..
   ```

## Why This Happens

With static frameworks (`use_frameworks! :linkage => :static`):
- Each target wants to build its own copy of shared dependencies
- GoogleUtilities is needed by Firebase/Messaging (extension) AND the main app
- Without `inherit! :search_paths`, CocoaPods tries to build it twice
- Xcode sees two commands trying to create the same output file → error

The fix ensures GoogleUtilities is built **once** by the main app, and the extension just **uses** that pre-built framework via search paths.

