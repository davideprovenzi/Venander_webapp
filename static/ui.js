// ==========================================
// POPOLAMENTO SCHEDA GIOCATORE E SHOP
// ==========================================
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

            const li = document.createElement('li');
            li.style.background = '#fff';
            li.style.border = '1px solid #ccc';
            li.style.borderRadius = '5px';
            li.style.padding = '8px';

            let controlsHtml = '';
            if (canEdit) {
                controlsHtml = `
                    <div style="display: flex; gap: 5px; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px; align-items: center;">
                      <select onchange="window.equipItem(${myChar.id}, '${item.name.replace(/'/g, "\\'")}', '${item.desc.replace(/'/g, "\\'")}', this.value, 'weapon')" style="padding: 2px; border-radius: 3px; font-size: 11px; flex: 1; border: 1px solid #ccc;">
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

    // 2. GESTIONE TIPI ARMATURA (Visibile solo se si è nel tab Armature)
    armorTypeContainer.innerHTML = '';
    if (currentShopTab === 'Armature') {
        armorTypeContainer.style.display = 'flex';
        armorTypes.forEach(type => {
            const typeBtn = document.createElement('button');
            typeBtn.innerText = type;
            typeBtn.style.padding = '3px 8px'; typeBtn.style.fontSize = '11px'; typeBtn.style.cursor = 'pointer'; typeBtn.style.borderRadius = '4px'; typeBtn.style.border = '1px dashed #3498db';
            if (type === currentArmorType) { typeBtn.style.background = '#3498db'; typeBtn.style.color = 'white'; }
            else { typeBtn.style.background = 'white'; typeBtn.style.color = '#3498db'; }
            typeBtn.onclick = () => { currentArmorType = type; populatePlayerSheetUI(myChar); };
            armorTypeContainer.appendChild(typeBtn);
        });
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

    // Tipo armatura
    if (
        currentShopTab === 'Armature' &&
        currentArmorType !== 'Tutti'
    ) {
        const wanted = currentArmorType.toLowerCase();

        shopItemsToShow = shopItemsToShow.filter(item => {
            const raw =
                item?.equipment?.slot?.raw?.toLowerCase() || '';

            return raw.includes(wanted);
        });
    }

    // 5. Disegno degli Oggetti Acquistabili
    shopAvail.innerHTML = '';
    if (shopItemsToShow.length > 0) {
        let availCount = 0;
        shopItemsToShow.forEach(item => {
            const li = document.createElement('li');
            li.style.padding = '12px'; li.style.border = '1px solid #ccc'; li.style.borderRadius = '8px'; li.style.display = 'flex'; li.style.flexDirection = 'column'; li.style.justifyContent = 'space-between'; li.style.width = 'calc(50% - 20px)'; li.style.boxSizing = 'border-box';
            li.style.background = '#fff'; li.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

            // Controlla quanti ne possiede già nello zaino
            let ownedQty = 0;
            (myChar.backpack || []).forEach(b => {
                if (typeof b === 'string') {
                    if (b === item.name) ownedQty += 1;
                    return;
                }

                const sameItem = b.compendium_id
                    ? b.compendium_id === item.id
                    : b.name === item.name;

                if (sameItem) ownedQty += (b.qty || 1);
            });
            const ownedText = ownedQty > 0 ? `<span style="font-size:11px; color:#27ae60; display:block; margin-top:5px; font-weight:bold;">Nello Zaino: x${ownedQty}</span>` : "";

            const itemCost = getCompendioCost(item);
            const itemDesc = getCompendioDescription(item);
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

            li.innerHTML = `<div><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;"><div><strong style="font-size:15px; color:#2c3e50; line-height:1.2;">${item.name}</strong><br>${brandHtml}</div><span style="font-size:13px; font-weight:bold; color:#8e44ad; background:#f4ebf8; padding:3px 6px; border-radius:4px; white-space:nowrap; margin-left:10px;">${itemCost} €</span></div><p style="font-size:13px; color:#555; margin:0 0 8px 0; line-height:1.4;">${itemDesc}</p>${armorStatsHtml}${ownedText}</div>`;

            const btn = document.createElement('button');
            btn.style.padding = '8px'; btn.style.borderRadius = '4px'; btn.style.fontWeight = 'bold'; btn.style.width = '100%'; btn.style.border = 'none'; btn.style.marginTop = '10px';

            if (isMaster) {
                btn.innerText = 'Solo Visualizzazione'; btn.style.background = '#bdc3c7'; btn.style.color = '#fff'; btn.style.cursor = 'not-allowed'; btn.disabled = true;
            } else {
                btn.innerText = 'Acquista (Invia allo Zaino)'; btn.style.background = '#8e44ad'; btn.style.color = '#fff';
                const canAfford = myChar.xp >= itemCost;
                btn.style.cursor = canAfford ? 'pointer' : 'not-allowed'; btn.style.opacity = canAfford ? '1' : '0.5';

                if (canAfford) {
                    btn.onclick = () => {
                        if (confirm(`Vuoi spendere ${itemCost} € per acquistare "${item.name}"?`)) {
                            // 1. Deducce il costo (invia importo negativo all'aggiornamento soldi/XP)
                            socket.emit('update_xp', { char_id: myChar.id, amount: -itemCost });

                            // 2. Aggiunge l'oggetto direttamente nello zaino
                            const bp = myChar.backpack || [];
                            const existingIndex = bp.findIndex(
                                b =>
                                    b.compendium_id === item.id ||
                                    (!b.compendium_id && b.name === item.name)
                            );
                            if (existingIndex !== -1) {
                                bp[existingIndex].qty = (bp[existingIndex].qty || 1) + 1;
                            } else {
                                bp.push({ compendium_id: item.id, name: item.name, brand: item.brand || null, desc: itemDesc, qty: 1, img: item.img || "" });
                            }
                            socket.emit('update_character_sheet', { char_id: myChar.id, backpack: bp });
                        }
                    };
                }
            }
            li.appendChild(btn); shopAvail.appendChild(li); availCount++;
        });
        if (availCount === 0) shopAvail.innerHTML = `<li style="color:#7f8c8d; font-size:13px;"><em>Nessun elemento acquistabile.</em></li>`;
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
const sidequestTarget = document.getElementById('sidequest-target');
const sidequestTitle = document.getElementById('sidequest-title');
const sidequestDescription = document.getElementById('sidequest-description');
const sidequestCost = document.getElementById('sidequest-cost');
const sendSidequestBtn = document.getElementById('btn-send-sidequest');
const sidequestStore = new Map();

