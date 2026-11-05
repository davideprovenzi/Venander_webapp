// Scheda del giocatore: dati, armi, zaino, bonus, negozio; apertura e modifica della scheda (Master).
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// POPOLAMENTO SCHEDA GIOCATORE E SHOP
// ==========================================
// Mette un oggetto del mercato nella scheda: le armi tra le Armi, il resto nello zaino.
// Usata sia per l'acquisto sia per i regali del Master.
function grantShopItem(myChar, item, shopGroup, itemDesc) {
    if (shopGroup === 'Armi') {
        const weapons = [...(myChar.weapons || [])];
        const maxHp = item.equipment?.hp ?? null;

        weapons.push({
            compendium_id: item.id,
            name: item.name,
            brand: item.brand || null,
            desc: itemDesc,
            durability_max: maxHp,
            durability_current: maxHp,
            img: item.img || ''
        });

        socket.emit('update_character_sheet', { char_id: myChar.id, weapons: weapons });
    } else {
        const backpack = [...(myChar.backpack || [])];
        const existingIndex = backpack.findIndex(entry => {
            if (typeof entry === 'string') return entry === item.name;
            return entry.compendium_id === item.id || (!entry.compendium_id && entry.name === item.name);
        });

        if (existingIndex !== -1) {
            const existing = backpack[existingIndex];
            if (typeof existing === 'string') {
                backpack[existingIndex] = { compendium_id: item.id, name: item.name, brand: item.brand || null, desc: itemDesc, qty: 2, img: item.img || '' };
            } else {
                backpack[existingIndex] = { ...existing, qty: (existing.qty || 1) + 1 };
            }
        } else {
            backpack.push({ compendium_id: item.id, name: item.name, brand: item.brand || null, desc: itemDesc, qty: 1, img: item.img || '' });
        }

        socket.emit('update_character_sheet', { char_id: myChar.id, backpack: backpack });
    }
}

