// Hollowhold: the app. Panel views (exercises, workouts, log), the session
// runner (ready, work, rest), the HUD, and the bridge to the 3D stage.
import { createStage } from './stage.js';
import { MUSCLES } from './body.js';
import { EXERCISES, byId, IDLE, AREAS } from './exercises.js';
import { WORKOUTS, workoutById, estimate, coverage } from './workouts.js';
import { sample, applyPose, capture, blend } from './pose.js';
import * as store from './storage.js';
import { cue, unlock, setEnabled as setSound } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEST = new URLSearchParams(location.search).has('test');

// ---------------------------------------------------------------- settings
const settings = store.loadSettings();
if (settings.theme) document.documentElement.dataset.theme = settings.theme;
setSound(settings.sound);

// ---------------------------------------------------------------- stage
let stage;
try {
  stage = createStage($('#stage'));
} catch (e) {
  document.body.classList.add('no-webgl');
  const p = h('p', { class: 'noscript' }, 'This browser could not start WebGL, so the 3D figure cannot be shown.');
  document.body.append(p);
  throw e;
}
const body = stage.body;

// ---------------------------------------------------------------- state
const S = {
  tab: 'exercises',
  view: 'exercises',
  back: 'exercises',
  filter: 'all',
  ex: 'squat',            // selected exercise
  workout: null,          // selected workout id
  muscle: null,           // muscle view open
  hover: null,            // chip hover → focus
  setup: {},              // per exercise: { sets, reps | secs, rest }
  run: null,              // the running session
};
const setupFor = (id) => S.setup[id] || (S.setup[id] = { ...byId[id].defaults });

// ---------------------------------------------------------------- animation
const anim = {
  key: '',          // what is shown: exercise id + moving/still
  ex: IDLE, phase: 0, moving: true,
  from: null, to: null, blendT: 1,
  flat: null, time: 0,
};
anim.to = capture(body);
anim.from = capture(body);

function show(ex, moving) {
  const key = ex.id + (moving ? ':m' : ':s');
  if (key === anim.key) return;
  capture(body, anim.from);
  anim.blendT = anim.key ? 0 : 1;
  anim.key = key;
  if (anim.ex !== ex) anim.phase = 0;
  anim.ex = ex;
  anim.moving = moving;
  body.showProps(!!ex.props);
  stage.setView(ex.view || 'stand', reduceMotion);
  $('#bigword-text').textContent = ex.id === 'idle' ? 'Hollowhold' : ex.name;
}

function stepAnim(dt) {
  const ex = anim.ex;
  if (anim.moving) anim.phase += dt * settings.speed / ex.tempo;
  const f = sample(ex, anim.moving ? anim.phase : 0);
  if (!anim.moving || ex.kind === 'idle') {
    // breathing on a still pose
    const b = Math.sin(anim.time * 1.6);
    f.chest[0] += b * 1.2; f.spine[0] += b * 0.5;
  }
  applyPose(body, f, ex, anim.moving ? anim.phase : 0);
  if (anim.blendT < 1) {
    anim.blendT = Math.min(1, anim.blendT + dt / (reduceMotion ? 0.01 : 0.7));
    capture(body, anim.to);
    const w = anim.blendT * anim.blendT * (3 - 2 * anim.blendT);
    blend(body, anim.from, anim.to, w);
  }
  anim.flat = f;
  stage.effort = anim.moving ? f.e : 0.3;
}

// what the figure should do right now
function syncFigure() {
  const r = S.run;
  if (r) {
    const st = r.steps[r.idx];
    if (st.kind === 'work') show(st.ex, true);
    else show(st.ex, false);
    return;
  }
  if (S.view === 'log') { show(IDLE, true); return; }
  if (S.view === 'workout' && S.workout) { show(byId[S.previewEx || workoutById[S.workout].items[0].ex], true); return; }
  if (S.view === 'muscle' && S.muscleEx) { show(byId[S.muscleEx], true); return; }
  show(byId[S.ex], true);
}

// ---------------------------------------------------------------- muscle tint
let heat = {};
function computeHeat() {
  const log = store.loadLog();
  const since = Date.now() - 7 * 864e5;
  const v = {};
  for (const e of log) {
    if (new Date(e.at).getTime() < since) continue;
    for (const s of e.sets || []) {
      const ex = byId[s.ex];
      if (!ex) continue;
      for (const g of ex.primary) v[g] = (v[g] || 0) + 1;
      for (const g of ex.secondary) v[g] = (v[g] || 0) + 0.5;
    }
  }
  heat = {};
  for (const [g, n] of Object.entries(v)) heat[g] = n > 5 ? 1 : n > 2 ? 0.66 : n > 0 ? 0.33 : 0;
}

