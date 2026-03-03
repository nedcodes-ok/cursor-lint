# Tests We Wish We Had

"If you're not finding bugs, change what you're doing." — Kaner Lesson #11

Every time a bug is found manually (persona walkthrough, cold-eye analysis, user report, 
or our own use) that our test suite DIDN'T catch, log it here. Then write the test.

## Format

```
### [date] Bug description
- **Found by:** persona walkthrough / cold-eye / user report / manual testing
- **Root cause:** what code was wrong
- **Test written:** test/test.js line XXX (or test/regression.js repo XX)
- **Category:** FP-REGRESSION / CLUSTER / regression / unit
```

## Log

### 2026-03-01 Empty frontmatter block (---\n---) returned found:false
- **Found by:** CLUSTER tests (bug cluster analysis)
- **Root cause:** Regex `^---\n([\s\S]*?)\n---` requires content between delimiters
- **Test written:** test/test.js CLUSTER: parseFrontmatter handles empty frontmatter block
- **Category:** CLUSTER

### 2026-03-01 Inline globs: [] parsed as string "[]" instead of empty array
- **Found by:** CLUSTER tests (bug cluster analysis)
- **Root cause:** No inline JSON array handling in parseFrontmatter
- **Test written:** test/test.js CLUSTER: autofix handles empty globs array
- **Category:** CLUSTER

### 2026-02-28 "be consistent with X" triggered false positive vague warning
- **Found by:** Real-world testing (awesome-cursorrules repos)
- **Root cause:** Vague pattern matching ignored qualifying context
- **Test written:** test/test.js FP-REGRESSION: "be consistent with [qualifier]" is not vague
- **Category:** FP-REGRESSION

### 2026-02-28 "be concise and X" triggered false positive vague warning
- **Found by:** Real-world testing (awesome-cursorrules repos)
- **Root cause:** Same as above — no context window for qualifiers
- **Test written:** test/test.js FP-REGRESSION: "be concise and [action]" is not vague
- **Category:** FP-REGRESSION

### 2026-02-28 'use client' triggered quote style conflict
- **Found by:** Cold-eye analysis
- **Root cause:** Quote detection regex too broad
- **Test written:** test/test.js FP-REGRESSION: code references like use client should not trigger quote conflict
- **Category:** FP-REGRESSION

### 2026-02-28 <method> placeholder triggered XML/HTML warning
- **Found by:** Cold-eye analysis
- **Root cause:** XML detection didn't exclude placeholder syntax
- **Test written:** test/test.js FP-REGRESSION: placeholder syntax <method> is not XML/HTML
- **Category:** FP-REGRESSION

### 2026-02-27 fm.data.description.trim() crash on non-string description
- **Found by:** Manual testing (v1.10.12 persona walkthroughs)
- **Root cause:** No typeof check before .trim() call
- **Test written:** test/test.js CLUSTER: autofix handles numeric description without crash
- **Category:** CLUSTER

### 2026-02-27 fix output .change vs .changes property name
- **Found by:** Manual testing
- **Root cause:** Inconsistent property naming in autofix return values
- **Test written:** Implicit in existing autofix tests (all check .changes array)
- **Category:** regression

### 2026-03-02 Intra-rule self-conflict not detected
- **Found by:** User report (playground) — "Always use semicolons" + "Avoid semicolons" in same rule showed 0 issues
- **Root cause:** Conflict detection only compared directives across different files (pairwise), never within a single rule body
- **Test written:** test/test.js FP-REGRESSION: intra-rule contradiction "use X" vs "avoid X" detected
- **Category:** FP-REGRESSION

### 2026-03-02 Complementary advice false positive (asyncio)
- **Found by:** Registry rules failing lint after self-conflict feature added
- **Root cause:** subjectsSimilar() too aggressive — matched "use asyncio" vs "avoid mixing...asyncio" on shared word
- **Test written:** test/test.js FP-REGRESSION: complementary "use asyncio" + "avoid mixing" is NOT a conflict
- **Category:** FP-REGRESSION

## Stats

| Period | Bugs found manually | Tests retroactively added |
|--------|-------------------|--------------------------|
| Mar 2026 | 4 | 4 |
| Feb 2026 (late) | 6 | 6 |

**Target: 100% retroactive coverage.** Every manual find gets a test.
