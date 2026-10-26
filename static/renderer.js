// ==========================================
// DISEGNO E RENDER DELLE FORME
// ==========================================
function drawSingleItem(item) {
    ctx.beginPath();
    ctx.strokeStyle = item.c;
    ctx.fillStyle = item.c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.type === 'stroke') {
        drawStroke(item.points || []);
    } else if (item.type === 'line' || !item.type) {
        ctx.lineWidth = item.w;
        ctx.moveTo(item.sx, item.sy);
        ctx.lineTo(item.ex, item.ey);
        ctx.stroke();
    } else if (item.type === 'circle') {
        ctx.lineWidth = 3;
        ctx.arc(item.sx, item.sy, item.w, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (item.type === 'square') {
        ctx.lineWidth = 3;
        ctx.rect(item.sx - item.w, item.sy - item.w, item.w * 2, item.w * 2);
        ctx.stroke();
    } else if (item.type === 'rectangle') {
        ctx.lineWidth = 3;
        ctx.strokeRect(item.sx, item.sy, item.ex - item.sx, item.ey - item.sy);
    }else if (item.type === 'triangle') {
        ctx.lineWidth = 3;
        ctx.moveTo(item.sx, item.sy - item.w);
        ctx.lineTo(item.sx - item.w, item.sy + item.w);
        ctx.lineTo(item.sx + item.w, item.sy + item.w);
        ctx.closePath();
        ctx.stroke();
    } else if (item.type === 'icon' && item.img) {
        // imageObj è solo cache locale del browser: non arriva dal server.
        // Se per errore è un oggetto vuoto/non valido, ricreiamo l'immagine.
        const imageIsValid =
            item.imageObj &&
            typeof item.imageObj.complete === 'boolean' &&
            typeof item.imageObj.naturalWidth === 'number';

        if (!imageIsValid) {
            const img = new Image();

            img.onload = () => {
                if (typeof requestRender === 'function') {
                    requestRender();
                } else if (typeof render === 'function') {
                    render();
                }
            };

            img.onerror = () => {
                console.warn('Impossibile caricare lo sticker:', item.uid);
            };

            item.imageObj = img;
            img.src = item.img;
        }

        if (
            item.imageObj.complete &&
            item.imageObj.naturalWidth > 0
        ) {
            const size = item.w * 2;
            ctx.drawImage(
                item.imageObj,
                item.sx - size / 2,
                item.sy - size / 2,
                size,
                size
            );
        }
    }
}

// Tratto libero: ogni punto è [x, y, spessore] (lo spessore varia con la pressione della penna)
function drawStroke(points) {
    if (!points.length) return;

    if (points.length === 1) {
        const [x, y, w] = points[0];
        ctx.arc(x, y, w / 2, 0, 2 * Math.PI);
        ctx.fill();
        return;
    }

    // Raggruppa i segmenti consecutivi con lo stesso spessore in un unico path
    ctx.lineWidth = points[1][2];
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const [x, y, w] = points[i];
        if (w !== ctx.lineWidth) {
            ctx.stroke();
            ctx.beginPath();
            ctx.lineWidth = w;
            ctx.moveTo(points[i - 1][0], points[i - 1][1]);
        }
        ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawLines() {
    drawings.forEach(item => drawSingleItem(item));
    if (currentTempShape) {
        drawSingleItem(currentTempShape); // Disegna l'anteprima in tempo reale
    }
}

// ==========================================
// AREE MINACCIATE (Minacciare)
// ==========================================

function traceHex(centerX, centerY) {
    HEX_CORNERS.forEach((corner, i) => {
        if (i === 0) ctx.moveTo(centerX + corner.x, centerY + corner.y);
        else ctx.lineTo(centerX + corner.x, centerY + corner.y);
    });
    ctx.closePath();
}

// Path di tutti gli esagoni entro il raggio dal centro
function traceHexArea(col, row, radius) {
    ctx.beginPath();
    for (let r = row - radius; r <= row + radius; r++) {
        for (let c = col - radius - 1; c <= col + radius + 1; c++) {
            if (hexDistance(col, row, c, r) > radius) continue;
            const center = hexToPixel(c, r);
            traceHex(center.x, center.y);
        }
    }
}

function drawThreatArea(threat, fill, stroke, label, dashed) {
    ctx.save();
    traceHexArea(threat.x, threat.y, threat.radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.stroke();

    if (label) {
        const center = hexToPixel(threat.x, threat.y);
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeText(label, center.x, center.y - HEX_SIZE * 0.9);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, center.x, center.y - HEX_SIZE * 0.9);
    }
    ctx.restore();
}

function drawThreats() {
    if (!combatState.is_active) return;

    combatThreats.forEach(threat => {
        // Arancione per i giocatori, viola per gli NPC (che vede solo il Master)
        const isNpc = threat.owner_role === 'npc';
        drawThreatArea(
            threat,
            isNpc ? 'rgba(142, 68, 173, 0.22)' : 'rgba(230, 126, 34, 0.22)',
            isNpc ? '#8e44ad' : '#e67e22',
            `⚠️ ${threat.char_name}`,
            false
        );
    });

    // Anteprima mentre si sceglie il centro dell'area
    if (window.threatPlacement && window.hoveredHex) {
        drawThreatArea(
            { x: window.hoveredHex.col, y: window.hoveredHex.row, radius: window.threatPlacement.radius },
            'rgba(241, 196, 15, 0.18)',
            '#f1c40f',
            '',
            true
        );
    }
}

// Contorno del disegno selezionato e cursore della gomma (solo per il Master)
function drawDrawingOverlays() {
    if (!isMaster || !isDrawingMode) return;

    ctx.save();
    ctx.lineWidth = 2 / camera.zoom;

    if (window.selectedDrawing) {
        const b = getDrawingBounds(window.selectedDrawing);
        const pad = 5 / camera.zoom;
        ctx.strokeStyle = '#e74c3c';
        ctx.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
        ctx.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);
    }

    if (window.eraserCursor) {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#f39c12';
        ctx.fillStyle = 'rgba(243, 156, 18, 0.15)';
        ctx.beginPath();
        ctx.arc(window.eraserCursor.x, window.eraserCursor.y, ERASER_RADIUS_PX / camera.zoom, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

function drawGrid() {

    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;

    // Calcola gli esagoni visibili nella camera
    const startRow =
        Math.floor(
            (-camera.y / camera.zoom) /
            (HEX_SIZE * 1.5)
        ) - 1;

    const endRow =
        Math.ceil(
            ((canvas.height - camera.y) / camera.zoom) /
            (HEX_SIZE * 1.5)
        ) + 1;

    const startCol =
        Math.floor(
            (-camera.x / camera.zoom) /
            HEX_W
        ) - 1;

    const endCol =
        Math.ceil(
            ((canvas.width - camera.x) / camera.zoom) /
            HEX_W
        ) + 1;

    // Un solo path per tutta la griglia
    ctx.beginPath();

    for (
        let row = startRow;
        row <= endRow;
        row++
    ) {

        for (
            let col = startCol;
            col <= endCol;
            col++
        ) {

            const center =
                hexToPixel(
                    col,
                    row
                );

            for (
                let i = 0;
                i < 6;
                i++
            ) {

                const corner =
                    HEX_CORNERS[i];

                const px =
                    center.x +
                    corner.x;

                const py =
                    center.y +
                    corner.y;

                if (i === 0) {

                    ctx.moveTo(
                        px,
                        py
                    );

                } else {

                    ctx.lineTo(
                        px,
                        py
                    );
                }
            }

            // Chiude geometricamente l'esagono
            const firstCorner =
                HEX_CORNERS[0];

            ctx.lineTo(
                center.x + firstCorner.x,
                center.y + firstCorner.y
            );
        }
    }

    // Un'unica chiamata GPU/canvas
    ctx.stroke();
}
const tokenImageCache = new Map();

function getCharacterTokenImage(char) {
    if (!char.token_url) return null;

    const cached = tokenImageCache.get(char.id);

    if (cached && cached.src === char.token_url) {
        return cached.image;
    }

    const image = new Image();

    image.onload = () => {
        requestRender();
    };

    image.src = char.token_url;

    tokenImageCache.set(char.id, {
        src: char.token_url,
        image: image
    });

    return image;
}

function drawTokens() {
    // Disegna l'epicentro del combattimento
    if (combatState.is_active && combatState.epicenter) {
        const epCenter = hexToPixel(combatState.epicenter.x, combatState.epicenter.y);
        const ex = epCenter.x;
        const ey = epCenter.y;

        ctx.beginPath();
        ctx.arc(ex, ey, HEX_SIZE - 5, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
        ctx.lineWidth = 4;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(231, 76, 60, 0.8)';
        ctx.font = '20px Arial';
        ctx.fillText("🎯", ex, ey);
    }

    characters.forEach(char => {
        // NPC che nessun personaggio giocante vede (muri, fumo): nascosti ai giocatori
        if (!isNpcVisibleToPlayers(char)) return;

        // I giocatori non vedono NULLA né se in FoW né se Invisibili. Il Master procede.
        if ((char.is_hidden || char.is_invisible) && !isMaster) return;

        // --- NUOVO: Nascondi pedine se sono dentro la Fog of War non esplorata ---
        const hexStr = `${char.x},${char.y}`;
        if (!isMaster && window.fowEnabled && !window.revealedHexes.has(hexStr)) return;

        ctx.save();

        // Differenza visiva per il Master
        if (isMaster) {
            if (char.is_hidden) {
                ctx.globalAlpha = 0.3; // Molto trasparente (Fog of War)
            } else if (char.is_invisible) {
                ctx.globalAlpha = 0.6; // Semi-trasparente (Invisibile in combat)
            }
        }

        // Trova il centro dell'esagono
        const center = hexToPixel(char.x, char.y);
        const centerX = center.x;
        const centerY = center.y;
        const radius = HEX_SIZE - 6; // Dimensione pedina proporzionata all'esagono
        const isSelected = char.id === selectedCharacterId;

        // Disegna l'alone e i passi SE è in combattimento ed è il suo turno
        if (combatState.is_active && combatState.turn_order.length > 0) {
            const currentActor = combatState.turn_order[combatState.current_index];
            if (currentActor && currentActor.id === char.id) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI);
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 3;
                ctx.stroke();

                // CALCOLO PASSI SU GRIGLIA ESAGONALE
                const steps = hexDistance(char.x, char.y, currentActor.start_x, currentActor.start_y);

                ctx.font = 'bold 14px Arial';
                // Contorno nero per il testo dei passi (leggibile sulle mappe)
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#000000';
                ctx.strokeText(`Passi: ${steps}`, centerX, centerY - radius - 15);
                ctx.fillStyle = '#f39c12';
                ctx.fillText(`Passi: ${steps}`, centerX, centerY - radius - 15);

                //// --- NUOVO: Mostra i Frame di Movimento ---
                if (combatState.is_active) {
                    let framesToShow = window.playersPa[char.id];
                    if (framesToShow === undefined) framesToShow = 120;

                    const frameText = `Mov: ${framesToShow}/120f`;
                    ctx.font = 'bold 14px Arial';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#000000';
                    ctx.strokeText(frameText, centerX, centerY - radius - 35);

                    // Colore dinamico: Verde, Arancione (sotto 60), Rosso (sotto 25)
                    let frameColor = '#2ecc71';
                    if (framesToShow < 25) frameColor = '#e74c3c';
                    else if (framesToShow < 60) frameColor = '#f39c12';

                    ctx.fillStyle = frameColor;
                    ctx.fillText(frameText, centerX, centerY - radius - 35);
                }
            }
        }

        // Sfondo della pedina
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = char.color;
        ctx.fill();

        const tokenImage = getCharacterTokenImage(char);

        if (
            tokenImage &&
            tokenImage.complete &&
            tokenImage.naturalWidth > 0
        ) {
            ctx.save();

            // Il PNG viene ritagliato dentro la pedina circolare
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.clip();

            const maxSize = radius * 2;

            const scale = Math.min(
                maxSize / tokenImage.naturalWidth,
                maxSize / tokenImage.naturalHeight
            );

            const drawWidth = tokenImage.naturalWidth * scale;
            const drawHeight = tokenImage.naturalHeight * scale;

            ctx.drawImage(
                tokenImage,
                centerX - drawWidth / 2,
                centerY - drawHeight / 2,
                drawWidth,
                drawHeight
            );

            ctx.restore();
        } else {
            // Fallback vecchio sistema
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                char.name.charAt(0).toUpperCase(),
                centerX,
                centerY
            );
        }

        // Bordo sopra l'immagine
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.strokeStyle = isSelected ? '#ffeb3b' : '#000000';
        ctx.stroke();

        // Mostra gli HP durante il combattimento, ma gli NPC sono segreti ai giocatori.
        if (combatState.is_active && (isMaster || char.role !== 'npc')) {
            const hpCurrent = char.hp_current !== undefined ? char.hp_current : '?';
            const hpMax = char.hp_max || '?';
            const hpText = `${hpCurrent} / ${hpMax}`;

            ctx.font = 'bold 11px Arial';

            // Applica un contorno nero al testo in modo che spicchi su mappe chiare o scure
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(hpText, centerX, centerY + radius + 12);

            // Calcola il colore in base alla percentuale di HP
            let hpColor = '#2ecc71'; // Verde (Sopra il 50%)
            const hpPercent = hpCurrent / (char.hp_max || 1);
            if (hpPercent <= 0.25) hpColor = '#e74c3c'; // Rosso (In fin di vita)
            else if (hpPercent <= 0.50) hpColor = '#f39c12'; // Arancione (Metà vita)

            ctx.fillStyle = hpColor;
            ctx.fillText(hpText, centerX, centerY + radius + 12);
        }

        drawEffectBadges(char, centerX, centerY, radius);

        ctx.restore();

    });
}

// Pallini sugli effetti a tempo: rosso se fanno danno, verde altrimenti.
// Mostra l'iniziale dell'effetto e i turni rimasti.
function drawEffectBadges(char, centerX, centerY, radius) {
    const effects = getTimedEffects(char);
    if (!effects.length) return;

    const badgeRadius = 8;
    const shown = effects.slice(0, 3);

    ctx.save();
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    shown.forEach((effect, i) => {
        // In fila sul bordo in alto a destra della pedina
        const angle = -Math.PI / 4 + i * 0.55;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius - radius * 0.4;

        ctx.beginPath();
        ctx.arc(x, y, badgeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = Number(effect.hpChange) < 0 ? '#c0392b' : '#27ae60';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        ctx.fillStyle = '#fff';
        const initial = String(effect.name || '?').trim().charAt(0).toUpperCase();
        ctx.fillText(`${initial}${effect.turns}`, x, y + 0.5);
    });

    if (effects.length > shown.length) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        const x = centerX + radius + 4;
        const y = centerY + radius * 0.2;
        ctx.strokeText(`+${effects.length - shown.length}`, x, y);
        ctx.fillText(`+${effects.length - shown.length}`, x, y);
    }

    ctx.restore();
}

// Aggiunge un segmento laser e programma la sua cancellazione dopo 1.5 secondi
function addLaserSegment(segment) {
    laserLines.push(segment);
    requestRender();

    setTimeout(() => {
        const index = laserLines.indexOf(segment);
        if (index > -1) {
            laserLines.splice(index, 1);
            requestRender();
        }
    }, 1500); // Tempo di permanenza a schermo: 1.5s
}

// Quando riceviamo il laser dagli altri
socket.on('show_laser', (segment) => {
    addLaserSegment(segment);
});

// Come disegnare i laser (con effetto bagliore)
function drawLaserLines() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    laserLines.forEach(line => {
        ctx.beginPath();
        ctx.moveTo(line.sx, line.sy);
        ctx.lineTo(line.ex, line.ey);
        ctx.strokeStyle = line.c;
        ctx.shadowBlur = 10;          // Effetto bagliore
        ctx.shadowColor = line.c;
        ctx.stroke();
    });
    ctx.restore();
}

function drawMovementPath() {
    if (!combatState.is_active) return;
    const myCharId = parseInt(userSelect?.value);
    const myChar = characters.find(c => c.id === myCharId);

    let isMyTurn = false;
    if (combatState.turn_order && combatState.turn_order.length > 0) {
        const currentActor = combatState.turn_order[combatState.current_index];
        if (currentActor && currentActor.id === myCharId) isMyTurn = true;
    }

    // --- NOVITÀ: Sceglie il bersaglio fisso se c'è un popup aperto, altrimenti segue il mouse ---
    const targetHex = window.pendingMove ? { col: window.pendingMove.x, row: window.pendingMove.y } : window.hoveredHex;

    // --- NUOVO: Nascondi la linea se punta nella nebbia ---
    if (!isMaster && window.fowEnabled && targetHex) {
        const targetHexStr = `${targetHex.col},${targetHex.row}`;
        if (!window.revealedHexes.has(targetHexStr)) return;
    }

    if (isMyTurn && myChar && targetHex) {
        const dist = hexDistance(myChar.x, myChar.y, targetHex.col, targetHex.row);
        if (dist > 0) {
            const startPixel = hexToPixel(myChar.x, myChar.y);
            const endPixel = hexToPixel(targetHex.col, targetHex.row);

            // Disegna la linea tratteggiata blu
            ctx.beginPath();
            ctx.moveTo(startPixel.x, startPixel.y);
            ctx.lineTo(endPixel.x, endPixel.y);
            // Se la mossa è in sospeso (congelata), rendi la linea più marcata (opacità 1)
            ctx.strokeStyle = window.pendingMove ? 'rgba(52, 152, 219, 1)' : 'rgba(52, 152, 219, 0.7)';
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 8]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Evidenzia l'esagono di arrivo
            ctx.beginPath();
            ctx.arc(endPixel.x, endPixel.y, HEX_SIZE * 0.7, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(52, 152, 219, 0.4)';
            ctx.fill();
            ctx.strokeStyle = '#2980b9';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Scrivi i metri sulla linea
            const midX = (startPixel.x + endPixel.x) / 2;
            const midY = (startPixel.y + endPixel.y) / 2;
            ctx.font = 'bold 16px Arial';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(`${dist}m`, midX, midY - 15);
            ctx.fillStyle = '#3498db';
            ctx.fillText(`${dist}m`, midX, midY - 15);
        }
    }
}

// ==========================================
// DISEGNO RIGHELLO
// ==========================================
function drawRuler() {
    if (window.isRulerMode && window.rulerStart && window.rulerCurrent) {
        const startHex = pixelToHex(window.rulerStart.x, window.rulerStart.y);
        const endHex = pixelToHex(window.rulerCurrent.x, window.rulerCurrent.y);
        const dist = hexDistance(startHex.col, startHex.row, endHex.col, endHex.row);

        ctx.save();

        // Disegna la linea tratteggiata
        ctx.beginPath();
        ctx.moveTo(window.rulerStart.x, window.rulerStart.y);
        ctx.lineTo(window.rulerCurrent.x, window.rulerCurrent.y);
        ctx.strokeStyle = '#e67e22'; // Arancione per differenziarlo dal movimento blu
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.stroke();

        // Disegna i punti di ancoraggio
        ctx.setLineDash([]);
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(window.rulerStart.x, window.rulerStart.y, 6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(window.rulerCurrent.x, window.rulerCurrent.y, 6, 0, Math.PI*2); ctx.fill();

        // Testo della distanza
        const midX = (window.rulerStart.x + window.rulerCurrent.x) / 2;
        const midY = (window.rulerStart.y + window.rulerCurrent.y) / 2;

        ctx.font = 'bold 20px Arial';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'white';
        ctx.strokeText(`${dist}m`, midX, midY - 15);
        ctx.fillStyle = '#d35400';
        ctx.fillText(`${dist}m`, midX, midY - 15);

        ctx.restore();
    }
}

// ==========================================
// FOG OF WAR - CACHE OTTIMIZZATA
// ==========================================

let fogCloudTexture = null;

const fogCanvasCache =
    document.createElement('canvas');

const fogCtxCache =
    fogCanvasCache.getContext('2d');

let fogCacheKey = '';

window.fowVersion =
    window.fowVersion || 0;

// ==========================================
// TEXTURE NUVOLE
// ==========================================

function generateCloudTexture() {

    if (fogCloudTexture) {
        return fogCloudTexture;
    }

    const offscreen =
        document.createElement('canvas');

    offscreen.width = 400;
    offscreen.height = 400;

    const offCtx =
        offscreen.getContext('2d');

    offCtx.fillStyle =
        '#0b131a';

    offCtx.fillRect(
        0,
        0,
        400,
        400
    );

    for (
        let i = 0;
        i < 200;
        i++
    ) {

        offCtx.beginPath();

        const x =
            Math.random() * 400;

        const y =
            Math.random() * 400;

        const radius =
            Math.random() * 60 + 20;

        offCtx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        offCtx.fillStyle =
            `rgba(
                44,
                62,
                80,
                ${Math.random() * 0.4}
            )`;

        offCtx.fill();
    }

    fogCloudTexture =
        offscreen;

    return fogCloudTexture;
}

// ==========================================
// INVALIDAZIONE CACHE
// ==========================================

window.invalidateFogCache =
    function() {

        window.fowVersion =
            (window.fowVersion || 0) + 1;

        fogCacheKey = '';

        requestRender();
    };

// ==========================================
// COSTRUZIONE CACHE
// ==========================================

function rebuildFogCache() {

    // Assicura che il canvas cache
    // abbia le stesse dimensioni del canvas principale
    if (
        fogCanvasCache.width !== canvas.width ||
        fogCanvasCache.height !== canvas.height
    ) {

        fogCanvasCache.width =
            canvas.width;

        fogCanvasCache.height =
            canvas.height;
    }

    // Reset completo della trasformazione
    fogCtxCache.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );

    fogCtxCache.clearRect(
        0,
        0,
        fogCanvasCache.width,
        fogCanvasCache.height
    );

    fogCtxCache.globalCompositeOperation =
        'source-over';

    fogCtxCache.globalAlpha =
        1;

    // Coordinate mondo realmente visibili
    const worldLeft =
        -camera.x /
        camera.zoom;

    const worldTop =
        -camera.y /
        camera.zoom;

    const worldRight =
        (
            canvas.width -
            camera.x
        ) /
        camera.zoom;

    const worldBottom =
        (
            canvas.height -
            camera.y
        ) /
        camera.zoom;

    // Applica la stessa camera
    fogCtxCache.translate(
        camera.x,
        camera.y
    );

    fogCtxCache.scale(
        camera.zoom,
        camera.zoom
    );

    // ======================================
    // NEBBIA
    // ======================================

    const cloudImg =
        generateCloudTexture();

    const pattern =
        fogCtxCache.createPattern(
            cloudImg,
            'repeat'
        );

    fogCtxCache.fillStyle =
        pattern;

    fogCtxCache.globalAlpha =
        isMaster
            ? 0.5
            : 1.0;

    // Disegniamo SOLO l'area visibile.
    // Non più -10000 -> +10000.
    fogCtxCache.fillRect(
        worldLeft,
        worldTop,
        worldRight - worldLeft,
        worldBottom - worldTop
    );

    fogCtxCache.globalAlpha =
        1;

    // ======================================
    // ZONE RIVELATE
    // ======================================

    fogCtxCache.globalCompositeOperation =
        'destination-out';

    const blurRadius =
        HEX_SIZE * 2.5;

    window.revealedHexes.forEach(
        hexStr => {

            const parts =
                hexStr.split(',');

            const col =
                parseInt(
                    parts[0]
                );

            const row =
                parseInt(
                    parts[1]
                );

            const center =
                hexToPixel(
                    col,
                    row
                );

            // CULLING:
            // se la radura è completamente
            // fuori schermo non viene disegnata.
            if (
                center.x + blurRadius <
                    worldLeft ||

                center.x - blurRadius >
                    worldRight ||

                center.y + blurRadius <
                    worldTop ||

                center.y - blurRadius >
                    worldBottom
            ) {

                return;
            }

            const gradient =
                fogCtxCache
                    .createRadialGradient(

                        center.x,
                        center.y,
                        HEX_SIZE * 0.5,

                        center.x,
                        center.y,
                        blurRadius
                    );

            gradient.addColorStop(
                0,
                'rgba(0, 0, 0, 1)'
            );

            gradient.addColorStop(
                0.6,
                'rgba(0, 0, 0, 0.8)'
            );

            gradient.addColorStop(
                1,
                'rgba(0, 0, 0, 0)'
            );

            fogCtxCache.fillStyle =
                gradient;

            fogCtxCache.beginPath();

            fogCtxCache.arc(
                center.x,
                center.y,
                blurRadius,
                0,
                Math.PI * 2
            );

            fogCtxCache.fill();
        }
    );

    fogCtxCache.globalCompositeOperation =
        'source-over';
}

// ==========================================
// RENDER FOG
// ==========================================

function drawFogOfWar() {

    if (!window.fowEnabled) {
        return;
    }

    // La cache viene rigenerata solo se
    // cambia qualcosa che influenza la FoW.
    const newCacheKey =
        [
            canvas.width,
            canvas.height,

            camera.x,
            camera.y,
            camera.zoom,

            isMaster
                ? 1
                : 0,

            window.fowVersion || 0
        ].join('|');

    if (
        newCacheKey !==
        fogCacheKey
    ) {

        rebuildFogCache();

        fogCacheKey =
            newCacheKey;
    }

    // Disegna la cache direttamente
    // in coordinate schermo.
    ctx.save();

    ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
    );

    ctx.drawImage(
        fogCanvasCache,
        0,
        0
    );

    ctx.restore();
}

