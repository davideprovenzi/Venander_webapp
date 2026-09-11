const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('status-bar');
const userSelect = document.getElementById('user-select');

const TILE_SIZE = 50;


let camera = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let hasDragged = false;
let startClickX = 0;
let startClickY = 0;

window.isSpawningNpc = false;

// --- VARIABILI MAPPA ---
let bgImage = null;
let currentMapUrl = "";

let mapScale = 1.0;
let mapDx = 0;
let mapDy = 0;
window.draggingDrawing = null;
window.dragOffset = { sx: 0, sy: 0, ex: 0, ey: 0 };
window.selectDrawing = null;

window.fowEnabled = false;
window.revealedHexes = new Set();
const VISION_RADIUS = 3; // Quanti esagoni vede il giocatore attorno a sé


// Trasforma il click sullo schermo nella coordinata esatta sulla mappa zoomata
function getWorldPos(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    return {
        x: (mouseX - camera.x) / camera.zoom,
        y: (mouseY - camera.y) / camera.zoom
    };
}

const COLS = canvas.width / TILE_SIZE;
const ROWS = canvas.height / TILE_SIZE;

let characters = [];
let drawings = []; 
let currentIconBase64 = null; // Memorizza l'icona caricata dal Master

// --- VARIABILI DISEGNO FORME ---
let isDrawingShape = false;
let shapeStartX = 0;
let shapeStartY = 0;
let currentTempShape = null; // L'anteprima della forma mentre trascini

let laserLines = []; // Memoria delle scie temporanee
let isLaserDrawing = false;

let currentRole = 'player';

window.currentPaMov = 120;
window.pendingMove = null;
window.playersPa = {}; // Salva i PA di tutti i personaggi
window.hoveredHex = null; // Memorizza dove si trova il mouse
window.lastHoveredHex = null;
window.wasCombatActive = false;

function isMasterUser() { return currentRole === 'master'; }

const socket = io();
socket.emit('get_compendio');

// Apre/Chiude le sezioni a tendina della scheda
function toggleSection(headerEl) {
    const content = headerEl.nextElementSibling;
    const icon = headerEl.querySelector('span');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.innerText = '▼';
    } else {
        content.style.display = 'none';
        icon.innerText = '▶';
    }
}

// ==========================================
// STATO LOCALE E COMBATTIMENTO
// ==========================================
let isMaster = false;
let selectedCharacterId = null;
let isDrawingMode = false;
let isEraserMode = false;
let isDrawing = false;
let lastX = 0, lastY = 0;

let combatState = {
    is_active: false,
    turn_order: [],
    current_index: 0,
    epicenter: { x: 0, y: 0 }
};

// ==========================================
// ELEMENTI UI
// ==========================================
const masterPanel = document.getElementById('master-panel');
const sheetBtn = document.getElementById('sheet-btn');
const sheetModal = document.getElementById('sheet-modal');
const editSheetModal = document.getElementById('edit-sheet-modal');

// ==========================================
// UTILITY
// ==========================================
function getSelectedCharacter() {
    const id = parseInt(userSelect?.value);
    if (isNaN(id) || id === 0) return null;
    return characters.find(c => c.id === id) || null;
}

function updateSheetButton() {
    const sheetBtn = document.getElementById('sheet-btn');
    const notesBtn = document.getElementById('btn-toggle-notes');
    const renameBtn = document.getElementById('rename-btn');
    
    if (isMaster) {
        if (sheetBtn) sheetBtn.style.display = selectedCharacterId ? 'flex' : 'none'; // Il cerchio usa flex per centrare l'icona
        if (notesBtn) notesBtn.style.display = selectedCharacterId ? 'inline-block' : 'none';
        if (renameBtn) renameBtn.style.display = 'none'; 
    } else {
        const char = getSelectedCharacter();
        if (sheetBtn) sheetBtn.style.display = char ? 'flex' : 'none';
        if (notesBtn) notesBtn.style.display = char ? 'inline-block' : 'none';
        if (renameBtn) renameBtn.style.display = char ? 'inline-block' : 'none'; 
    }
}

