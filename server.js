// DUSKHOLD online server.
// Serves the game files, keeps player accounts, and runs the shared world over WebSockets.
// Start with:  npm install  then  npm start   (default port 3000, or $PORT)
//
// Settings (environment variables, all optional):
//   PORT          port to listen on (default 3000)
//   DATABASE_URL  Postgres connection string. Without it, accounts are kept in ./data/accounts.json
//   ADMINS        comma-separated account names that may use /mute, /unmute and /kick in chat
//   MAX_PLAYERS   how many players may be online at once (default 16)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { Game, TICK, CLASS_LIST, isClean } from './public/sim.js';
import { makeStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const MAX_HEROES = 8;
const ADMINS = new Set(String(process.env.ADMINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const DATA_DIR = path.join(__dirname, 'data');

let store;
try { store = await makeStore({ databaseUrl: process.env.DATABASE_URL, dataDir: DATA_DIR }); }
catch (e) {
  // a wrong DATABASE_URL should not take the whole game down; /health shows "file" so it can be spotted
  console.error('\n  Could not connect to the database:', e.message, '\n  Using data/accounts.json instead.\n');
  store = await makeStore({ dataDir: DATA_DIR });
}
setInterval(() => store.flush(), 5000);

// ---------------------------------------------------------------- accounts
const keyOf = (name) => String(name || '').trim().toLowerCase();
const validName = (n) => /^[A-Za-z0-9_-]{3,16}$/.test(n) && isClean(n);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPass(pass, salt) {
  return new Promise((res, rej) => crypto.scrypt(String(pass), salt, 32, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
}
function newSession(acc) {
  const token = crypto.randomBytes(24).toString('hex');
  acc.sessions = [{ h: sha(token), at: Date.now() }, ...(acc.sessions || [])].slice(0, 6);
  return token;
}
const heroList = (acc) => acc.heroes.map((h) => ({ id: h.id, name: h.name, cls: h.cls, lvl: h.lvl || 1 }));
// heroes kept in an older browser can be brought into a new account
function importHeroes(acc, list) {
  if (!Array.isArray(list)) return;
  for (const h of list.slice(0, MAX_HEROES)) {
    if (acc.heroes.length >= MAX_HEROES) break;
    if (!h || !CLASS_LIST.includes(h.cls) || !h.save || typeof h.save !== 'object') continue;
    const blob = JSON.stringify(h.save); if (blob.length > 200000) continue;
    acc.heroes.push({ id: crypto.randomUUID(), name: String(h.name || 'Hero').slice(0, 16), cls: h.cls, lvl: Number(h.save.lvl) || 1, save: JSON.parse(blob), t: Date.now() });
  }
}
// slow down password guessing: 12 failed tries per address per 10 minutes
const fails = new Map();
function tooManyFails(ip) { const f = fails.get(ip); return f && f.n >= 12 && Date.now() - f.t < 600000; }
function addFail(ip) { const f = fails.get(ip); if (!f || Date.now() - f.t > 600000) fails.set(ip, { n: 1, t: Date.now() }); else f.n++; }

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
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, players: online.size, store: store.kind })); return; }
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
const conns = new Map();  // pid -> connection
const online = new Map(); // account key -> connection
const game = new Game({
  seed: 20261002,
  send(pid, msg) { const c = conns.get(pid); if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); },
  persist(pid, blob) {
    const c = conns.get(pid); if (!c || !c.acc) return;
    const h = c.acc.heroes.find((x) => x.id === c.heroId); if (!h) return;
    h.save = blob; h.lvl = blob.lvl; h.t = Date.now();
    store.put(c.acc);
    sendTo(c, { t: 'save', d: blob }); // the browser keeps a backup copy too
  },
});
const sendTo = (c, m) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
const findOnline = (name) => { const k = keyOf(name); for (const c of conns.values()) { const p = game.players.get(c.pid); if (p && p.name.toLowerCase() === k) return c; } return null; };

