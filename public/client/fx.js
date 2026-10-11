// Particles, projectiles, ground telegraphs and floating combat text.
import * as THREE from 'three';
import { glowSprite } from './models.js';
import { PROJ_KINDS } from '../sim.js';

export class Particles {
  constructor(scene, max = 6000) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a, a); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    this.geo = g;
    const F = () => new Float32Array(max);
    this.vx = F(); this.vy = F(); this.vz = F(); this.life = F(); this.maxl = F(); this.r = F(); this.g = F(); this.b = F(); this.s0 = F(); this.grav = F(); this.drag = F(); this.grow = F();
    this._c = new THREE.Color(); this._c2 = new THREE.Color();
  }
  emit(x, y, z, o) {
    const n = o.n || 10; const c = this._c.set(o.color || 0xffffff); const c2 = o.color2 != null ? this._c2.set(o.color2) : null;
    for (let k = 0; k < n; k++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      const rad = o.radius || 0; const a = Math.random() * Math.PI * 2, rr = rad * Math.sqrt(Math.random());
      this.pos[i * 3] = x + Math.cos(a) * rr + (o.jx || 0) * (Math.random() - 0.5);
      this.pos[i * 3 + 1] = y + (o.jy || 0) * (Math.random() - 0.5);
      this.pos[i * 3 + 2] = z + Math.sin(a) * rr + (o.jz || 0) * (Math.random() - 0.5);
      const sp = (o.speed || 0) * (0.4 + Math.random() * 0.6);
      if (o.ring) { this.vx[i] = Math.cos(a) * sp; this.vz[i] = Math.sin(a) * sp; this.vy[i] = (o.vy || 0) * Math.random(); }
      else {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
        this.vx[i] = sq * Math.cos(th) * sp + (o.dir ? o.dir[0] : 0);
        this.vy[i] = Math.abs(u) * sp * (o.up ?? 1) + (o.vy || 0) * (0.5 + Math.random() * 0.5);
        this.vz[i] = sq * Math.sin(th) * sp + (o.dir ? o.dir[2] : 0);
      }
      const l = (o.life ? o.life[0] + Math.random() * (o.life[1] - o.life[0]) : 0.6);
      this.life[i] = l; this.maxl[i] = l;
      const t = c2 ? Math.random() : 0;
      this.r[i] = c2 ? c.r + (c2.r - c.r) * t : c.r; this.g[i] = c2 ? c.g + (c2.g - c.g) * t : c.g; this.b[i] = c2 ? c.b + (c2.b - c.b) * t : c.b;
      this.s0[i] = o.size ? o.size[0] + Math.random() * (o.size[1] - o.size[0]) : 0.3;
      this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 1; this.grow[i] = o.grow ?? 0;
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(--this.n, i); continue; }
      const dr = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= dr; this.vy[i] = this.vy[i] * dr - this.grav[i] * dt; this.vz[i] *= dr;
      this.pos[i * 3] += this.vx[i] * dt; this.pos[i * 3 + 1] += this.vy[i] * dt; this.pos[i * 3 + 2] += this.vz[i] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vy[i] *= -0.3; }
      const f = this.life[i] / this.maxl[i];
      const fa = f < 0.3 ? f / 0.3 : 1;
      this.col[i * 3] = this.r[i] * fa; this.col[i * 3 + 1] = this.g[i] * fa; this.col[i * 3 + 2] = this.b[i] * fa;
      this.size[i] = this.s0[i] * (1 + this.grow[i] * (1 - f));
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
  }
  copy(from, to) {
    if (from === to) return;
    for (const a of [this.vx, this.vy, this.vz, this.life, this.maxl, this.r, this.g, this.b, this.s0, this.grav, this.drag, this.grow, this.size]) a[to] = a[from];
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k]; }
  }
}

