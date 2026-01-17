#!/usr/bin/env node
/**
 * Batch LLM Runner - Generic framework for parallel LLM tasks
 *
 * Features:
 * - Concurrent execution with configurable limit
 * - Checkpoint/resume for crash recovery
 * - Session ID tracking for individual task resume
 * - Hook-friendly result files
 *
 * Usage:
 *   import { BatchRunner } from './batch-llm-runner.js';
 *
 *   const runner = new BatchRunner({
 *     name: 'code-audit',
 *     concurrency: 8,
 *     timeout: 120000
 *   });
 *
 *   await runner.run({
 *     scan: async (cwd) => [...items],
 *     buildPrompt: (item) => '...',
 *     handleResult: async (item, result) => { ... }
 *   });
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  readJsonSafe,
  writeJsonSafe,
  unlinkSafe,
  createLogger,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT
} from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run codeagent-wrapper with spawn, capture session_id and validate output
 * Uses stdin to pass prompt to avoid argument length issues
 * @param {string} prompt
 * @param {string} cwd
 * @param {number} timeout
 * @returns {Promise<{success: boolean, output: string, sessionId: string|null, error: string|null}>}
 */
export async function runCodeagent(prompt, cwd, timeout = 120000) {
  return new Promise((resolve) => {
    // Use "-" to read from stdin
    const child = spawn('codeagent-wrapper', ['--backend', 'codex', '-'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let sessionId = null;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGTERM');
        resolve({ success: false, output: stdout, sessionId, error: 'timeout' });
      }
    }, timeout);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      const match = chunk.match(/SESSION_ID:\s*([a-f0-9-]+)/i);
      if (match) sessionId = match[1];
    });

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);

      if (code === 0 && stdout.trim()) {
        resolve({ success: true, output: stdout.trim(), sessionId, error: null });
      } else {
        resolve({
          success: false,
          output: stdout.trim(),
          sessionId,
          error: code === 0 ? 'empty output' : `exit code ${code}`
        });
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ success: false, output: '', sessionId, error: err.message });
    });

    // Write prompt to stdin and close
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Concurrency pool for parallel execution
 */
async function runWithConcurrency(tasks, concurrency, handler) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = handler(task).then(result => {
      executing.delete(promise);
      return result;
    });
    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * @typedef {Object} BatchRunnerOptions
 * @property {string} name - Task name for file naming
 * @property {number} [concurrency=8] - Max concurrent tasks
 * @property {number} [timeout=120000] - Timeout per LLM call in ms
 * @property {string} [stateDir] - Directory for state files (default: __dirname)
 */

/**
 * @typedef {Object} TaskHandlers
 * @property {(cwd: string) => Promise<Array<{id: string, [key: string]: any}>>} scan - Returns items to process
 * @property {(item: object) => string} buildPrompt - Build LLM prompt for item
 * @property {(item: object, result: {success: boolean, output: string, sessionId: string|null, error: string|null}) => Promise<{status: string, [key: string]: any}>} handleResult - Process LLM result
 */

export class BatchRunner {
  /**
   * @param {BatchRunnerOptions} options
   */
  constructor(options) {
    this.name = options.name;
    this.concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.stateDir = options.stateDir || __dirname;
    this.silent = options.silent || false;

    this.logFile = path.join(this.stateDir, `.${this.name}.log`);
    this.progressFile = path.join(this.stateDir, `.${this.name}-progress.json`);
    this.resultFile = path.join(this.stateDir, `.${this.name}-result.json`);

    this.logger = createLogger(this.logFile, this.silent);
  }

  async log(msg) {
    await this.logger.log(msg);
  }

  async loadProgress() {
    return await readJsonSafe(this.progressFile, {
      status: 'idle',
      items: [],
      completed: [],
      results: []
    });
  }

  async saveProgress(progress) {
    await writeJsonSafe(this.progressFile, progress);
  }

  async clearProgress() {
    await unlinkSafe(this.progressFile);
  }

  /**
   * Run batch processing
   * @param {TaskHandlers} handlers
   * @param {object} [options]
   * @param {boolean} [options.resume=false] - Resume from checkpoint
   * @param {string} [options.cwd] - Working directory
   */
  async run(handlers, options = {}) {
    const cwd = options.cwd || process.cwd();
    const resumeMode = options.resume || false;

    await fs.writeFile(this.logFile, '');
    await this.log(`Started: ${this.name}`);
    await this.log(`Concurrency: ${this.concurrency}`);

    let progress = await this.loadProgress();
    let itemsToProcess;
    let existingResults = [];

    if (resumeMode && progress.status === 'running') {
      await this.log(`Resuming from checkpoint...`);
      const completedSet = new Set(progress.completed);
      itemsToProcess = progress.items.filter(item => !completedSet.has(item.id));
      existingResults = progress.results || [];
      await this.log(`Remaining: ${itemsToProcess.length}`);
    } else {
      const allItems = await handlers.scan(cwd);
      await this.log(`Scanned: ${allItems.length} items`);
      itemsToProcess = allItems;

      progress = {
        status: 'running',
        startedAt: new Date().toISOString(),
        items: itemsToProcess,
        completed: [],
        results: []
      };
      await this.saveProgress(progress);
    }

    await this.log(`Processing ${itemsToProcess.length} items...`);

    const results = await runWithConcurrency(itemsToProcess, this.concurrency, async (item) => {
      try {
        await this.log(`Processing: ${item.id}`);
        const prompt = await handlers.buildPrompt(item);
        const llmResult = await runCodeagent(prompt, cwd, this.timeout);
        const result = await handlers.handleResult(item, llmResult);

        progress.completed.push(item.id);
        progress.results.push({ id: item.id, ...result });
        await this.saveProgress(progress);

        await this.log(`  → ${result.status}: ${item.id}`);
        return { id: item.id, ...result };
      } catch (e) {
        await this.log(`  → Error: ${item.id} - ${e.message}`);
        const errorResult = { id: item.id, status: 'error', reason: e.message };

        progress.completed.push(item.id);
        progress.results.push(errorResult);
        await this.saveProgress(progress);

        return errorResult;
      }
    });

    const allResults = [...existingResults, ...results];

    // Summarize
    const byStatus = {};
    for (const r of allResults) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }

    await this.log(`\nSummary: ${allResults.length} processed`);
    for (const [status, count] of Object.entries(byStatus)) {
      await this.log(`  ${status}: ${count}`);
    }

    const errors = allResults.filter(r => r.status.includes('error'));

    const resultData = {
      completedAt: new Date().toISOString(),
      status: 'success',
      processed: allResults.length,
      byStatus,
      failed: errors.length,
      failedList: errors
    };

    await fs.writeFile(this.resultFile, JSON.stringify(resultData, null, 2));
    await this.log(`Result: ${this.resultFile}`);

    await this.clearProgress();
    await this.log('Completed');

    return resultData;
  }
}