let renderRequested = false;

function requestRender() {

    if (renderRequested) {
        return;
    }

    renderRequested = true;

    requestAnimationFrame(() => {

        renderRequested = false;

        render();
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 1. Sfondo con offset e scaling
    if (bgImage && bgImage.complete) {
        const mapW = bgImage.width * mapScale;
        const mapH = bgImage.height * mapScale;
        ctx.drawImage(bgImage, mapDx, mapDy, mapW, mapH);

        // --- HUD MODIFICA MAPPA VISIVA ---
        if (typeof isMaster !== 'undefined' && isMaster && window.isEditingMap) {
            ctx.save();
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 4 / camera.zoom;
            ctx.setLineDash([10 / camera.zoom, 10 / camera.zoom]);
            ctx.strokeRect(mapDx, mapDy, mapW, mapH);

            ctx.setLineDash([]);
            ctx.fillStyle = '#f1c40f';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2 / camera.zoom;
            const hSize = 15 / camera.zoom; // Dimensione quadratino ancoraggio

            // Quadratino in basso a destra (Ridimensionamento)
            ctx.fillRect(mapDx + mapW - hSize, mapDy + mapH - hSize, hSize*2, hSize*2);
            ctx.strokeRect(mapDx + mapW - hSize, mapDy + mapH - hSize, hSize*2, hSize*2);

            // Etichetta centrale
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(mapDx + mapW/2 - 60/camera.zoom, mapDy + mapH/2 - 15/camera.zoom, 120/camera.zoom, 30/camera.zoom);
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${14/camera.zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("TRASCINA", mapDx + mapW/2, mapDy + mapH/2);
            ctx.restore();
        }
    }

    // 2. Griglia (Sotto i disegni)
    drawGrid();

    // Terreno e superfici (sotto disegni e nebbia: la nebbia li copre)
    drawTerrain();

    // 3. Disegni e Forme geometriche (Sopra la griglia, sotto le pedine)
    drawLines();
    drawDrawingOverlays();

    drawFogOfWar();

    // Aree minacciate sopra la nebbia, sotto le pedine
    drawThreats();

    // 3.1 Percorso Movimento (Sopra le pedine)
    drawMovementPath();

    // 4. Personaggi
    drawTokens();

    // 5. Puntatori Laser Temporanei (Sempre in primissimo piano)
    drawLaserLines();

    // --- NUOVO: Disegna il Righello in cima a tutto ---
    drawRuler();

    ctx.restore();
}
