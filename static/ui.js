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

                let statVal = parseInt(value) || 1;
                let maxPa = 6 + (statVal - 1) * 3;
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

                    const btnResetStam = document.createElement('button');
                    btnResetStam.innerHTML = "🔄 STM"; btnResetStam.title = "Spendi 15 Stamina per ricaricare i PA";
                    btnResetStam.style.background = '#f39c12'; btnResetStam.style.color = 'white'; btnResetStam.style.border = 'none'; btnResetStam.style.padding = '6px 8px'; btnResetStam.style.borderRadius = '3px'; btnResetStam.style.cursor = 'pointer'; btnResetStam.style.fontSize = '12px';
                    btnResetStam.onclick = () => { if (confirm(`Vuoi spendere 15 di Stamina per ricaricare tutti i PA di ${key}?`)) socket.emit('reset_pa', { char_id: myChar.id, stat: key, cost_type: 'stamina' }); };

                    const btnResetConc = document.createElement('button');
                    btnResetConc.innerHTML = "🔄 CNC"; btnResetConc.title = "Spendi 15 Concentrazione per ricaricare i PA";
                    btnResetConc.style.background = '#2980b9'; btnResetConc.style.color = 'white'; btnResetConc.style.border = 'none'; btnResetConc.style.padding = '6px 8px'; btnResetConc.style.borderRadius = '3px'; btnResetConc.style.cursor = 'pointer'; btnResetConc.style.fontSize = '12px';
                    btnResetConc.onclick = () => { if (confirm(`Vuoi spendere 15 di Concentrazione per ricaricare tutti i PA di ${key}?`)) socket.emit('reset_pa', { char_id: myChar.id, stat: key, cost_type: 'conc' }); };

                    btnContainer.appendChild(spendGroup); btnContainer.appendChild(btnResetStam); btnContainer.appendChild(btnResetConc);
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
                      <select onchange="window.equipItem(${myChar.id}, '${item.name.replace(/'/g, "\\'")}', '${item.desc.replace(/'/g, "\\'")}', this.value, 'weapon', '${String(item.compendium_id || '').replace(/'/g, "\\'")}')" style="padding: 2px; border-radius: 3px; font-size: 11px; flex: 1; border: 1px solid #ccc;">
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
                            onchange="window.equipItem(
                                ${myChar.id},
                                '${item.name.replace(/'/g, "\\'")}',
                                '${getCompendioDescription(item).replace(/'/g, "\\'")}',
                                this.value,
                                'backpack',
                                '${item.compendium_id || ''}'
                            )"
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

    let statsStr = "";
    if (char.stats) for (const [key, value] of Object.entries(char.stats)) statsStr += `${key}: ${value}\n`;

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
    const statsObj = {};
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

    const photoUrl = document.getElementById('edit-photo-url') ? document.getElementById('edit-photo-url').value.trim() : "";
    const loreText = document.getElementById('edit-lore') ? document.getElementById('edit-lore').value.trim() : "";

    socket.emit('update_character_sheet', {
        char_id: selectedCharacterId,
        photo_url: photoUrl,
        lore: loreText,
        stats: statsObj,
        weapons: updatedWeapons,
        skills: parseList('edit-skills'),
        backpack: updatedBackpack
    });

    if (editSheetModal) editSheetModal.style.display = 'none';
});

// ==========================================
// CHAT E DADI
// ==========================================
const chatLog = document.getElementById('chat-log');
const chatStatus = document.getElementById('chat-status');
const dicePanelHeader = document.getElementById('dice-panel-header');
const dicePanelContent = document.getElementById('dice-panel-content');
const diceToggleIcon = document.getElementById('dice-toggle-icon');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('btn-send-chat');
const chatCompose = document.getElementById('chat-compose');
let chatRecipient = document.getElementById('chat-recipient');
const sidequestComposer = document.getElementById('sidequest-composer');
const sidequestComposerToggleBtn = document.getElementById('btn-toggle-sidequest-composer');
const sidequestComposerBody = document.getElementById('sidequest-composer-body');
const sidequestComposerToggleIcon = document.getElementById('sidequest-composer-toggle-icon');
const sidequestTarget = document.getElementById('sidequest-target');
const sidequestTitle = document.getElementById('sidequest-title');
const sidequestDescription = document.getElementById('sidequest-description');
const sidequestCost = document.getElementById('sidequest-cost');
const sendSidequestBtn = document.getElementById('btn-send-sidequest');
const sidequestForgeToggleBtn = document.getElementById('btn-toggle-sidequest-forge');
const sidequestForgeForm = document.getElementById('sidequest-forge-form');
const sidequestForgeSummary = document.getElementById('sidequest-forged-summary');
const sidequestForgeBtn = document.getElementById('btn-forge-sidequest-weapon');
const sidequestForgeRemoveBtn = document.getElementById('btn-remove-sidequest-weapon');
const sidequestForgeLibrary = document.getElementById('sidequest-forge-library');
const sidequestForgeAttachTemplateBtn = document.getElementById('btn-attach-forge-template');
const openMasterForgeBtn = document.getElementById('btn-open-master-forge');
const openMasterForgePanelBtn = document.getElementById('btn-open-master-forge-panel');
const masterForgeModal = document.getElementById('master-forge-modal');
const masterForgeList = document.getElementById('master-forge-list');
const masterForgeEditLabel = document.getElementById('master-forge-edit-label');
const closeMasterForgeBtn = document.getElementById('btn-close-master-forge');
const masterForgeNewBtn = document.getElementById('btn-master-forge-new');
const masterForgeSaveBtn = document.getElementById('btn-master-forge-save');
const masterForgeAttachBtn = document.getElementById('btn-master-forge-attach');
const sidequestStore = new Map();
const masterForgeStore = new Map();
let pendingSidequestWeapon = null;
let masterForgeEditingId = null;

// --- 1. APERTURA E CHIUSURA TENDINA ---
sidequestComposerToggleBtn?.addEventListener('click', () => {
    if (!sidequestComposerBody) return;

    const isOpen = sidequestComposerBody.style.display !== 'none';
    sidequestComposerBody.style.display = isOpen ? 'none' : 'block';
    sidequestComposerToggleBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');

    if (sidequestComposerToggleIcon) {
        sidequestComposerToggleIcon.innerText = isOpen ? '▶' : '▼';
    }
});

dicePanelHeader?.addEventListener('click', () => {
    if (dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        diceToggleIcon.innerText = '▼';
        dicePanelHeader.style.borderRadius = '6px 6px 0 0';
        chatLog.scrollTop = chatLog.scrollHeight; // Scrolla in basso quando si apre
    } else {
        dicePanelContent.style.display = 'none';
        diceToggleIcon.innerText = '▶';
        dicePanelHeader.style.borderRadius = '6px';
    }
});

function ensureChatRecipientSelect() {
    if (chatRecipient || !chatCompose) return chatRecipient;

    const recipientRow = document.createElement('div');
    recipientRow.id = 'chat-recipient-row';
    recipientRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';

    const label = document.createElement('span');
    label.textContent = 'A:';
    label.style.cssText = 'font-size:11px;font-weight:bold;color:#7f8c8d;white-space:nowrap;';

    chatRecipient = document.createElement('select');
    chatRecipient.id = 'chat-recipient';
    chatRecipient.style.cssText = 'flex:1;min-width:0;padding:6px;border:1px solid #bdc3c7;border-radius:4px;background:#fff;';

    recipientRow.appendChild(label);
    recipientRow.appendChild(chatRecipient);
    chatCompose.insertBefore(recipientRow, chatCompose.firstChild);

    chatRecipient.addEventListener('change', () => {
        updateChatStatus();
    });

    return chatRecipient;
}

function refreshChatRecipientOptions() {
    const select = ensureChatRecipientSelect();
    if (!select) return;

    const previousValue = select.value || 'all';
    const myCharId = Number.parseInt(userSelect?.value || '', 10);

    select.innerHTML = '';

    const globalOption = document.createElement('option');
    globalOption.value = 'all';
    globalOption.textContent = '🌐 Tutti';
    select.appendChild(globalOption);

    if (!isMaster) {
        const masterOption = document.createElement('option');
        masterOption.value = 'master';
        masterOption.textContent = '👑 Master';
        select.appendChild(masterOption);
    }

    (characters || [])
        .filter(char => char.role === 'player')
        .filter(char => isMaster || Number(char.id) !== myCharId)
        .forEach(char => {
            const option = document.createElement('option');
            option.value = `player:${char.id}`;
            option.textContent = `👤 ${char.name}`;
            select.appendChild(option);
        });

    if ([...select.options].some(opt => opt.value === previousValue)) {
        select.value = previousValue;
    } else {
        select.value = 'all';
    }
}

window.refreshChatRecipientOptions = refreshChatRecipientOptions;

function updateChatStatus() {
    refreshChatRecipientOptions();

    if (chatStatus) {
        const target = chatRecipient?.value || 'all';
        const targetText = chatRecipient?.selectedOptions?.[0]?.textContent || '🌐 Tutti';

        if (target === 'all') {
            chatStatus.innerText = isMaster ? 'Master • Globale' : 'Globale';
            chatStatus.style.color = isMaster ? '#f1c40f' : '#1abc9c';
        } else {
            chatStatus.innerText = `🔒 ${targetText.replace(/^👤\s*|^👑\s*/, '')}`;
            chatStatus.style.color = '#f1c40f';
        }
    }

    if (sidequestComposer) {
        sidequestComposer.style.display = isMaster ? 'block' : 'none';
    }

    refreshSidequestTargetOptions();
    refreshSidequestCards();
}

// --- 2. RICEZIONE MESSAGGI E DADI DAL SERVER ---
socket.on('dice_result', (data) => {
    const div = document.createElement('div');
    div.style.padding = '8px 10px'; div.style.borderRadius = '5px'; div.style.lineHeight = '1.4';
    if (data.is_master_roll) { div.style.background = '#fadbd8'; div.style.borderLeft = '4px solid #c0392b'; div.style.color = '#c0392b'; }
    else { div.style.background = '#e8f8f5'; div.style.borderLeft = '4px solid #1abc9c'; div.style.color = '#2c3e50'; }
    // Il nome è testo semplice; il messaggio è HTML composto dal server
    div.innerHTML = `<strong style="display:block; font-size:13px; margin-bottom:2px;">${escapeHtml(data.name)}</strong>${data.message}`;
    chatLog.appendChild(div);

    // Auto-apertura se arriva un messaggio e la tendina è chiusa
    if (dicePanelContent && dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        diceToggleIcon.innerText = '▼';
        dicePanelHeader.style.borderRadius = '6px 6px 0 0';
    }

    chatLog.scrollTop = chatLog.scrollHeight;
});

// --- 3. CHAT TESTUALE E SIDEQUEST ---
function ensureChatOpen() {
    if (!dicePanelContent) return;
    if (dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        if (diceToggleIcon) diceToggleIcon.innerText = '▼';
        if (dicePanelHeader) dicePanelHeader.style.borderRadius = '6px 6px 0 0';
    }
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

function appendChatMessage(data) {
    if (!chatLog) return;

    const div = document.createElement('div');
    div.style.padding = '8px 10px';
    div.style.borderRadius = '5px';
    div.style.lineHeight = '1.4';
    div.dataset.chatChannel = data.is_private ? 'private' : 'global';

    if (data.is_system) {
        div.style.background = '#fef9e7';
        div.style.borderLeft = '4px solid #f1c40f';
        div.style.color = '#7d6608';
    } else if (data.is_private) {
        div.style.background = '#fff8e1';
        div.style.borderLeft = '4px solid #f39c12';
        div.style.color = '#5d4037';
    } else if (data.is_master) {
        div.style.background = '#f5eef8';
        div.style.borderLeft = '4px solid #8e44ad';
        div.style.color = '#512e5f';
    } else {
        div.style.background = '#ebf5fb';
        div.style.borderLeft = '4px solid #3498db';
        div.style.color = '#2c3e50';
    }

    const privateLabel = data.is_private
        ? `<div style="font-size:10px;font-weight:bold;color:#b9770e;margin-bottom:3px;">🔒 PRIVATO • ${data.private_route || data.target_label || ''}</div>`
        : '';

    div.innerHTML = `${privateLabel}<strong style="display:block;font-size:13px;margin-bottom:2px;">${data.name}</strong>${data.message}`;
    chatLog.appendChild(div);
    ensureChatOpen();
}

socket.on('chat_message', appendChatMessage);
socket.on('chat_error', data => alert(data?.message || 'Errore chat.'));

function sendChatMessage() {
    const message = chatInput?.value.trim();
    if (!message) return;

    const target = chatRecipient?.value || 'all';

    socket.emit('chat_message', {
        message,
        target
    });

    chatInput.value = '';
}

sendChatBtn?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// Mantiene aggiornata la lista dei destinatari quando cambiano i personaggi.
socket.on('init_state', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});

socket.on('update_character', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});

socket.on('character_deleted', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});

function refreshSidequestTargetOptions() {
    if (!sidequestTarget) return;

    const previousValue = sidequestTarget.value || 'all';
    sidequestTarget.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '🌐 Tutti i giocatori';
    sidequestTarget.appendChild(allOption);

    (characters || [])
        .filter(char => char.role === 'player')
        .forEach(char => {
            const option = document.createElement('option');
            option.value = String(char.id);
            option.textContent = `👤 ${char.name}`;
            sidequestTarget.appendChild(option);
        });

    if ([...sidequestTarget.options].some(opt => opt.value === previousValue)) {
        sidequestTarget.value = previousValue;
    }
}
window.refreshSidequestTargetOptions = refreshSidequestTargetOptions;

function forgeFieldValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const value = String(el.value ?? '').trim();
    return value === '' ? null : value;
}

function forgeNumberValue(id) {
    const raw = forgeFieldValue(id);
    if (raw === null) return null;
    const value = Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function formatForgedWeaponSummary(weapon) {
    if (!weapon) return '';

    const damage = weapon.damage ?? '?';
    const speed = weapon.attack_speed ?? '?';
    const hands = weapon.hands ?? 1;
    const targeting = weapon.targeting || 'Melee';
    const license = weapon.license_name ? ` • 🔒 ${weapon.license_name}` : '';

    return `🔨 ${weapon.name} • ${damage} HP • Vel. ${speed} • ${hands} mano/i • ${targeting}${license}`;
}

function forgedDefinitionToDraft(definition) {
    if (!definition || typeof definition !== 'object') return null;

    const weapon = definition.weapon || {};
    const equipment = definition.equipment || {};
    const text = definition.text || {};
    const ranges = Array.isArray(weapon.range_bands_m) ? weapon.range_bands_m : [];
    const maluses = Array.isArray(weapon.range_malus) ? weapon.range_malus : [];

    return {
        name: definition.name || '',
        brand: definition.brand || '',
        value_eur: equipment.cost_eur ?? null,
        description: text.description || '',
        damage: weapon.damage ?? 0,
        damage_type: weapon.damage_type || '',
        characteristic: weapon.characteristic || 'DES',
        hp: equipment.hp ?? 100,
        action_cost: weapon.action_cost ?? 0,
        attack_speed: weapon.attack_speed ?? null,
        hands: weapon.hands ?? 1,
        targeting: weapon.targeting || 'Melee',
        ammo: weapon.ammo || '',
        ammo_qty: weapon.ammo_qty ?? null,
        base_malus: weapon.base_malus ?? null,
        aim_time: weapon.aim_time ?? null,
        range_1: ranges[0] ?? null,
        range_malus_1: maluses[0] ?? null,
        range_2: ranges[1] ?? null,
        range_malus_2: maluses[1] ?? null,
        range_3: ranges[2] ?? null,
        range_malus_3: maluses[2] ?? null,
        weight: equipment.weight ?? 0,
        harmonization: equipment.harmonization ?? 0,
        license_name: weapon.license_name || ''
    };
}

function masterForgeFieldValue(suffix) {
    const el = document.getElementById(`master-forge-weapon-${suffix}`);
    if (!el) return null;
    const value = String(el.value ?? '').trim();
    return value === '' ? null : value;
}

function masterForgeNumberValue(suffix) {
    const raw = masterForgeFieldValue(suffix);
    if (raw === null) return null;
    const value = Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function readMasterForgeDraft() {
    const name = masterForgeFieldValue('name');
    const damage = masterForgeNumberValue('damage');
    const speed = masterForgeNumberValue('speed');

    if (!name) {
        alert("Inserisci il nome dell'arma.");
        return null;
    }
    if (damage === null || damage < 0) {
        alert('Inserisci un danno valido.');
        return null;
    }
    if (speed === null || speed <= 0) {
        alert("Inserisci una velocità d'attacco valida.");
        return null;
    }

    return {
        name,
        brand: masterForgeFieldValue('brand'),
        value_eur: masterForgeNumberValue('value'),
        description: masterForgeFieldValue('description'),
        damage,
        damage_type: masterForgeFieldValue('damage-type'),
        characteristic: masterForgeFieldValue('characteristic') || 'DES',
        hp: masterForgeNumberValue('hp') ?? 100,
        action_cost: masterForgeNumberValue('action-cost') ?? 0,
        attack_speed: speed,
        hands: masterForgeNumberValue('hands') ?? 1,
        targeting: masterForgeFieldValue('targeting') || 'Melee',
        ammo: masterForgeFieldValue('ammo'),
        ammo_qty: masterForgeNumberValue('ammo-qty'),
        base_malus: masterForgeNumberValue('base-malus'),
        aim_time: masterForgeNumberValue('aim-time'),
        range_1: masterForgeNumberValue('range-1'),
        range_malus_1: masterForgeNumberValue('malus-1'),
        range_2: masterForgeNumberValue('range-2'),
        range_malus_2: masterForgeNumberValue('malus-2'),
        range_3: masterForgeNumberValue('range-3'),
        range_malus_3: masterForgeNumberValue('malus-3'),
        weight: masterForgeNumberValue('weight') ?? 0,
        harmonization: masterForgeNumberValue('harmonization') ?? 0,
        license_name: masterForgeFieldValue('license')
    };
}

function setMasterForgeField(suffix, value) {
    const el = document.getElementById(`master-forge-weapon-${suffix}`);
    if (!el) return;
    el.value = value === null || value === undefined ? '' : String(value);
}

function populateMasterForgeForm(draft) {
    const data = draft || {};
    setMasterForgeField('name', data.name || '');
    setMasterForgeField('brand', data.brand || '');
    setMasterForgeField('value', data.value_eur ?? '');
    setMasterForgeField('description', data.description || '');
    setMasterForgeField('damage', data.damage ?? '');
    setMasterForgeField('damage-type', data.damage_type || '');
    setMasterForgeField('characteristic', data.characteristic || 'DES');
    setMasterForgeField('hp', data.hp ?? 100);
    setMasterForgeField('action-cost', data.action_cost ?? 0);
    setMasterForgeField('speed', data.attack_speed ?? '');
    setMasterForgeField('hands', data.hands ?? 1);
    setMasterForgeField('targeting', data.targeting || 'Melee');
    setMasterForgeField('ammo', data.ammo || '');
    setMasterForgeField('ammo-qty', data.ammo_qty ?? '');
    setMasterForgeField('base-malus', data.base_malus ?? '');
    setMasterForgeField('aim-time', data.aim_time ?? '');
    setMasterForgeField('range-1', data.range_1 ?? '');
    setMasterForgeField('malus-1', data.range_malus_1 ?? '');
    setMasterForgeField('range-2', data.range_2 ?? '');
    setMasterForgeField('malus-2', data.range_malus_2 ?? '');
    setMasterForgeField('range-3', data.range_3 ?? '');
    setMasterForgeField('malus-3', data.range_malus_3 ?? '');
    setMasterForgeField('weight', data.weight ?? 0);
    setMasterForgeField('harmonization', data.harmonization ?? 0);
    setMasterForgeField('license', data.license_name || '');
}

function resetMasterForgeEditor() {
    masterForgeEditingId = null;
    populateMasterForgeForm(null);
    if (masterForgeEditLabel) masterForgeEditLabel.textContent = 'Nuova arma';
    if (masterForgeSaveBtn) masterForgeSaveBtn.textContent = '💾 Salva nella Fucina';
}

function attachForgeDraftToSidequest(draft) {
    if (!draft) return;
    pendingSidequestWeapon = { ...draft };

    if (sidequestForgeSummary) {
        sidequestForgeSummary.textContent =
            `✅ Allegata dalla Fucina: ${formatForgedWeaponSummary(pendingSidequestWeapon)}`;
        sidequestForgeSummary.style.display = 'block';
    }
}

function refreshMasterForgeSelect() {
    if (!sidequestForgeLibrary) return;

    const previous = sidequestForgeLibrary.value;
    sidequestForgeLibrary.innerHTML = '';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = masterForgeStore.size
        ? '-- Seleziona un modello --'
        : '-- Nessun modello salvato --';
    sidequestForgeLibrary.appendChild(empty);

    [...masterForgeStore.values()]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'))
        .forEach(template => {
            const option = document.createElement('option');
            option.value = String(template.id);
            option.textContent = template.name || `Arma #${template.id}`;
            sidequestForgeLibrary.appendChild(option);
        });

    if ([...sidequestForgeLibrary.options].some(opt => opt.value === previous)) {
        sidequestForgeLibrary.value = previous;
    }
}

function renderMasterForgeLibrary() {
    refreshMasterForgeSelect();
    if (!masterForgeList) return;

    masterForgeList.innerHTML = '';
    const templates = [...masterForgeStore.values()]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));

    if (!templates.length) {
        const empty = document.createElement('em');
        empty.style.cssText = 'font-size:12px;color:#777;text-align:center;padding:15px;';
        empty.textContent = 'Nessun modello salvato.';
        masterForgeList.appendChild(empty);
        return;
    }

    templates.forEach(template => {
        const draft = forgedDefinitionToDraft(template.definition);
        const row = document.createElement('div');
        row.style.cssText = 'padding:7px;border:1px solid #e0b27a;border-radius:5px;background:#fffaf4;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:bold;color:#784212;font-size:12px;';
        title.textContent = template.name || `Arma #${template.id}`;
        row.appendChild(title);

        const summary = document.createElement('div');
        summary.style.cssText = 'font-size:10px;color:#7f5539;margin-top:3px;line-height:1.3;';
        summary.textContent = formatForgedWeaponSummary(draft);
        row.appendChild(summary);

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = 'Modifica';
        editBtn.style.cssText = 'flex:1;padding:4px;border:0;border-radius:3px;background:#2980b9;color:white;cursor:pointer;font-size:10px;';
        editBtn.addEventListener('click', () => {
            masterForgeEditingId = Number(template.id);
            populateMasterForgeForm(draft);
            if (masterForgeEditLabel) masterForgeEditLabel.textContent = `Modifica: ${template.name}`;
            if (masterForgeSaveBtn) masterForgeSaveBtn.textContent = '💾 Salva modifiche';
        });

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.textContent = '📜 Allega';
        attachBtn.style.cssText = 'flex:1;padding:4px;border:0;border-radius:3px;background:#7d3c98;color:white;cursor:pointer;font-size:10px;';
        attachBtn.addEventListener('click', () => {
            attachForgeDraftToSidequest(draft);
            if (sidequestForgeLibrary) sidequestForgeLibrary.value = String(template.id);
            if (masterForgeModal) masterForgeModal.style.display = 'none';
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = '🗑';
        deleteBtn.style.cssText = 'padding:4px 7px;border:0;border-radius:3px;background:#c0392b;color:white;cursor:pointer;font-size:10px;';
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`Eliminare "${template.name}" dalla Fucina? Le task già create non verranno modificate.`)) return;
            socket.emit('master_forge_delete', { template_id: template.id });
            if (masterForgeEditingId === Number(template.id)) resetMasterForgeEditor();
        });

        buttons.appendChild(editBtn);
        buttons.appendChild(attachBtn);
        buttons.appendChild(deleteBtn);
        row.appendChild(buttons);
        masterForgeList.appendChild(row);
    });
}

