// J&J Housemates Online — UI. One codebase for PC and phone browsers.
import * as B from "./billing.js";
import { store, cloudEnabled } from "./store.js";

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const S = store.state;
const period = () => S.settings.current_period || B.thisPeriod();
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)).slice(0, 8);
const statusOf = room => B.isOccupied(room) ? (room.status || "Unpaid") : "Vacant";

// ── small UI helpers ───────────────────────────────────────────
let toastTimer;
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2600);
}

function dialog({ title, body, submit = "Save", onSubmit, wide = false }) {
  const d = document.createElement("dialog");
  d.className = "dlg" + (wide ? " wide" : "");
  d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="dlg-body">${body}</div>
    <div class="dlg-foot"><button type="button" class="btn ghost" data-close>${onSubmit ? "Cancel" : "Close"}</button>
    ${onSubmit ? `<button class="btn primary">${esc(submit)}</button>` : ""}</div></form>`;
  document.body.append(d);
  const done = () => { if (d.open) d.close(); d.remove(); };
  $("[data-close]", d).onclick = done;
  $("form", d).addEventListener("submit", e => {
    e.preventDefault();
    if (!onSubmit || onSubmit(Object.fromEntries(new FormData(e.target)), d) !== false) done();
  });
  d.addEventListener("close", () => d.remove());   // Esc key
  d.showModal();
  return d;
}

const fld = (label, name, value = "", attrs = "", cls = "") =>
  `<label class="fld ${cls}">${esc(label)}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;

function download(filename, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
  catch { toast("Could not copy — select the text and copy it manually", true); }
}

// ── gate screens: loading / sign-in / not authorised / first-run setup ──
function renderGate() {
  const logo = `<img src="assets/logo.png" alt="" onerror="this.remove()">
    <div class="brand-name">J&amp;J Housemates</div><div class="brand-sub">Boarding House Management</div>`;
  const err = S.error ? `<div class="banner err">${esc(S.error)}</div>` : "";
  let html = "";
  if (S.phase === "loading") html = `${logo}<p>Loading…</p>`;
  if (S.phase === "signin") html = `${logo}${err}<p>Sign in with an authorised Google account to manage the boarding house.</p>
    <button class="btn primary" data-act="signin">Sign in with Google</button>`;
  if (S.phase === "denied") html = `${logo}<div class="banner err">${esc(S.user?.email || "This account")} is not authorised
    for this boarding house.</div><p>Ask the owner to add your email to the access list, or switch accounts.</p>
    <button class="btn" data-act="signout">Sign out</button>`;
  if (S.phase === "setup") html = `${logo}${err}<p>No data here yet. Bring in your existing records from the PC app,
    or start with the 11 default rooms.</p>
    <button class="btn primary" data-act="import">Import boarding_house_data.json</button>
    <button class="btn" data-act="fresh">Start fresh</button>
    ${S.user ? `<button class="btn ghost" data-act="signout">Sign out (${esc(S.user.email)})</button>` : ""}`;
  $("#gate").innerHTML = `<div class="gate-card">${html}</div>`;
}

function pickImport() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const data = B.fromPCData(JSON.parse(await file.text()));
      if (!data.settings.current_period) data.settings.current_period = B.thisPeriod();
      await store.importAll(data);
      store.log(`Imported ${Object.keys(data.rooms).length} rooms from ${file.name}`);
      toast(`Imported ${Object.keys(data.rooms).length} rooms`);
    } catch (e) { toast("Import failed: " + e.message, true); }
  };
  inp.click();
}

async function startFresh() {
  try {
    await store.importAll({ settings: { ...B.DEFAULT_SETTINGS, current_period: B.thisPeriod() },
                            rooms: B.buildDefaultRooms() });
  } catch (e) { toast("Setup failed: " + e.message, true); }
}

