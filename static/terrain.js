// ==========================================
// TERRENO, SUPERFICI E LINEA DI VISTA
// Il Master dipinge gli esagoni. Altura e coperture sono indicative
// (le applica il Master); muri e fumo bloccano la vista, i muri anche
// il movimento; terreno difficile e ghiaccio costano il doppio.
// Le regole valgono anche sul server (app.py), che è quello che decide.
// ==========================================

const TERRAIN_DEFS = {
    altura: { label: 'Altura', icon: '⛰️', fill: 'rgba(160, 110, 60, 0.30)' },
    copertura_parziale: { label: 'Copertura parziale', icon: '🛡️', fill: 'rgba(127, 140, 141, 0.30)' },
    copertura_totale: { label: 'Copertura totale', icon: '🧱', fill: 'rgba(80, 90, 95, 0.50)' },
    difficile: { label: 'Terreno difficile', icon: '🌿', fill: 'rgba(120, 150, 60, 0.32)' },
    muro: { label: 'Muro', icon: '', fill: 'rgba(35, 35, 35, 0.88)' }
};

const SURFACE_DEFS = {
    fuoco: { label: 'Fuoco', icon: '🔥', fill: 'rgba(231, 76, 60, 0.40)' },
    veleno: { label: 'Veleno', icon: '☠️', fill: 'rgba(46, 204, 113, 0.35)' },
    ghiaccio: { label: 'Ghiaccio', icon: '❄️', fill: 'rgba(174, 214, 241, 0.55)' },
    fumo: { label: 'Fumo', icon: '💨', fill: 'rgba(149, 165, 166, 0.78)' }
};

window.mapTerrain = {};
window.mapSurfaces = {};

// Pennello del Master: { layer: 'terrain' | 'surface', value: tipo o null (cancella) }
window.terrainBrush = null;
let terrainBrushRadius = 0;
let isPaintingTerrain = false;
let pendingTerrainHexes = new Set();
let terrainSyncTimer = null;

const TERRAIN_SYNC_MS = 60;

function hexKey(col, row) {
    return `${col},${row}`;
}

function terrainAt(col, row) {
    return window.mapTerrain[hexKey(col, row)] || null;
}

function surfaceAt(col, row) {
    return window.mapSurfaces[hexKey(col, row)] || null;
}

// ==========================================
// LINEA DI VISTA E MOVIMENTO
// ==========================================

function isWallHex(col, row) {
    return terrainAt(col, row) === 'muro';
}

function blocksSight(col, row) {
    return isWallHex(col, row) || surfaceAt(col, row) === 'fumo';
}

function hasAnySightBlocker() {
    return Object.values(window.mapTerrain).includes('muro') ||
        Object.values(window.mapSurfaces).includes('fumo');
}

// Gli esagoni in mezzo non devono bloccare (gli estremi si vedono sempre)
function hasLineOfSight(x1, y1, x2, y2) {
    return hexLine(x1, y1, x2, y2)
        .slice(1, -1)
        .every(h => !blocksSight(h.col, h.row));
}

function pathCrossesWall(x1, y1, x2, y2) {
    return hexLine(x1, y1, x2, y2).slice(1).some(h => isWallHex(h.col, h.row));
}

// Costo in frame del percorso: terreno difficile e ghiaccio valgono doppio
function movementFrameCost(x1, y1, x2, y2, framesPerStep) {
    return hexLine(x1, y1, x2, y2)
        .slice(1)
        .reduce((cost, h) => {
            const difficult = terrainAt(h.col, h.row) === 'difficile' || surfaceAt(h.col, h.row) === 'ghiaccio';
            return cost + framesPerStep * (difficult ? 2 : 1);
        }, 0);
}

// Un NPC è visibile ai giocatori se almeno un personaggio giocante lo vede
function isNpcVisibleToPlayers(npc) {
    if (isMaster || npc.role !== 'npc' || !hasAnySightBlocker()) return true;

    return characters.some(char =>
        char.role === 'player' &&
        !char.is_hidden &&
        hasLineOfSight(char.x, char.y, npc.x, npc.y)
    );
}

// Note per la revisione del Master: altura, coperture e vista tra due pedine
function describeAttackTerrain(attackerId, defenderId) {
    const attacker = characters.find(c => c.id === attackerId);
    const defender = characters.find(c => c.id === defenderId);
    if (!attacker || !defender) return [];

    const notes = [];
    const attackerHigh = terrainAt(attacker.x, attacker.y) === 'altura';
    const defenderHigh = terrainAt(defender.x, defender.y) === 'altura';

    if (attackerHigh && !defenderHigh) notes.push('⛰️ Attaccante in altura');
    if (defenderHigh && !attackerHigh) notes.push('⛰️ Difensore in altura');

    // Copertura sull'esagono del difensore o su quello subito prima, lungo la linea di tiro
    const line = hexLine(attacker.x, attacker.y, defender.x, defender.y);
    const coverHexes = [line[line.length - 1], line[line.length - 2]].filter(Boolean);
    const covers = coverHexes.map(h => terrainAt(h.col, h.row));

    if (covers.includes('copertura_totale')) notes.push('🧱 Difensore in copertura totale');
    else if (covers.includes('copertura_parziale')) notes.push('🛡️ Difensore in copertura parziale');

    if (!hasLineOfSight(attacker.x, attacker.y, defender.x, defender.y)) {
        notes.push('🚫 Nessuna linea di vista');
    }

    return notes;
}

