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

window.draggingDrawing = null;
window.dragOffset = {
    sx: 0,
    sy: 0,
    ex: 0,
    ey: 0
};

window.selectDrawing = null;

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
let drawings = [];

let currentIconBase64 = null;

// ==========================================
// VARIABILI DISEGNO FORME
// ==========================================

let isDrawingShape = false;
let shapeStartX = 0;
let shapeStartY = 0;
let currentTempShape = null;

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

    socket.emit(
        'register_session_role',
        {
            role: sessionRole
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

let isDrawingMode = false;
let isEraserMode = false;

let isDrawing = false;

let lastX = 0;
let lastY = 0;

let combatState = {

    is_active: false,

    turn_order: [],

    current_index: 0,

    epicenter: {
        x: 0,
        y: 0
    }
};

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

        characters =
            serverCharacters || [];

        requestRender();

        if (statusBar) {

            statusBar.innerText =
                "Connesso. Tabellone sincronizzato.";
        }

        updateSheetButton();

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

socket.on(
    'init_drawings',
    (serverDrawings) => {

        drawings =
            serverDrawings || [];

        requestRender();
    }
);

socket.on(
    'draw_item',
    (itemData) => {

        drawings.push(
            itemData
        );

        requestRender();
    }
);

socket.on(
    'clear_lines',
    () => {

        drawings = [];

        requestRender();
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

                toggleBtn.innerText =
                    "🕊️ TERMINA COMBATTIMENTO";

                toggleBtn.style.background =
                    "#7f8c8d";
            }

            if (list) {

                list.innerHTML = '';

                combatState
                    .turn_order
                    .forEach(
                        (
                            actor,
                            index
                        ) => {

                            const isCurrent =
                                index ===
                                combatState.current_index;

                            const div =
                                document.createElement(
                                    'div'
                                );

                            div.style.padding =
                                '8px 10px';

                            div.style.borderRadius =
                                '5px';

                            div.style.fontWeight =
                                isCurrent
                                    ? 'bold'
                                    : 'normal';

                            div.style.background =
                                isCurrent
                                    ? '#f1c40f'
                                    : '#ecf0f1';

                            div.style.color =
                                isCurrent
                                    ? '#000'
                                    : '#7f8c8d';

                            div.style.border =
                                isCurrent
                                    ? '2px solid #e67e22'
                                    : '1px solid #bdc3c7';

                            div.style.whiteSpace =
                                'nowrap';

                            div.innerHTML =
                                `${actor.name} ` +
                                `<span style="font-size:12px;">` +
                                `(Dist: ${actor.distance}m)` +
                                `</span>`;

                            list.appendChild(
                                div
                            );
                        }
                    );
            }

        } else {

            if (tracker) {

                tracker.style.display =
                    'none';
            }

            if (toggleBtn) {

                toggleBtn.innerText =
                    "⚔️ INIZIA COMBATTIMENTO";

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

        const equipPanelEl =
            document.getElementById(
                'equipped-panel'
            );

        if (equipPanelEl) {

            equipPanelEl.style.display =
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

                if (
                    !selectedCharacterId
                ) {
                    return;
                }

                const type =
                    btn.getAttribute(
                        'data-type'
                    );

                const val =
                    parseInt(
                        btn.getAttribute(
                            'data-val'
                        )
                    );

                const payload = {
                    char_id:
                        selectedCharacterId
                };

                payload[type] =
                    val;

                socket.emit(
                    'update_vitals',
                    payload
                );
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
// DISEGNO
// ==========================================

const toggleDrawBtn =
    document.getElementById(
        'toggle-draw-btn'
    );

const eraserBtn =
    document.getElementById(
        'eraser-btn'
    );

const clearDrawBtn =
    document.getElementById(
        'clear-draw-btn'
    );

toggleDrawBtn
    ?.addEventListener(
        'click',
        () => {

            isDrawingMode =
                !isDrawingMode;

            toggleDrawBtn.innerText =
                isDrawingMode

                    ? "Disegno ON"

                    : "Disegno OFF";

            toggleDrawBtn.style.background =
                isDrawingMode

                    ? "#d4efdf"

                    : "#eee";
        }
    );

eraserBtn
    ?.addEventListener(
        'click',
        () => {

            isEraserMode =
                !isEraserMode;

            eraserBtn.innerText =
                isEraserMode

                    ? "Gomma ON"

                    : "Gomma OFF";

            eraserBtn.style.background =
                isEraserMode

                    ? "#f39c12"

                    : "#eee";
        }
    );

clearDrawBtn
    ?.addEventListener(
        'click',
        () => {

            if (
                confirm(
                    "Cancellare tutto lo scenario?"
                )
            ) {

                socket.emit(
                    'clear_drawings'
                );
            }
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

socket.on(
    'drawing_updated',
    (data) => {

        const index =
            drawings.findIndex(
                d =>
                    d.uid ===
                    data.uid
            );

        if (
            index !== -1
        ) {

            drawings[index] =
                data;

            requestRender();
        }
    }
);

socket.on(
    'drawing_deleted',
    (data) => {

        drawings =
            drawings.filter(
                d =>
                    d.uid !==
                    data.uid
            );

        if (
            window.selectedDrawing &&
            window.selectedDrawing.uid ===
            data.uid
        ) {

            window.selectedDrawing =
                null;
        }

        requestRender();
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

        requestRender();
    }
);

// ==========================================
// STRUMENTI FORME
// ==========================================

document.getElementById(
    'draw-tool-select'
)?.addEventListener(
    'change',
    function(e) {

        const iconSection =
            document.getElementById(
                'icon-upload-section'
            );

        if (!iconSection) {
            return;
        }

        iconSection.style.display =
            e.target.value ===
            'icon'

                ? 'block'

                : 'none';
    }
);

document.getElementById(
    'icon-file-input'
)?.addEventListener(
    'change',
    function(e) {

        const file =
            e.target.files[0];

        if (!file) return;

        const reader =
            new FileReader();

        reader.onload =
            function(evt) {

                currentIconBase64 =
                    evt.target.result;
            };

        reader.readAsDataURL(
            file
        );
    }
);

// ==========================================
// MOVIMENTO
// ==========================================

document.querySelectorAll(
    '.move-btn'
).forEach(
    btn => {

        btn.addEventListener(
            'click',
            (e) => {

                if (
                    !window.pendingMove
                ) {
                    return;
                }

                const framesPerStep =
                    parseInt(
                        e.target.getAttribute(
                            'data-cost'
                        )
                    );

                const modeName =
                    e.target.getAttribute(
                        'data-name'
                    );

                const dist =
                    window.pendingMove.dist;

                let requiredFrames =
                    dist *
                    framesPerStep;

                if (
                    requiredFrames >
                    window.currentPaMov
                ) {

                    alert(
                        `Azione Impossibile! ` +
                        `Servono ${requiredFrames} Frame, ` +
                        `ma ne hai solo ${window.currentPaMov} ` +
                        `a disposizione per muoverti.`
                    );

                    return;
                }

                window.currentPaMov -=
                    requiredFrames;

                window.playersPa[
                    window.pendingMove.charId
                ] =
                    window.currentPaMov;

                const moveModal =
                    document.getElementById(
                        'move-modal'
                    );

                if (moveModal) {

                    moveModal.style.display =
                        'none';
                }

                socket.emit(
                    'sync_pa',
                    {
                        char_id:
                            window.pendingMove.charId,

                        pa:
                            window.currentPaMov
                    }
                );

                socket.emit(
                    'declare_move',
                    {
                        char_id:
                            window.pendingMove.charId,

                        target_x:
                            window.pendingMove.x,

                        target_y:
                            window.pendingMove.y
                    }
                );

                const myChar =
                    characters.find(
                        c =>
                            c.id ===
                            window.pendingMove.charId
                    );

                if (myChar) {

                    const msg =
                        `si sposta di ` +
                        `<b>${dist} passi</b> ` +
                        `(${modeName}) ` +
                        `consumando ` +
                        `<b>${requiredFrames} Frame</b> ` +
                        `movimento.`;

                    socket.emit(
                        'combat_msg',
                        {
                            name:
                                myChar.name,

                            message:
                                msg
                        }
                    );
                }

                window.pendingMove =
                    null;

                requestRender();
            }
        );
    }
);

// ==========================================
// CANCELLA DISEGNO
// ==========================================

document.getElementById(
    'delete-selected-draw-btn'
)?.addEventListener(
    'click',
    () => {

        if (
            window.selectedDrawing
        ) {

            socket.emit(
                'delete_drawing',
                {
                    uid:
                        window.selectedDrawing.uid
                }
            );

            window.selectedDrawing =
                null;

            requestRender();

        } else {

            alert(
                "Seleziona prima un disegno o uno sticker con lo strumento '🖐️ Seleziona e Sposta'!"
            );
        }
    }
);

// ==========================================
// DELETE / BACKSPACE
// ==========================================

document.addEventListener(
    'keydown',
    (e) => {

        if (
            e.target.tagName ===
            'INPUT' ||
            e.target.tagName ===
            'TEXTAREA'
        ) {
            return;
        }

        if (
            (
                e.key === 'Delete' ||
                e.key === 'Backspace'
            )
            &&
            isMaster
            &&
            isDrawingMode
            &&
            window.selectedDrawing
        ) {

            socket.emit(
                'delete_drawing',
                {
                    uid:
                        window.selectedDrawing.uid
                }
            );

            window.selectedDrawing =
                null;

            requestRender();
        }
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
