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

### Solution 1: Verify the Target (Most Common)

**Check which target is actually failing:**

Look closely at the build error. It should say either:
- `(in target 'NotificationServiceExtension' from project 'YourApp')` ← Extension problem
- `(in target 'YourApp' from project 'YourApp')` ← Main app problem (not related to this plugin)

If it's the main app target, this is a React Native compatibility issue, not related to the extension.

### Solution 2: Clean Build

```bash
# In your project
npx expo prebuild --clean
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

### Solution 3: Verify Podfile Structure

After running `expo prebuild`, check your `ios/Podfile`. It should look like:

```ruby
target 'YourApp' do
  use_native_modules!
  # ... main app pods
end

# This target should be SEPARATE and NOT nested
target 'NotificationServiceExtension' do
  use_frameworks! :linkage => :static
  pod 'Firebase/Messaging'
  # ONLY the pods you specified in podDependencies
  # NO use_native_modules! here
end
```

**❌ WRONG** - Extension inside main target:
```ruby
target 'YourApp' do
  use_native_modules!
  
  target 'NotificationServiceExtension' do  # ← BAD: nested
    pod 'Firebase/Messaging'
  end
end
```

### Solution 4: Manual Podfile Fix (If Auto-generation Fails)

If the plugin isn't generating the Podfile correctly, manually add this to your `ios/Podfile`:

```ruby
# Add AFTER the main app target's end
target 'NotificationServiceExtension' do
  use_frameworks! :linkage => :static
  pod 'Firebase/Messaging'
end
```

### Solution 5: Exclude React Native from Extension (Advanced)

If React Native is still being linked, add this post_install hook to your Podfile:

```ruby
post_install do |installer|
  # ... existing post_install code ...
  
  # Ensure extension doesn't link React Native
  installer.pods_project.targets.each do |target|
    if target.name.include?("NotificationServiceExtension")
      target.build_configurations.each do |config|
        config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
      end
    end
  end
end
```

### Solution 6: Check Xcode Project Directly

Open `ios/YourApp.xcworkspace` in Xcode:

1. Select the project in the navigator
2. Select **NotificationServiceExtension** target
3. Go to **Build Phases** → **Compile Sources**
4. Verify ONLY `NotificationService.m` is listed
5. If you see React Native files, remove them manually

### Solution 7: Verify Plugin Configuration

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
- ✅ Only includes pods actually needed by the extension
- ✅ Does NOT include React Native pods

### Still Not Working?

1. Check the build logs to see which target is actually failing
2. Verify the Podfile structure matches Solution 3
3. Try a completely clean build:
   ```bash
   rm -rf ios android node_modules
   npm install
   npx expo prebuild --clean
   cd ios && pod install && cd ..
   ```

4. If using Ionic Appflow or another CI/CD, ensure:
   - Build cache is cleared
   - Latest plugin version is being installed
   - Pod install runs after expo prebuild

