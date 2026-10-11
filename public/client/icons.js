// Hand-drawn (procedural) icons for abilities and items.
const RC = ['#ddd6c4', '#6f93ff', '#ffd651', '#bd7bff', '#ff8c26'];

function bg(c, s, tint) {
  const g = c.createRadialGradient(s * 0.5, s * 0.4, s * 0.05, s * 0.5, s * 0.5, s * 0.75);
  g.addColorStop(0, tint); g.addColorStop(1, '#0c0a0e');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = s * 0.06; c.strokeRect(0, 0, s, s);
  c.strokeStyle = 'rgba(255,220,170,.18)'; c.lineWidth = s * 0.02; c.strokeRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);
}
function glow(c, color, blur) { c.shadowColor = color; c.shadowBlur = blur; }
function arrow(c, x1, y1, x2, y2, s, col = '#f0e2bf') {
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.strokeStyle = col; c.lineWidth = s * 0.045; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.fillStyle = col; c.beginPath();
  c.moveTo(x2 + Math.cos(a) * s * 0.08, y2 + Math.sin(a) * s * 0.08);
  c.lineTo(x2 + Math.cos(a + 2.5) * s * 0.1, y2 + Math.sin(a + 2.5) * s * 0.1);
  c.lineTo(x2 + Math.cos(a - 2.5) * s * 0.1, y2 + Math.sin(a - 2.5) * s * 0.1);
  c.fill();
  c.strokeStyle = '#c9a36a'; c.lineWidth = s * 0.03;
  for (const o of [0, 0.07]) {
    const bx = x1 + Math.cos(a) * s * o, by = y1 + Math.sin(a) * s * o;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + 2.4) * s * 0.08, by + Math.sin(a + 2.4) * s * 0.08); c.stroke();
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a - 2.4) * s * 0.08, by + Math.sin(a - 2.4) * s * 0.08); c.stroke();
  }
}
function sword(c, s, x, y, ang, len, col = '#e6e9ee') {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = col; c.beginPath(); c.moveTo(-s * 0.035, 0); c.lineTo(s * 0.035, 0); c.lineTo(s * 0.02, -len); c.lineTo(0, -len - s * 0.06); c.lineTo(-s * 0.02, -len); c.fill();
  c.fillStyle = '#b48d55'; c.fillRect(-s * 0.11, -s * 0.01, s * 0.22, s * 0.045);
  c.fillStyle = '#5a3a22'; c.fillRect(-s * 0.025, s * 0.03, s * 0.05, s * 0.14);
  c.restore();
}
const ABILITY = {
  slash(c, s) { glow(c, '#ff6a4a', s * 0.15); c.strokeStyle = '#ffd3b0'; c.lineWidth = s * 0.07; c.lineCap = 'round'; c.beginPath(); c.arc(s * 0.3, s * 0.75, s * 0.55, -1.35, -0.25); c.stroke(); c.shadowBlur = 0; sword(c, s, s * 0.62, s * 0.7, 0.75, s * 0.48); },
  cleave(c, s) { glow(c, '#ff5a3a', s * 0.2); c.strokeStyle = '#ffb07a'; c.lineWidth = s * 0.09; c.lineCap = 'round'; c.beginPath(); c.arc(s * 0.5, s * 0.78, s * 0.42, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); c.lineWidth = s * 0.03; c.beginPath(); c.arc(s * 0.5, s * 0.78, s * 0.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.shadowBlur = 0; },
  charge(c, s) { c.strokeStyle = '#f0c48a'; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { c.lineWidth = s * 0.04; c.beginPath(); c.moveTo(s * 0.12, s * (0.35 + i * 0.15)); c.lineTo(s * (0.38 - i * 0.05), s * (0.35 + i * 0.15)); c.stroke(); } glow(c, '#ff7a3a', s * 0.15); c.fillStyle = '#ffd8a8'; c.beginPath(); c.moveTo(s * 0.45, s * 0.25); c.lineTo(s * 0.88, s * 0.5); c.lineTo(s * 0.45, s * 0.75); c.lineTo(s * 0.55, s * 0.5); c.fill(); c.shadowBlur = 0; },
  warcry(c, s) { glow(c, '#ff4a2a', s * 0.15); c.strokeStyle = '#ffcf9a'; c.lineWidth = s * 0.05; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * 0.36, s * 0.5, s * (0.2 + i * 0.13), -0.8, 0.8); c.stroke(); } c.fillStyle = '#ffe2c0'; c.beginPath(); c.arc(s * 0.3, s * 0.5, s * 0.12, 0, Math.PI * 2); c.fill(); c.fillStyle = '#4a0f0a'; c.beginPath(); c.ellipse(s * 0.33, s * 0.53, s * 0.05, s * 0.06, 0, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; },
  whirl(c, s) { glow(c, '#ff6a3a', s * 0.12); c.strokeStyle = '#ffd0a0'; c.lineWidth = s * 0.05; c.lineCap = 'round'; c.beginPath(); for (let t = 0; t < 14; t += 0.1) { const r = s * 0.03 * t; const x = s * 0.5 + Math.cos(t) * r, y = s * 0.5 + Math.sin(t) * r; t === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); c.shadowBlur = 0; },
  bolt(c, s) { glow(c, '#a37bff', s * 0.25); c.fillStyle = '#e8dcff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? s * 0.1 : s * 0.36; c.lineTo(s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r); } c.fill(); c.shadowBlur = 0; },
  fireball(c, s) { glow(c, '#ff7a1a', s * 0.3); const g = c.createRadialGradient(s * 0.58, s * 0.42, 0, s * 0.58, s * 0.42, s * 0.24); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffa030'); g.addColorStop(1, '#c0300a'); c.fillStyle = g; c.beginPath(); c.arc(s * 0.58, s * 0.42, s * 0.22, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,120,30,.7)'; c.beginPath(); c.moveTo(s * 0.42, s * 0.3); c.quadraticCurveTo(s * 0.2, s * 0.7, s * 0.12, s * 0.88); c.quadraticCurveTo(s * 0.45, s * 0.75, s * 0.7, s * 0.58); c.fill(); c.shadowBlur = 0; },
  nova(c, s) { glow(c, '#7fd8ff', s * 0.25); c.strokeStyle = '#e4f8ff'; c.lineWidth = s * 0.045; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const ex = s * 0.5 + Math.cos(a) * s * 0.36, ey = s * 0.5 + Math.sin(a) * s * 0.36; c.beginPath(); c.moveTo(s * 0.5, s * 0.5); c.lineTo(ex, ey); c.stroke(); const mx = s * 0.5 + Math.cos(a) * s * 0.24, my = s * 0.5 + Math.sin(a) * s * 0.24; for (const d of [-0.6, 0.6]) { c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(a + d) * s * 0.1, my + Math.sin(a + d) * s * 0.1); c.stroke(); } } c.shadowBlur = 0; },
  blink(c, s) { glow(c, '#b48bff', s * 0.2); c.fillStyle = '#e0d0ff'; for (let i = 0; i < 7; i++) { c.globalAlpha = 0.25 + i * 0.11; c.beginPath(); c.arc(s * (0.18 + i * 0.1), s * (0.7 - Math.sin(i / 6 * Math.PI) * 0.3), s * (0.025 + i * 0.008), 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1; c.shadowBlur = 0; },
  meteor(c, s) { c.fillStyle = 'rgba(255,110,30,.75)'; glow(c, '#ff6a00', s * 0.25); c.beginPath(); c.moveTo(s * 0.1, s * 0.08); c.lineTo(s * 0.62, s * 0.5); c.lineTo(s * 0.45, s * 0.66); c.fill(); c.fillStyle = '#5a3a2a'; c.beginPath(); c.arc(s * 0.6, s * 0.64, s * 0.18, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffb060'; c.beginPath(); c.arc(s * 0.55, s * 0.58, s * 0.06, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; },
  shot(c, s) { glow(c, '#9fe07a', s * 0.12); arrow(c, s * 0.18, s * 0.82, s * 0.8, s * 0.2, s); c.shadowBlur = 0; },
  multishot(c, s) { glow(c, '#9fe07a', s * 0.12); for (const d of [-0.45, 0, 0.45]) { const a = -Math.PI / 2 + d; arrow(c, s * 0.5 - Math.cos(a) * s * 0.3, s * 0.85 - Math.sin(a) * s * 0.0, s * 0.5 + Math.cos(a) * s * 0.36, s * 0.5 + Math.sin(a) * s * 0.36, s); } c.shadowBlur = 0; },
  roll(c, s) { glow(c, '#b6f08a', s * 0.12); c.strokeStyle = '#e6f6d0'; c.lineWidth = s * 0.06; c.lineCap = 'round'; c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.26, Math.PI * 0.8, Math.PI * 2.5); c.stroke(); c.fillStyle = '#e6f6d0'; c.beginPath(); c.moveTo(s * 0.5, s * 0.1); c.lineTo(s * 0.66, s * 0.26); c.lineTo(s * 0.46, s * 0.34); c.fill(); c.shadowBlur = 0; },
  mend(c, s) { glow(c, '#8cff7a', s * 0.25); c.fillStyle = '#9be37e'; c.beginPath(); c.moveTo(s * 0.5, s * 0.12); c.quadraticCurveTo(s * 0.92, s * 0.42, s * 0.5, s * 0.88); c.quadraticCurveTo(s * 0.08, s * 0.42, s * 0.5, s * 0.12); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#2c5a1e'; c.lineWidth = s * 0.03; c.beginPath(); c.moveTo(s * 0.5, s * 0.2); c.lineTo(s * 0.5, s * 0.82); c.stroke(); c.fillStyle = '#f2ffe8'; c.fillRect(s * 0.66, s * 0.66, s * 0.22, s * 0.06); c.fillRect(s * 0.74, s * 0.58, s * 0.06, s * 0.22); },
  rain(c, s) { glow(c, '#9fe07a', s * 0.1); for (let i = 0; i < 5; i++) { const x = s * (0.18 + i * 0.16), y = s * (0.18 + (i % 2) * 0.16); arrow(c, x - s * 0.04, y, x + s * 0.04, y + s * 0.4, s * 0.85); } c.shadowBlur = 0; },
  smite(c, s) { glow(c, '#ffd860', s * 0.2); c.fillStyle = '#e8e0c8'; c.fillRect(s * 0.3, s * 0.22, s * 0.4, s * 0.22); c.fillStyle = '#8a6a3a'; c.fillRect(s * 0.47, s * 0.42, s * 0.06, s * 0.42); c.shadowBlur = 0; },
  hammer(c, s) { glow(c, '#ffe080', s * 0.3); c.save(); c.translate(s * 0.5, s * 0.5); c.rotate(0.6); c.fillStyle = '#fff2b8'; c.fillRect(-s * 0.2, -s * 0.28, s * 0.4, s * 0.2); c.fillStyle = '#d8a84a'; c.fillRect(-s * 0.035, -s * 0.1, s * 0.07, s * 0.38); c.restore(); c.shadowBlur = 0; },
  judgment(c, s) { glow(c, '#ffd860', s * 0.3); c.strokeStyle = '#fff0b0'; c.lineWidth = s * 0.05; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(s * 0.5 + Math.cos(a) * s * 0.12, s * 0.5 + Math.sin(a) * s * 0.12); c.lineTo(s * 0.5 + Math.cos(a) * s * 0.38, s * 0.5 + Math.sin(a) * s * 0.38); c.stroke(); } c.fillStyle = '#fff8d8'; c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.1, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; },
  holylight(c, s) { glow(c, '#ffe080', s * 0.3); c.fillStyle = '#fff2b8'; c.fillRect(s * 0.43, s * 0.18, s * 0.14, s * 0.64); c.fillRect(s * 0.22, s * 0.38, s * 0.56, s * 0.14); c.shadowBlur = 0; },
  divine(c, s) { glow(c, '#ffe080', s * 0.3); c.fillStyle = '#e8c25a'; c.beginPath(); c.moveTo(s * 0.5, s * 0.14); c.lineTo(s * 0.8, s * 0.26); c.quadraticCurveTo(s * 0.78, s * 0.7, s * 0.5, s * 0.88); c.quadraticCurveTo(s * 0.22, s * 0.7, s * 0.2, s * 0.26); c.fill(); c.shadowBlur = 0; c.fillStyle = '#fff6d0'; c.fillRect(s * 0.46, s * 0.28, s * 0.08, s * 0.44); c.fillRect(s * 0.34, s * 0.42, s * 0.32, s * 0.08); },
  bonespear(c, s) { glow(c, '#9affb0', s * 0.15); c.fillStyle = '#eee6d0'; c.beginPath(); c.moveTo(s * 0.82, s * 0.18); c.lineTo(s * 0.26, s * 0.66); c.lineTo(s * 0.18, s * 0.86); c.lineTo(s * 0.34, s * 0.74); c.fill(); c.shadowBlur = 0; },
  raise(c, s) { glow(c, '#7affa0', s * 0.25); c.fillStyle = '#eee6d0'; c.beginPath(); c.arc(s * 0.5, s * 0.4, s * 0.2, 0, Math.PI * 2); c.fill(); c.fillRect(s * 0.38, s * 0.52, s * 0.24, s * 0.14); c.shadowBlur = 0; c.fillStyle = '#123018'; c.beginPath(); c.arc(s * 0.42, s * 0.4, s * 0.05, 0, Math.PI * 2); c.arc(s * 0.58, s * 0.4, s * 0.05, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7affa0'; c.fillRect(s * 0.2, s * 0.78, s * 0.6, s * 0.06); },
  corpse(c, s) { glow(c, '#c83a2a', s * 0.25); c.fillStyle = '#e8d8c0'; for (let i = 0; i < 9; i++) { const a = i * 0.7, r = s * (0.12 + (i % 3) * 0.1); c.beginPath(); c.arc(s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r, s * 0.045, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#c83a2a'; c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.1, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; },
  bonearmor(c, s) { glow(c, '#9affb0', s * 0.2); c.strokeStyle = '#eee6d0'; c.lineWidth = s * 0.06; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(s * 0.5, s * 0.5, s * (0.16 + i * 0.07), Math.PI * 1.1, Math.PI * 1.9); c.stroke(); } c.shadowBlur = 0; },
  army(c, s) { glow(c, '#7affa0', s * 0.2); c.fillStyle = '#eee6d0'; for (const [x, y, r] of [[0.3, 0.42, 0.11], [0.7, 0.42, 0.11], [0.5, 0.58, 0.14]]) { c.beginPath(); c.arc(s * x, s * y, s * r, 0, Math.PI * 2); c.fill(); } c.shadowBlur = 0; },
  twin(c, s) { glow(c, '#c08aff', s * 0.15); sword(c, s, s * 0.38, s * 0.78, -0.4, s * 0.4, '#e0e0f0'); sword(c, s, s * 0.62, s * 0.78, 0.4, s * 0.4, '#e0e0f0'); c.shadowBlur = 0; },
  fan(c, s) { glow(c, '#c08aff', s * 0.15); c.fillStyle = '#e8e8f4'; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.save(); c.translate(s * 0.5 + Math.cos(a) * s * 0.25, s * 0.5 + Math.sin(a) * s * 0.25); c.rotate(a + Math.PI / 2); c.beginPath(); c.moveTo(0, -s * 0.12); c.lineTo(s * 0.03, 0); c.lineTo(-s * 0.03, 0); c.fill(); c.restore(); } c.shadowBlur = 0; },
  shadowstep(c, s) { glow(c, '#8a4aff', s * 0.25); c.fillStyle = '#3a1a5a'; c.beginPath(); c.arc(s * 0.35, s * 0.55, s * 0.18, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d0b0ff'; c.beginPath(); c.arc(s * 0.65, s * 0.45, s * 0.14, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; },
  smoke(c, s) { c.fillStyle = 'rgba(180,170,200,.8)'; for (const [x, y, r] of [[0.35, 0.55, 0.2], [0.6, 0.45, 0.22], [0.55, 0.68, 0.16]]) { c.beginPath(); c.arc(s * x, s * y, s * r, 0, Math.PI * 2); c.fill(); } },
  bladefury(c, s) { glow(c, '#c08aff', s * 0.2); for (let i = 0; i < 4; i++) sword(c, s, s * 0.5, s * 0.5, i * Math.PI / 2 + 0.3, s * 0.32, '#e0e0f0'); c.shadowBlur = 0; },
  potion(c, s) { c.fillStyle = '#6a5a48'; c.fillRect(s * 0.42, s * 0.14, s * 0.16, s * 0.18); glow(c, '#ff2a2a', s * 0.2); const g = c.createRadialGradient(s * 0.45, s * 0.55, 0, s * 0.5, s * 0.6, s * 0.3); g.addColorStop(0, '#ff8a7a'); g.addColorStop(1, '#8a0a10'); c.fillStyle = g; c.beginPath(); c.arc(s * 0.5, s * 0.6, s * 0.26, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(s * 0.41, s * 0.52, s * 0.06, 0, Math.PI * 2); c.fill(); },
};
const ABILITY_TINT = { warrior: '#5a1d18', mage: '#1d2a5e', ranger: '#1f3d1d', paladin: '#5a4a18', necro: '#163a24', assassin: '#3a1a4a', potion: '#3a1214' };
export function paintAbility(canvas, id, cls) {
  const s = canvas.width; const c = canvas.getContext('2d');
  c.clearRect(0, 0, s, s); c.save();
  bg(c, s, ABILITY_TINT[cls] || '#2a2230');
  (ABILITY[id] || ABILITY.bolt)(c, s);
  c.restore();
}

const cache = new Map();
const ITEM = {
  weapon(c, s, cls) {
    if (cls === 'mage') {
      c.strokeStyle = '#8a6a44'; c.lineWidth = s * 0.07; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.25, s * 0.85); c.lineTo(s * 0.68, s * 0.3); c.stroke();
      glow(c, '#7fb0ff', s * 0.25); c.fillStyle = '#bcd6ff'; c.beginPath(); c.arc(s * 0.72, s * 0.25, s * 0.11, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    } else if (cls === 'ranger') {
      c.strokeStyle = '#9a7246'; c.lineWidth = s * 0.07; c.lineCap = 'round';
      c.beginPath(); c.arc(s * 0.32, s * 0.5, s * 0.36, -1.15, 1.15); c.stroke();
      c.strokeStyle = '#e8dcc4'; c.lineWidth = s * 0.015;
      c.beginPath(); c.moveTo(s * 0.32 + Math.cos(-1.15) * s * 0.36, s * 0.5 + Math.sin(-1.15) * s * 0.36); c.lineTo(s * 0.32 + Math.cos(1.15) * s * 0.36, s * 0.5 + Math.sin(1.15) * s * 0.36); c.stroke();
    } else if (cls === 'paladin') {
      c.save(); c.translate(s * 0.5, s * 0.5); c.rotate(0.75); c.fillStyle = '#8a6a3a'; c.fillRect(-s * 0.035, -s * 0.1, s * 0.07, s * 0.46); c.fillStyle = '#d8d0b8'; c.fillRect(-s * 0.18, -s * 0.3, s * 0.36, s * 0.2); c.restore();
    } else if (cls === 'necro') {
      c.strokeStyle = '#ddd4bc'; c.lineWidth = s * 0.06; c.lineCap = 'round'; c.beginPath(); c.moveTo(s * 0.28, s * 0.8); c.lineTo(s * 0.66, s * 0.34); c.stroke();
      glow(c, '#7affa0', s * 0.25); c.fillStyle = '#eee6d0'; c.beginPath(); c.arc(s * 0.7, s * 0.28, s * 0.1, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    } else if (cls === 'assassin') { sword(c, s, s * 0.38, s * 0.78, -0.45, s * 0.42, '#d8d8ec'); sword(c, s, s * 0.62, s * 0.78, 0.45, s * 0.42, '#d8d8ec'); }
    else sword(c, s, s * 0.3, s * 0.75, 0.75, s * 0.6);
  },
  helm(c, s) { c.fillStyle = '#9aa0aa'; c.beginPath(); c.arc(s * 0.5, s * 0.55, s * 0.3, Math.PI, 0); c.lineTo(s * 0.8, s * 0.72); c.lineTo(s * 0.2, s * 0.72); c.fill(); c.fillStyle = '#1a1418'; c.fillRect(s * 0.3, s * 0.52, s * 0.4, s * 0.07); c.fillStyle = '#9aa0aa'; c.fillRect(s * 0.47, s * 0.5, s * 0.06, s * 0.25); },
  chest(c, s) { c.fillStyle = '#8a7d6a'; c.beginPath(); c.moveTo(s * 0.3, s * 0.2); c.lineTo(s * 0.42, s * 0.26); c.lineTo(s * 0.58, s * 0.26); c.lineTo(s * 0.7, s * 0.2); c.lineTo(s * 0.86, s * 0.4); c.lineTo(s * 0.74, s * 0.48); c.lineTo(s * 0.72, s * 0.84); c.lineTo(s * 0.28, s * 0.84); c.lineTo(s * 0.26, s * 0.48); c.lineTo(s * 0.14, s * 0.4); c.fill(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = s * 0.02; c.beginPath(); c.moveTo(s * 0.5, s * 0.28); c.lineTo(s * 0.5, s * 0.82); c.stroke(); },
  gloves(c, s) { c.fillStyle = '#8a6e52'; c.beginPath(); c.roundRect(s * 0.3, s * 0.3, s * 0.36, s * 0.42, s * 0.08); c.fill(); for (let i = 0; i < 4; i++) { c.beginPath(); c.roundRect(s * (0.3 + i * 0.09), s * 0.16, s * 0.08, s * 0.22, s * 0.04); c.fill(); } c.beginPath(); c.roundRect(s * 0.6, s * 0.38, s * 0.2, s * 0.09, s * 0.04); c.fill(); c.fillStyle = '#5a4634'; c.fillRect(s * 0.28, s * 0.68, s * 0.4, s * 0.12); },
  boots(c, s) { c.fillStyle = '#7a5a3e'; c.beginPath(); c.moveTo(s * 0.36, s * 0.16); c.lineTo(s * 0.62, s * 0.16); c.lineTo(s * 0.62, s * 0.6); c.lineTo(s * 0.86, s * 0.7); c.lineTo(s * 0.86, s * 0.84); c.lineTo(s * 0.34, s * 0.84); c.fill(); c.fillStyle = '#4a3624'; c.fillRect(s * 0.34, s * 0.78, s * 0.52, s * 0.06); },
  ring(c, s, cls, r) { c.strokeStyle = '#d9b46a'; c.lineWidth = s * 0.08; c.beginPath(); c.arc(s * 0.5, s * 0.58, s * 0.24, 0, Math.PI * 2); c.stroke(); glow(c, RC[r], s * 0.2); c.fillStyle = RC[r]; c.beginPath(); c.moveTo(s * 0.5, s * 0.18); c.lineTo(s * 0.62, s * 0.3); c.lineTo(s * 0.5, s * 0.42); c.lineTo(s * 0.38, s * 0.3); c.fill(); c.shadowBlur = 0; },
  amulet(c, s, cls, r) { c.strokeStyle = '#b8a07a'; c.lineWidth = s * 0.025; c.beginPath(); c.moveTo(s * 0.2, s * 0.15); c.quadraticCurveTo(s * 0.5, s * 0.7, s * 0.8, s * 0.15); c.stroke(); glow(c, RC[r], s * 0.25); c.fillStyle = RC[r]; c.beginPath(); c.arc(s * 0.5, s * 0.62, s * 0.15, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(s * 0.45, s * 0.57, s * 0.04, 0, Math.PI * 2); c.fill(); },
};
export function itemIcon(slot, cls, r) {
  const key = `${slot}|${cls}|${r}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const c = cv.getContext('2d'); const s = 96;
  const tints = ['#2a2620', '#1a2348', '#463a12', '#33184a', '#4a2508'];
  bg(c, s, tints[r]);
  ITEM[slot](c, s, cls, r);
  cache.set(key, cv);
  return cv;
}
export function drawItemInto(canvas, it) {
  const src = itemIcon(it.slot, it.cls, it.r);
  canvas.width = canvas.height = 96;
  canvas.getContext('2d').drawImage(src, 0, 0);
}
