# StepMates — setup (Firebase, free)

StepMates comes two ways, sharing the same accounts and leaderboards:

- **Phone app** (Android and iPhone) — reads steps automatically from Health Connect
  (Android) or Apple Health (iPhone), so Garmin, Fitbit, Samsung and Apple Watch
  steps come in on their own. Steps sync every time the app is opened.
- **Website** at `https://<project-id>.web.app` — works on any phone or PC; steps
  are typed in, sent by an Apple Shortcut, or counted with Walk mode.

People sign in with email and password (the website also offers Google), join a
group with a 6-letter code or invite link, and see a leaderboard for today and
this week.

It uses the same free Firebase setup as J&J Housemates, but in its **own** Firebase
project so the two apps' data stay separate.

Until step 2 is done the app runs in **demo mode** with pretend friends.

## Try it now on this PC

Double-click `PREVIEW.bat` — the app opens at http://localhost:8080 in demo mode.

## 1. Create the Firebase project (about 10 minutes)

1. https://console.firebase.google.com → **Create a project** → name it `stepmates`.
   Analytics can be off. Stay on the free **Spark** plan.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password**,
   then also enable **Google** (used on the website only).
3. **Build → Firestore Database → Create database** → pick a location near your
   friends (e.g. `asia-southeast1`) → **Start in production mode**.
4. **Project settings → General → Your apps → Web (`</>`)** → register the app.
   Copy the six `firebaseConfig` values and note the **Project ID**.

## 2. Connect and publish

1. Paste the six values into `public/js/firebase-config.js` and save.
2. Double-click **`DEPLOY.bat`**, enter the Project ID, and sign in when asked.
   It uploads the app and the security rules (`firestore.rules`).
3. Your app is live at `https://<project-id>.web.app`. Send friends that link —
   on their phone: open it → **Share → Add to Home Screen** (iPhone) or
   **⋮ → Install app** (Android).

Unlike J&J Housemates, **anyone** can create an account. Privacy comes
from the rules: your history is private, and your daily totals are shown only to
groups you join.

## 3. Install the phone app

**Android (free)**

1. The app needs the Firebase values from step 2, so make sure the filled-in
   `public/js/firebase-config.js` is pushed to GitHub (without them the app opens
   in demo mode). Every push builds the app automatically. On your phone, open
2. On your phone, open
   the GitHub app or github.com → this repository → **Releases** →
   **StepMates Android** → download **StepMates.apk**.
3. Open the file. Android asks to allow installing from this source → allow →
   **Install**.
4. Open StepMates → sign in → **Connect Health Connect** → allow **Steps**.
5. In **Garmin Connect** → More → Settings → Connected Apps → **Health Connect**,
   allow Garmin Connect to share **Steps**.
6. To give it to family: send them the same StepMates.apk (WhatsApp, Messenger,
   Google Drive).

**Updates on Android.** Until a signing key is set up, each new build is signed
differently, so remove the old StepMates before installing a new one (your steps
and groups are safe online; just sign in again). To let updates install straight
over the old app, create a key once on a PC with Java:

```
keytool -genkeypair -keystore stepmates.keystore -alias stepmates -keyalg RSA -keysize 2048 -validity 10000
certutil -encode stepmates.keystore stepmates.b64     (Windows; on Mac/Linux: base64 -i stepmates.keystore)
```

Then on GitHub → this repository → Settings → Secrets and variables → Actions, add
`STEPMATES_KEYSTORE_BASE64` (the text in stepmates.b64, without the BEGIN/END lines)
and `STEPMATES_KEYSTORE_PASSWORD` (the password you chose). Keep the keystore file
somewhere safe and never put it in the repository.

Needs Android 9 or newer. Android 14+ has Health Connect built in; older phones
install **Health Connect by Android** from the Play Store first.

To put it on the Play Store later: a Google Play developer account ($25 once) and
the signing key above.

**iPhone**

Apple only lets apps onto iPhones through its own systems, and HealthKit (Apple
Health access) needs a paid **Apple Developer account ($99/year)**. With one:

1. On a Mac with Xcode: `npm install`, then `npx cap sync ios`, then open
   `ios/App/App.xcodeproj`.
2. **Signing & Capabilities** → choose your team → check that **HealthKit** is listed.
3. **Product → Archive → Distribute App → TestFlight**. Invite family by email in
   App Store Connect; they install through Apple's TestFlight app.

No Mac? Cloud services such as Codemagic or Ionic Appflow can build and upload to
TestFlight from this repository. Until then, iPhone users can use the website with
the Apple Shortcut — it's also automatic.

## Where the step counts come from

| Device | Phone app | Website |
|---|---|---|
| Garmin on Android | Garmin Connect → Health Connect → StepMates | Type it in |
| Garmin on iPhone | Garmin Connect → Apple Health → StepMates | Apple Shortcut |
| Apple Watch / iPhone | Apple Health → StepMates | Apple Shortcut |
| Fitbit, Samsung, Oura (Android) | Health Connect → StepMates | Type it in |
| No watch | The phone's own step count | **Walk now** while open |

The phone app syncs the last 7 days each time it's opened, so friends' leaderboards
update when each person opens the app.

The Shortcut opens a link like
`https://<project-id>.web.app/#add?src=apple&steps=8421` — any automation tool can
use the same link format (`date=YYYY-MM-DD` is optional).

## What's next

- **Sync without opening the app** — Android can read Health Connect in the
  background with an extra permission; iPhone can use HealthKit background delivery.
  Both need some native code beyond this version.
- **Direct from Garmin's servers** — Garmin's developer program requires business
  approval and was reported paused in September 2026, so the phone route above is
  the practical one.

## Updating the app later

Website: change the files and run `DEPLOY.bat` again.
Android app: push to GitHub; a new StepMates.apk appears under Releases a few
minutes later. iPhone: archive and upload to TestFlight again.
