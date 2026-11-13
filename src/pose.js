// Poses in anatomical terms, keyframe sampling, and putting the figure on the
// floor: whatever is lowest touches it, an anchor keeps a planted foot or hand
// in place, and small solvers tilt the body or bend a knee until two contacts
// both reach the floor.
import * as THREE from 'three';
import { JOINTS } from './body.js';

const D = Math.PI / 180;
const arr = (v) => (typeof v === 'number' ? [v] : v || []);

// Pose keys (degrees; every one optional):
//   root: { pitch (tip forward), yaw, roll, x, z, lift }
//   spine, chest, neck, head: [flex, side bend to the left, twist]
//   hip, shoulder: [flex, abduction, rotation]   knee: flex   ankle: plantar flex
//   elbow: [flex, twist (+ turns the palm forward)]   toes: extension
//   wrist: raw [x, y, z]
// hip, knee, … apply to both sides; hipL / hipR override one side.
// e: effort 0..1 (drives the muscle signal); r: weight of the reach solver.
export function flatten(p) {
  const f = {};
  const r = p.root || {};
  f.root = [r.pitch || 0, r.yaw || 0, r.roll || 0];
  f.off = [r.x || 0, r.lift || 0, r.z || 0];
  for (const k of ['spine', 'chest', 'neck', 'head']) {
    const [fl = 0, sd = 0, tw = 0] = arr(p[k]);
    f[k] = [fl, tw, -sd];
  }
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const g = (k) => p[k + S] ?? p[k];
    const [hf = 0, ha = 0, hr = 0] = arr(g('hip'));
    f['hip' + S] = [-hf, s * hr, s * ha];
    f['knee' + S] = [arr(g('knee'))[0] || 0, 0, 0];
    const [ap = 0, ai = 0] = arr(g('ankle'));
    f['ankle' + S] = [ap, 0, s * ai];
    f['toes' + S] = [-(arr(g('toes'))[0] || 0), 0, 0];
    const [sf = 0, sa = 0, sr = 0] = arr(g('shoulder'));
    f['shoulder' + S] = [-sf, s * sr, s * sa];
    const [ef = 0, et = 0] = arr(g('elbow'));
    f['elbow' + S] = [-ef, s * et, 0];
    const [wx = 0, wy = 0, wz = 0] = arr(g('wrist'));
    f['wrist' + S] = [wx, s * wy, s * wz];
  }
  f.e = p.e ?? 0;
  f.r = p.r ?? 0;
  return f;
}

const KEYS3 = ['root', 'off', ...JOINTS];

export function mix(a, b, w, out = {}) {
  for (const k of KEYS3) {
    const x = a[k], y = b[k], o = out[k] || (out[k] = [0, 0, 0]);
    o[0] = x[0] + (y[0] - x[0]) * w; o[1] = x[1] + (y[1] - x[1]) * w; o[2] = x[2] + (y[2] - x[2]) * w;
  }
  out.e = a.e + (b.e - a.e) * w;
  out.r = a.r + (b.r - a.r) * w;
  return out;
}

export function copyFlat(f) { return mix(f, f, 0); }

const EASE = {
  inOut: (t) => t * t * (3 - 2 * t),
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  linear: (t) => t,
};

// Flatten every key of an exercise once.
export function prepare(ex) {
  ex.flats = ex.keys.map((k) => ({ t: k.t, ease: EASE[k.ease || 'inOut'], f: flatten(k.p) }));
  return ex;
}

// The pose at phase (0..1) of one cycle.
export function sample(ex, phase, out) {
  const K = ex.flats;
  const t = ((phase % 1) + 1) % 1;
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i].t) {
      const a = K[i - 1], b = K[i];
      const w = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return mix(a.f, b.f, b.ease(w), out);
    }
  }
  return mix(K[K.length - 1].f, K[K.length - 1].f, 0, out);
}

const _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _Qd = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3();

function wpos(m, v) { return v.setFromMatrixPosition(m.matrixWorld); }

function minY(body, names) {
  let lo = Infinity;
  for (const n of names) { const y = wpos(body.markers[n], _v).y; if (y < lo) lo = y; }
  return lo;
}

// 1-D bisection: f changes sign between lo and hi; leaves the rig at the root.
function solve(fn, lo, hi, it = 18) {
  let flo = fn(lo);
  const fhi = fn(hi);
  if (flo * fhi > 0) { const best = Math.abs(flo) < Math.abs(fhi) ? lo : hi; fn(best); return best; }
  for (let i = 0; i < it; i++) {
    const m = (lo + hi) / 2, fm = fn(m);
    if (fm * flo <= 0) hi = m; else { lo = m; flo = fm; }
  }
  const m = (lo + hi) / 2; fn(m); return m;
}

