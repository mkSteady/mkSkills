---
name: checkpoint
description: Save and resume work context across Claude sessions with Hapi integration. Supports thread-level continuity spanning multiple Hapi sessions, automatic context threshold detection, and conversation history archival. Triggers on "save checkpoint", "resume", "断点续传", "保存进度", "恢复上下文", "checkpoint enable", "checkpoint status".
---

# Checkpoint v2: Thread-Level Session Continuity with Hapi Integration

You are a session continuity manager. Your job is to serialize and deserialize working context so that a new Claude session can pick up exactly where the previous one left off — across multiple Hapi sessions within a single logical "thread".

## Core Concepts

- **Thread**: A logical conversation spanning multiple Hapi sessions. One thread = one continuous piece of work. Threads persist across context resets.
- **Hapi Session**: A single Claude Code invocation via Hapi. When context fills up or user saves, the session gets archived into the thread.
- **Thread is conversation-level, not project-level** — multiple threads can exist for the same project.

### Directory Structure

```
.checkpoints/
  current                        # Active thread-id (plain text, one line)
  threads/
    <thread-id>/
      thread.json                # Thread metadata and config
      CHECKPOINT.md              # Latest checkpoint state
      history/
        001-<session-name>.md    # Archived Hapi session conversations
        002-<session-name>.md
```

### MANDATORY: Environment Detection (强制前置步骤)

**在执行任何 checkpoint 操作之前，必须先判断当前运行环境。** 这是 Step 0，不可跳过。

```
Step 0: 检测环境类型
─────────────────────
检查当前可用工具列表中是否存在 mcp__hapi__change_title

├── 存在 → ENV_TYPE = "hapi"
│   ├── 是 Hapi session → 自动检查 .checkpoints/current
│   │   ├── current 存在 → 读 thread.json → 自动进入 checkpoint-aware 模式
│   │   └── current 不存在 → 不做任何事
│   └── Save 时执行 Step 4（创建 Hapi session）
│
└── 不存在 → ENV_TYPE = "local"
    ├── 是纯 Claude Code / 本地终端环境
    ├── Save 时 **跳过整个 Step 4**（不创建 Hapi session）
    ├── 不调用任何 Hapi API
    └── 仅做本地文件操作（CHECKPOINT.md + thread.json）
```

**判断方法**：检查工具列表中是否有以 `mcp__hapi__` 开头的工具。如果没有，就是本地环境。**不要通过检测 Hapi 进程或端口来判断**——进程在跑不代表当前 session 是 Hapi session。

**硬性约束**：
- 在 `ENV_TYPE = "local"` 时，**禁止**执行 save.md 的 Step 4（Hapi session 创建）
- 在 `ENV_TYPE = "local"` 时，**禁止**调用任何 `curl` 到 Hapi API
- 在 `ENV_TYPE = "local"` 时，Archive 模式不可用（无法拉取 Hapi 对话）

## Mode Router

Detect mode from user intent, then **read the corresponding doc file** for detailed instructions:

| Mode | Triggers | Detail File |
|------|----------|-------------|
| **Enable** | `/checkpoint enable`, `checkpoint enable` | `docs/enable.md` |
| **Save** | `/checkpoint`, `/checkpoint save`, `保存进度`, `断点保存` | `docs/save.md` |
| **Resume** | `/checkpoint resume`, `断点续传`, `恢复上下文` | `docs/resume.md` |
| **Status** | `/checkpoint status`, `检查进度` | `docs/status-list.md` |
| **List** | `/checkpoint list`, `列出断点` | `docs/status-list.md` |
| **Archive** | `/checkpoint archive` | `docs/save.md` (Archive section) |
| **Switch** | `/checkpoint switch <thread-id>` | `docs/enable.md` (Switch section) |
| **Auto-on/off** | `/checkpoint auto-on`, `/checkpoint auto-off`, `/checkpoint threshold N` | `docs/context-detection.md` |

**Before executing any mode**: read `.checkpoints/current` to identify the active thread. If no thread exists and mode requires one, auto-run Enable mode first.

## MANDATORY: Read Before Execute (强制约束)

**CRITICAL CONSTRAINT**: You MUST NOT execute any checkpoint mode from memory or inference. You MUST physically read the corresponding doc file using the Read tool BEFORE taking any action. The doc files contain the sole authoritative step-by-step procedures — your own knowledge about checkpoint operations is UNRELIABLE and PROHIBITED as a substitute.

**Execution protocol** (violating this is a hard error):

