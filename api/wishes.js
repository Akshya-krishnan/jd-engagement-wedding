/**
 * Shared wishes wall.
 *   GET  /api/wishes  → [{ name, message, at }, ...] newest first
 *   POST /api/wishes  { name, message } → the saved wish
 */
import { redis, redisConfigured, readBody, send } from './_redis.js';

const KEY = 'jd:wishes';
const KEEP = 1000;

export default async function handler(req, res) {
  if (!redisConfigured()) return send(res, 503, { error: 'Shared storage is not connected' });

  try {
    if (req.method === 'GET') {
      const [rows] = await redis(['LRANGE', KEY, 0, 299]);
      const wishes = (rows || [])
        .map((r) => { try { return JSON.parse(r); } catch (e) { return null; } })
        .filter(Boolean);
      return send(res, 200, wishes);
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const message = String(body.message || '').trim().slice(0, 500);
      const name = String(body.name || '').trim().slice(0, 60) || 'A well-wisher';
      if (!message) return send(res, 400, { error: 'Message is required' });
      const wish = { name, message, at: Date.now() };
      await redis(['LPUSH', KEY, JSON.stringify(wish)], ['LTRIM', KEY, 0, KEEP - 1]);
      return send(res, 201, wish);
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return send(res, 500, { error: 'Could not reach the wishes store' });
  }
}