// chat commands for admins; returns true when the message was a command
function adminCommand(c, text) {
  const [cmd, who, mins] = text.trim().split(/\s+/);
  if (!['/mute', '/unmute', '/kick'].includes(cmd)) return false;
  if (!ADMINS.has(c.acc.key)) { sendTo(c, { t: 'n', m: 'Only admins can do that.', k: 'warn' }); return true; }
  const t = who && findOnline(who);
  if (!t) { sendTo(c, { t: 'n', m: `No player called ${who || '?'} is online.`, k: 'warn' }); return true; }
  if (cmd === '/mute') { const m = Math.max(1, Math.min(1440, Number(mins) || 30)); t.acc.mutedUntil = Date.now() + m * 60000; store.put(t.acc); sendTo(t, { t: 'n', m: `You have been muted for ${m} minutes.`, k: 'warn' }); sendTo(c, { t: 'n', m: `${who} is muted for ${m} minutes.` }); }
  if (cmd === '/unmute') { t.acc.mutedUntil = 0; store.put(t.acc); sendTo(t, { t: 'n', m: 'You can chat again.' }); sendTo(c, { t: 'n', m: `${who} can chat again.` }); }
  if (cmd === '/kick') { sendTo(t, { t: 'kicked', m: 'An admin removed you from the realm.' }); t.ws.close(); sendTo(c, { t: 'n', m: `${who} was kicked.` }); }
  return true;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 400 * 1024 });