// ── dashboard ──────────────────────────────────────────────────
const Dashboard = {
  mount(el) { this.el = el; this.update(); },
  update() {
    const per = period(), { month, year } = B.splitPeriod(per);
    const keys = B.sortRoomKeys(S.rooms);
    const count = { Paid: 0, Partial: 0, Unpaid: 0, Vacant: 0 };
    let billed = 0, collected = 0, outstanding = 0;
    for (const k of keys) {
      const r = S.rooms[k]; count[statusOf(r)]++;
      if (!B.isOccupied(r)) continue;
      const total = B.bill(r, S.settings).total, paid = B.paidFor(r, per);
      billed += total; collected += paid; outstanding += Math.max(0, total - paid);
    }
    const thisYear = new Date().getFullYear();
    const years = [...new Set([year, thisYear - 1, thisYear, thisYear + 1])].sort();
    const card = k => {
      const r = S.rooms[k], st = statusOf(r), occ = B.isOccupied(r);
      const total = B.bill(r, S.settings).total, bal = Math.max(0, total - B.paidFor(r, per));
      return `<a class="room s-${st}" href="#/room/${encodeURIComponent(k)}">
        <div class="rk"><span>${esc(k)} · ${esc(r.label)}</span></div>
        <div class="rn">${occ ? esc(r.boarder_name) : '<span class="muted">Vacant</span>'}</div>
        <div><span class="pill st-${st}">${st}</span></div>
        <div class="ra">${occ ? (st === "Paid" ? B.peso(total) : B.peso(bal) + ' <span class="muted small">due</span>') : ""}</div></a>`;
    };
    const group = (title, list) => list.length
      ? `<h2>${title}</h2><div class="rooms">${list.map(card).join("")}</div>` : "";
    this.el.innerHTML = `
      ${S.mode === "local" ? `<div class="banner">Demo mode — data is saved in this browser only and is not shared with
        other devices yet. Finish the Firebase steps in SETUP.md to go online.</div>` : ""}
      ${S.error ? `<div class="banner err">${esc(S.error)}</div>` : ""}
      <div class="page-head"><h1>Rooms</h1>
        <div class="period">
          <select id="per-m" aria-label="Month">${B.MONTHS.map((m, i) => `<option ${i === month ? "selected" : ""}>${m}</option>`).join("")}</select>
          <select id="per-y" aria-label="Year">${years.map(y => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
        </div>
        <button class="btn gold" data-act="rollover">Start ${esc(B.nextPeriod(per))} ▸</button>
      </div>
      <div class="stats">
        <div class="stat"><b class="st-Paid">${count.Paid}</b><span>Paid</span></div>
        <div class="stat"><b class="st-Partial">${count.Partial}</b><span>Partial</span></div>
        <div class="stat"><b class="st-Unpaid">${count.Unpaid}</b><span>Unpaid</span></div>
        <div class="stat"><b class="st-Vacant">${count.Vacant}</b><span>Vacant</span></div>
        <div class="stat"><b>${B.peso(billed)}</b><span>Billed</span></div>
        <div class="stat"><b class="gold">${B.peso(collected)}</b><span>Collected</span></div>
        <div class="stat"><b>${B.peso(outstanding)}</b><span>Outstanding</span></div>
      </div>
      ${group("Standard rooms", keys.filter(k => !B.isPremium(S.rooms[k])))}
      ${group("Premium rooms", keys.filter(k => B.isPremium(S.rooms[k])))}`;
  },
  onChange(e) {
    if (e.target.id === "per-m" || e.target.id === "per-y")
      store.updateSettings({ current_period: `${$("#per-m").value} ${$("#per-y").value}` });
  },
  onAct(act) { if (act === "rollover") rollover(); },
};

// Close the current period for every occupied room and open the next one:
// snapshot the bill, carry the meter reading forward, reset the month's extras.
function rollover() {
  const per = period(), next = B.nextPeriod(per);
  const occupied = B.sortRoomKeys(S.rooms).filter(k => B.isOccupied(S.rooms[k]));
  const noReading = occupied.filter(k => !String(S.rooms[k].meter_curr || "").trim());
  dialog({
    title: `Start ${next}`, submit: `Start ${next}`,
    body: `<p>This closes <b>${esc(per)}</b> for ${occupied.length} occupied room(s):</p>
      <ul class="small"><li>Each room's ${esc(per)} bill is saved to its Bill History.</li>
      <li>The current meter reading becomes the previous reading.</li>
      <li>Consumption and other charges are cleared, status goes back to Unpaid.</li></ul>
      ${noReading.length ? `<div class="banner">No current meter reading yet for: ${esc(noReading.join(", "))}.
        Their previous reading will be kept as is.</div>` : ""}`,
    onSubmit() {
      for (const k of occupied) {
        const r = S.rooms[k];
        const patch = { bill_snapshots: B.snapshot(r, S.settings, per, "period_change"),
                        status: "Unpaid", consumption_kwh: "", other_charge: "", other_remarks: "" };
        if (String(r.meter_curr || "").trim()) { patch.meter_prev = r.meter_curr; patch.meter_curr = ""; }
        store.updateRoom(k, patch);
      }
      store.updateSettings({ current_period: next });
      store.log(`New billing period: ${per} → ${next}  |  ${occupied.length} room(s) rolled over`);
      toast(`Now billing ${next}`);
    },
  });
}

