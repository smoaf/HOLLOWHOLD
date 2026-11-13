// The 3D stage: renderer, camera and views, the wireframe hold (a bowl of grid
// lines the figure stands in), the floor shadow, the training mat, colours
// read from the CSS tokens, muscle tinting and thumbnails.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildBody, SHARED, MUSCLES, rawColor } from './body.js';

const D = Math.PI / 180;

export const VIEWS = {
  stand: { az: 34, el: 9, dist: 4.5, ty: 0.92 },
  side: { az: 80, el: 8, dist: 4.5, ty: 0.86 },
  floor: { az: 84, el: 15, dist: 4.4, ty: 0.34 },
};

const GRID_VS = /* glsl */`
  attribute float aW;
  uniform vec3 uCam;
  varying float vA;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float facing = dot(normal, normalize(uCam - wp.xyz));
    vA = aW * smoothstep(0.02, 0.35, facing) * (1.0 - smoothstep(1.2, 2.7, wp.y));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const GRID_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() { gl_FragColor = vec4(uColor, uOpacity * vA); }`;

// Profile of the hold: flat floor, a curve, then a wall. Returns position and
// inward normal in the (r, y) plane at arc length s.
const FLAT0 = 0.35, FLAT1 = 2.3, BEND = 0.9, TOP = 2.8;
const L_FLAT = FLAT1 - FLAT0, L_ARC = Math.PI / 2 * BEND, L_ALL = L_FLAT + L_ARC + (TOP - BEND);
function profile(s) {
  if (s <= L_FLAT) return [FLAT0 + s, 0, 0, 1];
  if (s <= L_FLAT + L_ARC) {
    const t = (s - L_FLAT) / BEND;
    return [FLAT1 + BEND * Math.sin(t), BEND - BEND * Math.cos(t), -Math.sin(t), Math.cos(t)];
  }
  return [FLAT1 + BEND, BEND + (s - L_FLAT - L_ARC), -1, 0];
}

