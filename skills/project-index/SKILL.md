---
name: project-index
description: Use this skill for large project maintenance with layered CLAUDE.md index system. Triggers when users need to (1) analyze and document existing codebases, (2) generate hierarchical CLAUDE.md files for modules, (3) set up incremental update hooks after code changes, or (4) navigate large projects efficiently. Supports legacy project onboarding and automatic context management.
---

# Project Index - Layered CLAUDE.md System

## 前置依赖

| 依赖 | 类型 | 用途 | 安装 |
|------|------|------|------|
| **codeagent-wrapper** | 必需 | LLM 调用 (module-analyzer, update-bg) | `npm i -g codeagent-wrapper` |
| **kanban** | 可选 | 审计任务自动创建 | 需运行 kanban 服务 |

### codeagent-wrapper

用于 LLM 批量任务的 CLI 封装。`module-analyzer.js` 和 `update-bg.js` 通过它调用 Codex 后端进行代码分析。

```bash
# 安装
npm install -g codeagent-wrapper

# 验证
codeagent-wrapper --version
```

### Kanban API (可选)

若启用 `features.kanban`，审计发现的问题会自动创建为 Kanban 任务。

```bash
# 环境变量
export KANBAN_URL=http://127.0.0.1:3007/api/v1

# 验证连接
curl $KANBAN_URL/projects
```

如未运行 Kanban 服务，会静默跳过任务创建（不影响其他功能）。

Automatically generate and maintain a hierarchical CLAUDE.md index system for large projects.

## Core Concepts

### Three-Layer Architecture

```
project/CLAUDE.md           # Layer 1: Overview + module index
    ↓
src/modules/auth/CLAUDE.md  # Layer 2: Module details + submodule index
    ↓
src/modules/auth/jwt/CLAUDE.md  # Layer 3: Implementation details
```

### Benefits

- **On-demand loading**: Only load context when needed
- **Modular management**: Each module maintains its own docs
- **Fast navigation**: Quick lookup via index hierarchy
- **Legacy support**: Analyze existing code to generate docs

## Quick Start

```bash
# 1. Scan project structure
node ~/.claude/skills/project-index/scripts/scan.js

# 2. Generate CLAUDE.md hierarchy
node ~/.claude/skills/project-index/scripts/generate.js --auto

# 3. Set up auto-update hook
node ~/.claude/skills/project-index/scripts/hook.js install
```

## Commands

### 1. Scan Project Structure

Analyze project and identify modules:

```bash
# Scan current directory
node ~/.claude/skills/project-index/scripts/scan.js

# Scan specific path
node ~/.claude/skills/project-index/scripts/scan.js /path/to/project
```

**Output**: Module tree with tech stack detection.

### 2. Initialize Index System

Generate complete CLAUDE.md hierarchy:

```bash
# Interactive mode (recommended for first time)
node ~/.claude/skills/project-index/scripts/generate.js --layer 1

# Auto-generate all layers
node ~/.claude/skills/project-index/scripts/generate.js --auto

# Preview without writing
node ~/.claude/skills/project-index/scripts/generate.js --auto --dry-run
```

**Creates**:
- Root `CLAUDE.md` with project overview
- Module-level `CLAUDE.md` for each detected module
- Submodule `CLAUDE.md` for complex modules

### 3. Update After Changes

Incremental update based on git diff:

```bash
# Update modules affected by recent changes
node ~/.claude/skills/project-index/scripts/update.js

# Update with specific diff reference
node ~/.claude/skills/project-index/scripts/update.js --diff HEAD~3
```

### 4. Setup Auto-Update Hook

Configure Claude Code hook for automatic updates:

```bash
# Install in project
node ~/.claude/skills/project-index/scripts/hook.js install

# Install globally
node ~/.claude/skills/project-index/scripts/hook.js install --global

# Check status
node ~/.claude/skills/project-index/scripts/hook.js status
```

This adds to `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "pattern": "git commit",
      "command": "project-index update --silent"
    }]
  }
}
```

## Workflow

### For New Projects

1. Run `node scripts/hook.js init` to set up hooks and create `.stale-config.json`
2. Run `node scripts/scan.js` to analyze structure
3. Run `node scripts/generate.js --auto` to generate CLAUDE.md hierarchy
4. Start development with AI-friendly context

