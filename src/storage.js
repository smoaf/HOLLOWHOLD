// Per-visitor data in localStorage: settings and the training log.
// Every access is guarded; the app works without storage.
const SETTINGS = 'hollowhold.settings.v1';
const LOG = 'hollowhold.log.v1';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function loadSettings() {
  return { muscles: true, sound: true, speed: 1, theme: null, ...read(SETTINGS, {}) };
}
export function saveSettings(s) { write(SETTINGS, s); }

export function loadLog() {
  const v = read(LOG, []);
  return Array.isArray(v) ? v : [];
}
export function addLog(entry) {
  const log = loadLog();
  log.unshift(entry);
  write(LOG, log.slice(0, 200));
  return log;
}
export function clearLog() { write(LOG, []); }
