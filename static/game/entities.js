// Pannello entità del Master: vitali, conto, selezione, rinomina, spawn e cancellazione.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

    renderMasterFramesEditor(char);
    window.renderNpcAmmoEditor?.(char);
    window.renderLootEditor?.(char);

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
