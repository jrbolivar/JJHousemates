# J&J Housemates Online — setup (GitHub Pages + Firebase)

Two free services, each doing one job:

- **GitHub Pages** hosts the app itself (the files in `public/`).
- **Firebase** holds the data and the Google sign-in, so PC and phones see the
  same rooms and payments. GitHub cannot store the data — without Firebase the
  app stays in demo mode, where each browser has its own separate copy.

Nothing needs to be installed on this PC. Everything below is done in a browser.

## 1. Put the app on GitHub Pages

1. Sign in at https://github.com (create a free account if you have none).
2. **+ (top right) → New repository.** Name: `housemates`. Visibility: **Public**
   (free GitHub Pages needs a public repository). Tick **Add a README file**. **Create repository.**
3. In the new repository: **Add file → Upload files.**
4. Open the `public` folder on this PC, select **everything inside it**
   (`index.html`, `sw.js`, `manifest.webmanifest`, and the `css`, `js`, `assets`
   folders) and drag it all onto the upload page. **Commit changes.**
   `index.html` must end up at the top level of the repository, not inside a `public` folder.
5. **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   Branch: `main`, folder `/ (root)` → Save.**
6. After a minute or two the page shows your address:
   `https://<your-username>.github.io/housemates/`

Open it — the app should load in **demo mode**. Hosting is done.

**Upload only the contents of `public/`.** Never upload `boarding_house_data.json`
or anything else from the Boarding House folder: a public repository is visible
to everyone. Your records go into Firebase through the app's Import button instead.

## 2. Create the Firebase project (about 15 minutes, free)

1. https://console.firebase.google.com → **Add project** → name it (e.g. `jj-housemates`). Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. Still in Authentication: **Settings → Authorized domains → Add domain** →
   `<your-username>.github.io`. Without this, sign-in is refused on your GitHub address.
4. **Build → Firestore Database → Create database** → location
   `asia-southeast1 (Singapore)` → **Start in production mode**.
5. In Firestore, open the **Rules** tab, replace everything there with the
   contents of `firestore.rules` from this folder, and click **Publish**.
   These rules are what keep everyone except your listed Gmail addresses out.
6. **Project settings (gear icon) → Your apps → Web (`</>`)** → register the app.
   Firebase shows a `firebaseConfig` block with six values.

## 3. Connect the app to Firebase

1. On GitHub, open `js/firebase-config.js` in your repository → **pencil (Edit)**.
2. Paste each of the six values between the matching empty quotes → **Commit changes.**
3. Wait a minute, then reload your address. Instead of demo mode you should now
   see **Sign in with Google**.

These config values are identifiers, not passwords — they are designed to be
public. Access is controlled by the rules from step 2.5.

## 4. First sign-in and import

1. Open the address on your PC and **Sign in with Google**.
2. Choose **Import boarding_house_data.json** and pick the file from
   `Boarding House EXE (version2)`. Rooms, boarders, payments, bill history and
   past tenants come across. Email/SMS passwords and API keys are **not** uploaded.
3. On your phone, open the same address, sign in, then use the browser menu →
   **Add to Home screen**. It then opens like an installed app.

## Who can get in

Only the Gmail addresses listed in the Firestore rules. To add Jun, Janeth or a
caretaker: Firebase console → Firestore → **Rules**, add their address to the
list (comma-separated, each in quotes), **Publish**.

## Updating the app later

Upload the changed file to the same place in the repository (**Add file →
Upload files**, it replaces the old one). Devices pick up the new version on
their next load.

## Try it on this PC without any accounts

Double-click `PREVIEW.bat` — the app opens at http://localhost:8080 in demo mode.

## Not carried over from the PC app (yet)

- **Room document uploads** — needs Firebase Storage, which requires the paid
  (pay-as-you-go) plan. Existing files stay in your `room_documents` folder.
- **Sending email/SMS from inside the app** — replaced by Share / Email / SMS /
  WhatsApp buttons that open your phone's or PC's own apps with the bill
  pre-filled, so no passwords are stored online.
- **Excel export** is a `.csv` file (opens directly in Excel).
