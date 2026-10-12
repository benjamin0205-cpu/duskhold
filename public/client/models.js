// Low-poly models built from primitives, plus the static world (ground, trees, town).
import * as THREE from 'three';
import { DLEVELS, DNG_TILE, DNG_TILES, zoneAt, roadDist, TOWN_R, BOSS_ARENA, BOSS_ARENA2, ARENAS, NPCS, TOWNS, TOWN_BY_ID, INNER_R, WORLD_R } from '../sim.js';

// ---------------------------------------------------------------- helpers
const C = (c) => new THREE.Color(c);
export function M(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.85, metalness: o.m ?? 0, flatShading: o.flat ?? true, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide });
}
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
// merge non-indexed geometries, painting each part with a vertex colour
function part(geo, color, mtx) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (mtx) g.applyMatrix4(mtx);
  const n = g.attributes.position.count; const col = new Float32Array(n * 3); const c = C(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
function merge(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const T = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function prism(w, h, d) { // triangular roof prism, ridge along x
  const g = new THREE.BufferGeometry();
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, 0, hd, hw, h, 0, -hw, h, 0,
    hw, 0, -hd, -hw, 0, -hd, -hw, h, 0, hw, 0, -hd, -hw, h, 0, hw, h, 0,
    -hw, 0, -hd, -hw, 0, hd, -hw, h, 0, hw, 0, hd, hw, 0, -hd, hw, h, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// soft round glow texture shared by sprites
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------- ground colours
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ZCOL = { meadow: C('#3f6034'), thorn: C('#2a4128'), grave: C('#4a4554'), crypt: C('#3d3a31'),
  frost: C('#b9c4cf'), ember: C('#2e2420'), mire: C('#34422c'), spire: C('#2c2836') };
const ZCOL2 = { meadow: C('#5c723e'), thorn: C('#394a26'), grave: C('#585164'), crypt: C('#4b463a'),
  frost: C('#e4ebf0'), ember: C('#4a2a1c'), mire: C('#4a5434'), spire: C('#3e3650') };
const OUTER_OF = { meadow: 'frost', thorn: 'ember', grave: 'mire', crypt: 'spire' };
const LAVA = C('#e8480c'), WATER = C('#2a4a48');
const DIRT = C('#6b5640'), COBBLE = C('#6a625a'), TOWNG = C('#4f5a36'), FLAG = C('#3a3638'), CLIFF = C('#2c2830');
const ZC_ANG = { thorn: 0, grave: Math.PI / 2, crypt: Math.PI, meadow: -Math.PI / 2 };
function angd(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); }
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
export function groundColor(x, z, out) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  // blend the two nearest zones across their border
  let best = null, second = null, bd = 9, sd = 9;
  for (const k in ZC_ANG) { const d = angd(a, ZC_ANG[k]); if (d < bd) { second = best; sd = bd; best = k; bd = d; } else if (d < sd) { second = k; sd = d; } }
  const outer = r > INNER_R - 4;
  if (outer) { best = OUTER_OF[best]; second = OUTER_OF[second]; }
  const n = vnoise(x * 0.08, z * 0.08) * 0.65 + vnoise(x * 0.3, z * 0.3) * 0.35;
  tmpA.copy(ZCOL[best]).lerp(ZCOL2[best], n);
  tmpB.copy(ZCOL[second]).lerp(ZCOL2[second], n);
  const edge = (sd - bd) / 0.25;
  out.copy(tmpA);
  if (edge < 1) out.lerp(tmpB, 0.5 * (1 - edge));
  // details in the outer lands
  if (outer && best === 'ember') { const v = vnoise(x * 0.3 + 7, z * 0.3); if (v > 0.86) out.lerp(LAVA, Math.min(0.9, (v - 0.86) * 9)); }
  if (outer && best === 'mire') { const v = vnoise(x * 0.12 + 3, z * 0.12 - 5); if (v > 0.62) out.lerp(WATER, Math.min(0.9, (v - 0.62) * 6)); }
  // the ridge between the old realm and the outer lands
  const rg = Math.abs(r - 147);
  if (rg < 6) out.lerp(CLIFF, (1 - rg / 6) * 0.6);
  // towns
  if (r < TOWN_R + 3) out.lerp(TOWNG, Math.min(1, (TOWN_R + 3 - r) / 4));
  if (r < 10) out.copy(COBBLE).multiplyScalar(0.85 + vnoise(x * 1.2, z * 1.2) * 0.3);
  for (const t of TOWNS) {
    if (t.id === 'town') continue;
    const tr = Math.hypot(x - t.x, z - t.z);
    if (tr < t.r + 1) out.lerp(COBBLE, Math.min(1, (t.r + 1 - tr) / 3) * 0.8);
  }
  // roads
  const rd = r < 10 ? 99 : roadDist(x, z);
  const inTownRoad = r < TOWN_R + 2 && (Math.abs(x) < 2.6 || Math.abs(z) < 2.6);
  if (rd < 3.2 || inTownRoad) out.lerp(DIRT, inTownRoad ? 0.85 : Math.min(1, (3.2 - rd) / 1.2) * (0.75 + 0.25 * n));
  // boss arenas
  for (const A of ARENAS) {
    const ar = Math.hypot(x - A.x, z - A.z);
    if (ar < A.r + 1) out.lerp(FLAG, Math.min(1, (A.r + 1 - ar) / 2)).multiplyScalar(0.9 + 0.2 * vnoise(x * 0.9, z * 0.9));
  }
  if (r > WORLD_R - 6) out.lerp(CLIFF, Math.min(1, (r - WORLD_R + 6) / 8));
  out.multiplyScalar(0.9 + hash(Math.floor(x * 2), Math.floor(z * 2)) * 0.12);
  return out;
}

// ---------------------------------------------------------------- the world
// Instanced meshes split into map chunks, so frustum culling skips what is off screen.
const CHUNK = 36;
function chunked(scene, geo, mat, items, place, opts = {}) {
  const groups = new Map();
  for (const it of items) { const k = Math.floor(it.x / CHUNK) + ':' + Math.floor(it.z / CHUNK); let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(it); }
  const d3 = new THREE.Object3D(), col = new THREE.Color();
  for (const list of groups.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { place(it, d3, col); d3.updateMatrix(); im.setMatrixAt(i, d3.matrix); im.setColorAt(i, col); });
    im.castShadow = !!opts.cast; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  }
}
export function buildWorld(scene, world) {
  const out = { flames: [], lights: [], emitters: [], water: null, markers: {}, buildings: [] };
  // ground, in tiles so the camera only draws what it can see
  const dc = document.createElement('canvas'); dc.width = dc.height = 128; const dx = dc.getContext('2d');
  const img = dx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) { const v = 200 + Math.random() * 55; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  dx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(dc); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const TILE = 40, TSEG = 26, c = new THREE.Color();
  for (let tz = -6; tz < 6; tz++) for (let tx = -6; tx < 6; tx++) {
    const geo = new THREE.PlaneGeometry(TILE, TILE, TSEG, TSEG); geo.rotateX(-Math.PI / 2);
    geo.translate(tx * TILE + TILE / 2, 0, tz * TILE + TILE / 2);
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      groundColor(pos.getX(i), pos.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const tile = new THREE.Mesh(geo, groundMat); tile.receiveShadow = true; scene.add(tile);
  }

  // instanced scenery
  const KIND = {
    oak: merge([part(new THREE.CylinderGeometry(0.16, 0.26, 1.7, 6), '#4a3424', T(0, 0.85, 0)), part(new THREE.IcosahedronGeometry(1.25, 0), '#476f2e', T(0, 2.45, 0, 0, 0, 0, 1.1, 0.85, 1.1)), part(new THREE.IcosahedronGeometry(0.85, 0), '#557d34', T(0.5, 3.0, 0.2))]),
    pine: merge([part(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5), '#4a3424', T(0, 0.6, 0)), part(new THREE.ConeGeometry(1.15, 1.9, 7), '#2f5a36', T(0, 1.75, 0)), part(new THREE.ConeGeometry(0.85, 1.6, 7), '#36663c', T(0, 2.7, 0)), part(new THREE.ConeGeometry(0.5, 1.3, 7), '#3f7244', T(0, 3.55, 0))]),
    deadtree: merge([part(new THREE.CylinderGeometry(0.1, 0.22, 2.6, 5), '#4a4038', T(0, 1.3, 0, 0, 0, 0.08)), part(new THREE.CylinderGeometry(0.05, 0.09, 1.2, 4), '#4a4038', T(0.35, 2.0, 0, 0, 0, -0.9)), part(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 4), '#4a4038', T(-0.3, 2.3, 0.1, 0.3, 0, 0.8)), part(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 4), '#4a4038', T(0, 2.5, -0.3, -0.8, 0, 0))]),
    rock: merge([part(new THREE.DodecahedronGeometry(1, 0), '#6e6a66', T(0, 0.3, 0, 0, 0, 0, 1, 0.72, 0.9))]),
    grave: merge([part(new THREE.BoxGeometry(0.62, 0.95, 0.18), '#77727c', T(0, 0.47, 0)), part(new THREE.CylinderGeometry(0.31, 0.31, 0.18, 8, 1, false, 0, Math.PI), '#77727c', T(0, 0.95, 0, Math.PI / 2, 0, Math.PI / 2)), part(new THREE.BoxGeometry(0.8, 0.12, 0.4), '#5a5660', T(0, 0.06, 0)), part(new THREE.BoxGeometry(0.55, 0.06, 1.0), '#3b3530', T(0, 0.03, 0.62))]),
    ruin: merge([part(new THREE.CylinderGeometry(0.5, 0.58, 2.2, 8), '#7a7466', T(0, 1.1, 0, 0.05, 0, 0.04)), part(new THREE.BoxGeometry(1.4, 0.3, 1.4), '#6a645a', T(0, 0.15, 0)), part(new THREE.BoxGeometry(0.5, 0.4, 0.6), '#7a7466', T(0.9, 0.2, 0.5, 0.2, 0.6, 0.3))]),
    cliff: merge([part(new THREE.DodecahedronGeometry(1, 0), '#3a3540', T(0, 0.5, 0, 0, 0, 0, 1, 1.5, 1)), part(new THREE.DodecahedronGeometry(0.6, 0), '#45404a', T(0.6, 1.4, 0.2))]),
    tent: merge([part(new THREE.ConeGeometry(1.7, 2.3, 4), '#7c5a3a', T(0, 1.15, 0, 0, Math.PI / 4, 0)), part(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 4), '#3a2a1c', T(0, 1.4, 0)), part(new THREE.BoxGeometry(0.7, 1.2, 0.05), '#24180f', T(0, 0.6, 1.0))]),
    crypt: merge([part(new THREE.BoxGeometry(3.6, 2.4, 2.8), '#8a8494', T(0, 1.2, 0)), part(prism(4.0, 1.1, 3.2), '#5a5464', T(0, 2.4, 0)), part(new THREE.BoxGeometry(1.0, 1.6, 0.1), '#14101a', T(0, 0.8, 1.42)), part(new THREE.BoxGeometry(4, 0.25, 3.2), '#4a4652', T(0, 0.12, 0))]),
    post: merge([part(new THREE.CylinderGeometry(0.24, 0.27, 1, 6), '#5a4130', T(0, 0.5, 0)), part(new THREE.ConeGeometry(0.24, 0.35, 6), '#4a3526', T(0, 1.17, 0))]),
    tower: merge([part(new THREE.CylinderGeometry(1.0, 1.15, 4.2, 8), '#5f4a36', T(0, 2.1, 0)), part(new THREE.CylinderGeometry(1.25, 1.25, 0.35, 8), '#4a3828', T(0, 4.3, 0)), part(new THREE.ConeGeometry(1.45, 1.7, 8), '#6e2f26', T(0, 5.3, 0))]),
    pillar: merge([part(new THREE.CylinderGeometry(0.75, 0.85, 1, 8), '#6a6458', T(0, 0.5, 0)), part(new THREE.BoxGeometry(1.9, 0.12, 1.9), '#5a5448', T(0, 0.02, 0))]),
    lamp: merge([part(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 5), '#2a2420', T(0, 1.3, 0)), part(new THREE.BoxGeometry(0.34, 0.42, 0.34), '#ffcf7a', T(0, 2.75, 0)), part(new THREE.ConeGeometry(0.3, 0.25, 4), '#2a2420', T(0, 3.05, 0, 0, Math.PI / 4, 0))]),
    torch: merge([part(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 5), '#3a2a1c', T(0, 1.1, 0)), part(new THREE.CylinderGeometry(0.18, 0.1, 0.25, 6), '#2a2420', T(0, 2.25, 0))]),
    brazier: merge([part(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), '#2e2a28', T(0, 1.1, 0)), part(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 5), '#2e2a28', T(0, 0.45, 0))]),
    // the outer lands
    ridge: merge([part(new THREE.DodecahedronGeometry(1, 0), '#4a4450', T(0, 0.55, 0, 0, 0, 0, 1.1, 1.6, 1)), part(new THREE.DodecahedronGeometry(0.7, 0), '#55505c', T(0.55, 1.5, 0.15, 0.4, 0.3, 0)), part(new THREE.DodecahedronGeometry(0.6, 0), '#3e3944', T(-0.6, 0.4, -0.3))]),
    snowpine: merge([part(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5), '#4a3424', T(0, 0.6, 0)), part(new THREE.ConeGeometry(1.15, 1.9, 7), '#2a4a3a', T(0, 1.75, 0)), part(new THREE.ConeGeometry(0.95, 0.5, 7), '#eef3f8', T(0, 2.4, 0)), part(new THREE.ConeGeometry(0.85, 1.6, 7), '#30533f', T(0, 2.7, 0)), part(new THREE.ConeGeometry(0.62, 0.45, 7), '#f4f8fc', T(0, 3.3, 0)), part(new THREE.ConeGeometry(0.42, 1.0, 7), '#f4f8fc', T(0, 3.85, 0))]),
    icerock: merge([part(new THREE.DodecahedronGeometry(1, 0), '#9fb4c8', T(0, 0.3, 0, 0, 0, 0, 1, 0.75, 0.9)), part(new THREE.OctahedronGeometry(0.45, 0), '#c8e4ff', T(0.4, 0.8, 0.1, 0.3, 0, 0.2, 0.7, 1.6, 0.7)), part(new THREE.SphereGeometry(0.75, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#f2f6fa', T(0, 0.55, 0, 0, 0, 0, 1, 0.35, 0.9))]),
    ashtree: merge([part(new THREE.CylinderGeometry(0.1, 0.24, 2.6, 5), '#1e1a18', T(0, 1.3, 0, 0, 0, 0.1)), part(new THREE.CylinderGeometry(0.05, 0.09, 1.2, 4), '#1e1a18', T(0.4, 2.1, 0, 0, 0, -0.9)), part(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 4), '#1e1a18', T(-0.3, 2.3, 0.1, 0.3, 0, 0.8)), part(new THREE.IcosahedronGeometry(0.12, 0), '#ff6a20', T(0.8, 2.5, 0)), part(new THREE.IcosahedronGeometry(0.1, 0), '#ff8a30', T(-0.65, 2.65, 0.15))]),
    lavarock: merge([part(new THREE.DodecahedronGeometry(1, 0), '#2a2220', T(0, 0.3, 0, 0, 0, 0, 1, 0.75, 0.9)), part(new THREE.BoxGeometry(1.5, 0.06, 0.12), '#ff5a10', T(0, 0.62, 0.2, 0, 0.5, 0.15)), part(new THREE.BoxGeometry(0.1, 0.05, 1.2), '#ff7a20', T(0.25, 0.64, 0, 0.1, 0, 0))]),
    bogtree: merge([part(new THREE.CylinderGeometry(0.2, 0.45, 2.0, 6), '#3a3426', T(0, 1.0, 0, 0.08, 0, 0)), part(new THREE.IcosahedronGeometry(1.15, 0), '#3e5a2a', T(0, 2.4, 0, 0, 0, 0, 1.3, 0.6, 1.3)), part(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 3), '#6a7a4a', T(0.8, 1.6, 0.2)), part(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 3), '#6a7a4a', T(-0.7, 1.7, -0.3)), part(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 3), '#6a7a4a', T(0.1, 1.7, 0.9))]),
    reeds: merge([0, 1, 2, 3, 4, 5, 6].map((i) => part(new THREE.CylinderGeometry(0.03, 0.04, 1.4 + (i % 3) * 0.35, 3), i % 2 ? '#6a7a3a' : '#7a8a46', T(Math.cos(i * 2.4) * 0.35, 0.7 + (i % 3) * 0.17, Math.sin(i * 2.4) * 0.35, (i % 3 - 1) * 0.12, 0, (i % 2 - 0.5) * 0.2))).concat([part(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), '#5a3a24', T(0.2, 1.55, 0.1)), part(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), '#5a3a24', T(-0.25, 1.75, -0.2))])),
    crystal: merge([part(new THREE.OctahedronGeometry(0.55, 0), '#8a5ad8', T(0, 1.1, 0, 0, 0, 0.1, 0.8, 2.2, 0.8)), part(new THREE.OctahedronGeometry(0.35, 0), '#b088ff', T(0.5, 0.6, 0.2, 0, 0.5, -0.5, 0.8, 1.8, 0.8)), part(new THREE.OctahedronGeometry(0.3, 0), '#6a3ab8', T(-0.4, 0.5, -0.2, 0.4, 0, 0.5, 0.8, 1.6, 0.8)), part(new THREE.DodecahedronGeometry(0.6, 0), '#2e2838', T(0, 0.1, 0, 0, 0, 0, 1.2, 0.4, 1.2))]),
    chest: merge([part(new THREE.BoxGeometry(1.3, 0.7, 0.8), '#6a4424', T(0, 0.35, 0)), part(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 8, 1, false, 0, Math.PI), '#7a5030', T(0, 0.7, 0, 0, 0, Math.PI / 2)), part(new THREE.BoxGeometry(1.36, 0.1, 0.86), '#b48d55', T(0, 0.68, 0)), part(new THREE.BoxGeometry(0.1, 0.75, 0.86), '#b48d55', T(-0.45, 0.4, 0)), part(new THREE.BoxGeometry(0.1, 0.75, 0.86), '#b48d55', T(0.45, 0.4, 0)), part(new THREE.BoxGeometry(0.2, 0.24, 0.06), '#e8c060', T(0, 0.62, 0.42))]),
    waystone: merge([part(new THREE.CylinderGeometry(1.3, 1.5, 0.3, 8), '#5a5662', T(0, 0.15, 0)), part(new THREE.BoxGeometry(0.75, 3.0, 0.5), '#6a6676', T(0, 1.75, 0, 0, 0, 0.03)), part(new THREE.ConeGeometry(0.5, 0.6, 4), '#6a6676', T(0, 3.5, 0, 0, Math.PI / 4, 0)), part(new THREE.BoxGeometry(0.3, 0.3, 0.06), '#7ad8ff', T(0, 2.4, 0.27, 0, 0, Math.PI / 4)), part(new THREE.BoxGeometry(0.3, 0.3, 0.06), '#7ad8ff', T(0, 2.4, -0.27, 0, 0, Math.PI / 4)), part(new THREE.BoxGeometry(0.06, 0.6, 0.06), '#7ad8ff', T(0, 1.6, 0.27)), part(new THREE.BoxGeometry(0.06, 0.6, 0.06), '#7ad8ff', T(0, 1.6, -0.27))]),
  };
  const EMIS = { lamp: 0x553300, crystal: 0x2a1050, lavarock: 0x1a0800, ashtree: 0x100400, waystone: 0x0a1a28, icerock: 0x0a1018 };
  const UNSCALED = new Set(['tower', 'lamp', 'torch', 'brazier', 'tent', 'crypt', 'chest', 'waystone']);
  const faceTown = (o) => { const t = TOWN_BY_ID[o.town]; return t ? Math.atan2(t.x - o.x, t.z - o.z) : 0; };
  const groups = {};
  for (const o of world.obs) (groups[o.k] = groups[o.k] || []).push(o);
  for (const k in KIND) {
    const list = groups[k]; if (!list || !list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: EMIS[k] || 0x000000 });
    chunked(scene, KIND[k], mat, list, (o, d3, tint) => {
      const s = o.s || 1;
      d3.position.set(o.x, 0, o.z);
      d3.rotation.set(0, k === 'crypt' ? 0 : k === 'chest' ? faceTown(o) : k === 'waystone' ? 0 : (o.rot ?? Math.atan2(o.x, o.z)), 0);
      if (k === 'post') d3.scale.set(1, o.h || 2.8, 1);
      else if (k === 'pillar') d3.scale.set(1, o.h || 6, 1);
      else if (k === 'cliff') d3.scale.set(s, s * 0.9, s);
      else if (k === 'ridge') d3.scale.set(s, s * 1.15, s);
      else if (UNSCALED.has(k)) d3.scale.set(1, 1, 1);
      else d3.scale.set(s, s, s);
      const v = 0.85 + Math.random() * 0.3;
      tint.setRGB(v, v * (0.95 + Math.random() * 0.1), v);
    }, { cast: k !== 'cliff' });
  }
  // ground cover: grass, flowers, mushrooms, bones (no collision, client only)
  {
    let seed = 777; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const COVER = {
      grass: { geo: merge([part(new THREE.ConeGeometry(0.06, 0.55, 3), '#5f7a3a', T(0, 0.27, 0, 0.15, 0, 0.1)), part(new THREE.ConeGeometry(0.06, 0.45, 3), '#6b8540', T(0.12, 0.22, 0.05, -0.1, 0, -0.25)), part(new THREE.ConeGeometry(0.05, 0.4, 3), '#55703a', T(-0.1, 0.2, -0.05, 0.2, 0, 0.3))]), zones: { meadow: 1900, thorn: 500, grave: 300, mire: 1100 } },
      flower: { geo: merge([part(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 3), '#4a6a30', T(0, 0.17, 0)), part(new THREE.IcosahedronGeometry(0.08, 0), '#ffffff', T(0, 0.37, 0))]), zones: { meadow: 700 }, colors: ['#e8d36a', '#d8a0d8', '#f0f0f0', '#e8b0a0'] },
      shroom: { geo: merge([part(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 5), '#e8dcc8', T(0, 0.12, 0)), part(new THREE.SphereGeometry(0.16, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', T(0, 0.24, 0))]), zones: { thorn: 260, crypt: 60, mire: 260 }, colors: ['#b8402a', '#c8a878', '#a8502a'] },
      bones: { geo: merge([part(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), '#d8d0bc', T(0, 0.05, 0, 0, 0, Math.PI / 2)), part(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 4), '#d8d0bc', T(0.05, 0.05, 0.1, 0, 0.9, Math.PI / 2)), part(new THREE.IcosahedronGeometry(0.11, 0), '#e8e0cc', T(-0.25, 0.1, 0.05))]), zones: { grave: 420, crypt: 360, spire: 200, ember: 120 } },
      pebble: { geo: merge([part(new THREE.DodecahedronGeometry(0.18, 0), '#6a6660', T(0, 0.06, 0, 0, 0, 0, 1, 0.6, 1))]), zones: { meadow: 200, thorn: 200, grave: 260, crypt: 380, frost: 700, ember: 500, spire: 400 } },
      shard: { geo: merge([part(new THREE.OctahedronGeometry(0.12, 0), '#ffffff', T(0, 0.15, 0, 0, 0, 0, 0.8, 2.2, 0.8)), part(new THREE.OctahedronGeometry(0.08, 0), '#ffffff', T(0.12, 0.1, 0.05, 0, 0, 0.5, 0.8, 2, 0.8))]), zones: { spire: 380, frost: 260 } },
    };
    const QA = { thorn: 0, grave: Math.PI / 2, crypt: Math.PI, meadow: -Math.PI / 2, frost: -Math.PI / 2, ember: 0, mire: Math.PI / 2, spire: Math.PI };
    const OUTER = new Set(['frost', 'ember', 'mire', 'spire']);
    for (const k in COVER) {
      const cv = COVER[k]; const list = [];
      for (const zn in cv.zones) {
        let made = 0, tries = 0;
        const [r0, r1] = OUTER.has(zn) ? [152, 222] : [26, 134];
        while (made < cv.zones[zn] && tries++ < cv.zones[zn] * 6) {
          const a = QA[zn] + (R() - 0.5) * 1.58, r = Math.sqrt(r0 * r0 + R() * (r1 * r1 - r0 * r0));
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (zoneAt(x, z) !== zn || roadDist(x, z) < 3) continue;
          if (!world.free(x, z, 0.3, 0.1)) continue;
          list.push([x, z, zn]); made++;
        }
      }
      // town lawn gets a little grass too
      if (k === 'grass') for (let i = 0; i < 160; i++) { const a = R() * Math.PI * 2, r = 11 + R() * 9; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) > 3 && Math.abs(z) > 3 && world.free(x, z, 0.3, 0.1)) list.push([x, z, 'town']); }
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      chunked(scene, cv.geo, mat, list.map(([x, z, zn]) => ({ x, z, zn })), (it, d3, c2) => {
        const s = 0.7 + R() * 0.7;
        d3.position.set(it.x, 0, it.z); d3.rotation.set(0, R() * Math.PI * 2, 0); d3.scale.set(s, s * (k === 'grass' ? 0.8 + R() * 0.6 : 1), s);
        const zn = it.zn;
        if (cv.colors) c2.set(cv.colors[Math.floor(R() * cv.colors.length)]);
        else if (k === 'grass') { if (zn === 'mire') c2.setRGB(0.75, 0.8 + R() * 0.15, 0.55); else c2.setRGB(zn === 'grave' ? 0.65 : zn === 'thorn' ? 0.7 : 0.95, zn === 'grave' ? 0.7 : 0.9 + R() * 0.15, zn === 'grave' ? 0.75 : 0.8); }
        else if (k === 'shard') { if (zn === 'frost') c2.setRGB(0.75, 0.9, 1.1); else c2.setRGB(0.6 + R() * 0.2, 0.4, 1.0); }
        else if (k === 'pebble' && zn === 'frost') { const v = 1.3 + R() * 0.2; c2.setRGB(v, v, v * 1.05); }
        else if (k === 'pebble' && zn === 'ember') { const v = 0.4 + R() * 0.2; c2.setRGB(v, v * 0.8, v * 0.7); }
        else { const v = 0.8 + R() * 0.3; c2.setRGB(v, v, v); }
      });
    }
  }
  // flames & lights
  for (const o of world.obs) {
    if (o.k === 'torch') { addFlame(scene, out, o.x, 2.55, o.z, 0xff9a3a, 1.1); }
    if (o.k === 'lamp') out.lights.push({ x: o.x, y: 2.8, z: o.z, color: 0xffc070, power: 0.8 });
    if (o.k === 'brazier') { if (o.tint === 'void') addFlame(scene, out, o.x, 1.5, o.z, 0xb06aff, 1.7, 'void'); else addFlame(scene, out, o.x, 1.5, o.z, 0x6aff7a, 1.6, 'green'); }
    if (o.k === 'campfire') { addCampfire(scene, out, o.x, o.z); }
    if (o.k === 'waystone') {
      const gl = glowSprite(0x7ad8ff, 2.2, 0.75); gl.position.set(o.x, 2.4, o.z); scene.add(gl);
      out.flames.push({ s: gl, core: glowSprite(0xffffff, 0.1, 0), base: 1.3, seed: Math.random() * 10 });
      out.lights.push({ x: o.x, y: 2.6, z: o.z, color: 0x7ad8ff, power: 0.7 });
      out.emitters.push({ x: o.x, y: 1.2, z: o.z, kind: 'waystone' });
    }
  }
  // town buildings
  for (const o of world.obs) {
    if (o.k === 'hall' || o.k === 'house' || o.k === 'inn' || o.k === 'forge') scene.add(building(o, out));
    if (o.k === 'stall') scene.add(stall(o));
    if (o.k === 'anvil') { const a = mesh(new THREE.BoxGeometry(0.9, 0.45, 0.4), M('#2c2c32', { m: 0.6, r: 0.4 }), o.x, 0.55, o.z); const b = mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), M('#3a2a1c'), o.x, 0.17, o.z); a.castShadow = true; scene.add(a, b); }
    if (o.k === 'throne') scene.add(throne(o));
  }
  buildDungeons(scene, world, out);
  // fountain
  {
    const g = new THREE.Group();
    const basin = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.7, 14), M('#77706a'), 0, 0.35, 0); basin.castShadow = true; basin.receiveShadow = true;
    const water = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 14), M('#3a78a8', { e: '#163a60', r: 0.15, m: 0.2 }), 0, 0.62, 0);
    const pillar = mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.8, 8), M('#8a8278'), 0, 1.2, 0);
    const bowl = mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.35, 10), M('#8a8278'), 0, 2.1, 0);
    g.add(basin, water, pillar, bowl); scene.add(g);
    out.water = water;
    out.emitters.push({ x: 0, y: 2.3, z: 0, kind: 'fountain' });
    out.lights.push({ x: 0, y: 2.5, z: 0, color: 0x7ab8ff, power: 0.6 });
  }
  // boss arena: rune circle
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 6.4, 48), new THREE.MeshBasicMaterial({ color: 0x5aff8a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(BOSS_ARENA.x - 3, 0.04, BOSS_ARENA.z); scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(7, 7.5, 6), new THREE.MeshBasicMaterial({ color: 0xb06aff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.set(BOSS_ARENA2.x - 3, 0.04, BOSS_ARENA2.z); scene.add(ring2);
    const ring3 = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.5, 6), ring2.material);
    ring3.rotation.x = -Math.PI / 2; ring3.rotation.z = Math.PI / 6; ring3.position.copy(ring2.position); ring3.position.y = 0.045; scene.add(ring3);
    out.bossRing = ring; out.bossRing2 = ring2; out.bossRing3 = ring3;
  }
  return out;
}
function addFlame(scene, out, x, y, z, color, size, kind = 'fire') {
  const s = glowSprite(color, size * 1.6, 0.9); s.position.set(x, y, z); scene.add(s);
  const core = glowSprite(0xfff0c0, size * 0.6, 0.9); core.position.set(x, y - 0.05, z); scene.add(core);
  out.flames.push({ s, core, base: size, seed: Math.random() * 10 });
  out.lights.push({ x, y, z, color, power: 1 });
  out.emitters.push({ x, y, z, kind: kind === 'green' ? 'greenfire' : kind === 'void' ? 'voidfire' : 'ember' });
}
function addCampfire(scene, out, x, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), M('#3a2618'), 0, 0.12, 0); l.rotation.set(Math.PI / 2, 0, i * Math.PI / 4); g.add(l); }
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.add(mesh(new THREE.DodecahedronGeometry(0.2, 0), M('#55504a'), Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75)); }
  g.position.set(x, 0, z); scene.add(g);
  addFlame(scene, out, x, 0.6, z, 0xff7a20, 1.4);
  out.emitters.push({ x, y: 0.5, z, kind: 'campfire' });
}
function building(o, out) {
  const g = new THREE.Group();
  const w = o.hw * 2, d = o.hd * 2, h = o.k === 'hall' || o.k === 'inn' ? 3.6 : 3.0;
  const TR = { frosthaven: ['#8a8f98', '#e8eef4'], cinderwatch: ['#5a4a42', '#3a3234'], mirebrook: ['#8a7a5a', '#7a6a3a'] }[o.town];
  const wallC = TR ? TR[0] : o.k === 'forge' ? '#7a6e62' : '#a8927a', roofC = TR ? TR[1] : o.k === 'hall' ? '#9a3f30' : o.k === 'inn' ? '#4f6a8a' : o.k === 'forge' ? '#5e5a58' : '#8a5a34';
  const walls = mesh(new THREE.BoxGeometry(w, h, d), M(wallC), 0, h / 2, 0); walls.castShadow = true; walls.receiveShadow = true;
  const beams = mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), M('#3a2a1c'), 0, h - 0.1, 0);
  const base = mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), M('#5a544c'), 0, 0.2, 0);
  // ridge runs north-south so the low western sun lights one slope and not the other
  const roofGeo = prism(d + 0.8, 2.2, w + 0.8); roofGeo.rotateY(Math.PI / 2);
  const roof = mesh(roofGeo, M(roofC), 0, h, 0); roof.castShadow = true;
  g.add(walls, beams, base, roof);
  // door + glowing windows face the plaza
  const face = new THREE.Group();
  face.add(mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), M('#2a1a10'), 0, 0.95, 0));
  for (const sx of [-1, 1]) face.add(mesh(new THREE.BoxGeometry(0.75, 0.7, 0.1), M('#ffb760', { e: '#ff9a30', ei: 1.4 }), sx * (w / 2 - 1.0 > 1.2 ? w / 2 - 1.0 : 1.3), 1.8, 0));
  const tc = TOWN_BY_ID[o.town] || { x: 0, z: 0 };
  const toCenterX = -Math.sign(o.x - tc.x), toCenterZ = -Math.sign(o.z - tc.z);
  // pick the side facing the plaza along z (buildings sit at the corners)
  face.position.set(0, 0, toCenterZ * (d / 2 + 0.05));
  if (toCenterZ < 0) face.rotation.y = Math.PI;
  g.add(face);
  if (o.k === 'forge') {
    const ch = mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), M('#4a4440'), w / 2 - 0.8, h + 1.2, 0); g.add(ch);
    out.emitters.push({ x: o.x + w / 2 - 0.8, y: h + 2.6, z: o.z, kind: 'smoke' });
    out.lights.push({ x: o.x + toCenterX * 0, y: 1.5, z: o.z + toCenterZ * (d / 2 + 1), color: 0xff7a2a, power: 1.1 });
  }
  if (o.k === 'inn') { const sign = mesh(new THREE.BoxGeometry(1.2, 0.6, 0.08), M('#6a4a2a'), -1.6, 2.6, toCenterZ * (d / 2 + 0.5)); g.add(sign); }
  // corner posts give the walls a timber-frame look
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, h, 0.3), M('#4a3424'), sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)));
  g.position.set(o.x, 0, o.z);
  // every material can fade when the hero walks behind the building
  g.traverse((m) => { if (m.isMesh) { m.material.transparent = true; m.material.userData.fade = true; } });
  out.buildings.push({ g, o, fade: 1 });
  return g;
}
function stall(o) {
  // built along x, then turned so the counter faces the plaza
  const g = new THREE.Group(); const L = Math.max(o.hw, o.hd), W = Math.min(o.hw, o.hd);
  g.add(mesh(new THREE.BoxGeometry(L * 2, 0.9, W * 2), M('#5a4130'), 0, 0.45, 0));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 4), M('#3a2a1c'), sx * (L - 0.1), 1.2, -W + 0.1));
  for (let i = 0; i < 4; i++) {
    const c = mesh(new THREE.BoxGeometry(L * 2 / 4 + 0.02, 0.06, W * 2 + 0.5), M(i % 2 ? '#d8c8a8' : (o.x < 0 ? '#7a2a26' : '#2a4a6a')), -L + (i + 0.5) * (L * 2 / 4), 2.3, 0.1);
    c.rotation.x = 0.25; c.castShadow = true; g.add(c);
  }
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), M(['#a86a2a', '#6a8a3a', '#c8b07a', '#7a3a5a', '#3a6a7a'][i]), -L + 0.4 + i * (L * 2 - 0.8) / 4, 1.02, 0));
  g.position.set(o.x, 0, o.z);
  if (o.hd > o.hw) g.rotation.y = o.x < 0 ? -Math.PI / 2 : Math.PI / 2;
  return g;
}
function throne(o) {
  const g = new THREE.Group();
  const m = M('#2a2430');
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.6, 3.6), m, 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 4.5, 2.6), m, -1.0, 2.5, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.25, 1.2, 4), M('#4a3f2a', { m: 0.4 }), -1.0, 5.2, s * 0.9));
  g.position.set(o.x, 0, o.z);
  return g;
}

