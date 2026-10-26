// Memoria dei tasti premuti per le scorciatoie
window.keysDown = {};

window.addEventListener('keydown', e => {
    window.keysDown[e.key.toLowerCase()] = true;

    // --- Tasto Esc per Annullare Selezioni e Strumenti ---
    if (e.key === 'Escape') {
        let changed = false;

        // Svuota completamente l'interfaccia Master
        if (isMaster && selectedCharacterId !== null) {
            selectedCharacterId = null;
            updateMasterEditPanel(null);
            updateSheetButton();
            if (window.updateEquippedPanel) window.updateEquippedPanel(null);
            if (typeof statusBar !== 'undefined') statusBar.innerText = `[MASTER] Selezione annullata.`;
            changed = true;
        }

        if (window.selectedDrawing) {
            window.selectedDrawing = null;
            changed = true;
        }

        if (window.threatPlacement) {
            window.threatPlacement = null;
            if (typeof statusBar !== 'undefined') statusBar.innerText = 'Minaccia annullata.';
            changed = true;
        }

        if (window.isRulerMode) {
            window.isRulerMode = false;
            window.rulerStart = null;
            window.rulerCurrent = null;
            changed = true;
        }

        if (changed && typeof render === 'function') render();
    }
});

window.addEventListener('keyup', e => window.keysDown[e.key.toLowerCase()] = false);

// --- ZOOM (Rotellina) ---
canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); // Evita che la pagina web scorra in giù

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Salva dove sta puntando il mouse nel mondo prima dello zoom
    const worldXBefore = (mouseX - camera.x) / camera.zoom;
    const worldYBefore = (mouseY - camera.y) / camera.zoom;

    // Modifica lo zoom (limiti da 0.3x a 4x)
    const zoomAmount = 0.1;
    if (event.deltaY < 0) {
        camera.zoom = Math.min(camera.zoom + zoomAmount, 4);
    } else {
        camera.zoom = Math.max(camera.zoom - zoomAmount, 0.3);
    }

    // Centra l'inquadratura sul punto in cui si trovava il cursore
    camera.x = mouseX - worldXBefore * camera.zoom;
    camera.y = mouseY - worldYBefore * camera.zoom;

    render();
});

// ==========================================
// MOVIMENTI E DISEGNI SULLA MAPPA
// ==========================================
function isHexOccupied(x, y, excludeCharId = null) {
    return characters.some(c => {
        if (!c) return false;
        if (excludeCharId !== null && Number(c.id) === Number(excludeCharId)) return false;

        return Number(c.x) === Number(x) && Number(c.y) === Number(y);
    });
}

