/**
 * Self-hosted server for the invitation (Hostinger VPS or any Linux box with Node 18+).
 *
 *   - serves the built site from ./dist (run `npm run build` first)
 *   - GET/POST /api/wishes   shared wishes wall, every guest sees every wish
 *   - GET/POST /api/scores   shared Team Jithin vs Team Dona rose scoreboard
 *
 * Wishes and scores are saved as JSON files in ./data (or DATA_DIR), so they
 * survive restarts. No database and no npm packages needed.
 *
 *   PORT=3000 node server.js
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const WISHES_FILE = path.join(DATA_DIR, 'wishes.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const KEEP_WISHES = 1000;   // newest wishes kept on disk
const SHOW_WISHES = 300;    // newest wishes sent to the page
const MAX_SCORE = 500;      // one round can't realistically go beyond this
const MAX_BODY = 8 * 1024;  // bytes

/* ---------------------------------------------------------------- storage */

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

let wishes = readJson(WISHES_FILE, []);
if (!Array.isArray(wishes)) wishes = [];
let scores = { groom: 0, bride: 0, groomPlayers: 0, bridePlayers: 0, ...readJson(SCORES_FILE, {}) };

// Writes go one at a time, to a temp file first, so a crash never leaves half a file.
let writeChain = Promise.resolve();
function save(file, data) {
  writeChain = writeChain.then(async () => {
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data));
    await fsp.rename(tmp, file);
  }).catch((e) => console.error('save failed', file, e));
  return writeChain;
}

/* ------------------------------------------------------- simple rate limit */

const hits = new Map(); // ip -> [timestamps]
function tooMany(ip, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > limit;
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

/* ---------------------------------------------------------------- helpers */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); resolve({}); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
}

/* -------------------------------------------------------------------- API */

async function handleWishes(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, wishes.slice(0, SHOW_WISHES));
  if (req.method === 'POST') {
    if (tooMany(clientIp(req), 10)) return sendJson(res, 429, { error: 'Too many wishes, please wait a minute' });
    const body = await readBody(req);
    const message = String(body.message || '').trim().slice(0, 500);
    const name = String(body.name || '').trim().slice(0, 60) || 'A well-wisher';
    if (!message) return sendJson(res, 400, { error: 'Message is required' });
    const wish = { name, message, at: Date.now() };
    wishes.unshift(wish);
    if (wishes.length > KEEP_WISHES) wishes.length = KEEP_WISHES;
    await save(WISHES_FILE, wishes);
    return sendJson(res, 201, wish);
  }
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleScores(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, scores);
  if (req.method === 'POST') {
    if (tooMany(clientIp(req), 30)) return sendJson(res, 429, { error: 'Too many scores, please wait a minute' });
    const body = await readBody(req);
    const side = body.side === 'bride' ? 'bride' : body.side === 'groom' ? 'groom' : null;
    const score = Math.floor(Number(body.score));
    if (!side || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
      return sendJson(res, 400, { error: 'Invalid score' });
    }
    scores[side] += score;
    scores[`${side}Players`] += 1;
    await save(SCORES_FILE, scores);
    return sendJson(res, 200, scores);
  }
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}

/* ------------------------------------------------------------ static site */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { rel = '/'; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }

  let stat;
  try { stat = await fsp.stat(file); } catch (e) { stat = null; }
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // hashed build files never change; everything else is re-checked
    'Cache-Control': rel.startsWith('/assets/index-') ? 'public, max-age=31536000, immutable'
      : ext === '.html' ? 'no-cache' : 'public, max-age=86400'
  };

  // Range requests: iPhones need these to play the video and the song
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
    end = Math.min(end, stat.size - 1);
    if (start < 0 || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ----------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://x').pathname.replace(/\/$/, '');
    if (pathname === '/api/wishes') return await handleWishes(req, res);
    if (pathname === '/api/scores') return await handleScores(req, res);
    if (pathname === '/api/health') return sendJson(res, 200, { ok: true });
    return await serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Invitation running on http://${HOST}:${PORT}  (data in ${DATA_DIR})`);
});
