// Runs after `npx cap add ios` / `npx cap sync ios` (see MOBILE.md). Safe to run again.
// Adds what Apple requires and what the app's features need to the generated Xcode project:
//  - permission texts (camera, photos, microphone, Face ID) shown when iOS asks
//  - "uses only standard encryption" so App Store Connect doesn't ask about export compliance
//  - push notification hand-off in AppDelegate.swift (Capacitor needs these two methods)
//  - entitlements: push notifications, and gurubroker.app links / saved passwords (Associated Domains)
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve('ios/App/App');
if (!fs.existsSync(app)) { console.error('No ios/App/App folder yet. Run: npx cap add ios'); process.exit(1); }
const changed = [];

// ---- Info.plist
const plistPath = path.join(app, 'Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
const keys = {
  NSCameraUsageDescription: 'Take photos of documents and your headshot to add to your deals and marketing.',
  NSPhotoLibraryUsageDescription: 'Choose photos and documents to upload to your deals and marketing.',
  NSPhotoLibraryAddUsageDescription: 'Save designs and documents you export to your photo library.',
  NSMicrophoneUsageDescription: 'Use your microphone for voice and video calls with your team.',
  NSFaceIDUsageDescription: 'Unlock Guru Broker with Face ID.',
};
for (const [k, v] of Object.entries(keys)) {
  if (!plist.includes(`<key>${k}</key>`)) { plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${k}</key>\n\t<string>${v}</string>\n</dict>\n</plist>\n`); changed.push(k); }
}
if (!plist.includes('<key>ITSAppUsesNonExemptEncryption</key>')) {
  plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>\n');
  changed.push('ITSAppUsesNonExemptEncryption');
}
fs.writeFileSync(plistPath, plist);

// ---- AppDelegate.swift: pass the push token to Capacitor
const delegatePath = path.join(app, 'AppDelegate.swift');
let delegate = fs.readFileSync(delegatePath, 'utf8');
if (!delegate.includes('capacitorDidRegisterForRemoteNotifications')) {
  const methods = `
    // Push notifications: hand the device token (or the error) to Capacitor.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
  delegate = delegate.replace(/(class AppDelegate[^{]*\{\s*\n)/, `$1${methods}\n`);
  fs.writeFileSync(delegatePath, delegate);
  changed.push('AppDelegate push methods');
}

// ---- Entitlements
const entPath = path.join(app, 'App.entitlements');
if (!fs.existsSync(entPath)) {
  fs.writeFileSync(entPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>development</string>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
\t\t<string>applinks:gurubroker.app</string>
\t\t<string>webcredentials:gurubroker.app</string>
\t</array>
</dict>
</plist>
`);
  changed.push('App.entitlements');
}
const pbxPath = path.resolve('ios/App/App.xcodeproj/project.pbxproj');
let pbx = fs.readFileSync(pbxPath, 'utf8');
if (!pbx.includes('CODE_SIGN_ENTITLEMENTS')) {
  pbx = pbx.replace(/(\n(\s*)PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g, '\n$2CODE_SIGN_ENTITLEMENTS = App/App.entitlements;$1');
  fs.writeFileSync(pbxPath, pbx);
  changed.push('entitlements linked in the Xcode project');
}

console.log(changed.length ? `Updated: ${changed.join(', ')}` : 'iOS project already up to date.');