// Funzione per cercare se una determinata abilità ha dei bonus nel Compendio
function getSkillBonusInfo(skillName) {
    if (!globalCompendio) return null;
    for (const category in globalCompendio) {
        const found = globalCompendio[category].find(s => s.name === skillName);
        if (found && found.bonus) return found.bonus;
    }
    return null;
}



// ==========================================
// TELECAMERA E CENTRAMENTO
// ==========================================
function centerCameraOn(gridX, gridY) {
    const centerPos = hexToPixel(gridX, gridY);
    
    // Calcola le coordinate per mettere l'esagono esattamente al centro del canvas
    camera.x = (canvas.width / 2) - (centerPos.x * camera.zoom);
    camera.y = (canvas.height / 2) - (centerPos.y * camera.zoom);
    
    render();
}

// Evento per il click sul pulsante "Centra Visuale"
document.getElementById('center-cam-btn')?.addEventListener('click', () => {
    if (!isMaster) {
        // Se è un giocatore, centra sulla sua pedina
        const myChar = getSelectedCharacter();
        if (myChar) {
            centerCameraOn(myChar.x, myChar.y);
        } else {
            alert("Nessun personaggio trovato sulla mappa.");
        }
    } else {
        // Se è il Master, centra sulla pedina selezionata
        if (selectedCharacterId) {
            const targetChar = characters.find(c => c.id === selectedCharacterId);
            if (targetChar) centerCameraOn(targetChar.x, targetChar.y);
        } 
        // Se c'è un combattimento e non ha selezionato niente, centra sull'epicentro
        else if (combatState.is_active && combatState.epicenter) {
            centerCameraOn(combatState.epicenter.x, combatState.epicenter.y);
        } 
        // Se non c'è nulla, centra sull'origine (0,0)
        else {
            centerCameraOn(0, 0);
            statusBar.innerText = "Visuale centrata sulle coordinate (0,0).";
        }
    }
});
// ==========================================
// RICEZIONE STATO SERVER
// ==========================================
socket.on('init_state', (serverCharacters) => {
    characters = serverCharacters || [];
    render();
    statusBar.innerText = "Connesso. Tabellone sincronizzato.";
    updateSheetButton();
    if (selectedCharacterId !== null) {
        const selected = characters.find(c => c.id === selectedCharacterId);
        updateMasterEditPanel(selected ? selected : null);
        if (!selected) selectedCharacterId = null;
    }
});

socket.on('init_drawings', (serverDrawings) => {
    drawings = serverDrawings || [];
    render();
});
socket.on('draw_item', (itemData) => { drawings.push(itemData); render(); });
socket.on('clear_lines', () => { drawings = []; render(); });

