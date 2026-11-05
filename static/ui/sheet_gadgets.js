// Abilità dei gadget, conoscenze e sezione gadget della scheda.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// ABILITÀ DEI GADGET
// Ogni gadget posseduto mostra la sua abilità; si usa quando è
// equipaggiato (o subito, se non ha uno slot). Il server spende i PA.
// ==========================================

// Codici di costo del compendio -> statistica ("PA" la sceglie il giocatore)
const GADGET_PA_STATS = { PAA: 'Arguzia', PAV: 'Volontà', PAP: 'Percezione' };

function getCompendiumItemById(id) {
    return (globalCompendio?.items || []).find(item => item.id === id) || null;
}

function getGadgetAbilities(char) {
    const stats = char.stats || {};
    const equipped = [
        ...Object.values(stats.equipped || {}),
        ...Object.values(stats.equipped_gadgets || {})
    ].filter(Boolean);
    const owned = [...(char.backpack || []), ...equipped].filter(entry => entry && entry.compendium_id);

    const seen = new Set();
    const abilities = [];

    owned.forEach(entry => {
        if (seen.has(entry.compendium_id)) return;
        seen.add(entry.compendium_id);

        const item = getCompendiumItemById(entry.compendium_id);
        if (!item || getShopGroup(item) !== 'Gadget') return;

        const activation = item.activation || {};
        const effect = (item.text?.effect_summary || '').trim() ||
            Object.values(item.effects || {}).filter(Boolean).join('; ');
        const costs = Object.entries(activation.cost || {})
            .filter(([code, value]) => code !== 'maintenance' && value !== null && value !== '');

        // Contenitori, caricatori... senza nulla da attivare o da descrivere
        if (!activation.mode && !effect && !costs.length) return;

        const mode = activation.mode || '';
        abilities.push({
            item,
            effect,
            costs,
            mode,
            passive: mode.startsWith('Passivo') && !mode.includes('attiva'),
            equipped: equipped.some(e => e.compendium_id === item.id),
            needsSlot: (item.equipment?.slot?.allowed_slots || []).length > 0,
            maintenance: activation.cost?.maintenance || null
        });
    });

    return abilities;
}

function renderGadgetAbilities(char) {
    const container = document.getElementById('ui-gadget-abilities');
    if (!container) return;

    container.innerHTML = '';
    const abilities = getGadgetAbilities(char);
    if (!abilities.length) return;

    const title = document.createElement('div');
    title.className = 'gadget-abilities-title';
    title.textContent = '🧩 Da gadget';
    container.appendChild(title);

    const canUse = isMaster || parseInt(userSelect?.value) === char.id;
    const statNames = Object.keys(char.stats || {}).filter(key => typeof char.stats[key] !== 'object');

    abilities.forEach(ability => {
        const card = document.createElement('div');
        card.className = 'gadget-ability';
        const usable = !ability.needsSlot || ability.equipped;
        card.classList.toggle('inactive', !usable);

        const head = document.createElement('div');
        head.className = 'gadget-ability-head';
        const name = document.createElement('strong');
        name.textContent = ability.item.name;
        const mode = document.createElement('span');
        mode.className = 'gadget-ability-mode';
        mode.textContent = ability.mode || 'Abilità';
        head.append(name, mode);
        card.appendChild(head);

        if (ability.effect) {
            const effect = document.createElement('div');
            effect.className = 'gadget-ability-effect';
            effect.textContent = ability.effect;
            card.appendChild(effect);
        }

        const costText = [
            ...ability.costs.map(([code, value]) => `${value} ${code}${GADGET_PA_STATS[code] ? ` (${GADGET_PA_STATS[code]})` : ''}`),
            ability.maintenance ? `mantenimento: ${ability.maintenance}` : null
        ].filter(Boolean).join(' · ');

        if (costText) {
            const cost = document.createElement('div');
            cost.className = 'gadget-ability-cost';
            cost.textContent = `Costo: ${costText}`;
            card.appendChild(cost);
        }

        const footer = document.createElement('div');
        footer.className = 'gadget-ability-footer';

        if (!usable) {
            footer.textContent = '⏸ Non equipaggiato: equipaggia il gadget per usarla.';
        } else if (ability.passive) {
            footer.textContent = '✅ Passiva: sempre attiva.';
        } else if (canUse) {
            const controls = {};

            // "PA" generico: il giocatore sceglie la statistica
            if (ability.costs.some(([code]) => code === 'PA')) {
                const select = document.createElement('select');
                statNames.forEach(stat => select.add(new Option(`PA ${stat}`, stat)));
                controls.paStat = select;
                footer.appendChild(select);
            }

            // Costi descritti a parole (es. "2 per metro"): quanti PA spendere
            controls.amounts = {};
            ability.costs
                .filter(([, value]) => typeof value !== 'number' && !/^\d+$/.test(String(value).trim()))
                .forEach(([code, value]) => {
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = '0';
                    input.value = parseInt(value) || 0;
                    input.title = `${code}: ${value}`;
                    controls.amounts[code] = input;
                    footer.appendChild(input);
                });

            const useBtn = document.createElement('button');
            useBtn.type = 'button';
            useBtn.textContent = '⚡ Usa';
            useBtn.addEventListener('click', () => {
                const amounts = {};
                Object.entries(controls.amounts).forEach(([code, input]) => { amounts[code] = parseInt(input.value) || 0; });

                socket.emit('use_gadget_ability', {
                    char_id: char.id,
                    compendium_id: ability.item.id,
                    pa_stat: controls.paStat?.value || null,
                    amounts
                });
            });
            footer.appendChild(useBtn);
        }

        card.appendChild(footer);
        container.appendChild(card);
    });
}

