# Guru Broker iPhone app

The app is a native shell around **https://gurubroker.app**. Every website update reaches the app
right away; you only resubmit to Apple when the shell itself changes (rare).

What the app adds over the website: Apple push notifications, a Face ID lock, the iOS share sheet
for PDFs and designs, an in-app browser for outside links, and gurubroker.app links opening in the app.

---

## Part 1: Apple Developer website (about 15 minutes)

Sign in at **developer.apple.com/account**.

1. **Find your Team ID.** Go to *Membership details*. Copy the 10-character **Team ID**.
2. **Create the App ID.** Go to *Certificates, IDs & Profiles → Identifiers → +* → *App IDs* → *App*.
   - Description: `Guru Broker`
   - Bundle ID: *Explicit*, `app.gurubroker.ios`
   - Tick **Push Notifications** and **Associated Domains** → *Continue* → *Register*.
3. **Create the push key.** Go to *Keys → +*. Name it `Guru Broker push`, tick **Apple Push Notifications service (APNs)** → *Continue* → *Register*.
   - **Download** the `.p8` file. Apple lets you download it only once, so keep it safe.
   - Copy the **Key ID** shown on that page.

## Part 2: Vercel settings (5 minutes)

In Vercel → guru-broker → *Settings → Environment Variables*, add:

| Name | Value |
|---|---|
| `APNS_KEY` | The whole contents of the `.p8` file. Open it in TextEdit and copy everything, including the BEGIN/END lines. |
| `APNS_KEY_ID` | The Key ID from step 3 |
| `APNS_TEAM_ID` | Your Team ID from step 1 |
| `APNS_BUNDLE_ID` | `app.gurubroker.ios` |

Then go to *Deployments → ⋯ → Redeploy*.

## Part 3: Build on your Mac (30–45 minutes the first time)

You need:
- **Xcode**, free from the Mac App Store.
- **Node.js** LTS, from nodejs.org.
- **Git**. Xcode installs it.

Open **Terminal** and run these one at a time:

(The repository is private. If `git clone` asks for a password, either install **GitHub Desktop** and use *File → Clone repository → guru-broker*, then `cd` into that folder in Terminal, or sign in with `gh auth login` first.)

```bash
git clone https://github.com/huelsmanc/guru-broker.git
cd guru-broker/mobile
npm install
npm run setup
npm run open
```

`npm run setup` creates the Xcode project, makes the icons and splash screens, and applies the iPhone settings (permissions, push, app links). Xcode opens at the end.

In **Xcode**:

1. In the left sidebar, click **App** (the blue icon), then the **App** target → **Signing & Capabilities**.
2. Tick **Automatically manage signing** and pick your **Team**. The Bundle Identifier should read `app.gurubroker.ios`.
3. You should see **Push Notifications** and **Associated Domains** listed. If either is missing, click **+ Capability** and add it. For Associated Domains, add `applinks:gurubroker.app` and `webcredentials:gurubroker.app`.
4. Plug in your iPhone, pick it at the top of Xcode, and press **▶︎ Run**. The first time, your iPhone asks you to trust the developer: go to *Settings → General → VPN & Device Management*.
5. Try it on the phone:
   - Sign in.
   - Turn on notifications from the Dashboard card, then use My Profile → Notifications → **Send a test**.
   - Export a CMA or design (the share sheet should open).
   - Tap a gurubroker.app link in an email.
   - Turn on the **Face ID** lock in My Profile.

## Part 4: Send it to Apple

1. In Xcode, set the device at the top to **Any iOS Device**, then *Product → Archive*.
2. When the Organizer opens: **Distribute App → App Store Connect → Upload**.
3. At **appstoreconnect.apple.com** → *Apps → + → New App*:
   - Platform iOS, Name `Guru Broker`, language English (U.S.), Bundle ID `app.gurubroker.ios`, SKU `gurubroker-ios`.
4. Fill in the listing (copy from below), add screenshots, and pick the uploaded build.
5. Under *Pricing and Availability → App Distribution Methods*, choose **Unlisted App**. Apple asks you to fill in a short request form. Until it's approved, you can still use TestFlight.
6. **Submit for Review.**

To update the shell later: change the version in Xcode (*General → Version*, e.g. 1.0.1), then **Archive** and **Upload** again.

---

## App Store listing (copy and paste)

**Name:** Guru Broker
**Subtitle:** Deals, docs and your brokerage
**Category:** Business
**Keywords:** real estate,broker,agent,transaction,e-sign,commission,listing,CMA,checklist,realtor

**Description:**
Guru Broker is the back office for your real estate brokerage, in your pocket.

• Deals: every transaction with its checklist, key dates, documents and team in one place
• E-signatures: send, sign and track documents
• Messages and calls: chat with your broker, team and transaction coordinator, with notifications for messages, mentions and approvals
• Commissions: see your splits, caps and payouts
• Marketing: AI-written flyers, posts and listing kits, plus postcards mailed to your farm
• Training and culture: compliance courses, shout-outs and the company calendar

Guru Broker is for agents and staff of brokerages that use Guru Broker. Your broker sends your invite.

**Support URL:** https://gurubroker.app/support
**Privacy Policy URL:** https://gurubroker.app/privacy

**Screenshots:** 6.9" iPhone, 3 to 5 of them: the Dashboard, a deal's checklist, messages, a marketing design and My Commissions. On an iPhone 15/16 Pro Max, take them with side button + volume up.

## App privacy answers (App Store Connect → App Privacy)

- **Do you collect data?** Yes.
- **Contact info** (name, email, phone): used for *App Functionality*, linked to the user, not used for tracking.
- **User content** (photos, documents, messages, other user content): *App Functionality*, linked, not tracking.
- **Identifiers** (user ID, device ID for notifications): *App Functionality*, linked, not tracking.
- **Financial info** (payment info, if you count print orders): Stripe handles cards; we don't store card numbers. Answer *Payment Info: No* unless Apple asks otherwise.
- **Diagnostics** (crash data, i.e. our error reports): *App Functionality*, linked, not tracking.
- **Tracking:** No.

## Notes for Apple's reviewer (App Review Information)

Make a demo login first: a test brokerage with a sample deal, and an agent account. Turn two-step sign-in off for that account.

> Guru Broker is a business tool for real estate brokerages; accounts are created by a brokerage
> (invite only). Demo login: [email] / [password]. Native features: Apple push notifications
> (My Profile → Notifications → Send a test), Face ID lock (My Profile), and the share sheet for
> exported PDFs and marketing images (Marketing → Designs → Download). Print orders are physical
> goods paid with Stripe, and gear store items are physical products.

## Troubleshooting

- **`npm install` fails on `@capgo/capacitor-native-biometric`:** run `npm view @capgo/capacitor-native-biometric versions`. Pick the newest version whose major number matches `@capacitor/core` and set it in `package.json`.
- **No notifications on the phone:** check the four `APNS_*` values in Vercel and redeploy. Notifications from an Xcode ▶︎ Run build go through Apple's test servers; the server handles that automatically.
- **gurubroker.app links open Safari instead of the app:** wait a few hours after the first install (Apple caches app links), then long-press a link → *Open in Guru Broker* once.