let ALL = null;

function phaseList(v, phase) {
  // [{ until, value }] → the value for this phase; a plain value passes through
  if (!Array.isArray(v) || !v.length || typeof v[0] !== 'object' || !('until' in v[0])) return v;
  const t = ((phase % 1) + 1) % 1;
  for (const s of v) if (t < s.until) return s.value;
  return v[v.length - 1].value;
}

// Pose the rig from a flat pose and the exercise's floor rules.
export function applyPose(body, f, cfg = {}, phase = 0) {
  const J = body.joints, root = J.root;
  if (!ALL) ALL = Object.keys(body.markers);
  for (const k of JOINTS) { const v = f[k]; J[k].rotation.set(v[0] * D, v[1] * D, v[2] * D, 'XZY'); }
  _E.set(f.root[0] * D, f.root[1] * D, f.root[2] * D, 'YXZ');
  _Q.setFromEuler(_E);
  root.position.set(0, 0, 0);
  root.quaternion.copy(_Q);
  root.updateMatrixWorld(true);

  // tilt the whole body until both groups of contacts are equally low
  const level = phaseList(cfg.level, phase);
  if (level) {
    const { a, b } = level;
    solve((d) => {
      _Qd.setFromAxisAngle(_X, d);
      root.quaternion.multiplyQuaternions(_Qd, _Q);
      root.updateMatrixWorld(true);
      return minY(body, b) - minY(body, a);
    }, -0.9, 0.9);
  }

  // bend one joint until a contact reaches the floor (weighted by f.r)
  const reach = phaseList(cfg.reach, phase);
  if (reach && f.r > 0.001) {
    const j = J[reach.joint], base = j.rotation.x;
    const d = solve((d) => {
      j.rotation.x = base + d;
      root.updateMatrixWorld(true);
      return wpos(body.markers[reach.marker], _v).y - minY(body, reach.to);
    }, -0.9, 0.9);
    j.rotation.x = base + d * Math.min(1, f.r);
    root.updateMatrixWorld(true);
  }

  // keep feet flat on the floor
  const flat = phaseList(cfg.flat, phase);
  if (flat) {
    for (const S of flat) {
      const ank = J['ankle' + S];
      let prev = Infinity;
      for (let i = 0; i < 3; i++) {
        root.updateMatrixWorld(true);
        wpos(body.markers['ball' + S], _v); wpos(body.markers['heel' + S], _w);
        const ang = Math.atan2(_v.y - _w.y, Math.hypot(_v.x - _w.x, _v.z - _w.z));
        if (Math.abs(ang) < 1e-4) break;
        const step = Math.abs(ang) > prev ? -ang : ang;
        ank.rotation.x += step;
        prev = Math.abs(ang);
      }
    }
    root.updateMatrixWorld(true);
  }

  // whatever is lowest touches the floor; an anchor holds its place
  const lo = minY(body, phaseList(cfg.ground, phase) || ALL);
  let x = f.off[0], z = f.off[2];
  const anc = phaseList(cfg.anchor, phase);
  if (anc) {
    let ax = 0, az = 0;
    for (const n of anc.pts) { wpos(body.markers[n], _v); ax += _v.x; az += _v.z; }
    ax /= anc.pts.length; az /= anc.pts.length;
    if (anc.axes !== 'z') x += -ax;
    z += -az;
  }
  root.position.set(x, -lo + f.off[1], z);
  root.updateMatrixWorld(true);
}

// Snapshot and blend whole rig states (for smooth changes between exercises).
const STATE_JOINTS = ['root', ...JOINTS];
export function capture(body, out) {
  const J = body.joints;
  out = out || { p: new THREE.Vector3(), q: STATE_JOINTS.map(() => new THREE.Quaternion()) };
  out.p.copy(J.root.position);
  STATE_JOINTS.forEach((k, i) => out.q[i].copy(J[k].quaternion));
  return out;
}

export function blend(body, a, b, w) {
  const J = body.joints;
  J.root.position.lerpVectors(a.p, b.p, w);
  STATE_JOINTS.forEach((k, i) => J[k].quaternion.slerpQuaternions(a.q[i], b.q[i], w));
  J.root.updateMatrixWorld(true);
}
