// Reads daily step totals from the phone's health store when StepMates runs as
// the installed iPhone/Android app:
//   iPhone  → Apple Health (Garmin, Apple Watch, Oura etc. write into it)
//   Android → Health Connect (Garmin Connect, Fitbit, Samsung Health write into it)
// In a normal browser none of this exists and isNative() is false.

import { today, addDays } from "./store.js";

const cap = () => window.Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const platform = () => (isNative() ? cap().getPlatform() : "web"); // ios | android | web
export const sourceName = () => (platform() === "ios" ? "Apple Health" : "Health Connect");

// Call the native Health plugin through the bridge the app shell injects.
// (registerPlugin only exists when Capacitor's JS library is bundled, which this app doesn't do.)
const call = (method, options = {}) => cap().registerPlugin
  ? cap().registerPlugin("Health")[method](options)
  : cap().nativePromise("Health", method, options);
const health = () => ({
  isAvailable: () => call("isAvailable"),
  requestAuthorization: o => call("requestAuthorization", o),
  queryAggregated: o => call("queryAggregated", o),
  openHealthConnectSettings: () => call("openHealthConnectSettings"),
});

const CONNECTED_KEY = "stepmates_health_on";
export const wasConnected = () => { try { return localStorage.getItem(CONNECTED_KEY) === "1"; } catch { return false; } };
const remember = on => { try { localStorage.setItem(CONNECTED_KEY, on ? "1" : "0"); } catch { /* fine */ } };

// Ask for permission to read steps. Returns { ok, reason }.
export async function connect() {
  const h = health();
  const avail = await h.isAvailable();
  if (!avail.available) {
    return { ok: false, reason: platform() === "android"
      ? "Health Connect isn't installed. On Android 13 or older, install “Health Connect by Android” from the Play Store, then try again."
      : "Apple Health isn't available on this device." };
  }
  const res = await h.requestAuthorization({ read: ["steps"], write: [] });
  // iPhone never says whether read access was refused (Apple's privacy rule),
  // so there we just try reading.
  if (platform() === "android" && !res.readAuthorized?.includes("steps")) {
    return { ok: false, reason: "Step access wasn't allowed. Open Health Connect → App permissions → StepMates and allow Steps." };
  }
  remember(true);
  return { ok: true };
}

export function disconnect() { remember(false); }
export const openSettings = () => health().openHealthConnectSettings();

// Local midnight for a YYYY-MM-DD date.
const midnight = date => new Date(date + "T00:00:00");

// Returns [{ date, steps }] for the last `days` days, newest first.
// One query per local day so day boundaries match the user's own time zone,
// and the health store removes duplicates (phone + watch counting the same steps).
export async function readDays(days = 7) {
  const h = health(), out = [], now = new Date();
  for (let i = 0; i < days; i++) {
    const date = addDays(today(), -i);
    const start = midnight(date), end = i === 0 ? now : midnight(addDays(date, 1));
    const { samples } = await h.queryAggregated({
      dataType: "steps", startDate: start.toISOString(), endDate: end.toISOString(),
      bucket: "day", aggregation: "sum",
    });
    const steps = Math.round((samples || []).reduce((s, x) => s + (x.value || 0), 0));
    out.push({ date, steps });
  }
  return out;
}
