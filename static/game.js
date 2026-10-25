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
        const hasThreat = combatThreats.some(t => t.char_id === actor.id);
        meta.textContent = `${hasThreat ? '⚠️ ' : ''}${actor.distance}m`;
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

// ==========================================
// COMBAT UPDATE
// ==========================================

socket.on(
    'combat_update',
    (data) => {

        combatState = data;

        if (
            combatState.players_pa
        ) {

            window.playersPa =
                combatState.players_pa;
        }

        const tracker =
            document.getElementById(
                'combat-tracker'
            );

        const list =
            document.getElementById(
                'turn-order-list'
            );

        const btnNext =
            document.getElementById(
                'btn-next-turn'
            );

        const toggleBtn =
            document.getElementById(
                'btn-toggle-combat'
            );

        const movPanel =
            document.getElementById(
                'movement-panel'
            );

        const selectElem =
            document.getElementById(
                'user-select'
            );

        const myCharId =
            selectElem
                ? parseInt(
                    selectElem.value
                )
                : -1;

        let isMyTurn = false;

        if (
            combatState.turn_order &&
            combatState.turn_order.length >
            0
        ) {

            const currentActor =
                combatState.turn_order[
                    combatState.current_index
                ];

            if (currentActor) {

                const activeId =
                    currentActor.id !==
                    undefined

                        ? currentActor.id

                        : currentActor.char_id;

                if (
                    activeId ===
                    myCharId
                ) {

                    isMyTurn =
                        true;
                }
            }
        }

        // Il Master può gestire il
        // personaggio attualmente di turno.
        const canControlTurn =
            isMaster ||
            isMyTurn;

        if (isMyTurn) {

            window.currentPaMov =
                window.playersPa[
                    myCharId
                ] !== undefined

                    ? window.playersPa[
                        myCharId
                    ]

                    : 15;

            const paEl =
                document.getElementById(
                    'ui-pa-mov'
                );

            if (paEl) {

                paEl.innerText =
                    window.currentPaMov;
            }

            if (movPanel) {

                movPanel.style.display =
                    'flex';
            }

        } else {

            if (movPanel) {

                movPanel.style.display =
                    'none';
            }
        }

        if (
            combatState.is_active
        ) {

            if (tracker) {

                tracker.style.display =
                    'flex';
            }

            if (btnNext) {

                btnNext.style.display =
                    canControlTurn
                        ? 'block'
                        : 'none';
            }

            if (toggleBtn) {

                if (toggleBtn.classList.contains('master-tool-btn')) {
                    toggleBtn.innerHTML =
                        '<span class="master-tool-icon">🕊️</span>' +
                        '<span class="master-tool-label">Termina</span>';
                    toggleBtn.title = 'Termina combattimento';
                } else {
                    toggleBtn.innerText =
                        "🕊️ TERMINA COMBATTIMENTO";
                }

                toggleBtn.style.background =
                    "#7f8c8d";
            }

            renderTurnOrderList();

        } else {

            if (tracker) {

                tracker.style.display =
                    'none';
            }

            if (toggleBtn) {

                if (toggleBtn.classList.contains('master-tool-btn')) {
                    toggleBtn.innerHTML =
                        '<span class="master-tool-icon">⚔️</span>' +
                        '<span class="master-tool-label">Combat</span>';
                    toggleBtn.title = 'Avvia combattimento';
                } else {
                    toggleBtn.innerText =
                        "⚔️ INIZIA COMBATTIMENTO";
                }

                toggleBtn.style.background =
                    "#c0392b";
            }
        }

        // Aggiorna anche il pannello
        // delle azioni quando cambia turno.
        if (
            window.updateCombatActionPanel
        ) {

            window.updateCombatActionPanel();
        }

        requestRender();
    }
);

// ==========================================
// FOG OF WAR
// ==========================================

function getHexesInRadius(
    centerCol,
    centerRow,
    radius
) {

    let results = [];

    const centerCube =
        offsetToCube(
            centerCol,
            centerRow
        );

    for (
        let q = -radius;
        q <= radius;
        q++
    ) {

        for (
            let r =
                Math.max(
                    -radius,
                    -q - radius
                );

            r <=
            Math.min(
                radius,
                -q + radius
            );

            r++
        ) {

            let s =
                -q - r;

            let targetCube = {

                q:
                    centerCube.q +
                    q,

                r:
                    centerCube.r +
                    r,

                s:
                    centerCube.s +
                    s
            };

            let offset =
                cubeToOffset(
                    targetCube
                );

            results.push(
                `${offset.col},${offset.row}`
            );
        }
    }

    return results;
}