openMasterForgeBtn?.addEventListener('click', () => {
    if (!isMaster || !masterForgeModal) return;
    masterForgeModal.style.display = 'flex';
    refreshMasterForgeGiveTargets();
    socket.emit('master_forge_request');
});

openMasterForgePanelBtn?.addEventListener('click', () => {
    if (!isMaster || !masterForgeModal) return;
    masterForgeModal.style.display = 'flex';
    refreshMasterForgeGiveTargets();
    socket.emit('master_forge_request');
});

closeMasterForgeBtn?.addEventListener('click', () => {
    if (masterForgeModal) masterForgeModal.style.display = 'none';
});

masterForgeModal?.addEventListener('click', event => {
    if (event.target === masterForgeModal) masterForgeModal.style.display = 'none';
});

masterForgeNewBtn?.addEventListener('click', () => {
    resetMasterForgeEditor();
});

masterForgeSaveBtn?.addEventListener('click', () => {
    if (!isMaster) return;
    const weapon = readMasterForgeDraft();
    if (!weapon) return;

    socket.emit('master_forge_save', {
        template_id: masterForgeEditingId,
        weapon
    });
});

// Consegna diretta dalla Fucina: l'arma va tra le Armi del giocatore scelto
function refreshMasterForgeGiveTargets() {
    const select = document.getElementById('master-forge-give-target');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">-- Giocatore --</option>';
    (characters || []).filter(c => c.role === 'player').forEach(c => select.add(new Option(c.name, c.id)));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

document.getElementById('btn-master-forge-give')?.addEventListener('click', () => {
    if (!isMaster) return;
    const charId = parseInt(document.getElementById('master-forge-give-target')?.value);
    if (!charId) {
        alert("Scegli il giocatore che riceve l'arma.");
        return;
    }
    const weapon = readMasterForgeDraft();
    if (!weapon) return;
    const charName = sidequestPlayerName(charId);
    if (!confirm(`Dare "${weapon.name}" a ${charName}? Finisce subito tra le sue Armi.`)) return;

    socket.timeout(10000).emit('master_forge_give', { char_id: charId, weapon }, (timeoutError, reply) => {
        if (timeoutError) {
            alert("Il server non ha risposto: l'arma NON è stata consegnata. Probabilmente va riavviato.");
            return;
        }
        if (reply?.error) {
            alert(reply.error);
            return;
        }
        statusBar.innerText = `🎁 ${reply.name} consegnata a ${charName}.`;
    });
});

masterForgeAttachBtn?.addEventListener('click', () => {
    const weapon = readMasterForgeDraft();
    if (!weapon) return;
    attachForgeDraftToSidequest(weapon);
    if (masterForgeModal) masterForgeModal.style.display = 'none';
});

sidequestForgeAttachTemplateBtn?.addEventListener('click', () => {
    const templateId = Number(sidequestForgeLibrary?.value || 0);
    const template = masterForgeStore.get(templateId);
    if (!template) {
        alert('Seleziona prima un modello dalla Fucina.');
        return;
    }
    attachForgeDraftToSidequest(forgedDefinitionToDraft(template.definition));
});

socket.on('master_forge_library', templates => {
    masterForgeStore.clear();
    (templates || []).forEach(template => {
        masterForgeStore.set(Number(template.id), template);
    });
    renderMasterForgeLibrary();
});

socket.on('master_forge_error', data => {
    alert(data?.message || 'Operazione Fucina non riuscita.');
});

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

// ==========================================
// COMPENDIO SHOP (LOGICA)
// ==========================================
let globalCompendio = {
    items: [],
    indexes: {}
};

let currentShopTab = 'Gadget';
let currentBrandSubTab = 'Tutti';
let currentArmorType = 'Tutti';
let currentArmorArea = 'Tutte';

// Armature del mercato divise per zona del corpo; dentro ogni zona il filtro per pezzo.
// I pezzi si riconoscono dalla famiglia dello slot del compendio.
const ARMOR_PIECES = {
    Elmo: 'elmo', Spalla: 'spalla', Pettorali: 'petto', Schiena: 'schiena',
    Avambraccio: 'avambraccio', Guanti: 'guanto', Cintura: 'cintura', Gambe: 'gambe', Stivali: 'stivale'
};
const ARMOR_AREAS = [
    { key: 'Tutte', label: 'Tutte', pieces: Object.keys(ARMOR_PIECES) },
    { key: 'Testa', label: '🪖 Testa', pieces: ['Elmo'] },
    { key: 'Busto', label: '🦺 Busto', pieces: ['Pettorali', 'Schiena', 'Spalla'] },
    { key: 'Braccia', label: '💪 Braccia', pieces: ['Avambraccio', 'Guanti'] },
    { key: 'Gambe', label: '🦵 Gambe', pieces: ['Gambe', 'Stivali'] },
    { key: 'Cintura', label: '🎗️ Cintura', pieces: ['Cintura'] }
];

function armorPieceOf(item) {
    const slot = item?.equipment?.slot || {};
    const family = String(slot.family || '').toLowerCase();
    const raw = String(slot.raw || '').toLowerCase();
    return Object.keys(ARMOR_PIECES).find(piece => ARMOR_PIECES[piece] === family) ||
        Object.keys(ARMOR_PIECES).find(piece => raw.includes(piece.toLowerCase())) || null;
}

function getCompendioItems() {
    return Array.isArray(globalCompendio?.items)
        ? globalCompendio.items
        : [];
}

function getActionSpeedEntries() {
    const table = globalCompendio?.action_speed_table;

    if (Array.isArray(table)) {
        return table;
    }

    return Array.isArray(table?.entries)
        ? table.entries
        : [];
}

function findActionSpeedRule(actionName) {
    if (!actionName) return null;

    const normalized =
        String(actionName)
            .trim()
            .toLowerCase();

    return getActionSpeedEntries().find(
        entry =>
            String(entry?.action || '')
                .trim()
                .toLowerCase() === normalized
    ) || null;
}

// ==========================================
// TABELLA VELOCITÀ AZIONI (INTERATTIVA)
// Le azioni scelte compilano velocità e frame nel pannello di turno
// ("Altra azione") oppure nella finestra di reazione (solo "Difesa").
// ==========================================

const ACTION_CATEGORY_ICONS = {
    'Movimento': '🏃',
    'Corpo a corpo': '👊',
    'Armi bianche': '🗡️',
    'Lancio': '🎯',
    'Armi da fuoco': '🔫',
    'Difesa': '🛡️',
    'Oggetti': '📦',
    'Interazione': '🔍',
    'Medica': '🩹',
    'Gadget': '🧩',
    'Tattica': '⚠️'
};

const LIMB_LABELS = {
    bd: 'Braccio Dx',
    bs: 'Braccio Sx',
    gd: 'Gamba Dx',
    gs: 'Gamba Sx'
};

// ==========================================
// SELETTORE ARTI MULTIPLI
// Le azioni costose si pagano con più arti insieme (es. arrampicarsi
// usa braccia e gambe): il costo si divide il più equamente possibile.
// ==========================================

const LIMB_KEYS = ['bd', 'bs', 'gd', 'gs'];
const DEFAULT_LIMBS = { bd: 60, bs: 60, gd: 60, gs: 60 };

// Divide il costo tra gli arti scelti senza superare i frame di ciascuno.
// Restituisce { bd: 23, ... } oppure null se i frame non bastano.
function splitFramesAcrossLimbs(cost, limbs, available) {
    const total = limbs.reduce((sum, limb) => sum + (available[limb] || 0), 0);

    if (!limbs.length || total < cost) {
        return null;
    }

    // Prima gli arti con meno frame: la parte che non riescono a pagare passa agli altri
    const ordered = [...limbs].sort((a, b) => (available[a] || 0) - (available[b] || 0));
    const shares = {};
    let remaining = cost;

    ordered.forEach((limb, index) => {
        const take = Math.min(
            available[limb] || 0,
            Math.ceil(remaining / (ordered.length - index))
        );
        shares[limb] = take;
        remaining -= take;
    });

    return shares;
}

// Arti proposti: si aggiungono nell'ordine preferito finché i frame bastano
function suggestLimbs(cost, available, preferred) {
    const chosen = [];
    let total = 0;

    for (const limb of preferred) {
        if ((available[limb] || 0) <= 0) continue;
        chosen.push(limb);
        total += available[limb];
        if (total >= cost) break;
    }

    return chosen.length ? chosen : [preferred[0]];
}

function formatLimbShares(shares) {
    return LIMB_KEYS
        .filter(limb => shares[limb])
        .map(limb => `${LIMB_LABELS[limb]} ${shares[limb]}`)
        .join(', ');
}

// L'arto che paga di più è quello "principale" (es. il braccio che para)
function getMainLimb(shares, preferred = LIMB_KEYS) {
    return [...preferred].sort((a, b) => (shares[b] || 0) - (shares[a] || 0))[0];
}

function createLimbPicker(containerId) {
    const picker = {
        cost: 0,
        available: { ...DEFAULT_LIMBS },
        preferred: LIMB_KEYS,
        selected: new Set(['bd'])
    };

    picker.getShares = () =>
        splitFramesAcrossLimbs(picker.cost, LIMB_KEYS.filter(limb => picker.selected.has(limb)), picker.available);

    picker.render = () => {
        const container = document.getElementById(containerId);
        if (!container) return;

        const shares = picker.getShares() || {};
        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'limb-picker-grid';

        LIMB_KEYS.forEach(limb => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'limb-chip';
            chip.classList.toggle('active', picker.selected.has(limb));
            chip.title = 'Clicca per usare / non usare questo arto';

            const name = document.createElement('span');
            name.textContent = LIMB_LABELS[limb];

            const frames = document.createElement('strong');
            frames.textContent = shares[limb]
                ? `${picker.available[limb]} → ${picker.available[limb] - shares[limb]}`
                : `${picker.available[limb]}`;

            chip.appendChild(name);
            chip.appendChild(frames);

            chip.addEventListener('click', () => {
                if (picker.selected.has(limb)) {
                    picker.selected.delete(limb);
                } else {
                    picker.selected.add(limb);
                }
                picker.render();
            });

            grid.appendChild(chip);
        });

        const summary = document.createElement('div');
        summary.className = 'limb-picker-summary';

        if (!picker.selected.size) {
            summary.textContent = 'Scegli almeno un arto.';
            summary.classList.add('error');
        } else if (!picker.getShares()) {
            const total = LIMB_KEYS
                .filter(limb => picker.selected.has(limb))
                .reduce((sum, limb) => sum + picker.available[limb], 0);
            summary.textContent = `Frame insufficienti: servono ${picker.cost}, ne hai ${total}. Aggiungi un arto.`;
            summary.classList.add('error');
        } else if (picker.selected.size > 1) {
            summary.textContent = `Costo diviso tra ${picker.selected.size} arti.`;
        }

        container.appendChild(grid);
        container.appendChild(summary);
    };

    // Aggiorna costo e frame disponibili; con suggest=true propone di nuovo gli arti
    picker.update = ({ cost, available, preferred, suggest = false }) => {
        if (cost !== undefined) picker.cost = cost;
        if (available) picker.available = { ...DEFAULT_LIMBS, ...available };
        if (preferred) picker.preferred = preferred;
        if (suggest) picker.selected = new Set(suggestLimbs(picker.cost, picker.available, picker.preferred));
        picker.render();
    };

    return picker;
}

const LIMB_ORDER_ARMS = ['bd', 'bs', 'gd', 'gs'];
const LIMB_ORDER_LEGS = ['gd', 'gs', 'bd', 'bs'];

const tableActionLimbPicker = createLimbPicker('table-action-limbs');
const reactionLimbPicker = createLimbPicker('reaction-limbs');

function getCurrentActorId() {
    return getActingCombatantId();
}

// Chi ha aperto la tabella: 'action' (pannello di turno) o 'reaction' (difesa)
let actionSpeedTableTarget = 'action';
let actionSpeedTableCategory = '';

function getCategoryIcon(category) {
    return ACTION_CATEGORY_ICONS[category] || '•';
}

function getActionCategories() {
    return [...new Set(
        getActionSpeedEntries()
            .map(entry => entry.category)
            .filter(Boolean)
    )];
}

// ==========================================
// REAZIONI
// Le voci "Difesa" con il campo "reaction" diventano reazioni:
// il campo dice con quale meccanica si risolvono (Parata / Schivata).
// ==========================================

function getReactionTableActionName(reactionType) {
    const map = {
        Parata: 'Parare',
        Schivata: 'Schivare'
    };

    return map[reactionType] || null;
}

function populateReactionOptions() {
    const select = document.getElementById('reaction-type');
    const defenses = getActionSpeedEntries().filter(entry => entry.reaction);

    if (!select || !defenses.length || select.dataset.fromTable === '1') {
        return;
    }

    select.innerHTML = '';

    defenses.forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.action;
        option.dataset.reaction = entry.reaction;
        option.textContent =
            `${entry.reaction === 'Parata' ? '🛡️' : '💨'} ${entry.action} (Vel ${entry.speed} · ${entry.frames} Frame)`;
        select.appendChild(option);
    });

    const exchange = document.createElement('option');
    exchange.value = 'Scambio';
    exchange.dataset.reaction = 'Scambio';
    exchange.textContent = "⚔️ Scambio d'Attacco (velocità manuale)";
    select.appendChild(exchange);

    select.dataset.fromTable = '1';
}

// Restituisce la meccanica, l'azione della tabella e la sua regola
function getSelectedReaction() {
    const option = document.getElementById('reaction-type')?.selectedOptions[0];

    if (!option) {
        return { type: 'Schivata', action: null, rule: null };
    }

    // Senza compendio restano le vecchie opzioni Parata / Schivata / Scambio
    const fromTable = !!option.dataset.reaction;
    const type = option.dataset.reaction || option.value;

    if (type === 'Scambio') {
        return { type, action: null, rule: null };
    }

    const action = fromTable ? option.value : getReactionTableActionName(type);

    return {
        type,
        action: fromTable ? action : null,
        rule: findActionSpeedRule(action)
    };
}

// Scambio d'attacco: niente secondo scambio per chi l'ha perso; chi lo sceglie indica l'arma
function syncReactionExchange() {
    const select = document.getElementById('reaction-type');
    const exchangeOption = [...(select?.options || [])].find(o => (o.dataset.reaction || o.value) === 'Scambio');
    const blocked = !!pendingIncomingAttack?.no_exchange;
    if (exchangeOption) {
        exchangeOption.hidden = blocked;
        exchangeOption.disabled = blocked;
        if (blocked && exchangeOption.selected) select.selectedIndex = 0;
    }

    const row = document.getElementById('reaction-exchange-row');
    const weaponSelect = document.getElementById('reaction-exchange-weapon');
    const isExchange = getSelectedReaction().type === 'Scambio';
    if (!row || !weaponSelect) return;
    row.style.display = isExchange ? 'block' : 'none';
    if (!isExchange) return;

    const defender = characters.find(c => c.id === pendingIncomingAttack?.defender_id);
    const previous = weaponSelect.value;
    weaponSelect.innerHTML = '';
    collectCombatActions(defender).forEach(action => {
        const option = new Option(`${action.name}${action.speed ? ` (Vel ${action.speed})` : ''}`, action.id);
        option.dataset.weapon = action.name || '';
        option.dataset.slot = action.slot || '';
        option.dataset.compendiumId = action.compendiumId || '';
        option.disabled = !!(action.licenseInfo && !action.hasLicense);
        weaponSelect.add(option);
    });
    if (!weaponSelect.options.length) {
        const unarmed = new Option('✊ Mani nude', 'unarmed');
        unarmed.dataset.weapon = 'Mani Nude';
        weaponSelect.add(unarmed);
    }
    if ([...weaponSelect.options].some(o => o.value === previous)) weaponSelect.value = previous;
}

function getExchangeWeaponChoice() {
    const option = document.getElementById('reaction-exchange-weapon')?.selectedOptions[0];
    if (!option) return { weapon: 'Mani Nude' };
    return { weapon: option.dataset.weapon, source_slot: option.dataset.slot || null, compendium_id: option.dataset.compendiumId || null };
}

function applyReactionSpeedFromTable() {
    populateReactionOptions();
    syncReactionExchange();

    const speedInput = document.getElementById('reaction-speed');
    const costEl = document.getElementById('reaction-cost');

    if (!speedInput || !costEl) {
        return;
    }

    const { type, rule } = getSelectedReaction();

    // Parata con le braccia, schivata con le gambe
    const preferred = type === 'Schivata' ? LIMB_ORDER_LEGS : LIMB_ORDER_ARMS;

    const defenderId = pendingIncomingAttack?.defender_id;
    const available = window.playersLimbs?.[defenderId];

    if (rule) {
        speedInput.value = rule.speed;
        speedInput.readOnly = true;
        speedInput.style.opacity = '0.8';
        costEl.innerText = rule.frames;
        reactionLimbPicker.update({ cost: Number(rule.frames) || 0, available, preferred, suggest: true });
        return;
    }

    speedInput.readOnly = false;
    speedInput.style.opacity = '1';
    speedInput.value = '';
    speedInput.placeholder = 'Velocità';
    costEl.innerText = '-';
    reactionLimbPicker.update({ cost: 0, available, preferred, suggest: true });
}

// ==========================================
// PANNELLO DI TURNO: "ALTRA AZIONE"
// ==========================================