// ---------------------------------------------------------------- dungeons
export const DTHEME = {
  earth: { wall: '#5e4c3a', top: '#3a2e24', floor: '#4a3c2e', floor2: '#5a4a38', light: 0xffa050 },
  bone: { wall: '#5e5a66', top: '#38343e', floor: '#3e3a44', floor2: '#4c4852', light: 0x9affb0 },
  ice: { wall: '#8aa2bc', top: '#d8e6f4', floor: '#5a6a7e', floor2: '#6e8094', light: 0x9ad8ff },
  lava: { wall: '#3e2e2a', top: '#241a18', floor: '#2e2220', floor2: '#4a2a1e', light: 0xff7a2a },
  moss: { wall: '#4a5a48', top: '#2e3a2c', floor: '#33402f', floor2: '#3e4c38', light: 0xb0ff9a },
};
function buildDungeons(scene, world, out) {
  const d3 = new THREE.Object3D(), col = new THREE.Color();
  const floorGeo = new THREE.BoxGeometry(DNG_TILE, 0.2, DNG_TILE); floorGeo.translate(0, -0.1, 0);
  const wallGeo = merge([part(new THREE.BoxGeometry(DNG_TILE, 2.6, DNG_TILE), '#ffffff', T(0, 1.3, 0)), part(new THREE.BoxGeometry(DNG_TILE + 0.06, 0.25, DNG_TILE + 0.06), '#9a9a9a', T(0, 2.68, 0))]);
  const sconce = merge([part(new THREE.BoxGeometry(0.16, 0.5, 0.16), '#2a2420', T(0, 1.9, 0)), part(new THREE.CylinderGeometry(0.16, 0.08, 0.22, 6), '#2a2420', T(0, 2.2, 0.1))]);
  for (const d of DLEVELS) {
    const D = world.dungeons[d.i], th = DTHEME[d.theme];
    // floor
    const tiles = []; for (let z = 0; z < DNG_TILES; z++) for (let x = 0; x < DNG_TILES; x++) if (D.floor[x + z * DNG_TILES]) tiles.push([x, z]);
    const fm = new THREE.InstancedMesh(floorGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), tiles.length);
    const f1 = new THREE.Color(th.floor), f2 = new THREE.Color(th.floor2);
    tiles.forEach(([x, z], i) => {
      d3.position.set(d.ox + x * DNG_TILE + 1, 0, d.oz + z * DNG_TILE + 1); d3.rotation.set(0, 0, 0); d3.scale.set(0.97, 1, 0.97); d3.updateMatrix(); fm.setMatrixAt(i, d3.matrix);
      col.copy(f1).lerp(f2, hash(x, z)).multiplyScalar(0.85 + hash(z * 3, x * 7) * 0.3);
      if (d.theme === 'lava' && hash(x * 5, z * 11) > 0.93) col.set('#c8400c');
      fm.setColorAt(i, col);
    });
    fm.receiveShadow = true; fm.computeBoundingSphere(); scene.add(fm);
    // a dark slab under everything so gaps never show the sky
    const under = new THREE.Mesh(new THREE.PlaneGeometry(DNG_TILES * DNG_TILE + 20, DNG_TILES * DNG_TILE + 20), new THREE.MeshBasicMaterial({ color: 0x050407 }));
    under.rotation.x = -Math.PI / 2; under.position.set(d.ox + DNG_TILES, -0.25, d.oz + DNG_TILES); scene.add(under);
    // walls
    const walls = world.obs.filter((o) => o.k === 'dwall' && o.dng === d.i);
    const wm = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), walls.length);
    const wc = new THREE.Color(th.wall);
    const full = [], cut = [];
    walls.forEach((o, i) => {
      const hy = 0.92 + hash(o.tx, o.tz) * 0.2;
      d3.position.set(o.x, 0, o.z); d3.scale.set(1, 0.18, 1); d3.updateMatrix(); cut.push(d3.matrix.clone());
      d3.scale.set(1, hy, 1); d3.updateMatrix(); wm.setMatrixAt(i, d3.matrix); full.push(d3.matrix.clone());
      col.copy(wc).multiplyScalar(0.8 + hash(o.tz * 5, o.tx * 3) * 0.35); wm.setColorAt(i, col);
    });
    wm.castShadow = true; wm.receiveShadow = true; wm.computeBoundingSphere(); scene.add(wm);
    (out.dwalls = out.dwalls || [])[d.i] = { im: wm, walls, full, cut, low: new Set() };
    // torches on the walls
    const torches = world.obs.filter((o) => o.k === 'wtorch' && o.dng === d.i);
    const tm = new THREE.InstancedMesh(sconce, new THREE.MeshLambertMaterial({ vertexColors: true }), torches.length);
    torches.forEach((o, i) => { d3.position.set(o.x, 0, o.z); d3.scale.set(1, 1, 1); d3.updateMatrix(); tm.setMatrixAt(i, d3.matrix); tm.setColorAt(i, col.setRGB(1, 1, 1)); addFlame(scene, out, o.x, 2.45, o.z + 0.15, th.light, 0.9, d.theme === 'bone' ? 'green' : 'fire'); });
    tm.computeBoundingSphere(); scene.add(tm);
  }
  // stairs up (inside) and stairs down (in the realm)
  for (const o of world.obs) {
    if (o.k === 'dexit') {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(1.8 - i * 0.25, 0.22, 1.8 - i * 0.25), M('#8a8478'), 0, 0.11 + i * 0.22, 0));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 3; g.add(beam);
      const gl = glowSprite(0xbfe6ff, 2.6, 0.7); gl.position.y = 1.2; g.add(gl);
      g.position.set(o.x, 0, o.z); scene.add(g);
      out.lights.push({ x: o.x, y: 2, z: o.z, color: 0xbfe6ff, power: 0.8 });
      out.emitters.push({ x: o.x, y: 0.9, z: o.z, kind: 'waystone' });
    }
    if (o.k === 'ddown') {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 3.0), M('#3a3430'), 0, 0.12, 0));
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.27, 2.2), M('#050404'), 0, 0.13, 0));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(2.2, 0.08, 0.4), M('#4a4440'), 0, 0.24 - i * 0.05, 0.8 - i * 0.45));
      const gl = glowSprite(0xff8a3a, 3.2, 0.55); gl.position.y = 0.4; g.add(gl);
      g.position.set(o.x, 0, o.z); scene.add(g);
      out.lights.push({ x: o.x, y: 1, z: o.z, color: 0xff8a3a, power: 0.8 });
      out.emitters.push({ x: o.x, y: 0.3, z: o.z, kind: 'ember' });
    }
    if (o.k === 'dentr') {
      const g = new THREE.Group(); const st = M('#6a6460'), dk = M('#0a0808');
      g.add(mesh(new THREE.BoxGeometry(4.8, 0.3, 3.0), M('#4a4440'), 0, 0.15, 0));
      g.add(mesh(new THREE.BoxGeometry(3.4, 0.32, 2.4), dk, 0, 0.17, 0.1));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(3.2, 0.12, 0.42), M('#3a3430'), 0, 0.28 - i * 0.06, 1.0 - i * 0.48));
      for (const sx of [-1, 1]) { const pl = mesh(new THREE.BoxGeometry(0.7, 3.4, 0.7), st, sx * 2.0, 1.7, -0.9); pl.castShadow = true; g.add(pl); }
      const lin = mesh(new THREE.BoxGeometry(4.9, 0.7, 0.9), st, 0, 3.6, -0.9); lin.castShadow = true; g.add(lin);
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1), M('#c84a2a', { e: '#5a1a0a' }), 0, 3.6, -0.43));
      g.position.set(o.x, 0, o.z); scene.add(g);
      for (const sx of [-1, 1]) addFlame(scene, out, o.x + sx * 2.0, 3.65, o.z - 0.4, 0xff9a3a, 1.0);
      out.emitters.push({ x: o.x, y: 0.4, z: o.z + 0.3, kind: 'smoke' });
    }
  }
}