window.autoReveal = function(
    x,
    y
) {

    if (
        !window.fowEnabled ||
        isMaster
    ) {
        return;
    }

    const visibleHexes =
        getHexesInRadius(
            x,
            y,
            VISION_RADIUS
        );

    const newHexes =
        visibleHexes.filter(
            h =>
                !window.revealedHexes
                    .has(h)
        );

    if (
        newHexes.length >
        0
    ) {

        socket.emit(
            'reveal_hexes',
            {
                hexes:
                    newHexes
            }
        );
    }
};

// ==========================================
// UPDATE PERSONAGGIO
// ==========================================

socket.on(
    'update_character',
    (updatedChar) => {

        const serverMoveId = updatedChar._move_id || null;

        // Non vogliamo salvare _move_id dentro il personaggio
        delete updatedChar._move_id;

        const pendingMove =
            window.pendingLocalMoves?.[updatedChar.id];

        if (pendingMove) {
            const sameMoveId =
                serverMoveId !== null &&
                serverMoveId === pendingMove.moveId;

            // Fallback compatibile con un server che non restituisce ancora
            // _move_id: se la posizione autoritativa coincide col bersaglio,
            // consideriamo il movimento confermato.
            const sameAuthoritativePosition =
                serverMoveId === null &&
                Number(updatedChar.x) === Number(pendingMove.x) &&
                Number(updatedChar.y) === Number(pendingMove.y);

            if (sameMoveId || sameAuthoritativePosition) {

                // I frame spesi e il messaggio in chat li gestisce il server.
                delete window.pendingLocalMoves[updatedChar.id];

            } else {

                // È arrivato un aggiornamento precedente al movimento locale.
                // Gli altri dati vengono aggiornati, ma la posizione locale
                // resta quella dell'ultimo movimento ancora pendente.
                updatedChar.x = pendingMove.x;
                updatedChar.y = pendingMove.y;
            }
        }

        const index =
            characters.findIndex(
                c =>
                    c.id ===
                    updatedChar.id
            );

        if (
            index !== -1
        ) {

            characters[index] =
                updatedChar;

        } else {

            characters.push(
                updatedChar
            );
        }

        if (userSelect) {

            const option =
                userSelect.querySelector(
                    `option[value="${updatedChar.id}"]`
                );

            if (option) {

                option.text =
                    updatedChar.name;
            }
        }

        if (
            selectedCharacterId ===
            updatedChar.id
        ) {

            updateMasterEditPanel(
                updatedChar
            );
        }

        const currentViewedId =
            isMaster

                ? selectedCharacterId

                : parseInt(
                    userSelect?.value
                );

        if (
            sheetModal &&
            sheetModal.style.display ===
            'flex' &&
            currentViewedId ===
            updatedChar.id
        ) {

            if (
                typeof
                populatePlayerSheetUI ===
                'function'
            ) {

                populatePlayerSheetUI(
                    updatedChar
                );
            }
        }

        if (
            window.updateEquippedPanel &&
            currentViewedId ===
            updatedChar.id
        ) {

            window.updateEquippedPanel(
                updatedChar
            );
        }

        if (
            currentViewedId ===
            updatedChar.id
        ) {

            const textarea =
                document.getElementById(
                    'notes-textarea'
                );

            if (
                textarea &&
                document.activeElement !==
                textarea
            ) {

                textarea.value =
                    updatedChar.notes ||
                    "";
            }
        }

        if (
            !isMaster &&
            updatedChar.id ===
            parseInt(
                userSelect?.value
            )
        ) {

            if (
                typeof
                    window.autoReveal ===
                'function'
            ) {

                window.autoReveal(
                    updatedChar.x,
                    updatedChar.y
                );
            }
        }

        const myCharId =
            parseInt(
                userSelect?.value
            );

        if (
            !isMaster &&
            myCharId ===
            updatedChar.id
        ) {

            if (statusBar) {

                statusBar.innerText =
                    `Modalità Giocatore (${updatedChar.name}).`;
            }

        } else if (
            isMaster &&
            selectedCharacterId ===
            updatedChar.id
        ) {

            if (statusBar) {

                statusBar.innerText =
                    `[MASTER] Entità selezionata: ${updatedChar.name}`;
            }

        } else if (
            isMaster
        ) {

            if (statusBar) {

                statusBar.innerText =
                    `${updatedChar.name} aggiornato.`;
            }
        }

        if (window.refreshSidequestTargetOptions) {
            window.refreshSidequestTargetOptions();
        }
        if (window.refreshSidequestCards) {
            window.refreshSidequestCards();
        }

        if (
            typeof requestRender ===
            'function'
        ) {

            requestRender();
        }

        updateSheetButton();
    }
);

// ==========================================
// MOVIMENTO RIFIUTATO DAL SERVER
// ==========================================

