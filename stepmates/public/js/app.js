import { state, subscribe, actions, start, today, addDays, cloudEnabled } from "./store.js";
import * as pedo from "./pedometer.js";
import * as phone from "./health.js";
import { firebaseConfig, siteUrl, googleSignIn } from "./firebase-config.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => Math.round(n || 0).toLocaleString();
// Links people share must point at the website, even when sent from the installed app.
const appUrl = () => phone.isNative()
  ? (siteUrl ? siteUrl.replace(/\/*$/, "/") : `https://${firebaseConfig.projectId || "stepmates"}.web.app/`)
  : location.origin + location.pathname;
const SRC = { manual: "Typed in", apple: "Apple Health", healthconnect: "Health Connect", walk: "Walk mode", garmin: "Garmin", fitbit: "Fitbit", samsung: "Samsung Health", google: "Google Fit" };

let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
async function run(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; }
  catch (e) { console.error(e); toast(e.message || String(e)); }
}

// ── week helpers ───────────────────────────────────────────────
function weekStart(date = today()) {
  const d = new Date(date + "T12:00:00");
  return addDays(date, -((d.getDay() + 6) % 7)); // Monday
}
const weekDates = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(), i));
const dayLabel = date => new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
const stepsOn = date => state.days[date]?.steps || 0;

// ── deep links: #add?steps=8421&date=2026-11-05&src=apple  and  #join=ABC123 ──
let pendingLink = null;
function captureLink() {
  const h = location.hash;
  if (h.startsWith("#add?") || h.startsWith("#join=")) {
    pendingLink = h;
    try { sessionStorage.setItem("stepmates_link", h); } catch { /* fine */ }
    history.replaceState(null, "", location.pathname + "#/today");
  } else {
    try { pendingLink = sessionStorage.getItem("stepmates_link"); } catch { /* fine */ }
  }
}
async function handleLink() {
  if (!pendingLink || state.phase !== "ready") return;
  const h = pendingLink; pendingLink = null;
  try { sessionStorage.removeItem("stepmates_link"); } catch { /* fine */ }
  if (h.startsWith("#join=")) {
    const code = h.slice(6);
    await run(() => actions.joinGroup(code), "You joined the group!");
    location.hash = "#/friends/" + code.toUpperCase();
    return;
  }
  const p = new URLSearchParams(h.slice(5));
  const steps = Number(String(p.get("steps") || "").replace(/[^\d.]/g, ""));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get("date") || "") ? p.get("date") : today();
  const src = SRC[p.get("src")] ? p.get("src") : "manual";
  if (!Number.isFinite(steps) || steps <= 0) return toast("That link had no step count in it.");
  await run(() => actions.setSteps(date, steps, src), `Saved ${fmt(steps)} steps from ${SRC[src]}`);
}