socket.on('combat_update', (data) => {
    combatState = data;
    
    // --- Carica i PA blindati dal server ---
    if (combatState.players_pa) {
        window.playersPa = combatState.players_pa;
    }
    
    const tracker = document.getElementById('combat-tracker');
    const list = document.getElementById('turn-order-list');
    const btnNext = document.getElementById('btn-next-turn');
    const toggleBtn = document.getElementById('btn-toggle-combat');
    const movPanel = document.getElementById('movement-panel');
    
    // 1. PRESA SICURA DELL'ID GIOCATORE (Il tuo HTML usa "user-select" con il trattino)
    const selectElem = document.getElementById('user-select');
    const myCharId = selectElem ? parseInt(selectElem.value) : -1;
    
    let isMyTurn = false;
    
    if (combatState.turn_order && combatState.turn_order.length > 0) {
        const currentActor = combatState.turn_order[combatState.current_index];
        if (currentActor) {
            // Controllo flessibile nel caso il server usi .id o .char_id
            const activeId = currentActor.id !== undefined ? currentActor.id : currentActor.char_id;
            if (activeId === myCharId) {
                isMyTurn = true;
            }
        }
    }

    // Se è il tuo turno, carica i PA
    if (isMyTurn) {
        window.currentPaMov = window.playersPa[myCharId] !== undefined ? window.playersPa[myCharId] : 15;
        if (document.getElementById('ui-pa-mov')) document.getElementById('ui-pa-mov').innerText = window.currentPaMov;
        if (movPanel) movPanel.style.display = 'flex';
    } else {
        if (movPanel) movPanel.style.display = 'none';
    }
    
    // 2. GESTIONE FINESTRA E BOTTONI
    if (combatState.is_active) {
        // Usa 'flex' invece di 'block', altrimenti la finestra perde l'impaginazione a colonna
        if (tracker) tracker.style.display = 'flex'; 
        
        // Il bottone del turno (Termina Turno) appare solo al Master o a chi sta giocando
        if (btnNext) btnNext.style.display = (isMaster || isMyTurn) ? 'block' : 'none';
        
        // Aggiorna il bottone del Master (Inizia/Termina)
        if (toggleBtn) {
            toggleBtn.innerText = "🕊️ TERMINA COMBATTIMENTO";
            toggleBtn.style.background = "#7f8c8d"; 
        }
        
        // 3. RI-POPOLAMENTO DELLA LISTA DEI TURNI
        if (list) {
            list.innerHTML = '';
            combatState.turn_order.forEach((actor, index) => {
                const isCurrent = index === combatState.current_index;
                const div = document.createElement('div');
                
                div.style.padding = '8px 10px';
                div.style.borderRadius = '5px';
                div.style.fontWeight = isCurrent ? 'bold' : 'normal';
                div.style.background = isCurrent ? '#f1c40f' : '#ecf0f1';
                div.style.color = isCurrent ? '#000' : '#7f8c8d';
                div.style.border = isCurrent ? '2px solid #e67e22' : '1px solid #bdc3c7';
                div.style.whiteSpace = 'nowrap';
                
                div.innerHTML = `${actor.name} <span style="font-size:12px;">(Dist: ${actor.distance}m)</span>`;
                
                list.appendChild(div);
            });
        }
    } else {
        // Combattimento spento
        if (tracker) tracker.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerText = "⚔️ INIZIA COMBATTIMENTO";
            toggleBtn.style.background = "#c0392b"; 
        }
    }
    
    render();
});


// ==========================================
// FOG OF WAR: CALCOLO VISIONE
// ==========================================
function getHexesInRadius(centerCol, centerRow, radius) {
    let results = [];
    const centerCube = offsetToCube(centerCol, centerRow);
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            let s = -q - r;
            let targetCube = { q: centerCube.q + q, r: centerCube.r + r, s: centerCube.s + s };
            let offset = cubeToOffset(targetCube);
            results.push(`${offset.col},${offset.row}`);
        }
    }
    return results;
}

window.autoReveal = function(x, y) {
    if (!window.fowEnabled || isMaster) return;
    
    const visibleHexes = getHexesInRadius(x, y, VISION_RADIUS);
    const newHexes = visibleHexes.filter(h => !window.revealedHexes.has(h));
    
    if (newHexes.length > 0) {
        socket.emit('reveal_hexes', { hexes: newHexes });
    }
};


