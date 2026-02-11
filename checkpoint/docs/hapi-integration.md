# Hapi Integration Details

## Credential Auto-Discovery (凭据自动发现)

**不需要环境变量。** Hapi 凭据从本地文件自动读取：

```bash
# Token: 从 ~/.hapi/settings.json 读取 cliApiToken
HAPI_TOKEN=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.hapi/settings.json','utf8')).cliApiToken)")

# Hub URL: 固定为 http://127.0.0.1:3006
HAPI_URL="http://127.0.0.1:3006"
```

**发现流程（Step 4 执行前）**：
1. 读取 `~/.hapi/settings.json` → 提取 `cliApiToken`
2. 如果文件不存在或无 token → 跳过 Step 4，仅本地保存
3. 用 token 换 JWT：`POST $HAPI_URL/api/auth` with `{"accessToken":"<token>"}`
4. JWT 用于后续所有 `/api/*` 调用

**文件位置**：
| 文件 | 内容 |
|------|------|
| `~/.hapi/settings.json` | `cliApiToken`, `machineId` |
| `~/.hapi/runner.state.json` | Runner PID, httpPort (非 Hub 端口) |

**注意**: Runner httpPort (如 40623) 是 Runner 控制端口，不是 Hub API 端口。Hub API 始终在 3006。

## Authentication Flow

```
~/.hapi/settings.json → cliApiToken
    ↓
POST /api/auth {"accessToken": "<cliApiToken>"}
    ↓
JWT token (expires in 15min)
    ↓
Authorization: Bearer <JWT> for all /api/* calls
```

## Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|--------|
| `/api/auth` | POST | Exchange accessToken for JWT |
| `/api/machines` | GET | List online machines (need machine ID for spawn) |
| `/api/machines/:id/spawn` | POST | Spawn new session on machine |
| `/api/sessions` | GET | List all Hapi sessions |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id/messages` | GET | Fetch conversation history |
| `/api/sessions/:id/messages` | POST | Send message to active session |
| `/api/sessions/:id/resume` | POST | Resume inactive session (**不适用于 active session**) |
| `/api/sessions/:id/archive` | POST | Archive/close session |
| `/api/sessions/:id/permission-mode` | POST | Set permission mode |
| `/api/sessions/:id/model` | POST | Set model mode |

**重要**：`POST /api/sessions/:id/resume` 对 active session 会短路返回相同 ID（`syncEngine.ts:324`）。创建新 session 应使用 `POST /api/machines/:id/spawn`。

## Helper Script

`~/.claude/skills/checkpoint/hapi-api.js` provides:

```bash
node hapi-api.js sessions              # List all sessions
node hapi-api.js session <id>          # Get session details
node hapi-api.js messages <id> [limit] # Fetch messages
node hapi-api.js context <id>          # Get context usage %
node hapi-api.js archive <id> [file]   # Archive to markdown
```

## Message Format

Messages from `/api/sessions/:id/messages` have this structure:
```json
{
  "messages": [
    {
      "id": "msg-123",
      "seq": 1,
      "createdAt": 1707472800000,
      "content": {
        "role": "user|agent",
        "content": {
          "type": "text|output",
          "text": "...",
          "data": { "type": "assistant", "message": { "content": [...] }, "usage": {...} }
        }
      }
    }
  ]
}
```

Usage data in agent messages:
```json
{
  "input_tokens": 5000,
  "output_tokens": 3000,
  "cache_read_input_tokens": 100000,
  "cache_creation_input_tokens": 30000
}
```

`contextSize = cache_creation_input_tokens + cache_read_input_tokens + input_tokens`

## Fallback: Local-Only Mode

If Hapi is not available (no `~/.hapi/settings.json` or Hub unreachable):
- No session archival from Hapi (user describes what was done manually)
- CHECKPOINT.md still written
- Git state and test state still captured
- Thread management still works
- Skip Step 4 entirely, report as local-only save