// ── views ──────────────────────────────────────────────────────
function ring(steps, goal) {
  const pct = Math.min(1, steps / goal), r = 88, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 200 200" role="img" aria-label="${fmt(steps)} of ${fmt(goal)} steps">
    <circle cx="100" cy="100" r="${r}" class="ring-bg"/>
    <circle cx="100" cy="100" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg>`;
}

function viewToday() {
  const t = today(), goal = state.profile.goal || 10000, steps = stepsOn(t);
  const week = weekDates(), max = Math.max(goal, ...week.map(stepsOn));
  const weekTotal = week.reduce((s, d) => s + stepsOn(d), 0);
  const src = state.days[t]?.src;
  let streak = 0;
  for (let d = stepsOn(t) >= goal ? t : addDays(t, -1); stepsOn(d) >= goal; d = addDays(d, -1)) streak++;
  return `
  <section class="card hero">
    <div class="ring-wrap">${ring(steps, goal)}
      <div class="ring-text"><b>${fmt(steps)}</b><span>of ${fmt(goal)} steps</span></div>
    </div>
    <p class="muted">${steps >= goal ? "🎉 Goal reached today!" : `${fmt(goal - steps)} to go`}${src ? ` · from ${esc(SRC[src] || src)}` : ""}</p>
    ${phone.isNative() ? (phone.wasConnected()
      ? `<button class="sync-line" data-act="sync">${syncing ? "Syncing…" : `↻ ${esc(phone.sourceName())}${lastSync ? ` · synced ${timeAgo(lastSync)}` : ""}`}</button>`
      : `<button class="btn primary wide" data-act="connect">Connect ${esc(phone.sourceName())}</button>`) : ""}
    <div class="row">
      <button class="btn ${phone.isNative() ? "" : "primary"}" data-act="edit-today">✏️ Add steps</button>
      <button class="btn" data-act="walk">👟 Walk now</button>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>This week</h2><span class="muted">${fmt(weekTotal)} steps${streak ? ` · 🔥 ${streak}-day streak` : ""}</span></div>
    <div class="bars">
      ${week.map(d => `<button class="bar ${d === t ? "is-today" : ""} ${stepsOn(d) >= goal ? "hit" : ""}" data-act="edit-day" data-date="${d}" title="${fmt(stepsOn(d))}">
        <span class="bar-track"><span class="bar-fill" style="height:${Math.max(2, (stepsOn(d) / max) * 100)}%"></span></span>
        <small>${dayLabel(d)}</small></button>`).join("")}
      <span class="goal-line" style="bottom:${24 + (goal / max) * 130}px" title="Goal"></span>
    </div>
  </section>

  ${Object.keys(state.groups).length ? "" : `
  <section class="card cta">
    <h2>Walk with friends</h2>
    <p class="muted">Start a group and send the invite link. Everyone sees a shared leaderboard.</p>
    <a class="btn primary" href="#/friends">Invite friends</a>
  </section>`}`;
}

let boardRange = "week";
let lastHash = null, lastGate = "";
function boardRows(code) {
  const board = state.boards[code] || {}, t = today(), dates = boardRange === "today" ? [t] : weekDates();
  return Object.entries(board)
    .map(([uid, m]) => ({ uid, name: state.groups[code]?.names?.[uid] || m.name || "Friend",
      total: dates.reduce((s, d) => s + (m.days?.[d] || 0), 0) }))
    .sort((a, b) => b.total - a.total);
}
const initials = n => esc(String(n).split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase());

function viewFriends(code) {
  const codes = Object.keys(state.groups);
  if (code && state.groups[code]) {
    const g = state.groups[code], rows = boardRows(code), top = rows[0]?.total || 1;
    const me = state.user.uid;
    return `
    <a class="back" href="#/friends">‹ All groups</a>
    <section class="card">
      <div class="card-head"><h2>${esc(g.name)}</h2><span class="code">Code ${esc(code)}</span></div>
      <div class="tabs">
        <button data-act="range" data-range="today" class="${boardRange === "today" ? "on" : ""}">Today</button>
        <button data-act="range" data-range="week" class="${boardRange === "week" ? "on" : ""}">This week</button>
      </div>
      <ol class="board">
        ${rows.map((r, i) => `<li class="${r.uid === me ? "me" : ""}">
          <span class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span class="avatar">${initials(r.name)}</span>
          <span class="who"><b>${esc(r.name)}${r.uid === me && r.name.toLowerCase() !== "you" ? " (you)" : ""}</b>
            <span class="meter"><span style="width:${(r.total / top) * 100}%"></span></span></span>
          <span class="num">${fmt(r.total)}</span></li>`).join("") || `<li class="muted">No steps yet.</li>`}
      </ol>
    </section>
    <div class="row">
      <button class="btn primary" data-act="invite" data-code="${esc(code)}">📨 Invite friends</button>
      <button class="btn danger" data-act="leave" data-code="${esc(code)}">Leave group</button>
    </div>`;
  }
  return `
  <section class="card">
    <h2>Your groups</h2>
    ${codes.length ? `<ul class="groups">${codes.map(c => {
      const rows = boardRows(c), myRank = rows.findIndex(r => r.uid === state.user.uid) + 1;
      return `<li><a href="#/friends/${esc(c)}"><b>${esc(state.groups[c].name)}</b>
        <span class="muted">${state.groups[c].members.length} members${myRank ? ` · you're #${myRank} ${boardRange === "today" ? "today" : "this week"}` : ""}</span><i>›</i></a></li>`;
    }).join("")}</ul>` : `<p class="muted">You're not in a group yet.</p>`}
  </section>
  <section class="card">
    <h2>Start a group</h2>
    <form class="inline" data-form="create">
      <input name="name" placeholder="e.g. Housemates, Office walkers" maxlength="40" required>
      <button class="btn primary">Create</button>
    </form>
  </section>
  <section class="card">
    <h2>Join with a code</h2>
    <form class="inline" data-form="join">
      <input name="code" placeholder="6-letter code" maxlength="6" autocapitalize="characters" required>
      <button class="btn">Join</button>
    </form>
  </section>`;
}

function viewPhoneConnect() {
  const ios = phone.platform() === "ios", name = phone.sourceName(), on = phone.wasConnected();
  return `
  <section class="card">
    <h2>${esc(name)}</h2>
    <p class="muted">${on ? `Connected. Steps sync every time you open StepMates${lastSync ? ` · last synced ${timeAgo(lastSync)}` : ""}.`
      : `Let StepMates read your daily step count. It reads steps only — nothing else from your health data.`}</p>
    <div class="row">
      ${on ? `<button class="btn primary" data-act="sync">${syncing ? "Syncing…" : "Sync now"}</button>
              ${ios ? "" : `<button class="btn" data-act="hc-settings">Permissions</button>`}`
           : `<button class="btn primary" data-act="connect">Connect ${esc(name)}</button>`}
    </div>
  </section>
  <section class="card guide">
    <h2>Garmin watch?</h2>
    <p>Let Garmin Connect pass your steps to ${esc(name)} once:</p>
    <ol>${ios ? `
      <li>Open <b>Garmin Connect</b> → <b>More</b> (☰) → <b>Settings</b> → <b>Connected Apps</b> → <b>Apple Health</b>.</li>
      <li>Turn on <b>Steps</b>.</li>` : `
      <li>Open <b>Garmin Connect</b> → <b>More</b> (☰) → <b>Settings</b> → <b>Connected Apps</b> → <b>Health Connect</b>.</li>
      <li>Allow Garmin Connect to write <b>Steps</b>.</li>
      <li>Optional: in <b>Health Connect → Data and access → Steps → Data sources</b>, put <b>Garmin Connect</b> first so watch steps win over phone steps.</li>`}
      <li>Sync your watch in Garmin Connect, then open StepMates.</li>
    </ol>
    <p class="muted small">${ios ? "Apple Watch, Oura, Withings and Polar also write to Apple Health." : "Fitbit, Samsung Health, Oura and Withings also write to Health Connect."}</p>
  </section>
  <section class="card guide">
    <h2>No watch?</h2>
    <p class="muted">Your phone counts steps on its own when it's in your pocket. Or use <b>Walk now</b> on the Today screen.</p>
  </section>`;
}

function viewConnect() {
  if (phone.isNative()) return viewPhoneConnect();
  const example = `${appUrl()}#add?src=apple&steps=8421`;
  return `
  <section class="card cta">
    <h2>Get the app</h2>
    <p class="muted">The StepMates phone app reads your steps from Apple Health or Health Connect automatically — including Garmin watches.</p>
  </section>
  <section class="card">
    <h2>Using the website instead?</h2>
    <p class="muted">A website can't read your phone's health data directly. These are the ways to get your count in:</p>
  </section>

  <details class="card guide" open>
    <summary>🍎 iPhone / Apple Watch — automatic, once a day</summary>
    <p>A free Apple <b>Shortcut</b> reads today's steps from Apple Health and sends them here. Set it up once:</p>
    <ol>
      <li>Open the <b>Shortcuts</b> app → <b>+</b> (new shortcut). Name it <i>Send steps</i>.</li>
      <li>Add <b>Find Health Samples</b>: type <i>Steps</i>, start date <i>is today</i>, and set <b>Group By</b> to <i>Day</i> (so iPhone and Watch steps aren't counted twice).</li>
      <li>Add <b>Calculate Statistics</b>: <i>Sum</i> of Health Samples.</li>
      <li>Add <b>Round Number</b> (to ones place).</li>
      <li>Add <b>Text</b> and paste this, then replace the last number with the <i>Rounded Number</i> variable:
        <code class="copy" data-act="copy" data-text="${esc(example)}">${esc(example)}</code></li>
      <li>Add <b>Open URLs</b> (it uses the Text).</li>
      <li>Run it once and tap <b>Allow</b> for Health.</li>
      <li>Optional: <b>Automation</b> tab → <b>Time of Day</b> (e.g. 9 PM) → run <i>Send steps</i> → <b>Run Immediately</b>.</li>
    </ol>
    <p class="muted">Garmin, Oura, Withings, Polar and most other watches can write to Apple Health, so this covers them on iPhone too. Garmin: Garmin Connect app → More → Settings → Connected Apps → Apple Health.</p>
  </details>

  <details class="card guide">
    <summary>⌚ Garmin, Fitbit, Samsung, Google (Android)</summary>
    <p>Open your watch's app, look at today's step count, and tap <b>Update today</b> on the Today screen. Takes five seconds.</p>
    <p class="muted">Automatic syncing from these brands needs a server and, for Garmin, approval into its developer program. See "What's next" in SETUP.md.</p>
  </details>

  <details class="card guide">
    <summary>👟 No watch? Use Walk mode</summary>
    <p>Tap <b>Walk now</b> on the Today screen and keep the app open with the phone in your hand or pocket. Steps are added to today when you stop.</p>
    <p class="muted">Browsers pause the motion sensor when the screen turns off, so it can't count in the background.</p>
  </details>
  <p class="muted small">Fitbit doesn't sync to Apple Health on its own; a helper app such as Health Sync can bridge it.</p>`;
}

