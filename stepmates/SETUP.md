# StepMates — setup (Firebase, free)

StepMates is a phone-friendly web app (it installs to the home screen like a normal
app). Friends sign in with Google, join a group with a 6-letter code or invite
link, and see a shared leaderboard for today and this week.

It uses the same free Firebase setup as J&J Housemates, but in its **own** Firebase
project so the two apps' data stay separate.

Until step 2 is done the app runs in **demo mode** with pretend friends.

## Try it now on this PC

Double-click `PREVIEW.bat` — the app opens at http://localhost:8080 in demo mode.

## 1. Create the Firebase project (about 10 minutes)

1. https://console.firebase.google.com → **Create a project** → name it `stepmates`.
   Analytics can be off. Stay on the free **Spark** plan.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
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

Unlike J&J Housemates, **anyone** with a Google account can sign in. Privacy comes
from the rules: your history is private, and your daily totals are shown only to
groups you join.

## Where the step counts come from

| Device | How | Automatic? |
|---|---|---|
| iPhone / Apple Watch | Apple Shortcut sends today's Apple Health total (guide in the app's **Connect** tab) | Yes, daily |
| Garmin, Oura, Withings, etc. on iPhone | Those apps write to Apple Health, so the same Shortcut picks them up | Yes, daily |
| Garmin / Fitbit / Samsung on Android | Type today's total from the watch app (5 seconds) | No |
| No watch | **Walk now** counts steps with the phone's motion sensor while the app is open | While open |

The Shortcut opens a link like
`https://<project-id>.web.app/#add?src=apple&steps=8421` — any automation tool can
use the same link format (`date=YYYY-MM-DD` is optional).

## What's next: fully automatic Garmin / Fitbit / Android

A web app can't read Apple Health or Android Health Connect directly, and Garmin
and Fitbit only send data to a server. To make every brand automatic:

- **Garmin** — apply to the Garmin Connect Developer Program (Health API). Approval
  is needed; Garmin then pushes each user's daily steps to our server.
- **Fitbit** — Fitbit Web API (OAuth). Works for personal use; wider use needs review.
- **Server** — Firebase Cloud Functions to receive that data. This needs the
  pay-as-you-go **Blaze** plan; at a few friends' scale it typically stays inside
  the free allowance, but a card is required.
- **Alternative** — an aggregator such as Terra or Rook gives one connection for
  Garmin, Fitbit, Oura, Whoop, Polar and more (paid, per user).
- **Native apps** — reading Apple Health / Health Connect in the background needs a
  real iOS/Android app (e.g. React Native or Capacitor) and App Store / Play Store
  accounts ($99/yr Apple, $25 once Google).

## Updating the app later

Change the files and run `DEPLOY.bat` again.