function populatePlayerSheetUI(myChar) {
    if (!myChar) return;
    document.getElementById('ui-name').innerText = myChar.name;

    // Gestione bottone Modifica Profilo (Visibile al Master e al proprietario della scheda)
    const btnEditProfile = document.getElementById('btn-edit-profile');
    if (btnEditProfile) {
        const currentUserId = parseInt(userSelect?.value);
        if (isMaster || currentUserId === myChar.id) {
            btnEditProfile.style.display = 'inline-block';
            btnEditProfile.onclick = () => openProfileEdit(myChar);
        } else {
            btnEditProfile.style.display = 'none';
        }
    }

    document.getElementById('ui-hp-current').innerText = myChar.hp_current || 0;
    document.getElementById('ui-hp-max').innerText = myChar.hp_max || 0;
    document.getElementById('ui-stamina-current').innerText = myChar.stamina_current !== undefined ? myChar.stamina_current : 0;
    document.getElementById('ui-stamina-max').innerText = myChar.stamina_max || 0;
    document.getElementById('ui-conc-current').innerText = myChar.conc_current !== undefined ? myChar.conc_current : 0;
    document.getElementById('ui-conc-max').innerText = myChar.conc_max || 0;
    document.getElementById('ui-xp').innerText = myChar.xp || 0;

    // Mostra la Foto Avatar (se presente)
    const photoEl = document.getElementById('ui-photo');
    if (photoEl) {
        photoEl.style.backgroundImage = myChar.photo_url ? `url('${myChar.photo_url}')` : 'none';
        photoEl.style.backgroundSize = 'cover';
        photoEl.style.backgroundPosition = 'center';
    }

    // Mostra la Lore
    const loreEl = document.getElementById('ui-lore');
    if (loreEl) {
        loreEl.innerText = myChar.lore || "Il passato di questo viandante è ancora un mistero...";
    }

    let autoStatus = "Perfetta forma";
    let statusColor = "#27ae60";
    let hpPercent = (myChar.hp_current !== undefined ? myChar.hp_current : 0) / (myChar.hp_max || 1);

    if (hpPercent <= 0) { autoStatus = "Incosciente / Morto"; statusColor = "#000000"; }
    else if (hpPercent <= 0.25) { autoStatus = "Esausto / Ferito Grave"; statusColor = "#c0392b"; }
    else if (hpPercent <= 0.50) { autoStatus = "Stanco / Ferito"; statusColor = "#e74c3c"; }
    else if (hpPercent <= 0.75) { autoStatus = "Affaticato"; statusColor = "#f39c12"; }

    const uiStatus = document.getElementById('ui-status');
    if (uiStatus) { uiStatus.innerText = autoStatus; uiStatus.style.color = statusColor; }

    const statsList = document.getElementById('ui-stats');
    if (statsList) {
        statsList.innerHTML = '';
        if (myChar.stats) {
            for (const [key, value] of Object.entries(myChar.stats)) {
                if (key === 'equipped' || key === 'pa_stats' || typeof value === 'object') continue;

                let maxPa = getStatPaMax(myChar, key);
                let currentPa = (myChar.pa_stats && myChar.pa_stats[key] !== undefined) ? myChar.pa_stats[key] : maxPa;

                const li = document.createElement('li');
                li.style.marginBottom = '8px'; li.style.padding = '8px'; li.style.background = '#f9f9f9';
                li.style.border = '1px solid #ddd'; li.style.borderRadius = '5px'; li.style.display = 'flex';
                li.style.justifyContent = 'space-between'; li.style.alignItems = 'center';
                li.innerHTML = `<div><strong style="font-size:14px;">${key}:</strong> <span style="font-size:14px; font-weight:bold;">${value}</span><br><span style="font-size:12px; color:#8e44ad; font-weight:bold;">PA: ${currentPa} / ${maxPa}</span></div>`;

                if (!isMaster) {
                    const btnContainer = document.createElement('div');
                    btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px'; btnContainer.style.alignItems = 'center';

                    const spendGroup = document.createElement('div');
                    spendGroup.style.display = 'flex'; spendGroup.style.flexDirection = 'column'; spendGroup.style.gap = '3px';

                    const inputSpend = document.createElement('input');
                    inputSpend.type = 'number'; inputSpend.min = 1; inputSpend.max = currentPa; inputSpend.value = 1;
                    inputSpend.style.padding = '2px'; inputSpend.style.border = '1px solid #ccc'; inputSpend.style.borderRadius = '3px'; inputSpend.style.textAlign = 'center'; inputSpend.style.fontSize = '12px';
                    inputSpend.disabled = currentPa <= 0;

                    const btnSpend = document.createElement('button');
                    btnSpend.innerText = "Spendi"; btnSpend.style.background = currentPa > 0 ? '#8e44ad' : '#bdc3c7';
                    btnSpend.style.color = 'white'; btnSpend.style.border = 'none'; btnSpend.style.padding = '4px 8px'; btnSpend.style.borderRadius = '3px'; btnSpend.style.cursor = currentPa > 0 ? 'pointer' : 'not-allowed'; btnSpend.style.fontSize = '12px'; btnSpend.disabled = currentPa <= 0;

                    btnSpend.onclick = () => {
                        let amount = parseInt(inputSpend.value) || 1;
                        if (amount > currentPa) { alert("Non hai abbastanza PA in questa statistica!"); return; }
                        if (amount > 0) socket.emit('spend_pa', { char_id: myChar.id, stat: key, amount: amount });
                    };
                    spendGroup.appendChild(inputSpend); spendGroup.appendChild(btnSpend);

                    btnContainer.appendChild(spendGroup);

                    // Ogni caratteristica si ricarica con la sua risorsa (vedi PA_RESET_COSTS)
                    const reset = PA_RESET_COSTS[key];
                    if (reset) {
                        const pool = PA_RESET_POOLS[reset.pool];
                        const btnReset = document.createElement('button');
                        btnReset.innerHTML = `🔄 ${pool.short}`; btnReset.title = `Spendi ${reset.cost} ${pool.label} per ricaricare i PA`;
                        btnReset.style.background = pool.color; btnReset.style.color = 'white'; btnReset.style.border = 'none'; btnReset.style.padding = '6px 8px'; btnReset.style.borderRadius = '3px'; btnReset.style.cursor = 'pointer'; btnReset.style.fontSize = '12px';
                        btnReset.onclick = () => { if (confirm(`Vuoi spendere ${reset.cost} di ${pool.label} per ricaricare tutti i PA di ${key}?`)) socket.emit('reset_pa', { char_id: myChar.id, stat: key }); };
                        btnContainer.appendChild(btnReset);
                    }
                    li.appendChild(btnContainer);
                }
                statsList.appendChild(li);
            }
        }
    }

    const populateList = (elementId, arrayData) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = '';
        const validItems = (arrayData || []).filter(item => typeof item !== 'string' || (item !== "Nessuna abilità" && item !== "Mani Nude" && item.trim() !== ""));
        if (validItems.length > 0) validItems.forEach(item => { el.innerHTML += `<li style="margin-bottom:3px;">${item}</li>`; });
        else el.innerHTML = `<li style="color:#7f8c8d; font-size:13px;"><em>Nessun elemento</em></li>`;
    };

    populateList('ui-skills', myChar.skills);
    renderGadgetAbilities(myChar);
    window.renderTrinketSheet?.(myChar);
    renderKnowledgeSection(myChar);

    // ======================================
    // ARMI
    // ======================================
    const weaponsContainer = document.getElementById('ui-weapons');
    const btnShowAddWeapon = document.getElementById('btn-show-add-weapon');
    const addWeaponForm = document.getElementById('add-weapon-form');

    if (weaponsContainer) {
        weaponsContainer.innerHTML = '';
        const wpList = myChar.weapons || [];
        const currentUserId = parseInt(userSelect?.value);
        const canEdit = isMaster || currentUserId === myChar.id;

        wpList.forEach((item, index) => {
            // Conversione di sicurezza
            if (typeof item === 'string') item = { name: item, desc: "Nessuna descrizione" };

            const weaponDefinition =
                item.custom_definition && typeof item.custom_definition === 'object'
                    ? item.custom_definition
                    : findCompendioItem(item);

            const forgedWeaponDetails = item.forged && weaponDefinition
                ? sidequestRewardWeaponDetails(weaponDefinition).join(' • ')
                : '';

            const li = document.createElement('li');
            li.style.background = '#fff';
            li.style.border = '1px solid #ccc';
            li.style.borderRadius = '5px';
            li.style.padding = '8px';

            let controlsHtml = '';
            if (canEdit) {
                controlsHtml = `
                    <div style="display: flex; gap: 5px; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px; align-items: center;">
                      <select onchange="window.equipFromList(${myChar.id}, 'weapon', ${index}, this.value)" style="padding: 2px; border-radius: 3px; font-size: 11px; flex: 1; border: 1px solid #ccc;">
                            <option value="">-- Assegna --</option>
                            <option value="mano_dx">Arma Dx</option>
                            <option value="mano_sx">Arma Sx</option>
                        </select>
                        <button onclick="window.removeWeaponItem(${myChar.id}, ${index})" style="padding: 4px 8px; background: #7f8c8d; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">🗑️</button>
                    </div>
                `;
            }

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong style="color: #c0392b; font-size: 15px;">${item.name}</strong>
                </div>
                <div style="font-size: 12px; color: #7f8c8d; margin-top: 4px; font-style: italic; line-height: 1.3;">${item.desc}</div>
                ${forgedWeaponDetails ? `<div style="font-size:11px;color:#a04000;margin-top:5px;line-height:1.35;">🔨 ${forgedWeaponDetails}</div>` : ''}
                ${controlsHtml}
            `;
            weaponsContainer.appendChild(li);
        });

        if (wpList.length === 0) weaponsContainer.innerHTML = `<li style="color:#7f8c8d; font-size:13px; padding: 5px; text-align: center;"><em>Non hai armi equipaggiate.</em></li>`;

        if (canEdit) {
            btnShowAddWeapon.style.display = 'block';
            btnShowAddWeapon.onclick = () => addWeaponForm.style.display = addWeaponForm.style.display === 'none' ? 'block' : 'none';

            const btnConfirm = document.getElementById('btn-confirm-add-weapon');
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

            newBtnConfirm.onclick = () => {
                const name = document.getElementById('new-weapon-name').value.trim();
                const desc = document.getElementById('new-weapon-desc').value.trim();

                if (!name) { alert("Inserisci il nome dell'arma."); return; }

                // Creiamo un'arma unica, senza la quantità
                const newItem = { name, desc };
                const updatedWeapons = [...wpList, newItem];
                socket.emit('update_character_sheet', { char_id: myChar.id, weapons: updatedWeapons });

                document.getElementById('new-weapon-name').value = '';
                document.getElementById('new-weapon-desc').value = '';
                addWeaponForm.style.display = 'none';
            };
        } else {
            btnShowAddWeapon.style.display = 'none';
            addWeaponForm.style.display = 'none';
        }
    }

    // ======================================
    // GESTIONE BONUS PERMANENTI E TEMPORANEI
    // ======================================
    const permContainer = document.getElementById('ui-bonuses-perm');
    const tempContainer = document.getElementById('ui-bonuses-temp');
    const btnShowAddBonus = document.getElementById('btn-show-add-bonus');
    const addBonusForm = document.getElementById('add-bonus-form');

    const canEdit = isMaster || (parseInt(userSelect?.value) === myChar.id);

    // 1. Renderizzazione Bonus Permanenti (Auto-calcolati)
    if (permContainer) {
        permContainer.innerHTML = '';
        let hasPerms = false;

        (myChar.skills || []).forEach(skillName => {
            const b = getSkillBonusInfo(skillName);
            if (b) {
                hasPerms = true;
                permContainer.innerHTML += `<li style="margin-bottom:3px; background: #fdfdfd; border: 1px solid #eee; padding: 4px; border-radius: 4px;"><strong>${skillName}:</strong> <span style="color:#27ae60; font-weight:bold;">+${b.val} ${b.stat}</span></li>`;
            }
        });

        if (!hasPerms) permContainer.innerHTML = `<li><em>Nessun bonus permanente attivo.</em></li>`;
    }

    // 2. Renderizzazione Bonus Temporanei (Manuali)
    if (tempContainer) {
        tempContainer.innerHTML = '';
        const bonusList = Array.isArray(myChar.bonuses) ? myChar.bonuses : [];

        bonusList.forEach((item, index) => {
            if (typeof item === 'string') item = { name: item, desc: "Effetto sconosciuto", turns: 0, hpChange: 0 };

            const li = document.createElement('li');
            li.style.background = '#fff';
            li.style.border = '1px solid #f39c12';
            li.style.borderRadius = '5px';
            li.style.padding = '8px';

            let controlsHtml = '';
            if (canEdit) {
                controlsHtml = `
                    <div style="display: flex; gap: 5px; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px; align-items: center;">
                        <select onchange="window.equipItem(${myChar.id}, '${item.name.replace(/'/g, "\\'")}', '${item.desc.replace(/'/g, "\\'")}', this.value)" style="padding: 2px; border-radius: 3px; font-size: 11px; flex: 1; border: 1px solid #ccc;">
                            <option value="">-- Assegna --</option>
                            <option value="visore">Visore</option>
                            <option value="elmo">Elmo</option>
                            <option value="schiena">Schiena</option>
                            <option value="spalla_dx">Spalla Dx</option>
                            <option value="spalla_sx">Spalla Sx</option>
                            <option value="petto">Pettorali</option>
                            <option value="avambr_dx">Avambraccio Dx</option>
                            <option value="avambr_sx">Avambraccio Sx</option>
                            <option value="cintura">Cintura</option>
                            <option value="guanto_dx">Guanto Dx</option>
                            <option value="guanto_sx">Guanto Sx</option>
                            <option value="gambe">Gambe</option>
                            <option value="stivale_dx">Stivale Dx</option>
                            <option value="stivale_sx">Stivale Sx</option>
                            <option value="mano_dx">Arma Dx</option>
                            <option value="mano_sx">Arma Sx</option>
                            <option value="rimuovi">Rimuovi</option>
                        </select>
                        <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, -1)" style="padding: 2px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">-</button>
                        <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, 1)" style="padding: 2px 8px; background: #2ecc71; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">+</button>
                        <button onclick="window.removeBackpackItem(${myChar.id}, ${index})" style="padding: 2px 8px; background: #7f8c8d; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: auto;">🗑️</button>
                    </div>
                `;
            }

            let turnsHtml = item.turns ? `<span style="background: #c0392b; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px;">Restano: ${item.turns} turni</span>` : "";

            // Etichetta grafica per il danno o la cura a turno
            let hpHtml = "";
            if (item.hpChange && item.hpChange !== 0) {
                const isHeal = item.hpChange > 0;
                hpHtml = `<span style="margin-left: 5px; font-size: 11px; font-weight: bold; color: ${isHeal ? '#27ae60' : '#c0392b'};">(${isHeal ? '+' : ''}${item.hpChange} HP/turno)</span>`;
            }

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong style="color: #d35400; font-size: 14px;">⚡ ${item.name} ${hpHtml}</strong>
                    ${turnsHtml}
                </div>
                <div style="font-size: 12px; color: #555; margin-top: 4px; font-style: italic; line-height: 1.3;">${item.desc}</div>
                ${controlsHtml}
            `;
            tempContainer.appendChild(li);
        });

        if (bonusList.length === 0) tempContainer.innerHTML = `<li style="color:#7f8c8d; font-size:13px; padding: 5px; text-align: center;"><em>Nessun effetto temporaneo.</em></li>`;

        // Gestione form aggiunta bonus
        if (canEdit) {
            btnShowAddBonus.style.display = 'block';
            btnShowAddBonus.onclick = () => addBonusForm.style.display = addBonusForm.style.display === 'none' ? 'block' : 'none';

            const btnConfirm = document.getElementById('btn-confirm-add-bonus');
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

            newBtnConfirm.onclick = () => {
                const name = document.getElementById('new-bonus-name').value.trim();
                const turns = parseInt(document.getElementById('new-bonus-turns').value) || 1;
                const hpChange = parseInt(document.getElementById('new-bonus-hp').value) || 0; // NUOVO VALORE
                const desc = document.getElementById('new-bonus-desc').value.trim();

                if (!name) { alert("Inserisci il nome dell'effetto."); return; }

                const newItem = { name, turns, hpChange, desc };
                const updatedBonuses = [...bonusList, newItem];
                socket.emit('update_character_sheet', { char_id: myChar.id, bonuses: updatedBonuses });

                document.getElementById('new-bonus-name').value = '';
                document.getElementById('new-bonus-turns').value = '1';
                document.getElementById('new-bonus-hp').value = '0';
                document.getElementById('new-bonus-desc').value = '';
                addBonusForm.style.display = 'none';
            };
        } else {
            btnShowAddBonus.style.display = 'none';
            addBonusForm.style.display = 'none';
        }
    }

    // ======================================
    // ZAINO AVANZATO (OGGETTI, QTY E DESCRIZIONE)
    // ======================================
    const backpackContainer = document.getElementById('ui-backpack');
    const btnShowAdd = document.getElementById('btn-show-add-item');
    const addItemForm = document.getElementById('add-item-form');

    if (backpackContainer) {
        backpackContainer.innerHTML = '';
        const bpList = myChar.backpack || [];
        const currentUserId = parseInt(userSelect?.value);
        const canEdit = isMaster || currentUserId === myChar.id;

        // I gadget hanno una sezione dedicata: nello Zaino mostriamo solo il resto.
        const visibleBackpackEntries = bpList
            .map((item, index) => ({ item, index }))
            .filter(entry => !isGadgetInventoryItem(entry.item));

        // Disegna ogni oggetto
        visibleBackpackEntries.forEach(({ item, index }) => {
            // Retrocompatibilità se c'erano vecchie stringhe nel database
            if (typeof item === 'string') item = { name: item, desc: "Nessuna descrizione", qty: 1 };

            const displayCompItem = findCompendioItem(item);
            const displayBrand = displayCompItem?.brand || item.brand || '';

            const li = document.createElement('li');
            li.style.background = '#fff';
            li.style.border = '1px solid #ccc';
            li.style.borderRadius = '5px';
            li.style.padding = '8px';

           let controlsHtml = '';
            if (canEdit) {
                // 1. Cerca la parola "Slot:" nella descrizione dell'oggetto
                const compItem = findCompendioItem(item);
                const allowedSlots =
                    compItem?.equipment?.slot?.allowed_slots || [];

                let selectHtml = '';

                if (allowedSlots.length > 0) {
                    let options =
                        '<option value="">-- Assegna --</option>';

                    const slotLabels = {
                        visore: 'Visore',
                        elmo: 'Elmo',
                        schiena: 'Schiena',
                        spalla_dx: 'Spalla Dx',
                        spalla_sx: 'Spalla Sx',
                        petto: 'Pettorali',
                        avambr_dx: 'Avambraccio Dx',
                        avambr_sx: 'Avambraccio Sx',
                        cintura: 'Cintura',
                        guanto_dx: 'Guanto Dx',
                        guanto_sx: 'Guanto Sx',
                        gambe: 'Gambe',
                        stivale_dx: 'Stivale Dx',
                        stivale_sx: 'Stivale Sx',
                        mano_dx: 'Arma Dx',
                        mano_sx: 'Arma Sx'
                    };

                    const slotInfo =
                        compItem?.equipment?.slot;

                    if (
                        slotInfo?.occupancy === 'all' &&
                        allowedSlots.length > 1
                    ) {

                        const combinedLabel =
                            allowedSlots
                                .map(slot =>
                                    slotLabels[slot] || slot
                                )
                                .join(' + ');

                        options += `
                            <option value="${allowedSlots[0]}">
                                ${combinedLabel}
                            </option>
                        `;

                    } else {

                        allowedSlots.forEach(slot => {

                            options += `
                                <option value="${slot}">
                                    ${slotLabels[slot] || slot}
                                </option>
                            `;

                        });

                    }

                    selectHtml = `
                        <select
                            onchange="window.equipFromList(${myChar.id}, 'backpack', ${index}, this.value)"
                            style="padding:2px; border-radius:3px;
                                font-size:11px; flex:1;
                                border:1px solid #ccc;"
                        >
                            ${options}
                        </select>
                    `;
                }

                // 3. Genera l'HTML (se selectHtml è vuoto, mostra solo i bottoni +/- e Cestino)
                controlsHtml = `
                    <div style="display: flex; gap: 5px; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px; align-items: center;">
                        ${selectHtml}
                        <div style="display: flex; gap: 3px; margin-left: ${selectHtml ? '5px' : '0'};">
                            <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, -1)" style="padding: 2px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">-</button>
                            <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, 1)" style="padding: 2px 8px; background: #2ecc71; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">+</button>
                        </div>
                        <button onclick="window.removeBackpackItem(${myChar.id}, ${index})" style="padding: 2px 8px; background: #7f8c8d; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: auto;">🗑️</button>
                    </div>
                `;
            }
            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: baseline; gap:8px;">
                    <div>
                        <strong style="color: #2c3e50; font-size: 15px;">${item.name}</strong>
                        ${displayBrand ? `<span style="margin-left:6px; font-size:10px; font-weight:bold; color:#8e44ad;">${displayBrand}</span>` : ''}
                    </div>
                    <span style="font-weight: bold; color: #8e44ad; background: #f4ecf7; padding: 2px 6px; border-radius: 4px; font-size: 12px;">x${item.qty}</span>
                </div>
                <div style="font-size: 12px; color: #7f8c8d; margin-top: 4px; font-style: italic; line-height: 1.3;">${item.desc}</div>
                ${controlsHtml}
            `;
            backpackContainer.appendChild(li);
        });

        if (visibleBackpackEntries.length === 0) backpackContainer.innerHTML = `<li style="color:#7f8c8d; font-size:13px; padding: 5px; text-align: center;"><em>Lo zaino non contiene oggetti non-gadget.</em></li>`;

        // Gestione form aggiunta oggetto
        if (canEdit) {
            btnShowAdd.style.display = 'block';
            btnShowAdd.onclick = () => addItemForm.style.display = addItemForm.style.display === 'none' ? 'block' : 'none';

            const btnConfirm = document.getElementById('btn-confirm-add-item');
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

            newBtnConfirm.onclick = () => {
                const name = document.getElementById('new-item-name').value.trim();
                const qty = parseInt(document.getElementById('new-item-qty').value) || 1;
                const desc = document.getElementById('new-item-desc').value.trim();

                if (!name) { alert("Inserisci il nome dell'oggetto."); return; }

                const newItem = { name, qty, desc };
                const updatedBackpack = [...bpList, newItem];
                socket.emit('update_character_sheet', { char_id: myChar.id, backpack: updatedBackpack });

                document.getElementById('new-item-name').value = '';
                document.getElementById('new-item-qty').value = '1';
                document.getElementById('new-item-desc').value = '';
                addItemForm.style.display = 'none';
            };
        } else {
            btnShowAdd.style.display = 'none';
            addItemForm.style.display = 'none';
        }
    }

    renderGadgetSheetSection(myChar);

    const shopAvail = document.getElementById('ui-shop-available');
    const statsSubtabsContainer = document.getElementById('stats-subtabs-container');
    if (!shopAvail || !statsSubtabsContainer) return;

    // Crea il contenitore per i Tipi di Armatura (se non esiste)
    let armorTypeContainer = document.getElementById('armor-type-container');
    if (!armorTypeContainer) {
        armorTypeContainer = document.createElement('div');
        armorTypeContainer.id = 'armor-type-container';
        armorTypeContainer.style.display = 'flex';
        armorTypeContainer.style.flexWrap = 'wrap';
        armorTypeContainer.style.gap = '5px';
        armorTypeContainer.style.marginBottom = '10px';
        // Lo inseriamo PRIMA dei brand, per rispettare l'ordine: Categoria -> Tipo -> Brand
        statsSubtabsContainer.parentNode.insertBefore(armorTypeContainer, statsSubtabsContainer);
    }

    // 1. GESTIONE CATEGORIE (Armature, Gadget, Oggettistica)
    document.querySelectorAll('.shop-tab-btn').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName === currentShopTab) { btn.style.background = '#8e44ad'; btn.style.color = 'white'; }
        else { btn.style.background = 'white'; btn.style.color = '#8e44ad'; }
        btn.onclick = () => { currentShopTab = tabName; populatePlayerSheetUI(myChar); };
    });

    // 2. ARMATURE: prima la zona del corpo, poi (se la zona ne ha più d'uno) il pezzo
    armorTypeContainer.innerHTML = '';
    if (currentShopTab === 'Armature') {
        armorTypeContainer.style.display = 'flex';
        armorTypeContainer.style.flexDirection = 'column';
        const area = ARMOR_AREAS.find(a => a.key === currentArmorArea) || ARMOR_AREAS[0];
        if (currentArmorType !== 'Tutti' && !area.pieces.includes(currentArmorType)) currentArmorType = 'Tutti';

        const areaRow = document.createElement('div');
        areaRow.className = 'armor-area-row';
        ARMOR_AREAS.forEach(a => {
            const areaBtn = document.createElement('button');
            areaBtn.type = 'button';
            areaBtn.className = 'armor-area-btn';
            areaBtn.classList.toggle('active', a.key === area.key);
            areaBtn.innerText = a.label;
            areaBtn.onclick = () => { currentArmorArea = a.key; currentArmorType = 'Tutti'; populatePlayerSheetUI(myChar); };
            areaRow.appendChild(areaBtn);
        });
        armorTypeContainer.appendChild(areaRow);

        if (area.pieces.length > 1) {
            const pieceRow = document.createElement('div');
            pieceRow.className = 'armor-piece-row';
            ['Tutti', ...area.pieces].forEach(type => {
                const typeBtn = document.createElement('button');
                typeBtn.type = 'button';
                typeBtn.className = 'armor-piece-btn';
                typeBtn.classList.toggle('active', type === currentArmorType);
                typeBtn.innerText = type;
                typeBtn.onclick = () => { currentArmorType = type; populatePlayerSheetUI(myChar); };
                pieceRow.appendChild(typeBtn);
            });
            armorTypeContainer.appendChild(pieceRow);
        }
    } else {
        armorTypeContainer.style.display = 'none';
    }

    // 3. GESTIONE MARCHE (Brand)
    statsSubtabsContainer.innerHTML = '';
    getAllBrands().forEach(brandName => {
        const subBtn = document.createElement('button');
        subBtn.innerText = brandName;
        subBtn.style.padding = '4px 8px'; subBtn.style.fontSize = '12px'; subBtn.style.cursor = 'pointer'; subBtn.style.fontWeight = 'bold'; subBtn.style.borderRadius = '3px'; subBtn.style.border = '1px solid #8e44ad';
        if (brandName === currentBrandSubTab) { subBtn.style.background = '#8e44ad'; subBtn.style.color = 'white'; }
        else { subBtn.style.background = 'white'; subBtn.style.color = '#8e44ad'; }
        subBtn.onclick = () => { currentBrandSubTab = brandName; populatePlayerSheetUI(myChar); };
        statsSubtabsContainer.appendChild(subBtn);
    });

    // 4. ESTRAZIONE E FILTRAGGIO INCROCIATO
    let shopItemsToShow = getCompendioItems();

    // Categoria principale
    shopItemsToShow = shopItemsToShow.filter(
        item => getShopGroup(item) === currentShopTab
    );

    // Marca
    if (currentBrandSubTab !== 'Tutti') {
        shopItemsToShow = shopItemsToShow.filter(
            item => item.brand === currentBrandSubTab
        );
    }

    // Zona del corpo e pezzo dell'armatura
    if (currentShopTab === 'Armature') {
        const area = ARMOR_AREAS.find(a => a.key === currentArmorArea) || ARMOR_AREAS[0];
        const wanted = currentArmorType !== 'Tutti' ? [currentArmorType] : area.pieces;
        shopItemsToShow = shopItemsToShow.filter(item => {
            const piece = armorPieceOf(item);
            // Pezzi senza slot riconoscibile: solo in "Tutte"
            return piece ? wanted.includes(piece) : area.key === 'Tutte';
        });
    }

    // 5. Disegno degli Oggetti Acquistabili
    shopAvail.innerHTML = '';
    if (shopItemsToShow.length > 0) {
        let availCount = 0;

        shopItemsToShow.forEach(item => {
            const li = document.createElement('li');
            li.style.padding = '12px';
            li.style.border = '1px solid #ccc';
            li.style.borderRadius = '8px';
            li.style.display = 'flex';
            li.style.flexDirection = 'column';
            li.style.justifyContent = 'space-between';
            li.style.width = 'calc(50% - 20px)';
            li.style.boxSizing = 'border-box';
            li.style.background = '#fff';
            li.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

            const shopGroup = getShopGroup(item);
            const ownershipCollection = shopGroup === 'Armi'
                ? (myChar.weapons || [])
                : (myChar.backpack || []);

            let ownedQty = 0;
            ownershipCollection.forEach(entry => {
                if (typeof entry === 'string') {
                    if (entry === item.name) ownedQty += 1;
                    return;
                }

                const sameItem = entry.compendium_id
                    ? entry.compendium_id === item.id
                    : entry.name === item.name;

                if (sameItem) {
                    ownedQty += shopGroup === 'Armi' ? 1 : (entry.qty || 1);
                }
            });

            const ownedLabel = shopGroup === 'Armi'
                ? 'Armi possedute'
                : shopGroup === 'Licenze'
                    ? 'Licenza posseduta'
                    : 'Nello Zaino';

            const ownedText = ownedQty > 0
                ? `<span style="font-size:11px; color:#27ae60; display:block; margin-top:5px; font-weight:bold;">${ownedLabel}${shopGroup === 'Licenze' ? '' : `: x${ownedQty}`}</span>`
                : '';

            const itemCost = getCompendioCost(item);
            const itemDesc = getCompendioDescription(item);
            const priceText = itemCost === null ? 'Prezzo da definire' : `${itemCost} €`;
            const brandHtml = item.brand
                ? `<span style="display:inline-block; font-size:10px; font-weight:bold; color:#8e44ad; margin-top:3px;">${item.brand}</span>`
                : '';

            const armorStatsHtml = item.class === 'Armatura'
                ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin:8px 0 10px 0; font-size:11px;">
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Peso: <b>${item.equipment?.weight ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Armonizzazione: <b>${item.equipment?.harmonization ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Vita: <b>${item.equipment?.hp ?? '-'}</b></span>
                   </div>`
                : '';

            const weaponData = item.weapon || {};
            const weaponStatsHtml = item.class === 'Arma'
                ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin:8px 0 10px 0; font-size:11px;">
                       <span style="background:#fdebd0; padding:3px 6px; border-radius:4px;">Danno: <b>${item.combat?.damage?.formula ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Caratt.: <b>${weaponData.characteristic ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Vita: <b>${item.equipment?.hp ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Costo azione: <b>${weaponData.action_cost ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Velocità: <b>${weaponData.attack_speed ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Mani: <b>${weaponData.hands ?? '-'}</b></span>
                       <span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Tiro: <b>${weaponData.targeting ?? '-'}</b></span>
                       ${weaponData.ammo ? `<span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Munizioni: <b>${weaponData.ammo.type ?? '-'} x${weaponData.ammo.capacity ?? '-'}</b></span>` : ''}
                       ${weaponData.range_bands_m ? `<span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Distanze: <b>${weaponData.range_bands_m.map(v => v ?? '-').join(' / ')} m</b></span>` : ''}
                       ${weaponData.range_malus ? `<span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Malus dist.: <b>${weaponData.range_malus.map(v => v ?? '-').join(' / ')}</b></span>` : ''}
                       ${weaponData.base_malus !== null && weaponData.base_malus !== undefined ? `<span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Malus base: <b>${weaponData.base_malus}</b></span>` : ''}
                       ${weaponData.aim_time !== null && weaponData.aim_time !== undefined ? `<span style="background:#eef3f7; padding:3px 6px; border-radius:4px;">Mira: <b>${weaponData.aim_time}</b></span>` : ''}
                   </div>`
                : '';

            const licenseInfo = getWeaponLicenseInfo(item);
            const hasLicense = licenseInfo ? characterHasWeaponLicense(myChar, item) : true;
            const licenseHtml = licenseInfo
                ? `<div style="font-size:11px; margin:6px 0; padding:5px 7px; border-radius:4px; background:${hasLicense ? '#eafaf1' : '#fdecea'}; color:${hasLicense ? '#1e8449' : '#c0392b'}; font-weight:bold;">${hasLicense ? '✅' : '🔒'} Richiede: ${licenseInfo.name || licenseInfo.id}</div>`
                : '';

            li.innerHTML = `<div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div><strong style="font-size:15px; color:#2c3e50; line-height:1.2;">${item.name}</strong><br>${brandHtml}</div>
                    <span class="shop-price" style="font-size:13px; font-weight:bold; color:#8e44ad; background:#f4ebf8; padding:3px 6px; border-radius:4px; white-space:nowrap; margin-left:10px;">${priceText}</span>
                </div>
                <p style="font-size:13px; color:#555; margin:0 0 8px 0; line-height:1.4;">${itemDesc}</p>
                ${armorStatsHtml}${weaponStatsHtml}${licenseHtml}${ownedText}
            </div>`;

            // Licenza collegata a un'arma: prezzo calcolato (25% dell'arma), non si modifica qui
            if (isMaster && item.price_rule) {
                const priceEl = li.querySelector('.shop-price');
                priceEl.title = `${item.price_rule.percent}% del prezzo di ${item.price_rule.base_name}: cambia il prezzo dell'arma`;
                priceEl.textContent = `${priceText} · ${item.price_rule.percent}% arma`;
            }

            // Il Master cambia il prezzo al volo cliccando sul cartellino
            if (isMaster && !item.price_rule) {
                const priceEl = li.querySelector('.shop-price');
                priceEl.textContent = `${priceText} ✏️`;
                priceEl.title = 'Clicca per cambiare il prezzo';
                priceEl.style.cursor = 'pointer';
                priceEl.addEventListener('click', () => {
                    const answer = prompt(
                        `Prezzo di "${item.name}" in € (lascia vuoto per "da definire"):`,
                        itemCost ?? ''
                    );
                    if (answer === null) return;

                    const trimmed = answer.trim();
                    if (trimmed !== '' && !/^\d+$/.test(trimmed)) {
                        alert('Scrivi un numero intero di euro.');
                        return;
                    }
                    socket.emit('set_item_price', { compendium_id: item.id, price: trimmed === '' ? null : Number(trimmed) });
                });
            }

            const btn = document.createElement('button');
            btn.style.padding = '8px';
            btn.style.borderRadius = '4px';
            btn.style.fontWeight = 'bold';
            btn.style.width = '100%';
            btn.style.border = 'none';
            btn.style.marginTop = '10px';

            if (isMaster) {
                // Il Master può regalare l'oggetto: arriva come se fosse comprato, ma gratis
                btn.innerText = `🎁 Regala a ${myChar.name}`;
                btn.style.background = '#16a085';
                btn.style.color = '#fff';
                btn.style.cursor = 'pointer';
                btn.onclick = () => {
                    if (!confirm(`Regalare "${item.name}" a ${myChar.name}? Non costa nulla.`)) return;
                    grantShopItem(myChar, item, shopGroup, itemDesc);
                    // Privato: lo vedono solo il Master e chi riceve il regalo
                    socket.emit('combat_msg', {
                        name: '🎁 MASTER',
                        message: `regala <b>${escapeHtml(item.name)}</b> a <b>${escapeHtml(myChar.name)}</b>.`,
                        private_to: myChar.id
                    });
                };
            } else if (itemCost === null) {
                btn.innerText = 'Prezzo da definire';
                btn.style.background = '#bdc3c7';
                btn.style.color = '#fff';
                btn.style.cursor = 'not-allowed';
                btn.disabled = true;
            } else if (shopGroup === 'Licenze' && ownedQty > 0) {
                btn.innerText = 'Licenza già posseduta';
                btn.style.background = '#27ae60';
                btn.style.color = '#fff';
                btn.style.cursor = 'not-allowed';
                btn.disabled = true;
            } else {
                btn.innerText = shopGroup === 'Armi' ? 'Acquista arma' : shopGroup === 'Licenze' ? 'Acquista licenza' : 'Acquista (Invia allo Zaino)';
                btn.style.background = '#8e44ad';
                btn.style.color = '#fff';

                const canAfford = myChar.xp >= itemCost;
                btn.style.cursor = canAfford ? 'pointer' : 'not-allowed';
                btn.style.opacity = canAfford ? '1' : '0.5';
                btn.disabled = !canAfford;

                if (canAfford) {
                    btn.onclick = () => {
                        if (!confirm(`Vuoi spendere ${itemCost} € per acquistare "${item.name}"?`)) return;

                        socket.emit('update_xp', { char_id: myChar.id, amount: -itemCost });
                        grantShopItem(myChar, item, shopGroup, itemDesc);
                    };
                }
            }

            li.appendChild(btn);
            shopAvail.appendChild(li);
            availCount++;
        });

        if (availCount === 0) {
            shopAvail.innerHTML = `<li style="color:#7f8c8d; font-size:13px;"><em>Nessun elemento acquistabile.</em></li>`;
        }
    } else {
        shopAvail.innerHTML = `<li><em>Questa categoria del catalogo al momento è in aggiornamento.</em></li>`;
    }

}

// ==========================================
// APERTURA / SALVATAGGIO SCHEDA
// ==========================================
sheetBtn?.addEventListener('click', () => {
    let characterId = isMaster ? selectedCharacterId : parseInt(userSelect?.value);
    if (!characterId) { alert(isMaster ? "Seleziona prima un personaggio sulla mappa!" : "Seleziona prima il tuo personaggio!"); return; }
    const character = characters.find(c => c.id === characterId);
    if (character) { socket.emit('get_compendio'); populatePlayerSheetUI(character); sheetModal.style.display = 'flex'; }
});

document.getElementById('btn-view-sheet')?.addEventListener('click', () => {
    if (!selectedCharacterId) { alert("Seleziona prima un personaggio sulla mappa!"); return; }
    const char = characters.find(c => c.id === selectedCharacterId);
    if (char) { populatePlayerSheetUI(char); sheetModal.style.display = 'flex'; }
});

// ==========================================
// MODIFICA SCHEDA MASTER
// ==========================================
document.getElementById('btn-edit-sheet')?.addEventListener('click', () => {
    let targetId = selectedCharacterId || (parseInt(userSelect?.value) > 0 ? parseInt(userSelect?.value) : null);
    if (!targetId) { alert("Prima seleziona un personaggio!"); return; }

    const char = characters.find(c => c.id === targetId);
    if (!char) return;

    selectedCharacterId = char.id;
    document.getElementById('edit-char-name').innerText = char.name;

    // Solo i valori semplici: equipaggiamento e gadget (oggetti) non si scrivono a mano
    let statsStr = "";
    if (char.stats) for (const [key, value] of Object.entries(char.stats)) {
        if (value === null || typeof value !== 'object') statsStr += `${key}: ${value}\n`;
    }

    // Controlli di sicurezza per evitare crash se manca un pezzo nell'HTML
    const statsEl = document.getElementById('edit-stats');
    if (statsEl) statsEl.value = statsStr.trim();

    const wpEl = document.getElementById('edit-weapons');
    if (wpEl) wpEl.value = (char.weapons || []).map(w => typeof w === 'string' ? w : w.name).join('\n');

    const skEl = document.getElementById('edit-skills');
    if (skEl) skEl.value = (char.skills || []).join('\n');

    const bpEl = document.getElementById('edit-backpack');
    if (bpEl) bpEl.value = (char.backpack || []).map(b => typeof b === 'string' ? b : b.name).join('\n');

    if (editSheetModal) editSheetModal.style.display = 'flex';
    socket.emit('get_compendio');
});

// SALVATAGGIO SCHEDA MASTER
document.getElementById('save-sheet-btn')?.addEventListener('click', () => {
    if (!selectedCharacterId) return;

    const char = characters.find(c => c.id === selectedCharacterId);
    if (!char) return;

    // Lettura sicura
    const statsLines = document.getElementById('edit-stats') ? document.getElementById('edit-stats').value.split('\n').filter(l => l.trim() !== '') : [];
    // Le parti a oggetti (equipaggiamento, gadget...) restano com'erano
    const statsObj = Object.fromEntries(
        Object.entries(char.stats || {}).filter(([, value]) => value !== null && typeof value === 'object')
    );
    statsLines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) statsObj[parts.shift().trim()] = parts.join(':').trim();
    });

    const parseList = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.split('\n').map(s => s.trim()).filter(s => s !== '') : [];
    };

    const newWeaponsNames = parseList('edit-weapons');
    const newBackpackNames = parseList('edit-backpack');

    // Ricostruzione sicura
    const updatedWeapons = newWeaponsNames.map(name => {
        const existing = (char.weapons || []).find(w => (typeof w === 'string' ? w : w.name) === name);
        return existing ? existing : { name: name, desc: "Nessuna descrizione" };
    });

    const updatedBackpack = newBackpackNames.map(name => {
        const existing = (char.backpack || []).find(b => (typeof b === 'string' ? b : b.name) === name);
        return existing ? existing : { name: name, desc: "Nessuna descrizione", qty: 1 };
    });

    // Foto e lore non sono in questa finestra: si cambiano dal profilo
    socket.emit('update_character_sheet', {
        char_id: selectedCharacterId,
        stats: statsObj,
        weapons: updatedWeapons,
        skills: parseList('edit-skills'),
        backpack: updatedBackpack
    });

    if (editSheetModal) editSheetModal.style.display = 'none';
});
