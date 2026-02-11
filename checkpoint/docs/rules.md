# Important Rules

1. **Thread is conversation-level, not project-level** — multiple threads can exist for the same project
2. **Always verify before resuming** — never trust checkpoint blindly, verify git/test state
3. **Preserve history** — never delete or overwrite archived sessions
4. **Be specific** — include file paths with line numbers, commit hashes, exact test counts
5. **Chinese output** — all user-facing messages in Chinese, technical content (code, paths) in English
6. **Minimal disruption** — don't modify project code during checkpoint operations
7. **Auto-detect project** — use `git remote -v`, `package.json`, or directory name to identify project
8. **Sequence continuity** — archived sessions numbered sequentially (001, 002, ...) and never renumbered
9. **Lazy Hapi fetch** — only call Hapi API when actually needed (save/archive/status), not on every operation
10. **Thread isolation** — each thread's data is self-contained; deleting a thread directory cleanly removes all its data
