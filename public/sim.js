// DUSKHOLD — shared game simulation.
// Runs on the Node server (online play) and inside the browser (solo play).
// No dependencies. Everything that both sides must agree on lives here:
// the world layout, classes, monsters, items, quests and the rules of combat.

export const TICK = 1 / 20;
export const WORLD_R = 226;
export const TOWN_R = 22;
export const INNER_R = 145;   // the old realm; beyond it lie the outer lands
export const RING_R = 170;    // the ring road that links the outer towns
export const PLAYER_R = 0.5;
export const MAX_LEVEL = 20;
export const INV_SIZE = 24;
export const INV_MAX = 36;
export const STASH_SIZE = 30;
export const STASH_MAX = 54;
export const MAX_POTIONS = 20;
export const POTION_COST = 25;
export const VIEW_R = 62;

// ---------------------------------------------------------------- helpers
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const d2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, f = 0) => (typeof v === 'number' && isFinite(v) ? v : f);
export function xpNeed(l) { return Math.floor(100 * Math.pow(l, 1.55) * (l > 10 ? 1 + (l - 10) * 0.25 : 1)); }

// ---------------------------------------------------------------- zones
export const ZONES = {
  town:   { name: 'Duskhold', sub: 'Sanctuary', lv: null, safe: true },
  meadow: { name: 'Whispering Meadow', lv: [1, 3] },
  thorn:  { name: 'Thornwood', lv: [3, 6] },
  grave:  { name: 'Ashen Graveyard', lv: [6, 9] },
  crypt:  { name: 'Hollow Crypt', lv: [9, 10] },
  frost:  { name: 'Frostpeak', lv: [11, 13] },
  ember:  { name: 'Emberwaste', lv: [13, 15] },
  mire:   { name: 'Drowned Marsh', lv: [15, 17] },
  spire:  { name: 'Shattered Spire', lv: [17, 20] },
  frosthaven:  { name: 'Frosthaven', sub: 'Town of the high passes', lv: null, safe: true },
  cinderwatch: { name: 'Cinderwatch', sub: 'Town at the edge of the fire', lv: null, safe: true },
  mirebrook:   { name: 'Mirebrook', sub: 'Town on stilts', lv: null, safe: true },
};
// Winding roads leave the town gates toward each zone.
export function roadWiggle(t) { return Math.sin(t * 0.07) * 4 + Math.sin(t * 0.023 + 1) * 3; }
export const ROADS = [
  { ax: 1, az: 0, len: RING_R },   // east  -> Thornwood -> Cinderwatch
  { ax: 0, az: 1, len: RING_R },   // south -> Graveyard -> Mirebrook
  { ax: -1, az: 0, len: 104 },     // west  -> Crypt
  { ax: 0, az: -1, len: RING_R },  // north -> Meadow -> Frosthaven
];
const ringWiggle = (a) => Math.sin(a * 5) * 3;
// Every town: Duskhold in the middle, three outposts on the ring road.
export const TOWNS = [
  { id: 'town', name: 'Duskhold', x: 0, z: 0, r: TOWN_R, lvl: 1 },
  { id: 'frosthaven', name: 'Frosthaven', x: roadWiggle(RING_R), z: -RING_R, r: 15, lvl: 12 },
  { id: 'cinderwatch', name: 'Cinderwatch', x: RING_R, z: roadWiggle(RING_R), r: 15, lvl: 14 },
  { id: 'mirebrook', name: 'Mirebrook', x: roadWiggle(RING_R), z: RING_R, r: 15, lvl: 16 },
];
export const TOWN_BY_ID = Object.fromEntries(TOWNS.map((t) => [t.id, t]));
export const isSafe = (zone) => !!(ZONES[zone] && ZONES[zone].safe);
export function zoneAt(x, z) {
  for (const t of TOWNS) { const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz < t.r * t.r) return t.id; }
  const r = Math.hypot(x, z);
  const q = Math.round(Math.atan2(z, x) / (Math.PI / 2));
  if (r < INNER_R) return q === 0 ? 'thorn' : q === 1 ? 'grave' : q === -1 ? 'meadow' : 'crypt';
  return q === 0 ? 'ember' : q === 1 ? 'mire' : q === -1 ? 'frost' : 'spire';
}
export function zoneLevel(x, z) {
  const zn = zoneAt(x, z); const zd = ZONES[zn];
  if (!zd.lv) return 0;
  const r = Math.hypot(x, z);
  const t = r < INNER_R ? clamp((r - 30) / 90, 0, 1) : clamp((r - 150) / 70, 0, 1);
  return Math.round(zd.lv[0] + t * (zd.lv[1] - zd.lv[0]));
}
export function roadDist(x, z) {
  let best = 1e9;
  for (const r of ROADS) {
    const along = x * r.ax + z * r.az;
    if (along < TOWN_R - 3 || along > r.len) continue;
    const perp = r.ax !== 0 ? z : x;
    const dd = Math.abs(perp - roadWiggle(along));
    if (dd < best) best = dd;
  }
  const rr = Math.hypot(x, z);
  if (rr > RING_R - 12 && rr < RING_R + 12) best = Math.min(best, Math.abs(rr - RING_R - ringWiggle(Math.atan2(z, x))));
  return best;
}
export const BOSS_ARENA = { x: -118, z: 0, r: 14 };
export const BOSS_ARENA2 = { x: -200, z: 0, r: 15 };
export const ARENAS = [BOSS_ARENA, BOSS_ARENA2];

// ---------------------------------------------------------------- data: classes
export const CLASSES = {
  warrior: {
    name: 'Warrior', role: 'Melee · Tank', color: '#c4473a', blurb: 'Plate, steel and stubbornness. Wades into packs, holds their attention and shrugs off hits that would fold anyone else.',
    hp: 140, hpL: 24, res: 'Rage', resMax: 100, resL: 0, resRegen: 0, speed: 6.4, basicCd: 0.75, threat: 1.7,
    basic: { id: 'slash', name: 'Slash', kind: 'melee', range: 2.8, arc: 2.3, mult: 1.0, gain: 8, desc: 'Strike enemies in front of you. Builds Rage.' },
    ab: [
      { id: 'cleave', name: 'Cleave', lvl: 1, cost: 20, cd: 3, kind: 'melee', range: 3.6, arc: 3.4, mult: 1.7, desc: 'A wide sweep that hits every enemy in front of you.' },
      { id: 'charge', name: 'Charge', lvl: 3, cost: 0, gain: 15, cd: 8, kind: 'charge', dist: 12, r: 3, mult: 1.0, stun: 1.3, desc: 'Rush toward the cursor and stun enemies where you land.' },
      { id: 'warcry', name: 'War Cry', lvl: 5, cost: 0, gain: 25, cd: 20, kind: 'buff', r: 14, dur: 8, desc: 'You and nearby allies deal 25% more damage and take 20% less for 8 sec. Heals 15% health.' },
      { id: 'whirl', name: 'Whirlwind', lvl: 8, cost: 40, cd: 12, kind: 'whirl', dur: 3, r: 3.6, every: 0.25, mult: 0.55, desc: 'Spin for 3 sec, hitting everything around you. You can keep moving.' },
    ],
  },
  mage: {
    name: 'Mage', role: 'Ranged · Area damage', color: '#5b84e6', blurb: 'Fragile and terrifying. Fire for the crowd, frost for the ones that get too close, and a meteor for everything else.',
    hp: 95, hpL: 16, res: 'Mana', resMax: 120, resL: 8, resRegen: 7, speed: 6.1, basicCd: 0.8, threat: 1,
    basic: { id: 'bolt', name: 'Arcane Bolt', kind: 'proj', proj: 'bolt', speed: 24, range: 21, mult: 1.0, desc: 'Fire a bolt of arcane energy.' },
    ab: [
      { id: 'fireball', name: 'Fireball', lvl: 1, cost: 15, cd: 2.2, kind: 'proj', proj: 'fireball', speed: 20, range: 22, mult: 1.6, aoe: 3, desc: 'Hurl a fireball that explodes on impact, burning everything nearby.' },
      { id: 'nova', name: 'Frost Nova', lvl: 3, cost: 22, cd: 10, kind: 'nova', r: 6.5, mult: 0.8, freeze: 2.5, desc: 'A burst of frost that freezes nearby enemies for 2.5 sec.' },
      { id: 'blink', name: 'Blink', lvl: 5, cost: 12, cd: 6, kind: 'blink', dist: 11, desc: 'Teleport toward the cursor.' },
      { id: 'meteor', name: 'Meteor', lvl: 8, cost: 45, cd: 14, kind: 'meteor', range: 20, r: 4.6, delay: 1.1, mult: 4.2, desc: 'Call down a meteor on the target area after a short delay.' },
    ],
  },
  ranger: {
    name: 'Ranger', role: 'Ranged · Support', color: '#5aa35f', blurb: 'Quick on her feet and quicker with a bow. Keeps the party standing with the old healing songs of the wood.',
    hp: 110, hpL: 19, res: 'Focus', resMax: 100, resL: 0, resRegen: 12, speed: 6.7, basicCd: 0.62, threat: 1,
    basic: { id: 'shot', name: 'Quick Shot', kind: 'proj', proj: 'arrow', speed: 34, range: 23, mult: 1.0, desc: 'Loose a fast arrow.' },
    ab: [
      { id: 'multishot', name: 'Multishot', lvl: 1, cost: 25, cd: 2.5, kind: 'proj', proj: 'arrow', speed: 32, range: 19, mult: 0.75, count: 5, spread: 0.75, desc: 'Fire five arrows in a fan.' },
      { id: 'roll', name: 'Evasive Roll', lvl: 3, cost: 10, cd: 5, kind: 'roll', dist: 7.5, inv: 0.5, desc: 'Roll toward the cursor. Nothing can hit you mid-roll.' },
      { id: 'mend', name: "Nature's Mend", lvl: 5, cost: 30, cd: 16, kind: 'heal', r: 14, dur: 5, pct: 0.4, desc: 'You and nearby allies heal 40% of max health over 5 sec.' },
      { id: 'rain', name: 'Rain of Arrows', lvl: 8, cost: 45, cd: 12, kind: 'rain', range: 20, r: 5, waves: 6, every: 0.33, mult: 0.7, desc: 'Six waves of arrows pound the target area.' },
    ],
  },
};
export const CLASS_LIST = ['warrior', 'mage', 'ranger'];

// ---------------------------------------------------------------- data: monsters
export const MONSTERS = {
  wolf:     { name: 'Dusk Wolf', short: 'Wolf', hp: 34, dmg: 5, speed: 6.6, r: 0.7, range: 1.7, atkCd: 1.1, aggro: 10, xp: 1.0 },
  boar:     { name: 'Bristleback Boar', short: 'Boar', hp: 60, dmg: 7, speed: 5.3, r: 0.85, range: 1.9, atkCd: 1.4, aggro: 8, xp: 1.2 },
  goblin:   { name: 'Goblin Cutter', short: 'Cutter', hp: 52, dmg: 8, speed: 5.7, r: 0.6, range: 1.7, atkCd: 1.0, aggro: 10, xp: 1.1 },
  shaman:   { name: 'Goblin Firecaller', short: 'Firecaller', hp: 40, dmg: 9, speed: 5, r: 0.6, range: 9.5, ranged: true, proj: 'fire', pspeed: 13, atkCd: 2.0, aggro: 12, xp: 1.3 },
  spider:   { name: 'Thornwood Spider', short: 'Spider', hp: 72, dmg: 10, speed: 6.1, r: 0.95, range: 1.9, atkCd: 1.2, aggro: 9, xp: 1.35 },
  skeleton: { name: 'Risen Skeleton', short: 'Skeleton', hp: 80, dmg: 11, speed: 5, r: 0.6, range: 1.8, atkCd: 1.2, aggro: 10, xp: 1.3 },
  archer:   { name: 'Skeleton Archer', short: 'Archer', hp: 56, dmg: 11, speed: 4.8, r: 0.6, range: 11, ranged: true, proj: 'arrow_m', pspeed: 19, atkCd: 2.1, aggro: 13, xp: 1.4 },
  ghoul:    { name: 'Grave Ghoul', short: 'Ghoul', hp: 95, dmg: 12, speed: 6.4, r: 0.7, range: 1.8, atkCd: 1.0, aggro: 10, xp: 1.5 },
  guard:    { name: 'Bone Warden', short: 'Warden', hp: 150, dmg: 15, speed: 5, r: 0.85, range: 2.1, atkCd: 1.5, aggro: 11, xp: 2.2 },
  boss:     { name: 'Morvath, the Hollow King', short: 'Morvath', hp: 14000, dmg: 42, speed: 4.7, r: 1.7, range: 3.4, atkCd: 1.8, aggro: 15, xp: 32, boss: true, minions: ['skeleton', 'archer'] },
  // the outer lands
  frostwolf:  { name: 'Rime Wolf', short: 'Rime Wolf', hp: 70, dmg: 13, speed: 6.8, r: 0.75, range: 1.8, atkCd: 1.0, aggro: 10, xp: 1.3 },
  yeti:       { name: 'Pale Giant', short: 'Giant', hp: 160, dmg: 20, speed: 5.2, r: 1.1, range: 2.4, atkCd: 1.6, aggro: 9, xp: 2.0 },
  wraith:     { name: 'Ice Wraith', short: 'Wraith', hp: 70, dmg: 16, speed: 5, r: 0.6, range: 11, ranged: true, proj: 'frost', pspeed: 17, atkCd: 2.0, aggro: 13, xp: 1.5 },
  imp:        { name: 'Cinder Imp', short: 'Imp', hp: 60, dmg: 14, speed: 6, r: 0.55, range: 10, ranged: true, proj: 'fire', pspeed: 16, atkCd: 1.8, aggro: 12, xp: 1.4 },
  brute:      { name: 'Magma Brute', short: 'Brute', hp: 190, dmg: 23, speed: 4.6, r: 1.15, range: 2.5, atkCd: 1.7, aggro: 9, xp: 2.2 },
  hound:      { name: 'Ash Hound', short: 'Hound', hp: 90, dmg: 17, speed: 7, r: 0.8, range: 1.8, atkCd: 1.0, aggro: 11, xp: 1.5 },
  lurker:     { name: 'Bog Lurker', short: 'Lurker', hp: 130, dmg: 19, speed: 6, r: 0.8, range: 2, atkCd: 1.1, aggro: 10, xp: 1.7 },
  drowned:    { name: 'Drowned Sailor', short: 'Drowned', hp: 110, dmg: 18, speed: 5, r: 0.6, range: 1.8, atkCd: 1.2, aggro: 10, xp: 1.6 },
  horror:     { name: 'Marsh Horror', short: 'Horror', hp: 150, dmg: 20, speed: 6, r: 1.1, range: 2.1, atkCd: 1.3, aggro: 9, xp: 1.9 },
  voidknight: { name: 'Void Knight', short: 'Knight', hp: 200, dmg: 24, speed: 5, r: 0.9, range: 2.2, atkCd: 1.5, aggro: 11, xp: 2.3 },
  shade:      { name: 'Shard Shade', short: 'Shade', hp: 90, dmg: 20, speed: 5.2, r: 0.6, range: 11, ranged: true, proj: 'void', pspeed: 18, atkCd: 2.0, aggro: 13, xp: 1.8 },
  boss2:      { name: 'Nharzul, the Shardbound', short: 'Nharzul', hp: 110000, dmg: 110, speed: 4.9, r: 1.9, range: 3.6, atkCd: 1.7, aggro: 16, xp: 70, boss: true, minions: ['voidknight', 'shade'] },
};
export const MONSTER_LIST = Object.keys(MONSTERS);
const CHAMP_ADJ = ['Grim', 'Ashen', 'Dread', 'Feral', 'Gloom', 'Savage', 'Cursed', 'Rotting', 'Bloodsworn', 'Hollow'];
export const PROJ_KINDS = ['bolt', 'fireball', 'arrow', 'fire', 'arrow_m', 'bone', 'frost', 'void'];