socket.on('update_character', (updatedChar) => {
    // 1. Aggiorna l'array locale in memoria
    const index = characters.findIndex(c => c.id === updatedChar.id);
    if (index !== -1) characters[index] = updatedChar;
    else characters.push(updatedChar);

    // 2. Aggiorna il Nome nel Menu a Tendina AL VOLO
    if (userSelect) {
        const option = userSelect.querySelector(`option[value="${updatedChar.id}"]`);
        if (option) option.text = updatedChar.name;
    }

    // 3. Aggiorna l'HUD dell'entità selezionata dal Master
    if (selectedCharacterId === updatedChar.id) updateMasterEditPanel(updatedChar);

    const currentViewedId = isMaster ? selectedCharacterId : parseInt(userSelect?.value);
    
    // 4. Aggiorna la Modale della Scheda se è aperta
    if (typeof sheetModal !== 'undefined' && sheetModal.style.display === 'flex' && currentViewedId === updatedChar.id) {
        if (typeof populatePlayerSheetUI === 'function') populatePlayerSheetUI(updatedChar);
    }
    
    // 5. Aggiorna l'HUD dell'equipaggiamento
    if (window.updateEquippedPanel && currentViewedId === updatedChar.id) {
        window.updateEquippedPanel(updatedChar);
    }

    // 6. Aggiorna gli Appunti in tempo reale (solo se non li stai scrivendo ora)
    if (currentViewedId === updatedChar.id) {
        const textarea = document.getElementById('notes-textarea');
        if (textarea && document.activeElement !== textarea) {
            textarea.value = updatedChar.notes || "";
        }
    }

    // 7. Svela la mappa (Fog of War) se ti muovi
    if (!isMaster && updatedChar.id === parseInt(userSelect?.value)) {
        if (typeof window.autoReveal === 'function') window.autoReveal(updatedChar.x, updatedChar.y);
    }

    // 8. Aggiorna il testo della Barra di Stato in basso al volo
    const myCharId = parseInt(userSelect?.value);
    if (!isMaster && myCharId === updatedChar.id) {
        if (statusBar) statusBar.innerText = `Modalità Giocatore (${updatedChar.name}).`;
    } else if (isMaster && selectedCharacterId === updatedChar.id) {
        if (statusBar) statusBar.innerText = `[MASTER] Entità selezionata: ${updatedChar.name}`;
    } else if (isMaster) {
        if (statusBar) statusBar.innerText = `${updatedChar.name} aggiornato.`;
    }

    // 9. Ridisegna la Mappa per cambiare subito l'iniziale della pedina e i bottoni
    if (typeof render === 'function') render();
    updateSheetButton();
});

socket.on('character_deleted', (data) => {
    characters = characters.filter(c => c.id !== data.id);
    if (selectedCharacterId === data.id) {
        selectedCharacterId = null;
        updateMasterEditPanel(null);
    }
    render();
    updateSheetButton();
});

socket.on('character_hidden_update', (data) => {
    const index = characters.findIndex(c => c.id === data.id);
    if (index !== -1) {
        characters[index].is_hidden = data.is_hidden;
        render();
    }
});

socket.on('character_invisible_update', (data) => {
    const index = characters.findIndex(c => c.id === data.id);
    if (index !== -1) {
        characters[index].is_invisible = data.is_invisible;
        render();
    }
});



// ==========================================
// PANNELLO ENTITÀ MASTER
// ==========================================

function updateMasterEditPanel(char) {
    const panel = document.getElementById('selected-entity-panel');
    if (!panel) return;

    const visBtn = document.getElementById('btn-toggle-visibility');
    const invBtn = document.getElementById('btn-toggle-invisible');
        
        // --- LOGICA BOTTONE VISIBILITÀ (FoW) ---
        if (visBtn) {
            visBtn.style.display = 'block';
            visBtn.innerText = char.is_hidden ? "👁️ Rivela (FoW)" : "👁️ Nascondi (FoW)";
            visBtn.style.background = char.is_hidden ? "#27ae60" : "#95a5a6";
            visBtn.onclick = () => socket.emit('toggle_hidden', { char_id: char.id, is_hidden: !char.is_hidden });
        }
        
        // --- LOGICA BOTTONE INVISIBILE IN COMBATTIMENTO ---
        if (invBtn) {
            invBtn.style.display = 'block';
            invBtn.innerText = char.is_invisible ? "👻 Torna Visibile" : "👻 Rendi Invisibile";
            invBtn.style.background = char.is_invisible ? "#27ae60" : "#8e44ad";
            invBtn.onclick = () => socket.emit('toggle_invisible', { char_id: char.id, is_invisible: !char.is_invisible });
        }

    if (char) {
        panel.style.opacity = '1';
        panel.style.pointerEvents = 'auto';
        document.getElementById('sel-name').innerText = char.name;
        document.getElementById('sel-hp').innerText = char.hp_current !== undefined ? char.hp_current : "?";
        document.getElementById('sel-stam').innerText = char.stamina_current !== undefined ? char.stamina_current : "?";
        document.getElementById('sel-conc').innerText = char.conc_current !== undefined ? char.conc_current : "?";
        const statusSelect = document.getElementById('sel-status');
        if (statusSelect && char.status) statusSelect.value = char.status;
        
        // --- LOGICA BOTTONE VISIBILITÀ ---
        if (visBtn) {
            visBtn.style.display = 'block';
            visBtn.innerText = char.is_hidden ? "👁️ Rivela (Invisibile)" : "👁️ Nascondi (Visibile)";
            visBtn.style.background = char.is_hidden ? "#27ae60" : "#95a5a6";
            visBtn.onclick = () => {
                socket.emit('toggle_hidden', { char_id: char.id, is_hidden: !char.is_hidden });
            };
        }
    } else {
        panel.style.opacity = '0.5';
        panel.style.pointerEvents = 'none';
        document.getElementById('sel-name').innerText = 'Nessuna selezione';
        document.getElementById('sel-hp').innerText = '--';
        document.getElementById('sel-stam').innerText = '--';
        document.getElementById('sel-conc').innerText = '--';
        
        if (visBtn) visBtn.style.display = 'none';
    }
}