// ==========================================
// DISEGNO SULLA MAPPA
// ==========================================

function drawTerrainLayer(map, defs) {
    Object.entries(map).forEach(([key, kind]) => {
        const def = defs[kind];
        if (!def) return;

        const [col, row] = key.split(',').map(Number);
        const center = hexToPixel(col, row);

        ctx.beginPath();
        traceHex(center.x, center.y);
        ctx.fillStyle = def.fill;
        ctx.fill();

        // Le icone solo se l'esagono è abbastanza grande da leggerle
        if (def.icon && camera.zoom > 0.45) {
            ctx.fillText(def.icon, center.x, center.y);
        }
    });
}

function drawTerrain() {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawTerrainLayer(window.mapTerrain, TERRAIN_DEFS);
    drawTerrainLayer(window.mapSurfaces, SURFACE_DEFS);
    ctx.restore();
}

// ==========================================
// PENNELLO DEL MASTER (chiamato da control.js)
// ==========================================

function paintTerrainAt(pos) {
    const hex = pixelToHex(pos.x, pos.y);
    const hexes = terrainBrushRadius > 0
        ? getHexesInRadius(hex.col, hex.row, terrainBrushRadius)
        : [hexKey(hex.col, hex.row)];

    const { layer, value } = window.terrainBrush;
    const map = layer === 'terrain' ? window.mapTerrain : window.mapSurfaces;

    hexes.forEach(key => {
        if (value) map[key] = value;
        else delete map[key];
        pendingTerrainHexes.add(key);
    });

    if (!terrainSyncTimer) terrainSyncTimer = setTimeout(flushTerrainPaint, TERRAIN_SYNC_MS);
    render();
}

function flushTerrainPaint() {
    clearTimeout(terrainSyncTimer);
    terrainSyncTimer = null;
    if (!pendingTerrainHexes.size || !window.terrainBrush) return;

    socket.emit('paint_terrain', {
        layer: window.terrainBrush.layer,
        value: window.terrainBrush.value,
        hexes: [...pendingTerrainHexes]
    });
    pendingTerrainHexes = new Set();
}

function terrainPointerDown(pos) {
    if (!isMaster || !window.terrainBrush) return false;
    isPaintingTerrain = true;
    paintTerrainAt(pos);
    return true;
}

function terrainPointerMove(pos) {
    if (!isPaintingTerrain) return false;
    paintTerrainAt(pos);
    return true;
}

function terrainPointerUp() {
    if (!isPaintingTerrain) return false;
    isPaintingTerrain = false;
    flushTerrainPaint();
    return true;
}

// ==========================================
// PANNELLO TERRENO (MASTER)
// ==========================================

function setTerrainBrush(brush) {
    // Stesso pennello cliccato di nuovo: si spegne
    const same = window.terrainBrush &&
        brush &&
        window.terrainBrush.layer === brush.layer &&
        window.terrainBrush.value === brush.value;

    flushTerrainPaint();
    window.terrainBrush = same ? null : brush;

    document.querySelectorAll('.terrain-brush-btn').forEach(btn => {
        const active = window.terrainBrush &&
            btn.dataset.layer === window.terrainBrush.layer &&
            (btn.dataset.value || null) === window.terrainBrush.value;
        btn.classList.toggle('active', !!active);
    });

    const status = document.getElementById('terrain-brush-status');
    if (status) {
        if (!window.terrainBrush) {
            status.textContent = 'Pennello spento.';
        } else {
            const defs = window.terrainBrush.layer === 'terrain' ? TERRAIN_DEFS : SURFACE_DEFS;
            const label = window.terrainBrush.value
                ? defs[window.terrainBrush.value].label
                : (window.terrainBrush.layer === 'terrain' ? 'Cancella terreno' : 'Cancella superfici');
            status.textContent = `Pennello: ${label}. Clicca o trascina sulla mappa (Esc per spegnere).`;
        }
    }

    canvas.style.cursor = window.terrainBrush ? 'cell' : 'pointer';
}