// ---------------------------------------------------------------- data: items
export const SLOTS = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'];
export const SLOT_NAMES = { weapon: 'Weapon', helm: 'Head', chest: 'Chest', gloves: 'Hands', boots: 'Feet', ring: 'Ring', amulet: 'Neck' };
export const RARITY = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLORS = ['#ddd6c4', '#6f93ff', '#ffd651', '#bd7bff', '#ff8c26'];
const RMULT = [1, 1.15, 1.3, 1.45, 1.65];
const RVALUE = [1, 2.5, 5, 10, 20];
const WEAPON_BASES = {
  warrior: ['Rusty Sword', 'Broadsword', 'War Axe', 'Greatsword', 'Headsman Axe', 'Frostbrand Blade', 'Magma Cleaver', 'Shardsteel Greatblade'],
  mage: ['Gnarled Staff', 'Oak Staff', 'Runed Staff', 'Crystal Staff', 'Ember Rod', 'Rimeglass Staff', 'Cinder Scepter', 'Voidshard Staff'],
  ranger: ['Short Bow', 'Hunting Bow', 'Recurve Bow', 'Longbow', 'Wyrmhorn Bow', 'Icehorn Bow', 'Ashwood Greatbow', 'Starshard Bow'],
};
const ARMOR_BASES = {
  helm: ['Leather Cap', 'Iron Helm', 'Horned Helm', 'Warden Helm', 'Frostforged Helm', 'Obsidian Visage', 'Shardcrown'],
  chest: ['Padded Vest', 'Chain Shirt', 'Scale Hauberk', 'Plate Cuirass', 'Yeti-hide Coat', 'Magmaplate', 'Voidwoven Robe'],
  gloves: ['Cloth Wraps', 'Leather Gloves', 'Chain Gauntlets', 'Plate Gauntlets', 'Rime Grips', 'Cinder Fists', 'Shard Talons'],
  boots: ['Sandals', 'Leather Boots', 'Chain Boots', 'Plate Greaves', 'Snowstriders', 'Ashwalkers', 'Marsh Waders'],
  ring: ['Copper Ring', 'Silver Ring', 'Gold Ring', 'Obsidian Ring', 'Frost Opal Ring', 'Ember Garnet Ring', 'Void Pearl Ring'],
  amulet: ['Bone Charm', 'Silver Amulet', 'Jade Amulet', 'Star Amulet', 'Glacier Pendant', 'Phoenix Locket', 'Eye of the Spire'],
};
const SLOT_ARMOR = { helm: 1, chest: 1.5, gloves: 0.7, boots: 0.8 };
export const AFFIX = {
  power:     { label: '% damage', fmt: (v) => `+${v}% damage` },
  life:      { label: 'life', fmt: (v) => `+${v} life` },
  armor:     { label: 'armor', fmt: (v) => `+${v} armor` },
  crit:      { label: '% critical chance', fmt: (v) => `+${v}% critical chance` },
  speed:     { label: '% movement speed', fmt: (v) => `+${v}% movement speed` },
  lifesteal: { label: '% life steal', fmt: (v) => `${v}% of damage dealt heals you` },
  cdr:       { label: '% cooldown reduction', fmt: (v) => `-${v}% ability cooldowns` },
};
const PREFIX = { power: 'Brutal', life: 'Sturdy', armor: 'Reinforced', crit: 'Keen', speed: 'Swift', lifesteal: 'Vampiric', cdr: 'Focused' };
const SUFFIX = { power: 'of Might', life: 'of the Bear', armor: 'of Warding', crit: 'of Precision', speed: 'of the Fox', lifesteal: 'of Leeching', cdr: 'of Haste' };
const RA = ['Grim', 'Dusk', 'Ash', 'Blood', 'Storm', 'Raven', 'Bone', 'Gloom', 'Night', 'Ember', 'Frost', 'Doom', 'Wraith', 'Iron', 'Shadow', 'Thorn'];
const RB = ['fang', 'bite', 'song', 'ward', 'mark', 'heart', 'reaver', 'shroud', 'spire', 'grasp', 'call', 'veil', 'brand', 'howl', 'crest', 'coil'];
const LEGENDARY = {
  warrior: 'Dawnsplitter', mage: 'Embercall', ranger: 'Whisperwind',
  helm: 'Hollowcrown', chest: 'Duskforged Mantle', gloves: 'Gravegrip Gauntlets', boots: 'Mistrunner Boots',
  ring: 'Band of the Endless Night', amulet: 'Heart of Duskhold',
};
let itemSeq = Math.floor(Math.random() * 1e6) * 1000;
const AFFIX_CAP = { power: 70, life: 460, armor: 220, crit: 20, speed: 20, lifesteal: 9, cdr: 20 };

function rollAffix(k, ilvl, q) {
  switch (k) {
    case 'power': return Math.max(1, Math.round((2 + 0.9 * ilvl) * q));
    case 'life': return Math.max(2, Math.round((8 + 6 * ilvl) * q));
    case 'armor': return Math.max(1, Math.round((2 + 1.8 * ilvl) * q));
    case 'crit': return Math.max(0.5, Math.round((1.5 + 0.35 * ilvl) * q * 10) / 10);
    case 'speed': return Math.max(1, Math.round((3 + 0.5 * ilvl) * q));
    case 'lifesteal': return Math.max(0.5, Math.round((1 + 0.25 * ilvl) * q * 10) / 10);
    case 'cdr': return Math.max(1, Math.round((3 + 0.6 * ilvl) * q));
  }
  return 0;
}
export function makeItem(ilvl, rarity, slot, cls) {
  ilvl = clamp(Math.round(ilvl), 1, MAX_LEVEL);
  rarity = clamp(rarity | 0, 0, 4);
  if (!slot) slot = Math.random() < 0.22 ? 'weapon' : pick(SLOTS.slice(1));
  const it = { id: ++itemSeq, slot, r: rarity, il: ilvl, aff: {} };
  const tier = clamp(Math.floor((ilvl - 1) / 3), 0, 6);
  if (slot === 'weapon') {
    it.cls = cls;
    it.base = WEAPON_BASES[cls][clamp(tier + (rarity >= 3 ? 1 : 0), 0, 7)];
    const avg = (6 + 2.6 * ilvl) * RMULT[rarity] * rnd(0.9, 1.1);
    const sp = cls === 'warrior' ? 0.32 : cls === 'mage' ? 0.2 : 0.25;
    it.dmin = Math.max(1, Math.round(avg * (1 - sp)));
    it.dmax = Math.max(it.dmin + 1, Math.round(avg * (1 + sp)));
  } else {
    it.base = ARMOR_BASES[slot][tier];
    if (SLOT_ARMOR[slot]) it.armor = Math.max(1, Math.round((3 + 2.2 * ilvl) * SLOT_ARMOR[slot] * RMULT[rarity] * rnd(0.9, 1.1)));
  }
  const jewel = slot === 'ring' || slot === 'amulet';
  let n = [0, ri(1, 2), 3, 4, 5][rarity] + (jewel ? 1 : 0);
  const pool = ['power', 'life', 'armor', 'crit'];
  if (slot === 'boots' || jewel) pool.push('speed');
  if (rarity >= 2 && (slot === 'weapon' || slot === 'gloves' || jewel)) pool.push('lifesteal');
  if (rarity >= 2 && (slot === 'helm' || slot === 'gloves' || jewel)) pool.push('cdr');
  n = Math.min(n, pool.length);
  const qb = [1, 1, 1.05, 1.15, 1.35][rarity];
  for (let i = 0; i < n; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    it.aff[k] = Math.min(AFFIX_CAP[k], rollAffix(k, ilvl, rnd(0.55, 1) * qb));
  }
  const keys = Object.keys(it.aff);
  if (rarity === 0) it.name = it.base;
  else if (rarity === 1) {
    if (keys.length >= 2) it.name = `${PREFIX[keys[0]]} ${it.base} ${SUFFIX[keys[1]]}`;
    else it.name = Math.random() < 0.5 ? `${PREFIX[keys[0]]} ${it.base}` : `${it.base} ${SUFFIX[keys[0]]}`;
  } else if (rarity <= 3) it.name = pick(RA) + pick(RB);
  else it.name = LEGENDARY[slot === 'weapon' ? cls : slot];
  it.v = itemValue(it);
  return it;
}
export function itemValue(it) { return Math.round((5 + it.il * 4) * RVALUE[it.r] * (it.slot === 'weapon' ? 1.2 : 1)); }
function rollRarity(boost = 0) {
  const x = Math.random();
  let r = x < 0.012 ? 4 : x < 0.05 ? 3 : x < 0.18 ? 2 : x < 0.5 ? 1 : 0;
  return clamp(r + boost, 0, 4);
}

