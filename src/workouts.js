// Ready-made workouts: an ordered list of exercises with sets, reps (or
// seconds for holds) and rest. Drafts: adjust to taste.
import { byId } from './exercises.js';

export const WORKOUTS = [
  {
    id: 'starter', name: 'Full body starter',
    note: 'One round through every major group. A good first session.',
    items: [
      { ex: 'jack', sets: 1, reps: 30, rest: 20 },
      { ex: 'squat', sets: 3, reps: 12, rest: 45 },
      { ex: 'pushup', sets: 3, reps: 8, rest: 60 },
      { ex: 'lunge', sets: 2, reps: 12, rest: 45 },
      { ex: 'bridge', sets: 2, reps: 15, rest: 30 },
      { ex: 'plank', sets: 2, secs: 30, rest: 30 },
    ],
  },
  {
    id: 'core', name: 'Core ten',
    note: 'Short and dense: abs, obliques and the hip line.',
    items: [
      { ex: 'plank', sets: 1, secs: 40, rest: 20 },
      { ex: 'crunch', sets: 2, reps: 15, rest: 20 },
      { ex: 'climber', sets: 2, reps: 20, rest: 25 },
      { ex: 'bridge', sets: 2, reps: 15, rest: 20 },
      { ex: 'plank', sets: 1, secs: 30, rest: 0 },
    ],
  },
  {
    id: 'legs', name: 'Lower body',
    note: 'Squat, lunge and hinge patterns, finished on the calves.',
    items: [
      { ex: 'squat', sets: 4, reps: 10, rest: 60 },
      { ex: 'lunge', sets: 3, reps: 12, rest: 45 },
      { ex: 'hinge', sets: 3, reps: 10, rest: 60 },
      { ex: 'bridge', sets: 3, reps: 15, rest: 30 },
      { ex: 'calf', sets: 3, reps: 20, rest: 30 },
    ],
  },
  {
    id: 'upper', name: 'Upper body',
    note: 'Push, press and curl with a plank to close.',
    items: [
      { ex: 'pushup', sets: 3, reps: 10, rest: 60 },
      { ex: 'press', sets: 3, reps: 10, rest: 60 },
      { ex: 'curl', sets: 3, reps: 12, rest: 45 },
      { ex: 'plank', sets: 2, secs: 45, rest: 30 },
    ],
  },
];

export const workoutById = Object.fromEntries(WORKOUTS.map((w) => [w.id, w]));

// Seconds one item takes at normal speed: work plus the rests after each set.
export function itemSeconds(it, last = false) {
  const ex = byId[it.ex];
  const work = ex.kind === 'hold' ? it.secs : (it.reps / (ex.repsPerCycle || 1)) * ex.tempo;
  return it.sets * work + (last ? it.sets - 1 : it.sets) * it.rest;
}

export function estimate(items) {
  return 5 + items.reduce((s, it, i) => s + itemSeconds(it, i === items.length - 1), 0);
}

// Muscle groups a list of items covers: primary wins over secondary.
export function coverage(items) {
  const c = {};
  for (const it of items) {
    const ex = byId[it.ex];
    for (const g of ex.secondary) if (!c[g]) c[g] = 's';
    for (const g of ex.primary) c[g] = 'p';
  }
  return c;
}
