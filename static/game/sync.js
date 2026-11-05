// Aggiornamenti dal server: combattimento, nebbia di guerra, personaggi, movimenti rifiutati, cancellazioni.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

    // Muri e fumo bloccano la vista
    const newHexes =
        visibleHexes.filter(
            h => {
                const [col, row] = h.split(',').map(Number);
                return !window.revealedHexes.has(h) && hasLineOfSight(x, y, col, row);
            }
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
            not_your_turn: "⛔ Movimento rifiutato: non è il tuo turno.",
            wall: "⛔ Movimento rifiutato: un muro blocca il percorso.",
            barricade_pa: "🧱 Movimento rifiutato: non hai abbastanza PA per scavalcare la barricata.",
            barricade_stat: "🧱 Movimento rifiutato: scegli la statistica per scavalcare la barricata."
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
