// ==========================================
// TRINKET UMBRYLL
// Chi possiede un gadget "Trinket ..." e delle clip "Trinket marca Umbryll"
// può piazzarle (trappola nascosta, la vedono solo lui e il Master) o
// lanciarle (visibili a tutti). Le bombe si fanno esplodere a distanza:
// chi è nell'area ha un istante per reagire, poi il Master applica i danni.
// ==========================================
const TRINKET_CLIP_ID = 'UMB-018';
const TRINKET_THROW_RANGE = 10;
const TRINKET_DEVICES = {
    'UMB-006': { kind: 'bomba', icon: '💣' },
    'UMB-003': { kind: 'filo', icon: '🕸️' },
    'UMB-009': { kind: 'spia', icon: '📷' },
    'UMB-017': { kind: 'campo', icon: '☮️' }
};
const TRINKET_ICONS = Object.fromEntries(Object.values(TRINKET_DEVICES).map(d => [d.kind, d.icon]));
const TRINKET_PLANT_FRAMES = 80;      // velocità 30
const BOMB_DETONATION_FRAMES = 80;    // velocità 30
const BOMB_PAV_PER_BOMB = 5;

window.mapTrinkets = [];
window.trinketPlacement = null;       // { char_id, device_id, mode: 'piazza' | 'lancia' }
let explosionMarks = [];              // lampi sulla mappa quando le bombe esplodono
let lastTrinketSheetChar = null;
window.explosionEscape = null;        // { explosion_id, target_id, target_name, hexes: [[x, y]] }

function trinketClipCount(char) {
    return (char?.backpack || [])
        .filter(e => e && (e.compendium_id === TRINKET_CLIP_ID || /trinket marca umbryll/i.test(e.name || '')))
        .reduce((sum, e) => sum + (parseInt(e.qty ?? 1) || 0), 0);
}

function ownedTrinketDevices(char) {
    const stats = char?.stats || {};
    const owned = [
        ...(char?.backpack || []),
        ...Object.values(stats.equipped || {}),
        ...Object.values(stats.equipped_gadgets || {})
    ].filter(e => e && TRINKET_DEVICES[e.compendium_id]);
    const seen = new Set();
    return owned.filter(e => !seen.has(e.compendium_id) && seen.add(e.compendium_id))
        .map(e => {
            const item = getCompendiumItemById(e.compendium_id) || {};
            return { id: e.compendium_id, name: item.name || e.name, capacity: item.resource?.capacity || 0, ...TRINKET_DEVICES[e.compendium_id] };
        });
}

function inCombatTurnOrder(char) {
    return combatState.is_active && (combatState.turn_order || []).some(e => Number(e.id) === char.id);
}

function canControlTrinkets(char) {
    return !!char && (isMaster || parseInt(userSelect?.value) === char.id);
}

