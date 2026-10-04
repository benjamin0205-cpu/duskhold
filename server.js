// DUSKHOLD online server.
// Serves the game files and runs the shared world over WebSockets.
// Start with:  npm install  then  npm start   (default port 3000, or $PORT)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { Game, TICK } from './public/sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const DATA_DIR = path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'characters.json');

// ---------------------------------------------------------------- saved characters
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch { saves = {}; }
let savesDirty = false;
function writeSaves() {
  if (!savesDirty) return;
  savesDirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(saves));
    fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
  } catch (e) { console.error('Could not write saves:', e.message); }
}
setInterval(writeSaves, 15000);

// ---------------------------------------------------------------- static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, players: conns.size })); return; }
  if (url.startsWith('/vendor/')) {
    const f = path.normalize(path.join(THREE_DIR, url.slice('/vendor/'.length)));
    if (!f.startsWith(THREE_DIR)) { res.writeHead(403); res.end(); return; }
    return serveFile(res, f);
  }
  const f = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  serveFile(res, f);
});

// ---------------------------------------------------------------- game + sockets
const conns = new Map(); // pid -> { ws, token }
const game = new Game({
  seed: 20261002,
  send(pid, msg) {
    const c = conns.get(pid);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  },
  persist(pid, blob) {
    const c = conns.get(pid);
    if (!c) return;
    saves[c.token] = { ...blob, savedAt: Date.now() };
    savesDirty = true;
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify({ t: 'save', d: blob }));
  },
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('error', () => {}); // the http server reports listen errors
wss.on('connection', (ws) => {
  let pid = null;
  let token = null;
  let msgs = 0;
  const rate = setInterval(() => { msgs = 0; }, 1000);
  ws.on('message', (data) => {
    if (++msgs > 120) return; // ignore floods
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (pid === null) {
      if (m.t !== 'join') return;
      if (conns.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full', max: MAX_PLAYERS })); ws.close(); return; }
      token = typeof m.token === 'string' && /^[a-f0-9-]{16,64}$/.test(m.token) ? m.token : crypto.randomUUID();
      // A save on the server wins; otherwise accept the backup the browser kept.
      const stored = saves[token] && saves[token].cls === m.cls ? saves[token] : null;
      const save = stored || (m.save && typeof m.save === 'object' ? m.save : null);
      // Reserve the slot before the game sends its welcome messages.
      const placeholder = { ws, token };
      const tmpId = game.nextId;
      conns.set(tmpId, placeholder);
      pid = game.addPlayer({ name: m.name, cls: m.cls, save });
      if (pid !== tmpId) { conns.delete(tmpId); conns.set(pid, placeholder); }
      ws.send(JSON.stringify({ t: 'token', token }));
      console.log(`+ ${m.name} (${m.cls}) joined — ${conns.size} online`);
      return;
    }
    game.handle(pid, m);
  });
  ws.on('close', () => {
    clearInterval(rate);
    if (pid !== null) {
      game.removePlayer(pid);
      conns.delete(pid);
      writeSaves();
      console.log(`- player ${pid} left — ${conns.size} online`);
    }
  });
  ws.on('error', () => {});
});

// fixed-step game loop
let last = performance.now(), acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000; last = now;
  if (acc > 0.5) acc = 0.5;
  while (acc >= TICK) { game.tick(TICK); acc -= TICK; }
}, 1000 * TICK / 2);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Port ${PORT} er optaget. Kører DUSKHOLD allerede i et andet vindue? Luk det andet vindue og prøv igen.\n`);
  else console.log('\n  Serveren kunne ikke starte:', e.message, '\n');
  process.exit(1);
});
server.listen(PORT, () => {
  if (process.env.OPEN_BROWSER) {
    const url = `http://localhost:${PORT}`;
    exec(process.platform === 'win32' ? `start "" ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`);
  }
  console.log(`\n  DUSKHOLD is running.`);
  console.log(`  Open http://localhost:${PORT} in your browser.`);
  console.log(`  Friends on the same Wi-Fi can use http://<this-computer's-IP>:${PORT}\n`);
});
function shutdown() { savesDirty = true; writeSaves(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
