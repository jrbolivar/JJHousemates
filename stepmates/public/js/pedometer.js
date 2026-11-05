// Live step counter using the phone's motion sensor.
// Browsers only give motion data while the page is open and the screen is on,
// so this is for "walk now" sessions; daily totals come from the phone or watch.

export function supported() { return typeof DeviceMotionEvent !== "undefined"; }

export async function startCounting(onStep) {
  // iPhone asks permission; must be called from a button tap.
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const res = await DeviceMotionEvent.requestPermission();
    if (res !== "granted") throw new Error("Motion access was not allowed. Allow it in Settings → Safari → Motion & Orientation Access.");
  }
  let avg = 9.8, smooth = 9.8, wasAbove = false, lastStep = 0, got = false;
  const handler = e => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    got = true;
    const mag = Math.hypot(a.x, a.y, a.z);
    smooth = smooth * 0.7 + mag * 0.3;          // remove jitter
    avg = avg * 0.98 + smooth * 0.02;           // slow-moving baseline (gravity)
    const above = smooth > avg + 1.1;
    const now = performance.now();
    if (above && !wasAbove && now - lastStep > 280) {
      lastStep = now; onStep();
    }
    wasAbove = above;
  };
  window.addEventListener("devicemotion", handler);
  let lock = null;
  try { lock = await navigator.wakeLock?.request("screen"); } catch { /* screen may dim */ }
  return {
    noSensor: () => !got,
    stop() { window.removeEventListener("devicemotion", handler); lock?.release().catch(() => {}); },
  };
}
