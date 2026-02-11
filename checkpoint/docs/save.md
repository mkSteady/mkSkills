# Save Mode

Write CHECKPOINT.md + create new Hapi session with handoff context.

**CRITICAL**: 对话归档（将 Hapi session 消息拉取为 MD 文件）**不在 save 时发生**。归档操作应延迟到新 session 中，由用户选择是否执行。Save 只做两件事：写 CHECKPOINT.md 和创建新 session。

## Step 1: Find Active Thread

Read `.checkpoints/current`. If no thread exists, auto-run Enable mode first.

## Step 2: Gather State (parallel)

```bash
git status --short
git log --oneline -10
git diff --stat HEAD
git branch --show-current

# Test state (if applicable)
npm run test 2>&1 | tail -5
npm run typecheck 2>&1 | tail -5
```

## Step 3: Write CHECKPOINT.md

Write `.checkpoints/threads/<thread-id>/CHECKPOINT.md`:

```markdown
# Checkpoint: [Thread Name]

**Thread ID**: [thread-id]
**Saved**: [ISO timestamp]
**Branch**: [current branch]
**Last Commit**: [hash] - [message]
**Session History**: [N] sessions in thread

## Current Task

[What was being worked on]

## Completed Work

[Bulleted list with commit hashes]

## Uncommitted Changes

| File | Type | Description |
|------|------|-------------|
| ... | Modified/New/Deleted | ... |

## Key Decisions

| Decision | Rationale | Session |
|----------|----------|--------|
| ... | ... | #NNN |

## Test State

[test count] tests, [pass/fail status]
Typecheck: [clean/errors]

## Key Files

| File | Role |
|------|------|
| ... | ... |

## Next Steps (Priority Order)

1. [P1] ...
2. [P2] ...

## Session History

| # | Name | Archived | Context Used |
|---|------|----------|--------------|
| 001 | 初步分析 | 2026-02-09 11:00 | 72% |
```

Also maintain a backward-compatible `CHECKPOINT.md` symlink or copy in project root.

## Step 4: Create New Hapi Session (ONLY if ENV_TYPE = "hapi")

**环境守卫（硬性约束）**：
- 如果 ENV_TYPE = "local"（即当前不是 Hapi session），**跳过整个 Step 4**，直接到 Step 5
- 判断标准：当前可用工具列表中是否存在以 `mcp__hapi__` 开头的工具
- **Hapi 进程在后台运行 ≠ 当前是 Hapi session**。即使 Hapi Hub 在端口 3006 运行，如果当前 Claude Code 不是通过 Hapi 启动的，就不应该调用 Hapi API

Save 完成后，通过 Hapi API 创建新 session，让新 AI 继承 checkpoint 上下文。

### 4a: Auto-Discover Credentials & Get JWT

**不需要环境变量。** 凭据从本地文件自动发现（详见 `docs/hapi-integration.md`）：

```bash
# 自动发现 token（从 ~/.hapi/settings.json）
HAPI_TOKEN=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.hapi/settings.json','utf8')).cliApiToken)}catch(e){}")
HAPI_URL="http://127.0.0.1:3006"

# 如果 token 为空 → Hapi 未安装，跳过 Step 4，仅本地保存
if [ -z "$HAPI_TOKEN" ]; then
  echo "Hapi not configured, skipping remote session creation"
  # 仅本地保存，不报错
fi

# 换取 JWT
JWT=$(curl -s -X POST "$HAPI_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"accessToken\":\"$HAPI_TOKEN\"}" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).token||''))")

# JWT 为空 → Hub 未运行，跳过
if [ -z "$JWT" ]; then
  echo "Hapi Hub unreachable, skipping remote session creation"
fi
```

### 4b: Spawn New Session on Online Machine

**注意**: 不要使用 `POST /api/sessions/:id/resume`——当 session 仍 active 时，resume 会短路返回相同 session ID（`syncEngine.ts:324`）。正确方式是通过 machine spawn API 创建全新 session。

```bash
# 1. 获取在线 machine ID
MACHINE_ID=$(curl -s -H "Authorization: Bearer $JWT" \
  "$HAPI_URL/api/machines" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d).machines;process.stdout.write(m.length?m[0].id:'')})")

# 2. 在 machine 上 spawn 新 session
NEW_SESSION=$(curl -s -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  "$HAPI_URL/api/machines/$MACHINE_ID/spawn" \
  -d "{\"directory\":\"$(pwd)\"}")
# Response: {"type":"success","sessionId":"<new-id>"}
```