### For Legacy Projects

1. Run `node scripts/scan.js` to understand structure
2. Run `node scripts/hook.js init` to set up hooks and config
3. Run `node scripts/generate.js --auto` to generate docs
4. Run `node scripts/module-analyzer.js` for initial audit
5. Refine CLAUDE.md files as needed

## Module Detection

### Auto-Detection Rules

| Pattern | Module Type |
|---------|-------------|
| `src/modules/*`, `src/features/*` | Feature modules |
| `src/components/*` | UI components |
| `src/services/*`, `src/api/*` | Service layer |
| `src/utils/*`, `src/lib/*` | Utilities |
| `packages/*` | Monorepo packages |
| Directory with `package.json` | NPM package |
| Directory with `__init__.py` | Python package |

### Tech Stack Detection

Scans for:
- `package.json` → Node.js/Frontend stack
- `pyproject.toml`, `requirements.txt` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `pom.xml`, `build.gradle` → Java

## CLAUDE.md Templates

### Layer 1: Root Template

See `templates/root.md` for project overview template.

Key sections:
- Project description (2-3 sentences)
- Tech stack list
- Module index with paths
- Global conventions

### Layer 2: Module Template

See `templates/module.md` for module documentation.

Key sections:
- Module purpose
- Core files list
- Database models (if any)
- API endpoints (if any)
- Submodule index
- Common tasks

### Layer 3: Submodule Template

See `templates/submodule.md` for implementation details.

Key sections:
- Detailed functionality
- Code snippets
- Configuration
- Testing notes

## Best Practices

### Keep It Lean

- Root CLAUDE.md: < 100 lines
- Module CLAUDE.md: < 200 lines
- Submodule CLAUDE.md: < 300 lines

### Clear Index Paths

Good:
```markdown
- **Auth Module**: `src/modules/auth/CLAUDE.md`
  - JWT tokens, session management, OAuth
```

Bad:
```markdown
- Auth: see auth folder
```

### Update Triggers

Set up hooks for:
- After `git commit`
- After PR merge
- After significant refactoring

## Integration with gh-flow

Works with gh-issue-implement workflow:

1. Issue assigned → worktree created
2. Development happens
3. PR merged → hook triggers `project-index update`
4. Affected module CLAUDE.md updated automatically

## Configuration

在项目根目录创建 `.stale-config.json` 配置文件：

```json
{
  "ignore": [
    "tests/**",
    "test/**",
    "docs/**",
    "*.test.js"
  ],

  "features": {
    "doc": true,
    "audit": true,
    "kanban": true
  },

  "notify": {
    "enabled": true,
    "threshold": 3,
    "onSessionStart": true
  },

  "conventions": {
    "language": "JavaScript + JSDoc",
    "noTypescript": true,
    "rules": [
      "使用 ES Modules (import/export)",
      "JSDoc 类型注解 (@typedef/@param/@returns)"
    ],
    "auditFocus": [
      "检查是否有 TypeScript 语法误入",
      "验证 JSDoc 类型注解完整性"
    ]
  },

  "concurrency": 6,
  "timeout": 180000
}
```

**配置项说明**：

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `ignore` | 忽略的文件/目录 glob 模式 | `[]` |
| `features.doc` | 启用文档更新 | `true` |
| `features.audit` | 启用代码审计 | `true` |
| `features.kanban` | 启用 Kanban 任务创建 | `true` |
| `notify.threshold` | 变化超过此值才通知 | `3` |
| `conventions.language` | 项目语言/技术栈 | - |
| `conventions.rules` | 项目编码规范 | - |
| `conventions.auditFocus` | 审计时特别关注的问题 | - |
| `concurrency` | 并发执行数 | `6` |
| `timeout` | 单任务超时 (ms) | `180000` |

**CLI 参数覆盖**：

```bash
node module-analyzer.js --no-doc      # 禁用文档更新
node module-analyzer.js --no-audit    # 禁用审计
node module-analyzer.js --no-kanban   # 禁用 Kanban
```

## Scripts Reference

### scan.js

```bash
node scripts/scan.js [path]
```

