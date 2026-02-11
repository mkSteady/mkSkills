# Status Mode

Read and display thread info:

```
Thread: [name] ([thread-id])
项目: [project path]
Checkpoint: [enabled/disabled]
自动保存: [on/off] (阈值: [N]%)
已归档 Session: [count]
当前 Session: [active/inactive]

最近保存: [timestamp]
下一步: [first P1 item]
```

If Hapi is available, also show current context usage:

```
当前 Context 使用: ~[N]K / [MAX]K tokens ([percent]%)
```

To get context usage, use:
```bash
node ~/.claude/skills/checkpoint/hapi-api.js context $HAPI_SESSION_ID
```

---

# List Mode

List all threads in `.checkpoints/threads/`:

```
项目 Threads:

  1. [name] (thread-abc123)  ← current
     最近保存: [timestamp]
     Session 数: [count]
     状态: [active/archived]

  2. [name] (thread-def456)
     ...
```

Mark the thread pointed to by `.checkpoints/current` with `← current`.
