// The exercise library. Each exercise is one animation cycle of keyframes
// (t = 0..1 of the cycle), its floor rules, the muscles it trains and how to
// do it. Texts are drafts: check them before relying on them.
import { prepare } from './pose.js';

const FEET = ['heelL', 'ballL', 'heelR', 'ballR'];
const TIPS = ['tipL', 'tipR'];

const STAND = { shoulder: [0, 5, 0], elbow: 10, hip: [0, 4, 6] };

// ---- squat
const SQ_DOWN = {
  root: { pitch: 36 }, spine: [-6], chest: [-6], neck: [-22],
  hip: [124, 14, 14], knee: 118, ankle: -28,
  shoulder: [112, 8, 0], elbow: 4,
};

// ---- push-up (hands flat, fingers forward)
const PU_ARM = { elbow: [0, -90], wrist: [0, 0, 90] };
const PU_UP = {
  root: { pitch: 90 }, neck: [-12], shoulder: [86, 8, 0], ...PU_ARM,
  hip: [0, 3, 0], ankle: -14, toes: 62,
};
const PU_DOWN = {
  ...PU_UP, neck: [-8], shoulder: [36, 32, 0], elbow: [56, -90], wrist: [0, 0, 90],
};

// ---- plank on the forearms
const PLANK = {
  root: { pitch: 90 }, neck: [-14], shoulder: [90, 6, 0], elbow: [90, 0],
  hip: [0, 3, 0], ankle: -14, toes: 62,
};

// ---- lying on the back, knees bent
const SUPINE = {
  root: { pitch: -90 }, hip: [58, 8, 0], knee: 100, shoulder: [-8, 10, 0], elbow: 5, neck: [8],
};

// ---- hinge
const HINGE_DOWN = {
  root: { pitch: 80 }, spine: [-6], chest: [-4], neck: [-24],
  hip: [76, 5, 0], knee: 20, shoulder: [70, 3, 0], elbow: [6, -90],
};

// ---- lunge: right foot steps back
const LUNGE_R = {
  root: { pitch: 6 }, spine: [-3], neck: [-4],
  hipL: [80, 4, 4], kneeL: 92, hipR: [-12, 4, 2], kneeR: 96, ankleR: 10, toesR: 60,
  shoulder: [0, 8, 0], elbow: 12,
};
const STEP_R = {
  root: { pitch: 4 }, hipL: [16, 4, 4], kneeL: 18, hipR: [-24, 4, 2], kneeR: 52, ankleR: 20, toesR: 10,
  shoulder: [0, 7, 0], elbow: 12,
};
const mirror = (p) => {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.endsWith('L')) o[k.slice(0, -1) + 'R'] = v;
    else if (k.endsWith('R')) o[k.slice(0, -1) + 'L'] = v;
    else o[k] = v;
  }
  return o;
};

// ---- dumbbells
const CURL_DOWN = { ...STAND, shoulder: [4, 7, 0], elbow: [8, 90], wrist: [0, 0, 0] };
const CURL_UP = { ...STAND, shoulder: [14, 7, 0], elbow: [136, 90], wrist: [0, 0, 0] };
const PRESS_LOW = { ...STAND, shoulder: [12, 80, 90], elbow: [100, 0] };
const PRESS_HIGH = { ...STAND, shoulder: [8, 168, 90], elbow: [10, 0] };

export const AREAS = {
  legs: 'Legs', push: 'Push', arms: 'Arms', core: 'Core', cardio: 'Cardio',
};