Outputs JSON with detected modules and structure.

### generate.js

```bash
node scripts/generate.js [--layer 1|2|3] [--module path]
```

Generates CLAUDE.md for specified layer/module.

### update.js

```bash
node scripts/update.js [--diff HEAD~1]
```

Incremental update based on git changes.

### hook.js

Hook 管理器，支持项目初始化和 hook 开关：

```bash
# 项目初始化（安装所有推荐 hooks + 创建 .stale-config.json）
node scripts/hook.js init

# 安装/卸载特定 hook
node scripts/hook.js install post-commit
node scripts/hook.js uninstall stale-notify

# 全局安装
node scripts/hook.js init --global

# 查看状态
node scripts/hook.js status

# 列出所有 hooks
node scripts/hook.js list

# 开关特定 hook
node scripts/hook.js toggle stale-notify off
node scripts/hook.js toggle post-commit on
```

**可用 Hooks**：

| Hook | 触发时机 | 功能 |
|------|----------|------|
| `post-commit` | git commit 后 | 自动更新 CLAUDE.md |
| `stale-notify` | 会话开始 | 通知过期模块 |

### check-stale.js

检测过期的 CLAUDE.md 文件：

```bash
# 检查所有模块
node scripts/check-stale.js

# JSON 输出
node scripts/check-stale.js --json

# 只显示过期的
node scripts/check-stale.js --stale-only

# Touch 指定模块（更新 mtime）
node scripts/check-stale.js --touch path1 path2

# Touch 所有过期模块
node scripts/check-stale.js --touch-all
```

### stale-notify.js

SessionStart Hook，检测并通知过期模块：

```bash
# 检查并通知（阈值 > 3 个变化）
node scripts/stale-notify.js

# 管理通知
node scripts/stale-notify.js --enable
node scripts/stale-notify.js --disable
node scripts/stale-notify.js --status
node scripts/stale-notify.js --reset
```

### update-bg.js

后台更新 CLAUDE.md（使用 LLM 判断是否需要更新）：

```bash
# 启动后台任务
node scripts/update-bg.js

# 指定并发数
node scripts/update-bg.js --concurrency=8

# 从断点恢复
node scripts/update-bg.js --resume

# 查看状态
node scripts/update-bg.js --status
node scripts/update-bg.js --log
```

### module-analyzer.js

组合任务：文档更新 + 代码审计 + Kanban 集成：

```bash
# 运行分析（默认创建 Kanban 任务）
node scripts/module-analyzer.js

# 不创建 Kanban 任务
node scripts/module-analyzer.js --no-kanban

# 从断点恢复
node scripts/module-analyzer.js --resume

# 查看结果
node scripts/module-analyzer.js --status
```

**输出**：
- `CLAUDE.md` - 模块文档（更新或 touch）
- `AUDIT.md` - 安全审计报告
- Kanban 任务 - 发现的问题自动创建任务

### batch-llm-runner.js

通用批量 LLM 任务框架：

```javascript
import { BatchRunner, runCodeagent } from './batch-llm-runner.js';

const runner = new BatchRunner({
  name: 'my-task',
  concurrency: 8,
  timeout: 120000
});

await runner.run({
  scan: async (cwd) => [...items],
  buildPrompt: (item) => '...',
  handleResult: async (item, result) => ({ status: '...' })
});
```

**特性**：
- 并发执行 + 可配置限制
- Checkpoint/Resume 崩溃恢复
- Session ID 追踪（支持单任务重试）
- Hook 友好的结果文件

## Kanban API Reference

创建审计任务时使用的 API：

```bash
# 创建任务
POST /api/v1/projects/{projectId}/tasks/create
Content-Type: application/json

{
  "title": "[AUDIT/HIGH] module: issue-type",
  "description": "## 问题描述\n...",
  "status": "todo",
  "priority": 1,  # 0=P0, 1=P1, 2=P2, 3=P3
  "tags": ["audit", "high", "injection"],
  "dueDate": null,
  "worktreeId": null
}

# 更新任务
POST /api/v1/tasks/{id}/update
{"status": "done"}

# 删除任务
POST /api/v1/tasks/{id}/delete
{}
```