function viewMe() {
  const p = state.profile;
  return `
  <section class="card">
    <div class="me-head">
      ${state.user.photo ? `<img class="avatar big" src="${esc(state.user.photo)}" alt="">` : `<span class="avatar big">${initials(p.name || "You")}</span>`}
      <div><b>${esc(p.name)}</b><div class="muted">${state.mode === "cloud" ? `Signed in${state.user.email ? " as " + esc(state.user.email) : ""}` : "Demo mode — this browser only"}</div></div>
    </div>
    <form data-form="profile" class="stack">
      <label>Name your friends see <input name="name" value="${esc(p.name)}" maxlength="30" required></label>
      <label>Daily goal (steps) <input name="goal" type="number" min="1000" max="100000" step="500" value="${p.goal || 10000}" required></label>
      <button class="btn primary">Save</button>
    </form>
  </section>
  ${state.mode === "cloud" ? `<button class="btn wide" data-act="signout">Sign out</button>` :
    `<p class="card muted small">Demo mode: the friends you see are pretend. Once the Firebase project is set up (SETUP.md), everyone signs in and sees each other's real steps.</p>`}
  <p class="muted small center">StepMates · Your daily steps are shared only with groups you join.</p>`;
}

// ── dialogs ────────────────────────────────────────────────────
function openDialog(html, onSubmit) {
  const d = $("#dialog");
  d.innerHTML = `<form method="dialog" class="stack">${html}</form>`;
  d.showModal();
  d.querySelector("input")?.focus();
  d.querySelector("form").onsubmit = async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    if ((await onSubmit(new FormData(e.target), e.submitter)) !== false) d.close();
  };
}
function editDay(date) {
  const cur = stepsOn(date);
  const label = date === today() ? "today" : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  openDialog(`
    <h2>Steps for ${esc(label)}</h2>
    <label>Total steps <input name="steps" type="number" inputmode="numeric" min="0" max="200000" value="${cur || ""}" placeholder="e.g. 8421" required></label>
    <label>From <select name="src">${["manual", "garmin", "apple", "fitbit", "samsung", "google"].map(s =>
      `<option value="${s}" ${state.days[date]?.src === s ? "selected" : ""}>${SRC[s]}</option>`).join("")}</select></label>
    <div class="row"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary">Save</button></div>`,
    fd => run(() => actions.setSteps(date, Number(fd.get("steps")), fd.get("src")), "Saved"));
}
async function walkMode() {
  if (!pedo.supported()) return toast("This device has no motion sensor the browser can use.");
  let count = 0, session;
  const d = $("#dialog");
  d.innerHTML = `<div class="stack center walk">
    <h2>Walk mode</h2><div class="walk-count">0</div><p class="muted">Keep this screen open while you walk.</p>
    <button class="btn primary" data-stop>Stop &amp; add to today</button></div>`;
  d.showModal();
  try {
    session = await pedo.startCounting(() => { count++; d.querySelector(".walk-count").textContent = fmt(count); });
  } catch (e) { d.close(); return toast(e.message); }
  setTimeout(() => { if (session.noSensor()) d.querySelector(".muted").textContent = "No motion data yet — this device may not have a step sensor."; }, 3000);
  const finish = async () => {
    session.stop(); d.close();
    if (count > 0) await run(() => actions.setSteps(today(), stepsOn(today()) + count, "walk"), `Added ${fmt(count)} steps`);
  };
  d.querySelector("[data-stop]").onclick = finish;
  d.oncancel = e => { e.preventDefault(); finish(); };
}
async function invite(code) {
  const g = state.groups[code];
  const url = `${appUrl()}#join=${code}`;
  const text = `Join my StepMates group "${g.name}" and let's count steps together! Code: ${code}`;
  if (navigator.share) { try { await navigator.share({ title: "StepMates", text, url }); return; } catch { /* cancelled */ } }
  await run(() => navigator.clipboard.writeText(`${text}\n${url}`), "Invite link copied — paste it in a message");
}