// ---------------------------------------------------------------- breakables
const PROP_GEO = () => ({
  barrel: merge([part(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), '#7a5230', T(0, 0.5, 0, 0, 0, 0, 1, 1, 1)), part(new THREE.CylinderGeometry(0.47, 0.47, 0.18, 10), '#8a6a3a', T(0, 0.5, 0)), part(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 10), '#3a3430', T(0, 0.18, 0)), part(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 10), '#3a3430', T(0, 0.82, 0)), part(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 10), '#5a3a20', T(0, 1.01, 0))]),
  crate: merge([part(new THREE.BoxGeometry(0.9, 0.85, 0.9), '#9a7848', T(0, 0.43, 0)), part(new THREE.BoxGeometry(0.96, 0.12, 0.96), '#6a4a28', T(0, 0.82, 0)), part(new THREE.BoxGeometry(0.96, 0.12, 0.96), '#6a4a28', T(0, 0.06, 0)), part(new THREE.BoxGeometry(0.1, 0.85, 0.96), '#6a4a28', T(0, 0.43, 0, 0, 0, 0.75)), part(new THREE.BoxGeometry(0.96, 0.85, 0.1), '#6a4a28', T(0, 0.43, 0, 0, 0, 0)) ]),
  urn: merge([part(new THREE.SphereGeometry(0.38, 9, 6), '#a8643a', T(0, 0.45, 0, 0, 0, 0, 1, 1.15, 1)), part(new THREE.CylinderGeometry(0.17, 0.22, 0.28, 9), '#a8643a', T(0, 0.92, 0)), part(new THREE.CylinderGeometry(0.24, 0.17, 0.08, 9), '#8a4a2a', T(0, 1.08, 0)), part(new THREE.CylinderGeometry(0.39, 0.39, 0.09, 9), '#d8b878', T(0, 0.5, 0)), part(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 9), '#6a3a1a', T(0, 0.05, 0))]),
  bones: merge([part(new THREE.IcosahedronGeometry(0.55, 0), '#cfc6ae', T(0, 0.15, 0, 0, 0, 0, 1.3, 0.45, 1.1)), part(new THREE.IcosahedronGeometry(0.18, 1), '#e8e0cc', T(0.15, 0.48, 0.1)), part(new THREE.BoxGeometry(0.1, 0.08, 0.06), '#1a1410', T(0.1, 0.5, 0.26)), part(new THREE.BoxGeometry(0.1, 0.08, 0.06), '#1a1410', T(0.24, 0.5, 0.24)), part(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 4), '#ddd4bc', T(-0.2, 0.35, -0.1, 0.3, 0, 1.2)), part(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4), '#ddd4bc', T(0.2, 0.3, -0.3, -0.4, 0.6, 1.4)), part(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 4), '#ddd4bc', T(-0.35, 0.25, 0.3, 0.2, -0.8, 1.5))]),
  sarc: merge([part(new THREE.BoxGeometry(0.95, 0.7, 2.1), '#7a7482', T(0, 0.35, 0)), part(new THREE.BoxGeometry(1.05, 0.18, 2.2), '#8e8898', T(0, 0.78, 0)), part(new THREE.BoxGeometry(0.5, 0.12, 1.5), '#a8a2b0', T(0, 0.92, 0)), part(new THREE.IcosahedronGeometry(0.2, 1), '#a8a2b0', T(0, 0.98, 0.75)), part(new THREE.BoxGeometry(1.1, 0.12, 2.25), '#4a4652', T(0, 0.06, 0))]),
  trove: merge([part(new THREE.BoxGeometry(1.2, 0.65, 0.8), '#5a3416', T(0, 0.33, 0)), part(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI), '#6a3e1c', T(0, 0.65, 0, 0, 0, Math.PI / 2)), part(new THREE.BoxGeometry(1.26, 0.1, 0.86), '#e8b830', T(0, 0.63, 0)), part(new THREE.BoxGeometry(0.1, 0.72, 0.86), '#e8b830', T(-0.42, 0.38, 0)), part(new THREE.BoxGeometry(0.1, 0.72, 0.86), '#e8b830', T(0.42, 0.38, 0)), part(new THREE.BoxGeometry(0.22, 0.26, 0.06), '#ffe080', T(0, 0.58, 0.42)), part(new THREE.CylinderGeometry(0.4, 0.4, 0.09, 8, 1, false, 0, Math.PI), '#e8b830', T(0, 0.65, 0, 0, 0, Math.PI / 2, 1, 1, 1))]),
});
// One instanced mesh per kind; a broken prop is hidden by scaling its instance to zero.
export function buildProps(scene, props) {
  const geo = PROP_GEO(); const byKind = {}; const handles = [];
  for (const pr of props) (byKind[pr.k] = byKind[pr.k] || []).push(pr);
  const d3 = new THREE.Object3D(), col = new THREE.Color();
  for (const k in byKind) {
    const list = byKind[k];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: k === 'trove' ? 0x2a1a00 : 0x000000 });
    const im = new THREE.InstancedMesh(geo[k], mat, list.length);
    im.castShadow = true; im.receiveShadow = true;
    const mats = [];
    list.forEach((pr, i) => {
      d3.position.set(pr.x, 0, pr.z); d3.rotation.set(0, pr.rot, 0);
      const s = k === 'trove' ? 1.05 : 0.9 + (pr.rot % 1) * 0.25; d3.scale.set(s, s, s); d3.updateMatrix();
      const m = d3.matrix.clone(); mats.push(m); im.setMatrixAt(i, m);
      const v = 0.85 + ((pr.rot * 7) % 1) * 0.3;
      if (pr.zone === 'frost') col.setRGB(v * 1.05, v * 1.1, v * 1.2); else if (pr.zone === 'ember') col.setRGB(v * 0.8, v * 0.65, v * 0.6); else if (pr.zone === 'spire') col.setRGB(v * 0.85, v * 0.75, v * 1.05); else col.setRGB(v, v, v);
      im.setColorAt(i, col);
      handles[pr.id] = { im, i, m };
    });
    im.computeBoundingSphere();
    scene.add(im);
    if (k === 'trove') for (const pr of list) { const gl = glowSprite(0xffc040, 1.6, 0.35); gl.position.set(pr.x, 0.8, pr.z); scene.add(gl); handles[pr.id].glow = gl; }
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    setBroken(id, broken) {
      const h = handles[id]; if (!h || h.broken === broken) return;
      h.broken = broken; h.im.setMatrixAt(h.i, broken ? zero : h.m); h.im.instanceMatrix.needsUpdate = true;
      if (h.glow) h.glow.visible = !broken;
    },
  };
}

