// Base del client: socket, ruolo della sessione, stato locale, ordine di turno, telecamera, stato iniziale dal server.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('status-bar');
const userSelect = document.getElementById('user-select');

const TILE_SIZE = 50;

let camera = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let hasDragged = false;
let startClickX = 0;
let startClickY = 0;

window.isSpawningNpc = false;

// --- VARIABILI MAPPA ---
let bgImage = null;
let currentMapUrl = "";

let mapScale = 1.0;
let mapDx = 0;
let mapDy = 0;

window.fowEnabled = false;
window.revealedHexes = new Set();

const VISION_RADIUS = 3;

// ==========================================
// COORDINATE MONDO
// ==========================================

function getWorldPos(event) {

    const rect =
        canvas.getBoundingClientRect();

    const mouseX =
        event.clientX - rect.left;

    const mouseY =
        event.clientY - rect.top;

    return {
        x:
            (mouseX - camera.x) /
            camera.zoom,

        y:
            (mouseY - camera.y) /
            camera.zoom
    };
}

const COLS =
    canvas.width / TILE_SIZE;

const ROWS =
    canvas.height / TILE_SIZE;

let characters = [];
window.pendingLocalMoves = {};
let laserLines = [];
let isLaserDrawing = false;

// ==========================================
// RUOLO / MOVIMENTO
// ==========================================

let currentRole = 'player';

window.currentPaMov = 120;
window.pendingMove = null;
window.playersPa = {};

window.hoveredHex = null;
window.lastHoveredHex = null;

window.wasCombatActive = false;

function isMasterUser() {
    return currentRole === 'master';
}

// ==========================================
// SOCKET
// ==========================================

const socket = io();

// ==========================================
// REGISTRAZIONE RUOLO SESSIONE
// ==========================================

function registerCurrentSessionRole() {

    if (!userSelect) return;

    const selectedOption =
        userSelect.options[
            userSelect.selectedIndex
        ];

    const value =
        userSelect.value;

    const role =
        selectedOption
            ?.getAttribute(
                'data-role'
            );

    const sessionRole =
        (
            value === 'master' ||
            role === 'master'
        )
            ? 'master'
            : 'player';

    currentRole =
        sessionRole;

    let sessionCharId = null;

    if (sessionRole === 'player') {
        const parsedId = parseInt(value);
        if (Number.isFinite(parsedId) && parsedId > 0) {
            sessionCharId = parsedId;
        }
    }

    socket.emit(
        'register_session_role',
        {
            role: sessionRole,
            char_id: sessionCharId
        }
    );
}

// ==========================================
// EVENTI CONNESSIONE
// ==========================================

socket.on(
    'connect',
    () => {

        console.log(
            '[SOCKET] Connesso:',
            socket.id
        );

        // Richiede i dati iniziali
        socket.emit(
            'get_compendio'
        );

        socket.emit(
            'get_npc_tokens'
        );

        // Fondamentale dopo ogni
        // riconnessione Socket.IO.
        registerCurrentSessionRole();
    }
);

socket.on(
    'disconnect',
    (reason) => {

        console.warn(
            '[SOCKET] Disconnesso:',
            reason
        );
    }
);

socket.on(
    'connect_error',
    (error) => {

        console.error(
            '[SOCKET] Errore connessione:',
            error
        );
    }
);

// ==========================================
// SEZIONI SCHEDA
// ==========================================

function toggleSection(headerEl) {

    const content =
        headerEl.nextElementSibling;

    const icon =
        headerEl.querySelector(
            'span'
        );

    if (
        content.style.display ===
        'none'
    ) {

        content.style.display =
            'block';

        icon.innerText = '▼';

    } else {

        content.style.display =
            'none';

        icon.innerText = '▶';
    }
}

// ==========================================
// STATO LOCALE E COMBATTIMENTO
// ==========================================

let isMaster = false;
let selectedCharacterId = null;

let lastX = 0;
let lastY = 0;

let combatState = {

    is_active: false,

    turn_order: [],

    current_index: 0,

    epicenter: {
        x: 0,
        y: 0
    },

    interrupts: []
};

// Aree minacciate visibili a questo client (quelle degli NPC solo al Master)
let combatThreats = [];