// ── room detail ────────────────────────────────────────────────
const Room = {
  mount(el, key) {
    this.el = el; this.key = key;
    const r = S.rooms[key];
    if (!r) { el.innerHTML = `<p>Room not found. <a href="#/dashboard">Back to rooms</a></p>`; return; }
    const f = (label, field, attrs = "", cls = "") =>
      `<label class="fld ${cls}">${label}<input data-field="${field}" ${attrs}></label>`;
    el.innerHTML = `
      <div class="page-head">
        <a class="btn ghost sm" href="#/dashboard">← Rooms</a>
        <h1>${esc(key)}</h1>
        <button class="pill" data-act="status" data-out="status" title="Tap to change status"></button>
      </div>

      <section class="card"><h2>Boarder</h2><div class="grid">
        ${f("Room label", "label")}
        ${f("Boarder name", "boarder_name", 'autocomplete="off"')}
        ${f("Phone", "boarder_phone", 'type="tel"')}
        ${f("Email", "boarder_email", 'type="email"')}
        ${f("2nd boarder", "boarder2_name", 'autocomplete="off"')}
        ${f("2nd boarder phone", "boarder2_phone", 'type="tel"')}
        ${f("2nd boarder email", "boarder2_email", 'type="email"')}
        ${f("Emergency contact", "emerg_name", 'autocomplete="off"')}
        ${f("Emergency phone", "emerg_phone", 'type="tel"')}
        ${f("Province / home address", "province")}
        ${f("Check-in", "checkin_dt", 'placeholder="YYYY-MM-DD HH:MM"')}
        ${f("Move-in date", "move_in_date", 'type="date"')}
      </div></section>

      <section class="card"><h2>Charges — <span data-out="period"></span></h2><div class="grid">
        ${f("Rental fee (₱)", "rental_fee", 'inputmode="decimal"')}
        ${f("Meter ID", "meter_id")}
        ${f("Previous reading", "meter_prev", 'inputmode="decimal"')}
        ${f("Current reading", "meter_curr", 'inputmode="decimal"')}
        ${f("Consumption (kWh)", "consumption_kwh", 'inputmode="decimal"')}
        ${f("Persons (water)", "water_persons", 'inputmode="numeric" placeholder="auto"')}
        ${f("Other charge (₱)", "other_charge", 'inputmode="decimal"')}
        ${f("Other charge remarks", "other_remarks", "", "full")}
      </div>
      <table class="breakdown" style="margin-top:14px">
        <tr><td>Rental</td><td class="num" data-out="rental"></td></tr>
        <tr><td>Power <span class="muted small" data-out="power-note"></span></td><td class="num" data-out="power"></td></tr>
        <tr><td>Water <span class="muted small" data-out="water-note"></span></td><td class="num" data-out="water"></td></tr>
        <tr><td>Other <span class="muted small" data-out="other-note"></span></td><td class="num" data-out="other"></td></tr>
        <tr class="total"><td>Total due</td><td class="num" data-out="total"></td></tr>
      </table></section>

      <section class="card"><h2>Payments</h2>
        <div class="trio"><div><span>Total due</span><b data-out="total"></b></div>
          <div><span>Paid</span><b class="st-Paid" data-out="paid"></b></div>
          <div><span>Balance</span><b data-out="balance"></b></div></div>
        <div class="btn-row" style="margin-bottom:10px">
          <button class="btn primary" data-act="pay">+ Record payment</button>
          <button class="btn" data-act="history">Bill history</button>
        </div>
        <div id="pay-list"></div></section>

      <section class="card"><h2>Send / Print</h2><div class="btn-row">
        <button class="btn" data-act="share">Share bill</button>
        <button class="btn" data-act="copy">Copy bill text</button>
        <button class="btn" data-act="statement">Billing Statement (PDF)</button>
        <button class="btn" data-act="receipt">Official Receipt (PDF)</button>
      </div></section>

      <section class="card"><h2>Visitors / additional occupants</h2>
        <div id="visitor-list"></div>
        <button class="btn sm" data-act="visitor-add" style="margin-top:8px">+ Add visitor</button></section>

      <section class="card"><h2>Notes</h2><textarea data-field="notes"></textarea></section>

      <section class="card"><div class="btn-row">
        <button class="btn danger" data-act="moveout">Move out tenant…</button></div></section>`;
    this.update();
  },

  // Patch values in place so typing on a phone is never interrupted by a sync.
  update() {
    const r = S.rooms[this.key];
    if (!r || !this.el) return;
    const per = period(), b = B.bill(r, S.settings), paid = B.paidFor(r, per), bal = b.total - paid;
    for (const inp of $$("[data-field]", this.el))
      if (inp !== document.activeElement && inp.value !== String(r[inp.dataset.field] ?? ""))
        inp.value = r[inp.dataset.field] ?? "";
    const st = statusOf(r);
    const out = {
      period: per, status: st,
      rental: B.peso(b.rental), power: B.peso(b.power), water: B.peso(b.water), other: B.peso(b.other),
      total: B.peso(b.total), paid: B.peso(paid), balance: B.peso(Math.max(0, bal)),
      "power-note": `${b.kwh.toFixed(2)} kWh × ₱${B.money(b.rate)}`,
      "water-note": `${b.persons} person${b.persons > 1 ? "s" : ""} × ₱${B.money(b.wr)}`,
      "other-note": b.otherR,
    };
    for (const o of $$("[data-out]", this.el)) o.textContent = out[o.dataset.out] ?? "";
    const sb = $('[data-act="status"]', this.el);
    sb.className = `pill st-${st}`; sb.disabled = st === "Vacant";
    $('[data-out="balance"]', this.el).className = bal > 0 ? "st-Unpaid" : "st-Paid";

    const pays = [...r.payments].reverse();
    $("#pay-list", this.el).innerHTML = pays.length ? `<div class="tbl-wrap"><table>
      <tr><th>Date</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Ref #</th><th>Remarks</th><th></th></tr>
      ${pays.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.period)}</td><td class="num gold">${B.peso(p.amount)}</td>
        <td>${esc(p.method)}</td><td>${esc(p.ref || "—")}</td><td>${esc(p.remarks)}</td>
        <td><button class="btn sm danger" data-act="pay-del" data-id="${esc(p.id)}" aria-label="Delete payment">✕</button></td></tr>`).join("")}
      </table></div>` : `<p class="muted small">No payments recorded yet.</p>`;

    $("#visitor-list", this.el).innerHTML = r.visitors.length ? r.visitors.map((v, i) => `<div class="list-item">
      <div><b>${esc(v.name)}</b> <span class="muted small">${esc(v.phone)}</span>
        <div class="muted small">${esc(v.remarks)}${v.province ? " · " + esc(v.province) : ""}</div>
        <div class="muted small">In: ${esc(v.checkin_dt || "—")} · Out: ${esc(v.checkout_dt || "—")}
          ${v.emerg_name ? ` · Emergency: ${esc(v.emerg_name)} ${esc(v.emerg_phone)}` : ""}</div></div>
      <div class="btn-row">${v.checkout_dt ? "" : `<button class="btn sm" data-act="visitor-out" data-i="${i}">Check out</button>`}
        <button class="btn sm danger" data-act="visitor-del" data-i="${i}" aria-label="Remove visitor">✕</button></div></div>`).join("")
      : `<p class="muted small">No visitors recorded.</p>`;
  },

  onChange(e) {
    const field = e.target.dataset.field;
    if (!field) return;
    const key = this.key, r = S.rooms[key];
    let value = e.target.value.trim();
    const patch = {};
    if (field === "boarder_name" && value && !B.isOccupied(r)) {
      if (!r.checkin_dt) patch.checkin_dt = B.stamp();
      if (!r.move_in_date) patch.move_in_date = B.today();
      store.log(`Move-in: ${value}  |  Room ${key}`);
    }
    if (field === "water_persons" && value !== "") value = String(Math.max(1, parseInt(value, 10) || 1));
    if (field === "meter_prev" || field === "meter_curr") {
      const prev = field === "meter_prev" ? value : r.meter_prev;
      const curr = field === "meter_curr" ? value : r.meter_curr;
      patch.consumption_kwh = String(curr).trim() === "" ? "" : Math.max(0, B.num(curr) - B.num(prev)).toFixed(2);
      if (field === "meter_curr" && value !== "")
        store.log(`Meter reading ${value} (${patch.consumption_kwh} kWh)  |  Room ${key}`);
    }
    patch[field] = value;
    store.updateRoom(key, patch);
  },

  onAct(act, btn) {
    const key = this.key, r = S.rooms[key], per = period();
    const text = () => B.billMessage(key, r, S.settings, per);
    if (act === "status") {
      const next = { Unpaid: "Paid", Paid: "Partial", Partial: "Unpaid" }[r.status] || "Unpaid";
      store.updateRoom(key, { status: next });
      store.log(`Status → ${next}  |  Room ${key} (${r.boarder_name})`);
    }
    if (act === "pay") payDialog(key);
    if (act === "pay-del" && confirm("Delete this payment record? This cannot be undone.")) {
      const payments = r.payments.filter(p => p.id !== btn.dataset.id);
      const next = { ...r, payments };
      next.status = B.statusFor(B.bill(r, S.settings).total, B.paidFor(next, per));
      store.updateRoom(key, { payments, status: next.status });
      store.log(`Payment deleted  |  Room ${key}  |  ID: ${btn.dataset.id}`);
    }
    if (act === "history") historyDialog(key);
    if (act === "share") shareBill(key, text());
    if (act === "copy") copyText(text());
    if (act === "statement") printStatement(key);
    if (act === "receipt") printReceipt(key);
    if (act === "visitor-add") visitorDialog(key);
    if (act === "visitor-out") {
      const visitors = r.visitors.map((v, i) => i === +btn.dataset.i ? { ...v, checkout_dt: B.stamp() } : v);
      store.updateRoom(key, { visitors });
    }
    if (act === "visitor-del" && confirm("Remove this visitor record?"))
      store.updateRoom(key, { visitors: r.visitors.filter((_, i) => i !== +btn.dataset.i) });
    if (act === "moveout") moveOutDialog(key);
  },
};

function payDialog(key) {
  const r = S.rooms[key], per = period();
  const due = B.bill(r, S.settings).total, suggested = Math.max(0, due - B.paidFor(r, per));
  dialog({
    title: "Record payment", submit: "Save payment",
    body: `<div class="muted small">${esc(r.boarder_name || "Boarder")} · ${esc(key)} · ${esc(per)} ·
        balance ${B.peso(suggested)}</div>
      ${fld("Amount paid (₱)", "amount", suggested.toFixed(2), 'inputmode="decimal" required')}
      <div class="radio-row">${["Cash", "GCash", "PayMaya", "Bank"].map((m, i) =>
        `<label><input type="radio" name="method" value="${m}" ${i ? "" : "checked"}>${m}</label>`).join("")}</div>
      ${fld("Date paid", "date", B.today(), 'type="date" required')}
      ${fld("Reference # (optional)", "ref")}
      ${fld("Remarks (optional)", "remarks")}`,
    onSubmit(v) {
      const amt = B.num(v.amount);
      if (amt <= 0) { toast("Enter an amount greater than 0", true); return false; }
      const payments = [...r.payments, { id: newId(), period: per, date: v.date, amount: String(amt),
                                         method: v.method, ref: v.ref.trim(), remarks: v.remarks.trim() }];
      const next = { ...r, payments };
      next.status = B.statusFor(due, B.paidFor(next, per));
      store.updateRoom(key, { payments, status: next.status,
                              bill_snapshots: B.snapshot(next, S.settings, per, "payment") });
      store.log(`Payment ₱${B.money(amt)} (${v.method}) recorded  |  Room ${key}  |  ${per}  |  Ref: ${v.ref.trim() || "—"}`);
      toast(`${B.peso(amt)} via ${v.method} recorded`);
    },
  });
}

function historyDialog(key) {
  const snaps = [...S.rooms[key].bill_snapshots].reverse();
  dialog({
    title: `Bill history — ${key}`, wide: true,
    body: snaps.length ? `<div class="tbl-wrap"><table>
      <tr><th>Period</th><th>Boarder</th><th class="num">kWh</th><th class="num">Rental</th><th class="num">Power</th>
        <th class="num">Water</th><th class="num">Other</th><th class="num">Total</th><th class="num">Paid</th>
        <th class="num">Balance</th><th>Status</th></tr>
      ${snaps.map(s => `<tr><td>${esc(s.period)}</td><td>${esc(s.boarder_name)}</td><td class="num">${B.num(s.kwh).toFixed(2)}</td>
        <td class="num">${B.money(s.rental)}</td><td class="num">${B.money(s.power)}</td><td class="num">${B.money(s.water)}</td>
        <td class="num">${B.money(s.other)}</td><td class="num gold">${B.money(s.total_due)}</td>
        <td class="num">${B.money(s.total_paid)}</td><td class="num">${B.money(s.balance)}</td>
        <td><span class="pill st-${esc(s.status)}">${esc(s.status)}</span></td></tr>`).join("")}</table></div>`
      : `<p class="muted">No bills saved yet. A bill is saved whenever a payment is recorded or a new period is started.</p>`,
  });
}

function visitorDialog(key) {
  dialog({
    title: "Add visitor", submit: "Add",
    body: fld("Name", "name", "", "required") + fld("Phone", "phone", "", 'type="tel"') +
      fld("Remarks (relationship, purpose)", "remarks") + fld("Check-in", "checkin_dt", B.stamp()) +
      fld("Province / home address", "province") + fld("Emergency contact", "emerg_name") +
      fld("Emergency phone", "emerg_phone", "", 'type="tel"'),
    onSubmit(v) {
      store.updateRoom(key, { visitors: [...S.rooms[key].visitors, { ...v, checkout_dt: "" }] });
      store.log(`Visitor added: ${v.name}  |  Room ${key}`);
    },
  });
}

function moveOutDialog(key) {
  const r = S.rooms[key];
  if (!B.isOccupied(r)) return toast("This room is already vacant", true);
  dialog({
    title: "Move out tenant", submit: "Confirm move out",
    body: `<div><b>${esc(r.boarder_name)}</b><div class="muted small">Room ${esc(key)} — ${esc(r.label)} ·
        moved in ${esc(r.move_in_date || "unknown")}</div></div>
      ${fld("Move-out date", "out", B.today(), 'type="date" required')}
      ${fld("Remarks (optional — e.g. reason for leaving)", "remarks")}
      <div class="banner">All tenant data will be archived under Past Tenants and the room cleared for a new tenant.</div>`,
    onSubmit(v) {
      const archive = {
        room_key: key, room_label: r.label, room_type: r.type,
        boarder_name: r.boarder_name, boarder_email: r.boarder_email, boarder_phone: r.boarder_phone,
        boarder2_name: r.boarder2_name, boarder2_email: r.boarder2_email, boarder2_phone: r.boarder2_phone,
        rental_fee: r.rental_fee, move_in_date: r.move_in_date, move_out_date: v.out, remarks: v.remarks.trim(),
        payments: r.payments, documents: r.documents, bill_snapshots: r.bill_snapshots,
        final_meter: r.meter_curr, notes: r.notes, archived_on: B.stamp(true),
      };
      const blank = B.defaultRoom(r.label, r.type, r.rental_fee);
      store.updateRoom(key, {
        ...blank, meter_id: r.meter_id,
        meter_prev: r.meter_curr || r.meter_prev,       // last reading carries over
        tenant_history: [...r.tenant_history, archive],
      });
      store.log(`Move-out: ${archive.boarder_name}  |  Room ${key}  |  Out: ${v.out}  |  ${archive.remarks || "No remarks"}`);
      toast(`${archive.boarder_name} moved out of ${key}`);
    },
  });
}

async function shareBill(key, text) {
  const r = S.rooms[key];
  if (navigator.share) {
    try { await navigator.share({ title: `Billing Statement — ${period()}`, text }); } catch { /* cancelled */ }
    return;
  }
  const subject = encodeURIComponent(`Billing Statement — ${period()}`), body = encodeURIComponent(text);
  dialog({
    title: "Send bill",
    body: `<pre class="msg">${esc(text)}</pre><div class="btn-row">
      <a class="btn" href="mailto:${encodeURIComponent(r.boarder_email || "")}?subject=${subject}&body=${body}">Email</a>
      <a class="btn" href="sms:${encodeURIComponent(r.boarder_phone || "")}?body=${body}">SMS</a>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${(r.boarder_phone || "").replace(/\D/g, "")}?text=${body}">WhatsApp</a></div>`,
  });
}

