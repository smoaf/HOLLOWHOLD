// The figure: a jointed rig rooted at the pelvis (y up, facing +z, its left
// side at +x) with every muscle group built as separate meshes on the bones.
// Drawn as line art: a flat two-tone fill, fibre lines that thicken in shadow,
// and an ink outline around every part.
import * as THREE from 'three';

export const MUSCLES = {
  chest:      { name: 'Chest',      latin: 'Pectoralis major' },
  shoulders:  { name: 'Shoulders',  latin: 'Deltoideus' },
  biceps:     { name: 'Biceps',     latin: 'Biceps brachii' },
  triceps:    { name: 'Triceps',    latin: 'Triceps brachii' },
  forearms:   { name: 'Forearms',   latin: 'Brachioradialis, wrist flexors and extensors' },
  abs:        { name: 'Abs',        latin: 'Rectus abdominis' },
  obliques:   { name: 'Obliques',   latin: 'Obliquus externus abdominis' },
  lats:       { name: 'Lats',       latin: 'Latissimus dorsi' },
  traps:      { name: 'Traps',      latin: 'Trapezius' },
  lowerback:  { name: 'Lower back', latin: 'Erector spinae' },
  glutes:     { name: 'Glutes',     latin: 'Gluteus maximus and medius' },
  quads:      { name: 'Quads',      latin: 'Quadriceps femoris' },
  hamstrings: { name: 'Hamstrings', latin: 'Biceps femoris, semitendinosus' },
  adductors:  { name: 'Adductors',  latin: 'Adductor longus and magnus' },
  calves:     { name: 'Calves',     latin: 'Gastrocnemius' },
  shins:      { name: 'Shins',      latin: 'Tibialis anterior' },
  neck:       { name: 'Neck',       latin: 'Sternocleidomastoideus' },
};

// Shared uniforms: time for the fibre flow, a fixed light in view space
// (upper left, in front: the figure is drawn, not lit), and the canvas size
// for the outline width.
export const SHARED = {
  uTime: { value: 0 },
  uLight: { value: new THREE.Vector3(-0.45, 0.72, 0.52).normalize() },
  uRes: { value: new THREE.Vector2(1, 1) },
};

const FILL_VS = /* glsl */`
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FILL_FS = /* glsl */`
  uniform vec3 uFill;
  uniform vec3 uShade;
  uniform vec3 uLine;
  uniform float uHatch;
  uniform float uFlow;
  uniform float uTime;
  uniform vec3 uLight;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    float ndl = dot(n, uLight);
    float tone = smoothstep(-0.05, 0.12, ndl);
    vec3 col = mix(uShade, uFill, tone);
    if (uHatch > 0.0) {
      float f = vUv.x;
      float w = fwidth(f);
      float d = abs(fract(f + 0.5) - 0.5);
      float shade = 1.0 - smoothstep(-0.2, 0.75, ndl);
      float lw = 0.045 + 0.14 * shade;
      float line = 1.0 - smoothstep(lw - w, lw + w, d);
      // working fibres: dashes run along the muscle
      float dash = step(0.42, fract(vUv.y * 7.0 - uTime * (0.6 + 1.6 * uFlow)));
      line *= mix(1.0, dash, step(0.001, uFlow));
      float ends = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
      float amt = uHatch * mix(0.22, 0.85, shade) * ends;
      col = mix(col, uLine, line * amt);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const LINE_VS = /* glsl */`
  uniform float uWidth;
  uniform vec2 uRes;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 nv = normalize(normalMatrix * normal);
    vec2 p = (projectionMatrix * vec4(nv, 0.0)).xy;
    p = p / max(length(p), 1e-4);
    clip.xy += p * uWidth * 2.0 / uRes * clip.w;
    gl_Position = clip;
  }`;

const LINE_FS = /* glsl */`
  uniform vec3 uLine;
  void main() { gl_FragColor = vec4(uLine, 1.0); }`;

// Colours are given as raw sRGB values (no colour management on these shaders),
// so what is set from the CSS tokens is exactly what shows.
export function rawColor(hex) { return new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace); }

function fillMat(hatch) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFill: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uLine: { value: new THREE.Color(0, 0, 0) },
      uHatch: { value: hatch },
      uFlow: { value: 0 },
      uTime: SHARED.uTime,
      uLight: SHARED.uLight,
    },
    vertexShader: FILL_VS,
    fragmentShader: FILL_FS,
  });
}

