// Equipaggiare e togliere armi, armature e gadget (anche su più slot).
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

// Equipaggia un oggetto della lista armi o dello zaino indicandone la posizione.
// Nome e descrizione non passano più dentro l'HTML: virgolette, a capo o
// barre nella descrizione (es. armi della Fucina) rompevano la tendina.
window.equipFromList = function(charId, listType, index, slot) {
    const char = characters.find(c => c.id === charId);
    const list = listType === 'weapon' ? char?.weapons : char?.backpack;
    let entry = list?.[index];
    if (!entry) return;
    if (typeof entry === 'string') entry = { name: entry, desc: 'Nessuna descrizione' };

    const desc = listType === 'weapon'
        ? (entry.desc || 'Nessuna descrizione')
        : getCompendioDescription(entry);
    window.equipItem(charId, entry.name, desc, slot, listType, entry.compendium_id || null);
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