// ── printable documents (browser "Save as PDF") ────────────────
function printDoc(html, pageSize) {
  let style = $("#page-size");
  if (!style) { style = document.createElement("style"); style.id = "page-size"; document.head.append(style); }
  style.textContent = `@page { size: ${pageSize}; margin: ${pageSize === "A5" ? "9mm" : "14mm"}; }`;
  $("#print-area").innerHTML = html;
  const img = $("#print-area img");
  const go = () => window.print();
  if (img && !img.complete) { img.onload = go; img.onerror = () => { img.remove(); go(); }; } else go();
}

function docHead(kind, sub) {
  return `<div class="doc-head"><img src="assets/logo.png" alt="">
    <div class="biz">${esc(B.BUSINESS_NAME)}</div>
    <div class="kind">${kind}<small>${esc(sub)}</small></div></div>`;
}
function docFoot() {
  const s = S.settings;
  const bits = [s.footer_address, s.footer_contact, s.footer_phone].filter(Boolean).map(esc).join(" · ");
  return `<div class="foot">${bits || esc(B.BUSINESS_NAME)}</div>`;
}
function chargeRows(b) {
  return `<tr><td>Rental fee</td><td></td><td class="num">${B.money(b.rental)}</td></tr>
    <tr><td>Power</td><td>${b.kwh.toFixed(2)} kWh × ₱${B.money(b.rate)}</td><td class="num">${B.money(b.power)}</td></tr>
    <tr><td>Water</td><td>${b.persons} person${b.persons > 1 ? "s" : ""} × ₱${B.money(b.wr)}</td><td class="num">${B.money(b.water)}</td></tr>
    ${b.other > 0 ? `<tr><td>Other charges</td><td>${esc(b.otherR)}</td><td class="num">${B.money(b.other)}</td></tr>` : ""}`;
}

