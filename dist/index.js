#!/usr/bin/env node

// GitHub Action wrapper for cursor-doctor
const fs = require('fs');
const path = require('path');
const { doctor } = require('../src/doctor');

async function run() {
  try {
    // Get inputs from environment (GitHub Actions sets these as INPUT_*)
    const workingDir = process.env.INPUT_PATH || process.env.GITHUB_WORKSPACE || process.cwd();
    const failOnWarning = (process.env.INPUT_FAIL_ON_WARNING || 'false').toLowerCase() === 'true';

    console.log(`Scanning: ${workingDir}`);
    
    const report = await doctor(workingDir);
    
    // Set outputs
    const issueCount = report.checks.filter(c => c.status === 'fail' || c.status === 'warn').length;
    console.log(`::set-output name=issue-count::${issueCount}`);
    console.log(`::set-output name=health-grade::${report.grade}`);
    console.log(`::set-output name=percentage::${report.percentage}`);

    // Log results
    console.log(`\n📊 Cursor Health: ${report.grade} (${report.percentage}%)\n`);
    
    let hasErrors = false;
    let hasWarnings = false;

    for (const check of report.checks) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      const prefix = check.status === 'fail' ? '::error::' : check.status === 'warn' ? '::warning::' : '';
      
      console.log(`${icon} ${check.name}`);
      if (prefix) {
        console.log(`${prefix}${check.name}: ${check.detail}`);
      }
      
      if (check.status === 'fail') hasErrors = true;
      if (check.status === 'warn') hasWarnings = true;
    }

    console.log(`\n${report.checks.filter(c => c.status === 'pass').length} passed, ${issueCount} issues found`);

    // Exit with appropriate code
    if (hasErrors || (failOnWarning && hasWarnings)) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`::error::Action failed: ${error.message}`);
    process.exit(1);
  }
}

run();
