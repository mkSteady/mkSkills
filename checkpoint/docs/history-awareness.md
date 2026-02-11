# History Awareness: AI 如何利用历史对话

Checkpoint 的核心价值不仅是保存/恢复状态，更是让 AI **具备跨 session 的记忆**。

## 何时查阅历史

AI 应在以下场景 **主动** 查阅 `.checkpoints/threads/<thread-id>/history/` 目录：

1. **Resume 后遇到不确定的设计决策** — 先搜索历史：
   ```bash
   grep -r "<关键词>" .checkpoints/threads/*/history/
   ```

2. **用户提到"之前讨论过"或"上次说的"** — 在历史 MD 中搜索

3. **遇到代码中不理解的设计选择** — 历史可能记录了原因

4. **需要回顾被放弃的方案** — 历史中有尝试过但否决的方案

5. **新 session 开始时** — 读 CHECKPOINT.md 后按需深入历史

## 信息源优先级

```
优先级 1: CHECKPOINT.md          — 最新状态快照
优先级 2: git log + git diff      — 代码的真实当前状态
优先级 3: history/NNN-*.md        — 按需查阅，用 grep 定位
```

## 查阅方法

**快速定位**（推荐）：
```bash
grep -rn "认证" .checkpoints/threads/<thread-id>/history/
ls -la .checkpoints/threads/<thread-id>/history/
```

**深度阅读**（需要完整上下文时）：
```bash
cat .checkpoints/threads/<thread-id>/history/003-重构中间件.md
```

## 主动告知用户

当从历史中找到相关信息时：

```
在历史对话 #002（实现JWT）中发现：之前讨论过使用 RS256 而非 HS256，
原因是需要支持多服务验证。我将沿用这个决策继续实现。
```

## Session 内持续感知

1. **开始时**：读 CHECKPOINT.md，了解 thread 上下文和 next steps
2. **工作中**：遇到不确定时主动搜索历史
3. **完成重要决策时**：记录到 CHECKPOINT.md 的 Key Decisions 表
4. **结束前**：如果 thread 已启用 checkpoint，提醒用户保存
