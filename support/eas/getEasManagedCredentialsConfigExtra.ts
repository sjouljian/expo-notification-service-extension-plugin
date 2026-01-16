import { NSE_TARGET_NAME } from "../iosConstants";
import { ExpoConfig } from '@expo/config-types';

export default function getEasManagedCredentialsConfigExtra(config: ExpoConfig): {[k: string]: any} {
  return {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      build: {
        ...config.extra?.eas?.build,
        experimental: {
          ...config.extra?.eas?.build?.experimental,
          ios: {
            ...config.extra?.eas?.build?.experimental?.ios,
            appExtensions: [
              ...(config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []),
              {
                // keep in sync with native changes in NSE
                targetName: NSE_TARGET_NAME,
                bundleIdentifier: `${config?.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`,
                // NOTE: App Groups capability removed - no longer required
                // If you need App Groups, add them manually to your provisioning profile
                entitlements: {},
              }
            ]
          }
        }
      }
    }
  }
}