// ---------------------------------------------------------------- projectiles
const PCOL = { bolt: 0xa37bff, fireball: 0xff7a1a, arrow: 0xe8dcc0, fire: 0xff6a20, arrow_m: 0x8aff9a, bone: 0xdddddd, frost: 0x9ae8ff, void: 0xc08aff, hammer: 0xffd860, knife: 0xd0d8e8 };
export class Projectiles {
  constructor(scene, parts) { this.scene = scene; this.parts = parts; this.list = new Map(); }
  spawn(e) {
    const kind = PROJ_KINDS[e.k] || 'bolt';
    const g = new THREE.Group();
    if (kind === 'knife') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.55), new THREE.MeshBasicMaterial({ color: 0xe0e6ee }));
      g.add(blade); g.add(glowSprite(0xb08aff, 0.5, 0.5));
    } else if (kind === 'bone') {
      const sh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0xeee6d0 })); sh.rotation.x = Math.PI / 2;
      g.add(sh); g.add(glowSprite(0x9affb0, 0.7, 0.5));
    } else if (kind === 'arrow' || kind === 'arrow_m') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95), new THREE.MeshBasicMaterial({ color: kind === 'arrow' ? 0xd8c8a0 : 0x9adfa0 }));
      g.add(shaft);
      const gl = glowSprite(PCOL[kind], 0.6, 0.5); g.add(gl);
    } else {
      const big = kind === 'fireball' ? 1.6 : kind === 'fire' ? 1.1 : 1.0;
      g.add(glowSprite(PCOL[kind], big * 1.4, 0.95));
      g.add(glowSprite(0xffffff, big * 0.45, 0.9));
    }
    g.position.set(e.x, 1.25, e.z);
    g.rotation.y = Math.atan2(e.vx, e.vz);
    this.scene.add(g);
    this.list.set(e.i, { g, kind, vx: e.vx, vz: e.vz, d: e.d, trav: 0, team: e.t });
  }
  end(e, impact) {
    const p = this.list.get(e.i); if (!p) return;
    this.scene.remove(p.g); this.list.delete(e.i);
    if (impact) impact(p.kind, e.x, e.z);
  }
  update(dt) {
    for (const [id, p] of this.list) {
      p.g.position.x += p.vx * dt; p.g.position.z += p.vz * dt;
      p.trav += Math.hypot(p.vx, p.vz) * dt;
      const { x, y, z } = p.g.position;
      if (p.kind === 'fireball') this.parts.emit(x, y, z, { n: 3, color: 0xff8a20, color2: 0xffd060, speed: 0.6, life: [0.25, 0.5], size: [0.35, 0.6], vy: 0.6, grow: -0.6 });
      else if (p.kind === 'bolt') this.parts.emit(x, y, z, { n: 2, color: 0x9a6aff, color2: 0xd0b8ff, speed: 0.3, life: [0.2, 0.35], size: [0.2, 0.32] });
      else if (p.kind === 'hammer') this.parts.emit(x, y, z, { n: 2, color: 0xffd860, color2: 0xfff6c0, speed: 0.4, life: [0.25, 0.45], size: [0.25, 0.4] });
      else if (p.kind === 'frost') this.parts.emit(x, y, z, { n: 2, color: 0x9ae8ff, color2: 0xffffff, speed: 0.3, life: [0.2, 0.4], size: [0.2, 0.32] });
      else if (p.kind === 'void') this.parts.emit(x, y, z, { n: 2, color: 0x8a4aff, color2: 0xe0c0ff, speed: 0.3, life: [0.2, 0.4], size: [0.22, 0.36] });
      else if (p.kind === 'fire') this.parts.emit(x, y, z, { n: 2, color: 0xff5a10, color2: 0xffb040, speed: 0.4, life: [0.2, 0.4], size: [0.25, 0.4], vy: 0.5 });
      if (p.trav > p.d + 1) { this.scene.remove(p.g); this.list.delete(id); }
    }
  }
}

