(function () {
    'use strict';

    // ── Storage ──
    const KEYS = {
        COMPETITIONS: 'ryb_competitions',
        PARTICIPANTS: 'ryb_participants',
        CHECKINS: 'ryb_checkins',
        CATCHES: 'ryb_catches',
        BASE_URL: 'ryb_base_url'
    };

    function load(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch { return []; }
    }

    function save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    let competitions = load(KEYS.COMPETITIONS);
    let participants = load(KEYS.PARTICIPANTS);
    let checkins = load(KEYS.CHECKINS);
    let catches = load(KEYS.CATCHES);

    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // ── DOM ──
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const views = {
        competitions: $('#view-competitions'),
        registration: $('#view-registration'),
        checkin: $('#view-checkin'),
        catches: $('#view-catches'),
        results: $('#view-results')
    };

    const navBtns = $$('.nav-btn');
    const modalCompetition = $('#modal-competition');
    const modalDetail = $('#modal-detail');
    const modalQr = $('#modal-qr');
    const modalPayment = $('#modal-payment');

    // ── Navigation ──
    let currentView = 'competitions';

    function switchView(name) {
        currentView = name;
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[name].classList.add('active');
        navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));

        if (name === 'registration') renderRegistrationView();
        if (name === 'checkin') renderCheckinView();
        if (name === 'catches') renderCatchesView();
        if (name === 'results') renderResultsView();
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Handle deep-link from QR codes
    function handleUrlAction() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const compId = params.get('comp');
        const pond = params.get('pond');
        const pid = params.get('pid');

        if (action === 'register' && compId) {
            switchView('registration');
            setTimeout(() => {
                const sel = $('#reg-competition');
                if (sel) { sel.value = compId; }
            }, 300);
        } else if (action === 'checkin' && compId && pond) {
            switchView('checkin');
            setTimeout(() => performCheckinFromUrl(compId, pond), 300);
        } else if (action === 'catch' && compId && pid) {
            switchView('catches');
            setTimeout(() => performCatchFromUrl(compId, pid), 300);
        }
    }

    // ── Toast ──
    let toastTimer;
    function showToast(message, type) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.className = 'toast show' + (type ? ' toast-' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    // ── Modal helpers ──
    function openModal(m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function closeModal(m) { m.classList.remove('open'); document.body.style.overflow = ''; }

    [modalCompetition, modalDetail, modalQr, modalPayment].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
    });

    $('#modal-close-competition').addEventListener('click', () => closeModal(modalCompetition));
    $('#modal-close-detail').addEventListener('click', () => closeModal(modalDetail));
    $('#modal-close-qr').addEventListener('click', () => closeModal(modalQr));
    $('#btn-payment-ok').addEventListener('click', () => closeModal(modalPayment));

    // ── Helpers ──
    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
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

    const GITHUB_PAGES_URL = 'https://pavel-vrtal-ict.github.io/rybari-registrace';

    function getBaseUrl() {
        const saved = localStorage.getItem(KEYS.BASE_URL);
        if (saved && saved.startsWith('http')) {
            return saved.replace(/\/$/, '') + '/index.html';
        }
        if (isLocalFile()) {
            return GITHUB_PAGES_URL + '/index.html';
        }
        return window.location.origin + window.location.pathname;
    }

    function isLocalFile() {
        return window.location.protocol === 'file:';
    }

    function hasValidBaseUrl() {
        return !isLocalFile() || true; // vždy OK, fallback na GitHub Pages
    }

    function parsePonds(str) {
        if (!str) return [];
        return str.split(',').map(s => s.trim()).filter(Boolean);
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

    function getParticipantCatchCount(compId, participantId) {
        return catches.filter(c => c.competitionId === compId && c.participantId === participantId).length;
    }

    // ── QR Generation ──
    function makeQr(container, url, size) {
        if (typeof QRCode === 'undefined') return;
        new QRCode(container, {
            text: url,
            width: size || 280,
            height: size || 280,
            colorDark: '#1a2e1f',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    function showQrCode(title, url, subtitle) {
        $('#modal-qr-title').textContent = title;
        const body = $('#qr-body');
        body.innerHTML = '<div id="qr-canvas"></div>';

        makeQr($('#qr-canvas'), url, 280);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'qr-label';
        labelDiv.textContent = subtitle || '';
        body.appendChild(labelDiv);

        const urlDiv = document.createElement('div');
        urlDiv.className = 'qr-url';
        urlDiv.textContent = url;
        body.appendChild(urlDiv);

        openModal(modalQr);
    }

    // ══════════════════════════════════════
    // ── COMPETITIONS ──
    // ══════════════════════════════════════

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

        const data = {
            id: editingCompId || genId(),
            name: $('#comp-name').value.trim(),
            date: $('#comp-date').value,
            time: $('#comp-time').value,
            location: $('#comp-location').value.trim(),
            maxParticipants: parseInt($('#comp-max').value) || 50,
            ponds: parsePonds($('#comp-ponds').value),
            catchLimit: parseInt($('#comp-catch-limit').value) || 2,
            description: $('#comp-desc').value.trim(),
            createdAt: editingCompId
                ? competitions.find(c => c.id === editingCompId)?.createdAt || new Date().toISOString()
                : new Date().toISOString()
        };

        if (editingCompId) {
            const idx = competitions.findIndex(c => c.id === editingCompId);
            if (idx !== -1) competitions[idx] = data;
        } else {
            competitions.push(data);
        }

        save(KEYS.COMPETITIONS, competitions);
        closeModal(modalCompetition);
        renderCompetitions();
        showToast(editingCompId ? 'Závod upraven' : 'Závod vytvořen');
        editingCompId = null;
    });

    function renderCompetitions() {
        const list = $('#competitions-list');
        const empty = $('#no-competitions');

        if (competitions.length === 0) {
            list.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        list.style.display = 'flex';

        const sorted = [...competitions].sort((a, b) => new Date(a.date) - new Date(b.date));

        list.innerHTML = sorted.map(comp => {
            const status = getCompetitionStatus(comp);
            const regCount = participants.filter(p => p.competitionId === comp.id).length;
            const totalCatches = catches.filter(c => c.competitionId === comp.id).length;
            const canRegister = status.class === 'badge-open';
            return `
                <div class="card" data-id="${comp.id}">
                    <div class="card-title">${escHtml(comp.name)}</div>
                    <div class="card-meta">
                        <span>📅 ${formatDate(comp.date)}</span>
                        <span>⏰ ${comp.time || '—'}</span>
                        <span>📍 ${escHtml(comp.location)}</span>
                    </div>
                    ${comp.ponds.length ? `
                        <div class="pond-tags">
                            ${comp.ponds.map(p => `<span class="pond-tag">🏞️ ${escHtml(p)}</span>`).join('')}
                        </div>
                    ` : ''}
                    <div class="card-footer">
                        <span class="badge ${status.class}">${status.label}</span>
                        <span style="font-size:0.85rem;color:var(--text-secondary)">
                            👥 ${regCount}/${comp.maxParticipants}
                            ${totalCatches ? ` · 🐟 ${totalCatches}` : ''}
                        </span>
                    </div>
                    ${canRegister ? `
                    <div class="card-qr-row">
                        <button class="btn btn-qr-reg" data-qr-id="${comp.id}">
                            📱 QR pro registraci
                        </button>
                    </div>` : ''}
                </div>
            `;
        }).join('');

        list.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-qr-reg')) return;
                openCompetitionDetail(card.dataset.id);
            });
        });

        list.querySelectorAll('.btn-qr-reg').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window._showRegQr(btn.dataset.qrId);
            });
        });
    }

    function openCompetitionDetail(id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;

        const regCount = participants.filter(p => p.competitionId === id).length;
        const status = getCompetitionStatus(comp);
        const totalCatches = catches.filter(c => c.competitionId === id).length;

        const body = $('#competition-detail-body');
        body.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Název</span>
                <span class="detail-value">${escHtml(comp.name)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Datum</span>
                <span class="detail-value">${formatDate(comp.date)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Čas</span>
                <span class="detail-value">${comp.time || '—'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Místo</span>
                <span class="detail-value">${escHtml(comp.location)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Závodníci</span>
                <span class="detail-value">${regCount} / ${comp.maxParticipants}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Úlovky celkem</span>
                <span class="detail-value">${totalCatches}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Limit v ceně</span>
                <span class="detail-value">${comp.catchLimit} úlovků (pak příplatek)</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Stav</span>
                <span class="detail-value"><span class="badge ${status.class}">${status.label}</span></span>
            </div>
            ${comp.ponds.length ? `
            <div class="detail-row">
                <span class="detail-label">Rybníky</span>
                <span class="detail-value">
                    <div class="pond-tags">${comp.ponds.map(p => `<span class="pond-tag">🏞️ ${escHtml(p)}</span>`).join('')}</div>
                </span>
            </div>` : ''}
            ${comp.description ? `
            <div class="detail-row">
                <span class="detail-label">Popis</span>
                <span class="detail-value">${escHtml(comp.description)}</span>
            </div>` : ''}

            <div class="detail-actions">
                <button class="btn btn-secondary" onclick="window._editCompetition('${comp.id}')">✏️ Upravit</button>
                <button class="btn btn-primary" onclick="window._showRegQr('${comp.id}')">📱 QR registrace</button>
                <button class="btn btn-primary" onclick="window._showPondQRs('${comp.id}')">📍 QR check-in</button>
                <button class="btn btn-danger" onclick="window._deleteCompetition('${comp.id}')">🗑️ Smazat</button>
            </div>
        `;

        openModal(modalDetail);
    }

    window._editCompetition = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);
        editingCompId = id;
        $('#modal-competition-title').textContent = 'Upravit závod';
        $('#comp-name').value = comp.name;
        $('#comp-date').value = comp.date;
        $('#comp-time').value = comp.time;
        $('#comp-location').value = comp.location;
        $('#comp-max').value = comp.maxParticipants;
        $('#comp-ponds').value = comp.ponds.join(', ');
        $('#comp-catch-limit').value = comp.catchLimit;
        $('#comp-desc').value = comp.description || '';
        setTimeout(() => openModal(modalCompetition), 200);
    };

    window._deleteCompetition = function (id) {
        if (!confirm('Smazat závod včetně všech registrací, check-inů a úlovků?')) return;
        competitions = competitions.filter(c => c.id !== id);
        participants = participants.filter(p => p.competitionId !== id);
        checkins = checkins.filter(c => c.competitionId !== id);
        catches = catches.filter(c => c.competitionId !== id);
        save(KEYS.COMPETITIONS, competitions);
        save(KEYS.PARTICIPANTS, participants);
        save(KEYS.CHECKINS, checkins);
        save(KEYS.CATCHES, catches);
        closeModal(modalDetail);
        renderCompetitions();
        showToast('Závod smazán');
    };

    window._showRegQr = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);

        const status = getCompetitionStatus(comp);
        if (status.class === 'badge-full') {
            showToast('Závod je plný – registrace uzavřena', 'warning');
            return;
        }
        if (status.class === 'badge-past') {
            showToast('Závod již proběhl', 'warning');
            return;
        }

        const url = getBaseUrl() + '?action=register&comp=' + id;
        const regCount = participants.filter(p => p.competitionId === id).length;

        $('#modal-qr-title').textContent = 'QR – Registrace na závod';
        const body = $('#qr-body');
        body.innerHTML = '';

        const info = document.createElement('div');
        info.style.cssText = 'text-align:center;margin-bottom:1rem;';
        info.innerHTML = `
            <p style="font-weight:700;font-size:1.05rem;">${escHtml(comp.name)}</p>
            <p style="color:var(--text-secondary);font-size:0.85rem;">
                📅 ${formatDate(comp.date)} · 👥 ${regCount}/${comp.maxParticipants} míst
            </p>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.4rem;">
                Závodník naskenuje a vyplní registrační formulář.
            </p>
        `;
        body.appendChild(info);

        const qrDiv = document.createElement('div');
        qrDiv.id = 'qr-reg-canvas';
        qrDiv.style.cssText = 'display:flex;justify-content:center;margin:0 auto;';
        body.appendChild(qrDiv);

        const urlDiv = document.createElement('div');
        urlDiv.className = 'qr-url';
        urlDiv.textContent = url;
        body.appendChild(urlDiv);

        openModal(modalQr);
        setTimeout(() => makeQr(qrDiv, url, 280), 50);
    };

    // _showPondQRs je definována níže (s kontrolou lokálního provozu)

    // ══════════════════════════════════════
    // ── REGISTRATION ──
    // ══════════════════════════════════════

    function renderRegistrationView() {
        const openComps = competitions.filter(c => getCompetitionStatus(c).class === 'badge-open');
        const noComp = $('#no-competition-for-reg');
        const form = $('#registration-form');

        if (openComps.length === 0) {
            noComp.style.display = 'block';
            form.style.display = 'none';
            return;
        }

        noComp.style.display = 'none';
        form.style.display = 'block';

        const sel = $('#reg-competition');
        const cur = sel.value;
        sel.innerHTML = openComps.map(c =>
            `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`
        ).join('');
        if (openComps.find(c => c.id === cur)) sel.value = cur;
    }

    $('#registration-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const compId = $('#reg-competition').value;
        const name = $('#reg-name').value.trim();
        if (!compId || !name) return;

        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        if (participants.filter(p => p.competitionId === compId).length >= comp.maxParticipants) {
            showToast('Závod je již plný!', 'danger');
            return;
        }

        if (participants.find(p => p.competitionId === compId && p.name.toLowerCase() === name.toLowerCase())) {
            showToast('Závodník s tímto jménem je již registrován!', 'warning');
            return;
        }

        const participant = {
            id: genId(),
            competitionId: compId,
            name,
            club: $('#reg-club').value.trim(),
            phone: $('#reg-phone').value.trim(),
            email: $('#reg-email').value.trim(),
            category: $('#reg-category').value,
            note: $('#reg-note').value.trim(),
            registeredAt: new Date().toISOString()
        };

        participants.push(participant);
        save(KEYS.PARTICIPANTS, participants);
        $('#registration-form').reset();
        $('#reg-competition').value = compId;
        renderCompetitions();
        showToast(`${participant.name} zaregistrován!`);
    });

    // ══════════════════════════════════════
    // ── CHECK-IN ──
    // ══════════════════════════════════════

    function renderCheckinView() {
        const container = $('#checkin-content');
        const compsWithPonds = competitions.filter(c => c.ponds && c.ponds.length > 0);

        if (compsWithPonds.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <span class="empty-icon">📍</span>
                <p>Žádný závod nemá definované rybníky.</p>
                <p class="hint">Přidejte rybníky v nastavení závodu.</p>
            </div>`;
            return;
        }

        container.innerHTML = compsWithPonds.map(comp => {
            const compParticipants = participants.filter(p => p.competitionId === comp.id);

            return `
                <div class="action-card">
                    <h3>🏆 ${escHtml(comp.name)}</h3>
                    <div class="form-group">
                        <label>Závodník</label>
                        <select id="checkin-participant-${comp.id}">
                            ${compParticipants.length === 0
                                ? '<option value="">— žádní registrovaní —</option>'
                                : compParticipants.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')
                            }
                        </select>
                    </div>
                    <div class="pond-checkin-list">
                        ${comp.ponds.map(pond => {
                            const checkedIn = checkins.filter(ci => ci.competitionId === comp.id && ci.pond === pond);
                            return `
                                <div class="pond-checkin-item">
                                    <div>
                                        <div class="pond-name">🏞️ ${escHtml(pond)}</div>
                                        <div class="pond-count">${checkedIn.length} přihlášených</div>
                                    </div>
                                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                                        <button class="btn btn-primary btn-sm"
                                            onclick="window._doCheckin('${comp.id}','${escHtml(pond)}')">
                                            ✓ Check-in
                                        </button>
                                        <button class="btn btn-secondary btn-sm"
                                            onclick="window._showPondQr('${comp.id}','${escHtml(pond)}')">
                                            QR
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    window._doCheckin = function (compId, pond) {
        const sel = $(`#checkin-participant-${compId}`);
        if (!sel || !sel.value) {
            showToast('Vyberte závodníka', 'warning');
            return;
        }

        const participantId = sel.value;
        const p = participants.find(x => x.id === participantId);

        const already = checkins.find(ci =>
            ci.competitionId === compId && ci.participantId === participantId && ci.pond === pond
        );
        if (already) {
            showToast(`${p?.name || 'Závodník'} je již přihlášen na tomto rybníku`, 'warning');
            return;
        }

        checkins.push({
            id: genId(),
            competitionId: compId,
            participantId,
            pond,
            time: new Date().toISOString()
        });
        save(KEYS.CHECKINS, checkins);
        renderCheckinView();
        showToast(`${p?.name || 'Závodník'} přihlášen – ${pond}`);
    };

    window._showPondQr = function (compId, pond) {
        const comp = competitions.find(c => c.id === compId);
        const url = getBaseUrl() + '?action=checkin&comp=' + compId + '&pond=' + encodeURIComponent(pond);
        showQrCode('Check-in QR', url, `${comp?.name || ''} – ${pond}`);
    };

    function performCheckinFromUrl(compId, pond) {
        const comp = competitions.find(c => c.id === compId);
        if (!comp) { showToast('Závod nenalezen', 'danger'); return; }

        const compParticipants = participants.filter(p => p.competitionId === compId);
        if (compParticipants.length === 0) {
            showToast('Žádní registrovaní závodníci', 'warning');
            return;
        }

        const container = $('#checkin-content');
        container.innerHTML = `
            <div class="action-card">
                <h3>📍 Check-in: ${escHtml(pond)}</h3>
                <p style="color:var(--text-secondary);margin-bottom:1rem;">${escHtml(comp.name)}</p>
                <div class="form-group">
                    <label>Vyberte své jméno</label>
                    <select id="url-checkin-participant">
                        ${compParticipants.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-primary btn-full" id="url-checkin-btn">✓ Přihlásit se na ${escHtml(pond)}</button>
            </div>
        `;

        $('#url-checkin-btn').addEventListener('click', () => {
            const pid = $('#url-checkin-participant').value;
            if (!pid) return;
            window._doCheckin(compId, pond);
            // Override: use the url-selected participant
            const already = checkins.find(ci =>
                ci.competitionId === compId && ci.participantId === pid && ci.pond === pond
            );
            if (!already) {
                const p = participants.find(x => x.id === pid);
                checkins.push({
                    id: genId(),
                    competitionId: compId,
                    participantId: pid,
                    pond,
                    time: new Date().toISOString()
                });
                save(KEYS.CHECKINS, checkins);
                showToast(`${p?.name || 'Závodník'} přihlášen – ${pond}`);
            }
            window.history.replaceState({}, '', getBaseUrl());
            setTimeout(() => renderCheckinView(), 500);
        });
    }

    // ══════════════════════════════════════
    // ── CATCHES (ÚLOVKY) ──
    // ══════════════════════════════════════

    function renderCatchesView() {
        const container = $('#catches-content');

        if (competitions.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <span class="empty-icon">🐟</span>
                <p>Nejdříve vytvořte závod.</p>
            </div>`;
            return;
        }

        const compsWithParticipants = competitions.filter(c =>
            participants.some(p => p.competitionId === c.id)
        );

        if (compsWithParticipants.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <span class="empty-icon">🐟</span>
                <p>Nejdříve zaregistrujte závodníky.</p>
            </div>`;
            return;
        }

        container.innerHTML = compsWithParticipants.map(comp => {
            const compParticipants = participants.filter(p => p.competitionId === comp.id);

            return `
                <div class="action-card">
                    <h3>🏆 ${escHtml(comp.name)}</h3>
                    <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;">
                        V ceně: ${comp.catchLimit} úlovků · Poté příplatek
                    </p>
                    <div class="form-group">
                        <label>Závodník</label>
                        <select id="catch-participant-${comp.id}" onchange="window._showParticipantCatches('${comp.id}')">
                            ${compParticipants.map(p => {
                                const cnt = getParticipantCatchCount(comp.id, p.id);
                                const overLimit = cnt >= comp.catchLimit;
                                return `<option value="${p.id}">${escHtml(p.name)} (${cnt} úlovků${overLimit ? ' ⚠️' : ''})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div id="catch-details-${comp.id}"></div>
                    <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
                        <button class="btn btn-primary btn-full" onclick="window._addCatch('${comp.id}')">
                            🐟 Nahlásit úlovek
                        </button>
                    </div>
                    <div style="margin-top:0.75rem;">
                        <button class="btn btn-secondary btn-sm" onclick="window._showCatchQr('${comp.id}')">
                            📱 QR pro nahlášení úlovku
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        compsWithParticipants.forEach(comp => {
            window._showParticipantCatches(comp.id);
        });
    }

    window._showParticipantCatches = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel) return;
        const pid = sel.value;
        const comp = competitions.find(c => c.id === compId);
        const details = $(`#catch-details-${compId}`);
        if (!details || !comp) return;

        const pCatches = catches.filter(c => c.competitionId === compId && c.participantId === pid);
        const count = pCatches.length;
        const isOver = count >= comp.catchLimit;

        details.innerHTML = `
            <div class="catch-counter">
                <div>
                    <div class="catch-count-display ${isOver ? 'over-limit' : ''}">${count}</div>
                    <div class="catch-limit-label">z ${comp.catchLimit} v ceně</div>
                </div>
            </div>
            ${isOver ? `<div style="text-align:center;color:var(--danger);font-weight:600;margin-bottom:0.5rem;">
                ⚠️ Nad limit – nutný příplatek!
            </div>` : ''}
            ${pCatches.length > 0 ? `
                <div style="margin-top:0.5rem;">
                    ${pCatches.map((c, i) => `
                        <div class="catch-item">
                            <span class="catch-number ${i >= comp.catchLimit ? 'over-limit' : ''}">${i + 1}</span>
                            <div class="catch-info">
                                <div class="catch-time">${formatTime(c.time)}${c.pond ? ' · ' + escHtml(c.pond) : ''}</div>
                            </div>
                            <button class="btn btn-danger btn-sm" onclick="window._removeCatch('${c.id}','${compId}')">✕</button>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    };

    window._addCatch = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel || !sel.value) { showToast('Vyberte závodníka', 'warning'); return; }

        const pid = sel.value;
        const comp = competitions.find(c => c.id === compId);
        const p = participants.find(x => x.id === pid);
        if (!comp || !p) return;

        const currentCount = getParticipantCatchCount(compId, pid);

        catches.push({
            id: genId(),
            competitionId: compId,
            participantId: pid,
            pond: '',
            time: new Date().toISOString()
        });
        save(KEYS.CATCHES, catches);

        const newCount = currentCount + 1;

        if (newCount > comp.catchLimit) {
            $('#payment-message').innerHTML = `
                <strong>${escHtml(p.name)}</strong> má <strong>${newCount}. úlovek</strong>.<br>
                Limit v ceně je <strong>${comp.catchLimit}</strong>.<br><br>
                Závodník musí <strong>zaplatit příplatek</strong>!
            `;
            openModal(modalPayment);
        } else if (newCount === comp.catchLimit) {
            showToast(`${p.name}: ${newCount}. úlovek – poslední v ceně!`, 'warning');
        } else {
            showToast(`${p.name}: ${newCount}. úlovek zaznamenán`);
        }

        renderCatchesView();
        renderCompetitions();
    };

    window._removeCatch = function (catchId, compId) {
        if (!confirm('Odebrat tento úlovek?')) return;
        catches = catches.filter(c => c.id !== catchId);
        save(KEYS.CATCHES, catches);
        renderCatchesView();
        renderCompetitions();
        showToast('Úlovek odebrán');
    };

    // _showCatchQr je definována níže (s kontrolou lokálního provozu)

    function performCatchFromUrl(compId, pid) {
        const comp = competitions.find(c => c.id === compId);
        const p = participants.find(x => x.id === pid);
        if (!comp || !p) { showToast('Závodník nebo závod nenalezen', 'danger'); return; }

        const container = $('#catches-content');
        const currentCount = getParticipantCatchCount(compId, pid);

        container.innerHTML = `
            <div class="action-card" style="text-align:center;">
                <h3>🐟 Nahlásit úlovek</h3>
                <p style="color:var(--text-secondary);margin:0.5rem 0;">${escHtml(comp.name)}</p>
                <p style="font-size:1.2rem;font-weight:700;margin:0.75rem 0;">${escHtml(p.name)}</p>
                <div class="catch-counter">
                    <div>
                        <div class="catch-count-display ${currentCount >= comp.catchLimit ? 'over-limit' : ''}">${currentCount}</div>
                        <div class="catch-limit-label">aktuálně úlovků</div>
                    </div>
                </div>
                <button class="btn btn-primary btn-full" id="url-catch-btn">🐟 Zaznamenat úlovek</button>
            </div>
        `;

        $('#url-catch-btn').addEventListener('click', () => {
            const newCount = currentCount + 1;
            catches.push({
                id: genId(),
                competitionId: compId,
                participantId: pid,
                pond: '',
                time: new Date().toISOString()
            });
            save(KEYS.CATCHES, catches);

            if (newCount > comp.catchLimit) {
                $('#payment-message').innerHTML = `
                    <strong>${escHtml(p.name)}</strong> má <strong>${newCount}. úlovek</strong>.<br>
                    Limit v ceně je <strong>${comp.catchLimit}</strong>.<br><br>
                    Závodník musí <strong>zaplatit příplatek</strong>!
                `;
                openModal(modalPayment);
            } else {
                showToast(`Úlovek č. ${newCount} zaznamenán!`);
            }

            window.history.replaceState({}, '', getBaseUrl());
            setTimeout(() => renderCatchesView(), 500);
        });
    }

    // ══════════════════════════════════════
    // ── RESULTS / PŘEHLED ──
    // ══════════════════════════════════════

    function renderResultsView() {
        const controls = $('#results-controls');
        const noP = $('#no-participants');
        const actions = $('#results-actions');

        if (competitions.length === 0 || participants.length === 0) {
            controls.style.display = 'none';
            actions.style.display = 'none';
            noP.style.display = 'block';
            $('#participants-list').innerHTML = '';
            return;
        }

        controls.style.display = 'block';
        noP.style.display = 'none';

        const sel = $('#results-competition');
        const cur = sel.value;
        const comps = competitions.filter(c => participants.some(p => p.competitionId === c.id));

        sel.innerHTML = comps.map(c =>
            `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`
        ).join('');

        if (comps.find(c => c.id === cur)) sel.value = cur;

        sel.onchange = () => renderParticipants(sel.value);
        renderParticipants(sel.value);
    }

    function renderParticipants(compId) {
        const list = $('#participants-list');
        const actions = $('#results-actions');
        const comp = competitions.find(c => c.id === compId);
        const filtered = participants.filter(p => p.competitionId === compId);

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Žádní závodníci.</p></div>';
            actions.style.display = 'none';
            $('#results-stats').innerHTML = '';
            return;
        }

        actions.style.display = 'flex';

        const totalCatches = catches.filter(c => c.competitionId === compId).length;
        const checkedInCount = new Set(
            checkins.filter(ci => ci.competitionId === compId).map(ci => ci.participantId)
        ).size;
        const overLimitCount = filtered.filter(p =>
            getParticipantCatchCount(compId, p.id) > (comp?.catchLimit || 2)
        ).length;

        $('#results-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${filtered.length}</div>
                <div class="stat-label">Závodníků</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${checkedInCount}</div>
                <div class="stat-label">Přihlášeno</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalCatches}</div>
                <div class="stat-label">Úlovků</div>
            </div>
            ${overLimitCount ? `
            <div class="stat-card" style="border-color:var(--danger);">
                <div class="stat-value" style="color:var(--danger);">${overLimitCount}</div>
                <div class="stat-label">Příplatek</div>
            </div>` : ''}
        `;

        const isMobile = window.innerWidth < 600;

        if (isMobile) {
            list.innerHTML = filtered.map((p, i) => {
                const cnt = getParticipantCatchCount(compId, p.id);
                const isOver = cnt > (comp?.catchLimit || 2);
                const isChecked = checkins.some(ci => ci.competitionId === compId && ci.participantId === p.id);
                return `
                    <div class="participant-card-mobile">
                        <div class="pcm-name">
                            ${i + 1}. ${escHtml(p.name)}
                            ${isChecked ? '<span class="checkin-status checkin-done">✓ Přihlášen</span>' : ''}
                        </div>
                        <div class="pcm-meta">
                            ${p.club ? escHtml(p.club) + ' · ' : ''}
                            <span class="category-label">${getCategoryLabel(p.category)}</span>
                        </div>
                        <div class="pcm-catches" style="${isOver ? 'color:var(--danger)' : ''}">
                            🐟 ${cnt} úlovků ${isOver ? '⚠️ PŘÍPLATEK' : ''}
                        </div>
                        <div class="pcm-actions">
                            <button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            list.innerHTML = `
                <table class="participants-table">
                    <thead><tr>
                        <th>#</th><th>Jméno</th><th>Spolek</th><th>Kategorie</th>
                        <th>Check-in</th><th>Úlovky</th><th></th>
                    </tr></thead>
                    <tbody>
                        ${filtered.map((p, i) => {
                            const cnt = getParticipantCatchCount(compId, p.id);
                            const isOver = cnt > (comp?.catchLimit || 2);
                            const isChecked = checkins.some(ci => ci.competitionId === compId && ci.participantId === p.id);
                            return `<tr>
                                <td>${i + 1}</td>
                                <td><strong>${escHtml(p.name)}</strong></td>
                                <td>${escHtml(p.club || '—')}</td>
                                <td><span class="category-label">${getCategoryLabel(p.category)}</span></td>
                                <td>${isChecked ? '<span class="checkin-status checkin-done">✓</span>' : '<span class="checkin-status checkin-pending">—</span>'}</td>
                                <td style="${isOver ? 'color:var(--danger);font-weight:700' : ''}">
                                    ${cnt} ${isOver ? '⚠️' : ''}
                                </td>
                                <td class="actions-cell">
                                    <button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    window._removeParticipant = function (id) {
        const p = participants.find(x => x.id === id);
        if (!p || !confirm(`Odebrat závodníka ${p.name}?`)) return;
        participants = participants.filter(x => x.id !== id);
        checkins = checkins.filter(ci => ci.participantId !== id);
        catches = catches.filter(c => c.participantId !== id);
        save(KEYS.PARTICIPANTS, participants);
        save(KEYS.CHECKINS, checkins);
        save(KEYS.CATCHES, catches);
        renderResultsView();
        renderCompetitions();
        showToast('Závodník odebrán');
    };

    // ── CSV Export ──
    $('#btn-export-csv').addEventListener('click', () => {
        const compId = $('#results-competition').value;
        const comp = competitions.find(c => c.id === compId);
        const filtered = participants.filter(p => p.competitionId === compId);
        if (filtered.length === 0) return;

        const headers = ['#', 'Jméno', 'Spolek', 'Kategorie', 'Telefon', 'E-mail', 'Check-in', 'Úlovky', 'Nad limit'];
        const rows = filtered.map((p, i) => {
            const cnt = getParticipantCatchCount(compId, p.id);
            const isChecked = checkins.some(ci => ci.competitionId === compId && ci.participantId === p.id);
            return [
                i + 1, p.name, p.club || '', getCategoryLabel(p.category),
                p.phone || '', p.email || '',
                isChecked ? 'Ano' : 'Ne',
                cnt,
                cnt > (comp?.catchLimit || 2) ? 'ANO' : ''
            ];
        });

        const bom = '\uFEFF';
        const csv = bom + [headers, ...rows].map(r =>
            r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
        ).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slugify(comp?.name || 'zavod')}_ucastnici.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exportováno');
    });

    $('#btn-print').addEventListener('click', () => window.print());

    // ── Nastavení URL ──
    const modalSettings = $('#modal-settings');

    function openSettings() {
        const saved = localStorage.getItem(KEYS.BASE_URL) || '';
        $('#settings-base-url').value = saved;
        openModal(modalSettings);
    }

    $('#btn-open-settings').addEventListener('click', openSettings);
    $('#modal-close-settings').addEventListener('click', () => closeModal(modalSettings));
    modalSettings.addEventListener('click', (e) => { if (e.target === modalSettings) closeModal(modalSettings); });

    $('#btn-save-settings').addEventListener('click', () => {
        const url = $('#settings-base-url').value.trim();
        if (url && !url.startsWith('http')) {
            showToast('URL musí začínat https://', 'danger');
            return;
        }
        localStorage.setItem(KEYS.BASE_URL, url);
        closeModal(modalSettings);
        updateLocalBanner();
        showToast(url ? 'URL uložena – QR kódy jsou připraveny!' : 'URL odstraněna');
    });

    function updateLocalBanner() {
        // banner odstraněn – QR kódy vždy ukazují na GitHub Pages
    }

    function showQrCodeSafe(title, url, subtitle) {
        showQrCode(title, url, subtitle);
    }

    // Přepsat window._showPondQRs a _showCatchQr aby použily safe verzi
    window._showPondQRs = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;
        closeModal(modalDetail);

        if (comp.ponds.length === 0) {
            showToast('Závod nemá definované rybníky', 'warning');
            return;
        }

        const body = $('#qr-body');
        $('#modal-qr-title').textContent = 'QR kódy – Check-in';
        body.innerHTML = `<p style="margin-bottom:1rem;color:var(--text-secondary);font-size:0.9rem;">
            Vytiskněte a umístěte ke každému rybníku. Závodník naskenuje a přihlásí se.
        </p>`;

        comp.ponds.forEach((pond, i) => {
            const url = getBaseUrl() + '?action=checkin&comp=' + comp.id + '&pond=' + encodeURIComponent(pond);
            const container = document.createElement('div');
            container.style.cssText = 'margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border-light);';

            const heading = document.createElement('h4');
            heading.style.marginBottom = '0.5rem';
            heading.textContent = '🏞️ ' + pond;
            container.appendChild(heading);

            const qrDiv = document.createElement('div');
            qrDiv.id = 'qr-pond-' + i;
            container.appendChild(qrDiv);

            const urlDiv = document.createElement('div');
            urlDiv.className = 'qr-url';
            urlDiv.textContent = url;
            container.appendChild(urlDiv);

            body.appendChild(container);
            setTimeout(() => makeQr(qrDiv, url, 220), 50);
        });

        openModal(modalQr);
    };

    window._showCatchQr = function (compId) {
        const sel = $(`#catch-participant-${compId}`);
        if (!sel || !sel.value) { showToast('Vyberte závodníka', 'warning'); return; }

        const comp = competitions.find(c => c.id === compId);
        const p = participants.find(x => x.id === sel.value);
        const url = getBaseUrl() + '?action=catch&comp=' + compId + '&pid=' + sel.value;
        showQrCode('QR – Nahlášení úlovku', url, `${comp?.name || ''} – ${p?.name || ''}`);
    };

    // ── Resize re-render ──
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (currentView === 'results') renderResultsView();
        }, 250);
    });

    // ── Init ──
    renderCompetitions();
    updateLocalBanner();
    handleUrlAction();
})();