document.querySelectorAll('.vital-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!selectedCharacterId) return;
        const type = btn.getAttribute('data-type');
        const val = parseInt(btn.getAttribute('data-val'));
        const payload = { char_id: selectedCharacterId };
        payload[type] = val;
        socket.emit('update_vitals', payload);
    });
});

document.getElementById('sel-status')?.addEventListener('change', (e) => {
    if (!selectedCharacterId) return;
    socket.emit('update_vitals', { char_id: selectedCharacterId, status: e.target.value });
});

// ==========================================
// SELEZIONE PERSONAGGIO DAL MENU
// ==========================================

userSelect?.addEventListener('change', () => {
    
    const selectedOption = userSelect.options[userSelect.selectedIndex];
    const value = userSelect.value;
    const role = selectedOption.getAttribute('data-role');
    const renameBtn = document.getElementById('rename-btn');
    const centerBtn = document.getElementById('center-cam-btn'); 

    if (value === '0') {
        masterPanel.style.display = 'none';
        sheetBtn.style.display = 'none';
        if (renameBtn) renameBtn.style.display = 'none';
        if (centerBtn) centerBtn.style.display = 'none';
        return;
    }

    if (value === 'master' || role === 'master') {
        isMaster = true;
        selectedCharacterId = null;
        masterPanel.style.display = 'block';
        sheetBtn.style.display = 'none';
        if (renameBtn) renameBtn.style.display = 'none';
        if (centerBtn) centerBtn.style.display = 'none';
        
        statusBar.innerText = "👑 Modalità Master attiva.";
        statusBar.style.backgroundColor = "#fadbd8";
        canvas.style.cursor = "pointer";
    } else {
        isMaster = false;
        masterPanel.style.display = 'none';
        sheetBtn.style.display = 'block';
        if (renameBtn) renameBtn.style.display = 'inline-block';
        if (centerBtn) centerBtn.style.display = 'inline-block';
        
        statusBar.innerText = `Modalità Giocatore (${selectedOption.text}).`;
        statusBar.style.backgroundColor = "#f0f0f0";
        canvas.style.cursor = "crosshair";
    }
    
    updateChatStatus();
    
    // --- NUOVO: Sblocca il pannello di combattimento quando selezioni il personaggio ---
    if (typeof combatState !== 'undefined' && combatState.is_active) {
        const myCharId = parseInt(value);
        let isMyTurn = false;
        
        if (combatState.turn_order && combatState.turn_order.length > 0) {
            const currentActor = combatState.turn_order[combatState.current_index];
            if (currentActor && currentActor.id === myCharId) isMyTurn = true;
        }
        
        const movPanel = document.getElementById('movement-panel');
        const btnNext = document.getElementById('btn-next-turn');
        
        // Se tocca a te, mostra il pannello e i PA corretti
        if (isMyTurn) {
            window.currentPaMov = (window.playersPa && window.playersPa[myCharId] !== undefined) ? window.playersPa[myCharId] : 15;
            if (document.getElementById('ui-pa-mov')) document.getElementById('ui-pa-mov').innerText = window.currentPaMov;
            if (movPanel) movPanel.style.display = 'flex';
        } else {
            if (movPanel) movPanel.style.display = 'none';
        }
        
        // Il vecchio bottone fine turno è riservato solo al Master
        if (btnNext) btnNext.style.display = (isMaster || isMyTurn) ? 'block' : 'none';
    }
    // --- NUOVO: Mostra l'HUD Equipaggiamento quando il Giocatore sceglie il suo PG ---
    const char = characters.find(c => c.id === parseInt(value));
   
    if (window.updateEquippedPanel) window.updateEquippedPanel(char || null);
    
    // --- NUOVO: Forza l'aggiornamento dell'HUD d'attacco ---
    if (window.updateCombatActionPanel) window.updateCombatActionPanel();

    // --- NUOVO: CARICA GLI APPUNTI DAL DATABASE ---
    const textarea = document.getElementById('notes-textarea');
    if (textarea) {
        textarea.value = char && char.notes ? char.notes : "";
    }

    updateSheetButton();
});

