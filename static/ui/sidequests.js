// Sidequest: creazione, schede, pagamenti (intero, spesa comune, quote) e ricompense.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

function clearSidequestForge() {
    pendingSidequestWeapon = null;

    const ids = [
        'forge-weapon-name', 'forge-weapon-brand', 'forge-weapon-value',
        'forge-weapon-description', 'forge-weapon-damage', 'forge-weapon-damage-type',
        'forge-weapon-ammo', 'forge-weapon-ammo-qty', 'forge-weapon-base-malus',
        'forge-weapon-aim-time', 'forge-weapon-range-1', 'forge-weapon-malus-1',
        'forge-weapon-range-2', 'forge-weapon-malus-2', 'forge-weapon-range-3',
        'forge-weapon-malus-3', 'forge-weapon-license'
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const hp = document.getElementById('forge-weapon-hp');
    const actionCost = document.getElementById('forge-weapon-action-cost');
    const weight = document.getElementById('forge-weapon-weight');
    const harmonization = document.getElementById('forge-weapon-harmonization');
    const hands = document.getElementById('forge-weapon-hands');
    const targeting = document.getElementById('forge-weapon-targeting');
    const characteristic = document.getElementById('forge-weapon-characteristic');
    const speed = document.getElementById('forge-weapon-speed');

    if (hp) hp.value = '100';
    if (actionCost) actionCost.value = '0';
    if (weight) weight.value = '0';
    if (harmonization) harmonization.value = '0';
    if (hands) hands.value = '1';
    if (targeting) targeting.value = 'Melee';
    if (characteristic) characteristic.value = 'DES';
    if (speed) speed.value = '';

    if (sidequestForgeSummary) {
        sidequestForgeSummary.style.display = 'none';
        sidequestForgeSummary.textContent = '';
    }
}

sidequestForgeToggleBtn?.addEventListener('click', () => {
    if (!sidequestForgeForm) return;
    sidequestForgeForm.style.display =
        sidequestForgeForm.style.display === 'none' ? 'block' : 'none';
});

sidequestForgeBtn?.addEventListener('click', () => {
    const name = forgeFieldValue('forge-weapon-name');
    const damage = forgeNumberValue('forge-weapon-damage');
    const speed = forgeNumberValue('forge-weapon-speed');

    if (!name) {
        alert("Inserisci il nome dell'arma forgiata.");
        return;
    }
    if (damage === null || damage < 0) {
        alert('Inserisci un danno valido.');
        return;
    }
    if (speed === null || speed <= 0) {
        alert("Inserisci una velocità d'attacco valida.");
        return;
    }

    pendingSidequestWeapon = {
        name,
        brand: forgeFieldValue('forge-weapon-brand'),
        value_eur: forgeNumberValue('forge-weapon-value'),
        description: forgeFieldValue('forge-weapon-description'),
        damage,
        damage_type: forgeFieldValue('forge-weapon-damage-type'),
        characteristic: forgeFieldValue('forge-weapon-characteristic') || 'DES',
        hp: forgeNumberValue('forge-weapon-hp') ?? 100,
        action_cost: forgeNumberValue('forge-weapon-action-cost') ?? 0,
        attack_speed: speed,
        hands: forgeNumberValue('forge-weapon-hands') ?? 1,
        targeting: forgeFieldValue('forge-weapon-targeting') || 'Melee',
        ammo: forgeFieldValue('forge-weapon-ammo'),
        ammo_qty: forgeNumberValue('forge-weapon-ammo-qty'),
        base_malus: forgeNumberValue('forge-weapon-base-malus'),
        aim_time: forgeNumberValue('forge-weapon-aim-time'),
        range_1: forgeNumberValue('forge-weapon-range-1'),
        range_malus_1: forgeNumberValue('forge-weapon-malus-1'),
        range_2: forgeNumberValue('forge-weapon-range-2'),
        range_malus_2: forgeNumberValue('forge-weapon-malus-2'),
        range_3: forgeNumberValue('forge-weapon-range-3'),
        range_malus_3: forgeNumberValue('forge-weapon-malus-3'),
        weight: forgeNumberValue('forge-weapon-weight') ?? 0,
        harmonization: forgeNumberValue('forge-weapon-harmonization') ?? 0,
        license_name: forgeFieldValue('forge-weapon-license')
    };

    if (sidequestForgeSummary) {
        sidequestForgeSummary.textContent =
            `✅ Allegata: ${formatForgedWeaponSummary(pendingSidequestWeapon)}`;
        sidequestForgeSummary.style.display = 'block';
    }

    if (sidequestForgeForm) sidequestForgeForm.style.display = 'none';
});

sidequestForgeRemoveBtn?.addEventListener('click', () => {
    clearSidequestForge();
});

function sidequestRewardWeaponSummary(definition) {
    if (!definition) return '';
    const weapon = definition.weapon || {};
    return formatForgedWeaponSummary({
        name: definition.name,
        damage: weapon.damage ?? definition?.combat?.damage?.formula,
        attack_speed: weapon.attack_speed ?? definition?.activation?.speed?.effect_or_action,
        hands: weapon.hands ?? definition?.equipment?.slot?.count,
        targeting: weapon.targeting,
        license_name: weapon.license_name
    });
}

function sidequestRewardWeaponDetails(definition) {
    if (!definition) return [];

    const weapon = definition.weapon || {};
    const equipment = definition.equipment || {};
    const ranges = Array.isArray(weapon.range_bands_m) ? weapon.range_bands_m : [];
    const maluses = Array.isArray(weapon.range_malus) ? weapon.range_malus : [];
    const details = [
        `Caratteristica: ${weapon.characteristic || '-'}`,
        `Vita: ${equipment.hp ?? '-'}`,
        `Costo azione: ${weapon.action_cost ?? '-'}`,
        `Velocità: ${weapon.attack_speed ?? '-'}`,
        `Mani: ${weapon.hands ?? '-'}`,
        `Tipo: ${weapon.targeting || '-'}`
    ];

    if (weapon.ammo) details.push(`Munizioni: ${weapon.ammo} (${weapon.ammo_qty ?? '-'})`);
    if (weapon.base_malus !== null && weapon.base_malus !== undefined) details.push(`Malus base: ${weapon.base_malus}`);
    if (ranges.some(v => v !== null && v !== undefined)) {
        details.push(`Distanze: ${ranges.map(v => v ?? '-').join(' / ')} m`);
    }
    if (maluses.some(v => v !== null && v !== undefined)) {
        details.push(`Malus distanza: ${maluses.map(v => v ?? '-').join(' / ')}`);
    }
    if (weapon.aim_time !== null && weapon.aim_time !== undefined) details.push(`Tempo mira: ${weapon.aim_time}`);
    if (equipment.weight !== null && equipment.weight !== undefined) details.push(`Peso: ${equipment.weight}`);
    if (equipment.harmonization !== null && equipment.harmonization !== undefined) details.push(`Armonizzazione: ${equipment.harmonization}`);
    if (equipment.cost_eur !== null && equipment.cost_eur !== undefined) details.push(`Valore: ${equipment.cost_eur} €`);
    if (weapon.license_name) details.push(`Licenza: ${weapon.license_name}`);

    return details;
}

function sidequestPlayerName(charId) {
    const character = (characters || []).find(char => Number(char.id) === Number(charId));
    return character?.name || `Giocatore #${charId}`;
}

function renderSidequestCard(quest) {
    if (!chatLog || !quest?.id) return;

    let card = document.getElementById(`sidequest-card-${quest.id}`);
    if (!card) {
        card = document.createElement('div');
        card.id = `sidequest-card-${quest.id}`;
        card.className = 'sidequest-card';
        chatLog.appendChild(card);
    }

    card.innerHTML = '';
    card.style.cssText = 'padding:10px;border-radius:7px;border:2px solid #8e44ad;background:#f8f4fb;color:#2c3e50;box-shadow:0 2px 5px rgba(0,0,0,.08);';

    const heading = document.createElement('div');
    heading.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px;';

    const title = document.createElement('strong');
    title.style.cssText = 'color:#6c3483;font-size:14px;';
    title.textContent = `📜 ${quest.title}`;
    heading.appendChild(title);

    const cost = document.createElement('span');
    cost.style.cssText = 'white-space:nowrap;background:#6c3483;color:white;border-radius:12px;padding:3px 7px;font-size:11px;font-weight:bold;';
    const paymentMode = quest.payment_mode || 'each';
    cost.textContent = paymentMode === 'shared'
        ? `${Number(quest.cost || 0)} € in comune`
        : paymentMode === 'assigned'
            ? `${Number(quest.cost || 0)} € in quote`
            : quest.target_char_id == null
                ? `${Number(quest.cost || 0)} € a testa`
                : `${Number(quest.cost || 0)} €`;
    heading.appendChild(cost);
    card.appendChild(heading);

    const target = document.createElement('div');
    target.style.cssText = 'font-size:10px;color:#8e44ad;font-weight:bold;margin-bottom:6px;';
    target.textContent = `Destinatario: ${quest.target_name || 'Tutti i giocatori'}`;
    card.appendChild(target);

    if (quest.description) {
        const description = document.createElement('div');
        description.style.cssText = 'font-size:12px;line-height:1.4;white-space:pre-wrap;margin-bottom:8px;';
        description.textContent = quest.description;
        card.appendChild(description);
    }

    const rewardWeapon = quest.reward_weapon || null;
    const deliveredTo = Array.isArray(quest.reward_delivered_to)
        ? quest.reward_delivered_to.map(Number)
        : [];

    if (rewardWeapon) {
        const rewardBox = document.createElement('div');
        rewardBox.style.cssText = 'margin-top:7px;padding:7px;border:1px solid #dc7633;border-radius:5px;background:#fdf2e9;color:#784212;font-size:11px;line-height:1.4;';
        const rewardTitle = document.createElement('strong');
        rewardTitle.textContent = '🎁 Ricompensa forgiata';
        rewardBox.appendChild(rewardTitle);
        rewardBox.appendChild(document.createElement('br'));
        const rewardText = document.createElement('span');
        rewardText.textContent = sidequestRewardWeaponSummary(rewardWeapon);
        rewardBox.appendChild(rewardText);

        const detailText = sidequestRewardWeaponDetails(rewardWeapon);
        if (detailText.length) {
            const detail = document.createElement('div');
            detail.style.cssText = 'margin-top:4px;color:#935116;';
            detail.textContent = detailText.join(' • ');
            rewardBox.appendChild(detail);
        }

        card.appendChild(rewardBox);
    }

    const paidBy = Array.isArray(quest.paid_by) ? quest.paid_by.map(Number) : [];

    // Spesa comune e quote: stato visibile a tutti
    renderSidequestPaymentStatus(card, quest);

    if (isMaster) {
        if (paymentMode === 'each') {
            const paymentInfo = document.createElement('div');
            paymentInfo.style.cssText = 'font-size:11px;color:#566573;margin-top:5px;';
            paymentInfo.textContent = paidBy.length
                ? `✅ Pagato da: ${paidBy.map(sidequestPlayerName).join(', ')}`
                : '⏳ Nessun pagamento ancora.';
            card.appendChild(paymentInfo);
        }

        if (rewardWeapon) {
            const deliveryRow = document.createElement('div');
            deliveryRow.style.cssText = 'display:flex;gap:5px;margin-top:8px;';

            const recipientSelect = document.createElement('select');
            recipientSelect.style.cssText = 'flex:1;min-width:0;padding:5px;border:1px solid #dc7633;border-radius:4px;background:white;';

            const eligiblePlayers = (characters || []).filter(char =>
                char.role === 'player' &&
                (quest.target_char_id == null || Number(char.id) === Number(quest.target_char_id))
            );

            eligiblePlayers.forEach(char => {
                const option = document.createElement('option');
                option.value = char.id;
                option.textContent = deliveredTo.includes(Number(char.id))
                    ? `${char.name} — già consegnata`
                    : char.name;
                option.disabled = deliveredTo.includes(Number(char.id));
                recipientSelect.appendChild(option);
            });

            const deliverBtn = document.createElement('button');
            deliverBtn.type = 'button';
            deliverBtn.textContent = '🎁 Consegna arma';
            deliverBtn.style.cssText = 'padding:5px 8px;background:#d35400;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;';

            const hasRecipient = [...recipientSelect.options].some(opt => !opt.disabled);
            if (!hasRecipient) {
                deliverBtn.disabled = true;
                deliverBtn.style.background = '#95a5a6';
                deliverBtn.style.cursor = 'not-allowed';
            } else {
                const firstAvailable = [...recipientSelect.options].find(opt => !opt.disabled);
                if (firstAvailable) recipientSelect.value = firstAvailable.value;
            }

            deliverBtn.addEventListener('click', () => {
                const charId = parseInt(recipientSelect.value);
                if (!charId) return;
                const charName = sidequestPlayerName(charId);
                if (!confirm(`Consegnare "${rewardWeapon.name}" a ${charName}?`)) return;
                deliverBtn.disabled = true;
                socket.emit('deliver_sidequest_weapon', {
                    quest_id: quest.id,
                    char_id: charId
                });
            });

            deliveryRow.appendChild(recipientSelect);
            deliveryRow.appendChild(deliverBtn);
            card.appendChild(deliveryRow);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Chiudi sidequest';
        closeBtn.style.cssText = 'margin-top:8px;width:100%;padding:5px;background:#7f8c8d;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;';
        closeBtn.addEventListener('click', () => {
            socket.emit('close_sidequest', { quest_id: quest.id });
        });
        card.appendChild(closeBtn);
    } else {
        const myId = parseInt(userSelect?.value);
        const myChar = (characters || []).find(char => Number(char.id) === Number(myId));
        const alreadyPaid = paidBy.includes(Number(myId));

        if (paymentMode === 'shared') {
            renderSharedPaymentControls(card, quest, myId, myChar);
        } else if (paymentMode === 'assigned' && !(quest.shares || {})[myId] && !alreadyPaid) {
            const noShare = document.createElement('div');
            noShare.className = 'sidequest-note';
            noShare.textContent = 'Il Master non ti ha assegnato una quota.';
            card.appendChild(noShare);
        } else if (alreadyPaid) {
            const paid = document.createElement('div');
            paid.style.cssText = 'margin-top:7px;padding:6px;text-align:center;background:#d5f5e3;color:#196f3d;border-radius:4px;font-weight:bold;font-size:12px;';
            paid.textContent = '✅ PAGATO';
            card.appendChild(paid);
        } else {
            const payBtn = document.createElement('button');
            payBtn.type = 'button';
            payBtn.style.cssText = 'margin-top:7px;width:100%;padding:7px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;';

            const balance = Number(myChar?.xp ?? 0);
            // Con le quote si paga solo la propria parte
            const questCost = paymentMode === 'assigned'
                ? Number((quest.shares || {})[myId] || 0)
                : Number(quest.cost || 0);
            const enoughFunds = balance >= questCost;

            payBtn.textContent = enoughFunds
                ? `💰 Paga ${paymentMode === 'assigned' ? 'la tua quota: ' : ''}${questCost} €`
                : `⛔ Servono ${questCost} € • Saldo ${balance} €`;
            payBtn.disabled = !enoughFunds;
            if (!enoughFunds) {
                payBtn.style.background = '#95a5a6';
                payBtn.style.cursor = 'not-allowed';
            }

            payBtn.addEventListener('click', () => {
                if (!confirm(`Pagare ${questCost} € per "${quest.title}"?`)) return;
                payBtn.disabled = true;
                socket.emit('pay_sidequest', { quest_id: quest.id });
            });
            card.appendChild(payBtn);
        }

        if (rewardWeapon && deliveredTo.includes(Number(myId))) {
            const delivered = document.createElement('div');
            delivered.style.cssText = 'margin-top:6px;padding:6px;text-align:center;background:#fdebd0;color:#935116;border-radius:4px;font-weight:bold;font-size:11px;';
            delivered.textContent = `🎁 Ricompensa consegnata: ${rewardWeapon.name}`;
            card.appendChild(delivered);
        }
    }
}

// Riepilogo dei pagamenti divisi: barra della spesa comune o elenco delle quote
function renderSidequestPaymentStatus(card, quest) {
    const mode = quest.payment_mode || 'each';
    if (mode === 'each') return;

    const box = document.createElement('div');
    box.className = 'sidequest-payment-status';

    if (mode === 'shared') {
        const cost = Number(quest.cost || 0);
        const collected = Number(quest.collected || 0);

        const label = document.createElement('div');
        label.className = 'sidequest-progress-label';
        label.textContent = collected >= cost
            ? `✅ Spesa coperta: ${collected} / ${cost} €`
            : `🧺 Raccolti ${collected} / ${cost} € · mancano ${Number(quest.remaining || 0)} €`;
        box.appendChild(label);

        const bar = document.createElement('div');
        bar.className = 'sidequest-progress';
        const fill = document.createElement('div');
        fill.className = 'sidequest-progress-fill';
        fill.style.width = `${cost ? Math.min(100, collected / cost * 100) : 100}%`;
        bar.appendChild(fill);
        box.appendChild(bar);

        const contributions = Object.entries(quest.contributions || {});
        if (contributions.length) {
            const list = document.createElement('div');
            list.className = 'sidequest-contributors';
            list.textContent = contributions
                .map(([charId, amount]) => `${sidequestPlayerName(charId)} ${amount} €`)
                .join(' · ');
            box.appendChild(list);
        }
    } else {
        const paid = (quest.paid_by || []).map(Number);
        Object.entries(quest.shares || {}).forEach(([charId, amount]) => {
            const row = document.createElement('div');
            row.className = 'sidequest-share-status';
            row.textContent = `${paid.includes(Number(charId)) ? '✅' : '⏳'} ${sidequestPlayerName(charId)}: ${amount} €`;
            box.appendChild(row);
        });
    }

    card.appendChild(box);
}

// Spesa comune: ognuno versa quanto vuole; si propone una parte uguale
function renderSharedPaymentControls(card, quest, myId, myChar) {
    const remaining = Number(quest.remaining || 0);
    const myContribution = Number((quest.contributions || {})[myId] || 0);

    if (myContribution) {
        const mine = document.createElement('div');
        mine.className = 'sidequest-note';
        mine.textContent = `Hai versato ${myContribution} €.`;
        card.appendChild(mine);
    }

    if (remaining <= 0) return;

    const balance = Number(myChar?.xp ?? 0);
    const players = (characters || []).filter(char => char.role === 'player');
    const notYet = players.filter(p => !(quest.contributions || {})[p.id]).length || 1;
    const suggestion = Math.max(1, Math.min(remaining, balance, Math.ceil(remaining / notYet)));

    const row = document.createElement('div');
    row.className = 'sidequest-shared-pay';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(Math.min(remaining, balance));
    input.value = String(suggestion);

    const payBtn = document.createElement('button');
    payBtn.type = 'button';
    payBtn.textContent = '💰 Versa';
    payBtn.disabled = balance < 1;

    payBtn.addEventListener('click', () => {
        const amount = parseInt(input.value) || 0;
        if (amount < 1 || amount > remaining) {
            alert(`Puoi versare da 1 a ${remaining} €.`);
            return;
        }
        if (amount > balance) {
            alert(`Fondi insufficienti: sul conto hai ${balance} €.`);
            return;
        }
        if (!confirm(`Versare ${amount} € per "${quest.title}"?`)) return;
        payBtn.disabled = true;
        socket.emit('pay_sidequest', { quest_id: quest.id, amount });
    });

    row.append(input, payBtn);
    card.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'sidequest-note';
    hint.textContent = `Saldo ${balance} € · parte uguale suggerita: ${suggestion} €`;
    card.appendChild(hint);
}

function refreshSidequestCards() {
    for (const quest of sidequestStore.values()) {
        renderSidequestCard(quest);
    }
}
window.refreshSidequestCards = refreshSidequestCards;

socket.on('sidequest_list', quests => {
    sidequestStore.clear();
    document.querySelectorAll('.sidequest-card').forEach(card => card.remove());
    (quests || []).forEach(quest => {
        sidequestStore.set(Number(quest.id), quest);
        renderSidequestCard(quest);
    });
    if ((quests || []).length) ensureChatOpen();
});

socket.on('sidequest_created', quest => {
    sidequestStore.set(Number(quest.id), quest);
    renderSidequestCard(quest);
    ensureChatOpen();
});

socket.on('sidequest_update', quest => {
    sidequestStore.set(Number(quest.id), quest);
    renderSidequestCard(quest);
});

socket.on('sidequest_removed', data => {
    const questId = Number(data?.id);
    sidequestStore.delete(questId);
    document.getElementById(`sidequest-card-${questId}`)?.remove();
});

socket.on('sidequest_error', data => {
    alert(data?.message || 'Operazione sidequest non riuscita.');
    refreshSidequestCards();
});

sendSidequestBtn?.addEventListener('click', () => {
    if (!isMaster) return;

    const title = sidequestTitle?.value.trim() || '';
    const description = sidequestDescription?.value.trim() || '';
    const cost = parseInt(sidequestCost?.value || '0');
    const targetValue = sidequestTarget?.value || 'all';

    if (!title) {
        alert('Inserisci un titolo per la sidequest.');
        return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
        alert('Inserisci un costo valido.');
        return;
    }

    const paymentMode = targetValue === 'all' ? (sidequestPaymentMode?.value || 'each') : 'each';
    const shares = paymentMode === 'assigned' ? getSidequestShareInputs() : {};

    if (paymentMode === 'assigned' && !Object.values(shares).some(amount => amount > 0)) {
        alert('Assegna una quota ad almeno un giocatore.');
        return;
    }

    // Arma scritta nel modulo "Forgia arma una tantum" ma non ancora allegata:
    // si allega ora (prima la sidequest partiva senza arma, senza avvisare)
    if (!pendingSidequestWeapon && forgeFieldValue('forge-weapon-name')) {
        sidequestForgeBtn?.click();
        if (!pendingSidequestWeapon) return;   // dati dell'arma incompleti: l'avviso è già comparso
    }

    socket.emit('create_sidequest', {
        title,
        description,
        cost,
        target_char_id: targetValue === 'all' ? null : parseInt(targetValue),
        payment_mode: paymentMode,
        shares,
        reward_weapon: pendingSidequestWeapon
    });

    if (sidequestTitle) sidequestTitle.value = '';
    if (sidequestDescription) sidequestDescription.value = '';
    if (sidequestCost) sidequestCost.value = '0';
    document.querySelectorAll('#sidequest-share-rows input').forEach(input => { input.value = ''; });
    clearSidequestForge();
});

// ==========================================
// SIDEQUEST: COME SI DIVIDE IL COSTO
// ==========================================

const sidequestPaymentMode = document.getElementById('sidequest-payment-mode');

function getSidequestShareInputs() {
    const shares = {};
    document.querySelectorAll('#sidequest-share-rows input').forEach(input => {
        const amount = parseInt(input.value) || 0;
        if (amount > 0) shares[input.dataset.charId] = amount;
    });
    return shares;
}

// Con le quote il costo totale è la loro somma
function syncSidequestCostFromShares() {
    if (!sidequestCost) return;
    sidequestCost.value = Object.values(getSidequestShareInputs()).reduce((sum, amount) => sum + amount, 0);
}

function renderSidequestShareInputs() {
    const rows = document.getElementById('sidequest-share-rows');
    if (!rows) return;

    const previous = getSidequestShareInputs();
    rows.innerHTML = '';

    (characters || []).filter(char => char.role === 'player').forEach(player => {
        const row = document.createElement('label');
        row.className = 'sidequest-share-row';

        const name = document.createElement('span');
        name.textContent = player.name;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.placeholder = '0 €';
        input.dataset.charId = player.id;
        input.value = previous[player.id] || '';
        input.addEventListener('input', syncSidequestCostFromShares);

        row.append(name, input);
        rows.appendChild(row);
    });
}

function updateSidequestPaymentUI() {
    const forAll = (sidequestTarget?.value || 'all') === 'all';
    const assigned = forAll && sidequestPaymentMode?.value === 'assigned';

    if (sidequestPaymentMode) sidequestPaymentMode.style.display = forAll ? 'block' : 'none';
    document.getElementById('sidequest-shares')?.classList.toggle('open', assigned);

    if (assigned) {
        renderSidequestShareInputs();
        if (Object.keys(getSidequestShareInputs()).length) syncSidequestCostFromShares();
    }
}

// Divide il costo scritto nel campo in parti uguali (gli spiccioli ai primi)
document.getElementById('btn-sidequest-split-even')?.addEventListener('click', () => {
    const inputs = [...document.querySelectorAll('#sidequest-share-rows input')];
    const total = parseInt(sidequestCost?.value) || 0;

    if (!inputs.length || total <= 0) {
        alert('Scrivi prima il costo totale da dividere.');
        return;
    }

    const base = Math.floor(total / inputs.length);
    const extra = total % inputs.length;
    inputs.forEach((input, index) => { input.value = base + (index < extra ? 1 : 0); });
    syncSidequestCostFromShares();
});

sidequestTarget?.addEventListener('change', updateSidequestPaymentUI);
sidequestPaymentMode?.addEventListener('change', updateSidequestPaymentUI);
updateSidequestPaymentUI();

// --- 4. INVIO LANCIO DADI (BOTTONI E TASTIERA) ---
document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const diceExpr = e.target.getAttribute('data-dice');
        const selectElem = document.getElementById('user-select');
        const charId = selectElem ? parseInt(selectElem.value) : null;

        socket.emit('roll_dice', { dice: diceExpr, char_id: charId, is_master: isMaster });
    });
});

document.getElementById('btn-custom-dice')?.addEventListener('click', () => {
    const input = document.getElementById('custom-dice');
    const diceExpr = input.value.trim();
    const selectElem = document.getElementById('user-select');
    const charId = selectElem ? parseInt(selectElem.value) : null;

    if (diceExpr) {
        socket.emit('roll_dice', { dice: diceExpr, char_id: charId, is_master: isMaster });
        input.value = ''; // Pulisce la barra dopo il lancio
    }
});

document.getElementById('custom-dice')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-custom-dice').click();
    }
});