// ---------------------------------------------------------------- characters
// A rig is { root, body, legs[], arms[], armR, armL, head, weapon, mats[], h, kind }
function biped(o) {
  const mats = [];
  const mk = (c, opts) => { const m = M(c, opts); mats.push(m); return m; };
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const sc = o.scale || 1;
  const thin = o.thin ? 0.6 : 1;
  const legs = [], arms = [];
  if (o.robe) {
    const robe = mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.15, 8), mk(o.legs), 0, 0.58, 0); body.add(robe);
  } else {
    for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(s * 0.15, 0.95, 0);
      p.add(mesh(new THREE.BoxGeometry(0.22 * thin, 0.75, 0.24 * thin), mk(o.legs), 0, -0.38, 0));
      p.add(mesh(new THREE.BoxGeometry(0.25 * thin, 0.22, 0.32), mk(o.boots || '#2a2018'), 0, -0.84, 0.03));
      body.add(p); legs.push(p);
    }
  }
  const torsoW = (o.bulk ? 0.78 : 0.6) * (o.thin ? 0.75 : 1);
  const torso = mesh(new THREE.BoxGeometry(torsoW, 0.72, 0.34 * (o.thin ? 0.7 : 1)), mk(o.torso), 0, 1.32, 0); body.add(torso);
  if (o.thin) for (let i = 0; i < 3; i++) body.add(mesh(new THREE.BoxGeometry(torsoW + 0.06, 0.05, 0.3), mk('#bdb6a2'), 0, 1.15 + i * 0.16, 0));
  if (o.belt) body.add(mesh(new THREE.BoxGeometry(torsoW + 0.04, 0.1, 0.38), mk(o.belt), 0, 1.0, 0));
  if (o.tabard) body.add(mesh(new THREE.BoxGeometry(torsoW * 0.55, 0.9, 0.05), mk(o.tabard), 0, 1.15, 0.19));
  if (o.apron) body.add(mesh(new THREE.BoxGeometry(torsoW * 0.8, 1.0, 0.05), mk(o.apron), 0, 1.0, 0.2));
  if (o.pauldrons) for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), mk(o.pauldrons, { m: 0.5, r: 0.45 }), s * (torsoW / 2 + 0.06), 1.62, 0));
  if (o.cape) { const cp = mesh(new THREE.BoxGeometry(torsoW * 0.95, 1.2, 0.05), mk(o.cape), 0, 1.1, -0.2); cp.rotation.x = 0.08; body.add(cp); }
  const head = new THREE.Group(); head.position.set(0, 1.93, 0); body.add(head);
  const skinM = mk(o.skin);
  const hs = o.headScale || 1;
  head.add(mesh(new THREE.IcosahedronGeometry(0.23 * hs, 1), skinM));
  if (o.eyes) { const em = mk('#000', { e: o.eyes, ei: 2 }); for (const s of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), em, s * 0.08 * hs, 0.02, 0.2 * hs)); }
  if (o.ears) for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.07, 0.36, 4), skinM, s * 0.27, 0.05, 0); e.rotation.z = -s * Math.PI / 2.3; head.add(e); }
  if (o.beard) { const b = mesh(new THREE.ConeGeometry(0.15, 0.45, 6), mk(o.beard), 0, -0.25, 0.12); b.rotation.x = Math.PI + 0.25; head.add(b); }
  if (o.hat === 'helm') { head.add(mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.24, 8), mk('#8d929c', { m: 0.6, r: 0.4 }), 0, 0.08, 0)); head.add(mesh(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mk('#8d929c', { m: 0.6, r: 0.4 }), 0, 0.18, 0)); head.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), mk('#8d929c', { m: 0.6 }), 0, 0.0, 0.25)); head.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.38), mk(o.plume || '#a32a22'), 0, 0.46, -0.04)); }
  if (o.hat === 'wizard') { head.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), mk(o.hatC), 0, 0.14, 0)); const c = mesh(new THREE.ConeGeometry(0.24, 0.75, 8), mk(o.hatC), 0, 0.5, -0.04); c.rotation.x = -0.15; head.add(c); }
  if (o.hat === 'hood') { const hd = mesh(new THREE.ConeGeometry(0.31, 0.62, 7), mk(o.hatC), 0, 0.17, -0.05); hd.rotation.x = -0.25; head.add(hd); }
  if (o.hat === 'crown') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; head.add(mesh(new THREE.ConeGeometry(0.05, 0.28, 4), mk('#c9a23a', { m: 0.7, r: 0.3, e: '#3a2a00' }), Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2)); }
  if (o.hat === 'bald') head.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), mk(o.beard || '#5a3a20'), 0, 0.14, 0.18));
  const armW = 0.18 * (o.thin ? 0.7 : 1) * (o.bulk ? 1.25 : 1);
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(s * (torsoW / 2 + 0.1), 1.62, 0);
    p.add(mesh(new THREE.BoxGeometry(armW, 0.68 * (o.longArms ? 1.35 : 1), armW), mk(o.arms || o.torso), 0, -0.32 * (o.longArms ? 1.35 : 1), 0));
    p.add(mesh(new THREE.IcosahedronGeometry(0.09, 0), skinM, 0, -0.7 * (o.longArms ? 1.35 : 1), 0));
    body.add(p); arms.push(p);
  }
  const armR = arms[1], armL = arms[0];
  const hand = new THREE.Group(); hand.position.set(0, -0.7 * (o.longArms ? 1.35 : 1), 0); armR.add(hand);
  const lhand = new THREE.Group(); lhand.position.set(0, -0.7, 0); armL.add(lhand);
  let weapon = null;
  const W = o.weapon;
  if (W === 'sword' || W === 'dagger' || W === 'greatsword') {
    const len = W === 'dagger' ? 0.45 : W === 'greatsword' ? 1.6 : 1.0;
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.BoxGeometry(0.07, len, 0.14), mk(o.blade || '#c9ced6', { m: 0.7, r: 0.3, e: o.bladeGlow || '#000' }), 0, len / 2 + 0.12, 0));
    weapon.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.34), mk('#b48d55', { m: 0.6 }), 0, 0.1, 0));
    weapon.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5), mk('#4a2a1a'), 0, 0, 0));
    weapon.rotation.x = Math.PI / 2 - 0.25; hand.add(weapon);
  } else if (W === 'wand') {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.8, 5), mk('#d8d0bc'), 0, 0.3, 0));
    weapon.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), mk('#e8e0cc', { e: '#2a5a3a' }), 0, 0.75, 0));
    const gl = glowSprite(o.orb || '#7affa0', 0.7, 0.7); gl.position.y = 0.8; weapon.add(gl);
    weapon.rotation.x = Math.PI / 2 - 0.25; hand.add(weapon);
  } else if (W === 'axe') {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5), mk('#4a2a1a'), 0, 0.3, 0));
    weapon.add(mesh(new THREE.BoxGeometry(0.06, 0.35, 0.3), mk('#9aa0a8', { m: 0.6 }), 0, 0.65, 0.12));
    weapon.rotation.x = Math.PI / 2 - 0.25; hand.add(weapon);
  } else if (W === 'staff') {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 6), mk('#6a4a2a'), 0, 0.3, 0));
    const orb = mesh(new THREE.IcosahedronGeometry(0.13, 1), mk('#000', { e: o.orb || '#7aa8ff', ei: 2.2 }), 0, 1.3, 0); weapon.add(orb);
    weapon.add(glowSprite(o.orb || '#7aa8ff', 0.8, 0.8)); weapon.children[weapon.children.length - 1].position.y = 1.3;
    weapon.rotation.x = 0.15; hand.add(weapon);
  } else if (W === 'bow') {
    weapon = new THREE.Group();
    const bow = mesh(new THREE.TorusGeometry(0.62, 0.035, 4, 12, Math.PI * 0.9), mk('#7a5430')); bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05); weapon.add(bow);
    weapon.add(mesh(new THREE.BoxGeometry(0.01, 1.18, 0.01), mk('#e8dcc4'), 0, 0, -0.13));
    weapon.rotation.x = Math.PI / 2; lhand.add(weapon);
  } else if (W === 'hammer') {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), mk('#4a2a1a'), 0, 0.2, 0));
    weapon.add(mesh(new THREE.BoxGeometry(0.2, 0.18, 0.32), mk('#3a3a40', { m: 0.6 }), 0, 0.55, 0));
    weapon.rotation.x = 0.3; hand.add(weapon);
  } else if (W === 'lantern') {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 6), mk('#5a4028'), 0, 0.3, 0));
    weapon.add(mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), mk('#000', { e: '#ffbb55', ei: 2 }), 0.12, 1.15, 0));
    const gl = glowSprite('#ffb04a', 1.2, 0.9); gl.position.set(0.12, 1.15, 0); weapon.add(gl);
    weapon.rotation.x = 0.1; hand.add(weapon);
  }
  if (o.dual) { const d2w = new THREE.Group(); d2w.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.12), mk(o.blade || '#c9ced6', { m: 0.7, r: 0.3 }), 0, 0.37, 0)); d2w.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), mk('#2a1a14'), 0, 0.02, 0)); d2w.rotation.x = Math.PI / 2 - 0.25; lhand.add(d2w); }
  if (o.sack) { const sk = mesh(new THREE.IcosahedronGeometry(0.42, 1), mk('#7a5a30'), 0, 1.35, -0.42); sk.scale.set(1, 1.15, 0.9); body.add(sk); body.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.18, 6), mk('#5a3a1a'), 0, 1.85, -0.4)); const gl = glowSprite(0xffd040, 1.6, 0.7); gl.position.set(0, 1.9, -0.4); body.add(gl); }
  if (o.mask) head.add(mesh(new THREE.BoxGeometry(0.4, 0.14, 0.1), mk(o.mask), 0, -0.07, 0.19));
  if (o.shield) { const sh = mesh(new THREE.BoxGeometry(0.08, 0.62, 0.5), mk(o.shield, { m: 0.3 }), -0.08, 0.05, 0.05); sh.rotation.x = 0.1; lhand.add(sh); const boss = mesh(new THREE.SphereGeometry(0.08, 6, 4), mk('#b48d55', { m: 0.6 }), -0.13, 0.05, 0.05); lhand.add(boss); }
  root.scale.setScalar(sc);
  for (const c of root.children) c.traverse?.((m) => { if (m.isMesh) m.castShadow = false; });
  return { root, body, legs, arms, armR, armL, head, weapon, mats, h: 2.35 * sc, kind: 'biped', hunch: o.hunch || 0 };
}
export const CLASS_LOOK = {
  warrior: { skin: '#d9a982', torso: '#8b919c', arms: '#8b919c', legs: '#4a4038', boots: '#2a2420', tabard: '#9c2f28', belt: '#3a2618', pauldrons: '#9aa0aa', hat: 'helm', weapon: 'sword', shield: '#6a2a22', cape: '#7a2420' },
  mage: { skin: '#e2b897', torso: '#2c3f8a', arms: '#2c3f8a', legs: '#24336e', robe: true, belt: '#c9a23a', hat: 'wizard', hatC: '#22306a', weapon: 'staff', orb: '#7aa8ff', cape: '#1c2654' },
  ranger: { skin: '#cf9e78', torso: '#3d5a32', arms: '#5a4430', legs: '#4a3a2a', boots: '#3a2a1a', belt: '#2a1c12', hat: 'hood', hatC: '#2f4a28', weapon: 'bow', cape: '#2f4a28' },
};
CLASS_LOOK.paladin = { skin: '#e0b090', torso: '#d8d4c8', arms: '#b8bcc6', legs: '#5a5650', boots: '#3a3430', tabard: '#e8c25a', belt: '#8a6a2a', pauldrons: '#e8d090', hat: 'helm', plume: '#f0e0a0', weapon: 'hammer', shield: '#d8b04a', cape: '#f0e8d0' };
CLASS_LOOK.necro = { skin: '#c8c0b0', torso: '#1e2a24', arms: '#1e2a24', legs: '#141c18', robe: true, belt: '#6a8a6a', pauldrons: '#d8d0bc', hat: 'hood', hatC: '#182420', weapon: 'wand', orb: '#7affa0', eyes: '#7affa0', cape: '#101814' };
CLASS_LOOK.assassin = { skin: '#c89a78', torso: '#2a2232', arms: '#2a2232', legs: '#201a28', boots: '#141018', belt: '#6a3a8a', hat: 'hood', hatC: '#1e1828', mask: '#3a2a4a', weapon: 'dagger', dual: true, blade: '#d0c8f0', cape: '#2a1a3a', thin: false };
export function makePlayerModel(cls) { return biped(CLASS_LOOK[cls] || CLASS_LOOK.warrior); }
const NPC_LOOK = {
  frost: { elder: { skin: '#e0b898', torso: '#5a6a7a', arms: '#8a96a4', legs: '#3a4450', boots: '#2a2420', pauldrons: '#c8d0da', hat: 'helm', plume: '#3a6a9a', weapon: 'sword', shield: '#3a5a7a', cape: '#e8eef4' },
    smith: { skin: '#d8a882', torso: '#8a7a64', arms: '#d8a882', legs: '#4a3a2a', boots: '#2a2018', apron: '#e8e0d0', bulk: true, hat: 'hood', hatC: '#c8c0b0', beard: '#c8a070', weapon: 'axe' } },
  ember: { elder: { skin: '#c88a64', torso: '#3a2e2a', arms: '#c88a64', legs: '#2a2420', boots: '#1a1410', apron: '#5a2a1a', bulk: true, hat: 'bald', beard: '#5a2a14', weapon: 'hammer' },
    smith: { skin: '#d8b090', torso: '#7a2a1a', arms: '#7a2a1a', legs: '#5a1e14', robe: true, belt: '#e8a030', hat: 'wizard', hatC: '#5a1e14', weapon: 'staff', orb: '#ffb040', cape: '#3a140c' } },
  mire: { elder: { skin: '#c8a888', torso: '#4a5a3e', arms: '#4a5a3e', legs: '#3a4430', robe: true, belt: '#6a4a2a', hat: 'hood', hatC: '#3a4a2e', beard: '#d8d8c8', weapon: 'lantern', cape: '#2a3420' },
    smith: { skin: '#e8c8a8', torso: '#3a4a6a', arms: '#3a4a6a', legs: '#2a3450', robe: true, belt: '#c8b0ff', hat: 'hood', hatC: '#4a3a6a', weapon: 'staff', orb: '#d8b0ff', cape: '#2a2440' } },
};
export function makeNpcModel(kind, look) {
  if (look && NPC_LOOK[look]) return biped(NPC_LOOK[look][kind]);
  if (kind === 'elder') return biped({ skin: '#d8b090', torso: '#4a5068', arms: '#4a5068', legs: '#3a3f55', robe: true, belt: '#8a6a3a', hat: 'hood', hatC: '#3a3f55', beard: '#e8e2d6', weapon: 'lantern', cape: '#2a2f45' });
  return biped({ skin: '#c99a76', torso: '#6a5444', arms: '#c99a76', legs: '#3a2f28', boots: '#1f1812', apron: '#4a3020', bulk: true, hat: 'bald', beard: '#7a4a24', weapon: 'hammer' });
}
function quad(o) {
  const mats = []; const mk = (c, opts) => { const m = M(c, opts); mats.push(m); return m; };
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const legs = [];
  const bm = mk(o.color);
  if (o.boar) {
    const torso = mesh(new THREE.IcosahedronGeometry(0.62, 1), bm, 0, 0.78, 0); torso.scale.set(1, 0.85, 1.45); body.add(torso);
    for (let i = 0; i < 5; i++) { const c = mesh(new THREE.ConeGeometry(0.07, 0.3, 4), mk('#2a1a10'), 0, 1.3, -0.5 + i * 0.25); body.add(c); }
  } else {
    body.add(mesh(new THREE.BoxGeometry(0.46, 0.46, 1.15), bm, 0, 0.78, 0));
    body.add(mesh(new THREE.BoxGeometry(0.52, 0.55, 0.45), bm, 0, 0.85, 0.35));
    const tail = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), bm, 0, 0.9, -0.75); tail.rotation.x = 0.6; body.add(tail);
  }
  const head = new THREE.Group(); head.position.set(0, o.boar ? 0.75 : 1.0, o.boar ? 0.95 : 0.75); body.add(head);
  head.add(mesh(new THREE.BoxGeometry(o.boar ? 0.5 : 0.36, o.boar ? 0.45 : 0.34, 0.45), bm));
  head.add(mesh(new THREE.BoxGeometry(o.boar ? 0.32 : 0.2, o.boar ? 0.26 : 0.16, 0.3), mk(o.snout || o.color), 0, -0.06, 0.32));
  const eyes = mk('#000', { e: o.eyes || '#ffcc33', ei: 2 });
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), eyes, s * 0.12, 0.08, 0.23));
    if (o.boar) { const t = mesh(new THREE.ConeGeometry(0.04, 0.25, 4), mk('#efe6d0'), s * 0.15, -0.08, 0.45); t.rotation.x = -1.1; head.add(t); }
    else { const e = mesh(new THREE.ConeGeometry(0.07, 0.2, 4), bm, s * 0.11, 0.24, -0.05); head.add(e); }
  }
  if (o.mane) for (let i = 0; i < 4; i++) { const c = mesh(new THREE.ConeGeometry(0.09, 0.32, 4), mk(o.mane, o.maneGlow ? { e: o.mane, ei: 1.4 } : undefined), 0, 1.15, 0.45 - i * 0.22); c.rotation.x = -0.5; body.add(c); }
  const lh = o.boar ? 0.5 : 0.62;
  for (const [x, z, ph] of [[-0.18, 0.4, 0], [0.18, 0.4, Math.PI], [-0.18, -0.42, Math.PI], [0.18, -0.42, 0]]) {
    const p = new THREE.Group(); p.position.set(x, lh, z); p.userData.ph = ph;
    p.add(mesh(new THREE.BoxGeometry(0.13, lh, 0.15), bm, 0, -lh / 2, 0));
    body.add(p); legs.push(p);
  }
  root.scale.setScalar(o.scale || 1);
  return { root, body, legs, arms: [], head, mats, h: 1.5 * (o.scale || 1), kind: 'quad' };
}
function spider(o = {}) {
  const mats = []; const mk = (c, opts) => { const m = M(c, opts); mats.push(m); return m; };
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const bm = mk(o.color || '#2e2232');
  body.add(mesh(new THREE.IcosahedronGeometry(0.34, 1), bm, 0, 0.6, 0.25));
  const ab = mesh(new THREE.IcosahedronGeometry(0.6, 1), mk(o.belly || '#3a2440'), 0, 0.8, -0.5); ab.scale.set(1, 0.85, 1.15); body.add(ab);
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.4), mk(o.mark || '#8a2a3a', o.markGlow ? { e: o.mark, ei: 1.2 } : undefined), 0, 1.25, -0.5));
  if (o.spikes) for (let i = 0; i < 5; i++) { const c = mesh(new THREE.ConeGeometry(0.06, 0.35, 4), mk(o.spikes), (i - 2) * 0.16, 1.2, -0.45 - Math.abs(i - 2) * 0.08); body.add(c); }
  const eyes = mk('#000', { e: o.eyes || '#ff2a2a', ei: 2.5 });
  for (let i = 0; i < 4; i++) body.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), eyes, -0.09 + (i % 2) * 0.18, 0.66 + Math.floor(i / 2) * 0.07, 0.57));
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4;
    const p = new THREE.Group(); p.position.set(s * 0.25, 0.65, 0.4 - k * 0.25); p.userData.ph = (k % 2 ? Math.PI : 0) + (s > 0 ? Math.PI : 0);
    const up = mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), bm, s * 0.3, 0.18, 0); up.rotation.z = s * 0.6; p.add(up);
    const lo = mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), bm, s * 0.6, -0.12, 0); lo.rotation.z = s * 0.25; p.add(lo);
    p.rotation.y = s * (k - 1.5) * 0.35;
    body.add(p); legs.push(p);
  }
  root.scale.setScalar(o.scale || 1);
  return { root, body, legs, arms: [], head: null, mats, h: 1.4 * (o.scale || 1), kind: 'spider' };
}
export function makeMonsterModel(type) {
  switch (type) {
    case 'wolf': return quad({ color: '#5d616e', snout: '#4a4d58' });
    case 'boar': return quad({ color: '#6e4630', snout: '#c08a7a', boar: true, eyes: '#ff5533' });
    case 'spider': return spider();
    case 'frostwolf': return quad({ color: '#c8d4e0', snout: '#a8b4c4', eyes: '#7ae0ff', mane: '#eef6ff', scale: 1.1 });
    case 'hound': return quad({ color: '#2a2422', snout: '#3a302a', eyes: '#ff7a1a', mane: '#ff5a10', maneGlow: true, scale: 1.12 });
    case 'lurker': return spider({ color: '#3a4a2a', belly: '#4a5a2e', mark: '#6a8a3a', eyes: '#d8ff4a', scale: 0.95 });
    case 'horror': return spider({ color: '#2a2a34', belly: '#3a3448', mark: '#4a6a5a', eyes: '#6affc8', spikes: '#c8c0a8', scale: 1.35 });
    case 'yeti': return biped({ skin: '#dfe6ee', torso: '#e8eef4', arms: '#e8eef4', legs: '#d0d8e2', boots: '#9aa4b0', bulk: true, longArms: true, hunch: 0.35, eyes: '#5ad0ff', scale: 1.55 });
    case 'wraith': return biped({ skin: '#bfe0ff', torso: '#8ab0d8', arms: '#a8c8e8', legs: '#6a90b8', robe: true, thin: true, hat: 'hood', hatC: '#5a7aa0', weapon: 'staff', orb: '#9ae8ff', eyes: '#c8f4ff', cape: '#4a6a90' });
    case 'imp': return biped({ skin: '#c8401a', torso: '#7a1e10', arms: '#c8401a', legs: '#5a1a10', ears: true, weapon: 'staff', orb: '#ffa020', scale: 0.7, headScale: 1.35, eyes: '#ffe040', hunch: 0.25 });
    case 'brute': return biped({ skin: '#3a2a26', torso: '#2a201e', arms: '#3a2a26', legs: '#2a201e', boots: '#1a1412', bulk: true, pauldrons: '#ff5a10', weapon: 'hammer', eyes: '#ff8a20', hunch: 0.25, scale: 1.5 });
    case 'drowned': return biped({ skin: '#6a8a80', torso: '#3a4a52', arms: '#6a8a80', legs: '#2e3a40', belt: '#5a4a2a', hat: 'hood', hatC: '#2a3a3a', longArms: true, hunch: 0.35, eyes: '#7affd8', weapon: 'dagger', blade: '#6a7a70' });
    case 'voidknight': return biped({ skin: '#2a2236', torso: '#2e2840', arms: '#3a3250', legs: '#241e30', pauldrons: '#6a4ab8', hat: 'helm', plume: '#b06aff', weapon: 'greatsword', blade: '#8a6ae0', bladeGlow: '#4a2a8a', shield: undefined, eyes: '#c08aff', cape: '#3a1a5a', scale: 1.3 });
    case 'shade': return biped({ skin: '#3a2a50', torso: '#2a1e3a', arms: '#3a2a50', legs: '#1e1430', robe: true, thin: true, hat: 'hood', hatC: '#1e1430', weapon: 'staff', orb: '#c08aff', eyes: '#e0b0ff', cape: '#2a1440' });
    case 'tgoblin': return biped({ skin: '#7aa83a', torso: '#5a3a6a', arms: '#7aa83a', legs: '#3a2a4a', ears: true, sack: true, scale: 0.8, headScale: 1.35, eyes: '#ffe040', hunch: 0.3 });
    case 'skelpet': return biped({ skin: '#e0d8c4', torso: '#cfc8b4', arms: '#e0d8c4', legs: '#e0d8c4', boots: '#c0b8a4', thin: true, weapon: 'sword', blade: '#9aa8a0', shield: '#3a4a3a', eyes: '#7affa0', scale: 0.95 });
    case 'magepet': return biped({ skin: '#e0d8c4', torso: '#2a3a30', arms: '#e0d8c4', legs: '#2a3a30', robe: true, thin: true, hat: 'hood', hatC: '#1e2a24', weapon: 'staff', orb: '#7affa0', eyes: '#7affa0', scale: 0.92 });
    case 'gobking': return biped({ skin: '#6f9a3a', torso: '#8a5a1a', arms: '#6f9a3a', legs: '#4a3a24', ears: true, bulk: true, hat: 'crown', weapon: 'axe', scale: 1.55, headScale: 1.3, eyes: '#ffdd33', hunch: 0.15, cape: '#7a2420' });
    case 'bonelord': return biped({ skin: '#e0d8c4', torso: '#3a2a44', arms: '#e0d8c4', legs: '#2a1e34', robe: true, thin: true, hat: 'crown', weapon: 'staff', orb: '#7aff9a', eyes: '#7aff9a', cape: '#24182e', scale: 1.9 });
    case 'icelord': return biped({ skin: '#cfe4f4', torso: '#dfeefa', arms: '#dfeefa', legs: '#b8cce0', boots: '#7a90a8', bulk: true, longArms: true, hunch: 0.3, hat: 'crown', eyes: '#5ad0ff', scale: 2.2 });
    case 'ashmaw': return biped({ skin: '#2e2220', torso: '#241a18', arms: '#2e2220', legs: '#241a18', boots: '#140e0c', bulk: true, pauldrons: '#ff6a10', hat: 'crown', weapon: 'hammer', eyes: '#ffb020', hunch: 0.2, scale: 2.1 });
    case 'prophet': return biped({ skin: '#7a9a90', torso: '#2e4048', arms: '#7a9a90', legs: '#22343a', robe: true, hat: 'hood', hatC: '#1e3036', weapon: 'staff', orb: '#7affd8', eyes: '#7affd8', longArms: true, cape: '#1a2a2e', scale: 1.95 });
    case 'boss2': return biped({ skin: '#a890d8', torso: '#2a1e44', arms: '#3a2a5a', legs: '#1e1430', robe: true, pauldrons: '#8a5ad8', hat: 'crown', weapon: 'greatsword', blade: '#c0a0ff', bladeGlow: '#6a3ac8', eyes: '#f0c8ff', cape: '#4a1a6a', scale: 2.5 });
    case 'goblin': return biped({ skin: '#5f8f34', torso: '#5a4a32', arms: '#5f8f34', legs: '#4a3a24', ears: true, weapon: 'dagger', scale: 0.72, headScale: 1.3, eyes: '#ffdd33', hunch: 0.2 });
    case 'shaman': return biped({ skin: '#6f9a3a', torso: '#7a2a22', arms: '#6f9a3a', legs: '#4a2a1a', ears: true, weapon: 'staff', orb: '#ff6a2a', scale: 0.75, headScale: 1.3, eyes: '#ff8833', robe: true, hunch: 0.2 });
    case 'skeleton': return biped({ skin: '#ddd6c2', torso: '#c9c2ae', arms: '#ddd6c2', legs: '#ddd6c2', boots: '#bdb6a2', thin: true, weapon: 'sword', blade: '#8a8478', shield: '#4a3a2a', eyes: '#66ccff' });
    case 'archer': return biped({ skin: '#ddd6c2', torso: '#c9c2ae', arms: '#ddd6c2', legs: '#ddd6c2', boots: '#bdb6a2', thin: true, weapon: 'bow', hat: 'hood', hatC: '#3a3a30', eyes: '#66ff99' });
    case 'ghoul': return biped({ skin: '#7a8a72', torso: '#5a6a56', arms: '#7a8a72', legs: '#4a5444', longArms: true, hunch: 0.5, eyes: '#ccff44', scale: 1.05 });
    case 'guard': return biped({ skin: '#d6cdb5', torso: '#4a4e58', arms: '#d6cdb5', legs: '#d6cdb5', thin: true, pauldrons: '#5a5e68', hat: 'helm', plume: '#2a2a2a', weapon: 'axe', shield: '#3a3e48', eyes: '#55ff88', scale: 1.25 });
    case 'boss': return biped({ skin: '#cfc5a8', torso: '#2a1e34', arms: '#2a1e34', legs: '#1e1626', robe: true, pauldrons: '#3a3446', hat: 'crown', weapon: 'greatsword', blade: '#5a6a5a', bladeGlow: '#1a5a2a', eyes: '#66ff88', cape: '#3a1424', scale: 2.3 });
  }
  return biped({ skin: '#888', torso: '#666', legs: '#444' });
}

