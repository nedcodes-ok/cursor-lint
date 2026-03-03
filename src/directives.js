/**
 * Directive extraction and conflict detection.
 * Shared by audit.js (cross-file conflicts) and index.js (intra-rule conflicts).
 */

function extractDirectives(text) {
  const directives = [];
  const lines = text.split('\n');
  
  const compoundPattern = /\b(always|never)\s+(use|avoid|prefer|include|exclude)\s+([^.\n]{3,50})/gi;
  const singlePattern = /\b(use|prefer|avoid|don't|do not|no|remove|add|include|exclude|enable|disable)\s+([^.\n]{3,50})/gi;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('<!--') || trimmed.length < 5) continue;
    
    compoundPattern.lastIndex = 0;
    let match = compoundPattern.exec(trimmed);
    if (match) {
      const modifier = match[1].toLowerCase();
      const action = match[2].toLowerCase();
      const subject = normalizeSubject(match[3]);
      if (subject) {
        const finalAction = modifier === 'never' ? 'never' : action;
        directives.push({ action: finalAction, subject, line: trimmed });
      }
      continue;
    }
    
    singlePattern.lastIndex = 0;
    match = singlePattern.exec(trimmed);
    if (match) {
      const action = match[1].toLowerCase();
      const subject = normalizeSubject(match[2]);
      if (subject) {
        directives.push({ action, subject, line: trimmed });
      }
    }
  }
  
  return directives;
}

function normalizeSubject(text) {
  let normalized = text.toLowerCase().trim();
  normalized = normalized.replace(/[.,;:!?]+$/, '');
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  normalized = normalized.replace(/\s+/g, ' ');
  if (normalized.length < 3 || normalized.length > 50) return null;
  return normalized;
}

function findDirectiveConflicts(aDirectives, bDirectives) {
  const conflicts = [];
  const opposites = {
    'use': ['never', 'avoid', 'don\'t', 'do not', 'no', 'remove', 'exclude', 'disable'],
    'prefer': ['avoid', 'never', 'don\'t', 'do not', 'no'],
    'always': ['never', 'avoid', 'don\'t', 'do not', 'no'],
    'add': ['remove', 'exclude', 'no'],
    'include': ['exclude', 'remove', 'no'],
    'enable': ['disable', 'no'],
  };
  
  for (const aDir of aDirectives) {
    for (const bDir of bDirectives) {
      if (aDir === bDir) continue; // Skip self when checking intra-rule
      if (subjectsSimilar(aDir.subject, bDir.subject)) {
        const aAction = aDir.action;
        const bAction = bDir.action;
        
        if (opposites[aAction] && opposites[aAction].includes(bAction)) {
          conflicts.push(`"${aAction} ${aDir.subject}" vs "${bAction} ${bDir.subject}"`);
        } else if (opposites[bAction] && opposites[bAction].includes(aAction)) {
          conflicts.push(`"${aAction} ${aDir.subject}" vs "${bAction} ${bDir.subject}"`);
        }
      }
    }
  }
  
  return conflicts;
}

function subjectsSimilar(a, b) {
  if (a === b) return true;
  if (a.length > 5 && b.includes(a)) return true;
  if (b.length > 5 && a.includes(b)) return true;
  
  const wordsA = a.split(/\s+/).filter(w => w.length > 4);
  const wordsB = b.split(/\s+/).filter(w => w.length > 4);
  
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      if (wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA)) {
        return true;
      }
    }
  }
  
  const cleanA = a.replace(/\b(ing|ed|s)\b/g, '').replace(/\s+/g, '');
  const cleanB = b.replace(/\b(ing|ed|s)\b/g, '').replace(/\s+/g, '');
  if (cleanA === cleanB) return true;
  
  return false;
}

module.exports = { extractDirectives, findDirectiveConflicts, normalizeSubject, subjectsSimilar };
