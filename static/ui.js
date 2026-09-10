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
                // Per le armi c'è solo il tasto di rimozione, occupando tutta la larghezza
                controlsHtml = `
                    <div style="margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px;">
                        <button onclick="window.removeWeaponItem(${myChar.id}, ${index})" style="width: 100%; padding: 4px 8px; background: #7f8c8d; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">🗑️ Rimuovi Arma</button>
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
                    <div style="margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px;">
                        <button onclick="window.removeBonusItem(${myChar.id}, ${index})" style="width: 100%; padding: 4px 8px; background: #e67e22; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">🗑️ Rimuovi Effetto</button>
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
        
        // Disegna ogni oggetto
        bpList.forEach((item, index) => {
            // Retrocompatibilità se c'erano vecchie stringhe nel database
            if (typeof item === 'string') item = { name: item, desc: "Nessuna descrizione", qty: 1 };
            
            const li = document.createElement('li');
            li.style.background = '#fff';
            li.style.border = '1px solid #ccc';
            li.style.borderRadius = '5px';
            li.style.padding = '8px';
            
            let controlsHtml = '';
            if (canEdit) {
                controlsHtml = `
                    <div style="display: flex; gap: 5px; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px;">
                        <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, -1)" style="padding: 2px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">-</button>
                        <button onclick="window.updateBackpackItem(${myChar.id}, ${index}, 1)" style="padding: 2px 8px; background: #2ecc71; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight:bold;">+</button>
                        <button onclick="window.removeBackpackItem(${myChar.id}, ${index})" style="padding: 2px 8px; background: #7f8c8d; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: auto;">🗑️ Rimuovi</button>
                    </div>
                `;
            }

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong style="color: #2c3e50; font-size: 15px;">${item.name}</strong>
                    <span style="font-weight: bold; color: #8e44ad; background: #f4ecf7; padding: 2px 6px; border-radius: 4px; font-size: 12px;">x${item.qty}</span>
                </div>
                <div style="font-size: 12px; color: #7f8c8d; margin-top: 4px; font-style: italic; line-height: 1.3;">${item.desc}</div>
                ${controlsHtml}
            `;
            backpackContainer.appendChild(li);
        });
        
        if (bpList.length === 0) backpackContainer.innerHTML = `<li style="color:#7f8c8d; font-size:13px; padding: 5px; text-align: center;"><em>Lo zaino è vuoto.</em></li>`;

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

    const shopAvail = document.getElementById('ui-shop-available');
    const shopPurchased = document.getElementById('ui-shop-purchased');
    const statsSubtabsContainer = document.getElementById('stats-subtabs-container');
    
    if (!shopAvail || !shopPurchased) return;

    document.querySelectorAll('.shop-tab-btn').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName === currentShopTab) { btn.style.background = '#8e44ad'; btn.style.color = 'white'; } 
        else { btn.style.background = 'white'; btn.style.color = '#8e44ad'; }
        btn.onclick = () => { currentShopTab = tabName; populatePlayerSheetUI(myChar); };
    });

    const statCategories = ["Forza", "Destrezza", "Percezione", "Arguzia", "Volontà", "Spirito", "Virtù"];
    const allCategories = Object.keys(globalCompendio);
    const weaponCategories = allCategories.filter(cat => !statCategories.includes(cat) && Array.isArray(globalCompendio[cat]));

    if (statsSubtabsContainer) {
        statsSubtabsContainer.innerHTML = '';
        if (currentShopTab === 'Statistiche' || currentShopTab === 'Armi') {
            statsSubtabsContainer.style.display = 'flex';
            let currentList = currentShopTab === 'Statistiche' ? statCategories : weaponCategories;
            let currentActiveSubTab = currentShopTab === 'Statistiche' ? currentStatSubTab : currentWeaponSubTab;

            if (!currentActiveSubTab || !currentList.includes(currentActiveSubTab)) {
                currentActiveSubTab = currentList[0] || "";
                if (currentShopTab === 'Statistiche') currentStatSubTab = currentActiveSubTab;
                else currentWeaponSubTab = currentActiveSubTab;
            }

            currentList.forEach(subName => {
                const subBtn = document.createElement('button');
                subBtn.innerText = subName;
                subBtn.style.padding = '4px 8px'; subBtn.style.fontSize = '12px'; subBtn.style.cursor = 'pointer'; subBtn.style.fontWeight = 'bold'; subBtn.style.borderRadius = '3px'; subBtn.style.border = '1px solid #8e44ad';
                if (subName === currentActiveSubTab) { subBtn.style.background = '#8e44ad'; subBtn.style.color = 'white'; } 
                else { subBtn.style.background = 'white'; subBtn.style.color = '#8e44ad'; }
                subBtn.onclick = () => { if (currentShopTab === 'Statistiche') currentStatSubTab = subName; else currentWeaponSubTab = subName; populatePlayerSheetUI(myChar); };
                statsSubtabsContainer.appendChild(subBtn);
            });
        } else statsSubtabsContainer.style.display = 'none';
    }

    let shopItemsToShow = [];
    if (currentShopTab === 'Statistiche' && currentStatSubTab) { if (globalCompendio[currentStatSubTab]) shopItemsToShow = globalCompendio[currentStatSubTab]; } 
    else if (currentShopTab === 'Armi' && currentWeaponSubTab) { if (globalCompendio[currentWeaponSubTab]) shopItemsToShow = globalCompendio[currentWeaponSubTab]; } 
    else if (currentShopTab === 'Personalizzati') shopItemsToShow = myChar.shop || [];

    shopAvail.innerHTML = ''; shopPurchased.innerHTML = '';
    if (shopItemsToShow.length > 0) {
        let availCount = 0; let purchasedCount = 0;
        shopItemsToShow.forEach(item => {
            const hasSkill = myChar.skills && myChar.skills.includes(item.name);
            const li = document.createElement('li');
            li.style.padding = '12px'; li.style.border = '1px solid #ccc'; li.style.borderRadius = '8px'; li.style.display = 'flex'; li.style.flexDirection = 'column'; li.style.justifyContent = 'space-between'; li.style.width = 'calc(50% - 20px)'; li.style.boxSizing = 'border-box';
            const bonusText = item.bonus ? `<span style="font-size:11px; color:#27ae60; display:block; margin-top:5px;">Bonus: +${item.bonus.val} ${item.bonus.stat}</span>` : "";

            if (hasSkill) {
                li.style.background = '#f5f5f5'; li.style.borderColor = '#e0e0e0'; li.style.boxShadow = 'none';
                li.innerHTML = `<div style="opacity: 0.6;"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;"><strong style="font-size:15px; color:#7f8c8d; line-height:1.2;">${item.name}</strong></div><p style="font-size:13px; color:#95a5a6; margin:0 0 12px 0; line-height:1.4;">${item.desc || "Nessuna descrizione."}</p>${bonusText.replace('#27ae60', '#95a5a6')}</div><div style="background:#bdc3c7; color:white; padding:8px; border-radius:4px; text-align:center; font-weight:bold; font-size:13px;">Acquistata ✓</div>`;
                shopPurchased.appendChild(li); purchasedCount++;
            } else {
                li.style.background = '#fff'; li.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                li.innerHTML = `<div><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;"><strong style="font-size:15px; color:#2c3e50; line-height:1.2;">${item.name}</strong><span style="font-size:13px; font-weight:bold; color:#8e44ad; background:#f4ebf8; padding:3px 6px; border-radius:4px; white-space:nowrap; margin-left:10px;">${item.cost} XP</span></div><p style="font-size:13px; color:#555; margin:0 0 12px 0; line-height:1.4;">${item.desc || "Nessuna descrizione."}</p>${bonusText}</div>`;
                const btn = document.createElement('button');
                btn.style.padding = '8px'; btn.style.borderRadius = '4px'; btn.style.fontWeight = 'bold'; btn.style.width = '100%'; btn.style.border = 'none';
                if (isMaster) {
                    btn.innerText = 'Solo Visualizzazione'; btn.style.background = '#bdc3c7'; btn.style.color = '#fff'; btn.style.cursor = 'not-allowed'; btn.disabled = true;
                } else {
                    const hasRequirement = !item.requires || (myChar.skills && myChar.skills.includes(item.requires));
                    if (!hasRequirement) {
                        btn.innerText = `Richiede: ${item.requires}`; btn.style.background = '#bdc3c7'; btn.style.color = '#fff'; btn.style.cursor = 'not-allowed'; btn.disabled = true;
                    } else {
                        btn.innerText = 'Acquista Abilità'; btn.style.background = '#8e44ad'; btn.style.color = '#fff';
                        const canAfford = myChar.xp >= item.cost;
                        btn.style.cursor = canAfford ? 'pointer' : 'not-allowed'; btn.style.opacity = canAfford ? '1' : '0.5';
                        if (canAfford) {
                            btn.onclick = () => { if (confirm(`Vuoi davvero spendere ${item.cost} XP per acquistare "${item.name}"?`)) socket.emit('buy_skill', { char_id: myChar.id, skill_name: item.name, cost: item.cost, stat_bonus: item.bonus }); };
                        }
                    }
                }
                li.appendChild(btn); shopAvail.appendChild(li); availCount++;
            }
        });
        if (availCount === 0) shopAvail.innerHTML = `<li style="color:#7f8c8d; font-size:13px;"><em>Nessun elemento acquistabile in questa categoria.</em></li>`;
        if (purchasedCount === 0) shopPurchased.innerHTML = `<li style="color:#7f8c8d; font-size:13px;"><em>Nessun elemento acquistato in questa categoria.</em></li>`;
    } else shopAvail.innerHTML = `<li><em>Questa sottocategoria del negozio al momento è vuota.</em></li>`;
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
// MODIFICA SCHEDA MASTER (Apertura)
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
// SALVATAGGIO SCHEDA
// ==========================================
document.getElementById('save-sheet-btn')?.addEventListener('click', () => {
    if (!selectedCharacterId) return;
    
    const statsLines = document.getElementById('edit-stats').value.split('\n').filter(l => l.trim() !== '');
    const statsObj = {};
    statsLines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) statsObj[parts.shift().trim()] = parts.join(':').trim();
    });
    
    const parseList = (id) => document.getElementById(id).value.split('\n').map(s => s.trim()).filter(s => s !== '');
    
    // Recupera la foto e la lore dai campi appena inseriti
    const photoUrl = document.getElementById('edit-photo-url') ? document.getElementById('edit-photo-url').value.trim() : "";
    const loreText = document.getElementById('edit-lore') ? document.getElementById('edit-lore').value.trim() : "";

    // Invia tutto al server
    socket.emit('update_character_sheet', { 
        char_id: selectedCharacterId, 
        photo_url: photoUrl,
        lore: loreText,
        stats: statsObj, 
        weapons: parseList('edit-weapons'), 
        skills: parseList('edit-skills'), 
        backpack: parseList('edit-backpack'), 
        shop: [] 
    });
    
    editSheetModal.style.display = 'none';
});