function lineMat(width) {
  return new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uRes: SHARED.uRes, uLine: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
    side: THREE.BackSide,
  });
}

// A muscle belly along +y from 0 to len: rx across, rz outwards (+z), flatter
// on the inner side. uv.x counts fibre lines around it (one every ~1 cm).
function belly(len, rx, rz, o = {}) {
  const { b = 0.5, inner = 0.5, seg = 20, rings = 16, pow = 0.5, spacing = 0.017 } = o;
  const k = Math.log(0.5) / Math.log(b);
  const perim = Math.PI * (rx + rz * (1 + inner) / 2);
  const lines = Math.max(6, Math.round(perim / spacing));
  const P = [], U = [], I = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = Math.pow(Math.sin(Math.PI * Math.pow(t, k)), pow);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = -Math.PI / 2 + u * Math.PI * 2; // seam on the inner side
      const s = Math.sin(a);
      P.push(rx * r * Math.cos(a), t * len, (s >= 0 ? rz : rz * inner) * r * s);
      U.push(u * lines, t);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, c = a + seg + 1;
    I.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  // close the seam and the two poles so the outline has no cracks
  const N = g.attributes.normal, n = new THREE.Vector3();
  for (let j = 0; j <= rings; j++) {
    const a = j * (seg + 1), c = a + seg;
    if (j === 0 || j === rings) {
      for (let i = 0; i <= seg; i++) N.setXYZ(a + i, 0, j === 0 ? -1 : 1, 0);
      continue;
    }
    n.set(N.getX(a) + N.getX(c), N.getY(a) + N.getY(c), N.getZ(a) + N.getZ(c)).normalize();
    N.setXYZ(a, n.x, n.y, n.z); N.setXYZ(c, n.x, n.y, n.z);
  }
  return g;
}

const _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _X = new THREE.Vector3(), _M = new THREE.Matrix4();

// Put a belly from a to b (parent space), its outward side turned towards n.
function place(mesh, a, b, n) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  _Y.subVectors(B, A).normalize();
  _Z.set(...n).normalize();
  _Z.addScaledVector(_Y, -_Z.dot(_Y)).normalize();
  _X.crossVectors(_Y, _Z);
  _M.makeBasis(_X, _Y, _Z);
  mesh.quaternion.setFromRotationMatrix(_M);
  mesh.position.copy(A);
}