socket.on('move_rejected', (data) => {
    const charId = Number(data?.char_id);
    const pendingMove = window.pendingLocalMoves?.[charId];

    if (!pendingMove) return;

    // Se il rifiuto riguarda un movimento vecchio, non deve annullare
    // un movimento più recente.
    if (data?.move_id && data.move_id !== pendingMove.moveId) return;

    const char = characters.find(c => Number(c.id) === charId);

    if (char) {
        char.x = data?.current_x ?? pendingMove.fromX;
        char.y = data?.current_y ?? pendingMove.fromY;
    }

    // Ripristina i Frame soltanto se questo era un movimento di combattimento.
    if (pendingMove.combat && pendingMove.paBefore !== undefined) {
        window.currentPaMov = pendingMove.paBefore;
        window.playersPa[charId] = pendingMove.paBefore;

        const paEl = document.getElementById('ui-pa-mov');
        if (paEl) paEl.innerText = pendingMove.paBefore;
    }

    delete window.pendingLocalMoves[charId];
    window.pendingMove = null;

    const reason = data?.reason;
    if (statusBar) {
        const reasons = {
            occupied: "⛔ Movimento annullato: la casella è già occupata.",
            frames: "⛔ Movimento rifiutato: frame di movimento insufficienti.",
            not_your_turn: "⛔ Movimento rifiutato: non è il tuo turno."
        };
        statusBar.innerText = reasons[reason] || "⛔ Movimento rifiutato dal server.";
    }

    requestRender();
});

socket.on('spawn_rejected', (data) => {
    if (!statusBar) return;

    statusBar.innerText =
        data?.reason === 'occupied'
            ? "⛔ Impossibile creare la pedina: la casella è già occupata."
            : "⛔ Creazione della pedina rifiutata dal server.";
});

// ==========================================
// CANCELLAZIONE PERSONAGGIO
// ==========================================

socket.on(
    'character_deleted',
    (data) => {

        characters =
            characters.filter(
                c =>
                    c.id !==
                    data.id
            );

        if (
            selectedCharacterId ===
            data.id
        ) {

            selectedCharacterId =
                null;

            updateMasterEditPanel(
                null
            );
        }

        requestRender();
        updateSheetButton();
    }
);

socket.on(
    'character_hidden_update',
    (data) => {

        const index =
            characters.findIndex(
                c =>
                    c.id ===
                    data.id
            );

        if (
            index !== -1
        ) {

            characters[index]
                .is_hidden =
                data.is_hidden;

            requestRender();
        }
    }
);

socket.on(
    'character_invisible_update',
    (data) => {

        const index =
            characters.findIndex(
                c =>
                    c.id ===
                    data.id
            );

        if (
            index !== -1
        ) {

            characters[index]
                .is_invisible =
                data.is_invisible;

            requestRender();
        }
    }
);

// ==========================================
// PANNELLO ENTITÀ MASTER
// ==========================================

