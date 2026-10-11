// DUSKHOLD client: rendering, input, networking and interface.
import * as THREE from 'three';
import {
  Game, World, CLASSES, CLASS_LIST, MONSTERS, MONSTER_LIST, ZONES, zoneAt, zoneLevel, QUESTS, QUEST_BY_ID, questState, npcMarker,
  NPCS, SLOTS, SLOT_NAMES, RARITY, RARITY_COLORS, AFFIX, computeStats, xpNeed, PLAYER_R, TOWN_R, BOSS_ARENA, MAX_LEVEL, POTION_COST,
  gambleCost, INV_SIZE, TICK, WORLD_R, ROADS, roadWiggle, TOWNS, TOWN_BY_ID, isSafe, SHOPS, SHOP_INFO, NPC_BY_ID,
  BOSS_ARENA2, INV_MAX, STASH_MAX, INNER_R, PROPS, DUNGEONS, dungeonAt, DNG_TILE, DNG_TILES,
} from '../sim.js';
import { sfx, initAudio, setSound, setMusic } from './audio.js';
import { paintAbility, drawItemInto } from './icons.js';
import { buildWorld, buildProps, DTHEME, makePlayerModel, makeNpcModel, makeMonsterModel, makeLootModel, glowSprite, groundColor, CLASS_LOOK } from './models.js';
import { Particles, Projectiles, Telegraphs, Rings, Swooshes, FloatText } from './fx.js';

const $ = (id) => document.getElementById(id);
const ONLINE = !!window.DUSKHOLD_ONLINE;
const SEED = 20261002;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const settings = Object.assign({ sound: true, music: true, quality: 'high' }, store.get('duskhold.settings', {}));
setSound(settings.sound); setMusic(settings.music);
const CHAR_KEY = ONLINE ? 'duskhold.chars.online' : 'duskhold.chars.solo';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

// ================================================================ renderer & scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
if (/[?&]low/.test(location.search)) settings.quality = 'low';
const pixelRatio = () => (settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setPixelRatio(pixelRatio());
renderer.shadowMap.enabled = settings.quality !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2b2433, 40, 100);
scene.background = new THREE.Color(0x2b2433);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
const hemi = new THREE.HemisphereLight(0x9a86c0, 0x2a2018, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb27a, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 140 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const playerLight = new THREE.PointLight(0xffd2a0, 18, 14, 1.8); scene.add(playerLight);
const lightPool = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffa050, 0, 16, 1.8); scene.add(l); lightPool.push(l); }

const world = new World(SEED);
const WV = buildWorld(scene, world);
const PV = buildProps(scene, world.props);
const parts = new Particles(scene);
const projs = new Projectiles(scene, parts);
const tgs = new Telegraphs(scene);
const rings = new Rings(scene);
const swooshes = new Swooshes(scene);
const ftext = new FloatText($('fct'));

// blob shadow under every creature
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
function blob(size) { const m = new THREE.Mesh(blobGeo, blobMat); m.scale.set(size, 1, size); m.position.y = 0.03; m.renderOrder = 1; return m; }
const ringGeo = new THREE.RingGeometry(0.85, 1, 40); ringGeo.rotateX(-Math.PI / 2);
function groundRing(color, op = 0.8) { return new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); }
const hoverRing = groundRing(0xff4a3a); hoverRing.visible = false; hoverRing.position.y = 0.05; scene.add(hoverRing);
const selfRing = groundRing(0xffd27a, 0.25); selfRing.position.y = 0.04; scene.add(selfRing);

// ================================================================ state
const S = {
  mode: 'login', id: null, cls: 'warrior', name: '', token: null,
  inv: null, hp: 1, mhp: 1, res: 0, mres: 1, cds: [0, 0, 0, 0, 0, 0], buffs: [0, 0, 0, 0],
  me: { x: 0, z: 4, rot: Math.PI, dead: false, dash: null, moving: false },
  players: new Map(), monsters: new Map(), loot: new Map(), roster: new Map(), npcs: [],
  path: null, attackTarget: null, npcTarget: null, lootTarget: null, holdMove: false,
  mouse: { x: 0, y: 0, down: false, downAt: 0, shift: false }, keys: new Set(),
  hoverMon: null, hoverNpc: null, ground: { x: 0, z: 0 },
  zone: null, lastSent: 0, sentX: 0, sentZ: 0, sentR: 0, zoom: 1, shake: 0,
  cam: { x: 0, z: 0 }, deathT: 0, lastBossWake: 0, discardArm: null,
  broken: new Set(), hoverProp: null, propTarget: null,
};

// ================================================================ networking
let net = null;
class LocalNet {
  connect(join, onMsg) {
    this.onMsg = onMsg;
    this.game = new Game({
      seed: SEED,
      send: (pid, m) => this.queue.push(m),
      persist: (pid, blob) => this.queue.push({ t: 'save', d: blob }),
    });
    this.queue = [];
    this.pid = this.game.addPlayer(join);
    this.queue.push({ t: 'token', token: join.token });
    this.flush();
    let last = performance.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now(); acc += (now - last) / 1000; last = now;
      if (acc > 0.5) acc = 0.5;
      while (acc >= TICK) { this.game.tick(TICK); acc -= TICK; }
      this.flush();
    }, 25);
  }
  flush() { const q = this.queue; this.queue = []; for (const m of q) this.onMsg(JSON.parse(JSON.stringify(m))); }
  send(m) { this.game.handle(this.pid, m); this.flush(); }
}
class WsNet {
  connect(join, onMsg) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    showConn('Connecting to the realm…', false);
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { hideConn(); this.ws.send(JSON.stringify(join)); };
    this.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
    this.ws.onclose = () => { if (S.mode === 'game' || S.mode === 'joining') showConn('The connection to the server was lost. If the server sleeps when nobody plays, it can take up to a minute to wake up.', true); };
    this.ws.onerror = () => {};
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
}
function showConn(msg, btn) { $('conn').hidden = false; $('connmsg').textContent = msg; $('connbtn').hidden = !btn; }
function hideConn() { $('conn').hidden = true; }
$('connbtn').onclick = () => location.reload();
const send = (m) => net && net.send(m);

// ================================================================ characters (saved heroes)
function chars() { return store.get(CHAR_KEY, []); }
function saveChar(patch) {
  const list = chars(); const i = list.findIndex((c) => c.token === S.token);
  const entry = Object.assign(i >= 0 ? list[i] : { token: S.token, name: S.name, cls: S.cls }, patch, { t: Date.now() });
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  store.set(CHAR_KEY, list.slice(0, 12));
}
function randomToken() { const a = new Uint8Array(16); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.random() * 256))); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// ================================================================ login screen
let pickedClass = 'warrior';
function buildLogin() {
  const box = $('classes'); box.innerHTML = '';
  for (const k of CLASS_LIST) {
    const d = CLASSES[k];
    const b = document.createElement('button');
    b.className = 'cls' + (k === pickedClass ? ' on' : ''); b.style.setProperty('--cc', d.color);
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k === pickedClass);
    b.innerHTML = `<h3>${d.name}</h3><div class="role">${d.role}</div><p>${d.blurb}</p><ul>` +
      [d.basic, ...d.ab].map((a) => `<li><b>${a.name}</b> <span>${a.lvl ? `· level ${a.lvl}` : '· basic attack'}</span></li>`).join('') + '</ul>';
    b.onclick = () => { pickedClass = k; sfx.click(); buildLogin(); };
    box.appendChild(b);
  }
  const sv = $('saved'); sv.innerHTML = '';
  for (const c of chars()) {
    const b = document.createElement('button'); b.className = 'btn ghost savebtn'; b.style.setProperty('--cc', CLASSES[c.cls]?.color || '#fff');
    b.innerHTML = `Continue <b>${esc(c.name)}</b> <span style="color:var(--ash)">level ${c.lvl || 1} ${CLASSES[c.cls]?.name || ''}</span>`;
    b.onclick = () => startGame(c.name, c.cls, c.token, c.save);
    sv.appendChild(b);
  }
  $('loginnote').innerHTML = ONLINE
    ? 'You are on an <b>online server</b>. Everyone who opens this address plays in the same world. Your hero is saved on the server and in this browser.'
    : 'This is the <b>solo realm</b>: the whole world runs in your browser. Your hero is saved in this browser. To play together with friends, run the online server version.';
}
$('play').onclick = () => {
  const name = $('name').value.trim() || ['Ash', 'Brann', 'Kestrel', 'Morrow', 'Sable', 'Wren'][Math.floor(Math.random() * 6)];
  startGame(name, pickedClass, null, null);
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

function startGame(name, cls, token, save) {
  initAudio(); sfx.click();
  S.name = name; S.cls = cls; S.token = token || (ONLINE ? null : randomToken());
  S.mode = 'joining';
  $('login').hidden = true; $('hud').hidden = false;
  buildHotbar(); buildPathGrid();
  net = ONLINE ? new WsNet() : new LocalNet();
  net.connect({ t: 'join', name, cls, token: S.token, save }, onMessage);
}

// ================================================================ entities
function makeLabel(cls) { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); $('labels').appendChild(d); return d; }
function addPlayerEnt(id, cls) {
  const rig = makePlayerModel(cls);
  const e = { id, seed: Math.random() * 6, cls, rig, x: 0, z: 0, tx: 0, tz: 0, rot: 0, trot: 0, hp: 1000, flags: 0, walk: 0, atk: 0, atkDur: 0.35, flash: 0, dying: 0, name: '', lvl: 1 };
  e.blob = blob(1.4); rig.root.add(e.blob);
  scene.add(rig.root);
  if (id !== S.id) { e.label = makeLabel('pl'); e.label.innerHTML = '<span class="nm"></span> <span class="lv"></span><div class="hpb"><i></i></div>'; }
  S.players.set(id, e);
  return e;
}
function removePlayerEnt(id) { const e = S.players.get(id); if (!e) return; scene.remove(e.rig.root); e.label?.remove(); S.players.delete(id); }
function addMonsterEnt(a) {
  const type = MONSTER_LIST[a[1]]; const def = MONSTERS[type];
  const rig = makeMonsterModel(type);
  const e = { id: a[0], type, def, rig, x: a[2], z: a[3], tx: a[2], tz: a[3], rot: a[4], trot: a[4], hp: a[5], lvl: a[6], flags: a[7], walk: Math.random() * 6, atk: 0, atkDur: 0.35, flash: 0, dying: 0, name: def.name, lastHurt: -9 };
  const champ = a[7] & 1;
  if (champ) {
    e.name = a[8];
    rig.root.scale.multiplyScalar(1.25);
    const r = groundRing(0x5a8aff, 0.6); r.scale.setScalar(def.r * 1.6); r.position.y = 0.05; rig.root.add(r);
    const gl = glowSprite(0x4a7aff, 2.4, 0.35); gl.position.y = 1; rig.root.add(gl);
  }
  if (def.boss) { const r = groundRing(type === 'boss2' ? 0xb06aff : 0x5aff8a, 0.5); r.scale.setScalar(2.4); r.position.y = 0.05; rig.root.add(r); e.boss = true; }
  e.blob = blob(def.r * 2.2); rig.root.add(e.blob);
  rig.root.position.set(e.x, 0, e.z); rig.root.rotation.y = e.rot;
  scene.add(rig.root);
  e.label = makeLabel(champ ? 'champ' : ''); e.label.innerHTML = '<span class="nm"></span> <span class="lv"></span><div class="hpb"><i></i></div>';
  e.label.querySelector('.nm').textContent = e.name; e.label.querySelector('.lv').textContent = def.boss ? '' : `${a[6]}`;
  e.hpBar = e.label.querySelector('.hpb i');
  for (const m of rig.mats) m.userData.e0 = m.emissive.clone();
  S.monsters.set(e.id, e);
  return e;
}
function removeMonsterEnt(e) { scene.remove(e.rig.root); e.label.remove(); S.monsters.delete(e.id); if (S.attackTarget === e.id) S.attackTarget = null; }
// NPCs
const npcHome = (n) => { const t = TOWN_BY_ID[n.town] || TOWNS[0]; return Math.atan2(t.x - n.x, t.z + 2 - n.z); };
for (const n of NPCS) {
  const rig = makeNpcModel(n.kind, n.look);
  rig.root.position.set(n.x, 0, n.z); rig.root.rotation.y = npcHome(n);
  rig.root.add(blob(1.4));
  scene.add(rig.root);
  const label = makeLabel('npc'); label.innerHTML = `${esc(n.name)}<span class="t">${esc(n.title)}</span>`;
  const mk = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); mk.scale.set(1.3, 1.3, 1); mk.position.set(n.x, 4.3, n.z); scene.add(mk);
  for (const m of rig.mats) m.userData.e0 = m.emissive.clone();
  S.npcs.push({ ...n, rig, label, marker: mk, walk: 0, atk: 0, rot: rig.root.rotation.y, seed: Math.random() * 6 });
}
const propLabel = makeLabel('obj prop'); propLabel.style.display = 'none'; propLabel.style.pointerEvents = 'none';
// chests and waystones you can click
S.objs = world.obs.filter((o) => o.k === 'chest' || o.k === 'waystone' || o.k === 'dentr' || o.k === 'dexit').map((o) => {
  const label = makeLabel('obj' + (o.k === 'dentr' ? ' dng' : ''));
  if (o.k === 'dentr') { const d = DUNGEONS[o.dng]; label.innerHTML = `${esc(d.name)}<span class="t">Dungeon · level ${d.lv[0]}–${d.lv[1]}</span>`; }
  else label.textContent = o.k === 'chest' ? 'Chest' : o.k === 'waystone' ? 'Waystone' : 'Stairs up';
  label.onpointerdown = (ev) => { ev.stopPropagation(); if (ev.button === 0) goToObj(obj); };
  const obj = { k: o.k, x: o.x, z: o.z, town: o.town, dng: o.dng, label };
  return obj;
});
const markerTex = {};
function markerTexture(kind) {
  if (markerTex[kind]) return markerTex[kind];
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  x.font = '800 84px "Grenze Gotisch", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const ch = kind === 'ready' ? '?' : kind === 'trade' ? '$' : '!';
  const col = kind === 'low' ? '#8a8070' : kind === 'trade' ? '#e8d9b0' : '#ffd34a';
  x.shadowColor = kind === 'low' ? 'transparent' : '#ff9a00'; x.shadowBlur = 18; x.lineWidth = 7; x.strokeStyle = '#1a0e00';
  x.strokeText(ch, 48, 52); x.fillStyle = col; x.fillText(ch, 48, 52);
  markerTex[kind] = new THREE.CanvasTexture(c);
  return markerTex[kind];
}
function updateNpcMarkers() {
  for (const n of S.npcs) {
    let k = null;
    if (n.role === 'quest') k = S.inv ? npcMarker(S.inv.q, S.inv.lvl, n.id) : null;
    if (n.role === 'shop') k = 'trade';
    n.marker.visible = !!k;
    if (k) { n.marker.material.map = markerTexture(k); n.marker.material.needsUpdate = true; }
  }
}
updateNpcMarkers();
// loot
function addLootEnt(a) {
  const isItem = a[3] >= 0;
  const kind = isItem ? 'item' : a[3] === -1 ? 'gold' : 'pot';
  const { g, spin } = makeLootModel(kind, a[3]);
  g.position.set(a[1], 0, a[2]); scene.add(g);
  const e = { id: a[0], x: a[1], z: a[2], kind, r: a[3], name: a[4], slot: a[5], g, spin, t: Math.random() * 6 };
  if (isItem) {
    const l = document.createElement('div'); l.className = 'lbl loot'; l.style.color = RARITY_COLORS[a[3]]; l.textContent = a[4];
    l.onpointerdown = (ev) => { ev.stopPropagation(); if (ev.button === 0) goPickUp(e.id); };
    $('labels').appendChild(l); e.label = l;
  }
  S.loot.set(e.id, e);
}
function removeLootEnt(e) { scene.remove(e.g); e.label?.remove(); S.loot.delete(e.id); }