// Muscles of the left side; the right side is mirrored (x negated).
// [group, bone, a, b, rx, rz, outward, options]
const MUSCLE_TABLE = [
  // torso
  ['chest', 'chest', [0.022, 0.2, 0.098], [0.168, 0.214, 0.05], 0.042, 0.03, [0.2, 0.4, 1]],
  ['chest', 'chest', [0.026, 0.07, 0.104], [0.17, 0.188, 0.058], 0.066, 0.036, [0.25, 0, 1], { b: 0.42 }],
  ['lats', 'chest', [0.045, -0.04, -0.09], [0.158, 0.17, -0.05], 0.078, 0.032, [0.55, 0, -1], { b: 0.45 }],
  ['traps', 'chest', [0.0, 0.34, -0.035], [0.168, 0.248, -0.028], 0.046, 0.032, [0, 1, -0.6]],
  ['traps', 'chest', [0.0, 0.04, -0.112], [0.11, 0.235, -0.098], 0.05, 0.024, [0.1, 0, -1]],
  ['lowerback', 'spine', [0.034, -0.08, -0.078], [0.04, 0.24, -0.094], 0.032, 0.03, [0, 0, -1]],
  ['obliques', 'spine', [0.1, -0.06, 0.02], [0.122, 0.18, 0.036], 0.048, 0.03, [1, 0, 0.45]],
  // rectus abdominis: two columns of segments
  ['abs', 'root', [0.03, -0.035, 0.084], [0.032, 0.05, 0.088], 0.03, 0.017, [0, 0, 1]],
  ['abs', 'spine', [0.033, -0.02, 0.083], [0.034, 0.045, 0.087], 0.031, 0.018, [0, 0, 1]],
  ['abs', 'spine', [0.034, 0.055, 0.09], [0.035, 0.12, 0.092], 0.032, 0.018, [0, 0, 1]],
  ['abs', 'spine', [0.035, 0.13, 0.093], [0.035, 0.195, 0.094], 0.032, 0.018, [0, 0, 1]],
  ['glutes', 'root', [0.05, 0.03, -0.09], [0.128, -0.14, -0.074], 0.084, 0.062, [0.25, 0, -1]],
  ['glutes', 'root', [0.118, 0.06, -0.02], [0.152, -0.06, -0.03], 0.05, 0.03, [1, 0, -0.3]],
  ['neck', 'neck', [0.042, 0.1, -0.02], [0.012, -0.03, 0.048], 0.018, 0.016, [1, 0, 1]],
  // arm
  ['shoulders', 'shoulderL', [0.0, 0.045, 0.036], [0.012, -0.14, 0.026], 0.036, 0.03, [0.3, 0, 1]],
  ['shoulders', 'shoulderL', [0.03, 0.05, 0.0], [0.034, -0.155, 0.0], 0.042, 0.03, [1, 0, 0]],
  ['shoulders', 'shoulderL', [0.0, 0.045, -0.036], [0.012, -0.14, -0.026], 0.036, 0.03, [0.3, 0, -1]],
  ['biceps', 'shoulderL', [0.0, -0.08, 0.03], [0.0, -0.275, 0.025], 0.03, 0.032, [0, 0, 1], { b: 0.6 }],
  ['triceps', 'shoulderL', [0.0, -0.05, -0.032], [0.0, -0.272, -0.025], 0.034, 0.03, [0, 0, -1], { b: 0.4 }],
  ['triceps', 'shoulderL', [0.028, -0.07, -0.015], [0.02, -0.21, -0.01], 0.026, 0.022, [1, 0, -1]],
  ['forearms', 'elbowL', [-0.005, -0.01, 0.022], [0.0, -0.22, 0.012], 0.028, 0.022, [-0.3, 0, 1], { b: 0.3 }],
  ['forearms', 'elbowL', [0.022, -0.01, -0.012], [0.008, -0.22, -0.008], 0.026, 0.022, [0.7, 0, -1], { b: 0.3 }],
  ['forearms', 'elbowL', [0.03, 0.04, 0.012], [0.012, -0.16, 0.016], 0.024, 0.022, [1, 0, 0.4], { b: 0.35 }],
  // leg
  ['quads', 'hipL', [0.0, -0.07, 0.062], [0.0, -0.41, 0.045], 0.04, 0.035, [0, 0, 1]],
  ['quads', 'hipL', [0.048, -0.07, 0.015], [0.032, -0.39, 0.022], 0.046, 0.035, [1, 0, 0.3]],
  ['quads', 'hipL', [-0.035, -0.22, 0.035], [-0.022, -0.41, 0.035], 0.036, 0.034, [-0.8, 0, 0.6], { b: 0.65 }],
  ['adductors', 'hipL', [-0.045, -0.03, 0.005], [-0.03, -0.3, 0.0], 0.042, 0.035, [-1, 0, 0], { b: 0.35 }],
  ['hamstrings', 'hipL', [0.028, -0.07, -0.055], [0.03, -0.41, -0.04], 0.034, 0.034, [0.3, 0, -1]],
  ['hamstrings', 'hipL', [-0.022, -0.07, -0.055], [-0.025, -0.41, -0.04], 0.034, 0.034, [-0.3, 0, -1]],
  ['calves', 'kneeL', [-0.02, -0.02, -0.04], [-0.008, -0.25, -0.03], 0.032, 0.036, [-0.3, 0, -1], { b: 0.35 }],
  ['calves', 'kneeL', [0.022, -0.02, -0.036], [0.01, -0.23, -0.028], 0.028, 0.032, [0.3, 0, -1], { b: 0.35 }],
  ['shins', 'kneeL', [0.018, -0.04, 0.034], [0.008, -0.33, 0.028], 0.02, 0.018, [0.4, 0, 1]],
];

