// Finestra del compendio (negozio) e listino prezzi del Master.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

// Nome per i confronti: maiuscole e "Licenza" davanti non contano
// ("lame corte" della Fucina = "Licenza Lame Corte" dello zaino).
// Deve coincidere con comparable_item_name in venander/compendium.py.
function comparableItemName(name) {
    const text = String(name ?? '').trim().split(/\s+/).join(' ').toLowerCase();
    return text.startsWith('licenza ') ? text.slice('licenza '.length) : text;
}

function characterOwnsCompendiumItem(char, itemId, itemName = null) {
    if (!char) return false;
    const wantedName = itemName ? comparableItemName(itemName) : '';

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
                return wantedName ? comparableItemName(entry) === wantedName : false;
            }

            if (itemId && entry?.compendium_id === itemId) {
                return true;
            }

            return !!wantedName && comparableItemName(entry?.name) === wantedName;
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

    // Suggerimenti per la licenza delle armi della Fucina: i nomi veri del compendio
    const licenseOptions = document.getElementById('forge-license-options');
    if (licenseOptions) {
        licenseOptions.innerHTML = '';
        getCompendioItems()
            .filter(item => item.class === 'Licenza')
            .forEach(item => {
                const option = document.createElement('option');
                option.value = item.name;
                licenseOptions.appendChild(option);
            });
    }

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