// --- 1. APERTURA E CHIUSURA TENDINA ---
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
    div.innerHTML = `<strong style="display:block; font-size:13px; margin-bottom:2px;">${data.name}</strong>${data.message}`;
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
    cost.textContent = `${Number(quest.cost || 0)} €`;
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

    const paidBy = Array.isArray(quest.paid_by) ? quest.paid_by.map(Number) : [];

    if (isMaster) {
        const paymentInfo = document.createElement('div');
        paymentInfo.style.cssText = 'font-size:11px;color:#566573;margin-top:5px;';
        paymentInfo.textContent = paidBy.length
            ? `✅ Pagato da: ${paidBy.map(sidequestPlayerName).join(', ')}`
            : '⏳ Nessun pagamento ancora.';
        card.appendChild(paymentInfo);

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

        if (alreadyPaid) {
            const paid = document.createElement('div');
            paid.style.cssText = 'margin-top:7px;padding:6px;text-align:center;background:#d5f5e3;color:#196f3d;border-radius:4px;font-weight:bold;font-size:12px;';
            paid.textContent = '✅ PAGATO';
            card.appendChild(paid);
        } else {
            const payBtn = document.createElement('button');
            payBtn.type = 'button';
            payBtn.style.cssText = 'margin-top:7px;width:100%;padding:7px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;';

            const balance = Number(myChar?.xp ?? 0);
            const questCost = Number(quest.cost || 0);
            const enoughFunds = balance >= questCost;

            payBtn.textContent = enoughFunds
                ? `💰 Paga ${questCost} €`
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
    }
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

    socket.emit('create_sidequest', {
        title,
        description,
        cost,
        target_char_id: targetValue === 'all' ? null : parseInt(targetValue)
    });

    if (sidequestTitle) sidequestTitle.value = '';
    if (sidequestDescription) sidequestDescription.value = '';
    if (sidequestCost) sidequestCost.value = '0';
});

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

const armorTypes = [
    'Tutti',
    'Elmo',
    'Spalla',
    'Pettorali',
    'Schiena',
    'Avambraccio',
    'Guanti',
    'Cintura',
    'Gambe',
    'Stivali'
];

function getCompendioItems() {
    return Array.isArray(globalCompendio?.items)
        ? globalCompendio.items
        : [];
}

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
    return Number(item?.equipment?.cost_eur || 0);
}

