#!/usr/bin/env node
/**
 * Hapi API Helper for Checkpoint Skill
 * Usage: node hapi-api.js <command> [args...]
 *
 * Commands:
 *   sessions                    - List all sessions
 *   session <id>                - Get session details
 *   messages <id> [limit]       - Fetch messages (default limit: 200)
 *   context <id>                - Get context usage from latest message
 *   archive <id> [outfile]      - Archive session messages to markdown
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function getConfig() {
  const url = process.env.HAPI_URL || process.env.HAPI_HUB_URL || '';
  const token = process.env.HAPI_TOKEN || process.env.CLI_API_TOKEN || '';

  if (!url || !token) {
    // Try reading from ~/.hapi/
    const hapiDir = path.join(require('os').homedir(), '.hapi');
    try {
      const files = fs.readdirSync(hapiDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const cfg = JSON.parse(fs.readFileSync(path.join(hapiDir, f), 'utf8'));
          if (cfg.apiUrl && cfg.token) {
            return { url: cfg.apiUrl, token: cfg.token };
          }
        }
      }
    } catch {}
  }

  return { url: url.replace(/\/$/, ''), token };
}

function fetch(urlStr, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(urlStr, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
  });
}

function formatMessages(messages) {
  let md = '';
  for (const msg of messages) {
    const c = msg.content;
    if (!c) continue;

    if (c.role === 'user' && c.content?.type === 'text') {
      md += `## User\n\n${c.content.text}\n\n`;
    } else if (c.role === 'agent' && c.content?.type === 'output') {
      const d = c.content.data;
      if (d?.type === 'assistant' && d?.message?.content) {
        const text = Array.isArray(d.message.content)
          ? d.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : String(d.message.content);
        if (text) md += `## Assistant\n\n${text}\n\n`;
      }
    }
  }
  return md;
}

function extractContextUsage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content;
    if (c?.role === 'agent' && c?.content?.data?.usage) {
      const u = c.content.data.usage;
      const ctx = (u.cache_creation_input_tokens || 0) +
                  (u.cache_read_input_tokens || 0) +
                  u.input_tokens;
      return {
        contextSize: ctx,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheCreation: u.cache_creation_input_tokens || 0
      };
    }
  }
  return null;
}

async function main() {
  const [,, command, ...args] = process.argv;
  const { url, token } = getConfig();

  if (!url || !token) {
    console.error(JSON.stringify({ error: 'No Hapi config found. Set HAPI_URL and HAPI_TOKEN.' }));
    process.exit(1);
  }

  switch (command) {
    case 'sessions': {
      const data = await fetch(`${url}/sessions`, token);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'session': {
      const [id] = args;
      if (!id) { console.error('Usage: session <id>'); process.exit(1); }
      const data = await fetch(`${url}/sessions/${encodeURIComponent(id)}`, token);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'messages': {
      const [id, limit = '200'] = args;
      if (!id) { console.error('Usage: messages <id> [limit]'); process.exit(1); }
      const data = await fetch(`${url}/sessions/${encodeURIComponent(id)}/messages?limit=${limit}`, token);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'context': {
      const [id] = args;
      if (!id) { console.error('Usage: context <id>'); process.exit(1); }
      const data = await fetch(`${url}/sessions/${encodeURIComponent(id)}/messages?limit=20`, token);
      const usage = extractContextUsage(data.messages || []);
      if (usage) {
        const maxTokens = 200000;
        const percent = Math.round((usage.contextSize / maxTokens) * 100);
        console.log(JSON.stringify({ ...usage, maxTokens, percent }));
      } else {
        console.log(JSON.stringify({ error: 'No usage data found' }));
      }
      break;
    }
    case 'archive': {
      const [id, outfile] = args;
      if (!id) { console.error('Usage: archive <id> [outfile]'); process.exit(1); }
      // Paginate all messages
      let allMessages = [];
      let beforeSeq = null;
      while (true) {
        const params = beforeSeq ? `limit=200&beforeSeq=${beforeSeq}` : 'limit=200';
        const data = await fetch(`${url}/sessions/${encodeURIComponent(id)}/messages?${params}`, token);
        const msgs = data.messages || [];
        if (msgs.length === 0) break;
        allMessages = msgs.concat(allMessages);
        const minSeq = Math.min(...msgs.filter(m => m.seq != null).map(m => m.seq));
        if (msgs.length < 200 || minSeq <= 1) break;
        beforeSeq = minSeq;
      }
      const md = `# Session Archive\n\n**Session ID**: ${id}\n**Archived**: ${new Date().toISOString()}\n**Messages**: ${allMessages.length}\n\n---\n\n${formatMessages(allMessages)}`;
      if (outfile) {
        fs.mkdirSync(path.dirname(outfile), { recursive: true });
        fs.writeFileSync(outfile, md);
        console.log(JSON.stringify({ ok: true, file: outfile, messageCount: allMessages.length }));
      } else {
        process.stdout.write(md);
      }
      break;
    }
    default:
      console.error('Commands: sessions, session, messages, context, archive');
      process.exit(1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
