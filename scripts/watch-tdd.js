#!/usr/bin/env node

/**
 * watch-tdd.js
 * Watches source files for changes and automatically runs:
 * - Related tests (vitest)
 * - Lint (next lint)
 * 
 * Usage: node scripts/watch-tdd.js
 * Or via npm script: npm run tdd:watch
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WATCH_DIRS = [
  path.join(ROOT, "app/lib"),
  path.join(ROOT, "app/hooks"),
  path.join(ROOT, "app/components"),
  path.join(ROOT, "app/api"),
  path.join(ROOT, "tests"),
];

// Debounce to avoid multiple triggers
let debounceTimer = null;
const DEBOUNCE_MS = 500;

function getRelatedTestFile(changedFile) {
  const basename = path.basename(changedFile, path.extname(changedFile));
  
  // If it's already a test file, run it directly
  if (basename.endsWith(".test")) {
    return changedFile;
  }

  // Look for corresponding test
  const testCandidates = [
    path.join(ROOT, "tests", `${basename}.test.ts`),
    path.join(ROOT, "tests", `${basename}.test.tsx`),
    path.join(ROOT, "tests/hooks", `${basename}.test.ts`),
    path.join(ROOT, "tests/hooks", `${basename}.test.tsx`),
  ];

  for (const candidate of testCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function runTest(testFile) {
  const relative = path.relative(ROOT, testFile);
  console.log(`\n🧪 Running test: ${relative}`);
  
  const proc = spawn("npx", ["vitest", "run", relative], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  proc.on("close", (code) => {
    if (code === 0) {
      console.log(`✅ Test passed: ${relative}`);
    } else {
      console.log(`❌ Test FAILED: ${relative}`);
    }
  });
}

function runLint(changedFile) {
  const relative = path.relative(ROOT, changedFile);
  console.log(`\n🔍 Linting: ${relative}`);
  
  const proc = spawn("npx", ["next", "lint", "--file", relative], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  proc.on("close", (code) => {
    if (code === 0) {
      console.log(`✅ Lint passed: ${relative}`);
    } else {
      console.log(`⚠️  Lint issues in: ${relative}`);
    }
  });
}

function handleChange(eventType, filename, dir) {
  if (!filename || !filename.match(/\.(ts|tsx)$/)) return;
  
  const fullPath = path.join(dir, filename);
  if (!fs.existsSync(fullPath)) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`\n📁 Changed: ${path.relative(ROOT, fullPath)}`);
    
    // Run related test
    const testFile = getRelatedTestFile(fullPath);
    if (testFile) {
      runTest(testFile);
    } else {
      console.log(`⚠️  No test found for: ${path.relative(ROOT, fullPath)}`);
    }

    // Run lint (only on source files, not test files)
    if (!fullPath.includes("/tests/")) {
      runLint(fullPath);
    }
  }, DEBOUNCE_MS);
}

// Start watching
console.log("👀 TDD Watcher started. Watching for file changes...\n");
console.log("Watched directories:");
for (const dir of WATCH_DIRS) {
  if (fs.existsSync(dir)) {
    console.log(`  📂 ${path.relative(ROOT, dir)}/`);
    fs.watch(dir, { recursive: true }, (event, filename) => {
      handleChange(event, filename, dir);
    });
  }
}
console.log("\nPress Ctrl+C to stop.\n");