function buildTerrainPalette(containerId, layer, defs, eraseLabel) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = [...Object.entries(defs), [null, { label: eraseLabel, icon: '🧽' }]];

    entries.forEach(([value, def]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'terrain-brush-btn';
        btn.dataset.layer = layer;
        btn.dataset.value = value || '';
        btn.textContent = `${def.icon || '⬛'} ${def.label}`;
        if (def.fill) btn.style.borderLeftColor = def.fill;
        btn.addEventListener('click', () => setTerrainBrush({ layer, value }));
        container.appendChild(btn);
    });
}

buildTerrainPalette('terrain-palette', 'terrain', TERRAIN_DEFS, 'Cancella terreno');
buildTerrainPalette('surface-palette', 'surface', SURFACE_DEFS, 'Cancella superfici');

document.getElementById('terrain-brush-size')?.addEventListener('change', (e) => {
    terrainBrushRadius = parseInt(e.target.value) || 0;
});

document.getElementById('terrain-clear-btn')?.addEventListener('click', () => {
    if (confirm('Cancellare tutto il terreno di questa mappa?')) socket.emit('clear_terrain', { layer: 'terrain' });
});

document.getElementById('surface-clear-btn')?.addEventListener('click', () => {
    if (confirm('Cancellare tutte le superfici di questa mappa?')) socket.emit('clear_terrain', { layer: 'surface' });
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.terrainBrush) setTerrainBrush(null);
});

// ==========================================
// SUPERFICI: DECISIONE DEL MASTER
// Il server segnala chi entra (o inizia il turno) su una superficie;
// il Master sceglie se applicarne l'effetto.
// ==========================================

const surfacePromptQueue = [];

function showNextSurfacePrompt() {
    const modal = document.getElementById('surface-prompt-modal');
    const prompt = surfacePromptQueue[0];
    if (!modal) return;

    if (!prompt) {
        modal.style.display = 'none';
        return;
    }

    const parts = [];
    if (prompt.damage) parts.push(`${prompt.damage} danni`);
    if (prompt.effect) parts.push(`${prompt.effect.name} (${prompt.effect.turns} turni, ${prompt.effect.desc})`);

    const icon = SURFACE_DEFS[prompt.surface]?.icon || '⚠️';
    const reason = prompt.reason === 'turn' ? 'inizia il turno su' : 'attraversa';

    document.getElementById('surface-prompt-text').innerHTML =
        `${icon} <b>${escapeHtml(prompt.char_name)}</b> ${reason} <b>${escapeHtml(prompt.label)}</b>.` +
        `<br><span class="surface-prompt-effect">Effetto: ${escapeHtml(parts.join(' + ') || 'nessuno')}</span>` +
        (surfacePromptQueue.length > 1 ? `<br><span class="surface-prompt-queue">Altri ${surfacePromptQueue.length - 1} in attesa</span>` : '');

    modal.style.display = 'block';
}

function resolveSurfacePrompt(apply) {
    const prompt = surfacePromptQueue.shift();
    if (prompt) socket.emit('resolve_surface_prompt', { id: prompt.id, apply });
    showNextSurfacePrompt();
}

document.getElementById('surface-prompt-apply')?.addEventListener('click', () => resolveSurfacePrompt(true));
document.getElementById('surface-prompt-skip')?.addEventListener('click', () => resolveSurfacePrompt(false));

socket.on('surface_prompt', (prompt) => {
    surfacePromptQueue.push(prompt);
    if (surfacePromptQueue.length === 1) showNextSurfacePrompt();
});

// Risolto da un altro Master
socket.on('surface_prompt_closed', (data) => {
    const index = surfacePromptQueue.findIndex(p => p.id === data.id);
    if (index === -1) return;
    surfacePromptQueue.splice(index, 1);
    if (index === 0) showNextSurfacePrompt();
});

// ==========================================
// RIPOSO (MASTER)
// ==========================================

document.getElementById('rest-short-btn')?.addEventListener('click', () => {
    if (confirm('Riposo breve per tutto il gruppo?\nStamina, concentrazione e PA tornano al massimo.')) {
        socket.emit('party_rest', { kind: 'short' });
    }
});

document.getElementById('rest-long-btn')?.addEventListener('click', () => {
    if (confirm('Riposo lungo (accampamento) per tutto il gruppo?\nTutto torna al massimo, HP compresi, e gli effetti a tempo svaniscono.')) {
        socket.emit('party_rest', { kind: 'long' });
    }
});

// ==========================================
// SOCKET
// ==========================================

socket.on('map_update', (data) => {
    window.mapTerrain = data?.terrain || {};
    window.mapSurfaces = data?.surfaces || {};
    requestRender();
});

socket.on('terrain_update', (data) => {
    const map = data.layer === 'terrain' ? window.mapTerrain : window.mapSurfaces;
    Object.entries(data.changes || {}).forEach(([key, value]) => {
        if (value) map[key] = value;
        else delete map[key];
    });
    requestRender();
});