document.getElementById('rename-btn')?.addEventListener('click', () => {
    const charId = parseInt(userSelect.value);
    if (!charId || charId === 0) return;
    const newName = prompt("Inserisci il nuovo nome per il tuo personaggio:");
    if (newName && newName.trim() !== "") {
        socket.emit('register_player', { char_id: charId, name: newName.trim() });
    }
});

// ==========================================
// PULSANTI MASTER E COMBATTIMENTO
// ==========================================
document.getElementById('btn-toggle-combat')?.addEventListener('click', () => {
    if (!isMaster) return;
    socket.emit('toggle_combat');
});



const toggleDrawBtn = document.getElementById('toggle-draw-btn');
const eraserBtn = document.getElementById('eraser-btn');
const clearDrawBtn = document.getElementById('clear-draw-btn');

toggleDrawBtn?.addEventListener('click', () => {
    isDrawingMode = !isDrawingMode;
    toggleDrawBtn.innerText = isDrawingMode ? "Disegno ON" : "Disegno OFF";
    toggleDrawBtn.style.background = isDrawingMode ? "#d4efdf" : "#eee";
});
eraserBtn?.addEventListener('click', () => {
    isEraserMode = !isEraserMode;
    eraserBtn.innerText = isEraserMode ? "Gomma ON" : "Gomma OFF";
    eraserBtn.style.background = isEraserMode ? "#f39c12" : "#eee";
});
clearDrawBtn?.addEventListener('click', () => {
    if (confirm("Cancellare tutto lo scenario?")) socket.emit('clear_drawings');
});


// Spawn and delete entities (Master only)

document.getElementById('spawn-npc-btn')?.addEventListener('click', () => {
    window.isSpawningNpc = true;
    statusBar.innerText = "[MASTER] Clicca su un esagono per posizionare l'NPC.";
    canvas.style.cursor = "crosshair";
});

document.getElementById('btn-delete-entity')?.addEventListener('click', () => {
    if (selectedCharacterId && confirm("Eliminare questa entità?")) {
        socket.emit('delete_character', { char_id: selectedCharacterId });
    }
});



// ==========================================
// MAPPA DI SFONDO (LOCALE)
// ==========================================
socket.on('map_update', (data) => {
    const oldUrl = currentMapUrl; // Salva la vecchia immagine per confronto
    
    currentMapUrl = data.map_url;
    mapScale = data.map_scale || 1.0;
    mapDx = data.map_dx || 0;
    mapDy = data.map_dy || 0;
    
    // Aggiorna lo stato della nebbia
    window.fowEnabled = data.fow_enabled || false;
    window.revealedHexes = new Set(data.revealed_hexes || []);
    
    if (document.getElementById('btn-toggle-fow')) {
        const btn = document.getElementById('btn-toggle-fow');
        btn.innerText = window.fowEnabled ? "☁️ Disattiva Fog of War" : "☁️ Attiva Fog of War";
        btn.style.background = window.fowEnabled ? "#27ae60" : "#8e44ad";
    }
    
    // BLOCCO FLASH: Ricarica l'immagine SOLO se la mappa è davvero cambiata
    if (currentMapUrl) {
        if (currentMapUrl !== oldUrl || !bgImage) {
            bgImage = new Image();
            bgImage.onload = () => { render(); };
            bgImage.src = currentMapUrl;
        } else {
            render(); // Se la mappa è la stessa, limitati a ridisegnare la nebbia
        }
    } else {
        bgImage = null;
        render();
    }
});

