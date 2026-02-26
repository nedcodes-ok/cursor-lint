const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 512, height: 512 });

  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 512px; height: 512px;
  background: linear-gradient(135deg, #0a0a0f, #0f1628);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.container {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.letter {
  font-family: 'Inter', sans-serif;
  font-weight: 900;
  font-size: 280px;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
  letter-spacing: -12px;
}
.bracket {
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 200px;
  color: rgba(34,211,238,0.25);
  line-height: 1;
}
.left { margin-right: -10px; }
.right { margin-left: -10px; }
</style>
</head>
<body>
<div class="glow"></div>
<div class="container">
  <span class="bracket left">{</span>
  <span class="letter">n</span>
  <span class="bracket right">}</span>
</div>
</body>
</html>
  `);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, '..', 'nedcodes-icon-512.png') });

  // Also generate smaller sizes
  for (const size of [256, 128, 64]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${size}px; height: ${size}px;
  background: linear-gradient(135deg, #0a0a0f, #0f1628);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: ${size * 0.8}px; height: ${size * 0.8}px;
  background: radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.container {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.letter {
  font-family: 'Inter', sans-serif;
  font-weight: 900;
  font-size: ${size * 0.55}px;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
  letter-spacing: ${size * -0.02}px;
}
.bracket {
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: ${size * 0.39}px;
  color: rgba(34,211,238,0.25);
  line-height: 1;
}
.left { margin-right: ${size * -0.02}px; }
.right { margin-left: ${size * -0.02}px; }
</style>
</head>
<body>
<div class="glow"></div>
<div class="container">
  <span class="bracket left">{</span>
  <span class="letter">n</span>
  <span class="bracket right">}</span>
</div>
</body>
</html>
    `);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, '..', `nedcodes-icon-${size}.png`) });
  }

  await browser.close();
  console.log('Icons saved: nedcodes-icon-512.png, nedcodes-icon-256.png, nedcodes-icon-128.png, nedcodes-icon-64.png');
})();
