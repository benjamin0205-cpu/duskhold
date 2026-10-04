// Synthesized sound effects and ambient music (WebAudio, no sound files).
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
export const audio = { sound: true, music: true };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch { return; }
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  sfxBus = ctx.createGain(); sfxBus.gain.value = audio.sound ? 0.55 : 0; sfxBus.connect(comp); comp.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = audio.music ? 0.16 : 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startAmbience();
}
export function setSound(on) { audio.sound = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05); }
export function setMusic(on) { audio.music = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.3); }

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, delay = 0, dest = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, ftype, f0, f1, q = 1, delay = 0, dest = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const lastPlayed = {};
function gate(name, ms) { const n = performance.now(); if (lastPlayed[name] && n - lastPlayed[name] < ms) return false; lastPlayed[name] = n; return true; }

export const sfx = {
  swing(v = 1) { noise(0.16, 0.35 * v, 'bandpass', 1800, 500, 1.2); },
  cleave(v = 1) { noise(0.28, 0.45 * v, 'bandpass', 2200, 300, 0.8); tone('sawtooth', 120, 60, 0.18, 0.08 * v); },
  hit(v = 1) { if (!gate('hit', 35)) return; tone('sine', 150, 55, 0.12, 0.35 * v); noise(0.05, 0.25 * v, 'highpass', 2500, 1200, 0.7); },
  crit() { tone('square', 300, 90, 0.16, 0.15); noise(0.1, 0.35, 'bandpass', 3000, 900, 1); },
  bolt(v = 1) { tone('triangle', 500, 1300, 0.18, 0.18 * v); tone('sine', 900, 2200, 0.12, 0.08 * v); },
  fire(v = 1) { noise(0.35, 0.3 * v, 'lowpass', 600, 2400, 0.6); tone('sawtooth', 90, 160, 0.3, 0.05 * v); },
  boom(v = 1) { noise(0.7, 0.6 * v, 'lowpass', 1800, 80, 0.7); tone('sine', 90, 30, 0.6, 0.5 * v); },
  frost() { for (let i = 0; i < 5; i++) tone('sine', 1800 + i * 330, 2400 + i * 200, 0.5, 0.05, i * 0.03); noise(0.4, 0.2, 'highpass', 4000, 7000, 1); },
  blink() { tone('sine', 300, 1800, 0.18, 0.15); tone('sine', 1800, 400, 0.18, 0.1, 0.12); },
  arrow(v = 1) { if (!gate('arrow', 25)) return; noise(0.09, 0.3 * v, 'bandpass', 3500, 1400, 2); tone('triangle', 900, 300, 0.07, 0.05 * v); },
  charge() { noise(0.4, 0.35, 'lowpass', 300, 1200, 0.8); tone('sawtooth', 70, 140, 0.35, 0.08); },
  stomp() { tone('sine', 110, 35, 0.4, 0.55); noise(0.25, 0.3, 'lowpass', 900, 100, 0.7); },
  warcry() { tone('sawtooth', 150, 210, 0.6, 0.12); tone('sawtooth', 152, 220, 0.6, 0.1); noise(0.6, 0.15, 'bandpass', 700, 1100, 2); },
  whirl() { for (let i = 0; i < 6; i++) noise(0.2, 0.22, 'bandpass', 2000, 500, 1, i * 0.25); },
  mend() { [523, 659, 784, 1046].forEach((f, i) => tone('sine', f, f, 0.5, 0.08, i * 0.08)); },
  roll() { noise(0.3, 0.25, 'lowpass', 500, 1600, 0.5); },
  meteorFall() { noise(1.1, 0.25, 'lowpass', 200, 1600, 0.8); },
  rain() { for (let i = 0; i < 4; i++) noise(0.08, 0.15, 'bandpass', 3000, 1800, 2, i * 0.05); },
  hurt() { if (!gate('hurt', 120)) return; tone('sawtooth', 160, 80, 0.15, 0.16); noise(0.08, 0.2, 'lowpass', 1200, 300, 0.7); },
  mhit() { if (!gate('mhit', 60)) return; tone('square', 95, 55, 0.1, 0.1); },
  die() { tone('sawtooth', 220, 50, 0.45, 0.12); noise(0.3, 0.2, 'lowpass', 800, 120, 0.7); },
  pdie() { tone('sine', 220, 55, 1.6, 0.3); tone('sawtooth', 110, 40, 1.6, 0.08); },
  potion() { for (let i = 0; i < 6; i++) tone('sine', 300 + Math.random() * 500, 700 + Math.random() * 600, 0.08, 0.12, i * 0.06); },
  gold() { if (!gate('gold', 60)) return; tone('square', 1568, 1568, 0.06, 0.05); tone('square', 2093, 2093, 0.1, 0.05, 0.06); },
  drop(r) {
    if (r <= 0) { tone('triangle', 700, 500, 0.08, 0.06); return; }
    if (r === 1) { tone('sine', 880, 880, 0.25, 0.1); return; }
    if (r === 2) { tone('sine', 988, 988, 0.3, 0.12); tone('sine', 1319, 1319, 0.4, 0.1, 0.09); return; }
    if (r === 3) { [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, f, 0.6, 0.1, i * 0.07)); return; }
    [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => { tone('sine', f, f, 1.1, 0.11, i * 0.08); tone('triangle', f * 2, f * 2, 0.6, 0.03, i * 0.08); });
    tone('sine', 65, 65, 1.5, 0.25);
  },
  pickup() { tone('triangle', 600, 900, 0.07, 0.1); },
  levelup() { [392, 523, 659, 784, 1046].forEach((f, i) => { tone('triangle', f, f, 0.7, 0.12, i * 0.09); tone('sine', f / 2, f / 2, 0.7, 0.06, i * 0.09); }); },
  quest() { [587, 740, 880].forEach((f, i) => tone('triangle', f, f, 0.45, 0.12, i * 0.12)); },
  questDone() { [523, 659, 784, 659, 1046].forEach((f, i) => tone('triangle', f, f, 0.5, 0.12, i * 0.1)); },
  click() { tone('triangle', 900, 700, 0.04, 0.06); },
  error() { tone('square', 180, 150, 0.12, 0.07); },
  bossWake() { tone('sawtooth', 55, 40, 2.5, 0.25); noise(2.5, 0.15, 'lowpass', 300, 60, 0.5); },
};

// ---------- ambience: wind + slow minor-key pad
let ambienceStarted = false;
function startAmbience() {
  if (ambienceStarted || !ctx) return;
  ambienceStarted = true;
  // wind
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(); lfo.start();
  // pad
  const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]];
  let ci = 0;
  const playChord = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const fr of chords[ci % chords.length]) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr / 2; o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
        const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(0.05, t + 3); gg.gain.linearRampToValueAtTime(0.0001, t + 9.5);
        o.connect(lp); lp.connect(gg); gg.connect(musicBus); o.start(t); o.stop(t + 10);
      }
    }
    if (Math.random() < 0.6) {
      const fr = chords[ci % chords.length][Math.floor(Math.random() * 3)] * 2;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t + 2); gg.gain.linearRampToValueAtTime(0.03, t + 2.5); gg.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(gg); gg.connect(musicBus); o.start(t + 2); o.stop(t + 7.5);
    }
    ci++;
  };
  playChord();
  setInterval(playChord, 8000);
}
