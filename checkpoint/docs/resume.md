# Resume Mode

Restore thread context and continue work.

## Step 1: Find Thread to Resume

Read `.checkpoints/current`:
- If valid, use that thread
- If multiple threads exist and no current pointer, list them and ask user to choose
- If only one thread, use it

## Step 2: Read CHECKPOINT.md

Read `.checkpoints/threads/<thread-id>/CHECKPOINT.md` for the latest state.

## Step 3: Verify State

Compare actual state against recorded state:

```
Checkpoint drift detected:
- Expected branch: main, Actual: main ✓
- Expected last commit: abc1234, Actual: def5678 (2 commits ahead) ⚠
- Tests: 923 passed → 925 passed ✓
```

## Step 4: Handle Previous Session

Check `thread.json.sessions[]` for any session still marked `active: true` (the old session from before the checkpoint save).

If an old active session exists and Hapi is available:

1. Query Hapi API to check if the old session is still running:
   ```bash
   # Get JWT and check old session status
   curl -s -H "Authorization: Bearer $JWT" "$HAPI_URL/api/sessions/$OLD_SESSION_ID"
   ```

2. Ask the user:
   ```
   检测到上一个 Hapi session 仍然存在:
   - Session: [old session name] ([old session id])
   - 状态: [active/inactive]

   是否关闭旧 session？(推荐关闭以避免混淆)
   [1] 是，关闭旧 session
   [2] 否，保留旧 session
   ```

3. If user confirms, archive the old session via Hapi API:
   ```bash
   curl -s -X POST -H "Authorization: Bearer $JWT" "$HAPI_URL/api/sessions/$OLD_SESSION_ID/archive"
   ```

4. Update `thread.json`: mark old session `active: false`

## Step 5: Register New Session with Thread

If Hapi is available:
- Get current Hapi session ID
- Add it to `thread.json.sessions[]` as the new active session
- Update `.checkpoints/current` if needed

## Step 6: Scan History (if needed)

If context about past decisions or abandoned approaches is needed:

```bash
# Read specific archived session
cat .checkpoints/threads/<thread-id>/history/001-初步分析.md

# Search across all archived sessions
grep -r "authentication" .checkpoints/threads/<thread-id>/history/
```

## Step 7: Present Context

```
已恢复断点上下文:
- Thread: [name]
- 上次保存: [timestamp]
- 已归档 Session 数: [count]
- 已完成: [count] 项任务
- 待办: [count] 项
- 下一步: [first P1 item]

是否继续执行下一步？
```

## Step 8: Continue

Proceed with the first P1 item from Next Steps unless user specifies otherwise.