// Deep forms (the body under the muscles): [bone, a, b, rx, rz, outward, options]
const CORE_TABLE = [
  ['root', [0, -0.13, 0.0], [0, 0.08, -0.005], 0.152, 0.108, [0, 0, 1], { inner: 0.95 }],
  ['spine', [0, -0.08, 0.0], [0, 0.25, -0.005], 0.132, 0.092, [0, 0, 1], { inner: 0.95 }],
  ['chest', [0, -0.1, -0.008], [0, 0.32, -0.012], 0.158, 0.11, [0, 0, 1], { inner: 0.95, b: 0.56 }],
  ['chest', [-0.2, 0.232, -0.012], [0.2, 0.232, -0.012], 0.058, 0.05, [0, 0, 1], { inner: 1 }],
  ['neck', [0, -0.03, 0], [0, 0.12, 0.004], 0.05, 0.052, [0, 0, 1], { inner: 1 }],
  ['shoulderL', [0, 0.03, 0], [0, -0.31, 0], 0.043, 0.043, [0, 0, 1], { inner: 1, b: 0.45 }],
  ['elbowL', [0, 0.03, 0], [0, -0.265, 0], 0.037, 0.033, [0, 0, 1], { inner: 1, b: 0.3 }],
  ['hipL', [0, 0.05, 0], [0, -0.46, 0], 0.07, 0.07, [0, 0, 1], { inner: 1, b: 0.35 }],
  ['kneeL', [0, 0.03, 0], [0, -0.44, 0], 0.045, 0.045, [0, 0, 1], { inner: 1, b: 0.3 }],
  ['ankleL', [0, -0.05, -0.068], [0, -0.052, 0.152], 0.044, 0.032, [0, 1, 0], { inner: 0.4, b: 0.55 }],
  ['toesL', [0, -0.002, -0.012], [0, -0.004, 0.068], 0.041, 0.019, [0, 1, 0], { inner: 0.5 }],
];

// Contact points: what touches the floor, by bone and position.
const MARKER_TABLE = [
  ['heelL', 'ankleL', [0, -0.064, -0.056]],
  ['ballL', 'ankleL', [0, -0.066, 0.128]],
  ['tipL', 'toesL', [0, -0.014, 0.062]],
  ['palmL', 'wristL', [-0.015, -0.07, 0]],
  ['fingerL', 'wristL', [0, -0.15, 0]],
  ['elbowL', 'elbowL', [0, 0.0, -0.044]],
  ['forearmL', 'elbowL', [0, -0.15, -0.033]],
  ['kneeL', 'kneeL', [0, 0.0, 0.07]],
  ['sacrum', 'root', [0, -0.04, -0.112]],
  ['buttL', 'root', [0.085, -0.11, -0.13]],
  ['upperBack', 'chest', [0, 0.16, -0.122]],
  ['bladeL', 'chest', [0.09, 0.18, -0.11]],
  ['chestFront', 'chest', [0, 0.12, 0.122]],
  ['headBack', 'head', [0, 0.1, -0.104]],
  ['nose', 'head', [0, 0.085, 0.112]],
];

export const JOINTS = ['spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'hipL', 'kneeL', 'ankleL', 'toesL',
  'shoulderR', 'elbowR', 'wristR', 'hipR', 'kneeR', 'ankleR', 'toesR'];

