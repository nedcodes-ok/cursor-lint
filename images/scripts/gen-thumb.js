const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 600, height: 600 });

  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 600px; height: 600px;
  background: linear-gradient(135deg, #0a0a0f, #0f1628, #0a1628);
  font-family: 'Inter', sans-serif;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.container {
  text-align: center;
  position: relative;
  z-index: 2;
}
.icon {
  font-size: 80px;
  margin-bottom: 20px;
}
h1 {
  font-size: 64px;
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.05;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  font-size: 18px;
  color: #94a3b8;
  margin-top: 16px;
}
.badge {
  display: inline-block;
  background: rgba(34,211,238,0.1);
  color: #22d3ee;
  padding: 8px 20px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(34,211,238,0.25);
  margin-top: 24px;
}
</style>
</head>
<body>
<div class="glow"></div>
<div class="container">
  <div class="icon">&#x1F9EA;</div>
  <h1>cursor-<br>doctor</h1>
  <div class="subtitle">Fix your Cursor AI setup</div>
  <div class="badge">$9 &middot; Pro</div>
</div>
</body>
</html>
  `);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, '..', 'cursor-doctor-thumb.png') });
  await browser.close();
  console.log('Thumbnail saved: cursor-doctor-thumb.png');
})();
