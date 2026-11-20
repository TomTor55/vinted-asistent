'use strict';
const $ = s => document.querySelector(s);
const C = window.APP_CONFIG;

const state = { current: null, urls: [], dictation: null, sending: false };

// ---------- pomocné ----------
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
function pad(n) { return String(n).padStart(2, '0'); }
function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
function slugify(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .split('-').filter(Boolean).slice(0, 4).join('-').slice(0, 40) || 'inzerat';
}
function folderNameFor(rec, d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${slugify(rec.diktat)}`;
}
function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const STAV_TEXT = { koncept: 'rozpracovaný', odosiela: 'odosiela sa', odoslany: 'odoslaný', chyba: 'chyba' };

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 3000);
}

// Zmenšenie fotky (zachová orientáciu z fotoaparátu).
async function resizeImage(blob, maxSide, quality) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Fotku sa nepodarilo spracovať.')), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- ukladanie ----------
let saveTimer;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
async function saveNow() {
  clearTimeout(saveTimer);
  const rec = state.current;
  if (!rec || rec.stav === 'odoslany') return;
  rec.diktat = $('#diktat').value;
  const c = $('#cena').value.replace(',', '.');
  rec.cena = c === '' ? null : Math.round(parseFloat(c) * 100) / 100;
  if (Number.isNaN(rec.cena)) rec.cena = null;
  rec.upravene = isoLocal();
  await DB.put(rec);
}
// Zmena fotiek po čiastočnom odoslaní → začne sa odznova do nového priečinka.
function invalidateUpload(rec) {
  if (rec.drive) rec.drive = null;
  if (rec.stav === 'chyba') rec.stav = 'koncept';
}

// ---------- osoba (komu patria inzeráty z tohto telefónu) ----------
function getOsoba() {
  try { const id = localStorage.getItem('osoba'); return C.osoby.find(o => o.id === id) || null; } catch (_) { return null; }
}
function setOsoba(id) {
  try { localStorage.setItem('osoba', id); } catch (_) {}
  renderOsoba(); renderAuthBanner(); renderTitle();
  const o = getOsoba();
  if (o) toast(`Inzeráty pôjdu do priečinka: ${o.nazov}`);
}
function renderOsoba() {
  const box = $('#chipsOsoba'), akt = getOsoba();
  box.innerHTML = '';
  for (const o of C.osoby) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (akt && akt.id === o.id ? ' on' : '');
    b.textContent = o.nazov;
    b.addEventListener('click', () => setOsoba(o.id));
    box.append(b);
  }
}
function renderTitle() {
  if (!$('#viewList').hidden) {
    const o = getOsoba();
    $('#title').textContent = o ? `Inzeráty · ${o.nazov}` : 'Inzeráty';
  }
}

// ---------- navigácia ----------
function showView(name, push = true) {
  ['list', 'edit', 'settings'].forEach(v => { $('#view' + v[0].toUpperCase() + v.slice(1)).hidden = v !== name; });
  $('#btnBack').hidden = name === 'list';
  $('#btnSettings').hidden = name !== 'list';
  $('#fab').hidden = name !== 'list';
  $('#title').textContent = name === 'list' ? 'Inzeráty' : name === 'settings' ? 'Nastavenia' : 'Inzerát';
  renderTitle();
  if (push) history.pushState({ view: name }, '');
  window.scrollTo(0, 0);
}
async function goList(push = true) {
  if (state.dictation) state.dictation.stop();
  if (state.current) await saveNow();
  state.current = null;
  revokeUrls();
  showView('list', push);
  renderList();
}
window.addEventListener('popstate', () => {
  if (state.sending) { history.pushState({ view: 'edit' }, ''); return; }
  goList(false);
});

// ---------- zoznam ----------
let listUrls = [];
async function renderList() {
  listUrls.forEach(u => URL.revokeObjectURL(u)); listUrls = [];
  const items = (await DB.all()).sort((a, b) => b.vytvorene.localeCompare(a.vytvorene));
  const ul = $('#list');
  ul.innerHTML = '';
  $('#empty').hidden = items.length > 0;
  for (const rec of items) {
    const li = document.createElement('li');
    li.className = 'card';
    const thumbBlob = rec.fotky.length ? rec.fotky[0].blob : rec.thumb;
    let img;
    if (thumbBlob) {
      img = document.createElement('img');
      const u = URL.createObjectURL(thumbBlob); listUrls.push(u);
      img.src = u; img.alt = '';
    } else {
      img = document.createElement('div'); img.className = 'noimg';
    }
    const body = document.createElement('div'); body.className = 'body';
    const txt = document.createElement('div'); txt.className = 'txt';
    txt.textContent = rec.diktat.trim() || '(bez popisu)';
    const meta = document.createElement('div'); meta.className = 'meta';
    const tag = document.createElement('span'); tag.className = 'tag ' + rec.stav; tag.textContent = STAV_TEXT[rec.stav];
    const info = document.createElement('span');
    info.textContent = `${fmtDate(rec.vytvorene)} · ${rec.pocetFotiek ?? rec.fotky.length} fotiek` + (rec.cena != null ? ` · ${rec.cena} €` : '');
    meta.append(tag, info);
    body.append(txt, meta);
    li.append(img, body);
    li.addEventListener('click', () => openEdit(rec.id));
    ul.append(li);
  }
  renderAuthBanner();
}

function renderAuthBanner() {
  const b = $('#authBanner');
  if (!Drive.configured()) {
    b.hidden = false;
    b.textContent = 'Appka ešte nie je prepojená s Google Drive (chýba Client ID v config.js). Inzeráty sa dajú pripravovať, odoslať zatiaľ nie.';
  } else if (!getOsoba()) {
    b.hidden = false;
    b.textContent = 'Najprv v ⚙ Nastaveniach vyber, komu patria inzeráty z tohto telefónu (Tomáš / Manželka).';
  } else b.hidden = true;
}

// ---------- editor ----------
function revokeUrls() { state.urls.forEach(u => URL.revokeObjectURL(u)); state.urls = []; }

async function newListing() {
  const rec = {
    id: uid(), vytvorene: isoLocal(), upravene: isoLocal(),
    diktat: '', cena: null, fotky: [], thumb: null, stav: 'koncept', chyba: '', drive: null,
    vyber: { stav: null, farby: [], material: [] },
    manual: { stav: false, farby: false, material: false },
  };
  await DB.put(rec);
  await openEdit(rec.id);
}

async function openEdit(id) {
  const rec = await DB.get(id);
  if (!rec) return;
  state.current = rec;
  $('#diktat').value = rec.diktat;
  $('#cena').value = rec.cena ?? '';
  const ro = rec.stav === 'odoslany';
  $('#viewEdit').classList.toggle('readonly', ro);
  $('#diktat').readOnly = ro;
  $('#cena').readOnly = ro;
  $('#btnSend').hidden = ro;
  $('#progress').hidden = true;
  $('#interim').textContent = '';
  zabezpecVyber(rec);
  state.viacMat = false;
  renderStatus();
  renderPhotos();
  renderChips();
  showView('edit');
}

function renderStatus() {
  const rec = state.current, el = $('#statusLine');
  el.hidden = rec.stav === 'koncept';
  el.className = 'status-line' + (rec.stav === 'odoslany' ? ' ok' : rec.stav === 'chyba' ? ' err' : '');
  if (rec.stav === 'odoslany') el.textContent = `✅ Odoslané ${fmtDate(rec.odoslane)} do priečinka ${rec.folderName}. Koncept sa objaví vo Vinted appke po spracovaní na PC.`;
  else if (rec.stav === 'chyba') el.textContent = '⚠ Odoslanie zlyhalo: ' + rec.chyba + ' Ťukni na Odoslať znova.';
  else if (rec.stav === 'odosiela') el.textContent = 'Odosielanie bolo prerušené. Ťukni na Odoslať, pokračuje sa od poslednej fotky.';
  $('#btnSend').textContent = rec.stav === 'koncept' ? 'Odoslať na Drive' : 'Odoslať znova';
}

function renderPhotos() {
  revokeUrls();
  const rec = state.current, box = $('#photos');
  box.innerHTML = '';
  const ro = rec.stav === 'odoslany';
  $('#photoCount').textContent = ro ? `(${rec.pocetFotiek} odoslaných)` : `(${rec.fotky.length}/${C.maxPhotos})`;
  if (ro && rec.thumb) {
    const div = document.createElement('div'); div.className = 'photo';
    const img = document.createElement('img');
    const u = URL.createObjectURL(rec.thumb); state.urls.push(u); img.src = u;
    div.append(img); box.append(div);
    return;
  }
  rec.fotky.forEach((f, i) => {
    const div = document.createElement('div'); div.className = 'photo';
    const img = document.createElement('img');
    const u = URL.createObjectURL(f.blob); state.urls.push(u);
    img.src = u; img.alt = 'Fotka ' + (i + 1);
    div.append(img);
    if (i === 0) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'Titulná'; div.append(b); }
    const tools = document.createElement('div'); tools.className = 'tools';
    const mk = (label, title, fn, disabled) => {
      const btn = document.createElement('button'); btn.type = 'button';
      btn.textContent = label; btn.title = title; btn.disabled = disabled;
      btn.addEventListener('click', e => { e.stopPropagation(); fn(); });
      return btn;
    };
    tools.append(
      mk('◀', 'Posunúť dopredu', () => movePhoto(i, -1), i === 0),
      mk('✕', 'Zmazať fotku', () => removePhoto(i), false),
      mk('▶', 'Posunúť dozadu', () => movePhoto(i, 1), i === rec.fotky.length - 1),
    );
    div.append(tools);
    box.append(div);
  });
}

async function addPhotos(files) {
  const rec = state.current;
  const free = C.maxPhotos - rec.fotky.length;
  const list = Array.from(files).slice(0, Math.max(0, free));
  if (files.length > list.length) toast(`Maximálne ${C.maxPhotos} fotiek.`, true);
  for (const file of list) {
    try {
      const blob = await resizeImage(file, C.photoMaxSide, C.photoQuality);
      rec.fotky.push({ id: uid(), blob });
    } catch (e) { toast(e.message, true); }
  }
  invalidateUpload(rec);
  await saveNow();
  renderPhotos(); renderStatus();
}
async function movePhoto(i, dir) {
  const f = state.current.fotky, j = i + dir;
  [f[i], f[j]] = [f[j], f[i]];
  invalidateUpload(state.current);
  await saveNow(); renderPhotos(); renderStatus();
}
async function removePhoto(i) {
  state.current.fotky.splice(i, 1);
  invalidateUpload(state.current);
  await saveNow(); renderPhotos(); renderStatus();
}

// ---------- detaily: stav, farba, materiál ----------
const SKUPINY = {
  stav:     { box: '#chipsStav',     zoznam: () => Ciselniky.STAVY_ZOBRAZ, max: 1, nazov: 'stav' },
  farby:    { box: '#chipsFarby',    zoznam: () => Ciselniky.FARBY_ZOBRAZ, max: 2, nazov: 'farby' },
  material: { box: '#chipsMaterial', zoznam: () => Ciselniky.MATERIALY, max: 3, nazov: 'materiály' },
};

function zabezpecVyber(rec) {
  if (!rec.vyber) rec.vyber = { stav: null, farby: [], material: [] };
  if (!rec.manual) rec.manual = { stav: false, farby: false, material: false };
}
const vybrane = (rec, sk) => sk === 'stav' ? (rec.vyber.stav == null ? [] : [rec.vyber.stav]) : rec.vyber[sk];

// Predvyplní skupiny, ktoré používateľ ešte ručne nemenil (alebo všetky pri force).
function aktualizujZDiktatu(force = false) {
  const rec = state.current;
  if (!rec || rec.stav === 'odoslany') return;
  zabezpecVyber(rec);
  const det = Ciselniky.rozpoznajVsetko($('#diktat').value);
  for (const sk of Object.keys(SKUPINY)) {
    if (force) rec.manual[sk] = false;
    if (!rec.manual[sk]) rec.vyber[sk] = det[sk];
  }
  renderChips();
  saveSoon();
}
let autoTimer;
function autoSoon() { clearTimeout(autoTimer); autoTimer = setTimeout(() => aktualizujZDiktatu(false), 500); }

function prepni(sk, id) {
  const rec = state.current, cfg = SKUPINY[sk];
  zabezpecVyber(rec);
  if (sk === 'stav') rec.vyber.stav = rec.vyber.stav === id ? null : id;
  else {
    const arr = rec.vyber[sk];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else if (arr.length >= cfg.max) { toast(`Najviac ${cfg.max} ${cfg.nazov}. Najprv jednu zruš.`, true); return; }
    else arr.push(id);
  }
  rec.manual[sk] = true;
  renderChips();
  saveSoon();
}

function renderChips() {
  const rec = state.current;
  zabezpecVyber(rec);
  const ro = rec.stav === 'odoslany';
  for (const [sk, cfg] of Object.entries(SKUPINY)) {
    const box = $(cfg.box);
    box.innerHTML = '';
    const sel = vybrane(rec, sk);
    let zoznam = cfg.zoznam();
    if (sk === 'material' && !state.viacMat) {
      zoznam = zoznam.filter((m, i) => i < Ciselniky.MATERIALY_HLAVNE || sel.includes(m.id));
    }
    for (const pol of zoznam) {
      const on = sel.includes(pol.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (on ? ' on' : '');
      b.disabled = ro;
      b.setAttribute('aria-pressed', on);
      if (sk === 'farby') {
        const sw = document.createElement('span');
        sw.className = 'swatch' + (pol.hex ? '' : ' multi');
        if (pol.hex) sw.style.background = '#' + pol.hex;
        b.append(sw);
      }
      b.append(document.createTextNode(pol.nazov));
      if (on && !rec.manual[sk] && !ro) {
        const a = document.createElement('span'); a.className = 'auto'; a.textContent = '✨'; a.title = 'podľa diktátu';
        b.append(a);
      }
      if (!ro) b.addEventListener('click', () => prepni(sk, pol.id));
      box.append(b);
    }
  }
  $('#btnViacMaterial').textContent = state.viacMat ? 'Menej materiálov' : 'Viac materiálov…';
}

// ---------- diktovanie (rozpoznávanie reči v Chrome / Android) ----------
class Dictation {
  constructor(h) {
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.h = h; this.active = false; this.errors = 0;
  }
  get supported() { return !!this.SR; }
  start() { this.active = true; this.errors = 0; this._run(); this.h.state(true); }
  stop() { this.active = false; if (this.r) try { this.r.stop(); } catch (_) {} this.h.state(false); }
  _run() {
    const r = new this.SR();
    r.lang = C.speechLang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) { this.errors = 0; this.h.final(res[0].transcript); }
        else interim += res[0].transcript;
      }
      this.h.interim(interim);
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false; this.h.error('Prístup k mikrofónu je zakázaný. Povoľ ho v nastaveniach stránky.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        if (++this.errors >= 3) { this.active = false; this.h.error('Rozpoznávanie reči zlyhalo (' + e.error + '). Skús mikrofón na klávesnici.'); }
      }
    };
    r.onend = () => {
      this.h.interim('');
      if (this.active) setTimeout(() => { if (this.active) this._run(); }, 150);
      else this.h.state(false);
    };
    this.r = r;
    try { r.start(); } catch (_) { /* už beží */ }
  }
}

function appendDictated(text) {
  const ta = $('#diktat');
  let t = text.trim();
  if (!t) return;
  const v = ta.value;
  const needCap = !v.trim() || /[.!?]\s*$/.test(v);
  if (needCap) t = t[0].toLocaleUpperCase('sk') + t.slice(1);
  ta.value = v + (v && !/\s$/.test(v) ? ' ' : '') + t;
  ta.scrollTop = ta.scrollHeight;
  saveSoon();
  autoSoon();
}

function setupDictation() {
  state.dictation = new Dictation({
    final: appendDictated,
    interim: t => { $('#interim').textContent = t; },
    state: on => {
      const b = $('#btnDictate');
      b.classList.toggle('recording', on);
      b.textContent = on ? '⏹ Zastaviť' : '🎤 Diktovať';
    },
    error: msg => toast(msg, true),
  });
  if (!state.dictation.supported) {
    $('#btnDictate').hidden = true;
  }
  $('#btnDictate').addEventListener('click', () => {
    const d = state.dictation;
    if (d.active) d.stop(); else d.start();
  });
}

// ---------- odoslanie ----------
async function send() {
  const rec = state.current;
  if (state.sending || !rec) return;
  rec.diktat = $('#diktat').value;
  if (!rec.fotky.length) { toast('Pridaj aspoň jednu fotku.', true); return; }
  if (!rec.diktat.trim()) { toast('Chýba popis – nadiktuj, čo predávaš.', true); return; }
  const osoba = getOsoba();
  if (!osoba && !(rec.drive && rec.osoba)) { toast('Najprv v ⚙ Nastaveniach vyber, komu patria inzeráty.', true); return; }
  // osoba sa zafixuje pri prvom pokuse (pri pokračovaní po chybe ostáva pôvodná)
  if (!rec.drive) rec.osoba = osoba.id;
  if (state.dictation && state.dictation.active) state.dictation.stop();

  // Prihlásenie hneď v rámci ťuknutia (inak sa okno zablokuje).
  let tokenPromise;
  try { tokenPromise = Drive.ensureToken(); } catch (e) { tokenPromise = Promise.reject(e); }

  state.sending = true;
  $('#btnSend').disabled = true; $('#btnDelete').disabled = true;
  try {
    await tokenPromise;
    await saveNow();
    if (!rec.drive) rec.folderName = folderNameFor(rec, new Date());
    rec.stav = 'odosiela'; rec.chyba = '';
    await DB.put(rec);
    renderStatus();
    $('#progress').hidden = false;
    await Drive.uploadListing(rec, r => DB.put(r), (done, total, label) => {
      $('#progBar').value = Math.round(done / total * 100);
      $('#progText').textContent = label;
    });
    rec.thumb = await resizeImage(rec.fotky[0].blob, 240, 0.7);
    rec.pocetFotiek = rec.fotky.length;
    rec.fotky = [];           // fotky sú na Drive, v mobile uvoľníme miesto
    rec.stav = 'odoslany';
    rec.odoslane = isoLocal();
    await DB.put(rec);
    toast('Odoslané na Google Drive ✅');
    state.sending = false;
    await goList();
  } catch (e) {
    rec.stav = 'chyba';       // rec.drive ostáva → ďalší pokus pokračuje od poslednej fotky
    rec.chyba = e.message;
    await DB.put(rec);
    if (state.current === rec) { renderStatus(); $('#progress').hidden = true; }
    toast(e.message, true);
  } finally {
    state.sending = false;
    $('#btnSend').disabled = false; $('#btnDelete').disabled = false;
  }
}

async function removeListing() {
  const rec = state.current;
  if (!rec) return;
  const msg = rec.stav === 'odoslany'
    ? 'Zmazať záznam z mobilu? Na Google Drive ostane.'
    : 'Zmazať tento inzerát aj s fotkami z mobilu?';
  if (!confirm(msg)) return;
  await DB.del(rec.id);
  state.current = null;
  await goList();
}

// ---------- nastavenia ----------
function renderSettings() {
  const s = $('#authStatus');
  if (!Drive.configured()) s.textContent = 'Nie je nastavené Google Client ID (config.js).';
  else if (!Drive.ready()) s.textContent = 'Načítavam Google prihlásenie…';
  else s.textContent = Drive.signedIn() ? '✅ Prihlásený – odosielanie funguje.' : 'Neprihlásený. Prihlásenie sa ponúkne aj pri prvom odoslaní.';
  $('#btnSignIn').disabled = !Drive.ready() || Drive.signedIn();
  $('#btnSignOut').disabled = !Drive.signedIn();
  $('#about').textContent = `Vinted asistent ${C.version}`;
}

// ---------- štart ----------
function init() {
  $('#fab').addEventListener('click', newListing);
  $('#btnBack').addEventListener('click', () => history.back());
  $('#btnSettings').addEventListener('click', () => { renderSettings(); renderOsoba(); showView('settings'); });
  $('#inCamera').addEventListener('change', e => { addPhotos(e.target.files); e.target.value = ''; });
  $('#inGallery').addEventListener('change', e => { addPhotos(e.target.files); e.target.value = ''; });
  $('#diktat').addEventListener('input', () => { saveSoon(); autoSoon(); });
  $('#btnZnova').addEventListener('click', () => { aktualizujZDiktatu(true); toast('Detaily vyčítané z diktátu znova.'); });
  $('#btnViacMaterial').addEventListener('click', () => { state.viacMat = !state.viacMat; renderChips(); });
  $('#cena').addEventListener('input', saveSoon);
  $('#btnSend').addEventListener('click', send);
  $('#btnDelete').addEventListener('click', removeListing);
  $('#btnSignIn').addEventListener('click', () => Drive.ensureToken().then(() => toast('Prihlásený ✅')).catch(e => toast(e.message, true)));
  $('#btnSignOut').addEventListener('click', () => { Drive.signOut(); toast('Odhlásený'); });
  Drive.onChange(() => { renderSettings(); renderAuthBanner(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  setupDictation();

  history.replaceState({ view: 'list' }, '');
  showView('list', false);
  renderList();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