export function buildBody() {
  const group = new THREE.Group();
  const J = {};
  const root = new THREE.Object3D();
  root.name = 'root';
  J.root = root;
  group.add(root);
  const node = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name; o.position.set(x, y, z);
    parent.add(o); J[name] = o; return o;
  };
  node('spine', root, 0, 0.08, 0);
  node('chest', J.spine, 0, 0.17, 0);
  node('neck', J.chest, 0, 0.27, -0.01);
  node('head', J.neck, 0, 0.085, 0.005);
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    node('shoulder' + S, J.chest, s * 0.176, 0.224, -0.006);
    node('elbow' + S, J['shoulder' + S], 0, -0.29, 0);
    node('wrist' + S, J['elbow' + S], 0, -0.255, 0);
    node('hip' + S, root, s * 0.088, -0.05, 0);
    node('knee' + S, J['hip' + S], 0, -0.44, 0);
    node('ankle' + S, J['knee' + S], 0, -0.42, -0.005);
    node('toes' + S, J['ankle' + S], 0, -0.052, 0.138);
  }

  const lineMuscle = lineMat(1.15);
  const lineCore = lineMat(1.9);
  const coreMat = fillMat(0);
  const darkMat = fillMat(0); // head, hands, feet: the dark kit
  const groupMats = {};
  for (const g of Object.keys(MUSCLES)) groupMats[g] = fillMat(1);
  const muscleMeshes = [];

  const add = (bone, geo, mat, line, a, b, n) => {
    const m = new THREE.Mesh(geo, mat);
    if (a) place(m, a, b, n);
    m.castShadow = true;
    const o = new THREE.Mesh(geo, line);
    o.raycast = () => {};
    o.userData.outline = true;
    m.add(o);
    J[bone].add(m);
    return m;
  };
  const side = (bone, s) => bone.endsWith('L') && s < 0 ? bone.slice(0, -1) + 'R' : bone;
  const mir = (v, s) => [v[0] * s, v[1], v[2]];

  for (const [bone, a, b, rx, rz, n, o = {}] of CORE_TABLE) {
    const sided = bone.endsWith('L');
    for (const s of sided ? [1, -1] : [1]) {
      const len = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
      const dark = bone.startsWith('ankle') || bone.startsWith('toes');
      add(side(bone, s), belly(len, rx, rz, o), dark ? darkMat : coreMat, lineCore, mir(a, s), mir(b, s), mir(n, s));
    }
  }
  for (const [g, bone, a, b, rx, rz, n, o = {}] of MUSCLE_TABLE) {
    for (const s of [1, -1]) {
      const len = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
      const m = add(side(bone, s), belly(len, rx * 1.22, rz * 1.18, o), groupMats[g], lineMuscle, mir(a, s), mir(b, s), mir(n, s));
      m.userData.group = g;
      muscleMeshes.push(m);
    }
  }

  // head: a smooth egg with a jaw, in the dark kit
  const headGeo = new THREE.SphereGeometry(1, 32, 24);
  const head = add('head', headGeo, darkMat, lineCore);
  head.scale.set(0.088, 0.116, 0.1); head.position.set(0, 0.106, 0.008);
  const jaw = add('head', headGeo, darkMat, lineCore);
  jaw.scale.set(0.066, 0.05, 0.072); jaw.position.set(0, 0.045, 0.036);
  // knee caps and ankles
  for (const S of ['L', 'R']) {
    const cap = add('knee' + S, new THREE.SphereGeometry(1, 16, 12), coreMat, lineCore);
    cap.scale.set(0.034, 0.038, 0.026); cap.position.set(0, 0.005, 0.05);
    const ank = add('ankle' + S, new THREE.SphereGeometry(1, 16, 12), darkMat, lineCore);
    ank.scale.set(0.036, 0.04, 0.038); ank.position.set(0, -0.022, -0.006);
  }
  // hands: a mitten and a thumb, palms facing the body
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    add('wrist' + S, belly(0.15, 0.036, 0.019, { inner: 0.6, b: 0.45 }), darkMat, lineCore,
      [0, 0.005, 0], [0, -0.145, 0], [s, 0, 0]);
    add('wrist' + S, belly(0.065, 0.012, 0.012, { inner: 1 }), darkMat, lineCore,
      [-s * 0.008, -0.02, 0.024], [-s * 0.014, -0.08, 0.04], [0, 0, 1]);
  }

  const markers = {};
  const addMarker = (name, bone, p) => {
    const o = new THREE.Object3D(); o.position.set(...p); J[bone].add(o); markers[name] = o;
  };
  for (const [name, bone, p] of MARKER_TABLE) {
    if (name.endsWith('L')) {
      addMarker(name, bone, p);
      addMarker(name.slice(0, -1) + 'R', side(bone, -1), mir(p, -1));
    } else addMarker(name, bone, p);
  }

  // dumbbells: handle across the fist, shown only for the exercises that use them
  const props = {};
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const handle = add('wrist' + S, new THREE.CylinderGeometry(0.014, 0.014, 0.15, 12), darkMat, lineCore);
    const plates = [];
    for (const z of [-0.085, 0.085]) {
      const p = add('wrist' + S, new THREE.CylinderGeometry(0.048, 0.048, 0.05, 6), coreMat, lineCore);
      p.rotation.x = Math.PI / 2; p.position.set(-s * 0.03, -0.085, z);
      plates.push(p);
    }
    handle.rotation.x = Math.PI / 2; handle.position.set(-s * 0.03, -0.085, 0);
    props['dumbbell' + S] = [handle, ...plates];
    for (const m of props['dumbbell' + S]) m.visible = false;
  }

  return {
    group, joints: J, markers, groupMats, coreMat, darkMat, muscleMeshes, props,
    lines: [lineMuscle, lineCore],
    showProps(on) { for (const k in props) for (const m of props[k]) m.visible = on; },
  };
}