// ---------------------------------------------------------------- data: quests & NPCs
const at = (town, dx, dz) => ({ x: TOWN_BY_ID[town].x + dx, z: TOWN_BY_ID[town].z + dz, town });
export const NPCS = [
  { id: 'maren', name: 'Elder Maren', title: 'Keeper of the Watch', ...at('town', -6.5, -7), kind: 'elder', role: 'quest' },
  { id: 'borin', name: 'Borin Ashfold', title: 'Smith & Trader', ...at('town', 8.5, -7), kind: 'smith', role: 'shop' },
  { id: 'hilde', name: 'Warden Hilde', title: 'Captain of the Pass', ...at('frosthaven', -3.5, -3), kind: 'elder', look: 'frost', role: 'quest' },
  { id: 'ulfar', name: 'Ulfar Stonepelt', title: 'Furrier & Trader', ...at('frosthaven', 3.5, -3), kind: 'smith', look: 'frost', role: 'shop' },
  { id: 'tamsin', name: 'Forgewife Tamsin', title: 'Keeper of the Last Forge', ...at('cinderwatch', -3.5, -3), kind: 'elder', look: 'ember', role: 'quest' },
  { id: 'varek', name: 'Varek the Bright', title: 'Alchemist', ...at('cinderwatch', 3.5, -3), kind: 'smith', look: 'ember', role: 'shop' },
  { id: 'fenwick', name: 'Old Fenwick', title: 'Ferryman of the Marsh', ...at('mirebrook', -3.5, -3), kind: 'elder', look: 'mire', role: 'quest' },
  { id: 'yselle', name: 'Yselle Moonwater', title: 'Curio Dealer', ...at('mirebrook', 3.5, -3), kind: 'smith', look: 'mire', role: 'shop' },
];
export const NPC_BY_ID = Object.fromEntries(NPCS.map((n) => [n.id, n]));
export const QUESTS = [
  { id: 'q1', giver: 'maren', name: 'Wolves at the Gate', lvl: 1, zone: 'meadow', goal: { kill: ['wolf'], n: 6 }, reward: { xp: 150, gold: 30 },
    text: 'The dusk wolves have grown bold. They prowl the Whispering Meadow north of the gate and drag off anyone who strays from the road. Thin the pack, traveler.',
    done: 'Six fewer wolves. The shepherds will sleep tonight. Take this, and keep your blade close.' },
  { id: 'q2', giver: 'maren', name: 'Bristleback Menace', lvl: 2, zone: 'meadow', goal: { kill: ['boar'], n: 5 }, reward: { xp: 260, gold: 50, item: { slot: 'boots', r: 1 } },
    text: 'Boars as big as carts are tearing up the far end of the meadow. One of them gored a woodcutter last spring. Put down five of the brutes.',
    done: 'The fields are quiet again. Borin made these boots from the last hide that came through the gate. They are yours.' },
  { id: 'q3', giver: 'maren', name: 'Smoke over Thornwood', lvl: 3, zone: 'thorn', goal: { kill: ['goblin', 'shaman'], n: 8 }, reward: { xp: 520, gold: 80 },
    text: 'Goblin fires burn in Thornwood to the east. They raid our wagons and sell what they steal to worse things than themselves. Break their camps.',
    done: 'The smoke is thinning. Good work. Something deeper in the wood is still feeding their courage, though.' },
  { id: 'q4', giver: 'maren', name: 'Silk and Venom', lvl: 5, zone: 'thorn', goal: { kill: ['spider'], n: 5 }, reward: { xp: 800, gold: 100, item: { slot: 'weapon', r: 2 } },
    text: 'Deep in Thornwood the spiders nest in the old pines. Their venom is what the goblins tip their blades with. Slay five of them.',
    done: 'No more poison for goblin knives. I had this weapon set aside for whoever came back from that wood alive.' },
  { id: 'q5', giver: 'maren', name: 'The Restless Dead', lvl: 6, zone: 'grave', goal: { kill: ['skeleton', 'archer', 'ghoul'], n: 10 }, reward: { xp: 1300, gold: 150 },
    text: 'Something is waking the dead in the Ashen Graveyard to the south. The chapel bell rang last night with no hand on the rope. Lay ten of the risen back to rest.',
    done: 'They do not stay down long, do they? The bodies all crawled west before they fell. West, toward the crypt.' },
  { id: 'q6', giver: 'maren', name: 'Wardens of Bone', lvl: 8, zone: 'crypt', goal: { kill: ['guard'], n: 4 }, reward: { xp: 1800, gold: 200, item: { r: 2 } },
    text: 'The risen dead march west to the Hollow Crypt. Bone Wardens guard the road to whatever calls them. Break four of them.',
    done: 'The way is open. You know what waits at the end of it.' },
  { id: 'q7', giver: 'maren', name: 'The Hollow King', lvl: 9, zone: 'crypt', goal: { kill: ['boss'], n: 1 }, reward: { xp: 4000, gold: 500, item: { r: 3 } },
    text: 'Morvath. Once the lord of this keep, now a crown with nothing beneath it. He sits at the heart of the Hollow Crypt in the far west and calls the dead to him. End him. Bring friends.',
    done: 'The bells are silent. For the first time in years, I believe Duskhold will see a dawn. This was meant for a hero. It is yours.' },
  { id: 'bounty', giver: 'maren', prev: 'q7', name: 'Champion Bounty', lvl: 10, repeat: true, zone: null, goal: { champion: true, n: 3 }, reward: { xp: 2500, gold: 300, item: { r: 2 } },
    text: 'Champions still roam the wilds: beasts and dead things swollen with stolen power. You will know them by their glow. Slay three anywhere in the realm and I will pay well.',
    done: 'Three fewer horrors in the wild. Here is your pay. Come back when you want more work.' },
  // Frosthaven
  { id: 'f1', giver: 'hilde', name: 'Teeth in the Snow', lvl: 11, zone: 'frost', goal: { kill: ['frostwolf'], n: 10 }, reward: { xp: 3000, gold: 350 },
    text: 'You came over the ridge? Then you saw the rime wolves. They hunt the pass in packs of five and they are hungry this winter. Ten of them, and the caravans can move again.',
    done: 'The howling has died down. Good. Up here we pay our debts, so take this.' },
  { id: 'f2', giver: 'hilde', name: 'The Pale Giants', lvl: 12, zone: 'frost', goal: { kill: ['yeti'], n: 6 }, reward: { xp: 3600, gold: 420, item: { slot: 'chest', r: 2 } },
    text: 'The pale giants have come down from the peaks. They have never come this low before. Something up there frightened them, and now they frighten us. Bring down six.',
    done: 'Six giants. I would not have believed it if I had not seen the hides. Ulfar made this coat from one of them.' },
  { id: 'f3', giver: 'hilde', name: 'Breath of the Wraiths', lvl: 12, zone: 'frost', goal: { kill: ['wraith'], n: 8 }, reward: { xp: 4200, gold: 500, item: { r: 3 } },
    text: 'The ice wraiths are the cold made angry. Their breath freezes a man where he stands. Shatter eight of them, and take the road east to Cinderwatch when you are done. They need you more than we do.',
    done: 'The pass is clear. Go east, along the ring road. Tamsin keeps the forge at Cinderwatch. Tell her Hilde sent you.' },
  // Cinderwatch
  { id: 'e1', giver: 'tamsin', name: 'Imps in the Bellows', lvl: 13, zone: 'ember', goal: { kill: ['imp'], n: 10 }, reward: { xp: 4800, gold: 550 },
    text: 'Cinder imps. Little fire-thieves. They crawl in through the bellows and steal the heat from my forge. Ten of them, please, before I lose my temper and my forge both.',
    done: 'Quiet bellows. You have no idea how happy that makes an old smith.' },
  { id: 'e2', giver: 'tamsin', name: 'Hounds of Ash', lvl: 14, zone: 'ember', goal: { kill: ['hound'], n: 8 }, reward: { xp: 5400, gold: 620, item: { slot: 'weapon', r: 2 } },
    text: 'The ash hounds follow the imps like crows follow an army. They have taken two of my apprentices. Eight hounds. Make it quick.',
    done: 'For my apprentices. I forged this one with them in mind. Use it well.' },
  { id: 'e3', giver: 'tamsin', name: 'Stone That Burns', lvl: 14, zone: 'ember', goal: { kill: ['brute'], n: 6 }, reward: { xp: 6000, gold: 700, item: { r: 3 } },
    text: 'The magma brutes are what the mountain sends when it is angry. Break six of them. Then go south along the ring road to Mirebrook. Old Fenwick has been asking for someone like you.',
    done: 'The mountain is calmer. Go south to Mirebrook. Mind the water there. It remembers everyone who drowned in it.' },
  // Mirebrook
  { id: 'm1', giver: 'fenwick', name: 'What the Water Took', lvl: 15, zone: 'mire', goal: { kill: ['drowned'], n: 10 }, reward: { xp: 6600, gold: 800 },
    text: 'Forty years I have ferried folk across this marsh. Lately the drowned climb back into my boat. Put ten of them back where they belong.',
    done: 'They stay down now. Mostly. Here, for your trouble.' },
  { id: 'm2', giver: 'fenwick', name: 'Lurkers Below', lvl: 16, zone: 'mire', goal: { kill: ['lurker'], n: 8 }, reward: { xp: 7400, gold: 880, item: { slot: 'boots', r: 3 } },
    text: 'The bog lurkers wait under the moss until you step on them. Eight of them. Take these waders when you come back. You will need dry feet where you are going.',
    done: 'Good. Your feet are still attached. Take the waders, and keep them.' },
  { id: 'm3', giver: 'fenwick', name: 'The Horror of the Reeds', lvl: 16, zone: 'mire', goal: { kill: ['horror'], n: 5 }, reward: { xp: 8200, gold: 950, item: { r: 3 } },
    text: 'Something with too many legs nests in the deep reeds. Five of them. Do not go alone if you can help it.',
    done: 'You came back. Not everyone does. Now listen: west of here, the land breaks into crystal. That is where all of this starts.' },
  { id: 's1', giver: 'fenwick', name: 'Knights of the Void', lvl: 17, zone: 'spire', goal: { kill: ['voidknight', 'shade'], n: 12 }, reward: { xp: 9500, gold: 1100, item: { r: 3 } },
    text: 'In the Shattered Spire to the west, knights in black armor guard shards of a fallen star. They are not men any more. Twelve of them, knights or shades, and the way to the heart of the Spire is open.',
    done: 'The way is open. You know what waits at the end. I saw it once, from my boat, on a night with no moon.' },
  { id: 's2', giver: 'fenwick', name: 'The Shardbound', lvl: 18, zone: 'spire', goal: { kill: ['boss2'], n: 1 }, reward: { xp: 20000, gold: 3000, item: { r: 4 } },
    text: 'Nharzul. A star fell, and something climbed out of it, and wore the shards like a crown. It is the reason the dead walk and the mountains burn. End it. Take everyone you trust.',
    done: 'The stars look right again. I have kept this for whoever finished the job. I never thought it would be someone I had met.' },
];
// each quest unlocks after the giver's previous one
for (const g of new Set(QUESTS.map((q) => q.giver))) {
  let prev = null;
  for (const q of QUESTS) if (q.giver === g && !q.repeat) { if (!('prev' in q)) q.prev = prev; prev = q.id; }
}
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export function questState(pq, q) {
  if (pq.a && q.id in pq.a) return pq.a[q.id] >= q.goal.n ? 'ready' : 'active';
  if (!q.repeat && pq.d && pq.d.includes(q.id)) return 'done';
  if (q.prev && !pq.d.includes(q.prev)) return 'locked';
  return 'available';
}
// What a quest giver's head marker should show for this player.
export function npcMarker(pq, lvl, giver = 'maren') {
  let m = null;
  for (const q of QUESTS) {
    if (q.giver !== giver) continue;
    const s = questState(pq, q);
    if (s === 'ready') return 'ready';
    if (s === 'available') m = lvl >= q.lvl ? (m === 'avail' ? m : 'avail') : (m || 'low');
  }
  return m;
}

// ---------------------------------------------------------------- breakables
// Barrels, urns and the like lie all over the realm. Smash them for gold, potions and the odd item.
export const PROPS = {
  barrel: { name: 'Barrel', r: 0.55, respawn: 240 },
  crate:  { name: 'Crate', r: 0.55, respawn: 240 },
  urn:    { name: 'Urn', r: 0.45, respawn: 240 },
  bones:  { name: 'Pile of bones', r: 0.7, respawn: 240 },
  sarc:   { name: 'Sarcophagus', r: 0.9, respawn: 360 },
  trove:  { name: 'Treasure chest', r: 0.75, respawn: 600 },
};
export const PROP_KINDS = Object.keys(PROPS);
const ZONE_PROPS = {
  meadow: ['barrel', 'crate', 'crate'], thorn: ['crate', 'barrel', 'urn'], grave: ['urn', 'bones', 'sarc'], crypt: ['urn', 'bones', 'sarc', 'bones'],
  frost: ['crate', 'barrel', 'bones'], ember: ['urn', 'barrel', 'bones'], mire: ['barrel', 'crate', 'urn'], spire: ['urn', 'bones', 'sarc'],
};
const AMBUSH = { grave: 'skeleton', crypt: 'ghoul', spire: 'shade', frost: 'wraith', ember: 'imp', mire: 'drowned', meadow: 'wolf', thorn: 'goblin' };

// ---------------------------------------------------------------- shops
export const SHOP_PRICES = { potion: POTION_COST, bag: 800, stashup: 1200, fury: 250, stone: 250, mystic: 2500 };
export const SHOPS = {
  borin: { sell: ['potion', 'crate'] },
  ulfar: { sell: ['potion', 'crate', 'bag'], stock: { n: 4, r: 2, il: 12 } },
  varek: { sell: ['potion', 'fury', 'stone', 'stashup'], stock: { n: 3, r: 3, il: 14 } },
  yselle: { sell: ['potion', 'mystic'], stock: { n: 3, r: 3, il: 16, leg: true } },
};
export const SHOP_INFO = {
  potion: { name: 'Healing Potion', desc: 'Restores 45% of your life.' },
  crate: { name: 'Sealed crate', desc: 'A random magic or better item for your level. Pick the slot.' },
  mystic: { name: 'Mystic coffer', desc: 'Always epic, with a 30% chance of a legendary. Pick the slot.' },
  bag: { name: 'Bigger bags', desc: '+6 bag slots, for good. Up to 36 slots.' },
  stashup: { name: 'Bigger chest', desc: '+12 chest slots, for good. Up to 54 slots.' },
  fury: { name: 'Elixir of Fury', desc: '+25% damage for 5 minutes.' },
  stone: { name: 'Elixir of Stone', desc: '+40% armor for 5 minutes.' },
};

// ---------------------------------------------------------------- stats
export function computeStats(p) {
  const d = CLASSES[p.cls];
  const s = { dmin: 2, dmax: 4, armor: p.lvl * 2, power: 0, life: 0, crit: 5, speed: 0, lifesteal: 0, cdr: 0 };
  for (const slot of SLOTS) {
    const it = p.eq[slot];
    if (!it) continue;
    if (it.dmin) { s.dmin = it.dmin; s.dmax = it.dmax; }
    if (it.armor) s.armor += it.armor;
    for (const k in it.aff) s[k] += it.aff[k];
  }
  s.crit = Math.min(60, Math.round(s.crit * 10) / 10);
  s.cdr = Math.min(35, s.cdr);
  s.speed = Math.min(30, s.speed);
  s.lifesteal = Math.min(15, Math.round(s.lifesteal * 10) / 10);
  s.mhp = Math.round(d.hp + d.hpL * (p.lvl - 1) + s.life);
  s.mres = d.resMax + d.resL * (p.lvl - 1);
  s.move = d.speed * (1 + s.speed / 100);
  s.dr = Math.min(0.75, s.armor / (s.armor + 40 + 12 * p.lvl));
  const avg = (s.dmin + s.dmax) / 2 * (1 + s.power / 100) * (1 + 0.06 * (p.lvl - 1));
  s.dps = Math.round(avg * (1 + (s.crit / 100) * 0.75) / d.basicCd);
  return s;
}