export const EXERCISES = [
  {
    id: 'squat', name: 'Squat', area: 'legs', kind: 'reps', tempo: 3.2,
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'lowerback', 'abs'],
    defaults: { sets: 3, reps: 12, rest: 45 },
    cues: [
      'Feet shoulder-width apart, toes turned slightly out.',
      'Sit the hips back and down; knees follow the toes.',
      'Go as low as you can keep a neutral back, thighs about level.',
      'Drive through the whole foot to stand tall.',
    ],
    view: 'stand', peak: 0.5,
    anchor: { pts: FEET }, flat: ['L', 'R'],
    keys: [
      { t: 0, p: { ...STAND, hip: [0, 8, 12], e: 0.2 } },
      { t: 0.45, p: { ...SQ_DOWN, e: 0.65 } },
      { t: 0.55, p: { ...SQ_DOWN, e: 1 } },
      { t: 1, p: { ...STAND, hip: [0, 8, 12], e: 0.2 } },
    ],
  },
  {
    id: 'pushup', name: 'Push-up', area: 'push', kind: 'reps', tempo: 2.6,
    primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs'],
    defaults: { sets: 3, reps: 10, rest: 60 },
    cues: [
      'Hands a little wider than the shoulders, body in one line.',
      'Lower the chest with the elbows about 45° from the body.',
      'Stop just above the floor, then press it away.',
    ],
    view: 'floor', peak: 0.5,
    level: { a: ['palmL', 'palmR'], b: TIPS },
    keys: [
      { t: 0, p: { ...PU_UP, e: 0.3 } },
      { t: 0.45, p: { ...PU_DOWN, e: 0.8 } },
      { t: 0.55, p: { ...PU_DOWN, e: 1 } },
      { t: 1, p: { ...PU_UP, e: 0.3 } },
    ],
  },
  {
    id: 'lunge', name: 'Reverse lunge', area: 'legs', kind: 'reps', tempo: 4.6, repsPerCycle: 2,
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'calves'],
    defaults: { sets: 3, reps: 12, rest: 45 },
    cues: [
      'Step one foot back and lower the back knee towards the floor.',
      'Front shin stays close to vertical; weight in the front heel.',
      'Push through the front foot to step back up. Alternate legs.',
    ],
    view: 'stand', peak: 0.25,
    anchor: [{ until: 0.5, value: { pts: ['heelL', 'ballL'], axes: 'z' } }, { until: 1.01, value: { pts: ['heelR', 'ballR'], axes: 'z' } }],
    flat: [{ until: 0.5, value: ['L'] }, { until: 1.01, value: ['R'] }],
    reach: [{ until: 0.5, value: { joint: 'kneeR', marker: 'tipR', to: ['heelL', 'ballL'] } },
      { until: 1.01, value: { joint: 'kneeL', marker: 'tipL', to: ['heelR', 'ballR'] } }],
    keys: [
      { t: 0, p: { ...STAND, e: 0.2 } },
      { t: 0.12, p: { ...STEP_R, e: 0.4 } },
      { t: 0.25, p: { ...LUNGE_R, e: 0.9, r: 1 } },
      { t: 0.31, p: { ...LUNGE_R, e: 1, r: 1 } },
      { t: 0.41, p: { ...STEP_R, e: 0.5 } },
      { t: 0.5, p: { ...STAND, e: 0.2 } },
      { t: 0.62, p: { ...mirror(STEP_R), e: 0.4 } },
      { t: 0.75, p: { ...mirror(LUNGE_R), e: 0.9, r: 1 } },
      { t: 0.81, p: { ...mirror(LUNGE_R), e: 1, r: 1 } },
      { t: 0.91, p: { ...mirror(STEP_R), e: 0.5 } },
      { t: 1, p: { ...STAND, e: 0.2 } },
    ],
  },
  {
    id: 'plank', name: 'Plank', area: 'core', kind: 'hold', tempo: 4,
    primary: ['abs'], secondary: ['obliques', 'shoulders', 'glutes', 'quads', 'lowerback'],
    defaults: { sets: 2, secs: 30, rest: 30 },
    cues: [
      'Forearms under the shoulders, fists loose.',
      'Squeeze glutes and thighs; the body forms one straight line.',
      'Breathe steadily. Stop when the hips start to sag.',
    ],
    view: 'floor', peak: 0.5,
    level: { a: ['elbowL', 'elbowR', 'forearmL', 'forearmR'], b: TIPS },
    keys: [
      { t: 0, p: { ...PLANK, e: 0.85 } },
      { t: 0.5, p: { ...PLANK, spine: [1.5], neck: [-12], e: 1 }, ease: 'sine' },
      { t: 1, p: { ...PLANK, e: 0.85 }, ease: 'sine' },
    ],
  },
  {
    id: 'jack', name: 'Jumping jack', area: 'cardio', kind: 'reps', tempo: 1.15,
    primary: ['calves', 'shoulders'], secondary: ['quads', 'glutes', 'adductors'],
    defaults: { sets: 1, reps: 30, rest: 30 },
    cues: [
      'Jump the feet wide while the arms sweep overhead.',
      'Land softly on the balls of the feet, knees a little bent.',
      'Jump back to feet together, arms by the sides.',
    ],
    view: 'stand', peak: 0.5,
    keys: [
      { t: 0, p: { ...STAND, knee: 8, hip: [4, 4, 6], e: 0.4 } },
      { t: 0.2, p: { shoulder: [0, 95, 0], elbow: 8, hip: [2, 11, 8], knee: 6, ankle: 28, root: { lift: 0.07 }, e: 0.9 }, ease: 'out' },
      { t: 0.42, p: { shoulder: [0, 168, 0], elbow: 10, hip: [8, 17, 10], knee: 16, e: 0.7 }, ease: 'in' },
      { t: 0.5, p: { shoulder: [0, 170, 0], elbow: 10, hip: [6, 17, 10], knee: 12, e: 0.6 } },
      { t: 0.7, p: { shoulder: [0, 95, 0], elbow: 8, hip: [2, 9, 8], knee: 6, ankle: 28, root: { lift: 0.07 }, e: 0.9 }, ease: 'out' },
      { t: 0.92, p: { ...STAND, knee: 14, hip: [8, 4, 6], e: 0.6 }, ease: 'in' },
      { t: 1, p: { ...STAND, knee: 8, hip: [4, 4, 6], e: 0.4 } },
    ],
  },
  {
    id: 'bridge', name: 'Glute bridge', area: 'legs', kind: 'reps', tempo: 3,
    primary: ['glutes', 'hamstrings'], secondary: ['lowerback', 'abs'],
    defaults: { sets: 3, reps: 15, rest: 30 },
    cues: [
      'Lie on your back, knees bent, feet flat and hip-width apart.',
      'Press through the heels and lift the hips until knees, hips and shoulders line up.',
      'Squeeze the glutes at the top, then lower with control.',
    ],
    view: 'floor', peak: 0.5,
    level: { a: ['upperBack', 'sacrum'], b: ['heelL', 'heelR'] }, flat: ['L', 'R'],
    keys: [
      { t: 0, p: { ...SUPINE, e: 0.2 } },
      { t: 0.42, p: { ...SUPINE, hip: [2, 8, 0], knee: 92, neck: [26], e: 0.85 } },
      { t: 0.58, p: { ...SUPINE, hip: [0, 8, 0], knee: 92, neck: [26], e: 1 } },
      { t: 1, p: { ...SUPINE, e: 0.2 } },
    ],
  },
  {
    id: 'crunch', name: 'Crunch', area: 'core', kind: 'reps', tempo: 2.4,
    primary: ['abs'], secondary: ['obliques'],
    defaults: { sets: 3, reps: 15, rest: 30 },
    cues: [
      'Lie on your back, knees bent, fingertips at the temples.',
      'Curl the shoulder blades off the floor; the lower back stays down.',
      'Breathe out on the way up, lower slowly.',
    ],
    view: 'floor', peak: 0.5,
    level: { a: ['sacrum'], b: ['heelL', 'heelR'] }, flat: ['L', 'R'],
    keys: [
      { t: 0, p: { ...SUPINE, shoulder: [150, 48, 0], elbow: 140, e: 0.2 } },
      { t: 0.45, p: { ...SUPINE, shoulder: [150, 48, 0], elbow: 140, spine: [16], chest: [22], neck: [18], e: 1 } },
      { t: 0.55, p: { ...SUPINE, shoulder: [150, 48, 0], elbow: 140, spine: [16], chest: [22], neck: [18], e: 1 } },
      { t: 1, p: { ...SUPINE, shoulder: [150, 48, 0], elbow: 140, e: 0.2 } },
    ],
  },
  {
    id: 'climber', name: 'Mountain climber', area: 'cardio', kind: 'reps', tempo: 1.1, repsPerCycle: 2,
    primary: ['abs', 'quads'], secondary: ['shoulders', 'chest', 'glutes', 'obliques'],
    defaults: { sets: 3, reps: 20, rest: 30 },
    cues: [
      'Start in a high plank, hands under the shoulders.',
      'Drive one knee towards the chest, then switch legs quickly.',
      'Keep the hips low and the shoulders over the hands.',
    ],
    view: 'floor', peak: 0,
    // only the straight (back) leg's toes stay on the floor
    level: [{ until: 0.25, value: { a: ['palmL', 'palmR'], b: ['tipR'] } },
      { until: 0.75, value: { a: ['palmL', 'palmR'], b: ['tipL'] } },
      { until: 1.01, value: { a: ['palmL', 'palmR'], b: ['tipR'] } }],
    ground: [{ until: 0.25, value: ['palmL', 'palmR', 'tipR'] },
      { until: 0.75, value: ['palmL', 'palmR', 'tipL'] },
      { until: 1.01, value: ['palmL', 'palmR', 'tipR'] }],
    keys: [
      { t: 0, p: { ...PU_UP, hipL: [104, 8, 0], kneeL: 145, ankleL: 20, spine: [14], chest: [8], e: 0.8 }, ease: 'sine' },
      { t: 0.5, p: { ...PU_UP, hipR: [104, 8, 0], kneeR: 145, ankleR: 20, spine: [14], chest: [8], e: 0.8 }, ease: 'sine' },
      { t: 1, p: { ...PU_UP, hipL: [104, 8, 0], kneeL: 145, ankleL: 20, spine: [14], chest: [8], e: 0.8 }, ease: 'sine' },
    ],
  },
  {
    id: 'hinge', name: 'Romanian deadlift', area: 'legs', kind: 'reps', tempo: 3.4, props: true,
    primary: ['hamstrings', 'glutes'], secondary: ['lowerback', 'traps', 'forearms'],
    defaults: { sets: 3, reps: 10, rest: 60 },
    cues: [
      'Hold the weights in front of the thighs, knees soft.',
      'Push the hips back; the weights slide down close to the legs.',
      'Stop when the hamstrings are long and the back is still flat.',
      'Drive the hips forward to stand up.',
    ],
    view: 'side', peak: 0.5,
    anchor: { pts: FEET }, flat: ['L', 'R'],
    keys: [
      { t: 0, p: { ...STAND, shoulder: [4, 3, 0], elbow: [6, -90], e: 0.2 } },
      { t: 0.45, p: { ...HINGE_DOWN, e: 0.8 } },
      { t: 0.55, p: { ...HINGE_DOWN, e: 1 } },
      { t: 1, p: { ...STAND, shoulder: [4, 3, 0], elbow: [6, -90], e: 0.2 } },
    ],
  },
  {
    id: 'curl', name: 'Dumbbell curl', area: 'arms', kind: 'reps', tempo: 2.8, props: true,
    primary: ['biceps'], secondary: ['forearms', 'shoulders'],
    defaults: { sets: 3, reps: 12, rest: 45 },
    cues: [
      'Stand tall, palms forward, elbows by the sides.',
      'Curl the weights up without swinging the body.',
      'Lower slowly all the way down.',
    ],
    view: 'stand', peak: 0.5,
    anchor: { pts: FEET },
    keys: [
      { t: 0, p: { ...CURL_DOWN, e: 0.2 } },
      { t: 0.42, p: { ...CURL_UP, e: 1 } },
      { t: 0.52, p: { ...CURL_UP, e: 0.9 } },
      { t: 1, p: { ...CURL_DOWN, e: 0.2 } },
    ],
  },
  {
    id: 'press', name: 'Overhead press', area: 'push', kind: 'reps', tempo: 2.8, props: true,
    primary: ['shoulders', 'triceps'], secondary: ['traps', 'abs'],
    defaults: { sets: 3, reps: 10, rest: 60 },
    cues: [
      'Weights at shoulder height, elbows under the wrists.',
      'Brace the core and press straight up until the arms are long.',
      'Lower back to the shoulders under control.',
    ],
    view: 'stand', peak: 0.5,
    anchor: { pts: FEET },
    keys: [
      { t: 0, p: { ...PRESS_LOW, e: 0.3 } },
      { t: 0.42, p: { ...PRESS_HIGH, e: 1 } },
      { t: 0.52, p: { ...PRESS_HIGH, e: 0.9 } },
      { t: 1, p: { ...PRESS_LOW, e: 0.3 } },
    ],
  },
  {
    id: 'calf', name: 'Calf raise', area: 'legs', kind: 'reps', tempo: 2.2,
    primary: ['calves'], secondary: [],
    defaults: { sets: 3, reps: 20, rest: 30 },
    cues: [
      'Stand tall, feet hip-width apart.',
      'Rise onto the balls of the feet as high as you can.',
      'Pause, then lower the heels slowly.',
    ],
    view: 'side', peak: 0.5,
    anchor: { pts: ['ballL', 'ballR'] },
    keys: [
      { t: 0, p: { ...STAND, e: 0.2 } },
      { t: 0.4, p: { ...STAND, ankle: 36, toes: 36, e: 1 } },
      { t: 0.55, p: { ...STAND, ankle: 36, toes: 36, e: 1 } },
      { t: 1, p: { ...STAND, e: 0.2 } },
    ],
  },
].map(prepare);

export const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// The rest pose between exercises: standing, arms loose.
export const IDLE = prepare({
  id: 'idle', name: 'Idle', kind: 'idle', tempo: 4, primary: [], secondary: [], view: 'stand',
  anchor: { pts: FEET }, flat: ['L', 'R'],
  keys: [
    { t: 0, p: { ...STAND, e: 0 } },
    { t: 0.5, p: { ...STAND, chest: [-1.5], shoulder: [0, 6, 0], e: 0 }, ease: 'sine' },
    { t: 1, p: { ...STAND, e: 0 }, ease: 'sine' },
  ],
});