function syncTint() {
  const t = {};
  if (!settings.muscles) { stage.setTargets(t); return; }
  const focus = S.hover || (S.view === 'muscle' ? S.muscle : null);
  if (focus && !S.run) { t[focus] = { f: 1 }; stage.setTargets(t); return; }
  if (S.view === 'log' && !S.run) {
    for (const [g, v] of Object.entries(heat)) t[g] = { h: v };
    stage.setTargets(t); return;
  }
  const ex = anim.ex;
  for (const g of ex.secondary) t[g] = { s: 1 };
  for (const g of ex.primary) t[g] = { p: 1 };
  stage.setTargets(t);
}

// ---------------------------------------------------------------- chips
function muscleChip(g, kind, interactive = true) {
  const m = MUSCLES[g];
  const el = h(interactive ? 'button' : 'span', {
    class: `chip chip-${kind}`, type: interactive ? 'button' : null, title: m.latin,
    onmouseenter: interactive ? () => { S.hover = g; syncTint(); } : null,
    onmouseleave: interactive ? () => { S.hover = null; syncTint(); } : null,
    onfocus: interactive ? () => { S.hover = g; syncTint(); } : null,
    onblur: interactive ? () => { S.hover = null; syncTint(); } : null,
    onclick: interactive ? () => openMuscle(g) : null,
  }, m.name);
  return el;
}

// ---------------------------------------------------------------- views
function setView(view, opts = {}) {
  if (S.view !== view && !opts.keepBack) S.back = S.view;
  S.view = view;
  S.hover = null;
  for (const v of $$('.view')) v.hidden = v.dataset.view !== view;
  const tab = { exercises: 'exercises', detail: 'exercises', workouts: 'workouts', workout: 'workouts', log: 'log', muscle: S.tab, session: S.tab }[view];
  S.tab = tab;
  for (const b of $$('.tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  if (!opts.keepScroll) $('#panel-body').scrollTop = 0;
  syncFigure();
  syncTint();
  syncHash();
}

function syncHash() {
  let hsh = '';
  if (S.view === 'detail') hsh = S.ex;
  else if (S.view === 'workout') hsh = 'workout-' + S.workout;
  else if (S.view === 'workouts') hsh = 'workouts';
  else if (S.view === 'log') hsh = 'log';
  const want = hsh ? '#' + hsh : '';
  if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
}

function routeHash() {
  const hsh = location.hash.slice(1);
  if (byId[hsh]) { S.ex = hsh; renderDetail(); setView('detail'); }
  else if (hsh.startsWith('workout-') && workoutById[hsh.slice(8)]) openWorkout(hsh.slice(8));
  else if (hsh === 'workouts') setView('workouts');
  else if (hsh === 'log') { renderLog(); setView('log'); }
}

// exercises grid
const thumbs = {};
function renderFilters() {
  const f = $('#filters');
  f.replaceChildren(...[['all', 'All'], ...Object.entries(AREAS)].map(([k, label]) =>
    h('button', { type: 'button', class: 'filter', 'aria-pressed': String(S.filter === k), onclick: () => { S.filter = k; renderFilters(); renderTiles(); } }, label)));
}
function renderTiles() {
  const list = EXERCISES.filter((e) => S.filter === 'all' || e.area === S.filter);
  $('#tiles').replaceChildren(...list.map((ex) => {
    const img = h('img', { alt: '', src: thumbs[ex.id] || '', width: 256, height: 256, 'data-thumb': ex.id });
    return h('button', {
      type: 'button', class: 'tile' + (ex.id === S.ex ? ' is-current' : ''),
      onclick: () => { S.ex = ex.id; renderDetail(); setView('detail'); },
      onmouseenter: () => { if (S.view === 'exercises') show(ex, true); },
      onmouseleave: () => { if (S.view === 'exercises') syncFigure(); },
    },
    h('span', { class: 'tile-img' }, img),
    h('span', { class: 'tile-name' }, ex.name),
    h('span', { class: 'tile-meta mono' }, ex.primary.map((g) => MUSCLES[g].name).join(' · ')));
  }));
}

function stepper(label, value, unit, onchange, min, max, step) {
  const out = h('output', { class: 'step-val' }, String(value), unit ? h('small', {}, unit) : null);
  const set = (v) => { v = Math.max(min, Math.min(max, v)); onchange(v); out.firstChild.textContent = String(v); };
  let cur = value;
  return h('div', { class: 'stepper' },
    h('span', { class: 'mono label' }, label),
    h('div', { class: 'step-ctrl' },
      h('button', { type: 'button', class: 'step-btn', 'aria-label': `Less ${label.toLowerCase()}`, onclick: () => { cur = Math.max(min, cur - step); set(cur); } }, '−'),
      out,
      h('button', { type: 'button', class: 'step-btn', 'aria-label': `More ${label.toLowerCase()}`, onclick: () => { cur = Math.min(max, cur + step); set(cur); } }, '+')));
}

function specRow(k, v) { return h('div', {}, h('dt', { class: 'mono' }, k), h('dd', {}, v)); }

function renderDetail() {
  const ex = byId[S.ex];
  const su = setupFor(ex.id);
  const hold = ex.kind === 'hold';
  const ctaLabel = () => hold ? `Start · ${su.sets} × ${su.secs} s` : `Start · ${su.sets} × ${su.reps}`;
  const cta = h('button', { type: 'button', class: 'btn btn-ink cta', onclick: () => startSession(ex.name, [{ ex: ex.id, ...su }]) }, ctaLabel(), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
  const upd = () => { cta.firstChild.textContent = ctaLabel(); };
  $('#v-detail').replaceChildren(
    h('button', { type: 'button', class: 'back mono', onclick: () => setView('exercises') }, '← All exercises'),
    h('h2', { class: 'title' }, ex.name),
    h('dl', { class: 'spec' },
      specRow('Type', hold ? 'Hold' : 'Reps'),
      specRow('Tempo', hold ? 'Steady' : `${(ex.tempo / (ex.repsPerCycle || 1)).toFixed(1)} s / rep`),
      specRow('Area', AREAS[ex.area])),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Muscles'),
      h('div', { class: 'chips' }, ex.primary.map((g) => muscleChip(g, 'p')), ex.secondary.map((g) => muscleChip(g, 's')))),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'How to'),
      h('ol', { class: 'cues' }, ex.cues.map((c) => h('li', {}, c)))),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Set up'),
      h('div', { class: 'steppers' },
        stepper('Sets', su.sets, '', (v) => { su.sets = v; upd(); }, 1, 10, 1),
        hold ? stepper('Seconds', su.secs, 's', (v) => { su.secs = v; upd(); }, 10, 180, 5)
          : stepper('Reps', su.reps, '', (v) => { su.reps = v; upd(); }, 1, 60, 1),
        stepper('Rest', su.rest, 's', (v) => { su.rest = v; }, 0, 180, 15))),
    cta,
  );
}