function updateMasterEditPanel(
    char
) {

    const panel =
        document.getElementById(
            'selected-entity-panel'
        );

    if (!panel) return;

    if (char) {

        panel.style.display =
            'block';

        panel.style.opacity =
            '1';

        panel.style.pointerEvents =
            'auto';

        const nameEl =
            document.getElementById(
                'sel-name'
            );

        const hpEl =
            document.getElementById(
                'sel-hp'
            );

        const stamEl =
            document.getElementById(
                'sel-stam'
            );

        const concEl =
            document.getElementById(
                'sel-conc'
            );

        const bankControl =
            document.getElementById(
                'master-bank-control'
            );

        const bankInput =
            document.getElementById(
                'sel-bank'
            );

        if (nameEl) {

            nameEl.innerText =
                char.name;
        }

        if (hpEl) {

            hpEl.innerText =
                char.hp_current !==
                undefined

                    ? char.hp_current
                    : "?";
        }

        if (stamEl) {

            stamEl.innerText =
                char.stamina_current !==
                undefined

                    ? char.stamina_current
                    : "?";
        }

        if (concEl) {

            concEl.innerText =
                char.conc_current !==
                undefined

                    ? char.conc_current
                    : "?";
        }

        // Il conto in banca appartiene solo ai personaggi giocanti.
        if (bankControl) {
            bankControl.style.display =
                char.role === 'player'
                    ? 'block'
                    : 'none';
        }

        if (bankInput && char.role === 'player') {
            bankInput.value =
                char.xp !== undefined
                    ? char.xp
                    : 0;
        }

        const statusSelect =
            document.getElementById(
                'sel-status'
            );

        if (
            statusSelect &&
            char.status
        ) {

            statusSelect.value =
                char.status;
        }

        const visBtn =
            document.getElementById(
                'btn-toggle-visibility'
            );

        if (visBtn) {

            visBtn.style.display =
                'block';

            visBtn.innerText =
                char.is_hidden

                    ? "👁️ Rivela (FoW)"

                    : "👁️ Nascondi (FoW)";

            visBtn.style.background =
                char.is_hidden

                    ? "#27ae60"

                    : "#95a5a6";

            visBtn.onclick =
                () => {

                    socket.emit(
                        'toggle_hidden',
                        {
                            char_id:
                                char.id,

                            is_hidden:
                                !char.is_hidden
                        }
                    );
                };
        }

        const invBtn =
            document.getElementById(
                'btn-toggle-invisible'
            );

        if (invBtn) {

            invBtn.style.display =
                'block';

            invBtn.innerText =
                char.is_invisible

                    ? "👻 Torna Visibile"

                    : "👻 Rendi Invisibile";

            invBtn.style.background =
                char.is_invisible

                    ? "#27ae60"

                    : "#8e44ad";

            invBtn.onclick =
                () => {

                    socket.emit(
                        'toggle_invisible',
                        {
                            char_id:
                                char.id,

                            is_invisible:
                                !char.is_invisible
                        }
                    );
                };
        }

    } else {

        panel.style.display =
            'none';

        const bankControl =
            document.getElementById(
                'master-bank-control'
            );

        if (bankControl) {
            bankControl.style.display = 'none';
        }

        const equipPanelEl =
            document.getElementById(
                'equipped-panel'
            );

        const gadgetPanelEl =
            document.getElementById(
                'gadget-panel'
            );

        if (equipPanelEl) {

            equipPanelEl.style.display =
                'none';
        }

        if (gadgetPanelEl) {

            gadgetPanelEl.style.display =
                'none';
        }
    }
}

// ==========================================
// VITALS
// ==========================================

document.querySelectorAll(
    '.vital-btn'
).forEach(
    btn => {

        btn.addEventListener(
            'click',
            () => {

                if (!selectedCharacterId) {
                    return;
                }

                const type =
                    btn.getAttribute(
                        'data-type'
                    );

                const direction =
                    parseInt(
                        btn.getAttribute(
                            'data-direction'
                        )
                    ) || 0;

                const amountInput =
                    document.getElementById(
                        `vital-amount-${type}`
                    );

                const amount =
                    Math.abs(
                        parseInt(
                            amountInput?.value
                        ) || 0
                    );

                if (amount <= 0 || direction === 0) {
                    return;
                }

                socket.emit(
                    'update_vitals',
                    {
                        char_id: selectedCharacterId,
                        [type]: amount * direction
                    }
                );
            }
        );
    }
);

// ==========================================
// CONTO IN BANCA - SOLO MASTER
// ==========================================

document.getElementById(
    'btn-set-bank'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster || !selectedCharacterId) {
            return;
        }

        const selectedChar =
            characters.find(
                c => c.id === selectedCharacterId
            );

        if (!selectedChar || selectedChar.role !== 'player') {
            return;
        }

        const bankInput =
            document.getElementById(
                'sel-bank'
            );

        const value =
            Number.parseInt(
                bankInput?.value,
                10
            );

        if (!Number.isFinite(value)) {
            return;
        }

        socket.emit(
            'master_set_bank',
            {
                char_id: selectedCharacterId,
                value: value
            }
        );
    }
);

document.getElementById(
    'sel-status'
)?.addEventListener(
    'change',
    (e) => {

        if (
            !selectedCharacterId
        ) {
            return;
        }

        socket.emit(
            'update_vitals',
            {
                char_id:
                    selectedCharacterId,

                status:
                    e.target.value
            }
        );
    }
);

// ==========================================
// SELEZIONE PERSONAGGIO
// ==========================================