wss.on('error', () => {}); // the http server reports listen errors
wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const c = { ws, acc: null, pid: null, heroId: null, busy: false };
  let msgs = 0;
  const rate = setInterval(() => { msgs = 0; }, 1000);

  async function onAuth(m) {
    if (tooManyFails(ip)) return sendTo(c, { t: 'autherr', m: 'Too many tries. Wait ten minutes and try again.' });
    const key = keyOf(m.user);
    let acc = key ? await store.get(key) : null;
    let session = null;
    if (m.a === 'register') {
      if (!validName(String(m.user || '').trim())) return sendTo(c, { t: 'autherr', m: 'Pick an account name of 3 to 16 letters or numbers (no spaces).' });
      if (String(m.pass || '').length < 6) return sendTo(c, { t: 'autherr', m: 'Your password must be at least 6 characters.' });
      if (acc) return sendTo(c, { t: 'autherr', m: 'That account name is taken. Try another one.' });
      const salt = crypto.randomBytes(16).toString('hex');
      acc = { key, name: String(m.user).trim(), salt, hash: await hashPass(m.pass, salt), sessions: [], heroes: [], created: Date.now() };
      importHeroes(acc, m.import);
      session = newSession(acc);
    } else if (m.a === 'login') {
      if (!acc) { addFail(ip); return sendTo(c, { t: 'autherr', m: store.kind === 'file' ? 'No account with that name. If the server has restarted, just create the account again: the heroes saved in this browser come back with it.' : 'Wrong account name or password.' }); }
      const h = await hashPass(m.pass, acc.salt);
      if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(acc.hash, 'hex'))) { addFail(ip); return sendTo(c, { t: 'autherr', m: 'Wrong account name or password.' }); }
      if (!acc.heroes.length) importHeroes(acc, m.import);
      session = newSession(acc);
    } else if (m.a === 'resume') {
      if (!acc || !(acc.sessions || []).some((s) => s.h === sha(String(m.session || '')))) return sendTo(c, { t: 'autherr', m: '', expired: 1 });
    } else return;
    store.put(acc);
    c.acc = acc;
    sendTo(c, { t: 'authok', user: acc.name, session, heroes: heroList(acc), admin: ADMINS.has(key) });
  }

  function onJoin(m) {
    const acc = c.acc;
    if (conns.size >= MAX_PLAYERS && !online.has(acc.key)) { sendTo(c, { t: 'full', max: MAX_PLAYERS }); ws.close(); return; }
    let hero;
    if (m.hero) hero = acc.heroes.find((h) => h.id === m.hero);
    else {
      if (acc.heroes.length >= MAX_HEROES) return sendTo(c, { t: 'autherr', m: `You can have at most ${MAX_HEROES} heroes. Delete one first.` });
      if (!CLASS_LIST.includes(m.cls)) return;
      hero = { id: crypto.randomUUID(), name: String(m.name || '').slice(0, 16), cls: m.cls, lvl: 1, save: null, t: Date.now() };
      acc.heroes.push(hero); store.put(acc);
    }
    if (!hero) return;
    // one hero per account in the world at a time
    const old = online.get(acc.key);
    if (old && old !== c) {
      sendTo(old, { t: 'kicked', m: 'You logged in somewhere else.' });
      if (old.pid !== null) { game.removePlayer(old.pid); conns.delete(old.pid); old.pid = null; }
      old.ws.close();
    }
    online.set(acc.key, c);
    const tmpId = game.nextId; c.pid = tmpId; conns.set(tmpId, c);
    const pid = game.addPlayer({ name: hero.name, cls: hero.cls, save: hero.save });
    if (pid !== tmpId) { conns.delete(tmpId); conns.set(pid, c); }
    c.pid = pid; c.heroId = hero.id;
    const p = game.players.get(pid); if (p) game.persist(pid, game.saveOf(p)); // first save, and the browser's backup copy
    console.log(`+ ${hero.name} (${hero.cls}, account ${acc.name}) joined — ${conns.size} online`);
  }

  ws.on('message', async (data) => {
    if (++msgs > 120) return; // ignore floods
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (c.pid !== null) {
      if (m.t === 'chat') {
        const text = String(m.m || '');
        if (text.startsWith('/') && adminCommand(c, text)) return;
        if (c.acc.mutedUntil > Date.now()) return sendTo(c, { t: 'n', m: `You are muted for ${Math.ceil((c.acc.mutedUntil - Date.now()) / 60000)} more minutes.`, k: 'warn' });
      }
      return game.handle(c.pid, m);
    }
    if (c.busy) return;
    c.busy = true;
    try {
      if (m.t === 'auth') await onAuth(m);
      else if (m.t === 'join' && c.acc) onJoin(m);
      else if (m.t === 'join') sendTo(c, { t: 'autherr', m: 'The game has been updated. Press Ctrl+F5 to load the new version.' });
      else if (m.t === 'delhero' && c.acc) {
        c.acc.heroes = c.acc.heroes.filter((h) => h.id !== m.id); store.put(c.acc);
        sendTo(c, { t: 'heroes', heroes: heroList(c.acc) });
      } else if (m.t === 'logout' && c.acc) {
        c.acc.sessions = (c.acc.sessions || []).filter((s) => s.h !== sha(String(m.session || ''))); store.put(c.acc); c.acc = null;
      }
    } catch (e) { console.error('Auth error:', e.message); sendTo(c, { t: 'autherr', m: 'Something went wrong on the server. Try again in a moment.' }); }
    c.busy = false;
  });
  ws.on('close', () => {
    clearInterval(rate);
    if (c.pid !== null) {
      game.removePlayer(c.pid); // saves the hero one last time
      conns.delete(c.pid);
      if (c.acc && online.get(c.acc.key) === c) online.delete(c.acc.key);
      store.flush();
      console.log(`- player ${c.pid} left — ${conns.size} online`);
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
  console.log(`\n  DUSKHOLD is running. Accounts are saved in ${store.kind === 'database' ? 'the database' : 'data/accounts.json'}.`);
  console.log(`  Open http://localhost:${PORT} in your browser.`);
  console.log(`  Friends on the same Wi-Fi can use http://<this-computer's-IP>:${PORT}\n`);
});
async function shutdown() {
  for (const c of conns.values()) if (c.pid !== null) game.removePlayer(c.pid);
  await store.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