function populateTableActionSection() {
    const categorySelect = document.getElementById('table-action-category');

    // Si popola una sola volta, appena il compendio è disponibile
    if (!categorySelect || categorySelect.options.length) {
        return;
    }

    getActionCategories().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = `${getCategoryIcon(category)} ${category}`;
        categorySelect.appendChild(option);
    });

    renderTableActionOptions();
}

function renderTableActionOptions(selectedAction) {
    const category = document.getElementById('table-action-category')?.value;
    const actionSelect = document.getElementById('table-action-select');

    if (!actionSelect) return;

    actionSelect.innerHTML = '';

    getActionSpeedEntries()
        .filter(entry => entry.category === category)
        .forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.action;
            option.textContent = `${entry.action} (${entry.frames} F)`;
            actionSelect.appendChild(option);
        });

    if (selectedAction) {
        actionSelect.value = selectedAction;
    }

    updateTableActionInfo();
}

function getSelectedTableAction() {
    return findActionSpeedRule(
        document.getElementById('table-action-select')?.value
    );
}

function updateTableActionInfo() {
    const entry = getSelectedTableAction();

    document.getElementById('table-action-speed').innerText = entry ? entry.speed : '-';
    document.getElementById('table-action-frames').innerText = entry ? entry.frames : '-';

    // Proposta di arti: il movimento parte dalle gambe, il resto dalle braccia
    tableActionLimbPicker.update({
        cost: entry ? Number(entry.frames) || 0 : 0,
        available: window.playersLimbs?.[getCurrentActorId()],
        preferred: entry?.category === 'Movimento' ? LIMB_ORDER_LEGS : LIMB_ORDER_ARMS,
        suggest: true
    });
}

// Frame cambiati (nuovo turno, altre azioni): aggiorna senza cambiare gli arti scelti
function refreshTableActionLimbs() {
    tableActionLimbPicker.update({ available: window.playersLimbs?.[getCurrentActorId()] });
}

function selectTableAction(entry) {
    populateTableActionSection();

    const categorySelect = document.getElementById('table-action-category');
    if (!categorySelect) return;

    categorySelect.value = entry.category;
    renderTableActionOptions(entry.action);
}

document.getElementById('table-action-category')?.addEventListener('change', () => renderTableActionOptions());
document.getElementById('table-action-select')?.addEventListener('change', updateTableActionInfo);

document.getElementById('btn-end-interrupt')?.addEventListener('click', () => socket.emit('end_interrupt'));

// ==========================================
// MINACCIARE: SCELTA DEGLI ESAGONI
// Si cliccano gli esagoni uno a uno (di nuovo per toglierli), solo entro
// la portata dell'arma. I frame si pagano alla conferma.
// ==========================================

let pendingThreatShares = null;

function updateThreatPlacementBar() {
    const bar = document.getElementById('threat-placement-bar');
    const placement = window.threatPlacement;
    if (!bar) return;

    bar.classList.toggle('open', !!placement);
    if (!placement) return;

    document.getElementById('threat-placement-text').textContent =
        `⚠️ Esagoni scelti: ${placement.hexes.size} · portata ${placement.reach} m`;
    document.getElementById('threat-placement-confirm').disabled = placement.hexes.size === 0;
}

function toggleThreatHex(col, row) {
    const placement = window.threatPlacement;
    if (!placement) return;

    if (hexDistance(placement.origin.x, placement.origin.y, col, row) > placement.reach) {
        statusBar.innerText = `⛔ Fuori portata: la tua arma arriva a ${placement.reach} m.`;
        return;
    }

    const key = `${col},${row}`;
    if (placement.hexes.has(key)) placement.hexes.delete(key);
    else placement.hexes.add(key);

    updateThreatPlacementBar();
    requestRender();
}

function cancelThreatPlacement() {
    window.threatPlacement = null;
    pendingThreatShares = null;
    statusBar.innerText = 'Minaccia annullata.';
    updateThreatPlacementBar();
    requestRender();
}

function confirmThreatPlacement() {
    const placement = window.threatPlacement;
    if (!placement || !placement.hexes.size) return;

    socket.emit('declare_threat', {
        char_id: placement.char_id,
        limb_shares: placement.limb_shares,
        hexes: [...placement.hexes]
    });

    window.threatPlacement = null;
    statusBar.innerText = '';
    updateThreatPlacementBar();
    requestRender();
}

socket.on('threat_reach', (data) => {
    if (!pendingThreatShares || pendingThreatShares.char_id !== data.char_id) return;

    window.threatPlacement = {
        ...pendingThreatShares,
        reach: Math.floor(data.reach),
        origin: { x: data.x, y: data.y },
        hexes: new Set()
    };
    pendingThreatShares = null;

    setMoveMode(false);
    statusBar.innerText = "🎯 Clicca gli esagoni da minacciare (di nuovo per toglierli). Invio conferma, Esc annulla.";
    updateThreatPlacementBar();
    requestRender();
});

document.getElementById('threat-placement-confirm')?.addEventListener('click', confirmThreatPlacement);
document.getElementById('threat-placement-cancel')?.addEventListener('click', cancelThreatPlacement);

// ==========================================
// MOVIMENTO IN COMBATTIMENTO
// L'andatura si sceglie qui; "Muovi" (o M) attiva un solo spostamento.
// ==========================================

// Frame per passo: devono coincidere con MOVE_FRAME_COSTS in app.py
const MOVE_PACES = { Camminata: 20, Corsa: 15, Furtivo: 25 };

// Mezza barricata (copertura parziale): in combattimento un giocatore la scavalca
// con 5 PA della statistica scelta (come BARRICADE_PA_COST in app.py)
const BARRICADE_PA_COST = 5;
window.barricadeStat = null;

function getStatPa(char, stat) {
    if (char.pa_stats && char.pa_stats[stat] !== undefined) return Number(char.pa_stats[stat]);
    const value = parseInt(char.stats?.[stat]) || 1;
    return 6 + (value - 1) * 3;
}

// Barricate attraversate dal percorso e PA necessari (solo per i giocatori)
function getBarricadeCrossing(mover, x, y) {
    if (mover.role !== 'player') return null;
    const count = hexLine(mover.x, mover.y, x, y).slice(1)
        .filter(h => terrainAt(h.col, h.row) === 'copertura_parziale').length;
    if (!count) return null;

    const stat = window.barricadeStat;
    const cost = BARRICADE_PA_COST * count;
    return { count, cost, stat, enough: !!stat && getStatPa(mover, stat) >= cost };
}
window.moveMode = false;
window.movePace = 'Camminata';

// Chi si muove: il giocatore nel suo turno, il Master con il combattente di turno
function getMovingCombatant() {
    if (!combatState.is_active || combatState.interrupts?.length) return null;

    const actingId = getActingCombatantId();
    const myId = parseInt(userSelect?.value);
    if (!isMaster && actingId !== myId) return null;

    return characters.find(c => c.id === actingId) || null;
}

function setMoveMode(enabled) {
    window.moveMode = !!enabled && !!getMovingCombatant();
    document.getElementById('btn-move-mode')?.classList.toggle('active', window.moveMode);
    if (window.moveMode) {
        statusBar.innerText = `🦶 ${window.movePace}: clicca la destinazione (Esc per annullare).`;
    }
    requestRender();
}

function updateMoveSection() {
    const section = document.getElementById('combat-move-section');
    const mover = getMovingCombatant();
    if (!section) return;

    section.style.display = mover ? 'block' : 'none';
    if (!mover) {
        window.moveMode = false;
        return;
    }

    const frames = Number(combatState.players_pa?.[mover.id] ?? 120);
    document.getElementById('combat-move-frames').textContent = `${frames} frame`;

    // Statistica per le barricate: solo i giocatori pagano i PA
    const barricadeRow = document.getElementById('combat-move-barricade');
    const statSelect = document.getElementById('combat-move-barricade-stat');
    const stats = Object.keys(mover.stats || {}).filter(key => typeof mover.stats[key] !== 'object');
    barricadeRow.style.display = mover.role === 'player' && stats.length ? 'flex' : 'none';
    if (mover.role === 'player') {
        if (!stats.includes(window.barricadeStat)) window.barricadeStat = stats.includes('Destrezza') ? 'Destrezza' : stats[0];
        statSelect.innerHTML = '';
        stats.forEach(stat => statSelect.add(new Option(`${stat} (${getStatPa(mover, stat)} PA)`, stat)));
        statSelect.value = window.barricadeStat;
    }
    document.querySelectorAll('.move-pace').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.pace === window.movePace);
    });
    document.getElementById('btn-move-mode')?.classList.toggle('active', window.moveMode);
}

document.querySelectorAll('.move-pace').forEach(btn => btn.addEventListener('click', () => {
    window.movePace = btn.dataset.pace;
    updateMoveSection();
    if (window.moveMode) setMoveMode(true);
}));

document.getElementById('btn-move-mode')?.addEventListener('click', () => setMoveMode(!window.moveMode));

document.getElementById('combat-move-barricade-stat')?.addEventListener('change', (e) => {
    window.barricadeStat = e.target.value;
    requestRender();
});

document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if ((e.key === 'm' || e.key === 'M') && getMovingCombatant()) {
        setMoveMode(!window.moveMode);
    } else if (e.key === 'Enter' && window.threatPlacement) {
        confirmThreatPlacement();
    }
});

document.getElementById('btn-execute-table-action')?.addEventListener('click', () => {
    const entry = getSelectedTableAction();

    if (!entry) {
        alert("Scegli prima un'azione dalla tabella.");
        return;
    }

    const actorId = getCurrentActorId();
    if (actorId === null) return;

    const cost = Number(entry.frames) || 0;

    tableActionLimbPicker.update({ available: window.playersLimbs[actorId] });
    const shares = tableActionLimbPicker.getShares();

    if (!shares) {
        alert(`Frame insufficienti negli arti scelti! Ne servono ${cost}: aggiungi un altro arto.`);
        return;
    }

    if (!confirm(`🎬 Confermi "${entry.action}"?\nCosto: ${cost} Frame (${formatLimbShares(shares)})`)) {
        return;
    }

    // Riparazione rapida armatura: ha il suo evento (ridistribuisce la durabilità)
    if (entry.special === 'armor_repair') {
        socket.emit('quick_armor_repair', { char_id: actorId, limb_shares: shares });
        return;
    }

    // Minacciare: prima si scelgono gli esagoni sulla mappa (la portata la decide il server)
    if (entry.special === 'threat') {
        pendingThreatShares = { char_id: actorId, limb_shares: shares };
        socket.emit('request_threat_reach', { char_id: actorId });
        return;
    }

    // Il server verifica il costo, scala i frame e lo annuncia in chat
    socket.emit('perform_table_action', {
        char_id: actorId,
        action: entry.action,
        limb_shares: shares
    });
});

// ==========================================
// FINESTRA TABELLA
// ==========================================

function renderActionSpeedCategoryChips() {
    const container = document.getElementById('action-speed-categories');
    if (!container) return;

    container.innerHTML = '';

    ['', ...getActionCategories()].forEach(category => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'action-speed-chip';
        chip.classList.toggle('active', category === actionSpeedTableCategory);
        chip.textContent = category ? `${getCategoryIcon(category)} ${category}` : 'Tutte';

        chip.addEventListener('click', () => {
            actionSpeedTableCategory = category;
            renderActionSpeedTable();
        });

        container.appendChild(chip);
    });
}

// In difesa si possono scegliere solo le voci che sono reazioni
function isActionSpeedEntrySelectable(entry) {
    return actionSpeedTableTarget !== 'reaction' || !!entry.reaction;
}

function renderActionSpeedTable() {
    const body = document.getElementById('action-speed-table-body');
    const searchInput = document.getElementById('action-speed-search');

    if (!body || !searchInput) {
        return;
    }

    renderActionSpeedCategoryChips();

    const search = searchInput.value.trim().toLowerCase();

    const filtered = getActionSpeedEntries().filter(entry => {
        const matchesCategory =
            !actionSpeedTableCategory ||
            entry.category === actionSpeedTableCategory;

        const matchesSearch =
            !search ||
            `${entry.category || ''} ${entry.action || ''}`.toLowerCase().includes(search);

        return matchesCategory && matchesSearch;
    });

    body.innerHTML = '';

    let lastCategory = null;

    filtered.forEach(entry => {
        // Intestazione di gruppo per ogni categoria
        if (entry.category !== lastCategory) {
            lastCategory = entry.category;

            const groupRow = document.createElement('tr');
            const groupCell = document.createElement('td');
            groupCell.colSpan = 3;
            groupCell.className = 'action-speed-group';
            groupCell.textContent = `${getCategoryIcon(entry.category)} ${entry.category}`;
            groupRow.appendChild(groupCell);
            body.appendChild(groupRow);
        }

        const tr = document.createElement('tr');
        tr.className = 'action-speed-row';

        if (isActionSpeedEntrySelectable(entry)) {
            tr.classList.add('selectable');
            tr.title = 'Clicca per selezionare';
            tr.addEventListener('click', () => pickActionSpeedEntry(entry));
        } else {
            tr.classList.add('disabled');
            tr.title = 'Non utilizzabile come reazione';
        }

        [entry.action, entry.speed, entry.frames].forEach((value, index) => {
            const td = document.createElement('td');
            td.textContent = value ?? '';
            if (index > 0) td.className = 'action-speed-number';
            tr.appendChild(td);
        });

        body.appendChild(tr);
    });

    if (filtered.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'action-speed-empty';
        td.textContent = 'Nessuna azione trovata.';
        tr.appendChild(td);
        body.appendChild(tr);
    }
}

function pickActionSpeedEntry(entry) {
    if (actionSpeedTableTarget === 'reaction') {
        populateReactionOptions();
        document.getElementById('reaction-type').value = entry.action;
        applyReactionSpeedFromTable();
    } else {
        selectTableAction(entry);
    }

    closeActionSpeedTable();
}

function openActionSpeedTable(target) {
    const modal = document.getElementById('action-speed-table-modal');
    if (!modal) return;

    actionSpeedTableTarget = target === 'reaction' ? 'reaction' : 'action';

    // In difesa si parte direttamente dalle reazioni
    actionSpeedTableCategory = actionSpeedTableTarget === 'reaction' ? 'Difesa' : '';

    const hint = document.getElementById('action-speed-table-hint');
    if (hint) {
        hint.textContent = actionSpeedTableTarget === 'reaction'
            ? 'Clicca una difesa per usarla come reazione.'
            : "Clicca un'azione per compilare velocità e frame.";
    }

    const searchInput = document.getElementById('action-speed-search');
    if (searchInput) searchInput.value = '';

    renderActionSpeedTable();

    modal.style.display = 'flex';
    searchInput?.focus();
}

function closeActionSpeedTable() {
    const modal = document.getElementById('action-speed-table-modal');

    if (modal) {
        modal.style.display = 'none';
    }
}

document.querySelectorAll('.action-speed-table-open').forEach(button => {
    button.addEventListener('click', () => openActionSpeedTable(button.dataset.tableTarget));
});

document.getElementById('action-speed-table-close')?.addEventListener('click', closeActionSpeedTable);
document.getElementById('action-speed-search')?.addEventListener('input', renderActionSpeedTable);

document.getElementById('action-speed-table-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'action-speed-table-modal') {
        closeActionSpeedTable();
    }
});


function getAllBrands() {
    const brands = globalCompendio?.indexes?.brands;

    if (Array.isArray(brands)) {
        return ['Tutti', ...brands];
    }

    return [
        'Tutti',
        ...new Set(
            getCompendioItems()
                .map(item => item.brand)
                .filter(Boolean)
        )
    ];
}

function getShopGroup(item) {
    const cls = item?.class || '';

    if (cls === 'Arma') {
        return 'Armi';
    }

    if (cls === 'Licenza') {
        return 'Licenze';
    }

    if (
        cls === 'Kit' ||
        cls === 'Munizione / consumabile'
    ) {
        return 'Oggettistica';
    }

    if (cls === 'Armatura') {
        return 'Armature';
    }

    // Centralina, Gadget, Interfaccia,
    // Caricatore, Connettore, Contenitore...
    return 'Gadget';
}

function getCompendioDescription(item) {
    return (
        item?.text?.original_rules ||
        item?.text?.effect_summary ||
        item?.text?.description ||
        'Nessuna descrizione.'
    );
}

function getCompendioCost(item) {
    const rawCost = item?.equipment?.cost_eur;

    if (
        rawCost === null ||
        rawCost === undefined ||
        rawCost === ''
    ) {
        return null;
    }

    const parsed = Number(rawCost);
    return Number.isFinite(parsed) ? parsed : null;
}

function findCompendioItemById(itemId) {
    if (!itemId) return null;

    return getCompendioItems().find(
        item => item.id === itemId
    ) || null;
}

function characterOwnsCompendiumItem(char, itemId, itemName = null) {
    if (!char) return false;

    const backpack = Array.isArray(char.backpack)
        ? char.backpack
        : [];

    const weapons = Array.isArray(char.weapons)
        ? char.weapons
        : [];

    const collections = [backpack, weapons];

    return collections.some(collection =>
        collection.some(entry => {
            if (typeof entry === 'string') {
                return itemName ? entry === itemName : false;
            }

            if (itemId && entry?.compendium_id === itemId) {
                return true;
            }

            return itemName && entry?.name === itemName;
        })
    );
}

function getWeaponLicenseInfo(compItem) {
    if (!compItem || compItem.class !== 'Arma') {
        return null;
    }

    const weaponData = compItem.weapon || {};

    if (!weaponData.license_id && !weaponData.license_name) {
        return null;
    }

    return {
        id: weaponData.license_id || null,
        name: weaponData.license_name || null
    };
}

function characterHasWeaponLicense(char, compItem) {
    const licenseInfo = getWeaponLicenseInfo(compItem);

    if (!licenseInfo) return true;

    return characterOwnsCompendiumItem(
        char,
        licenseInfo.id,
        licenseInfo.name
    );
}

function findCompendioItem(inventoryItem) {
    if (!inventoryItem) return null;

    if (inventoryItem.custom_definition && typeof inventoryItem.custom_definition === 'object') {
        return inventoryItem.custom_definition;
    }

    const items = getCompendioItems();

    // Metodo nuovo e affidabile
    if (inventoryItem.compendium_id) {
        const found = items.find(
            item => item.id === inventoryItem.compendium_id
        );

        if (found) return found;
    }

    // Compatibilità con vecchi salvataggi
    return items.find(
        item => item.name === inventoryItem.name
    ) || null;
}

function getAllowedSlots(inventoryItem) {
    const compItem = findCompendioItem(inventoryItem);

    if (!compItem) return [];

    return compItem?.equipment?.slot?.allowed_slots || [];
}


const gadgetArmorRequirementMap = {
    visore: 'elmo',
    elmo: 'elmo',
    schiena: 'schiena',
    spalla_dx: 'spalla_dx',
    petto: 'petto',
    spalla_sx: 'spalla_sx',
    avambr_dx: 'avambr_dx',
    cintura: 'cintura',
    avambr_sx: 'avambr_sx',
    guanto_dx: 'guanto_dx',
    gambe: 'gambe',
    guanto_sx: 'guanto_sx',
    stivale_dx: 'stivale_dx',
    stivale_sx: 'stivale_sx'
};