userSelect?.addEventListener(
    'change',
    () => {

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

        const renameBtn =
            document.getElementById(
                'rename-btn'
            );

        const centerBtn =
            document.getElementById(
                'center-cam-btn'
            );

        // ======================================
        // NESSUNA SELEZIONE
        // ======================================

        if (
            value === '0'
        ) {

            isMaster =
                false;

            currentRole =
                'player';

            selectedCharacterId =
                null;

            registerCurrentSessionRole();

            if (masterPanel) {

                masterPanel.style.display =
                    'none';
            }

            if (sheetBtn) {

                sheetBtn.style.display =
                    'none';
            }

            if (renameBtn) {

                renameBtn.style.display =
                    'none';
            }

            if (centerBtn) {

                centerBtn.style.display =
                    'none';
            }

            if (
                window.updateEquippedPanel
            ) {

                window.updateEquippedPanel(
                    null
                );
            }

            if (
                window.updateCombatActionPanel
            ) {

                window.updateCombatActionPanel();
            }

            updateSheetButton();

            return;
        }

        // ======================================
        // MASTER
        // ======================================

        if (
            value === 'master' ||
            role === 'master'
        ) {

            isMaster =
                true;

            currentRole =
                'master';

            registerCurrentSessionRole();

            selectedCharacterId =
                null;

            if (masterPanel) {

                masterPanel.style.display =
                    'block';
            }

            if (sheetBtn) {

                sheetBtn.style.display =
                    'none';
            }

            if (renameBtn) {

                renameBtn.style.display =
                    'none';
            }

            if (centerBtn) {

                centerBtn.style.display =
                    'none';
            }

            if (statusBar) {

                statusBar.innerText =
                    "👑 Modalità Master attiva.";

                statusBar.style
                    .backgroundColor =
                    "#fadbd8";
            }

            canvas.style.cursor =
                "pointer";

        } else {

            // ==================================
            // GIOCATORE
            // ==================================

            isMaster =
                false;

            currentRole =
                'player';

            registerCurrentSessionRole();

            if (masterPanel) {

                masterPanel.style.display =
                    'none';
            }

            if (sheetBtn) {

                sheetBtn.style.display =
                    'block';
            }

            if (renameBtn) {

                renameBtn.style.display =
                    'inline-block';
            }

            if (centerBtn) {

                centerBtn.style.display =
                    'inline-block';
            }

            if (statusBar) {

                statusBar.innerText =
                    `Modalità Giocatore (${selectedOption.text}).`;

                statusBar.style
                    .backgroundColor =
                    "#f0f0f0";
            }

            canvas.style.cursor =
                "crosshair";
        }

        if (
            typeof updateChatStatus ===
            'function'
        ) {

            updateChatStatus();
        }

        // ======================================
        // COMBATTIMENTO
        // ======================================

        if (
            combatState.is_active
        ) {

            const myCharId =
                parseInt(
                    value
                );

            let isMyTurn =
                false;

            if (
                combatState.turn_order &&
                combatState.turn_order.length >
                0
            ) {

                const currentActor =
                    combatState.turn_order[
                        combatState.current_index
                    ];

                const activeId =
                    currentActor
                        ?.id !== undefined

                        ? currentActor.id

                        : currentActor
                            ?.char_id;

                if (
                    activeId ===
                    myCharId
                ) {

                    isMyTurn =
                        true;
                }
            }

            const movPanel =
                document.getElementById(
                    'movement-panel'
                );

            const btnNext =
                document.getElementById(
                    'btn-next-turn'
                );

            if (isMyTurn) {

                window.currentPaMov =
                    (
                        window.playersPa &&
                        window.playersPa[
                            myCharId
                        ] !== undefined
                    )

                        ? window.playersPa[
                            myCharId
                        ]

                        : 15;

                const paEl =
                    document.getElementById(
                        'ui-pa-mov'
                    );

                if (paEl) {

                    paEl.innerText =
                        window.currentPaMov;
                }

                if (movPanel) {

                    movPanel.style.display =
                        'flex';
                }

            } else {

                if (movPanel) {

                    movPanel.style.display =
                        'none';
                }
            }

            if (btnNext) {

                btnNext.style.display =
                    (
                        isMaster ||
                        isMyTurn
                    )
                        ? 'block'
                        : 'none';
            }
        }

        // ======================================
        // HUD EQUIPAGGIAMENTO
        // ======================================

        const char =
            characters.find(
                c =>
                    c.id ===
                    parseInt(
                        value
                    )
            );

        if (
            window.updateEquippedPanel
        ) {

            window.updateEquippedPanel(
                char || null
            );
        }

        // ======================================
        // HUD ATTACCO
        // ======================================

        if (
            window.updateCombatActionPanel
        ) {

            window.updateCombatActionPanel();
        }

        // ======================================
        // APPUNTI
        // ======================================

        const textarea =
            document.getElementById(
                'notes-textarea'
            );

        if (textarea) {

            textarea.value =
                char &&
                char.notes

                    ? char.notes

                    : "";
        }

        updateSheetButton();
    }
);

// ==========================================
// RINOMINA PERSONAGGIO
// ==========================================

document.getElementById(
    'rename-btn'
)?.addEventListener(
    'click',
    () => {

        const charId =
            parseInt(
                userSelect.value
            );

        if (
            !charId ||
            charId === 0
        ) {
            return;
        }

        const newName =
            prompt(
                "Inserisci il nuovo nome del tuo personaggio:"
            );

        if (
            newName &&
            newName.trim() !==
            ""
        ) {

            socket.emit(
                'register_player',
                {
                    char_id:
                        charId,

                    name:
                        newName.trim()
                }
            );
        }
    }
);

