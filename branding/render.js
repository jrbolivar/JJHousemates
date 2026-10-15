const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
  for (const [src, out, size] of process.argv.slice(2).map(a => a.split(':'))) {
    await p.setViewportSize({ width: +size, height: +size });
    await p.goto('file://' + process.cwd() + '/' + src);
    await p.screenshot({ path: out });
  }
  await b.close();
})();