const equipmentSlotLabels = {
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

function isGadgetCompendiumItem(compItem) {
    return !!compItem && getShopGroup(compItem) === 'Gadget';
}

function isGadgetInventoryItem(inventoryItem) {
    return isGadgetCompendiumItem(
        findCompendioItem(inventoryItem)
    );
}

function getRequiredArmorSlotForGadgetSlot(gadgetSlot) {
    return gadgetArmorRequirementMap[gadgetSlot] || gadgetSlot;
}

function hasArmorForGadgetSlot(char, gadgetSlot) {
    const armorSlot = getRequiredArmorSlotForGadgetSlot(gadgetSlot);
    const armorItem = char?.stats?.equipped?.[armorSlot];

    if (!armorItem) return false;

    const compItem = findCompendioItem(armorItem);

    // Gli oggetti moderni devono essere vere armature. Per vecchi salvataggi
    // senza voce nel compendio consideriamo comunque lo slot come occupato.
    return !compItem || compItem.class === 'Armatura';
}

function getAvailableGadgetSlots(char, compItem) {
    const slotInfo = compItem?.equipment?.slot || {};
    const allowedSlots = slotInfo.allowed_slots || [];

    if (slotInfo.occupancy === 'all' && allowedSlots.length > 1) {
        return allowedSlots.every(slot => hasArmorForGadgetSlot(char, slot))
            ? [allowedSlots[0]]
            : [];
    }

    return allowedSlots.filter(slot => hasArmorForGadgetSlot(char, slot));
}

function getMissingArmorLabelsForGadget(char, compItem) {
    const slotInfo = compItem?.equipment?.slot || {};
    const allowedSlots = slotInfo.allowed_slots || [];

    return allowedSlots
        .filter(slot => !hasArmorForGadgetSlot(char, slot))
        .map(slot => equipmentSlotLabels[getRequiredArmorSlotForGadgetSlot(slot)] || slot);
}

socket.on('compendio_data', (data) => {
    globalCompendio = data || {
        items: [],
        indexes: {}
    };

    // Tendina Master: categorie reali del database
    const catSelect = document.getElementById('compendio-category');

    if (catSelect) {
        catSelect.innerHTML =
            '<option value="">-- Seleziona Categoria --</option>';

        const classes =
            globalCompendio?.indexes?.classes ||
            [...new Set(
                getCompendioItems()
                    .map(item => item.class)
                    .filter(Boolean)
            )];

        classes.forEach(category => {
            const option = document.createElement('option');

            option.value = category;
            option.textContent = category;

            catSelect.appendChild(option);
        });
    }

    const currentViewedId = parseInt(userSelect?.value);

    if (
        sheetModal &&
        sheetModal.style.display === 'flex' &&
        !isNaN(currentViewedId)
    ) {
        const char = characters.find(
            c => c.id === currentViewedId
        );

        if (char) populatePlayerSheetUI(char);
    }
});
// Aggiunta manuale dallo Shop Master allo Zaino del Giocatore
// ==========================================
// LISTINO DEL MASTER
// Prezzi di tutto il compendio modificabili al volo, oggetti da dare
// gratis al personaggio selezionato e oggetti nuovi (Forgia).
// ==========================================

const CATALOG_UNPRICED = '__unpriced__';
const CATALOG_CUSTOM = '__custom__';
let catalogEditingId = null;

function isCustomCatalogItem(item) {
    return item?.source?.origin === 'master';
}

function renderCatalogClassOptions() {
    const select = document.getElementById('catalog-class');
    if (!select) return;

    const previous = select.value;
    const classes = [...new Set(getCompendioItems().map(item => item.class).filter(Boolean))].sort();

    select.innerHTML = '';
    select.add(new Option('Tutte le categorie', ''));
    select.add(new Option('⏳ Prezzi da definire', CATALOG_UNPRICED));
    select.add(new Option('✨ Creati dal Master', CATALOG_CUSTOM));
    classes.forEach(cls => select.add(new Option(cls, cls)));

    if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function giveCatalogItem(item) {
    const char = characters.find(c => c.id === selectedCharacterId);
    if (!char) {
        alert('Seleziona prima un personaggio sulla mappa.');
        return;
    }
    if (!confirm(`Dare gratis "${item.name}" a ${char.name}?`)) return;

    grantShopItem(char, item, getShopGroup(item), getCompendioDescription(item));
    // Privato: lo vedono solo il Master e chi riceve il regalo
    socket.emit('combat_msg', {
        name: '🎁 MASTER',
        message: `regala <b>${escapeHtml(item.name)}</b> a <b>${escapeHtml(char.name)}</b>.`,
        private_to: char.id
    });
}

function renderMasterCatalog() {
    const list = document.getElementById('catalog-list');
    if (!list) return;

    const search = (document.getElementById('catalog-search')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('catalog-class')?.value || '';

    const items = getCompendioItems().filter(item => {
        if (filter === CATALOG_UNPRICED && getCompendioCost(item) !== null) return false;
        if (filter === CATALOG_CUSTOM && !isCustomCatalogItem(item)) return false;
        if (filter && filter !== CATALOG_UNPRICED && filter !== CATALOG_CUSTOM && item.class !== filter) return false;
        return !search || `${item.name} ${item.brand || ''}`.toLowerCase().includes(search);
    });

    list.innerHTML = '';

    if (!items.length) {
        list.innerHTML = '<div class="catalog-empty">Nessun oggetto.</div>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'catalog-row';

        const info = document.createElement('div');
        info.className = 'catalog-row-info';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const meta = document.createElement('span');
        meta.className = 'catalog-row-meta';
        meta.textContent = [item.class, item.brand, isCustomCatalogItem(item) ? '✨ del Master' : null].filter(Boolean).join(' · ');
        info.append(name, meta);

        // Prezzo: Invio o 💾 per salvare, vuoto = da definire
        const cost = getCompendioCost(item);
        const price = document.createElement('input');
        price.type = 'number';
        price.min = '0';
        price.className = 'catalog-price';
        price.value = cost ?? '';
        price.placeholder = 'da definire';
        price.classList.toggle('unpriced', cost === null);

        const savePrice = () => {
            const value = price.value.trim();
            const next = value === '' ? null : Math.max(0, parseInt(value) || 0);
            if (next === cost) return;
            socket.emit('set_item_price', { compendium_id: item.id, price: next });
        };
        price.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePrice(); });

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '💾';
        saveBtn.title = 'Salva il prezzo';
        saveBtn.addEventListener('click', savePrice);

        // Licenza collegata a un'arma: il prezzo è il 25% dell'arma, non si scrive a mano
        if (item.price_rule) {
            const rule = item.price_rule;
            price.readOnly = true;
            price.title = `${rule.percent}% del prezzo di ${rule.base_name}: cambia il prezzo dell'arma`;
            price.placeholder = `${rule.percent}% arma`;
            saveBtn.disabled = true;
            saveBtn.title = price.title;
            meta.textContent += ` · 💡 ${rule.percent}% di ${rule.base_name}` + (cost === null ? ' (arma senza prezzo)' : '');
        }

        const giveBtn = document.createElement('button');
        giveBtn.type = 'button';
        giveBtn.className = 'catalog-give';
        giveBtn.textContent = getShopGroup(item) === 'Armi' ? '+ Metti nelle Armi' : '+ Metti in Zaino';
        giveBtn.addEventListener('click', () => giveCatalogItem(item));

        row.append(info, price, saveBtn, giveBtn);

        if (isCustomCatalogItem(item)) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = '✏️';
            editBtn.title = 'Modifica oggetto';
            editBtn.addEventListener('click', () => startCatalogEdit(item));

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Elimina oggetto';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Eliminare "${item.name}" dal compendio? Chi lo possiede già lo tiene.`)) {
                    socket.emit('delete_custom_item', { id: item.id });
                }
            });

            row.append(editBtn, deleteBtn);
        }

        list.appendChild(row);
    });
}

function startCatalogEdit(item) {
    catalogEditingId = item.id;
    document.getElementById('forge-class').value = item.class || 'Gadget';
    document.getElementById('forge-name').value = item.name || '';
    document.getElementById('forge-brand').value = item.brand || '';
    document.getElementById('forge-cost').value = getCompendioCost(item) ?? '';
    document.getElementById('forge-desc').value = item.text?.description || '';

    const allowed = item.equipment?.slot?.allowed_slots || [];
    document.getElementById('forge-slot').value = allowed.length > 1 ? 'any' : (allowed[0] || '');

    document.getElementById('catalog-forge-title').textContent = `✏️ Modifica: ${item.name}`;
    document.getElementById('forge-submit').textContent = '💾 Salva modifiche';
    document.getElementById('forge-cancel-edit').style.display = 'inline-block';
    document.getElementById('forge-name').focus();
}

function resetCatalogForge() {
    catalogEditingId = null;
    document.getElementById('catalog-forge')?.reset();
    document.getElementById('catalog-forge-title').textContent = '✨ Forgia nuovo oggetto';
    document.getElementById('forge-submit').textContent = '✨ Aggiungi al compendio';
    document.getElementById('forge-cancel-edit').style.display = 'none';
}

document.getElementById('catalog-forge')?.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = document.getElementById('forge-name').value.trim();
    if (!name) return;

    socket.emit('save_custom_item', {
        id: catalogEditingId,
        class: document.getElementById('forge-class').value,
        name,
        brand: document.getElementById('forge-brand').value.trim(),
        cost: document.getElementById('forge-cost').value,
        slot: document.getElementById('forge-slot').value,
        description: document.getElementById('forge-desc').value.trim()
    });

    resetCatalogForge();
});

document.getElementById('forge-cancel-edit')?.addEventListener('click', resetCatalogForge);
document.getElementById('catalog-search')?.addEventListener('input', renderMasterCatalog);
document.getElementById('catalog-class')?.addEventListener('change', renderMasterCatalog);

document.querySelectorAll('.open-master-catalog-btn').forEach(btn => btn.addEventListener('click', () => {
    if (!isMaster) return;
    socket.emit('get_compendio');
    renderCatalogClassOptions();
    renderMasterCatalog();
    document.getElementById('master-catalog-modal')?.classList.add('open');
}));

document.getElementById('master-catalog-close')?.addEventListener('click', () => {
    document.getElementById('master-catalog-modal')?.classList.remove('open');
});

// Prezzi e oggetti aggiornati (anche da un altro Master): il Listino si ridisegna
socket.on('compendio_data', () => {
    if (!document.getElementById('master-catalog-modal')?.classList.contains('open')) return;
    renderCatalogClassOptions();
    renderMasterCatalog();
});

resetCatalogForge();

updateChatStatus();
updateSheetButton();

// ==========================================
// PUNTATORE LASER (PING MAPPA)
// ==========================================

// 1. Invia il segnale col Tasto Destro
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // Blocca il noioso menu a tendina di Windows/Chrome

    const currentCharacter = getSelectedCharacter();

    // Solo chi ha selezionato una pedina o il Master può usare il puntatore
    if (!isMaster && !currentCharacter) {
        return;
    }

    const pos = getWorldPos(event);

    // Recupera colore e nome per personalizzare il laser
    const name = isMaster ? "Master" : currentCharacter.name;
    const color = isMaster ? "#c0392b" : (currentCharacter.color || "#3498db");

    socket.emit('ping_location', {
        x: pos.x,
        y: pos.y,
        name: name,
        color: color
    });
});

// 2. Ricevi e disegna il segnale visivo
socket.on('show_ping', (data) => {
    const container = document.getElementById('game-container');
    if (!container) return;

    // Crea il contenitore del ping
    const pingGroup = document.createElement('div');
    pingGroup.className = 'ping-container';
    pingGroup.style.left = (data.x * camera.zoom + camera.x) + 'px';
    pingGroup.style.top = (data.y * camera.zoom + camera.y) + 'px';

    // Crea l'anello pulsante
    const pingCircle = document.createElement('div');
    pingCircle.className = 'ping-marker';
    pingCircle.style.borderColor = data.color;

    // Crea l'etichetta col nome di chi ha pingato
    const pingName = document.createElement('div');
    pingName.className = 'ping-name';
    pingName.innerText = data.name;
    pingName.style.backgroundColor = data.color;

    pingGroup.appendChild(pingCircle);
    pingGroup.appendChild(pingName);
    container.appendChild(pingGroup);

    // Distrugge l'elemento HTML dopo 1 secondo esatto (fine dell'animazione CSS)
    setTimeout(() => {
        if (container.contains(pingGroup)) {
            container.removeChild(pingGroup);
        }
    }, 1000);
});

// ==========================================
// GESTIONE PROFILO (AVATAR LOCALE E LORE)
// ==========================================
let profileEditTargetId = null;
let profileEditBase64 = "";
let profileTokenBase64 = "";

function openProfileEdit(char) {
    profileEditTargetId = char.id;
    profileEditBase64 = char.photo_url || ""; // Mantiene la foto vecchia se non se ne carica una nuova
    profileTokenBase64 = char.token_url || ""; // Mantiene la pedina vecchia se non se ne carica una nuova
    document.getElementById('profile-lore').value = char.lore || "";
    document.getElementById('profile-photo-file').value = ""; // Resetta l'input del file
    document.getElementById('profile-token-file').value = ""; // Resetta l'input del file
    document.getElementById('profile-edit-modal').style.display = 'flex';
}

// Quando scegli il file dal PC, lo legge e lo converte in codice (Base64)
document.getElementById('profile-photo-file')?.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        profileEditBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('profile-token-file')?.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== "image/png") {
        alert("La pedina deve essere un file PNG.");
        event.target.value = "";
        return;
    }

    if (file.size > TOKEN_MAX_BYTES) {
        alert(`La pedina è troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Massimo 5 MB.`);
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        profileTokenBase64 = e.target.result;
    };

    reader.readAsDataURL(file);
});

// Salva Profilo
document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    if (!profileEditTargetId) return;

    socket.emit('update_character_sheet', {
        char_id: profileEditTargetId,
        photo_url: profileEditBase64,
        token_url: profileTokenBase64,
        lore: document.getElementById('profile-lore').value.trim()
    });

    document.getElementById('profile-edit-modal').style.display = 'none';
});

// Chiusura Modale Profilo
document.getElementById('close-profile-modal')?.addEventListener('click', () => {
    document.getElementById('profile-edit-modal').style.display = 'none';
});
window.addEventListener('click', (event) => {
    if (event.target === document.getElementById('profile-edit-modal')) {
        document.getElementById('profile-edit-modal').style.display = 'none';
    }
});

// ==========================================
// FUNZIONI GLOBALI ZAINO
// ==========================================
window.updateBackpackItem = function(charId, itemIndex, delta) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bp = char.backpack || [];
    if (!bp[itemIndex]) return;

    // Convertitore di sicurezza: trasforma il vecchio testo in un oggetto numerico
    if (typeof bp[itemIndex] === 'string') {
        bp[itemIndex] = { name: bp[itemIndex], desc: "Nessuna descrizione", qty: 1 };
    }

    bp[itemIndex].qty += delta;

    if (bp[itemIndex].qty <= 0) {
        if (confirm(`La quantità di ${bp[itemIndex].name} è 0. Vuoi rimuoverlo dallo zaino?`)) {
            bp.splice(itemIndex, 1);
        } else {
            bp[itemIndex].qty = 1; // Annulla la rimozione
        }
    }
    socket.emit('update_character_sheet', { char_id: charId, backpack: bp });
};

window.removeBackpackItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bp = char.backpack || [];
    if (!bp[itemIndex]) return;

    const itemName = typeof bp[itemIndex] === 'string' ? bp[itemIndex] : bp[itemIndex].name;

    if (confirm(`Sicuro di voler buttare via ${itemName}?`)) {
        bp.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, backpack: bp });
    }
};

// ==========================================
// FUNZIONI GLOBALI ARMI
// ==========================================
window.removeWeaponItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const wp = char.weapons || [];
    if (!wp[itemIndex]) return;

    const itemName = typeof wp[itemIndex] === 'string' ? wp[itemIndex] : wp[itemIndex].name;

    if (confirm(`Sicuro di voler scartare l'arma: ${itemName}?`)) {
        wp.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, weapons: wp });
    }
};

// ==========================================
// FUNZIONI GLOBALI BONUS TEMPORANEI
// ==========================================
window.removeBonusItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bList = char.bonuses || [];
    if (!bList[itemIndex]) return;

    const itemName = typeof bList[itemIndex] === 'string' ? bList[itemIndex] : bList[itemIndex].name;

    if (confirm(`Rimuovere l'effetto: ${itemName}?`)) {
        bList.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, bonuses: bList });
    }
};

// ==========================================
// TRASCINAMENTO FINESTRE (Drag & Drop)
// ==========================================
const tracker = document.getElementById('combat-tracker');

// Se non ha già la struttura con l'header, la creiamo
if (tracker && !document.getElementById('tracker-header')) {
    tracker.innerHTML = `
        <div id="tracker-header">⚔️ Ordine di Turno 🖐️</div>
        <div id="tracker-list"></div>
    `;
}

const trackerHeader = document.getElementById('tracker-header');
let isDraggingTracker = false;

// ◀ / ▶ riduce la barra dei turni alla sola maniglia
const trackerToggle = document.getElementById('tracker-toggle');
trackerToggle?.addEventListener('mousedown', (e) => e.stopPropagation());
trackerToggle?.addEventListener('click', () => {
    const collapsed = tracker.classList.toggle('collapsed');
    trackerToggle.textContent = collapsed ? '▶' : '◀';
});
let dragOffsetX = 0;
let dragOffsetY = 0;

if (trackerHeader) {
    trackerHeader.addEventListener('mousedown', (e) => {
        isDraggingTracker = true;
        const rect = tracker.getBoundingClientRect();
        // La barra parte centrata in alto: al primo trascinamento si "stacca"
        tracker.style.transform = 'none';
        tracker.style.left = rect.left + 'px';
        tracker.style.top = rect.top + 'px';
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingTracker) return;
        tracker.style.left = (e.clientX - dragOffsetX) + 'px';
        tracker.style.top = (e.clientY - dragOffsetY) + 'px';
        tracker.style.right = 'auto'; // Sgancia la finestra da destra
    });

    document.addEventListener('mouseup', () => {
        isDraggingTracker = false;
    });
}

// ==========================================
// TRASCINAMENTO PANNELLO EQUIPAGGIAMENTO
// ==========================================
const equipPanel = document.getElementById('equipped-panel');
const equipHeader = document.getElementById('equip-header');

let isDraggingEquip = false;
let dragEquipOffsetX = 0;
let dragEquipOffsetY = 0;

if (equipHeader && equipPanel) {
    equipHeader.addEventListener('mousedown', (e) => {
        // Il pulsante della tendina non deve avviare il trascinamento.
        if (e.target?.id === 'equip-toggle') {
            e.stopPropagation();
            return;
        }

        isDraggingEquip = true;
        // Calcola dove hai cliccato rispetto al bordo del pannello
        dragEquipOffsetX = e.clientX - equipPanel.getBoundingClientRect().left;
        dragEquipOffsetY = e.clientY - equipPanel.getBoundingClientRect().top;
        equipHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingEquip) return;
        // Aggiorna la posizione in base al mouse
        equipPanel.style.left = (e.clientX - dragEquipOffsetX) + 'px';
        equipPanel.style.top = (e.clientY - dragEquipOffsetY) + 'px';
        // Rimuove il vincolo del "bottom" originario per lasciarlo libero
        equipPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDraggingEquip = false;
        equipHeader.style.cursor = 'grab';
    });
}


// ==========================================
// TRASCINAMENTO PANNELLO GADGET
// ==========================================
const gadgetPanel = document.getElementById('gadget-panel');
const gadgetHeader = document.getElementById('gadget-header');

let isDraggingGadget = false;
let dragGadgetOffsetX = 0;
let dragGadgetOffsetY = 0;

if (gadgetHeader && gadgetPanel) {
    gadgetHeader.addEventListener('mousedown', (e) => {
        if (e.target?.id === 'gadget-toggle') return;
        isDraggingGadget = true;
        dragGadgetOffsetX = e.clientX - gadgetPanel.getBoundingClientRect().left;
        dragGadgetOffsetY = e.clientY - gadgetPanel.getBoundingClientRect().top;
        gadgetHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingGadget) return;
        gadgetPanel.style.left = (e.clientX - dragGadgetOffsetX) + 'px';
        gadgetPanel.style.top = (e.clientY - dragGadgetOffsetY) + 'px';
        gadgetPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDraggingGadget = false;
        gadgetHeader.style.cursor = 'grab';
    });
}

// I due pannelli possono essere ridotti senza nascondere la doll all'avvio.
function bindPanelToggle(toggleId, contentId) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    if (!toggle || !content) return;

    // Uso onclick per avere un solo handler anche dopo eventuali refresh UI.
    toggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = content.style.display !== 'none';
        content.style.display = isOpen ? 'none' : 'block';
        toggle.textContent = isOpen ? '▶' : '▼';
        toggle.title = isOpen ? 'Espandi' : 'Riduci a icona';
    };

    // Evita che il click sulla freccia venga interpretato come drag.
    toggle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
}

bindPanelToggle('equip-toggle', 'equip-content');
bindPanelToggle('gadget-toggle', 'gadget-content');

// ==========================================
// TRASCINAMENTO PANNELLO AZIONE COMBATTIMENTO
// ==========================================
const actionPanel = document.getElementById('combat-action-panel');
const actionHeader = document.getElementById('action-header');

let isDraggingAction = false;
let dragActionOffsetX = 0;
let dragActionOffsetY = 0;

if (actionHeader && actionPanel) {
    actionHeader.addEventListener('mousedown', (e) => {
        isDraggingAction = true;
        dragActionOffsetX = e.clientX - actionPanel.getBoundingClientRect().left;
        dragActionOffsetY = e.clientY - actionPanel.getBoundingClientRect().top;
        actionHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingAction) return;
        actionPanel.style.left = (e.clientX - dragActionOffsetX) + 'px';
        actionPanel.style.top = (e.clientY - dragActionOffsetY) + 'px';
        actionPanel.style.bottom = 'auto'; // Sgancia la finestra dal basso
        actionPanel.style.right = 'auto';  // Sgancia la finestra da destra
    });

    document.addEventListener('mouseup', () => {
        isDraggingAction = false;
        if(actionHeader) actionHeader.style.cursor = 'grab';
    });
}

