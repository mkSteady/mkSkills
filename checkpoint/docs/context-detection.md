# Context Usage Detection & Auto-Save

## How to Estimate Context Usage

Use the helper script:

```bash
node ~/.claude/skills/checkpoint/hapi-api.js context $HAPI_SESSION_ID
```

Output:
```json
{ "contextSize": 140000, "inputTokens": 5000, "outputTokens": 3000, "maxTokens": 200000, "percent": 70 }
```

Or inline:
```bash
curl -s -H "Authorization: Bearer $HAPI_TOKEN" \
  "$HAPI_URL/sessions/$HAPI_SESSION_ID/messages?limit=10" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    for (let i = (data.messages||[]).length - 1; i >= 0; i--) {
      const c = data.messages[i].content;
      if (c?.role === 'agent' && c?.content?.data?.usage) {
        const u = c.content.data.usage;
        const ctx = (u.cache_creation_input_tokens||0) + (u.cache_read_input_tokens||0) + u.input_tokens;
        console.log(JSON.stringify({ contextSize: ctx, percent: Math.round(ctx/200000*100) }));
        break;
      }
    }
  "
```

## Model Max Tokens Reference

| Model | Max Context |
|-------|------------|
| Claude Sonnet 4 | 200,000 |
| Claude Opus 4 | 200,000 |
| Claude Haiku 3.5 | 200,000 |

Default to 200,000 if model is unknown.

## Auto-Save Behavior

When `config.autoSave` is `true` in `thread.json`:

1. After significant operations (file edits, multi-step tasks), check context usage
2. If `contextSize / modelMaxTokens >= thresholdPercent / 100`:
   - Notify: `⚠ Context 使用已达 [N]%，建议保存 Checkpoint。执行 /checkpoint save？`
   - If user confirms, run Save mode
3. Advisory, not blocking — AI suggests but user decides

## Commands

- `/checkpoint auto-on` — set `autoSave: true` in `thread.json`
- `/checkpoint auto-off` — set `autoSave: false`
- `/checkpoint threshold 80` — change threshold percentage
