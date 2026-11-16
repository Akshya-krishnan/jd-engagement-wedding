/**
 * Tiny Upstash Redis REST client shared by the API routes (files starting with "_"
 * are not exposed as routes by Vercel).
 *
 * Connect a Redis store in Vercel (Storage → Upstash for Redis → connect to this
 * project). Vercel then adds the env vars below automatically.
 */

const URL_VARS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'];
const TOKEN_VARS = ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'];

function env(names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
}

export function redisConfigured() {
  return Boolean(env(URL_VARS) && env(TOKEN_VARS));
}

/** Runs several Redis commands in one round trip; returns their results in order. */
export async function redis(...commands) {
  const url = env(URL_VARS).replace(/\/$/, '');
  const token = env(TOKEN_VARS);
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands.map((c) => c.map(String)))
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

/** Request body as an object, whether it arrived as JSON or plain text. */
export function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) { return {}; }
  }
  return b;
}

export function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(data);
}