// workouts
function coverageBar(items) {
  const c = coverage(items);
  return h('span', { class: 'cover', title: 'Muscle groups covered' }, Object.keys(MUSCLES).map((g) =>
    h('i', { class: c[g] === 'p' ? 'on-p' : c[g] === 's' ? 'on-s' : '', title: MUSCLES[g].name })));
}
function renderWorkouts() {
  $('#v-workouts').replaceChildren(
    h('p', { class: 'lede' }, 'Ready-made sessions. The figure demonstrates every exercise as you go.'),
    h('div', { class: 'rows' }, WORKOUTS.map((w) => h('button', { type: 'button', class: 'wrow', onclick: () => openWorkout(w.id) },
      h('span', { class: 'wrow-name' }, w.name),
      h('span', { class: 'wrow-meta mono' }, `${w.items.length} exercises · ~${Math.round(estimate(w.items) / 60)} min`),
      coverageBar(w.items),
      h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')))),
  );
}
function openWorkout(id) {
  S.workout = id;
  S.previewEx = null;
  const w = workoutById[id];
  const total = estimate(w.items);
  $('#v-workout').replaceChildren(
    h('button', { type: 'button', class: 'back mono', onclick: () => setView('workouts') }, '← All workouts'),
    h('h2', { class: 'title' }, w.name),
    h('p', { class: 'lede' }, w.note),
    h('dl', { class: 'spec' },
      specRow('Exercises', String(w.items.length)),
      specRow('Sets', String(w.items.reduce((s, it) => s + it.sets, 0))),
      specRow('Time', `~${Math.round(total / 60)} min`)),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Coverage'),
      coverageBar(w.items)),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Order'),
      h('ol', { class: 'plan' }, w.items.map((it) => {
        const ex = byId[it.ex];
        return h('li', {},
          h('button', {
            type: 'button', class: 'plan-row',
            onclick: () => { S.previewEx = it.ex; syncFigure(); syncTint(); for (const r of $$('#v-workout .plan-row')) r.classList.toggle('is-current', r.dataset.ex === it.ex); },
            'data-ex': it.ex,
          },
          h('span', { class: 'plan-name' }, ex.name),
          h('span', { class: 'plan-dose mono' }, `${it.sets} × ${ex.kind === 'hold' ? it.secs + ' s' : it.reps}`)));
      }))),
    h('button', { type: 'button', class: 'btn btn-ink cta', onclick: () => startSession(w.name, w.items) }, 'Start workout', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')),
  );
  setView('workout');
  $('#v-workout .plan-row')?.classList.add('is-current');
}

// log
function renderLog() {
  computeHeat();
  const log = store.loadLog();
  const since = Date.now() - 7 * 864e5;
  const week = log.filter((e) => new Date(e.at).getTime() >= since);
  const mins = Math.round(week.reduce((s, e) => s + (e.secs || 0), 0) / 60);
  const reps = week.reduce((s, e) => s + (e.reps || 0), 0);
  // streak: consecutive days up to today with at least one session
  const days = new Set(log.map((e) => new Date(e.at).toDateString()));
  let streak = 0;
  for (let d = new Date(); days.has(d.toDateString()); d.setDate(d.getDate() - 1)) streak++;
  const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'mono label' }, k), h('b', {}, String(v)));
  const clearBtn = h('button', { type: 'button', class: 'btn btn-quiet mono', onclick: () => {
    if (clearBtn.dataset.armed) { store.clearLog(); renderLog(); syncTint(); return; }
    clearBtn.dataset.armed = '1'; clearBtn.textContent = 'Clear all entries? Click again';
    setTimeout(() => { if (clearBtn.isConnected) { delete clearBtn.dataset.armed; clearBtn.textContent = 'Clear log'; } }, 3500);
  } }, 'Clear log');
  $('#v-log').replaceChildren(
    h('div', { class: 'stats' }, stat('Sessions · 7 days', week.length), stat('Minutes', mins), stat('Reps', reps), stat('Day streak', streak)),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Muscle load · last 7 days'),
      h('p', { class: 'note' }, log.length ? 'The figure shows how many sets each muscle group got this week.' : 'Finish a set and the figure starts to fill in: each muscle group shows how much work it got this week.'),
      h('div', { class: 'heat-key mono' },
        h('span', {}, h('i', { class: 'hk hk0' }), 'None'), h('span', {}, h('i', { class: 'hk hk1' }), '1–2 sets'),
        h('span', {}, h('i', { class: 'hk hk2' }), '3–5'), h('span', {}, h('i', { class: 'hk hk3' }), '6+'))),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Sessions'),
      log.length
        ? h('ol', { class: 'log' }, log.slice(0, 40).map((e) => h('li', {},
          h('span', { class: 'log-date mono' }, new Date(e.at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })),
          h('span', { class: 'log-title' }, e.title, e.partial ? h('small', { class: 'mono' }, ' · ended early') : null),
          h('span', { class: 'log-meta mono' }, `${mmss(e.secs)} · ${e.reps} reps`))))
        : h('p', { class: 'empty' }, 'No sessions yet. Pick an exercise or a workout and press Start; finished sets are saved here, on this device only.')),
    ...(log.length ? [clearBtn] : []),
  );
}

