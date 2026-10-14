// J&J Housemates — billing rules, ported 1:1 from boarding_house_manager.py (v2).
// Field names and string-typed values match boarding_house_data.json so the
// PC file can be imported and a backup exported here can be read by the PC app.

export const MONTHS = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];

// Locked brand name: shown everywhere, never taken from imported or saved data.
export const BUSINESS_NAME = "J&J Housemates";

export const DEFAULT_SETTINGS = {
  business_name:  BUSINESS_NAME,
  power_rate:     "11.50",
  water_rate:     "150",
  due_day:        "25",
  footer_address: "",
  footer_contact: "",
  footer_phone:   "",
  current_period: "",
};

// Kept out of the cloud on purpose: passwords / API keys / PC-only paths.
const PC_ONLY_KEYS = ["smtp_host","smtp_port","smtp_user","smtp_pass",
                      "semaphore_api_key","semaphore_sender","business_email",
                      "logo_path","rooms","business_name"];

export const num = v => {
  const n = parseFloat(String(v ?? "").replace(/[,₱\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const money = n =>
  num(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const peso = n => "₱" + money(n);

export function defaultRoom(label, type, rental = "") {
  return {
    label, type,
    boarder_name: "", boarder_email: "", boarder_phone: "",
    rental_fee: rental || (type === "standard" ? "3500" : "5000"),
    consumption_kwh: "", status: "Unpaid", notes: "",
    boarder2_name: "", boarder2_email: "", boarder2_phone: "",
    documents: [], payments: [],
    water_bill: "150", meter_prev: "", meter_curr: "", move_in_date: "",
    tenant_history: [], other_charge: "", other_remarks: "",
    visitors: [], bill_snapshots: [],
    meter_id: "", water_persons: "",
    emerg_name: "", emerg_phone: "", province: "", checkin_dt: "",
  };
}

export function buildDefaultRooms() {
  const rooms = {};
  for (let i = 1; i <= 8; i++) rooms[`S${i}`] = defaultRoom(`Room ${i}`, "standard");
  rooms.P1 = defaultRoom("Bedroom 1", "premium",  "5000");
  rooms.P2 = defaultRoom("Bedroom 2", "premium",  "5000");
  rooms.P3 = defaultRoom("Bedroom 3", "premium2", "7000");
  return rooms;
}

export function normalizeRoom(r) {
  const room = { ...defaultRoom(r?.label || "", r?.type || "standard", r?.rental_fee), ...r };
  for (const k of ["documents","payments","tenant_history","visitors","bill_snapshots"])
    if (!Array.isArray(room[k])) room[k] = [];
  return room;
}

export const isPremium  = room => room.type === "premium" || room.type === "premium2";
export const isOccupied = room => !!(room.boarder_name || "").trim();

export function persons(room) {
  const saved = String(room.water_persons ?? "").trim();
  return /^\d+$/.test(saved) && +saved > 0 ? +saved : (isPremium(room) ? 2 : 1);
}

export function bill(room, settings) {
  const rental = num(room.rental_fee);
  const kwh    = num(room.consumption_kwh);
  const rate   = num(settings.power_rate);
  const wr     = num(settings.water_rate);
  const p      = persons(room);
  const power  = kwh * rate;
  const water  = wr * p;
  const other  = num(room.other_charge);
  return { rental, kwh, rate, wr, persons: p, power, water, other,
           otherR: room.other_remarks || "", total: rental + power + water + other };
}

export const paymentsFor = (room, period) =>
  (room.payments || []).filter(p => p.period === period);
export const paidFor = (room, period) =>
  paymentsFor(room, period).reduce((s, p) => s + num(p.amount), 0);

export function statusFor(total, paid) {
  if (paid > 0 && paid >= total) return "Paid";
  return paid > 0 ? "Partial" : "Unpaid";
}

// Returns a new bill_snapshots array with this period's snapshot added/replaced.
export function snapshot(room, settings, period, trigger = "manual") {
  const b = bill(room, settings);
  const totalPaid = paidFor(room, period);
  const snap = {
    period, snapshot_at: stamp(true), trigger,
    boarder_name: room.boarder_name || "",
    rental: b.rental, kwh: b.kwh, power_rate: b.rate, power: b.power,
    water_rate: b.wr, persons: b.persons, water: b.water,
    other: b.other, other_remarks: b.otherR,
    total_due: b.total, total_paid: totalPaid,
    balance: Math.max(0, b.total - totalPaid),
    status: room.status || "Unpaid",
    meter_prev: room.meter_prev || "", meter_curr: room.meter_curr || "",
  };
  const snaps = [...(room.bill_snapshots || [])];
  const i = snaps.findIndex(s => s.period === period);
  if (i >= 0) snaps[i] = snap; else snaps.push(snap);
  return snaps;
}

export function ordinal(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return "th";
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
}

const pad2 = n => String(n).padStart(2, "0");
export function stamp(seconds = false, d = new Date()) {
  const s = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return seconds ? `${s}:${pad2(d.getSeconds())}` : s;
}
export const today = () => stamp().slice(0, 10);

export function thisPeriod(d = new Date()) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function splitPeriod(period) {
  const [m, y] = String(period || "").split(" ");
  const mi = MONTHS.indexOf(m);
  return mi < 0 ? splitPeriod(thisPeriod()) : { month: mi, year: parseInt(y, 10) };
}
export function nextPeriod(period) {
  const { month, year } = splitPeriod(period);
  return month === 11 ? `${MONTHS[0]} ${year + 1}` : `${MONTHS[month + 1]} ${year}`;
}

const rj = (n, w = 10) => money(n).padStart(w, " ");

// Short bill text for SMS / WhatsApp / Viber / Messenger.
export function billMessage(key, room, settings, period) {
  const b = bill(room, settings);
  const biz = BUSINESS_NAME;
  const paid = paidFor(room, period);
  const sep = "-".repeat(40);
  const visitors = (room.visitors || []).filter(v => v.name && !v.checkout_dt)
    .map(v => `  + ${v.name} (${v.phone || ""}) - ${v.remarks || ""}\n`).join("");
  const due = settings.due_day || "25";
  return (
    `BILLING STATEMENT\n${biz}\n\n` +
    `Dear ${room.boarder_name || "Boarder"},\n\n` +
    `Room  : ${key} - ${room.label || ""}\n` +
    `Period: ${period}\n` + visitors +
    `\n${sep}\n` +
    `Rental     :  P ${rj(b.rental)}\n` +
    `Power      :  P ${rj(b.power)}  (${b.kwh.toFixed(2)} kWh)\n` +
    `Water      :  P ${rj(b.water)}  (x${b.persons} person${b.persons > 1 ? "s" : ""})\n` +
    (b.other > 0 ? `Other      :  P ${rj(b.other)}  (${b.otherR})\n` : "") +
    `${sep}\n` +
    `TOTAL DUE  :  P ${rj(b.total)}\n` +
    (paid > 0 ? `Paid       :  P ${rj(paid)}\nBALANCE    :  P ${rj(Math.max(0, b.total - paid))}\n` : "") +
    `${sep}\n\n` +
    `Please pay on or before the ${due}${ordinal(due)} of the month.\n` +
    `Thank you! - ${biz}\n`
  );
}

export function sortRoomKeys(rooms) {
  const rank = k => ({ S: 0, P: 1 }[k[0]] ?? 2);
  return Object.keys(rooms).sort((a, b) =>
    rank(a) - rank(b) || (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0) || a.localeCompare(b));
}

// boarding_house_data.json  →  { settings, rooms } for the online store.
export function fromPCData(data) {
  if (!data || typeof data !== "object" || typeof data.rooms !== "object")
    throw new Error("This does not look like boarding_house_data.json");
  const settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(data))
    if (!PC_ONLY_KEYS.includes(k) && typeof v !== "object") settings[k] = String(v);
  const rooms = {};
  for (const [k, r] of Object.entries(data.rooms)) {
    rooms[k] = normalizeRoom(r);
    if (k === "P3" && rooms[k].type === "premium") rooms[k].type = "premium2";
  }
  return { settings, rooms };
}

// Online store  →  boarding_house_data.json shape (backup / PC app).
export function toPCData(settings, rooms) {
  const { current_period, ...rest } = settings;
  return { ...rest, current_period, rooms };
}
