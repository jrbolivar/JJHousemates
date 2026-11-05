// Re-render the PNG icons after editing logo.svg:  node render.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [["logo.svg", "../public/assets/icon-192.png", 192, 192],
                ["logo.svg", "../public/assets/icon-512.png", 512, 512],
                ["logo.svg", "stepmates-logo-1024.png", 1024, 1024],
                ["logo-with-name.svg", "stepmates-logo-with-name.png", 1200, 400]];
  const tmp = path.join(__dirname, "_render.html");
  for (const [src, out, w, h] of jobs) {
    fs.writeFileSync(tmp, `<style>html,body{margin:0;background:transparent}</style>
      <img src="${src}" style="width:${w}px;height:${h}px;display:block">`);
    await p.setViewportSize({ width: w, height: h });
    await p.goto("file://" + tmp);
    await p.screenshot({ path: path.join(__dirname, out), omitBackground: true });
  }
  fs.unlinkSync(tmp);
  await b.close();
})();