// ---------------------------------------------------------------- world generation
class Grid {
  constructor(cell = 8) { this.c = cell; this.m = new Map(); this.q = 0; }
  key(ix, iz) { return ix * 100003 + iz; }
  add(o) {
    const br = o.box ? Math.hypot(o.hw, o.hd) : o.r;
    const c = this.c;
    for (let ix = Math.floor((o.x - br) / c); ix <= Math.floor((o.x + br) / c); ix++)
      for (let iz = Math.floor((o.z - br) / c); iz <= Math.floor((o.z + br) / c); iz++) {
        const k = this.key(ix, iz);
        let a = this.m.get(k); if (!a) this.m.set(k, (a = []));
        a.push(o);
      }
  }
  query(x, z, rad, out) {
    out.length = 0; const c = this.c; const qid = ++this.q;
    for (let ix = Math.floor((x - rad) / c); ix <= Math.floor((x + rad) / c); ix++)
      for (let iz = Math.floor((z - rad) / c); iz <= Math.floor((z + rad) / c); iz++) {
        const a = this.m.get(this.key(ix, iz)); if (!a) continue;
        for (const o of a) if (o._q !== qid) { o._q = qid; out.push(o); }
      }
    return out;
  }
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.obs = [];      // colliding + decorative objects that both sides know about
    this.camps = [];
    this.props = [];    // breakables: no collision, the game tracks which are broken
    this.grid = new Grid(8);
    this._tmp = [];
    this.generate();
  }
  addObs(o) { this.obs.push(o); if (o.c !== false) this.grid.add(o); return o; }
  free(x, z, r, gap = 0.4) {
    const a = this.grid.query(x, z, r + gap + 0.1, this._tmp);
    for (const o of a) {
      if (o.box) {
        const cx = clamp(x, o.x - o.hw, o.x + o.hw), cz = clamp(z, o.z - o.hd, o.z + o.hd);
        if (d2(x, z, cx, cz) < (r + gap) * (r + gap)) return false;
      } else if (d2(x, z, o.x, o.z) < (r + o.r + gap) * (r + o.r + gap)) return false;
    }
    return true;
  }
  generate() {
    const R = mulberry32(this.seed);
    const rr = (a, b) => a + R() * (b - a);
    // --- town
    this.addObs({ k: 'fountain', x: 0, z: 0, r: 2.4 });
    const houses = [
      { x: -12.5, z: -12, hw: 3.6, hd: 2.6, k: 'hall' },
      { x: 12.5, z: -12, hw: 3, hd: 3, k: 'forge' },
      { x: -12.5, z: 12, hw: 3, hd: 3, k: 'house' },
      { x: 12.5, z: 12.5, hw: 3.6, hd: 2.6, k: 'inn' },
    ];
    for (const h of houses) this.addObs({ ...h, box: true });
    this.addObs({ k: 'stall', x: -9.5, z: 3, box: true, hw: 1, hd: 1.6 });
    this.addObs({ k: 'stall', x: 9.5, z: 3, box: true, hw: 1, hd: 1.6 });
    this.addObs({ k: 'anvil', x: 8.6, z: -9.2, r: 0.6 });
    for (let a = 0; a < Math.PI * 2; a += 1.05 / 21) {
      const nearGate = Math.min(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) * 21 < 4.4;
      if (nearGate) continue;
      this.addObs({ k: 'post', x: Math.cos(a) * 21, z: Math.sin(a) * 21, r: 0.45, h: 2.6 + R() * 0.7 });
    }
    for (let g = 0; g < 4; g++) {
      const a = g * Math.PI / 2;
      for (const s of [-1, 1]) {
        const px = Math.cos(a) * 21 - Math.sin(a) * 5 * s, pz = Math.sin(a) * 21 + Math.cos(a) * 5 * s;
        this.addObs({ k: 'tower', x: px, z: pz, r: 1.1 });
        this.addObs({ k: 'torch', x: Math.cos(a) * 23 - Math.sin(a) * 3.2 * s, z: Math.sin(a) * 23 + Math.cos(a) * 3.2 * s, r: 0.2, c: false });
      }
    }
    for (const [x, z] of [[-3.5, -3.5], [3.5, 3.5], [3.5, -3.5], [-3.5, 3.5]]) this.addObs({ k: 'lamp', x, z, r: 0.25 });
    this.addObs({ k: 'chest', x: -6.5, z: 4.5, r: 0.75, town: 'town' });
    this.addObs({ k: 'waystone', x: 6.5, z: 4.5, r: 0.8, town: 'town' });
    // --- the three outpost towns on the ring road
    for (const t of TOWNS) {
      if (t.id === 'town') continue;
      const P = 13.5;
      for (let a = 0; a < Math.PI * 2; a += 1.05 / P) {
        if (Math.min(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) * P < 3.6) continue;
        this.addObs({ k: 'post', x: t.x + Math.cos(a) * P, z: t.z + Math.sin(a) * P, r: 0.45, h: 2.6 + R() * 0.7, town: t.id });
      }
      for (let g = 0; g < 4; g++) {
        const a = g * Math.PI / 2;
        for (const sg of [-1, 1]) this.addObs({ k: 'torch', x: t.x + Math.cos(a) * 15.5 - Math.sin(a) * 3 * sg, z: t.z + Math.sin(a) * 15.5 + Math.cos(a) * 3 * sg, r: 0.2, c: false });
      }
      for (const [hx, hz] of [[-6.6, -6.6], [6.6, -6.6], [-6.6, 6.6]]) this.addObs({ k: 'house', x: t.x + hx, z: t.z + hz, box: true, hw: 2.2, hd: 1.8, town: t.id });
      this.addObs({ k: 'waystone', x: t.x, z: t.z, r: 0.8, town: t.id });
      this.addObs({ k: 'chest', x: t.x + 4, z: t.z + 3.8, r: 0.75, town: t.id });
      this.addObs({ k: 'lamp', x: t.x - 3, z: t.z + 3, r: 0.25 });
    }

    // --- boss arena (west)
    const A = BOSS_ARENA;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(angDiff(a, 0)) < 0.5) continue; // entrance faces east, toward town
      this.addObs({ k: 'pillar', x: A.x + Math.cos(a) * A.r, z: A.z + Math.sin(a) * A.r, r: 1.0, h: 5 + R() * 3 });
    }
    for (const s of [-1, 1]) this.addObs({ k: 'brazier', x: A.x + 10, z: A.z + 4.5 * s, r: 0.6 });
    this.addObs({ k: 'throne', x: A.x - 9.5, z: A.z, box: true, hw: 1.4, hd: 2.2 });
    // --- the Shardbound's arena (far west, outer lands)
    const A2 = BOSS_ARENA2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.abs(angDiff(a, 0)) < 0.45) continue;
      this.addObs({ k: 'crystal', x: A2.x + Math.cos(a) * A2.r, z: A2.z + Math.sin(a) * A2.r, r: 1.0, s: 1.6 + R() * 0.8, rot: R() * 6 });
    }
    for (const sg of [-1, 1]) this.addObs({ k: 'brazier', x: A2.x + 11, z: A2.z + 5 * sg, r: 0.6, tint: 'void' });
    // --- a ridge of rock separates the old realm from the outer lands; the roads pass through
    for (let a = 0; a < Math.PI * 2; a += 0.028) {
      const nearRoad = [-Math.PI / 2, 0, Math.PI / 2].some((ax) => Math.abs(angDiff(a, ax)) * 147 < 9);
      if (nearRoad) continue;
      const rad = 147 + rr(-1.5, 1.5), sc = rr(2.6, 4);
      this.addObs({ k: 'ridge', x: Math.cos(a) * rad, z: Math.sin(a) * rad, r: sc, s: sc, rot: R() * 6 });
    }

    // --- camps
    const campDefs = { meadow: 14, thorn: 14, grave: 14, crypt: 7, frost: 12, ember: 12, mire: 12, spire: 9 };
    const qAngle = { thorn: 0, grave: Math.PI / 2, crypt: Math.PI, meadow: -Math.PI / 2, ember: 0, mire: Math.PI / 2, spire: Math.PI, frost: -Math.PI / 2 };
    const OUTER = { frost: 1, ember: 1, mire: 1, spire: 1 };
    const nearTown = (x, z, gap) => TOWNS.some((t) => d2(x, z, t.x, t.z) < (t.r + gap) * (t.r + gap));
    const nearArena = (x, z, gap) => ARENAS.some((a) => d2(x, z, a.x, a.z) < (a.r + gap) * (a.r + gap));
    let campId = 0;
    for (const zn in campDefs) {
      let made = 0, tries = 0;
      while (made < campDefs[zn] && tries++ < 4000) {
        const a = qAngle[zn] + rr(-0.72, 0.72);
        const rad = OUTER[zn] ? rr(156, 218) : rr(34, zn === 'crypt' ? 96 : 126);
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (zoneAt(x, z) !== zn) continue;
        if (roadDist(x, z) < 6) continue;
        if (nearArena(x, z, 12) || nearTown(x, z, 14)) continue;
        if (this.camps.some((c) => d2(c.x, c.z, x, z) < 17 * 17)) continue;
        if (!this.free(x, z, 3)) continue;
        const lvl = zoneLevel(x, z);
        const camp = { id: campId++, x, z, zone: zn, lvl, mem: [] };
        const types = campTypes(zn, lvl, R);
        const n = types.length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + R();
          camp.mem.push({ type: types[i], lvl: clamp(lvl + (R() < 0.25 ? 1 : 0), 1, OUTER[zn] ? 20 : 10), ox: Math.cos(ang) * rr(1.5, 3.5), oz: Math.sin(ang) * rr(1.5, 3.5) });
        }
        if (zn === 'thorn' && types.includes('goblin')) {
          this.addObs({ k: 'tent', x: x + rr(-4, 4), z: z + rr(3, 5) * (R() < 0.5 ? -1 : 1), r: 1.6 });
          this.addObs({ k: 'campfire', x, z, r: 0.6, c: false });
        }
        if (zn === 'grave') this.addObs({ k: 'crypt', x: x + rr(-5, 5), z: z + (R() < 0.5 ? -5.5 : 5.5), box: true, hw: 1.8, hd: 1.4 });
        this.camps.push(camp);
        made++;
      }
    }
    // Bone Wardens on the crypt road + the boss
    const guards = [[-96, 6], [-96, -6], [-104, 0]];
    for (const [x, z] of guards) {
      this.camps.push({ id: campId++, x, z, zone: 'crypt', lvl: 10, mem: [{ type: 'guard', lvl: 10, ox: 0, oz: 0 }, { type: 'archer', lvl: 9, ox: rr(-3, 3), oz: rr(-3, 3) }] });
    }
    this.camps.push({ id: campId++, x: A.x - 3, z: A.z, zone: 'crypt', lvl: 10, boss: true, mem: [{ type: 'boss', lvl: 10, ox: 0, oz: 0 }] });
    for (const [x, z] of [[-180, 7], [-180, -7], [-186, 0]]) {
      this.camps.push({ id: campId++, x, z, zone: 'spire', lvl: 20, mem: [{ type: 'voidknight', lvl: 20, ox: 0, oz: 0 }, { type: 'shade', lvl: 19, ox: rr(-3, 3), oz: rr(-3, 3) }] });
    }
    this.camps.push({ id: campId++, x: A2.x - 3, z: A2.z, zone: 'spire', lvl: 20, boss: true, mem: [{ type: 'boss2', lvl: 20, ox: 0, oz: 0 }] });

    // --- scenery with collision
    const scatter = (zn, count, kinds, rmin = TOWN_R + 6, rmax = 136, campGap = 8, roadGap = 4.5) => {
      let made = 0, tries = 0;
      while (made < count && tries++ < count * 30) {
        const a = qAngle[zn] + rr(-0.79, 0.79);
        const rad = Math.sqrt(rr(rmin * rmin, rmax * rmax));
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (zoneAt(x, z) !== zn) continue;
        if (roadDist(x, z) < roadGap) continue;
        if (this.camps.some((c) => d2(c.x, c.z, x, z) < campGap * campGap)) continue;
        if (nearArena(x, z, 3) || nearTown(x, z, 4)) continue;
        if (rad > 140 && rad < 154) continue;
        const kd = kinds[Math.floor(R() * kinds.length)];
        const s = rr(kd.s[0], kd.s[1]);
        const r = kd.r * s;
        if (!this.free(x, z, r, 0.6)) continue;
        this.addObs({ k: kd.k, x, z, r, s, rot: R() * Math.PI * 2 });
        made++;
      }
    };
    scatter('meadow', 210, [{ k: 'oak', r: 0.7, s: [0.8, 1.4] }, { k: 'oak', r: 0.7, s: [0.9, 1.3] }, { k: 'oak', r: 0.7, s: [0.7, 1.1] }, { k: 'rock', r: 1.0, s: [0.6, 1.6] }]);
    scatter('thorn', 420, [{ k: 'pine', r: 0.6, s: [0.8, 1.5] }, { k: 'pine', r: 0.6, s: [1, 1.7] }, { k: 'pine', r: 0.6, s: [0.7, 1.2] }, { k: 'rock', r: 1.0, s: [0.6, 1.4] }]);
    scatter('grave', 230, [{ k: 'grave', r: 0.45, s: [0.8, 1.2] }, { k: 'grave', r: 0.45, s: [0.8, 1.2] }, { k: 'grave', r: 0.45, s: [0.9, 1.3] }, { k: 'deadtree', r: 0.5, s: [0.9, 1.6] }, { k: 'rock', r: 1, s: [0.6, 1.2] }], TOWN_R + 6, 136, 6, 3.5);
    scatter('crypt', 150, [{ k: 'ruin', r: 0.8, s: [0.8, 1.4] }, { k: 'rock', r: 1, s: [0.8, 1.8] }, { k: 'deadtree', r: 0.5, s: [1, 1.7] }]);
    const O = [152, 222];
    scatter('frost', 260, [{ k: 'snowpine', r: 0.6, s: [0.9, 1.6] }, { k: 'snowpine', r: 0.6, s: [0.8, 1.3] }, { k: 'icerock', r: 1.0, s: [0.7, 1.8] }], ...O);
    scatter('ember', 220, [{ k: 'ashtree', r: 0.5, s: [0.9, 1.7] }, { k: 'lavarock', r: 1.0, s: [0.7, 1.9] }, { k: 'lavarock', r: 1.0, s: [0.6, 1.2] }], ...O);
    scatter('mire', 260, [{ k: 'bogtree', r: 0.6, s: [0.9, 1.6] }, { k: 'reeds', r: 0.5, s: [0.8, 1.3] }, { k: 'reeds', r: 0.5, s: [0.8, 1.3] }, { k: 'rock', r: 1, s: [0.6, 1.2] }], ...O);
    scatter('spire', 200, [{ k: 'crystal', r: 0.7, s: [0.8, 2.0] }, { k: 'ruin', r: 0.8, s: [0.8, 1.4] }, { k: 'rock', r: 1, s: [0.8, 1.8] }], ...O);
    // mountains ring the realm
    for (let a = 0; a < Math.PI * 2; a += 0.03) {
      const rad = rr(229, 238);
      const s = rr(3.5, 7);
      this.addObs({ k: 'cliff', x: Math.cos(a) * rad, z: Math.sin(a) * rad, r: s, s, rot: R() * 6, c: false });
    }
    this.generateProps(R, nearTown, nearArena);
  }
  generateProps(R, nearTown, nearArena) {
    const rr = (a, b) => a + R() * (b - a);
    const ok = (x, z, r) => {
      const zn = zoneAt(x, z);
      if (!ZONE_PROPS[zn] || nearTown(x, z, 2) || nearArena(x, z, 1)) return null;
      if (Math.hypot(x, z) > WORLD_R - 6) return null;
      if (!this.free(x, z, r, 0.3)) return null;
      if (this.props.some((o) => d2(o.x, o.z, x, z) < (r + PROPS[o.k].r + 0.3) ** 2)) return null;
      return zn;
    };
    const add = (k, x, z) => {
      const zn = ok(x, z, PROPS[k].r); if (!zn) return false;
      this.props.push({ id: this.props.length, k, x, z, zone: zn, lvl: zoneLevel(x, z), rot: R() * Math.PI * 2 });
      return true;
    };
    // a few around every camp, and a guarded treasure chest in some of them
    for (const c of this.camps) {
      const kinds = ZONE_PROPS[c.zone]; if (!kinds) continue;
      const n = c.boss ? 0 : 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, d = rr(4.5, 7.5); add(kinds[Math.floor(R() * kinds.length)], c.x + Math.cos(a) * d, c.z + Math.sin(a) * d); }
      if (!c.boss && R() < 0.3) { const a = R() * Math.PI * 2; add('trove', c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2); }
    }
    // little piles along the roadsides
    for (let i = 0; i < 260; i++) {
      const a = R() * Math.PI * 2, rad = rr(TOWN_R + 6, WORLD_R - 10);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const zn = zoneAt(x, z); const kinds = ZONE_PROPS[zn]; if (!kinds) continue;
      const rd = roadDist(x, z);
      if (rd < 4 || rd > 7) continue;
      const n = 1 + Math.floor(R() * 3), k = kinds[Math.floor(R() * kinds.length)];
      for (let j = 0; j < n; j++) add(k === 'sarc' ? 'urn' : k, x + rr(-1.4, 1.4), z + rr(-1.4, 1.4));
    }
    // and scattered through the wilds
    for (let i = 0; i < 520; i++) {
      // the outer lands are bigger, so they get more of the tries
      const a = R() * Math.PI * 2, rad = R() < 0.4 ? rr(TOWN_R + 8, INNER_R - 6) : rr(INNER_R + 8, WORLD_R - 8);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const zn = zoneAt(x, z); const kinds = ZONE_PROPS[zn]; if (!kinds) continue;
      if (roadDist(x, z) < 4) continue;
      add(R() < 0.035 ? 'trove' : kinds[Math.floor(R() * kinds.length)], x, z);
    }
  }
  // Push a circle of radius rad out of every obstacle. Returns [x, z].
  resolve(x, z, rad) {
    for (let it = 0; it < 2; it++) {
      const a = this.grid.query(x, z, rad + 0.1, this._tmp);
      for (const o of a) {
        if (o.box) {
          const cx = clamp(x, o.x - o.hw, o.x + o.hw), cz = clamp(z, o.z - o.hd, o.z + o.hd);
          const dx = x - cx, dz = z - cz, dd = dx * dx + dz * dz;
          if (dd < rad * rad) {
            if (dd > 1e-8) { const d = Math.sqrt(dd); x += (dx / d) * (rad - d); z += (dz / d) * (rad - d); }
            else {
              const px = o.hw - Math.abs(x - o.x), pz = o.hd - Math.abs(z - o.z);
              if (px < pz) x = o.x + Math.sign(x - o.x || 1) * (o.hw + rad); else z = o.z + Math.sign(z - o.z || 1) * (o.hd + rad);
            }
          }
        } else {
          const dx = x - o.x, dz = z - o.z, m = rad + o.r, dd = dx * dx + dz * dz;
          if (dd < m * m) {
            if (dd > 1e-8) { const d = Math.sqrt(dd); x = o.x + (dx / d) * m; z = o.z + (dz / d) * m; }
            else x = o.x + m;
          }
        }
      }
      const r = Math.hypot(x, z);
      if (r > WORLD_R) { x *= WORLD_R / r; z *= WORLD_R / r; }
    }
    return [x, z];
  }
  // Where a dash/blink from (x,z) toward (tx,tz) ends up. fixed=true: always the full distance.
  dashDest(x, z, tx, tz, maxDist, fixed = false) {
    let dx = tx - x, dz = tz - z; const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const dist = fixed ? maxDist : Math.min(maxDist, len);
    let cx = x, cz = z;
    const steps = Math.max(1, Math.ceil(dist / 0.4));
    for (let i = 1; i <= steps; i++) {
      const nx = x + dx * (dist * i / steps), nz = z + dz * (dist * i / steps);
      const [rx, rz] = this.resolve(nx, nz, PLAYER_R);
      if (d2(rx, rz, nx, nz) > 0.09) break;
      cx = rx; cz = rz;
    }
    return [cx, cz];
  }
}
function campTypes(zn, lvl, R) {
  const n = 3 + Math.floor(R() * 2.2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = R();
    if (zn === 'meadow') out.push(lvl <= 1 ? 'wolf' : lvl === 2 ? (x < 0.6 ? 'wolf' : 'boar') : (x < 0.75 ? 'boar' : 'wolf'));
    else if (zn === 'thorn') out.push(lvl <= 4 ? (x < 0.65 ? 'goblin' : 'shaman') : lvl === 5 ? (x < 0.5 ? 'spider' : x < 0.8 ? 'goblin' : 'shaman') : (x < 0.7 ? 'spider' : 'shaman'));
    else if (zn === 'grave') out.push(lvl <= 7 ? (x < 0.6 ? 'skeleton' : 'archer') : (x < 0.5 ? 'ghoul' : x < 0.8 ? 'skeleton' : 'archer'));
    else if (zn === 'crypt') out.push(x < 0.4 ? 'ghoul' : x < 0.7 ? 'archer' : 'skeleton');
    else if (zn === 'frost') out.push(lvl <= 11 ? (x < 0.7 ? 'frostwolf' : 'wraith') : lvl === 12 ? (x < 0.4 ? 'frostwolf' : x < 0.7 ? 'yeti' : 'wraith') : (x < 0.5 ? 'yeti' : 'wraith'));
    else if (zn === 'ember') out.push(lvl <= 13 ? (x < 0.6 ? 'imp' : 'hound') : lvl === 14 ? (x < 0.35 ? 'imp' : x < 0.7 ? 'hound' : 'brute') : (x < 0.5 ? 'brute' : x < 0.75 ? 'hound' : 'imp'));
    else if (zn === 'mire') out.push(lvl <= 15 ? (x < 0.7 ? 'drowned' : 'lurker') : lvl === 16 ? (x < 0.4 ? 'lurker' : x < 0.7 ? 'drowned' : 'horror') : (x < 0.5 ? 'horror' : 'lurker'));
    else out.push(x < 0.55 ? 'voidknight' : 'shade');
  }
  // goblin camps always have at least one cutter so they get a tent
  if (zn === 'thorn' && lvl <= 4 && !out.includes('goblin')) out[0] = 'goblin';
  return out;
}

