'use strict';
// Google Drive: prihlásenie (Google Identity Services) a nahrávanie inzerátu.
// Scope drive.file = appka vidí iba súbory a priečinky, ktoré sama vytvorila.
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  let tokenClient = null;
  let token = null;       // { access_token, expires_at }
  let folderCache = {};
  const listeners = [];

  try {
    const saved = JSON.parse(sessionStorage.getItem('drive_token') || 'null');
    if (saved && saved.expires_at > Date.now() + 60000) token = saved;
  } catch (_) {}

  function notify() { listeners.forEach(fn => fn()); }

  function configured() { return !!(window.APP_CONFIG && APP_CONFIG.googleClientId); }
  function ready() { return !!tokenClient; }
  function signedIn() { return !!token && token.expires_at > Date.now() + 60000; }

  function onGisLoaded() {
    if (!configured() || !window.google || !google.accounts) { notify(); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.googleClientId,
      scope: SCOPE,
      callback: () => {},
    });
    notify();
  }

  // Musí sa volať priamo z ťuknutia (inak prehliadač zablokuje prihlasovacie okno).
  function ensureToken() {
    if (signedIn()) return Promise.resolve(token.access_token);
    if (!configured()) return Promise.reject(new Error('Chýba Google Client ID v config.js.'));
    if (!tokenClient) return Promise.reject(new Error('Google prihlásenie sa ešte nenačítalo. Skús o chvíľu.'));
    return new Promise((resolve, reject) => {
      tokenClient.callback = resp => {
        if (resp.error) { reject(new Error('Prihlásenie zlyhalo: ' + resp.error)); return; }
        token = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in - 30) * 1000 };
        try { sessionStorage.setItem('drive_token', JSON.stringify(token)); } catch (_) {}
        notify();
        resolve(token.access_token);
      };
      tokenClient.error_callback = err => reject(new Error(err && err.type === 'popup_closed'
        ? 'Prihlasovacie okno bolo zatvorené.' : 'Prihlásenie zlyhalo.'));
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function signOut() {
    if (token && window.google) google.accounts.oauth2.revoke(token.access_token, () => {});
    token = null; folderCache = {};
    try { sessionStorage.removeItem('drive_token'); } catch (_) {}
    notify();
  }

  async function api(url, opts = {}) {
    if (!signedIn()) throw new Error('Nie si prihlásený do Google. Ťukni znova na Odoslať.');
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token.access_token, ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      token = null; notify();
      throw new Error('Prihlásenie vypršalo. Ťukni znova na Odoslať.');
    }
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (_) {}
      throw new Error('Google Drive: ' + msg);
    }
    return res.json();
  }

  async function createFolder(name, parentId) {
    const r = await api(API + '/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return r.id;
  }

  async function findOrCreateFolder(name, parentId) {
    const key = parentId + '/' + name;
    if (folderCache[key]) return folderCache[key];
    const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`;
    const r = await api(API + '/files?fields=files(id)&spaces=drive&q=' + encodeURIComponent(q));
    const id = (r.files && r.files[0]) ? r.files[0].id : await createFolder(name, parentId);
    folderCache[key] = id;
    return id;
  }

  async function uploadFile(name, blob, mime, parentId) {
    const boundary = 'va' + Math.random().toString(36).slice(2);
    const meta = { name, parents: [parentId], mimeType: mime };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`,
    ]);
    const r = await api(UPLOAD, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    });
    return r.id;
  }

  // Nahrá inzerát: priečinok → fotky → zber.json (naposledy = signál pre PC).
  // Pri opakovaní po chybe pokračuje tam, kde skončil (rec.drive.uploaded).
  async function uploadListing(rec, persist, onProgress) {
    const root = await findOrCreateFolder(APP_CONFIG.rootFolderName, 'root');
    const queue = await findOrCreateFolder(APP_CONFIG.queueFolderName, root);
    if (!rec.drive || !rec.drive.folderId) {
      const folderName = rec.folderName;
      rec.drive = { folderId: await createFolder(folderName, queue), uploaded: [] };
      await persist(rec);
    }
    const names = rec.fotky.map((_, i) => String(i + 1).padStart(2, '0') + '.jpg');
    const total = names.length + 1;
    for (let i = 0; i < names.length; i++) {
      onProgress(i, total, `Fotka ${i + 1} z ${names.length}`);
      if (rec.drive.uploaded.includes(names[i])) continue;
      await uploadFile(names[i], rec.fotky[i].blob, 'image/jpeg', rec.drive.folderId);
      rec.drive.uploaded.push(names[i]);
      await persist(rec);
    }
    onProgress(names.length, total, 'Dokončujem…');
    const zber = {
      verzia: 1,
      id: rec.folderName,
      vytvorene: rec.vytvorene,
      diktat: rec.diktat.trim(),
      cena: rec.cena,
      fotky: names,
      // výber v appke (ID Vinted) – na PC má prednosť pred odhadom Clauda; prázdne = nevybrané
      vyber: rec.vyber || { stav: null, farby: [], material: [] },
    };
    const json = new Blob([JSON.stringify(zber, null, 2)], { type: 'application/json' });
    await uploadFile('zber.json', json, 'application/json', rec.drive.folderId);
    onProgress(total, total, 'Hotovo');
  }

  return {
    onGisLoaded, configured, ready, signedIn, ensureToken, signOut, uploadListing,
    onChange: fn => listeners.push(fn),
  };
})();
