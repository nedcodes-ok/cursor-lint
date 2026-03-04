const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./frontmatter');

// Rule categories and their common keywords/indicators
const RULE_CATEGORIES = {
  testing: ['test', 'spec', 'jest', 'vitest', 'pytest', 'unittest', 'testing', 'tdd', 'bdd', 'coverage', 'mock', 'fixture'],
  'error-handling': ['error', 'exception', 'try-catch', 'logging', 'debug', 'validation', 'throw', 'assert', 'panic', 'result'],
  styling: ['style', 'css', 'tailwind', 'styled', 'emotion', 'scss', 'sass', 'design-system', 'theme', 'ui'],
  'state-management': ['state', 'redux', 'zustand', 'recoil', 'mobx', 'pinia', 'vuex', 'context', 'store'],
  'api-data-fetching': ['api', 'fetch', 'axios', 'request', 'graphql', 'rest', 'endpoint', 'query', 'mutation', 'swr', 'react-query', 'tanstack'],
  accessibility: ['accessibility', 'a11y', 'aria', 'wcag', 'semantic', 'keyboard', 'screen-reader'],
  performance: ['performance', 'optimization', 'cache', 'lazy', 'memoization', 'debounce', 'throttle', 'bundle', 'chunk'],
  security: ['security', 'auth', 'authentication', 'authorization', 'xss', 'csrf', 'sql-injection', 'sanitize', 'encrypt', 'jwt', 'oauth'],
};

// Framework/stack specific expectations
const FRAMEWORK_EXPECTATIONS = {
  react: ['testing', 'error-handling', 'state-management', 'accessibility', 'performance'],
  nextjs: ['testing', 'error-handling', 'api-data-fetching', 'performance', 'security'],
  vue: ['testing', 'error-handling', 'state-management', 'styling'],
  angular: ['testing', 'error-handling', 'api-data-fetching', 'security'],
  svelte: ['testing', 'error-handling', 'state-management'],
  express: ['error-handling', 'api-data-fetching', 'security'],
  fastapi: ['error-handling', 'api-data-fetching', 'security', 'testing'],
  django: ['error-handling', 'api-data-fetching', 'security', 'testing'],
  flask: ['error-handling', 'api-data-fetching', 'security'],
  rails: ['error-handling', 'api-data-fetching', 'security', 'testing'],
  'spring-boot': ['error-handling', 'api-data-fetching', 'security', 'testing'],
  typescript: ['error-handling', 'testing'],
  python: ['error-handling', 'testing'],
  rust: ['error-handling', 'testing'],
  go: ['error-handling', 'testing'],
};

/**
 * Detect frameworks and tools from project files
 */
function detectStack(dir) {
  const detected = new Set();
  
  // Check package.json
  const packageJsonPath = path.join(dir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      
      // Framework detection
      if (allDeps['react']) detected.add('react');
      if (allDeps['next']) detected.add('nextjs');
      if (allDeps['vue']) detected.add('vue');
      if (allDeps['@angular/core']) detected.add('angular');
      if (allDeps['svelte']) detected.add('svelte');
      if (allDeps['express']) detected.add('express');
      
      // Language detection
      if (allDeps['typescript'] || pkg.devDependencies?.['typescript']) detected.add('typescript');
      
      // Testing frameworks
      if (allDeps['jest'] || allDeps['@jest/core']) detected.add('jest');
      if (allDeps['vitest']) detected.add('vitest');
      if (allDeps['@testing-library/react']) detected.add('testing-library');
      
      // State management
      if (allDeps['redux'] || allDeps['@reduxjs/toolkit']) detected.add('redux');
      if (allDeps['zustand']) detected.add('zustand');
      if (allDeps['recoil']) detected.add('recoil');
      if (allDeps['mobx']) detected.add('mobx');
      
      // Data fetching
      if (allDeps['axios']) detected.add('axios');
      if (allDeps['@tanstack/react-query'] || allDeps['react-query']) detected.add('react-query');
      if (allDeps['swr']) detected.add('swr');
      if (allDeps['graphql'] || allDeps['@apollo/client']) detected.add('graphql');
      
      // Styling
      if (allDeps['tailwindcss']) detected.add('tailwind');
      if (allDeps['styled-components']) detected.add('styled-components');
      if (allDeps['@emotion/react']) detected.add('emotion');
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Check requirements.txt
  const requirementsTxtPath = path.join(dir, 'requirements.txt');
  if (fs.existsSync(requirementsTxtPath)) {
    try {
      const content = fs.readFileSync(requirementsTxtPath, 'utf-8');
      detected.add('python');
      if (content.includes('django')) detected.add('django');
      if (content.includes('fastapi')) detected.add('fastapi');
      if (content.includes('flask')) detected.add('flask');
      if (content.includes('pytest')) detected.add('pytest');
    } catch (e) {
      // Ignore read errors
    }
  }
  
  // Check Cargo.toml
  const cargoTomlPath = path.join(dir, 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    detected.add('rust');
  }
  
  // Check go.mod
  const goModPath = path.join(dir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    detected.add('go');
  }
  
  // Check Gemfile
  const gemfilePath = path.join(dir, 'Gemfile');
  if (fs.existsSync(gemfilePath)) {
    try {
      const content = fs.readFileSync(gemfilePath, 'utf-8');
      detected.add('ruby');
      if (content.includes('rails')) detected.add('rails');
    } catch (e) {
      // Ignore read errors
    }
  }
  
  // Check pom.xml or build.gradle
  const pomXmlPath = path.join(dir, 'pom.xml');
  const buildGradlePath = path.join(dir, 'build.gradle');
  if (fs.existsSync(pomXmlPath) || fs.existsSync(buildGradlePath)) {
    detected.add('java');
    // Check for Spring Boot
    try {
      if (fs.existsSync(pomXmlPath)) {
        const content = fs.readFileSync(pomXmlPath, 'utf-8');
        if (content.includes('spring-boot')) detected.add('spring-boot');
      }
      if (fs.existsSync(buildGradlePath)) {
        const content = fs.readFileSync(buildGradlePath, 'utf-8');
        if (content.includes('spring-boot')) detected.add('spring-boot');
      }
    } catch (e) {
      // Ignore read errors
    }
  }
  
  return Array.from(detected);
}

/**
 * Analyze existing rules to determine what categories they cover
 */
function analyzeRuleCoverage(dir) {
  const coverage = new Set();
  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir) || !fs.statSync(rulesDir).isDirectory()) {
    return { categories: Array.from(coverage), ruleDetails: [], totalRules: 0 };
  }
  
  const ruleDetails = [];
  let totalRules = 0;
  
  for (const entry of fs.readdirSync(rulesDir)) {
    if (!entry.endsWith('.mdc')) continue;
    
    totalRules++;
    const filePath = path.join(rulesDir, entry);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lowerContent = content.toLowerCase();
    const lowerFilename = entry.toLowerCase();
    
    const matchedCategories = [];
    
    // Check each category
    for (const [category, keywords] of Object.entries(RULE_CATEGORIES)) {
      const matches = keywords.some(kw => 
        lowerContent.includes(kw) || lowerFilename.includes(kw)
      );
      
      if (matches) {
        coverage.add(category);
        matchedCategories.push(category);
      }
    }
    
    if (matchedCategories.length > 0) {
      ruleDetails.push({
        file: entry,
        categories: matchedCategories,
      });
    }
  }
  
  return {
    categories: Array.from(coverage),
    ruleDetails,
    totalRules,
  };
}

