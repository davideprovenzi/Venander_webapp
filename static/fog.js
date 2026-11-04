// ==========================================
// NEBBIA: GOMMA E PENNELLO DEL MASTER
// Con la Gomma il Master trascina sulla mappa e toglie la nebbia, con
// "Copri" la rimette. Il pennello può essere di 1 esagono o di raggio 1-3.
// Esc (o di nuovo il pulsante) per finire.
// ==========================================
window.fogBrush = null;            // null | 'erase' | 'cover'
let fogBrushPainting = false;
let fogSyncTimer = null;

function syncFogSoon() {
    if (fogSyncTimer) return;
    fogSyncTimer = setTimeout(() => {
        fogSyncTimer = null;
        socket.emit('sync_fow_hexes', Array.from(window.revealedHexes));
    }, 80);
}

window.setFogBrush = function(mode) {
    if (mode && !window.fowEnabled) {
        alert('Attiva prima la Fog of War.');
        mode = null;
    }
    window.fogBrush = mode || null;
    fogBrushPainting = false;
    document.getElementById('btn-fog-erase')?.classList.toggle('active', window.fogBrush === 'erase');
    document.getElementById('btn-fog-cover')?.classList.toggle('active', window.fogBrush === 'cover');
    if (window.fogBrush) {
        // Un solo strumento alla volta
        if (window.terrainBrush) setTerrainBrush(null);
        if (typeof isDrawingMode !== 'undefined' && isDrawingMode) setDrawingMode(false);
        statusBar.innerText = window.fogBrush === 'erase'
            ? '🧽 Gomma della nebbia: trascina sulla mappa per scoprire (Esc per finire).'
            : '🌫️ Pennello della nebbia: trascina sulla mappa per coprire (Esc per finire).';
    } else {
        statusBar.innerText = '[MASTER] Pennello della nebbia spento.';
    }
    canvas.style.cursor = window.fogBrush ? 'crosshair' : '';
};

function paintFogAt(pos) {
    const hex = pixelToHex(pos.x, pos.y);
    const radius = parseInt(document.getElementById('fog-brush-size')?.value) || 0;
    const keys = radius ? getHexesInRadius(hex.col, hex.row, radius) : [`${hex.col},${hex.row}`];
    let changed = false;
    keys.forEach(key => {
        if (window.fogBrush === 'erase' && !window.revealedHexes.has(key)) {
            window.revealedHexes.add(key);
            changed = true;
        } else if (window.fogBrush === 'cover' && window.revealedHexes.has(key)) {
            window.revealedHexes.delete(key);
            changed = true;
        }
    });
    if (changed) {
        window.invalidateFogCache?.();
        syncFogSoon();
    }
}

// Chiamata da control.js: true se il pennello ha usato l'evento
window.fogBrushPointer = function(phase, pos) {
    if (!isMaster || !window.fogBrush) return false;
    if (phase === 'down') {
        fogBrushPainting = true;
        paintFogAt(pos);
        return true;
    }
    if (phase === 'move') {
        if (!fogBrushPainting) return false;
        paintFogAt(pos);
        return true;
    }
    if (phase === 'up' && fogBrushPainting) {
        fogBrushPainting = false;
        return true;
    }
    return false;
};

document.getElementById('btn-fog-erase')?.addEventListener('click', () => {
    window.setFogBrush(window.fogBrush === 'erase' ? null : 'erase');
});
document.getElementById('btn-fog-cover')?.addEventListener('click', () => {
    window.setFogBrush(window.fogBrush === 'cover' ? null : 'cover');
});

// ==========================================
// MURI: DIETRO NON SI VEDE
// Per un giocatore, ogni esagono che il suo personaggio non vede in linea retta
// (muri e fumo bloccano) viene oscurato, anche se è già stato scoperto o la
// nebbia è spenta. Il Master vede tutto.
// ==========================================
const sightCanvas = document.createElement('canvas');
const sightCtx = sightCanvas.getContext('2d');
let sightCacheKey = '';

function sightBlockersSignature() {
    const walls = Object.entries(window.mapTerrain || {}).filter(([, kind]) => kind === 'muro').map(([key]) => key);
    const smoke = Object.entries(window.mapSurfaces || {}).filter(([, kind]) => kind === 'fumo').map(([key]) => key);
    return walls.sort().join(';') + '|' + smoke.sort().join(';');
}

// Ogni giocatore vede quello che vede il SUO personaggio; senza personaggio
// scelto, quello che vede il gruppo intero
function sightViewers() {
    const mine = characters.find(c => c.id === parseInt(userSelect?.value) && c.role === 'player');
    if (mine) return [mine];
    return characters.filter(c => c.role === 'player' && !c.is_hidden);
}

function rebuildSightCache(viewers) {
    if (sightCanvas.width !== canvas.width || sightCanvas.height !== canvas.height) {
        sightCanvas.width = canvas.width;
        sightCanvas.height = canvas.height;
    }
    sightCtx.setTransform(1, 0, 0, 1, 0, 0);
    sightCtx.clearRect(0, 0, sightCanvas.width, sightCanvas.height);
    sightCtx.translate(camera.x, camera.y);
    sightCtx.scale(camera.zoom, camera.zoom);

    // Esagoni sullo schermo (con un margine)
    const topLeft = pixelToHex(-camera.x / camera.zoom, -camera.y / camera.zoom);
    const bottomRight = pixelToHex((canvas.width - camera.x) / camera.zoom, (canvas.height - camera.y) / camera.zoom);
    const minCol = topLeft.col - 2, maxCol = bottomRight.col + 2;
    const minRow = topLeft.row - 2, maxRow = bottomRight.row + 2;

    sightCtx.beginPath();
    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            const seen = viewers.some(v => (v.x === col && v.y === row) || hasLineOfSight(v.x, v.y, col, row));
            if (seen) continue;
            const center = hexToPixel(col, row);
            HEX_CORNERS.forEach((corner, i) => {
                if (i === 0) sightCtx.moveTo(center.x + corner.x, center.y + corner.y);
                else sightCtx.lineTo(center.x + corner.x, center.y + corner.y);
            });
            sightCtx.closePath();
        }
    }
    sightCtx.fillStyle = 'rgba(8, 10, 14, 0.93)';
    sightCtx.fill();
}

window.drawSightShadows = function() {
    if (isMaster || !hasAnySightBlocker()) return;
    const viewers = sightViewers();
    if (!viewers.length) return;

    const key = [
        canvas.width, canvas.height, camera.x, camera.y, camera.zoom,
        viewers.map(v => `${v.id}:${v.x},${v.y}`).join(';'),
        sightBlockersSignature()
    ].join('|');
    if (key !== sightCacheKey) {
        rebuildSightCache(viewers);
        sightCacheKey = key;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sightCanvas, 0, 0);
    ctx.restore();
};
