// Pannello d'attacco: azioni offensive dall'equipaggiamento, bersagli, invio dell'attacco.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// AZIONI OFFENSIVE DA EQUIPAGGIAMENTO
// ==========================================

function getSlotCombatLimb(slot) {
    const map = {
        mano_dx: 'bd',
        guanto_dx: 'bd',
        avambr_dx: 'bd',
        spalla_dx: 'bd',

        mano_sx: 'bs',
        guanto_sx: 'bs',
        avambr_sx: 'bs',
        spalla_sx: 'bs',

        stivale_dx: 'gd',
        stivale_sx: 'gs'
    };

    return map[slot] || null;
}

function isOffensiveCompendiumItem(compItem) {
    if (!compItem) return false;

    const type = String(
        compItem.type || ''
    ).toLowerCase();

    const damage = String(
        compItem?.combat?.damage?.formula || ''
    ).trim();

    // Se è dichiarato offensivo, entra sicuramente
    if (type.includes('offensiv')) {
        return true;
    }

    // Alcuni oggetti non sono classificati "Offensivo"
    // ma possono comunque infliggere danno.
    if (
        damage &&
        damage.toLowerCase() !== 'clone: 0'
    ) {
        return true;
    }

    return false;
}

function getNumericSpeed(rawSpeed) {
    if (
        rawSpeed === null ||
        rawSpeed === undefined ||
        rawSpeed === ''
    ) {
        return null;
    }

    if (typeof rawSpeed === 'number') {
        return rawSpeed;
    }

    // Esempio:
    // "50; 85 dal 2° turno" -> 50
    const match = String(rawSpeed).match(
        /-?\d+(?:[.,]\d+)?/
    );

    if (!match) return null;

    return Number(
        match[0].replace(',', '.')
    );
}

function getCompendiumAttackSpeed(compItem) {
    if (!compItem) {
        return {
            raw: null,
            numeric: null
        };
    }

    const raw =
        compItem?.activation?.speed?.effect_or_action ??
        compItem?.activation?.speed?.activation ??
        null;

    return {
        raw: raw,
        numeric: getNumericSpeed(raw)
    };
}

function getCompendiumAttackRange(compItem) {
    if (!compItem) return null;

    const explicitRange =
        compItem?.combat?.range?.max_m;

    if (
        explicitRange !== null &&
        explicitRange !== undefined &&
        explicitRange !== ''
    ) {
        return Number(explicitRange);
    }

    const type = String(
        compItem.type || ''
    ).toLowerCase();

    const mode = String(
        compItem?.activation?.mode || ''
    ).toLowerCase();

    // Corpo a corpo = esagono adiacente
    if (
        type.includes('corpo a corpo') ||
        mode.includes('colpo senz')
    ) {
        return 1;
    }

    // Alcuni attacchi a cono hanno la distanza
    // dentro "Dimensione area".
    const shape = String(
        compItem?.combat?.area?.shape || ''
    ).toLowerCase();

    const size = String(
        compItem?.combat?.area?.size || ''
    );

    if (
        shape.includes('cono') ||
        shape.includes('linea')
    ) {
        const match = size.match(
            /(\d+(?:[.,]\d+)?)\s*m/i
        );

        if (match) {
            return Number(
                match[1].replace(',', '.')
            );
        }
    }

    return null;
}