// ==========================================
// COMBATTIMENTO MASTER
// ==========================================

document.getElementById(
    'btn-toggle-combat'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {
            return;
        }

        socket.emit(
            'toggle_combat'
        );
    }
);

// ==========================================
// SPAWN NPC
// ==========================================

document.getElementById(
    'spawn-npc-btn'
)?.addEventListener(
    'click',
    () => {

        window.isSpawningNpc =
            true;

        if (statusBar) {

            statusBar.innerText =
                "[MASTER] Clicca su un esagono per posizionare l'NPC.";
        }

        canvas.style.cursor =
            "crosshair";
    }
);

// ==========================================
// DELETE ENTITÀ
// ==========================================

document.getElementById(
    'btn-delete-entity'
)?.addEventListener(
    'click',
    () => {

        if (
            selectedCharacterId &&
            confirm(
                "Eliminare questa entità?"
            )
        ) {

            socket.emit(
                'delete_character',
                {
                    char_id:
                        selectedCharacterId
                }
            );
        }
    }
);

// ==========================================
// MAPPA
// ==========================================

socket.on(
    'map_update',
    (data) => {

        const oldUrl =
            currentMapUrl;

        currentMapUrl =
            data.map_url;

        mapScale =
            data.map_scale ||
            1.0;

        mapDx =
            data.map_dx ||
            0;

        mapDy =
            data.map_dy ||
            0;

        window.fowEnabled =
            data.fow_enabled ||
            false;

        window.revealedHexes =
            new Set(
                data.revealed_hexes ||
                []
            );

        window.fowVersion =
            (window.fowVersion || 0) + 1;

        const fowBtn =
            document.getElementById(
                'btn-toggle-fow'
            );

        if (fowBtn) {

            fowBtn.innerText =
                window.fowEnabled

                    ? "☁️ Disattiva Fog of War"

                    : "☁️ Attiva Fog of War";

            fowBtn.style.background =
                window.fowEnabled

                    ? "#27ae60"

                    : "#8e44ad";
        }

        if (currentMapUrl) {

            if (
                currentMapUrl !== oldUrl ||
                !bgImage
            ) {

                bgImage =
                    new Image();

                bgImage.onload =
                    () => {

                        requestRender();
                    };

                bgImage.src =
                    currentMapUrl;

            } else {

                requestRender();
            }

        } else {

            bgImage =
                null;

            requestRender();
        }
    }
);

// ==========================================
// MODIFICA MAPPA
// ==========================================

window.isEditingMap = false;
window.mapDragAction = null;

window.mapStartParams = {
    dx: 0,
    dy: 0,
    scale: 1
};

window.mapMouseStart = {
    x: 0,
    y: 0
};

document.getElementById(
    'toggle-map-edit-btn'
)?.addEventListener(
    'click',
    () => {

        if (
            !isMaster ||
            !bgImage
        ) {

            alert(
                "Carica prima una mappa per poterla modificare!"
            );

            return;
        }

        window.isEditingMap =
            !window.isEditingMap;

        const btn =
            document.getElementById(
                'toggle-map-edit-btn'
            );

        if (
            window.isEditingMap
        ) {

            btn.style.background =
                '#e74c3c';

            btn.innerText =
                '✅ Fine Modifica Sfondo';

            canvas.style.cursor =
                'move';

        } else {

            btn.style.background =
                '#8e44ad';

            btn.innerText =
                '📐 Modalità Muovi e Ridimensiona';

            canvas.style.cursor =
                'pointer';

            socket.emit(
                'set_map',
                {
                    url:
                        currentMapUrl,

                    scale:
                        mapScale,

                    dx:
                        mapDx,

                    dy:
                        mapDy
                }
            );
        }

        requestRender();
    }
);

// ==========================================
// CARICAMENTO MAPPA
// ==========================================

