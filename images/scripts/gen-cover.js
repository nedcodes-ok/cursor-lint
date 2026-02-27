const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1280px; height: 720px;
  background: linear-gradient(135deg, #0a0a0f, #0f1628, #0a1628);
  font-family: 'Inter', sans-serif;
  color: white;
  display: flex;
  overflow: hidden;
  position: relative;
}
.glow {
  position: absolute;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%);
  top: 50%; left: 35%;
  transform: translate(-50%, -50%);
}
.left {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 50px 60px 70px;
  position: relative;
  z-index: 2;
}
.badge {
  display: inline-block;
  background: rgba(34,211,238,0.1);
  color: #22d3ee;
  padding: 8px 18px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(34,211,238,0.25);
  margin-bottom: 24px;
  width: fit-content;
}
h1 {
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.05;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  font-size: 20px;
  color: #94a3b8;
  line-height: 1.5;
  max-width: 420px;
}
.price {
  margin-top: 28px;
  font-size: 28px;
  font-weight: 700;
  color: #22d3ee;
}
.price span { color: #64748b; font-size: 16px; font-weight: 400; }
.right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 50px 40px 20px;
  position: relative;
  z-index: 2;
}
.terminal {
  background: rgba(15,15,25,0.9);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  width: 500px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.terminal-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot-red { background: #ff5f57; }
.dot-yellow { background: #febc2e; }
.dot-green { background: #28c840; }
.terminal-title {
  color: #64748b;
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  margin-left: 8px;
}
.terminal-body {
  padding: 20px 22px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13.5px;
  line-height: 1.7;
}
.prompt { color: #22d3ee; }
.cmd { color: #e2e8f0; }
.pass { color: #4ade80; }
.warn { color: #fbbf24; }
.fail { color: #f87171; }
.dim { color: #475569; }
.score { color: #22d3ee; font-weight: 600; }
.grade {
  display: inline-block;
  background: rgba(34,211,238,0.15);
  color: #22d3ee;
  padding: 2px 10px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 15px;
}
</style>
</head>
<body>
<div class="glow"></div>
<div class="left">
  <div class="badge">CLI Tool for Cursor AI</div>
  <h1>cursor-<br>doctor</h1>
  <div class="subtitle">Fix your Cursor AI setup in seconds. Health checks, diagnostics, and auto-repair for your .cursor config.</div>
  <div class="price">$9 <span>one-time &middot; Pro license</span></div>
</div>
<div class="right">
  <div class="terminal">
    <div class="terminal-header">
      <div class="dot dot-red"></div>
      <div class="dot dot-yellow"></div>
      <div class="dot dot-green"></div>
      <span class="terminal-title">cursor-doctor scan</span>
    </div>
    <div class="terminal-body">
      <div><span class="score">Cursor Health: B (78%)</span></div>
      <div style="margin-top:12px"><span class="pass">&#10003;</span> Rules exist <span class="dim">.cursor/rules/</span></div>
      <div><span class="warn">&#9888;</span> Legacy .cursorrules found</div>
      <div><span class="fail">&#10007;</span> 3 lint errors in frontmatter</div>
      <div><span class="pass">&#10003;</span> Token budget OK <span class="dim">~1,200</span></div>
      <div><span class="pass">&#10003;</span> Coverage complete</div>
      <div><span class="warn">&#9888;</span> 5 alwaysApply rules <span class="dim">(high)</span></div>
      <div style="margin-top:14px"><span class="dim">3 issues fixable.</span> Run <span class="cmd">cursor-doctor fix</span></div>
    </div>
  </div>
</div>
</body>
</html>
  `);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, '..', 'cursor-doctor-cover.png') });
  await browser.close();
  console.log('Cover saved: cursor-doctor-cover.png');
})();
