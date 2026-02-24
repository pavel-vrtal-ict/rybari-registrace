(function () {
    'use strict';

    // ════════════════════════════════════════
    // ── FIREBASE / DATA VRSTVA ──
    // ════════════════════════════════════════

    const LS = {
        COMPETITIONS: 'ryb_competitions',
        PARTICIPANTS:  'ryb_participants',
        CHECKINS:      'ryb_checkins',
        CATCHES:       'ryb_catches',
        BASE_URL:      'ryb_base_url',
        FB_URL:        'ryb_fb_url',
        FB_KEY:        'ryb_fb_key'
    };

    let db = null;          // Firebase Database instance
    let fbReady = false;    // je Firebase připojena?

    // Lokální pole – source of truth pro render
    let competitions = [];
    let participants  = [];
    let checkins      = [];
    let catches       = [];

    function lsLoad(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch { return []; }
    }
    function lsSave(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // ── Firebase init ──
    function initFirebase(dbUrl, apiKey) {
        try {
            if (!dbUrl || !apiKey) return false;
            const cfg = {
                apiKey,
                databaseURL: dbUrl,
                projectId: dbUrl.match(/https:\/\/([^.]+)/)?.[1] || 'project'
            };
            if (firebase.apps.length === 0) {
                firebase.initializeApp(cfg);
            }
            db = firebase.database();
            fbReady = true;
            setupRealtimeListeners();
            updateSyncBar();
            return true;
        } catch (err) {
            console.error('Firebase init error:', err);
            fbReady = false;
            return false;
        }
    }

    // Real-time listenery – automaticky aktualizují lokální pole a překreslí UI
    function setupRealtimeListeners() {
        if (!db) return;

        db.ref('competitions').on('value', snap => {
            competitions = snap.val() ? Object.values(snap.val()) : [];
            lsSave(LS.COMPETITIONS, competitions);
            rerender();
        });
        db.ref('participants').on('value', snap => {
            participants = snap.val() ? Object.values(snap.val()) : [];
            lsSave(LS.PARTICIPANTS, participants);
            rerender();
        });
        db.ref('checkins').on('value', snap => {
            checkins = snap.val() ? Object.values(snap.val()) : [];
            lsSave(LS.CHECKINS, checkins);
            rerender();
        });
        db.ref('catches').on('value', snap => {
            catches = snap.val() ? Object.values(snap.val()) : [];
            lsSave(LS.CATCHES, catches);
            rerender();
        });
    }

    function rerender() {
        renderCompetitions();
        if (currentView === 'registration') renderRegistrationView();
        if (currentView === 'checkin')      renderCheckinView();
        if (currentView === 'catches')      renderCatchesView();
        if (currentView === 'results')      renderResultsView();
    }

    // Uložit záznam (lokálně + Firebase)
    function dbSet(collection, id, data) {
        if (fbReady && db) {
            db.ref(collection + '/' + id).set(data);
            // listener aktualizuje pole automaticky
        } else {
            // lokální update
            const map = { competitions, participants, checkins, catches };
            const lsKey = { competitions: LS.COMPETITIONS, participants: LS.PARTICIPANTS,
                            checkins: LS.CHECKINS, catches: LS.CATCHES };
            const arr = map[collection];
            if (arr) {
                const idx = arr.findIndex(x => x.id === id);
                if (idx >= 0) arr[idx] = data; else arr.push(data);
                lsSave(lsKey[collection], arr);
            }
        }
    }

    // Smazat záznam
    function dbRemove(collection, id) {
        if (fbReady && db) {
            db.ref(collection + '/' + id).remove();
        } else {
            const map = { competitions, participants, checkins, catches };
            const lsKey = { competitions: LS.COMPETITIONS, participants: LS.PARTICIPANTS,
                            checkins: LS.CHECKINS, catches: LS.CATCHES };
            const arr = map[collection];
            if (arr) {
                const idx = arr.findIndex(x => x.id === id);
                if (idx >= 0) arr.splice(idx, 1);
                lsSave(lsKey[collection], arr);
            }
        }
    }

    // Smazat celou kolekci
    function dbRemoveCollection(collection) {
        if (fbReady && db) {
            db.ref(collection).remove();
        }
        const lsKey = { competitions: LS.COMPETITIONS, participants: LS.PARTICIPANTS,
                        checkins: LS.CHECKINS, catches: LS.CATCHES };
        const arr = { competitions, participants, checkins, catches }[collection];
        if (arr) { arr.length = 0; lsSave(lsKey[collection], []); }
    }

    // Smazat záznamy dle filtru
    function dbRemoveWhere(collection, predicate) {
        const arr = { competitions, participants, checkins, catches }[collection];
        if (!arr) return;
        const toRemove = arr.filter(predicate);
        toRemove.forEach(x => dbRemove(collection, x.id));
    }

    // ════════════════════════════════════════
    // ── DOM ──
    // ════════════════════════════════════════

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const views = {
        competitions: $('#view-competitions'),
        registration: $('#view-registration'),
        checkin:      $('#view-checkin'),
        catches:      $('#view-catches'),
        results:      $('#view-results')
    };
    const navBtns           = $$('.nav-btn');
    const modalCompetition  = $('#modal-competition');
    const modalDetail       = $('#modal-detail');
    const modalQr           = $('#modal-qr');
    const modalPayment      = $('#modal-payment');
    const modalSettings     = $('#modal-settings');

    // ── Navigation ──
    let currentView = 'competitions';

    function switchView(name) {
        currentView = name;
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[name].classList.add('active');
        navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
        if (name === 'registration') renderRegistrationView();
        if (name === 'checkin')      renderCheckinView();
        if (name === 'catches')      renderCatchesView();
        if (name === 'results')      renderResultsView();
    }

    navBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

    // ── Deep link z QR kódu ──
    function handleUrlAction() {
        const p = new URLSearchParams(window.location.search);
        const action = p.get('action'), compId = p.get('comp'),
              pond = p.get('pond'),   pid = p.get('pid');

        if (action === 'register' && compId) {
            switchView('registration');
            setTimeout(() => {
                const sel = $('#reg-competition');
                if (sel) sel.value = compId;
            }, 600);
        } else if (action === 'checkin' && compId && pond) {
            switchView('checkin');
            setTimeout(() => performCheckinFromUrl(compId, pond), 600);
        } else if (action === 'catch' && compId && pid) {
            switchView('catches');
            setTimeout(() => performCatchFromUrl(compId, pid), 600);
        }
    }

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
    function openModal(m)  { m.classList.add('open');    document.body.style.overflow = 'hidden'; }
    function closeModal(m) { m.classList.remove('open'); document.body.style.overflow = ''; }

    [modalCompetition, modalDetail, modalQr, modalPayment, modalSettings].forEach(m => {
        m && m.addEventListener('click', e => { if (e.target === m) closeModal(m); });
    });
    $('#modal-close-competition').addEventListener('click', () => closeModal(modalCompetition));
    $('#modal-close-detail').addEventListener('click', () => closeModal(modalDetail));
    $('#modal-close-qr').addEventListener('click', () => closeModal(modalQr));
    $('#btn-payment-ok').addEventListener('click', () => closeModal(modalPayment));
    $('#modal-close-settings').addEventListener('click', () => closeModal(modalSettings));

    // ── Helpers ──
    function escHtml(str) {
        const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
    }
    function slugify(str) {
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    function formatDate(ds) {
        return new Date(ds).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    }
    function parsePonds(str) {
        return str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    function getCategoryLabel(cat) {
        return { dospeli: 'Dospělí', mladez: 'Mládež', deti: 'Děti' }[cat] || cat;
    }
    function getCompetitionStatus(comp) {
        const now = new Date();
        const compDate = new Date(comp.date + 'T' + (comp.time || '23:59'));
        const regCount = participants.filter(p => p.competitionId === comp.id).length;
        if (compDate < now) return { label: 'Proběhl', class: 'badge-past' };
        if (regCount >= comp.maxParticipants) return { label: 'Plný', class: 'badge-full' };
        return { label: 'Otevřený', class: 'badge-open' };
    }
    function getParticipantCatchCount(compId, pid) {
        return catches.filter(c => c.competitionId === compId && c.participantId === pid).length;
    }
    function getBaseUrl() {
        const saved = localStorage.getItem(LS.BASE_URL);
        if (saved && saved.startsWith('http')) return saved.replace(/\/$/, '') + '/index.html';
        if (window.location.protocol === 'file:') return 'https://pavel-vrtal-ict.github.io/rybari-registrace/index.html';
        return window.location.origin + window.location.pathname;
    }

    // ── Sync bar ──
    function updateSyncBar() {
        const bar   = $('#sync-bar');
        const icon  = $('#sync-icon');
        const text  = $('#sync-text');
        const setup = $('#btn-sync-setup');
        if (fbReady) {
            bar.className  = 'sync-bar sync-firebase';
            icon.textContent = '🔥';
            text.textContent = 'Firebase – data sdílena v reálném čase';
            setup.style.display = 'none';
        } else {
            bar.className  = 'sync-bar sync-local';
            icon.textContent = '💾';
            text.textContent = 'Lokální režim – QR registrace nefunguje';
            setup.style.display = '';
        }
    }

    $('#btn-sync-setup').addEventListener('click', () => openModal(modalSettings));

    // ── QR generování ──
    function makeQr(container, url, size) {
        if (typeof QRCode === 'undefined') return;
        new QRCode(container, {
            text: url, width: size || 280, height: size || 280,
            colorDark: '#1a2e1f', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    function showQrCode(title, url, subtitle) {
        $('#modal-qr-title').textContent = title;
        const body = $('#qr-body');
        body.innerHTML = '';
        const qrDiv = document.createElement('div');
        qrDiv.id = 'qr-canvas';
        qrDiv.style.cssText = 'display:flex;justify-content:center;margin:0 auto;';
        body.appendChild(qrDiv);
        const lbl = document.createElement('div'); lbl.className = 'qr-label'; lbl.textContent = subtitle || ''; body.appendChild(lbl);
        const urlDiv = document.createElement('div'); urlDiv.className = 'qr-url'; urlDiv.textContent = url; body.appendChild(urlDiv);
        openModal(modalQr);
        setTimeout(() => makeQr(qrDiv, url, 280), 50);
    }

    // ════════════════════════════════════════
    // ── NASTAVENÍ ──
    // ════════════════════════════════════════

    function openSettings() {
        const fbUrl = localStorage.getItem(LS.FB_URL) || '';
        const fbKey = localStorage.getItem(LS.FB_KEY) || '';
        $('#settings-firebase-url').value = fbUrl;
        $('#settings-firebase-key').value = fbKey;
        $('#settings-base-url').value = localStorage.getItem(LS.BASE_URL) || '';
        const disc = $('#btn-disconnect-firebase');
        disc.style.display = fbReady ? '' : 'none';
        updateFirebaseStatusBox();
        openModal(modalSettings);
    }

    function updateFirebaseStatusBox() {
        const box = $('#firebase-status');
        if (!box) return;
        if (fbReady) {
            box.innerHTML = '<div class="fb-status-ok">✅ Firebase připojena – data jsou sdílena</div>';
        } else {
            box.innerHTML = '<div class="fb-status-warn">⚠️ Firebase není připojena – data jsou pouze lokální</div>';
        }
    }

    $('#btn-open-settings').addEventListener('click', openSettings);
    $('#btn-sync-setup').addEventListener('click', openSettings);

    $('#btn-save-firebase').addEventListener('click', () => {
        const fbUrl = $('#settings-firebase-url').value.trim();
        const fbKey = $('#settings-firebase-key').value.trim();
        if (!fbUrl || !fbKey) { showToast('Vyplňte URL i API Key', 'danger'); return; }
        localStorage.setItem(LS.FB_URL, fbUrl);
        localStorage.setItem(LS.FB_KEY, fbKey);
        const ok = initFirebase(fbUrl, fbKey);
        if (ok) {
            showToast('Firebase připojena! Data se synchronizují.');
            updateFirebaseStatusBox();
            $('#btn-disconnect-firebase').style.display = '';
            closeModal(modalSettings);
        } else {
            showToast('Nepodařilo se připojit Firebase – zkontrolujte údaje', 'danger');
        }
    });

    $('#btn-disconnect-firebase').addEventListener('click', () => {
        localStorage.removeItem(LS.FB_URL);
        localStorage.removeItem(LS.FB_KEY);
        fbReady = false; db = null;
        updateSyncBar();
        updateFirebaseStatusBox();
        $('#btn-disconnect-firebase').style.display = 'none';
        showToast('Firebase odpojena – přepnuto do lokálního režimu', 'warning');
    });

    $('#btn-save-settings').addEventListener('click', () => {
        const url = $('#settings-base-url').value.trim();
        localStorage.setItem(LS.BASE_URL, url);
        showToast(url ? 'URL uložena' : 'Výchozí URL obnovena');
        closeModal(modalSettings);
    });

    // ════════════════════════════════════════
    // ── ZÁVODY ──
    // ════════════════════════════════════════

    let editingCompId = null;

    $('#btn-new-competition').addEventListener('click', () => {
        editingCompId = null;
        $('#modal-competition-title').textContent = 'Nový závod';
        $('#competition-form').reset();
        const d = new Date(); d.setDate(d.getDate() + 7);
        $('#comp-date').value = d.toISOString().split('T')[0];
        $('#comp-catch-limit').value = 2;
        openModal(modalCompetition);
    });

    $('#competition-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = editingCompId || genId();
        const data = {
            id,
            name:            $('#comp-name').value.trim(),
            date:            $('#comp-date').value,
            time:            $('#comp-time').value,
            location:        $('#comp-location').value.trim(),
            maxParticipants: parseInt($('#comp-max').value) || 50,
            ponds:           parsePonds($('#comp-ponds').value),
            catchLimit:      parseInt($('#comp-catch-limit').value) || 2,
            description:     $('#comp-desc').value.trim(),
            createdAt:       editingCompId
                ? (competitions.find(c => c.id === editingCompId)?.createdAt || new Date().toISOString())
                : new Date().toISOString()
        };
        dbSet('competitions', id, data);
        if (!fbReady) {
            // okamžitý lokální update
            const idx = competitions.findIndex(c => c.id === id);
            if (idx >= 0) competitions[idx] = data; else competitions.push(data);
        }
        closeModal(modalCompetition);
        renderCompetitions();
        showToast(editingCompId ? 'Závod upraven' : 'Závod vytvořen');
        editingCompId = null;
    });

    function renderCompetitions() {
        const list  = $('#competitions-list');
        const empty = $('#no-competitions');
        if (competitions.length === 0) {
            list.style.display = 'none'; empty.style.display = 'block'; return;
        }
        empty.style.display = 'none'; list.style.display = 'flex';

        const sorted = [...competitions].sort((a, b) => new Date(a.date) - new Date(b.date));
        list.innerHTML = sorted.map(comp => {
            const status      = getCompetitionStatus(comp);
            const regCount    = participants.filter(p => p.competitionId === comp.id).length;
            const totalCatch  = catches.filter(c => c.competitionId === comp.id).length;
            const canRegister = status.class === 'badge-open';
            return `
                <div class="card" data-id="${comp.id}">
                    <div class="card-title">${escHtml(comp.name)}</div>
                    <div class="card-meta">
                        <span>📅 ${formatDate(comp.date)}</span>
                        <span>⏰ ${comp.time || '—'}</span>
                        <span>📍 ${escHtml(comp.location)}</span>
                    </div>
                    ${comp.ponds.length ? `<div class="pond-tags">
                        ${comp.ponds.map(p => `<span class="pond-tag">🏞️ ${escHtml(p)}</span>`).join('')}
                    </div>` : ''}
                    <div class="card-footer">
                        <span class="badge ${status.class}">${status.label}</span>
                        <span style="font-size:0.85rem;color:var(--text-secondary)">
                            👥 ${regCount}/${comp.maxParticipants}${totalCatch ? ` · 🐟 ${totalCatch}` : ''}
                        </span>
                    </div>
                    ${canRegister ? `
                    <div class="card-qr-row">
                        <button class="btn-qr-reg" data-qr-id="${comp.id}">
                            📱 QR pro registraci
                        </button>
                    </div>` : ''}
                </div>`;
        }).join('');

        list.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('.btn-qr-reg')) return;
                openCompetitionDetail(card.dataset.id);
            });
        });
        list.querySelectorAll('.btn-qr-reg').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); window._showRegQr(btn.dataset.qrId); });
        });
    }

    function openCompetitionDetail(id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        const regCount   = participants.filter(p => p.competitionId === id).length;
        const totalCatch = catches.filter(c => c.competitionId === id).length;
        const status     = getCompetitionStatus(comp);
        const body = $('#competition-detail-body');
        body.innerHTML = `
            <div class="detail-row"><span class="detail-label">Název</span><span class="detail-value">${escHtml(comp.name)}</span></div>
            <div class="detail-row"><span class="detail-label">Datum</span><span class="detail-value">${formatDate(comp.date)}</span></div>
            <div class="detail-row"><span class="detail-label">Čas</span><span class="detail-value">${comp.time || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Místo</span><span class="detail-value">${escHtml(comp.location)}</span></div>
            <div class="detail-row"><span class="detail-label">Závodníci</span><span class="detail-value">${regCount} / ${comp.maxParticipants}</span></div>
            <div class="detail-row"><span class="detail-label">Úlovky</span><span class="detail-value">${totalCatch}</span></div>
            <div class="detail-row"><span class="detail-label">Limit v ceně</span><span class="detail-value">${comp.catchLimit} úlovků</span></div>
            <div class="detail-row"><span class="detail-label">Stav</span><span class="detail-value"><span class="badge ${status.class}">${status.label}</span></span></div>
            ${comp.ponds.length ? `<div class="detail-row"><span class="detail-label">Rybníky</span><span class="detail-value"><div class="pond-tags">${comp.ponds.map(p=>`<span class="pond-tag">🏞️ ${escHtml(p)}</span>`).join('')}</div></span></div>` : ''}
            ${comp.description ? `<div class="detail-row"><span class="detail-label">Popis</span><span class="detail-value">${escHtml(comp.description)}</span></div>` : ''}
            <div class="detail-actions">
                <button class="btn btn-secondary" onclick="window._editCompetition('${comp.id}')">✏️ Upravit</button>
                <button class="btn btn-primary" onclick="window._showRegQr('${comp.id}')">📱 QR registrace</button>
                <button class="btn btn-primary" onclick="window._showPondQRs('${comp.id}')">📍 QR check-in</button>
                <button class="btn btn-danger" onclick="window._deleteCompetition('${comp.id}')">🗑️ Smazat</button>
            </div>`;
        openModal(modalDetail);
    }

    window._editCompetition = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);
        editingCompId = id;
        $('#modal-competition-title').textContent = 'Upravit závod';
        $('#comp-name').value     = comp.name;
        $('#comp-date').value     = comp.date;
        $('#comp-time').value     = comp.time;
        $('#comp-location').value = comp.location;
        $('#comp-max').value      = comp.maxParticipants;
        $('#comp-ponds').value    = comp.ponds.join(', ');
        $('#comp-catch-limit').value = comp.catchLimit;
        $('#comp-desc').value     = comp.description || '';
        setTimeout(() => openModal(modalCompetition), 200);
    };

    window._deleteCompetition = function (id) {
        if (!confirm('Smazat závod včetně všech registrací a úlovků?')) return;
        dbRemove('competitions', id);
        dbRemoveWhere('participants', p => p.competitionId === id);
        dbRemoveWhere('checkins',    c => c.competitionId === id);
        dbRemoveWhere('catches',     c => c.competitionId === id);
        if (!fbReady) {
            competitions  = competitions.filter(c => c.id !== id);
            participants  = participants.filter(p => p.competitionId !== id);
            checkins      = checkins.filter(c => c.competitionId !== id);
            catches       = catches.filter(c => c.competitionId !== id);
        }
        closeModal(modalDetail);
        renderCompetitions();
        showToast('Závod smazán');
    };

    window._showRegQr = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);
        const status = getCompetitionStatus(comp);
        if (status.class === 'badge-full')  { showToast('Závod je plný', 'warning'); return; }
        if (status.class === 'badge-past')  { showToast('Závod již proběhl', 'warning'); return; }
        if (!fbReady) {
            showToast('Pro sdílení QR registrace je nutná Firebase – viz ⚙️ nastavení', 'warning');
        }
        const url = getBaseUrl() + '?action=register&comp=' + id;
        const regCount = participants.filter(p => p.competitionId === id).length;

        $('#modal-qr-title').textContent = 'QR – Registrace';
        const body = $('#qr-body');
        body.innerHTML = '';
        const info = document.createElement('div');
        info.style.cssText = 'text-align:center;margin-bottom:1rem;';
        info.innerHTML = `<p style="font-weight:700;font-size:1.05rem;">${escHtml(comp.name)}</p>
            <p style="color:var(--text-secondary);font-size:0.85rem;">📅 ${formatDate(comp.date)} · 👥 ${regCount}/${comp.maxParticipants} míst</p>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.4rem;">Závodník naskenuje a vyplní formulář.</p>`;
        body.appendChild(info);
        const qrDiv = document.createElement('div');
        qrDiv.style.cssText = 'display:flex;justify-content:center;margin:0 auto;';
        body.appendChild(qrDiv);
        const urlDiv = document.createElement('div'); urlDiv.className = 'qr-url'; urlDiv.textContent = url;
        body.appendChild(urlDiv);
        openModal(modalQr);
        setTimeout(() => makeQr(qrDiv, url, 280), 50);
    };

    window._showPondQRs = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);
        if (!comp.ponds.length) { showToast('Závod nemá rybníky', 'warning'); return; }

        const body = $('#qr-body');
        $('#modal-qr-title').textContent = 'QR kódy – Check-in';
        body.innerHTML = `<p style="margin-bottom:1rem;color:var(--text-secondary);font-size:0.9rem;">
            Vytiskněte a umístěte ke každému rybníku.</p>`;

        comp.ponds.forEach((pond, i) => {
            const url = getBaseUrl() + '?action=checkin&comp=' + comp.id + '&pond=' + encodeURIComponent(pond);
            const container = document.createElement('div');
            container.style.cssText = 'margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border-light);';
            const h = document.createElement('h4'); h.style.marginBottom = '0.5rem'; h.textContent = '🏞️ ' + pond; container.appendChild(h);
            const qDiv = document.createElement('div'); qDiv.id = 'qr-pond-' + i; qDiv.style.cssText = 'display:flex;justify-content:center;margin:0 auto;'; container.appendChild(qDiv);
            const uDiv = document.createElement('div'); uDiv.className = 'qr-url'; uDiv.textContent = url; container.appendChild(uDiv);
            body.appendChild(container);
            setTimeout(() => makeQr(qDiv, url, 220), 50);
        });
        openModal(modalQr);
    };

    // ════════════════════════════════════════
    // ── REGISTRACE ──
    // ════════════════════════════════════════

    function renderRegistrationView() {
        const openComps = competitions.filter(c => getCompetitionStatus(c).class === 'badge-open');
        const noComp = $('#no-competition-for-reg');
        const form   = $('#registration-form');
        if (openComps.length === 0) {
            noComp.style.display = 'block'; form.style.display = 'none'; return;
        }
        noComp.style.display = 'none'; form.style.display = 'block';
        const sel = $('#reg-competition');
        const cur = sel.value;
        sel.innerHTML = openComps.map(c => `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`).join('');
        if (openComps.find(c => c.id === cur)) sel.value = cur;
    }

    $('#registration-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const compId = $('#reg-competition').value;
        const name   = $('#reg-name').value.trim();
        if (!compId || !name) return;

        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        if (participants.filter(p => p.competitionId === compId).length >= comp.maxParticipants) {
            showToast('Závod je plný!', 'danger'); return;
        }
        if (participants.find(p => p.competitionId === compId && p.name.toLowerCase() === name.toLowerCase())) {
            showToast('Závodník s tímto jménem je již registrován!', 'warning'); return;
        }

        const id = genId();
        const participant = {
            id, competitionId: compId, name,
            club:     $('#reg-club').value.trim(),
            phone:    $('#reg-phone').value.trim(),
            email:    $('#reg-email').value.trim(),
            category: $('#reg-category').value,
            note:     $('#reg-note').value.trim(),
            registeredAt: new Date().toISOString()
        };

        dbSet('participants', id, participant);
        if (!fbReady) { participants.push(participant); }
        $('#registration-form').reset();
        $('#reg-competition').value = compId;
        renderCompetitions();
        showToast(`${participant.name} zaregistrován!`);
    });

    // ════════════════════════════════════════
    // ── CHECK-IN ──
    // ════════════════════════════════════════

    function renderCheckinView() {
        const container = $('#checkin-content');
        const compsWithPonds = competitions.filter(c => c.ponds && c.ponds.length);
        if (!compsWithPonds.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">📍</span>
                <p>Žádný závod nemá rybníky.</p><p class="hint">Přidejte rybníky v nastavení závodu.</p></div>`;
            return;
        }
        container.innerHTML = compsWithPonds.map(comp => {
            const compParts = participants.filter(p => p.competitionId === comp.id);
            return `<div class="action-card">
                <h3>🏆 ${escHtml(comp.name)}</h3>
                <div class="form-group"><label>Závodník</label>
                    <select id="checkin-participant-${comp.id}">
                        ${compParts.length
                            ? compParts.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')
                            : '<option value="">— žádní registrovaní —</option>'}
                    </select>
                </div>
                <div class="pond-checkin-list">
                    ${comp.ponds.map(pond => {
                        const cnt = checkins.filter(ci => ci.competitionId === comp.id && ci.pond === pond).length;
                        return `<div class="pond-checkin-item">
                            <div><div class="pond-name">🏞️ ${escHtml(pond)}</div>
                            <div class="pond-count">${cnt} přihlášených</div></div>
                            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                                <button class="btn btn-primary btn-sm" onclick="window._doCheckin('${comp.id}','${escHtml(pond)}')">✓ Check-in</button>
                                <button class="btn btn-secondary btn-sm" onclick="window._showPondQrSingle('${comp.id}','${escHtml(pond)}')">QR</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    }

    window._doCheckin = function (compId, pond) {
        const sel = $(`#checkin-participant-${compId}`);
        if (!sel?.value) { showToast('Vyberte závodníka', 'warning'); return; }
        const pid = sel.value;
        const p   = participants.find(x => x.id === pid);
        if (checkins.find(ci => ci.competitionId === compId && ci.participantId === pid && ci.pond === pond)) {
            showToast(`${p?.name} je již přihlášen na tomto rybníku`, 'warning'); return;
        }
        const id = genId();
        const ci = { id, competitionId: compId, participantId: pid, pond, time: new Date().toISOString() };
        dbSet('checkins', id, ci);
        if (!fbReady) { checkins.push(ci); renderCheckinView(); }
        showToast(`${p?.name || 'Závodník'} přihlášen – ${pond}`);
    };

    window._showPondQrSingle = function (compId, pond) {
        const comp = competitions.find(c => c.id === compId);
        const url  = getBaseUrl() + '?action=checkin&comp=' + compId + '&pond=' + encodeURIComponent(pond);
        showQrCode('Check-in QR', url, `${comp?.name || ''} – ${pond}`);
    };

    function performCheckinFromUrl(compId, pond) {
        const comp = competitions.find(c => c.id === compId);
        if (!comp) { showToast('Závod nenalezen', 'danger'); return; }
        const compParts = participants.filter(p => p.competitionId === compId);
        if (!compParts.length) { showToast('Žádní registrovaní závodníci', 'warning'); return; }

        const container = $('#checkin-content');
        container.innerHTML = `<div class="action-card">
            <h3>📍 Check-in: ${escHtml(pond)}</h3>
            <p style="color:var(--text-secondary);margin-bottom:1rem;">${escHtml(comp.name)}</p>
            <div class="form-group"><label>Vyberte své jméno</label>
                <select id="url-checkin-sel">
                    ${compParts.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary btn-full" id="url-checkin-btn">✓ Přihlásit se na ${escHtml(pond)}</button>
        </div>`;

        $('#url-checkin-btn').addEventListener('click', () => {
            const pid = $('#url-checkin-sel').value;
            if (!pid) return;
            const p = participants.find(x => x.id === pid);
            if (checkins.find(ci => ci.competitionId === compId && ci.participantId === pid && ci.pond === pond)) {
                showToast('Již přihlášen na tomto rybníku', 'warning'); return;
            }
            const id = genId();
            const ci = { id, competitionId: compId, participantId: pid, pond, time: new Date().toISOString() };
            dbSet('checkins', id, ci);
            if (!fbReady) { checkins.push(ci); }
            showToast(`${p?.name || 'Závodník'} přihlášen – ${pond}`);
            window.history.replaceState({}, '', getBaseUrl());
            setTimeout(() => renderCheckinView(), 500);
        });
    }

    // ════════════════════════════════════════
    // ── ÚLOVKY ──
    // ════════════════════════════════════════

    function renderCatchesView() {
        const container = $('#catches-content');
        const compsWithParts = competitions.filter(c => participants.some(p => p.competitionId === c.id));
        if (!compsWithParts.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">🐟</span><p>Nejdříve zaregistrujte závodníky.</p></div>`;
            return;
        }
        container.innerHTML = compsWithParts.map(comp => {
            const compParts = participants.filter(p => p.competitionId === comp.id);
            return `<div class="action-card">
                <h3>🏆 ${escHtml(comp.name)}</h3>
                <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;">V ceně: ${comp.catchLimit} úlovků · Poté příplatek</p>
                <div class="form-group"><label>Závodník</label>
                    <select id="catch-participant-${comp.id}" onchange="window._showParticipantCatches('${comp.id}')">
                        ${compParts.map(p => {
                            const cnt = getParticipantCatchCount(comp.id, p.id);
                            return `<option value="${p.id}">${escHtml(p.name)} (${cnt}🐟${cnt >= comp.catchLimit ? ' ⚠️' : ''})</option>`;
                        }).join('')}
                    </select>
                </div>
                <div id="catch-details-${comp.id}"></div>
                <button class="btn btn-primary btn-full" style="margin-top:0.75rem;" onclick="window._addCatch('${comp.id}')">🐟 Nahlásit úlovek</button>
                <button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" onclick="window._showCatchQr('${comp.id}')">📱 QR pro úlovek</button>
            </div>`;
        }).join('');
        compsWithParts.forEach(comp => window._showParticipantCatches(comp.id));
    }

    window._showParticipantCatches = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel) return;
        const pid   = sel.value;
        const comp  = competitions.find(c => c.id === compId);
        const det   = $(`#catch-details-${compId}`);
        if (!det || !comp) return;
        const pCatches = catches.filter(c => c.competitionId === compId && c.participantId === pid);
        const cnt    = pCatches.length;
        const isOver = cnt >= comp.catchLimit;
        det.innerHTML = `
            <div class="catch-counter">
                <div>
                    <div class="catch-count-display ${isOver ? 'over-limit' : ''}">${cnt}</div>
                    <div class="catch-limit-label">z ${comp.catchLimit} v ceně</div>
                </div>
            </div>
            ${isOver ? `<div style="text-align:center;color:var(--danger);font-weight:600;margin-bottom:0.5rem;">⚠️ Nad limit – nutný příplatek!</div>` : ''}
            ${pCatches.map((c, i) => `
                <div class="catch-item">
                    <span class="catch-number ${i >= comp.catchLimit ? 'over-limit' : ''}">${i+1}</span>
                    <div class="catch-info"><div class="catch-time">${formatTime(c.time)}${c.pond ? ' · '+escHtml(c.pond) : ''}</div></div>
                    <button class="btn btn-danger btn-sm" onclick="window._removeCatch('${c.id}','${compId}')">✕</button>
                </div>`).join('')}`;
    };

    window._addCatch = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel?.value) { showToast('Vyberte závodníka', 'warning'); return; }
        const pid  = sel.value;
        const comp = competitions.find(c => c.id === compId);
        const p    = participants.find(x => x.id === pid);
        if (!comp || !p) return;
        const currentCount = getParticipantCatchCount(compId, pid);
        const id = genId();
        const catchData = { id, competitionId: compId, participantId: pid, pond: '', time: new Date().toISOString() };
        dbSet('catches', id, catchData);
        if (!fbReady) { catches.push(catchData); }
        const newCount = currentCount + 1;
        if (newCount > comp.catchLimit) {
            $('#payment-message').innerHTML = `<strong>${escHtml(p.name)}</strong> má <strong>${newCount}. úlovek</strong>.<br>
                Limit v ceně je <strong>${comp.catchLimit}</strong>.<br><br>Závodník musí <strong>zaplatit příplatek</strong>!`;
            openModal(modalPayment);
        } else if (newCount === comp.catchLimit) {
            showToast(`${p.name}: ${newCount}. úlovek – poslední v ceně!`, 'warning');
        } else {
            showToast(`${p.name}: ${newCount}. úlovek`);
        }
        if (!fbReady) { renderCatchesView(); renderCompetitions(); }
    };

    window._removeCatch = function (catchId, compId) {
        if (!confirm('Odebrat úlovek?')) return;
        dbRemove('catches', catchId);
        if (!fbReady) {
            catches = catches.filter(c => c.id !== catchId);
            renderCatchesView(); renderCompetitions();
        }
        showToast('Úlovek odebrán');
    };

    window._showCatchQr = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel?.value) { showToast('Vyberte závodníka', 'warning'); return; }
        const comp = competitions.find(c => c.id === compId);
        const p    = participants.find(x => x.id === sel.value);
        const url  = getBaseUrl() + '?action=catch&comp=' + compId + '&pid=' + sel.value;
        showQrCode('QR – Nahlášení úlovku', url, `${comp?.name || ''} – ${p?.name || ''}`);
    };

    function performCatchFromUrl(compId, pid) {
        const comp = competitions.find(c => c.id === compId);
        const p    = participants.find(x => x.id === pid);
        if (!comp || !p) { showToast('Závodník nebo závod nenalezen', 'danger'); return; }
        const container = $('#catches-content');
        const currentCount = getParticipantCatchCount(compId, pid);
        container.innerHTML = `<div class="action-card" style="text-align:center;">
            <h3>🐟 Nahlásit úlovek</h3>
            <p style="color:var(--text-secondary);margin:0.5rem 0;">${escHtml(comp.name)}</p>
            <p style="font-size:1.2rem;font-weight:700;margin:0.75rem 0;">${escHtml(p.name)}</p>
            <div class="catch-counter"><div>
                <div class="catch-count-display ${currentCount >= comp.catchLimit ? 'over-limit' : ''}">${currentCount}</div>
                <div class="catch-limit-label">aktuálně úlovků</div>
            </div></div>
            <button class="btn btn-primary btn-full" id="url-catch-btn">🐟 Zaznamenat úlovek</button>
        </div>`;
        $('#url-catch-btn').addEventListener('click', () => {
            const newCount = currentCount + 1;
            const id = genId();
            const catchData = { id, competitionId: compId, participantId: pid, pond: '', time: new Date().toISOString() };
            dbSet('catches', id, catchData);
            if (!fbReady) { catches.push(catchData); }
            if (newCount > comp.catchLimit) {
                $('#payment-message').innerHTML = `<strong>${escHtml(p.name)}</strong> má <strong>${newCount}. úlovek</strong>.<br>
                    Limit v ceně je <strong>${comp.catchLimit}</strong>.<br><br>Závodník musí <strong>zaplatit příplatek</strong>!`;
                openModal(modalPayment);
            } else {
                showToast(`Úlovek č. ${newCount} zaznamenán!`);
            }
            window.history.replaceState({}, '', getBaseUrl());
            setTimeout(() => renderCatchesView(), 500);
        });
    }

    // ════════════════════════════════════════
    // ── PŘEHLED / VÝSLEDKY ──
    // ════════════════════════════════════════

    function renderResultsView() {
        const controls = $('#results-controls');
        const noP      = $('#no-participants');
        const actions  = $('#results-actions');
        const comps    = competitions.filter(c => participants.some(p => p.competitionId === c.id));

        if (!comps.length) {
            controls.style.display = 'none'; actions.style.display = 'none';
            noP.style.display = 'block'; $('#participants-list').innerHTML = ''; return;
        }
        controls.style.display = 'block'; noP.style.display = 'none';

        const sel = $('#results-competition');
        const cur = sel.value;
        sel.innerHTML = comps.map(c => `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`).join('');
        if (comps.find(c => c.id === cur)) sel.value = cur;
        sel.onchange = () => renderParticipants(sel.value);
        renderParticipants(sel.value);
    }

    function renderParticipants(compId) {
        const list    = $('#participants-list');
        const actions = $('#results-actions');
        const comp    = competitions.find(c => c.id === compId);
        const filtered = participants.filter(p => p.competitionId === compId);

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state"><p>Žádní závodníci.</p></div>';
            actions.style.display = 'none'; $('#results-stats').innerHTML = ''; return;
        }
        actions.style.display = 'flex';

        const totalCatches  = catches.filter(c => c.competitionId === compId).length;
        const checkedInSet  = new Set(checkins.filter(ci => ci.competitionId === compId).map(ci => ci.participantId));
        const overLimit     = filtered.filter(p => getParticipantCatchCount(compId, p.id) > (comp?.catchLimit || 2)).length;

        $('#results-stats').innerHTML = `
            <div class="stat-card"><div class="stat-value">${filtered.length}</div><div class="stat-label">Závodníků</div></div>
            <div class="stat-card"><div class="stat-value">${checkedInSet.size}</div><div class="stat-label">Přihlášeno</div></div>
            <div class="stat-card"><div class="stat-value">${totalCatches}</div><div class="stat-label">Úlovků</div></div>
            ${overLimit ? `<div class="stat-card" style="border-color:var(--danger);">
                <div class="stat-value" style="color:var(--danger);">${overLimit}</div>
                <div class="stat-label">Příplatek</div></div>` : ''}`;

        const isMobile = window.innerWidth < 600;
        if (isMobile) {
            list.innerHTML = filtered.map((p, i) => {
                const cnt    = getParticipantCatchCount(compId, p.id);
                const isOver = cnt > (comp?.catchLimit || 2);
                const isCI   = checkedInSet.has(p.id);
                return `<div class="participant-card-mobile">
                    <div class="pcm-name">${i+1}. ${escHtml(p.name)} ${isCI ? '<span class="checkin-status checkin-done">✓</span>' : ''}</div>
                    <div class="pcm-meta">${p.club ? escHtml(p.club)+' · ' : ''}<span class="category-label">${getCategoryLabel(p.category)}</span></div>
                    <div class="pcm-catches" style="${isOver?'color:var(--danger)':''}">🐟 ${cnt} úlovků ${isOver?'⚠️ PŘÍPLATEK':''}</div>
                    <div class="pcm-actions"><button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button></div>
                </div>`;
            }).join('');
        } else {
            list.innerHTML = `<table class="participants-table">
                <thead><tr><th>#</th><th>Jméno</th><th>Spolek</th><th>Kategorie</th><th>Check-in</th><th>Úlovky</th><th></th></tr></thead>
                <tbody>${filtered.map((p, i) => {
                    const cnt    = getParticipantCatchCount(compId, p.id);
                    const isOver = cnt > (comp?.catchLimit || 2);
                    const isCI   = checkedInSet.has(p.id);
                    return `<tr>
                        <td>${i+1}</td><td><strong>${escHtml(p.name)}</strong></td>
                        <td>${escHtml(p.club||'—')}</td>
                        <td><span class="category-label">${getCategoryLabel(p.category)}</span></td>
                        <td>${isCI ? '<span class="checkin-status checkin-done">✓</span>' : '<span class="checkin-status checkin-pending">—</span>'}</td>
                        <td style="${isOver?'color:var(--danger);font-weight:700':''}">${cnt} ${isOver?'⚠️':''}</td>
                        <td class="actions-cell"><button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button></td>
                    </tr>`;
                }).join('')}</tbody></table>`;
        }
    }

    window._removeParticipant = function (id) {
        const p = participants.find(x => x.id === id);
        if (!p || !confirm(`Odebrat závodníka ${p.name}?`)) return;
        dbRemove('participants', id);
        dbRemoveWhere('checkins', ci => ci.participantId === id);
        dbRemoveWhere('catches',  c  => c.participantId === id);
        if (!fbReady) {
            participants = participants.filter(x => x.id !== id);
            checkins    = checkins.filter(ci => ci.participantId !== id);
            catches     = catches.filter(c  => c.participantId !== id);
            renderResultsView(); renderCompetitions();
        }
        showToast('Závodník odebrán');
    };

    // ── CSV Export ──
    $('#btn-export-csv').addEventListener('click', () => {
        const compId = $('#results-competition').value;
        const comp   = competitions.find(c => c.id === compId);
        const filtered = participants.filter(p => p.competitionId === compId);
        if (!filtered.length) return;
        const checkedInSet = new Set(checkins.filter(ci => ci.competitionId === compId).map(ci => ci.participantId));
        const headers = ['#','Jméno','Spolek','Kategorie','Telefon','E-mail','Check-in','Úlovky','Nad limit'];
        const rows = filtered.map((p, i) => {
            const cnt = getParticipantCatchCount(compId, p.id);
            return [i+1, p.name, p.club||'', getCategoryLabel(p.category), p.phone||'', p.email||'',
                checkedInSet.has(p.id)?'Ano':'Ne', cnt, cnt>(comp?.catchLimit||2)?'ANO':''];
        });
        const csv = '\uFEFF' + [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href=url; a.download=`${slugify(comp?.name||'zavod')}_ucastnici.csv`; a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exportováno');
    });

    $('#btn-print').addEventListener('click', () => window.print());

    // ── Resize ──
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (currentView==='results') renderResultsView(); }, 250);
    });

    // ════════════════════════════════════════
    // ── INIT ──
    // ════════════════════════════════════════

    // Načtení lokálních dat jako záloha
    competitions = lsLoad(LS.COMPETITIONS);
    participants  = lsLoad(LS.PARTICIPANTS);
    checkins      = lsLoad(LS.CHECKINS);
    catches       = lsLoad(LS.CATCHES);

    // Pokus o Firebase připojení (pokud je uložena konfigurace)
    const savedFbUrl = localStorage.getItem(LS.FB_URL);
    const savedFbKey = localStorage.getItem(LS.FB_KEY);
    if (savedFbUrl && savedFbKey) {
        initFirebase(savedFbUrl, savedFbKey);
    }

    updateSyncBar();
    renderCompetitions();
    handleUrlAction();

})();