function buildHold() {
  const P = [], N = [], W = [];
  const seg = (a, b, w) => {
    P.push(...a.p, ...b.p); N.push(...a.n, ...b.n); W.push(w, w);
  };
  const at = (s, phi) => {
    const [r, y, nr, ny] = profile(s);
    const c = Math.cos(phi), sn = Math.sin(phi);
    return { p: [r * c, y, r * sn], n: [nr * c, ny, nr * sn] };
  };
  // rings
  for (let s = 0.15; s < L_ALL; s += 0.25) {
    const n = 160;
    for (let i = 0; i < n; i++) seg(at(s, i / n * 2 * Math.PI), at(s, (i + 1) / n * 2 * Math.PI), 1);
  }
  // meridians
  const M = 48;
  for (let k = 0; k < M; k++) {
    const phi = k / M * 2 * Math.PI;
    for (let s = 0; s < L_ALL - 0.001; s += 0.05) seg(at(s, phi), at(Math.min(L_ALL, s + 0.05), phi), 0.8);
  }
  // a measuring ring at 1 m with ticks every 5°, long ones every 30°
  const up = [0, 1, 0];
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * 2 * Math.PI, long = i % 6 === 0;
    const r0 = 1.0, r1 = long ? 1.09 : 1.04;
    seg({ p: [r0 * Math.cos(a), 0.001, r0 * Math.sin(a)], n: up }, { p: [r1 * Math.cos(a), 0.001, r1 * Math.sin(a)], n: up }, 1.8);
  }
  // centre cross
  seg({ p: [-0.12, 0.001, 0], n: up }, { p: [0.12, 0.001, 0], n: up }, 2);
  seg({ p: [0, 0.001, -0.12], n: up }, { p: [0, 0.001, 0.12], n: up }, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.3 } },
    vertexShader: GRID_VS, fragmentShader: GRID_FS, transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  return lines;
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.maxPolarAngle = 88 * D;
  controls.rotateSpeed = 0.7;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(1.4, 5.5, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 1, far: 12 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16, color: 0x000000 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), shadowMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const hold = buildHold();
  scene.add(hold);

  // training mat for floor exercises
  const matFill = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.9), matFill);
  mat.rotation.x = -Math.PI / 2; mat.position.y = 0.002; mat.renderOrder = -1;
  const matEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.66, 1.9)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }));
  mat.add(matEdge);
  scene.add(mat);
  let matOn = 0;

  const body = buildBody();
  scene.add(body.group);

  // ---- palette from CSS
  const pal = {};
  function readPalette() {
    for (const k of ['ink', 'paper', 'body', 'body-shade', 'core', 'core-shade', 'kit', 'kit-shade', 'lime', 'lime-shade', 'plum', 'plum-shade', 'grid', 'mat'])
      pal[k] = rawColor(css('--3d-' + k));
    hold.material.uniforms.uColor.value.copy(pal.grid);
    hold.material.uniforms.uOpacity.value = parseFloat(css('--3d-grid-alpha')) || 0.3;
    shadowMat.opacity = parseFloat(css('--3d-shadow-alpha')) || 0.16;
    matFill.color.setStyle(css('--3d-mat'));
    matEdge.material.color.setStyle(css('--3d-ink'));
    for (const l of body.lines) l.uniforms.uLine.value.copy(pal.ink);
    body.coreMat.uniforms.uFill.value.copy(pal.core);
    body.coreMat.uniforms.uShade.value.copy(pal['core-shade']);
    body.darkMat.uniforms.uFill.value.copy(pal.kit);
    body.darkMat.uniforms.uShade.value.copy(pal['kit-shade']);
    for (const m of Object.values(body.groupMats)) m.uniforms.uLine.value.copy(pal.ink);
  }
  readPalette();

  // ---- muscle tinting: per group, amounts of primary (p), secondary (s),
  // heat (h, 0..1) and focus (f); eased towards targets every frame
  const tint = {};
  for (const g of Object.keys(MUSCLES)) tint[g] = { p: 0, s: 0, h: 0, f: 0, tp: 0, ts: 0, th: 0, tf: 0 };
  let effort = 0;
  const _c = new THREE.Color(), _d = new THREE.Color(), _heat = new THREE.Color();
  function setTargets(map) {
    for (const g in tint) {
      const t = map[g] || {};
      tint[g].tp = t.p || 0; tint[g].ts = t.s || 0; tint[g].th = t.h || 0; tint[g].tf = t.f || 0;
    }
  }
  function updateTint(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    for (const g in tint) {
      const t = tint[g];
      t.p += (t.tp - t.p) * k; t.s += (t.ts - t.s) * k; t.h += (t.th - t.h) * k; t.f += (t.tf - t.f) * k;
      const u = body.groupMats[g].uniforms;
      // fill: body → plum (secondary) → lime (primary / focus); heat ramps into lime
      _c.copy(pal.body).lerp(pal.plum, t.s);
      _d.copy(pal['body-shade']).lerp(pal['plum-shade'], t.s);
      const p = Math.max(t.p, t.f);
      _c.lerp(pal.lime, p); _d.lerp(pal['lime-shade'], p);
      if (t.h > 0.001) {
        _heat.copy(pal.body).lerp(pal.lime, t.h);
        _c.lerp(_heat, Math.min(1, t.h * 4)); _d.lerp(_heat.multiplyScalar(0.85), Math.min(1, t.h * 4));
      }
      u.uFill.value.copy(_c); u.uShade.value.copy(_d);
      u.uFlow.value = Math.max(t.p * effort, t.f * 0.5);
    }
  }

  // ---- camera views: tween to a preset, and follow the body
  const target = new THREE.Vector3(0, 0.9, 0);
  let tween = null;
  let viewName = 'stand';
  const sph = (v) => {
    const off = camera.position.clone().sub(controls.target);
    const dist = off.length();
    return { az: Math.atan2(off.x, off.z) / D, el: Math.asin(off.y / dist) / D, dist };
  };
  function setView(name, instant) {
    viewName = name;
    const v = VIEWS[name] || VIEWS.stand;
    const from = sph();
    let daz = v.az - from.az;
    daz = ((daz + 540) % 360) - 180;
    tween = { t: instant ? 1 : 0, from, to: { az: from.az + daz, el: v.el, dist: v.dist }, ty: v.ty };
  }
  let userBusy = 0;
  controls.addEventListener('start', () => { tween = null; userBusy = 1; });
  controls.addEventListener('end', () => { userBusy = 0; });

  const _cent = new THREE.Vector3(), _tmp = new THREE.Vector3();
  function follow(dt) {
    // centre of the figure on the floor plane (pelvis and chest)
    body.joints.root.getWorldPosition(_cent);
    body.joints.chest.getWorldPosition(_tmp);
    _cent.add(_tmp).multiplyScalar(0.5);
    const v = VIEWS[viewName] || VIEWS.stand;
    const k = 1 - Math.exp(-dt * 3);
    const dx = (_cent.x - target.x) * k, dz = (_cent.z - target.z) * k, dy = (v.ty - target.y) * k;
    target.x += dx; target.z += dz; target.y += dy;
    camera.position.x += dx; camera.position.z += dz; camera.position.y += dy;
    controls.target.copy(target);
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.1);
      const e = tween.t * tween.t * (3 - 2 * tween.t);
      const az = (tween.from.az + (tween.to.az - tween.from.az) * e) * D;
      const el = (tween.from.el + (tween.to.el - tween.from.el) * e) * D;
      const dist = tween.from.dist + (tween.to.dist - tween.from.dist) * e;
      camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
      camera.lookAt(target);
      if (tween.t >= 1) tween = null;
    }
    // mat follows the body's long axis on the floor
    const want = viewName === 'floor' ? 1 : 0;
    matOn += (want - matOn) * k * 2;
    matFill.opacity = matOn * (parseFloat(css('--3d-mat-alpha')) || 0.5);
    matEdge.material.opacity = matOn * 0.9;
    mat.visible = matOn > 0.01;
    mat.position.x = _cent.x; mat.position.z = _cent.z;
  }

  // ---- size and the free area (the panel covers part of the canvas)
  let inset = { left: 0, bottom: 0, top: 0 };
  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // fit the figure into the free height when something covers the bottom
    camera.zoom = Math.max(0.35, Math.min(1, (H - inset.bottom - inset.top) / (H * 0.92)));
    const sx = inset.left / 2, sy = (inset.bottom - inset.top) / 2;
    if (sx || sy) camera.setViewOffset(W, H, -sx, sy, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    SHARED.uRes.value.set(W * pr, H * pr);
  }
  function setInset(i) { inset = { ...inset, ...i }; resize(); }

  function render(dt) {
    SHARED.uTime.value += dt;
    controls.update();
    follow(dt);
    hold.material.uniforms.uCam.value.copy(camera.position);
    updateTint(dt);
    renderer.render(scene, camera);
  }

  // ---- thumbnails: the current pose, framed, drawn into the corner of the
  // main canvas and copied out straight away (no pixel readback)
  const thumbCam = new THREE.PerspectiveCamera(26, 1, 0.05, 40);
  const box = new THREE.Box3(), bc = new THREE.Vector3(), bs = new THREE.Vector3();
  const out = document.createElement('canvas');
  const octx = out.getContext('2d');
  function snapshot(size, view) {
    const pr = renderer.getPixelRatio();
    const cv = renderer.domElement;
    size = Math.min(size, cv.width, cv.height);
    const v = VIEWS[view] || VIEWS.stand;
    box.setFromObject(body.group);
    box.getCenter(bc); box.getSize(bs);
    const r = Math.max(bs.x, bs.y, bs.z) * 0.58;
    const dist = r / Math.sin(13 * D);
    const az = v.az * D, el = Math.max(v.el, 10) * D;
    thumbCam.position.set(bc.x + dist * Math.sin(az) * Math.cos(el), bc.y + dist * Math.sin(el), bc.z + dist * Math.cos(az) * Math.cos(el));
    thumbCam.lookAt(bc);
    thumbCam.updateMatrixWorld();
    const keepRes = SHARED.uRes.value.clone();
    SHARED.uRes.value.set(size, size);
    const vis = [hold.visible, floor.visible, mat.visible];
    hold.visible = false; floor.visible = false; mat.visible = false;
    updateTint(0, true);
    const css = size / pr;
    renderer.setViewport(0, 0, css, css);
    renderer.setScissor(0, 0, css, css);
    renderer.setScissorTest(true);
    renderer.clear();
    renderer.render(scene, thumbCam);
    out.width = out.height = size;
    octx.clearRect(0, 0, size, size);
    octx.drawImage(cv, 0, cv.height - size, size, size, 0, 0, size, size);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    [hold.visible, floor.visible, mat.visible] = vis;
    SHARED.uRes.value.copy(keepRes);
    return out.toDataURL('image/png');
  }

  // ---- picking muscles
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(body.muscleMeshes, false)[0];
    return hit ? hit.object.userData.group : null;
  }

  resize();
  setView('stand', true);
  camera.position.set(0, 0.92, 4.5);
  controls.target.set(0, 0.92, 0);
  setView('stand', true);

  return {
    renderer, scene, camera, controls, body,
    render, resize, setInset, setView, setTargets, readPalette, snapshot, pick,
    get view() { return viewName; },
    set effort(e) { effort = e; },
    get busy() { return userBusy; },
  };
}