function collectCombatActions(char) {
    const equipped =
        char?.stats?.equipped || {};

    const equippedGadgets =
        char?.stats?.equipped_gadgets || {};

    const actions = [];

    const seenGroups = new Set();

    const slotOrder = [
        'mano_dx',
        'mano_sx',

        'guanto_dx',
        'guanto_sx',

        'avambr_dx',
        'avambr_sx',

        'spalla_dx',
        'spalla_sx',

        'petto',
        'cintura',
        'schiena',

        'stivale_dx',
        'stivale_sx',

        'visore',
        'elmo',
        'gambe'
    ];

    const actionSources = [
        ...slotOrder.map(slot => ({ slot, item: equipped[slot] })),
        ...slotOrder
            .filter(slot => slot !== 'mano_dx' && slot !== 'mano_sx')
            .map(slot => ({ slot, item: equippedGadgets[slot] }))
    ];

    actionSources.forEach(({ slot, item }) => {

        if (!item) return;

        // Evita che un oggetto x2 venga mostrato due volte.
        const groupKey =
            item.equip_group_id ||
            `${slot}-${item.compendium_id || item.name}`;

        if (seenGroups.has(groupKey)) {
            return;
        }

        const compItem =
            findCompendioItem(item);

        // Le armi nelle mani vengono mantenute anche
        // se sono vecchi oggetti non presenti nel compendio.
        const isHandWeapon =
            slot === 'mano_dx' ||
            slot === 'mano_sx';

        if (
            !isHandWeapon &&
            !isOffensiveCompendiumItem(compItem)
        ) {
            return;
        }

        seenGroups.add(groupKey);

        const speed =
            getCompendiumAttackSpeed(compItem);

        const range =
            getCompendiumAttackRange(compItem);

        const damage =
            compItem?.combat?.damage?.formula ??
            null;

        const damageType =
            compItem?.combat?.damage?.type ??
            null;

        const licenseInfo =
            getWeaponLicenseInfo(compItem);

        const hasLicense =
            characterHasWeaponLicense(
                char,
                compItem
            );

        // Se l'oggetto occupa più arti diversi,
        // non scegliamo arbitrariamente un arto.
        let preferredLimb =
            getSlotCombatLimb(slot);

        const equippedSlots =
            item.equipped_slots || [slot];

        const linkedLimbs = [
            ...new Set(
                equippedSlots
                    .map(getSlotCombatLimb)
                    .filter(Boolean)
            )
        ];

        if (linkedLimbs.length === 1) {
            preferredLimb = linkedLimbs[0];
        }

        if (linkedLimbs.length > 1) {
            preferredLimb = null;
        }

        actions.push({
            id:
                `eq-${groupKey}`,

            name:
                item.name,

            item:
                item,

            compItem:
                compItem,

            slot:
                slot,

            limb:
                preferredLimb,

            compendiumId:
                item.compendium_id ||
                compItem?.id ||
                null,

            speedRaw:
                speed.raw,

            speed:
                speed.numeric,

            range:
                range,

            damage:
                damage,

            damageType:
                damageType,

            licenseInfo:
                licenseInfo,

            hasLicense:
                hasLicense,

            mode:
                compItem?.activation?.mode || null,

            areaShape:
                compItem?.combat?.area?.shape || null
        });
    });

    // ==========================================
    // PUGNI BASE
    // ==========================================

    if (!equipped.mano_dx) {
        actions.push({
            id: 'base-pugno-dx',
            name: 'Pugno Dx',
            slot: 'mano_dx',
            limb: 'bd',
            compendiumId: null,
            speedRaw: null,
            speed: null,
            range: 1,
            damage: null,
            damageType: 'Fisico'
        });
    }

    if (!equipped.mano_sx) {
        actions.push({
            id: 'base-pugno-sx',
            name: 'Pugno Sx',
            slot: 'mano_sx',
            limb: 'bs',
            compendiumId: null,
            speedRaw: null,
            speed: null,
            range: 1,
            damage: null,
            damageType: 'Fisico'
        });
    }

    return actions;
}