// ------------------------------------------
// Pannello (scheda e combattimento): un blocco per ogni gadget-trinket
// ------------------------------------------
function buildTrinketBlock(char) {
    const devices = ownedTrinketDevices(char);
    if (!devices.length) return null;

    const block = document.createElement('div');
    block.className = 'trinket-block';
    const clips = trinketClipCount(char);
    const fighting = inCombatTurnOrder(char);
    const throwRule = findActionSpeedRule('Lanciare un piccolo oggetto');

    const head = document.createElement('div');
    head.className = 'trinket-block-head';
    head.innerHTML = `<span>🧩 Trinket</span><span>${clips} clip nello zaino</span>`;
    block.appendChild(head);

    devices.forEach(device => {
        const mine = window.mapTrinkets.filter(t => t.owner_id === char.id && t.device_id === device.id);
        const row = document.createElement('div');
        row.className = 'trinket-device';

        const title = document.createElement('div');
        title.className = 'trinket-device-title';
        title.textContent = `${device.icon} ${device.name} · ${mine.length}/${device.capacity || '∞'} sulla mappa`;
        row.appendChild(title);

        if (canControlTrinkets(char)) {
            const actions = document.createElement('div');
            actions.className = 'trinket-actions';
            const full = device.capacity && mine.length >= device.capacity;

            [['piazza', '📍 Piazza', `Sul tuo esagono o adiacente, nascosto${fighting ? ` · ${TRINKET_PLANT_FRAMES} frame` : ''}`],
             ['lancia', '🎯 Lancia', `Entro ${TRINKET_THROW_RANGE} m in linea di vista, visibile a tutti${fighting ? ` · ${throwRule?.frames ?? 50} frame` : ''}`]]
                .forEach(([mode, label, hint]) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = label;
                    btn.title = hint;
                    btn.disabled = !clips || full;
                    btn.classList.toggle('active', window.trinketPlacement?.char_id === char.id &&
                        window.trinketPlacement?.device_id === device.id && window.trinketPlacement?.mode === mode);
                    btn.addEventListener('click', () => startTrinketPlacement(char, device, mode));
                    actions.appendChild(btn);
                });
            row.appendChild(actions);

            if (device.kind === 'bomba' && mine.length) {
                const list = document.createElement('div');
                list.className = 'trinket-bomb-list';
                mine.forEach((bomb, index) => {
                    const label = document.createElement('label');
                    const box = document.createElement('input');
                    box.type = 'checkbox';
                    box.checked = true;
                    box.value = bomb.id;
                    label.append(box, ` 💣 #${index + 1} (${bomb.x}, ${bomb.y})${bomb.hidden ? ' · trappola' : ''}`);
                    list.appendChild(label);
                });
                row.appendChild(list);

                const detonate = document.createElement('button');
                detonate.type = 'button';
                detonate.className = 'trinket-detonate';
                const refreshLabel = () => {
                    const n = list.querySelectorAll('input:checked').length;
                    detonate.textContent = `💥 Detona ${n} · ${n * BOMB_PAV_PER_BOMB} PA Volontà${fighting ? ` · ${BOMB_DETONATION_FRAMES} frame` : ''}`;
                    detonate.disabled = !n;
                };
                list.addEventListener('change', refreshLabel);
                refreshLabel();
                detonate.addEventListener('click', () => {
                    const ids = [...list.querySelectorAll('input:checked')].map(b => b.value);
                    if (!ids.length) return;
                    if (!confirm(`Far esplodere ${ids.length} bomba/e?`)) return;
                    socket.emit('detonate_trinkets', { char_id: char.id, trinket_ids: ids });
                });
                row.appendChild(detonate);
            }
        }
        block.appendChild(row);
    });
    return block;
}

function renderTrinketSheet(char) {
    lastTrinketSheetChar = char || lastTrinketSheetChar;
    const container = document.getElementById('ui-trinkets');
    if (!container) return;
    container.innerHTML = '';
    const fresh = characters.find(c => c.id === lastTrinketSheetChar?.id) || lastTrinketSheetChar;
    const block = fresh ? buildTrinketBlock(fresh) : null;
    if (block) container.appendChild(block);
}

function renderTrinketCombat() {
    const container = document.getElementById('combat-trinket-section');
    if (!container) return;
    container.innerHTML = '';
    if (!combatState.is_active || combatState.interrupts?.length) return;
    const actor = characters.find(c => c.id === getActingCombatantId());
    if (!canControlTrinkets(actor)) return;
    const block = buildTrinketBlock(actor);
    if (block) container.appendChild(block);
}

window.renderTrinketSheet = renderTrinketSheet;
window.renderTrinketCombat = renderTrinketCombat;

// ------------------------------------------
// Piazzare / lanciare: si sceglie l'esagono sulla mappa
// ------------------------------------------
function startTrinketPlacement(char, device, mode) {
    const same = window.trinketPlacement?.char_id === char.id &&
        window.trinketPlacement?.device_id === device.id && window.trinketPlacement?.mode === mode;
    window.trinketPlacement = same ? null : { char_id: char.id, device_id: device.id, mode };
    if (window.trinketPlacement) {
        statusBar.innerText = mode === 'lancia'
            ? `🎯 Lancia ${device.icon}: clicca un esagono entro ${TRINKET_THROW_RANGE} m in vista (Esc per annullare).`
            : `📍 Piazza ${device.icon}: clicca il tuo esagono o uno adiacente (Esc per annullare).`;
    }
    renderTrinketSheet();
    renderTrinketCombat();
    requestRender();
}

