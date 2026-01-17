# Claude Code Skills

本仓库存放自定义 Claude Code Skills，通过 symlink 同步到 `~/.claude/skills/`。

## 快速开始

```bash
# 克隆仓库
git clone <repo-url> ~/skills

# 创建 symlinks
ln -s ~/skills/project-index ~/.claude/skills/project-index
ln -s ~/skills/kanban ~/.claude/skills/kanban
ln -s ~/skills/kanban/batch ~/.claude/skills/kanban-batch
ln -s ~/skills/kanban/implement ~/.claude/skills/kanban-implement
```

## Skills 列表

| Skill | 描述 | 前置依赖 |
|-------|------|----------|
| **project-index** | CLAUDE.md 索引管理、过期检测、代码审计 | codeagent-wrapper, kanban (可选) |
| **kanban** | 本地 Kanban 任务管理 | CodeKanban 服务 |
| **kanban-batch** | 批量任务并行执行 | CodeKanban 服务 |
| **kanban-implement** | 任务开发工作流 (Worktree) | CodeKanban 服务 |

---

## 前置依赖

### 1. CodeKanban 服务

本地任务管理服务，提供 REST API。

```bash
# 安装 (npm)
npm install -g codekanban

# 或下载二进制
# https://github.com/anthropics/codekanban/releases

# 启动服务
codekanban --port 3007

# 作为系统服务安装
codekanban --install
```

**验证安装：**
```bash
curl http://127.0.0.1:3007/api/v1/health
# {"message":"ok"}
```

**配置端口：**
```bash
# 环境变量
export KANBAN_URL="http://127.0.0.1:3007"

# 或启动时指定
codekanban --port 3005
```

### 2. codeagent-wrapper

LLM 调用封装，用于批量代码分析任务。

```bash
# 安装
npm install -g codeagent-wrapper

# 验证
codeagent-wrapper --version
```

**支持的后端：**
- `codex` - OpenAI Codex (默认)
- `claude` - Anthropic Claude
- `gemini` - Google Gemini

---

## 目录结构

```
skills/
├── README.md
├── project-index/              # CLAUDE.md 索引系统
│   ├── SKILL.md
│   ├── templates/
│   └── scripts/
│       ├── shared.js           # 共享工具函数
│       ├── batch-llm-runner.js # 批量 LLM 任务框架
│       ├── module-analyzer.js  # 文档更新 + 代码审计
│       ├── check-stale.js      # 过期检测
│       ├── stale-notify.js     # SessionStart Hook
│       ├── hook.js             # Hook 管理器
│       └── ...
└── kanban/                     # 本地 Kanban
    ├── SKILL.md                # 主模块
    ├── kanban-cli.js           # CLI 工具
    ├── batch/                  # 批量执行 (kanban-batch)
    │   ├── SKILL.md
    │   └── kanban-planner.js
    └── implement/              # 任务实现 (kanban-implement)
        └── SKILL.md
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KANBAN_URL` | `http://127.0.0.1:3007` | Kanban API 地址 |

---

## Skill 详情

### project-index

管理大型项目的分层 CLAUDE.md 索引系统。

**功能：**
- 自动检测过期的 CLAUDE.md (基于 git diff)
- 使用 LLM 分析代码变更并更新文档
- 代码安全审计 (生成 AUDIT.md)
- 审计问题自动创建 Kanban 任务
- SessionStart Hook 通知过期模块
- 后台 daemon 模式运行

**命令：**

| 脚本 | 说明 |
|------|------|
| `hook.js init` | 初始化项目 (安装 hooks + 创建配置) |
| `hook.js install <hook>` | 安装特定 hook |
| `hook.js status` | 查看 hook 状态 |
| `check-stale.js` | 检查过期模块 |
| `check-stale.js --json` | JSON 格式输出 |
| `check-stale.js --touch-all` | 标记所有为最新 |
| `stale-notify.js` | SessionStart 通知 (Hook 调用) |
| `stale-notify.js --status` | 查看通知状态 |
| `module-analyzer.js` | 运行分析 (前台) |
| `module-analyzer.js --daemon` | 后台运行 |
| `module-analyzer.js --all` | 全量重建索引 |
| `module-analyzer.js --resume` | 恢复中断任务 |
| `module-analyzer.js --status` | 查看上次结果 |
| `module-analyzer.js --no-kanban` | 跳过 Kanban 任务创建 |
| `module-analyzer.js --no-audit` | 跳过审计 |

**配置文件 `.stale-config.json`：**
```json
{
  "ignore": ["tests/**", "docs/**", "*.test.js"],
  "features": {
    "doc": true,
    "audit": true,
    "kanban": true
  },
  "notify": {
    "enabled": true,
    "threshold": 3
  },
  "conventions": {
    "language": "JavaScript + JSDoc",
    "rules": ["使用 ES Modules", "JSDoc 类型注解"],
    "auditFocus": ["检查 TypeScript 语法误入", "验证 JSDoc 完整性"]
  },
  "timeout": 1800000,
  "concurrency": 6
}
```

**Hooks：**

| Hook | 触发时机 | 功能 |
|------|----------|------|
| `post-commit` | git commit 后 | 自动更新 CLAUDE.md |
| `stale-notify` | 会话开始 | 通知过期模块数量变化 |

---

### kanban

本地 Kanban 任务管理，替代 GitHub Issues，私有数据不暴露。

**Slash 命令：**