// muscle view
function openMuscle(g) {
  S.muscle = g;
  const prim = EXERCISES.filter((e) => e.primary.includes(g));
  const sec = EXERCISES.filter((e) => e.secondary.includes(g));
  S.muscleEx = (prim[0] || sec[0])?.id || null;
  const row = (e, kind) => h('button', {
    type: 'button', class: 'plan-row',
    onclick: () => { S.ex = e.id; renderDetail(); setView('detail'); },
    onmouseenter: () => { S.muscleEx = e.id; syncFigure(); },
  }, h('span', { class: 'plan-name' }, e.name), h('span', { class: `chip chip-${kind}` }, kind === 'p' ? 'Primary' : 'Secondary'));
  const back = S.view === 'muscle' ? S.back : S.view;
  $('#v-muscle').replaceChildren(
    h('button', { type: 'button', class: 'back mono', onclick: () => { S.muscle = null; setView(back === 'muscle' ? 'exercises' : back); } }, '← Back'),
    h('p', { class: 'mono label' }, 'Muscle group'),
    h('h2', { class: 'title' }, MUSCLES[g].name),
    h('p', { class: 'latin' }, MUSCLES[g].latin),
    h('div', { class: 'block' },
      h('h3', { class: 'mono label' }, 'Trained by'),
      prim.length || sec.length
        ? h('div', { class: 'rows' }, prim.map((e) => row(e, 'p')), sec.map((e) => row(e, 's')))
        : h('p', { class: 'empty' }, 'None of the exercises here targets this group directly.')),
  );
  setView('muscle', { keepBack: S.view === 'muscle' });
  S.back = back;
}