/**
 * Identify coverage gaps based on detected stack and existing rules
 */
function detectCoverageGaps(dir) {
  const stack = detectStack(dir);
  const { categories: coveredCategories, ruleDetails, totalRules } = analyzeRuleCoverage(dir);
  
  // Determine expected categories based on detected frameworks
  const expectedCategories = new Set();
  for (const framework of stack) {
    const expectations = FRAMEWORK_EXPECTATIONS[framework];
    if (expectations) {
      for (const cat of expectations) {
        expectedCategories.add(cat);
      }
    }
  }
  
  // Find gaps
  const gaps = [];
  for (const expected of expectedCategories) {
    if (!coveredCategories.includes(expected)) {
      gaps.push(expected);
    }
  }
  
  // Find frameworks for display
  const displayableStack = stack.filter(s => FRAMEWORK_EXPECTATIONS[s]);
  
  return {
    detectedStack: stack,
    displayableStack,
    expectedCategories: Array.from(expectedCategories),
    coveredCategories,
    gaps,
    ruleDetails,
    hasRules: totalRules > 0,
  };
}

/**
 * Generate suggestions for missing categories
 */
function generateSuggestions(gaps, stack) {
  const suggestions = [];
  
  for (const gap of gaps) {
    const suggestion = {
      category: gap,
      reason: getCategoryReason(gap, stack),
      examples: getCategoryExamples(gap),
    };
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

function getCategoryReason(category, stack) {
  const reasons = {
    testing: `Testing rules help maintain code quality and catch bugs early`,
    'error-handling': `Error handling rules ensure robust error management`,
    styling: `Styling rules maintain UI consistency`,
    'state-management': `State management rules prevent common pitfalls`,
    'api-data-fetching': `API rules ensure proper data handling and error cases`,
    accessibility: `Accessibility rules make your app usable for everyone`,
    performance: `Performance rules prevent common bottlenecks`,
    security: `Security rules protect against common vulnerabilities`,
  };
  return reasons[category] || `Recommended for your stack`;
}

function getCategoryExamples(category) {
  const examples = {
    testing: ['Write tests for all new features', 'Aim for 80%+ coverage on business logic', 'Mock external dependencies'],
    'error-handling': ['Always catch and log errors', 'Use try-catch blocks around risky operations', 'Return user-friendly error messages'],
    styling: ['Use Tailwind utility classes', 'Follow design system spacing', 'Ensure responsive design'],
    'state-management': ['Keep state minimal and local when possible', 'Use proper state update patterns', 'Avoid prop drilling'],
    'api-data-fetching': ['Handle loading and error states', 'Add proper timeouts', 'Cache where appropriate'],
    accessibility: ['Use semantic HTML', 'Add ARIA labels where needed', 'Ensure keyboard navigation works'],
    performance: ['Lazy load components when possible', 'Memoize expensive computations', 'Optimize bundle size'],
    security: ['Validate all user input', 'Use environment variables for secrets', 'Implement proper authentication'],
  };
  return examples[category] || [];
}

module.exports = {
  detectStack,
  analyzeRuleCoverage,
  detectCoverageGaps,
  generateSuggestions,
  RULE_CATEGORIES,
  FRAMEWORK_EXPECTATIONS,
};