// ================================================================ messages
function onMessage(m) {
  switch (m.t) {
    case 's': return onSnap(m);
    case 'welcome': {
      S.id = m.id; S.name = m.name; S.mode = 'game';
      S.me.x = m.x; S.me.z = m.z; S.me.dead = false; S.cam.x = m.x; S.cam.z = m.z;
      const e = addPlayerEnt(S.id, S.cls); e.x = e.tx = m.x; e.z = e.tz = m.z; e.name = S.name;
      addChat(null, ONLINE ? 'Welcome to Duskhold. Everyone in this realm is a real player.' : 'Welcome to Duskhold. Press H for controls.', 'sys');
      return;
    }
    case 'token': S.token = m.token; saveChar({ name: S.name, cls: S.cls }); return;
    case 'save': saveChar({ save: m.d, lvl: m.d.lvl }); return;
    case 'full': showConn(`The server is full (${m.max} players). Try again in a bit.`, true); return;
    case 'inv': {
      const prev = S.inv; S.inv = m;
      if (!prev || prev.lvl !== m.lvl) saveChar({ lvl: m.lvl });
      onInv(prev);
      return;
    }
    case 'ro': {
      const ids = new Set();
      for (const r of m.l) { ids.add(r.i); S.roster.set(r.i, r); }
      for (const id of [...S.roster.keys()]) if (!ids.has(id)) S.roster.delete(id);
      for (const id of [...S.players.keys()]) if (!ids.has(id)) removePlayerEnt(id);
      renderParty(true);
      return;
    }
    case 'c': return addChat(m.sys ? null : m.n, m.m, m.sys ? 'sys' : '', m.c);
    case 'n': toast(m.m, m.k === 'warn' ? 'warn' : ''); if (m.k === 'warn') sfx.error(); return;
    case 'got': {
      const it = m.it;
      sfx.pickup();
      addChat(null, `${m.gamble ? 'From the crate' : m.quest ? 'Reward' : 'You picked up'}: ${it.name}`, 'lootline', null, RARITY_COLORS[it.r]);
      if (m.gamble || m.quest) { toast(it.name, '', RARITY_COLORS[it.r]); sfx.drop(it.r); }
      return;
    }
    case 'drop': if (m.r >= 0) sfx.drop(m.r); return;
    case 'dropped': sfx.click(); addChat(null, `You dropped ${m.n}. Anyone nearby can pick it up.`, 'sys'); return;
    case 'portals': return syncPortals(m.l);
    case 'sold': sfx.gold(); addChat(null, `${m.d ? 'Discarded' : 'Sold'} ${m.n} for ${m.g} gold.`, 'sys'); return;
    case 'bought': sfx.potion(); return;
    case 'gold': { const me = S.me; ftext.add(me.x, 2.6, me.z, `+${m.v} gold`, 'gold', { dur: 1.2 }); sfx.gold(); return; }
    case 'potup': ftext.add(S.me.x, 2.6, S.me.z, '+1 potion', 'heal', { dur: 1.2 }); sfx.pickup(); return;
    case 'xp': { const e = S.monsters.get(m.i); if (e) ftext.add(e.x, 2.2, e.z, `+${m.v} XP`, 'xp', { dur: 1.3, rise: 1.2 }); return; }
    case 'qa': { const q = QUEST_BY_ID[m.q]; toast(`Quest accepted: ${q.name}`); sfx.quest(); return; }
    case 'qp': { const q = QUEST_BY_ID[m.q]; const done = m.n >= q.goal.n; toast(`${goalText(q)}: ${m.n}/${q.goal.n}`, done ? 'good' : ''); if (done) { sfx.quest(); addChat(null, `${q.name} is ready to turn in. Return to ${giverName(q)}.`, 'sys'); } return; }
    case 'qd': { const q = QUEST_BY_ID[m.q]; toast(`Quest complete: ${q.name}`, 'big'); sfx.questDone(); addChat(null, `Quest complete: ${q.name}. +${m.xp} XP, +${m.g} gold.`, 'sys'); return; }
    case 'lvl': {
      const ab = m.ab ? CLASSES[S.cls].ab.find((a) => a.id === m.ab) : null;
      banner(`Level ${m.l}`, ab ? `NEW ABILITY · ${ab.name.toUpperCase()} · KEY ${CLASSES[S.cls].ab.indexOf(ab) + 1}` : 'YOU GROW STRONGER');
      sfx.levelup();
      if (ab) { const el = document.querySelector(`.slot[data-s="${CLASSES[S.cls].ab.indexOf(ab) + 1}"]`); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 6000); }
      return;
    }
    case 'dead': {
      S.me.dead = true; S.deathT = 5; S.path = null; S.attackTarget = null;
      $('death').hidden = false; $('deathby').textContent = `Slain by ${m.by}.${m.lost ? ` You dropped ${m.lost} gold.` : ''} You will rise in ${TOWN_BY_ID[S.inv?.home]?.name || 'town'}…`;
      sfx.pdie();
      return;
    }
    case 'props': {
      const nb = new Set(m.b);
      for (const id of S.broken) if (!nb.has(id)) PV.setBroken(id, false);
      for (const id of nb) PV.setBroken(id, true);
      S.broken = nb;
      if (S.propTarget !== null && nb.has(S.propTarget)) S.propTarget = null;
      return;
    }
    case 'shop': m._at = performance.now(); S.shop = m; if (!$('shopwin').hidden && S.shopNpc === m.n) renderShop(); return;
    case 'wp': { const t = TOWN_BY_ID[m.town]; banner('Waystone found', `YOU CAN NOW TRAVEL TO ${t.name.toUpperCase()}`); sfx.quest(); addChat(null, `You found the waystone of ${t.name}. You will now rise here when you fall, and you can travel here from any waystone.`, 'sys'); return; }
    case 'setpos': {
      if (m.travel) { S.cam.x = m.x; S.cam.z = m.z; closeAll(); sfx.blink(); }
      S.me.x = m.x; S.me.z = m.z; S.me.dash = null; S.path = null;
      if (m.respawn) { S.me.dead = false; $('death').hidden = true; S.cam.x = m.x; S.cam.z = m.z; }
      S.sentX = m.x; S.sentZ = m.z;
      return;
    }
  }
}

function onSnap(s) {
  const now = performance.now() / 1000;
  // players
  const seen = new Set();
  for (const a of s.p) {
    const [id, x, z, rot, hp, f] = a; seen.add(id);
    let e = S.players.get(id);
    const r = S.roster.get(id);
    if (!e) { if (!r && id !== S.id) continue; e = addPlayerEnt(id, id === S.id ? S.cls : r.c); e.x = x; e.z = z; }
    e.tx = x; e.tz = z; e.trot = rot; e.hp = hp; e.flags = f;
    if (r) { e.name = r.n; e.lvl = r.v; }
  }
  for (const id of [...S.players.keys()]) if (!seen.has(id)) removePlayerEnt(id);
  // monsters
  const ms = new Set();
  for (const a of s.m) {
    ms.add(a[0]);
    let e = S.monsters.get(a[0]);
    if (!e || e.dying) { if (e) removeMonsterEnt(e); e = addMonsterEnt(a); }
    if (a[5] < e.hp) e.lastHurt = now;
    e.tx = a[2]; e.tz = a[3]; e.trot = a[4]; e.hp = a[5]; e.flags = a[7];
    if (e.boss) { e.bhp = a[8]; e.bmhp = a[9]; }
  }
  for (const e of [...S.monsters.values()]) if (!ms.has(e.id) && !e.dying) removeMonsterEnt(e);
  // loot
  if (s.l) {
    const ls = new Set();
    for (const a of s.l) { ls.add(a[0]); if (!S.loot.has(a[0])) addLootEnt(a); }
    for (const e of [...S.loot.values()]) if (!ls.has(e.id)) removeLootEnt(e);
  }
  // me
  const me = s.me;
  S.hp = me[0]; S.mhp = me[1]; S.res = me[2]; S.mres = me[3];
  for (let i = 0; i < 6; i++) S.cds[i] = me[4][i];
  S.buffs[0] = me[5]; S.buffs[1] = me[6]; S.buffs[2] = me[7] || 0; S.buffs[3] = me[8] || 0;
  for (const ev of s.e) onEvent(ev);
  renderParty(false);
  updateOrbs();
}

function entPos(id) { const p = S.players.get(id); if (p) return p; const m = S.monsters.get(id); return m; }
function onEvent(e) {
  const me = S.me;
  const near = (x, z) => Math.hypot(x - me.x, z - me.z);
  const vol = (x, z) => Math.max(0.15, 1 - near(x, z) / 40);
  switch (e.e) {
    case 'dmg': {
      if (e.p) {
        const p = S.players.get(e.i); if (!p) return;
        p.flash = 1;
        if (e.i === S.id) { ftext.add(me.x, 2.4, me.z, `-${e.v}`, 'me'); sfx.hurt(); hurtFlash(e.v / Math.max(1, S.mhp)); }
        return;
      }
      const m = S.monsters.get(e.i); if (!m) return;
      m.flash = 1; m.lastHurt = performance.now() / 1000;
      const mine = e.s === S.id;
      ftext.add(m.x, (m.rig.h || 2) * 0.9, m.z, String(e.v), e.c ? 'crit' : mine ? '' : 'dim', { dur: e.c ? 1.1 : 0.85 });
      parts.emit(m.x, 1.0, m.z, { n: e.c ? 10 : 5, color: 0xffe0c0, color2: 0xff5030, speed: 4, life: [0.15, 0.35], size: [0.12, 0.22], grav: 6 });
      if (mine) { e.c ? sfx.crit() : sfx.hit(); }
      return;
    }
    case 'heal': { const p = S.players.get(e.i); if (p) ftext.add(p.x, 2.5, p.z, `+${e.v}`, 'heal'); return; }
    case 'miss': { const p = S.players.get(e.i); if (p) ftext.add(p.x, 2.4, p.z, 'Dodged', 'info'); return; }
    case 'evade': { const m = S.monsters.get(e.i); if (m) ftext.add(m.x, 2.4, m.z, 'Evade', 'info'); return; }
    case 'die': {
      const m = S.monsters.get(e.i); if (!m) return;
      m.dying = 0.0001; m.label.style.display = 'none';
      parts.emit(e.x, 0.8, e.z, { n: 18, color: 0x3a2a3a, color2: 0x8a6a5a, speed: 3, life: [0.4, 0.9], size: [0.3, 0.6], grav: 2, drag: 0.94 });
      if (m.boss) { const c2 = m.type === 'boss2'; shake(1); rings.add(e.x, e.z, 1, 14, 1.2, c2 ? 0xc08aff : 0x7aff9a); parts.emit(e.x, 2, e.z, { n: 160, color: c2 ? 0xa06aff : 0x6aff8a, color2: c2 ? 0xf0e0ff : 0xe8ffe0, speed: 9, life: [0.8, 2], size: [0.3, 0.7], drag: 0.95, vy: 3 }); }
      if (near(e.x, e.z) < 30) sfx.die();
      if (S.attackTarget === e.i) S.attackTarget = null;
      return;
    }
    case 'pdie': { const p = S.players.get(e.i); if (p) { p.dying = 0.0001; } return; }
    case 'cast': {
      const p = S.players.get(e.i); if (!p) return;
      if (e.i === S.id) return; // already shown locally
      p.trot = e.a; p.rot = e.a;
      playCastVisual(p, e.s, e.a, vol(p.x, p.z) * 0.6);
      return;
    }
    case 'matk': {
      const m = S.monsters.get(e.i); if (!m) return;
      m.atk = m.atkDur = e.big ? 1.2 : 0.4;
      if (m.boss && e.big) ftext.add(m.x, 5.5, m.z, m.type === 'boss2' ? 'Shard Storm!' : m.type === 'boss' ? 'Grave Slam!' : 'Slam!', 'info', { dur: 1.4 });
      return;
    }
    case 'ps': projs.spawn(e); if (e.t === 1) { /* player shot */ } return;
    case 'pe': projs.end(e, (kind, x, z) => {
      const c = { bolt: 0xb08aff, fireball: 0xff8a20, arrow: 0xe8d8b0, fire: 0xff6a20, arrow_m: 0x9affa0, frost: 0x9ae8ff, void: 0xc08aff }[kind] || 0xffffff;
      parts.emit(x, 1.2, z, { n: 8, color: c, speed: 3.5, life: [0.15, 0.35], size: [0.15, 0.3] });
    }); return;
    case 'tg': {
      tgs.add(e.x, e.z, e.r, e.d, e.k);
      if (e.k === 'meteor') spawnMeteor(e.x, e.z, e.d);
      return;
    }
    case 'fx': return onFx(e, vol(e.x, e.z));
  }
}
function onFx(e, v) {
  const self = e.i === S.id;
  switch (e.k) {
    case 'potion': parts.emit(e.x, 1.2, e.z, { n: 24, color: 0xff3040, color2: 0xff9aa0, speed: 1.5, radius: 0.6, life: [0.5, 0.9], size: [0.2, 0.35], vy: 2.5 }); if (self) sfx.potion(); return;
    case 'lvl': rings.add(e.x, e.z, 0.5, 5, 0.9, 0xffd27a); parts.emit(e.x, 0.3, e.z, { n: 90, color: 0xffd27a, color2: 0xfff4c0, speed: 1.2, radius: 1.0, life: [0.8, 1.6], size: [0.25, 0.45], vy: 6, drag: 0.97 }); if (!self) sfx.levelup(); return;
    case 'charge': trail(e.x, e.z, e.x2, e.z2, 0xc8a070, 16); if (!self) sfx.charge(); return;
    case 'stomp': rings.add(e.x, e.z, 0.5, e.r + 0.5, 0.45, 0xffb070); parts.emit(e.x, 0.2, e.z, { n: 30, color: 0x9a8060, color2: 0xd8c0a0, speed: 6, ring: true, life: [0.3, 0.6], size: [0.35, 0.6], drag: 0.9 }); sfx.stomp(); if (self) shake(0.5); return;
    case 'roll': trail(e.x, e.z, e.x2, e.z2, 0xa09070, 8); if (!self) sfx.roll(); return;
    case 'blink': for (const [x, z] of [[e.x, e.z], [e.x2, e.z2]]) parts.emit(x, 1.1, z, { n: 30, color: 0x9a6aff, color2: 0xe0d0ff, speed: 3, radius: 0.4, life: [0.3, 0.6], size: [0.2, 0.4], jy: 1.6 }); if (!self) sfx.blink(); return;
    case 'nova': rings.add(e.x, e.z, 0.5, e.r, 0.4, 0x9ae0ff, 0.08, 0.35); parts.emit(e.x, 0.6, e.z, { n: 70, color: 0x9ae0ff, color2: 0xffffff, speed: 14, ring: true, life: [0.25, 0.5], size: [0.25, 0.5], drag: 0.9 }); sfx.frost(); return;
    case 'warcry': rings.add(e.x, e.z, 0.5, e.r, 0.6, 0xff4a2a); rings.add(e.x, e.z, 0.5, e.r * 0.6, 0.45, 0xffa060); parts.emit(e.x, 1.5, e.z, { n: 30, color: 0xff5030, color2: 0xffb060, speed: 5, ring: true, life: [0.3, 0.6], size: [0.3, 0.5] }); sfx.warcry(); return;
    case 'mend': rings.add(e.x, e.z, 0.5, e.r, 0.8, 0x7aff6a, 0.06, 0.15); for (const p of S.players.values()) if (Math.hypot(p.x - e.x, p.z - e.z) < e.r) parts.emit(p.x, 0.5, p.z, { n: 26, color: 0x6aff5a, color2: 0xd8ffc0, speed: 0.6, radius: 0.7, life: [0.7, 1.3], size: [0.2, 0.4], vy: 3 }); sfx.mend(); return;
    case 'boom': shake(0.9); rings.add(e.x, e.z, 0.5, e.r + 1, 0.5, 0xff8a20); parts.emit(e.x, 0.6, e.z, { n: 120, color: 0xff6a10, color2: 0xffe080, speed: 11, life: [0.3, 0.9], size: [0.4, 0.9], drag: 0.92, vy: 3 }); parts.emit(e.x, 0.5, e.z, { n: 40, color: 0x3a2a2a, color2: 0x6a5040, speed: 4, life: [0.8, 1.6], size: [0.6, 1.0], drag: 0.95, vy: 2 }); sfx.boom(); return;
    case 'fireboom': rings.add(e.x, e.z, 0.3, e.r, 0.3, 0xff7a20); parts.emit(e.x, 1.0, e.z, { n: 45, color: 0xff5a10, color2: 0xffd060, speed: 7, life: [0.2, 0.55], size: [0.35, 0.7], drag: 0.9 }); sfx.fire(v); return;
    case 'rainwave': for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r; parts.emit(e.x + Math.cos(a) * r, 5 + Math.random() * 3, e.z + Math.sin(a) * r, { n: 1, color: 0xe8dcc0, speed: 0, vy: -1, grav: 60, life: [0.25, 0.3], size: [0.18, 0.22] }); } setTimeout(() => parts.emit(e.x, 0.3, e.z, { n: 14, color: 0xb8a080, speed: 3, radius: e.r * 0.8, life: [0.2, 0.4], size: [0.2, 0.35] }), 220); sfx.rain(); return;
    case 'slam': shake(0.8); rings.add(e.x, e.z, 0.5, e.r + 0.5, 0.5, 0xff3020); parts.emit(e.x, 0.3, e.z, { n: 60, color: 0x6a5040, color2: 0xb0a080, speed: 9, ring: true, life: [0.3, 0.7], size: [0.4, 0.8], drag: 0.9, vy: 2 }); sfx.stomp(); return;
    case 'spikes': parts.emit(e.x, 0.2, e.z, { n: 40, color: 0xe8e0d0, color2: 0x9aff9a, speed: 2, radius: e.r * 0.8, life: [0.3, 0.6], size: [0.25, 0.4], vy: 9, grav: 20 }); sfx.hit(v); return;
    case 'summon': rings.add(e.x, e.z, 1, 7, 1.0, 0x6aff8a); parts.emit(e.x, 0.5, e.z, { n: 60, color: 0x3aff6a, color2: 0xc0ffd0, speed: 5, ring: true, life: [0.6, 1.0], size: [0.3, 0.5], vy: 3 }); sfx.bossWake(); return;
    case 'smash': {
      const C = { barrel: [0x7a5230, 0xb08850], crate: [0x9a7848, 0xd0b080], urn: [0xa8643a, 0xe0a070], bones: [0xd8d0bc, 0xffffff], sarc: [0x8a8494, 0xc0bac8], trove: [0xffd040, 0xfff0a0] }[e.pk] || [0x888888, 0xcccccc];
      parts.emit(e.x, 0.6, e.z, { n: e.pk === 'trove' ? 50 : 26, color: C[0], color2: C[1], speed: 4.5, life: [0.4, 0.9], size: [0.18, 0.38], grav: 14, vy: 4, drag: 0.96 });
      parts.emit(e.x, 0.3, e.z, { n: 10, color: 0x5a5048, speed: 1.2, life: [0.6, 1.1], size: [0.4, 0.7], vy: 0.6, grow: 1 });
      if (e.pk === 'trove') { rings.add(e.x, e.z, 0.3, 2.2, 0.5, 0xffd060); sfx.gold(); }
      sfx.smash(e.pk, v);
      return;
    }
    case 'portalcast': rings.add(e.x, e.z, 2.5, 0.4, 1.5, 0x7ab8ff, 0.06, 0.4); parts.emit(e.x, 0.3, e.z, { n: 40, color: 0x7ab8ff, color2: 0xffffff, speed: 1.5, radius: 1.4, life: [0.8, 1.5], size: [0.15, 0.3], vy: 2.5 }); if (self) sfx.blink(); return;
    case 'travel': rings.add(e.x, e.z, 0.4, 3.5, 0.7, 0x7ad8ff); parts.emit(e.x, 0.4, e.z, { n: 50, color: 0x7ad8ff, color2: 0xffffff, speed: 0.8, radius: 0.9, life: [0.6, 1.2], size: [0.2, 0.4], vy: 6 }); return;
    case 'respawn': parts.emit(e.x, 0.3, e.z, { n: 50, color: 0x9ad0ff, color2: 0xffffff, speed: 0.8, radius: 0.8, life: [0.8, 1.4], size: [0.25, 0.4], vy: 5 }); return;
  }
}
function trail(x1, z1, x2, z2, color, n) {
  for (let i = 0; i <= n; i++) { const t = i / n; parts.emit(lerp(x1, x2, t), 0.3, lerp(z1, z2, t), { n: 2, color, speed: 1.2, life: [0.3, 0.6], size: [0.35, 0.6], vy: 0.8, drag: 0.92 }); }
}
function spawnMeteor(x, z, d) {
  const s = glowSprite(0xff7a20, 3, 1); const c = glowSprite(0xffffff, 1, 1); s.add(c);
  scene.add(s);
  const t0 = performance.now();
  sfx.meteorFall();
  const tick = () => {
    const k = (performance.now() - t0) / 1000 / d;
    if (k >= 1) { scene.remove(s); return; }
    s.position.set(x - 10 * (1 - k), 1 + 26 * (1 - k), z - 6 * (1 - k));
    parts.emit(s.position.x, s.position.y, s.position.z, { n: 4, color: 0xff6a10, color2: 0xffd060, speed: 1, life: [0.3, 0.6], size: [0.6, 1.0] });
    requestAnimationFrame(tick);
  };
  tick();
}
function playCastVisual(p, slot, ang, v = 1) {
  const d = CLASSES[p.cls]; const ab = slot === 0 ? d.basic : d.ab[slot - 1]; if (!ab) return;
  p.atk = p.atkDur = ab.kind === 'melee' ? 0.32 : 0.28;
  p.atkKind = ab.kind;
  if (ab.kind === 'melee') {
    swooshes.add(p.x, p.z, ang, ab.range, Math.min(ab.arc, 3.2), slot === 0 ? 0xffe0c0 : 0xff8050);
    slot === 0 ? sfx.swing(v) : sfx.cleave(v);
  } else if (ab.kind === 'proj') {
    if (ab.proj === 'arrow') sfx.arrow(v); else if (ab.proj === 'fireball') sfx.fire(v * 0.7); else sfx.bolt(v);
  } else if (ab.kind === 'whirl') sfx.whirl();
  else if (ab.kind === 'meteor') { /* sound plays with the meteor */ }
}

