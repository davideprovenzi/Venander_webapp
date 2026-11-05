// Armi a distanza: munizioni e caricatori, mira, bersaglio scelto dalla mappa.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// MUNIZIONI E CARICATORI
// Stesse regole di venander/ammo.py: proiettili dello zaino che citano il calibro
// o il nome dell'arma. Il server verifica e scala i frame in combattimento.
// ==========================================
const PROJECTILE_PATTERN = /\b(proiettil\w*|munizion\w*|fmj|pallettoni|cartucc\w*|bossol\w*)\b/i;

// Compendio: weapon.ammo = { type, capacity }. Fucina: weapon.ammo = "9mm" e weapon.ammo_qty = 20.
function getFirearmSpec(comp) {
    const weapon = comp?.weapon;
    const ammo = weapon?.ammo;
    let caliber = '';
    let capacity = 0;
    if (ammo && typeof ammo === 'object') {
        caliber = String(ammo.type || '');
        capacity = parseInt(ammo.capacity) || 0;
    } else if (typeof ammo === 'string' && ammo.trim() && !['none', 'null', '-'].includes(ammo.trim().toLowerCase())) {
        caliber = ammo.trim();
        capacity = parseInt(weapon?.ammo_qty) || 0;
    }
    return capacity > 0 ? { caliber, capacity } : null;
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
