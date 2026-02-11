# Enable Mode

Create or associate a thread for the current conversation.

## Step 1: Detect Hapi Environment

```bash
# Check for Hapi Hub URL and token
echo "HAPI_URL: ${HAPI_URL:-not set}"
echo "HAPI_TOKEN: ${HAPI_TOKEN:-not set}"
ls ~/.hapi/ 2>/dev/null
```

If Hapi is not available, fall back to local-only mode.

## Step 2: Create or Find Thread

```bash
mkdir -p .checkpoints/threads
```

Check if a thread already exists:

```bash
for dir in .checkpoints/threads/*/; do
  if [ -f "$dir/thread.json" ]; then
    cat "$dir/thread.json"
  fi
done
```

If no active thread exists, create one:
- Generate `thread-<8-char-random>` ID
- Ask user for thread name (or auto-derive from current task)
- Write `thread.json` with `checkpointEnabled: true`
- Default `autoSave: false`

## Step 3: Write Current Pointer

```bash
echo "<thread-id>" > .checkpoints/current
```

## Step 4: Associate Current Hapi Session

If Hapi is available, fetch current session info and add to `thread.json.sessions[]` with `active: true`.

## Step 5: Report

```
已启用 Checkpoint (Thread 级别):
- Thread: <name>
- Thread ID: <id>
- Hapi 集成: <是/否>
- 自动保存: <开启/关闭>
- 阈值: <percent>%

使用 /checkpoint save 手动保存，或 /checkpoint auto-on 开启自动保存。
```

---

# Switch Mode

`/checkpoint switch <thread-id>`

1. Verify target thread exists in `.checkpoints/threads/<thread-id>/`
2. Update `.checkpoints/current` to point to the new thread-id
3. Read and display the target thread's CHECKPOINT.md summary
4. Report:

```
已切换到 Thread: <name> (<thread-id>)
```

## --no-switch Flag

`/checkpoint enable --no-switch` creates a new thread but does NOT update `.checkpoints/current`. Useful when:
- Another Claude is already working on the main thread
- You want to create a side-thread (bugfix, experiment) without disrupting the primary pointer