document.getElementById(
    'map-file-input'
)?.addEventListener(
    'change',
    (e) => {

        if (!isMaster) {
            return;
        }

        const file =
            e.target.files[0];

        if (!file) {
            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            function(evt) {

                socket.emit(
                    'set_map',
                    {
                        url:
                            evt.target.result,

                        scale:
                            1.0,

                        dx:
                            0,

                        dy:
                            0
                    }
                );

                const scaleInput =
                    document.getElementById(
                        'map-scale'
                    );

                const dxInput =
                    document.getElementById(
                        'map-dx'
                    );

                const dyInput =
                    document.getElementById(
                        'map-dy'
                    );

                if (scaleInput) {

                    scaleInput.value =
                        "1.0";
                }

                if (dxInput) {

                    dxInput.value =
                        "0";
                }

                if (dyInput) {

                    dyInput.value =
                        "0";
                }
            };

        reader.readAsDataURL(
            file
        );
    }
);

// ==========================================
// SALVA MAPPA MANUALMENTE
// ==========================================

document.getElementById(
    'set-map-btn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {
            return;
        }

        const scale =
            parseFloat(
                document.getElementById(
                    'map-scale'
                ).value
            ) || 1.0;

        const dx =
            parseInt(
                document.getElementById(
                    'map-dx'
                ).value
            ) || 0;

        const dy =
            parseInt(
                document.getElementById(
                    'map-dy'
                ).value
            ) || 0;

        socket.emit(
            'set_map',
            {
                url:
                    currentMapUrl,

                scale:
                    scale,

                dx:
                    dx,

                dy:
                    dy
            }
        );
    }
);

document.getElementById(
    'clear-map-btn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {
            return;
        }

        const input =
            document.getElementById(
                'map-file-input'
            );

        if (input) {

            input.value =
                "";
        }

        socket.emit(
            'set_map',
            {
                url: ""
            }
        );
    }
);

// ==========================================
// PA
// ==========================================

socket.on(
    'sync_pa',
    (data) => {

        window.playersPa[
            data.char_id
        ] =
            data.pa;

        // Valore autorevole del server per il personaggio di turno
        const currentActor =
            combatState.turn_order?.[combatState.current_index];

        if (currentActor && Number(currentActor.id) === Number(data.char_id)) {
            window.currentPaMov = data.pa;
            const paEl = document.getElementById('ui-pa-mov');
            if (paEl) paEl.innerText = data.pa;
        }

        renderTurnOrderList();
        requestRender();
    }
);

// ==========================================
// FINE TURNO
// ==========================================

document.getElementById(
    'btn-next-turn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {

            if (
                confirm(
                    "Vuoi davvero terminare il tuo turno? (Verranno applicati eventuali danni e scalati gli effetti)"
                )
            ) {

                socket.emit(
                    'next_turn'
                );
            }

        } else {

            socket.emit(
                'next_turn'
            );
        }
    }
);

// ==========================================
// FOG OF WAR MASTER
// ==========================================

window.toggleFogOfWar =
    function() {

        const turningOn =
            !window.fowEnabled;

        socket.emit(
            'toggle_global_fow',
            {
                enabled:
                    turningOn
            }
        );

        if (turningOn) {

            let initialHexes =
                [];

            characters.forEach(
                c => {

                    if (
                        c.role !==
                        'master'
                        &&
                        !c.is_hidden
                    ) {

                        initialHexes.push(
                            ...getHexesInRadius(
                                c.x,
                                c.y,
                                VISION_RADIUS
                            )
                        );
                    }
                }
            );

            const uniqueHexes =
                [
                    ...new Set(
                        initialHexes
                    )
                ];

            if (
                uniqueHexes.length >
                0
            ) {

                socket.emit(
                    'reveal_hexes',
                    {
                        hexes:
                            uniqueHexes
                    }
                );
            }
        }
    };

socket.on(
    'update_fow_hexes',
    (data) => {

        if (
            window.fowEnabled
        ) {

            window.revealedHexes =
                new Set(
                    data
                );

            window.fowVersion =
                (window.fowVersion || 0) + 1;

            requestRender();
        }
    }
);

// ==========================================
// NPC TOKEN LIBRARY
// ==========================================

window.npcTokenLibrary = [];
window.currentNpcTokenBase64 = "";

socket.on(
    'npc_token_library',
    (tokens) => {

        window.npcTokenLibrary =
            tokens || [];

        const select =
            document.getElementById(
                'npc-token-select'
            );

        if (!select) {
            return;
        }

        const oldValue =
            select.value;

        select.innerHTML = `
            <option value="">
                -- Nessuna pedina --
            </option>
        `;

        window.npcTokenLibrary
            .forEach(
                token => {

                    const option =
                        document.createElement(
                            'option'
                        );

                    option.value =
                        token.id;

                    option.textContent =
                        token.name;

                    select.appendChild(
                        option
                    );
                }
            );

        if (
            [
                ...select.options
            ].some(
                o =>
                    o.value ===
                    oldValue
            )
        ) {

            select.value =
                oldValue;
        }
    }
);

