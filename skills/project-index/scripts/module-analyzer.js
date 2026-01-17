#!/usr/bin/env node
/**
 * Module Analyzer - Combined doc update + audit in one pass
 *
 * One scan, one LLM call per module, multiple outputs:
 * - CLAUDE.md (module description)
 * - AUDIT.md (security/quality audit)
 * - Kanban tasks (for issues found)
 *
 * Usage:
 *   node module-analyzer.js                    # Process stale modules only
 *   node module-analyzer.js --all              # Full reindex (all modules)
 *   node module-analyzer.js --reindex          # Alias for --all
 *   node module-analyzer.js --daemon           # Run in background
 *   node module-analyzer.js --daemon --all     # Full reindex in background
 *   node module-analyzer.js --resume           # Resume crashed task
 *   node module-analyzer.js --status           # Show last result
 *   node module-analyzer.js --no-kanban        # Skip Kanban task creation
 *   node module-analyzer.js --no-doc           # Skip CLAUDE.md update
 *   node module-analyzer.js --no-audit         # Skip audit
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BatchRunner, runCodeagent } from './batch-llm-runner.js';
import { execSync } from 'child_process';
import { loadConfig, readFileSafe, readJsonSafe } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KANBAN_API = process.env.KANBAN_URL || 'http://127.0.0.1:3007/api/v1';

/**
 * Detect current project from Kanban
 * @returns {Promise<{id: string, name: string, path: string}|null>}
 */
async function detectProject() {
  const cwd = process.cwd();
  try {
    const res = await fetch(`${KANBAN_API}/projects`);
    if (!res.ok) return null;
    const data = await res.json();

    for (const project of data.items || []) {
      if (project.path === cwd || cwd.startsWith(project.path + '/')) {
        return project;
      }
    }
  } catch {}
  return null;
}

/**
 * Create Kanban task (single issue)
 * @param {string} projectId
 * @param {object} task - {title, description, priority, tags}
 * @returns {Promise<string|null>} task ID
 */
async function createKanbanTask(projectId, task) {
  try {
    const res = await fetch(`${KANBAN_API}/projects/${projectId}/tasks/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        description: task.description || '',
        status: 'todo',
        priority: task.priority ?? 2,
        tags: task.tags || [],
        dueDate: null,
        worktreeId: null
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.item?.id || null;
    }
  } catch {}
  return null;
}

/**
 * Create Kanban tasks for audit issues
 * Groups all issues from a module into individual tasks with [AUDIT] prefix
 *
 * @param {string} projectId
 * @param {string} modulePath
 * @param {object} audit - { severity, issues, summary }
 * @returns {Promise<{taskIds: string[]}>}
 */
async function createAuditTasks(projectId, modulePath, audit) {
  const { severity, issues, summary } = audit;
  if (!issues || issues.length === 0) return { taskIds: [] };

  const priorityMap = { critical: 0, high: 1, medium: 2, low: 3 };
  const basePriority = priorityMap[severity] ?? 2;
  const taskIds = [];

  for (const issue of issues) {
    const task = {
      title: `[AUDIT/${severity?.toUpperCase()}] ${modulePath}: ${issue.type}`,
      description: `## 问题描述
${issue.description}

## 位置
- **模块**: ${modulePath}
- **文件**: ${issue.file || 'N/A'}
- **行号**: ${issue.line || 'N/A'}

## 代码上下文
\`\`\`
${issue.context || 'N/A'}
\`\`\`

## 修复建议
${issue.suggestion || '待分析'}

## 审计摘要
${summary || 'N/A'}

---
*由 module-analyzer 自动创建*`,
      priority: priorityMap[issue.severity] ?? basePriority,
      tags: ['audit', severity, issue.type].filter(Boolean)
    };

    const taskId = await createKanbanTask(projectId, task);
    if (taskId) taskIds.push(taskId);
  }

  return { taskIds };
}

/**
 * Get stale modules from check-stale.js
 * @param {string} cwd - Working directory
 * @returns {Promise<Array>}
 */
async function getStaleModules(cwd) {
  try {
    const checkScript = path.join(__dirname, 'check-stale.js');
    const result = execSync(`node "${checkScript}" --json`, {
      encoding: 'utf-8',
      cwd,
      timeout: 60000
    });
    return JSON.parse(result).filter(r => r.status === 'stale');
  } catch {
    return [];
  }
}

