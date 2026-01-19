# Diagnostic Guide for React Native in Extension Issue

If you're still seeing `'sharedApplication' is unavailable` errors from React Native files like `RCTScrollView.m` or `RNFetchBlobRequest.m`, this means React Native is still being compiled for the extension target.

## Step 1: Check Your Podfile Structure

Open `ios/Podfile` and verify the structure:

### ✅ CORRECT Structure (Extension is SEPARATE):

```ruby
target 'YourApp' do
  use_expo_modules!
  use_native_modules!
  # ... React Native and app dependencies
end

# This target should be AT THE SAME LEVEL, not nested
target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
  # NO use_expo_modules!
  # NO use_native_modules!
end
```

### ❌ WRONG Structure (Extension is NESTED):

```ruby
target 'YourApp' do
  use_expo_modules!
  use_native_modules!
  
  # BAD: Extension inside main target
  target 'NotificationServiceExtension' do
    pod 'Firebase/Messaging'
  end
end
```

**If your extension is nested, that's the problem!** The nested target inherits all dependencies from the parent.

## Step 2: Check Xcode Project

Open `ios/YourApp.xcworkspace` in Xcode:

1. Select your project in the navigator
2. Select **NotificationServiceExtension** target
3. Go to **Build Phases** → **Compile Sources**
4. Check what files are listed

**Expected:** ONLY `NotificationService.m`

**Problem:** If you see React Native files like:
- `RCTScrollView.m`
- `RNFetchBlobRequest.m`
- Any file from `node_modules`

This means CocoaPods or autolinking is incorrectly adding them.

## Step 3: Check Pod Installation Log

When you run `pod install`, look for:

```
Configuring NotificationServiceExtension as App Extension...
  Removing React Native file from extension: .../RCTScrollView.m
  Removing React Native file from extension: .../RNFetchBlobRequest.m
```

**If you DON'T see these messages**, the post_install hook isn't running correctly.

## Step 4: Manual Fix - Override Podfile

If the automatic fix isn't working, try manually editing `ios/Podfile`:

### Add this at the very beginning (before any targets):

```ruby
# Monkey-patch to prevent autolinking from touching the extension
def use_native_modules!(config = nil)
  # Call the original method
  original_use_native_modules!(config)
  
  # Then remove React Native from extension target
  # (This is a workaround - the plugin should handle this)
end
```

### Or use `abstract_target` pattern:

```ruby
abstract_target 'Common' do
  # Shared pods go here (like Firebase/Core if needed)
  
  target 'YourApp' do
    use_expo_modules!
    use_native_modules!
    # React Native and app-specific pods
  end
  
  target 'NotificationServiceExtension' do
    # ONLY extension-specific pods
    pod 'Firebase/Messaging'
  end
end
```

## Step 5: Nuclear Option - Completely Rebuild

```bash
# Delete everything
rm -rf ios/Pods ios/Podfile.lock ios/build
rm -rf node_modules
rm -rf ios/YourApp.xcworkspace

# Reinstall
npm install
npx expo prebuild --clean --platform ios

# Install pods
cd ios
pod deintegrate
pod install --repo-update
cd ..

# Build
npx expo run:ios
```

## Step 6: Check for Conflicting Config Plugins

Some other Expo config plugins might be modifying the Podfile in ways that conflict with this plugin.

In your `app.json` or `app.config.js`, check the `plugins` array:

```json
{
  "plugins": [
    "expo-notification-service-extension-plugin",  // Should be FIRST
    // ... other plugins
  ]
}
```

**Try moving `expo-notification-service-extension-plugin` to the FIRST position** in the plugins array.

## Step 7: Report the Issue

If none of the above works, please share:

1. Your `ios/Podfile` (full content)
2. Output of `pod install` (look for the "Configuring" messages)
3. Xcode Build Phases for NotificationServiceExtension target
4. Your plugin configuration from `app.json`/`app.config.js`

This will help identify why the automatic fix isn't working in your specific setup.

## Common Root Causes

1. **Nested targets in Podfile** - Extension inherits all parent dependencies
2. **Expo autolinking runs on all targets** - `use_native_modules!` doesn't exclude extension
3. **Pod install order** - post_install hook runs too late, files already added
4. **Xcode cache** - Old build artifacts causing stale references
5. **Conflicting plugins** - Another plugin is modifying the Podfile structure

## Expected vs Actual

### Expected Behavior:
- Extension target has ONLY `NotificationService.m` in Compile Sources
- Extension links ONLY Firebase pods (or whatever you specified)
- No React Native frameworks in extension's "Link Binary With Libraries"

### What's Happening (Bug):
- React Native files ARE in the extension's Compile Sources
- This means CocoaPods/autolinking is adding them despite our attempts to prevent it
- The post_install hook cleanup isn't catching them, or is running too late

## Temporary Workaround

Until we fix the root cause, you can manually remove React Native files from the extension:

1. Open Xcode
2. Select NotificationServiceExtension target
3. Build Phases → Compile Sources
4. Manually remove all React Native files (anything from `node_modules`)
5. Build → the build will succeed

**But** you'll have to do this every time you run `pod install`, which is not ideal.