document.getElementById(
    'npc-token-file'
)?.addEventListener(
    'change',
    function(e) {

        const file =
            e.target.files[0];

        if (!file) {
            return;
        }

        if (
            file.type !==
            "image/png"
        ) {

            alert(
                "La pedina deve essere PNG."
            );

            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            function(event) {

                window.currentNpcTokenBase64 =
                    event.target.result;

                const preview =
                    document.getElementById(
                        'npc-token-preview'
                    );

                if (preview) {

                    preview.src =
                        window.currentNpcTokenBase64;

                    preview.style.display =
                        'inline-block';
                }
            };

        reader.readAsDataURL(
            file
        );
    }
);

document.getElementById(
    'npc-token-select'
)?.addEventListener(
    'change',
    function() {

        const tokenId =
            parseInt(
                this.value
            );

        const token =
            window.npcTokenLibrary.find(
                t =>
                    t.id ===
                    tokenId
            );

        if (!token) {

            window.currentNpcTokenBase64 =
                "";

            return;
        }

        window.currentNpcTokenBase64 =
            token.image_data;

        const preview =
            document.getElementById(
                'npc-token-preview'
            );

        if (preview) {

            preview.src =
                token.image_data;

            preview.style.display =
                'inline-block';
        }

        const npcName =
            document.getElementById(
                'npc-name'
            );

        if (npcName) {

            npcName.value =
                token.name;
        }
    }
);

document.getElementById(
    'save-npc-token-btn'
)?.addEventListener(
    'click',
    () => {

        if (
            !window.currentNpcTokenBase64
        ) {

            alert(
                "Carica prima una pedina."
            );

            return;
        }

        const npcNameInput =
            document.getElementById(
                'npc-name'
            );

        const name =
            npcNameInput
                ?.value
                .trim();

        if (!name) {

            alert(
                "Inserisci prima il nome del nemico."
            );

            return;
        }

        socket.emit(
            'save_npc_token',
            {
                name:
                    name,

                image_data:
                    window.currentNpcTokenBase64
            }
        );
    }
);

// Effetti e nomi cambiano con gli aggiornamenti dei personaggi: registrato
// in fondo al file così gira dopo il listener che aggiorna "characters".
socket.on('update_character', () => renderTurnOrderList());

// ==========================================
// SCENE (SOLO MASTER)
// Mappa, disegni e nebbia salvati con un nome. Cambiando scena
// il server salva prima quella aperta.
// ==========================================

let sceneState = { active_id: null, scenes: [] };

function renderSceneList() {
    const list = document.getElementById('scene-list');
    if (!list) return;

    list.innerHTML = '';

    if (!sceneState.scenes.length) {
        const empty = document.createElement('div');
        empty.className = 'scene-empty';
        empty.textContent = 'Nessuna scena salvata.';
        list.appendChild(empty);
        return;
    }

    sceneState.scenes.forEach(scene => {
        const isActive = scene.id === sceneState.active_id;

        const row = document.createElement('div');
        row.className = 'scene-row';
        row.classList.toggle('active', isActive);

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'scene-name';
        name.textContent = isActive ? `● ${scene.name}` : scene.name;
        name.title = isActive ? 'Scena aperta' : 'Apri questa scena';
        name.addEventListener('click', () => {
            if (isActive) return;
            if (confirm(`Aprire la scena "${scene.name}"?\nQuella attuale viene salvata in automatico.`)) {
                socket.emit('scene_load', { id: scene.id });
            }
        });

        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'scene-icon-btn';
        rename.textContent = '✏️';
        rename.title = 'Rinomina';
        rename.addEventListener('click', () => {
            const newName = prompt('Nuovo nome della scena:', scene.name);
            if (newName && newName.trim()) socket.emit('scene_rename', { id: scene.id, name: newName.trim() });
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'scene-icon-btn';
        remove.textContent = '🗑️';
        remove.title = 'Elimina scena';
        remove.addEventListener('click', () => {
            if (confirm(`Eliminare la scena "${scene.name}"? La mappa attuale non cambia.`)) {
                socket.emit('scene_delete', { id: scene.id });
            }
        });

        row.append(name, rename, remove);
        list.appendChild(row);
    });
}

function createScene(empty) {
    const input = document.getElementById('scene-name-input');
    const name = input?.value.trim();

    if (!name) {
        alert('Scrivi prima un nome per la scena.');
        input?.focus();
        return;
    }

    if (sceneState.scenes.some(scene => scene.name.toLowerCase() === name.toLowerCase())) {
        alert(`Esiste già una scena "${name}".`);
        return;
    }

    socket.emit('scene_create', { name, empty });
    input.value = '';
}

document.getElementById('scene-save-current-btn')?.addEventListener('click', () => createScene(false));
document.getElementById('scene-new-empty-btn')?.addEventListener('click', () => createScene(true));

socket.on('scene_list', (data) => {
    sceneState = {
        active_id: data?.active_id ?? null,
        scenes: Array.isArray(data?.scenes) ? data.scenes : []
    };
    renderSceneList();
});