function cancelTrinketPlacement() {
    window.trinketPlacement = null;
    renderTrinketSheet();
    renderTrinketCombat();
    requestRender();
}

function trinketHexAllowed(char, col, row) {
    const distance = hexDistance(char.x, char.y, col, row);
    if (window.trinketPlacement.mode === 'lancia') {
        return distance <= TRINKET_THROW_RANGE && hasLineOfSight(char.x, char.y, col, row);
    }
    return distance <= 1;
}

function placeTrinketAt(col, row) {
    const placement = window.trinketPlacement;
    const char = characters.find(c => c.id === placement?.char_id);
    if (!char) return cancelTrinketPlacement();
    if (!trinketHexAllowed(char, col, row)) {
        statusBar.innerText = placement.mode === 'lancia'
            ? `❌ Troppo lontano o fuori vista (max ${TRINKET_THROW_RANGE} m).`
            : '❌ Solo sul tuo esagono o su uno adiacente.';
        return;
    }
    socket.emit('place_trinket', { char_id: char.id, device_id: placement.device_id, mode: placement.mode, x: col, y: row });
    cancelTrinketPlacement();
}

window.placeTrinketAt = placeTrinketAt;
window.cancelTrinketPlacement = cancelTrinketPlacement;

// ------------------------------------------
// Mappa: icone dei trinket (le trappole semitrasparenti) e lampi delle esplosioni
// ------------------------------------------
function drawTrinkets() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Esagoni validi mentre si sceglie dove metterlo
    const placement = window.trinketPlacement;
    const placer = placement && characters.find(c => c.id === placement.char_id);
    if (placer) {
        const range = placement.mode === 'lancia' ? TRINKET_THROW_RANGE : 1;
        for (let col = placer.x - range; col <= placer.x + range; col++) {
            for (let row = placer.y - range - 1; row <= placer.y + range + 1; row++) {
                if (!trinketHexAllowed(placer, col, row)) continue;
                const p = hexToPixel(col, row);
                ctx.beginPath();
                ctx.arc(p.x, p.y, HEX_SIZE * 0.45, 0, 2 * Math.PI);
                ctx.fillStyle = placement.mode === 'lancia' ? 'rgba(52, 152, 219, 0.18)' : 'rgba(46, 204, 113, 0.25)';
                ctx.fill();
            }
        }
    }

    // Schivata riuscita: dove ci si può buttare
    (window.explosionEscape?.hexes || []).forEach(([col, row]) => {
        const p = hexToPixel(col, row);
        ctx.beginPath();
        ctx.arc(p.x, p.y, HEX_SIZE * 0.45, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(46, 204, 113, 0.35)';
        ctx.fill();
    });

    ctx.font = `${Math.round(HEX_SIZE * 0.9)}px Arial`;
    window.mapTrinkets.forEach(t => {
        const p = hexToPixel(t.x, t.y);
        ctx.globalAlpha = t.hidden ? 0.5 : 1;
        ctx.fillText(TRINKET_ICONS[t.kind] || '🧩', p.x + HEX_SIZE * 0.45, p.y - HEX_SIZE * 0.45);
    });
    ctx.globalAlpha = 1;

    // Area delle bombe appena attivate: 1 esagono (20) e 2 esagoni (10)
    const now = performance.now();
    explosionMarks = explosionMarks.filter(m => now - m.start < 6000);
    explosionMarks.forEach(mark => {
        const p = hexToPixel(mark.x, mark.y);
        const pulse = 0.5 + 0.5 * Math.sin((now - mark.start) / 120);
        [[2.6, 'rgba(230, 126, 34, '], [1.6, 'rgba(231, 76, 60, ']].forEach(([radius, color]) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, HEX_SIZE * radius * 1.5, 0, 2 * Math.PI);
            ctx.fillStyle = color + (0.12 + 0.12 * pulse) + ')';
            ctx.fill();
        });
        ctx.fillText('💥', p.x, p.y);
    });
    ctx.restore();
    if (explosionMarks.length) requestAnimationFrame(() => requestRender());
}

window.drawTrinkets = drawTrinkets;