// Chi può agire ora: chi interrompe con Minacciare, altrimenti chi è di turno
function getActingCombatantId() {
    const interrupt = combatState.interrupts?.[0];
    if (interrupt) return interrupt.threatener_id;

    const actor = combatState.turn_order?.[combatState.current_index];
    if (!actor) return null;
    return actor.id !== undefined ? actor.id : actor.char_id;
}

socket.on('threats_update', (threats) => {
    combatThreats = Array.isArray(threats) ? threats : [];
    renderTurnOrderList();
    requestRender();
});

// Effetti a tempo (bonus con turni) attivi su un personaggio
function getTimedEffects(char) {
    return (Array.isArray(char?.bonuses) ? char.bonuses : [])
        .filter(effect => effect && typeof effect === 'object' && Number(effect.turns) > 0);
}

// ==========================================
// ORDINE DI TURNO
// Per ogni combattente: frame di movimento, frame degli arti,
// effetti attivi e minacce. Visibile a tutti durante il combattimento.
// ==========================================

const TRACKER_LIMBS = [
    ['bd', 'BD'],
    ['bs', 'BS'],
    ['gd', 'GD'],
    ['gs', 'GS']
];

function renderTurnOrderList() {
    const list = document.getElementById('turn-order-list');
    if (!list || !combatState.is_active) return;

    list.innerHTML = '';

    const interrupt = combatState.interrupts?.[0];
    if (interrupt) {
        const banner = document.createElement('div');
        banner.className = 'turn-interrupt-banner';
        banner.innerHTML =
            `⚡ <b>${escapeHtml(interrupt.threatener_name)}</b> interrompe ` +
            `<b>${escapeHtml(interrupt.intruder_name)}</b>`;
        list.appendChild(banner);
    }

    const actingId = getActingCombatantId();

    (combatState.turn_order || []).forEach((actor, index) => {
        const char = characters.find(c => c.id === actor.id);
        const isCurrent = index === combatState.current_index;

        const row = document.createElement('div');
        row.className = 'turn-row';
        row.classList.toggle('current', isCurrent);
        row.classList.toggle('selected', isMaster && actor.id === selectedCharacterId);
        if (isMaster) {
            row.title = 'Clicca per selezionare (frame, vitali, scheda)';
            row.addEventListener('click', () => selectCombatantFromTracker(actor.id));
        }
        row.classList.toggle('acting', actor.id === actingId && !isCurrent);

        // Nome, distanza e indicatori
        const header = document.createElement('div');
        header.className = 'turn-row-header';

        const name = document.createElement('span');
        name.className = 'turn-row-name';
        name.textContent = `${isCurrent ? '▶ ' : ''}${actor.name}`;
        header.appendChild(name);

        const meta = document.createElement('span');
        meta.className = 'turn-row-meta';
        const threats = combatThreats.filter(t => t.char_id === actor.id);
        meta.textContent = `${threats.length ? '⚠️ ' : ''}${actor.distance}m`;

        // Chi controlla il personaggio può ritirare le sue minacce in qualsiasi momento
        const canControl = isMaster || actor.id === parseInt(userSelect?.value);
        if (threats.length && canControl) {
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'turn-threat-cancel';
            cancel.textContent = '✖';
            cancel.title = 'Ritira la minaccia';
            cancel.addEventListener('mousedown', (e) => e.stopPropagation());
            cancel.addEventListener('click', () => {
                threats.forEach(t => socket.emit('cancel_threat', { threat_id: t.id }));
            });
            meta.prepend(cancel);
        }
        header.appendChild(meta);

        row.appendChild(header);

        // Frame: movimento + quattro arti
        const frames = document.createElement('div');
        frames.className = 'turn-row-frames';

        const moveFrames = combatState.players_pa?.[actor.id] ?? combatState.players_pa?.[String(actor.id)];
        if (moveFrames !== undefined) {
            const move = document.createElement('span');
            move.className = 'turn-frame-move';
            move.title = 'Frame di movimento';
            move.textContent = `🦶 ${moveFrames}`;
            frames.appendChild(move);
        }

        const limbs = combatState.players_limbs?.[actor.id] ?? combatState.players_limbs?.[String(actor.id)] ?? {};
        TRACKER_LIMBS.forEach(([key, label]) => {
            const value = limbs[key] ?? 60;
            const limb = document.createElement('span');
            limb.className = 'turn-frame-limb';
            limb.title = `${label}: ${value}/60 frame`;

            const bar = document.createElement('span');
            bar.className = 'turn-frame-bar';
            bar.style.width = `${Math.max(0, Math.min(100, value / 60 * 100))}%`;
            bar.classList.toggle('low', value < 20);

            limb.appendChild(bar);
            limb.appendChild(document.createTextNode(`${label} ${value}`));
            frames.appendChild(limb);
        });

        row.appendChild(frames);

        // Effetti attivi
        const effects = getTimedEffects(char);
        if (effects.length) {
            const effectsEl = document.createElement('div');
            effectsEl.className = 'turn-row-effects';
            effects.forEach(effect => {
                const chip = document.createElement('span');
                chip.className = 'turn-effect';
                chip.classList.toggle('harmful', Number(effect.hpChange) < 0);
                chip.title = effect.desc || '';
                chip.textContent = `${effect.name} (${effect.turns})`;
                effectsEl.appendChild(chip);
            });
            row.appendChild(effectsEl);
        }

        list.appendChild(row);
    });
}

