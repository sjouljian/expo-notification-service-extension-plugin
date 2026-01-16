# Firebase Setup Guide for Notification Service Extension

## Problem

When using Firebase Cloud Messaging in your iOS Notification Service Extension, you may encounter this error:

```
❌ 'FirebaseMessaging.h' file not found (in target 'NotificationServiceExtension' from project 'YourApp')
```

This happens because the NotificationServiceExtension target doesn't have Firebase pods linked to it, even though your main app does.

## Solution

This plugin now supports automatic Podfile configuration through the `podDependencies` option.

### Step 1: Update Your App Configuration

Add the `podDependencies` array to your plugin configuration:

**app.json:**
```json
{
  "plugins": [
    [
      "expo-notification-service-extension-plugin",
      {
        "mode": "development",
        "iosNSEFilePath": "./assets/NotificationService.m",
        "podDependencies": ["Firebase/Messaging"]
      }
    ]
  ]
}
```

**app.config.js:**
```js
export default {
  plugins: [
    [
      "expo-notification-service-extension-plugin",
      {
        mode: "development", 
        iosNSEFilePath: "./assets/NotificationService.m",
        podDependencies: ["Firebase/Messaging"]
      }
    ]
  ]
};
```

### Step 2: Rebuild Your iOS Project

```bash
# Clean rebuild to ensure Podfile changes are applied
npx expo prebuild --clean --platform ios

# If working with a prebuilt project, also run:
cd ios && pod install && cd ..
```

### Step 3: Build Your App

```bash
# For local development
npx expo run:ios

# Or for EAS Build
eas build --platform ios
```

## How It Works

When you run `expo prebuild`, the plugin will:

1. ✅ Create the NotificationServiceExtension target in your Xcode project
2. ✅ Copy your custom NotificationService.m file
3. ✅ **Automatically add a NotificationServiceExtension target block to your Podfile**
4. ✅ **Link the specified pod dependencies to the extension target**

The generated Podfile will look like this:

```ruby
target 'YourApp' do
  # Your main app pods
  pod 'Firebase/Messaging'
  # ... other pods
end

# Added automatically by the plugin 👇
target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
end
```

## Example NotificationService.m with Firebase

Here's how to use Firebase Messaging in your NSE:

```objc
#import "NotificationService.h"
#import <FirebaseMessaging/FirebaseMessaging.h>

@interface NotificationService ()
@property (nonatomic, strong) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNNotificationRequest *receivedRequest;
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;
@end

@implementation NotificationService

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request 
                   withContentHandler:(void (^)(UNNotificationContent * _Nonnull))contentHandler {
    self.receivedRequest = request;
    self.contentHandler = contentHandler;
    self.bestAttemptContent = [request.content mutableCopy];

    // Firebase handles rich notifications (images, etc.)
    [[FIRMessaging extensionHelper] populateNotificationContent:self.bestAttemptContent
                                             withContentHandler:contentHandler];
}

- (void)serviceExtensionTimeWillExpire {
    self.contentHandler(self.bestAttemptContent);
}

@end
```

## Common Pod Dependencies

Depending on your needs, you might require:

| Pod Dependency | When to Use |
|----------------|-------------|
| `Firebase/Messaging` | Required for Firebase Cloud Messaging (most common) |
| `Firebase/Core` | Usually included automatically with Firebase/Messaging |
| `Firebase/Analytics` | If tracking notification analytics |
| `OneSignalXCFramework` | If using OneSignal instead of Firebase |

## Multiple Dependencies

You can specify multiple pod dependencies:

```json
{
  "podDependencies": ["Firebase/Messaging", "Firebase/Analytics"]
}
```

## Troubleshooting

### Error: "file not found" persists after configuration

1. Ensure you're using `npx expo prebuild --clean` (the `--clean` flag is important)
2. Check that your `iosNSEFilePath` points to the correct file
3. Verify your NotificationService.m actually imports Firebase: `#import <FirebaseMessaging/FirebaseMessaging.h>`
4. If working with a prebuilt project, run `cd ios && pod install`

### Error: "duplicate target 'NotificationServiceExtension'" in Podfile

If you manually added a NotificationServiceExtension target to your Podfile before, remove it. The plugin will handle it automatically.

### Checking the Generated Podfile

After running `expo prebuild`, check `ios/Podfile` to confirm the extension target was added:

```bash
cat ios/Podfile | grep -A 5 "NotificationServiceExtension"
```

You should see:
```ruby
target 'NotificationServiceExtension' do
  pod 'Firebase/Messaging'
end
```

## Additional Resources

- See the complete Firebase example: [NotificationService-Firebase-Example.m](support/serviceExtensionFiles/NotificationService-Firebase-Example.m)
- Firebase Cloud Messaging Documentation: https://firebase.google.com/docs/cloud-messaging/ios/client
- Expo Config Plugins: https://docs.expo.dev/guides/config-plugins/