This calls `engine.spawnSession()` → RPC `spawn-happy-session` → creates a brand new Claude session in the same directory.

### 4c: Send Handoff Message to New Session

The handoff message is **NOT the same as CHECKPOINT.md**. It's a concise orientation for the new AI:

```bash
NEW_SESSION_ID="<from spawn response>"
curl -s -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  "$HAPI_URL/api/sessions/$NEW_SESSION_ID/messages" \
  -d '{"text":"<handoff message>"}'
```

**Handoff message format** (construct this dynamically):

```
你好，这是一个 Checkpoint 恢复的 session。

## 恢复指引
1. 读取 .checkpoints/current 获取 thread ID
2. 读取 .checkpoints/threads/<thread-id>/CHECKPOINT.md 获取完整状态
3. 查看 git log 和 git status 确认代码状态
4. 立即从 Next Steps 的第一个 P1 条目开始执行

## 快速上下文
- Thread: [name]
- 分支: [branch]
- 最近提交: [hash] - [message]
- 下一步: [first P1 item from Next Steps]

## 持续执行协议
- 读完 CHECKPOINT.md 后立即开始工作，不要停下来问用户
- 完成一个 step 后继续下一个，不要等待用户确认
- 只在遇到阻塞性问题或需要用户决策时停下提问
- 所有 Next Steps 完成后输出 [CHECKPOINT_COMPLETE]
- 达到 maxSteps (默认 30) 时停下汇报进度，等待用户指示

## 旧 session 归档
旧 session (ID: [old-session-id]) 的对话内容尚未归档。
如需归档，请执行 /checkpoint archive 将旧 session 对话保存到 history/ 目录。

## 注意
- 历史对话在 .checkpoints/threads/<thread-id>/history/ 下（如果已有归档的话）
- 所有设计决策记录在 CHECKPOINT.md 的 Key Decisions 表中
- 遇到不确定的决策时，先搜索历史再决定
```

### 4d: Update thread.json

- Add new session entry with `active: true`
- **Do NOT mark old session as archived yet** — old session remains `active: true` until user chooses to archive it in the new session
- Update `updatedAt`

### 4e: Report to User

```
Checkpoint 已保存:
- CHECKPOINT.md 已更新
- 新 Hapi session 已创建: <new-session-id>
- 旧 session 保留中（对话内容未归档，可在新 session 中执行 /checkpoint archive）

新 session 的 AI 已收到恢复指引。
```

**如果用户不希望自动创建新 session**，跳过 Step 4，仅完成 CHECKPOINT.md 写入。在 save 时询问用户是否自动创建新 session。

## Step 5: Commit (if requested)

```bash
git add .checkpoints/
git commit -m "chore: save checkpoint - [brief description]"
```

---

# Archive Mode

从 Hapi 拉取指定 session 的对话内容并保存为 MD 文件。**此操作通常在新 session 中执行，由用户主动触发。**

## When to Archive

- 新 session 中用户执行 `/checkpoint archive`
- AI 在 resume 时建议用户归档旧 session 的对话
- 用户手动决定保留对话记录

## Steps

1. Identify which session to archive (from `thread.json.sessions[]` where not the current session)
2. Auto-discover credentials (same as Step 4a above) and get JWT
3. Fetch messages:
   ```bash
   node ~/.claude/skills/checkpoint/hapi-api.js archive $OLD_SESSION_ID \
     ".checkpoints/threads/<thread-id>/history/NNN-<session-name>.md"
   ```
4. Update `thread.json`: mark archived session `active: false`, record `archivedAt`, `file`, `contextSizeAtEnd`
5. Optionally close the old Hapi session:
   ```bash
   curl -s -X POST -H "Authorization: Bearer $JWT" \
     "$HAPI_URL/api/sessions/$OLD_SESSION_ID/archive"
   ```
6. Report:
   ```
   旧 session 已归档:
   - 保存到: history/NNN-<name>.md
   - 消息数: [count]
   - 旧 session 状态: [已关闭/保留]
   ```