// ---------------------------------------------------------------- saves
function sanitizeItem(it, cls) {
  if (!it || typeof it !== 'object' || !SLOTS.includes(it.slot)) return null;
  const o = { id: ++itemSeq, slot: it.slot, r: clamp(num(it.r) | 0, 0, 4), il: clamp(num(it.il, 1) | 0, 1, MAX_LEVEL), aff: {} };
  o.base = String(it.base || 'Item').slice(0, 40);
  o.name = String(it.name || o.base).slice(0, 48);
  if (o.slot === 'weapon') {
    o.cls = CLASS_LIST.includes(it.cls) ? it.cls : cls;
    o.dmin = clamp(num(it.dmin, 2), 1, 240); o.dmax = clamp(num(it.dmax, 4), o.dmin + 1, 400);
  }
  if (it.armor) o.armor = clamp(num(it.armor), 0, 300);
  if (it.aff && typeof it.aff === 'object') for (const k in AFFIX) if (k in it.aff) o.aff[k] = clamp(num(it.aff[k]), 0, AFFIX_CAP[k]);
  o.v = itemValue(o);
  return o;
}
export function sanitizeSave(b, cls) {
  if (!b || typeof b !== 'object' || b.cls !== cls) return null;
  const lvl = clamp(num(b.lvl, 1) | 0, 1, MAX_LEVEL);
  const out = { lvl, xp: clamp(num(b.xp) | 0, 0, xpNeed(lvl) - 1), gold: clamp(num(b.gold) | 0, 0, 1e8), pots: clamp(num(b.pots, 3) | 0, 0, MAX_POTIONS), inv: [], stash: [], eq: {}, q: { a: {}, d: [] }, wp: ['town'], home: 'town' };
  const bag = clamp(Array.isArray(b.inv) ? b.inv.length : INV_SIZE, INV_SIZE, INV_MAX);
  for (let i = 0; i < bag; i++) out.inv.push(Array.isArray(b.inv) ? sanitizeItem(b.inv[i], cls) : null);
  const st = clamp(Array.isArray(b.stash) ? b.stash.length : STASH_SIZE, STASH_SIZE, STASH_MAX);
  for (let i = 0; i < st; i++) out.stash.push(Array.isArray(b.stash) ? sanitizeItem(b.stash[i], cls) : null);
  if (Array.isArray(b.wp)) for (const id of b.wp) if (TOWN_BY_ID[id] && !out.wp.includes(id)) out.wp.push(id);
  if (TOWN_BY_ID[b.home] && out.wp.includes(b.home)) out.home = b.home;
  if (b.eq && typeof b.eq === 'object') for (const s of SLOTS) { const it = sanitizeItem(b.eq[s], cls); if (it && it.slot === s && (s !== 'weapon' || it.cls === cls)) out.eq[s] = it; }
  if (b.q && typeof b.q === 'object') {
    if (Array.isArray(b.q.d)) out.q.d = b.q.d.filter((id) => QUEST_BY_ID[id] && !QUEST_BY_ID[id].repeat);
    if (b.q.a && typeof b.q.a === 'object') for (const id in b.q.a) if (QUEST_BY_ID[id]) out.q.a[id] = clamp(num(b.q.a[id]) | 0, 0, QUEST_BY_ID[id].goal.n);
  }
  return out;
}