// ==========================================
// HUD EQUIPAGGIAMENTO
// ==========================================

// ==========================================
// HELPERS DATI EQUIPAGGIAMENTO V2
// ==========================================

function getEquippedCompendiumItem(itemData) {
    if (!itemData) return null;

    if (itemData.custom_definition && typeof itemData.custom_definition === 'object') {
        return itemData.custom_definition;
    }

    return findCompendioItem({
        compendium_id: itemData.compendium_id || null,
        name: itemData.name
    });
}

function formatEquipmentDamage(compItem) {
    const formula = compItem?.combat?.damage?.formula;

    if (!formula) return null;

    return String(formula);
}

function formatEquipmentSpeed(compItem) {
    if (!compItem) return null;

    return (
        compItem?.activation?.speed?.effect_or_action ??
        compItem?.activation?.speed?.activation ??
        null
    );
}

function formatEquipmentRange(compItem) {
    const range = compItem?.combat?.range?.max_m;

    if (range === null || range === undefined || range === '') {
        return null;
    }

    return `${range} m`;
}

function buildEquipmentTooltip(itemData) {
    const compItem = getEquippedCompendiumItem(itemData);

    if (!compItem) {
        return itemData.desc || "Nessuna descrizione.";
    }

    const rows = [];

    const brand = compItem?.brand;
    const slot = compItem?.equipment?.slot?.raw;
    const weight = compItem?.equipment?.weight;
    const harmonization = compItem?.equipment?.harmonization;
    const hp = compItem?.equipment?.hp;

    const speed = formatEquipmentSpeed(compItem);
    const range = formatEquipmentRange(compItem);
    const damage = formatEquipmentDamage(compItem);

    if (brand) {
        rows.push(`<b>Brand:</b> ${brand}`);
    }

    if (slot) {
        rows.push(`<b>Slot:</b> ${slot}`);
    }

    if (weight !== null && weight !== undefined) {
        rows.push(`<b>Peso:</b> ${weight}`);
    }

    if (harmonization !== null && harmonization !== undefined) {
        rows.push(`<b>Armonizzazione:</b> ${harmonization}`);
    }

    if (hp !== null && hp !== undefined) {
        rows.push(`<b>Vita:</b> ${hp}`);
    }

    if (speed !== null && speed !== undefined) {
        rows.push(`<b>Velocità:</b> ${speed}`);
    }

    if (range) {
        rows.push(`<b>Range:</b> ${range}`);
    }

    if (damage) {
        rows.push(`<b>Danno:</b> ${damage}`);
    }

    const requirements =
        compItem?.requirements?.items || [];

    if (requirements.length > 0) {
        rows.push(
            `<b>Requisiti:</b> ${requirements.join(', ')}`
        );
    }

    const rules =
        compItem?.text?.original_rules ||
        compItem?.text?.effect_summary ||
        compItem?.text?.description;

    if (rules) {
        rows.push(
            `<div style="margin-top:6px;">${rules}</div>`
        );
    }

    return rows.join('<br>');
}

window.updateEquippedPanel = function(char) {
    const panel = document.getElementById('equipped-panel');
    const gadgetPanelEl = document.getElementById('gadget-panel');
    if (!panel) return;

    // Il Master vede le doll solo quando ha selezionato un'entità.
    // Il giocatore invece vede subito le doll, anche completamente vuote.
    if (
        typeof isMaster !== 'undefined' &&
        isMaster &&
        (
            !char ||
            char.id !== selectedCharacterId
        )
    ) {
        panel.style.display = 'none';
        if (gadgetPanelEl) gadgetPanelEl.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    if (gadgetPanelEl) gadgetPanelEl.style.display = 'block';

    // Personaggio mostrato: serve alla riparazione rapida
    panel.dataset.charId = char?.id ?? '';

    // Nessuna migrazione/scrittura automatica durante il caricamento.
    // Le modifiche all'equipaggiamento partono solo da azioni esplicite dell'utente.
    const equipped = char?.stats?.equipped || {};

    if (typeof window.updateGadgetPanel === 'function') {
        window.updateGadgetPanel(char || null);
    }

    // ==========================================
    // SLOT DISPONIBILI
    // ==========================================

    const slotKeys = [
        'visore',
        'elmo',
        'schiena',

        'spalla_dx',
        'petto',
        'spalla_sx',

        'avambr_dx',
        'cintura',
        'avambr_sx',

        'guanto_dx',
        'gambe',
        'guanto_sx',

        'mano_dx',
        'mano_sx',

        'stivale_dx',
        'stivale_sx'
    ];

    // ==========================================
    // TESTO SLOT VUOTI
    // ==========================================

    const defaultSlotText = {
        visore: 'VISORE',
        elmo: 'ELMO',
        schiena: 'SCHIENA',

        spalla_dx: 'SPALLA DX',
        petto: 'PETTO',
        spalla_sx: 'SPALLA SX',

        avambr_dx: 'AVAMBR. DX',
        cintura: 'CINTURA',
        avambr_sx: 'AVAMBR. SX',

        guanto_dx: 'GUANTO DX',
        gambe: 'GAMBE',
        guanto_sx: 'GUANTO SX',

        mano_dx: 'ARMA DX',
        mano_sx: 'ARMA SX',

        stivale_dx: 'STIVALE DX',
        stivale_sx: 'STIVALE SX'
    };

    // ==========================================
    // EMOJI FALLBACK
    // ==========================================

    const slotEmojis = {
        visore: '🥽',
        elmo: '🪖',
        schiena: '🎒',

        spalla_dx: '🦾',
        petto: '🦺',
        spalla_sx: '🦾',

        avambr_dx: '🛡️',
        cintura: '🥋',
        avambr_sx: '🛡️',

        guanto_dx: '🧤',
        gambe: '👖',
        guanto_sx: '🧤',

        mano_dx: '🗡️',
        mano_sx: '🗡️',

        stivale_dx: '🥾',
        stivale_sx: '🥾'
    };

    // ==========================================
    // RETROCOMPATIBILITÀ VECCHI SALVATAGGI
    // ==========================================

    const legacySlotAliases = {
        guanto_dx: 'guanti',
        stivale_dx: 'stivali'
    };

    // ==========================================
    // CICLO SLOT
    // ==========================================

    slotKeys.forEach(key => {

        const el = document.getElementById(`slot-${key}`);
        if (!el) return;

        const legacyKey = legacySlotAliases[key];

        const actualSlotKey = equipped[key]
            ? key
            : (
                legacyKey && equipped[legacyKey]
                    ? legacyKey
                    : key
            );

        const itemData = equipped[actualSlotKey];

        const nameEl = el.querySelector('.doll-name');
        const iconEl = el.querySelector('.doll-icon');

        if (!nameEl || !iconEl) return;

        // ==========================================
        // SLOT OCCUPATO
        // ==========================================

        if (itemData) {

            nameEl.innerText = itemData.name || 'Oggetto';
            nameEl.style.color = '#f1c40f';

            el.classList.add('filled');

            // ==========================================
            // CERCA DATI NEL NUOVO COMPENDIO
            // ==========================================

            const compItem = typeof findCompendioItem === 'function'
                ? findCompendioItem({
                    compendium_id: itemData.compendium_id || null,
                    name: itemData.name
                })
                : null;

            // ==========================================
            // DATI STRUTTURATI
            // ==========================================

            const damage =
                compItem?.combat?.damage?.formula ?? null;

            const activationSpeed =
                compItem?.activation?.speed?.effect_or_action ??
                compItem?.activation?.speed?.activation ??
                null;

            const range =
                compItem?.combat?.range?.max_m ?? null;

            const equipmentHp =
                compItem?.equipment?.hp ?? null;

            // ==========================================
            // DURABILITÀ
            // ==========================================

            const maxHp =
                itemData.durability_max ??
                equipmentHp ??
                null;

            const currentHp =
                itemData.durability_current ??
                maxHp;

            // ==========================================
            // OVERLAY ICONA
            // ==========================================

            let overlayHtml = '';

            // DANNO
            if (
                damage !== null &&
                damage !== undefined &&
                String(damage).trim() !== ''
            ) {

                overlayHtml += `
                    <div style="
                        position:absolute;
                        top:2px;
                        right:2px;
                        max-width:90%;
                        background:#c0392b;
                        color:white;
                        font-size:9px;
                        padding:1px 3px;
                        border-radius:3px;
                        font-weight:bold;
                        box-shadow:0 0 2px #000;
                        z-index:5;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                    ">
                        ⚔️ ${damage}
                    </div>
                `;
            }

            // CARICATORE (armi da fuoco): clic per ricaricare
            const ammoSpec = getFirearmSpec(compItem);
            if (ammoSpec) {
                const loaded = itemData.ammo_loaded?.count ?? 0;
                overlayHtml += `
                    <div class="doll-ammo-badge${loaded ? '' : ' empty'}"
                         title="${loaded ? escapeHtml(itemData.ammo_loaded?.name || '') : 'Scarica'}: clic per ricaricare"
                         onclick="event.stopPropagation(); window.reloadWeapon(${char.id}, '${actualSlotKey}')">
                        🔫 ${loaded}/${ammoSpec.capacity}
                    </div>
                `;
            }

            // HP / DURABILITÀ
            if (
                maxHp !== null &&
                maxHp !== undefined &&
                Number(maxHp) > 0
            ) {

                const safeMaxHp = Number(maxHp);

                const safeCurrentHp = Math.max(
                    0,
                    Math.min(
                        Number(currentHp ?? safeMaxHp),
                        safeMaxHp
                    )
                );

                const hpPercent =
                    (safeCurrentHp / safeMaxHp) * 100;

                let barColor = '#2ecc71';

                if (hpPercent <= 25) {
                    barColor = '#e74c3c';
                } else if (hpPercent <= 50) {
                    barColor = '#f39c12';
                }

                overlayHtml += `
                    <div style="
                        position:absolute;
                        bottom:10px;
                        left:2px;
                        background:#2980b9;
                        color:white;
                        font-size:9px;
                        padding:1px 3px;
                        border-radius:3px;
                        font-weight:bold;
                        box-shadow:0 0 2px #000;
                        z-index:5;
                    ">
                        🛡️ ${safeCurrentHp}/${safeMaxHp}
                    </div>

                    <div style="
                        position:absolute;
                        bottom:2px;
                        left:2px;
                        right:2px;
                        height:4px;
                        background:rgba(0,0,0,0.5);
                        border-radius:2px;
                        overflow:hidden;
                        z-index:5;
                    ">
                        <div style="
                            width:${hpPercent}%;
                            height:100%;
                            background:${barColor};
                            transition:width 0.3s ease;
                        "></div>
                    </div>
                `;
            }

            // ==========================================
            // IMMAGINE / EMOJI
            // ==========================================

            if (itemData.img) {

                iconEl.style.backgroundImage =
                    `url('${itemData.img}')`;

                iconEl.style.backgroundSize = 'contain';
                iconEl.style.backgroundRepeat = 'no-repeat';
                iconEl.style.backgroundPosition = 'center';

                iconEl.innerHTML = overlayHtml;

            } else {

                iconEl.style.backgroundImage = 'none';

                const fallbackEmoji =
                    slotEmojis[key] || '📦';

                iconEl.innerHTML = `
                    ${overlayHtml}

                    <span style="
                        font-size:22px;
                        opacity:0.9;
                        filter:drop-shadow(
                            0px 2px 2px rgba(0,0,0,0.8)
                        );
                        margin-bottom:5px;
                    ">
                        ${fallbackEmoji}
                    </span>
                `;
            }

            // ==========================================
            // TOOLTIP STRUTTURATO
            // ==========================================

            let tooltipHtml = '';

            if (compItem) {

                const tooltipRows = [];

                const slot =
                    compItem?.equipment?.slot?.raw;

                const weight =
                    compItem?.equipment?.weight;

                const harmonization =
                    compItem?.equipment?.harmonization;

                const requirements =
                    compItem?.requirements?.items || [];

                if (slot) {
                    tooltipRows.push(
                        `<b>Slot:</b> ${slot}`
                    );
                }

                if (
                    weight !== null &&
                    weight !== undefined
                ) {
                    tooltipRows.push(
                        `<b>Peso:</b> ${weight}`
                    );
                }

                if (
                    harmonization !== null &&
                    harmonization !== undefined
                ) {
                    tooltipRows.push(
                        `<b>Armonizzazione:</b> ${harmonization}`
                    );
                }

                if (
                    maxHp !== null &&
                    maxHp !== undefined
                ) {
                    tooltipRows.push(
                        `<b>Vita:</b> ${currentHp}/${maxHp}`
                    );
                }

                if (
                    activationSpeed !== null &&
                    activationSpeed !== undefined
                ) {
                    tooltipRows.push(
                        `<b>Velocità:</b> ${activationSpeed}`
                    );
                }

                if (
                    range !== null &&
                    range !== undefined
                ) {
                    tooltipRows.push(
                        `<b>Range:</b> ${range} m`
                    );
                }

                if (
                    damage !== null &&
                    damage !== undefined &&
                    String(damage).trim() !== ''
                ) {
                    tooltipRows.push(
                        `<b>Danno:</b> ${damage}`
                    );
                }

                if (requirements.length > 0) {
                    tooltipRows.push(
                        `<b>Requisiti:</b> ${requirements.join(', ')}`
                    );
                }

                const rules =
                    compItem?.text?.original_rules ||
                    compItem?.text?.effect_summary ||
                    compItem?.text?.description;

                if (rules) {
                    tooltipRows.push(`
                        <div style="
                            margin-top:6px;
                            border-top:1px solid #555;
                            padding-top:6px;
                        ">
                            ${rules}
                        </div>
                    `);
                }

                tooltipHtml =
                    tooltipRows.join('<br>');

            } else {

                // Fallback vecchi oggetti
                tooltipHtml =
                    itemData.desc ||
                    'Nessuna descrizione.';
            }

            // Salviamo temporaneamente il tooltip sull'elemento
            el.dataset.tooltipHtml = tooltipHtml;

        } else {

            // ==========================================
            // SLOT VUOTO
            // ==========================================

            nameEl.innerText = 'Vuoto';
            nameEl.style.color = '#7f8c8d';

            el.classList.remove('filled');

            iconEl.style.backgroundImage = 'none';

            iconEl.innerHTML = `
                <span style="
                    font-size:10px;
                    font-weight:bold;
                    letter-spacing:1px;
                    color:rgba(52,152,219,0.4);
                    text-transform:uppercase;
                ">
                    ${defaultSlotText[key]}
                </span>
            `;

            el.dataset.tooltipHtml = '';
        }

        // ==========================================
        // RICREA ELEMENTO
        // per evitare listener duplicati
        // ==========================================

        const newEl = el.cloneNode(true);

        el.parentNode.replaceChild(
            newEl,
            el
        );

        // ==========================================
        // TOOLTIP
        // ==========================================

        newEl.addEventListener(
            'mouseenter',
            (e) => {

                if (!itemData) return;

                const tt =
                    document.getElementById(
                        'equip-tooltip'
                    );

                if (!tt) return;

                const ttName =
                    document.getElementById(
                        'tt-name'
                    );

                const ttDesc =
                    document.getElementById(
                        'tt-desc'
                    );

                if (ttName) {
                    ttName.innerText =
                        itemData.name || 'Oggetto';
                }

                if (ttDesc) {
                    ttDesc.innerHTML =
                        newEl.dataset.tooltipHtml ||
                        itemData.desc ||
                        '';
                }

                tt.style.display = 'block';

                tt.style.left =
                    (e.pageX + 15) + 'px';

                tt.style.top =
                    (e.pageY - 15) + 'px';
            }
        );

        newEl.addEventListener(
            'mousemove',
            (e) => {

                if (!itemData) return;

                const tt =
                    document.getElementById(
                        'equip-tooltip'
                    );

                if (!tt) return;

                tt.style.left =
                    (e.pageX + 15) + 'px';

                tt.style.top =
                    (e.pageY - 15) + 'px';
            }
        );

        newEl.addEventListener(
            'mouseleave',
            () => {

                const tt =
                    document.getElementById(
                        'equip-tooltip'
                    );

                if (tt) {
                    tt.style.display = 'none';
                }
            }
        );

        // ==========================================
        // CLICK = DISEQUIPAGGIA
        // ==========================================

        newEl.addEventListener(
            'click',
            () => {

                if (!itemData) return;

                if (
                    confirm(
                        `Vuoi rimettere "${itemData.name}" nello zaino?`
                    )
                ) {

                    const tt =
                        document.getElementById(
                            'equip-tooltip'
                        );

                    if (tt) {
                        tt.style.display = 'none';
                    }

                    window.unequipFromSlot(
                        char.id,
                        actualSlotKey
                    );
                }
            }
        );

    });
};

// ==========================================
// HELPERS EQUIPAGGIAMENTO
// ==========================================

// Rimette nello zaino / armi un oggetto precedentemente equipaggiato.
function returnEquippedItemToInventory(item, backpack, weapons) {
    if (!item) return;

    const cleanItem = {
        compendium_id:
            item.compendium_id || null,

        name:
            item.name,

        desc:
            item.desc || "Nessuna descrizione",

        brand:
            item.brand || findCompendioItem(item)?.brand || null,

        qty: 1,

        img:
            item.img || "",

        durability_current:
            item.durability_current ?? null,

        durability_max:
            item.durability_max ?? null,

        custom_definition:
            item.custom_definition || null,

        forged:
            !!item.forged,

        forged_from_sidequest:
            item.forged_from_sidequest || null
    };

    const originalType = item.original_type || 'backpack';

    if (originalType === 'weapon') {

        // Le armi sono elementi singoli, quindi ne reinseriamo una.
        weapons.push({
            compendium_id: cleanItem.compendium_id,
            name: cleanItem.name,
            desc: cleanItem.desc,
            img: cleanItem.img,
            brand: cleanItem.brand,
            durability_current: cleanItem.durability_current,
            durability_max: cleanItem.durability_max,
            custom_definition: cleanItem.custom_definition,
            forged: cleanItem.forged,
            forged_from_sidequest: cleanItem.forged_from_sidequest
        });

    } else {

        // Per lo zaino proviamo prima ad accorpare la quantità.
        const existing = backpack.find(b => {
            if (typeof b === 'string') {
                return b === cleanItem.name;
            }

            if (
                cleanItem.compendium_id &&
                b.compendium_id
            ) {
                return b.compendium_id === cleanItem.compendium_id;
            }

            return b.name === cleanItem.name;
        });

        if (existing && typeof existing !== 'string') {
            existing.qty = (existing.qty || 1) + 1;
        } else {
            backpack.push(cleanItem);
        }
    }
}

// Restituisce tutti gli slot occupati dalla stessa ISTANZA equipaggiata.
function getLinkedEquippedSlots(equipped, slotKey) {
    const item = equipped[slotKey];

    if (!item) return [];

    // Nuovo sistema x2
    if (item.equip_group_id) {
        return Object.keys(equipped).filter(key => {
            return (
                equipped[key] &&
                equipped[key].equip_group_id === item.equip_group_id
            );
        });
    }

    // Vecchi salvataggi: consideriamo solo lo slot cliccato.
    return [slotKey];
}

// Rimuove un oggetto equipaggiato.
// Se occupa 2 slot, li libera entrambi e restituisce UNA sola copia.
function removeEquippedInstance(equipped, slotKey, backpack, weapons) {
    const item = equipped[slotKey];

    if (!item) return;

    const linkedSlots = getLinkedEquippedSlots(
        equipped,
        slotKey
    );

    returnEquippedItemToInventory(
        item,
        backpack,
        weapons
    );

    linkedSlots.forEach(key => {
        equipped[key] = null;
    });
}


function getLinkedGadgetSlots(equippedGadgets, slotKey) {
    const item = equippedGadgets?.[slotKey];
    if (!item) return [];

    if (item.equip_group_id) {
        return Object.keys(equippedGadgets).filter(key => {
            return equippedGadgets[key]?.equip_group_id === item.equip_group_id;
        });
    }

    return [slotKey];
}

function removeEquippedGadgetInstance(equippedGadgets, slotKey, backpack) {
    const item = equippedGadgets?.[slotKey];
    if (!item) return;

    const linkedSlots = getLinkedGadgetSlots(equippedGadgets, slotKey);
    returnEquippedItemToInventory(item, backpack, []);

    linkedSlots.forEach(key => {
        equippedGadgets[key] = null;
    });
}

function cleanupGadgetsWithoutArmor(stats, backpack) {
    if (!stats) return;

    const gadgets = stats.equipped_gadgets || {};
    const pseudoChar = { stats };
    const processed = new Set();

    Object.keys(gadgets).forEach(slot => {
        const item = gadgets[slot];
        if (!item) return;

        const groupKey = item.equip_group_id || `${slot}-${item.compendium_id || item.name}`;
        if (processed.has(groupKey)) return;
        processed.add(groupKey);

        const linkedSlots = getLinkedGadgetSlots(gadgets, slot);
        const hasAllArmor = linkedSlots.every(linkedSlot =>
            hasArmorForGadgetSlot(pseudoChar, linkedSlot)
        );

        if (!hasAllArmor) {
            removeEquippedGadgetInstance(gadgets, slot, backpack);
        }
    });

    stats.equipped_gadgets = gadgets;
}

function migrateLegacyGadgets(char) {
    if (!char?.stats?.equipped) return false;

    const equipped = char.stats.equipped;
    const gadgets = char.stats.equipped_gadgets || {};
    let changed = false;

    Object.keys(equipped).forEach(slot => {
        const item = equipped[slot];
        if (!item) return;

        const compItem = findCompendioItem(item);
        if (!isGadgetCompendiumItem(compItem)) return;

        gadgets[slot] = item;
        equipped[slot] = null;
        changed = true;
    });

    if (!changed) return false;

    char.stats.equipped_gadgets = gadgets;
    const backpack = char.backpack || [];
    cleanupGadgetsWithoutArmor(char.stats, backpack);

    socket.emit('update_character_sheet', {
        char_id: char.id,
        stats: char.stats,
        backpack: backpack,
        weapons: char.weapons || []
    });

    return true;
}

window.equipGadget = function(
    charId,
    itemName,
    itemDesc,
    slot,
    compendiumId = null
) {
    if (!slot) return;

    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const stats = char.stats || {};
    stats.equipped = stats.equipped || {};
    stats.equipped_gadgets = stats.equipped_gadgets || {};

    const gadgets = stats.equipped_gadgets;
    const backpack = char.backpack || [];
    const compItem = findCompendioItem({
        compendium_id: compendiumId,
        name: itemName
    });

    if (!isGadgetCompendiumItem(compItem)) {
        alert(`"${itemName}" non è classificato come gadget.`);
        return;
    }

    const slotInfo = compItem?.equipment?.slot || {};
    const allowedSlots = slotInfo.allowed_slots || [];

    if (!allowedSlots.includes(slot)) {
        alert(`"${itemName}" non può essere montato in questo punto.`);
        return;
    }

    let targetSlots = [slot];
    if (slotInfo.occupancy === 'all' && allowedSlots.length > 1) {
        targetSlots = [...allowedSlots];
    }

    const missing = targetSlots.filter(targetSlot =>
        !hasArmorForGadgetSlot(char, targetSlot)
    );

    if (missing.length > 0) {
        const required = [...new Set(
            missing.map(targetSlot =>
                equipmentSlotLabels[getRequiredArmorSlotForGadgetSlot(targetSlot)] || targetSlot
            )
        )];
        alert(`Prima devi equipaggiare l'armatura richiesta: ${required.join(' / ')}.`);
        return;
    }

    const backpackIndex = backpack.findIndex(b => {
        if (typeof b === 'string') return b === itemName;
        if (compendiumId && b.compendium_id) return b.compendium_id === compendiumId;
        return b.name === itemName;
    });

    if (backpackIndex === -1) {
        alert(`Gadget "${itemName}" non trovato.`);
        return;
    }

    const rawItem = backpack[backpackIndex];
    const sourceItem = typeof rawItem === 'string'
        ? { name: rawItem, desc: itemDesc, qty: 1 }
        : { ...rawItem };

    if (typeof rawItem !== 'string' && (rawItem.qty || 1) > 1) {
        rawItem.qty -= 1;
    } else {
        backpack.splice(backpackIndex, 1);
    }

    // Un solo gadget per punto armatura. Se c'è già, torna nello zaino.
    const removedGroups = new Set();
    targetSlots.forEach(targetSlot => {
        const oldItem = gadgets[targetSlot];
        if (!oldItem) return;

        const groupKey = oldItem.equip_group_id || `legacy-${targetSlot}`;
        if (removedGroups.has(groupKey)) return;
        removedGroups.add(groupKey);
        removeEquippedGadgetInstance(gadgets, targetSlot, backpack);
    });

    const equipGroupId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const equippedItem = {
        compendium_id: compendiumId || sourceItem.compendium_id || compItem?.id || null,
        name: itemName,
        desc: itemDesc || sourceItem.desc || getCompendioDescription(compItem),
        qty: 1,
        img: sourceItem.img || '',
        original_type: 'gadget',
        equip_group_id: equipGroupId,
        equipped_slots: [...targetSlots]
    };

    targetSlots.forEach(targetSlot => {
        gadgets[targetSlot] = { ...equippedItem };
    });

    stats.equipped_gadgets = gadgets;

    socket.emit('update_character_sheet', {
        char_id: charId,
        stats: stats,
        backpack: backpack,
        weapons: char.weapons || []
    });
};

window.unequipGadgetFromSlot = function(charId, slotKey) {
    const char = characters.find(c => c.id === charId);
    const gadgets = char?.stats?.equipped_gadgets;

    if (!char || !gadgets?.[slotKey]) return;

    const backpack = char.backpack || [];
    removeEquippedGadgetInstance(gadgets, slotKey, backpack);
    char.stats.equipped_gadgets = gadgets;

    socket.emit('update_character_sheet', {
        char_id: charId,
        stats: char.stats,
        backpack: backpack,
        weapons: char.weapons || []
    });
};

window.updateGadgetPanel = function(char) {
    const panel = document.getElementById('gadget-panel');
    if (!panel) return;

    const slotKeys = [
        'visore', 'elmo', 'schiena',
        'spalla_dx', 'petto', 'spalla_sx',
        'avambr_dx', 'cintura', 'avambr_sx',
        'guanto_dx', 'gambe', 'guanto_sx',
        'stivale_dx', 'stivale_sx'
    ];

    const gadgets = char?.stats?.equipped_gadgets || {};
    const gadgetEmoji = '🧩';

    slotKeys.forEach(slot => {
        const el = document.getElementById(`gadget-slot-${slot}`);
        if (!el) return;

        const itemData = gadgets[slot];
        const armorReady = char ? hasArmorForGadgetSlot(char, slot) : false;
        const nameEl = el.querySelector('.doll-name');
        const iconEl = el.querySelector('.doll-icon');
        if (!nameEl || !iconEl) return;

        el.classList.toggle('armor-missing', !armorReady);
        el.classList.toggle('filled', !!itemData);

        if (itemData) {
            nameEl.textContent = itemData.name || 'Gadget';
            nameEl.style.color = '#d7bde2';
            iconEl.style.backgroundImage = itemData.img ? `url('${itemData.img}')` : 'none';
            iconEl.style.backgroundSize = 'contain';
            iconEl.style.backgroundRepeat = 'no-repeat';
            iconEl.style.backgroundPosition = 'center';
            iconEl.innerHTML = itemData.img ? '' : `<span style="font-size:22px;">${gadgetEmoji}</span>`;

            const compItem = findCompendioItem(itemData);
            const brand = compItem?.brand ? `<b>Brand:</b> ${compItem.brand}<br>` : '';
            const rules = compItem ? getCompendioDescription(compItem) : (itemData.desc || 'Nessuna descrizione.');
            el.dataset.tooltipHtml = `${brand}<b>Montaggio:</b> ${equipmentSlotLabels[slot] || slot}<br><div style="margin-top:6px;">${rules}</div>`;
        } else {
            nameEl.textContent = armorReady ? 'Vuoto' : 'Serve armatura';
            nameEl.style.color = armorReady ? '#7f8c8d' : '#e74c3c';
            iconEl.style.backgroundImage = 'none';
            iconEl.innerHTML = `<span style="font-size:10px;font-weight:bold;color:${armorReady ? 'rgba(155,89,182,.55)' : 'rgba(231,76,60,.65)'};text-transform:uppercase;text-align:center;">${armorReady ? (equipmentSlotLabels[slot] || slot) : 'LOCK'}</span>`;
            el.dataset.tooltipHtml = '';
        }

        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);

        newEl.addEventListener('mouseenter', (e) => {
            if (!itemData) return;
            const tt = document.getElementById('equip-tooltip');
            if (!tt) return;
            const ttName = document.getElementById('tt-name');
            const ttDesc = document.getElementById('tt-desc');
            if (ttName) ttName.textContent = itemData.name || 'Gadget';
            if (ttDesc) ttDesc.innerHTML = newEl.dataset.tooltipHtml || itemData.desc || '';
            tt.style.display = 'block';
            tt.style.left = (e.pageX + 15) + 'px';
            tt.style.top = (e.pageY - 15) + 'px';
        });

        newEl.addEventListener('mousemove', (e) => {
            if (!itemData) return;
            const tt = document.getElementById('equip-tooltip');
            if (!tt) return;
            tt.style.left = (e.pageX + 15) + 'px';
            tt.style.top = (e.pageY - 15) + 'px';
        });

        newEl.addEventListener('mouseleave', () => {
            const tt = document.getElementById('equip-tooltip');
            if (tt) tt.style.display = 'none';
        });

        newEl.addEventListener('click', () => {
            if (!itemData || !char) return;
            if (confirm(`Vuoi sganciare "${itemData.name}" dall'armatura?`)) {
                const tt = document.getElementById('equip-tooltip');
                if (tt) tt.style.display = 'none';
                window.unequipGadgetFromSlot(char.id, slot);
            }
        });
    });
};

