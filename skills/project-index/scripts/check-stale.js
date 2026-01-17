#!/usr/bin/env node
/**
 * Check Stale CLAUDE.md - Detect outdated documentation
 * Usage: node check-stale.js [path] [--json] [--stale-only]
 *
 * Compares CLAUDE.md mtime with max(code files mtime) in subdirectories.
 * If code is newer than docs, marks as stale.
 *
 * Supports .stale-ignore file in project root (glob patterns, one per line)
 */

import { promises as fs } from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'venv', '.venv', 'target', 'vendor', '.cache', 'coverage',
  '.turbo', '.nuxt', '.output', 'out'
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.vue', '.svelte'
]);

/**
 * Load .stale-config.json from project root
 * @param {string} rootPath
 * @returns {Promise<{ignore: string[], extensions: string[]}>}
 */
async function loadConfig(rootPath) {
  const configFile = path.join(rootPath, '.stale-config.json');
  try {
    const content = await fs.readFile(configFile, 'utf-8');
    const config = JSON.parse(content);
    return {
      ignore: config.ignore || [],
      extensions: config.extensions || null  // null means use default
    };
  } catch {
    return { ignore: [], extensions: null };
  }
}

/**
 * Check if a path matches any ignore pattern
 * @param {string} relativePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
function shouldIgnore(relativePath, patterns) {
  for (const pattern of patterns) {
    // Simple glob matching: * matches anything, ** matches any path
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    if (new RegExp(`^${regex}(/|$)`).test(relativePath)) {
      return true;
    }
  }
  return false;
}

/**
 * @typedef {'fresh' | 'stale' | 'missing'} StaleStatus
 * @typedef {{path: string, mtime: Date}} FileInfo
 * @typedef {{
 *   path: string,
 *   status: StaleStatus,
 *   docMtime?: Date,
 *   codeMtime?: Date,
 *   newestFile?: string,
 *   changedFiles?: FileInfo[]
 * }} CheckResult
 */

/**
 * Recursively find all CLAUDE.md files
 * @param {string} dir
 * @param {string} rootPath
 * @returns {Promise<string[]>}
 */
async function findClaudeMdFiles(dir, rootPath) {
  const results = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'CLAUDE.md' && entry.isFile()) {
        results.push(dir);
      }

      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        const subResults = await findClaudeMdFiles(
          path.join(dir, entry.name),
          rootPath
        );
        results.push(...subResults);
      }
    }
  } catch (e) {
    // Permission denied or other errors, skip
  }

  return results;
}

/**
 * Get max mtime of code files in directory (recursive)
 * @param {string} dir
 * @param {Date|null} docMtime - If provided, also collect files newer than this
 * @param {string} rootPath - Project root for relative path calculation
 * @param {string[]} ignorePatterns - Patterns to ignore
 * @returns {Promise<{mtime: Date | null, file: string | null, changedFiles: FileInfo[]}>}
 */
async function getMaxCodeMtime(dir, docMtime = null, rootPath = dir, ignorePatterns = []) {
  let maxMtime = null;
  let maxFile = null;
  /** @type {FileInfo[]} */
  const changedFiles = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Check ignore patterns
      if (shouldIgnore(relativePath, ignorePatterns)) continue;

      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Skip CLAUDE.md itself and non-code files
        if (entry.name === 'CLAUDE.md') continue;
        if (!CODE_EXTENSIONS.has(ext)) continue;

        const stat = await fs.stat(fullPath);
        if (!maxMtime || stat.mtime > maxMtime) {
          maxMtime = stat.mtime;
          maxFile = fullPath;
        }
        // Collect files newer than doc
        if (docMtime && stat.mtime > docMtime) {
          changedFiles.push({ path: fullPath, mtime: stat.mtime });
        }
      } else if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        // Check if subdir has its own CLAUDE.md (separate tracking)
        const subClaudeMd = path.join(fullPath, 'CLAUDE.md');
        let hasOwnClaude = false;
        try {
          await fs.access(subClaudeMd);
          hasOwnClaude = true;
        } catch {}

        // If subdir has own CLAUDE.md, skip it (tracked separately)
        if (hasOwnClaude) continue;

        const sub = await getMaxCodeMtime(fullPath, docMtime, rootPath, ignorePatterns);
        if (sub.mtime && (!maxMtime || sub.mtime > maxMtime)) {
          maxMtime = sub.mtime;
          maxFile = sub.file;
        }
        changedFiles.push(...sub.changedFiles);
      }
    }
  } catch (e) {
    // Permission denied or other errors
  }

  return { mtime: maxMtime, file: maxFile, changedFiles };
}

/**
 * Check staleness of a single CLAUDE.md
 * @param {string} dirPath - Directory containing CLAUDE.md
 * @param {string} rootPath
 * @param {string[]} ignorePatterns
 * @returns {Promise<CheckResult>}
 */