// ================================================================ pathfinding
// One walk grid for the realm, and one per dungeon (built the first time you go down).
const OVER = { ox: -240, oz: -240, n: 480, walk: null };
const DGRID = DUNGEONS.map((d) => ({ ox: d.ox, oz: d.oz, n: DNG_TILES * DNG_TILE, walk: null }));
let PG = OVER; // the grid in use
function buildGrid(G) {
  if (G.walk) return;
  G.walk = new Uint8Array(G.n * G.n);
  for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) {
    const x = i + G.ox + 0.5, z = j + G.oz + 0.5;
    G.walk[j * G.n + i] = (G === OVER ? Math.hypot(x, z) < WORLD_R - 0.5 : true) && world.free(x, z, PLAYER_R * 0.85, 0.02) ? 1 : 0;
  }
}
function buildPathGrid() { buildGrid(OVER); }
function gridAt(x) { const d = dungeonAt(x); return d ? DGRID[d.i] : OVER; }
const cellOf = (x, z) => [Math.floor(x - PG.ox), Math.floor(z - PG.oz)];
const walkable = (i, j) => i >= 0 && j >= 0 && i < PG.n && j < PG.n && PG.walk[j * PG.n + i] === 1;
function lineClear(x1, z1, x2, z2) {
  const d = Math.hypot(x2 - x1, z2 - z1); const n = Math.ceil(d / 0.35);
  for (let k = 1; k < n; k++) { const t = k / n; const [i, j] = cellOf(lerp(x1, x2, t), lerp(z1, z2, t)); if (!walkable(i, j)) return false; }
  return true;
}
function findPath(x1, z1, x2, z2) {
  PG = gridAt(x1); buildGrid(PG);
  const GN = PG.n;
  if (lineClear(x1, z1, x2, z2)) return [{ x: x2, z: z2 }];
  let [si, sj] = cellOf(x1, z1); let [gi, gj] = cellOf(x2, z2);
  if (!walkable(gi, gj)) {
    let best = null, bd = 1e9;
    for (let r = 1; r <= 4 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (walkable(gi + di, gj + dj)) { const dd = di * di + dj * dj; if (dd < bd) { bd = dd; best = [gi + di, gj + dj]; } }
    if (!best) return [{ x: x2, z: z2 }];
    [gi, gj] = best;
  }
  const start = sj * GN + si, goal = gj * GN + gi;
  const g = new Map(); const came = new Map(); const closed = new Set();
  const heap = []; // [f, node]
  const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (n) => { const dx = Math.abs((n % GN) - gi), dz = Math.abs(Math.floor(n / GN) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  g.set(start, 0); push(h(start), start);
  let found = false, iter = 0;
  while (heap.length && iter++ < 60000) {
    const [, n] = pop();
    if (n === goal) { found = true; break; }
    if (closed.has(n)) continue; closed.add(n);
    const ni = n % GN, nj = Math.floor(n / GN);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ai = ni + di, aj = nj + dj;
      if (!walkable(ai, aj)) continue;
      if (di && dj && (!walkable(ni + di, nj) || !walkable(ni, nj + dj))) continue;
      const nn = aj * GN + ai; const cost = g.get(n) + (di && dj ? 1.414 : 1);
      if (cost < (g.get(nn) ?? 1e9)) { g.set(nn, cost); came.set(nn, n); push(cost + h(nn), nn); }
    }
  }
  if (!found) return [{ x: x2, z: z2 }];
  const cells = []; let n = goal; while (n !== undefined && n !== start) { cells.push(n); n = came.get(n); } cells.reverse();
  const pts = cells.map((c) => ({ x: (c % GN) + PG.ox + 0.5, z: Math.floor(c / GN) + PG.oz + 0.5 }));
  pts[pts.length - 1] = walkable(...cellOf(x2, z2)) ? { x: x2, z: z2 } : pts[pts.length - 1];
  // string-pull
  const out = []; let cx = x1, cz = z1, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let t = pts.length - 1; t > k; t--) if (lineClear(cx, cz, pts[t].x, pts[t].z)) { far = t; break; }
    out.push(pts[far]); cx = pts[far].x; cz = pts[far].z; k = far + 1;
  }
  return out;
}