window.updateCombatActionPanel = function() {

    const panel =
        document.getElementById('combat-action-panel');

    // ==========================================
    // CONTROLLO COMBATTIMENTO ATTIVO
    // ==========================================

    if (
        !panel ||
        typeof combatState === 'undefined' ||
        !combatState.is_active
    ) {

        if (panel) {
            panel.style.display = 'none';
        }

        return;
    }

    // ==========================================
    // IDENTIFICA IL PERSONAGGIO DI TURNO
    // ==========================================

    let isMyTurn = false;
    let activeCharId = null;

    if (
        combatState.turn_order &&
        combatState.turn_order.length > 0
    ) {

        const currentActor =
            combatState.turn_order[
                combatState.current_index
            ];

        if (currentActor) {

            // Durante un'interruzione agisce chi minaccia
            activeCharId = getActingCombatantId();

            const selectElem =
                document.getElementById(
                    'user-select'
                );

            const myCharId =
                selectElem
                    ? parseInt(selectElem.value)
                    : -1;

            // Turno del giocatore
            if (activeCharId === myCharId) {
                isMyTurn = true;
            }

            // Il Master può sempre visualizzare e gestire
            // il personaggio attualmente di turno.
            if (
                typeof isMaster !== 'undefined' &&
                isMaster
            ) {
                isMyTurn = true;
            }
        }
    }

    // ==========================================
    // NON È IL MIO TURNO
    // ==========================================

    if (
        !isMyTurn ||
        !activeCharId
    ) {

        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';

    // Interruzione da Minacciare: il pannello passa a chi minaccia
    const interrupt = combatState.interrupts?.[0];
    const headerTitle = document.getElementById('action-header-title');
    if (headerTitle) {
        headerTitle.textContent = interrupt
            ? `⚡ INTERRUZIONE: ${interrupt.threatener_name}`
            : '⚔️ AZIONI DI TURNO 🖐️';
    }
    const endInterruptBtn = document.getElementById('btn-end-interrupt');
    if (endInterruptBtn) {
        endInterruptBtn.style.display = interrupt ? 'block' : 'none';
        endInterruptBtn.textContent = interrupt
            ? `✅ Fine interruzione (${interrupt.intruder_name} riprende)`
            : '';
    }

    // Categorie e azioni della tabella (una volta sola, a compendio caricato)
    populateTableActionSection();
    refreshTableActionLimbs();
    updateMoveSection();
    window.renderTrinketCombat?.();

    // ==========================================
    // FRAME ARTI
    // ==========================================

    const myLimbs =
        window.playersLimbs[
            activeCharId
        ] || {
            bd: 60,
            bs: 60,
            gd: 60,
            gs: 60
        };

    const hudBd =
        document.getElementById('hud-bd');

    const hudBs =
        document.getElementById('hud-bs');

    const hudGd =
        document.getElementById('hud-gd');

    const hudGs =
        document.getElementById('hud-gs');

    if (hudBd) hudBd.innerText = myLimbs.bd;
    if (hudBs) hudBs.innerText = myLimbs.bs;
    if (hudGd) hudGd.innerText = myLimbs.gd;
    if (hudGs) hudGs.innerText = myLimbs.gs;

    // ==========================================
    // BERSAGLI
    // ==========================================

    const targetSelect =
        document.getElementById(
            'attack-target'
        );

    if (targetSelect) {

        // Mantiene il bersaglio selezionato
        // durante gli aggiornamenti dell'HUD.
        const previousTarget =
            targetSelect.value;

        targetSelect.innerHTML =
            '<option value="">-- Seleziona Bersaglio --</option>';

        // Minaccia scattata: si può bersagliare solo chi è entrato nell'area
        const threatInterrupt = combatState.interrupts?.[0];

        characters.forEach(char => {
            if (threatInterrupt && char.id !== threatInterrupt.intruder_id) return;

            // Ai giocatori non arrivano gli HP degli NPC, solo se sono a terra
            const isDown = char.hp_current !== undefined
                ? char.hp_current <= 0
                : !!char.is_defeated;

            // Un giocatore non può bersagliare NPC invisibili o fuori vista (muri, fumo)
            const visibleToMe = isMaster || (!char.is_invisible && isNpcVisibleToPlayers(char));

            if (
                char.id !== activeCharId &&
                !isDown &&
                !char.is_hidden &&
                visibleToMe
            ) {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    char.id;

                option.textContent =
                    char.name;

                targetSelect.appendChild(
                    option
                );
            }
        });

        // Ripristina il bersaglio
        // se esiste ancora.
        if (
            [...targetSelect.options]
                .some(
                    option =>
                        option.value ===
                        previousTarget
                )
        ) {

            targetSelect.value =
                previousTarget;
        }

        // Unico bersaglio possibile: già selezionato
        if (threatInterrupt && [...targetSelect.options].some(o => o.value === String(threatInterrupt.intruder_id))) {
            targetSelect.value = String(threatInterrupt.intruder_id);
        }
    }

    // ==========================================
    // PERSONAGGIO ATTIVO
    // ==========================================

    const activeChar =
        characters.find(
            char =>
                char.id === activeCharId
        );

    if (!activeChar) {
        panel.style.display = 'none';
        return;
    }

    // ==========================================
    // SELETTORE AZIONE / ARMA / GADGET
    // ==========================================

    const weaponSelect =
        document.getElementById(
            'attack-weapon'
        );

    if (!weaponSelect) return;

    // Mantiene la selezione precedente
    const previousAction =
        weaponSelect.value;

    weaponSelect.innerHTML = '';

    // Recupera tutte le azioni offensive
    // disponibili dall'equipaggiamento.
    const actions =
        collectCombatActions(
            activeChar
        );

    // ==========================================
    // CREA LE OPTION
    // ==========================================

    actions.forEach(action => {

        const option =
            document.createElement(
                'option'
            );

        option.value =
            action.id;

        // ==========================================
        // ICONA IN BASE ALLO SLOT
        // ==========================================

        let icon = '⚔️';

        if (
            action.name &&
            action.name.includes('Pugno')
        ) {

            icon = '✊';

        } else if (
            action.slot?.includes(
                'guanto'
            )
        ) {

            icon = '🧤';

        } else if (
            action.slot?.includes(
                'avambr'
            )
        ) {

            icon = '🦾';

        } else if (
            action.slot?.includes(
                'stivale'
            )
        ) {

            icon = '🥾';

        } else if (
            action.slot?.includes(
                'spalla'
            )
        ) {

            icon = '🦾';

        } else if (
            action.slot === 'petto'
        ) {

            icon = '🦺';

        } else if (
            action.slot === 'cintura'
        ) {

            icon = '💣';

        } else if (
            action.slot === 'schiena'
        ) {

            icon = '🎒';

        } else if (
            action.slot === 'visore' ||
            action.slot === 'elmo'
        ) {

            icon = '🎯';

        } else if (
            action.slot === 'mano_dx' ||
            action.slot === 'mano_sx'
        ) {

            icon = '🗡️';
        }

        // ==========================================
        // TESTO LATO / ARTO
        // ==========================================

        let sideText = '';

        if (action.limb === 'bd') {

            sideText = ' (Dx)';

        } else if (
            action.limb === 'bs'
        ) {

            sideText = ' (Sx)';

        } else if (
            action.limb === 'gd'
        ) {

            sideText =
                ' (Gamba Dx)';

        } else if (
            action.limb === 'gs'
        ) {

            sideText =
                ' (Gamba Sx)';
        }

        option.textContent =
            `${icon} ${action.name}${sideText}`;

        if (
            action.licenseInfo &&
            !action.hasLicense
        ) {
            option.textContent +=
                ` 🔒 ${action.licenseInfo.name || 'Licenza richiesta'}`;

            option.disabled = true;
        }

        // ==========================================
        // DATI AZIONE
        // ==========================================

        option.dataset.actionName =
            action.name || 'Attacco';

        option.dataset.slot =
            action.slot || '';

        option.dataset.limb =
            action.limb || '';

        option.dataset.compendiumId =
            action.compendiumId || '';

        // Velocità numerica
        if (
            action.speed !== null &&
            action.speed !== undefined
        ) {

            option.dataset.speed =
                action.speed;
        }

        // Valore originale velocità
        if (
            action.speedRaw !== null &&
            action.speedRaw !== undefined
        ) {

            option.dataset.speedRaw =
                String(
                    action.speedRaw
                );
        }

        // Range
        if (
            action.range !== null &&
            action.range !== undefined
        ) {

            option.dataset.range =
                action.range;
        }

        // Danno
        if (
            action.damage !== null &&
            action.damage !== undefined &&
            String(action.damage).trim() !== ''
        ) {

            option.dataset.damage =
                String(
                    action.damage
                );
        }

        // Tipo danno
        if (
            action.damageType
        ) {

            option.dataset.damageType =
                action.damageType;
        }

        // Modalità attivazione
        if (
            action.mode
        ) {

            option.dataset.mode =
                action.mode;
        }

        // Forma area
        if (
            action.areaShape
        ) {

            option.dataset.areaShape =
                action.areaShape;
        }

        weaponSelect.appendChild(
            option
        );
    });

    // ==========================================
    // NESSUNA AZIONE DISPONIBILE
    // ==========================================

    if (
        weaponSelect.options.length === 0
    ) {

        const option =
            document.createElement(
                'option'
            );

        option.value = '';
        option.textContent =
            '-- Nessuna azione offensiva --';

        weaponSelect.appendChild(
            option
        );

        weaponSelect.disabled = true;

    } else {

        weaponSelect.disabled = false;
    }

    // ==========================================
    // RIPRISTINA AZIONE SELEZIONATA
    // ==========================================

    if (
        [...weaponSelect.options]
            .some(
                option =>
                    option.value ===
                    previousAction
            )
    ) {

        weaponSelect.value =
            previousAction;
    }

    // ==========================================
    // AGGIORNA VELOCITÀ / RANGE /
    // DISTANZA / DANNO
    // ==========================================

    if (
        typeof updateAttackWeaponInfo ===
        'function'
    ) {

        updateAttackWeaponInfo();
    }
};

// Frame degli arti aggiornati dal server (azioni, attacchi, reazioni)
socket.on('sync_limbs', (data) => {
    if (!data) return;
    window.playersLimbs[data.char_id] = data.limbs;
    // Il tracker legge i frame da combatState
    if (combatState.players_limbs) combatState.players_limbs[data.char_id] = data.limbs;
    window.updateCombatActionPanel();
    renderTurnOrderList();
});

// Modifica anche l'ascoltatore per chiamarla correttamente
socket.on('combat_update', (data) => {
    if (data.players_limbs) window.playersLimbs = data.players_limbs;
    setTimeout(() => { window.updateCombatActionPanel(); }, 50);
});

// Calcolatore Costo Dinamico (Attacco)
document.getElementById('attack-speed')?.addEventListener('input', (e) => {
    let speed = parseInt(e.target.value) || 0;
    let cost = 110 - speed;
    document.getElementById('attack-cost').innerText = cost < 0 ? 0 : cost;
});

// Seleziona automaticamente l'arto (bd/bs) in base all'arma scelta
// L'arto dell'arma lo imposta (e blocca) syncAttackLimb
document.getElementById('attack-weapon')?.addEventListener('change', updateAttackWeaponInfo);

document.getElementById(
    'attack-target'
)?.addEventListener(
    'change',
    () => {
        updateAttackWeaponInfo();
    }
);

// Sferra Attacco
document.getElementById('btn-execute-attack')?.addEventListener('click', () => {
    const targetId = document.getElementById('attack-target').value;

    const actionSelect = document.getElementById('attack-weapon');

    const actionOption =
        actionSelect.selectedOptions[0];

    if (!actionOption) {
        alert("Nessuna azione offensiva disponibile.");
        return;
    }

    const weaponName =
        actionOption.dataset.actionName ||
        actionOption.textContent;

    const limb = document.getElementById('attack-limb').value;
    const speed =
    parseInt(
        document.getElementById(
            'attack-speed'
        ).value
    );

    if (!Number.isFinite(speed) || speed <= 0) {
    alert("Questa azione non ha ancora una velocità definita. Inseriscila manualmente.");
    return;
    }
    const cost = 110 - speed < 0 ? 0 : 110 - speed;

    // Recupera l'ID di chi sta attaccando (Giocatore o NPC)
    const attackerId = getActingCombatantId();

    if (!targetId) { alert("Seleziona un bersaglio!"); return; }

    const selectedWeaponOption =
    document.getElementById(
        'attack-weapon'
    ).selectedOptions[0];

    const weaponRange =
        selectedWeaponOption?.dataset?.range
            ? Number(
                selectedWeaponOption.dataset.range
            )
            : null;

    const distance =
        getCombatDistance(
            attackerId,
            parseInt(targetId)
        );

    if (
        weaponRange !== null &&
        distance !== null &&
        distance > weaponRange
    ) {

        alert(
            `Bersaglio fuori range!\n` +
            `Distanza: ${distance} m\n` +
            `Range massimo: ${weaponRange} m`
        );

        return;
    }

    let myLimbs = window.playersLimbs[attackerId] || {bd: 60, bs: 60, gd: 60, gs: 60};
    if (myLimbs[limb] < cost) {
        alert(`Frame insufficienti in questo arto! Ne servono ${cost}, ne hai ${myLimbs[limb]}`);
        return;
    }

    const targetSelect = document.getElementById('attack-target');
    const targetName = targetSelect.options[targetSelect.selectedIndex].text;
    const limbName = document.getElementById('attack-limb').options[document.getElementById('attack-limb').selectedIndex].text;

    // --- LA SICURA: Pop-up di conferma ---
    if (!confirm(`⚔️ Confermi l'attacco contro ${targetName}?\nArma: ${weaponName}\nArto: ${limbName} (Costo: ${cost} Frame)`)) {
        return; // Annulla l'attacco
    }

    // I frame li scala il server, dopo aver validato l'attacco

    const attackerName = characters.find(c => c.id === attackerId).name;

    socket.emit('declare_attack', {

        attacker_id:
            attackerId,

        attacker_name:
            attackerName,

        defender_id:
            parseInt(targetId),

        defender_name:
            targetName,

        weapon:
            weaponName,

        speed:
            speed,

        limb:
            limb,

        // Area mirata (facoltativa): il Master vede l'armatura che la copre
        aim:
            document.getElementById('attack-aim')?.value || null,

        // NUOVI DATI
        compendium_id:
            actionOption.dataset.compendiumId ||
            null,

        source_slot:
            actionOption.dataset.slot ||
            null,

        damage_formula:
            actionOption.dataset.damage ||
            null,

        damage_type:
            actionOption.dataset.damageType ||
            null,

        range:
            weaponRange,

        distance:
            distance,

        activation_mode:
            actionOption.dataset.mode ||
            null,

        area_shape:
            actionOption.dataset.areaShape ||
            null
    });

    updateCombatActionPanel();
});
