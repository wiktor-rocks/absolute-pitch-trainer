// Persistent storage for settings and session results (IndexedDB).
// Kept behind this small API so an Electron build can swap in file storage.

const DB_NAME = 'ap-trainer';
const DB_VERSION = 1;
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('sessions')) {
          const s = d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          s.createIndex('task', 'task');
          s.createIndex('startedAt', 'startedAt');
        }
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

// ------------------------------------------------------------ settings
const DEFAULT_SETTINGS = {
  volumeDb: 0, // master volume in dB (-40 … +12); -Infinity = muted
  practiceOverrides: {}, // Practice-tab customizations, per task id (see tasks/customize.js)
  naming: 'letters', // note names shown in tasks: 'letters' | 'solfege' (see NAMINGS in data/notes.js)
};

export async function getSettings() {
  const s = await tx('kv', 'readonly', (st) => st.get('settings'));
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await tx('kv', 'readwrite', (st) => st.put(next, 'settings'));
  return next;
}

// ------------------------------------------------------------ sessions
export function addSession(session) {
  return tx('sessions', 'readwrite', (st) => st.add(session));
}
export function updateSession(session) {
  return tx('sessions', 'readwrite', (st) => st.put(session));
}
export async function listSessions() {
  const all = await tx('sessions', 'readonly', (st) => st.getAll());
  return (all || []).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
export function deleteSession(id) {
  return tx('sessions', 'readwrite', (st) => st.delete(id));
}

// ------------------------------------------------------------ import / export
export async function exportAll() {
  return { app: 'ap-trainer', version: 1, exportedAt: new Date().toISOString(), settings: await getSettings(), sessions: await listSessions() };
}

export async function importAll(data, { replace = false } = {}) {
  if (data?.app !== 'ap-trainer') throw new Error('Not an AP trainer export file');
  if (replace) {
    await tx('sessions', 'readwrite', (st) => st.clear());
  }
  const existing = new Set((await listSessions()).map((s) => s.startedAt + s.task));
  let added = 0;
  for (const s of data.sessions || []) {
    if (existing.has(s.startedAt + s.task)) continue;
    const { id, ...rest } = s;
    await addSession(rest);
    added++;
  }
  if (data.settings && replace) await saveSettings(data.settings);
  return added;
}

export async function resetAll() {
  await tx('sessions', 'readwrite', (st) => st.clear());
  await tx('kv', 'readwrite', (st) => st.clear());
}