canvas.addEventListener('click', (event) => {
    // Se stavamo disegnando o spostando la mappa, ignora il click
    if (justFinishedAction) return;
    if (event.shiftKey || isDrawingMode) return;

    // Col pennello del terreno il clic dipinge (vedi terrain.js), non seleziona
    if (window.terrainBrush) return;

    // Minacciare: il clic sceglie il centro dell'area
    if (window.threatPlacement) {
        const threatHex = pixelToHex(getWorldPos(event).x, getWorldPos(event).y);
        socket.emit('declare_threat', { ...window.threatPlacement, x: threatHex.col, y: threatHex.row });
        window.threatPlacement = null;
        statusBar.innerText = '';
        requestRender();
        return;
    }

    // ==========================================
    // LOGICA NORMALE: SELEZIONE E MOVIMENTO PEDINE
    // ==========================================
    const currentCharacterId = parseInt(userSelect?.value);
    if (!isMaster && (isNaN(currentCharacterId) || currentCharacterId === 0)) {
        alert("Devi prima selezionare il tuo personaggio dal menu!");
        return;
    }

    const pos = getWorldPos(event);
    const hex = pixelToHex(pos.x, pos.y);
    const gridX = hex.col;
    const gridY = hex.row;

    // --- POSIZIONAMENTO NPC (MASTER) ---
    if (isMaster && window.isSpawningNpc) {
        if (isHexOccupied(gridX, gridY)) {
            statusBar.innerText = "⛔ Non puoi creare una pedina su una casella già occupata.";
            return;
        }

        const name = document.getElementById('npc-name')?.value || "Mistero";
        const hp = parseInt(document.getElementById('npc-hp')?.value) || 30;
        const lore = document.getElementById('npc-description')?.value?.trim() || "";
        const color = document.getElementById('npc-color')?.value || "#8e44ad";
        const isHidden = document.getElementById('npc-hidden')?.checked || false;

       socket.emit('spawn_npc', {
            name,
            hp,
            lore,
            color,
            x: gridX,
            y: gridY,
            is_hidden: isHidden,
            token_url: window.currentNpcTokenBase64 || "",
            // Statistiche, equipaggiamento e armi dal modello (vedi game.js)
            template_id: parseInt(document.getElementById('npc-template-select')?.value) || null
        });
        window.isSpawningNpc = false;
        canvas.style.cursor = "pointer";
        statusBar.innerText = `[MASTER] Entità evocata in X:${gridX}, Y:${gridY}.`;
        if (document.getElementById('npc-name')) document.getElementById('npc-name').value = '';
        if (document.getElementById('npc-description')) document.getElementById('npc-description').value = '';
        return;
    }

    if (!isMaster) {

        // --- NUOVO: BLOCCO MOVIMENTO NELLA FOG OF WAR ---
        if (window.fowEnabled) {
            const targetHexStr = `${gridX},${gridY}`;
            if (!window.revealedHexes.has(targetHexStr)) {
                alert("L'area è avvolta dalla nebbia! Avvicinati per esplorarla prima di poterci camminare.");
                return; // Ferma il codice, impedendo il movimento
            }
        }

        // Se il giocatore clicca un NPC visibile, apre solo la sua scheda pubblica.
        const clickedNpc = characters.find(c =>
            c.role === 'npc' &&
            Number(c.x) === Number(gridX) &&
            Number(c.y) === Number(gridY) &&
            !c.is_hidden &&
            !c.is_invisible
        );

        if (clickedNpc) {
            if (typeof window.showPublicNpcInfo === 'function') {
                window.showPublicNpcInfo(clickedNpc);
            } else if (statusBar) {
                statusBar.innerText = `👁️ ${clickedNpc.name}${clickedNpc.lore ? ` — ${clickedNpc.lore}` : ''}`;
            }
            return;
        }

        const myChar = characters.find(c => Number(c.id) === Number(currentCharacterId));
        if (!myChar) return;

        if (window.pendingLocalMoves?.[currentCharacterId]) {
            statusBar.innerText = "⏳ Movimento in sincronizzazione...";
            return;
        }

        if (Number(myChar.x) === Number(gridX) && Number(myChar.y) === Number(gridY)) return;

        if (isHexOccupied(gridX, gridY, currentCharacterId)) {
            statusBar.innerText = "⛔ Non puoi muoverti in questa casella.";
            return;
        }

        let isMyTurn = false;

        if (combatState.is_active && combatState.turn_order.length > 0) {
            const currentActor = combatState.turn_order[combatState.current_index];
            const activeId = currentActor?.id ?? currentActor?.char_id;

            if (Number(activeId) === Number(currentCharacterId)) isMyTurn = true;
        }

        // I muri non si attraversano (il Master riposiziona liberamente fuori dal combattimento)
        if ((combatState.is_active || !isMaster) && pathCrossesWall(myChar.x, myChar.y, gridX, gridY)) {
            statusBar.innerText = "⛔ Un muro blocca il percorso: aggiralo.";
            return;
        }

        // Durante un'interruzione da Minacciare nessuno si muove
        if (combatState.is_active && combatState.interrupts?.length) {
            statusBar.innerText = "⚡ Interruzione in corso: aspetta che finisca.";
            return;
        }

        // SE SIAMO IN COMBATTIMENTO E TOCCA A ME
        if (combatState.is_active && isMyTurn && myChar) {
            const dist = hexDistance(myChar.x, myChar.y, gridX, gridY);
            if (dist === 0) return; // Ha cliccato dove si trova già

            // Salviamo le coordinate bersaglio e prepariamo il popup
            window.pendingMove = { x: gridX, y: gridY, dist: dist, charId: currentCharacterId };
            document.getElementById('move-modal-text').innerText = `Distanza bersaglio: ${dist} passi.\nScegli la tua andatura:`;

            // --- NUOVO: Calcola il costo esatto in FRAME e aggiorna i bottoni ---
            document.querySelectorAll('.move-btn').forEach(btn => {
                const framesPerStep = parseInt(btn.getAttribute('data-cost')) || 0;
                const modeName = btn.getAttribute('data-name') || "Movimento";

                // Frame richiesti: costo del passo per ogni esagono (doppio su terreno difficile e ghiaccio)
                const requiredFrames = movementFrameCost(myChar.x, myChar.y, gridX, gridY, framesPerStep);

                // Usiamo currentPaMov come contenitore per i 120 frame di movimento
                let currentFrames = parseInt(window.currentPaMov) || 0;

                // 1. Aggiorna il TESTO del bottone e la TRASPARENZA prima di cliccare
                btn.innerText = `${modeName} (Costo: ${requiredFrames} Frame)`;

                if (requiredFrames > currentFrames) {
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                    btn.onclick = null; // Impedisce il click se non hai abbastanza frame
                } else {
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';

                    // 2. Azione al CLICK (blindata contro collisioni e desincronizzazioni)
                    btn.onclick = () => {
                        if (!window.pendingMove) return;

                        const pending = { ...window.pendingMove };

                        // Nel tempo trascorso con la modale aperta un'altra pedina
                        // potrebbe aver occupato la casella.
                        if (isHexOccupied(pending.x, pending.y, pending.charId)) {
                            document.getElementById('move-modal').style.display = 'none';
                            window.pendingMove = null;
                            statusBar.innerText = "⛔ La casella è stata occupata da un'altra pedina.";
                            requestRender();
                            return;
                        }

                        const framesBefore = parseInt(window.currentPaMov) || 0;

                        if (requiredFrames > framesBefore) {
                            statusBar.innerText = "⛔ Non hai abbastanza Frame di movimento.";
                            return;
                        }

                        const framesAfter = framesBefore - requiredFrames;
                        const moveId = `${Date.now()}-${Math.random()}`;

                        const moveData = {
                            char_id: pending.charId,
                            target_x: pending.x,
                            target_y: pending.y,
                            move_id: moveId,
                            // Il server ricalcola il costo in frame dall'andatura
                            mode: modeName
                        };

                        const movingChar = characters.find(
                            c => Number(c.id) === Number(pending.charId)
                        );

                        if (!movingChar) {
                            window.pendingMove = null;
                            document.getElementById('move-modal').style.display = 'none';
                            return;
                        }

                        window.pendingLocalMoves[pending.charId] = {
                            moveId,
                            x: pending.x,
                            y: pending.y,
                            fromX: movingChar.x,
                            fromY: movingChar.y,
                            combat: true,
                            paBefore: framesBefore,
                            paAfter: framesAfter
                        };

                        // Aggiornamento locale immediato. I Frame vengono mostrati
                        // subito, ma saranno sincronizzati al server solo dopo
                        // la conferma del movimento.
                        movingChar.x = moveData.target_x;
                        movingChar.y = moveData.target_y;
                        window.currentPaMov = framesAfter;
                        window.playersPa[pending.charId] = framesAfter;

                        const paEl = document.getElementById('ui-pa-mov');
                        if (paEl) paEl.innerText = framesAfter;

                        document.getElementById('move-modal').style.display = 'none';
                        window.pendingMove = null;

                        requestRender();

                        // Il server confermerà o rifiuterà la posizione.
                        socket.emit('declare_move', moveData);
                    };
                }
            });

            document.getElementById('move-modal').style.display = 'block';
            return; // Ferma il codice qui, non si muove finché non clicca un pulsante!
        }

        // Se non siamo in combattimento, muoviti normalmente

        const moveId = `${Date.now()}-${Math.random()}`;

        window.pendingLocalMoves[currentCharacterId] = {
            moveId,
            x: gridX,
            y: gridY,
            fromX: myChar.x,
            fromY: myChar.y,
            combat: false
        };

        myChar.x = gridX;
        myChar.y = gridY;
        requestRender();

        socket.emit('declare_move', {
            char_id: currentCharacterId,
            target_x: gridX,
            target_y: gridY,
            move_id: moveId
        });

        return;
    }

    // Il Master può cliccare tutti, i giocatori solo quelli visibili (né FoW né Invisibili)
    const clickedChar = characters.find(c => c.x === gridX && c.y === gridY && (isMaster || (!c.is_hidden && !c.is_invisible)));

    if (clickedChar) {
        // Se clicchi sulla pedina già selezionata, la deselezioni
        if (selectedCharacterId === clickedChar.id) {
            selectedCharacterId = null;
            statusBar.innerText = `[MASTER] Entità deselezionata.`;
            updateMasterEditPanel(null); // Questo comando fa sparire tutto
        } else {
            selectedCharacterId = clickedChar.id;
            statusBar.innerText = `[MASTER] Entità selezionata: ${clickedChar.name}`;
            updateMasterEditPanel(clickedChar);
            if (window.updateEquippedPanel) window.updateEquippedPanel(clickedChar);
        }
        render();
        updateSheetButton();
    } else if (selectedCharacterId !== null) {

        // Salva l'ID prima della deselezione
        const movingCharacterId = selectedCharacterId;
        const movingChar = characters.find(
            c => Number(c.id) === Number(movingCharacterId)
        );

        if (!movingChar) return;

        if (window.pendingLocalMoves?.[movingCharacterId]) {
            statusBar.innerText = "⏳ Movimento in sincronizzazione...";
            return;
        }

        if (Number(movingChar.x) === Number(gridX) && Number(movingChar.y) === Number(gridY)) {
            return;
        }

        if (isHexOccupied(gridX, gridY, movingCharacterId)) {
            statusBar.innerText = "⛔ Questa casella è già occupata.";
            return;
        }

        const moveId = `${Date.now()}-${Math.random()}`;

        window.pendingLocalMoves[movingCharacterId] = {
            moveId,
            x: gridX,
            y: gridY,
            fromX: movingChar.x,
            fromY: movingChar.y,
            combat: false
        };

        // Movimento locale immediato
        movingChar.x = gridX;
        movingChar.y = gridY;
        requestRender();

        // Sincronizzazione con il server
        socket.emit('declare_move', {
            char_id: movingCharacterId,
            target_x: gridX,
            target_y: gridY,
            move_id: moveId
        });

        statusBar.innerText = `[MASTER] Spostamento in X:${gridX}, Y:${gridY}`;

        // Deseleziona e nasconde i pannelli dopo il movimento
        selectedCharacterId = null;
        updateMasterEditPanel(null);
        updateSheetButton();
    }
});

