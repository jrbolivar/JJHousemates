// Paste your Firebase web app config here (Firebase console → Project settings
// → Your apps → Web app → "Config"). See SETUP.md, step 2.
//
// While apiKey is empty the app runs in DEMO MODE with pretend friends, and your
// steps stay in this one browser.

export const firebaseConfig = {
  apiKey:            "AIzaSyCgPOnWXLY7mMhhd2-i61TJ33bcYtZ9gFo",
  authDomain:        "stepmates-d56b8.firebaseapp.com",
  projectId:         "stepmates-d56b8",
  storageBucket:     "stepmates-d56b8.firebasestorage.app",
  messagingSenderId: "858962083746",
  appId:             "1:858962083746:web:c542631c3920f171dfbcfb",
};

// Where the website version lives (used for invite links sent from the phone app).
// Leave empty to use the Firebase address https://<projectId>.web.app/
export const siteUrl = "";

// Show "Sign in with Google" on the website. Needs the Google provider enabled in
// Firebase Authentication and the website's domain added under Authorized domains.
export const googleSignIn = false;
