// Azioni di combattimento: compendio, tabella velocità, arti, reazioni, "altra azione", minacciare, movimento.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

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

// Ricaricare, mirare e sparare hanno i loro comandi (come DEDICATED_FIREARM_ACTIONS in venander/turns.py)
const DEDICATED_FIREARM_ACTIONS = ['Cambiare caricatore', 'Mirare con', 'Sparare con'];

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
        .filter(entry => !DEDICATED_FIREARM_ACTIONS.some(prefix => entry.action.startsWith(prefix)))
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

// Frame per passo: devono coincidere con MOVE_FRAME_COSTS in venander/movement.py
const MOVE_PACES = { Camminata: 20, Corsa: 15, Furtivo: 25 };

// Mezza barricata (copertura parziale): in combattimento un giocatore la scavalca
// con 5 PA della statistica scelta (come BARRICADE_PA_COST in venander/terrain.py)
const BARRICADE_PA_COST = 5;
window.barricadeStat = null;

// PA massimi di una caratteristica: valore x 10 (come PA_PER_STAT_POINT in venander/stats.py)
const PA_PER_STAT_POINT = 10;

// Con cosa si ricaricano i PA di ogni caratteristica (come PA_RESET_COSTS in venander/stats.py)
const PA_RESET_COSTS = {
    'Forza': { pool: 'stamina', cost: 5 },
    'Destrezza': { pool: 'stamina', cost: 5 },
    'Percezione': { pool: 'conc', cost: 5 },
    'Volontà': { pool: 'conc', cost: 5 },
    'Arguzia': { pool: 'conc', cost: 5 },
    'Spirito': { pool: 'conc', cost: 5 },
    'Virtù': { pool: 'hp', cost: 5 }
};
const PA_RESET_POOLS = {
    stamina: { short: 'STM', label: 'Stamina', color: '#f39c12' },
    conc: { short: 'CNC', label: 'Concentrazione', color: '#2980b9' },
    hp: { short: 'HP', label: 'Salute', color: '#c0392b' }
};

function getStatPaMax(char, stat) {
    const value = parseInt(char.stats?.[stat]);
    return Math.max(0, Number.isNaN(value) ? 1 : value) * PA_PER_STAT_POINT;
}

function getStatPa(char, stat) {
    if (char.pa_stats && char.pa_stats[stat] !== undefined) return Number(char.pa_stats[stat]);
    return getStatPaMax(char, stat);
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