window.equipItem = function(
    charId,
    itemName,
    itemDesc,
    slot,
    itemType = 'backpack',
    compendiumId = null
) {
    if (!slot) return;

    const char = characters.find(c => c.id === charId);
    if (!char) return;

    // Lavoriamo su copie indipendenti: in questo modo la UI non resta in uno
    // stato intermedio e il payload inviato al server contiene sempre la nuova
    // struttura completa dell'equipaggiamento.
    let stats = JSON.parse(JSON.stringify(char.stats || {}));

    if (!stats.equipped || typeof stats.equipped !== 'object') {
        stats.equipped = {};
    }

    const equipped = stats.equipped;

    // ==========================================
    // RETROCOMPATIBILITÀ VECCHI SLOT
    // ==========================================

    if (
        equipped.guanti &&
        !equipped.guanto_dx
    ) {
        equipped.guanto_dx = equipped.guanti;
        equipped.guanti = null;
    }

    if (
        equipped.stivali &&
        !equipped.stivale_dx
    ) {
        equipped.stivale_dx = equipped.stivali;
        equipped.stivali = null;
    }

    let backpack = JSON.parse(JSON.stringify(char.backpack || []));
    let weapons = JSON.parse(JSON.stringify(char.weapons || []));

    // ==========================================
    // TROVA L'OGGETTO NEL NUOVO COMPENDIO
    // ==========================================

    const inventoryCandidate = [...weapons, ...backpack].find(entry => {
        if (!entry || typeof entry === 'string') return false;
        if (compendiumId && entry.compendium_id === compendiumId) return true;
        return entry.name === itemName;
    });

    const compItem =
        inventoryCandidate?.custom_definition ||
        findCompendioItem({
            compendium_id: compendiumId || null,
            name: itemName
        });

    const slotInfo =
        compItem?.equipment?.slot || null;

    const allowedSlots =
        slotInfo?.allowed_slots || [];

    const occupancy =
        slotInfo?.occupancy || 'one';

    // I gadget usano una doll separata e non possono più sostituire l'armatura.
    if (isGadgetCompendiumItem(compItem)) {
        window.equipGadget(
            charId,
            itemName,
            itemDesc,
            slot,
            compendiumId || compItem?.id || null
        );
        return;
    }

    // ==========================================
    // RIMUOVI MANUALMENTE
    // ==========================================

    if (slot === 'rimuovi') {

        const matchingSlots = Object.keys(equipped).filter(
            key =>
                equipped[key] &&
                equipped[key].name === itemName
        );

        const processedGroups = new Set();

        matchingSlots.forEach(slotKey => {
            const item = equipped[slotKey];

            const groupKey =
                item.equip_group_id ||
                `legacy-${slotKey}`;

            if (processedGroups.has(groupKey)) {
                return;
            }

            processedGroups.add(groupKey);

            removeEquippedInstance(
                equipped,
                slotKey,
                backpack,
                weapons
            );
        });

        cleanupGadgetsWithoutArmor(stats, backpack);

        socket.emit('update_character_sheet', {
            char_id: charId,
            stats: stats,
            backpack: backpack,
            weapons: weapons
        });

        return;
    }

    // ==========================================
    // DETERMINA GLI SLOT CHE DEVE OCCUPARE
    // ==========================================

    let targetSlots = [slot];

    if (
        compItem &&
        allowedSlots.length > 0
    ) {

        // Evita equipaggiamenti in slot sbagliati.
        if (!allowedSlots.includes(slot)) {
            alert(
                `"${itemName}" non può essere equipaggiato in questo slot.`
            );
            return;
        }

        // Esempio:
        // x2 Stivali -> entrambi
        // x2 Guanti  -> entrambi
        if (
            occupancy === 'all' &&
            allowedSlots.length > 1
        ) {
            targetSlots = [...allowedSlots];
        }
    }

    // ==========================================
    // RECUPERA E RIMUOVE L'OGGETTO DALL'INVENTARIO
    // ==========================================

    let sourceItem = null;

    if (itemType === 'weapon') {

        const weaponIndex = weapons.findIndex(w => {
            const name =
                typeof w === 'string'
                    ? w
                    : w.name;

            return name === itemName;
        });

        if (weaponIndex === -1) {
            alert(`Arma "${itemName}" non trovata.`);
            return;
        }

        const rawItem = weapons[weaponIndex];

        sourceItem =
            typeof rawItem === 'string'
                ? {
                    name: rawItem,
                    desc: itemDesc
                }
                : { ...rawItem };

        weapons.splice(
            weaponIndex,
            1
        );

    } else {

        const backpackIndex = backpack.findIndex(b => {
            if (typeof b === 'string') {
                return b === itemName;
            }

            if (
                compendiumId &&
                b.compendium_id
            ) {
                return b.compendium_id === compendiumId;
            }

            return b.name === itemName;
        });

        if (backpackIndex === -1) {
            alert(`Oggetto "${itemName}" non trovato nello zaino.`);
            return;
        }

        const rawItem = backpack[backpackIndex];

        sourceItem =
            typeof rawItem === 'string'
                ? {
                    name: rawItem,
                    desc: itemDesc,
                    qty: 1
                }
                : { ...rawItem };

        if (
            typeof rawItem !== 'string' &&
            (rawItem.qty || 1) > 1
        ) {

            rawItem.qty -= 1;

        } else {

            backpack.splice(
                backpackIndex,
                1
            );
        }
    }

    // ==========================================
    // SE GLI SLOT SONO OCCUPATI,
    // RIMETTE VIA GLI OGGETTI PRESENTI
    // ==========================================

    const alreadyRemovedGroups = new Set();

    targetSlots.forEach(targetSlot => {

        const oldItem =
            equipped[targetSlot];

        if (!oldItem) return;

        const groupKey =
            oldItem.equip_group_id ||
            `legacy-${targetSlot}`;

        if (alreadyRemovedGroups.has(groupKey)) {
            return;
        }

        alreadyRemovedGroups.add(groupKey);

        removeEquippedInstance(
            equipped,
            targetSlot,
            backpack,
            weapons
        );
    });

    // ==========================================
    // CREA ID UNICO PER L'ISTANZA EQUIPAGGIATA
    // ==========================================

    const equipGroupId =
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`;

    const effectiveCompendiumId =
        compendiumId ||
        sourceItem?.compendium_id ||
        compItem?.id ||
        null;

    // ==========================================
    // CREA L'OGGETTO EQUIPAGGIATO
    // ==========================================

    const equipmentMaxHp =
    compItem?.equipment?.hp ?? null;
    const equippedItem = {
        compendium_id: effectiveCompendiumId,

        name: itemName,

        brand:
            sourceItem?.brand || compItem?.brand || null,

        desc:
            itemDesc ||
            sourceItem?.desc ||
            (
                compItem
                    ? getCompendioDescription(compItem)
                    : "Nessuna descrizione"
            ),

        qty: 1,

        img:
            sourceItem?.img || "",

        original_type:
            itemType,

        equip_group_id:
            equipGroupId,

        equipped_slots:
            [...targetSlots],

        durability_max:
            sourceItem?.durability_max ??
            equipmentMaxHp,

        durability_current:
            sourceItem?.durability_current ??
            equipmentMaxHp,

        custom_definition:
            sourceItem?.custom_definition || null,

        forged:
            !!sourceItem?.forged,

        forged_from_sidequest:
            sourceItem?.forged_from_sidequest || null,
    };

    // ==========================================
    // OCCUPA TUTTI GLI SLOT NECESSARI
    // ==========================================

    targetSlots.forEach(targetSlot => {

        equipped[targetSlot] = {
            ...equippedItem
        };

    });

    // Se il nuovo assetto ha lasciato qualche gadget senza armatura,
    // lo rimettiamo automaticamente nello zaino.
    stats.equipped = equipped;
    cleanupGadgetsWithoutArmor(stats, backpack);

    // Aggiornamento ottimistico locale: la doll reagisce subito al cambio
    // della tendina, senza attendere il round-trip Socket.IO.
    char.stats = stats;
    char.backpack = backpack;
    char.weapons = weapons;

    if (typeof window.updateEquippedPanel === 'function') {
        window.updateEquippedPanel(char);
    }

    if (
        typeof populatePlayerSheetUI === 'function' &&
        sheetModal &&
        sheetModal.style.display === 'flex'
    ) {
        populatePlayerSheetUI(char);
    }

    // ==========================================
    // SALVATAGGIO
    // ==========================================

    socket.emit(
        'update_character_sheet',
        {
            char_id: charId,
            stats: stats,
            backpack: backpack,
            weapons: weapons
        }
    );
};

window.unequipFromSlot = function(
    charId,
    slotKey
) {
    const char =
        characters.find(
            c => c.id === charId
        );

    if (
        !char ||
        !char.stats?.equipped ||
        !char.stats.equipped[slotKey]
    ) {
        return;
    }

    const stats = JSON.parse(JSON.stringify(char.stats || {}));
    const equipped = stats.equipped || {};
    const backpack = JSON.parse(JSON.stringify(char.backpack || []));
    const weapons = JSON.parse(JSON.stringify(char.weapons || []));

    removeEquippedInstance(
        equipped,
        slotKey,
        backpack,
        weapons
    );

    stats.equipped = equipped;
    cleanupGadgetsWithoutArmor(stats, backpack);

    char.stats = stats;
    char.backpack = backpack;
    char.weapons = weapons;

    if (typeof window.updateEquippedPanel === 'function') {
        window.updateEquippedPanel(char);
    }

    if (
        typeof populatePlayerSheetUI === 'function' &&
        sheetModal &&
        sheetModal.style.display === 'flex'
    ) {
        populatePlayerSheetUI(char);
    }

    socket.emit(
        'update_character_sheet',
        {
            char_id: charId,
            stats: stats,
            backpack: backpack,
            weapons: weapons
        }
    );
};

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

    // Invia i dati precisi ad app.py per il calcolo matematico
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

// ==========================================
// LOGICA APPUNTI E TRASCINAMENTO
// ==========================================
const notesPanel = document.getElementById('notes-panel');
const notesHeader = document.getElementById('notes-header');
let isDraggingNotes = false, dragNotesX = 0, dragNotesY = 0;

if (notesHeader && notesPanel) {
    notesHeader.addEventListener('mousedown', (e) => {
        isDraggingNotes = true;
        dragNotesX = e.clientX - notesPanel.getBoundingClientRect().left;
        dragNotesY = e.clientY - notesPanel.getBoundingClientRect().top;
        notesHeader.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingNotes) return;
        notesPanel.style.left = (e.clientX - dragNotesX) + 'px';
        notesPanel.style.top = (e.clientY - dragNotesY) + 'px';
    });
    document.addEventListener('mouseup', () => { isDraggingNotes = false; notesHeader.style.cursor = 'grab'; });
}
// Apertura / Chiusura (Gestione sicura globale)
document.body.addEventListener('click', (e) => {
    // Intercetta il click sia sul bottone principale che sulla X del pannello
    if (e.target && (e.target.id === 'btn-toggle-notes' || e.target.id === 'notes-close-x')) {
        const panel = document.getElementById('notes-panel');
        const btn = document.getElementById('btn-toggle-notes');

        if (panel) {
            if (panel.style.display === 'none') {
                // APERTURA: Mostra il pannello e fai diventare rosso il bottone
                panel.style.display = 'block';
                if (btn) {
                    btn.innerHTML = '❌ Chiudi Appunti';
                    btn.style.background = '#e74c3c';
                }
            } else {
                // CHIUSURA: Nascondi il pannello e fai tornare normale il bottone
                panel.style.display = 'none';
                if (btn) {
                    btn.innerHTML = '📝 Appunti';
                    btn.style.background = '#f39c12';
                }
            }
        }
    }
});

// Salvataggio
document.getElementById('save-notes-btn')?.addEventListener('click', () => {
    const charId = isMaster ? selectedCharacterId : parseInt(document.getElementById('user-select')?.value);
    if (!charId) return;

    socket.emit('update_character_sheet', { char_id: charId, notes: document.getElementById('notes-textarea').value });

    const msg = document.getElementById('notes-saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

let pendingMasterCombatResult = null;

// Risultato tolto da un "Annulla" del Master: si chiude la revisione
socket.on('master_combat_result_cancelled', (data) => {
    if (pendingMasterCombatResult?.result_id !== data.result_id) return;
    pendingMasterCombatResult = null;
    document.getElementById('master-combat-review').style.display = 'none';
});

socket.on(
    'master_pending_combat_result',
    (data) => {

        if (!isMaster) return;

        pendingMasterCombatResult =
            data;

        const modal =
            document.getElementById(
                'master-combat-review'
            );

        const summary =
            document.getElementById(
                'master-review-summary'
            );

        summary.innerHTML = `

            <b>${escapeHtml(data.attacker_name)}</b>
            attacca
            <b>${escapeHtml(data.defender_name)}</b>

            <br>

            ⚔️ ${escapeHtml(data.weapon)}

            <br>

            🛡️ Reazione:
            <b>${escapeHtml(data.reaction_label || data.reaction_type)}</b>

            ${data.aim_label ? `<br>🎯 Mirato a: <b>${escapeHtml(data.aim_label)}</b>` : ''}

            ${
                describeAttackTerrain(data.attacker_id, data.defender_id)
                    .map(note => `<br>${note}`)
                    .join('')
            }

            ${
                data.distance !== null &&
                data.distance !== undefined

                ? `<br>📏 Distanza: ${data.distance} m`

                : ''
            }

            ${
                data.damage_formula

                ? `<br>💥 Formula: ${escapeHtml(data.damage_formula)}`

                : ''
            }
        `;

        document.getElementById(
            'master-review-att-roll'
        ).value =
            data.att_roll;

        document.getElementById(
            'master-review-def-roll'
        ).value =
            data.def_roll;

        // Danno totale: si divide con l'armatura (vedi splitReviewDamage)
        document.getElementById('master-review-total').value = data.damage ?? 0;

        // Nota libera: vuota, in chat vanno già esito e danno
        document.getElementById('master-review-message').value = '';

        // Armatura: si propone il pezzo dell'area mirata (o quello che ha parato)
        const armorSelect = document.getElementById('master-review-armor-slot');
        const pieces = data.armor_pieces || [];
        armorSelect.innerHTML = '';
        armorSelect.add(new Option('Nessuna armatura', ''));
        pieces.forEach(piece => armorSelect.add(new Option(`${piece.name} (${piece.hp}/${piece.max_hp})`, piece.slot)));
        armorSelect.value = data.armor_slot || '';
        document.getElementById('master-review-armor-row').style.display = pieces.length ? 'block' : 'none';

        document.getElementById('master-review-total').disabled = false;
        reviewDamageBeforeMiss = null;

        // Bonus/malus: quelli già decisi in passato partono applicati
        reviewModifiers = (data.modifiers || []).map(m => ({ ...m, saved: m.value, applied: m.value !== null }));
        savedCustomModifiers = data.custom_modifiers || [];
        const savedList = document.getElementById('review-modifier-saved');
        savedList.innerHTML = '';
        savedCustomModifiers.forEach(m => savedList.appendChild(new Option(m.label, m.label)));
        renderReviewModifiers();

        modal.style.display =
            'block';
    }
);

// Esito proposto dai tiri (stessa regola di default_combat_outcome in app.py)
function defaultCombatOutcome(reaction, attRoll, defRoll) {
    const defended = Number(defRoll) >= Number(attRoll);
    if (reaction === 'Schivata') return defended ? 'schivato' : 'colpito';
    if (reaction === 'Parata') return defended ? 'parato' : 'parzialmente_parato';
    // Colpo mirato o nella zona minacciata: niente reazione al colpo
    if (reaction === 'Nessuna') return defended ? 'mancato' : 'colpito';
    return 'colpito';
}

const NON_HIT_OUTCOMES = ['parato', 'schivato', 'mancato'];

// ==========================================
// BONUS / MALUS ALL'ATTACCO
// Ogni situazione (area mirata, copertura, altura...) ha un valore che il
// Master decide la prima volta; le volte dopo è già pronto e modificabile.
// ==========================================
let reviewModifiers = [];
let savedCustomModifiers = [];

function getModifiedAttackRoll() {
    const base = parseInt(document.getElementById('master-review-att-roll').value) || 0;
    return base + reviewModifiers
        .filter(m => m.applied && Number.isFinite(m.value))
        .reduce((sum, m) => sum + m.value, 0);
}

// Totale con i modificatori ed esito riproposto in base al tiro modificato
function updateReviewModifierTotal() {
    const base = parseInt(document.getElementById('master-review-att-roll').value) || 0;
    const total = getModifiedAttackRoll();
    const def = document.getElementById('master-review-def-roll').value;

    document.getElementById('review-modifier-total').textContent = total === base
        ? `🎲 Attacco ${base} · Difesa ${def}`
        : `🎲 Attacco ${base} → ${total} con modificatori · Difesa ${def}`;

    if (pendingMasterCombatResult) {
        document.getElementById('master-review-outcome').value =
            defaultCombatOutcome(pendingMasterCombatResult.reaction_type, total, def);
        syncReviewOutcome();
    }
}

function renderReviewModifiers() {
    const rows = document.getElementById('review-modifier-rows');
    rows.innerHTML = '';

    if (!reviewModifiers.length) {
        rows.innerHTML = '<div class="review-modifier-empty">Nessuna situazione particolare.</div>';
    }

    reviewModifiers.forEach(modifier => {
        const row = document.createElement('label');
        row.className = 'review-modifier-row';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = modifier.applied;
        check.title = 'Applica (togli la spunta per ignorarlo questa volta)';

        const name = document.createElement('span');
        name.className = 'review-modifier-name';
        name.textContent = modifier.label;

        const value = document.createElement('input');
        value.type = 'number';
        value.value = modifier.value ?? '';
        value.placeholder = '±';

        const tag = document.createElement('span');
        tag.className = 'review-modifier-tag';
        tag.textContent = modifier.saved === null || modifier.saved === undefined
            ? 'nuovo'
            : `salvato ${modifier.saved > 0 ? '+' : ''}${modifier.saved}`;
        tag.classList.toggle('new', modifier.saved === null || modifier.saved === undefined);

        check.addEventListener('change', () => {
            modifier.applied = check.checked && Number.isFinite(modifier.value);
            check.checked = modifier.applied;
            updateReviewModifierTotal();
        });

        // Scrivere un valore lo applica; svuotarlo lo toglie
        value.addEventListener('input', () => {
            const parsed = parseInt(value.value);
            modifier.value = Number.isFinite(parsed) ? parsed : null;
            modifier.applied = Number.isFinite(parsed);
            check.checked = modifier.applied;
            updateReviewModifierTotal();
        });

        row.append(check, name, value, tag);
        rows.appendChild(row);
    });

    updateReviewModifierTotal();
}

document.getElementById('review-modifier-add-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('review-modifier-name');
    const valueInput = document.getElementById('review-modifier-value');
    const label = nameInput.value.trim();
    if (!label) return;

    // Una situazione già usata in passato riprende il suo valore
    const known = savedCustomModifiers.find(m => m.label.toLowerCase() === label.toLowerCase());
    const typed = parseInt(valueInput.value);
    const value = Number.isFinite(typed) ? typed : (known ? known.value : null);
    const key = known ? known.key : `custom_${label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    if (reviewModifiers.some(m => m.key === key)) return;

    reviewModifiers.push({ key, label: known ? known.label : label, value, saved: known ? known.value : null, applied: value !== null });
    nameInput.value = '';
    valueInput.value = '';
    renderReviewModifiers();
});
let reviewDamageBeforeMiss = null;