socket.on('drawing_updated', (data) => {
    const index = drawings.findIndex(d => d.uid === data.uid);
    if (index !== -1) { drawings[index] = data; render(); }
});

socket.on('drawing_deleted', (data) => {
    drawings = drawings.filter(d => d.uid !== data.uid);
    if (window.selectedDrawing && window.selectedDrawing.uid === data.uid) {
        window.selectedDrawing = null;
    }
    render();
});

// ==========================================
// MODALITÀ MODIFICA VISIVA SFONDO E GESTIONE MAPPA
// ==========================================
window.isEditingMap = false;
window.mapDragAction = null; 
window.mapStartParams = { dx: 0, dy: 0, scale: 1 };
window.mapMouseStart = { x: 0, y: 0 };

document.getElementById('toggle-map-edit-btn')?.addEventListener('click', () => {
    if (!isMaster || !bgImage) {
        alert("Carica prima una mappa per poterla modificare!");
        return;
    }
    window.isEditingMap = !window.isEditingMap;
    const btn = document.getElementById('toggle-map-edit-btn');
    
    if (window.isEditingMap) {
        btn.style.background = '#e74c3c';
        btn.innerText = '✅ Fine Modifica Sfondo';
        canvas.style.cursor = 'move';
    } else {
        btn.style.background = '#8e44ad';
        btn.innerText = '📐 Modalità Muovi e Ridimensiona';
        canvas.style.cursor = 'pointer';
        // Salva le modifiche in via definitiva
        socket.emit('set_map', { url: currentMapUrl, scale: mapScale, dx: mapDx, dy: mapDy });
    }
    render();
});

// --- CARICAMENTO AUTOMATICO MAPPA ---
document.getElementById('map-file-input')?.addEventListener('change', (e) => {
    if (!isMaster) return;
    const file = e.target.files[0];
    if (file) {
        // Appena selezioni il file, lo carica e resetta Scala a 1 e Coordinate a 0
        const reader = new FileReader();
        reader.onload = function(evt) {
            socket.emit('set_map', { url: evt.target.result, scale: 1.0, dx: 0, dy: 0 });
            
            if (document.getElementById('map-scale')) document.getElementById('map-scale').value = "1.0";
            if (document.getElementById('map-dx')) document.getElementById('map-dx').value = "0";
            if (document.getElementById('map-dy')) document.getElementById('map-dy').value = "0";
        };
        reader.readAsDataURL(file);
    }
});

// --- SALVATAGGIO MANUALE (Per i campi di testo) ---
document.getElementById('set-map-btn')?.addEventListener('click', () => {
    if (!isMaster) return;
    const scale = parseFloat(document.getElementById('map-scale').value) || 1.0;
    const dx = parseInt(document.getElementById('map-dx').value) || 0;
    const dy = parseInt(document.getElementById('map-dy').value) || 0;
    socket.emit('set_map', { url: currentMapUrl, scale, dx, dy });
});

document.getElementById('clear-map-btn')?.addEventListener('click', () => {
    if (!isMaster) return;
    document.getElementById('map-file-input').value = ""; 
    socket.emit('set_map', { url: "" }); 
});

// ==========================================
// Sincronizzazione PA (per tutti i giocatori)
// ==========================================

socket.on('sync_pa', (data) => {
    window.playersPa[data.char_id] = data.pa;
    render();
});


// ==========================================
// FORME E STICKER
// ==========================================
document.getElementById('draw-tool-select')?.addEventListener('change', function(e) {
    const iconSection = document.getElementById('icon-upload-section');
    if (e.target.value === 'icon') iconSection.style.display = 'block';
    else iconSection.style.display = 'none';
});

document.getElementById('icon-file-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        currentIconBase64 = evt.target.result;
    };
    reader.readAsDataURL(file);
});



