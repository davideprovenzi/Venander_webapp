// Avvisi: annulla, numeri fluttuanti, minacce, mire, correzione frame, server da riavviare.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// ANNULLA ULTIMA AZIONE (SOLO MASTER)
// ==========================================

const undoBtn = document.getElementById('btn-master-undo');
let undoLabel = null;

socket.on('undo_status', (data) => {
    undoLabel = data?.count ? data.label : null;
    if (!undoBtn) return;
    undoBtn.disabled = !undoLabel;
    undoBtn.title = undoLabel ? `Annulla: ${undoLabel} (Ctrl+Z)` : 'Niente da annullare';
});

function undoLastAction() {
    if (!isMaster || !undoLabel) return;
    if (confirm(`Annullare l'ultima azione?\n${undoLabel}`)) socket.emit('undo_last_action');
}

undoBtn?.addEventListener('click', undoLastAction);

document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLastAction();
    }
});

// ==========================================
// NUMERI FLUTTUANTI SULLE PEDINE
// Danni (rosso), cure (verde), "Schivato!" e simili (giallo).
// ==========================================

const FLOATING_TEXT_MS = 1800;
window.floatingTexts = [];

socket.on('floating_text', (data) => {
    window.floatingTexts.push({ ...data, start: performance.now() });
    requestRender();
});

// ==========================================
// MINACCIA SCATTATA
// Chi minaccia riceve un avviso, anche se non è il suo turno: può agire
// subito (il pannello del turno passa a lui) o lasciar passare.
// ==========================================
let lastThreatAlertKey = null;

function isMyInterrupt(interrupt) {
    if (!interrupt) return false;
    const threatener = characters.find(c => c.id === interrupt.threatener_id);
    if (isMaster) return threatener?.role === 'npc';
    return interrupt.threatener_id === parseInt(userSelect?.value);
}

function updateThreatAlert() {
    const modal = document.getElementById('threat-alert-modal');
    const interrupt = combatState.interrupts?.[0];
    if (!modal) return;

    if (!combatState.is_active || !isMyInterrupt(interrupt)) {
        modal.classList.remove('open');
        lastThreatAlertKey = null;
        return;
    }

    // Una sola volta per ogni interruzione
    const key = `${interrupt.threat_id}-${interrupt.intruder_id}`;
    if (key === lastThreatAlertKey) return;
    lastThreatAlertKey = key;

    document.getElementById('threat-alert-text').innerHTML =
        `<b>${escapeHtml(interrupt.intruder_name)}</b> è entrato nella zona minacciata da ` +
        `<b>${escapeHtml(interrupt.threatener_name)}</b>.<br>Puoi agire adesso, prima che continui.`;
    modal.classList.add('open');
}

document.getElementById('threat-alert-act')?.addEventListener('click', () => {
    document.getElementById('threat-alert-modal').classList.remove('open');

    // Il pannello del turno è già passato a chi minaccia: lo si mette in evidenza
    const panel = document.getElementById('combat-action-panel');
    const content = document.getElementById('action-content');
    if (content) content.style.display = 'block';
    panel?.classList.add('flash');
    setTimeout(() => panel?.classList.remove('flash'), 1600);
});

document.getElementById('threat-alert-pass')?.addEventListener('click', () => {
    document.getElementById('threat-alert-modal').classList.remove('open');
    socket.emit('end_interrupt');
});

// Registrato in fondo: gira dopo l'aggiornamento di combatState
socket.on('combat_update', () => setTimeout(updateThreatAlert, 0));

// ==========================================
// MIRE IN CORSO (armi a distanza)
// ==========================================
let combatAims = [];

socket.on('aims_update', (aims) => {
    combatAims = Array.isArray(aims) ? aims : [];
    window.updateCombatActionPanel?.();
    requestRender();
});

// ==========================================
// FRAME: CORREZIONE DEL MASTER
// Nel pannello Selezione il Master imposta movimento e arti del
// combattente selezionato, in qualsiasi momento del combattimento.
// ==========================================
const FRAME_FIELDS = ['pa', 'bd', 'bs', 'gd', 'gs'];

function renderMasterFramesEditor(char) {
    const box = document.getElementById('sel-frames');
    if (!box) return;

    const show = isMaster && combatState.is_active && !!char;
    box.style.display = show ? 'block' : 'none';
    if (!show) return;

    // Non si sovrascrive quello che il Master sta scrivendo
    if (box.contains(document.activeElement) && box.dataset.charId === String(char.id)) return;
    box.dataset.charId = char.id;

    const limbs = combatState.players_limbs?.[char.id] || {};
    const values = {
        pa: combatState.players_pa?.[char.id] ?? 120,
        bd: limbs.bd ?? 60, bs: limbs.bs ?? 60, gd: limbs.gd ?? 60, gs: limbs.gs ?? 60
    };
    FRAME_FIELDS.forEach(field => {
        document.getElementById(`sel-frames-${field}`).value = values[field];
    });
}