// Parato / Schivato / Mancato: danno a 0 (e si ripristina se si torna a un colpo)
function syncReviewOutcome() {
    const outcome = document.getElementById('master-review-outcome').value;
    const totalInput = document.getElementById('master-review-total');
    const missed = NON_HIT_OUTCOMES.includes(outcome);

    if (missed && !totalInput.disabled) {
        reviewDamageBeforeMiss = totalInput.value;
        totalInput.value = 0;
    } else if (!missed && totalInput.disabled && reviewDamageBeforeMiss !== null) {
        totalInput.value = reviewDamageBeforeMiss;
    }

    totalInput.disabled = missed;
    document.getElementById('master-review-damage').disabled = missed;
    document.getElementById('master-review-armor-damage').disabled = missed;
    splitReviewDamage();
}

// Metà del danno all'armatura che copre il colpo (il punto dispari al personaggio),
// fino a quanta durabilità le resta; senza armatura tutto al personaggio
function splitReviewDamage() {
    const total = Math.max(0, parseInt(document.getElementById('master-review-total').value) || 0);
    const slot = document.getElementById('master-review-armor-slot').value;
    const piece = (pendingMasterCombatResult?.armor_pieces || []).find(p => p.slot === slot);
    const armorShare = piece ? Math.min(Math.floor(total / 2), Math.max(0, piece.hp)) : 0;

    document.getElementById('master-review-armor-damage').value = armorShare;
    document.getElementById('master-review-damage').value = total - armorShare;
}

document.getElementById('master-review-total')?.addEventListener('input', splitReviewDamage);
document.getElementById('master-review-armor-slot')?.addEventListener('change', splitReviewDamage);

document.getElementById('master-review-outcome')?.addEventListener('change', syncReviewOutcome);

// I tiri cambiati a mano ripropongono l'esito
['master-review-att-roll', 'master-review-def-roll'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        if (!pendingMasterCombatResult) return;
        updateReviewModifierTotal();
    });
});

document.getElementById(
    'master-review-publish'
)?.addEventListener(
    'click',
    () => {

        if (
            !pendingMasterCombatResult
        ) {
            return;
        }

        const attRoll =
            parseInt(
                document.getElementById(
                    'master-review-att-roll'
                ).value
            );

        const defRoll =
            parseInt(
                document.getElementById(
                    'master-review-def-roll'
                ).value
            );

        const damage =
            parseInt(
                document.getElementById(
                    'master-review-damage'
                ).value
            );

        const message =
            document.getElementById(
                'master-review-message'
            ).value.trim();

        if (
            !Number.isFinite(attRoll) ||
            !Number.isFinite(defRoll) ||
            !Number.isFinite(damage)
        ) {

            alert(
                "Controlla tiro attacco, tiro difesa e danno."
            );

            return;
        }

        socket.emit(
            'master_publish_combat_result',
            {

                result_id:
                    pendingMasterCombatResult.result_id,

                att_roll:
                    attRoll,

                def_roll:
                    defRoll,

                damage:
                    Math.max(
                        0,
                        damage
                    ),

                message:
                    message,

                outcome:
                    document.getElementById('master-review-outcome').value,

                // Bonus/malus applicati: il server li ricorda per la prossima volta
                modifiers:
                    reviewModifiers.map(({ key, label, value, applied }) => ({ key, label, value, applied })),

                armor_slot:
                    document.getElementById('master-review-armor-slot').value || null,

                armor_damage:
                    parseInt(document.getElementById('master-review-armor-damage').value) || 0
            }
        );

        document.getElementById(
            'master-combat-review'
        ).style.display =
            'none';

        pendingMasterCombatResult =
            null;
    }
);

document.getElementById(
    'master-review-cancel'
)?.addEventListener(
    'click',
    () => {

        if (
            !pendingMasterCombatResult
        ) {
            return;
        }

        socket.emit(
            'master_discard_combat_result',
            {
                result_id:
                    pendingMasterCombatResult.result_id
            }
        );

        document.getElementById(
            'master-combat-review'
        ).style.display =
            'none';

        pendingMasterCombatResult =
            null;
    }
);

// ==========================================
// CHIUSURA SICURA E UNIVERSALE DELLE SCHEDE
// ==========================================
document.body.addEventListener('click', (e) => {
    // 1. Chiude la Scheda Giocatore cliccando la X
    if (e.target && e.target.id === 'close-modal') {
        const modal = document.getElementById('sheet-modal');
        if (modal) modal.style.display = 'none';
    }

    // 2. Chiude la Scheda Master cliccando la X
    if (e.target && e.target.id === 'close-edit-modal') {
        const modal = document.getElementById('edit-sheet-modal');
        if (modal) modal.style.display = 'none';
    }

    // 3. Chiude qualsiasi finestra cliccando sullo sfondo scuro (overlay)
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

socket.on(
    'master_combat_error',
    (data) => {

        console.error(
            '[COMBAT MASTER]',
            data.message
        );

        alert(
            data.message
        );
    }
);

// ==========================================
// MASTER DOCK - REDESIGN COMPATTO
// ==========================================
(() => {
    const masterToolButtons = Array.from(
        document.querySelectorAll('.master-tool-btn[data-master-section]')
    );

    const masterToolSections = Array.from(
        document.querySelectorAll('#master-panel .master-tool-section')
    );

    const closeMasterToolsBtn = document.getElementById('btn-master-close-tools');
    const openSidequestToolBtn = document.getElementById('btn-master-open-sidequest');

    function closeMasterToolSections() {
        masterToolSections.forEach(section => {
            section.classList.remove('master-tool-section-active');
        });

        masterToolButtons.forEach(button => {
            button.classList.remove('master-tool-active');
        });
    }

    function openMasterToolSection(button, section) {
        const wasOpen = section.classList.contains('master-tool-section-active');
        closeMasterToolSections();

        if (wasOpen) return;

        section.classList.add('master-tool-section-active');
        button.classList.add('master-tool-active');

        // La dock sostituisce il primo livello di accordion:
        // quando si apre uno strumento, mostriamo subito il suo contenuto.
        const content = section.querySelector(':scope > .collapsible-content');
        const header = section.querySelector(':scope > .collapsible-header');

        if (content) content.style.display = 'block';

        if (header) {
            const icon = header.querySelector('span');
            if (icon) icon.innerText = '▼';
        }
    }

    masterToolButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (typeof isMaster !== 'undefined' && !isMaster) return;

            const sectionId = button.dataset.masterSection;
            const section = document.getElementById(sectionId);
            if (!section) return;

            openMasterToolSection(button, section);
        });
    });

    closeMasterToolsBtn?.addEventListener('click', () => {
        closeMasterToolSections();
    });

    openSidequestToolBtn?.addEventListener('click', () => {
        if (typeof isMaster !== 'undefined' && !isMaster) return;

        closeMasterToolSections();

        if (dicePanelContent) {
            dicePanelContent.style.display = 'flex';
        }

        if (diceToggleIcon) {
            diceToggleIcon.innerText = '▼';
        }

        if (dicePanelHeader) {
            dicePanelHeader.style.borderRadius = '6px 6px 0 0';
        }

        if (sidequestComposer) {
            sidequestComposer.style.display = 'block';
        }

        if (sidequestComposerBody) {
            sidequestComposerBody.style.display = 'block';
        }

        if (sidequestComposerToggleBtn) {
            sidequestComposerToggleBtn.setAttribute('aria-expanded', 'true');
        }

        if (sidequestComposerToggleIcon) {
            sidequestComposerToggleIcon.innerText = '▼';
        }

        sidequestTitle?.focus();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMasterToolSections();
        }
    });

    window.closeMasterToolSections = closeMasterToolSections;
})();

// Riduzione completa della dock Master: resta visibile solo la corona.
(() => {
    const panel = document.getElementById('master-panel');
    const toggle = document.getElementById('btn-master-dock-toggle');

    toggle?.addEventListener('click', () => {
        if (!panel) return;

        const collapsed = panel.classList.toggle('master-dock-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.title = collapsed
            ? 'Espandi strumenti Master'
            : 'Riduci strumenti Master';

        if (collapsed && typeof window.closeMasterToolSections === 'function') {
            window.closeMasterToolSections();
        }
    });
})();

// ==========================================
// DOCK GIOCATORE - STESSO STILE DELLA DOCK MASTER
// ==========================================
(() => {
    const panel = document.getElementById('player-panel');
    const toggle = document.getElementById('btn-player-dock-toggle');
    const buttons = Array.from(
        document.querySelectorAll('.player-tool-btn[data-player-action]')
    );

    const equipPanelEl = document.getElementById('equipped-panel');
    const gadgetPanelEl = document.getElementById('gadget-panel');

    if (!panel) return;

    function isPlayerSession() {
        const value = userSelect?.value;
        return !!value && value !== '0' && value !== 'master';
    }

    function isPanelVisible(el) {
        return !!el && !el.classList.contains('player-dock-hidden') && el.style.display !== 'none';
    }

    // Allinea lo stato "attivo" dei bottoni con i pannelli realmente aperti.
    function syncPlayerDock() {
        const states = {
            equip: isPanelVisible(equipPanelEl),
            gadget: isPanelVisible(gadgetPanelEl),
            notes: isPanelVisible(document.getElementById('notes-panel')),
            chat: dicePanelContent?.style.display !== 'none'
        };

        buttons.forEach(button => {
            const action = button.dataset.playerAction;
            button.classList.toggle('master-tool-active', !!states[action]);
        });
    }

    let wasPlayerMode = null;

    function updatePlayerMode() {
        const playerMode = isPlayerSession();
        document.body.classList.toggle('player-mode', playerMode);

        // Il Master gestisce le doll con la selezione: niente pannelli nascosti dalla dock.
        if (!playerMode) {
            equipPanelEl?.classList.remove('player-dock-hidden');
            gadgetPanelEl?.classList.remove('player-dock-hidden');
        } else if (wasPlayerMode !== true) {
            // Il giocatore parte con armi e gadget chiusi: si aprono dalla dock
            equipPanelEl?.classList.add('player-dock-hidden');
            gadgetPanelEl?.classList.add('player-dock-hidden');
        }

        wasPlayerMode = playerMode;
        syncPlayerDock();
    }

    const actions = {
        sheet: () => document.getElementById('sheet-btn')?.click(),
        equip: () => equipPanelEl?.classList.toggle('player-dock-hidden'),
        gadget: () => gadgetPanelEl?.classList.toggle('player-dock-hidden'),
        notes: () => document.getElementById('btn-toggle-notes')?.click(),
        chat: () => dicePanelHeader?.click(),
        center: () => document.getElementById('center-cam-btn')?.click(),
        rename: () => document.getElementById('rename-btn')?.click()
    };

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (!isPlayerSession()) return;

            actions[button.dataset.playerAction]?.();
            syncPlayerDock();
        });
    });

    toggle?.addEventListener('click', () => {
        const collapsed = panel.classList.toggle('player-dock-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.title = collapsed ? 'Espandi strumenti' : 'Riduci strumenti';
    });

    // Appunti e chat si possono chiudere anche dai loro pannelli.
    document.addEventListener('click', () => requestAnimationFrame(syncPlayerDock));

    userSelect?.addEventListener('change', updatePlayerMode);
    updatePlayerMode();
})();