// ==========================================
// GESTIONE PULSANTI POP-UP MOVIMENTO
// ==========================================
document.querySelectorAll('.move-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const framesPerStep = parseInt(e.target.getAttribute('data-cost'));
        const modeName = e.target.getAttribute('data-name');
        const dist = window.pendingMove.dist; // Equivale ai "passi" (esagoni)
        
        // Calcolo esatto dei frame necessari (Passi x Costo del singolo passo)
        let requiredFrames = dist * framesPerStep;
        
        // Controlla la memoria (riutilizziamo la variabile currentPaMov come contenitore frame)
        if (requiredFrames > window.currentPaMov) {
            alert(`Azione Impossibile! Servono ${requiredFrames} Frame, ma ne hai solo ${window.currentPaMov} a disposizione per muoverti.`);
            return;
        }
        
        window.currentPaMov -= requiredFrames;
        window.playersPa[window.pendingMove.charId] = window.currentPaMov; 
        
        document.getElementById('move-modal').style.display = 'none';
        
        socket.emit('sync_pa', { char_id: window.pendingMove.charId, pa: window.currentPaMov });
        socket.emit('declare_move', { char_id: window.pendingMove.charId, target_x: window.pendingMove.x, target_y: window.pendingMove.y });
        
        const myChar = characters.find(c => c.id === window.pendingMove.charId);
        const msg = `si sposta di <b>${dist} passi</b> (${modeName}) consumando <b>${requiredFrames} Frame</b> movimento.`;
        socket.emit('combat_msg', { name: myChar.name, message: msg });
        
        window.pendingMove = null; 
        render(); 
    });
});

// ==========================================
// ELIMINAZIONE DISEGNO SELEZIONATO
// ==========================================
document.getElementById('delete-selected-draw-btn')?.addEventListener('click', () => {
    if (window.selectedDrawing) {
        socket.emit('delete_drawing', { uid: window.selectedDrawing.uid });
        window.selectedDrawing = null;
        render();
    } else {
        alert("Seleziona prima un disegno o uno sticker con lo strumento '🖐️ Seleziona e Sposta'!");
    }
});

// Permette di usare il tasto Canc o Backspace per eliminare al volo!
document.addEventListener('keydown', (e) => {
    // Evita di cancellare se stai scrivendo il nome di un mostro o altre caselle di testo
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if ((e.key === 'Delete' || e.key === 'Backspace') && isMaster && isDrawingMode && window.selectedDrawing) {
        socket.emit('delete_drawing', { uid: window.selectedDrawing.uid });
        window.selectedDrawing = null;
        render();
    }
});

// ==========================================
// FINE TURNO (MASTER E GIOCATORI)
// ==========================================
document.getElementById('btn-next-turn')?.addEventListener('click', () => {
    if (!isMaster) {
        // Il giocatore ha la finestra di conferma per evitare click accidentali
        if (confirm("Vuoi davvero terminare il tuo turno? (Verranno applicati eventuali danni e scalati gli effetti)")) {
            socket.emit('next_turn');
        }
    } else {
        // Il master passa il turno istantaneamente senza conferme
        socket.emit('next_turn');
    }
});


// ==========================================
// CONTROLLO MASTER: ATTIVAZIONE FOG OF WAR
// ==========================================
window.toggleFogOfWar = function() {
    const turningOn = !window.fowEnabled;
    socket.emit('toggle_global_fow', { enabled: turningOn });
    
    // Se stiamo accendendo la nebbia, scopriamo subito dove sono i giocatori!
    if (turningOn) {
        let initialHexes = [];
        
        characters.forEach(c => {
            // Se è una pedina giocabile e non è nascosta nel buio...
            if (c.role !== 'master' && !c.is_hidden) {
                // ...calcola gli esagoni intorno a lei e aggiungili alla lista
                initialHexes.push(...getHexesInRadius(c.x, c.y, VISION_RADIUS));
            }
        });
        
        // Rimuove i doppioni (se due giocatori sono vicini) e invia al server
        const uniqueHexes = [...new Set(initialHexes)];
        if (uniqueHexes.length > 0) {
            socket.emit('reveal_hexes', { hexes: uniqueHexes });
        }
    }
};

// Sincronizzazione fluida della Nebbia di Guerra senza flash
socket.on('update_fow_hexes', (data) => {
    if (window.fowEnabled) {
        window.revealedHexes = new Set(data);
        render(); // Aggiorna la grafica istantaneamente per i giocatori
    }
});