function findCompendioItem(inventoryItem) {
    if (!inventoryItem) return null;

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
document.getElementById('compendio-category')?.addEventListener(
    'change',
    (event) => {

        const category = event.target.value;

        const listContainer =
            document.getElementById('compendio-list');

        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!category) {
            listContainer.innerHTML = `
                <em style="
                    color:#777;
                    font-size:13px;
                    text-align:center;
                    padding:10px;
                ">
                    Seleziona una categoria valida.
                </em>
            `;
            return;
        }

        // ==========================================
        // FILTRA DAL NUOVO COMPENDIO
        // ==========================================

        const items = getCompendioItems()
            .filter(item => item.class === category);

        if (items.length === 0) {
            listContainer.innerHTML = `
                <em style="color:#777;">
                    Nessun oggetto in questa categoria.
                </em>
            `;
            return;
        }

        // ==========================================
        // CREA LE RIGHE
        // ==========================================

        items.forEach(item => {

            const row =
                document.createElement('div');

            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '7px';
            row.style.borderBottom =
                '1px solid #eee';
            row.style.fontSize = '13px';
            row.style.gap = '10px';

            const cost =
                getCompendioCost(item);

            const description =
                getCompendioDescription(item);

            row.innerHTML = `
                <div style="flex:1;">
                    <strong>
                        ${item.name}
                    </strong>

                    ${item.brand ? `<span style="color:#8e44ad; font-size:10px; font-weight:bold; margin-left:5px;">${item.brand}</span>` : ''}

                    <span style="
                        color:#8e44ad;
                        font-weight:bold;
                    ">
                        (${cost} €)
                    </span>

                    <br>

                    <span style="
                        color:#666;
                        font-size:11px;
                    ">
                        ${description}
                    </span>
                </div>
            `;

            // ==========================================
            // BOTTONE MASTER
            // ==========================================

            const addBtn =
                document.createElement('button');

            addBtn.innerText =
                '+ Metti in Zaino';

            addBtn.style.background =
                '#27ae60';

            addBtn.style.color =
                'white';

            addBtn.style.border =
                'none';

            addBtn.style.padding =
                '4px 8px';

            addBtn.style.borderRadius =
                '3px';

            addBtn.style.cursor =
                'pointer';

            addBtn.style.fontWeight =
                'bold';

            addBtn.onclick = () => {

                if (!selectedCharacterId) {
                    alert(
                        "Seleziona prima un personaggio sulla mappa."
                    );
                    return;
                }

                const char = characters.find(
                    c => c.id === selectedCharacterId
                );

                if (!char) return;

                const backpack =
                    char.backpack || [];

                const existingIndex =
                    backpack.findIndex(b => {

                        if (typeof b === 'string') {
                            return b === item.name;
                        }

                        return (
                            b.compendium_id === item.id ||
                            (
                                !b.compendium_id &&
                                b.name === item.name
                            )
                        );
                    });

                if (existingIndex !== -1) {

                    if (
                        typeof backpack[existingIndex]
                        === 'string'
                    ) {

                        backpack[existingIndex] = {
                            compendium_id: item.id,
                            name: item.name,
                            brand: item.brand || null,
                            desc: description,
                            qty: 2
                        };

                    } else {

                        backpack[existingIndex].qty =
                            (
                                backpack[existingIndex].qty ||
                                1
                            ) + 1;
                    }

                } else {

                    backpack.push({
                        compendium_id: item.id,
                        name: item.name,
                        brand: item.brand || null,
                        desc: description,
                        qty: 1
                    });
                }

                socket.emit(
                    'update_character_sheet',
                    {
                        char_id:
                            selectedCharacterId,

                        backpack:
                            backpack
                    }
                );

                addBtn.innerText =
                    'Aggiunto ✓';

                addBtn.style.background =
                    '#7f8c8d';

                addBtn.disabled = true;
            };

            row.appendChild(addBtn);
            listContainer.appendChild(row);
        });
    }
);

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

    if (file.size > 2 * 1024 * 1024) {
        alert("La pedina è troppo grande. Massimo 2 MB.");
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
let dragOffsetX = 0;
let dragOffsetY = 0;

if (trackerHeader) {
    trackerHeader.addEventListener('mousedown', (e) => {
        isDraggingTracker = true;
        dragOffsetX = e.clientX - tracker.getBoundingClientRect().left;
        dragOffsetY = e.clientY - tracker.getBoundingClientRect().top;
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
            item.durability_max ?? null
    };

    const originalType = item.original_type || 'backpack';

    if (originalType === 'weapon') {

        // Le armi sono elementi singoli, quindi ne reinseriamo una.
        weapons.push({
            compendium_id: cleanItem.compendium_id,
            name: cleanItem.name,
            desc: cleanItem.desc,
            img: cleanItem.img
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

    const compItem = findCompendioItem({
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

function updateAttackWeaponInfo() {

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

            activeCharId =
                currentActor.id !== undefined
                    ? currentActor.id
                    : currentActor.char_id;

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

        characters.forEach(char => {

            if (
                char.id !== activeCharId &&
                char.hp_current > 0 &&
                !char.is_hidden
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
    // ARTO AUTOMATICO
    // ==========================================

    const selectedOption =
        weaponSelect.selectedOptions[0];

    if (selectedOption) {

        const autoLimb =
            selectedOption.dataset.limb;

        // Solo se il gadget è chiaramente
        // associato a un singolo arto.
        if (autoLimb) {

            const limbSelect =
                document.getElementById(
                    'attack-limb'
                );

            if (limbSelect) {

                limbSelect.value =
                    autoLimb;
            }
        }
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
document.getElementById('attack-weapon')?.addEventListener('change',(e) => {

        const option =
            e.target.selectedOptions[0];

        if (!option) return;

        const limb =
            option.dataset.limb;

        // Solo gli oggetti legati chiaramente
        // a un arto lo selezionano automaticamente.
        //
        // Cintura, petto, schiena ecc.
        // lasciano scegliere manualmente.
        if (limb) {

            document.getElementById(
                'attack-limb'
            ).value = limb;
        }

        updateAttackWeaponInfo();
    }
);

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
    const currentActor = combatState.turn_order[combatState.current_index];
    const attackerId = currentActor.id !== undefined ? currentActor.id : currentActor.char_id;

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

    // Se confermato, scala i frame ed emette l'attacco
    myLimbs[limb] -= cost;
    socket.emit('sync_limbs', { char_id: attackerId, limbs: myLimbs });

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

        <b>${data.attacker_name}</b>
        sta attaccando
        <b>${targetChar.name}</b>

        con

        <b>${data.weapon}</b>

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

    document.getElementById(
        'defense-modal'
    ).style.display = 'block';
});

document.getElementById('reaction-speed')?.addEventListener('input', (e) => {
    let speed = parseInt(e.target.value) || 0;
    let cost = 110 - speed;
    document.getElementById('reaction-cost').innerText = cost < 0 ? 0 : cost;
});

document.getElementById('btn-execute-reaction')?.addEventListener('click', () => {
    if (!pendingIncomingAttack) return;

    const reactionType = document.getElementById('reaction-type').value;
    const limb = document.getElementById('reaction-limb').value;
    const speed = parseInt(document.getElementById('reaction-speed').value) || 100;
    const cost = 110 - speed;

    // L'ID del difensore reale (Giocatore o NPC)
    const defenderId = pendingIncomingAttack.defender_id;

    let myLimbs = window.playersLimbs[defenderId] || {bd: 60, bs: 60, gd: 60, gs: 60};
    if (myLimbs[limb] < cost) {
        alert(`Frame insufficienti per reagire a questa velocità! Ne servono ${cost}, ne hai ${myLimbs[limb]}`);
        return;
    }

    // Scala i frame e chiudi la finestra
    myLimbs[limb] -= cost;
    socket.emit('sync_limbs', { char_id: defenderId, limbs: myLimbs });

    // Invia i dati precisi ad app.py per il calcolo matematico
    socket.emit('resolve_reaction', {
        attack_id: pendingIncomingAttack.attack_id,
        reaction_type: reactionType,
        def_limb: limb,
        def_speed: speed
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

            <b>${data.attacker_name}</b>
            attacca
            <b>${data.defender_name}</b>

            <br>

            ⚔️ ${data.weapon}

            <br>

            🛡️ Reazione:
            <b>${data.reaction_type}</b>

            ${
                data.distance !== null &&
                data.distance !== undefined

                ? `<br>📏 Distanza: ${data.distance} m`

                : ''
            }

            ${
                data.damage_formula

                ? `<br>💥 Formula: ${data.damage_formula}`

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

        document.getElementById(
            'master-review-damage'
        ).value =
            data.damage ?? 0;

        document.getElementById(
            'master-review-message'
        ).value =
            buildMasterCombatMessage(
                data
            );

        modal.style.display =
            'block';
    }
);

function buildMasterCombatMessage(
    data
) {

    return (
        `⚔️ ${data.attacker_name} attacca ` +
        `${data.defender_name} con ${data.weapon}.\n\n` +

        `Attacco: ${data.att_roll}\n` +
        `Difesa (${data.reaction_type}): ${data.def_roll}\n` +
        `Danno: ${data.damage ?? 0}`
    );
}

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
                    message
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