function printStatement(key) {
  const r = S.rooms[key], per = period(), b = B.bill(r, S.settings), paid = B.paidFor(r, per);
  const due = S.settings.due_day || "25";
  printDoc(`<div class="doc">${docHead("BILLING STATEMENT", per)}
    <table class="meta">
      <tr><td>Billed to</td><td><b>${esc(r.boarder_name || "Boarder")}</b>${r.boarder2_name ? " &amp; " + esc(r.boarder2_name) : ""}</td>
          <td>Date issued</td><td>${B.today()}</td></tr>
      <tr><td>Room / unit</td><td>${esc(key)} — ${esc(r.label)}</td><td>Meter ID</td><td>${esc(r.meter_id || "—")}</td></tr>
      <tr><td>Previous reading</td><td>${esc(r.meter_prev || "—")}</td><td>Current reading</td><td>${esc(r.meter_curr || "—")}</td></tr>
    </table>
    <table><tr><th>Description</th><th>Details</th><th class="num">Amount (₱)</th></tr>
      ${chargeRows(b)}
      <tr class="total"><td colspan="2">TOTAL AMOUNT DUE</td><td class="num">₱ ${B.money(b.total)}</td></tr>
      ${paid > 0 ? `<tr><td colspan="2">Less: payments received</td><td class="num">${B.money(paid)}</td></tr>
        <tr class="total"><td colspan="2">BALANCE</td><td class="num">₱ ${B.money(Math.max(0, b.total - paid))}</td></tr>` : ""}
    </table>
    <p>Please settle on or before the <b>${esc(due)}${B.ordinal(due)}</b> of the month. Thank you!</p>
    ${docFoot()}</div>`, "A4");
}

