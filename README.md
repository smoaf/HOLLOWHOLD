# Hollowhold

A fitness app where a 3D anatomical figure performs every exercise and shows the muscles it trains. Pick an exercise or a ready-made workout and the figure demonstrates each rep while the app counts reps, sets and rest.

Static site: plain HTML, CSS and JavaScript ES modules, no build step, no backend. three.js 0.160.0 and the fonts are served from this repository, so the app loads nothing from outside servers.

## Run it

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Any static file server works; opening `index.html` straight from disk does not, because browsers block ES modules on `file://`.

## What it does

- **Exercises**: 12 exercises (squat, push-up, reverse lunge, plank, jumping jack, glute bridge, crunch, mountain climber, Romanian deadlift, dumbbell curl, overhead press, calf raise). Each has a looping 3D demonstration, the primary and secondary muscles, step-by-step cues, and sets, reps (or seconds) and rest you can set.
- **Workouts**: four ready-made sessions (Full body starter, Core ten, Lower body, Upper body) with time estimates and a muscle coverage strip.
- **Sessions**: get-ready countdown, rep counting in step with the figure, hold timers, rest with a preview of what comes next, pause, skip and end. Sound cues are optional. The screen stays awake during a session where the browser allows it.
- **Muscles**: primary muscles turn lime, secondary aubergine, and the working fibres pulse with the effort of each rep. Hover a muscle for its name and Latin name; tap it to see which exercises train it.
- **Log**: finished sets are saved in the browser (`localStorage`, this device only). The log shows the week's sessions, minutes, reps and day streak, and the figure turns into a heat map of how many sets each muscle group got in the last 7 days.
- **Joint readout**: live hip, knee, elbow and trunk angles and an effort gauge.
- Light and dark themes (follows the system; the toolbar toggle overrides it), desktop and phone layouts, playback speed 0.75× to 1.25×.
- Deep links: `#squat` (any exercise id), `#workouts`, `#workout-core`, `#log`.

The exercise cues and workouts are drafts written for this prototype. Check them before relying on them; they are not medical or coaching advice.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page: panel, toolbar, readout, HUD, summary sheet. |
| `css/tokens.css` | Fonts and colour tokens for both themes, including the `--3d-*` colours the 3D figure reads. |
| `css/app.css` | Layout and components. |
| `src/main.js` | App logic: views, session runner, HUD, log, picking, thumbnails. |
| `src/stage.js` | three.js stage: camera views, the wireframe hold, shadow, mat, muscle tinting, thumbnails, picking. |
| `src/body.js` | The figure: jointed rig, muscle groups as meshes, line-art shaders, floor contact markers. |
| `src/pose.js` | Poses in anatomical angles, keyframe sampling, floor contact and solvers, blending. |
| `src/exercises.js` | The exercise library. |
| `src/workouts.js` | Ready-made workouts and time estimates. |
| `src/storage.js`, `src/audio.js` | `localStorage` access and cue tones. |
| `tools/poses.html` | Pose bench for tuning keyframes (see below). |
| `vendor/three/` | three.js 0.160.0 (`three.module.js` and `OrbitControls.js` only), MIT licence. |
| `fonts/` | Archivo and IBM Plex Mono (woff2), SIL Open Font License. |

## How the figure works

The rig is rooted at the pelvis (y up, facing +z, its left side at +x). Every muscle is a belly-shaped mesh placed between two points on a bone, and the right side mirrors the left. Each muscle group shares one material, so tinting a group is one uniform change.

The look is line art: a two-tone fill, fibre lines that thicken on the shadow side, and an ink outline drawn as an inverted hull at a constant pixel width. Colours come from the CSS tokens, so the 3D follows the theme.

Poses are written in anatomical terms (hip flexion, abduction, knee flexion and so on, in degrees). After a pose is applied:

1. **level** tilts the whole body until two groups of contacts are equally low (hands and toes in a push-up, upper back and heels in a bridge);
2. **reach** bends one joint until a contact reaches the floor (the back knee in a lunge);
3. **flat** keeps a foot flat;
4. the lowest contact (or the `ground` set) touches the floor, and **anchor** holds a planted foot or hand in place.

Any of these can change with the phase of the cycle, for example the planted foot in an alternating lunge. When the shown exercise changes, the whole rig blends from its previous state over 0.7 s.

## Adding an exercise

Add an entry to `EXERCISES` in `src/exercises.js`: keyframes (`t` from 0 to 1 over one cycle, `p` the pose, `e` the effort from 0 to 1), the floor rules above, `primary` and `secondary` muscle groups (names from `MUSCLES` in `src/body.js`), `cues`, `defaults`, a camera `view` (`stand`, `side` or `floor`) and the `peak` phase used for its thumbnail.

To tune it, open `tools/poses.html?ex=<id>&t=0.5` (add `&play` to loop it, or `&az=90&el=5` for a side view). From the console, `__pose('<id>', 0.5)` shows one phase.

Add `?test` to the app URL to get test hooks: `__start('<exercise or workout id>')`, `__skip()`, `__state()`.

## Licences

The project is under the GNU GPL v3 (`LICENSE`). three.js is MIT (`vendor/three/LICENSE`); the fonts are under the SIL Open Font License 1.1 (`fonts/OFL-*.txt`).