// ================================================================ input
const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2(); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3();
function groundAt(mx, my) {
  ndc.set((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(plane, hit)) return { x: hit.x, z: hit.z };
  return { x: S.me.x, z: S.me.z };
}
const _pv = new THREE.Vector3();
function project(x, y, z) { _pv.set(x, y, z).project(camera); if (_pv.z > 1 || _pv.z < -1) return null; return { x: (_pv.x * 0.5 + 0.5) * innerWidth, y: (-_pv.y * 0.5 + 0.5) * innerHeight }; }
function pickHover() {
  const mx = S.mouse.x, my = S.mouse.y;
  let best = null, bd = 1e9;
  for (const e of S.monsters.values()) {
    if (e.dying) continue;
    const h = (e.rig.h || 2) * e.rig.root.scale.y;
    const s = project(e.x, h * 0.45, e.z); if (!s) continue;
    const rad = Math.max(30, (e.def.r * 38 + 14) * (e.flags & 1 ? 1.25 : 1) * (e.boss ? 1.6 : 1));
    const dx = s.x - mx, dy = (s.y - my) * 0.8, d = Math.hypot(dx, dy);
    if (d < rad && d < bd) { bd = d; best = e; }
  }
  S.hoverMon = best;
  S.hoverNpc = null; S.hoverObj = null;
  if (!best) for (const n of S.npcs) { if (Math.abs(n.x - S.me.x) > 40 || Math.abs(n.z - S.me.z) > 40) continue; const s = project(n.x, 1.2, n.z); if (s && Math.hypot(s.x - mx, (s.y - my) * 0.7) < 42) S.hoverNpc = n; }
  if (!best && !S.hoverNpc) for (const o of S.objs) { if (Math.abs(o.x - S.me.x) > 40 || Math.abs(o.z - S.me.z) > 40) continue; const s = project(o.x, o.k === 'chest' ? 0.5 : 1.5, o.z); if (s && Math.hypot(s.x - mx, (s.y - my) * (o.k === 'chest' ? 1 : 0.6)) < 40) S.hoverObj = o; }
  S.hoverPortal = null;
  if (!best && !S.hoverNpc && !S.hoverObj) for (const pt of S.portals.values()) for (const [end, x, z] of [['a', pt.x, pt.z], ['b', pt.tx, pt.tz]]) {
    if (Math.abs(x - S.me.x) > 40 || Math.abs(z - S.me.z) > 40) continue;
    const sp = project(x, 1.5, z); if (sp && Math.hypot(sp.x - mx, (sp.y - my) * 0.6) < 45) S.hoverPortal = { pt, end };
  }
  S.hoverProp = null;
  if (!best && !S.hoverNpc && !S.hoverObj && !S.hoverPortal) {
    let pd = 30;
    for (const pr of world.props) {
      if (Math.abs(pr.x - S.me.x) > 32 || Math.abs(pr.z - S.me.z) > 32 || S.broken.has(pr.id)) continue;
      const sp = project(pr.x, 0.5, pr.z); if (!sp) continue;
      const d = Math.hypot(sp.x - mx, sp.y - my);
      if (d < pd) { pd = d; S.hoverProp = pr; }
    }
  }
  canvas.style.cursor = best ? 'crosshair' : S.hoverNpc || S.hoverObj || S.hoverProp || S.hoverPortal ? 'pointer' : 'default';
}
const WINS = ['charwin', 'shopwin', 'questwin', 'logwin', 'helpwin', 'mapwin', 'stashwin', 'waywin'];
function anyWindowOpen() { return WINS.some((id) => !$(id).hidden); }
canvas.addEventListener('pointermove', (e) => { S.mouse.x = e.clientX; S.mouse.y = e.clientY; S.mouse.shift = e.shiftKey; });
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  canvas.focus();
  S.mouse.x = e.clientX; S.mouse.y = e.clientY; S.mouse.shift = e.shiftKey;
  if (S.mode !== 'game') return;
  pickHover();
  const g = groundAt(e.clientX, e.clientY);
  if (e.button === 2) { castSlot(1, g); return; }
  if (e.button !== 0) return;
  S.mouse.down = true; S.mouse.downAt = performance.now();
  if (S.me.dead) return;
  if (e.shiftKey) { castSlot(0, S.hoverMon ? { x: S.hoverMon.x, z: S.hoverMon.z } : g); return; }
  if (S.hoverMon) { S.attackTarget = S.hoverMon.id; S.path = null; S.npcTarget = null; S.lootTarget = null; S.propTarget = null; return; }
  if (S.hoverNpc) { goToNpc(S.hoverNpc); return; }
  if (S.hoverObj) { goToObj(S.hoverObj); return; }
  if (S.hoverPortal) { goToPortal(S.hoverPortal.pt, S.hoverPortal.end); return; }
  if (S.hoverProp) { goToProp(S.hoverProp); return; }
  S.attackTarget = null; S.npcTarget = null; S.lootTarget = null; S.objTarget = null; S.propTarget = null; S.portalTarget = null;
  S.path = findPath(S.me.x, S.me.z, g.x, g.z);
  rings.add(g.x, g.z, 0.2, 0.9, 0.35, 0xffd27a, 0.06, 0.3);
});
window.addEventListener('pointerup', (e) => { if (e.button === 0) { S.mouse.down = false; S.holdMove = false; } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); S.zoom = Math.min(1.45, Math.max(0.6, S.zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
function goToNpc(n) { S.npcTarget = n.id; S.objTarget = null; S.attackTarget = null; S.lootTarget = null; if (Math.hypot(n.x - S.me.x, n.z - S.me.z) < 4.5) { openNpc(n.id); S.npcTarget = null; S.path = null; } else S.path = findPath(S.me.x, S.me.z, n.x, n.z + 1.6); }
function goToProp(pr) {
  if (S.me.dead) return;
  S.propTarget = pr.id; S.objTarget = null; S.npcTarget = null; S.attackTarget = null; S.lootTarget = null;
  if (Math.hypot(pr.x - S.me.x, pr.z - S.me.z) < 2.6) { smashNow(pr); S.path = null; }
  else S.path = findPath(S.me.x, S.me.z, pr.x, pr.z);
}
function smashNow(pr) {
  S.propTarget = null;
  send({ t: 'smash', id: pr.id });
  const ang = Math.atan2(pr.x - S.me.x, pr.z - S.me.z); S.me.rot = ang;
  const pe = S.players.get(S.id);
  if (pe && pr.k !== 'trove') { pe.rot = ang; pe.atk = pe.atkDur = 0.32; pe.atkKind = 'melee'; sfx.swing(); }
}
function goToObj(o) {
  if (S.me.dead) return;
  S.objTarget = o; S.npcTarget = null; S.attackTarget = null; S.lootTarget = null;
  if (Math.hypot(o.x - S.me.x, o.z - S.me.z) < (o.k === 'dentr' ? 4.2 : 3.5)) { openObj(o); S.objTarget = null; S.path = null; }
  else S.path = findPath(S.me.x, S.me.z, o.x, o.z + (o.k === 'dentr' ? 2.9 : 1.8));
}
function goPickUp(id) {
  const l = S.loot.get(id); if (!l || S.me.dead) return;
  S.attackTarget = null; S.npcTarget = null;
  if (Math.hypot(l.x - S.me.x, l.z - S.me.z) < 3) { send({ t: 'pick', id }); S.lootTarget = null; return; }
  S.lootTarget = id; S.path = findPath(S.me.x, S.me.z, l.x, l.z);
}
window.addEventListener('keydown', (e) => {
  if (S.mode !== 'game') return;
  const chatin = $('chatin');
  if (document.activeElement === chatin) {
    if (e.key === 'Enter') { const t = chatin.value.trim(); if (t) send({ t: 'chat', m: t }); chatin.value = ''; chatin.blur(); chatin.hidden = true; $('chathint').hidden = false; e.preventDefault(); }
    if (e.key === 'Escape') { chatin.value = ''; chatin.blur(); chatin.hidden = true; $('chathint').hidden = false; }
    return;
  }
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (e.key === 'Enter') { chatin.hidden = false; $('chathint').hidden = true; chatin.focus(); e.preventDefault(); return; }
  if (e.key === 'Escape') { closeAll(); S.attackTarget = null; return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { S.keys.add(k); e.preventDefault(); return; }
  if (e.repeat && !['1', '2', '3', '4'].includes(k)) return;
  if (['1', '2', '3', '4'].includes(k)) { castSlot(Number(k)); return; }
  if (k === 'q') { drink(); return; }
  if (k === 't') { openPortal(); return; }
  if (k === 'c' || k === 'i' || k === 'b') { toggle('charwin'); return; }
  if (k === 'l' || k === 'j') { toggle('logwin'); return; }
  if (k === 'm') { toggle('mapwin'); return; }
  if (k === 'h' || e.key === 'F1') { toggle('helpwin'); e.preventDefault(); return; }
  if (k === 'shift') S.mouse.shift = true;
});
window.addEventListener('keyup', (e) => { S.keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') S.mouse.shift = false; });
window.addEventListener('blur', () => { S.keys.clear(); S.mouse.down = false; });

function aimPoint() {
  if (S.hoverMon && !S.hoverMon.dying) return { x: S.hoverMon.x, z: S.hoverMon.z };
  return groundAt(S.mouse.x, S.mouse.y);
}
function castSlot(s, at) {
  if (S.mode !== 'game' || S.me.dead || !S.inv) return;
  const d = CLASSES[S.cls]; const ab = s === 0 ? d.basic : d.ab[s - 1]; if (!ab) return;
  if (s > 0 && S.inv.lvl < ab.lvl) { toast(`${ab.name} unlocks at level ${ab.lvl}.`, 'warn'); sfx.error(); return; }
  if (S.cds[s] > 0.05) return;
  if (s > 0 && ab.cost && S.res < ab.cost) { toast(`Not enough ${d.res.toLowerCase()}.`, 'warn'); sfx.error(); return; }
  const aim = at || aimPoint();
  const me = S.me;
  const ang = Math.atan2(aim.x - me.x, aim.z - me.z);
  me.rot = ang;
  if (ab.kind === 'charge' || ab.kind === 'blink' || ab.kind === 'roll') {
    const [tx, tz] = world.dashDest(me.x, me.z, aim.x, aim.z, ab.dist, ab.kind === 'roll');
    const dist = Math.hypot(tx - me.x, tz - me.z);
    me.dash = { fx: me.x, fz: me.z, tx, tz, t: 0, dur: ab.kind === 'blink' ? 0.06 : dist / (ab.kind === 'charge' ? 32 : 17) };
    S.path = null;
    if (ab.kind === 'charge') sfx.charge(); else if (ab.kind === 'blink') sfx.blink(); else sfx.roll();
  }
  if (ab.kind === 'meteor' || ab.kind === 'rain') { /* targeted on the ground */ }
  send({ t: 'cast', s, x: +aim.x.toFixed(2), z: +aim.z.toFixed(2) });
  S.cds[s] = s === 0 ? d.basicCd : ab.cd * (1 - (S.inv.st.cdr || 0) / 100);
  const pe = S.players.get(S.id);
  if (pe) { pe.rot = ang; playCastVisual(pe, s, ang, 1); }
  if (ab.kind === 'whirl') { /* server flag drives the spin */ }
}
// ---------------- town portals
S.portals = new Map();
const portalLabel = (pt, townEnd) => townEnd ? `Portal back${pt.owner === S.id ? '' : ` · ${pt.name}`}` : `Portal to ${TOWN_BY_ID[pt.town]?.name || 'town'}${pt.owner === S.id ? '' : ` · ${pt.name}`}`;
function portalMesh(x, z) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 8, 28), new THREE.MeshBasicMaterial({ color: 0x9ad8ff }));
  ring.position.y = 1.55; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 28), new THREE.MeshBasicMaterial({ color: 0x3a7aff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.y = 1.55; g.add(disc);
  const gl = glowSprite(0x7ab8ff, 4, 0.6); gl.position.y = 1.55; g.add(gl);
  const base = groundRing(0x7ab8ff, 0.6); base.scale.setScalar(1.3); base.position.y = 0.05; g.add(base);
  g.position.set(x, 0, z); scene.add(g);
  return { g, disc, ring };
}
function syncPortals(list) {
  const seen = new Set();
  for (const [id, x, z, tx, tz, name, owner, town] of list) {
    seen.add(id);
    if (S.portals.has(id)) continue;
    const pt = { id, x, z, tx, tz, name, owner, town };
    pt.a = portalMesh(x, z); pt.b = portalMesh(tx, tz);
    pt.la = makeLabel('obj'); pt.la.textContent = portalLabel(pt, false); pt.lb = makeLabel('obj'); pt.lb.textContent = portalLabel(pt, true);
    for (const [lab, end] of [[pt.la, 'a'], [pt.lb, 'b']]) lab.onpointerdown = (ev) => { ev.stopPropagation(); if (ev.button === 0) goToPortal(pt, end); };
    S.portals.set(id, pt);
  }
  for (const [id, pt] of S.portals) if (!seen.has(id)) { scene.remove(pt.a.g); scene.remove(pt.b.g); pt.la.remove(); pt.lb.remove(); S.portals.delete(id); if (S.portalTarget?.pt === pt) S.portalTarget = null; }
}
function openPortal() {
  if (S.mode !== 'game' || S.me.dead) return;
  if (ZONES[S.zone]?.safe) { toast('You are already in a town.', 'warn'); sfx.error(); return; }
  S.path = null; S.attackTarget = null; S.npcTarget = null; S.objTarget = null; S.propTarget = null; S.lootTarget = null;
  S.portalCastUntil = performance.now() + 1500;
  send({ t: 'portal' });
  toast('Opening a town portal… stand still.');
}
function goToPortal(pt, end) {
  if (S.me.dead) return;
  const x = end === 'a' ? pt.x : pt.tx, z = end === 'a' ? pt.z : pt.tz;
  S.portalTarget = { pt, x, z }; S.attackTarget = null; S.npcTarget = null; S.objTarget = null; S.propTarget = null; S.lootTarget = null;
  if (Math.hypot(x - S.me.x, z - S.me.z) < 2.8) { send({ t: 'useportal', id: pt.id }); S.portalTarget = null; S.path = null; }
  else S.path = findPath(S.me.x, S.me.z, x, z);
}
function drink() {
  if (!S.inv || S.me.dead) return;
  if (S.inv.pots <= 0) { toast('No potions left. Every trader in town sells them.', 'warn'); sfx.error(); return; }
  if (S.cds[5] > 0.05) return;
  send({ t: 'pot' }); S.cds[5] = 6;
}

// ================================================================ HUD
function buildHotbar() {
  const bar = $('bar'); bar.innerHTML = '';
  const d = CLASSES[S.cls];
  const defs = [[0, d.basic.id, 'LMB'], [1, d.ab[0].id, '1'], [2, d.ab[1].id, '2'], [3, d.ab[2].id, '3'], [4, d.ab[3].id, '4'], [5, 'potion', 'Q']];
  for (const [s, id, key] of defs) {
    const b = document.createElement('button'); b.className = 'slot' + (s === 5 ? ' gap' : ''); b.dataset.s = s;
    const cv = document.createElement('canvas'); cv.width = cv.height = 112; paintAbility(cv, id, s === 5 ? 'potion' : S.cls);
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<span class="k">${key}</span><span class="cd"></span>${s === 5 ? '<span class="n"></span>' : ''}`);
    b.onclick = () => { if (s === 5) drink(); else if (s === 0) { const t = nearestMonster(14); if (t) S.attackTarget = t.id; } else castSlot(s, S.attackTarget && S.monsters.get(S.attackTarget) ? { x: S.monsters.get(S.attackTarget).x, z: S.monsters.get(S.attackTarget).z } : (nearestMonster(20) || null)); };
    b.onmouseenter = () => showAbilityTip(b, s);
    b.onmouseleave = hideTip;
    bar.appendChild(b);
  }
  const rc = { Rage: ['#e8582a', '#6a1608'], Mana: ['#5d84ff', '#1b2f86'], Focus: ['#8ad06a', '#1f5a14'] }[d.res];
  const orb = $('orb-res'); orb.style.setProperty('--rc1', rc[0]); orb.style.setProperty('--rc2', rc[1]);
  orb.querySelector('.cap').textContent = d.res.toUpperCase();
}
function nearestMonster(r) { let best = null, bd = r; for (const e of S.monsters.values()) { if (e.dying) continue; const d = Math.hypot(e.x - S.me.x, e.z - S.me.z); if (d < bd) { bd = d; best = e; } } return best; }
function showAbilityTip(el, s) {
  const d = CLASSES[S.cls];
  if (s === 5) return showTip(el, `<h4>Healing Potion</h4><div class="desc">Restores 45% of your life. 6 sec cooldown.</div><div class="hint">You have ${S.inv?.pots ?? 0}. Every trader sells more for ${POTION_COST} gold.</div>`);
  const ab = s === 0 ? d.basic : d.ab[s - 1];
  const lock = s > 0 && S.inv && S.inv.lvl < ab.lvl;
  showTip(el, `<h4 style="color:${d.color}">${ab.name}</h4>${ab.cost ? `<div class="cost">${ab.cost} ${d.res}</div>` : ab.gain ? `<div class="cost">Generates ${ab.gain} ${d.res}</div>` : ''}<div class="desc">${ab.desc}</div>${ab.cd ? `<div class="hint">${ab.cd} sec cooldown</div>` : ''}${lock ? `<div class="req">Unlocks at level ${ab.lvl}</div>` : ''}`);
}
function updateOrbs() {
  const hpF = S.hp / Math.max(1, S.mhp), rF = S.res / Math.max(1, S.mres);
  $('orb-hp').querySelector('.fill').style.height = `${(hpF * 100).toFixed(1)}%`;
  $('orb-hp').querySelector('.val').textContent = `${Math.max(0, S.hp)} / ${S.mhp}`;
  $('orb-res').querySelector('.fill').style.height = `${(rF * 100).toFixed(1)}%`;
  $('orb-res').querySelector('.val').textContent = `${S.res} / ${S.mres}`;
  const bf = []; if (S.buffs[0] > 0) bf.push(`<span class="buff" style="color:#ff8a6a">War Cry ${Math.ceil(S.buffs[0])}s</span>`); if (S.buffs[1] > 0) bf.push(`<span class="buff" style="color:#8ae06a">Mend ${Math.ceil(S.buffs[1])}s</span>`);
  const mmss = (v) => `${Math.floor(v / 60)}:${String(Math.ceil(v) % 60).padStart(2, '0')}`;
  if (S.buffs[2] > 0) bf.push(`<span class="buff" style="color:#ff7a4a">Fury ${mmss(S.buffs[2])}</span>`); if (S.buffs[3] > 0) bf.push(`<span class="buff" style="color:#b8c0d0">Stone ${mmss(S.buffs[3])}</span>`);
  const html = bf.join(''); if ($('buffs').innerHTML !== html) $('buffs').innerHTML = html;
}
function updateHotbar(dt) {
  if (!S.inv) return;
  const d = CLASSES[S.cls];
  for (let s = 0; s < 6; s++) S.cds[s] = Math.max(0, S.cds[s] - dt);
  for (const b of $('bar').children) {
    const s = +b.dataset.s; const cd = b.querySelector('.cd');
    const ab = s === 0 ? d.basic : s === 5 ? null : d.ab[s - 1];
    const lock = ab && s > 0 && S.inv.lvl < ab.lvl;
    b.classList.toggle('locked', !!lock);
    if (lock) { if (cd._p !== 'lock') { cd._p = 'lock'; cd.style.setProperty('--p', '0%'); cd.textContent = `Lv ${ab.lvl}`; } continue; }
    const total = s === 5 ? 6 : s === 0 ? d.basicCd : ab.cd * (1 - (S.inv.st.cdr || 0) / 100);
    const left = S.cds[s];
    const pv = `${Math.min(100, (left / total) * 100).toFixed(0)}%`;
    if (cd._p !== pv) { cd._p = pv; cd.style.setProperty('--p', pv); }
    const tv = left > 1 && s !== 0 ? String(Math.ceil(left)) : '';
    if (cd.textContent !== tv) cd.textContent = tv;
    b.classList.toggle('nores', !!(ab && ab.cost && S.res < ab.cost));
    if (s === 5) { const n = b.querySelector('.n'); if (n.textContent !== String(S.inv.pots)) n.textContent = S.inv.pots; }
  }
}
function onInv(prev) {
  const iv = S.inv;
  const need = iv.need; const f = iv.lvl >= MAX_LEVEL ? 1 : iv.xp / need;
  $('xp').querySelector('i').style.width = `${(f * 100).toFixed(1)}%`;
  $('xp').querySelector('span').textContent = iv.lvl >= MAX_LEVEL ? `Level ${iv.lvl} · max level` : `Level ${iv.lvl} · ${iv.xp} / ${need} XP`;
  updateNpcMarkers();
  renderTracker();
  if (!$('charwin').hidden) renderChar();
  if (!$('shopwin').hidden) renderShop();
  if (!$('stashwin').hidden) renderStash();
  if (!$('waywin').hidden) renderWay();
  if (!$('logwin').hidden) renderLog();
  if (!$('questwin').hidden && questView) renderQuest(questView);
  if (prev && prev.lvl !== iv.lvl) renderParty(true);
}
// party frames
const partyEls = new Map();
function renderParty(rebuild) {
  const box = $('party');
  if (rebuild) { box.innerHTML = ''; partyEls.clear(); }
  if (S.roster.size <= 1) { box.innerHTML = ''; partyEls.clear(); return; }
  for (const [id, r] of S.roster) {
    let el = partyEls.get(id);
    if (!el) {
      el = document.createElement('div'); el.className = 'pf' + (id === S.id ? ' me' : ''); el.style.setProperty('--cc', CLASSES[r.c].color);
      el.innerHTML = `<div class="top"><b></b><span></span></div><div class="bar"><i></i></div>`;
      box.appendChild(el); partyEls.set(id, el);
    }
    const p = S.players.get(id);
    el.querySelector('b').textContent = r.n; el.querySelector('span').textContent = `${r.v} ${CLASSES[r.c].name}`;
    const hp = p ? p.hp / 1000 : 1; el.querySelector('i').style.width = `${(hp * 100).toFixed(0)}%`;
    el.classList.toggle('dead', !!(p && p.flags & 1));
  }
}
function goalText(q) {
  if (q.goal.champion) return 'Champions slain';
  const k = q.goal.kill;
  if (k.length > 1) return `${k.includes('skeleton') ? 'Risen dead' : k.includes('voidknight') ? 'Knights and shades' : 'Goblins'} slain`;
  const d = MONSTERS[k[0]];
  return d.boss ? `${d.short} slain` : `${d.name.replace(/f$/, 've')}s slain`;
}
function renderTracker() {
  const iv = S.inv; if (!iv) return;
  const act = Object.keys(iv.q.a);
  let html = '';
  if (act.length) {
    html += '<div class="hd">QUESTS</div>';
    for (const id of act) {
      const q = QUEST_BY_ID[id]; const n = iv.q.a[id]; const done = n >= q.goal.n;
      html += `<div class="tq ${done ? 'ready' : ''}"><b>${esc(q.name)}</b><span>${done ? `Return to ${giverName(q)}` : `${goalText(q)}: ${n}/${q.goal.n}`}</span></div>`;
    }
  } else {
    for (const n of NPCS) {
      if (n.role !== 'quest') continue;
      const mk = npcMarker(iv.q, iv.lvl, n.id);
      if (mk === 'avail' || mk === 'ready') { html = `<div class="tq"><b>${esc(n.name)} has work for you</b><span>${n.id === 'maren' ? 'Find her by the fountain in town' : `In ${TOWN_BY_ID[n.town].name}${iv.wp.includes(n.town) ? '' : ` · ${{ frosthaven: 'north', cinderwatch: 'east', mirebrook: 'south' }[n.town]}, past the ridge`}`}</span></div>`; break; }
    }
  }
  $('tracker').innerHTML = html;
}

// ================================================================ windows
function toggle(id) { const w = $(id); const show = w.hidden; if (show) openWin(id); else { w.hidden = true; hideTip(); } sfx.click(); }
function openWin(id) {
  $(id).hidden = false;
  if (id === 'charwin') renderChar();
  if (id === 'logwin') renderLog();
  if (id === 'helpwin') renderHelp();
  if (id === 'mapwin') drawBigMap();
}
function closeAll() { for (const id of WINS) $(id).hidden = true; hideTip(); }
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { $(b.dataset.close).hidden = true; hideTip(); sfx.click(); }));
$('b-portal').onclick = () => openPortal();
$('b-char').onclick = () => toggle('charwin'); $('b-log').onclick = () => toggle('logwin'); $('b-map').onclick = () => toggle('mapwin'); $('b-help').onclick = () => toggle('helpwin');
$('mmwrap').onclick = () => toggle('mapwin');

function statsHtml(st, lvl) {
  const rows = [
    ['Damage', `${st.dmin}–${st.dmax}`], ['Damage per second', st.dps], ['Life', st.mhp], ['Armor', `${st.armor} (−${Math.round(st.dr * 100)}% damage)`],
    ['Critical chance', `${st.crit}%`], ['Bonus damage', `${st.power}%`], ['Movement speed', `+${st.speed}%`], ['Life steal', `${st.lifesteal}%`], ['Cooldown reduction', `${st.cdr}%`],
  ];
  return rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}
function renderChar() {
  const iv = S.inv; if (!iv) return;
  $('charname').textContent = S.name;
  $('charsub').textContent = `LEVEL ${iv.lvl} ${CLASSES[S.cls].name.toUpperCase()}`;
  const doll = $('paperdoll'); doll.innerHTML = '';
  for (const slot of ['helm', 'amulet', 'chest', 'gloves', 'weapon', 'ring', 'boots']) {
    const it = iv.eq[slot];
    const b = document.createElement('button'); b.className = 'eq' + (it ? ` r${it.r}` : '') + (slot === 'boots' ? ' wide' : '');
    if (it) { const cv = document.createElement('canvas'); drawItemInto(cv, it); b.appendChild(cv); b.onclick = () => { send({ t: 'unequip', s: slot }); sfx.click(); hideTip(); }; b.onmouseenter = () => showItemTip(b, it, true); b.onmouseleave = hideTip; }
    else b.innerHTML = `<span class="sl">${SLOT_NAMES[slot].toUpperCase()}</span>`;
    b.setAttribute('aria-label', it ? it.name : `${SLOT_NAMES[slot]} (empty)`);
    doll.appendChild(b);
  }
  $('stats').innerHTML = statsHtml(iv.st, iv.lvl);
  const bags = $('bags'); bags.innerHTML = '';
  const shop = !$('shopwin').hidden;
  iv.inv.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'inv';
    if (it) {
      b.classList.add(`r${it.r}`);
      const cv = document.createElement('canvas'); drawItemInto(cv, it); b.appendChild(cv);
      if (it.slot === 'weapon' && it.cls !== S.cls) b.classList.add('no');
      else if (isUpgrade(it)) b.classList.add('up');
      b.setAttribute('aria-label', it.name);
      b.onclick = (ev) => onBagClick(i, it, ev);
      b.oncontextmenu = (ev) => { ev.preventDefault(); hideTip(); send({ t: 'drop', i }); };
      b.onmouseenter = () => showItemTip(b, it, false);
      b.onmouseleave = hideTip;
    } else b.setAttribute('aria-label', 'Empty slot');
    bags.appendChild(b);
  });
  $('goldv').textContent = iv.gold;
  $('baghint').textContent = !$('stashwin').hidden ? 'Click an item to put it in the chest' : shop ? 'Click an item to sell it' : 'Click: equip · Right-click: drop · Shift+click: scrap';
}
function onBagClick(i, it, ev) {
  hideTip();
  if (!$('stashwin').hidden && !ev.shiftKey) { send({ t: 'stash', a: 'put', i }); sfx.click(); return; }
  if (!$('shopwin').hidden && !ev.shiftKey) { send({ t: 'sell', i }); return; }
  if (ev.shiftKey) {
    if (it.r >= 3 && (!S.discardArm || S.discardArm.id !== it.id || performance.now() - S.discardArm.t > 2500)) { S.discardArm = { id: it.id, t: performance.now() }; toast(`Shift+click ${it.name} again to discard it.`, 'warn'); return; }
    send({ t: 'discard', i }); return;
  }
  if (it.slot === 'weapon' && it.cls !== S.cls) { toast(`Only a ${CLASSES[it.cls].name} can use that. Sell it to a trader, or keep it in your chest for another hero.`, 'warn'); sfx.error(); return; }
  send({ t: 'equip', i }); sfx.click();
}
function statsWith(slot, it) {
  const eq = { ...S.inv.eq }; if (it) eq[slot] = it; else delete eq[slot];
  return computeStats({ cls: S.cls, lvl: S.inv.lvl, eq });
}
function isUpgrade(it) {
  if (it.slot === 'weapon' && it.cls !== S.cls) return false;
  const a = S.inv.st, b = statsWith(it.slot, it);
  return b.dps - a.dps + (b.mhp - a.mhp) * 0.3 + (b.armor - a.armor) * 0.4 > 0.5;
}
function itemLines(it) {
  let s = '';
  if (it.dmin) s += `<div class="main">${it.dmin}–${it.dmax} damage</div>`;
  if (it.armor) s += `<div class="main">${it.armor} armor</div>`;
  for (const k in it.aff) s += `<div class="aff">${AFFIX[k].fmt(it.aff[k])}</div>`;
  return s;
}
function showItemTip(el, it, equipped, mode) {
  const col = RARITY_COLORS[it.r];
  let html = `<h4 style="color:${col}">${esc(it.name)}</h4><div class="base">${RARITY[it.r]} ${esc(it.base)} · ${SLOT_NAMES[it.slot]} · item level ${it.il}</div>${itemLines(it)}`;
  if (it.slot === 'weapon' && it.cls !== S.cls) html += `<div class="req">${CLASSES[it.cls].name} only</div>`;
  else if (!equipped) {
    const a = S.inv.st, b = statsWith(it.slot, it);
    const diff = (label, x, y, suf = '') => { const d = Math.round((y - x) * 10) / 10; if (!d) return ''; return `<div class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}${suf} ${label}</div>`; };
    const lines = diff('damage per second', a.dps, b.dps) + diff('life', a.mhp, b.mhp) + diff('armor', a.armor, b.armor) + diff('critical chance', a.crit, b.crit, '%') + diff('movement speed', a.speed, b.speed, '%');
    html += `<div class="cmp">${S.inv.eq[it.slot] ? `Compared with ${esc(S.inv.eq[it.slot].name)}:` : 'You have nothing equipped here:'}${lines || '<div>No change</div>'}</div>`;
  }
  const shop = !$('shopwin').hidden, stash = !$('stashwin').hidden;
  html += `<div class="hint">${mode === 'buy' ? 'Buy it with the button on the right' : mode === 'take' ? 'Click to take it out of the chest' : equipped ? 'Click to take off' : stash ? 'Click to put it in your chest' : shop ? `Click to sell for ${it.v} gold` : `Click to equip · Shift+click to scrap it for ${Math.max(1, Math.round(it.v * 0.2))} gold`}${!equipped && !mode ? '<br>Right-click to drop it on the ground' : ''}</div>`;
  showTip(el, html);
}
function showTip(el, html) {
  const t = $('tip'); t.innerHTML = html; t.hidden = false;
  const r = el.getBoundingClientRect(); const tw = t.offsetWidth, th = t.offsetHeight;
  let x = r.left - tw - 10; if (x < 8) x = r.right + 10; if (x + tw > innerWidth - 8) x = innerWidth - tw - 8;
  let y = r.top + r.height / 2 - th / 2; y = Math.max(8, Math.min(innerHeight - th - 8, y));
  t.style.left = `${x}px`; t.style.top = `${y}px`;
}
function hideTip() { $('tip').hidden = true; }

// NPC windows
const SAYINGS = {
  maren: '“Duskhold has stood for three hundred years. It will not fall on my watch. Not while there are still hands willing to hold a blade.”',
  hilde: '“Nobody climbs to Frosthaven for the view. If you made it over the ridge, you can make yourself useful.”',
  tamsin: '“Mind the sparks. Everything in Cinderwatch is either on fire, about to be, or just was.”',
  fenwick: '“Keep to the boardwalks, stranger. The marsh is patient, and it is always hungry.”',
  borin: '“Sell me your spoils, buy what keeps you breathing. Or try your luck on a sealed crate. I don\'t open them, so I don\'t know what\'s inside either.”',
  ulfar: '“Furs, packs and steel from the high passes. Bigger bags, too. You look like someone who carries too much.”',
  varek: '“Elixirs! Fury for the arm, stone for the skin. And chests that hold more than they should. Do not ask me how.”',
  yselle: '“Curios from the marsh and beyond. My coffers never hold anything ordinary. Some of them hold something legendary.”',
};
function giverName(q) { return NPC_BY_ID[q.giver]?.name || 'the quest giver'; }
function openNpc(id) {
  closeAll();
  const n = NPC_BY_ID[id]; if (!n) return;
  if (n.role === 'shop') {
    S.shopNpc = id; if (!S.shop || S.shop.n !== id) S.shop = null;
    send({ t: 'shop', n: id });
    $('shopwin').hidden = false; renderShop(); openWin('charwin');
  } else { S.questNpc = id; questView = 'list'; $('questwin').hidden = false; renderQuest('list'); }
  sfx.click();
}
function openObj(o) {
  if (o.k === 'dentr') { send({ t: 'enter', d: o.dng }); return; }
  if (o.k === 'dexit') { send({ t: 'leave' }); return; }
  closeAll(); S.openObj = o; sfx.click();
  if (o.k === 'chest') { $('stashwin').hidden = false; renderStash(); openWin('charwin'); }
  else { $('waywin').hidden = false; renderWay(); }
}
function renderShop() {
  const iv = S.inv; if (!iv) return;
  const n = NPC_BY_ID[S.shopNpc] || NPC_BY_ID.borin;
  const box = $('shopbody');
  let html = `<h2 class="ptitle">${esc(n.name)}</h2><p class="say">${SAYINGS[n.id] || ''}</p>`;
  const sh = S.shop && S.shop.n === n.id ? S.shop : null;
  if (!sh) { box.innerHTML = html + '<p class="say">…</p>'; return; }
  const items = sh.offers.filter((o) => o.k === 'item');
  for (const o of sh.offers) {
    if (o.k === 'item') continue;
    const info = SHOP_INFO[o.k]; const poor = iv.gold < o.price;
    if (o.k === 'crate' || o.k === 'mystic') {
      html += `<div style="padding-top:10px">${info.name} · <span class="gold">${o.price}</span><small>${info.desc}</small></div><div class="gamble">` +
        SLOTS.map((sl) => `<button class="btn ghost" data-buy="${o.k}" data-slot="${sl}" ${poor ? 'disabled' : ''}>${SLOT_NAMES[sl]}</button>`).join('') + '</div>';
      continue;
    }
    let extra = '';
    if (o.k === 'potion') extra = ` You have ${iv.pots}.`;
    if (o.k === 'bag') extra = ` Now ${iv.inv.length} of ${INV_MAX}.`;
    if (o.k === 'stashup') extra = ` Now ${iv.stash.length} of ${STASH_MAX}.`;
    const maxed = (o.k === 'bag' && iv.inv.length >= INV_MAX) || (o.k === 'stashup' && iv.stash.length >= STASH_MAX);
    html += `<div class="row"><div>${info.name}<small>${info.desc}${extra}</small></div><button class="btn" data-buy="${o.k}" ${poor || maxed ? 'disabled' : ''}>${maxed ? 'Maxed' : `<span class="gold">${o.price}</span>`}</button></div>`;
  }
  if (items.length) {
    html += `<div class="hd">WARES · NEW STOCK IN ${Math.max(1, Math.ceil((sh.refresh - (performance.now() - (sh._at || performance.now())) / 1000) / 60))} MIN</div>`;
    items.forEach((o, i) => {
      html += `<div class="ware"><button class="inv r${o.it.r}" data-tip="${i}"><canvas></canvas></button><div style="color:${RARITY_COLORS[o.it.r]}">${esc(o.it.name)}<small>${SLOT_NAMES[o.it.slot]} · item level ${o.it.il}</small></div><button class="btn" data-item="${esc(o.o)}" ${iv.gold < o.price ? 'disabled' : ''}><span class="gold">${o.price}</span></button></div>`;
    });
  }
  html += '<p class="say" style="font-style:normal;font-size:13px">Click any item in your bags to sell it.</p>';
  box.innerHTML = html;
  box.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { sfx.click(); send({ t: 'buy', w: b.dataset.buy, s: b.dataset.slot, n: n.id }); }));
  box.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => { sfx.click(); send({ t: 'buy', w: 'item', n: n.id, o: b.dataset.item }); }));
  box.querySelectorAll('[data-tip]').forEach((b) => {
    const it = items[+b.dataset.tip].it; drawItemInto(b.querySelector('canvas'), it);
    b.onmouseenter = () => showItemTip(b, it, false, 'buy'); b.onmouseleave = hideTip;
  });
}
function renderStash() {
  const iv = S.inv; if (!iv) return;
  const box = $('stash'); box.innerHTML = '';
  iv.stash.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'inv';
    if (it) {
      b.classList.add(`r${it.r}`);
      const cv = document.createElement('canvas'); drawItemInto(cv, it); b.appendChild(cv);
      b.setAttribute('aria-label', it.name);
      b.onclick = () => { hideTip(); sfx.click(); send({ t: 'stash', a: 'take', i }); };
      b.onmouseenter = () => showItemTip(b, it, false, 'take'); b.onmouseleave = hideTip;
    } else b.setAttribute('aria-label', 'Empty slot');
    box.appendChild(b);
  });
  $('stashfoot').textContent = `${iv.stash.filter(Boolean).length} of ${iv.stash.length} slots used. Varek in Cinderwatch can make your chest bigger.`;
}
function renderWay() {
  const iv = S.inv; if (!iv) return;
  const here = S.openObj?.town;
  let html = '';
  for (const t of TOWNS) {
    const known = iv.wp.includes(t.id);
    const isHere = t.id === here;
    html += `<button class="way" data-to="${t.id}" ${!known || isHere ? 'disabled' : ''}><span><b>${esc(t.name)}</b><small>${known ? (t.id === 'town' ? 'The old keep' : ZONES[t.id].sub) : `Not found yet · walk there first (level ${t.lvl}+)`}</small></span>${isHere ? '<span class="here">You are here</span>' : known ? '<span class="gold">Travel</span>' : ''}</button>`;
  }
  $('waylist').innerHTML = html;
  $('waylist').querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => send({ t: 'travel', to: b.dataset.to })));
}
let questView = null;
function renderQuest(view) {
  questView = view;
  const iv = S.inv; const box = $('qbody'); if (!iv) return;
  if (view === 'list') {
    const giver = NPC_BY_ID[S.questNpc] || NPC_BY_ID.maren;
    let html = `<h2 class="ptitle">${esc(giver.name)}</h2><p class="say">${SAYINGS[giver.id] || ''}</p><div class="qlist">`;
    let any = false;
    for (const q of QUESTS) {
      if (q.giver !== giver.id) continue;
      const s = questState(iv.q, q);
      if (s === 'done' || s === 'locked') continue;
      any = true;
      const low = s === 'available' && iv.lvl < q.lvl;
      const mk = s === 'ready' ? '?' : s === 'active' ? '…' : '!';
      html += `<button class="qitem" data-q="${q.id}"><span class="mk ${low || s === 'active' ? 'grey' : ''} ${s === 'ready' ? 'ready' : ''}">${mk}</span><span><b>${esc(q.name)}</b><div class="meta">${s === 'ready' ? 'Complete: claim your reward' : s === 'active' ? `In progress · ${iv.q.a[q.id]}/${q.goal.n}` : low ? `Requires level ${q.lvl}` : `Level ${q.lvl} · ${ZONES[q.zone]?.name || 'Anywhere'}`}</div></span></button>`;
    }
    if (!any) html += `<p class="say">“You have done all I could ask. Rest, hero.”</p>`;
    if (giver.id === 'maren' && iv.lvl >= 10) html += '<p class="say" style="font-style:normal;font-size:13px">Beyond the ridge lie the outer lands. Follow any road out of town past the ridge to find Frosthaven, Cinderwatch and Mirebrook.</p>';
    box.innerHTML = html + '</div>';
    box.querySelectorAll('.qitem').forEach((b) => (b.onclick = () => { sfx.click(); renderQuest(b.dataset.q); }));
    return;
  }
  const q = QUEST_BY_ID[view]; const s = questState(iv.q, q);
  const rw = q.reward;
  const rwt = `${rw.xp} experience · ${rw.gold} gold${rw.item ? ` · a ${RARITY[rw.item.r].toLowerCase()} ${rw.item.slot ? SLOT_NAMES[rw.item.slot].toLowerCase() + ' item' : 'item'}` : ''}`;
  box.innerHTML = `<h2 class="ptitle">${esc(q.name)}</h2>
    <p class="qtext">${esc(s === 'ready' ? q.done : q.text)}</p>
    <div class="qgoal"><b>OBJECTIVE</b>${goalText(q).replace(' slain', '')}: slay ${q.goal.n}${q.zone ? ` in ${ZONES[q.zone].name}` : ''}${s === 'active' ? ` · ${iv.q.a[q.id]}/${q.goal.n}` : ''}</div>
    <div class="qrew"><b>REWARD</b>${rwt}</div>
    <div class="qbtns">${s === 'available' ? `<button class="btn" id="qacc" ${iv.lvl < q.lvl ? 'disabled' : ''}>${iv.lvl < q.lvl ? `Requires level ${q.lvl}` : 'Accept'}</button>` : ''}${s === 'ready' ? '<button class="btn" id="qdone">Complete quest</button>' : ''}<button class="btn ghost" id="qback">Back</button></div>`;
  $('qback').onclick = () => { sfx.click(); renderQuest('list'); };
  if ($('qacc')) $('qacc').onclick = () => { send({ t: 'quest', a: 'accept', q: q.id }); setTimeout(() => { $('questwin').hidden = true; }, 60); };
  if ($('qdone')) $('qdone').onclick = () => { send({ t: 'quest', a: 'turnin', q: q.id }); questView = 'list'; };
}
function renderLog() {
  const iv = S.inv; if (!iv) return;
  const act = Object.keys(iv.q.a);
  let html = '';
  if (!act.length) html = '<p class="say">No quests yet. Elder Maren stands by the fountain in town. Look for the gold “!”.</p>';
  for (const id of act) {
    const q = QUEST_BY_ID[id]; const n = iv.q.a[id];
    html += `<div style="margin-top:14px"><b style="font-size:16px;color:var(--ember-hi)">${esc(q.name)}</b><div style="color:var(--ash);font-size:13px">${q.zone ? ZONES[q.zone].name : 'Anywhere in the realm'} · level ${q.lvl}</div><p class="qtext" style="margin:6px 0;font-size:14px">${esc(q.text)}</p><div class="qgoal">${n >= q.goal.n ? `<span style="color:var(--good)">Complete. Return to ${esc(giverName(q))}.</span>` : `${goalText(q)}: ${n}/${q.goal.n}`}</div><button class="btn ghost" data-ab="${id}" style="font-size:12px;padding:4px 10px;margin-top:4px">Abandon</button></div>`;
  }
  $('logbody').innerHTML = html;
  $('logbody').querySelectorAll('[data-ab]').forEach((b) => (b.onclick = () => { send({ t: 'quest', a: 'abandon', q: b.dataset.ab }); }));
}
function renderHelp() {
  $('opt-sound').textContent = `Sound: ${settings.sound ? 'on' : 'off'}`;
  $('opt-music').textContent = `Music: ${settings.music ? 'on' : 'off'}`;
  $('opt-shadow').textContent = `Graphics: ${settings.quality === 'low' ? 'fast' : 'high'}`;
}
$('opt-sound').onclick = () => { settings.sound = !settings.sound; setSound(settings.sound); store.set('duskhold.settings', settings); renderHelp(); };
$('opt-music').onclick = () => { settings.music = !settings.music; setMusic(settings.music); store.set('duskhold.settings', settings); renderHelp(); };
$('opt-shadow').onclick = () => {
  settings.quality = settings.quality === 'low' ? 'high' : 'low';
  renderer.shadowMap.enabled = settings.quality !== 'low'; renderer.setPixelRatio(pixelRatio()); lastW = 0;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  store.set('duskhold.settings', settings); renderHelp();
};
$('opt-logout').onclick = () => location.reload();

// chat, toasts, banner
function addChat(who, text, cls, wcls, color) {
  const log = $('chatlog');
  const d = document.createElement('div'); if (cls) d.className = cls;
  if (who) { const w = document.createElement('span'); w.className = 'who'; w.style.color = CLASSES[wcls]?.color || '#fff'; w.textContent = who + ': '; d.appendChild(w); }
  if (color) { const pre = text.split(': '); d.append(pre[0] + ': '); const b = document.createElement('b'); b.style.color = color; b.textContent = pre.slice(1).join(': '); d.appendChild(b); }
  else d.append(text);
  log.appendChild(d);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function toast(text, kind, color) {
  const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = text;
  if (color) d.style.color = color; if (kind === 'good') d.style.color = '#8be06f';
  $('toasts').appendChild(d);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => d.remove(), 3300);
}
let bannerT = null;
function banner(title, sub) {
  const b = $('banner'); b.querySelector('h2').textContent = title; b.querySelector('p').textContent = sub || '';
  b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 3200);
}
const hurtEl = document.createElement('div');
Object.assign(hurtEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 4, boxShadow: 'inset 0 0 160px rgba(200,0,0,.9)', opacity: 0, transition: 'opacity .35s' });
document.body.appendChild(hurtEl);
function hurtFlash(f) { hurtEl.style.transition = 'none'; hurtEl.style.opacity = Math.min(0.9, 0.25 + f * 3); requestAnimationFrame(() => { hurtEl.style.transition = 'opacity .5s'; hurtEl.style.opacity = 0; }); }
function shake(a) { S.shake = Math.max(S.shake, a); }

// ================================================================ maps
const MAPRES = 1.5; // pixels per world unit on the base map
const MH = 240; // half the width of the map in world units
const mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = MH * 2 * MAPRES;
let mapReady = false;
function buildMapImage() {
  const x = mapImg.getContext('2d'); const N = mapImg.width;
  const img = x.createImageData(N, N); const c = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const wx = i / MAPRES - MH, wz = j / MAPRES - MH;
    const k = (j * N + i) * 4;
    if (Math.hypot(wx, wz) > WORLD_R - 1) { img.data[k] = 18; img.data[k + 1] = 14; img.data[k + 2] = 22; img.data[k + 3] = 255; continue; }
    groundColor(wx, wz, c); c.convertLinearToSRGB?.();
    img.data[k] = Math.min(255, c.r * 255 * 1.25); img.data[k + 1] = Math.min(255, c.g * 255 * 1.25); img.data[k + 2] = Math.min(255, c.b * 255 * 1.25); img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const col = { oak: '#2e4a1e', pine: '#1a3018', deadtree: '#3a3430', rock: '#5a5650', grave: '#8a8590', ruin: '#7a7466', post: '#3a2a1c', tower: '#5a3a2a', pillar: '#8a8478', tent: '#8a6a40', crypt: '#2a2630', cliff: '#151218',
    ridge: '#2a2630', snowpine: '#dfe8ee', icerock: '#a8c0d8', ashtree: '#1a1414', lavarock: '#3a1a10', bogtree: '#2a3a20', reeds: '#5a6a34', crystal: '#a87aff', chest: '#d8a860' };
  for (const o of world.obs) {
    const px = (o.x + MH) * MAPRES, pz = (o.z + MH) * MAPRES;
    if (o.box) { x.fillStyle = o.k === 'crypt' ? '#2a2630' : '#6a4a34'; x.fillRect(px - o.hw * MAPRES, pz - o.hd * MAPRES, o.hw * 2 * MAPRES, o.hd * 2 * MAPRES); continue; }
    if (o.k === 'dentr') { x.fillStyle = '#ff8a4a'; x.fillRect(px - 3 * MAPRES, pz - 2 * MAPRES, 6 * MAPRES, 4 * MAPRES); continue; }
    if (o.k === 'waystone') { x.fillStyle = '#7ad8ff'; x.beginPath(); x.arc(px, pz, 2.6 * MAPRES, 0, Math.PI * 2); x.fill(); continue; }
    if (!col[o.k]) continue;
    x.fillStyle = col[o.k]; x.beginPath(); x.arc(px, pz, Math.max(1, o.r * MAPRES * (o.k === 'oak' || o.k === 'pine' || o.k === 'snowpine' || o.k === 'bogtree' ? 1.6 : 1)), 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#5a8ab8'; x.beginPath(); x.arc(MH * MAPRES, MH * MAPRES, 2.3 * MAPRES, 0, Math.PI * 2); x.fill();
  mapReady = true;
}
// dungeon maps: floor light, walls dark
const DMAPRES = 4;
const dmaps = [];
function dungeonMap(d) {
  if (dmaps[d.i]) return dmaps[d.i];
  const N = DNG_TILES * DNG_TILE * DMAPRES; const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = '#07060a'; x.fillRect(0, 0, N, N);
  const D = world.dungeons[d.i], th = DTHEME[d.theme], T = DNG_TILE * DMAPRES;
  for (let z = 0; z < DNG_TILES; z++) for (let i = 0; i < DNG_TILES; i++) {
    if (D.floor[i + z * DNG_TILES]) { x.fillStyle = th.floor2; x.fillRect(i * T, z * T, T, T); }
  }
  x.globalAlpha = 0.9; x.fillStyle = th.wall;
  for (const o of world.obs) if (o.k === 'dwall' && o.dng === d.i) x.fillRect(o.tx * T, o.tz * T, T, T);
  x.globalAlpha = 1;
  for (const o of world.obs) if (o.k === 'dexit' && o.dng === d.i) { x.fillStyle = '#bfe6ff'; x.beginPath(); x.arc((o.x - d.ox) * DMAPRES, (o.z - d.oz) * DMAPRES, 2.2 * DMAPRES, 0, Math.PI * 2); x.fill(); }
  dmaps[d.i] = c; return c;
}
function drawMarkers(x, toPx, scale, big) {
  // loot
  for (const l of S.loot.values()) if (l.kind === 'item' && l.r >= 2) { const [px, py] = toPx(l.x, l.z); x.fillStyle = RARITY_COLORS[l.r]; x.fillRect(px - 2, py - 2, 4, 4); }
  for (const e of S.monsters.values()) {
    if (e.dying) continue; const [px, py] = toPx(e.x, e.z);
    x.fillStyle = e.boss ? '#8aff9a' : e.flags & 1 ? '#7aa8ff' : '#e04030';
    x.beginPath(); x.arc(px, py, e.boss ? 5 : big ? 2.5 : 3, 0, Math.PI * 2); x.fill();
  }
  for (const pr of world.props) { if (pr.k !== 'trove' || S.broken.has(pr.id) || Math.abs(pr.x - S.me.x) > (big ? 999 : 50) || Math.abs(pr.z - S.me.z) > (big ? 999 : 50)) continue; if (big && Math.hypot(pr.x - S.me.x, pr.z - S.me.z) > 60) continue; const [px, py] = toPx(pr.x, pr.z); x.fillStyle = '#ffc840'; x.fillRect(px - 2.5, py - 2, 5, 4); }
  for (const n of S.npcs) { const [px, py] = toPx(n.x, n.z); x.fillStyle = '#ffd34a'; x.beginPath(); x.arc(px, py, 3.5, 0, Math.PI * 2); x.fill(); }
  for (const p of S.players.values()) {
    if (p.id === S.id) continue; const [px, py] = toPx(p.x, p.z);
    x.fillStyle = CLASSES[p.cls].color; x.strokeStyle = '#000'; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, 4.5, 0, Math.PI * 2); x.fill(); x.stroke();
  }
  const [mx, my] = toPx(S.me.x, S.me.z);
  x.save(); x.translate(mx, my); x.rotate(-S.me.rot + Math.PI);
  x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.stroke(); x.fill();
  x.restore();
}
function drawMinimap() {
  if (!mapReady) return;
  const cv = $('minimap'); const x = cv.getContext('2d'); const W = cv.width;
  const R = 48; // world units shown from centre to edge
  const cx = S.me.x, cz = S.me.z;
  x.fillStyle = '#100c14'; x.fillRect(0, 0, W, W);
  const dg = dungeonAt(cx);
  if (dg) x.drawImage(dungeonMap(dg), (cx - R - dg.ox) * DMAPRES, (cz - R - dg.oz) * DMAPRES, R * 2 * DMAPRES, R * 2 * DMAPRES, 0, 0, W, W);
  else x.drawImage(mapImg, (cx - R + MH) * MAPRES, (cz - R + MH) * MAPRES, R * 2 * MAPRES, R * 2 * MAPRES, 0, 0, W, W);
  const s = W / (R * 2);
  drawMarkers(x, (wx, wz) => [(wx - cx + R) * s, (wz - cz + R) * s], s, false);
  const g = x.createRadialGradient(W / 2, W / 2, W * 0.35, W / 2, W / 2, W * 0.5); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = g; x.fillRect(0, 0, W, W);
}
function drawBigMap() {
  if (!mapReady) buildMapImage();
  const cv = $('bigmap'); const x = cv.getContext('2d'); const W = cv.width;
  const dg = dungeonAt(S.me.x);
  if (dg) {
    const span = DNG_TILES * DNG_TILE; const sc = W / span;
    x.drawImage(dungeonMap(dg), 0, 0, W, W);
    x.textAlign = 'center'; x.font = `700 ${Math.round(W * 0.04)}px "Grenze Gotisch", Georgia, serif`; x.fillStyle = '#f3dfb2'; x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 5;
    x.strokeText(dg.name, W / 2, W * 0.06); x.fillText(dg.name, W / 2, W * 0.06);
    drawMarkers(x, (wx, wz) => [(wx - dg.ox) * sc, (wz - dg.oz) * sc], sc, true);
    return;
  }
  x.drawImage(mapImg, 0, 0, W, W);
  const s = W / (MH * 2);
  const toPx = (wx, wz) => [(wx + MH) * s, (wz + MH) * s];
  x.textAlign = 'center';
  const text = (t, px, py, font, fill) => { x.font = font; x.fillStyle = fill; x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 4; x.strokeText(t, px, py); x.fillText(t, px, py); };
  const labels = [['meadow', 0, -88], ['thorn', 88, 0], ['grave', 0, 88], ['crypt', -84, -18], ['frost', -88, -186], ['ember', 196, -60], ['mire', 60, 196], ['spire', -178, -70]];
  for (const [k, wx, wz] of labels) {
    const [px, py] = toPx(wx, wz);
    text(ZONES[k].name, px, py, `700 ${Math.round(W * 0.026)}px "Grenze Gotisch", Georgia, serif`, '#f3dfb2');
    text(`Level ${ZONES[k].lv[0]}–${ZONES[k].lv[1]}`, px, py + W * 0.022, `600 ${Math.round(W * 0.015)}px "Alegreya Sans", sans-serif`, '#d8c8a8');
  }
  for (const t of TOWNS) {
    const [px, py] = toPx(t.x, t.z);
    const known = S.inv?.wp?.includes(t.id);
    text(t.name, px, py - (t.id === 'town' ? W * 0.065 : W * 0.04), `700 ${Math.round(W * 0.022)}px "Grenze Gotisch", Georgia, serif`, known ? '#ffd27a' : '#b8a888');
  }
  for (const D of world.dungeons) {
    const [px, py] = toPx(D.ex, D.ez); const d = DUNGEONS[D.i];
    text('▼', px, py + W * 0.008, `${Math.round(W * 0.026)}px serif`, '#ff9a5a');
    text(d.name, px, py + W * 0.03, `600 ${Math.round(W * 0.014)}px "Alegreya Sans", sans-serif`, '#ffc8a0');
  }
  for (const [A, nm, cc] of [[BOSS_ARENA, 'Morvath', '#9affaa'], [BOSS_ARENA2, 'Nharzul', '#d0a8ff']]) {
    const [bx, by] = toPx(A.x, A.z);
    text('☠', bx, by + W * 0.01, `${Math.round(W * 0.032)}px serif`, cc);
    text(nm, bx, by + W * 0.035, `600 ${Math.round(W * 0.015)}px "Alegreya Sans", sans-serif`, cc);
  }
  drawMarkers(x, toPx, s, true);
}

// ================================================================ main loop
const ATMOS = {
  town: { fog: '#2c2536', sky: '#b4a0d8', gnd: '#3a2c20', sun: '#ffbe8a', si: 2.4, near: 42, far: 105 },
  meadow: { fog: '#352a40', sky: '#a294cc', gnd: '#2a2620', sun: '#ffa58a', si: 2.1, near: 40, far: 105 },
  thorn: { fog: '#1d2a22', sky: '#8eac98', gnd: '#1e2418', sun: '#e8c08c', si: 2.0, near: 30, far: 86 },
  grave: { fog: '#272138', sky: '#8a78b0', gnd: '#201a28', sun: '#c0a8e0', si: 1.6, near: 30, far: 88 },
  crypt: { fog: '#18211b', sky: '#6f9076', gnd: '#1a1a14', sun: '#9ae09a', si: 1.4, near: 26, far: 80 },
  frost: { fog: '#55606e', sky: '#c8d8ec', gnd: '#4a505a', sun: '#d8e4ff', si: 1.7, near: 26, far: 82 },
  ember: { fog: '#2a1612', sky: '#d08a6a', gnd: '#2a1410', sun: '#ff8a4a', si: 1.9, near: 30, far: 88 },
  mire: { fog: '#1e2a24', sky: '#8aa890', gnd: '#1a2018', sun: '#c8d8a0', si: 1.5, near: 22, far: 74 },
  spire: { fog: '#1c1428', sky: '#9a7ad0', gnd: '#1a1222', sun: '#c8a0ff', si: 1.5, near: 28, far: 84 },
  frosthaven: { fog: '#4a5462', sky: '#d0dcf0', gnd: '#4a4e58', sun: '#ffe0c0', si: 2.0, near: 38, far: 100 },
  cinderwatch: { fog: '#2e1e1a', sky: '#d8a080', gnd: '#30201a', sun: '#ffa060', si: 2.1, near: 38, far: 100 },
  mirebrook: { fog: '#24302a', sky: '#a0b8a0', gnd: '#20281e', sun: '#ffd8a0', si: 1.9, near: 36, far: 98 },
};
for (const d of DUNGEONS) {
  const th = DTHEME[d.theme];
  ATMOS[d.id] = { earth: { fog: '#0e0a08', sky: '#c0a080', gnd: '#2a2018', sun: '#ffb070', si: 0.9 }, bone: { fog: '#0a0a0e', sky: '#a0a0c0', gnd: '#201e28', sun: '#c0c8ff', si: 0.8 },
    ice: { fog: '#0c1218', sky: '#b0d0f0', gnd: '#283442', sun: '#d0e8ff', si: 1.0 }, lava: { fog: '#140806', sky: '#e09070', gnd: '#301410', sun: '#ff9050', si: 0.9 },
    moss: { fog: '#080e0a', sky: '#a0c0a0', gnd: '#1a261a', sun: '#c0ffb0', si: 0.8 } }[d.theme];
  Object.assign(ATMOS[d.id], { near: 34, far: 72 });
}
const atm = { fog: new THREE.Color('#2c2536'), sky: new THREE.Color('#a08cc8'), gnd: new THREE.Color('#2c2218'), sun: new THREE.Color('#ffb27a'), si: 2.3, near: 42, far: 105 };
const _c = new THREE.Color();
function updateAtmosphere(dt, zone) {
  const a = ATMOS[zone] || ATMOS.town; const k = 1 - Math.exp(-dt * 1.5);
  atm.fog.lerp(_c.set(a.fog), k); atm.sky.lerp(_c.set(a.sky), k); atm.gnd.lerp(_c.set(a.gnd), k); atm.sun.lerp(_c.set(a.sun), k);
  atm.si = lerp(atm.si, a.si, k); atm.near = lerp(atm.near, a.near, k); atm.far = lerp(atm.far, a.far, k);
  scene.fog.color.copy(atm.fog); scene.background.copy(atm.fog); scene.fog.near = atm.near * S.zoom; scene.fog.far = atm.far * S.zoom;
  hemi.color.copy(atm.sky); hemi.groundColor.copy(atm.gnd); sun.color.copy(atm.sun); sun.intensity = atm.si;
}
let lightTimer = 0;
function updateLights(dt, cx, cz, t) {
  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.4;
    const sorted = WV.lights.map((l) => ({ l, d: Math.hypot(l.x - cx, l.z - cz) })).sort((a, b) => a.d - b.d).slice(0, lightPool.length);
    lightPool.forEach((pl, i) => { const s = sorted[i]; if (!s || s.d > 45) { pl.userData.l = null; pl.intensity = 0; return; } pl.userData.l = s.l; pl.position.set(s.l.x, s.l.y, s.l.z); pl.color.set(s.l.color); });
  }
  const poolOn = settings.quality !== 'low';
  for (const pl of lightPool) { if (pl.visible !== poolOn) pl.visible = poolOn; const l = pl.userData.l; if (!l) continue; pl.intensity = 22 * l.power * (0.85 + 0.15 * Math.sin(t * 9 + l.x) * Math.sin(t * 5.3 + l.z)); }
  for (const f of WV.flames) { const k = 0.85 + 0.2 * Math.sin(t * 11 + f.seed) * Math.sin(t * 7.1 + f.seed * 2); f.s.scale.setScalar(f.base * 1.6 * k); f.core.scale.setScalar(f.base * 0.6 * k); }
}
let emitTimer = 0;
function ambient(dt, cx, cz, zone, t) {
  emitTimer += dt;
  if (emitTimer < 0.05) return;
  emitTimer = 0;
  for (const em of WV.emitters) {
    if (Math.abs(em.x - cx) > 40 || Math.abs(em.z - cz) > 40) continue;
    if (em.kind === 'fountain') parts.emit(em.x, em.y, em.z, { n: 3, color: 0x8ac8ff, color2: 0xe0f4ff, speed: 1.6, up: 1.5, life: [0.5, 0.8], size: [0.12, 0.2], grav: 9 });
    else if (em.kind === 'ember' && Math.random() < 0.3) parts.emit(em.x, em.y + 0.2, em.z, { n: 1, color: 0xff9a40, speed: 0.3, life: [0.6, 1.2], size: [0.07, 0.12], vy: 1.4 });
    else if (em.kind === 'voidfire') parts.emit(em.x, em.y, em.z, { n: 2, color: 0x9a5aff, color2: 0xe0c8ff, speed: 0.3, life: [0.4, 0.8], size: [0.3, 0.5], vy: 2, radius: 0.3 });
    else if (em.kind === 'waystone' && Math.random() < 0.5) parts.emit(em.x + (Math.random() - 0.5) * 1.6, em.y, em.z + (Math.random() - 0.5) * 1.6, { n: 1, color: 0x7ad8ff, color2: 0xe0f8ff, speed: 0.1, life: [1.2, 2], size: [0.1, 0.18], vy: 1.2 });
    else if (em.kind === 'greenfire') parts.emit(em.x, em.y, em.z, { n: 2, color: 0x4aff6a, color2: 0xc0ffc0, speed: 0.3, life: [0.4, 0.8], size: [0.3, 0.5], vy: 2, radius: 0.3 });
    else if (em.kind === 'campfire') parts.emit(em.x, em.y, em.z, { n: 2, color: 0xff6a10, color2: 0xffc050, speed: 0.3, life: [0.4, 0.8], size: [0.35, 0.6], vy: 1.8, radius: 0.3, grow: -0.5 });
    else if (em.kind === 'smoke' && Math.random() < 0.5) parts.emit(em.x, em.y, em.z, { n: 1, color: 0x2a2626, speed: 0.2, life: [2, 3], size: [0.8, 1.2], vy: 1.2, grow: 1.5 });
  }
  if (zone === 'frost' || zone === 'frosthaven') {
    // snowfall
    for (let i = 0; i < (zone === 'frost' ? 4 : 2); i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 26; parts.emit(cx + Math.cos(a) * r, 9 + Math.random() * 4, cz + Math.sin(a) * r, { n: 1, color: 0xffffff, color2: 0xdde8ff, speed: 0.6, vy: -2.2, life: [3.5, 5], size: [0.1, 0.18] }); }
  }
  if (zone === 'ember' || zone === 'cinderwatch') {
    for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 24; parts.emit(cx + Math.cos(a) * r, 0.3, cz + Math.sin(a) * r, { n: 1, color: 0xff7a20, color2: 0xffd060, speed: 0.4, vy: 1.6, life: [1.5, 3], size: [0.07, 0.13] }); }
  }
  if (ZONES[zone]?.dungeon && Math.random() < 0.4) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 16; parts.emit(cx + Math.cos(a) * r, 0.5 + Math.random() * 2.5, cz + Math.sin(a) * r, { n: 1, color: 0xb0a090, speed: 0.15, life: [2.5, 4], size: [0.06, 0.1], vy: 0.05 }); }
  const motes = { meadow: [0xd8ff7a, 0.5], thorn: [0xb8e0a0, 0.35], grave: [0xa890ff, 0.35], crypt: [0x6aff8a, 0.45], town: [0xffc070, 0.15], mire: [0xe0ff6a, 0.7], mirebrook: [0xe0ff6a, 0.4], spire: [0xc08aff, 0.6] }[zone];
  if (motes && Math.random() < motes[1]) {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 22;
    parts.emit(cx + Math.cos(a) * r, 0.5 + Math.random() * 3, cz + Math.sin(a) * r, { n: 1, color: motes[0], speed: 0.4, life: [2, 4], size: [0.1, 0.18], vy: 0.15 });
  }
  if (WV.water) WV.water.position.y = 0.62 + Math.sin(t * 2) * 0.02;
}

function animateRig(e, dt, moving, t) {
  const rig = e.rig;
  if (moving) e.walk += dt * 10; else e.walk *= 0.9;
  const sw = moving ? Math.sin(e.walk) : Math.sin(e.walk) * 0.2;
  if (rig.kind === 'biped') {
    if (rig.legs.length) { rig.legs[0].rotation.x = sw * 0.65; rig.legs[1].rotation.x = -sw * 0.65; }
    rig.body.position.y = moving ? Math.abs(Math.cos(e.walk)) * 0.06 : Math.sin(t * 2 + (e.seed || 0)) * 0.015;
    rig.body.rotation.x = rig.hunch || 0;
    let ar = -sw * 0.5, al = sw * 0.5;
    if (e.atk > 0) {
      const p = 1 - e.atk / e.atkDur;
      if (e.atkKind === 'proj' || e.atkKind === 'nova' || e.atkKind === 'meteor' || e.atkKind === 'rain' || e.atkKind === 'heal') { ar = -1.5 * Math.sin(Math.min(1, p * 1.4) * Math.PI); al = rig.weapon && rig.weapon.parent?.parent === rig.armL ? -1.5 * Math.sin(Math.min(1, p * 1.4) * Math.PI) : al; }
      else { ar = p < 0.35 ? -2.6 * (p / 0.35) : -2.6 + 3.3 * Math.min(1, (p - 0.35) / 0.3); if (p > 0.65) ar = 0.7 * (1 - (p - 0.65) / 0.35); }
      e.atk = Math.max(0, e.atk - dt);
    }
    rig.armR.rotation.x = ar; rig.armL.rotation.x = al;
  } else if (rig.kind === 'quad' || rig.kind === 'spider') {
    for (const l of rig.legs) l.rotation.x = Math.sin(e.walk * (rig.kind === 'spider' ? 1.6 : 1) + l.userData.ph) * (moving ? (rig.kind === 'spider' ? 0.35 : 0.6) : 0.05);
    rig.body.position.y = moving ? Math.abs(Math.sin(e.walk)) * 0.05 : 0;
    if (e.atk > 0) { const p = 1 - e.atk / e.atkDur; rig.body.position.z = Math.sin(p * Math.PI) * 0.5; e.atk = Math.max(0, e.atk - dt); } else rig.body.position.z = 0;
  }
  // tint: hit flash, frozen, enraged
  const frozen = e.flags & 2 && e.def; const enr = e.flags & 8;
  if (e.flash > 0 || frozen || enr || e._tinted) {
    e.flash = Math.max(0, e.flash - dt * 6);
    for (const m of rig.mats) {
      const e0 = m.userData.e0; if (!e0) continue;
      if (frozen) m.emissive.setRGB(0.1, 0.25, 0.55);
      else if (enr) m.emissive.setRGB(0.35 + 0.15 * Math.sin(t * 10), 0.02, 0.02);
      else m.emissive.copy(e0);
      if (e.flash > 0) m.emissive.lerp(_c.setRGB(0.9, 0.85, 0.8), e.flash * 0.6);
    }
    e._tinted = e.flash > 0 || frozen || enr;
  }
}

let last = performance.now(), loginT = 0, mmTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const nowMs = performance.now(); const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
  S.fps = S.fps ? S.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05 : 30;
  const t = nowMs / 1000;
  resize();
  if (S.mode !== 'game') {
    loginT += dt;
    const a = loginT * 0.05 + 0.6;
    camera.position.set(Math.cos(a) * 30, 15, Math.sin(a) * 30);
    camera.lookAt(0, 1.5, 0);
    updateAtmosphere(dt, 'town');
    sun.position.set(-30, 40, 18); sun.target.position.set(0, 0, 0);
    playerLight.position.set(0, 3, 0);
    updateLights(dt, 0, 0, t); ambient(dt, 0, 0, 'town', t);
    for (const n of S.npcs) animateRig(n, dt, false, t);
    parts.update(dt);
    renderer.render(scene, camera);
    return;
  }
  const me = S.me;
  // ----- local movement (the client moves its own hero; the server checks it)
  let mx = 0, mz = 0;
  const st = S.inv?.st;
  const speed = st ? st.move : 6;
  const K = S.keys;
  if (!me.dead && !me.dash) {
    if (K.has('w') || K.has('arrowup')) mz -= 1; if (K.has('s') || K.has('arrowdown')) mz += 1;
    if (K.has('a') || K.has('arrowleft')) mx -= 1; if (K.has('d') || K.has('arrowright')) mx += 1;
    if (mx || mz) { S.path = null; S.attackTarget = null; S.npcTarget = null; S.lootTarget = null; S.objTarget = null; S.propTarget = null; S.portalTarget = null; }
    else {
      if (S.mouse.down && performance.now() - S.mouse.downAt > 220 && !S.attackTarget && !S.mouse.shift && !S.npcTarget && !S.lootTarget && !S.objTarget && S.propTarget === null && !S.portalTarget && !anyWindowOpen()) {
        const g = groundAt(S.mouse.x, S.mouse.y);
        if (Math.hypot(g.x - me.x, g.z - me.z) > 0.6) S.path = [g];
      }
      if (S.attackTarget) {
        const m = S.monsters.get(S.attackTarget);
        if (!m || m.dying) S.attackTarget = null;
        else {
          const melee = CLASSES[S.cls].basic.kind === 'melee';
          const reach = melee ? CLASSES[S.cls].basic.range + m.def.r * (m.flags & 1 ? 1.25 : 1) - 0.35 : 15;
          const d = Math.hypot(m.x - me.x, m.z - me.z);
          if (d > reach) {
            if (!S.path || S.pathFor !== m.id || performance.now() - S.pathAt > 400) { S.path = findPath(me.x, me.z, m.x, m.z); S.pathFor = m.id; S.pathAt = performance.now(); }
          } else {
            S.path = null; me.rot = Math.atan2(m.x - me.x, m.z - me.z);
            if (S.cds[0] <= 0.02) castSlot(0, { x: m.x, z: m.z });
          }
        }
      }
      if (S.path && S.path.length) {
        const wp = S.path[0]; const dx = wp.x - me.x, dz = wp.z - me.z, d = Math.hypot(dx, dz);
        const stopAt = S.path.length === 1 ? (S.portalTarget ? 1.2 : S.npcTarget ? 3.5 : S.objTarget ? 1.2 : S.propTarget !== null ? 1.8 : S.lootTarget ? 1.5 : 0.15) : 0.3;
        if (d < stopAt) S.path.shift(); else { mx = dx / d; mz = dz / d; }
        if (!S.path.length) S.path = null;
      }
    }
    if (mx || mz) {
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      let nx = me.x, nz = me.z;
      const steps = Math.ceil(speed * dt / 0.25);
      for (let i = 0; i < steps; i++) [nx, nz] = world.resolve(nx + mx * speed * dt / steps, nz + mz * speed * dt / steps, PLAYER_R);
      me.moving = Math.hypot(nx - me.x, nz - me.z) > speed * dt * 0.2;
      me.x = nx; me.z = nz; me.rot = Math.atan2(mx, mz);
    } else me.moving = false;
  }
  if (me.dash) {
    me.dash.t += dt; const k = Math.min(1, me.dash.t / Math.max(0.01, me.dash.dur));
    me.x = lerp(me.dash.fx, me.dash.tx, k); me.z = lerp(me.dash.fz, me.dash.tz, k); me.moving = true;
    if (k >= 1) me.dash = null;
  }
  // arrival checks
  if (S.npcTarget) { const n = S.npcs.find((q) => q.id === S.npcTarget); if (n && Math.hypot(n.x - me.x, n.z - me.z) < 4.2) { S.npcTarget = null; S.path = null; openNpc(n.id); } else if (!S.path) S.npcTarget = null; }
  if (S.portalTarget) { const t = S.portalTarget; if (Math.hypot(t.x - me.x, t.z - me.z) < 2.8) { S.portalTarget = null; S.path = null; send({ t: 'useportal', id: t.pt.id }); } else if (!S.path) S.portalTarget = null; }
  if (S.propTarget !== null) { const pr = world.props[S.propTarget]; if (Math.hypot(pr.x - me.x, pr.z - me.z) < 2.6) { S.path = null; smashNow(pr); } else if (!S.path) S.propTarget = null; }
  if (S.objTarget) { const o = S.objTarget; if (Math.hypot(o.x - me.x, o.z - me.z) < (o.k === 'dentr' ? 4.2 : 3.5)) { S.objTarget = null; S.path = null; openObj(o); } else if (!S.path) S.objTarget = null; }
  if (S.lootTarget) { const l = S.loot.get(S.lootTarget); if (!l) S.lootTarget = null; else if (Math.hypot(l.x - me.x, l.z - me.z) < 2.5) { send({ t: 'pick', id: l.id }); S.lootTarget = null; S.path = null; } else if (!S.path) S.lootTarget = null; }
  // walking away from an NPC closes their window
  {
    const far = (id) => { const n = NPC_BY_ID[id]; return !n || Math.hypot(n.x - me.x, n.z - me.z) > 9; };
    const farObj = (o) => !o || Math.hypot(o.x - me.x, o.z - me.z) > 6;
    if (!$('shopwin').hidden && far(S.shopNpc)) { $('shopwin').hidden = true; if (!$('charwin').hidden) renderChar(); }
    if (!$('questwin').hidden && far(S.questNpc)) $('questwin').hidden = true;
    if (!$('stashwin').hidden && farObj(S.openObj)) { $('stashwin').hidden = true; if (!$('charwin').hidden) renderChar(); }
    if (!$('waywin').hidden && farObj(S.openObj)) $('waywin').hidden = true;
  }
  // send position
  if (!me.dead && performance.now() - S.lastSent > 50 && (Math.abs(me.x - S.sentX) > 0.01 || Math.abs(me.z - S.sentZ) > 0.01 || Math.abs(me.rot - S.sentR) > 0.05)) {
    S.lastSent = performance.now(); S.sentX = me.x; S.sentZ = me.z; S.sentR = me.rot;
    send({ t: 'pos', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.rot.toFixed(2) });
  }
  if (me.dead) { S.deathT = Math.max(0, S.deathT - dt); }
  // ----- zone
  const zone = zoneAt(me.x, me.z);
  if (zone !== S.zone) {
    const prev = S.zone; S.zone = zone;
    const zd = ZONES[zone];
    $('zonename').textContent = zd.name; $('zonelvl').textContent = zd.lv ? `Level ${zd.lv[0]}–${zd.lv[1]}` : zd.sub;
    if (prev) banner(zd.name, zd.dungeon ? `DUNGEON · LEVEL ${zd.lv[0]}–${zd.lv[1]}` : zd.lv ? `LEVEL ${zd.lv[0]}–${zd.lv[1]}` : 'SANCTUARY · ENEMIES CANNOT FOLLOW YOU HERE');
  }
  // ----- entities
  const sm = 1 - Math.exp(-dt * 14);
  for (const e of S.players.values()) {
    if (e.id === S.id) { e.x = me.x; e.z = me.z; e.rot = angLerp(e.rot, me.rot, 1 - Math.exp(-dt * 20)); }
    else { const ox = e.x, oz = e.z; e.x = lerp(e.x, e.tx, sm); e.z = lerp(e.z, e.tz, sm); e.rot = angLerp(e.rot, e.trot, sm); e.moving = Math.hypot(e.x - ox, e.z - oz) > dt * 0.8; }
    const dead = e.id === S.id ? me.dead : !!(e.flags & 1);
    e.rig.root.position.set(e.x, 0, e.z);
    if (e.flags & 2) e.rig.root.rotation.y += dt * 22; else e.rig.root.rotation.y = e.rot;
    if (dead) { e.rig.root.rotation.x = Math.max(-Math.PI / 2, e.rig.root.rotation.x - dt * 5); e.rig.root.position.y = 0.2; }
    else { e.rig.root.rotation.x = 0; e.dying = 0; }
    animateRig(e, dt, e.id === S.id ? me.moving : e.moving, t);
  }
  for (const e of [...S.monsters.values()]) {
    if (e.dying) {
      e.dying += dt;
      const k = Math.min(1, e.dying / 0.45);
      if (e.rig.kind === 'biped') e.rig.root.rotation.x = -k * Math.PI / 2; else e.rig.root.rotation.z = k * Math.PI / 2;
      e.rig.root.position.y = -Math.max(0, e.dying - 1.2) * 1.2 + (e.rig.kind === 'biped' ? k * 0.2 : 0);
      if (e.dying > 2.4) removeMonsterEnt(e);
      continue;
    }
    const ox = e.x, oz = e.z;
    e.x = lerp(e.x, e.tx, sm); e.z = lerp(e.z, e.tz, sm); e.rot = angLerp(e.rot, e.trot, sm);
    const moving = Math.hypot(e.x - ox, e.z - oz) > dt * 0.5;
    e.rig.root.position.set(e.x, 0, e.z); e.rig.root.rotation.y = e.rot;
    animateRig(e, dt, moving, t);
  }
  for (const n of S.npcs) {
    const d = Math.hypot(n.x - me.x, n.z - me.z);
    if (d > 60) continue;
    const want = d < 9 ? Math.atan2(me.x - n.x, me.z - n.z) : npcHome(n);
    n.rig.root.rotation.y = angLerp(n.rig.root.rotation.y, want, 1 - Math.exp(-dt * 4));
    animateRig(n, dt, false, t);
    n.marker.position.y = 4.3 + Math.sin(t * 2.5) * 0.12;
  }
  for (const l of S.loot.values()) { l.t += dt; if (l.spin) { l.spin.rotation.y += dt * 2; l.spin.position.y = 0.5 + Math.sin(l.t * 2.5) * 0.08; } }
  // ----- camera
  S.cam.x = lerp(S.cam.x, me.x, 1 - Math.exp(-dt * 8)); S.cam.z = lerp(S.cam.z, me.z, 1 - Math.exp(-dt * 8));
  S.shake = Math.max(0, S.shake - dt * 2.2);
  const sx = (Math.random() - 0.5) * S.shake * 0.6, sz = (Math.random() - 0.5) * S.shake * 0.6;
  camera.position.set(S.cam.x + sx, 27 * S.zoom, S.cam.z + 19 * S.zoom + sz);
  camera.lookAt(S.cam.x + sx, 0.8, S.cam.z + sz);
  sun.position.set(S.cam.x - 30, 42, S.cam.z + 16); sun.target.position.set(S.cam.x, 0, S.cam.z);
  playerLight.position.set(me.x, 3.2, me.z + 0.5);
  selfRing.position.set(me.x, 0.04, me.z); selfRing.scale.setScalar(0.75);
  updateAtmosphere(dt, zone);
  updateLights(dt, S.cam.x, S.cam.z, t);
  ambient(dt, S.cam.x, S.cam.z, zone, t);
  // ----- hover + labels
  pickHover();
  const tgt = S.hoverMon || (S.attackTarget ? S.monsters.get(S.attackTarget) : null);
  if (tgt && !tgt.dying) { hoverRing.visible = true; hoverRing.position.set(tgt.x, 0.05, tgt.z); hoverRing.scale.setScalar(tgt.def.r * (tgt.flags & 1 ? 1.6 : 1.3) * (tgt.boss ? 1.5 : 1)); hoverRing.material.color.set(S.hoverMon ? 0xff4a3a : 0xff8a3a); }
  else if (S.hoverProp) { const pr = S.hoverProp; hoverRing.visible = true; hoverRing.position.set(pr.x, 0.05, pr.z); hoverRing.scale.setScalar(PROPS[pr.k].r + 0.45); hoverRing.material.color.set(0xffc860); }
  else hoverRing.visible = false;
  updateTargetFrame(tgt);
  updateLabels(tgt);
  // ----- fx
  parts.update(dt); projs.update(dt); tgs.update(dt); rings.update(dt); swooshes.update(dt);
  ftext.update(dt, project);
  updateHotbar(dt);
  mmTimer -= dt; if (mmTimer <= 0) { mmTimer = 0.1; drawMinimap(); }
  // in dungeons, walls between the camera and the hero sink into the floor
  {
    const dg = dungeonAt(me.x);
    for (const [i, W] of (WV.dwalls || []).entries()) {
      if (!W) continue;
      const want = new Set();
      if (dg && dg.i === i) W.walls.forEach((o, k) => { const dz = o.z - me.z; if (dz > -0.5 && dz < 6 && Math.abs(o.x - me.x) < 3.2 + dz * 0.4) want.add(k); });
      let changed = false;
      for (const k of W.low) if (!want.has(k)) { W.im.setMatrixAt(k, W.full[k]); changed = true; }
      for (const k of want) if (!W.low.has(k)) { W.im.setMatrixAt(k, W.cut[k]); changed = true; }
      W.low = want; if (changed) W.im.instanceMatrix.needsUpdate = true;
    }
  }
  for (const b of WV.buildings) {
    const o = b.o; const behind = me.z < o.z + o.hd && me.z > o.z - o.hd - 9 && Math.abs(me.x - o.x) < o.hw + 1.6 && me.z < o.z;
    const want = behind ? 0.28 : 1;
    if (Math.abs(b.fade - want) > 0.01) {
      b.fade = lerp(b.fade, want, 1 - Math.exp(-dt * 8));
      b.g.traverse((x) => { if (x.isMesh) { x.material.opacity = b.fade; x.material.depthWrite = b.fade > 0.95; } });
    }
  }
  for (const pt of S.portals.values()) for (const m of [pt.a, pt.b]) {
    m.ring.rotation.z = t * 1.5; m.disc.material.opacity = 0.45 + 0.15 * Math.sin(t * 4);
    m.g.rotation.y = Math.atan2(camera.position.x - m.g.position.x, camera.position.z - m.g.position.z);
    if (Math.abs(m.g.position.x - me.x) < 40 && Math.abs(m.g.position.z - me.z) < 40 && Math.random() < 0.5) parts.emit(m.g.position.x + (Math.random() - 0.5) * 1.6, 0.3, m.g.position.z + (Math.random() - 0.5) * 0.6, { n: 1, color: 0x7ab8ff, color2: 0xe0f0ff, speed: 0.2, life: [0.8, 1.4], size: [0.1, 0.18], vy: 2 });
  }
  if (WV.bossRing) WV.bossRing.material.opacity = 0.25 + 0.15 * Math.sin(t * 2);
  if (WV.bossRing2) { WV.bossRing2.material.opacity = 0.25 + 0.15 * Math.sin(t * 1.6); WV.bossRing2.rotation.z = t * 0.15; WV.bossRing3.rotation.z = -t * 0.25; }
  const r0 = performance.now();
  renderer.render(scene, camera);
  const r1 = performance.now();
  S.perf = S.perf || { js: 0, gl: 0, n: 0 };
  S.perf.js = S.perf.js * 0.9 + (r0 - nowMs) * 0.1; S.perf.gl = S.perf.gl * 0.9 + (r1 - r0) * 0.1; S.perf.n++;
}
function updateTargetFrame(e) {
  const tf = $('target');
  if (!e || e.dying) { tf.hidden = true; return; }
  tf.hidden = false;
  const nm = tf.querySelector('.nm'); nm.textContent = e.name; nm.className = 'nm' + (e.boss ? ' boss' : e.flags & 1 ? ' champ' : '');
  const f = e.hp / 1000; tf.querySelector('.bar i').style.width = `${(f * 100).toFixed(1)}%`;
  tf.querySelector('.bar span').textContent = e.boss && e.bhp != null ? `${e.bhp} / ${e.bmhp}` : `${Math.ceil(f * 100)}%`;
  const lv = S.inv?.lvl || 1; const diff = e.lvl - lv;
  const col = diff >= 3 ? '#ff5a4a' : diff >= 1 ? '#ffb04a' : diff <= -4 ? '#8a8a8a' : '#d8d0b8';
  tf.querySelector('.sub').innerHTML = `<span style="color:${col}">Level ${e.lvl}</span>${e.flags & 1 ? ' · Champion' : ''}${e.boss ? ' · ' + ({ boss: 'Lord of the Hollow Crypt', boss2: 'Heart of the Shattered Spire', gobking: 'King under Thornwood', bonelord: 'Mistress of the Catacombs', icelord: 'Heart of the Frozen Depths', ashmaw: 'Maw of the Molten Deep', prophet: 'Voice of the Sunken Temple' }[e.type] || 'Dungeon lord') : ''}${e.flags & 2 ? ' · Frozen' : ''}${e.flags & 4 ? ' · Stunned' : ''}${e.flags & 8 ? ' · <span style="color:#ff5a4a">Enraged</span>' : ''}`;
}
function placeLabel(el, x, y, z) {
  const s = project(x, y, z);
  if (!s || s.x < -100 || s.x > innerWidth + 100 || s.y < -50 || s.y > innerHeight + 50) { el.style.display = 'none'; return false; }
  el.style.display = ''; el.style.transform = `translate(-50%,-100%) translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; el.style.left = '0'; el.style.top = '0';
  return true;
}
function updateLabels(tgt) {
  const now = performance.now() / 1000;
  for (const e of S.monsters.values()) {
    if (e.dying) continue;
    const show = e === tgt || e.flags & 1 || (e.hp < 1000 && now - e.lastHurt < 6) || e.boss;
    if (!show || e.boss) { e.label.style.display = 'none'; continue; }
    if (placeLabel(e.label, e.x, (e.rig.h || 2) * e.rig.root.scale.y + 0.3, e.z)) e.hpBar.style.width = `${(e.hp / 10).toFixed(1)}%`;
  }
  for (const p of S.players.values()) {
    if (!p.label) continue;
    if (placeLabel(p.label, p.x, 2.7, p.z)) {
      const nm = p.label.querySelector('.nm'); if (nm.textContent !== p.name) { nm.textContent = p.name; nm.style.color = CLASSES[p.cls].color; }
      p.label.querySelector('.lv').textContent = p.lvl; p.label.querySelector('.hpb i').style.width = `${p.hp / 10}%`;
    }
  }
  for (const n of S.npcs) placeLabel(n.label, n.x, 2.45, n.z);
  for (const pt of S.portals.values()) {
    for (const [lab, x, z] of [[pt.la, pt.x, pt.z], [pt.lb, pt.tx, pt.tz]]) { if (Math.hypot(x - S.me.x, z - S.me.z) < 22) placeLabel(lab, x, 3.2, z); else lab.style.display = 'none'; }
  }
  if (S.hoverProp) { propLabel.textContent = PROPS[S.hoverProp.k].name; placeLabel(propLabel, S.hoverProp.x, 1.5, S.hoverProp.z); } else propLabel.style.display = 'none';
  for (const o of S.objs) {
    const near = Math.hypot(o.x - S.me.x, o.z - S.me.z) < 18 || S.hoverObj === o;
    if (!near) { o.label.style.display = 'none'; continue; }
    placeLabel(o.label, o.x, o.k === 'chest' ? 1.4 : 4.0, o.z);
    o.label.style.color = S.hoverObj === o ? '#fff' : '';
  }
  for (const l of S.loot.values()) if (l.label) placeLabel(l.label, l.x, 1.05, l.z);
}
let lastW = 0, lastH = 0;
function resize() {
  const w = innerWidth, h = innerHeight;
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  parts.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

// ================================================================ boot
buildLogin();
requestAnimationFrame(frame);
setTimeout(() => { buildMapImage(); }, 300);
window.__duskhold = { S, world, scene, camera, send: (m) => send(m), castSlot, findPath, get net() { return net; } };