function printReceipt(key) {
  const r = S.rooms[key], per = period(), b = B.bill(r, S.settings);
  const pays = B.paymentsFor(r, per);
  if (!pays.length) return toast(`No payments recorded for ${per} yet`, true);
  const paid = B.paidFor(r, per), { month, year } = B.splitPeriod(per);
  const orNo = `OR-${year}${String(month + 1).padStart(2, "0")}-${key}`;
  printDoc(`<div class="doc a5">${docHead("OFFICIAL RECEIPT", orNo)}
    <table class="meta">
      <tr><td>Received from</td><td><b>${esc(r.boarder_name || "Boarder")}</b></td></tr>
      <tr><td>Room / unit</td><td>${esc(key)} — ${esc(r.label)}</td></tr>
      <tr><td>Billing period</td><td>${esc(per)}</td></tr>
      <tr><td>Date issued</td><td>${B.today()}</td></tr>
    </table>
    <table><tr><th>Charges</th><th>Details</th><th class="num">Amount (₱)</th></tr>${chargeRows(b)}
      <tr class="total"><td colspan="2">TOTAL DUE</td><td class="num">₱ ${B.money(b.total)}</td></tr></table>
    <table><tr><th>Date paid</th><th>Method</th><th>Reference #</th><th class="num">Amount (₱)</th></tr>
      ${pays.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || "—")}</td>
        <td class="num">${B.money(p.amount)}</td></tr>`).join("")}
      <tr class="total"><td colspan="3">TOTAL PAID</td><td class="num">₱ ${B.money(paid)}</td></tr>
      <tr><td colspan="3">Balance</td><td class="num">${B.money(Math.max(0, b.total - paid))}</td></tr></table>
    <div class="sign"><div>${esc(S.settings.footer_contact || "Authorised signature")}</div></div>
    ${docFoot()}</div>`, "A5");
}

// ── notifications ──────────────────────────────────────────────
const Notify = {
  mount(el) { this.el = el; this.update(); },
  update() {
    const per = period();
    const keys = B.sortRoomKeys(S.rooms).filter(k => B.isOccupied(S.rooms[k]));
    this.el.innerHTML = `<div class="page-head"><h1>Send bills — ${esc(per)}</h1></div>` +
      (keys.length ? keys.map(k => {
        const r = S.rooms[k], st = statusOf(r);
        return `<section class="card"><div class="page-head" style="margin-bottom:0">
            <div style="flex:1"><b>${esc(k)} · ${esc(r.boarder_name)}</b>
              <div class="muted small">${esc(r.boarder_phone || "no phone")} · ${esc(r.boarder_email || "no email")}</div></div>
            <span class="pill st-${st}">${st}</span></div>
          <details><summary class="muted small" style="margin-top:8px;cursor:pointer">Preview message</summary>
            <pre class="msg">${esc(B.billMessage(k, r, S.settings, per))}</pre></details>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn primary sm" data-act="share" data-key="${esc(k)}">Share / send</button>
            <button class="btn sm" data-act="copy" data-key="${esc(k)}">Copy</button>
            <button class="btn sm" data-act="statement" data-key="${esc(k)}">Statement PDF</button></div></section>`;
      }).join("") : `<p class="muted">No occupied rooms yet.</p>`);
  },
  onAct(act, btn) {
    const k = btn.dataset.key, text = () => B.billMessage(k, S.rooms[k], S.settings, period());
    if (act === "share") shareBill(k, text());
    if (act === "copy") copyText(text());
    if (act === "statement") printStatement(k);
  },
};

// ── ledger ─────────────────────────────────────────────────────
const Ledger = {
  filter: { period: "", room: "", past: false },
  mount(el) { this.el = el; this.filter.period = period(); this.update(); },
  rows() {
    const rows = [];
    for (const k of B.sortRoomKeys(S.rooms)) {
      const r = S.rooms[k];
      for (const p of r.payments) rows.push({ ...p, room: k, boarder: r.boarder_name });
      if (this.filter.past) for (const t of r.tenant_history)
        for (const p of t.payments || []) rows.push({ ...p, room: k, boarder: t.boarder_name + " (past)" });
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  update() {
    const all = this.rows(), f = this.filter;
    const periods = [...new Set([period(), ...all.map(p => p.period)])];
    const rows = all.filter(p => (!f.period || p.period === f.period) && (!f.room || p.room === f.room));
    this.shown = rows;
    const total = rows.reduce((s, p) => s + B.num(p.amount), 0);
    const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(label)}</option>`;
    this.el.innerHTML = `<div class="page-head"><h1>Payment ledger</h1>
        <button class="btn" data-act="csv">Export to Excel (CSV)</button></div>
      <section class="card"><div class="grid">
        <label class="fld">Period<select id="lf-period">${opt("", "All periods", f.period)}${periods.map(p => opt(p, p, f.period)).join("")}</select></label>
        <label class="fld">Room<select id="lf-room">${opt("", "All rooms", f.room)}${B.sortRoomKeys(S.rooms).map(k => opt(k, `${k} · ${S.rooms[k].label}`, f.room)).join("")}</select></label>
        <label class="fld">Past tenants<select id="lf-past">${opt("0", "Current tenants only", f.past ? "1" : "0")}${opt("1", "Include past tenants", f.past ? "1" : "0")}</select></label>
      </div></section>
      <section class="card"><div class="page-head"><h2 style="margin:0;flex:1">${rows.length} payment(s)</h2>
          <b class="gold">${B.peso(total)}</b></div>
        ${rows.length ? `<div class="tbl-wrap"><table>
          <tr><th>Date</th><th>Room</th><th>Boarder</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Ref #</th><th>Remarks</th></tr>
          ${rows.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.room)}</td><td>${esc(p.boarder)}</td><td>${esc(p.period)}</td>
            <td class="num gold">${B.peso(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || "—")}</td><td>${esc(p.remarks)}</td></tr>`).join("")}
          </table></div>` : `<p class="muted small">No payments match these filters.</p>`}</section>`;
  },
  onChange() {
    this.filter = { period: $("#lf-period").value, room: $("#lf-room").value, past: $("#lf-past").value === "1" };
    this.update();
  },
  onAct(act) {
    if (act !== "csv") return;
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Date", "Room", "Boarder", "Period", "Amount", "Method", "Reference", "Remarks"].join(",")]
      .concat(this.shown.map(p => [p.date, p.room, p.boarder, p.period, B.num(p.amount).toFixed(2), p.method, p.ref, p.remarks].map(q).join(",")));
    download(`payment_ledger_${B.today().replace(/-/g, "")}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  },
};

