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

module.exports = {
  generateBadgeData,
  generateMarkdownBadge,
  generateHtmlBadge,
  generateShieldsEndpoint,
  GRADE_COLORS,
};
