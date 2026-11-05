// Puntatore laser, profilo, funzioni globali di zaino/armi/bonus, trascinamento delle finestre.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// PUNTATORE LASER (PING MAPPA)
// ==========================================

// 1. Invia il segnale col Tasto Destro
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // Blocca il noioso menu a tendina di Windows/Chrome

    const currentCharacter = getSelectedCharacter();

    // Solo chi ha selezionato una pedina o il Master può usare il puntatore
    if (!isMaster && !currentCharacter) {
        return;
    }

    const pos = getWorldPos(event);

    // Recupera colore e nome per personalizzare il laser
    const name = isMaster ? "Master" : currentCharacter.name;
    const color = isMaster ? "#c0392b" : (currentCharacter.color || "#3498db");

    socket.emit('ping_location', {
        x: pos.x,
        y: pos.y,
        name: name,
        color: color
    });
});

// 2. Ricevi e disegna il segnale visivo
socket.on('show_ping', (data) => {
    const container = document.getElementById('game-container');
    if (!container) return;

    // Crea il contenitore del ping
    const pingGroup = document.createElement('div');
    pingGroup.className = 'ping-container';
    pingGroup.style.left = (data.x * camera.zoom + camera.x) + 'px';
    pingGroup.style.top = (data.y * camera.zoom + camera.y) + 'px';

    // Crea l'anello pulsante
    const pingCircle = document.createElement('div');
    pingCircle.className = 'ping-marker';
    pingCircle.style.borderColor = data.color;

    // Crea l'etichetta col nome di chi ha pingato
    const pingName = document.createElement('div');
    pingName.className = 'ping-name';
    pingName.innerText = data.name;
    pingName.style.backgroundColor = data.color;

    pingGroup.appendChild(pingCircle);
    pingGroup.appendChild(pingName);
    container.appendChild(pingGroup);

    // Distrugge l'elemento HTML dopo 1 secondo esatto (fine dell'animazione CSS)
    setTimeout(() => {
        if (container.contains(pingGroup)) {
            container.removeChild(pingGroup);
        }
    }, 1000);
});

// ==========================================
// GESTIONE PROFILO (AVATAR LOCALE E LORE)
// ==========================================
let profileEditTargetId = null;
let profileEditBase64 = "";
let profileTokenBase64 = "";

function openProfileEdit(char) {
    profileEditTargetId = char.id;
    profileEditBase64 = char.photo_url || ""; // Mantiene la foto vecchia se non se ne carica una nuova
    profileTokenBase64 = char.token_url || ""; // Mantiene la pedina vecchia se non se ne carica una nuova
    document.getElementById('profile-lore').value = char.lore || "";
    document.getElementById('profile-photo-file').value = ""; // Resetta l'input del file
    document.getElementById('profile-token-file').value = ""; // Resetta l'input del file
    document.getElementById('profile-edit-modal').style.display = 'flex';
}

// Quando scegli il file dal PC, lo legge e lo converte in codice (Base64)
document.getElementById('profile-photo-file')?.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        profileEditBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('profile-token-file')?.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== "image/png") {
        alert("La pedina deve essere un file PNG.");
        event.target.value = "";
        return;
    }

    if (file.size > TOKEN_MAX_BYTES) {
        alert(`La pedina è troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Massimo 5 MB.`);
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        profileTokenBase64 = e.target.result;
    };

    reader.readAsDataURL(file);
});

// Salva Profilo
document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    if (!profileEditTargetId) return;

    socket.emit('update_character_sheet', {
        char_id: profileEditTargetId,
        photo_url: profileEditBase64,
        token_url: profileTokenBase64,
        lore: document.getElementById('profile-lore').value.trim()
    });

    document.getElementById('profile-edit-modal').style.display = 'none';
});

// Chiusura Modale Profilo
document.getElementById('close-profile-modal')?.addEventListener('click', () => {
    document.getElementById('profile-edit-modal').style.display = 'none';
});
window.addEventListener('click', (event) => {
    if (event.target === document.getElementById('profile-edit-modal')) {
        document.getElementById('profile-edit-modal').style.display = 'none';
    }
});

