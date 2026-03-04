const { doctor } = require('./doctor');

/**
 * Color mapping for shields.io badges
 */
const GRADE_COLORS = {
  A: 'brightgreen',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

/**
 * Generate badge data for the project
 * @param {string} dir - Project directory
 * @returns {Promise<{grade: string, percentage: number, color: string}>}
 */
async function generateBadgeData(dir) {
  const report = await doctor(dir);
  return {
    grade: report.grade,
    percentage: report.percentage,
    color: GRADE_COLORS[report.grade] || 'lightgrey',
  };
}

/**
 * Generate markdown badge snippet
 * @param {string} dir - Project directory
 * @returns {Promise<string>}
 */
async function generateMarkdownBadge(dir) {
  const { grade, percentage, color } = await generateBadgeData(dir);
  const message = `${grade} (${percentage}%)`;
  const encodedMessage = encodeURIComponent(message);
  const url = `https://img.shields.io/badge/Cursor%20Rules-${encodedMessage}-${color}`;
  return `![Cursor Rules: ${message}](${url})`;
}

/**
 * Generate HTML badge snippet
 * @param {string} dir - Project directory
 * @returns {Promise<string>}
 */
async function generateHtmlBadge(dir) {
  const { grade, percentage, color } = await generateBadgeData(dir);
  const message = `${grade} (${percentage}%)`;
  const encodedMessage = encodeURIComponent(message);
  const url = `https://img.shields.io/badge/Cursor%20Rules-${encodedMessage}-${color}`;
  return `<img src="${url}" alt="Cursor Rules: ${message}">`;
}

/**
 * Generate shields.io endpoint JSON
 * @param {string} dir - Project directory
 * @returns {Promise<object>}
 */
async function generateShieldsEndpoint(dir) {
  const { grade, percentage, color } = await generateBadgeData(dir);
  return {
    schemaVersion: 1,
    label: 'Cursor Rules',
    message: `${grade} (${percentage}%)`,
    color: color,
  };
}

/**
 * Generate Twitter share URL for health grade
 * @param {string} grade - Health grade (A-F)
 * @param {number} percentage - Health percentage
 * @returns {string} - Twitter share URL
 */
function generateShareUrl(grade, percentage) {
  const tweetText = `My Cursor rules scored ${grade} (${percentage}%) with cursor-doctor! 🏥 Check yours: npx cursor-doctor scan https://github.com/nedcodes-ok/cursor-doctor`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
}

/**
 * Open URL in default browser (cross-platform)
 * @param {string} url - URL to open
 * @returns {Promise<boolean>} - true if successful, false if failed
 */
async function openInBrowser(url) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  let command;
  if (process.platform === 'darwin') {
    command = `open "${url}"`;
  } else if (process.platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  try {
    await execAsync(command);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Generate share data and attempt to open in browser
 * @param {string} dir - Project directory
 * @returns {Promise<{shareUrl: string, markdownBadge: string, opened: boolean}>}
 */
async function generateShare(dir) {
  const { grade, percentage } = await generateBadgeData(dir);
  const shareUrl = generateShareUrl(grade, percentage);
  const markdownBadge = await generateMarkdownBadge(dir);
  const opened = await openInBrowser(shareUrl);
  
  return {
    shareUrl,
    markdownBadge,
    opened,
  };
}

module.exports = {
  generateBadgeData,
  generateMarkdownBadge,
  generateHtmlBadge,
  generateShieldsEndpoint,
  generateShareUrl,
  generateShare,
  GRADE_COLORS,
};
