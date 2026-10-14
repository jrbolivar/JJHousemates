# J&J Housemates Online — setup (Firebase, free)

Firebase does all three jobs on its free **Spark** plan — no credit card needed:

- **Hosting** serves the app at `https://<project-id>.web.app`
- **Firestore** holds the rooms and payments, so PC and phones see the same data
- **Authentication** handles the Google sign-in

Until step 3 is done the app runs in **demo mode**, where each browser keeps its
own separate copy of the data.

## 1. Create the Firebase project (about 15 minutes)

1. https://console.firebase.google.com → **Create a project** → name it (e.g. `jj-housemates`).
   Google Analytics can be off. Stay on the free Spark plan.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Build → Firestore Database → Create database** → location
   `asia-southeast1 (Singapore)` → **Start in production mode**.
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)** → register the app
   (leave "Also set up Firebase Hosting" unticked). Firebase shows a `firebaseConfig`
   block with six values. Note the **Project ID** on the same page.

## 2. Connect the app to Firebase

Open `public/js/firebase-config.js` in Notepad, paste each of the six values between
the matching empty quotes, and save.

These values are identifiers, not passwords — they are designed to be public.
Access is controlled by `firestore.rules`, which only lets in the Gmail addresses
listed there.

## 3. Publish

1. Install **Node.js** (LTS) from https://nodejs.org if this PC does not have it.
2. Double-click **`DEPLOY.bat`**. It asks for your Project ID the first time,
   opens a browser to sign in to Firebase, then uploads the app **and** the
   Firestore security rules.
3. When it finishes it shows your address: `https://<project-id>.web.app`

No "authorized domains" step is needed — Firebase allows sign-in on its own
`.web.app` and `.firebaseapp.com` addresses automatically.

## 4. First sign-in and import

1. Open your address on the PC and **Sign in with Google**.
2. Choose **Import boarding_house_data.json** and pick the file from
   `Boarding House EXE (version2)`. Rooms, boarders, payments, bill history and
   past tenants come across. Email/SMS passwords and API keys are **not** uploaded.
3. On your phone, open the same address, sign in, then use the browser menu →
   **Add to Home screen**. It then opens like an installed app.

## Who can get in

Only the Gmail addresses listed in `firestore.rules`. To add Jun, Janeth or a
caretaker: open `firestore.rules` in Notepad, add their address to the list
(comma-separated, each in quotes), save, and run `DEPLOY.bat` again.

## Updating the app later

Change the files, then run `DEPLOY.bat` again. Phones and PCs pick up the new
version on their next load.

## Try it on this PC without any accounts

Double-click `PREVIEW.bat` — the app opens at http://localhost:8080 in demo mode.

## Free plan limits

Far above what one boarding house uses: 50,000 database reads and 20,000 writes
per day, 10 GB of hosting storage and 360 MB of downloads per day. If a limit were ever hit, the app
pauses until the next day — nothing is charged on the Spark plan.

## Not carried over from the PC app (yet)

- **Room document uploads** — needs Firebase Storage, which requires the paid
  (pay-as-you-go) plan. Existing files stay in your `room_documents` folder.
- **Sending email/SMS from inside the app** — replaced by Share / Email / SMS /
  WhatsApp buttons that open your phone's or PC's own apps with the bill
  pre-filled, so no passwords are stored online.
- **Excel export** is a `.csv` file (opens directly in Excel).