document.getElementById('close-modal')?.addEventListener('click', () => { sheetModal.style.display = 'none'; });
document.getElementById('close-edit-modal')?.addEventListener('click', () => { editSheetModal.style.display = 'none'; });
window.addEventListener('click', (event) => {
    if (event.target === sheetModal) sheetModal.style.display = 'none';
    if (event.target === editSheetModal) editSheetModal.style.display = 'none';
});

// ==========================================
// CHAT E DADI
// ==========================================
const chatLog = document.getElementById('chat-log');
const chatStatus = document.getElementById('chat-status');
const dicePanelHeader = document.getElementById('dice-panel-header');
const dicePanelContent = document.getElementById('dice-panel-content');
const diceToggleIcon = document.getElementById('dice-toggle-icon');

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

function updateChatStatus() {
    if (!chatStatus) return;
    if (isMaster) { chatStatus.innerText = "Privato (Solo tu)"; chatStatus.style.color = "#e74c3c"; } 
    else { chatStatus.innerText = "Pubblico"; chatStatus.style.color = "#1abc9c"; }
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

// --- 3. INVIO LANCIO DADI (BOTTONI E TASTIERA) ---
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
// COMPENDIO SHOP (LOGICA)
// ==========================================
let globalCompendio = {};
let currentShopTab = 'Statistiche'; 
let currentStatSubTab = ''; 
let currentWeaponSubTab = ''; 

socket.on('compendio_data', (data) => {
    globalCompendio = data || {};
    const currentViewedId = parseInt(userSelect?.value);
    if (sheetModal && sheetModal.style.display === 'flex' && !isNaN(currentViewedId)) {
        const char = characters.find(c => c.id === currentViewedId);
        if (char) populatePlayerSheetUI(char);
    }
});

document.getElementById('compendio-category')?.addEventListener('change', (event) => {
    const cat = event.target.value;
    const listContainer = document.getElementById('compendio-list');
    listContainer.innerHTML = '';
    if (!cat || !globalCompendio[cat]) {
        listContainer.innerHTML = `<em style="color:#777; font-size:13px; text-align:center; padding:10px;">Seleziona una categoria valida.</em>`;
        return;
    }
    globalCompendio[cat].forEach(skill => {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.padding = '5px'; row.style.borderBottom = '1px solid #eee'; row.style.fontSize = '13px';
        const bonusLabel = skill.bonus ? ` [+${skill.bonus.val} ${skill.bonus.stat}]` : "";
        row.innerHTML = `<div><strong>${skill.name}</strong> (${skill.cost} XP) ${bonusLabel}<br><span style="color:#666; font-size:11px;">${skill.desc || ''}</span></div>`;
        const addBtn = document.createElement('button');
        addBtn.innerText = '+ Assegna'; addBtn.style.background = '#27ae60'; addBtn.style.color = 'white'; addBtn.style.border = 'none'; addBtn.style.padding = '4px 8px'; addBtn.style.borderRadius = '3px'; addBtn.style.cursor = 'pointer'; addBtn.style.fontWeight = 'bold';
        addBtn.onclick = () => {
            if (!selectedCharacterId) { alert("Seleziona prima un personaggio."); return; }
            socket.emit('add_skill_to_shop', { char_id: selectedCharacterId, skill: skill });
            addBtn.innerText = 'Aggiunta ✓'; addBtn.style.background = '#7f8c8d'; addBtn.disabled = true;
        };
        row.appendChild(addBtn);
        listContainer.appendChild(row);
    });
});

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

function openProfileEdit(char) {
    profileEditTargetId = char.id;
    profileEditBase64 = char.photo_url || ""; // Mantiene la foto vecchia se non se ne carica una nuova
    document.getElementById('profile-lore').value = char.lore || "";
    document.getElementById('profile-photo-file').value = ""; // Resetta l'input del file
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

// Salva Profilo
document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    if (!profileEditTargetId) return;
    
    socket.emit('update_character_sheet', {
        char_id: profileEditTargetId,
        photo_url: profileEditBase64,
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