// ==========================================
// FUNZIONI GLOBALI ZAINO
// ==========================================
window.updateBackpackItem = function(charId, itemIndex, delta) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bp = char.backpack || [];
    if (!bp[itemIndex]) return;

    // Convertitore di sicurezza: trasforma il vecchio testo in un oggetto numerico
    if (typeof bp[itemIndex] === 'string') {
        bp[itemIndex] = { name: bp[itemIndex], desc: "Nessuna descrizione", qty: 1 };
    }

    bp[itemIndex].qty += delta;

    if (bp[itemIndex].qty <= 0) {
        if (confirm(`La quantità di ${bp[itemIndex].name} è 0. Vuoi rimuoverlo dallo zaino?`)) {
            bp.splice(itemIndex, 1);
        } else {
            bp[itemIndex].qty = 1; // Annulla la rimozione
        }
    }
    socket.emit('update_character_sheet', { char_id: charId, backpack: bp });
};

window.removeBackpackItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bp = char.backpack || [];
    if (!bp[itemIndex]) return;

    const itemName = typeof bp[itemIndex] === 'string' ? bp[itemIndex] : bp[itemIndex].name;

    if (confirm(`Sicuro di voler buttare via ${itemName}?`)) {
        bp.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, backpack: bp });
    }
};

// ==========================================
// FUNZIONI GLOBALI ARMI
// ==========================================
window.removeWeaponItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const wp = char.weapons || [];
    if (!wp[itemIndex]) return;

    const itemName = typeof wp[itemIndex] === 'string' ? wp[itemIndex] : wp[itemIndex].name;

    if (confirm(`Sicuro di voler scartare l'arma: ${itemName}?`)) {
        wp.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, weapons: wp });
    }
};

// ==========================================
// FUNZIONI GLOBALI BONUS TEMPORANEI
// ==========================================
window.removeBonusItem = function(charId, itemIndex) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const bList = char.bonuses || [];
    if (!bList[itemIndex]) return;

    const itemName = typeof bList[itemIndex] === 'string' ? bList[itemIndex] : bList[itemIndex].name;

    if (confirm(`Rimuovere l'effetto: ${itemName}?`)) {
        bList.splice(itemIndex, 1);
        socket.emit('update_character_sheet', { char_id: charId, bonuses: bList });
    }
};

// ==========================================
// TRASCINAMENTO FINESTRE (Drag & Drop)
// ==========================================
const tracker = document.getElementById('combat-tracker');

// Se non ha già la struttura con l'header, la creiamo
if (tracker && !document.getElementById('tracker-header')) {
    tracker.innerHTML = `
        <div id="tracker-header">⚔️ Ordine di Turno 🖐️</div>
        <div id="tracker-list"></div>
    `;
}

const trackerHeader = document.getElementById('tracker-header');
let isDraggingTracker = false;

// ◀ / ▶ riduce la barra dei turni alla sola maniglia
const trackerToggle = document.getElementById('tracker-toggle');
trackerToggle?.addEventListener('mousedown', (e) => e.stopPropagation());
trackerToggle?.addEventListener('click', () => {
    const collapsed = tracker.classList.toggle('collapsed');
    trackerToggle.textContent = collapsed ? '▶' : '◀';
});
let dragOffsetX = 0;
let dragOffsetY = 0;

if (trackerHeader) {
    trackerHeader.addEventListener('mousedown', (e) => {
        isDraggingTracker = true;
        const rect = tracker.getBoundingClientRect();
        // La barra parte centrata in alto: al primo trascinamento si "stacca"
        tracker.style.transform = 'none';
        tracker.style.left = rect.left + 'px';
        tracker.style.top = rect.top + 'px';
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingTracker) return;
        tracker.style.left = (e.clientX - dragOffsetX) + 'px';
        tracker.style.top = (e.clientY - dragOffsetY) + 'px';
        tracker.style.right = 'auto'; // Sgancia la finestra da destra
    });

    document.addEventListener('mouseup', () => {
        isDraggingTracker = false;
    });
}

// ==========================================
// TRASCINAMENTO PANNELLO EQUIPAGGIAMENTO
// ==========================================
const equipPanel = document.getElementById('equipped-panel');
const equipHeader = document.getElementById('equip-header');

