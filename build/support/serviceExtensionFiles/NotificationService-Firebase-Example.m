// Example NotificationService.m with Firebase Messaging integration
// This is an EXAMPLE file showing how to use Firebase in your NSE
// Copy this to your project and configure the plugin with:
// "podDependencies": ["Firebase/Messaging"]

#import "NotificationService.h"
#import <FirebaseMessaging/FirebaseMessaging.h>

@interface NotificationService ()

@property (nonatomic, strong) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNNotificationRequest *receivedRequest;
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;

@end

@implementation NotificationService

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request withContentHandler:(void (^)(UNNotificationContent * _Nonnull))contentHandler {
    self.receivedRequest = request;
    self.contentHandler = contentHandler;
    self.bestAttemptContent = [request.content mutableCopy];

    // Use Firebase to handle rich notifications (images, etc.)
    [[FIRMessaging extensionHelper] populateNotificationContent:self.bestAttemptContent
                                             withContentHandler:contentHandler];
}

- (void)serviceExtensionTimeWillExpire {
    // Called just before the extension will be terminated by the system.
    // Use this as an opportunity to deliver your "best attempt" at modified content,
    // otherwise the original push payload will be used.
    self.contentHandler(self.bestAttemptContent);
}

@end