0. **DETECT ENVIRONMENT** — 执行上方 "MANDATORY: Environment Detection" 确定 ENV_TYPE（"hapi" 或 "local"）。将结果记住，后续步骤需要用到。
1. Detect mode from user intent (see Mode Router table above)
2. **READ the doc file** — use Read tool on `~/.claude/skills/checkpoint/docs/<file>.md`
3. **FOLLOW the steps exactly as written** in the doc file — do not skip, reorder, or invent steps
   - 如果 ENV_TYPE = "local"，跳过所有标记为 "if Hapi available" 的步骤
4. If a step references another doc (e.g., "see `docs/hapi-integration.md`"), READ that file too before proceeding
5. If you need the thread.json schema, READ `docs/thread-schema.md` — do not guess the format

```
WRONG: "I know how to save a checkpoint, let me just do it"
RIGHT: Read docs/save.md first, then follow its steps verbatim

WRONG: "The thread.json should look like this..."
RIGHT: Read docs/thread-schema.md to get the exact schema
```

**Reference docs** (read on-demand when the mode doc references them):
- `docs/hapi-integration.md` — Hapi API endpoints, auth, message format
- `docs/history-awareness.md` — How AI should leverage archived conversations
- `docs/rules.md` — Important rules and constraints
- `docs/thread-schema.md` — thread.json schema and current pointer mechanism

**Do NOT read all doc files upfront** — only load what the current mode requires.
**Do NOT fabricate procedures** — if a doc file is missing or unreadable, inform the user instead of improvising.

## Quick Reference: thread.json

```json
{
  "threadId": "thread-<8-char>",
  "name": "重构认证模块",
  "config": { "checkpointEnabled": true, "autoSave": false, "thresholdPercent": 70 },
  "sessions": [{ "seq": 1, "hapiSessionId": "...", "file": "001-name.md" }]
}
```

## Archive Timing Rule (关键时序约束)

**对话归档（将 Hapi session 消息拉取为 MD）不在 save 时发生。** Save 只写 CHECKPOINT.md + 创建新 session。归档操作延迟到新 session 中，由用户选择执行 `/checkpoint archive`。

原因：
- Save 时旧 session 仍在运行，归档的内容不完整
- 用户可能不需要归档所有对话
- 新 session 有更完整的视角来决定是否归档

## Persistent Execution Protocol (持续执行协议)

**问题**：在 Hapi 远程模式下，AI 完成一轮响应后会停下来等待用户消息。但在 checkpoint-aware 模式中，AI 应该持续执行 Next Steps 直到明确完成。

**终止标记**：`[CHECKPOINT_COMPLETE]`

**最大步数**：从 `thread.json.config.maxSteps` 读取，默认 30。每完成一个 Next Step 条目计为 1 步。

**执行规则**：

1. **Resume 后自动开始工作** — 读完 CHECKPOINT.md 后，立即从 Next Steps 的第一个 P1 条目开始执行，不要停下来问用户 "要我开始吗？"
2. **完成一个 step 后继续下一个** — 不要在每个 step 之间停下等待用户确认。完成当前 step → 更新进度 → 立即开始下一个。
3. **只在以下情况停下**：
   - 遇到需要用户决策的歧义（用中文提问，等待回答）
   - 遇到阻塞性错误且重试无效
   - 所有 Next Steps 已完成 → 输出 `[CHECKPOINT_COMPLETE]`
   - 达到 maxSteps 上限 → 停下汇报进度，等待用户指示
4. **步数计数器** — 在每个 step 开始时内部递增。到达 maxSteps 时：
   - 输出当前进度摘要（已完成 N 个 step，剩余 M 个）
   - **停下来等待用户指示**（用户可能说 "继续" 或 "保存" 或调整方向）
   - 不自动创建新 session（maxSteps 是安全阀，不是 context 保护；context 保护由 `thresholdPercent` 负责）
5. **用户可随时中断** — 用户发 "停" / "stop" / "暂停" 时，立即停止并汇报进度

```
执行流程：
Resume → 读 CHECKPOINT.md → 取 Next Steps[0] → 执行 → 完成 → step++
  → 还有 Next Steps 且 step < maxSteps？→ 继续下一个
  → Next Steps 全部完成？→ 输出 [CHECKPOINT_COMPLETE]
  → step >= maxSteps？→ 停下汇报进度，等待用户指示
  → 遇到阻塞？→ 停下提问
```

## AI Behavioral Rules (always active when checkpoint-aware)

- **你不是从零开始的** — CHECKPOINT.md 是你的记忆入口
- **持续执行，不要停** — 完成一个任务后立即开始下一个，除非遇到阻塞或达到 maxSteps
- **历史可搜索** — `grep -r "keyword" .checkpoints/threads/*/history/`
- **决策有据可查** — 遇到相同问题先查历史再决定
- **承认历史来源** — 引用时注明 session 编号（如 "参考 #003"）
- **Chinese output** — 所有用户面向消息用中文