// tabs
for (const b of $$('.tabs [role=tab]')) b.addEventListener('click', () => {
  if (S.run) return;
  const t = b.dataset.tab;
  if (t === 'exercises') setView('exercises');
  else if (t === 'workouts') setView('workouts');
  else { renderLog(); setView('log'); }
});
// arrow keys between tabs
$('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = $$('.tabs [role=tab]');
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  n.focus(); n.click();
});

// ---------------------------------------------------------------- session
let wake = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

function startSession(title, items) {
  unlock();
  const steps = [];
  items.forEach((it, i) => {
    const ex = byId[it.ex];
    if (i === 0) steps.push({ kind: 'ready', ex, secs: 5, next: { ex, it, set: 1 } });
    for (let s = 1; s <= it.sets; s++) {
      steps.push({ kind: 'work', ex, it, set: s, sets: it.sets, reps: ex.kind === 'hold' ? 0 : it.reps, secs: ex.kind === 'hold' ? it.secs : 0 });
      const last = i === items.length - 1 && s === it.sets;
      if (!last) {
        const nx = s < it.sets ? { ex, it, set: s + 1 } : { ex: byId[items[i + 1].ex], it: items[i + 1], set: 1 };
        steps.push({ kind: 'rest', ex: nx.ex, secs: s < it.sets ? it.rest : Math.max(it.rest, 10), next: nx });
      }
    }
  });
  S.run = { title, items, steps, idx: 0, t: 0, phase: 0, reps: 0, paused: false, elapsed: 0, sets: [], lastWhole: null };
  document.body.classList.add('in-session');
  $('#hud').hidden = false;
  renderSessionPlan();
  setView('session');
  layout();
  keepAwake(true);
  enterStep();
}

function workSteps() { return S.run.steps.filter((s) => s.kind === 'work'); }

function renderSessionPlan() {
  const r = S.run;
  const items = r.items.map((it, i) => {
    const ex = byId[it.ex];
    return h('li', { 'data-i': String(i) },
      h('span', { class: 'plan-name' }, ex.name),
      h('span', { class: 'plan-dose mono' }, `${it.sets} × ${ex.kind === 'hold' ? it.secs + ' s' : it.reps}`),
      h('span', { class: 'plan-sets' }, Array.from({ length: it.sets }, () => h('i'))));
  });
  $('#v-session').replaceChildren(
    h('p', { class: 'mono label' }, 'Session'),
    h('h2', { class: 'title' }, r.title),
    h('ol', { class: 'plan plan-live' }, items),
  );
}
function syncSessionPlan() {
  const r = S.run;
  const st = r.steps[r.idx];
  const curItem = r.items.indexOf(st.kind === 'work' ? st.it : st.next.it);
  $$('#v-session li').forEach((li, i) => {
    li.classList.toggle('is-current', i === curItem);
    const it = r.items[i];
    const done = r.sets.filter((s) => s.item === it).length;
    $$('.plan-sets i', li).forEach((c, k) => c.classList.toggle('done', k < done));
    li.classList.toggle('is-done', done >= it.sets);
  });
}

function enterStep() {
  const r = S.run;
  r.t = 0; r.phase = 0; r.reps = 0; r.lastWhole = null;
  const st = r.steps[r.idx];
  if (st.kind === 'work') { anim.phase = 0; cue.go(); }
  else if (st.kind === 'rest' && r.idx > 0) cue.rest();
  syncFigure();
  syncTint();
  syncSessionPlan();
  $('#h-pause').textContent = 'Pause';
  r.paused = false;
  renderGauge(st);
}

function finishStep(skipped) {
  const r = S.run;
  const st = r.steps[r.idx];
  if (st.kind === 'work') {
    const reps = st.reps ? Math.min(st.reps, r.reps) : 0;
    const secs = st.secs ? Math.min(st.secs, Math.floor(r.t)) : 0;
    if (!skipped || reps > 0 || secs >= 5) r.sets.push({ ex: st.ex.id, item: st.it, reps, secs });
  }
  r.idx++;
  if (r.idx >= r.steps.length) { completeSession(false); return; }
  enterStep();
}

