// Frame e arti in combattimento.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// LOGICA COMBATTIMENTO: FRAME E ARTI
// ==========================================
window.playersLimbs = {}; // Memoria locale dei frame (sincronizzata col server)

function getAttackDataFromEquippedItem(item) {
    if (!item) return null;

    const compItem =
        findCompendioItem(item);

    if (!compItem) return null;

    const speed =
        compItem?.activation?.speed?.effect_or_action ??
        compItem?.activation?.speed?.activation ??
        null;

    const range =
        compItem?.combat?.range?.max_m ??
        null;

    const damage =
        compItem?.combat?.damage?.formula ??
        null;

    const damageType =
        compItem?.combat?.damage?.type ??
        null;

    return {
        compItem,
        speed,
        range,
        damage,
        damageType
    };
}

function getCombatDistance(
    attackerId,
    targetId
) {
    const attacker =
        characters.find(
            c => c.id === attackerId
        );

    const target =
        characters.find(
            c => c.id === targetId
        );

    if (!attacker || !target) {
        return null;
    }

    return hexDistance(
        attacker.x,
        attacker.y,
        target.x,
        target.y
    );
}

// Un'arma legata a un arto (mano, guanto, avambraccio, spalla, stivale)
// si usa solo con i frame di quell'arto: il selettore viene bloccato.
// Cintura, petto, schiena ecc. lasciano scegliere liberamente.
function syncAttackLimb() {
    const limbSelect = document.getElementById('attack-limb');
    const option = document.getElementById('attack-weapon')?.selectedOptions[0];
    if (!limbSelect) return;

    const weaponLimb = option?.dataset.limb || '';
    if (weaponLimb) limbSelect.value = weaponLimb;

    limbSelect.disabled = !!weaponLimb;
    limbSelect.title = weaponLimb
        ? "L'arma si usa con l'arto su cui è equipaggiata"
        : '';
}

function updateAttackWeaponInfo() {

    syncAttackLimb();
    updateAttackAmmoRow();
    updateAttackAimRow();

    const actionSelect =
        document.getElementById(
            'attack-weapon'
        );

    const targetSelect =
        document.getElementById(
            'attack-target'
        );

    const infoPanel =
        document.getElementById(
            'attack-weapon-info'
        );

    if (
        !actionSelect ||
        !targetSelect ||
        !infoPanel
    ) {
        return;
    }

    const option =
        actionSelect.selectedOptions[0];

    if (!option) {
        infoPanel.style.display = 'none';
        return;
    }

    // ==========================================
    // VELOCITÀ
    // ==========================================

    const speed =
        option.dataset.speed !== undefined
            ? Number(option.dataset.speed)
            : null;

    const speedRaw =
        option.dataset.speedRaw || null;

    const speedInput =
        document.getElementById(
            'attack-speed'
        );

    if (speedInput) {

        if (speed !== null) {

            speedInput.value = speed;
            speedInput.readOnly = true;

            speedInput.dataset.autoSpeed = '1';

            speedInput.style.opacity = '0.75';

        } else {

            // Se prima conteneva un valore automatico
            // lo puliamo.
            if (
                speedInput.dataset.autoSpeed === '1'
            ) {
                speedInput.value = '';
            }

            speedInput.readOnly = false;

            speedInput.dataset.autoSpeed = '0';

            speedInput.style.opacity = '1';

            speedInput.placeholder =
                'Velocità manuale';
        }
    }

    const displayedSpeed =
        speed !== null
            ? speed
            : (
                speedRaw ||
                'Da inserire'
            );

    document.getElementById(
        'attack-info-speed'
    ).innerText =
        displayedSpeed;

    // ==========================================
    // COSTO FRAME
    // ==========================================

    if (speed !== null) {

        const cost =
            Math.max(
                0,
                110 - speed
            );

        document.getElementById(
            'attack-cost'
        ).innerText = cost;

    } else {

        document.getElementById(
            'attack-cost'
        ).innerText = '-';
    }

    // ==========================================
    // RANGE
    // ==========================================

    const range =
        option.dataset.range !== undefined
            ? Number(option.dataset.range)
            : null;

    document.getElementById(
        'attack-info-range'
    ).innerText =
        range !== null
            ? `${range} m`
            : 'N/D';

    // ==========================================
    // DANNO
    // ==========================================

    const damage =
        option.dataset.damage || 'N/D';

    const damageType =
        option.dataset.damageType || '';

    document.getElementById(
        'attack-info-damage'
    ).innerText =
        damageType
            ? `${damage} — ${damageType}`
            : damage;

    // ==========================================
    // DISTANZA
    // ==========================================

    const targetId =
        parseInt(
            targetSelect.value
        );

    let distance = null;

    if (
        targetId &&
        combatState?.turn_order?.length
    ) {

        const actor =
            combatState.turn_order[
                combatState.current_index
            ];

        const attackerId =
            actor.id !== undefined
                ? actor.id
                : actor.char_id;

        distance =
            getCombatDistance(
                attackerId,
                targetId
            );
    }

    const distanceEl =
        document.getElementById(
            'attack-info-distance'
        );

    if (distance === null) {

        distanceEl.innerText = '-';
        distanceEl.style.color = '';

    } else {

        distanceEl.innerText =
            `${distance} m`;

        if (
            range !== null &&
            distance > range
        ) {

            distanceEl.innerText +=
                ' — FUORI RANGE';

            distanceEl.style.color =
                '#e74c3c';

        } else {

            distanceEl.style.color =
                '#2ecc71';
        }
    }

    infoPanel.style.display =
        'block';
}

// Aggiorna l'HUD dell'attaccante
