(function () {
'use strict';

// ════════════════════════════════════════
// KONFIGURACE
// ════════════════════════════════════════
const LOCATION  = 'Hlybuček';
const SPECIES   = 'Kapr';
const MIN_LEN   = 45;
const MAX_LEN   = 60;

const BASE_URL  = 'https://pavel-vrtal-ict.github.io/rybari-registrace';

// Firebase konfigurace (automatické připojení)
const FB_CONFIG = {
    apiKey:      'AIzaSyCVHqWBRA73byFuJwUaLmBSXGGbPn1k8II',
    databaseURL: 'https://pavel-vrtal-rybari-registrace-default-rtdb.europe-west1.firebasedatabase.app',
    projectId:   'pavel-vrtal-rybari-registrace'
};

const LS = {
    FISHERS:  'hlb_fishers',
    CHECKINS: 'hlb_checkins',
    CATCHES:  'hlb_catches',
    FB_URL:   'hlb_fb_url',
    FB_KEY:   'hlb_fb_key'
};

// ════════════════════════════════════════
// DATA VRSTVA
// ════════════════════════════════════════
let db = null, fbReady = false;

let fishers  = [];
let checkins = [];
let catches  = [];

function lsLoad(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } }
function lsSave(k, d) { localStorage.setItem(k, JSON.stringify(d)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// Firebase init
function initFirebase(dbUrl, apiKey) {
    try {
        if (!dbUrl || !apiKey) return false;
        const cfg = { apiKey, databaseURL: dbUrl, projectId: dbUrl.match(/https:\/\/([^.]+)/)?.[1] || 'p' };
        if (firebase.apps.length === 0) firebase.initializeApp(cfg);
        db = firebase.database();
        fbReady = true;
        setupListeners();
        updateSyncBar();
        return true;
    } catch(e) { console.error(e); fbReady = false; return false; }
}

function setupListeners() {
    db.ref('fishers').on('value',  s => { fishers  = s.val() ? Object.values(s.val()) : []; lsSave(LS.FISHERS,  fishers);  rerender(); });
    db.ref('checkins').on('value', s => { checkins = s.val() ? Object.values(s.val()) : []; lsSave(LS.CHECKINS, checkins); rerender(); });
    db.ref('catches').on('value',  s => { catches  = s.val() ? Object.values(s.val()) : []; lsSave(LS.CATCHES,  catches);  rerender(); });
}

function rerender() {
    renderFishers();
    if (currentView === 'dochazka')   renderDochazka();
    if (currentView === 'ulovky')     renderUlovky();
    if (currentView === 'statistiky') renderStatistiky();
}

function dbSet(col, id, data) {
    if (fbReady) { db.ref(col + '/' + id).set(data); return; }
    const arr = { fishers, checkins, catches }[col];
    if (!arr) return;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr[i] = data; else arr.push(data);
    lsSave(LS[col.toUpperCase()], arr);
}

function dbRemove(col, id) {
    if (fbReady) { db.ref(col + '/' + id).remove(); return; }
    const arr = { fishers, checkins, catches }[col];
    if (!arr) return;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    lsSave(LS[col.toUpperCase()], arr);
}

// ════════════════════════════════════════
// DOM
// ════════════════════════════════════════
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const views = { rybari: $('#view-rybari'), dochazka: $('#view-dochazka'), ulovky: $('#view-ulovky'), statistiky: $('#view-statistiky') };
const navBtns = $$('.nav-btn');

let currentView = 'rybari';

function switchView(name) {
    currentView = name;
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[name].classList.add('active');
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'dochazka')   renderDochazka();
    if (name === 'ulovky')     renderUlovky();
    if (name === 'statistiky') renderStatistiky();
}
navBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

// ── Toast ──
let toastTimer;
function showToast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── Modals ──
const modals = { fisher: $('#modal-fisher'), qr: $('#modal-qr'), manual: $('#modal-manual'), settings: $('#modal-settings') };
function openModal(m)  { m.classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeModal(m) { m.classList.remove('open'); document.body.style.overflow = ''; }
Object.values(modals).forEach(m => m && m.addEventListener('click', e => { if (e.target === m) closeModal(m); }));
$('#modal-close-fisher').addEventListener('click',   () => closeModal(modals.fisher));
$('#modal-close-qr').addEventListener('click',       () => closeModal(modals.qr));
$('#modal-close-manual').addEventListener('click',   () => closeModal(modals.manual));
$('#modal-close-settings').addEventListener('click', () => closeModal(modals.settings));

// ── Helpers ──
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function today()  { return new Date().toISOString().split('T')[0]; }
function fmtDate(ds) { return new Date(ds+'T12:00:00').toLocaleDateString('cs-CZ', { day:'numeric', month:'long', year:'numeric' }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' }); }
function fmtDateShort(ds) { return new Date(ds+'T12:00:00').toLocaleDateString('cs-CZ', { weekday:'short', day:'numeric', month:'numeric' }); }
function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2); }
function getAppUrl() { return (window.location.protocol === 'file:') ? BASE_URL + '/index.html' : window.location.origin + window.location.pathname; }

// ── Sync bar ──
function updateSyncBar() {
    const bar = $('#sync-bar'), icon = $('#sync-icon'), text = $('#sync-text'), btn = $('#btn-sync-setup');
    if (fbReady) {
        bar.className = 'sync-bar sync-firebase';
        icon.textContent = '🔥'; text.textContent = 'Firebase – data sdílena v reálném čase';
        btn.style.display = 'none';
    } else {
        bar.className = 'sync-bar sync-local';
        icon.textContent = '💾'; text.textContent = 'Lokální režim – nastav Firebase pro sdílení';
        btn.style.display = '';
    }
}
$('#btn-sync-setup').addEventListener('click', openSettings);

// ── QR ──
function makeQr(container, url, size) {
    if (typeof QRCode === 'undefined') return;
    new QRCode(container, { text: url, width: size||260, height: size||260, colorDark: '#1a2e1f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

// ════════════════════════════════════════
// URL ACTION (QR scan)
// ════════════════════════════════════════
function handleUrlAction() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('action') === 'checkin' && p.get('f')) {
        const fid = p.get('f');
        // Počkej na načtení dat z Firebase
        const tryShow = (attempts) => {
            const fisher = fishers.find(x => x.id === fid);
            if (fisher) {
                showCheckinOverlay(fisher);
            } else if (attempts > 0) {
                setTimeout(() => tryShow(attempts - 1), 500);
            } else {
                showToast('Rybář nenalezen – zkontrolujte Firebase připojení', 'danger');
            }
        };
        setTimeout(() => tryShow(10), fbReady ? 100 : 300);
        window.history.replaceState({}, '', getAppUrl());
    }
}

// ════════════════════════════════════════
// CHECKIN OVERLAY
// ════════════════════════════════════════
let overlayFisherId = null;

function showCheckinOverlay(fisher) {
    overlayFisherId = fisher.id;
    const overlay = $('#checkin-overlay');
    overlay.style.display = 'flex';

    $('#co-fisher-name').textContent = fisher.name;
    $('#co-time').textContent = '⏰ ' + new Date().toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
    $('#co-catch-length').value = '';
    $('#co-length-hint').textContent = '';

    // Zkontroluj, zda dnes již přišel
    const todayDate = today();
    const alreadyIn = checkins.find(c => c.fisherId === fisher.id && c.date === todayDate);
    const statusEl = $('#co-status');

    if (alreadyIn) {
        statusEl.className = 'checkin-status-msg status-already';
        statusEl.textContent = `✓ Dnes již evidován v ${fmtTime(alreadyIn.timestamp)}`;
    } else {
        // Zaznamenat příchod
        const id = genId();
        const ci = { id, fisherId: fisher.id, date: todayDate, timestamp: new Date().toISOString() };
        dbSet('checkins', id, ci);
        if (!fbReady) checkins.push(ci);
        statusEl.className = 'checkin-status-msg status-new';
        statusEl.textContent = `✅ Příchod zaznamenán – ${LOCATION}`;
    }
}

$('#co-catch-length').addEventListener('input', () => {
    const val = parseInt($('#co-catch-length').value);
    const hint = $('#co-length-hint');
    if (!val) { hint.textContent = ''; return; }
    if (val >= MIN_LEN && val <= MAX_LEN) {
        hint.className = 'length-hint hint-ok';
        hint.textContent = `✓ Kapr ${val} cm – v normě (${MIN_LEN}–${MAX_LEN} cm)`;
    } else {
        hint.className = 'length-hint hint-outside';
        hint.textContent = `⚠ ${val} cm – mimo normu (${MIN_LEN}–${MAX_LEN} cm)`;
    }
});

$('#co-catch-btn').addEventListener('click', () => {
    const length = parseInt($('#co-catch-length').value);
    if (!length || length < 5 || length > 150) { showToast('Zadejte délku v cm', 'warning'); return; }
    const id = genId();
    const cat = {
        id, fisherId: overlayFisherId, species: SPECIES, length,
        inRange: length >= MIN_LEN && length <= MAX_LEN,
        date: today(), timestamp: new Date().toISOString()
    };
    dbSet('catches', id, cat);
    if (!fbReady) catches.push(cat);
    $('#co-catch-length').value = '';
    $('#co-length-hint').textContent = '';
    showToast(`🐟 Úlovek ${length} cm zapsán!`, 'success');
});

$('#co-close-btn').addEventListener('click', () => {
    $('#checkin-overlay').style.display = 'none';
    overlayFisherId = null;
    rerender();
});

// ════════════════════════════════════════
// RYBÁŘI
// ════════════════════════════════════════
let editingFisherId = null;

$('#btn-new-fisher').addEventListener('click', () => {
    editingFisherId = null;
    $('#modal-fisher-title').textContent = 'Nový rybář';
    $('#fisher-form').reset();
    openModal(modals.fisher);
});

$('#fisher-form').addEventListener('submit', e => {
    e.preventDefault();
    const id   = editingFisherId || genId();
    const name = $('#fisher-name').value.trim();
    if (!name) return;
    const data = {
        id, name,
        number:      $('#fisher-number').value.trim(),
        phone:       $('#fisher-phone').value.trim(),
        registeredAt: editingFisherId ? (fishers.find(f=>f.id===id)?.registeredAt || new Date().toISOString()) : new Date().toISOString()
    };
    dbSet('fishers', id, data);
    if (!fbReady) {
        const idx = fishers.findIndex(f => f.id === id);
        if (idx >= 0) fishers[idx] = data; else fishers.push(data);
        renderFishers();
    }
    closeModal(modals.fisher);
    showToast(editingFisherId ? 'Rybář upraven' : `${name} přidán`);
    editingFisherId = null;
});

function renderFishers() {
    const list = $('#fishers-list'), empty = $('#no-fishers');
    if (!fishers.length) { list.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display = 'none';

    const sorted = [...fishers].sort((a,b) => a.name.localeCompare(b.name, 'cs'));
    list.innerHTML = sorted.map(f => {
        const todayCI = checkins.filter(c => c.fisherId === f.id && c.date === today()).length;
        const yearCatches = catches.filter(c => c.fisherId === f.id && c.timestamp?.startsWith(new Date().getFullYear().toString())).length;
        return `<div class="fisher-card">
            <div class="fisher-avatar">${esc(initials(f.name))}</div>
            <div class="fisher-info">
                <div class="fisher-name">${esc(f.name)}</div>
                <div class="fisher-sub">${f.number ? '🪪 '+esc(f.number)+' · ' : ''}📅 ${yearCatches} úlovků letos${todayCI ? ' · <span style="color:var(--success);font-weight:700">✓ Dnes</span>' : ''}</div>
            </div>
            <div class="fisher-actions">
                <button class="btn btn-secondary btn-sm" onclick="window._showFisherQr('${f.id}')">QR</button>
                <button class="btn btn-secondary btn-sm" onclick="window._editFisher('${f.id}')">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="window._deleteFisher('${f.id}')">🗑</button>
            </div>
        </div>`;
    }).join('');
}

window._editFisher = function(id) {
    const f = fishers.find(x => x.id === id);
    if (!f) return;
    editingFisherId = id;
    $('#modal-fisher-title').textContent = 'Upravit rybáře';
    $('#fisher-name').value   = f.name;
    $('#fisher-number').value = f.number || '';
    $('#fisher-phone').value  = f.phone  || '';
    openModal(modals.fisher);
};

window._deleteFisher = function(id) {
    const f = fishers.find(x => x.id === id);
    if (!f || !confirm(`Smazat ${f.name} včetně všech záznamů?`)) return;
    dbRemove('fishers', id);
    checkins.filter(c => c.fisherId === id).forEach(c => dbRemove('checkins', c.id));
    catches.filter(c  => c.fisherId === id).forEach(c => dbRemove('catches',  c.id));
    if (!fbReady) {
        fishers  = fishers.filter(x => x.id !== id);
        checkins = checkins.filter(c => c.fisherId !== id);
        catches  = catches.filter(c => c.fisherId !== id);
        renderFishers();
    }
    showToast('Rybář smazán');
};

window._showFisherQr = function(id) {
    const f = fishers.find(x => x.id === id);
    if (!f) return;
    const url = getAppUrl() + '?action=checkin&f=' + id;
    $('#modal-qr-title').textContent = `QR – ${f.name}`;
    const body = $('#qr-body');
    body.innerHTML = '';
    const info = document.createElement('p');
    info.style.cssText = 'font-size:.85rem;color:var(--text-secondary);margin-bottom:.75rem;text-align:center;';
    info.textContent = `${f.name} · ${LOCATION}`;
    body.appendChild(info);
    const qDiv = document.createElement('div');
    qDiv.style.cssText = 'display:flex;justify-content:center;margin:0 auto;';
    body.appendChild(qDiv);
    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:.78rem;color:var(--text-secondary);margin-top:.65rem;text-align:center;';
    hint.textContent = 'Naskenuj při příchodu k rybníku';
    body.appendChild(hint);
    const urlDiv = document.createElement('div'); urlDiv.className = 'qr-url'; urlDiv.textContent = url;
    body.appendChild(urlDiv);
    openModal(modals.qr);
    setTimeout(() => makeQr(qDiv, url, 260), 50);
};

// ════════════════════════════════════════
// DOCHÁZKA
// ════════════════════════════════════════
$('#btn-manual-checkin').addEventListener('click', () => {
    if (!fishers.length) { showToast('Nejdříve přidejte rybáře', 'warning'); return; }
    const sel = $('#manual-fisher');
    sel.innerHTML = [...fishers].sort((a,b)=>a.name.localeCompare(b.name,'cs'))
        .map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
    $('#manual-date').value = today();
    openModal(modals.manual);
});

$('#btn-save-manual').addEventListener('click', () => {
    const fid  = $('#manual-fisher').value;
    const date = $('#manual-date').value;
    if (!fid || !date) return;
    const already = checkins.find(c => c.fisherId === fid && c.date === date);
    if (already) { showToast('Tento rybář je na tento den již evidován', 'warning'); closeModal(modals.manual); return; }
    const id = genId();
    const ci = { id, fisherId: fid, date, timestamp: new Date(date+'T08:00:00').toISOString() };
    dbSet('checkins', id, ci);
    if (!fbReady) { checkins.push(ci); renderDochazka(); }
    closeModal(modals.manual);
    showToast('Příchod zapsán');
});

function renderDochazka() {
    const cont = $('#dochazka-content');
    if (!checkins.length) {
        cont.innerHTML = `<div class="empty-state"><span class="empty-icon">📅</span><p>Žádné záznamy příchodů.</p></div>`;
        return;
    }
    // Seřadit sestupně dle data
    const sorted = [...checkins].sort((a,b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));
    // Seskupit dle data
    const groups = {};
    sorted.forEach(ci => { if (!groups[ci.date]) groups[ci.date] = []; groups[ci.date].push(ci); });

    cont.innerHTML = Object.entries(groups).map(([date, cis]) => `
        <div class="day-group">
            <div class="day-label">${fmtDate(date)} (${cis.length}×)</div>
            ${cis.map(ci => {
                const f = fishers.find(x => x.id === ci.fisherId);
                const catchCount = catches.filter(c => c.fisherId === ci.fisherId && c.date === date).length;
                return `<div class="checkin-row">
                    <div class="checkin-row-name">${f ? esc(f.name) : '?'}</div>
                    <div class="checkin-row-time">${fmtTime(ci.timestamp)}</div>
                    ${catchCount ? `<div class="checkin-row-catch">🐟 ${catchCount}×</div>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="window._deleteCheckin('${ci.id}')">✕</button>
                </div>`;
            }).join('')}
        </div>`).join('');
}

window._deleteCheckin = function(id) {
    if (!confirm('Smazat záznam příchodu?')) return;
    dbRemove('checkins', id);
    if (!fbReady) { checkins = checkins.filter(c => c.id !== id); renderDochazka(); }
    showToast('Záznam smazán');
};

// ════════════════════════════════════════
// ÚLOVKY
// ════════════════════════════════════════
function renderUlovky() {
    const cont = $('#ulovky-content');
    if (!catches.length) {
        cont.innerHTML = `<div class="empty-state"><span class="empty-icon">🐟</span><p>Zatím žádné úlovky.</p><p class="hint">Úlovky se zadávají při skenování QR kódu.</p></div>`;
        return;
    }
    const sorted = [...catches].sort((a,b) => b.timestamp.localeCompare(a.timestamp));

    // Filtr – rok
    const years = [...new Set(sorted.map(c => c.timestamp?.slice(0,4)))].sort().reverse();
    const selectedYear = $('#ulovky-year-sel')?.value || years[0];

    const filtered = sorted.filter(c => c.timestamp?.startsWith(selectedYear));

    cont.innerHTML = `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.85rem;flex-wrap:wrap;">
            <select id="ulovky-year-sel" class="year-select" onchange="window._refreshUlovky()">
                ${years.map(y=>`<option value="${y}" ${y===selectedYear?'selected':''}>${y}</option>`).join('')}
            </select>
            <span style="font-size:.82rem;color:var(--text-secondary)">${filtered.length} úlovků · prům. ${filtered.length ? Math.round(filtered.reduce((s,c)=>s+c.length,0)/filtered.length) : 0} cm</span>
        </div>
        ${filtered.map(cat => {
            const f = fishers.find(x => x.id === cat.fisherId);
            return `<div class="catch-row">
                <span class="catch-fish-icon">🐟</span>
                <div class="catch-row-info">
                    <div class="catch-row-name">${f ? esc(f.name) : '?'}</div>
                    <div class="catch-row-meta">${fmtDateShort(cat.date)} · ${fmtTime(cat.timestamp)}</div>
                </div>
                <span class="catch-length ${cat.inRange?'':'outside'}">${cat.length} cm</span>
                <button class="btn btn-danger btn-sm" onclick="window._deleteCatch('${cat.id}')">✕</button>
            </div>`;
        }).join('')}`;
}

window._refreshUlovky = function() { renderUlovky(); };

window._deleteCatch = function(id) {
    if (!confirm('Smazat úlovek?')) return;
    dbRemove('catches', id);
    if (!fbReady) { catches = catches.filter(c => c.id !== id); renderUlovky(); }
    showToast('Úlovek smazán');
};

// ════════════════════════════════════════
// STATISTIKY
// ════════════════════════════════════════
function renderStatistiky() {
    const cont = $('#statistiky-content');
    const yearSel = $('#stats-year');
    const curYear = yearSel.value || new Date().getFullYear().toString();

    const yearCheckins = checkins.filter(c => c.date?.startsWith(curYear));
    const yearCatches  = catches.filter(c => c.timestamp?.startsWith(curYear));

    const maxVisits  = Math.max(1, ...fishers.map(f => yearCheckins.filter(c => c.fisherId===f.id).length));
    const maxCatches = Math.max(1, ...fishers.map(f => yearCatches.filter(c => c.fisherId===f.id).length));

    const fisherStats = [...fishers].map(f => ({
        fisher:  f,
        visits:  yearCheckins.filter(c => c.fisherId===f.id).length,
        catches: yearCatches.filter(c => c.fisherId===f.id).length,
        avgLen:  (() => {
            const fc = yearCatches.filter(c => c.fisherId===f.id);
            return fc.length ? Math.round(fc.reduce((s,c)=>s+c.length,0)/fc.length) : 0;
        })()
    })).sort((a,b) => b.visits - a.visits || b.catches - a.catches);

    const inRange = yearCatches.filter(c => c.inRange).length;

    cont.innerHTML = `
        <div class="stats-summary">
            <div class="stat-card"><div class="stat-value">${yearCheckins.length}</div><div class="stat-label">Příchodů</div></div>
            <div class="stat-card"><div class="stat-value">${yearCatches.length}</div><div class="stat-label">Úlovků</div></div>
            <div class="stat-card"><div class="stat-value">${inRange}</div><div class="stat-label">V normě</div></div>
            <div class="stat-card"><div class="stat-value">${yearCatches.length ? Math.round(yearCatches.reduce((s,c)=>s+c.length,0)/yearCatches.length) : '—'}</div><div class="stat-label">Prům. cm</div></div>
        </div>
        ${fisherStats.length ? fisherStats.map(s => `
            <div class="fisher-stats-card">
                <div class="fsc-header">
                    <div class="fisher-avatar" style="width:36px;height:36px;font-size:.9rem;">${esc(initials(s.fisher.name))}</div>
                    <div class="fsc-name">${esc(s.fisher.name)}</div>
                    <span style="font-size:.78rem;color:var(--text-secondary)">${s.avgLen ? s.avgLen+' cm prům.' : ''}</span>
                </div>
                <div class="fsc-bars">
                    <div class="fsc-bar-row">
                        <span class="fsc-bar-label">Příchody</span>
                        <div class="fsc-bar-track"><div class="fsc-bar-fill" style="width:${Math.round(s.visits/maxVisits*100)}%"></div></div>
                        <span class="fsc-bar-val">${s.visits}</span>
                    </div>
                    <div class="fsc-bar-row">
                        <span class="fsc-bar-label">Úlovky</span>
                        <div class="fsc-bar-track"><div class="fsc-bar-fill catches" style="width:${Math.round(s.catches/maxCatches*100)}%"></div></div>
                        <span class="fsc-bar-val">${s.catches}</span>
                    </div>
                </div>
            </div>`).join('')
        : '<div class="empty-state"><p>Žádná data pro vybraný rok.</p></div>'}`;
}

// Inicializuj výběr roků
function initYearSelectors() {
    const curYear = new Date().getFullYear();
    const years   = [curYear, curYear-1, curYear-2];
    const opts    = years.map(y => `<option value="${y}">${y}</option>`).join('');
    $('#stats-year').innerHTML = opts;
    $('#stats-year').addEventListener('change', renderStatistiky);
}

// ════════════════════════════════════════
// NASTAVENÍ
// ════════════════════════════════════════
function openSettings() {
    $('#settings-firebase-url').value = localStorage.getItem(LS.FB_URL) || '';
    $('#settings-firebase-key').value = localStorage.getItem(LS.FB_KEY) || '';
    $('#btn-disconnect-firebase').style.display = fbReady ? '' : 'none';
    updateFbStatusBox();
    openModal(modals.settings);
}

function updateFbStatusBox() {
    const box = $('#firebase-status');
    if (!box) return;
    box.innerHTML = fbReady
        ? '<div class="fb-status-ok">✅ Firebase připojena – data jsou sdílena</div>'
        : '<div class="fb-status-warn">⚠️ Firebase není připojena – data jsou pouze lokální</div>';
}

$('#btn-open-settings').addEventListener('click', openSettings);

$('#btn-save-firebase').addEventListener('click', () => {
    const url = $('#settings-firebase-url').value.trim();
    const key = $('#settings-firebase-key').value.trim();
    if (!url || !key) { showToast('Vyplňte URL i API Key', 'danger'); return; }
    localStorage.setItem(LS.FB_URL, url);
    localStorage.setItem(LS.FB_KEY, key);
    if (initFirebase(url, key)) {
        showToast('Firebase připojena!', 'success');
        updateFbStatusBox();
        $('#btn-disconnect-firebase').style.display = '';
        closeModal(modals.settings);
    } else {
        showToast('Nepodařilo se připojit – zkontrolujte údaje', 'danger');
    }
});

$('#btn-disconnect-firebase').addEventListener('click', () => {
    localStorage.removeItem(LS.FB_URL); localStorage.removeItem(LS.FB_KEY);
    fbReady = false; db = null;
    updateSyncBar(); updateFbStatusBox();
    $('#btn-disconnect-firebase').style.display = 'none';
    showToast('Firebase odpojena', 'warning');
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
fishers  = lsLoad(LS.FISHERS);
checkins = lsLoad(LS.CHECKINS);
catches  = lsLoad(LS.CATCHES);

// Automatické připojení Firebase
const fbUrl = localStorage.getItem(LS.FB_URL) || FB_CONFIG.databaseURL;
const fbKey = localStorage.getItem(LS.FB_KEY) || FB_CONFIG.apiKey;
initFirebase(fbUrl, fbKey);

updateSyncBar();
initYearSelectors();
renderFishers();
handleUrlAction();

})();
