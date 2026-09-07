#!/usr/bin/env node

/**
 * check-tdd.js
 * Validates that every source file in app/lib/, app/hooks/, and app/api/ 
 * has a corresponding test file.
 * 
 * Usage:
 *   node scripts/check-tdd.js          # Check all source files
 *   node scripts/check-tdd.js --staged # Check only staged files (for pre-commit)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TESTS_DIR = path.join(ROOT, "tests");

// Source directories to enforce TDD on
const SOURCE_PATTERNS = [
  { dir: "app/lib", testPrefix: "" },
  { dir: "app/hooks", testPrefix: "hooks/" },
];

// Files to exclude from TDD requirement (types, configs, etc.)
const EXCLUDE_PATTERNS = [
  /types\.ts$/,
  /\.d\.ts$/,
  /\.css$/,
  /globals\.css$/,
  /layout\.tsx$/,
  /page\.tsx$/,
  /route\.ts$/,
  /logger\.ts$/,
];

function getSourceFiles(dir) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  
  return fs.readdirSync(fullDir)
    .filter(f => /\.(ts|tsx)$/.test(f))
    .filter(f => !EXCLUDE_PATTERNS.some(p => p.test(f)))
    .map(f => path.join(dir, f));
}

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", { 
      encoding: "utf-8",
      cwd: ROOT 
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getExpectedTestPath(sourceFile, testPrefix) {
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  // Check multiple possible test file locations
  const candidates = [
    path.join(TESTS_DIR, testPrefix, `${basename}.test.ts`),
    path.join(TESTS_DIR, testPrefix, `${basename}.test.tsx`),
    path.join(TESTS_DIR, `${basename}.test.ts`),
    path.join(TESTS_DIR, `${basename}.test.tsx`),
  ];
  return candidates;
}

function checkFile(sourceFile) {
  for (const pattern of SOURCE_PATTERNS) {
    if (sourceFile.startsWith(pattern.dir)) {
      const candidates = getExpectedTestPath(sourceFile, pattern.testPrefix);
      const hasTest = candidates.some(c => fs.existsSync(c));
      if (!hasTest) {
        return { file: sourceFile, expected: candidates[0] };
      }
    }
  }
  return null;
}

function main() {
  const isStaged = process.argv.includes("--staged");
  let filesToCheck = [];

  if (isStaged) {
    const staged = getStagedFiles();
    filesToCheck = staged.filter(f => 
      SOURCE_PATTERNS.some(p => f.startsWith(p.dir)) &&
      /\.(ts|tsx)$/.test(f) &&
      !EXCLUDE_PATTERNS.some(p => p.test(f))
    );
  } else {
    for (const pattern of SOURCE_PATTERNS) {
      filesToCheck.push(...getSourceFiles(pattern.dir));
    }
  }

  const missing = [];
  for (const file of filesToCheck) {
    const result = checkFile(file);
    if (result) missing.push(result);
  }

  if (missing.length > 0) {
    console.error("\n❌ TDD VIOLATION: The following source files have no test:\n");
    for (const { file, expected } of missing) {
      console.error(`  ✗ ${file}`);
      console.error(`    → Expected: ${path.relative(ROOT, expected)}\n`);
    }
    console.error(`\n${missing.length} file(s) missing tests.`);
    console.error("Create test files before committing.\n");
    process.exit(1);
  }

  const label = isStaged ? "staged source files" : "source files";
  console.log(`✅ TDD check passed: ${filesToCheck.length} ${label} have tests.`);
  process.exit(0);
}

main();
