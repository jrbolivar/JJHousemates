# Builds the phone app icons and splash screens from logo.svg.
#   python make-app-icons.py      (needs: pip install pillow; node + playwright)
import os, re, subprocess, json, tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "android/app/src/main/res")
IOS = os.path.join(ROOT, "ios/App/App/Assets.xcassets")
BG = (243, 247, 248)

svg = open(os.path.join(HERE, "logo.svg")).read()
variants = {
    "square": svg.replace('rx="116" ', ''),                                  # full-bleed, no corners
    "gradient": re.sub(r'<g fill="#ffffff".*?</g>|<path fill="#ffffff".*?/>', '', svg.replace('rx="116" ', ''), flags=re.S),
    "feet": svg.replace('<rect width="512" height="512" rx="116" fill="url(#bg)"/>', ''),
    "rounded": svg,
}
tmp = tempfile.mkdtemp()
for name, text in variants.items():
    open(os.path.join(tmp, name + ".svg"), "w").write(text)
script = os.path.join(tmp, "r.js")
open(script, "w").write("""
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.setViewportSize({ width: 1024, height: 1024 });
  for (const n of %s) { const h = path.join(%s, n + '.html');
    fs.writeFileSync(h, `<style>html,body{margin:0;background:transparent}</style><img src="${n}.svg" width=1024 height=1024 style="display:block">`);
    await p.goto('file://' + h); await p.screenshot({ path: path.join(%s, n + '.png'), omitBackground: true }); }
  await b.close(); })();""" % (json.dumps(list(variants)), json.dumps(tmp), json.dumps(tmp)))
subprocess.run(["node", script], check=True)
img = {n: Image.open(os.path.join(tmp, n + ".png")).convert("RGBA") for n in variants}

def fit(im, size): return im.resize((size, size), Image.LANCZOS)

# iOS: one 1024 icon, no transparency allowed.
fit(img["square"], 1024).convert("RGB").save(os.path.join(IOS, "AppIcon.appiconset/AppIcon-512@2x.png"))

# Android launcher icons.
for dens, s in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = os.path.join(RES, "mipmap-" + dens)
    fit(img["rounded"], s).save(os.path.join(d, "ic_launcher.png"))
    sq = fit(img["square"], s); mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    rnd = Image.new("RGBA", (s, s)); rnd.paste(sq, (0, 0), mask); rnd.save(os.path.join(d, "ic_launcher_round.png"))
    fg_size = s * 108 // 48                                   # adaptive icon layer is 108dp
    fg = fit(img["gradient"], fg_size)
    feet = fit(img["feet"], int(fg_size * 0.85))
    off = (fg_size - feet.width) // 2
    fg.alpha_composite(feet, (off, off)); fg.save(os.path.join(d, "ic_launcher_foreground.png"))
open(os.path.join(RES, "values/ic_launcher_background.xml"), "w").write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#19B8AD</color>\n</resources>\n')

# Splash screens: logo centred on the app background.
def splash(path):
    w, h = Image.open(path).size
    out = Image.new("RGB", (w, h), BG); s = int(min(w, h) * 0.28)
    out.paste(fit(img["rounded"], s), ((w - s) // 2, (h - s) // 2), fit(img["rounded"], s)); out.save(path)
for root, _, files in os.walk(RES):
    for f in files:
        if f == "splash.png": splash(os.path.join(root, f))
for f in os.listdir(os.path.join(IOS, "Splash.imageset")):
    if f.endswith(".png"): splash(os.path.join(IOS, "Splash.imageset", f))
print("icons and splash screens written")
