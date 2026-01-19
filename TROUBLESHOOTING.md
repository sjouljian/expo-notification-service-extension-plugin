# Troubleshooting Guide

## Error: Multiple commands produce 'GoogleUtilities.framework'

### Problem
```
❌ error: Multiple commands produce '/path/to/GoogleUtilities.framework'
```

### Root Cause
When using `use_frameworks! :linkage => :static` with multiple targets that share dependencies (like Firebase/GoogleUtilities), CocoaPods tries to build separate static frameworks for each target, causing duplicate build commands.

### Automatic Fix (v1.1.0+)

**This plugin now automatically fixes this issue!** When you configure `podDependencies` in your plugin config, it will:

1. Create a separate `NotificationServiceExtension` target in your Podfile
2. Add your specified pod dependencies
3. **Automatically inject** `BUILD_LIBRARY_FOR_DISTRIBUTION = 'YES'` into the `post_install` hook
4. This setting tells Xcode to build frameworks once and share them across targets

### Solution

Simply run:
```bash
npx expo prebuild --clean
cd ios
pod install
cd ..
```

The plugin will automatically generate a Podfile with the fix applied.

### Expected Podfile Structure

After running `expo prebuild`, your `ios/Podfile` should look like:

```ruby
target 'YourApp' do
  use_frameworks! :linkage => :static
  use_expo_modules!
  use_native_modules!
  # ... other pods
end

target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
  # Simple, standalone - no use_frameworks!, no use_expo_modules!
end

post_install do |installer|
  # ... existing post_install code ...
  
  # Plugin automatically adds this fix:
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
    end
  end
end
```

### Manual Fix (If Automatic Fix Doesn't Work)

If you're still seeing the error after `npx expo prebuild --clean`, you can manually verify or add the `BUILD_LIBRARY_FOR_DISTRIBUTION` setting in your Podfile's `post_install` hook as shown above.

---

## Error: 'sharedApplication' is unavailable: not available on iOS (App Extension)

### Problem
You're seeing errors like:
```
❌ 'sharedApplication' is unavailable: not available on iOS (App Extension)
```

From files like:
- `RCTScrollView.m`
- `RNFetchBlobRequest.m`  
- Other React Native or third-party native modules

### Root Cause
React Native libraries are being compiled/linked to the NotificationServiceExtension target, but app extensions cannot use `UIApplication.sharedApplication` and other app-only APIs.

### Automatic Fix (v1.1.0+)

**This plugin now automatically fixes this issue!** When you configure `podDependencies`, it will:

1. Create an isolated `NotificationServiceExtension` target (not nested)
2. Set `APPLICATION_EXTENSION_API_ONLY = 'YES'` for the extension
3. **Automatically remove** React Native, Expo, and app-only dependencies from the extension
4. Only link the pods you specify in `podDependencies` (e.g., Firebase/Messaging)

### Solution: Clean Rebuild

Simply run:
```bash
npx expo prebuild --clean
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

The plugin will automatically generate a Podfile that:
- ✅ Excludes React Native from the extension
- ✅ Sets proper extension API restrictions
- ✅ Only links specified Firebase/custom pods

### Expected Podfile Structure

After running `expo prebuild`, your `ios/Podfile` should automatically look like:

```ruby
target 'YourApp' do
  use_frameworks! :linkage => :static
  use_expo_modules!
  use_native_modules!
  # ... main app pods and React Native
  
  post_install do |installer|
    # ... existing Expo/React Native post_install code ...
    
    # Plugin automatically adds these fixes:
    
    # Fix 1: Prevent duplicate framework builds
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
      end
    end
    
    # Fix 2: Set extension restrictions
    installer.pods_project.targets.each do |target|
      if target.name == 'Pods-NotificationServiceExtension'
        target.build_configurations.each do |config|
          config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
        end
      end
    end
    
    # Fix 3: Remove React Native from extension
    extension_target = installer.pods_project.targets.find { |target| target.name == 'Pods-NotificationServiceExtension' }
    if extension_target
      extension_target.dependencies.delete_if do |dependency|
        dependency_name = dependency.name
        dependency_name.start_with?('React') || 
        dependency_name.start_with?('Expo') ||
        dependency_name.start_with?('RN')
      end
    end
  end
end

# Separate, isolated extension target
target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
  # ONLY the pods you specified in podDependencies
  # NO use_native_modules! or use_expo_modules!
end
```

**Key Points:**
- ✅ Extension target is **separate**, not nested
- ✅ Extension has **no** `use_expo_modules!` or `use_native_modules!`
- ✅ `post_install` automatically excludes React Native from extension
- ✅ All fixes are injected automatically by the plugin

### Verify Plugin Configuration

In your `app.json` or `app.config.js`:

```json
{
  "plugins": [
    [
      "expo-notification-service-extension-plugin",
      {
        "mode": "production",
        "iosNSEFilePath": "./NotificationService.m",
        "podDependencies": ["Firebase/Messaging"]
      }
    ]
  ]
}
```

Make sure:
- ✅ `podDependencies` is an array
- ✅ Only includes pods actually needed by the extension (e.g., Firebase/Messaging)
- ✅ Does NOT include React Native pods

### Manual Verification (If Still Having Issues)

Open `ios/YourApp.xcworkspace` in Xcode:

1. Select the project in the navigator
2. Select **NotificationServiceExtension** target
3. Go to **Build Phases** → **Compile Sources**
4. Verify ONLY `NotificationService.m` is listed
5. If you see React Native files, the Podfile wasn't generated correctly

### Still Not Working?

1. **Ensure you're using the latest plugin version** (v1.1.0+):
   ```bash
   npm install expo-notification-service-extension-plugin@latest
   ```

2. **Try a completely clean build**:
   ```bash
   rm -rf ios android node_modules
   npm install
   npx expo prebuild --clean
   cd ios && pod install && cd ..
   ```

3. **Check which target is failing** in the build logs:
   - `(in target 'NotificationServiceExtension')` ← Extension problem (should be fixed by plugin)
   - `(in target 'YourApp')` ← Main app problem (not related to this plugin)

4. **If using CI/CD** (EAS Build, Ionic Appflow, etc.):
   - Clear build cache
   - Ensure latest plugin version is installed
   - Verify `pod install` runs after `expo prebuild`

5. **Check your Podfile** manually at `ios/Podfile`:
   - Ensure the extension target is NOT nested inside the main target
   - Verify the `post_install` hook includes the React Native exclusion code
   - Make sure extension target has NO `use_expo_modules!` or `use_native_modules!`

