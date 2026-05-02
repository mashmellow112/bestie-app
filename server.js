const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const GEMINI_MAX_RETRIES = 3;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 300;
const responseCache = new Map();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // Always prefer the current .env value for local development consistency.
    process.env[key] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

loadEnv();

function getAiProvider() {
  return (process.env.AI_PROVIDER || 'gemini').toLowerCase();
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseInsertMessages(rows) {
  if (!hasSupabaseConfig() || !Array.isArray(rows) || rows.length === 0) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${body}`);
  }
}

async function supabaseFetchHistory(userId) {
  if (!hasSupabaseConfig()) return [];
  const select = encodeURIComponent('role,content,created_at');
  const query = `${SUPABASE_URL}/rest/v1/messages?select=${select}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`;
  const response = await fetch(query, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data?.message || `Supabase history fetch failed: ${response.status}`);
  }
  return Array.isArray(data) ? data : [];
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePrompt(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

function buildCacheKey(userId, message) {
  return `${userId}::${normalizePrompt(message)}`;
}

function getCachedReply(userId, message) {
  const key = buildCacheKey(userId, message);
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return hit.reply;
}

function setCachedReply(userId, message, reply) {
  const key = buildCacheKey(userId, message);
  responseCache.set(key, { reply, createdAt: Date.now() });

  // Simple eviction: drop oldest entry when limit is exceeded.
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
}

async function callOpenRouter(message) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('Missing OPENROUTER_API_KEY for OpenRouter fallback.');
  }

  const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: "You are Bestie, an empathetic AI relationship coach for Gen Z. Keep responses supportive, clear, and practical. Format every answer for easy reading: 1) short title, 2) 3-6 bullet points, 3) one quick actionable next step. Keep it concise and avoid huge walls of text. Do not start with greetings like 'Hey bestie'. Do not use markdown asterisks like ** in the final output."
        },
        { role: 'user', content: message }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenRouter error ${response.status}`);
  }

  return (
    data?.choices?.[0]?.message?.content?.trim() ||
    'I am here with you. Could you share a little more?'
  );
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8'
  };
  return map[ext] || 'application/octet-stream';
}

async function handleChat(req, res) {
  const { userId, message } = await parseBody(req);
  if (!userId || !message || typeof message !== 'string') {
    return json(res, 400, { error: 'userId and message are required.' });
  }

  const cachedReply = getCachedReply(userId, message);
  if (cachedReply) {
    return json(res, 200, { reply: cachedReply, cached: true });
  }

  // Use OpenRouter directly when configured.
  if (getAiProvider() === 'openrouter') {
    try {
      const reply = await callOpenRouter(message);
      setCachedReply(userId, message, reply);
      await supabaseInsertMessages([
        { user_id: userId, role: 'user', content: message },
        { user_id: userId, role: 'ai', content: reply }
      ]);
      return json(res, 200, { reply, provider: 'openrouter' });
    } catch (error) {
      return json(res, 500, { error: error.message || 'OpenRouter request failed' });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your_actual_api_key_here')) {
    return json(res, 500, {
      error: 'Missing GEMINI_API_KEY. Put your real key in .env and restart server.'
    });
  }

  const model = 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: "You are Bestie, an empathetic AI relationship coach for Gen Z. Keep responses supportive, clear, and practical. Format every answer for easy reading: 1) short title, 2) 3-6 bullet points, 3) one quick actionable next step. Keep it concise and avoid huge walls of text. Do not start with greetings like 'Hey bestie'. Do not use markdown asterisks like ** in the final output."
        }
      ]
    }
  };

  let response;
  let data;
  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (response.ok) {
      break;
    }

    // Retry only for rate-limits.
    if (response.status === 429 && attempt < GEMINI_MAX_RETRIES) {
      const delayMs = 1200 * attempt;
      await sleep(delayMs);
      continue;
    }

    if (response.status === 429) {
      // Optional fallback: if OpenRouter key is present, use free models router.
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const reply = await callOpenRouter(message);
          setCachedReply(userId, message, reply);
          await supabaseInsertMessages([
            { user_id: userId, role: 'user', content: message },
            { user_id: userId, role: 'ai', content: reply }
          ]);
          return json(res, 200, { reply, provider: 'openrouter_fallback' });
        } catch (_) {}
      }
      return json(res, 429, {
        error: 'Gemini rate limit reached. Please wait 10-30 seconds and try again.'
      });
    }

    return json(res, response.status, {
      error: data?.error?.message || 'Gemini request failed'
    });
  }

  if (!response || !response.ok) {
    return json(res, 500, { error: 'Unable to complete AI request right now.' });
  }

  const reply =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n').trim() ||
    'I am here with you. Could you share a little more?';

  setCachedReply(userId, message, reply);
  await supabaseInsertMessages([
    { user_id: userId, role: 'user', content: message },
    { user_id: userId, role: 'ai', content: reply }
  ]);
  return json(res, 200, { reply });
}

function serveStatic(req, res, pathname) {
  let target = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(target);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const absolute = path.join(ROOT, normalized);

  if (!absolute.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(absolute, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeType(absolute) });
    fs.createReadStream(absolute).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        provider: getAiProvider(),
        openrouterKeySet: Boolean(process.env.OPENROUTER_API_KEY),
        geminiKeySet: Boolean(process.env.GEMINI_API_KEY),
        supabaseConfigured: hasSupabaseConfig()
      });
    }

    if (req.method === 'GET' && pathname === '/api/history') {
      const userId = url.searchParams.get('userId');
      if (!userId) return json(res, 400, { error: 'userId is required' });
      try {
        const messages = await supabaseFetchHistory(userId);
        return json(res, 200, { messages });
      } catch (error) {
        return json(res, 500, { error: error.message || 'Failed to fetch history' });
      }
    }

    if (req.method === 'OPTIONS' && pathname === '/api/chat') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      await handleChat(req, res);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    json(res, 500, { error: error.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Bestie server running on http://localhost:${PORT}`);
});


