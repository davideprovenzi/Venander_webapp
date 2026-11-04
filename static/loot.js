// ==========================================
// BOTTINO
// Il Master sceglie dal pannello Selezione cosa si può prendere dal corpo di
// un NPC. Quando l'NPC è a terra il suo corpo mostra 💰: un giocatore
// adiacente ci clicca sopra, fruga e prende quello che vuole.
// Fuori combattimento è gratis, in combattimento costa un'azione nel proprio turno.
// ==========================================
const LOOT_REACH = 1;

function isCorpse(char) {
    if (!char || char.role !== 'npc' || char.is_hidden) return false;
    return char.hp_current !== undefined ? char.hp_current <= 0 : !!char.is_defeated;
}

function lootLabel(entry) {
    if (entry.kind === 'money') return `💶 ${entry.amount} €`;
    const icon = entry.kind === 'weapon' ? '⚔️' : '🎒';
    const qty = (entry.qty || 1) > 1 ? ` ×${entry.qty}` : '';
    const dur = entry.item?.durability_max ? ` (${entry.item.durability_current ?? entry.item.durability_max}/${entry.item.durability_max})` : '';
    return `${icon} ${entry.item?.name || 'Oggetto'}${qty}${dur}`;
}

// ------------------------------------------
// Mappa: 💰 sui corpi con qualcosa da prendere (il Master lo vede anche da vivi)
// ------------------------------------------
window.drawLootBadges = function() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(HEX_SIZE * 0.7)}px Arial`;
    characters.forEach(char => {
        if (char.role !== 'npc' || !(char.loot || []).length) return;
        if (!isMaster && (!isCorpse(char) || !isNpcVisibleToPlayers(char))) return;
        if (!isMaster && window.fowEnabled && !window.revealedHexes.has(`${char.x},${char.y}`)) return;
        const p = hexToPixel(char.x, char.y);
        ctx.globalAlpha = isCorpse(char) ? 1 : 0.5;
        ctx.fillText('💰', p.x - HEX_SIZE * 0.5, p.y - HEX_SIZE * 0.5);
    });
    ctx.restore();
};

// ------------------------------------------
// Giocatore: finestra del bottino
// ------------------------------------------
let openLootNpcId = null;

function myCharacter() {
    return characters.find(c => c.id === parseInt(userSelect?.value)) || null;
}

function renderLootModal() {
    const modal = document.getElementById('loot-modal');
    const body = document.getElementById('loot-body');
    if (!modal || !body) return;

    const npc = characters.find(c => c.id === openLootNpcId);
    const me = myCharacter();
    const loot = npc?.loot || [];
    if (!npc || !me || !isCorpse(npc) || !loot.length) {
        if (openLootNpcId !== null && npc) statusBar.innerText = `💰 Non c'è più niente da prendere su ${npc.name}.`;
        modal.classList.remove('open');
        openLootNpcId = null;
        return;
    }

    const fighting = combatState.is_active && (combatState.turn_order || []).some(e => Number(e.id) === me.id);
    const rule = findActionSpeedRule('Raccogliere un oggetto da terra');
    document.getElementById('loot-title').textContent =
        `💰 Bottino di ${npc.name}` + (fighting ? ` · ${rule?.frames ?? 40} frame per presa` : '');

    body.innerHTML = '';
    loot.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'loot-row';

        const label = document.createElement('div');
        label.className = 'loot-label';
        label.textContent = lootLabel(entry);
        if (entry.item?.desc) label.title = entry.item.desc;
        row.appendChild(label);

        let qtyInput = null;
        if (entry.kind === 'item' && (entry.qty || 1) > 1) {
            qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '1';
            qtyInput.max = String(entry.qty);
            qtyInput.value = String(entry.qty);
            qtyInput.title = 'Quanti prenderne';
            row.appendChild(qtyInput);
        }

        const take = document.createElement('button');
        take.type = 'button';
        take.textContent = 'Prendi';
        take.addEventListener('click', () => {
            socket.emit('loot_take', {
                char_id: me.id, npc_id: npc.id, loot_id: entry.id,
                qty: qtyInput ? parseInt(qtyInput.value) || 1 : null
            });
        });
        row.appendChild(take);
        body.appendChild(row);
    });

    document.getElementById('loot-take-all').onclick = () => {
        socket.emit('loot_take', { char_id: me.id, npc_id: npc.id, all: true });
    };
    modal.classList.add('open');
}

window.tryOpenLootAt = function(col, row) {
    const npc = characters.find(c => c.x === col && c.y === row && isCorpse(c) && (c.loot || []).length);
    if (!npc) return false;
    const me = myCharacter();
    if (!me) return false;
    if (hexDistance(me.x, me.y, npc.x, npc.y) > LOOT_REACH) {
        statusBar.innerText = `💰 Avvicinati a ${npc.name} (esagono accanto) per frugarlo.`;
        return true;
    }
    openLootNpcId = npc.id;
    renderLootModal();
    return true;
};