// ---------------------------------------------------------------- the game
export class Game {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 20261002;
    this.world = new World(this.seed);
    this.send = opts.send || (() => {});
    this.persist = opts.persist || (() => {});
    this.now = 0; this.tickN = 0; this.nextId = 1;
    this.players = new Map();
    this.monsters = [];
    this.projs = [];
    this.loot = new Map();
    this.stock = {};
    this.broken = new Map(); // prop id -> time it comes back
    this.propsDirty = false;
    this.timers = [];
    this.events = [];
    this.rosterDirty = true;
    for (const c of this.world.camps) for (const mem of c.mem) this.spawnMonster(mem.type, mem.lvl, c.x + mem.ox, c.z + mem.oz, c);
  }

  // ---------- plumbing
  ev(x, z, o) { this.events.push({ x, z, o }); }
  to(pid, msg) { this.send(pid, msg); }
  note(p, text, kind = 'info') { this.to(p.id, { t: 'n', m: text, k: kind }); }
  sys(text) { for (const p of this.players.values()) this.to(p.id, { t: 'c', sys: 1, m: text }); }
  after(sec, fn) { this.timers.push({ at: this.now + sec, fn }); }

  // ---------- players
  addPlayer({ name, cls, save }) {
    if (!CLASS_LIST.includes(cls)) cls = 'warrior';
    name = String(name || '').replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 16) || 'Wanderer';
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let nm = name, k = 2; while (taken.has(nm.toLowerCase())) nm = `${name.slice(0, 14)}${k++}`;
    const s = sanitizeSave(save, cls);
    const p = {
      id: this.nextId++, name: nm, cls, lvl: 1, xp: 0, gold: 0, pots: 3,
      inv: new Array(INV_SIZE).fill(null), stash: new Array(STASH_SIZE).fill(null), eq: {}, q: { a: {}, d: [] }, wp: ['town'], home: 'town',
      x: rnd(-2, 2), z: 4 + rnd(-1, 1), rot: Math.PI, alive: true, deadAt: 0, hp: 1, res: 0,
      cds: [0, 0, 0, 0, 0, 0], lastHurt: -99, lastCombat: -99, lastPosT: this.now, grace: 0, graceUntil: 0,
      invUntil: 0, stunUntil: 0, whirlUntil: 0, whirlNext: 0, buffs: {}, lootDirty: true, invDirty: true, zone: 'town', lastCorr: 0,
    };
    if (s) Object.assign(p, s);
    else {
      const w = { warrior: 'Rusty Sword', mage: 'Gnarled Staff', ranger: 'Short Bow' }[cls];
      const it = makeItem(1, 0, 'weapon', cls); it.base = it.name = w; it.v = itemValue(it);
      p.eq.weapon = it;
      const ch = makeItem(1, 0, 'chest', cls); p.eq.chest = ch;
    }
    if (p.home !== 'town') { const t = TOWN_BY_ID[p.home]; p.x = t.x + rnd(-2, 2); p.z = t.z + 3 + rnd(-0.5, 0.5); }
    p.zone = zoneAt(p.x, p.z);
    p.st = computeStats(p);
    p.hp = p.st.mhp; p.res = cls === 'warrior' ? 0 : p.st.mres;
    this.players.set(p.id, p);
    this.rosterDirty = true;
    this.to(p.id, { t: 'welcome', id: p.id, seed: this.seed, name: p.name, cls, x: p.x, z: p.z });
    this.to(p.id, { t: 'props', b: [...this.broken.keys()] });
    this.sendInv(p);
    this.sys(`${p.name} the ${CLASSES[cls].name} has entered Duskhold.`);
    return p.id;
  }
  removePlayer(pid) {
    const p = this.players.get(pid); if (!p) return;
    this.persist(pid, this.saveOf(p));
    this.players.delete(pid);
    for (const [id, l] of this.loot) if (l.o === pid) this.loot.delete(id);
    for (const m of this.monsters) m.threat.delete(pid);
    this.rosterDirty = true;
    this.sys(`${p.name} has left.`);
  }
  saveOf(p) { return { name: p.name, cls: p.cls, lvl: p.lvl, xp: p.xp, gold: p.gold, pots: p.pots, inv: p.inv, stash: p.stash, eq: p.eq, q: p.q, wp: p.wp, home: p.home }; }
  sendInv(p) {
    p.st = computeStats(p);
    p.hp = Math.min(p.hp, p.st.mhp); p.res = Math.min(p.res, p.st.mres);
    this.to(p.id, { t: 'inv', lvl: p.lvl, xp: p.xp, need: xpNeed(p.lvl), gold: p.gold, pots: p.pots, inv: p.inv, stash: p.stash, eq: p.eq, q: p.q, st: p.st, wp: p.wp, home: p.home });
  }

  // ---------- messages from clients
  handle(pid, m) {
    const p = this.players.get(pid);
    if (!p || !m || typeof m !== 'object') return;
    switch (m.t) {
      case 'pos': return this.onPos(p, m);
      case 'cast': return this.cast(p, clamp(num(m.s) | 0, 0, 4), m);
      case 'pot': return this.drinkPotion(p);
      case 'pick': return this.pickUp(p, m.id);
      case 'equip': return this.equip(p, num(m.i, -1) | 0);
      case 'unequip': return this.unequip(p, m.s);
      case 'sell': return this.sell(p, num(m.i, -1) | 0, false);
      case 'discard': return this.sell(p, num(m.i, -1) | 0, true);
      case 'buy': return this.buy(p, m.w, m.s, m.n, m.o);
      case 'shop': { if (SHOPS[m.n] && this.nearNpc(p, m.n)) this.to(p.id, this.shopFor(p, m.n)); return; }
      case 'stash': return this.stashMove(p, m.a, num(m.i, -1) | 0);
      case 'travel': return this.travel(p, m.to);
      case 'smash': return this.smashProp(p, num(m.id, -1) | 0);
      case 'quest': return this.questAction(p, m.a, m.q);
      case 'chat': {
        const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160);
        if (!text) return;
        for (const o of this.players.values()) this.to(o.id, { t: 'c', n: p.name, c: p.cls, m: text });
        return;
      }
    }
  }
  onPos(p, m) {
    if (!p.alive) return;
    const x = num(m.x, p.x), z = num(m.z, p.z);
    const dt = clamp(this.now - p.lastPosT, 0.05, 0.6);
    if (this.now > p.graceUntil) p.grace = 0;
    const allowed = p.st.move * dt * 1.4 + 0.7 + p.grace;
    const dd = Math.hypot(x - p.x, z - p.z);
    p.lastPosT = this.now;
    if (dd > allowed) {
      if (this.now - p.lastCorr > 0.25) { p.lastCorr = this.now; this.to(p.id, { t: 'setpos', x: p.x, z: p.z }); }
      return;
    }
    const [rx, rz] = this.world.resolve(x, z, PLAYER_R * 0.8);
    p.x = rx; p.z = rz; p.rot = num(m.r, p.rot);
  }
  drinkPotion(p) {
    if (!p.alive || p.pots <= 0 || this.now < p.cds[5] - 0.05) return;
    p.pots--; p.cds[5] = this.now + 6;
    this.heal(p, p.st.mhp * 0.45);
    this.ev(p.x, p.z, { e: 'fx', k: 'potion', i: p.id, x: p.x, z: p.z });
    this.sendInv(p);
  }
  heal(p, amt) {
    if (!p.alive) return;
    const before = p.hp; p.hp = Math.min(p.st.mhp, p.hp + amt);
    const v = Math.round(p.hp - before);
    if (v >= 1) this.ev(p.x, p.z, { e: 'heal', i: p.id, v });
  }

  // ---------- inventory & trade
  freeSlot(p) { return p.inv.indexOf(null); }
  pickUp(p, id) {
    const l = this.loot.get(num(id, -1));
    if (!l || l.o !== p.id || !p.alive) return;
    if (d2(p.x, p.z, l.x, l.z) > 4 * 4) return;
    if (l.item) {
      const i = this.freeSlot(p);
      if (i < 0) return this.note(p, 'Your bags are full. Sell or discard something first.', 'warn');
      p.inv[i] = l.item;
      this.to(p.id, { t: 'got', it: l.item });
      this.sendInv(p);
    }
    this.loot.delete(l.id); p.lootDirty = true;
  }
  equip(p, i) {
    const it = p.inv[i]; if (!it) return;
    if (it.slot === 'weapon' && it.cls !== p.cls) return this.note(p, `Only a ${CLASSES[it.cls].name} can wield that.`, 'warn');
    const old = p.eq[it.slot] || null;
    p.eq[it.slot] = it; p.inv[i] = old;
    this.sendInv(p);
    this.ev(p.x, p.z, { e: 'equip', i: p.id });
  }
  unequip(p, slot) {
    if (!SLOTS.includes(slot) || !p.eq[slot]) return;
    const i = this.freeSlot(p); if (i < 0) return this.note(p, 'Your bags are full.', 'warn');
    p.inv[i] = p.eq[slot]; delete p.eq[slot];
    this.sendInv(p);
  }
  nearNpc(p, id, r = 9) { const n = NPC_BY_ID[id]; return n && d2(p.x, p.z, n.x, n.z) < r * r; }
  nearShop(p) { return NPCS.some((n) => n.role === 'shop' && d2(p.x, p.z, n.x, n.z) < 81); }
  nearObj(p, kind, r = 6) { return this.world.obs.find((o) => o.k === kind && d2(p.x, p.z, o.x, o.z) < r * r); }
  sell(p, i, discard) {
    const it = p.inv[i]; if (!it) return;
    if (!discard && !this.nearShop(p)) return this.note(p, 'Find a trader in town to sell.', 'warn');
    const gold = discard ? Math.max(1, Math.round(it.v * 0.2)) : it.v;
    p.inv[i] = null; p.gold += gold;
    this.to(p.id, { t: 'sold', g: gold, n: it.name, r: it.r, d: discard ? 1 : 0 });
    this.sendInv(p);
  }
  // ---------- breakables
  smashProp(p, id, fromHit = false) {
    const pr = this.world.props[id];
    if (!pr || !p.alive || this.broken.has(id)) return;
    if (!fromHit && d2(p.x, p.z, pr.x, pr.z) > 3.4 * 3.4) return;
    const def = PROPS[pr.k];
    this.broken.set(id, this.now + def.respawn * rnd(0.85, 1.15));
    this.propsDirty = true;
    this.ev(pr.x, pr.z, { e: 'fx', k: 'smash', x: r2(pr.x), z: r2(pr.z), pk: pr.k, i: id });
    const lvl = clamp(Math.min(pr.lvl, p.lvl + 2), 1, MAX_LEVEL);
    const gold = (mult) => Math.max(1, Math.round(lvl * rnd(1.5, 4) * mult));
    const item = (r) => this.addLoot(p, pr.x, pr.z, { item: makeItem(lvl, r, null, p.cls) });
    if (pr.k === 'trove') {
      item(Math.random() < 0.08 ? 4 : Math.random() < 0.3 ? 3 : 2);
      if (Math.random() < 0.5) item(rollRarity(1));
      this.addLoot(p, pr.x, pr.z, { gold: gold(12) });
      if (Math.random() < 0.6) this.addLoot(p, pr.x, pr.z, { pot: 1 });
      return;
    }
    const big = pr.k === 'sarc';
    if (Math.random() < (big ? 0.9 : 0.55)) this.addLoot(p, pr.x, pr.z, { gold: gold(big ? 3 : 1) });
    if (Math.random() < (big ? 0.2 : 0.1)) this.addLoot(p, pr.x, pr.z, { pot: 1 });
    if (Math.random() < (big ? 0.45 : 0.12)) item(rollRarity());
    // some coffins and bone piles were not empty
    if ((big && Math.random() < 0.35) || (pr.k === 'bones' && Math.random() < 0.12)) {
      const type = AMBUSH[pr.zone] || 'skeleton';
      const n = big ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const [x, z] = this.world.resolve(pr.x + Math.cos(a) * 1.6, pr.z + Math.sin(a) * 1.6, 0.6);
        const m = this.spawnMonster(type, pr.lvl, x, z, null, true); m.ambush = true;
        this.aggro(m, p, false);
      }
      this.ev(pr.x, pr.z, { e: 'fx', k: 'summon', x: r2(pr.x), z: r2(pr.z) });
      this.note(p, 'Something was waiting inside!', 'warn');
    }
  }
  // attacks and spells also smash what they hit
  smashIn(p, x, z, r, ang = null, arc = 0) {
    const props = this.world.props;
    for (let i = 0; i < props.length; i++) {
      const pr = props[i];
      if (Math.abs(pr.x - x) > r + 1 || Math.abs(pr.z - z) > r + 1 || this.broken.has(i)) continue;
      const dx = pr.x - x, dz = pr.z - z, dd = Math.hypot(dx, dz);
      if (dd > r + PROPS[pr.k].r) continue;
      if (ang !== null && dd > 1 && Math.abs(angDiff(Math.atan2(dx, dz), ang)) > arc / 2) continue;
      if (pr.k === 'trove') continue; // chests are opened by hand
      this.smashProp(p, i, true);
    }
  }
  stockOf(npcId) {
    const def = SHOPS[npcId].stock; if (!def) return null;
    let st = this.stock[npcId];
    if (!st || this.now >= st.until) {
      st = this.stock[npcId] = { until: this.now + 600, items: [], weapons: {} };
      const slots = SLOTS.slice(1);
      for (let i = 0; i < def.n; i++) {
        const r = def.leg && i === 0 ? 4 : def.r;
        st.items.push({ oid: `${npcId}-${i}`, it: makeItem(def.il, r, pick(slots), 'warrior') });
      }
      for (const c of CLASS_LIST) st.weapons[c] = { oid: `${npcId}-w-${c}`, it: makeItem(def.il, def.r, 'weapon', c) };
    }
    return st;
  }
  shopFor(p, npcId) {
    const def = SHOPS[npcId]; if (!def) return null;
    const offers = def.sell.map((k) => ({ k, price: k === 'crate' ? gambleCost(p.lvl) : SHOP_PRICES[k] }));
    const st = this.stockOf(npcId);
    if (st) for (const o of [...st.items, st.weapons[p.cls]]) offers.push({ k: 'item', o: o.oid, it: o.it, price: o.it.v * 4 });
    return { t: 'shop', n: npcId, offers, refresh: st ? Math.ceil(st.until - this.now) : 0 };
  }
  buy(p, what, slot, npcId, oid) {
    npcId = SHOPS[npcId] ? npcId : 'borin';
    if (!this.nearNpc(p, npcId)) return;
    const def = SHOPS[npcId];
    if (what !== 'item' && !def.sell.includes(what)) return;
    const pay = (cost) => { if (p.gold < cost) { this.note(p, 'Not enough gold.', 'warn'); return false; } p.gold -= cost; return true; };
    if (what === 'potion') {
      if (p.pots >= MAX_POTIONS) return this.note(p, `You can carry at most ${MAX_POTIONS} potions.`, 'warn');
      if (!pay(POTION_COST)) return;
      p.pots++;
      this.to(p.id, { t: 'bought', w: 'potion' });
    } else if (what === 'crate' || what === 'gamble' || what === 'mystic') {
      if (!SLOTS.includes(slot)) return;
      const i = this.freeSlot(p); if (i < 0) return this.note(p, 'Your bags are full.', 'warn');
      if (!pay(what === 'mystic' ? SHOP_PRICES.mystic : gambleCost(p.lvl))) return;
      const x = Math.random();
      const r = what === 'mystic' ? (x < 0.3 ? 4 : 3) : x < 0.03 ? 4 : x < 0.12 ? 3 : x < 0.4 ? 2 : 1;
      const it = makeItem(p.lvl, r, slot, p.cls);
      p.inv[i] = it;
      this.to(p.id, { t: 'got', it, gamble: 1 });
    } else if (what === 'bag') {
      if (p.inv.length >= INV_MAX) return this.note(p, 'Your bags cannot get any bigger.', 'warn');
      if (!pay(SHOP_PRICES.bag)) return;
      for (let k = 0; k < 6; k++) p.inv.push(null);
      this.note(p, `Your bags now hold ${p.inv.length} items.`);
      this.to(p.id, { t: 'bought', w: 'bag' });
    } else if (what === 'stashup') {
      if (p.stash.length >= STASH_MAX) return this.note(p, 'Your chest cannot get any bigger.', 'warn');
      if (!pay(SHOP_PRICES.stashup)) return;
      for (let k = 0; k < 12; k++) p.stash.push(null);
      this.note(p, `Your chest now holds ${p.stash.length} items.`);
      this.to(p.id, { t: 'bought', w: 'stashup' });
    } else if (what === 'fury' || what === 'stone') {
      if (!pay(SHOP_PRICES[what])) return;
      p.buffs[what] = this.now + 300;
      this.ev(p.x, p.z, { e: 'fx', k: 'potion', i: p.id, x: p.x, z: p.z });
      this.to(p.id, { t: 'bought', w: what });
    } else if (what === 'item') {
      const st = this.stockOf(npcId); if (!st) return;
      const o = [...st.items, st.weapons[p.cls]].find((x) => x.oid === oid);
      if (!o) return this.note(p, 'That item has already been replaced. Have another look.', 'warn');
      const i = this.freeSlot(p); if (i < 0) return this.note(p, 'Your bags are full.', 'warn');
      if (!pay(o.it.v * 4)) return;
      const it = { ...o.it, aff: { ...o.it.aff }, id: ++itemSeq };
      p.inv[i] = it;
      this.to(p.id, { t: 'got', it, gamble: 0, bought: 1 });
    }
    this.sendInv(p);
    this.to(p.id, this.shopFor(p, npcId));
  }
  stashMove(p, a, i) {
    if (!this.nearObj(p, 'chest')) return this.note(p, 'Stand next to a chest to use it.', 'warn');
    if (a === 'put') {
      const it = p.inv[i]; if (!it) return;
      const j = p.stash.indexOf(null); if (j < 0) return this.note(p, 'Your chest is full.', 'warn');
      p.stash[j] = it; p.inv[i] = null;
    } else if (a === 'take') {
      const it = p.stash[i]; if (!it) return;
      const j = this.freeSlot(p); if (j < 0) return this.note(p, 'Your bags are full.', 'warn');
      p.inv[j] = it; p.stash[i] = null;
    }
    this.sendInv(p);
  }
  travel(p, to) {
    const t = TOWN_BY_ID[to];
    if (!t || !p.alive || !p.wp.includes(to)) return;
    if (!this.nearObj(p, 'waystone')) return this.note(p, 'Stand next to a waystone to travel.', 'warn');
    this.ev(p.x, p.z, { e: 'fx', k: 'travel', i: p.id, x: p.x, z: p.z });
    const ws = this.world.obs.find((o) => o.k === 'waystone' && o.town === to);
    p.x = ws.x + rnd(-1.5, 1.5); p.z = ws.z + 2.5 + rnd(0, 1); p.grace = 9999; p.graceUntil = this.now + 1.5;
    this.to(p.id, { t: 'setpos', x: p.x, z: p.z, travel: 1 });
    this.ev(p.x, p.z, { e: 'fx', k: 'travel', i: p.id, x: p.x, z: p.z });
  }
  questAction(p, a, qid) {
    const q = QUEST_BY_ID[qid]; if (!q) return;
    if (!this.nearNpc(p, q.giver, 10)) return;
    const s = questState(p.q, q);
    if (a === 'accept' && s === 'available') {
      if (p.lvl < q.lvl) return this.note(p, `You need level ${q.lvl} for that quest.`, 'warn');
      p.q.a[q.id] = 0;
      this.to(p.id, { t: 'qa', q: q.id });
    } else if (a === 'turnin' && s === 'ready') {
      const rw = q.reward;
      if (rw.item) {
        const i = this.freeSlot(p);
        if (i < 0) return this.note(p, 'Make room in your bags for the reward first.', 'warn');
        const slot = rw.item.slot || (Math.random() < 0.35 ? 'weapon' : pick(SLOTS.slice(1)));
        const it = makeItem(Math.max(p.lvl, q.lvl), rw.item.r, slot, p.cls);
        p.inv[i] = it;
        this.to(p.id, { t: 'got', it, quest: 1 });
      }
      delete p.q.a[q.id];
      if (!q.repeat) p.q.d.push(q.id);
      p.gold += rw.gold;
      this.to(p.id, { t: 'qd', q: q.id, xp: rw.xp, g: rw.gold });
      this.giveXp(p, rw.xp);
      this.persist(p.id, this.saveOf(p));
    } else if (a === 'abandon' && (s === 'active' || s === 'ready')) {
      delete p.q.a[q.id];
    }
    this.sendInv(p);
  }

  // ---------- progression
  giveXp(p, amt) {
    if (p.lvl >= MAX_LEVEL) return;
    p.xp += Math.round(amt);
    let up = false;
    while (p.lvl < MAX_LEVEL && p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++; up = true;
      const ab = CLASSES[p.cls].ab.find((a) => a.lvl === p.lvl);
      this.to(p.id, { t: 'lvl', l: p.lvl, ab: ab ? ab.id : null });
    }
    if (p.lvl >= MAX_LEVEL) p.xp = 0;
    if (up) {
      p.st = computeStats(p); p.hp = p.st.mhp; if (p.cls !== 'warrior') p.res = p.st.mres;
      this.ev(p.x, p.z, { e: 'fx', k: 'lvl', i: p.id, x: p.x, z: p.z });
      this.sys(`${p.name} reached level ${p.lvl}!`);
      this.rosterDirty = true;
      this.persist(p.id, this.saveOf(p));
    }
    p.invDirty = true;
  }

  // ---------- combat
  rollDmg(p, mult) {
    const s = p.st;
    let d = rnd(s.dmin, s.dmax) * mult * (1 + s.power / 100) * (1 + 0.06 * (p.lvl - 1));
    if (p.buffs.warcry > this.now) d *= 1.25;
    if (p.buffs.fury > this.now) d *= 1.25;
    const crit = Math.random() * 100 < s.crit;
    if (crit) d *= 1.75;
    return [d, crit];
  }
  monsterRadius(m) { return m.def.r * (m.champion ? 1.25 : 1); }
  hurtMonster(m, p, mult, opts = {}) {
    if (m.dead) return;
    const [raw, crit] = this.rollDmg(p, mult);
    const amt = Math.max(1, Math.round(raw));
    m.hp -= amt;
    m.threat.set(p.id, (m.threat.get(p.id) || 0) + amt * CLASSES[p.cls].threat + (m.threat.size ? 0 : 5));
    if (m.state === 'idle') this.aggro(m, p, true);
    p.lastCombat = this.now;
    this.ev(m.x, m.z, { e: 'dmg', i: m.id, v: amt, c: crit ? 1 : 0, s: p.id });
    if (p.st.lifesteal > 0 && p.alive) { const h = amt * p.st.lifesteal / 100; p.hp = Math.min(p.st.mhp, p.hp + h); }
    if (opts.stun) m.stunUntil = Math.max(m.stunUntil, this.now + opts.stun);
    if (opts.freeze) m.frozenUntil = Math.max(m.frozenUntil, this.now + opts.freeze);
    if (m.hp <= 0) this.killMonster(m, p);
  }
  hurtPlayer(p, amount, m) {
    if (!p.alive) return;
    if (this.now < p.invUntil) { this.ev(p.x, p.z, { e: 'miss', i: p.id }); return; }
    const arm = p.st.armor * (p.buffs.stone > this.now ? 1.4 : 1);
    let dr = Math.min(0.75, arm / (arm + 40 + 12 * (m ? m.lvl : p.lvl)));
    if (p.buffs.warcry > this.now) dr = 1 - (1 - dr) * 0.8;
    const amt = Math.max(1, Math.round(amount * (1 - dr)));
    p.hp -= amt; p.lastHurt = this.now; p.lastCombat = this.now;
    if (p.cls === 'warrior') p.res = Math.min(p.st.mres, p.res + 2 + (amt / p.st.mhp) * 70);
    this.ev(p.x, p.z, { e: 'dmg', i: p.id, v: amt, p: 1 });
    if (p.hp <= 0) this.killPlayer(p, m);
  }
  killPlayer(p, m) {
    p.hp = 0; p.alive = false; p.deadAt = this.now; p.whirlUntil = 0;
    const lost = Math.floor(p.gold * 0.05); p.gold -= lost;
    this.ev(p.x, p.z, { e: 'pdie', i: p.id });
    this.to(p.id, { t: 'dead', by: m ? m.name : 'the dark', lost });
    this.sys(`${p.name} was slain by ${m ? m.name : 'the dark'}.`);
    p.invDirty = true;
  }
  killMonster(m, killer) {
    m.dead = true; m.hp = 0; m.deadAt = this.now;
    m.respawnAt = this.now + (m.def.boss ? 120 : m.champion ? 50 : rnd(24, 34));
    this.ev(m.x, m.z, { e: 'die', i: m.id, x: m.x, z: m.z });
    // Everyone who fought it, or stood close by, shares the kill.
    const credit = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (m.threat.has(p.id) || d2(p.x, p.z, m.x, m.z) < 30 * 30) credit.push(p);
    }
    if (!credit.length && killer) credit.push(killer);
    for (const p of credit) {
      let xp = 12 * m.lvl * m.def.xp * (m.champion ? 3 : 1);
      const diff = p.lvl - m.lvl;
      if (diff >= 4) xp *= 0.15; else if (diff === 3) xp *= 0.45; else if (diff === 2) xp *= 0.8; else if (diff < 0) xp *= Math.min(1.4, 1 + 0.1 * -diff);
      if (m.minion && !m.ambush) xp *= 0.3;
      this.giveXp(p, xp);
      this.to(p.id, { t: 'xp', v: Math.round(xp), i: m.id });
      for (const qid in p.q.a) {
        const q = QUEST_BY_ID[qid];
        if (p.q.a[qid] >= q.goal.n) continue;
        if ((q.goal.kill && q.goal.kill.includes(m.type)) || (q.goal.champion && m.champion)) {
          p.q.a[qid]++;
          this.to(p.id, { t: 'qp', q: qid, n: p.q.a[qid] });
          p.invDirty = true;
        }
      }
      if (!m.minion || m.ambush) this.dropLoot(m, p);
    }
    if (m.def.boss) {
      this.sys(`${m.name} has fallen!`);
      for (const o of this.monsters) if (o.minion && !o.dead) { o.dead = true; o.deadAt = this.now; this.ev(o.x, o.z, { e: 'die', i: o.id, x: o.x, z: o.z }); }
    }
    m.threat.clear();
  }
  dropLoot(m, p) {
    const drops = [];
    const boss = m.def.boss;
    if (boss) {
      for (let i = 0; i < 3; i++) drops.push(Math.random() < 0.3 ? 4 : Math.random() < 0.6 ? 3 : 2);
    } else if (m.champion) {
      drops.push(rollRarity(1)); if (Math.random() < 0.5) drops.push(rollRarity(1));
    } else if (Math.random() < 0.3) drops.push(rollRarity());
    for (const r of drops) {
      const it = makeItem(m.lvl, r, null, p.cls);
      this.addLoot(p, m.x, m.z, { item: it });
    }
    if (Math.random() < (boss ? 1 : m.champion ? 0.9 : 0.55)) this.addLoot(p, m.x, m.z, { gold: Math.max(1, Math.round(m.lvl * rnd(2, 5) * (m.champion ? 4 : 1) * (boss ? 25 : 1))) });
    if (Math.random() < (m.champion ? 0.5 : 0.07)) this.addLoot(p, m.x, m.z, { pot: 1 });
  }
  addLoot(p, x, z, o) {
    const a = Math.random() * Math.PI * 2, r = rnd(0.4, 1.8);
    const [lx, lz] = this.world.resolve(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.3);
    const l = { id: this.nextId++, o: p.id, x: lx, z: lz, until: this.now + 150, ...o };
    this.loot.set(l.id, l);
    p.lootDirty = true;
    if (l.item) this.to(p.id, { t: 'drop', r: l.item.r, x: lx, z: lz });
  }
  aggro(m, p, alertCamp) {
    if (m.dead) return;
    if (m.state === 'return') return;
    if (!m.threat.has(p.id)) m.threat.set(p.id, 1);
    if (m.state === 'idle' && m.def.boss) {
      let n = 0; for (const o of this.players.values()) if (o.alive && d2(o.x, o.z, m.x, m.z) < 45 * 45) n++;
      m.mhp = Math.round(m.def.hp * (1 + 0.8 * (Math.max(1, n) - 1))); m.hp = m.mhp;
      m.sp = { slam: this.now + 6, spikes: this.now + 11, sum60: false, sum30: false };
      this.sys(`${m.name} awakens!`);
    }
    m.state = 'chase';
    if (alertCamp) for (const o of this.monsters) {
      if (o !== m && !o.dead && o.state === 'idle' && o.camp === m.camp && d2(o.x, o.z, m.x, m.z) < 14 * 14) this.aggro(o, p, false);
    }
  }
  spawnMonster(type, lvl, x, z, camp, minion = false) {
    const def = MONSTERS[type];
    const m = { id: this.nextId++, type, ti: MONSTER_LIST.indexOf(type), def, lvl, sx: x, sz: z, x, z, rot: Math.random() * 6.28, camp, minion,
      state: 'idle', threat: new Map(), atkAt: 0, wanderAt: rnd(1, 8), wx: x, wz: z, frozenUntil: 0, stunUntil: 0, dead: false, respawnAt: 0, deadAt: 0, sp: null };
    this.rollMonster(m);
    this.monsters.push(m);
    return m;
  }
  rollMonster(m) {
    const def = m.def;
    m.champion = !def.boss && !m.minion && m.lvl >= 2 && Math.random() < 0.07;
    m.name = m.champion ? `${pick(CHAMP_ADJ)} ${def.short}` : def.name;
    m.mhp = Math.round(def.boss ? def.hp : def.hp * (1 + 0.32 * (m.lvl - 1)) * (m.champion ? 2.6 : 1));
    m.hp = m.mhp;
    m.dmg = def.boss ? def.dmg : def.dmg * 0.85 * (1 + 0.22 * (m.lvl - 1)) * (m.champion ? 1.4 : 1);
    m.speed = def.speed * (m.champion ? 1.08 : 1);
  }
  respawnMonster(m) {
    m.dead = false; m.x = m.sx; m.z = m.sz; m.state = 'idle'; m.threat.clear(); m.frozenUntil = m.stunUntil = 0; m.sp = null;
    this.rollMonster(m);
  }
  moveM(m, tx, tz, speed, dt) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    let nx = m.x + (dx / d) * step, nz = m.z + (dz / d) * step;
    [nx, nz] = this.world.resolve(nx, nz, Math.min(1.1, this.monsterRadius(m) * 0.75));
    // sidestep if something blocks the way
    if (Math.hypot(nx - m.x, nz - m.z) < step * 0.25) {
      const s = (m.id % 2 ? 1 : -1);
      [nx, nz] = this.world.resolve(m.x - (dz / d) * step * s, m.z + (dx / d) * step * s, Math.min(1.1, this.monsterRadius(m) * 0.75));
    }
    m.x = nx; m.z = nz;
    m.rot = Math.atan2(dx, dz);
  }
  updateMonster(m, dt) {
    const now = this.now;
    if (m.dead) { if (!m.minion && now >= m.respawnAt) this.respawnMonster(m); return; }
    if (m.state === 'idle') {
      let best = null, bd = (m.def.aggro * (m.champion ? 1.2 : 1)) ** 2;
      for (const p of this.players.values()) {
        if (!p.alive || isSafe(p.zone)) continue;
        const dd = d2(p.x, p.z, m.x, m.z);
        if (dd < bd) { bd = dd; best = p; }
      }
      if (best) { this.aggro(m, best, true); return; }
      if (now > m.wanderAt) {
        m.wanderAt = now + rnd(3, 9);
        const a = Math.random() * 6.28, r = rnd(0, m.def.boss ? 2 : 4);
        m.wx = m.sx + Math.cos(a) * r; m.wz = m.sz + Math.sin(a) * r;
      }
      if (d2(m.x, m.z, m.wx, m.wz) > 0.2) this.moveM(m, m.wx, m.wz, m.speed * 0.3, dt);
      return;
    }
    if (m.state === 'return') {
      this.moveM(m, m.sx, m.sz, m.speed * 1.5, dt);
      m.hp = Math.min(m.mhp, m.hp + m.mhp * dt);
      if (d2(m.x, m.z, m.sx, m.sz) < 1.5) { m.state = 'idle'; m.hp = m.mhp; m.threat.clear(); }
      return;
    }
    // chasing
    let tgt = null, tv = -1;
    for (const [pid, v] of m.threat) {
      const p = this.players.get(pid);
      if (!p || !p.alive || isSafe(p.zone)) { m.threat.delete(pid); continue; }
      if (v > tv) { tv = v; tgt = p; }
    }
    const leash = m.def.boss ? 30 : 32;
    if (!tgt || d2(m.x, m.z, m.sx, m.sz) > leash * leash) {
      m.state = 'return'; m.threat.clear(); m.frozenUntil = m.stunUntil = 0;
      if (m.def.boss) { for (const o of this.monsters) if (o.minion && !o.dead) { o.dead = true; o.deadAt = now; } }
      this.ev(m.x, m.z, { e: 'evade', i: m.id });
      return;
    }
    if (now < m.stunUntil || now < m.frozenUntil) return;
    const enraged = m.def.boss && m.hp < m.mhp * 0.25;
    const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz);
    const reach = m.def.range + PLAYER_R + (m.def.ranged ? 0 : this.monsterRadius(m) * 0.4);
    if (m.def.ranged) {
      if (d > m.def.range) this.moveM(m, tgt.x, tgt.z, m.speed, dt);
      else if (d < 3.5) this.moveM(m, m.x - dx, m.z - dz, m.speed * 0.6, dt);
      m.rot = Math.atan2(dx, dz);
    } else if (d > reach * 0.9) this.moveM(m, tgt.x, tgt.z, m.speed * (enraged ? 1.25 : 1), dt);
    else m.rot = Math.atan2(dx, dz);
    if (m.def.boss) this.bossSpecials(m);
    if (now >= m.atkAt && d <= reach + 0.3) {
      m.atkAt = now + m.def.atkCd * (enraged ? 0.65 : 1) * rnd(0.9, 1.1);
      this.ev(m.x, m.z, { e: 'matk', i: m.id });
      if (m.def.ranged) {
        this.spawnProj({ team: 'm', owner: m.id, kind: m.def.proj, x: m.x, z: m.z, a: Math.atan2(dx, dz), speed: m.def.pspeed, range: m.def.range + 4, dmg: m.dmg, src: m });
      } else {
        const hit = tgt;
        this.after(0.22, () => {
          if (m.dead || !hit.alive) return;
          if (Math.hypot(hit.x - m.x, hit.z - m.z) <= reach + 1.0) this.hurtPlayer(hit, m.dmg * rnd(0.85, 1.15), m);
        });
      }
    }
  }
  bossSpecials(m) {
    const now = this.now, sp = m.sp; if (!sp) return;
    const near = [...this.players.values()].filter((p) => p.alive && d2(p.x, p.z, m.x, m.z) < 30 * 30);
    if (!near.length) return;
    if (now >= sp.slam) {
      sp.slam = now + (m.hp < m.mhp * 0.25 ? 6.5 : 9);
      const t = pick(near); const x = t.x, z = t.z, r = 5.5;
      this.ev(x, z, { e: 'tg', x, z, r, d: 1.6, k: 'boss' });
      this.ev(m.x, m.z, { e: 'matk', i: m.id, big: 1 });
      this.after(1.6, () => {
        if (m.dead) return;
        this.ev(x, z, { e: 'fx', k: 'slam', x, z, r });
        for (const p of this.players.values()) if (p.alive && d2(p.x, p.z, x, z) < r * r) this.hurtPlayer(p, m.dmg * 2.4, m);
      });
    }
    if (now >= sp.spikes) {
      sp.spikes = now + 12;
      for (const p of near) {
        const x = p.x, z = p.z, r = 2.8;
        this.ev(x, z, { e: 'tg', x, z, r, d: 1.3, k: 'boss' });
        this.after(1.3, () => {
          if (m.dead) return;
          this.ev(x, z, { e: 'fx', k: 'spikes', x, z, r });
          for (const o of this.players.values()) if (o.alive && d2(o.x, o.z, x, z) < r * r) this.hurtPlayer(o, m.dmg * 1.5, m);
        });
      }
    }
    const frac = m.hp / m.mhp;
    for (const [key, at] of [['sum60', 0.6], ['sum30', 0.3]]) {
      if (!sp[key] && frac < at) {
        sp[key] = true;
        this.ev(m.x, m.z, { e: 'fx', k: 'summon', x: m.x, z: m.z });
        this.sys(`${m.def.short} calls his dead to his side!`);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const [x, z] = this.world.resolve(m.x + Math.cos(a) * 4, m.z + Math.sin(a) * 4, 0.6);
          const mins = m.def.minions || ['skeleton', 'archer'];
          const mm = this.spawnMonster(mins[i % 2], m.lvl - 1, x, z, m.camp, true);
          this.aggro(mm, pick(near), false);
        }
      }
    }
  }

  // ---------- abilities
  cast(p, slot, m) {
    const now = this.now;
    if (!p.alive || now < p.stunUntil) return;
    const d = CLASSES[p.cls];
    const ab = slot === 0 ? d.basic : d.ab[slot - 1];
    if (!ab) return;
    if (slot > 0 && p.lvl < ab.lvl) return;
    if (now < p.cds[slot] - 0.1) return;
    if (slot > 0 && ab.cost && p.res < ab.cost) return;
    let ax = num(m.x, p.x + Math.sin(p.rot)), az = num(m.z, p.z + Math.cos(p.rot));
    if (ax === p.x && az === p.z) az += 0.01;
    const ang = Math.atan2(ax - p.x, az - p.z);
    p.rot = ang;
    p.cds[slot] = now + (slot === 0 ? d.basicCd : ab.cd * (1 - p.st.cdr / 100));
    if (ab.cost) p.res -= ab.cost;
    if (ab.gain && slot > 0) p.res = Math.min(p.st.mres, p.res + ab.gain);
    p.lastCombat = now;
    this.ev(p.x, p.z, { e: 'cast', i: p.id, s: slot, a: r2(ang), k: ab.id });
    switch (ab.kind) {
      case 'melee': {
        let hits = 0;
        for (const mo of this.monsters) {
          if (mo.dead) continue;
          const dx = mo.x - p.x, dz = mo.z - p.z, dd = Math.hypot(dx, dz);
          if (dd > ab.range + this.monsterRadius(mo)) continue;
          if (dd > 1 && Math.abs(angDiff(Math.atan2(dx, dz), ang)) > ab.arc / 2) continue;
          this.hurtMonster(mo, p, ab.mult); hits++;
        }
        this.smashIn(p, p.x, p.z, ab.range, ang, Math.min(ab.arc, Math.PI * 2));
        if (hits && slot === 0 && ab.gain) p.res = Math.min(p.st.mres, p.res + ab.gain);
        if (hits && slot === 1) p.res = Math.min(p.st.mres, p.res + 4);
        break;
      }
      case 'proj': {
        const n = ab.count || 1;
        for (let i = 0; i < n; i++) {
          const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * ab.spread : 0);
          this.spawnProj({ team: 'p', owner: p.id, kind: ab.proj, x: p.x, z: p.z, a, speed: ab.speed, range: ab.range, mult: ab.mult, aoe: ab.aoe || 0 });
        }
        break;
      }
      case 'charge': {
        const [tx, tz] = this.world.dashDest(p.x, p.z, ax, az, ab.dist);
        const fx = p.x, fz = p.z;
        const t = Math.hypot(tx - fx, tz - fz) / 32;
        p.x = tx; p.z = tz; p.grace = ab.dist + 3; p.graceUntil = now + 1.2;
        this.ev(fx, fz, { e: 'fx', k: 'charge', i: p.id, x: fx, z: fz, x2: tx, z2: tz });
        this.after(t, () => {
          this.ev(tx, tz, { e: 'fx', k: 'stomp', x: tx, z: tz, r: ab.r });
          for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, tx, tz) < (ab.r + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, ab.mult, { stun: ab.stun });
          this.smashIn(p, tx, tz, ab.r);
        });
        break;
      }
      case 'blink':
      case 'roll': {
        const [tx, tz] = this.world.dashDest(p.x, p.z, ax, az, ab.dist, ab.kind === 'roll');
        this.ev(p.x, p.z, { e: 'fx', k: ab.kind, i: p.id, x: p.x, z: p.z, x2: tx, z2: tz });
        p.x = tx; p.z = tz; p.grace = ab.dist + 3; p.graceUntil = now + 1.2;
        if (ab.inv) p.invUntil = now + ab.inv;
        break;
      }
      case 'nova': {
        this.ev(p.x, p.z, { e: 'fx', k: 'nova', x: p.x, z: p.z, r: ab.r });
        for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, p.x, p.z) < (ab.r + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, ab.mult, { freeze: mo.def.boss ? 0.8 : ab.freeze });
        this.smashIn(p, p.x, p.z, ab.r);
        break;
      }
      case 'buff': {
        this.ev(p.x, p.z, { e: 'fx', k: 'warcry', i: p.id, x: p.x, z: p.z, r: ab.r });
        for (const o of this.players.values()) if (o.alive && d2(o.x, o.z, p.x, p.z) < ab.r * ab.r) { o.buffs.warcry = now + ab.dur; this.heal(o, o.st.mhp * 0.15); }
        break;
      }
      case 'heal': {
        this.ev(p.x, p.z, { e: 'fx', k: 'mend', i: p.id, x: p.x, z: p.z, r: ab.r });
        for (const o of this.players.values()) if (o.alive && d2(o.x, o.z, p.x, p.z) < ab.r * ab.r) { o.buffs.mend = now + ab.dur; o.mendHps = o.st.mhp * ab.pct / ab.dur; }
        break;
      }
      case 'whirl': p.whirlUntil = now + ab.dur; p.whirlNext = now; break;
      case 'meteor':
      case 'rain': {
        let dx = ax - p.x, dz = az - p.z; const len = Math.hypot(dx, dz);
        if (len > ab.range) { dx *= ab.range / len; dz *= ab.range / len; }
        const tx = p.x + dx, tz = p.z + dz;
        if (ab.kind === 'meteor') {
          this.ev(tx, tz, { e: 'tg', x: tx, z: tz, r: ab.r, d: ab.delay, k: 'meteor' });
          this.after(ab.delay, () => {
            this.ev(tx, tz, { e: 'fx', k: 'boom', x: tx, z: tz, r: ab.r });
            for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, tx, tz) < (ab.r + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, ab.mult);
            if (this.players.has(p.id)) this.smashIn(p, tx, tz, ab.r);
          });
        } else {
          this.ev(tx, tz, { e: 'tg', x: tx, z: tz, r: ab.r, d: ab.waves * ab.every + 0.2, k: 'rain' });
          for (let w = 0; w < ab.waves; w++) this.after(0.25 + w * ab.every, () => {
            this.ev(tx, tz, { e: 'fx', k: 'rainwave', x: tx, z: tz, r: ab.r });
            for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, tx, tz) < (ab.r + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, ab.mult);
            if (this.players.has(p.id)) this.smashIn(p, tx, tz, ab.r);
          });
        }
        break;
      }
    }
  }
  spawnProj(o) {
    const pr = { id: this.nextId++, ...o, vx: Math.sin(o.a) * o.speed, vz: Math.cos(o.a) * o.speed, trav: 0 };
    pr.x += Math.sin(o.a) * 0.6; pr.z += Math.cos(o.a) * 0.6;
    this.projs.push(pr);
    this.ev(pr.x, pr.z, { e: 'ps', i: pr.id, k: PROJ_KINDS.indexOf(pr.kind), x: r2(pr.x), z: r2(pr.z), vx: r2(pr.vx), vz: r2(pr.vz), d: pr.range, t: pr.team === 'p' ? 1 : 0 });
  }
  explode(pr, x, z) {
    const p = this.players.get(pr.owner);
    this.ev(x, z, { e: 'fx', k: 'fireboom', x, z, r: pr.aoe });
    if (!p) return;
    for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, x, z) < (pr.aoe + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, pr.mult);
    this.smashIn(p, x, z, pr.aoe);
  }
  updateProjs(dt) {
    const keep = [];
    for (const pr of this.projs) {
      const total = pr.speed * dt;
      const steps = Math.max(1, Math.ceil(total / 0.6));
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        pr.x += pr.vx * dt / steps; pr.z += pr.vz * dt / steps; pr.trav += total / steps;
        if (pr.team === 'p') {
          for (const mo of this.monsters) {
            if (mo.dead) continue;
            const rr = this.monsterRadius(mo) + 0.35;
            if (Math.abs(mo.x - pr.x) > rr || Math.abs(mo.z - pr.z) > rr) continue;
            if (d2(mo.x, mo.z, pr.x, pr.z) < rr * rr) {
              const p = this.players.get(pr.owner);
              if (pr.aoe) this.explode(pr, pr.x, pr.z);
              else if (p) this.hurtMonster(mo, p, pr.mult);
              done = true; break;
            }
          }
        } else {
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            if (d2(p.x, p.z, pr.x, pr.z) < 0.8 * 0.8) {
              this.hurtPlayer(p, pr.dmg * rnd(0.85, 1.15), pr.src);
              done = true; break;
            }
          }
        }
        if (pr.trav >= pr.range) done = true;
      }
      if (done) this.ev(pr.x, pr.z, { e: 'pe', i: pr.id, x: r2(pr.x), z: r2(pr.z) });
      else keep.push(pr);
    }
    this.projs = keep;
  }

  // ---------- main loop
  tick(dt = TICK) {
    this.now += dt; this.tickN++;
    const now = this.now;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      if (due.length) { this.timers = this.timers.filter((t) => t.at > now); for (const t of due) t.fn(); }
    }
    for (const p of this.players.values()) {
      p.zone = zoneAt(p.x, p.z);
      if (TOWN_BY_ID[p.zone] && p.alive) {
        if (!p.wp.includes(p.zone)) { p.wp.push(p.zone); this.to(p.id, { t: 'wp', town: p.zone }); p.invDirty = true; }
        if (p.home !== p.zone) { p.home = p.zone; p.invDirty = true; }
      }
      if (!p.alive) {
        if (now - p.deadAt >= 5) {
          p.alive = true; p.hp = p.st.mhp; p.res = p.cls === 'warrior' ? 0 : p.st.mres;
          const ht = TOWN_BY_ID[p.home] || TOWNS[0];
          p.x = ht.x + rnd(-2, 2); p.z = ht.z + (ht.id === 'town' ? 4 : 3) + rnd(-1, 1); p.buffs = {};
          this.to(p.id, { t: 'setpos', x: p.x, z: p.z, respawn: 1 });
          this.ev(p.x, p.z, { e: 'fx', k: 'respawn', i: p.id, x: p.x, z: p.z });
        }
        continue;
      }
      const st = p.st;
      // resources
      if (p.cls === 'warrior') { if (now - p.lastCombat > 5) p.res = Math.max(0, p.res - 6 * dt); }
      else p.res = Math.min(st.mres, p.res + (CLASSES[p.cls].resRegen + (p.cls === 'mage' ? 0.5 * p.lvl : 0)) * dt);
      // health
      if (isSafe(p.zone)) { const tc = TOWN_BY_ID[p.zone]; p.hp = Math.min(st.mhp, p.hp + st.mhp * (Math.hypot(p.x - tc.x, p.z - tc.z) < 5.5 ? 0.3 : 0.06) * dt); }
      else if (now - p.lastHurt > 5) p.hp = Math.min(st.mhp, p.hp + st.mhp * 0.015 * dt);
      if (p.buffs.mend > now) p.hp = Math.min(st.mhp, p.hp + p.mendHps * dt);
      // whirlwind
      if (p.whirlUntil > now && now >= p.whirlNext) {
        p.whirlNext = now + 0.25;
        const ab = CLASSES.warrior.ab[3];
        for (const mo of this.monsters) if (!mo.dead && d2(mo.x, mo.z, p.x, p.z) < (ab.r + this.monsterRadius(mo)) ** 2) this.hurtMonster(mo, p, ab.mult);
        this.smashIn(p, p.x, p.z, ab.r);
      }
      // gold & potions pick themselves up
      for (const l of this.loot.values()) {
        if (l.o !== p.id || l.item) continue;
        if (d2(l.x, l.z, p.x, p.z) < 2.2 * 2.2) {
          if (l.gold) { p.gold += l.gold; this.to(p.id, { t: 'gold', v: l.gold }); }
          if (l.pot) { if (p.pots >= MAX_POTIONS) continue; p.pots++; this.to(p.id, { t: 'potup' }); }
          this.loot.delete(l.id); p.lootDirty = true; p.invDirty = true;
        }
      }
    }
    for (const m of this.monsters) this.updateMonster(m, dt);
    // keep chasing monsters from stacking on top of each other
    const active = this.monsters.filter((m) => !m.dead && m.state === 'chase');
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const min = (this.monsterRadius(a) + this.monsterRadius(b)) * 0.85;
      const dx = b.x - a.x, dz = b.z - a.z, dd = dx * dx + dz * dz;
      if (dd < min * min && dd > 1e-6) {
        const d = Math.sqrt(dd), push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
    if (this.tickN % 20 === 0) this.monsters = this.monsters.filter((m) => !(m.minion && m.dead && now - m.deadAt > 3));
    this.updateProjs(dt);
    if (this.tickN % 20 === 0) for (const [id, until] of this.broken) {
      if (until > now) continue;
      const pr = this.world.props[id];
      let seen = false; for (const p of this.players.values()) if (d2(p.x, p.z, pr.x, pr.z) < 30 * 30) { seen = true; break; }
      if (!seen) { this.broken.delete(id); this.propsDirty = true; }
    }
    if (this.tickN % 20 === 0) for (const [id, l] of this.loot) if (l.until < now) { this.loot.delete(id); const p = this.players.get(l.o); if (p) p.lootDirty = true; }
    this.broadcast();
    if (this.tickN % 600 === 0) for (const p of this.players.values()) this.persist(p.id, this.saveOf(p));
  }
  broadcast() {
    const now = this.now;
    if (this.rosterDirty) {
      this.rosterDirty = false;
      const l = [...this.players.values()].map((p) => ({ i: p.id, n: p.name, c: p.cls, v: p.lvl }));
      for (const p of this.players.values()) this.to(p.id, { t: 'ro', l });
    }
    if (this.propsDirty) {
      this.propsDirty = false;
      const b = [...this.broken.keys()];
      for (const p of this.players.values()) this.to(p.id, { t: 'props', b });
    }
    const pl = [];
    for (const p of this.players.values()) {
      const f = (p.alive ? 0 : 1) | (p.whirlUntil > now ? 2 : 0) | (p.buffs.warcry > now ? 4 : 0) | (p.invUntil > now ? 8 : 0) | (p.buffs.mend > now ? 16 : 0);
      pl.push([p.id, r2(p.x), r2(p.z), r2(p.rot), Math.round((p.hp / p.st.mhp) * 1000), f]);
    }
    const VR2 = VIEW_R * VIEW_R, ER2 = 70 * 70;
    for (const p of this.players.values()) {
      const mon = [];
      for (const m of this.monsters) {
        if (m.dead || d2(m.x, m.z, p.x, p.z) > VR2) continue;
        const f = (m.champion ? 1 : 0) | (now < m.frozenUntil ? 2 : 0) | (now < m.stunUntil ? 4 : 0) | (m.def.boss && m.hp < m.mhp * 0.25 ? 8 : 0) | (m.state === 'return' ? 16 : 0) | (m.minion ? 32 : 0);
        const e = [m.id, m.ti, r2(m.x), r2(m.z), r2(m.rot), Math.round((m.hp / m.mhp) * 1000), m.lvl, f];
        if (m.champion) e.push(m.name);
        if (m.def.boss) e.push(Math.round(m.hp), m.mhp);
        mon.push(e);
      }
      const ev = [];
      for (const e of this.events) if (d2(e.x, e.z, p.x, p.z) < ER2) ev.push(e.o);
      const msg = { t: 's', T: r2(now), p: pl, m: mon, e: ev,
        me: [Math.ceil(p.hp), p.st.mhp, Math.floor(p.res), p.st.mres, p.cds.map((c) => Math.max(0, r2(c - now))), p.buffs.warcry > now ? r2(p.buffs.warcry - now) : 0, p.buffs.mend > now ? r2(p.buffs.mend - now) : 0, p.buffs.fury > now ? Math.ceil(p.buffs.fury - now) : 0, p.buffs.stone > now ? Math.ceil(p.buffs.stone - now) : 0] };
      if (p.lootDirty || this.tickN % 10 === 0) {
        p.lootDirty = false;
        const L = [];
        for (const l of this.loot.values()) if (l.o === p.id && d2(l.x, l.z, p.x, p.z) < VR2) L.push(l.item ? [l.id, r2(l.x), r2(l.z), l.item.r, l.item.name, l.item.slot] : [l.id, r2(l.x), r2(l.z), l.gold ? -1 : -2, l.gold || 0]);
        msg.l = L;
      }
      this.to(p.id, msg);
      if (p.invDirty) { p.invDirty = false; this.sendInv(p); }
    }
    this.events.length = 0;
  }
}
export function gambleCost(lvl) { return 40 + 25 * lvl; }

Game.mk = makeItem; // handy for tests and tools