function completeSession(partial) {
  const r = S.run;
  S.run = null;
  document.body.classList.remove('in-session');
  $('#hud').hidden = true;
  keepAwake(false);
  const reps = r.sets.reduce((s, x) => s + x.reps, 0);
  const holdSecs = r.sets.reduce((s, x) => s + x.secs, 0);
  if (r.sets.length) {
    store.addLog({
      at: new Date().toISOString(), title: r.title, secs: Math.round(r.elapsed), reps,
      sets: r.sets.map(({ ex, reps: n, secs }) => ({ ex, reps: n, secs })), partial: partial || undefined,
    });
  }
  if (!partial) cue.done();
  // summary
  const groups = {};
  for (const s of r.sets) { const ex = byId[s.ex]; for (const g of ex.secondary) groups[g] = groups[g] || 's'; for (const g of ex.primary) groups[g] = 'p'; }
  $('#sum-kicker').textContent = partial ? 'Session ended' : 'Session complete';
  $('#sum-title').textContent = r.title;
  const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'mono label' }, k), h('b', {}, v));
  $('#sum-stats').replaceChildren(stat('Time', mmss(r.elapsed)), stat('Sets', String(r.sets.length)), stat('Reps', String(reps)), stat('Held', `${holdSecs} s`));
  const gs = Object.entries(groups).sort((a, b) => (a[1] === 'p' ? 0 : 1) - (b[1] === 'p' ? 0 : 1));
  $('#sum-muscles').replaceChildren(...(gs.length ? gs.map(([g, k]) => muscleChip(g, k, false)) : [h('p', { class: 'empty' }, 'No sets were finished, so nothing was saved.')]));
  $('#summary').hidden = false;
  $('#sum-done').focus();
  layout();
}

$('#sum-done').addEventListener('click', () => {
  $('#summary').hidden = true;
  renderLog();
  setView('log');
});

$('#h-pause').addEventListener('click', () => togglePause());
function togglePause() {
  const r = S.run; if (!r) return;
  r.paused = !r.paused;
  $('#h-pause').textContent = r.paused ? 'Resume' : 'Pause';
  $('#hud').classList.toggle('is-paused', r.paused);
}
$('#h-skip').addEventListener('click', () => { if (S.run) finishStep(true); });
$('#h-end').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!S.run) return;
  if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'End'; completeSession(true); return; }
  b.dataset.armed = '1'; b.textContent = 'End now?';
  setTimeout(() => { delete b.dataset.armed; b.textContent = 'End'; }, 3000);
});

function renderGauge(st) {
  const n = st.kind === 'work' && st.reps ? Math.min(st.reps, 30) : 20;
  const g = $('#h-gauge');
  if (g.childElementCount !== n) g.replaceChildren(...Array.from({ length: n }, () => h('i')));
}

function tickSession(dt) {
  const r = S.run;
  if (!r || r.paused) return;
  const st = r.steps[r.idx];
  r.elapsed += dt;
  if (st.kind === 'work' && st.reps) {
    const rpc = st.ex.repsPerCycle || 1;
    const reps = Math.floor(anim.phase * rpc + 1e-6);
    if (reps > r.reps) { r.reps = reps; if (reps < st.reps) cue.rep(); }
    if (r.reps >= st.reps) finishStep(false);
    return;
  }
  r.t += dt;
  const left = st.secs - r.t;
  const whole = Math.ceil(left);
  if (st.kind !== 'work' && whole !== r.lastWhole && whole <= 3 && whole > 0) cue.count();
  if (st.kind === 'work' && whole !== r.lastWhole && whole <= 3 && whole > 0) cue.count();
  r.lastWhole = whole;
  if (left <= 0) finishStep(false);
}