let isDraggingEquip = false;
let dragEquipOffsetX = 0;
let dragEquipOffsetY = 0;

if (equipHeader && equipPanel) {
    equipHeader.addEventListener('mousedown', (e) => {
        // Il pulsante della tendina non deve avviare il trascinamento.
        if (e.target?.id === 'equip-toggle') {
            e.stopPropagation();
            return;
        }

        isDraggingEquip = true;
        // Calcola dove hai cliccato rispetto al bordo del pannello
        dragEquipOffsetX = e.clientX - equipPanel.getBoundingClientRect().left;
        dragEquipOffsetY = e.clientY - equipPanel.getBoundingClientRect().top;
        equipHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingEquip) return;
        // Aggiorna la posizione in base al mouse
        equipPanel.style.left = (e.clientX - dragEquipOffsetX) + 'px';
        equipPanel.style.top = (e.clientY - dragEquipOffsetY) + 'px';
        // Rimuove il vincolo del "bottom" originario per lasciarlo libero
        equipPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDraggingEquip = false;
        equipHeader.style.cursor = 'grab';
    });
}


// ==========================================
// TRASCINAMENTO PANNELLO GADGET
// ==========================================
const gadgetPanel = document.getElementById('gadget-panel');
const gadgetHeader = document.getElementById('gadget-header');

let isDraggingGadget = false;
let dragGadgetOffsetX = 0;
let dragGadgetOffsetY = 0;

if (gadgetHeader && gadgetPanel) {
    gadgetHeader.addEventListener('mousedown', (e) => {
        if (e.target?.id === 'gadget-toggle') return;
        isDraggingGadget = true;
        dragGadgetOffsetX = e.clientX - gadgetPanel.getBoundingClientRect().left;
        dragGadgetOffsetY = e.clientY - gadgetPanel.getBoundingClientRect().top;
        gadgetHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingGadget) return;
        gadgetPanel.style.left = (e.clientX - dragGadgetOffsetX) + 'px';
        gadgetPanel.style.top = (e.clientY - dragGadgetOffsetY) + 'px';
        gadgetPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDraggingGadget = false;
        gadgetHeader.style.cursor = 'grab';
    });
}

// I due pannelli possono essere ridotti senza nascondere la doll all'avvio.
function bindPanelToggle(toggleId, contentId) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    if (!toggle || !content) return;

    // Uso onclick per avere un solo handler anche dopo eventuali refresh UI.
    toggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = content.style.display !== 'none';
        content.style.display = isOpen ? 'none' : 'block';
        toggle.textContent = isOpen ? '▶' : '▼';
        toggle.title = isOpen ? 'Espandi' : 'Riduci a icona';
    };

    // Evita che il click sulla freccia venga interpretato come drag.
    toggle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
}

bindPanelToggle('equip-toggle', 'equip-content');
bindPanelToggle('gadget-toggle', 'gadget-content');

// ==========================================
// TRASCINAMENTO PANNELLO AZIONE COMBATTIMENTO
// ==========================================
const actionPanel = document.getElementById('combat-action-panel');
const actionHeader = document.getElementById('action-header');

let isDraggingAction = false;
let dragActionOffsetX = 0;
let dragActionOffsetY = 0;

if (actionHeader && actionPanel) {
    actionHeader.addEventListener('mousedown', (e) => {
        isDraggingAction = true;
        dragActionOffsetX = e.clientX - actionPanel.getBoundingClientRect().left;
        dragActionOffsetY = e.clientY - actionPanel.getBoundingClientRect().top;
        actionHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingAction) return;
        actionPanel.style.left = (e.clientX - dragActionOffsetX) + 'px';
        actionPanel.style.top = (e.clientY - dragActionOffsetY) + 'px';
        actionPanel.style.bottom = 'auto'; // Sgancia la finestra dal basso
        actionPanel.style.right = 'auto';  // Sgancia la finestra da destra
    });

    document.addEventListener('mouseup', () => {
        isDraggingAction = false;
        if(actionHeader) actionHeader.style.cursor = 'grab';
    });
}

// ==========================================
// HUD EQUIPAGGIAMENTO
// ==========================================
