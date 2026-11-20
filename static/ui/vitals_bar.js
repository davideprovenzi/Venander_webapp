// Barra dei vitali sempre visibile: HP, stamina, concentrazione e PA di ogni caratteristica.
// Il giocatore vede il proprio personaggio, il Master l'entità selezionata.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

const VITALS_BAR_POSITION_KEY = 'venander-vitals-bar-position';

// Reazioni: l'emoji sale sopra la pedina per tutti (come EMOJI_REACTIONS in venander/chat.py)
const EMOJI_REACTIONS = ['😂', '😮', '😱', '👍', '👎', '❤️', '💀', '🎲', '🔥', '🙏', '😡', '🤔'];
let emojiPanelOpen = false;

// Chi mostrare: per il Master l'entità selezionata, per il giocatore se stesso
function getVitalsBarCharacter() {
    if (typeof isMaster !== 'undefined' && isMaster) {
        return characters.find(c => c.id === selectedCharacterId) || null;
    }
    const myId = parseInt(userSelect?.value);
    return characters.find(c => c.id === myId && c.role === 'player') || null;
}

function vitalsMeter(icon, title, current, max, color) {
    const safeMax = Math.max(1, Number(max) || 0);
    const value = Math.max(0, Number(current) || 0);
    const percent = Math.min(100, Math.round(value / safeMax * 100));
    return `
        <div class="vitals-meter" title="${title}">
            <span class="vitals-meter-label">${icon} ${value}/${Number(max) || 0}</span>
            <span class="vitals-meter-track"><span style="width:${percent}%; background:${color}"></span></span>
        </div>`;
}

// Caratteristiche numeriche (niente equipaggiamento, gadget o testi come "Tipo" degli NPC)
function vitalsStatKeys(char) {
    return Object.entries(char.stats || {})
        .filter(([, value]) => typeof value !== 'object' && value !== '' && Number.isFinite(Number(value)))
        .map(([key]) => key);
}

function renderVitalsBar() {
    const bar = document.getElementById('vitals-bar');
    if (!bar) return;

    const char = getVitalsBarCharacter();
    if (!char) {
        bar.style.display = 'none';
        bar.dataset.signature = '';
        return;
    }

    // Si ridisegna solo se qualcosa è cambiato (la barra si controlla spesso)
    const stats = vitalsStatKeys(char);
    const signature = JSON.stringify([
        char.id, char.name, char.hp_current, char.hp_max, char.stamina_current, char.stamina_max,
        char.conc_current, char.conc_max, char.pa_stats, stats.map(key => char.stats[key]), emojiPanelOpen
    ]);
    bar.style.display = 'block';
    if (bar.dataset.signature === signature) return;
    bar.dataset.signature = signature;

    const paChips = stats.map(stat => {
        const current = getStatPa(char, stat);
        const max = getStatPaMax(char, stat);
        const state = current <= 0 ? 'empty' : current < max ? 'spent' : 'full';
        return `<span class="vitals-pa vitals-pa-${state}" title="${escapeHtml(stat)}: ${current} PA su ${max}">
            ${escapeHtml(stat.slice(0, 3).toUpperCase())} <b>${current}</b>/${max}</span>`;
    }).join('');

    const emojiRow = emojiPanelOpen
        ? `<div class="vitals-emoji-row">${EMOJI_REACTIONS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>`
        : '';

    bar.innerHTML = `
        <div class="vitals-bar-head" title="Trascina per spostare">
            <span>${escapeHtml(char.name)}</span>
            <button type="button" class="vitals-emoji-toggle${emojiPanelOpen ? ' open' : ''}" data-emoji-toggle title="Reazioni: un'emoji sopra la tua pedina">😀</button>
        </div>
        ${emojiRow}
        <div class="vitals-bar-meters">
            ${vitalsMeter('❤️', 'Salute', char.hp_current, char.hp_max, '#e74c3c')}
            ${vitalsMeter('⚡', 'Stamina', char.stamina_current, char.stamina_max, '#f39c12')}
            ${vitalsMeter('🧠', 'Concentrazione', char.conc_current, char.conc_max, '#3498db')}
        </div>
        <div class="vitals-bar-pa">${paChips}</div>`;
}

// Trascinamento (mouse e tablet); la posizione resta nel browser di chi la sposta
(function setupVitalsBarDrag() {
    const bar = document.getElementById('vitals-bar');
    if (!bar) return;

    try {
        const saved = JSON.parse(localStorage.getItem(VITALS_BAR_POSITION_KEY) || 'null');
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            bar.style.left = Math.min(saved.left, window.innerWidth - 80) + 'px';
            bar.style.top = Math.min(saved.top, window.innerHeight - 40) + 'px';
            bar.style.bottom = 'auto';
            bar.style.transform = 'none';
        }
    } catch (e) { /* posizione non disponibile: resta quella predefinita */ }

    let drag = null;
    bar.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.vitals-bar-head') || e.target.closest('button')) return;
        const rect = bar.getBoundingClientRect();
        drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        bar.style.transform = 'none';
        bar.style.bottom = 'auto';
        bar.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
        if (!drag) return;
        bar.style.left = Math.max(0, e.clientX - drag.dx) + 'px';
        bar.style.top = Math.max(0, e.clientY - drag.dy) + 'px';
    });
    bar.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = null;
        try {
            localStorage.setItem(VITALS_BAR_POSITION_KEY, JSON.stringify({
                left: parseInt(bar.style.left), top: parseInt(bar.style.top)
            }));
        } catch (e) { /* senza memoria del browser la posizione vale solo ora */ }
    });
})();

// Pulsanti della barra: apre le reazioni e manda l'emoji scelta
document.getElementById('vitals-bar')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-emoji-toggle]')) {
        emojiPanelOpen = !emojiPanelOpen;
        renderVitalsBar();
        return;
    }
    const button = e.target.closest('[data-emoji]');
    const char = getVitalsBarCharacter();
    if (!button || !char) return;
    socket.emit('emoji_reaction', { char_id: char.id, emoji: button.dataset.emoji });
    // Il server ne accetta una al secondo: i pulsanti si fermano un attimo
    const buttons = [...document.querySelectorAll('.vitals-emoji-row button')];
    buttons.forEach(b => { b.disabled = true; });
    setTimeout(() => buttons.forEach(b => { b.disabled = false; }), 1000);
});

socket.on('init_state', () => setTimeout(renderVitalsBar, 0));
socket.on('update_character', () => setTimeout(renderVitalsBar, 0));
socket.on('character_deleted', () => setTimeout(renderVitalsBar, 0));
userSelect?.addEventListener('change', () => setTimeout(renderVitalsBar, 0));
// La selezione del Master cambia da molti punti (mappa, pannello entità):
// un controllo leggero ogni mezzo secondo la tiene allineata
setInterval(renderVitalsBar, 500);