let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $('#' + id).textContent = v; } }
function renderHud() {
  const r = S.run;
  if (!r) return;
  const st = r.steps[r.idx];
  const nWork = workSteps();
  const doneWork = r.sets.length;
  setText('h-clock', `${mmss(r.elapsed)} · ${doneWork}/${nWork.length} sets`);
  let label, big, of = '', unit, next = '', frac;
  if (st.kind === 'ready') {
    label = 'Get ready'; big = String(Math.max(1, Math.ceil(st.secs - r.t))); unit = 's'; frac = r.t / st.secs;
    next = `First · ${st.ex.name}`;
  } else if (st.kind === 'rest') {
    label = 'Rest'; big = String(Math.max(0, Math.ceil(st.secs - r.t))); unit = 's'; frac = r.t / st.secs;
    const nx = st.next;
    next = `Next · ${nx.ex.name} · set ${nx.set} of ${nx.it.sets}`;
  } else if (st.reps) {
    label = `Set ${st.set} of ${st.sets}`; big = String(r.reps); of = `/${st.reps}`; unit = 'reps'; frac = r.reps / st.reps;
    const later = r.steps.slice(r.idx + 1).find((s) => s.kind === 'work');
    next = later ? (later.ex === st.ex ? `Next · rest, then set ${later.set}` : `Next · rest, then ${later.ex.name}`) : 'Last set';
  } else {
    label = `Set ${st.set} of ${st.sets} · hold`; big = String(Math.max(0, Math.ceil(st.secs - r.t))); unit = 's'; frac = r.t / st.secs;
    const later = r.steps.slice(r.idx + 1).find((s) => s.kind === 'work');
    next = later ? (later.ex === st.ex ? `Next · rest, then set ${later.set}` : `Next · rest, then ${later.ex.name}`) : 'Last set';
  }
  if (r.paused) label = 'Paused · ' + label;
  setText('h-label', label);
  setText('h-name', st.ex.name);
  setText('h-big', big);
  setText('h-of', of);
  setText('h-unit', unit);
  setText('h-next', next);
  const cells = $('#h-gauge').children;
  const lit = Math.round(Math.min(1, frac) * cells.length);
  for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i < lit);
  $('#hud').dataset.kind = st.kind;
}

// ---------------------------------------------------------------- readout
const loadCells = $('#r-load');
loadCells.replaceChildren(...Array.from({ length: 10 }, () => h('i')));
const _a = { x: 0, y: 0, z: 0 };
let roCache = {};
function setRo(id, deg, max) {
  const v = Math.round(deg);
  if (roCache[id] === v) return;
  roCache[id] = v;
  $('#r-' + id).textContent = `${v}°`;
  $('#rb-' + id).style.transform = `scaleX(${Math.max(0, Math.min(1, Math.abs(v) / max))})`;
}
function renderReadout() {
  const f = anim.flat;
  if (!f) return;
  setRo('hip', -f.hipL[0], 140);
  setRo('knee', f.kneeL[0], 150);
  setRo('elbow', -f.elbowL[0], 150);
  // trunk lean from the actual figure: pelvis → neck against vertical
  const p = body.joints.root.matrixWorld.elements, n = body.joints.neck.matrixWorld.elements;
  _a.x = n[12] - p[12]; _a.y = n[13] - p[13]; _a.z = n[14] - p[14];
  const len = Math.hypot(_a.x, _a.y, _a.z) || 1;
  setRo('trunk', Math.acos(Math.max(-1, Math.min(1, _a.y / len))) * 180 / Math.PI, 180);
  const e = stage ? (anim.moving ? f.e : 0.3) : 0;
  const lit = Math.round(e * 10);
  const cells = loadCells.children;
  for (let i = 0; i < 10; i++) cells[i].classList.toggle('on', i < lit);
}

// ---------------------------------------------------------------- toolbar
function syncTools() {
  $('#t-muscles').setAttribute('aria-pressed', String(settings.muscles));
  $('#t-sound').setAttribute('aria-pressed', String(settings.sound));
  $('#t-speed').textContent = `${settings.speed.toFixed(2).replace(/0$/, '')}×`;
  document.body.classList.toggle('muscles-off', !settings.muscles);
}
$('#t-muscles').addEventListener('click', () => { settings.muscles = !settings.muscles; store.saveSettings(settings); syncTools(); syncTint(); });
$('#t-sound').addEventListener('click', () => { settings.sound = !settings.sound; setSound(settings.sound); unlock(); store.saveSettings(settings); syncTools(); });
$('#t-speed').addEventListener('click', () => {
  const sp = [0.75, 1, 1.25];
  settings.speed = sp[(sp.indexOf(settings.speed) + 1) % sp.length] || 1;
  store.saveSettings(settings); syncTools();
});
$('#t-theme').addEventListener('click', () => {
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  settings.theme = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = settings.theme;
  store.saveSettings(settings);
});
$('#t-view').addEventListener('click', () => stage.setView(anim.ex.view || 'stand', reduceMotion));

// theme changes (own toggle, the host page or the system) → 3D colours and thumbnails
let themeTimer = 0;
function onTheme() {
  clearTimeout(themeTimer);
  themeTimer = setTimeout(() => { stage.readPalette(); makeThumbs(); }, 30);
}
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);

