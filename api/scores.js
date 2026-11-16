/**
 * Shared team scoreboard for the rose game. Every guest picks a side (Jithin or
 * Dona) and the roses they catch are added to that side's running total, so the
 * next guest sees the current standings and chooses whom to help.
 *   GET  /api/scores                  → { groom, bride, groomPlayers, bridePlayers }
 *   POST /api/scores { side, score }  → the updated board
 */
import { redis, redisConfigured, readBody, send } from './_redis.js';

const KEY = 'jd:teams';
const MAX_SCORE = 500; // one round can't realistically go beyond this

function toBoard(flat) {
  const map = {};
  for (let i = 0; flat && i < flat.length; i += 2) map[flat[i]] = Number(flat[i + 1]) || 0;
  return {
    groom: map.groom || 0,
    bride: map.bride || 0,
    groomPlayers: map.groomPlayers || 0,
    bridePlayers: map.bridePlayers || 0
  };
}

export default async function handler(req, res) {
  if (!redisConfigured()) return send(res, 503, { error: 'Shared storage is not connected' });

  try {
    if (req.method === 'GET') {
      const [flat] = await redis(['HGETALL', KEY]);
      return send(res, 200, toBoard(flat));
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const side = body.side === 'bride' ? 'bride' : body.side === 'groom' ? 'groom' : null;
      const score = Math.floor(Number(body.score));
      if (!side || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return send(res, 400, { error: 'Invalid score' });
      }
      const [, , flat] = await redis(
        ['HINCRBY', KEY, side, score],
        ['HINCRBY', KEY, `${side}Players`, 1],
        ['HGETALL', KEY]
      );
      return send(res, 200, toBoard(flat));
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return send(res, 500, { error: 'Could not reach the scores store' });
  }
}