document.getElementById('loot-close')?.addEventListener('click', () => {
    openLootNpcId = null;
    document.getElementById('loot-modal')?.classList.remove('open');
});

// ------------------------------------------
// Master: cosa lasciare nel bottino (pannello Selezione)
// ------------------------------------------
window.renderLootEditor = function(char) {
    const box = document.getElementById('sel-loot');
    if (!box) return;
    const show = isMaster && char?.role === 'npc';
    box.style.display = show ? 'block' : 'none';
    if (!show) return;
    // Non si ridisegna mentre il Master scrive una quantità
    if (box.contains(document.activeElement) && box.dataset.charId === String(char.id)) return;
    box.dataset.charId = char.id;
    box.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'sel-frames-title';
    title.textContent = isCorpse(char) ? '💰 Bottino (a terra: i giocatori possono frugarlo)' : '💰 Bottino (visibile quando è a terra)';
    box.appendChild(title);

    // Già nel bottino
    const lootList = document.createElement('div');
    lootList.className = 'sel-loot-list';
    (char.loot || []).forEach(entry => {
        const row = document.createElement('div');
        row.className = 'sel-loot-row in-loot';
        const label = document.createElement('span');
        label.textContent = lootLabel(entry);
        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = '↩';
        back.title = entry.kind === 'money' ? 'Togli il denaro dal bottino' : "Rimetti l'oggetto addosso all'NPC";
        back.addEventListener('click', () => socket.emit('loot_return', { char_id: char.id, loot_id: entry.id }));
        row.append(label, back);
        lootList.appendChild(row);
    });
    if (!(char.loot || []).length) lootList.textContent = 'Ancora niente: scegli qui sotto cosa si potrà prendere.';
    box.appendChild(lootList);

    // Addosso all'NPC: ➕ lo mette nel bottino
    const sources = [];
    (char.backpack || []).forEach((item, index) => {
        if (item && typeof item === 'object' && !item.npc_ammo) sources.push({ source: 'backpack', index, item, label: `🎒 ${item.name}`, qty: item.qty || 1 });
    });
    (char.weapons || []).forEach((item, index) => {
        if (item && typeof item === 'object') sources.push({ source: 'weapons', index, item, label: `⚔️ ${item.name}`, qty: 1 });
    });
    ['equipped', 'equipped_gadgets'].forEach(source => {
        const seen = new Set();
        Object.entries(char.stats?.[source] || {}).forEach(([slot, item]) => {
            if (!item || typeof item !== 'object') return;
            const group = item.equip_group_id || slot;
            if (seen.has(group)) return;
            seen.add(group);
            sources.push({ source, slot, item, label: `🛡️ ${item.name} (indossato)`, qty: 1 });
        });
    });

    const onNpc = document.createElement('details');
    onNpc.className = 'sel-loot-sources';
    onNpc.open = true;
    const summary = document.createElement('summary');
    summary.textContent = `Addosso all'NPC (${sources.length})`;
    onNpc.appendChild(summary);
    sources.forEach(src => {
        const row = document.createElement('div');
        row.className = 'sel-loot-row';
        const label = document.createElement('span');
        label.textContent = src.label + (src.qty > 1 ? ` ×${src.qty}` : '');
        row.appendChild(label);
        let qty = null;
        if (src.qty > 1) {
            qty = document.createElement('input');
            qty.type = 'number';
            qty.min = '1';
            qty.max = String(src.qty);
            qty.value = String(src.qty);
            row.appendChild(qty);
        }
        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = '➕';
        add.title = 'Mettilo nel bottino';
        add.addEventListener('click', () => socket.emit('loot_add', {
            char_id: char.id, source: src.source, index: src.index, slot: src.slot,
            qty: qty ? parseInt(qty.value) || 1 : null
        }));
        row.appendChild(add);
        onNpc.appendChild(row);
    });
    if (!sources.length) onNpc.appendChild(document.createTextNode('Niente addosso.'));
    box.appendChild(onNpc);

    // Denaro
    const money = document.createElement('div');
    money.className = 'sel-loot-row';
    money.innerHTML = '<span>💶 Denaro</span>';
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '1';
    amount.placeholder = '€';
    const addMoney = document.createElement('button');
    addMoney.type = 'button';
    addMoney.textContent = '➕';
    addMoney.title = 'Aggiungi denaro al bottino';
    addMoney.addEventListener('click', () => {
        const value = parseInt(amount.value);
        if (value > 0) socket.emit('loot_add', { char_id: char.id, source: 'money', amount: value });
    });
    money.append(amount, addMoney);
    box.appendChild(money);
};

// Il corpo o il giocatore cambiano (qualcuno ha preso qualcosa, l'NPC si rialza...): si riallinea
socket.on('update_character', (data) => {
    if (openLootNpcId === null) return;
    if (data?.id === openLootNpcId || data?.id === parseInt(userSelect?.value)) setTimeout(renderLootModal, 0);
});
