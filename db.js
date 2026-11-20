'use strict';
// Lokálne úložisko rozpracovaných inzerátov (IndexedDB) – prežije zatvorenie appky.
const DB = (() => {
  let dbPromise;
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('vinted-asistent', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('inzeraty', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('inzeraty', mode);
      const req = fn(t.objectStore('inzeraty'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  return {
    all: () => tx('readonly', s => s.getAll()),
    get: id => tx('readonly', s => s.get(id)),
    put: rec => tx('readwrite', s => s.put(rec)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();