// Usiamo i Pointer Events: funzionano uguale col mouse, ma gestiscono
// anche la penna della tavoletta grafica (pressione, niente tratti spezzati).
canvas.addEventListener('pointerdown', (event) => {

    // Tasto sinistro, oppure la punta gomma della penna (solo in modalità disegno)
    if (event.button !== 0 && !(isPenEraser(event) && isMaster && isDrawingMode)) return;

    // Tiene il tratto agganciato al canvas anche se la penna esce per un attimo
    canvas.setPointerCapture(event.pointerId);

    const pos = getWorldPos(event);

    // --- PENNELLO NEBBIA DI GUERRA (Click singolo) ---
    if (isMaster && window.fowEnabled && (window.keysDown['f'] || window.keysDown['g'])) {
        const hex = pixelToHex(pos.x, pos.y);
        const hexStr = `${hex.col},${hex.row}`;

        if (window.keysDown['f']) window.revealedHexes.add(hexStr);
        else window.revealedHexes.delete(hexStr);

        socket.emit('sync_fow_hexes', Array.from(window.revealedHexes));
        render();
        justFinishedAction = true;
        return; // Blocca tutto il resto
    }

    lastX = pos.x;
    lastY = pos.y;

    // --- NUOVO: MODIFICA MAPPA (Inizia l'azione) ---
    if (isMaster && window.isEditingMap && typeof bgImage !== 'undefined' && bgImage) {
        const mapW = bgImage.width * mapScale;
        const mapH = bgImage.height * mapScale;
        const handleHitbox = 40 / camera.zoom; // Hitbox generosa per l'angolino in basso a destra

        // Controllo: Cliccato l'angolino per Ridimensionare?
        if (Math.hypot(pos.x - (mapDx + mapW), pos.y - (mapDy + mapH)) < handleHitbox) {
            window.mapDragAction = 'resize';
        }
        // Controllo: Cliccato dentro l'immagine per Spostare?
        else if (pos.x >= mapDx && pos.x <= mapDx + mapW && pos.y >= mapDy && pos.y <= mapDy + mapH) {
            window.mapDragAction = 'move';
        }

        if (window.mapDragAction) {
            window.mapStartParams = { dx: mapDx, dy: mapDy, scale: mapScale };
            window.mapMouseStart = { x: pos.x, y: pos.y };
            justFinishedAction = true;
            return; // BLOCCO CRITICO: impedisce di far partire il tracciamento di disegni o laser
        }
    }

    // Righello: Se premi ALT, attiva la modalità righello
    if (event.altKey) {
        window.isRulerMode = true;
        window.rulerStart = { x: lastX, y: lastY };
        window.rulerCurrent = { x: lastX, y: lastY };
        return;
    }

    // 1. LASER
    if (event.shiftKey) {
        isLaserDrawing = true;
        return;
    }

    // 2. PENNELLO TERRENO DEL MASTER (vedi terrain.js)
    if (terrainPointerDown(pos)) return;

    // 3. DISEGNO MASTER (vedi drawing.js)
    if (drawingPointerDown(event, pos)) return;

    // 3. SE NESSUNO DEI PRECEDENTI, INIZIA IL PANNING
    isPanning = true;
    panStartX = event.clientX - camera.x;
    panStartY = event.clientY - camera.y;
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (event) => {

    // --- NUOVO: MODIFICA MAPPA (Trascinamento e Scala continui) ---
    if (window.isEditingMap && window.mapDragAction) {
        const pos = getWorldPos(event);
        // --- PENNELLO NEBBIA IN TRASCINAMENTO ---
        if (isMaster && window.fowEnabled && (window.keysDown['f'] || window.keysDown['g'])) {
            const hex = pixelToHex(pos.x, pos.y);
            const hexStr = `${hex.col},${hex.row}`;

            let changed = false;
            // F = Svela (Aggiunge all'elenco dei visibili)
            if (window.keysDown['f'] && !window.revealedHexes.has(hexStr)) {
                window.revealedHexes.add(hexStr);
                changed = true;
            }
            // G = Nascondi (Rimuove dall'elenco dei visibili)
            else if (window.keysDown['g'] && window.revealedHexes.has(hexStr)) {
                window.revealedHexes.delete(hexStr);
                changed = true;
            }

            if (changed) {
                render();
                // Trasmette i dati ai giocatori a blocchi per non far laggare il server
                if (!window.fowTimeout) {
                    window.fowTimeout = setTimeout(() => {
                        socket.emit('sync_fow_hexes', Array.from(window.revealedHexes));
                        window.fowTimeout = null;
                    }, 40);
                }
            }
            justFinishedAction = true;
            return; // Blocca il trascinamento della visuale
        }

        const diffX = pos.x - window.mapMouseStart.x;
        const diffY = pos.y - window.mapMouseStart.y;

        if (window.mapDragAction === 'move') {
            mapDx = window.mapStartParams.dx + diffX;
            mapDy = window.mapStartParams.dy + diffY;
            canvas.style.cursor = 'grabbing';
        } else if (window.mapDragAction === 'resize') {
            // Ridimensiona usando l'asse X come riferimento proporzionale
            const newW = (bgImage.width * window.mapStartParams.scale) + diffX;
            mapScale = newW / bgImage.width;
            if (mapScale < 0.1) mapScale = 0.1; // Limite minimo
            canvas.style.cursor = 'se-resize';
        }

        // Aggiorna visivamente i numerini nel pannello a destra
        if (document.getElementById('map-scale')) document.getElementById('map-scale').value = mapScale.toFixed(2);
        if (document.getElementById('map-dx')) document.getElementById('map-dx').value = Math.round(mapDx);
        if (document.getElementById('map-dy')) document.getElementById('map-dy').value = Math.round(mapDy);

        render();
        return; // BLOCCO CRITICO: impedisce alla telecamera (panning) di muoversi
    }

    // Gestione Spostamento Telecamera
    if (isPanning) {
        camera.x = event.clientX - panStartX;
        camera.y = event.clientY - panStartY;
        justFinishedAction = true; // Segnala che stiamo muovendo la mappa, non cliccando
        render();
        return;
    }

    const pos = getWorldPos(event);
    const currentX = pos.x;
    const currentY = pos.y;

    // --- NUOVO: Aggiorna Righello in tempo reale ---
    if (window.isRulerMode) {
        window.rulerCurrent = { x: currentX, y: currentY };
        render();
        return;
    }

    // TRACCIAMENTO MOUSE PER LA LINEA DI MOVIMENTO
    window.hoveredHex = pixelToHex(currentX, currentY);
    if (window.lastHoveredHex?.col !== window.hoveredHex?.col || window.lastHoveredHex?.row !== window.hoveredHex?.row) {
        window.lastHoveredHex = window.hoveredHex;
        render(); // Ridisegna per muovere la linea tratteggiata
    }

    // Gestione Laser
    if (isLaserDrawing) {
        const currentCharacter = getSelectedCharacter();
        const color = isMaster ? "#e74c3c" : (currentCharacter ? currentCharacter.color : "#f1c40f");
        const segment = { sx: lastX, sy: lastY, ex: currentX, ey: currentY, c: color };
        addLaserSegment(segment);
        socket.emit('draw_laser', segment);
        lastX = currentX;
        lastY = currentY;
        return;
    }

    // Pennello del terreno, poi disegno, gomma, forme e spostamento disegni
    if (terrainPointerMove(pos)) return;
    drawingPointerMove(event, pos);
});

function endPointerAction() {

    // --- NUOVO: MODIFICA MAPPA (Salvataggio Rilascio) ---
    if (window.mapDragAction) {
        socket.emit('set_map', { url: currentMapUrl, scale: mapScale, dx: mapDx, dy: mapDy });
        window.mapDragAction = null;
        canvas.style.cursor = 'move';
        justFinishedAction = true;
        setTimeout(() => { justFinishedAction = false; }, 100);
        return; // BLOCCO CRITICO
    }

    // --- NUOVO: Rilascio Righello ---
    if (window.isRulerMode) {
        justFinishedAction = true;
        window.isRulerMode = false;
        window.rulerStart = null;
        window.rulerCurrent = null;
        render();
        setTimeout(() => { justFinishedAction = false; }, 100);
        return;
    }
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = isMaster ? "pointer" : "crosshair";
    }

    if (terrainPointerUp() || drawingPointerUp()) {
        justFinishedAction = true; // Evita di selezionare una pedina per sbaglio
    }

    isLaserDrawing = false;

    // Sblocca il click normale dopo un brevissimo istante
    setTimeout(() => { justFinishedAction = false; }, 100);
}

canvas.addEventListener('pointerup', endPointerAction);
canvas.addEventListener('pointercancel', endPointerAction);
canvas.addEventListener('pointerleave', () => {
    isLaserDrawing = false;
    drawingPointerLeave();
});
