---
name: kanban
description: Code Kanban 本地任务管理系统。支持项目、任务、Worktree 的完整 CRUD 操作。私有数据不暴露到公开 GitHub。
---

# kanban (本地任务管理)

Code Kanban API 的完整封装，支持项目管理、任务管理、Worktree 集成。

## 环境配置

```bash
# 设置 API 地址 (CodeKanban 默认端口为 3005)
export KANBAN_URL="http://127.0.0.1:3007"
```

> **注意**: 下文所有 `${API}` 均指 `${KANBAN_URL}/api/v1`

## 命令速查

| 命令 | 说明 |
|------|------|
| `/kanban` | 显示当前项目状态 |
| `/kanban list` | 列出所有任务 |
| `/kanban add <title>` | 创建新任务 |
| `/kanban done <id>` | 标记任务完成 |
| `/kanban start <id>` | 开始任务 (in_progress) |
| `/kanban batch` | 批量并行执行 |
| `/kanban worktree <id>` | 为任务创建 worktree |
| `/kanban export` | 导出 AI 友好的任务上下文 |
| `/kanban export --json` | 导出 JSON 格式 |

## 基础配置

```bash
# Shell 中使用 (默认端口 3005，按需修改)
KANBAN_URL="${KANBAN_URL:-http://127.0.0.1:3007}"
API="${KANBAN_URL}/api/v1"
```

```javascript
// JavaScript 中使用
const BASE_URL = process.env.KANBAN_URL || "http://127.0.0.1:3007";
const API = `${BASE_URL}/api/v1`;
```

---

## 1. 项目操作

### 1.1 列出项目

```bash
curl -s "${API}/projects" | jq '.items[] | {id, name, path}'
```

### 1.2 检测当前项目

```bash
# 根据当前目录匹配项目
CWD=$(pwd)
curl -s "${API}/projects" | jq --arg cwd "$CWD" '.items[] | select(.path == $cwd)'
```

### 1.3 创建项目

```bash
curl -X POST "${API}/projects/create" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "项目名称",
    "path": "/path/to/project",
    "description": "项目描述",
    "defaultBranch": "main"
  }'
```

### 1.4 更新项目

```bash
curl -X POST "${API}/projects/{projectId}/update" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新名称",
    "description": "新描述"
  }'
```

---

## 2. 任务操作

### 2.1 列出任务

```bash
# 所有任务
curl -s "${API}/projects/{projectId}/tasks" | jq '.items'

# 按状态过滤
curl -s "${API}/projects/{projectId}/tasks" | jq '.items[] | select(.status == "todo")'

# 按优先级过滤
curl -s "${API}/projects/{projectId}/tasks" | jq '.items[] | select(.priority == 0)'
```

### 2.2 创建任务

```bash
curl -X POST "${API}/projects/{projectId}/tasks/create" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务标题",
    "description": "任务描述\n\nDepends on: [task-id]",
    "status": "todo",
    "priority": 0,
    "tags": ["type/feature", "epic/lifecycle"],
    "dueDate": null,
    "worktreeId": null
  }'
```

> **注意**: `dueDate` 和 `worktreeId` 为必填字段，可设为 `null`

**优先级定义:**
- `0`: P0 紧急
- `1`: P1 高
- `2`: P2 中
- `3`: P3 低

### 2.3 更新任务内容

```bash
# 更新标题和描述（不支持 status）
curl -X POST "${API}/tasks/{taskId}/update" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "新标题",
    "description": "新描述",
    "priority": 0,
    "tags": ["tag1", "tag2"],
    "dueDate": "2026-01-20T23:59:59+08:00"
  }'
```

**UpdateTaskBody 支持的字段:**
- `title` - 任务标题
- `description` - 任务描述
- `priority` - 优先级 (0-3)
- `tags` - 标签数组
- `dueDate` - 截止日期 (ISO 8601)

**注意:** `status` 字段不在 UpdateTaskBody 中，需使用 `/move` 端点。

### 2.4 移动任务（更新状态）

```bash
# 更新状态为 done
curl -X POST "${API}/tasks/{taskId}/move" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'

# 更新状态为 in_progress
curl -X POST "${API}/tasks/{taskId}/move" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'

# 同时更新状态和排序
curl -X POST "${API}/tasks/{taskId}/move" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "done",
    "orderIndex": 1000,
    "worktreeId": "optional-worktree-id"
  }'
```

**MoveTaskBody 支持的字段:**
- `status` - 新状态 (todo/in_progress/done/blocked)
- `orderIndex` - 排序索引
- `worktreeId` - 关联 Worktree

### 2.5 删除任务

```bash
curl -X DELETE "${API}/tasks/{taskId}/delete"
```

### 2.6 任务状态流转

```
todo → in_progress → done
         ↓
       blocked (可选)
```

---

## 3. Worktree 操作

### 3.1 列出 Worktrees

```bash
curl -s "${API}/projects/{projectId}/worktrees" | jq '.items'
```

### 3.2 创建 Worktree

