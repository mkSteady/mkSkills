# Thread Schema & Current Pointer

## Current Thread Pointer

`.checkpoints/current` 文件内容 = 当前活跃的 thread-id（纯文本，一行）。

**绑定机制**：
- `/checkpoint enable` 时写入 `.checkpoints/current`
- 所有其他命令先读 `.checkpoints/current` 确定当前 thread
- `/checkpoint resume` 时：`current` 有效则直接使用，否则列出所有 thread 让用户选择
- `/checkpoint switch <thread-id>` 更新 `current` 文件
- `current` 不存在 = 当前 session 未绑定任何 thread

**Hapi 环境自动检测**：
```
1. 检测 mcp__hapi__change_title tool 是否可用
   ├── Hapi session → 自动检查 .checkpoints/current
   │   ├── current 存在且有效 → 读 thread.json → 注册当前 Hapi session → checkpoint-aware 模式
   │   └── current 不存在 → 不做任何事（用户可 /checkpoint enable）
   └── 非 Hapi session → 仅用户显式调用时触发
```

**为什么区分**：
- Hapi 有完整 API（拉取对话、获取 context 使用量），自动检查有价值
- 普通 Claude Code 无 Hapi API，自动检查产生无意义开销
- 判断零成本：AI 检查自己是否拥有 `mcp__hapi__change_title` tool

**多 Claude 并行**：
- `current` 是项目级的，指向主工作线
- 其他 Claude 可 `/checkpoint enable --no-switch` 创建独立 thread
- 每个 thread 通过 `thread.json` 自包含，不依赖 `current` 指针

## thread.json Schema

```json
{
  "threadId": "thread-<8-char-random>",
  "name": "重构认证模块",
  "project": "my-project",
  "createdAt": "2026-02-09T10:00:00Z",
  "updatedAt": "2026-02-09T12:30:00Z",
  "config": {
    "checkpointEnabled": true,
    "autoSave": false,
    "thresholdPercent": 70,
    "modelMaxTokens": 200000,
    "maxSteps": 30
  },
  "sessions": [
    {
      "seq": 1,
      "hapiSessionId": "hapi-sess-001",
      "name": "初步分析",
      "archivedAt": "2026-02-09T11:00:00Z",
      "file": "001-初步分析.md",
      "contextSizeAtEnd": 145000
    },
    {
      "seq": 2,
      "hapiSessionId": "hapi-sess-002",
      "active": true
    }
  ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `threadId` | Unique ID, format `thread-<8-char>` |
| `name` | Human-readable thread name |
| `project` | Project directory name |
| `config.checkpointEnabled` | Whether checkpoint is active |
| `config.autoSave` | Auto-save when context threshold reached |
| `config.thresholdPercent` | Context % threshold for auto-save (default 70) |
| `config.modelMaxTokens` | Model max context (default 200000) |
| `config.maxSteps` | Max steps before pausing for user input (default 30, safety valve against infinite loops) |
| `sessions[].seq` | Sequential number (never renumbered) |
| `sessions[].hapiSessionId` | Hapi session ID |
| `sessions[].active` | True if this is the current session |
| `sessions[].file` | Filename in `history/` |
| `sessions[].contextSizeAtEnd` | Token count when archived |