async function checkStaleness(dirPath, rootPath, ignorePatterns = []) {
  const claudePath = path.join(dirPath, 'CLAUDE.md');
  const relativePath = path.relative(rootPath, dirPath) || '.';

  try {
    const docStat = await fs.stat(claudePath);
    const { mtime: codeMtime, file: newestFile, changedFiles } = await getMaxCodeMtime(dirPath, docStat.mtime, rootPath, ignorePatterns);

    if (!codeMtime) {
      // No code files found, doc is fresh by default
      return {
        path: relativePath,
        status: 'fresh',
        docMtime: docStat.mtime,
        codeMtime: null,
        newestFile: null,
        changedFiles: []
      };
    }

    const isStale = codeMtime > docStat.mtime;

    // Sort changed files by mtime desc
    changedFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return {
      path: relativePath,
      status: isStale ? 'stale' : 'fresh',
      docMtime: docStat.mtime,
      codeMtime,
      newestFile: newestFile ? path.relative(rootPath, newestFile) : null,
      changedFiles: changedFiles.map(f => ({
        path: path.relative(rootPath, f.path),
        mtime: f.mtime
      }))
    };
  } catch (e) {
    return {
      path: relativePath,
      status: 'missing',
      docMtime: null,
      codeMtime: null,
      newestFile: null,
      changedFiles: []
    };
  }
}

function formatDate(date) {
  if (!date) return 'N/A';
  return date.toISOString().split('T')[0];
}

function colorize(status) {
  const colors = {
    stale: '\x1b[33m',   // yellow
    fresh: '\x1b[32m',   // green
    missing: '\x1b[31m', // red
    reset: '\x1b[0m'
  };
  return `${colors[status] || ''}${status.padEnd(7)}${colors.reset}`;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const staleOnly = args.includes('--stale-only');
  const touchMode = args.includes('--touch');
  const touchAll = args.includes('--touch-all');

  // For touch mode, paths come after --touch flag
  const touchIndex = args.indexOf('--touch');
  const pathsToTouch = touchMode && touchIndex !== -1
    ? args.slice(touchIndex + 1).filter(a => !a.startsWith('--'))
    : [];

  const targetPath = (!touchMode && !touchAll)
    ? (args.find(a => !a.startsWith('--')) || process.cwd())
    : process.cwd();
  const rootPath = path.resolve(targetPath);

  // Load config
  const config = await loadConfig(rootPath);
  const ignorePatterns = config.ignore;

  if (!jsonMode && ignorePatterns.length > 0) {
    console.log(`Ignore patterns: ${ignorePatterns.join(', ')}\n`);
  }

  // Touch mode: update mtime of specified CLAUDE.md files
  if (touchMode || touchAll) {
    const claudeDirs = await findClaudeMdFiles(rootPath, rootPath);
    let touched = 0;

    for (const dir of claudeDirs) {
      const result = await checkStaleness(dir, rootPath, ignorePatterns);
      if (result.status !== 'stale') continue;

      // --touch-all touches all stale, --touch requires path match
      const shouldTouch = touchAll || pathsToTouch.some(p =>
        result.path === p || result.path.startsWith(p + '/') || result.path.startsWith(p)
      );

      if (shouldTouch) {
        const claudePath = path.join(dir, 'CLAUDE.md');
        const now = new Date();
        await fs.utimes(claudePath, now, now);
        console.log(`touched: ${result.path}/CLAUDE.md`);
        touched++;
      }
    }

    console.log(`\n${touched} file(s) touched.`);
    return;
  }

  if (!jsonMode) {
    console.log(`Checking CLAUDE.md freshness in: ${rootPath}\n`);
  }

  // Find all CLAUDE.md files
  const claudeDirs = await findClaudeMdFiles(rootPath, rootPath);

  // Check each one
  const results = [];
  for (const dir of claudeDirs) {
    const result = await checkStaleness(dir, rootPath, ignorePatterns);
    results.push(result);
  }

  // Sort: stale first, then fresh
  results.sort((a, b) => {
    const order = { stale: 0, missing: 1, fresh: 2 };
    return order[a.status] - order[b.status];
  });

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Display results
  const staleCount = results.filter(r => r.status === 'stale').length;
  const freshCount = results.filter(r => r.status === 'fresh').length;

  for (const r of results) {
    if (staleOnly && r.status !== 'stale') continue;

    const pathDisplay = r.path.padEnd(40);

    if (r.status === 'stale') {
      console.log(`${colorize('stale')} ${pathDisplay} (code: ${formatDate(r.codeMtime)}, doc: ${formatDate(r.docMtime)})`);
      if (r.changedFiles && r.changedFiles.length > 0) {
        const maxShow = 5;
        const files = r.changedFiles.slice(0, maxShow);
        for (const f of files) {
          console.log(`        ├─ ${f.path} (${formatDate(f.mtime)})`);
        }
        if (r.changedFiles.length > maxShow) {
          console.log(`        └─ ... and ${r.changedFiles.length - maxShow} more files`);
        }
      }
    } else if (r.status === 'fresh') {
      console.log(`${colorize('fresh')} ${pathDisplay} (doc: ${formatDate(r.docMtime)})`);
    } else {
      console.log(`${colorize('missing')} ${pathDisplay}`);
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Total: ${results.length} | Stale: ${staleCount} | Fresh: ${freshCount}`);

  if (staleCount > 0) {
    console.log(`\nRun 'node generate.js --module <path>' to update stale docs.`);
  }
}

main().catch(console.error);