/**
 * Get ALL modules (for full reindex)
 * @param {string} cwd - Working directory
 * @returns {Promise<Array>}
 */
async function getAllModules(cwd) {
  try {
    const checkScript = path.join(__dirname, 'check-stale.js');
    const result = execSync(`node "${checkScript}" --json`, {
      encoding: 'utf-8',
      cwd,
      timeout: 60000
    });
    return JSON.parse(result);
  } catch {
    return [];
  }
}

/**
 * Read code files from directory
 * @param {string} dir - Module directory
 * @param {Array} files - Files to read
 * @param {number} [maxFiles=5] - Maximum files to read
 * @param {number} [maxLines=60] - Maximum lines per file
 * @returns {Promise<string>}
 */
async function readCodeFiles(dir, files, maxFiles = 5, maxLines = 60) {
  let content = '';
  const toRead = files?.slice(0, maxFiles) || [];

  for (const f of toRead) {
    const filePath = typeof f === 'string' ? path.join(dir, f) : path.join(dir, '..', f.path);
    const fileContent = await readFileSafe(filePath, maxLines);
    if (fileContent) {
      const relPath = typeof f === 'string' ? f : f.path;
      content += `\n--- ${relPath} ---\n${fileContent}\n`;
    }
  }

  return content;
}

async function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  // Daemon mode: fork background process and exit immediately
  if (args.includes('--daemon')) {
    const { spawn } = await import('child_process');
    const scriptPath = fileURLToPath(import.meta.url);
    const childArgs = args.filter(a => a !== '--daemon');

    const child = spawn(process.execPath, [scriptPath, ...childArgs], {
      cwd,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    console.log(`module-analyzer started in background (pid: ${child.pid})`);
    console.log(`Check progress: tail -f ~/.claude/skills/project-index/scripts/.module-analyzer.log`);
    console.log(`Check result: node ~/.claude/skills/project-index/scripts/module-analyzer.js --status`);
    return;
  }

  if (args.includes('--status')) {
    try {
      const result = await fs.readFile(
        path.join(__dirname, '.module-analyzer-result.json'),
        'utf-8'
      );
      console.log(result);
    } catch {
      console.log('No result found.');
    }
    return;
  }

  // Load config from project root
  const config = await loadConfig(cwd);
  const features = config.features || {};

  // CLI args override config
  const enableDoc = !args.includes('--no-doc') && (features.doc !== false);
  const enableAudit = !args.includes('--no-audit') && (features.audit !== false);
  const enableKanban = !args.includes('--no-kanban') && (features.kanban !== false);
  const fullReindex = args.includes('--all') || args.includes('--reindex');

  console.log(`Features: doc=${enableDoc}, audit=${enableAudit}, kanban=${enableKanban}`);
  if (fullReindex) {
    console.log(`Mode: FULL REINDEX (all modules)`);
  }

  // Detect project for Kanban integration
  let projectId = null;
  if (enableKanban) {
    const project = await detectProject();
    if (project) {
      projectId = project.id;
      console.log(`Kanban project: ${project.name} (${project.id})`);
    } else {
      console.log('Kanban: project not found, tasks will not be created');
    }
  }

  // Extract conventions for prompt injection
  const conventions = config.conventions || null;
  if (conventions) {
    console.log(`Conventions: ${conventions.language || 'default'}`);
  }

  const runner = new BatchRunner({
    name: 'module-analyzer',
    concurrency: config.concurrency || 6,
    timeout: config.timeout || 180000,
    stateDir: __dirname,
    silent: true  // Don't spam console, write to log file only
  });

  await runner.run({
    scan: async (cwd) => {
      const modules = fullReindex
        ? await getAllModules(cwd)
        : await getStaleModules(cwd);
      return modules.map(m => ({
        id: m.path,
        modulePath: m.path,
        changedFiles: m.changedFiles || [],
        fullPath: path.join(cwd, m.path),
        projectId,
        enableDoc,
        enableAudit,
        enableKanban,
        conventions
      }));
    },

    buildPrompt: async function(item) {
      const claudeMdPath = path.join(item.fullPath, 'CLAUDE.md');
      const claudeContent = await readFileSafe(claudeMdPath, 80) || '(无现有文档)';
      const codeContent = await readCodeFiles(item.fullPath, item.changedFiles, 5, 60);

      // Build conventions section if available
      let conventionsSection = '';
      if (item.conventions) {
        const c = item.conventions;
        conventionsSection = `
## 项目约定
- 语言: ${c.language || 'N/A'}
${c.rules?.map(r => `- ${r}`).join('\n') || ''}

## 审计重点
${c.auditFocus?.map(f => `- ${f}`).join('\n') || '- 通用安全检查'}
`;
      }

      return `你是一个代码分析专家。请同时完成两个任务：

## 任务 1: 更新模块文档
判断代码变更是否需要更新 CLAUDE.md，如需要则生成新内容。

## 任务 2: 安全审计
检查代码中的安全漏洞和质量问题。
${conventionsSection}
---
模块路径: ${item.modulePath}

当前 CLAUDE.md:
\`\`\`markdown
${claudeContent.slice(0, 2000)}
\`\`\`

变更的代码:
${codeContent.slice(0, 4000)}

---
请以 JSON 格式返回：
{
  "doc": {
    "needsUpdate": true/false,
    "reason": "简要说明",
    "content": "如需更新，完整的新 CLAUDE.md 内容（保持原有风格）"
  },
  "audit": {
    "severity": "none|low|medium|high|critical",
    "issues": [{"type": "类型", "description": "描述", "file": "文件", "line": 行号, "context": "相关代码片段", "suggestion": "建议"}],
    "summary": "审计总结"
  }
}`;
    },

    handleResult: async (item, result) => {
      if (!result.success) {
        return { status: 'llm_error', reason: result.error, sessionId: result.sessionId };
      }

      const jsonMatch = result.output.match(/\{[\s\S]*"doc"[\s\S]*"audit"[\s\S]*\}/);
      if (!jsonMatch) {
        return { status: 'parse_error', reason: 'no json found', sessionId: result.sessionId };
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { status: 'parse_error', reason: 'invalid json', sessionId: result.sessionId };
      }

      const claudeMdPath = path.join(item.fullPath, 'CLAUDE.md');
      const auditMdPath = path.join(item.fullPath, 'AUDIT.md');
      const now = new Date();
      let docStatus = 'skipped';
      let auditStatus = 'skipped';
      let kanbanResult = { taskIds: [] };

      // Handle doc update (if enabled)
      if (item.enableDoc) {
        if (parsed.doc?.needsUpdate && parsed.doc?.content?.length > 50) {
          await fs.writeFile(claudeMdPath, parsed.doc.content);
          docStatus = 'updated';
        } else {
          // Touch to mark as fresh
          try {
            await fs.utimes(claudeMdPath, now, now);
            docStatus = 'touched';
          } catch {}
        }
      }

      // Handle audit (if enabled)
      if (item.enableAudit && parsed.audit && parsed.audit.severity !== 'none') {
        const issues = parsed.audit.issues || [];
        const auditContent = `# Security Audit - ${item.modulePath}

Generated: ${now.toISOString()}
Severity: **${parsed.audit.severity?.toUpperCase()}**

## Summary
${parsed.audit.summary || 'N/A'}

## Issues (${issues.length})
${issues.length > 0
  ? issues.map((i, idx) => `### ${idx + 1}. ${i.type}
- **File**: ${i.file || 'N/A'}${i.line ? `:${i.line}` : ''}
- **Description**: ${i.description}
- **Suggestion**: ${i.suggestion || 'N/A'}
${i.context ? `\`\`\`\n${i.context}\n\`\`\`` : ''}
`).join('\n')
  : 'No issues found.'}
`;
        await fs.writeFile(auditMdPath, auditContent);
        auditStatus = parsed.audit.severity;

        // Create Kanban tasks if enabled and has issues
        if (item.enableKanban && item.projectId && issues.length > 0) {
          kanbanResult = await createAuditTasks(item.projectId, item.modulePath, parsed.audit);
        }
      }

      return {
        status: 'processed',
        doc: docStatus,
        audit: auditStatus,
        issueCount: parsed.audit?.issues?.length || 0,
        kanban: kanbanResult.taskIds?.length > 0 ? {
          taskCount: kanbanResult.taskIds.length,
          taskIds: kanbanResult.taskIds
        } : null
      };
    }
  }, {
    resume: args.includes('--resume'),
    cwd
  });
}

main().catch(console.error);
