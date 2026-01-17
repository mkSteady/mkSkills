#!/usr/bin/env node
/**
 * Shared utilities for project-index scripts
 * Reduces code duplication across modules
 */

import { promises as fs } from 'fs';
import path from 'path';

/** @type {number} Default max lines to read from a file */
export const DEFAULT_MAX_LINES = 100;

/** @type {number} Stale threshold in minutes for crash detection */
export const CRASH_THRESHOLD_MINUTES = 35;

/** @type {number} Default LLM timeout in ms */
export const DEFAULT_TIMEOUT = 180000;

/** @type {number} Default concurrency limit */
export const DEFAULT_CONCURRENCY = 6;

/**
 * Read file safely with line limit
 * @param {string} filePath - Absolute path to file
 * @param {number} [maxLines=100] - Maximum lines to read
 * @returns {Promise<string|null>} File content or null on error
 */
export async function readFileSafe(filePath, maxLines = DEFAULT_MAX_LINES) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Load .stale-config.json from project root
 * @param {string} cwd - Project root directory
 * @returns {Promise<object>} Configuration object (empty if not found)
 */
export async function loadConfig(cwd) {
  const configFile = path.join(cwd, '.stale-config.json');
  try {
    const content = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Read JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {*} [defaultValue=null] - Default value on error
 * @returns {Promise<*>} Parsed JSON or default value
 */
export async function readJsonSafe(filePath, defaultValue = null) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Write JSON file with formatting
 * @param {string} filePath - Path to write
 * @param {*} data - Data to serialize
 * @returns {Promise<boolean>} Success status
 */
export async function writeJsonSafe(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete file silently (no error on missing file)
 * @param {string} filePath - Path to delete
 * @returns {Promise<boolean>} True if deleted, false if not found or error
 */
export async function unlinkSafe(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file modification time
 * @param {string} filePath - Path to file
 * @returns {Promise<Date|null>} Modification time or null
 */
export async function getMtime(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime;
  } catch {
    return null;
  }
}

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Archive result to history file with limit
 * @param {string} historyPath - Path to history JSON file
 * @param {object} result - Result to archive
 * @param {number} [maxEntries=10] - Maximum entries to keep
 * @returns {Promise<boolean>} Success status
 */
export async function archiveToHistory(historyPath, result, maxEntries = 10) {
  try {
    let history = await readJsonSafe(historyPath, []);

    history.push({
      ...result,
      archivedAt: new Date().toISOString()
    });

    if (history.length > maxEntries) {
      history = history.slice(-maxEntries);
    }

    return await writeJsonSafe(historyPath, history);
  } catch {
    return false;
  }
}

/**
 * Parse CLI arguments into options object
 * @param {string[]} args - process.argv.slice(2)
 * @param {object} defaults - Default values
 * @returns {object} Parsed options
 */
export function parseArgs(args, defaults = {}) {
  const options = { ...defaults };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      if (value === undefined) {
        // --flag (boolean)
        options[camelKey] = true;
      } else if (value === 'true') {
        options[camelKey] = true;
      } else if (value === 'false') {
        options[camelKey] = false;
      } else if (/^\d+$/.test(value)) {
        options[camelKey] = parseInt(value, 10);
      } else {
        options[camelKey] = value;
      }
    } else if (!arg.startsWith('-')) {
      // Positional argument
      options._ = options._ || [];
      options._.push(arg);
    }
  }

  return options;
}

/**
 * Format duration in human-readable form
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Create a simple logger
 * @param {string} logFile - Path to log file
 * @param {boolean} [silent=false] - Suppress console output
 * @returns {object} Logger with log() method
 */
export function createLogger(logFile, silent = false) {
  return {
    async log(msg) {
      const timestamp = new Date().toISOString().slice(11, 19);
      const line = `[${timestamp}] ${msg}\n`;
      await fs.appendFile(logFile, line).catch(() => {});
      if (!silent) {
        console.log(line.trim());
      }
    }
  };
}