function refreshMasterFramesEditor() {
    if (!isMaster || selectedCharacterId === null) return;
    renderMasterFramesEditor(characters.find(c => c.id === selectedCharacterId));
}

document.getElementById('sel-frames-save')?.addEventListener('click', () => {
    const charId = Number(document.getElementById('sel-frames').dataset.charId);
    const read = field => document.getElementById(`sel-frames-${field}`).value;

    if (FRAME_FIELDS.some(field => read(field) === '' || Number(read(field)) < 0)) {
        statusBar.innerText = '⛔ Frame non validi: scrivi numeri da 0 in su.';
        return;
    }

    socket.emit('set_frames', {
        char_id: charId,
        pa: Number(read('pa')),
        limbs: { bd: Number(read('bd')), bs: Number(read('bs')), gd: Number(read('gd')), gs: Number(read('gs')) }
    });
    document.activeElement?.blur();
});

document.getElementById('sel-frames-full')?.addEventListener('click', () => {
    document.getElementById('sel-frames-pa').value = 120;
    ['bd', 'bs', 'gd', 'gs'].forEach(limb => { document.getElementById(`sel-frames-${limb}`).value = 60; });
});

// Dalla barra dei turni: seleziona il combattente e apre il pannello Selezione
function selectCombatantFromTracker(charId) {
    const char = characters.find(c => c.id === charId);
    if (!isMaster || !char) return;

    selectedCharacterId = charId;
    updateMasterEditPanel(char);
    updateSheetButton();
    window.updateEquippedPanel?.(char);

    const section = document.getElementById('selected-entity-panel');
    if (!section?.classList.contains('master-tool-section-active')) {
        document.querySelector('.master-tool-btn[data-master-section="selected-entity-panel"]')?.click();
    }

    renderTurnOrderList();
    requestRender();
}

// I frame cambiano (azioni, attacchi, correzioni): il pannello si aggiorna
socket.on('sync_limbs', refreshMasterFramesEditor);
socket.on('sync_pa', refreshMasterFramesEditor);
socket.on('combat_update', () => setTimeout(refreshMasterFramesEditor, 0));

// ==========================================
// SERVER DA RIAVVIARE / PAGINA DA RICARICARE
// Il server carica il suo codice (venander/) solo all'avvio, la pagina invece arriva dal disco:
// se il codice cambia senza riavvio i pulsanti nuovi non fanno nulla.
// ==========================================
(() => {
    const banner = document.getElementById('code-status-banner');
    const pageFingerprint = document.body.dataset.codeFingerprint || '';
    if (!banner) return;

    function show(status) {
        if (!status) return;
        let text = '';
        if (status.db_replaced) {
            // Il più grave: ogni modifica da ora in poi andrebbe persa
            if (isMaster) {
                text = '🛑 Il file del database è stato sostituito mentre il server era acceso (git pull o checkout?): ' +
                       'quello che salvi ora andrà PERSO. Riavvia subito il server (Ctrl+C e di nuovo "python app.py").';
            }
        } else if (status.server_outdated) {
            // Solo il Master può riavviarlo; ai giocatori basterebbe ricaricare dopo
            if (isMaster) {
                text = '⚠️ Il codice del gioco è cambiato ma il server non è stato riavviato: alcune funzioni nuove non risponderanno. ' +
                       'Riavvialo (Ctrl+C nel suo terminale e di nuovo "python app.py"), poi ricarica la pagina.';
            }
        } else if (pageFingerprint && status.page && status.page !== pageFingerprint) {
            text = '🔄 Il gioco è stato aggiornato: ricarica la pagina (F5) per avere la versione nuova.';
        }
        banner.textContent = text;
        banner.classList.toggle('open', !!text);
    }

    function check() {
        if (!socket.connected) return;
        socket.timeout(5000).emit('get_code_status', (timeoutError, status) => {
            if (timeoutError) {
                // Un server che non conosce nemmeno questo controllo è sicuramente vecchio
                if (isMaster) show({ server_outdated: true });
                return;
            }
            show(status);
        });
    }

    socket.on('code_status', show);
    socket.on('connect', () => setTimeout(check, 1500));
    userSelect?.addEventListener('change', () => setTimeout(check, 1500));
    setInterval(check, 60000);
})();