// ==========================================
// ELEMENTI UI
// ==========================================

const masterPanel =
    document.getElementById(
        'master-panel'
    );

const sheetBtn =
    document.getElementById(
        'sheet-btn'
    );

const sheetModal =
    document.getElementById(
        'sheet-modal'
    );

const editSheetModal =
    document.getElementById(
        'edit-sheet-modal'
    );

// ==========================================
// UTILITY PERSONAGGIO
// ==========================================

function getSelectedCharacter() {

    const id =
        parseInt(
            userSelect?.value
        );

    if (
        isNaN(id) ||
        id === 0
    ) {
        return null;
    }

    return (
        characters.find(
            c => c.id === id
        ) || null
    );
}

// Scheda pubblica degli NPC per i giocatori: mostra solo nome, immagine e descrizione.
window.showPublicNpcInfo = function(npc) {
    if (!npc || npc.role !== 'npc') return;

    let modal = document.getElementById('npc-public-info-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'npc-public-info-modal';
        modal.style.cssText = `
            display:none; position:fixed; inset:0; z-index:10000;
            background:rgba(0,0,0,0.55); align-items:center; justify-content:center;
            padding:20px; box-sizing:border-box;
        `;

        modal.innerHTML = `
            <div style="width:min(440px, 95vw); max-height:80vh; overflow:auto; background:#fff; border-radius:10px; padding:18px; box-shadow:0 10px 35px rgba(0,0,0,.35); position:relative;">
                <button id="npc-public-close" type="button" style="position:absolute; right:10px; top:8px; border:none; background:transparent; font-size:24px; cursor:pointer;">×</button>
                <div style="display:flex; gap:14px; align-items:flex-start; padding-right:25px;">
                    <img id="npc-public-image" alt="" style="display:none; width:90px; height:90px; object-fit:contain; border-radius:50%; border:2px solid #333; flex:0 0 auto;">
                    <div style="min-width:0;">
                        <h2 id="npc-public-name" style="margin:0 0 8px 0; font-size:22px;"></h2>
                        <div style="font-size:12px; font-weight:bold; color:#7f8c8d; margin-bottom:10px;">ENTITÀ</div>
                        <p id="npc-public-lore" style="margin:0; white-space:pre-wrap; line-height:1.5; color:#444;"></p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#npc-public-close')?.addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
    }

    const nameEl = modal.querySelector('#npc-public-name');
    const loreEl = modal.querySelector('#npc-public-lore');
    const imageEl = modal.querySelector('#npc-public-image');

    if (nameEl) nameEl.textContent = npc.name || 'Entità sconosciuta';
    if (loreEl) loreEl.textContent = (npc.lore || '').trim() || 'Nessuna descrizione disponibile.';

    const imageUrl = npc.token_url || npc.photo_url || '';
    if (imageEl) {
        if (imageUrl) {
            imageEl.src = imageUrl;
            imageEl.style.display = 'block';
        } else {
            imageEl.removeAttribute('src');
            imageEl.style.display = 'none';
        }
    }

    modal.style.display = 'flex';
};

function updateSheetButton() {

    const sheetBtn =
        document.getElementById(
            'sheet-btn'
        );

    const notesBtn =
        document.getElementById(
            'btn-toggle-notes'
        );

    const renameBtn =
        document.getElementById(
            'rename-btn'
        );

    if (isMaster) {

        if (sheetBtn) {

            sheetBtn.style.display =
                selectedCharacterId
                    ? 'flex'
                    : 'none';
        }

        if (notesBtn) {

            notesBtn.style.display =
                selectedCharacterId
                    ? 'inline-block'
                    : 'none';
        }

        if (renameBtn) {

            renameBtn.style.display =
                'none';
        }

    } else {

        const char =
            getSelectedCharacter();

        if (sheetBtn) {

            sheetBtn.style.display =
                char
                    ? 'flex'
                    : 'none';
        }

        if (notesBtn) {

            notesBtn.style.display =
                char
                    ? 'inline-block'
                    : 'none';
        }

        if (renameBtn) {

            renameBtn.style.display =
                char
                    ? 'inline-block'
                    : 'none';
        }
    }
}

// ==========================================
// BONUS COMPENDIO
// ==========================================

function getSkillBonusInfo(
    skillName
) {

    if (
        !globalCompendio?.items
    ) {
        return null;
    }

    const item =
        globalCompendio.items.find(
            entry =>
                entry.name ===
                skillName
        );

    if (!item) return null;

    const bonusText =
        item?.effects?.bonus_malus;

    if (!bonusText) {
        return null;
    }

    const match =
        bonusText.match(
            /\+(\d+)\s+(Forza|Destrezza|Percezione|Arguzia|Volontà)/i
        );

    if (!match) {
        return null;
    }

    return {

        stat:
            match[2]
                .charAt(0)
                .toUpperCase()
            +
            match[2]
                .slice(1)
                .toLowerCase(),

        val:
            parseInt(
                match[1]
            )
    };
}

// ==========================================
// TELECAMERA
// ==========================================

function centerCameraOn(
    gridX,
    gridY
) {

    const centerPos =
        hexToPixel(
            gridX,
            gridY
        );

    camera.x =
        (canvas.width / 2)
        -
        (
            centerPos.x *
            camera.zoom
        );

    camera.y =
        (canvas.height / 2)
        -
        (
            centerPos.y *
            camera.zoom
        );

    requestRender();
}

document.getElementById(
    'center-cam-btn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {

            const myChar =
                getSelectedCharacter();

            if (myChar) {

                centerCameraOn(
                    myChar.x,
                    myChar.y
                );

            } else {

                alert(
                    "Nessun personaggio trovato sulla mappa."
                );
            }

        } else {

            if (
                selectedCharacterId
            ) {

                const targetChar =
                    characters.find(
                        c =>
                            c.id ===
                            selectedCharacterId
                    );

                if (targetChar) {

                    centerCameraOn(
                        targetChar.x,
                        targetChar.y
                    );
                }

            } else if (
                combatState.is_active &&
                combatState.epicenter
            ) {

                centerCameraOn(
                    combatState.epicenter.x,
                    combatState.epicenter.y
                );

            } else {

                centerCameraOn(
                    0,
                    0
                );

                statusBar.innerText =
                    "Visuale centrata sulle coordinate (0,0).";
            }
        }
    }
);

// ==========================================
// STATO INIZIALE SERVER
// ==========================================

socket.on(
    'init_state',
    (serverCharacters) => {

        // Un init_state è autoritativo: eventuali movimenti rimasti
        // pendenti dopo una riconnessione non devono bloccare il client.
        window.pendingLocalMoves = {};
        window.pendingMove = null;

        characters =
            serverCharacters || [];

        if (window.refreshSidequestTargetOptions) {
            window.refreshSidequestTargetOptions();
        }
        if (window.refreshSidequestCards) {
            window.refreshSidequestCards();
        }

        requestRender();

        if (statusBar) {

            statusBar.innerText =
                "Connesso. Tabellone sincronizzato.";
        }

        updateSheetButton();

        if (window.updateEquippedPanel) {
            const initialViewedId = isMaster
                ? selectedCharacterId
                : parseInt(userSelect?.value);

            const initialViewedChar = characters.find(
                c => c.id === initialViewedId
            );

            window.updateEquippedPanel(initialViewedChar || null);
        }

        if (
            selectedCharacterId !==
            null
        ) {

            const selected =
                characters.find(
                    c =>
                        c.id ===
                        selectedCharacterId
                );

            updateMasterEditPanel(
                selected
                    ? selected
                    : null
            );

            if (!selected) {

                selectedCharacterId =
                    null;
            }
        }
    }
);