// ==========================================
// CONOSCENZE
// Modificabili dal giocatore (la propria scheda) e dal Master.
// ==========================================

let knowledgeChar = null;

function saveKnowledge(char, knowledge) {
    socket.emit('update_character_sheet', { char_id: char.id, knowledge });
}

function renderKnowledgeSection(char) {
    const list = document.getElementById('ui-knowledge');
    const form = document.getElementById('knowledge-form');
    if (!list) return;

    knowledgeChar = char;
    const canEdit = isMaster || parseInt(userSelect?.value) === char.id;
    const knowledge = Array.isArray(char.knowledge) ? char.knowledge : [];

    if (form) form.style.display = canEdit ? 'flex' : 'none';
    list.innerHTML = '';

    if (!knowledge.length) {
        list.innerHTML = '<li class="knowledge-empty"><em>Nessuna conoscenza.</em></li>';
        return;
    }

    knowledge.forEach((entry, index) => {
        const li = document.createElement('li');
        li.className = 'knowledge-entry';

        const text = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = entry.name;
        text.appendChild(name);
        if (entry.desc) {
            const desc = document.createElement('div');
            desc.className = 'knowledge-desc';
            desc.textContent = entry.desc;
            text.appendChild(desc);
        }
        li.appendChild(text);

        if (canEdit) {
            const actions = document.createElement('div');
            actions.className = 'knowledge-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = '✏️';
            editBtn.title = 'Modifica';
            editBtn.addEventListener('click', () => {
                const newName = prompt('Conoscenza:', entry.name);
                if (newName === null || !newName.trim()) return;
                const newDesc = prompt('Dettagli:', entry.desc || '');
                const updated = knowledge.map((k, i) => (i === index ? { name: newName.trim(), desc: (newDesc ?? k.desc ?? '').trim() } : k));
                saveKnowledge(char, updated);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '🗑️';
            removeBtn.title = 'Elimina';
            removeBtn.addEventListener('click', () => {
                if (confirm(`Eliminare la conoscenza "${entry.name}"?`)) {
                    saveKnowledge(char, knowledge.filter((_, i) => i !== index));
                }
            });

            actions.append(editBtn, removeBtn);
            li.appendChild(actions);
        }

        list.appendChild(li);
    });
}

document.getElementById('knowledge-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!knowledgeChar) return;

    const nameInput = document.getElementById('knowledge-name');
    const descInput = document.getElementById('knowledge-desc');
    const name = nameInput.value.trim();
    if (!name) return;

    const knowledge = Array.isArray(knowledgeChar.knowledge) ? knowledgeChar.knowledge : [];
    saveKnowledge(knowledgeChar, [...knowledge, { name, desc: descInput.value.trim() }]);

    nameInput.value = '';
    descInput.value = '';
});

// ==========================================
// SEZIONE GADGET DELLA SCHEDA GIOCATORE
// ==========================================
function renderGadgetSheetSection(myChar) {
    const availableContainer = document.getElementById('ui-gadgets');
    const equippedContainer = document.getElementById('ui-gadgets-equipped');

    if (!availableContainer || !equippedContainer || !myChar) return;

    availableContainer.innerHTML = '';
    equippedContainer.innerHTML = '';

    const backpack = myChar.backpack || [];
    const currentUserId = parseInt(userSelect?.value);
    const canEdit = isMaster || currentUserId === myChar.id;
    const equippedGadgets = myChar.stats?.equipped_gadgets || {};

    // ---------------- Equipaggiati ----------------
    const seenGroups = new Set();
    let equippedCount = 0;

    Object.entries(equippedGadgets).forEach(([slot, item]) => {
        if (!item) return;

        const groupKey = item.equip_group_id || `${slot}-${item.compendium_id || item.name}`;
        if (seenGroups.has(groupKey)) return;
        seenGroups.add(groupKey);
        equippedCount += 1;

        const linkedSlots = Object.keys(equippedGadgets).filter(key => {
            const candidate = equippedGadgets[key];
            if (!candidate) return false;
            if (item.equip_group_id) return candidate.equip_group_id === item.equip_group_id;
            return key === slot;
        });

        const compItem = findCompendioItem(item);
        const brand = compItem?.brand || '';
        const li = document.createElement('li');
        li.style.cssText = 'background:#f4ecf7;border:1px solid #d2b4de;border-radius:5px;padding:8px;';

        li.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                <div>
                    <strong style="color:#6c3483;">${item.name || 'Gadget'}</strong>
                    ${brand ? `<span style="margin-left:6px;font-size:10px;font-weight:bold;color:#8e44ad;">${brand}</span>` : ''}
                    <div style="font-size:11px;color:#7f8c8d;margin-top:3px;">
                        Montato su: ${linkedSlots.map(s => equipmentSlotLabels[s] || s).join(' + ')}
                    </div>
                </div>
            </div>
        `;

        if (canEdit) {
            const btn = document.createElement('button');
            btn.textContent = 'Sgancia';
            btn.style.cssText = 'margin-top:6px;width:100%;padding:5px;background:#8e44ad;color:white;border:none;border-radius:3px;cursor:pointer;font-weight:bold;';
            btn.onclick = () => window.unequipGadgetFromSlot(myChar.id, slot);
            li.appendChild(btn);
        }

        equippedContainer.appendChild(li);
    });

    if (equippedCount === 0) {
        equippedContainer.innerHTML = '<li style="color:#7f8c8d;font-size:12px;"><em>Nessun gadget equipaggiato.</em></li>';
    }

    // ---------------- Disponibili ----------------
    const gadgetEntries = backpack
        .map((item, index) => ({ item, index }))
        .filter(entry => isGadgetInventoryItem(entry.item));

    gadgetEntries.forEach(({ item: rawItem, index }) => {
        const item = typeof rawItem === 'string'
            ? { name: rawItem, desc: 'Nessuna descrizione', qty: 1 }
            : rawItem;

        const compItem = findCompendioItem(item);
        const brand = compItem?.brand || item.brand || '';
        const allowedSlots = compItem?.equipment?.slot?.allowed_slots || [];
        const usableSlots = getAvailableGadgetSlots(myChar, compItem);
        const missingArmor = getMissingArmorLabelsForGadget(myChar, compItem);
        const occupancy = compItem?.equipment?.slot?.occupancy || 'one';

        const li = document.createElement('li');
        li.style.cssText = 'background:#fff;border:1px solid #ccc;border-radius:5px;padding:8px;';
        li.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                <div>
                    <strong style="color:#2c3e50;font-size:14px;">${item.name}</strong>
                    ${brand ? `<span style="margin-left:6px;font-size:10px;font-weight:bold;color:#8e44ad;">${brand}</span>` : ''}
                </div>
                <span style="font-weight:bold;color:#8e44ad;background:#f4ecf7;padding:2px 6px;border-radius:4px;font-size:12px;">x${item.qty || 1}</span>
            </div>
            <div style="font-size:12px;color:#7f8c8d;margin-top:4px;font-style:italic;line-height:1.3;">${item.desc || getCompendioDescription(compItem)}</div>
        `;

        if (canEdit) {
            const controls = document.createElement('div');
            controls.style.cssText = 'display:flex;gap:5px;margin-top:6px;border-top:1px dashed #eee;padding-top:6px;align-items:center;flex-wrap:wrap;';

            if (allowedSlots.length > 0 && usableSlots.length > 0) {
                const select = document.createElement('select');
                select.style.cssText = 'padding:3px;border-radius:3px;font-size:11px;flex:1;min-width:140px;border:1px solid #ccc;';
                select.innerHTML = '<option value="">-- Monta su armatura --</option>';

                if (occupancy === 'all' && allowedSlots.length > 1) {
                    const option = document.createElement('option');
                    option.value = allowedSlots[0];
                    option.textContent = allowedSlots.map(s => equipmentSlotLabels[s] || s).join(' + ');
                    select.appendChild(option);
                } else {
                    usableSlots.forEach(slot => {
                        const option = document.createElement('option');
                        option.value = slot;
                        option.textContent = equipmentSlotLabels[slot] || slot;
                        select.appendChild(option);
                    });
                }

                select.onchange = () => {
                    if (!select.value) return;
                    window.equipGadget(
                        myChar.id,
                        item.name,
                        item.desc || getCompendioDescription(compItem),
                        select.value,
                        item.compendium_id || compItem?.id || null
                    );
                };

                controls.appendChild(select);
            } else if (allowedSlots.length > 0) {
                const warning = document.createElement('div');
                warning.style.cssText = 'flex:1;min-width:100%;font-size:11px;color:#c0392b;font-weight:bold;';
                warning.textContent = missingArmor.length > 0
                    ? `Richiede armatura: ${[...new Set(missingArmor)].join(' / ')}`
                    : 'Nessuno slot armatura compatibile disponibile.';
                controls.appendChild(warning);
            }

            const minus = document.createElement('button');
            minus.textContent = '-';
            minus.style.cssText = 'padding:2px 8px;background:#e74c3c;color:white;border:none;border-radius:3px;cursor:pointer;font-weight:bold;';
            minus.onclick = () => window.updateBackpackItem(myChar.id, index, -1);

            const plus = document.createElement('button');
            plus.textContent = '+';
            plus.style.cssText = 'padding:2px 8px;background:#2ecc71;color:white;border:none;border-radius:3px;cursor:pointer;font-weight:bold;';
            plus.onclick = () => window.updateBackpackItem(myChar.id, index, 1);

            const trash = document.createElement('button');
            trash.textContent = '🗑️';
            trash.style.cssText = 'padding:2px 8px;background:#7f8c8d;color:white;border:none;border-radius:3px;cursor:pointer;margin-left:auto;';
            trash.onclick = () => window.removeBackpackItem(myChar.id, index);

            controls.appendChild(minus);
            controls.appendChild(plus);
            controls.appendChild(trash);
            li.appendChild(controls);
        }

        availableContainer.appendChild(li);
    });

    if (gadgetEntries.length === 0) {
        availableContainer.innerHTML = '<li style="color:#7f8c8d;font-size:12px;"><em>Nessun gadget disponibile.</em></li>';
    }
}