// ---------------------------------------------------------------- picking
const canvas = $('#stage');
const tip = $('#tip');
let down = null, hoverPt = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6 || S.run) return;
  const g = stage.pick(e.clientX, e.clientY);
  if (g) openMuscle(g);
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hoverPt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerleave', () => { hoverPt = null; tip.hidden = true; canvas.style.cursor = ''; });
let lastTipGroup = null;
function renderTip() {
  if (!hoverPt || down) { if (!tip.hidden) tip.hidden = true; return; }
  const g = stage.pick(hoverPt.x, hoverPt.y);
  canvas.style.cursor = g ? 'pointer' : '';
  if (!g) { tip.hidden = true; lastTipGroup = null; return; }
  if (g !== lastTipGroup) {
    lastTipGroup = g;
    const ex = anim.ex;
    const role = ex.primary.includes(g) ? 'Primary' : ex.secondary.includes(g) ? 'Secondary' : '';
    tip.replaceChildren(h('b', {}, MUSCLES[g].name), h('span', {}, MUSCLES[g].latin), role ? h('em', {}, `${role} · ${ex.name}`) : null);
  }
  tip.hidden = false;
  tip.style.transform = `translate(${Math.min(hoverPt.x + 16, innerWidth - tip.offsetWidth - 8)}px, ${hoverPt.y + 16}px)`;
}

// ---------------------------------------------------------------- layout
function layout() {
  const panel = $('#panel');
  const phone = matchMedia('(max-width: 859px)').matches;
  const pr = panel.getBoundingClientRect();
  const visible = getComputedStyle(panel).display !== 'none';
  let left = 0, bottom = 0, top = 0;
  const hud = S.run ? $('#hud').getBoundingClientRect().height : 0;
  if (phone) {
    bottom = S.run ? hud + 8 : visible ? innerHeight - pr.top : 0;
    top = 40;
  } else {
    left = visible ? pr.right : 0;
    if (S.run) bottom = hud + 24;
  }
  stage.setInset({ left, bottom, top });
  const root = document.documentElement.style;
  root.setProperty('--free-left', `${left}px`);
  root.setProperty('--free-bottom', `${bottom}px`);
}
addEventListener('resize', () => { layout(); stage.resize(); });
new ResizeObserver(() => layout()).observe($('#panel'));

// ---------------------------------------------------------------- thumbnails
function makeThumbs() {
  const keepKey = anim.key;
  for (const ex of EXERCISES) {
    const f = sample(ex, ex.peak ?? 0.5);
    applyPose(body, f, ex, ex.peak ?? 0.5);
    body.showProps(!!ex.props);
    const t = {};
    for (const g of ex.secondary) t[g] = { s: 1 };
    for (const g of ex.primary) t[g] = { p: 1 };
    stage.setTargets(t);
    try { thumbs[ex.id] = stage.snapshot(256, ex.view); } catch { thumbs[ex.id] = ''; }
  }
  for (const img of $$('img[data-thumb]')) img.src = thumbs[img.dataset.thumb] || '';
  body.showProps(!!anim.ex.props);
  anim.key = keepKey;
  syncTint();
}

// ---------------------------------------------------------------- keyboard
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === ' ' && S.run) { e.preventDefault(); togglePause(); }
  if (e.key === 'Escape') {
    if (!$('#summary').hidden) $('#sum-done').click();
    else if (S.view === 'muscle' || S.view === 'detail' || S.view === 'workout') $('.view:not([hidden]) .back')?.click();
  }
});

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const real = Math.min(0.5, (now - last) / 1000);
  const dt = Math.min(0.05, real);
  last = now;
  anim.time += dt;
  // a paused session freezes the figure and the clock
  const paused = S.run && S.run.paused;
  stepAnim(paused ? 0 : dt);
  tickSession(paused ? 0 : real);
  renderHud();
  renderReadout();
  renderTip();
  stage.render(dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start
renderFilters();
renderTiles();
renderDetail();
renderWorkouts();
syncTools();
layout();
syncFigure();
syncTint();
makeThumbs();
renderTiles();
routeHash();
addEventListener('hashchange', routeHash);
requestAnimationFrame(frame);

if (TEST) {
  window.__state = () => ({ view: S.view, ex: anim.ex.id, run: S.run && { idx: S.run.idx, kind: S.run.steps[S.run.idx].kind, reps: S.run.reps, t: S.run.t } });
  window.__start = (id) => (workoutById[id] ? startSession(workoutById[id].name, workoutById[id].items) : startSession(byId[id].name, [{ ex: id, ...setupFor(id) }]));
  window.__skip = () => S.run && finishStep(true);
  window.__fast = (k) => { settings.speed = k; };
  window.__log = (entries) => { for (const e of entries) store.addLog(e); renderLog(); };
}