// ── phone health sync ──────────────────────────────────────────
let syncing = false, lastSync = 0;
const timeAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
async function syncPhone({ quiet = false } = {}) {
  if (!phone.isNative() || state.phase !== "ready" || syncing) return;
  syncing = true; render();
  try {
    const days = await phone.readDays(7);
    const changed = await actions.syncDays(days, phone.platform() === "ios" ? "apple" : "healthconnect");
    lastSync = Date.now();
    if (!quiet) toast(changed ? `Synced ${changed} day${changed > 1 ? "s" : ""} from ${phone.sourceName()}` : "Already up to date");
  } catch (e) { console.error(e); if (!quiet) toast(e.message || String(e)); }
  syncing = false; render();
}
async function connectPhone() {
  const res = await run(() => phone.connect());
  if (!res) return;
  if (!res.ok) return toast(res.reason);
  await syncPhone();
}
// Sync when the app opens and every time it comes back to the front.
let autoSynced = false;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && phone.wasConnected() && Date.now() - lastSync > 60000) syncPhone({ quiet: true });
});

// ── sign-in form ───────────────────────────────────────────────
let authMode = "signin";
function gateHtml() {
  const create = authMode === "create";
  return `
  <div class="gate-box">
    <img src="assets/logo.svg" alt="" width="112" height="112">
    <h1>StepMates</h1>
    <p class="muted">Walk together. Count together.</p>
    ${pendingLink?.startsWith("#join=") ? `<p class="muted small">Sign in to join your friend's group.</p>` : ""}
    ${googleSignIn && !phone.isNative() ? `<button class="btn primary wide" data-act="signin">Sign in with Google</button>
      <p class="muted small or">or with email</p>` : ""}
    <form data-form="auth" class="stack wide">
      ${create ? `<input name="name" placeholder="Your name" autocomplete="name" maxlength="30" required>` : ""}
      <input name="email" type="email" placeholder="Email" autocomplete="email" required>
      <input name="password" type="password" placeholder="Password (6+ characters)" minlength="6"
             autocomplete="${create ? "new-password" : "current-password"}" required>
      <button class="btn ${googleSignIn && !phone.isNative() ? "" : "primary"} wide">${create ? "Create account" : "Sign in"}</button>
    </form>
    <div class="row links">
      <button class="link" data-act="auth-mode">${create ? "I already have an account" : "Create an account"}</button>
      ${create ? "" : `<button class="link" data-act="forgot">Forgot password?</button>`}
    </div>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
  </div>`;
}
const AUTH_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account with that email. Tap “Create an account”.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
};

// ── events ─────────────────────────────────────────────────────
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "edit-today") editDay(today());
  else if (act === "edit-day") editDay(el.dataset.date);
  else if (act === "walk") walkMode();
  else if (act === "range") { boardRange = el.dataset.range; render(); }
  else if (act === "invite") invite(el.dataset.code);
  else if (act === "leave") {
    if (confirm("Leave this group? Your steps will be removed from its leaderboard.")) {
      await run(() => actions.leaveGroup(el.dataset.code), "You left the group");
      location.hash = "#/friends";
    }
  }
  else if (act === "copy") run(() => navigator.clipboard.writeText(el.dataset.text), "Copied");
  else if (act === "signin") run(() => actions.signIn());
  else if (act === "sync") syncPhone();
  else if (act === "connect") connectPhone();
  else if (act === "hc-settings") run(() => phone.openSettings());
  else if (act === "auth-mode") { authMode = authMode === "create" ? "signin" : "create"; lastGate = ""; render(); }
  else if (act === "forgot") {
    const email = $("[data-form=auth] [name=email]")?.value.trim();
    if (!email) return toast("Type your email first, then tap “Forgot password?”");
    run(() => actions.resetPassword(email), "Password reset email sent");
  }
  else if (act === "signout") run(() => actions.signOut());
});
document.addEventListener("submit", async e => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  if (form.dataset.form === "create") {
    const code = await run(() => actions.createGroup(fd.get("name").trim()), "Group created — now invite friends");
    if (code) location.hash = "#/friends/" + code;
  } else if (form.dataset.form === "join") {
    const code = await run(() => actions.joinGroup(fd.get("code")), "You joined the group!");
    if (code) location.hash = "#/friends/" + code;
  } else if (form.dataset.form === "auth") {
    const btn = form.querySelector("button"); btn.disabled = true;
    try {
      await actions.signInEmail(fd.get("email"), fd.get("password"), authMode === "create", (fd.get("name") || "").trim());
    } catch (err) { toast(AUTH_ERRORS[err.code] || err.message); }
    btn.disabled = false;
  } else if (form.dataset.form === "profile") {
    run(() => actions.saveProfile({ name: fd.get("name").trim(), goal: Number(fd.get("goal")) }), "Saved");
  }
});

// ── render ─────────────────────────────────────────────────────
function render() {
  document.body.dataset.phase = state.phase;
  const gate = $("#gate"), app = $("#app");
  if (state.phase !== "ready") {
    app.hidden = true; gate.hidden = false;
    const html = state.phase === "signin" ? gateHtml()
      : `<div class="gate-box"><img src="assets/logo.svg" alt="" width="96" height="96" class="pulse"></div>`;
    // Re-drawing would wipe what someone is typing.
    if (html !== lastGate) { gate.innerHTML = html; lastGate = html; }
    return;
  }
  lastGate = "";
  if (!autoSynced && phone.wasConnected()) { autoSynced = true; setTimeout(() => syncPhone({ quiet: true }), 0); }
  gate.hidden = true; app.hidden = false;
  // Don't wipe a form someone is typing in when a friend's steps update.
  const typing = document.activeElement?.closest?.("#view form");
  if (typing && lastHash === location.hash) return handleLink();
  lastHash = location.hash;
  const [, route = "today", arg] = (location.hash || "#/today").split("/");
  $("#view").innerHTML = route === "friends" ? viewFriends(arg) : route === "connect" ? viewConnect()
    : route === "me" ? viewMe() : viewToday();
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === (["friends", "connect", "me"].includes(route) ? route : "today")));
  $("#mode").hidden = cloudEnabled;
  handleLink();
}

captureLink();
window.addEventListener("hashchange", () => { captureLink(); render(); });
subscribe(render);
start();
if (!phone.isNative() && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
