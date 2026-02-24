(function () {
    'use strict';

    // ── Storage helpers ──
    const STORAGE_KEYS = {
        COMPETITIONS: 'ryb_competitions',
        PARTICIPANTS: 'ryb_participants'
    };

    function load(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    function save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    let competitions = load(STORAGE_KEYS.COMPETITIONS);
    let participants = load(STORAGE_KEYS.PARTICIPANTS);

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // ── DOM refs ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const views = {
        competitions: $('#view-competitions'),
        registration: $('#view-registration'),
        results: $('#view-results')
    };

    const navBtns = $$('.nav-btn');
    const modalCompetition = $('#modal-competition');
    const modalDetail = $('#modal-detail');
    const competitionForm = $('#competition-form');
    const registrationForm = $('#registration-form');

    // ── Navigation ──
    let currentView = 'competitions';

    function switchView(name) {
        currentView = name;
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[name].classList.add('active');
        navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === name);
        });
        if (name === 'registration') renderRegistrationView();
        if (name === 'results') renderResultsView();
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // ── Toast ──
    let toastTimer;
    function showToast(message) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ── Modal helpers ──
    function openModal(modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }

    modalCompetition.addEventListener('click', (e) => {
        if (e.target === modalCompetition) closeModal(modalCompetition);
    });

    modalDetail.addEventListener('click', (e) => {
        if (e.target === modalDetail) closeModal(modalDetail);
    });

    $('#modal-close-competition').addEventListener('click', () => closeModal(modalCompetition));
    $('#modal-close-detail').addEventListener('click', () => closeModal(modalDetail));

    // ── Competitions ──
    let editingCompetitionId = null;

    $('#btn-new-competition').addEventListener('click', () => {
        editingCompetitionId = null;
        $('#modal-competition-title').textContent = 'Nový závod';
        competitionForm.reset();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 7);
        $('#comp-date').value = tomorrow.toISOString().split('T')[0];
        openModal(modalCompetition);
    });

    competitionForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const data = {
            id: editingCompetitionId || generateId(),
            name: $('#comp-name').value.trim(),
            date: $('#comp-date').value,
            time: $('#comp-time').value,
            location: $('#comp-location').value.trim(),
            maxParticipants: parseInt($('#comp-max').value) || 50,
            description: $('#comp-desc').value.trim(),
            createdAt: editingCompetitionId
                ? competitions.find(c => c.id === editingCompetitionId)?.createdAt || new Date().toISOString()
                : new Date().toISOString()
        };

        if (editingCompetitionId) {
            const idx = competitions.findIndex(c => c.id === editingCompetitionId);
            if (idx !== -1) competitions[idx] = data;
        } else {
            competitions.push(data);
        }

        save(STORAGE_KEYS.COMPETITIONS, competitions);
        closeModal(modalCompetition);
        renderCompetitions();
        showToast(editingCompetitionId ? 'Závod upraven' : 'Závod vytvořen');
        editingCompetitionId = null;
    });

    function getCompetitionStatus(comp) {
        const now = new Date();
        const compDate = new Date(comp.date + 'T' + (comp.time || '23:59'));
        const regCount = participants.filter(p => p.competitionId === comp.id).length;

        if (compDate < now) return { label: 'Proběhl', class: 'badge-past' };
        if (regCount >= comp.maxParticipants) return { label: 'Plný', class: 'badge-full' };
        return { label: 'Otevřený', class: 'badge-open' };
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }

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
            return `
                <div class="card" data-id="${comp.id}">
                    <div class="card-title">${escHtml(comp.name)}</div>
                    <div class="card-meta">
                        <span>📅 ${formatDate(comp.date)}</span>
                        <span>⏰ ${comp.time || '—'}</span>
                        <span>📍 ${escHtml(comp.location)}</span>
                    </div>
                    <div class="card-footer">
                        <span class="badge ${status.class}">${status.label}</span>
                        <span style="font-size:0.85rem;color:var(--text-secondary)">
                            👥 ${regCount} / ${comp.maxParticipants}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', () => openCompetitionDetail(card.dataset.id));
        });
    }

    function openCompetitionDetail(id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;

        const regCount = participants.filter(p => p.competitionId === id).length;
        const status = getCompetitionStatus(comp);

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
                <span class="detail-label">Registrace</span>
                <span class="detail-value">${regCount} / ${comp.maxParticipants}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Stav</span>
                <span class="detail-value"><span class="badge ${status.class}">${status.label}</span></span>
            </div>
            ${comp.description ? `
            <div class="detail-row">
                <span class="detail-label">Popis</span>
                <span class="detail-value">${escHtml(comp.description)}</span>
            </div>` : ''}
            <div class="detail-actions">
                <button class="btn btn-secondary" onclick="window._editCompetition('${comp.id}')">✏️ Upravit</button>
                <button class="btn btn-danger" onclick="window._deleteCompetition('${comp.id}')">🗑️ Smazat</button>
            </div>
        `;

        openModal(modalDetail);
    }

    window._editCompetition = function (id) {
        const comp = competitions.find(c => c.id === id);
        if (!comp) return;

        closeModal(modalDetail);
        editingCompetitionId = id;
        $('#modal-competition-title').textContent = 'Upravit závod';
        $('#comp-name').value = comp.name;
        $('#comp-date').value = comp.date;
        $('#comp-time').value = comp.time;
        $('#comp-location').value = comp.location;
        $('#comp-max').value = comp.maxParticipants;
        $('#comp-desc').value = comp.description || '';

        setTimeout(() => openModal(modalCompetition), 200);
    };

    window._deleteCompetition = function (id) {
        if (!confirm('Opravdu smazat tento závod a všechny jeho registrace?')) return;

        competitions = competitions.filter(c => c.id !== id);
        participants = participants.filter(p => p.competitionId !== id);
        save(STORAGE_KEYS.COMPETITIONS, competitions);
        save(STORAGE_KEYS.PARTICIPANTS, participants);
        closeModal(modalDetail);
        renderCompetitions();
        showToast('Závod smazán');
    };

    // ── Registration ──
    function renderRegistrationView() {
        const openComps = competitions.filter(comp => {
            const status = getCompetitionStatus(comp);
            return status.class === 'badge-open';
        });

        const noComp = $('#no-competition-for-reg');
        const form = registrationForm;

        if (openComps.length === 0) {
            noComp.style.display = 'block';
            form.style.display = 'none';
            return;
        }

        noComp.style.display = 'none';
        form.style.display = 'block';

        const select = $('#reg-competition');
        const currentValue = select.value;
        select.innerHTML = openComps.map(c =>
            `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`
        ).join('');

        if (openComps.find(c => c.id === currentValue)) {
            select.value = currentValue;
        }
    }

    registrationForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const compId = $('#reg-competition').value;
        const name = $('#reg-name').value.trim();

        if (!compId || !name) return;

        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        const regCount = participants.filter(p => p.competitionId === compId).length;
        if (regCount >= comp.maxParticipants) {
            showToast('Závod je již plný!');
            return;
        }

        const duplicate = participants.find(p =>
            p.competitionId === compId && p.name.toLowerCase() === name.toLowerCase()
        );
        if (duplicate) {
            showToast('Závodník s tímto jménem je již registrován!');
            return;
        }

        const participant = {
            id: generateId(),
            competitionId: compId,
            name: name,
            club: $('#reg-club').value.trim(),
            phone: $('#reg-phone').value.trim(),
            email: $('#reg-email').value.trim(),
            category: $('#reg-category').value,
            note: $('#reg-note').value.trim(),
            registeredAt: new Date().toISOString()
        };

        participants.push(participant);
        save(STORAGE_KEYS.PARTICIPANTS, participants);

        registrationForm.reset();
        $('#reg-competition').value = compId;
        renderCompetitions();
        showToast(`${participant.name} zaregistrován!`);
    });

    // ── Results ──
    function renderResultsView() {
        const controls = $('#results-controls');
        const noParticipants = $('#no-participants');
        const actions = $('#results-actions');

        if (competitions.length === 0 || participants.length === 0) {
            controls.style.display = 'none';
            actions.style.display = 'none';
            noParticipants.style.display = 'block';
            $('#participants-list').innerHTML = '';
            return;
        }

        controls.style.display = 'block';
        noParticipants.style.display = 'none';

        const select = $('#results-competition');
        const currentVal = select.value;
        const compsWithRegs = competitions.filter(c =>
            participants.some(p => p.competitionId === c.id)
        );

        select.innerHTML = compsWithRegs.map(c =>
            `<option value="${c.id}">${escHtml(c.name)} — ${formatDate(c.date)}</option>`
        ).join('');

        if (compsWithRegs.find(c => c.id === currentVal)) {
            select.value = currentVal;
        }

        select.onchange = () => renderParticipants(select.value);
        renderParticipants(select.value);
    }

    function renderParticipants(compId) {
        const list = $('#participants-list');
        const actions = $('#results-actions');
        const filtered = participants.filter(p => p.competitionId === compId);

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Žádní závodníci v tomto závodě.</p></div>';
            actions.style.display = 'none';
            $('#results-stats').innerHTML = '';
            return;
        }

        actions.style.display = 'flex';

        const categories = {};
        filtered.forEach(p => {
            const cat = getCategoryLabel(p.category);
            categories[cat] = (categories[cat] || 0) + 1;
        });

        $('#results-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${filtered.length}</div>
                <div class="stat-label">Celkem</div>
            </div>
            ${Object.entries(categories).map(([cat, count]) => `
                <div class="stat-card">
                    <div class="stat-value">${count}</div>
                    <div class="stat-label">${cat}</div>
                </div>
            `).join('')}
        `;

        const isMobile = window.innerWidth < 600;

        if (isMobile) {
            list.innerHTML = filtered.map((p, i) => `
                <div class="participant-card-mobile">
                    <div class="pcm-name">${i + 1}. ${escHtml(p.name)}</div>
                    <div class="pcm-meta">
                        ${p.club ? escHtml(p.club) + ' · ' : ''}
                        <span class="category-label">${getCategoryLabel(p.category)}</span>
                        ${p.phone ? ' · ' + escHtml(p.phone) : ''}
                    </div>
                    <div class="pcm-actions">
                        <button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = `
                <table class="participants-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Jméno</th>
                            <th>Spolek</th>
                            <th>Kategorie</th>
                            <th>Telefon</th>
                            <th>E-mail</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map((p, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><strong>${escHtml(p.name)}</strong></td>
                                <td>${escHtml(p.club || '—')}</td>
                                <td><span class="category-label">${getCategoryLabel(p.category)}</span></td>
                                <td>${escHtml(p.phone || '—')}</td>
                                <td>${escHtml(p.email || '—')}</td>
                                <td class="actions-cell">
                                    <button class="btn btn-danger btn-sm" onclick="window._removeParticipant('${p.id}')">Odebrat</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    function getCategoryLabel(cat) {
        const labels = { dospeli: 'Dospělí', mladez: 'Mládež', deti: 'Děti' };
        return labels[cat] || cat;
    }

    window._removeParticipant = function (id) {
        const p = participants.find(x => x.id === id);
        if (!p) return;
        if (!confirm(`Odebrat závodníka ${p.name}?`)) return;

        participants = participants.filter(x => x.id !== id);
        save(STORAGE_KEYS.PARTICIPANTS, participants);
        renderResultsView();
        renderCompetitions();
        showToast('Závodník odebrán');
    };

    // ── Export CSV ──
    $('#btn-export-csv').addEventListener('click', () => {
        const compId = $('#results-competition').value;
        const comp = competitions.find(c => c.id === compId);
        const filtered = participants.filter(p => p.competitionId === compId);

        if (filtered.length === 0) return;

        const headers = ['#', 'Jméno', 'Spolek', 'Kategorie', 'Telefon', 'E-mail', 'Poznámka'];
        const rows = filtered.map((p, i) => [
            i + 1,
            p.name,
            p.club || '',
            getCategoryLabel(p.category),
            p.phone || '',
            p.email || '',
            p.note || ''
        ]);

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

    $('#btn-print').addEventListener('click', () => {
        window.print();
    });

    // ── Helpers ──
    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function slugify(str) {
        return str.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    // ── Responsive re-render on resize ──
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (currentView === 'results') renderResultsView();
        }, 250);
    });

    // ── Init ──
    renderCompetitions();
})();