// ---------------------------------------------------------------- telegraphs & ground rings
const TCOL = { boss: 0xff3020, meteor: 0xff8a20, rain: 0x8aff6a, bone: 0x9affb0 };
export class Telegraphs {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, z, r, dur, kind) {
    const col = TCOL[kind] || 0xffffff;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: kind === 'boss' ? 0.32 : 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); this.scene.add(m); }
    fill.scale.setScalar(0.01);
    this.list.push({ ring, fill, t: 0, dur, kind });
  }
  update(dt) {
    this.list = this.list.filter((t) => {
      t.t += dt;
      const f = Math.min(1, t.t / t.dur);
      t.fill.scale.setScalar(Math.max(0.01, f));
      t.ring.material.opacity = 0.5 + 0.4 * Math.sin(t.t * 18);
      if (t.t >= t.dur + 0.1) { this.scene.remove(t.ring, t.fill); t.ring.geometry.dispose(); t.fill.geometry.dispose(); return false; }
      return true;
    });
  }
}
export class Rings {
  constructor(scene) { this.scene = scene; this.list = []; }
  // expanding ring on the ground (novas, stomps, clicks)
  add(x, z, r0, r1, dur, color, y = 0.07, width = 0.25, op = 0.9) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.setScalar(r0);
    this.scene.add(m); this.list.push({ m, t: 0, dur, r0, r1, op });
  }
  update(dt) {
    this.list = this.list.filter((r) => {
      r.t += dt; const f = r.t / r.dur;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - f) * (1 - f)));
      r.m.material.opacity = r.op * (1 - f);
      if (f >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); return false; }
      return true;
    });
  }
}
// arc swoosh in front of an attacker
export class Swooshes {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, z, ang, r, arc, color, dur = 0.22) {
    const geo = new THREE.RingGeometry(r * 0.35, r, 24, 1, -arc / 2, arc);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = ang - Math.PI / 2;
    m.position.set(x, 1.0, z);
    this.scene.add(m); this.list.push({ m, t: 0, dur });
  }
  update(dt) {
    this.list = this.list.filter((s) => {
      s.t += dt; const f = s.t / s.dur;
      s.m.material.opacity = 0.7 * (1 - f); s.m.position.y = 1.0 - f * 0.4;
      if (f >= 1) { this.scene.remove(s.m); s.m.geometry.dispose(); return false; }
      return true;
    });
  }
}

// ---------------------------------------------------------------- floating text
export class FloatText {
  constructor(el) { this.el = el; this.list = []; this.pool = []; }
  add(x, y, z, text, cls, opts = {}) {
    const d = this.pool.pop() || document.createElement('div');
    d.className = 'ft ' + (cls || '');
    d.textContent = text;
    this.el.appendChild(d);
    this.list.push({ d, x: x + (Math.random() - 0.5) * 0.9, y: y + Math.random() * 0.6, z: z + (Math.random() - 0.5) * 0.5, t: 0, dur: opts.dur || 1.0, rise: opts.rise ?? 1.6, drift: (Math.random() - 0.5) * 70 });
    if (this.list.length > 60) this.remove(this.list.shift());
  }
  remove(f) { f.d.remove(); this.pool.push(f.d); }
  update(dt, project) {
    this.list = this.list.filter((f) => {
      f.t += dt; const k = f.t / f.dur;
      if (k >= 1) { this.remove(f); return false; }
      const s = project(f.x, f.y + f.rise * k, f.z);
      if (!s) { f.d.style.opacity = 0; return true; }
      const pop = k < 0.12 ? 1 + (0.12 - k) * 4 : 1;
      f.d.style.transform = `translate(-50%,-50%) translate(${(s.x + f.drift * k).toFixed(1)}px,${s.y.toFixed(1)}px) scale(${pop.toFixed(2)})`;
      f.d.style.left = '0'; f.d.style.top = '0';
      f.d.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      return true;
    });
  }
}
