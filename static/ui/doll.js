// Doll dell'equipaggiamento: disegno degli slot, durabilità, caricatori, tooltip.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

            // Anche le armi della Fucina (custom_definition) mostrano danno, velocità e caricatore
            const compItem = getEquippedCompendiumItem(itemData);

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
