// Local persistence (IndexedDB): per-photo edit settings and recently exported images.
// Browser storage can be wiped ("clear website data"), so everything can also be backed up to a file.

const DB = 'fuji-raw-editor', VER = 1;
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('edits')) d.createObjectStore('edits', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('exports')) d.createObjectStore('exports', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** ask the browser not to evict our data (best effort) */
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}

export const imageKey = (file) => `${file.name}|${file.size}`;

export async function saveEdit(rec) { try { await tx('edits', 'readwrite', (s) => s.put({ ...rec, updated: Date.now() })); } catch { /* storage unavailable */ } }
export async function getEdit(key) { try { return await tx('edits', 'readonly', (s) => req(s.get(key))); } catch { return null; } }
export async function listEdits() { try { return ((await tx('edits', 'readonly', (s) => req(s.getAll()))) || []).sort((a, b) => b.updated - a.updated); } catch { return []; } }
export async function deleteEdit(key) { try { await tx('edits', 'readwrite', (s) => s.delete(key)); } catch { /* ignore */ } }

const MAX_EXPORTS = 12;
export async function addExport(rec) {
  try {
    const all = await listExports();
    await tx('exports', 'readwrite', (s) => {
      s.put(rec);
      all.slice(MAX_EXPORTS - 1).forEach((o) => s.delete(o.id));
    });
  } catch { /* storage full / unavailable */ }
}
export async function listExports() { try { return ((await tx('exports', 'readonly', (s) => req(s.getAll()))) || []).sort((a, b) => b.date - a.date); } catch { return []; } }
export async function deleteExport(id) { try { await tx('exports', 'readwrite', (s) => s.delete(id)); } catch { /* ignore */ } }

/** full backup (presets + per-photo edits) as JSON text */
export async function makeBackup(userPresets) {
  const edits = await listEdits();
  return JSON.stringify({ format: 'fuji-raw-editor-backup', version: 1, created: new Date().toISOString(), userPresets, edits }, null, 1);
}
export async function restoreBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('File sao lưu không hợp lệ'); }
  if (!j || (j.format !== 'fuji-raw-editor-backup' && j.format !== 'fuji-raw-editor-edit')) throw new Error('Không phải file sao lưu của app này');
  if (j.format === 'fuji-raw-editor-edit') return { single: j };
  for (const e of j.edits || []) await saveEdit(e);
  return { userPresets: j.userPresets || [], edits: (j.edits || []).length };
}