socket.on('trinkets_update', (trinkets) => {
    window.mapTrinkets = Array.isArray(trinkets) ? trinkets : [];
    renderTrinketSheet();
    renderTrinketCombat();
    requestRender();
});

// Schivata riuscita: si clicca un esagono verde, fuori dalla portata dell'esplosione
socket.on('explosion_escape', (payload) => {
    if (!payload?.hexes?.length) {
        statusBar.innerText = `💨 ${payload?.target_name || ''} schiva, ma non c'è un esagono libero fuori dall'esplosione: resta dov'è.`;
        return;
    }
    window.explosionEscape = payload;
    statusBar.innerText = `💨 ${payload.target_name} schiva! Clicca un esagono verde per buttarti fuori dall'esplosione.`;
    if (!isMaster) alert(`💨 ${payload.target_name} schiva l'esplosione! Clicca un esagono verde sulla mappa per buttarti fuori.`);
    requestRender();
});

function escapeExplosionAt(col, row) {
    const escape = window.explosionEscape;
    if (!escape) return false;
    if (!escape.hexes.some(([x, y]) => x === col && y === row)) {
        statusBar.innerText = '❌ Scegli un esagono verde, fuori dalla portata dell\'esplosione.';
        return true;
    }
    socket.emit('explosion_escape_move', { explosion_id: escape.explosion_id, target_id: escape.target_id, x: col, y: row });
    window.explosionEscape = null;
    requestRender();
    return true;
}

window.escapeExplosionAt = escapeExplosionAt;

socket.on('explosion_marks', (data) => {
    const start = performance.now();
    (data?.bombs || []).forEach(b => explosionMarks.push({ ...b, start }));
    requestRender();
});

// ------------------------------------------
// Chi è nell'area: un istante per reagire (come per la mira)
// ------------------------------------------
(() => {
    const modal = document.getElementById('explosion-alert-modal');
    const select = document.getElementById('explosion-alert-action');
    if (!modal || !select) return;

    const picker = createLimbPicker('explosion-alert-limbs');
    const queue = [];

    function updateCost() {
        const alertData = queue[0];
        const target = characters.find(c => c.id === alertData?.target_id);
        const rule = findActionSpeedRule(select.value);
        const fighting = target && inCombatTurnOrder(target);
        document.getElementById('explosion-alert-cost').textContent = rule ? `⚡ Vel ${rule.speed} · ${rule.frames} frame` : '';
        document.getElementById('explosion-alert-limbs').style.display = rule && fighting ? 'block' : 'none';
        picker.update({
            cost: rule && fighting ? Number(rule.frames) : 0,
            available: combatState.players_limbs?.[target?.id],
            preferred: rule?.category === 'Movimento' ? LIMB_ORDER_LEGS : LIMB_ORDER_ARMS,
            suggest: true
        });
    }

    function showNext() {
        const alertData = queue[0];
        if (!alertData) {
            modal.classList.remove('open');
            return;
        }
        document.getElementById('explosion-alert-text').innerHTML =
            `<b>Bip... bip...</b> Una bomba di <b>${escapeHtml(alertData.owner_name)}</b> sta per esplodere vicino a ` +
            `<b>${escapeHtml(alertData.target_name)}</b>. Come reagisci?`;
        select.innerHTML = '';
        select.add(new Option('Nessuna reazione', ''));
        getActionSpeedEntries()
            .filter(entry => ['Difesa', 'Movimento'].includes(entry.category) && !entry.special)
            .forEach(entry => select.add(new Option(`${entry.action} (${entry.frames} frame)`, entry.action)));
        updateCost();
        modal.classList.add('open');
    }

    select.addEventListener('change', updateCost);

    document.getElementById('explosion-alert-confirm')?.addEventListener('click', () => {
        const alertData = queue[0];
        if (!alertData) return;
        const target = characters.find(c => c.id === alertData.target_id);
        const action = select.value || null;
        let shares = {};
        if (action && target && inCombatTurnOrder(target)) {
            shares = picker.getShares();
            if (!shares) {
                alert('Frame insufficienti negli arti scelti: aggiungi un altro arto.');
                return;
            }
        }
        socket.emit('explosion_response', {
            explosion_id: alertData.explosion_id, target_id: alertData.target_id, action, limb_shares: shares
        });
        queue.shift();
        showNext();
    });

    socket.on('explosion_alert', (alertData) => {
        if (queue.some(a => a.explosion_id === alertData.explosion_id && a.target_id === alertData.target_id)) return;
        queue.push(alertData);
        if (queue.length === 1) showNext();
    });
})();

