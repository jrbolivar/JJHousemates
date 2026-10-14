// Data layer. Two interchangeable back ends behind one interface:
//   cloud — Firebase Auth (Google sign-in) + Firestore, live sync, works offline
//   local — localStorage in this browser only (demo mode, no Firebase config yet)
//
// Firestore layout:
//   houses/main                  settings (rates, due day, footer, current_period)
//   houses/main/rooms/{S1..P3}   one document per room, same shape as the PC JSON
//   houses/main/log/{auto}       activity log entries

import { firebaseConfig } from "./firebase-config.js";
import { DEFAULT_SETTINGS, normalizeRoom, stamp } from "./billing.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const LS_KEY = "jjh_online_v1";
const HOUSE = "main";

export const cloudEnabled = !!(firebaseConfig && firebaseConfig.apiKey);

const state = {
  phase: "loading",            // loading | signin | denied | setup | ready
  mode: cloudEnabled ? "cloud" : "local",
  user: null,
  settings: null,
  rooms: {},
  sync: "synced",              // synced | pending | offline
  error: "",
};
const subs = [];
const emit = () => subs.forEach(fn => fn(state));

let fs, au, db, auth, unsub = [];
let localLog = [];
let gotSettings = false, gotRooms = false, pending = { s: false, r: false };

// ── local back end ─────────────────────────────────────────────
function lsSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(
      { settings: state.settings, rooms: state.rooms, log: localLog }));
  } catch (e) { state.error = "Could not save in this browser: " + e.message; }
}
function initLocal() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* fresh start */ }
  if (saved && saved.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    state.rooms = Object.fromEntries(
      Object.entries(saved.rooms || {}).map(([k, r]) => [k, normalizeRoom(r)]));
    localLog = saved.log || [];
    state.phase = "ready";
  } else {
    state.phase = "setup";
  }
  emit();
}

// ── cloud back end ─────────────────────────────────────────────
const houseRef = () => fs.doc(db, "houses", HOUSE);
const roomRef  = key => fs.doc(db, "houses", HOUSE, "rooms", key);
const logCol   = () => fs.collection(db, "houses", HOUSE, "log");

function onCloudError(err) {
  console.error(err);
  if (err && err.code === "permission-denied") { state.phase = "denied"; stopListening(); }
  else state.error = (err && err.message) || String(err);
  emit();
}
function stopListening() { unsub.forEach(u => u()); unsub = []; }

function refreshPhase() {
  if (!gotSettings || !gotRooms) return;
  state.phase = state.settings ? "ready" : "setup";
  state.sync = !navigator.onLine ? "offline" : (pending.s || pending.r ? "pending" : "synced");
  emit();
}

function listen() {
  stopListening();
  gotSettings = gotRooms = false;
  const opts = { includeMetadataChanges: true };
  unsub.push(fs.onSnapshot(houseRef(), opts, snap => {
    state.settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : null;
    pending.s = snap.metadata.hasPendingWrites;
    gotSettings = true; refreshPhase();
  }, onCloudError));
  unsub.push(fs.onSnapshot(fs.collection(db, "houses", HOUSE, "rooms"), opts, snap => {
    const rooms = {};
    snap.forEach(d => { rooms[d.id] = normalizeRoom(d.data()); });
    state.rooms = rooms;
    pending.r = snap.metadata.hasPendingWrites;
    gotRooms = true; refreshPhase();
  }, onCloudError));
}

async function initCloud() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js"),
  ]);
  au = authMod; fs = fsMod;
  const app = appMod.initializeApp(firebaseConfig);
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch { db = fs.getFirestore(app); }   // private window / no IndexedDB
  auth = au.getAuth(app);
  au.onAuthStateChanged(auth, user => {
    state.user = user ? { email: user.email, name: user.displayName || user.email } : null;
    if (user) { state.phase = "loading"; emit(); listen(); }
    else { stopListening(); state.settings = null; state.rooms = {}; state.phase = "signin"; emit(); }
  });
  addEventListener("online",  refreshPhase);
  addEventListener("offline", refreshPhase);
}

// ── public interface ───────────────────────────────────────────
export const store = {
  state,
  subscribe(fn) { subs.push(fn); },

  async init() {
    if (!cloudEnabled) return initLocal();
    try { await initCloud(); }
    catch (e) { state.error = "Could not reach Firebase: " + e.message; state.phase = "signin"; emit(); }
  },

  async signIn() {
    const provider = new au.GoogleAuthProvider();
    try { await au.signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")
        return au.signInWithRedirect(auth, provider);
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
    }
  },
  signOut() { return cloudEnabled ? au.signOut(auth) : undefined; },

  updateSettings(patch) {
    if (cloudEnabled) return void fs.setDoc(houseRef(), patch, { merge: true }).catch(onCloudError);
    Object.assign(state.settings, patch); lsSave(); emit();
  },

  updateRoom(key, patch) {
    if (cloudEnabled) return void fs.setDoc(roomRef(key), patch, { merge: true }).catch(onCloudError);
    Object.assign(state.rooms[key], patch); lsSave(); emit();
  },

  log(text) {
    const entry = { ts: stamp(true), text, user: state.user ? state.user.email : "this device" };
    if (cloudEnabled) return void fs.addDoc(logCol(), entry).catch(onCloudError);
    localLog.push(entry); if (localLog.length > 1000) localLog.shift(); lsSave();
  },

  async getLog(max = 300) {
    if (!cloudEnabled) return [...localLog].reverse().slice(0, max);
    const snap = await fs.getDocs(fs.query(logCol(), fs.orderBy("ts", "desc"), fs.limit(max)));
    return snap.docs.map(d => d.data());
  },

  // Replace settings and every room in `rooms` (first-run setup and PC import).
  async importAll({ settings, rooms }) {
    if (cloudEnabled) {
      const batch = fs.writeBatch(db);
      batch.set(houseRef(), settings);
      for (const [k, r] of Object.entries(rooms)) batch.set(roomRef(k), r);
      await batch.commit();
      return;
    }
    state.settings = { ...DEFAULT_SETTINGS, ...settings };
    state.rooms = Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, normalizeRoom(r)]));
    state.phase = "ready"; lsSave(); emit();
  },
};