| 命令 | 说明 |
|------|------|
| `/kanban` | 显示当前项目状态 |
| `/kanban list` | 列出所有任务 |
| `/kanban add <title>` | 创建新任务 |
| `/kanban done <id>` | 标记任务完成 |
| `/kanban start <id>` | 开始任务 (in_progress) |
| `/kanban worktree <id>` | 为任务创建 worktree |
| `/kanban export` | 导出 AI 友好的任务上下文 |
| `/kanban export --json` | 导出 JSON 格式 |

**核心 API：**

```bash
# 设置环境变量
export KANBAN_URL="${KANBAN_URL:-http://127.0.0.1:3007}"
API="${KANBAN_URL}/api/v1"
```

| 操作 | API |
|------|-----|
| 健康检查 | `GET ${API}/health` |
| 系统版本 | `GET ${API}/system/version` |
| 列出项目 | `GET ${API}/projects` |
| 获取任务 | `GET ${API}/projects/{id}/tasks` |
| 创建任务 | `POST ${API}/projects/{id}/tasks/create` |
| 更新任务 | `POST ${API}/tasks/{id}/update` |
| 移动任务 | `POST ${API}/tasks/{id}/move` |
| 删除任务 | `POST ${API}/tasks/{id}/delete` |
| 添加评论 | `POST ${API}/tasks/{id}/comments/create` |

**创建任务示例：**
```bash
curl -X POST "${API}/projects/{projectId}/tasks/create" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务标题",
    "description": "任务描述",
    "status": "todo",
    "priority": 1,
    "tags": ["feature"],
    "dueDate": null,
    "worktreeId": null
  }'
```

> 注意: `dueDate` 和 `worktreeId` 为必填字段，可设为 `null`

**优先级：**
- `0`: P0 紧急
- `1`: P1 高
- `2`: P2 中
- `3`: P3 低

**Worktree API：**

| 操作 | API |
|------|-----|
| 列出 Worktrees | `GET ${API}/projects/{id}/worktrees` |
| 创建 Worktree | `POST ${API}/projects/{id}/worktrees/create` |
| 删除 Worktree | `POST ${API}/worktrees/{id}?deleteBranch=true` |
| 提交代码 | `POST ${API}/worktrees/{id}/commit` |
| 合并分支 | `POST ${API}/worktrees/{id}/merge` |

**创建 Worktree 示例：**
```bash
curl -X POST "${API}/projects/{projectId}/worktrees/create" \
  -H "Content-Type: application/json" \
  -d '{
    "branchName": "feature/new-feature",
    "baseBranch": "main",
    "createBranch": true
  }'
```

---

### kanban-batch

批量并行执行 Kanban 任务，自动分析依赖关系。

**Slash 命令：**

| 命令 | 说明 |
|------|------|
| `/kanban-batch` | 处理所有 todo 任务 |
| `/kanban-batch --priority=0` | 只处理 P0 任务 |
| `/kanban-batch --dry-run` | 只生成计划，不执行 |
| `/kanban-batch --max=5` | 最多并行 5 个 |
| `/kanban-batch --project=<id>` | 指定项目 ID |

**工作流程：**
1. 获取项目所有 todo 任务
2. 解析任务描述中的依赖关系
3. 按优先级和依赖关系排序
4. 生成执行计划 (DAG)
5. 并行执行无依赖任务

**依赖声明格式：**
```markdown
## Dependencies
- [task-id-xxx] (blocked by)
- #task-title (依赖标题匹配)
```

---

### kanban-implement

任务开发工作流，支持 Git Worktree 隔离开发。

**Slash 命令：**

| 命令 | 说明 |
|------|------|
| `/kanban-implement <task-id>` | 实现指定任务 |
| `/kanban-implement <task-id> --no-worktree` | 在当前分支开发 |
| `/kanban-implement <task-id> --dry-run` | 只展示计划 |

**工作流程：**

1. **任务获取** - 读取任务详情、验收标准
2. **环境准备** - 创建 Worktree、绑定任务、更新状态为 in_progress
3. **开发实现** - 在隔离环境中编码
4. **代码提交** - 通过 Worktree API 提交
5. **合并代码** - 合并回主分支
6. **任务完成** - 更新状态为 done、添加完成备注

**与 gh-issue-implement 对比：**

| 特性 | gh-issue-implement | kanban-implement |
|------|-------------------|------------------|
| 数据源 | GitHub Issues | Code Kanban API |
| 隐私 | 公开 | 本地私有 |
| Worktree | scripts/worktree_manager.js | Kanban API |

---

## 开发

### 添加新 Skill

1. 在 `skills/` 下创建目录
2. 添加 `SKILL.md` (必需，包含 frontmatter)
3. 添加辅助脚本/模板
4. 创建 symlink 到 `~/.claude/skills/`
5. 提交并推送

**SKILL.md 格式：**
```markdown
---
name: my-skill
description: 技能描述，用于触发匹配
---

# 技能标题

## 使用方式
...
```

### 测试

```bash
# 测试 Kanban API
curl http://127.0.0.1:3007/api/v1/health

# 测试 project-index 脚本
node ~/.claude/skills/project-index/scripts/check-stale.js --json

# 测试 kanban-cli
node ~/.claude/skills/kanban/kanban-cli.js status
```

---

## 致谢

本项目基于以下优秀的开源项目和理念：

| 组件 | 来源 | 说明 |
|------|------|------|
| **codeagent-wrapper** | [cexll/myclaude](https://github.com/cexll/myclaude) | 多后端 LLM CLI 封装 |
| **project-index** | [@cexll](https://github.com/cexll) 敏捷开发实践 | 分层 CLAUDE.md 索引思想 |
| **CodeKanban** | [fy0/CodeKanban](https://github.com/fy0/CodeKanban) | 本地任务管理服务 |

---

## 许可证

MIT