// ------------------------------------------
// Master: revisione dell'esplosione. Danni proposti per distanza
// (sommati se più bombe), divisi 50/50 con l'armatura, tutto modificabile.
// ------------------------------------------
(() => {
    const modal = document.getElementById('explosion-review-modal');
    const body = document.getElementById('explosion-review-body');
    if (!modal || !body) return;

    let explosions = [];
    const edits = {};   // valori già toccati dal Master: non si perdono agli aggiornamenti

    function splitRow(rowEl, piece) {
        const total = Math.max(0, parseInt(rowEl.querySelector('.xr-total').value) || 0);
        const armor = piece ? Math.min(Math.floor(total / 2), Math.max(0, piece.hp)) : 0;
        rowEl.querySelector('.xr-armor').value = armor;
        rowEl.querySelector('.xr-hp').value = total - armor;
    }

    function render() {
        body.innerHTML = '';
        if (!isMaster || !explosions.length) {
            modal.classList.remove('open');
            return;
        }

        explosions.forEach(explosion => {
            const section = document.createElement('div');
            section.className = 'xr-explosion';
            section.innerHTML = `<div class="xr-head">💥 Bomba di <b>${escapeHtml(explosion.owner_name)}</b></div>`;

            const table = document.createElement('div');
            table.className = 'xr-rows';
            explosion.rows.forEach(row => {
                const key = `${explosion.id}:${row.char_id}`;
                const saved = edits[key] || {};
                const el = document.createElement('div');
                el.className = 'xr-row';

                const name = document.createElement('div');
                name.className = 'xr-name';
                name.innerHTML = `<b>${escapeHtml(row.name)}</b>`;
                el.appendChild(name);

                // Risposta: quella scelta, oppure (per NPC o chi tarda) la sceglie il Master
                const response = document.createElement('div');
                response.className = 'xr-response';
                if (row.response) {
                    response.textContent = `↪ ${row.response}`;
                } else {
                    const pick = document.createElement('select');
                    pick.add(new Option('⏳ in attesa…', '__wait'));
                    pick.add(new Option('Nessuna reazione', ''));
                    getActionSpeedEntries()
                        .filter(entry => ['Difesa', 'Movimento'].includes(entry.category) && !entry.special)
                        .forEach(entry => pick.add(new Option(entry.action, entry.action)));
                    pick.title = 'Scegli tu la reazione (NPC o giocatore che non risponde)';
                    pick.addEventListener('change', () => {
                        if (pick.value === '__wait') return;
                        // Il Master decide senza consumare frame dagli arti: li corregge a mano se servono
                        socket.emit('explosion_response', {
                            explosion_id: explosion.id, target_id: row.char_id, action: pick.value || null,
                            limb_shares: suggestedShares(row.char_id, pick.value)
                        });
                    });
                    response.appendChild(pick);
                }
                el.appendChild(response);

                // Chi ha reagito può schivare: il Master decide se ci riesce
                if (row.response && row.response !== 'Nessuna reazione') {
                    const outcome = document.createElement('select');
                    outcome.className = 'xr-outcome';
                    outcome.add(new Option('💥 Preso in pieno', 'hit'));
                    outcome.add(new Option('💨 Schivata riuscita (0 danni)', 'dodge'));
                    outcome.value = row.dodged ? 'dodge' : 'hit';
                    outcome.addEventListener('change', () => socket.emit('explosion_dodge', {
                        explosion_id: explosion.id, target_id: row.char_id, success: outcome.value === 'dodge'
                    }));
                    response.appendChild(outcome);
                    if (row.dodged) {
                        const where = document.createElement('div');
                        where.textContent = row.escaped ? '🏃 Si è buttato fuori dall\'area.' : '⏳ Sta scegliendo dove buttarsi…';
                        response.appendChild(where);
                    }
                }

                const fields = document.createElement('div');
                fields.className = 'xr-fields';
                fields.innerHTML =
                    `<label>Totale <input type="number" min="0" class="xr-total" value="${saved.total ?? row.damage}"></label>` +
                    `<label>❤️ <input type="number" min="0" class="xr-hp"></label>` +
                    `<label>🛡️ <select class="xr-slot"></select> <input type="number" min="0" class="xr-armor"></label>`;
                el.appendChild(fields);

                const slotSelect = fields.querySelector('.xr-slot');
                slotSelect.add(new Option('Nessuna armatura', ''));
                (row.armor_pieces || []).forEach(p => slotSelect.add(new Option(`${p.name} (${p.hp}/${p.max_hp})`, p.slot)));
                slotSelect.value = saved.slot ?? (row.armor_slot || '');

                const pieceOf = () => (row.armor_pieces || []).find(p => p.slot === slotSelect.value);
                if (saved.hp !== undefined) {
                    fields.querySelector('.xr-hp').value = saved.hp;
                    fields.querySelector('.xr-armor').value = saved.armor;
                } else {
                    splitRow(el, pieceOf());
                }

                const remember = () => {
                    edits[key] = {
                        total: fields.querySelector('.xr-total').value,
                        hp: fields.querySelector('.xr-hp').value,
                        armor: fields.querySelector('.xr-armor').value,
                        slot: slotSelect.value
                    };
                };
                fields.querySelector('.xr-total').addEventListener('input', () => { splitRow(el, pieceOf()); remember(); });
                slotSelect.addEventListener('change', () => { splitRow(el, pieceOf()); remember(); });
                fields.querySelector('.xr-hp').addEventListener('input', remember);
                fields.querySelector('.xr-armor').addEventListener('input', remember);

                if (row.dodged) {
                    fields.querySelectorAll('input, select').forEach(input => { input.disabled = true; });
                    fields.querySelector('.xr-hp').value = 0;
                    fields.querySelector('.xr-armor').value = 0;
                    el.classList.add('dodged');
                }

                el.dataset.charId = row.char_id;
                table.appendChild(el);
            });
            section.appendChild(table);

            const waiting = explosion.rows.filter(r => !r.response).length;
            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'xr-apply';
            apply.textContent = waiting ? `💥 Applica (${waiting} senza risposta)` : '💥 Applica i danni';
            apply.addEventListener('click', () => {
                if (waiting && !confirm(`${waiting} bersaglio/i non ha ancora reagito. Applicare lo stesso?`)) return;
                const rows = [...table.querySelectorAll('.xr-row')].map(el => ({
                    char_id: Number(el.dataset.charId),
                    damage: parseInt(el.querySelector('.xr-hp').value) || 0,
                    armor_slot: el.querySelector('.xr-slot').value || null,
                    armor_damage: parseInt(el.querySelector('.xr-armor').value) || 0
                }));
                socket.emit('apply_explosion', { explosion_id: explosion.id, rows });
            });
            section.appendChild(apply);
            body.appendChild(section);
        });
        modal.classList.add('open');
    }

    function suggestedShares(charId, action) {
        const rule = findActionSpeedRule(action);
        const char = characters.find(c => c.id === charId);
        if (!rule || !char || !inCombatTurnOrder(char)) return {};
        const limbs = combatState.players_limbs?.[charId] || {};
        const order = rule.category === 'Movimento' ? LIMB_ORDER_LEGS : LIMB_ORDER_ARMS;
        return splitFramesAcrossLimbs(Number(rule.frames), order, limbs) || {};
    }

    socket.on('explosions_update', (data) => {
        explosions = Array.isArray(data) ? data : [];
        const alive = new Set(explosions.map(e => e.id));
        Object.keys(edits).forEach(key => { if (!alive.has(key.split(':')[0])) delete edits[key]; });
        render();
        // L'esplosione è chiusa (o la schivata annullata): niente più esagoni di fuga
        const escape = window.explosionEscape;
        const row = escape && explosions.find(e => e.id === escape.explosion_id)?.rows.find(r => r.char_id === escape.target_id);
        if (escape && (!row || !row.dodged || row.escaped)) {
            window.explosionEscape = null;
            requestRender();
        }
    });
})();
