// Data layer with two interchangeable back ends:
//   cloud — Firebase Auth (Google sign-in) + Firestore, shared with friends
//   local — this browser only, with pretend friends (demo mode, no Firebase config yet)
//
// Firestore layout:
//   users/{uid}                  { name, goal }                 private
//   users/{uid}/days/{date}      { date, steps, src, at }       private
//   groups/{code}                { name, owner, members[], names{uid:name} }
//   groups/{code}/steps/{uid}    { name, days{date:steps} }     visible to the group

import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const LS_KEY = "stepmates_v1";
export const cloudEnabled = !!(firebaseConfig && firebaseConfig.apiKey);

export const today = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD
export function addDays(date, n) {
  const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return today(d);
}

export const state = {
  phase: "loading",            // loading | signin | ready
  mode: cloudEnabled ? "cloud" : "local",
  user: null,                  // { uid, name, photo }
  profile: { name: "", goal: 10000 },
  days: {},                    // date -> { steps, src }
  groups: {},                  // code -> { name, owner, members, names }
  boards: {},                  // code -> uid -> { name, days }
  error: "",
};
const subs = [];
const emit = () => subs.forEach(fn => fn(state));
export const subscribe = fn => { subs.push(fn); fn(state); };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)),
  b => CODE_CHARS[b % CODE_CHARS.length]).join("");

// ── local (demo) back end ──────────────────────────────────────
const DEMO_FRIENDS = [["d1", "Jun"], ["d2", "Janeth"], ["d3", "Mika"], ["d4", "Paolo"]];
function demoBoard(code, me) {
  const board = {};
  DEMO_FRIENDS.forEach(([uid, name], i) => {
    const days = {};
    for (let k = 0; k < 35; k++) {
      const date = addDays(today(), -k);
      let seed = 0; for (const c of uid + date + code) seed = (seed * 31 + c.charCodeAt(0)) % 9973;
      const full = 3500 + (seed * 7 + i * 1300) % 9500;
      days[date] = k === 0 ? Math.round(full * Math.min(1, new Date().getHours() / 20)) : full;
    }
    board[uid] = { name, days };
  });
  board[me.uid] = { name: me.name, days: Object.fromEntries(
    Object.entries(state.days).map(([d, v]) => [d, v.steps])) };
  return board;
}
function lsSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(
      { profile: state.profile, days: state.days, groups: state.groups }));
  } catch (e) { state.error = "Could not save in this browser: " + e.message; }
}
function refreshLocal() {
  for (const code of Object.keys(state.groups)) state.boards[code] = demoBoard(code, state.user);
  lsSave(); emit();
}
function initLocal() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* fresh start */ }
  state.user = { uid: "me", name: "You", photo: "" };
  if (saved) Object.assign(state, { profile: saved.profile, days: saved.days || {}, groups: saved.groups || {} });
  else {
    state.profile = { name: "You", goal: 10000 };
    state.groups = { DEMO42: { name: "Housemates", owner: "d1", members: ["d1", "d2", "d3", "d4", "me"], names: {} } };
  }
  state.user.name = state.profile.name;
  state.phase = "ready";
  refreshLocal();
}
const local = {
  async setSteps(date, steps, src) { state.days[date] = { steps, src }; refreshLocal(); },
  async saveProfile(p) { Object.assign(state.profile, p); state.user.name = state.profile.name; refreshLocal(); },
  async createGroup(name) {
    const code = newCode();
    state.groups[code] = { name, owner: "me", members: ["me"], names: {} };
    refreshLocal(); return code;
  },
  async joinGroup(code) {
    if (state.groups[code]) return code;
    state.groups[code] = { name: "Group " + code, owner: "d1", members: ["d1", "d2", "d3", "d4", "me"], names: {} };
    refreshLocal(); return code;
  },
  async leaveGroup(code) { delete state.groups[code]; delete state.boards[code]; refreshLocal(); },
  async signIn() {}, async signOut() {},
};

// ── cloud back end ─────────────────────────────────────────────
let fs, au, db, auth;
let baseUnsub = [], groupUnsub = {};
const stopAll = () => {
  baseUnsub.forEach(u => u()); baseUnsub = [];
  Object.values(groupUnsub).forEach(u => u()); groupUnsub = {};
};
const fail = err => { console.error(err); state.error = (err && err.message) || String(err); emit(); };