```bash
curl -X POST "${API}/projects/{projectId}/worktrees/create" \
  -H "Content-Type: application/json" \
  -d '{
    "branchName": "fix/issue-123",
    "baseBranch": "main",
    "createBranch": true
  }'
```

> **必填字段**: `branchName`, `baseBranch`, `createBranch`

### 3.3 删除 Worktree

```bash
# 删除 worktree 并删除分支
curl -X POST "${API}/worktrees/{worktreeId}?deleteBranch=true"

# 仅删除 worktree，保留分支
curl -X POST "${API}/worktrees/{worktreeId}?deleteBranch=false"

# 强制删除（有未提交更改时）
curl -X POST "${API}/worktrees/{worktreeId}?force=true&deleteBranch=true"
```

### 3.4 绑定任务到 Worktree

```bash
curl -X POST "${API}/tasks/{taskId}/move" \
  -H "Content-Type: application/json" \
  -d '{
    "worktreeId": "worktree-id"
  }'
```

### 3.4 Worktree 提交

```bash
curl -X POST "${API}/worktrees/{worktreeId}/commit" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "feat: implement feature X"
  }'
```

### 3.5 Worktree 合并

```bash
curl -X POST "${API}/worktrees/{worktreeId}/merge" \
  -H "Content-Type: application/json" \
  -d '{
    "targetBranch": "main"
  }'
```

---

## 4. 评论操作

### 4.1 获取任务评论

```bash
curl -s "${API}/tasks/{taskId}/comments" | jq '.items'
```

### 4.2 添加评论

```bash
curl -X POST "${API}/tasks/{taskId}/comments/create" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "评论内容"
  }'
```

---

## 5. AI 会话操作

### 5.1 获取任务关联的 AI 会话

```bash
curl -s "${API}/tasks/{taskId}/ai-sessions" | jq '.items'
```

### 5.2 关联 AI 会话到任务

```bash
curl -X POST "${API}/tasks/{taskId}/ai-sessions/link" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "ai-session-id"
  }'
```

---

## 6. 批量操作

### 6.1 批量执行

调用 `kanban-batch` skill:

```bash
node ~/.claude/skills/kanban-batch/kanban-planner.js [options]
```

### 6.2 批量创建任务

```javascript
const tasks = [
  { title: "Task 1", priority: 0 },
  { title: "Task 2", priority: 1, deps: "Task 1" },
  { title: "Task 3", priority: 1 },
];

for (const task of tasks) {
  await fetch(`${API}/projects/${projectId}/tasks/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: task.title,
      description: task.deps ? `Depends on: [${task.deps}]` : "",
      status: "todo",
      priority: task.priority,
    }),
  });
}
```

---

## 7. 常用工作流

### 7.1 创建 Epic + 子任务

```bash
# 1. 创建 Epic 任务
EPIC_ID=$(curl -s -X POST "${API}/projects/${PROJECT_ID}/tasks/create" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "[Epic] 资源生命周期治理",
    "description": "## 目标\n统一实现 Disposable 模式",
    "status": "todo",
    "priority": 0,
    "tags": ["type/epic"]
  }' | jq -r '.item.id')

# 2. 创建子任务
curl -X POST "${API}/projects/${PROJECT_ID}/tasks/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"StateEngine dispose\",
    \"description\": \"Depends on: [${EPIC_ID}]\",
    \"status\": \"todo\",
    \"priority\": 0,
    \"tags\": [\"epic/lifecycle\"]
  }"
```

### 7.2 开始任务工作流

```bash
# 1. 创建 worktree
WORKTREE=$(curl -s -X POST "${API}/projects/${PROJECT_ID}/worktrees/create" \
  -H "Content-Type: application/json" \
  -d '{
    "branchName": "fix/task-xxx"
  }' | jq -r '.item.id')

# 2. 绑定到任务并更新状态为进行中
curl -X POST "${API}/tasks/${TASK_ID}/move" \
  -H "Content-Type: application/json" \
  -d "{\"worktreeId\": \"${WORKTREE}\", \"status\": \"in_progress\"}"
```

### 7.3 完成任务工作流

```bash
# 1. 提交代码
curl -X POST "${API}/worktrees/${WORKTREE_ID}/commit" \
  -H "Content-Type: application/json" \
  -d '{"message": "fix: implement dispose"}'

# 2. 合并到主分支
curl -X POST "${API}/worktrees/${WORKTREE_ID}/merge" \
  -H "Content-Type: application/json" \
  -d '{"targetBranch": "main"}'

# 3. 标记任务完成
curl -X POST "${API}/tasks/${TASK_ID}/move" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

---

## 8. 查询示例

### 8.1 看板视图

```bash
echo "=== TODO ==="
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq -r '.items[] | select(.status == "todo") | "[\(.priority)] \(.title)"'

echo "=== IN PROGRESS ==="
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq -r '.items[] | select(.status == "in_progress") | "[\(.priority)] \(.title)"'

echo "=== DONE ==="
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq -r '.items[] | select(.status == "done") | "[\(.priority)] \(.title)"'
```

### 8.2 优先级统计

