// ==========================================
// DISEGNO E RENDER DELLE FORME
// ==========================================
function drawSingleItem(item) {
    ctx.beginPath();
    ctx.strokeStyle = item.c;
    ctx.fillStyle = item.c;
    ctx.lineCap = 'round';

    if (item.type === 'line' || !item.type) {
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
        if (!item.imageObj) {
            item.imageObj = new Image();
            item.imageObj.src = item.img;
        }
        if (item.imageObj.complete) {
            const size = item.w * 2;
            ctx.drawImage(item.imageObj, item.sx - size/2, item.sy - size/2, size, size);
        }
    }
}

function drawLines() {
    drawings.forEach(item => drawSingleItem(item));
    if (currentTempShape) {
        drawSingleItem(currentTempShape); // Disegna l'anteprima in tempo reale
    }
}

function drawGrid() {
    ctx.strokeStyle = '#cccccc'; // Colore della griglia esagonale
    ctx.lineWidth = 1;

    // Calcola il range di esagoni visibili nella telecamera
    const startRow = Math.floor((-camera.y / camera.zoom) / (HEX_SIZE * 1.5)) - 1;
    const endRow = Math.ceil(((canvas.height - camera.y) / camera.zoom) / (HEX_SIZE * 1.5)) + 1;
    
    const startCol = Math.floor((-camera.x / camera.zoom) / HEX_W) - 1;
    const endCol = Math.ceil(((canvas.width - camera.x) / camera.zoom) / HEX_W) + 1;

    for (let r = startRow; r <= endRow; r++) {
        for (let q = startCol; q <= endCol; q++) {
            const center = hexToPixel(q, r);
            
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 180 * (60 * i - 30);
                const px = center.x + HEX_SIZE * Math.cos(angle);
                const py = center.y + HEX_SIZE * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }
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
        // I giocatori non vedono NULLA né se in FoW né se Invisibili. Il Master procede.
        if ((char.is_hidden || char.is_invisible) && !isMaster) return; 

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

                /// --- NUOVO: Mostra i PA a TUTTI durante il combattimento ---
                if (combatState.is_active) {
                    // Se non c'è un valore salvato, mostra 15 di default
                    let paToShow = window.playersPa[char.id];
                    if (paToShow === undefined) paToShow = 15;
                    
                    const paText = `PA: ${paToShow}/15`;
                    ctx.font = 'bold 14px Arial';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#000000';
                    ctx.strokeText(paText, centerX, centerY - radius - 35);
                    
                    // Colore dinamico: Verde, Arancione (sotto i 10), Rosso (sotto i 5)
                    let paColor = '#2ecc71';
                    if (paToShow < 5) paColor = '#e74c3c';
                    else if (paToShow < 10) paColor = '#f39c12';
                    
                    ctx.fillStyle = paColor;
                    ctx.fillText(paText, centerX, centerY - radius - 35);
                }
            }
        }

        // Disegna la pedina
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = char.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.strokeStyle = isSelected ? '#ffeb3b' : '#000000';
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.name.charAt(0).toUpperCase(), centerX, centerY);

        // --- NUOVO: Mostra gli HP durante il combattimento ---
        if (combatState.is_active) {
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
        
        ctx.restore(); 
        
    });
}

// Aggiunge un segmento laser e programma la sua cancellazione dopo 1.5 secondi
function addLaserSegment(segment) {
    laserLines.push(segment);
    render();
    
    setTimeout(() => {
        const index = laserLines.indexOf(segment);
        if (index > -1) {
            laserLines.splice(index, 1);
            render();
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


function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    
    // 1. Sfondo con offset e scaling
    if (bgImage && bgImage.complete) {
        ctx.drawImage(bgImage, mapDx, mapDy, bgImage.width * mapScale, bgImage.height * mapScale);
    }

    // 2. Griglia (Sotto i disegni)
    drawGrid();

    // 3. Disegni e Forme geometriche (Sopra la griglia, sotto le pedine)
    drawLines();
    // Evidenziazione Disegno Selezionato (Solo per il Master)
    if (isMaster && isDrawingMode && window.selectedDrawing) {
        const sd = window.selectedDrawing;
        ctx.save();
        ctx.strokeStyle = '#e74c3c'; // Rosso fuoco
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        if (sd.type === 'rectangle') {
            // Cornice per i rettangoli
            ctx.strokeRect(Math.min(sd.sx, sd.ex) - 5, Math.min(sd.sy, sd.ey) - 5, Math.abs(sd.ex - sd.sx) + 10, Math.abs(sd.ey - sd.sy) + 10);
        } else {
            // Cerchio per sticker, linee o altre forme
            ctx.beginPath();
            ctx.arc(sd.sx, sd.sy, (sd.w || 20) + 10, 0, 2 * Math.PI);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 3.1 Percorso Movimento (Sopra le pedine)
    drawMovementPath();

    // 4. Personaggi
    drawTokens();

    // 5. Puntatori Laser Temporanei (Sempre in primissimo piano)
    drawLaserLines(); 
    
    ctx.restore(); 
}