// ==========================================
// RESOCONTO DELLA SESSIONE
// Esporta la chat (dadi, combattimento, messaggi) vista da questo browser
// dall'apertura della pagina: come file o come pagina segreta del wiki.
// ==========================================
(() => {
    const downloadBtn = document.getElementById('btn-chat-download');
    const wikiBtn = document.getElementById('btn-chat-to-wiki');

    // Una riga per messaggio: "Nome: testo"
    function getChatLogLines() {
        return Array.from(chatLog?.children || [])
            .map(entry => {
                const name = entry.querySelector('strong')?.textContent.trim() || '';
                const full = entry.textContent.replace(/\s+/g, ' ').trim();
                const text = name && full.startsWith(name) ? full.slice(name.length).trim() : full;
                return { name, text };
            })
            .filter(line => line.text && line.text !== 'Inizio sessione');
    }

    function getSessionLabel() {
        const now = new Date();
        return now.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    downloadBtn?.addEventListener('click', () => {
        const lines = getChatLogLines();
        if (!lines.length) {
            alert('La chat è ancora vuota.');
            return;
        }

        const body = lines.map(line => (line.name ? `${line.name}: ${line.text}` : line.text)).join('\n');
        const blob = new Blob([`Resoconto Venander - ${getSessionLabel()}\n\n${body}\n`], { type: 'text/plain;charset=utf-8' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `resoconto-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    });

    wikiBtn?.addEventListener('click', () => {
        if (!isMaster) return;

        const lines = getChatLogLines();
        if (!lines.length) {
            alert('La chat è ancora vuota.');
            return;
        }

        const title = `Resoconto ${getSessionLabel()}`;
        if (!confirm(`Salvare la chat come pagina segreta "${title}" nel wiki?`)) return;

        socket.emit('wiki_save_page', {
            title,
            category: 'Resoconti',
            hidden: true,
            content: lines.map(line => (line.name ? `- **${line.name}**: ${line.text}` : `- ${line.text}`)).join('\n')
        });

        statusBar.innerText = `📖 Resoconto salvato nel wiki (segreto): "${title}".`;
    });

    // Il pulsante del wiki è solo per il Master
    function syncChatExportButtons() {
        if (wikiBtn) wikiBtn.style.display = isMaster ? 'inline-block' : 'none';
    }

    userSelect?.addEventListener('change', () => setTimeout(syncChatExportButtons, 0));
    // Il ruolo può essere ripristinato dopo il caricamento: ricontrolla all'apertura della chat
    document.getElementById('dice-panel-header')?.addEventListener('click', syncChatExportButtons);
    syncChatExportButtons();
})();

// ==========================================
// COLONNA DESTRA: CHAT IN ALTO, PANNELLO DEL TURNO IN BASSO
// La chat aperta si accorcia per non coprire il pannello del turno
// (finché il pannello non viene trascinato altrove).
// ==========================================
(() => {
    const chatContent = document.getElementById('dice-panel-content');
    const chatPanel = document.getElementById('dice-panel');
    const actionPanel = document.getElementById('combat-action-panel');
    const actionHeader = document.getElementById('action-header');
    if (!chatContent || !chatPanel || !actionPanel) return;

    const DEFAULT_HEIGHT = 0.75;   // come prima: 75% dello schermo
    const MIN_HEIGHT = 160;
    const GAP = 12;

    function fitChatToActionPanel() {
        const panelVisible = actionPanel.style.display !== 'none' && actionPanel.offsetParent !== null;
        let height = window.innerHeight * DEFAULT_HEIGHT;

        if (panelVisible && actionPanel.dataset.dragged !== '1') {
            const chatTop = chatContent.getBoundingClientRect().top || chatPanel.getBoundingClientRect().bottom;
            const free = actionPanel.getBoundingClientRect().top - chatTop - GAP;
            height = Math.max(MIN_HEIGHT, Math.min(height, free));
        }

        chatContent.style.height = `${Math.round(height)}px`;
    }

    // Spostato a mano: da lì in poi la chat torna alla sua altezza normale
    actionHeader?.addEventListener('mousedown', () => {
        actionPanel.dataset.dragged = '1';
    });

    new ResizeObserver(fitChatToActionPanel).observe(actionPanel);
    new MutationObserver(fitChatToActionPanel).observe(actionPanel, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(fitChatToActionPanel).observe(chatContent, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', fitChatToActionPanel);
    fitChatToActionPanel();
})();

// ==========================================
// BANNER DEL RISULTATO
// Dopo la revisione del Master, tutti vedono per qualche secondo esito,
// HP persi e danno all'armatura, sotto la barra dei turni.
// ==========================================
(() => {
    const banner = document.getElementById('combat-banner');
    if (!banner) return;

    const BANNER_MS = 4000;
    let hideTimer = null;

    socket.on('combat_banner', (data) => {
        const parts = [
            `⚔️ <b>${escapeHtml(data.defender)}</b>`,
            `<span class="combat-banner-outcome">${escapeHtml(data.outcome.toUpperCase())}</span>`
        ];
        if (data.aim) parts.push(`🎯 ${escapeHtml(data.aim)}`);
        if (data.hit) parts.push(`<span class="combat-banner-hp">-${data.damage} HP</span>`);
        if (data.armor) {
            parts.push(`<span class="combat-banner-armor">🛡️ ${escapeHtml(data.armor.name)} -${data.armor.damage}</span>`);
        }

        banner.innerHTML = parts.join(' · ');
        banner.classList.toggle('miss', !data.hit);
        banner.classList.add('show');

        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => banner.classList.remove('show'), BANNER_MS);
    });
})();

// ==========================================
// MUNIZIONI E CARICATORI
// Stesse regole di app.py: proiettili dello zaino che citano il calibro
// o il nome dell'arma. Il server verifica e scala i frame in combattimento.
// ==========================================
const PROJECTILE_PATTERN = /\b(proiettil\w*|munizion\w*|fmj|pallettoni|cartucc\w*|bossol\w*)\b/i;

function getFirearmSpec(comp) {
    const ammo = comp?.weapon?.ammo;
    const capacity = parseInt(ammo?.capacity) || 0;
    return capacity > 0 ? { caliber: String(ammo.type || ''), capacity } : null;
}

function getCompatibleAmmo(char, comp, gunName) {
    const keys = [getFirearmSpec(comp)?.caliber, comp?.name, gunName]
        .filter(Boolean)
        .map(key => key.toLowerCase());

    const options = (char.backpack || [])
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
            if (!entry || typeof entry !== 'object' || (entry.qty ?? 1) <= 0) return false;
            // Scorta globale degli NPC: va bene per qualsiasi arma da fuoco
            if (entry.npc_ammo) return char.role === 'npc';
            const text = `${entry.name || ''} ${entry.desc || ''}`.toLowerCase();
            return PROJECTILE_PATTERN.test(text) && keys.some(key => text.includes(key));
        });
    // Come sul server: la scorta globale per prima
    return options.sort((a, b) => (b.entry.npc_ammo ? 1 : 0) - (a.entry.npc_ammo ? 1 : 0));
}

// Selezione del Master: scorta globale dell'NPC e stato dei caricatori
window.renderNpcAmmoEditor = function(char) {
    const box = document.getElementById('sel-npc-ammo');
    if (!box) return;
    const show = isMaster && char?.role === 'npc';
    box.style.display = show ? 'block' : 'none';
    if (!show) return;

    const input = document.getElementById('sel-npc-ammo-count');
    const pool = (char.backpack || []).find(e => e && e.npc_ammo);
    // Non si sovrascrive quello che il Master sta scrivendo
    if (!(document.activeElement === input && box.dataset.charId === String(char.id))) {
        input.value = pool ? (pool.qty ?? 0) : 0;
    }
    box.dataset.charId = char.id;

    const guns = document.getElementById('sel-npc-ammo-guns');
    guns.innerHTML = '';
    const seen = new Set();
    Object.keys(char.stats?.equipped || {}).forEach(slot => {
        const firearm = getEquippedFirearm(char, slot);
        const group = firearm?.item.equip_group_id || slot;
        if (!firearm || seen.has(group)) return;
        seen.add(group);
        const loaded = firearm.item.ammo_loaded?.count ?? 0;
        const line = document.createElement('div');
        line.textContent = `🔫 ${firearm.item.name}: ${loaded}/${firearm.spec.capacity}${loaded ? '' : ' · SCARICA'}`;
        line.classList.toggle('empty', !loaded);
        guns.appendChild(line);
    });
    if (!seen.size) guns.textContent = 'Nessuna arma da fuoco equipaggiata.';
};

document.getElementById('sel-npc-ammo-save')?.addEventListener('click', () => {
    const box = document.getElementById('sel-npc-ammo');
    const count = parseInt(document.getElementById('sel-npc-ammo-count').value);
    if (!Number.isFinite(count) || count < 0) {
        statusBar.innerText = '⛔ Munizioni non valide: scrivi un numero da 0 in su.';
        return;
    }
    socket.emit('set_npc_ammo', { char_id: Number(box.dataset.charId), count });
});

function getEquippedFirearm(char, slot) {
    const item = char?.stats?.equipped?.[slot];
    if (!item) return null;
    const comp = findCompendioItem({ compendium_id: item.compendium_id || null, name: item.name, custom_definition: item.custom_definition });
    const spec = getFirearmSpec(comp);
    return spec ? { item, comp, spec } : null;
}

// Dalla doll: se c'è un solo tipo di proiettile adatto si ricarica subito, altrimenti si sceglie
window.reloadWeapon = function(charId, slot) {
    const char = characters.find(c => c.id === charId);
    const firearm = getEquippedFirearm(char, slot);
    if (!firearm) return;

    const options = getCompatibleAmmo(char, firearm.comp, firearm.item.name);
    if (!options.length) {
        statusBar.innerText = `⛔ Nessun proiettile adatto a ${firearm.item.name} nello zaino (deve citare "${firearm.spec.caliber}" o "${firearm.item.name}").`;
        return;
    }

    let choice = options[0];
    if (options.length > 1) {
        const answer = prompt(
            `Con cosa carichi ${firearm.item.name}?\n` +
            options.map((o, i) => `${i + 1}) ${o.entry.name} ×${o.entry.qty ?? 1}`).join('\n'),
            '1'
        );
        if (answer === null) return;
        choice = options[(parseInt(answer) || 1) - 1] || options[0];
    }

    socket.emit('load_weapon', { char_id: charId, slot, ammo_index: choice.index });
};

// Pannello d'attacco: colpi nel caricatore e ricarica dell'arma scelta
function updateAttackAmmoRow() {
    const row = document.getElementById('attack-ammo-row');
    if (!row) return;

    const option = document.getElementById('attack-weapon')?.selectedOptions[0];
    const char = characters.find(c => c.id === getActingCombatantId());
    const firearm = option ? getEquippedFirearm(char, option.dataset.slot) : null;

    row.style.display = firearm ? 'block' : 'none';
    if (!firearm) return;

    const loaded = firearm.item.ammo_loaded?.count ?? 0;
    const status = document.getElementById('attack-ammo-status');
    status.textContent = `🔫 Caricatore: ${loaded}/${firearm.spec.capacity}` +
        (loaded ? ` · ${firearm.item.ammo_loaded.name}` : ' · SCARICA');
    status.classList.toggle('empty', !loaded);

    const select = document.getElementById('attack-ammo-select');
    const options = getCompatibleAmmo(char, firearm.comp, firearm.item.name);
    select.innerHTML = '';
    if (!options.length) select.add(new Option('Nessun proiettile adatto', ''));
    options.forEach(o => select.add(new Option(`${o.entry.name} ×${o.entry.qty ?? 1}`, o.index)));
    document.getElementById('attack-ammo-reload-btn').disabled = !options.length;

    row.dataset.charId = char.id;
    row.dataset.slot = option.dataset.slot;
}

document.getElementById('attack-ammo-reload-btn')?.addEventListener('click', () => {
    const row = document.getElementById('attack-ammo-row');
    const index = document.getElementById('attack-ammo-select').value;
    if (index === '') return;
    socket.emit('load_weapon', { char_id: Number(row.dataset.charId), slot: row.dataset.slot, ammo_index: Number(index) });
});

// ==========================================
// MIRA (ARMI A DISTANZA)
// Con un'arma a distanza si prende prima la mira: il bersaglio reagisce,
// poi si può sparare. Nella propria zona minacciata si spara subito.
// ==========================================
function isRangedCompendium(comp) {
    return !!getFirearmSpec(comp) || /distanza/i.test(String(comp?.type || ''));
}

function getSelectedRangedWeapon() {
    const option = document.getElementById('attack-weapon')?.selectedOptions[0];
    const shooter = characters.find(c => c.id === getActingCombatantId());
    const item = shooter?.stats?.equipped?.[option?.dataset.slot];
    if (!option || !item) return null;

    const comp = findCompendioItem({ compendium_id: item.compendium_id || null, name: item.name, custom_definition: item.custom_definition });
    return isRangedCompendium(comp) ? { shooter, slot: option.dataset.slot, item, comp } : null;
}

function updateAttackAimRow() {
    const row = document.getElementById('attack-aim-row');
    const attackBtn = document.getElementById('btn-execute-attack');
    if (!row || !attackBtn) return;

    const ranged = combatState.is_active ? getSelectedRangedWeapon() : null;
    const target = characters.find(c => c.id === parseInt(document.getElementById('attack-target')?.value));

    row.style.display = ranged ? 'block' : 'none';
    attackBtn.disabled = false;
    attackBtn.textContent = 'SFERRA ATTACCO';
    if (!ranged) return;

    const status = document.getElementById('attack-aim-status');
    const aimBtn = document.getElementById('btn-declare-aim');
    const dropBtn = document.getElementById('btn-drop-aim');
    const myAim = combatAims.find(a => a.shooter_id === ranged.shooter.id);
    const aimOnTarget = myAim && target && myAim.target_id === target.id ? myAim : null;
    const inMyZone = target && combatThreats.some(t =>
        t.char_id === ranged.shooter.id && (t.hexes || []).includes(`${target.x},${target.y}`)
    );

    dropBtn.style.display = myAim ? 'block' : 'none';
    aimBtn.style.display = 'block';
    aimBtn.disabled = !target;
    aimBtn.textContent = myAim && !aimOnTarget ? '🎯 MIRA QUESTO BERSAGLIO' : '🎯 MIRA';

    if (inMyZone) {
        status.textContent = '⚠️ Il bersaglio è nella tua zona minacciata: puoi sparare subito.';
        aimBtn.style.display = 'none';
        attackBtn.textContent = '🔫 SPARA';
    } else if (aimOnTarget?.ready) {
        status.textContent = `🎯 Mira su ${aimOnTarget.target_name} · ha reagito: ${aimOnTarget.reaction}`;
        aimBtn.style.display = 'none';
        attackBtn.textContent = '🔫 SPARA';
    } else if (aimOnTarget) {
        status.textContent = `⏳ In attesa della reazione di ${aimOnTarget.target_name}...`;
        aimBtn.style.display = 'none';
        attackBtn.disabled = true;
        attackBtn.textContent = '⏳ IN ATTESA DELLA REAZIONE';
    } else {
        status.textContent = myAim
            ? `🎯 Stai mirando ${myAim.target_name}: per sparare a questo bersaglio prendi la mira.`
            : '🎯 Arma a distanza: prima prendi la mira sul bersaglio.';
        attackBtn.disabled = true;
        attackBtn.textContent = '🔫 PRIMA PRENDI LA MIRA';
    }
}

document.getElementById('btn-declare-aim')?.addEventListener('click', () => {
    const ranged = getSelectedRangedWeapon();
    const targetId = parseInt(document.getElementById('attack-target')?.value);
    if (!ranged || !targetId) return;
    socket.emit('declare_aim', { char_id: ranged.shooter.id, target_id: targetId, slot: ranged.slot });
});

document.getElementById('btn-drop-aim')?.addEventListener('click', () => {
    const shooterId = getActingCombatantId();
    const myAim = combatAims.find(a => a.shooter_id === shooterId);
    if (myAim) socket.emit('drop_aim', { aim_id: myAim.id });
});

document.getElementById('attack-target')?.addEventListener('change', updateAttackAimRow);

// ==========================================
// BERSAGLIO DALLA MAPPA
// 🎯 (o T) e poi un clic sulla pedina: vale solo chi è nel menu dei bersagli,
// quindi restano le stesse regole (visibilità, a terra, minaccia scattata).
// ==========================================
window.targetPickMode = false;

function getPickableTargetIds() {
    const select = document.getElementById('attack-target');
    return new Set([...(select?.options || [])].map(o => parseInt(o.value)).filter(Number.isFinite));
}

function setTargetPickMode(enabled) {
    const panelOpen = document.getElementById('combat-action-panel')?.style.display !== 'none';
    window.targetPickMode = !!enabled && panelOpen && getPickableTargetIds().size > 0;
    document.getElementById('btn-pick-target')?.classList.toggle('active', window.targetPickMode);
    if (window.targetPickMode) {
        if (window.moveMode) setMoveMode(false);
        statusBar.innerText = '🎯 Clicca la pedina da attaccare (Esc per annullare).';
    } else if (enabled) {
        statusBar.innerText = '🎯 Nessun bersaglio disponibile.';
    }
    requestRender();
}

function pickTargetAt(col, row) {
    const select = document.getElementById('attack-target');
    const ids = getPickableTargetIds();
    const target = characters.find(c => c.x === col && c.y === row && ids.has(c.id));
    if (!target) {
        statusBar.innerText = '❌ Lì non c\'è un bersaglio valido: clicca una pedina evidenziata.';
        return;
    }
    select.value = String(target.id);
    select.dispatchEvent(new Event('change'));
    setTargetPickMode(false);
    statusBar.innerText = `🎯 Bersaglio: ${target.name}.`;
}

window.setTargetPickMode = setTargetPickMode;
window.pickTargetAt = pickTargetAt;
window.getPickableTargetIds = getPickableTargetIds;

document.getElementById('btn-pick-target')?.addEventListener('click', () => setTargetPickMode(!window.targetPickMode));

window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 't' || event.ctrlKey || event.altKey || event.metaKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (!combatState.is_active) return;
    setTargetPickMode(!window.targetPickMode);
});

// Popup del bersaglio: un'azione utile della tabella (con i suoi frame) o nessuna reazione
(() => {
    const modal = document.getElementById('aim-alert-modal');
    const select = document.getElementById('aim-alert-action');
    if (!modal || !select) return;

    const AIM_REACTION_CATEGORIES = ['Difesa', 'Movimento'];
    const aimLimbPicker = createLimbPicker('aim-alert-limbs');
    const queue = [];

    function currentAim() {
        return queue[0] || null;
    }

    function updateCost() {
        const aim = currentAim();
        const rule = findActionSpeedRule(select.value);
        const target = characters.find(c => c.id === aim?.target_id);
        document.getElementById('aim-alert-cost').textContent = rule ? `⚡ Vel ${rule.speed} · ${rule.frames} frame` : '';
        document.getElementById('aim-alert-limbs').style.display = rule ? 'block' : 'none';
        aimLimbPicker.update({
            cost: rule ? Number(rule.frames) : 0,
            available: combatState.players_limbs?.[target?.id],
            preferred: rule?.category === 'Movimento' ? LIMB_ORDER_LEGS : LIMB_ORDER_ARMS,
            suggest: true
        });
    }

    function showNext() {
        const aim = currentAim();
        if (!aim) {
            modal.classList.remove('open');
            return;
        }

        document.getElementById('aim-alert-text').innerHTML =
            `<b>${escapeHtml(aim.shooter_name)}</b> prende la mira su <b>${escapeHtml(aim.target_name)}</b> ` +
            `con <b>${escapeHtml(aim.weapon || '')}</b>. Come reagisci?`;

        select.innerHTML = '';
        select.add(new Option('Nessuna reazione', ''));
        getActionSpeedEntries()
            .filter(entry => AIM_REACTION_CATEGORIES.includes(entry.category) && !entry.special)
            .forEach(entry => select.add(new Option(`${entry.action} (${entry.frames} frame)`, entry.action)));

        updateCost();
        modal.classList.add('open');
    }

    select.addEventListener('change', updateCost);

    document.getElementById('aim-alert-confirm')?.addEventListener('click', () => {
        const aim = currentAim();
        if (!aim) return;

        const action = select.value || null;
        const shares = action ? aimLimbPicker.getShares() : {};
        if (action && !shares) {
            alert('Frame insufficienti negli arti scelti: aggiungi un altro arto.');
            return;
        }

        socket.emit('aim_response', { aim_id: aim.id, action, limb_shares: shares });
        queue.shift();
        showNext();
    });

    socket.on('aim_alert', (aim) => {
        if (queue.some(a => a.id === aim.id)) return;
        queue.push(aim);
        if (queue.length === 1) showNext();
    });

    // Mira abbassata o interrotta prima della risposta: il popup si chiude
    socket.on('aims_update', (aims) => {
        const pending = new Set((aims || []).filter(a => !a.ready).map(a => a.id));
        const before = queue.length;
        for (let i = queue.length - 1; i >= 0; i--) {
            if (!pending.has(queue[i].id)) queue.splice(i, 1);
        }
        if (queue.length !== before) showNext();
    });
})();


// Riparazione rapida dal pannello armatura (gratis fuori dal combattimento)
document.getElementById('btn-quick-armor-repair')?.addEventListener('click', () => {
    const charId = parseInt(document.getElementById('equipped-panel')?.dataset.charId);
    if (!charId) return;
    socket.emit('quick_armor_repair', { char_id: charId });
});
