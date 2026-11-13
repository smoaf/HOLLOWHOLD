// Short cue tones (WebAudio). The context starts on the first user gesture.
let ctx = null;
let on = true;

export function setEnabled(v) { on = v; }

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function tone(freq, dur, when = 0, gain = 0.12, type = 'square') {
  if (!on || !ctx) return;
  try {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* ignore */ }
}

export const cue = {
  count: () => tone(880, 0.09, 0, 0.08),
  go: () => tone(1320, 0.22, 0, 0.1),
  rep: () => tone(660, 0.05, 0, 0.05, 'triangle'),
  rest: () => { tone(740, 0.12); tone(554, 0.18, 0.12); },
  done: () => { tone(660, 0.12); tone(880, 0.12, 0.12); tone(1320, 0.3, 0.24); },
};