function listen(uid) {
  stopAll();
  baseUnsub.push(fs.onSnapshot(fs.doc(db, "users", uid), snap => {
    if (snap.exists()) Object.assign(state.profile, snap.data());
    else fs.setDoc(fs.doc(db, "users", uid), { name: state.user.name, goal: 10000 }).catch(fail);
    state.phase = "ready"; emit();
  }, fail));
  const since = addDays(today(), -60);
  baseUnsub.push(fs.onSnapshot(fs.query(fs.collection(db, "users", uid, "days"),
      fs.where("date", ">=", since)), snap => {
    state.days = {};
    snap.forEach(d => { const v = d.data(); state.days[v.date] = { steps: v.steps, src: v.src }; });
    emit();
  }, fail));
  baseUnsub.push(fs.onSnapshot(fs.query(fs.collection(db, "groups"),
      fs.where("members", "array-contains", uid)), snap => {
    state.groups = {};
    snap.forEach(d => { state.groups[d.id] = d.data(); });
    for (const code of Object.keys(groupUnsub)) {
      if (!state.groups[code]) { groupUnsub[code](); delete groupUnsub[code]; delete state.boards[code]; }
    }
    for (const code of Object.keys(state.groups)) {
      if (groupUnsub[code]) continue;
      groupUnsub[code] = fs.onSnapshot(fs.collection(db, "groups", code, "steps"), s => {
        const board = {};
        s.forEach(d => { board[d.id] = d.data(); });
        state.boards[code] = board; emit();
      }, fail);
    }
    emit();
  }, fail));
}

// Copy my recent days into a group's leaderboard.
function pushMyDays(code) {
  const days = {};
  const since = addDays(today(), -35);
  for (const [d, v] of Object.entries(state.days)) if (d >= since) days[d] = v.steps;
  return fs.setDoc(fs.doc(db, "groups", code, "steps", state.user.uid),
    { name: state.profile.name || state.user.name, days }, { merge: true });
}

const cloud = {
  async setSteps(date, steps, src) {
    const uid = state.user.uid;
    state.days[date] = { steps, src }; emit();
    await fs.setDoc(fs.doc(db, "users", uid, "days", date),
      { date, steps, src, at: fs.serverTimestamp() });
    await Promise.all(Object.keys(state.groups).map(code =>
      fs.setDoc(fs.doc(db, "groups", code, "steps", uid), { days: { [date]: steps } }, { merge: true })));
  },
  async saveProfile(p) {
    const uid = state.user.uid;
    await fs.setDoc(fs.doc(db, "users", uid), p, { merge: true });
    if (p.name) await Promise.all(Object.keys(state.groups).map(code => Promise.all([
      fs.updateDoc(fs.doc(db, "groups", code), { ["names." + uid]: p.name }),
      fs.setDoc(fs.doc(db, "groups", code, "steps", uid), { name: p.name }, { merge: true }),
    ])));
  },
  async createGroup(name) {
    const uid = state.user.uid, code = newCode();
    await fs.setDoc(fs.doc(db, "groups", code), {
      name, owner: uid, members: [uid], names: { [uid]: state.profile.name }, created: fs.serverTimestamp() });
    await pushMyDays(code);
    return code;
  },
  async joinGroup(code) {
    const uid = state.user.uid, ref = fs.doc(db, "groups", code);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) throw new Error("No group with code " + code + ". Check the code and try again.");
    if (!snap.data().members.includes(uid)) {
      await fs.updateDoc(ref, { members: fs.arrayUnion(uid), ["names." + uid]: state.profile.name });
    }
    await pushMyDays(code);
    return code;
  },
  async leaveGroup(code) {
    const uid = state.user.uid;
    await fs.deleteDoc(fs.doc(db, "groups", code, "steps", uid));
    await fs.updateDoc(fs.doc(db, "groups", code), { members: fs.arrayRemove(uid), ["names." + uid]: fs.deleteField() });
  },
  async signIn() { await au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
  async signOut() { stopAll(); await au.signOut(auth); },
};

async function initCloud() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
  au = authMod; fs = fsMod;
  const app = appMod.initializeApp(firebaseConfig);
  auth = au.getAuth(app);
  db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
  au.onAuthStateChanged(auth, user => {
    if (!user) {
      stopAll();
      Object.assign(state, { phase: "signin", user: null, days: {}, groups: {}, boards: {} });
      return emit();
    }
    state.user = { uid: user.uid, name: user.displayName || "Walker", photo: user.photoURL || "" };
    state.profile = { name: state.user.name, goal: 10000 };
    state.phase = "loading"; emit();
    listen(user.uid);
  });
}

const backend = () => (state.mode === "cloud" ? cloud : local);
export const actions = {
  setSteps: (date, steps, src = "manual") => backend().setSteps(date, Math.max(0, Math.round(steps)), src),
  saveProfile: p => backend().saveProfile(p),
  createGroup: name => backend().createGroup(name),
  joinGroup: code => backend().joinGroup(code.trim().toUpperCase()),
  leaveGroup: code => backend().leaveGroup(code),
  signIn: () => backend().signIn(),
  signOut: () => backend().signOut(),
};

export function start() {
  if (state.mode === "cloud") initCloud().catch(fail); else initLocal();
}
