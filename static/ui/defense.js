// Difesa: attacco in arrivo e scelta della reazione; finestre HUD a tendina.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// DIFESA: RICEZIONE ATTACCO E REAZIONE
// ==========================================
let pendingIncomingAttack = null;

// Attacco annullato dal Master: il popup di reazione si chiude
socket.on('incoming_attack_cancelled', (data) => {
    if (pendingIncomingAttack?.attack_id !== data.attack_id) return;
    pendingIncomingAttack = null;
    document.getElementById('defense-modal').style.display = 'none';
});

socket.on('incoming_attack', (data) => {

    const myCharId =
        parseInt(userSelect?.value);

    const targetChar =
        characters.find(
            c => c.id === data.defender_id
        );

    if (!targetChar) return;

    const isMe =
        myCharId === data.defender_id;

    const isNpcForMaster =
        isMaster &&
        targetChar.role === 'npc';

    if (!isMe && !isNpcForMaster) {
        return;
    }

    pendingIncomingAttack = data;

    let extraInfo = '';

    if (
        data.distance !== null &&
        data.distance !== undefined
    ) {

        extraInfo += `
            <br>
            📏 Distanza:
            <b>${data.distance} m</b>
        `;
    }

    if (
        data.range !== null &&
        data.range !== undefined
    ) {

        extraInfo += `
            &nbsp;|&nbsp;
            🎯 Range:
            <b>${data.range} m</b>
        `;
    }

    if (data.damage_type) {

        extraInfo += `
            <br>
            💥 Tipo danno:
            <b>${data.damage_type}</b>
        `;
    }

    const effectiveFormula =
    data.resolved_damage_formula ||
    data.damage_formula;

    if (effectiveFormula) {

        extraInfo += `
            <br>
            ⚔️ Formula attiva:
            <b>${effectiveFormula}</b>
        `;
    }

    if (
        data.resolved_damage !== null &&
        data.resolved_damage !== undefined
    ) {

        extraInfo += `
            &nbsp;→&nbsp;
            💥
            <b>${data.resolved_damage} danni</b>
        `;
    }

    if (data.damage_note) {

        extraInfo += `
            <br>
            <span style="
                color:#f39c12;
                font-size:11px;
            ">
                ⚠️ ${data.damage_note}
            </span>
        `;
    }

    document.getElementById(
        'defense-alert-text'
    ).innerHTML = `

        <b>${escapeHtml(data.attacker_name)}</b>
        sta attaccando
        <b>${targetChar.name}</b>

        con

        <b>${escapeHtml(data.weapon)}</b>

        a

        <span style="
            color:#e74c3c;
            font-weight:bold;
            font-size:18px;
        ">
            Velocità ${data.speed}
        </span>

        ${extraInfo}
    `;

    applyReactionSpeedFromTable();

    document.getElementById(
        'defense-modal'
    ).style.display = 'block';
});

document.getElementById(
    'reaction-type'
)?.addEventListener(
    'change',
    applyReactionSpeedFromTable
);

document.getElementById('reaction-speed')?.addEventListener('input', (e) => {
    let speed = parseInt(e.target.value) || 0;
    let cost = 110 - speed;
    document.getElementById('reaction-cost').innerText = cost < 0 ? 0 : cost;
    reactionLimbPicker.update({ cost: Math.max(0, cost) });
});

document.getElementById('btn-execute-reaction')?.addEventListener('click', () => {
    if (!pendingIncomingAttack) return;

    const reaction = getSelectedReaction();

    const speed =
        parseInt(
            document.getElementById(
                'reaction-speed'
            ).value
        );

    if (
        !Number.isFinite(speed) ||
        speed <= 0
    ) {
        alert(
            "Questa reazione non ha una velocità definita nella tabella. Inserisci una velocità manuale."
        );
        return;
    }

    const cost =
        Math.max(
            0,
            110 - speed
        );

    // L'ID del difensore reale (Giocatore o NPC)
    const defenderId = pendingIncomingAttack.defender_id;

    reactionLimbPicker.update({ cost, available: window.playersLimbs[defenderId] });
    const shares = reactionLimbPicker.getShares();

    if (!shares) {
        alert(`Frame insufficienti negli arti scelti! Ne servono ${cost}: aggiungi un altro arto.`);
        return;
    }

    // L'arto che paga di più è quello che para (conta per l'equipaggiamento)
    const limb = getMainLimb(shares, reactionLimbPicker.preferred);

    // I frame li scala il server insieme alla risoluzione

    // Invia i dati precisi al server per il calcolo
    socket.emit('resolve_reaction', {
        attack_id: pendingIncomingAttack.attack_id,
        reaction_type: reaction.type,
        reaction_action: reaction.action,
        def_limb: limb,
        def_speed: speed,
        limb_shares: shares,
        exchange_weapon: reaction.type === 'Scambio' ? getExchangeWeaponChoice() : null
    });

    document.getElementById('defense-modal').style.display = 'none';
    pendingIncomingAttack = null;

    if (window.updateCombatActionPanel) window.updateCombatActionPanel();
});

// ==========================================
// RIDUZIONE A TENDINA DELLE FINESTRE HUD
// ==========================================
['tracker', 'action', 'notes'].forEach(prefix => {
    const toggleBtn = document.getElementById(`${prefix}-toggle`);
    const contentDiv = document.getElementById(`${prefix}-content`);
    const headerDiv = document.getElementById(`${prefix}-header`);

    if (toggleBtn && contentDiv) {
        // Blocca il mousedown in modo che cliccando la freccina non si trascini per sbaglio la finestra
        toggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (contentDiv.style.display === 'none') {
                contentDiv.style.display = 'block';
                toggleBtn.innerText = '▼';
                if (prefix === 'equip') headerDiv.style.borderBottom = '2px solid #3498db';
            } else {
                contentDiv.style.display = 'none';
                toggleBtn.innerText = '▶';
                // Nasconde la riga estetica inferiore se chiuso
                if (prefix === 'equip') headerDiv.style.borderBottom = 'none';
            }
        });
    }
});