```bash
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq '
  .items | group_by(.priority) |
  map({priority: .[0].priority, count: length})
'
```

### 8.3 今日到期任务

```bash
TODAY=$(date +%Y-%m-%d)
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq --arg today "$TODAY" '
  .items[] | select(.dueDate != null and (.dueDate | startswith($today)))
'
```

---

## 9. 系统操作

### 9.1 健康检查

```bash
curl -s "${API}/health"
```

### 9.2 版本信息

```bash
curl -s "${API}/system/version"
```

### 9.3 AI 助手状态

```bash
curl -s "${API}/system/ai-assistant-status"
```

---

## 10. 执行指令

当用户调用 `/kanban` 时:

### 无参数 - 显示当前项目状态

```bash
# 检测项目
PROJECT=$(curl -s "${API}/projects" | jq --arg cwd "$(pwd)" '.items[] | select(.path == $cwd)')
PROJECT_ID=$(echo $PROJECT | jq -r '.id')
PROJECT_NAME=$(echo $PROJECT | jq -r '.name')

echo "Project: $PROJECT_NAME"

# 显示任务统计
TASKS=$(curl -s "${API}/projects/${PROJECT_ID}/tasks")
TODO=$(echo $TASKS | jq '[.items[] | select(.status == "todo")] | length')
IN_PROGRESS=$(echo $TASKS | jq '[.items[] | select(.status == "in_progress")] | length')
DONE=$(echo $TASKS | jq '[.items[] | select(.status == "done")] | length')

echo "Tasks: $TODO todo, $IN_PROGRESS in progress, $DONE done"
```

### list - 列出任务

```bash
curl -s "${API}/projects/${PROJECT_ID}/tasks" | jq -r '
  .items | sort_by(.priority) | .[] |
  "[P\(.priority)] [\(.status)] \(.title) (\(.id))"
'
```

### add <title> - 创建任务

```bash
curl -X POST "${API}/projects/${PROJECT_ID}/tasks/create" \
  -H "Content-Type: application/json" \
  -d "{\"title\": \"$TITLE\", \"status\": \"todo\", \"priority\": 2}"
```

### done <id> - 完成任务

```bash
curl -X POST "${API}/tasks/${TASK_ID}/move" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

### batch - 批量执行

```bash
node ~/.claude/skills/kanban-batch/kanban-planner.js
```

### worktree <task-id> - 创建并绑定 worktree

```bash
# 创建 worktree
WORKTREE=$(curl -s -X POST "${API}/projects/${PROJECT_ID}/worktrees/create" \
  -H "Content-Type: application/json" \
  -d "{\"branchName\": \"task/${TASK_ID}\"}" | jq -r '.item.id')

# 绑定并开始
curl -X POST "${API}/tasks/${TASK_ID}/move" \
  -H "Content-Type: application/json" \
  -d "{\"worktreeId\": \"${WORKTREE}\", \"status\": \"in_progress\"}"
```

---

## 与 GitHub 对比

| 功能 | GitHub | Code Kanban |
|------|--------|-------------|
| Issues | 公开 | 私有 |
| Projects | 需创建 | 自动 |
| Worktree | 手动 | API 集成 |
| AI 会话 | 无 | 原生追踪 |
| 终端集成 | 无 | 原生支持 |
| 离线使用 | 否 | 是 |

---

## 常见坑点

### API 方法

**所有写操作都用 POST，不用 PUT/PATCH！**

| 操作 | 正确 | 错误 |
|------|------|------|
| 更新任务内容 | `POST /tasks/{id}/update` | ~~`PUT /tasks/{id}`~~ |
| 更新任务状态 | `POST /tasks/{id}/move` | ~~`PUT /tasks/{id}/update`~~ |
| 创建任务 | `POST /projects/{id}/tasks/create` | ~~`POST /projects/{id}/tasks`~~ |

### UpdateTaskBody vs MoveTaskBody

- **UpdateTaskBody** (`/update`): title, description, priority, tags, dueDate
- **MoveTaskBody** (`/move`): status, orderIndex, worktreeId

`status` 字段只在 MoveTaskBody 中，不要在 `/update` 里传！

### 端点路径

| 操作 | 端点 |
|------|------|
| 获取单个任务 | `GET /api/v1/tasks/{id}` |
| 列出项目任务 | `GET /api/v1/projects/{projectId}/tasks` |
| 创建任务 | `POST /api/v1/projects/{projectId}/tasks/create` |
| 更新任务内容 | `POST /api/v1/tasks/{id}/update` |
| 更新任务状态 | `POST /api/v1/tasks/{id}/move` |

### API 文档

- 在线文档: `${KANBAN_URL}/docs`
- OpenAPI 规范: `${KANBAN_URL}/openapi.yaml`

### Node.js 替代 jq

当系统没有 jq 时，用 node 替代:

```bash
# 替代 jq '.items'
curl -s "${API}/tasks" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(d.items, null, 2));
"

# 替代 jq -r '.item.id'
curl -s "${API}/tasks/${ID}" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(d.item?.id);
"
```