// ---------------------------------------------------------------- loot
const RCOL = [0xddd6c4, 0x6f93ff, 0xffd651, 0xbd7bff, 0xff8c26];
export function makeLootModel(kind, r) {
  const g = new THREE.Group();
  if (kind === 'gold') {
    for (let i = 0; i < 4; i++) { const c = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 10), M('#e8b830', { m: 0.8, r: 0.3, e: '#3a2a00' }), (Math.random() - 0.5) * 0.3, 0.05 + i * 0.05, (Math.random() - 0.5) * 0.3); g.add(c); }
    return { g, spin: null };
  }
  if (kind === 'globe') {
    const orb = mesh(new THREE.IcosahedronGeometry(0.26, 2), M('#ff2030', { e: '#ff1020', ei: 1.2, r: 0.2 }), 0, 0.45, 0); g.add(orb);
    const gl = glowSprite(0xff3040, 1.6, 0.8); gl.position.y = 0.45; g.add(gl);
    return { g, spin: orb };
  }
  if (kind === 'pot') {
    g.add(mesh(new THREE.IcosahedronGeometry(0.18, 1), M('#c0202a', { e: '#600010', r: 0.3 }), 0, 0.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6), M('#8a7a6a'), 0, 0.45, 0));
    return { g, spin: null };
  }
  const gem = mesh(new THREE.OctahedronGeometry(0.24, 0), M(RCOL[r], { e: RCOL[r], ei: 0.6, r: 0.3, m: 0.3 }), 0, 0.5, 0);
  g.add(gem);
  if (r >= 2) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.22, 7, 8, 1, true), new THREE.MeshBasicMaterial({ color: RCOL[r], transparent: true, opacity: r === 4 ? 0.5 : 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.5; g.add(beam);
  }
  if (r >= 1) { const gl = glowSprite(RCOL[r], r >= 3 ? 2.2 : 1.4, 0.8); gl.position.y = 0.5; g.add(gl); }
  return { g, spin: gem };
}
// a horse to ride; legs swing with the hero's walk
export function makeHorse(color = '#6a4a30') {
  const g = new THREE.Group(); const bm = M(color), dk = M('#2a1e14');
  const body = mesh(new THREE.BoxGeometry(0.75, 0.7, 1.7), bm, 0, 1.15, 0); body.castShadow = true; g.add(body);
  const neck = mesh(new THREE.BoxGeometry(0.4, 0.8, 0.45), bm, 0, 1.6, 0.85); neck.rotation.x = 0.55; g.add(neck);
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.36, 0.7), bm, 0, 1.92, 1.25));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.6, 0.5), dk, 0, 1.75, 0.65));
  const tail = mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), dk, 0, 1.0, -0.95); tail.rotation.x = -0.4; g.add(tail);
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.12, 0.7), M('#8a2a20'), 0, 1.52, -0.05));
  const legs = [];
  for (const [x, z, ph] of [[-0.25, 0.65, 0], [0.25, 0.65, Math.PI], [-0.25, -0.65, Math.PI], [0.25, -0.65, 0]]) {
    const p = new THREE.Group(); p.position.set(x, 0.85, z); p.userData.ph = ph;
    p.add(mesh(new THREE.BoxGeometry(0.17, 0.85, 0.2), bm, 0, -0.42, 0));
    p.add(mesh(new THREE.BoxGeometry(0.19, 0.12, 0.22), dk, 0, -0.8, 0.02));
    g.add(p); legs.push(p);
  }
  return { g, legs };
}
export { NPCS };