// ── past tenants ───────────────────────────────────────────────
const Tenants = {
  mount(el) { this.el = el; this.update(); },
  list() {
    return B.sortRoomKeys(S.rooms).flatMap(k => S.rooms[k].tenant_history.map(t => ({ ...t, room_key: t.room_key || k })))
      .sort((a, b) => String(b.move_out_date).localeCompare(String(a.move_out_date)));
  },
  update() {
    const list = this.list(); this.shown = list;
    this.el.innerHTML = `<div class="page-head"><h1>Past tenants</h1></div>` + (list.length
      ? `<section class="card">${list.map((t, i) => `<div class="list-item"><div><b>${esc(t.boarder_name)}</b>
          <div class="muted small">${esc(t.room_key)} · ${esc(t.room_label)} · ${esc(t.move_in_date || "?")} → ${esc(t.move_out_date)}</div>
          <div class="muted small">${esc(t.remarks)}</div></div>
          <button class="btn sm" data-act="view" data-i="${i}">View</button></div>`).join("")}</section>`
      : `<p class="muted">No archived tenants yet. Tenants appear here after "Move out tenant".</p>`);
  },
  onAct(act, btn) {
    if (act !== "view") return;
    const t = this.shown[+btn.dataset.i], pays = t.payments || [];
    dialog({
      title: t.boarder_name, wide: true,
      body: `<div class="small">Room ${esc(t.room_key)} — ${esc(t.room_label)} · rental ${B.peso(t.rental_fee)}<br>
          ${esc(t.boarder_phone)} ${esc(t.boarder_email)}<br>
          ${t.boarder2_name ? `2nd boarder: ${esc(t.boarder2_name)} ${esc(t.boarder2_phone)}<br>` : ""}
          Stay: ${esc(t.move_in_date || "?")} → ${esc(t.move_out_date)} · final meter ${esc(t.final_meter || "—")}<br>
          ${t.remarks ? `Remarks: ${esc(t.remarks)}<br>` : ""}${t.notes ? `Notes: ${esc(t.notes)}` : ""}</div>
        ${pays.length ? `<div class="tbl-wrap"><table><tr><th>Date</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Ref #</th></tr>
          ${pays.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.period)}</td><td class="num gold">${B.peso(p.amount)}</td>
            <td>${esc(p.method)}</td><td>${esc(p.ref || "—")}</td></tr>`).join("")}</table></div>
          <div class="right">Total paid: <b class="gold">${B.peso(pays.reduce((s, p) => s + B.num(p.amount), 0))}</b></div>`
          : `<p class="muted small">No payments on record.</p>`}`,
    });
  },
};

// ── activity log ───────────────────────────────────────────────
const Log = {
  async mount(el) {
    this.el = el;
    el.innerHTML = `<div class="page-head"><h1>Activity log</h1><button class="btn sm" data-act="refresh">Refresh</button></div>
      <section class="card"><p class="muted small">Loading…</p></section>`;
    try {
      const rows = await store.getLog();
      $("section", el).innerHTML = rows.length ? rows.map(e => `<div class="list-item"><div>
        <div class="small">${esc(e.text)}</div><div class="muted small">${esc(e.ts)} · ${esc(e.user)}</div></div></div>`).join("")
        : `<p class="muted small">No log entries yet.</p>`;
    } catch (e) { $("section", el).innerHTML = `<div class="banner err">${esc(e.message)}</div>`; }
  },
  update() {},
  onAct(act) { if (act === "refresh") this.mount(this.el); },
};

// ── settings ───────────────────────────────────────────────────
const Settings = {
  mount(el) {
    this.el = el;
    const f = (label, key, attrs = "", cls = "") =>
      `<label class="fld ${cls}">${label}<input data-set="${key}" ${attrs}></label>`;
    el.innerHTML = `<div class="page-head"><h1>Settings</h1></div>
      <section class="card"><h2>Rates</h2><div class="grid">
        ${f("Power rate (₱ per kWh)", "power_rate", 'inputmode="decimal"')}
        ${f("Water rate (₱ per person)", "water_rate", 'inputmode="decimal"')}
        ${f("Due day of the month", "due_day", 'inputmode="numeric"')}</div></section>
      <section class="card"><h2>Statement &amp; receipt footer</h2><div class="grid">
        ${f("Address", "footer_address", "", "span2")}
        ${f("Contact person", "footer_contact")}
        ${f("Contact phone", "footer_phone", 'type="tel"')}</div></section>
      <section class="card"><h2>Data</h2><div class="btn-row">
        <button class="btn" data-act="backup">Download backup (JSON)</button>
        <button class="btn" data-act="import">Import from PC app…</button>
        <a class="btn" href="#/log">Activity log</a></div>
        <p class="muted small">The backup uses the same format as the PC app's boarding_house_data.json.
          Importing replaces the settings and rooms stored here with the file's contents.</p></section>
      <section class="card"><h2>Account</h2>
        ${cloudEnabled ? `<p class="small">Signed in as <b>${esc(S.user?.email)}</b></p>
          <button class="btn" data-act="signout">Sign out</button>`
          : `<p class="small muted">Demo mode — no account. Data lives in this browser only.</p>`}</section>`;
    this.update();
  },
  update() {
    for (const inp of $$("[data-set]", this.el))
      if (inp !== document.activeElement) inp.value = S.settings[inp.dataset.set] ?? "";
  },
  onChange(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    store.updateSettings({ [k]: e.target.value.trim() });
    if (k === "power_rate" || k === "water_rate") store.log(`${k.replace("_", " ")} → ${e.target.value.trim()}`);
  },
  onAct(act) {
    if (act === "backup")
      download(`boarding_house_data_${B.today()}.json`,
               JSON.stringify(B.toPCData(S.settings, S.rooms), null, 2), "application/json");
    if (act === "import" && confirm("Replace the rooms and settings stored here with the contents of a PC data file?"))
      pickImport();
  },
};

// ── shell: routing + event delegation ──────────────────────────
const ROUTES = { dashboard: Dashboard, room: Room, notify: Notify, ledger: Ledger,
                 tenants: Tenants, log: Log, settings: Settings };
let current = null, currentHash = null;

function route() {
  const [name = "dashboard", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const view = ROUTES[name] || Dashboard;
  if (currentHash === location.hash && current === view) return view.update();
  current = view; currentHash = location.hash;
  $$("#nav a").forEach(a => a.classList.toggle("active",
    a.dataset.nav === (name === "room" ? "dashboard" : ROUTES[name] ? name : "dashboard")));
  view.mount($("#view"), arg ? decodeURIComponent(arg) : undefined);
  scrollTo(0, 0);
}

function render() {
  document.body.dataset.phase = S.phase;
  const ready = S.phase === "ready";
  $("#app").hidden = !ready;
  if (!ready) { current = currentHash = null; return renderGate(); }
  const sync = $("#sync");
  sync.className = "sync " + (S.mode === "local" ? "local" : S.sync);
  sync.textContent = S.mode === "local" ? "Demo" : { synced: "Synced", pending: "Saving…", offline: "Offline" }[S.sync];
  route();
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.closest("dialog")) return;
  const act = btn.dataset.act;
  if (act === "signin") return store.signIn().catch(err => toast(err.message, true));
  if (act === "signout") return store.signOut();
  if (act === "fresh") return startFresh();
  if (act === "import" && S.phase === "setup") return pickImport();
  if (current && current.onAct) current.onAct(act, btn);
});
document.addEventListener("change", e => {
  if (e.target.closest("dialog")) return;
  if (current && current.onChange) current.onChange(e);
});
addEventListener("hashchange", () => { if (S.phase === "ready") route(); });

store.subscribe(render);
render();
store.init();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
  navigator.serviceWorker.register("sw.js").catch(() => {});
